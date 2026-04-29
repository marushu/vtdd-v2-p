import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import {
  ActionType,
  ActorRole,
  AutonomyMode,
  ConsentCategory,
  CredentialTier,
  JudgmentStep,
  MemoryRecordType,
  TaskMode,
  createInMemoryMemoryProvider
} from "../src/core/index.js";

const aliasRegistry = [
  {
    canonicalRepo: "sample-org/vtdd-v2",
    aliases: ["vtdd"]
  }
];

const validButlerJudgmentTrace = [
  JudgmentStep.CONSTITUTION,
  JudgmentStep.RUNTIME_TRUTH,
  JudgmentStep.ISSUE_CONTEXT,
  JudgmentStep.CURRENT_QUERY
];

const gatewayAuthHeaders = {
  "content-type": "application/json",
  authorization: "Bearer test-token"
};

const gatewayAuthEnv = {
  VTDD_GATEWAY_BEARER_TOKEN: "test-token"
};

const passkeyAdapter = {
  async generateRegistrationOptions(input) {
    return { challenge: input.challenge };
  },
  async verifyRegistrationResponse() {
    return {
      verified: true,
      registrationInfo: {
        credential: {
          id: new Uint8Array([1, 2, 3, 4]),
          publicKey: new Uint8Array([5, 6, 7, 8]),
          counter: 1
        },
        credentialDeviceType: "singleDevice",
        credentialBackedUp: true,
        aaguid: "test-aaguid"
      }
    };
  },
  async generateAuthenticationOptions(input) {
    return {
      challenge: input.challenge,
      allowCredentials: input.allowCredentials
    };
  },
  async verifyAuthenticationResponse() {
    return {
      verified: true,
      authenticationInfo: {
        newCounter: 2
      }
    };
  }
};

function createFakeMemoryD1Binding() {
  const rows = new Map();

  return {
    async exec() {},
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async run() {
              if (String(sql).includes("INSERT OR REPLACE INTO vtdd_memory_records")) {
                const [id, type, contentJson, contentRef, metadataJson, priority, tagsJson, createdAt] =
                  params;
                rows.set(id, {
                  id,
                  type,
                  content_json: contentJson,
                  content_ref: contentRef,
                  metadata_json: metadataJson,
                  priority,
                  tags_json: tagsJson,
                  created_at: createdAt
                });
              }
              return { success: true };
            },
            async all() {
              const text = String(sql);
              let results = [...rows.values()];
              if (text.includes("WHERE id IN")) {
                const idSet = new Set(params);
                results = results.filter((row) => idSet.has(row.id));
              } else if (text.includes("WHERE type = ?")) {
                results = results.filter((row) => row.type === params[0]);
              }
              return { results };
            }
          };
        }
      };
    }
  };
}

test("worker returns health", async () => {
  const response = await worker.fetch(new Request("https://example.com/health"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mode, "v2");
  assert.equal(body.autonomyMode, AutonomyMode.NORMAL);
});

test("worker health reflects guarded absence mode when runtime env sets it", async () => {
  const response = await worker.fetch(new Request("https://example.com/health"), {
    VTDD_AUTONOMY_MODE: "guarded_absence"
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.autonomyMode, AutonomyMode.GUARDED_ABSENCE);
});

test("worker runs gateway route", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.EXECUTE] },
          approvalPhrase: "GO deploy request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "sample-org/vtdd-v2");
});

test("worker gateway allows butler path when deterministic judgment order is satisfied", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE] },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "sample-org/vtdd-v2");
});

test("worker gateway still blocks Custom GPT payloads with noncanonical judgment model ids", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "gpt-5.5 thinking"
        },
        judgmentTrace: validButlerJudgmentTrace,
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE] },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "surface_must_not_override_judgment_model");
});

test("worker gateway returns PR revision loop guidance for Butler summaries", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true,
            runtimeState: {
              activeBranch: "codex/issue-4",
              pullRequest: {
                number: 42,
                url: "https://github.com/example/repo/pull/42",
                state: "open",
                title: "Connect reviewer loop",
                reviewCommentsCount: 3,
                unresolvedReviewCommentsCount: 2,
                updatedSinceReview: true,
                reviewer: "gemini",
                reviewComments: [
                  { user: { login: "gemini" }, body: "The reviewer loop still has unresolved objections." }
                ]
              }
            }
          },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE] },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.executionContinuity.codexGoal, "revise_pr");
  assert.equal(body.executionContinuity.reviewLoop.unresolvedReviewCommentsCount, 2);
  assert.equal(body.executionContinuity.butlerReviewSynthesis.available, true);
  assert.equal(
    body.executionContinuity.butlerReviewSynthesis.reviewerSignal.recentReviewComments[0].includes(
      "gemini:"
    ),
    true
  );
  assert.equal(body.executionContinuity.nextSuggestedActions.includes("rerun_gemini_review"), true);
});

test("worker dispatches remote Codex execution", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/execute", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: {
          issueNumber: 6
        },
        continuationContext: {
          requiresHandoff: true,
          handoff: {
            issueTraceable: true,
            approvalScopeMatched: true,
            relatedIssue: 6,
            summary: "Issue #6 bounded remote Codex handoff"
          }
        },
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true,
            runtimeState: {
              activeBranch: "codex/issue-6"
            }
          },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE, ConsentCategory.EXECUTE] },
          approvalPhrase: "GO",
          approvalScopeMatched: true,
          issueTraceable: true,
          issueTraceability: {
            relatedIssue: 6,
            intentRefs: ["#6 Intent"],
            successCriteriaRefs: ["#6 Success Criteria"],
            nonGoalRefs: ["#6 Non-goals"]
          },
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/installation/repositories")) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  full_name: "sample-org/vtdd-v2",
                  name: "vtdd-v2",
                  private: true
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            id: 123,
            html_url: "https://github.com/sample-org/vtdd-v2/issues/6#issuecomment-123"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.issueNumber, 6);
  assert.equal(body.execution.transport, "codex_cloud_github_comment");
  assert.equal(calls.length, 2);
});

test("worker dispatches remote Codex execution without user-authored constitutionConsulted", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/execute", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: {
          issueNumber: 125
        },
        continuationContext: {
          requiresHandoff: true,
          handoff: {
            issueTraceable: true,
            approvalScopeMatched: true,
            relatedIssue: 125,
            summary: "Issue #125 bounded remote Codex handoff"
          }
        },
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          runtimeTruth: {
            runtimeAvailable: true,
            runtimeState: {
              activeBranch: "codex/issue-125"
            }
          },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE, ConsentCategory.EXECUTE] },
          approvalPhrase: "GO",
          approvalScopeMatched: true,
          issueTraceable: true,
          issueTraceability: {
            relatedIssue: 125,
            intentRefs: ["#125 Intent"],
            successCriteriaRefs: ["#125 Success Criteria"],
            nonGoalRefs: ["#125 Non-goals"]
          },
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/installation/repositories")) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  full_name: "sample-org/vtdd-v2",
                  name: "vtdd-v2",
                  private: true
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            id: 125,
            html_url: "https://github.com/sample-org/vtdd-v2/issues/125#issuecomment-125"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.issueNumber, 125);
  assert.equal(body.execution.transport, "codex_cloud_github_comment");
  assert.equal(calls.length, 2);
});

test("worker dispatches remote Codex execution with approval scope matched only on handoff", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/execute", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: {
          issueNumber: 125
        },
        continuationContext: {
          requiresHandoff: true,
          handoff: {
            issueTraceable: true,
            approvalScopeMatched: true,
            relatedIssue: 125,
            summary: "Issue #125 bounded remote Codex handoff"
          }
        },
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          runtimeTruth: {
            runtimeAvailable: true,
            runtimeState: {
              activeBranch: "codex/issue-125"
            }
          },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE, ConsentCategory.EXECUTE] },
          approvalPhrase: "GO Issue #125 Codex handoff",
          issueTraceable: true,
          issueTraceability: {
            relatedIssue: 125,
            intentRefs: ["#125 Intent"],
            successCriteriaRefs: ["#125 Success Criteria"],
            nonGoalRefs: ["#125 Non-goals"]
          },
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/installation/repositories")) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  full_name: "sample-org/vtdd-v2",
                  name: "vtdd-v2",
                  private: true
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            id: 126,
            html_url: "https://github.com/sample-org/vtdd-v2/issues/125#issuecomment-126"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.issueNumber, 125);
  assert.equal(body.execution.approvalScopeMatched, true);
  assert.equal(calls.length, 2);
});

test("worker gateway rejects self-asserted Butler build handoff", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: {
          issueNumber: 6
        },
        continuationContext: {
          requiresHandoff: true,
          handoff: {
            issueTraceable: true,
            approvalScopeMatched: true,
            relatedIssue: 6,
            summary: "Self-asserted gateway handoff"
          }
        },
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE, ConsentCategory.EXECUTE] },
          approvalPhrase: "GO",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url) => {
        if (String(url).includes("/installation/repositories")) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  full_name: "sample-org/vtdd-v2",
                  name: "vtdd-v2",
                  private: true
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response("{}", { status: 404 });
      }
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.blockedByRule, "role_action_boundary");
});

test("worker serves passkey registration and approval flow routes", async () => {
  const provider = createInMemoryMemoryProvider();

  const registerOptions = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/register/options", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        operatorId: "owner",
        operatorLabel: "Owner"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );
  assert.equal(registerOptions.status, 200);
  const registrationBody = await registerOptions.json();
  assert.equal(registrationBody.ok, true);

  const registerVerify = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/register/verify", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        sessionId: registrationBody.sessionId,
        response: {
          id: "ignored",
          response: { transports: ["internal"] }
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );
  assert.equal(registerVerify.status, 200);

  const approvalOptions = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/challenge", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        issueContext: { issueNumber: 14 },
        policyInput: {
          actionType: ActionType.DEPLOY_PRODUCTION,
          repositoryInput: "vtdd"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );
  assert.equal(approvalOptions.status, 200);
  const approvalOptionsBody = await approvalOptions.json();
  assert.equal(approvalOptionsBody.ok, true);

  const approvalVerify = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/verify", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        sessionId: approvalOptionsBody.sessionId,
        response: {
          id: "AQIDBA",
          response: {}
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );
  assert.equal(approvalVerify.status, 200);
  const approvalVerifyBody = await approvalVerify.json();
  assert.equal(approvalVerifyBody.ok, true);
  assert.equal(Boolean(approvalVerifyBody.approvalGrant.approvalId), true);
});

test("worker can resolve passkey memory provider from Cloudflare D1 binding fallback", async () => {
  const registerOptions = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/register/options", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        operatorId: "owner",
        operatorLabel: "Owner"
      })
    }),
    {
      ...gatewayAuthEnv,
      VTDD_MEMORY_D1: createFakeMemoryD1Binding(),
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );

  assert.equal(registerOptions.status, 200);
  const registrationBody = await registerOptions.json();
  assert.equal(registrationBody.ok, true);
  assert.equal(Boolean(registrationBody.sessionId), true);
});

test("worker serves passkey operator page", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/approval/passkey/operator?repositoryInput=marushu%2Fvtdd-v2-p&issueNumber=15&phase=execution&actionType=deploy_production&highRiskKind=deploy_production&returnUrl=https%3A%2F%2Fchatgpt.com%2Fg%2Fexample-butler"
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  const html = await response.text();
  assert.equal(html.includes("VTDD Passkey Operator"), true);
  assert.equal(html.includes("/v2/approval/passkey/challenge"), true);
  assert.equal(html.includes('id="repo-input" value="marushu/vtdd-v2-p"'), true);
  assert.equal(html.includes('id="issue-input" value="15"'), true);
  assert.equal(html.includes('id="phase-input" value="execution"'), true);
  assert.equal(html.includes('id="action-type-input" value="deploy_production"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="deploy_production"'), true);
  assert.equal(html.includes('href="https://chatgpt.com/g/example-butler"'), true);
  assert.equal(html.includes('href="https://evil.example/phish"'), false);
});

test("worker strips non-ChatGPT operator return urls", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/approval/passkey/operator?repositoryInput=marushu%2Fvtdd-v2-p&returnUrl=https%3A%2F%2Fevil.example%2Fphish"
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes('href="https://evil.example/phish"'), false);
  assert.equal(html.includes('id="return-to-butler-link" href=""'), true);
});

test("worker passkey operator page enables desktop secret sync bridge when syncApiBase is provided", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/approval/passkey/operator?repositoryInput=marushu%2Fvtdd-v2-p&issueNumber=15&highRiskKind=github_app_secret_sync&syncApiBase=http%3A%2F%2F127.0.0.1%3A8789%2Fapi"
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes('fetch("http://127.0.0.1:8789/api/github-app-secret-sync/execute"'), true);
  assert.equal(html.includes("desktop helper bridge に接続します"), true);
});

test("worker allows same-origin browser bootstrap registration before first passkey exists", async () => {
  const provider = createInMemoryMemoryProvider();

  const response = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/register/options", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operatorId: "owner",
        operatorLabel: "Owner"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(Boolean(body.sessionId), true);
});

test("worker blocks browser registration after first passkey already exists", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "passkey:existing",
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      kind: "passkey_registry",
      credentialId: "existing",
      publicKey: "pub",
      counter: 1,
      transports: ["internal"]
    },
    metadata: { source: "test" },
    priority: 80,
    tags: ["passkey_registry"],
    createdAt: "2026-04-25T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/register/options", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operatorId: "owner",
        operatorLabel: "Owner"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );

  assert.equal(response.status, 403);
});

test("worker purges expired passkey session records before issuing challenge", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "passkey-auth:expired",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_approval",
      status: "pending",
      challenge: "challenge:old",
      rpID: "example.com",
      origin: "https://example.com",
      expiresAt: "2000-01-01T00:00:00.000Z",
      scope: {}
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_session", "passkey_approval"],
    createdAt: "2000-01-01T00:00:00.000Z"
  });
  await provider.store({
    id: "passkey:AQIDBA",
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      kind: "passkey_registry",
      credentialId: "AQIDBA",
      publicKey: "BQYHCA",
      counter: 1,
      transports: ["internal"]
    },
    metadata: { source: "test" },
    priority: 80,
    tags: ["passkey_registry"],
    createdAt: "2026-04-25T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/challenge", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        issueContext: { issueNumber: 14 },
        policyInput: {
          actionType: ActionType.DEPLOY_PRODUCTION,
          repositoryInput: "vtdd"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );

  assert.equal(response.status, 200);
  const remaining = await provider.query({
    type: MemoryRecordType.APPROVAL_LOG,
    text: "passkey-auth:expired",
    limit: 10
  });
  assert.equal(remaining.length, 0);
});

test("worker allows same-origin browser approval flow after passkey exists", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "passkey:AQIDBA",
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      kind: "passkey_registry",
      credentialId: "AQIDBA",
      publicKey: "BQYHCA",
      counter: 1,
      transports: ["internal"]
    },
    metadata: { source: "test" },
    priority: 80,
    tags: ["passkey_registry"],
    createdAt: "2026-04-25T00:00:00.000Z"
  });

  const challenge = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/challenge", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "execution",
        issueContext: { issueNumber: 15 },
        policyInput: {
          actionType: ActionType.DESTRUCTIVE,
          repositoryInput: "marushu/vtdd-v2-p",
          highRiskKind: "github_app_secret_sync"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );

  assert.equal(challenge.status, 200);
  const challengeBody = await challenge.json();
  assert.equal(challengeBody.ok, true);

  const verify = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/verify", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: challengeBody.sessionId,
        response: {
          id: "AQIDBA",
          response: {}
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );

  assert.equal(verify.status, 200);
  const verifyBody = await verify.json();
  assert.equal(verifyBody.ok, true);
  assert.equal(Boolean(verifyBody.approvalGrant.approvalId), true);
  assert.equal(verifyBody.approvalGrant.scope.repositoryInput, "marushu/vtdd-v2-p");
  assert.equal(verifyBody.approvalGrant.scope.issueNumber, "15");
  assert.equal(verifyBody.approvalGrant.scope.relatedIssue, "15");
});

test("worker gateway accepts high-risk approval grant resolved from memory", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "deploy_production",
        repositoryInput: "vtdd",
        issueNumber: "14",
        relatedIssue: "14",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-25T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.EXECUTOR,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: { issueNumber: 14 },
        policyInput: {
          actionType: ActionType.DEPLOY_PRODUCTION,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: {
            model: "github_app",
            tier: CredentialTier.HIGH_RISK,
            shortLived: true,
            boundApprovalId: "approval-123"
          },
          consent: { grantedCategories: [ConsentCategory.EXECUTE] },
          approvalPhrase: "GO deploy request",
          approvalScopeMatched: true,
          approvalGrantId: "approval-123",
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
});

test("worker returns approval grant through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-xyz",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-xyz",
      verifiedAt: "2026-04-25T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "15",
        relatedIssue: "15",
        phase: "execution",
        highRiskKind: "github_app_secret_sync"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-25T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/approval-grant?approvalId=approval-xyz", {
      headers: gatewayAuthHeaders
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.approvalGrant.approvalId, "approval-xyz");
  assert.equal(body.approvalGrant.scope.repositoryInput, "sample-org/vtdd-v2-p");
});

test("worker returns GitHub repositories through read plane route", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/github?resource=repositories&limit=5", {
      headers: gatewayAuthHeaders
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_repo_read",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            repositories: [
              {
                full_name: "sample-org/vtdd-v2-p",
                name: "vtdd-v2-p",
                private: false,
                default_branch: "main",
                html_url: "https://github.com/sample-org/vtdd-v2-p"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.read.resource, "repositories");
  assert.equal(body.read.records[0].fullName, "sample-org/vtdd-v2-p");
});

test("worker stores and retrieves repository nicknames", async () => {
  const provider = createInMemoryMemoryProvider();
  const env = {
    ...gatewayAuthEnv,
    MEMORY_PROVIDER: provider,
    GITHUB_APP_INSTALLATION_TOKEN: "ghs_repo_read",
    GITHUB_API_FETCH: async () =>
      new Response(
        JSON.stringify({
          total_count: 1,
          repositories: [
            {
              full_name: "sample-org/vtdd-v2-p",
              name: "vtdd-v2-p",
              private: false
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
  };

  const writeResponse = await worker.fetch(
    new Request("https://example.com/v2/action/repository-nickname", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "vtdd-v2-p",
        nickname: "公開VTDD"
      })
    }),
    env
  );

  assert.equal(writeResponse.status, 200);
  const writeBody = await writeResponse.json();
  assert.equal(writeBody.ok, true);
  assert.equal(writeBody.repository, "sample-org/vtdd-v2-p");
  assert.deepEqual(writeBody.aliasEntry.aliases, ["公開VTDD"]);

  const retrieveResponse = await worker.fetch(
    new Request("https://example.com/v2/retrieve/repository-nicknames", {
      headers: gatewayAuthHeaders
    }),
    env
  );

  assert.equal(retrieveResponse.status, 200);
  const retrieveBody = await retrieveResponse.json();
  assert.equal(retrieveBody.ok, true);
  assert.equal(retrieveBody.aliasRegistry.length, 1);
  assert.equal(retrieveBody.aliasRegistry[0].canonicalRepo, "sample-org/vtdd-v2-p");
  assert.deepEqual(retrieveBody.aliasRegistry[0].aliases, ["公開VTDD"]);
});

test("worker surfaces repository nickname retrieval failures as action-visible JSON", async () => {
  const failingProvider = {
    async store() {
      return { ok: true };
    },
    async retrieve(filter) {
      if (filter?.type === MemoryRecordType.ALIAS_REGISTRY) {
        throw new TypeError("Illegal invocation (incorrect this reference)");
      }
      return [];
    },
    async query() {
      return [];
    },
    async validateRecord() {
      return { ok: true };
    }
  };

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/repository-nicknames", {
      headers: gatewayAuthHeaders
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: failingProvider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, 503);
  assert.equal(body.error, "repository_nickname_retrieval_failed");
  assert.equal(body.reason, "Illegal invocation (incorrect this reference)");
  assert.deepEqual(body.issues, ["repository_nickname_retrieval_exception"]);
  assert.deepEqual(body.aliasRegistry, []);
});

test("worker gateway can resolve stored repository nickname against live repository index", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "alias_registry:sample-org/vtdd-v2-p",
    type: MemoryRecordType.ALIAS_REGISTRY,
    content: {
      canonicalRepo: "sample-org/vtdd-v2-p",
      productName: "vtdd-v2-p",
      visibility: "public",
      aliases: ["公開VTDD"]
    },
    metadata: { source: "test" },
    priority: 60,
    tags: ["alias_registry", "sample-org/vtdd-v2-p"],
    createdAt: "2026-04-27T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.EXECUTOR,
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "公開VTDD",
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.EXECUTE] },
          approvalPhrase: "GO build",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_repo_read",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            total_count: 1,
            repositories: [
              {
                full_name: "sample-org/vtdd-v2-p",
                name: "vtdd-v2-p",
                private: false
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "sample-org/vtdd-v2-p");
});

test("worker gateway warns when runtime nickname registry read is unverified", async () => {
  const failingProvider = {
    async store() {
      return { ok: true };
    },
    async retrieve(filter) {
      if (filter?.type === MemoryRecordType.ALIAS_REGISTRY) {
        throw new TypeError("Illegal invocation (incorrect this reference)");
      }
      return [];
    },
    async query() {
      return [];
    },
    async validateRecord() {
      return { ok: true };
    }
  };

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE] },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: failingProvider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "sample-org/vtdd-v2");
  assert.equal(
    body.warnings.some((warning) =>
      warning.includes("repository nickname registry read unverified")
    ),
    true
  );
});

test("worker blocks repository nickname write when nickname target is ambiguous", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "alias_registry:sample-org/vtdd-v2-p",
    type: MemoryRecordType.ALIAS_REGISTRY,
    content: {
      canonicalRepo: "sample-org/vtdd-v2-p",
      productName: "vtdd-v2-p",
      visibility: "public",
      aliases: ["公開VTDD"]
    },
    metadata: { source: "test" },
    priority: 60,
    tags: ["alias_registry", "sample-org/vtdd-v2-p"],
    createdAt: "2026-04-27T00:00:00.000Z"
  });
  await provider.store({
    id: "alias_registry:sample-org/vtdd-public",
    type: MemoryRecordType.ALIAS_REGISTRY,
    content: {
      canonicalRepo: "sample-org/vtdd-public",
      productName: "vtdd-public",
      visibility: "public",
      aliases: ["公開VTDD"]
    },
    metadata: { source: "test" },
    priority: 60,
    tags: ["alias_registry", "sample-org/vtdd-public"],
    createdAt: "2026-04-27T00:00:01.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/action/repository-nickname", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "公開VTDD",
        nickname: "公開本命"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_repo_read",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            total_count: 2,
            repositories: [
              {
                full_name: "sample-org/vtdd-v2-p",
                name: "vtdd-v2-p",
                private: false
              },
              {
                full_name: "sample-org/vtdd-public",
                name: "vtdd-public",
                private: false
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "repository_nickname_request_invalid");
  assert.equal(body.reason, "target repository nickname is ambiguous");
});

test("worker returns GitHub issues through read plane route", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/github?resource=issues&repository=sample-org/vtdd-v2-p&state=open&limit=5",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_issue_read",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify([
            {
              number: 46,
              title: "Implement GitHub read plane",
              body: "## Intent\nExpose Issue text to Butler.",
              state: "open",
              html_url: "https://github.com/sample-org/vtdd-v2-p/issues/46",
              user: { login: "marushu" }
            }
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.read.records[0].number, 46);
  assert.equal(body.read.records[0].body, "## Intent\nExpose Issue text to Butler.");
});

test("worker returns unsupported for unknown GitHub read resources", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/github?resource=milestones", {
      headers: gatewayAuthHeaders
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_issue_read"
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "github_read_request_invalid");
});

test("worker returns canonical Custom GPT setup artifacts", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/setup-artifact?artifact=instructions&repository=sample-org/vtdd-v2-p&ref=main",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            sha: "instructions-sha",
            encoding: "base64",
            content: Buffer.from("vtddRetrieveSetupArtifact\nvtddRetrieveSelfParity", "utf8").toString(
              "base64"
            )
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.artifact.artifact, "instructions");
  assert.equal(body.artifact.path, "docs/setup/custom-gpt-instructions.md");
  assert.equal(body.artifact.content.includes("vtddRetrieveSelfParity"), true);
});

test("worker returns Butler self-parity summary", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/self-parity?repository=sample-org/vtdd-v2-p&ref=main&issueNumber=91",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        const isInstructions = parsed.pathname.endsWith("/docs/setup/custom-gpt-instructions.md");
        return new Response(
          JSON.stringify({
            sha: isInstructions ? "instructions-sha" : "openapi-sha",
            encoding: "base64",
            content: Buffer.from(
              isInstructions
                ? [
                    "vtddGateway",
                    "vtddDeployProduction",
                    "vtddRetrieveGitHub",
                    "vtddRetrieveSetupArtifact",
                    "vtddRetrieveSelfParity",
                    "Action Schema update required",
                    "Instructions update required",
                    "Cloudflare deploy update required"
                  ].join("\n")
                : [
                    "paths:",
                    "  /v2/gateway:",
                    "  /v2/action/deploy:",
                    "  /v2/retrieve/github:",
                    "  /v2/retrieve/setup-artifact:",
                    "  /v2/retrieve/self-parity:",
                    "    get:",
                    "      operationId: vtddGateway",
                    "      operationId: vtddDeployProduction",
                    "      operationId: vtddRetrieveGitHub",
                    "      operationId: vtddRetrieveSetupArtifact",
                    "      operationId: vtddRetrieveSelfParity"
                  ].join("\n"),
              "utf8"
            ).toString("base64")
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.selfParity.runtimeParity, "in_sync");
  assert.equal(body.selfParity.runtimeMissingRoutes.length, 0);
  assert.equal(body.selfParity.canonical.artifacts.instructions.path, "docs/setup/custom-gpt-instructions.md");
  assert.equal(
    body.selfParity.deployOperatorUrl,
    "https://example.com/v2/approval/passkey/operator?repositoryInput=sample-org%2Fvtdd-v2-p&phase=execution&actionType=deploy_production&highRiskKind=deploy_production&issueNumber=91"
  );
  assert.equal(
    body.selfParity.deployOperatorMarkdownLink,
    `[Open deploy operator](${body.selfParity.deployOperatorUrl})`
  );
  assert.equal(body.selfParity.deployRecovery, null);
});

test("worker returns deploy recovery operator url in self-parity when runtime is stale", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/self-parity?repository=sample-org/vtdd-v2-p&ref=main&issueNumber=91",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        const isInstructions = parsed.pathname.endsWith("/docs/setup/custom-gpt-instructions.md");
        return new Response(
          JSON.stringify({
            sha: isInstructions ? "instructions-sha" : "openapi-sha",
            encoding: "base64",
            content: Buffer.from(
              isInstructions
                ? [
                    "vtddGateway",
                    "vtddDeployProduction",
                    "vtddRetrieveGitHub",
                    "vtddRetrieveSetupArtifact",
                    "vtddRetrieveSelfParity",
                    "Action Schema update required",
                    "Instructions update required",
                    "Cloudflare deploy update required"
                  ].join("\n")
                : [
                    "paths:",
                    "  /v2/gateway:",
                    "  /v2/action/deploy:",
                    "  /v2/retrieve/github:",
                    "  /v2/retrieve/setup-artifact:",
                    "  /v2/retrieve/self-parity:",
                    "    get:",
                    "      operationId: vtddGateway",
                    "      operationId: vtddDeployProduction",
                    "      operationId: vtddRetrieveGitHub",
                    "      operationId: vtddRetrieveSetupArtifact",
                    "      operationId: vtddRetrieveSelfParity",
                    "      operationId: vtddBrandNewParityRoute"
                  ].join("\n"),
              "utf8"
            ).toString("base64")
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.selfParity.runtimeParity, "cloudflare_deploy_update_required");
  assert.equal(
    body.selfParity.deployRecovery.operatorUrl,
    "https://example.com/v2/approval/passkey/operator?repositoryInput=sample-org%2Fvtdd-v2-p&phase=execution&actionType=deploy_production&highRiskKind=deploy_production&issueNumber=91"
  );
  assert.equal(
    body.selfParity.deployRecovery.operatorMarkdownLink,
    `[Open deploy operator](${body.selfParity.deployRecovery.operatorUrl})`
  );
});

test("worker executes scoped GitHub issues and issue comments through the normal write plane", async () => {
  const issueResponse = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "issue_create",
        repository: "sample-org/vtdd-v2-p",
        title: "test: live E2E evidence",
        body: "Issue body fixed by approval scope.",
        policyInput: {
          approvalPhrase: "GO",
          targetConfirmed: true,
          approvalScopeMatched: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            number: 107,
            title: "test: live E2E evidence",
            state: "open",
            html_url: "https://github.com/sample-org/vtdd-v2-p/issues/107"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        )
    }
  );

  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "issue_comment_create",
        repository: "sample-org/vtdd-v2-p",
        issueContext: {
          issueNumber: 52
        },
        body: "scoped comment",
        policyInput: {
          approvalPhrase: "GO",
          targetConfirmed: true,
          approvalScopeMatched: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            id: 101,
            html_url: "https://github.com/sample-org/vtdd-v2-p/issues/52#issuecomment-101"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(issueResponse.status, 200);
  const issueBody = await issueResponse.json();
  assert.equal(issueBody.ok, true);
  assert.equal(issueBody.write.operation, "issue_create");
  assert.equal(issueBody.write.issueNumber, 107);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.write.operation, "issue_comment_create");
  assert.equal(body.write.commentId, 101);
});

test("worker rejects unsupported high-risk GitHub write operations on the normal write plane", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "merge",
        repository: "sample-org/vtdd-v2-p",
        responseMode: "action_visible",
        policyInput: {
          approvalPhrase: "GO",
          targetConfirmed: true,
          approvalScopeMatched: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write"
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, 422);
  assert.equal(body.error, "github_write_request_invalid");
});

test("worker returns action-visible GitHub write fetch failures", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "issue_create",
        repository: "sample-org/vtdd-v2-p",
        title: "test",
        body: "body",
        responseMode: "action_visible",
        policyInput: {
          approvalPhrase: "GO",
          targetConfirmed: true,
          approvalScopeMatched: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async () => {
        throw new TypeError("fetch failed");
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, 503);
  assert.equal(body.error, "github_write_failed");
  assert.equal(body.reason, "failed to execute GitHub write operation: issue_create");
  assert.equal(body.issues.includes("github_write_fetch_exception"), true);
  assert.deepEqual(body.diagnostics, {
    operation: "issue_create",
    requestMethod: "POST",
    requestUrl: "https://api.github.com/repos/sample-org/vtdd-v2-p/issues",
    exceptionName: "TypeError",
    exceptionMessage: "fetch failed"
  });
});

test("worker preserves HTTP error status for GitHub write consumers that do not request action envelopes", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "merge",
        repository: "sample-org/vtdd-v2-p",
        policyInput: {
          approvalPhrase: "GO",
          targetConfirmed: true,
          approvalScopeMatched: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write"
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, undefined);
  assert.equal(body.error, "github_write_request_invalid");
});

test("worker executes GitHub merge on the high-risk authority plane with approval grant id", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-merge-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-merge-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "merge",
        highRiskKind: "pull_merge",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "55",
        relatedIssue: "55",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-26T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github-authority", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "pull_merge",
        repository: "sample-org/vtdd-v2-p",
        pullNumber: 21,
        issueContext: {
          issueNumber: 55
        },
        policyInput: {
          approvalPhrase: "GO",
          approvalGrantId: "approval-merge-123",
          targetConfirmed: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            sha: "abc123",
            merged: true,
            message: "Pull Request successfully merged"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.authorityAction.operation, "pull_merge");
  assert.equal(body.authorityAction.merged, true);
});

test("worker blocks bounded issue close on the high-risk authority plane when merged pull proof is missing", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-close-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-close-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        highRiskKind: "issue_close",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "55",
        relatedIssue: "55",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-26T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github-authority", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "issue_close",
        repository: "sample-org/vtdd-v2-p",
        pullNumber: 21,
        issueContext: {
          issueNumber: 55
        },
        policyInput: {
          approvalPhrase: "GO",
          approvalGrantId: "approval-close-123",
          targetConfirmed: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            number: 21,
            merged_at: null
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.reason, "bounded issue close requires a merged pull request");
});

test("worker dispatches governed production deploy using the request origin as the default runtime url", async () => {
  const provider = createInMemoryMemoryProvider();
  const calls = [];
  await provider.store({
    id: "approval-deploy-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-deploy-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "deploy_production",
        highRiskKind: "deploy_production",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "82",
        relatedIssue: "82",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-27T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/deploy", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        policyInput: {
          approvalPhrase: "GO",
          approvalGrantId: "approval-deploy-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_deploy",
      DEPLOY_DISPATCH_VERIFY_DELAY_MS: "0",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).includes("/actions/workflows/deploy-production.yml/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 9090,
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/9090",
                  status: "queued",
                  conclusion: null
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(null, { status: 204 });
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.deploy.status, "dispatched");
  assert.equal(body.deploy.runUrl, "https://github.com/sample-org/vtdd-v2-p/actions/runs/9090");
  assert.equal(body.deploy.runtimeUrl, "https://sample-user-vtdd.example.workers.dev");
  const dispatchBody = JSON.parse(calls[0].init.body);
  assert.equal(
    dispatchBody.inputs.runtime_url,
    "https://sample-user-vtdd.example.workers.dev"
  );
});

test("worker allows same-origin browser governed production deploy with a real approval grant", async () => {
  const provider = createInMemoryMemoryProvider();
  const calls = [];
  await provider.store({
    id: "approval-deploy-browser-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-deploy-browser-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "deploy_production",
        highRiskKind: "deploy_production",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "82",
        relatedIssue: "82",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-27T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/deploy", {
      method: "POST",
      headers: {
        origin: "https://sample-user-vtdd.example.workers.dev",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        policyInput: {
          approvalPhrase: "GO",
          approvalGrantId: "approval-deploy-browser-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_deploy",
      DEPLOY_DISPATCH_VERIFY_DELAY_MS: "0",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).includes("/actions/workflows/deploy-production.yml/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 9091,
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/9091",
                  status: "queued",
                  conclusion: null
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(null, { status: 204 });
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.deploy.status, "dispatched");
  assert.equal(body.deploy.runUrl, "https://github.com/sample-org/vtdd-v2-p/actions/runs/9091");
  assert.equal(body.deploy.runtimeUrl, "https://sample-user-vtdd.example.workers.dev");
  const dispatchBody = JSON.parse(calls[0].init.body);
  assert.equal(
    dispatchBody.inputs.runtime_url,
    "https://sample-user-vtdd.example.workers.dev"
  );
});

test("worker returns raw deploy context when workflow dispatch is unverified", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-deploy-unverified-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-deploy-unverified-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "deploy_production",
        highRiskKind: "deploy_production",
        repositoryInput: "sample-org/vtdd-v2-p",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-27T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/deploy", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        policyInput: {
          approvalPhrase: "GO",
          approvalGrantId: "approval-deploy-unverified-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_deploy",
      DEPLOY_DISPATCH_VERIFY_ATTEMPTS: "1",
      DEPLOY_DISPATCH_VERIFY_DELAY_MS: "0",
      GITHUB_API_FETCH: async (url) => {
        if (String(url).includes("/actions/workflows/deploy-production.yml/runs")) {
          return new Response(JSON.stringify({ workflow_runs: [] }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(null, { status: 204 });
      }
    }
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "deploy_dispatch_unverified");
  assert.equal(body.deploy.status, "dispatch_unverified");
  assert.equal(body.deploy.repository, "sample-org/vtdd-v2-p");
  assert.equal(body.deploy.workflowFile, "deploy-production.yml");
  assert.equal(body.deploy.runtimeUrl, "https://sample-user-vtdd.example.workers.dev");
});

test("worker syncs OPENAI_API_KEY through approval-bound GitHub Actions secret route", async () => {
  const provider = createInMemoryMemoryProvider();
  const calls = [];
  await provider.store({
    id: "approval-actions-secret-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-actions-secret-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        highRiskKind: "github_actions_secret_sync",
        repositoryInput: "sample-org/vtdd-v2-p",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-28T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/github-actions-secret", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        secretName: "OPENAI_API_KEY",
        secretValue: "sk-test-secret",
        policyInput: {
          approvalGrantId: "approval-actions-secret-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_secret",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith("/actions/secrets/public-key")) {
          return new Response(
            JSON.stringify({
              key_id: "key-123",
              key: "LW+MLFAtyNPENefjLqmydKkBGp4l5suTetSR9313Xm8="
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(null, { status: 204 });
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.secretSync.secretName, "OPENAI_API_KEY");
  assert.equal(JSON.stringify(body).includes("sk-test-secret"), false);
  assert.equal(calls[1].url.endsWith("/actions/secrets/OPENAI_API_KEY"), true);
});

test("worker allows same-origin browser OPENAI_API_KEY secret sync with approval grant", async () => {
  const provider = createInMemoryMemoryProvider();
  const calls = [];
  await provider.store({
    id: "approval-browser-actions-secret-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-browser-actions-secret-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        highRiskKind: "github_actions_secret_sync",
        repositoryInput: "sample-org/vtdd-v2-p",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-28T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/github-actions-secret", {
      method: "POST",
      headers: {
        origin: "https://sample-user-vtdd.example.workers.dev",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        secretName: "OPENAI_API_KEY",
        secretValue: "sk-test-secret",
        policyInput: {
          approvalGrantId: "approval-browser-actions-secret-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_secret",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith("/actions/secrets/public-key")) {
          return new Response(
            JSON.stringify({
              key_id: "key-123",
              key: "LW+MLFAtyNPENefjLqmydKkBGp4l5suTetSR9313Xm8="
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(null, { status: 204 });
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.secretSync.secretName, "OPENAI_API_KEY");
  assert.equal(JSON.stringify(body).includes("sk-test-secret"), false);
  assert.equal(calls[1].url.endsWith("/actions/secrets/OPENAI_API_KEY"), true);
});

test("worker returns JSON when OPENAI_API_KEY token resolution fails", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-actions-secret-throw-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-actions-secret-throw-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        highRiskKind: "github_actions_secret_sync",
        repositoryInput: "sample-org/vtdd-v2-p",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-28T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/github-actions-secret", {
      method: "POST",
      headers: {
        origin: "https://sample-user-vtdd.example.workers.dev",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        secretName: "OPENAI_API_KEY",
        secretValue: "sk-test-secret",
        policyInput: {
          approvalGrantId: "approval-actions-secret-throw-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN_PROVIDER: async () => {
        throw new Error("token=secret-token sk-test-secret");
      }
    }
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "github_actions_secret_sync_unavailable");
  assert.match(body.reason, /installation token provider failed/);
  assert.equal(JSON.stringify(body).includes("secret-token"), false);
  assert.equal(JSON.stringify(body).includes("sk-test-secret"), false);
});

test("worker returns remote Codex execution progress", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/progress?executionId=remote-codex-issue6-abcd12", {
      headers: {
        authorization: "Bearer test-token"
      }
    }),
    {
      ...gatewayAuthEnv,
      REMOTE_CODEX_EXECUTOR_TRANSPORT: "api_key_runner",
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            workflow_runs: [
              {
                id: 101,
                name: "remote-codex-executor",
                display_title: "remote-codex-issue6-abcd12",
                html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/101",
                status: "queued",
                conclusion: null,
                head_branch: "main",
                run_started_at: "2026-04-24T08:00:00Z",
                updated_at: "2026-04-24T08:01:00Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.progress.workflowRunId, 101);
  assert.equal(body.progress.status, "queued");
});

test("worker gateway blocks butler path when judgment order is invalid", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: [
          JudgmentStep.RUNTIME_TRUTH,
          JudgmentStep.CONSTITUTION,
          JudgmentStep.ISSUE_CONTEXT,
          JudgmentStep.CURRENT_QUERY
        ],
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE] },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "butler_invalid_judgment_order");
});

test("worker gateway blocks merge in guarded absence mode and records stop log", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.MERGE,
          mode: TaskMode.EXECUTION,
          autonomyMode: AutonomyMode.GUARDED_ABSENCE,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: {
            model: "github_app",
            tier: CredentialTier.HIGH_RISK,
            shortLived: true,
            boundApprovalId: "approval-123"
          },
          consent: { grantedCategories: [ConsentCategory.EXECUTE] },
          approvalPhrase: "GO merge request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "guarded_absence_forbids_action");
  assert.equal(Boolean(body.guardedAbsenceExecutionLog?.recordId), true);

  const records = await provider.retrieve({
    type: MemoryRecordType.EXECUTION_LOG,
    limit: 5
  });
  assert.equal(records.length, 1);
});

test("worker accepts legacy /mvp gateway route for compatibility", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/mvp/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
});

test("worker gateway persists decision log and returns decision references", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE] },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        },
        memoryRecord: {
          recordType: "decision_log",
          content: {
            decision: "Issue #17 の接続不足を修正する",
            rationale: "Butler が過去判断を理由付きで説明できるようにする",
            relatedIssue: 17
          },
          metadata: {
            decidedBy: "shuhei"
          }
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(Boolean(body.memoryWritePersisted?.recordId), true);
  assert.equal(body.retrievalReferences.decisionLogs.length, 1);
});

test("worker blocks gateway without required bearer token", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("worker accepts gateway with valid Cloudflare Access service token headers", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-access-client-id": "access-id",
        "cf-access-client-secret": "access-secret"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    {
      CF_ACCESS_CLIENT_ID: "access-id",
      CF_ACCESS_CLIENT_SECRET: "access-secret"
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
});

test("worker blocks constitution retrieve when machine auth runtime is not configured", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/constitution"),
    {}
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("worker returns constitution records through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "constitution-1",
    type: MemoryRecordType.CONSTITUTION,
    content: { rule: "runtime_truth_over_memory" },
    metadata: { version: "v2" },
    priority: 90,
    tags: ["constitution"],
    createdAt: "2026-04-16T02:00:00Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/constitution?limit=3", {
      headers: {
        authorization: "Bearer test-token"
      }
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.recordType, "constitution");
  assert.equal(body.recordCount, 1);
});

test("worker returns decision log references through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "decision-1",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "Issue #17 を再接続する",
      rationale: "Butler 参照を復元する",
      relatedIssue: 17,
      decidedBy: "shuhei",
      timestamp: "2026-04-16T01:00:00Z",
      supersededBy: null
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 95,
    tags: ["decision_log", "issue:17"],
    createdAt: "2026-04-16T01:00:00Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/decisions?relatedIssue=17&limit=3", {
      headers: {
        authorization: "Bearer test-token"
      }
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.recordType, "decision_log");
  assert.equal(body.recordCount, 1);
});

test("worker returns proposal log references through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "proposal-1",
    type: MemoryRecordType.PROPOSAL_LOG,
    content: {
      hypothesis: "Issue化前の案を保存する",
      options: ["案A", "案B"],
      rejectedReasons: [{ option: "案A", reason: "安全境界が弱い" }],
      concerns: ["記録漏れ"],
      unresolvedQuestions: ["表示順をどうするか"],
      relatedIssue: 20,
      proposedBy: "shuhei",
      timestamp: "2026-04-16T01:30:00Z"
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 85,
    tags: ["proposal_log", "issue:20"],
    createdAt: "2026-04-16T01:30:00Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/proposals?relatedIssue=20&limit=3", {
      headers: {
        authorization: "Bearer test-token"
      }
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.recordType, "proposal_log");
  assert.equal(body.recordCount, 1);
});

test("worker returns cross-issue memory index through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "constitution-cross-1",
    type: MemoryRecordType.CONSTITUTION,
    content: {
      title: "constitution_rule",
      description: "Constitution should be returned in cross retrieval."
    },
    metadata: { version: "v2" },
    priority: 90,
    tags: ["constitution"],
    createdAt: "2026-04-16T03:00:00Z"
  });
  await provider.store({
    id: "decision-cross-1",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "Cross retrieval should include decisions",
      rationale: "Butler needs why trace",
      relatedIssue: 19,
      decidedBy: "owner",
      timestamp: "2026-04-16T03:10:00Z",
      supersededBy: null
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 95,
    tags: ["decision_log", "issue:19"],
    createdAt: "2026-04-16T03:10:00Z"
  });
  await provider.store({
    id: "proposal-cross-1",
    type: MemoryRecordType.PROPOSAL_LOG,
    content: {
      hypothesis: "Cross retrieval API should include proposal context",
      options: ["route", "route+orchestration"],
      rejectedReasons: [{ option: "route", reason: "insufficient review history" }],
      concerns: ["search drift"],
      unresolvedQuestions: ["UI wiring timing"],
      relatedIssue: 19,
      proposedBy: "owner",
      timestamp: "2026-04-16T03:20:00Z"
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 85,
    tags: ["proposal_log", "issue:19"],
    createdAt: "2026-04-16T03:20:00Z"
  });

  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/cross?phase=execution&relatedIssue=19&issueNumber=19&issueTitle=Retrieval%20Contract&limit=8",
      {
        headers: {
          authorization: "Bearer test-token"
        }
      }
    ),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.retrievalPlan.sources[0], "issue");
  assert.equal(body.primaryReference.source, "issue");
});

test("worker returns not_found for unknown route", async () => {
  const response = await worker.fetch(new Request("https://example.com/unknown"));
  assert.equal(response.status, 404);
});
