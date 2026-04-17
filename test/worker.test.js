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

test("worker health accepts legacy autonomy mode env alias", async () => {
  const response = await worker.fetch(new Request("https://example.com/health"), {
    MVP_AUTONOMY_MODE: "guarded_absence"
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.autonomyMode, AutonomyMode.GUARDED_ABSENCE);
});

test("worker health returns to normal mode when VTDD_AUTONOMY_MODE is set to normal", async () => {
  const response = await worker.fetch(new Request("https://example.com/health"), {
    VTDD_AUTONOMY_MODE: "normal",
    MVP_AUTONOMY_MODE: "guarded_absence"
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.autonomyMode, AutonomyMode.NORMAL);
});

test("worker returns setup wizard html when repo query is provided", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?repo=sample-org/vtdd-v2")
  );
  assert.equal(response.status, 200);
  const contentType = response.headers.get("content-type") ?? "";
  assert.equal(contentType.includes("text/html"), true);
  const html = await response.text();
  assert.equal(html.includes("VTDD Setup Wizard"), true);
  assert.equal(html.includes("Custom GPT Construction"), true);
  assert.equal(html.includes("Copy Construction"), true);
  assert.equal(html.includes("Copy Schema"), true);
  assert.equal(html.includes("Copy Import URL"), true);
  assert.equal(html.includes('textarea id="constructionText"'), true);
  assert.equal(html.includes('textarea id="actionSchemaImportUrl"'), true);
  assert.equal(html.includes('textarea id="actionSchemaJson"'), true);
  assert.equal(html.includes("You are VTDD Butler."), true);
  assert.equal(html.includes("Replace the full Instructions field with this text."), true);
  assert.equal(html.includes("/v2/gateway"), true);
  assert.equal(html.includes("format=openapi"), true);
  assert.equal(html.includes("Deploy Authority Recommendation"), true);
  assert.equal(html.includes("one_shot_github_actions"), true);
  assert.equal(html.includes("direct_provider"), true);
  assert.equal(html.includes("Production Deploy Contract"), true);
  assert.equal(html.includes("deploy-production"), true);
  assert.equal(html.includes("approval_phrase=GO"), true);
  assert.equal(html.includes("passkey_verified=true"), true);
  assert.equal(html.includes("CLOUDFLARE_API_TOKEN"), true);
  assert.equal(html.includes("CLOUDFLARE_ACCOUNT_ID"), true);
  assert.equal(html.includes("repositoryVisibility=unknown"), true);
  assert.equal(html.includes("branchProtectionApiStatus=unknown"), true);
  assert.equal(html.includes("rulesetsApiStatus=unknown"), true);
  assert.equal(html.includes("cloudflareApiToken"), false);
  assert.equal(html.includes("githubAppPrivateKey"), false);
});

test("worker setup wizard html reflects direct provider recommendation when GitHub protection is unavailable", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard?repo=sample-org/vtdd-v2&repositoryVisibility=private&branchProtectionApiStatus=forbidden&rulesetsApiStatus=forbidden"
    )
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("Deploy Authority Recommendation"), true);
  assert.equal(html.includes("direct_provider"), true);
  assert.equal(html.includes("one_shot_github_actions"), true);
  assert.equal(html.includes("repositoryVisibility=private"), true);
  assert.equal(html.includes("branchProtectionApiStatus=forbidden"), true);
  assert.equal(html.includes("rulesetsApiStatus=forbidden"), true);
});

test("worker setup wizard requires repo query and returns explicit guidance", async () => {
  const response = await worker.fetch(new Request("https://example.com/setup/wizard?format=json"));
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.blockingIssues.includes("at least one repository mapping is required"), true);
  assert.equal(Array.isArray(body.guidance), true);
  assert.equal(
    body.guidance.some((item) => item.includes("repo=sample-org%2Fsample-repo")),
    true
  );
});

test("worker returns setup wizard json", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2&surface=custom_gpt"
    )
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.onboarding.customGpt.actionSchemaJson.includes("/v2/gateway"), true);
  assert.equal(
    body.onboarding.customGpt.actionSchemaImportUrl,
    "https://example.com/setup/wizard?format=openapi&repo=sample-org%2Fvtdd-v2&surface=custom_gpt"
  );
  assert.equal(body.onboarding.productionDeploy.workflow, "deploy-production");
  assert.equal(body.onboarding.productionDeploy.environment, "production");
  assert.equal(body.generatedAnswers.actionEndpointBaseUrl, "https://example.com");
  assert.equal(body.cloudflareSetupCheck.state, "disabled");
  assert.equal(body.githubAppSetupCheck.state, "not_configured");
});

test("worker returns setup wizard openapi schema for import url", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=openapi&repo=sample-org/vtdd-v2")
  );
  assert.equal(response.status, 200);
  const contentType = response.headers.get("content-type") ?? "";
  assert.equal(contentType.includes("application/json"), true);
  const body = await response.json();
  assert.equal(body.openapi, "3.1.0");
  assert.equal(body.paths["/v2/gateway"].post.operationId, "postMvpGateway");
  assert.equal(body.servers[0].url, "https://example.com");
});

test("worker setup wizard json keeps iphone-first and no-default-repo policy visible", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2")
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.generatedAnswers.setupMode, "iphone_first");
  assert.equal(body.generatedAnswers.allowDefaultRepository, false);
  assert.equal(body.onboarding.setupMode, "iphone_first");
  assert.equal(body.onboarding.customGpt.constructionText.includes("Do not assume a default repository."), true);
});

test("worker setup wizard never exposes secret credential input fields", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2")
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal("cloudflareApiToken" in body.generatedAnswers, false);
  assert.equal("cloudflareAccountId" in body.generatedAnswers, false);
  assert.equal("githubAppPrivateKey" in body.generatedAnswers, false);
  assert.equal("githubToken" in body.generatedAnswers, false);
  assert.equal("openaiApiKey" in body.generatedAnswers, false);
  assert.equal("geminiApiKey" in body.generatedAnswers, false);
});

test("worker setup wizard reports partially configured github app bootstrap", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2"),
    {
      GITHUB_APP_ID: "12345"
    }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.githubAppSetupCheck.state, "partially_configured");
  assert.equal(
    body.githubAppSetupCheck.guidance.some((item) => item.includes("GITHUB_APP_INSTALLATION_ID")),
    true
  );
  assert.equal(
    body.githubAppSetupCheck.guidance.some((item) => item.includes("GITHUB_APP_PRIVATE_KEY")),
    true
  );
});

test("worker setup wizard verifies github app live probe when requested", async () => {
  const calls = [];
  const githubApiFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/app/installations/98765/access_tokens")) {
      return new Response(
        JSON.stringify({
          token: "ghs_minted_installation_token",
          expires_at: "2030-01-01T00:00:00Z"
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" }
        }
      );
    }
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
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  };

  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2&githubAppCheck=on"
    ),
    {
      GITHUB_APP_ID: "12345",
      GITHUB_APP_INSTALLATION_ID: "98765",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----",
      GITHUB_APP_JWT_PROVIDER: async () => "app_jwt_token_for_tests",
      GITHUB_API_FETCH: githubApiFetch
    }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.githubAppSetupCheck.state, "ready");
  assert.equal(body.githubAppSetupCheck.evidence.source, "github_app_live");
  assert.equal(body.githubAppSetupCheck.evidence.repositoryCount, 1);
  assert.equal(calls.length, 2);
});

test("worker setup wizard accepts deploy authority detection query inputs", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2&repositoryVisibility=private&branchProtectionApiStatus=forbidden&rulesetsApiStatus=forbidden"
    )
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.generatedAnswers.repositoryVisibility, "private");
  assert.equal(body.generatedAnswers.branchProtectionApiStatus, "forbidden");
  assert.equal(body.generatedAnswers.rulesetsApiStatus, "forbidden");
  assert.equal(body.onboarding.deployAuthority.selectedPath, "direct_provider");
});

test("worker setup wizard classifies cloudflare billing-related setup failure", async () => {
  const calls = [];
  const cloudflareApiFetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/user/tokens/verify")) {
      return new Response(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: { status: "active" }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }
    return new Response(
      JSON.stringify({
        success: false,
        errors: [
          {
            code: 10042,
            message: "Billing setup required. Add payment method before using this feature."
          }
        ],
        messages: []
      }),
      {
        status: 403,
        headers: { "content-type": "application/json" }
      }
    );
  };

  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2&cloudflareCheck=on"
    ),
    {
      SETUP_WIZARD_CLOUDFLARE_CHECK_ENABLED: "true",
      CLOUDFLARE_API_TOKEN: "token-for-check-only",
      CLOUDFLARE_ACCOUNT_ID: "account-id-for-check-only",
      CF_API_FETCH: cloudflareApiFetch
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(calls.length, 2);
  assert.equal(body.cloudflareSetupCheck.state, "billing_action_required");
  assert.equal(
    body.cloudflareSetupCheck.summary.includes("billing/payment action may be required"),
    true
  );
  assert.equal(Array.isArray(body.cloudflareSetupCheck.links), true);
  assert.equal(body.cloudflareSetupCheck.links.length > 0, true);
});

test("worker setup wizard does not call cloudflare api unless explicitly requested", async () => {
  let called = false;
  const cloudflareApiFetch = async () => {
    called = true;
    return new Response(
      JSON.stringify({
        success: true,
        errors: [],
        messages: []
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  };

  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2"),
    {
      SETUP_WIZARD_CLOUDFLARE_CHECK_ENABLED: "true",
      CLOUDFLARE_API_TOKEN: "token-for-check-only",
      CLOUDFLARE_ACCOUNT_ID: "account-id-for-check-only",
      CF_API_FETCH: cloudflareApiFetch
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.cloudflareSetupCheck.state, "disabled");
  assert.equal(called, false);
});

test("worker runs gateway route", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
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
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO deploy request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    })
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
      headers: {
        "content-type": "application/json"
      },
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
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    })
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "sample-org/vtdd-v2");
});

test("worker gateway blocks butler path when judgment order is invalid", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
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
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    })
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "butler_invalid_judgment_order");
});

test("worker gateway blocks butler path when surface overrides judgment model", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "web",
          judgmentModelId: "vendor-specific-model"
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
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    })
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "surface_must_not_override_judgment_model");
});

test("worker gateway allows pr comment without GO when other gates pass", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.PR_COMMENT,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "",
          approvalScopeMatched: false,
          issueTraceable: true,
          go: false,
          passkey: false
        }
      })
    })
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.requiredApproval, "none");
});

test("worker gateway blocks pr review submit without GO", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.PR_REVIEW_SUBMIT,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO review submit",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: false,
          passkey: false
        }
      })
    })
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "approval_boundary");
  assert.equal(body.reason, "explicit GO is required before execution");
});

test("worker gateway keeps merge on GO plus passkey boundary", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.MERGE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.HIGH_RISK,
            shortLived: true,
            boundApprovalId: "approval-merge-1"
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO merge request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    })
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "approval_boundary");
  assert.equal(body.reason, "high-risk action requires GO + passkey");
});

test("worker gateway blocks merge in guarded absence mode and records stop log", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
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
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.HIGH_RISK,
            shortLived: true,
            boundApprovalId: "approval-123"
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO merge request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: true
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
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
  assert.equal(records[0].content.mode, "guarded_absence");
  assert.equal(records[0].content.allowed, false);
  assert.equal(records[0].content.blockedByRule, "guarded_absence_forbids_action");
});

test("worker runtime forced guarded absence mode overrides payload normal mode", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.PR_OPERATION,
          mode: TaskMode.EXECUTION,
          autonomyMode: AutonomyMode.NORMAL,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true,
            runtimeState: {
              issuePrCount: 1
            }
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO pr operation",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      VTDD_AUTONOMY_MODE: "guarded_absence",
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.autonomyMode, AutonomyMode.GUARDED_ABSENCE);
  assert.equal(
    body.warnings.includes(
      "runtime forces guarded absence mode; payload autonomyMode override was ignored"
    ),
    true
  );
  assert.equal(Boolean(body.guardedAbsenceExecutionLog?.recordId), true);

  const records = await provider.retrieve({
    type: MemoryRecordType.EXECUTION_LOG,
    limit: 5
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].content.mode, "guarded_absence");
  assert.equal(records[0].content.allowed, true);
  assert.equal(records[0].content.actionType, ActionType.PR_OPERATION);
  assert.equal(records[0].content.blockedByRule, null);
});

test("worker guarded absence blocks ambiguous request and records stop log", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          autonomyMode: AutonomyMode.GUARDED_ABSENCE,
          ambiguity: {
            ambiguousRequest: true
          },
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO build request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "guarded_absence_blocks_ambiguous_request");
  assert.equal(Boolean(body.guardedAbsenceExecutionLog?.recordId), true);

  const records = await provider.retrieve({
    type: MemoryRecordType.EXECUTION_LOG,
    limit: 5
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].content.blockedByRule, "guarded_absence_blocks_ambiguous_request");
});

test("worker guarded absence blocks spec conflict and records stop log", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          autonomyMode: AutonomyMode.GUARDED_ABSENCE,
          ambiguity: {
            specConflict: true
          },
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO build request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "guarded_absence_blocks_spec_conflict");
  assert.equal(Boolean(body.guardedAbsenceExecutionLog?.recordId), true);

  const records = await provider.retrieve({
    type: MemoryRecordType.EXECUTION_LOG,
    limit: 5
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].content.blockedByRule, "guarded_absence_blocks_spec_conflict");
});

test("worker guarded absence blocks unconfirmed target and records stop log", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          autonomyMode: AutonomyMode.GUARDED_ABSENCE,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: false,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO build request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "target_confirmation_required");
  assert.equal(Boolean(body.guardedAbsenceExecutionLog?.recordId), true);

  const records = await provider.retrieve({
    type: MemoryRecordType.EXECUTION_LOG,
    limit: 5
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].content.blockedByRule, "target_confirmation_required");
});

test("worker gateway uses github app live repository index for natural list conversation", async () => {
  const githubApiFetch = async () =>
    new Response(
      JSON.stringify({
        total_count: 2,
        repositories: [
          {
            full_name: "sample-org/vtdd-v2",
            name: "vtdd-v2",
            private: true
          },
          {
            full_name: "sample-org/accounting-app",
            name: "accounting-app",
            private: false
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        conversation: {
          userText: "持ってるリポジトリ一覧を見せて"
        },
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "unknown",
          runtimeTruth: {
            runtimeAvailable: false,
            safeFallbackChosen: true
          },
          consent: {
            grantedCategories: [ConsentCategory.READ]
          },
          issueTraceable: false
        }
      })
    }),
    {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_live_index_token",
      GITHUB_API_FETCH: githubApiFetch
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.conversationAssist.detectedIntent, "list_repositories");
  assert.equal(body.conversationAssist.responseGuide.style, "repository_list");
  assert.equal(body.repositoryCandidates.length, 2);
  assert.equal(
    body.repositoryCandidates.some((item) => item.canonicalRepo === "sample-org/vtdd-v2"),
    true
  );
  assert.equal(
    body.repositoryCandidates.some(
      (item) => item.canonicalRepo === "sample-org/accounting-app" && item.visibility === "public"
    ),
    true
  );
});

test("worker gateway resolves repository switch intent using live github app aliases", async () => {
  const githubApiFetch = async () =>
    new Response(
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
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        conversation: {
          userText: "VTDD を開いて",
          currentRepository: "sample-org/accounting-app"
        },
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          runtimeTruth: {
            runtimeAvailable: false,
            safeFallbackChosen: true
          },
          consent: {
            grantedCategories: [ConsentCategory.READ]
          },
          issueTraceable: false
        }
      })
    }),
    {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_live_index_token",
      GITHUB_API_FETCH: githubApiFetch
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "sample-org/vtdd-v2");
  assert.equal(body.conversationAssist.mentionedRepository, "sample-org/vtdd-v2");
  assert.equal(body.conversationAssist.requiresConfirmation, true);
});

test("worker accepts legacy /mvp gateway route for compatibility", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/mvp/gateway", {
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
    })
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
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
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
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
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
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(Boolean(body.memoryWritePersisted?.recordId), true);
  assert.equal(body.retrievalReferences.decisionLogs.length, 1);
  assert.equal(body.retrievalReferences.decisionLogs[0].relatedIssue, 17);
});

test("worker gateway blocks invalid decision log schema", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
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
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
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
            relatedIssue: 17
          }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "decision_log_schema_invalid");
});

test("worker gateway requires memory provider for decision log persistence", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
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
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
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
            rationale: "理由参照を復元する",
            relatedIssue: 17
          }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    }
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.error, "memory_provider_unavailable");
});

test("worker gateway persists proposal log and returns proposal references", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO proposal capture",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        },
        memoryRecord: {
          recordType: "proposal_log",
          content: {
            hypothesis: "Issue化前の検討案を保存する",
            options: ["案A", "案B"],
            rejectedReasons: [{ option: "案A", reason: "安全境界が弱い" }],
            concerns: ["検討履歴が消える"],
            unresolvedQuestions: ["表示戦略はどうするか"],
            relatedIssue: 20,
            proposedBy: "shuhei"
          }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(Boolean(body.memoryWritePersisted?.recordId), true);
  assert.equal(body.memoryWritePersisted.recordType, "proposal_log");
  assert.equal(body.retrievalReferences.proposalLogs.length, 1);
  assert.equal(body.retrievalReferences.proposalLogs[0].relatedIssue, 20);
});

test("worker gateway blocks invalid proposal log schema", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO proposal capture",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        },
        memoryRecord: {
          recordType: "proposal_log",
          content: {
            hypothesis: "Issue化前の検討案を保存する"
          }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "proposal_log_schema_invalid");
});

test("worker gateway requires memory provider for proposal log persistence", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO proposal capture",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        },
        memoryRecord: {
          recordType: "proposal_log",
          content: {
            hypothesis: "Issue化前の検討案を保存する",
            options: ["案A"],
            concerns: ["検討履歴が消える"],
            unresolvedQuestions: ["表示戦略はどうするか"]
          }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    }
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.error, "memory_provider_unavailable");
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
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    }
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("worker blocks gateway with invalid bearer token as forbidden", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer wrong-token"
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
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    }
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("worker accepts gateway with valid bearer token", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
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
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
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

test("worker blocks gateway without Cloudflare Access service token headers", async () => {
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
    {
      CF_ACCESS_CLIENT_ID: "access-id",
      CF_ACCESS_CLIENT_SECRET: "access-secret"
    }
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("worker blocks gateway with invalid Cloudflare Access service token headers", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-access-client-id": "access-id",
        "cf-access-client-secret": "wrong-secret"
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

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("worker accepts legacy MVP_GATEWAY_BEARER_TOKEN env on /v2 route", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer legacy-token"
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
      MVP_GATEWAY_BEARER_TOKEN: "legacy-token"
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
});

test("worker blocks constitution retrieve without required bearer token", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/constitution"),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    }
  );

  assert.equal(response.status, 401);
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
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.recordType, "constitution");
  assert.equal(body.recordCount, 1);
  assert.equal(body.records[0].id, "constitution-1");
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
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.recordType, "decision_log");
  assert.equal(body.recordCount, 1);
  assert.equal(body.references[0].relatedIssue, 17);
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
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.recordType, "proposal_log");
  assert.equal(body.recordCount, 1);
  assert.equal(body.references[0].relatedIssue, 20);
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
  await provider.store({
    id: "execution-cross-pr-101",
    type: MemoryRecordType.EXECUTION_LOG,
    content: {
      summary: "PR #101 contains review summary for issue #19",
      relatedIssue: 19,
      prNumber: 101,
      reviewer: "gemini",
      status: "approved"
    },
    metadata: { kind: "pr_review_summary", repository: "sample-org/vtdd-v2" },
    priority: 80,
    tags: ["pr_context", "pr:101", "issue:19"],
    createdAt: "2026-04-16T03:30:00Z"
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
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.retrievalPlan.sources[0], "issue");
  assert.equal(body.primaryReference.source, "issue");
  assert.equal(body.orderedReferences[0].source, "issue");
  assert.equal(body.orderedReferences[1].source, "constitution");
  assert.equal(body.orderedReferences[2].source, "decision_log");
  assert.equal(body.referencesBySource.decision_log.length, 1);
  assert.equal(body.referencesBySource.proposal_log.length, 1);
  assert.equal(body.referencesBySource.pr_context.length, 1);
  assert.equal(body.referencesBySource.pr_context[0].prNumber, 101);
});

test("worker gateway attaches cross retrieval references for recall conversation", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "constitution-gw-cross-1",
    type: MemoryRecordType.CONSTITUTION,
    content: {
      title: "constitution_rule",
      description: "Constitution first for recall flow."
    },
    metadata: { version: "v2" },
    priority: 90,
    tags: ["constitution"],
    createdAt: "2026-04-16T04:00:00Z"
  });
  await provider.store({
    id: "decision-gw-cross-1",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "Use cross retrieval for recall UX",
      rationale: "Avoid asking users for API paths",
      relatedIssue: 19,
      decidedBy: "owner",
      timestamp: "2026-04-16T04:10:00Z",
      supersededBy: null
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 95,
    tags: ["decision_log", "issue:19"],
    createdAt: "2026-04-16T04:10:00Z"
  });
  await provider.store({
    id: "proposal-gw-cross-1",
    type: MemoryRecordType.PROPOSAL_LOG,
    content: {
      hypothesis: "Conversation-first UX should call cross retrieval via gateway",
      options: ["gateway attach", "manual retrieve endpoint"],
      rejectedReasons: [{ option: "manual retrieve endpoint", reason: "too technical for mobile" }],
      concerns: ["prompt drift"],
      unresolvedQuestions: ["how to present condensed output"],
      relatedIssue: 19,
      proposedBy: "owner",
      timestamp: "2026-04-16T04:20:00Z"
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 85,
    tags: ["proposal_log", "issue:19"],
    createdAt: "2026-04-16T04:20:00Z"
  });
  await provider.store({
    id: "execution-gw-cross-pr-120",
    type: MemoryRecordType.EXECUTION_LOG,
    content: {
      summary: "PR #120 validated cross retrieval shape",
      relatedIssue: 19,
      prNumber: 120,
      reviewer: "gemini",
      status: "approved"
    },
    metadata: { kind: "pr_review_summary", repository: "sample-org/vtdd-v2" },
    priority: 82,
    tags: ["pr_context", "pr:120", "issue:19"],
    createdAt: "2026-04-16T04:30:00Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        conversation: {
          userText: "Issue #19 って何だっけ？過去判断と提案を振り返りたい"
        },
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.conversationAssist.detectedIntent, "recall_context");
  assert.equal(body.retrievalReferences.cross.displayMode, "short");
  assert.equal(body.retrievalReferences.cross.relatedIssue, 19);
  assert.equal(body.retrievalReferences.cross.sourceCounts.decision_log, 1);
  assert.equal(body.retrievalReferences.cross.sourceCounts.proposal_log, 1);
  assert.equal(body.retrievalReferences.cross.sourceCounts.pr_context, 1);
  assert.deepEqual(body.conversationAssist.responseGuide.sourceOrder, [
    "issue",
    "constitution",
    "decision_log",
    "proposal_log",
    "pr_context"
  ]);
});

test("worker returns 503 when constitution retrieve provider is unavailable", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/constitution", {
      headers: {
        authorization: "Bearer test-token"
      }
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    }
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "memory_provider_unavailable");
});

test("worker blocks invalid policy input", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.DEPLOY_PRODUCTION,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.HIGH_RISK
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO deploy request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    })
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "approval_boundary");
});

test("worker returns not_found for unknown route", async () => {
  const response = await worker.fetch(new Request("https://example.com/unknown"));
  assert.equal(response.status, 404);
});
