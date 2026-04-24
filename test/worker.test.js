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
                reviewCommentsCount: 3,
                unresolvedReviewCommentsCount: 2,
                updatedSinceReview: true,
                reviewer: "gemini"
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
              activeBranch: "codex/issue-6"
            }
          },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE] },
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
        return new Response(null, { status: 204 });
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.issueNumber, 6);
  assert.equal(calls.length, 2);
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

test("worker returns remote Codex execution progress", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/progress?executionId=remote-codex-issue6-abcd12", {
      headers: {
        authorization: "Bearer test-token"
      }
    }),
    {
      ...gatewayAuthEnv,
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
