import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import {
  ActionType,
  ConsentCategory,
  CredentialTier,
  MemoryRecordType,
  TaskMode,
  createInMemoryMemoryProvider
} from "../src/core/index.js";

const aliasRegistry = [
  {
    canonicalRepo: "marushu/vtdd-v2",
    aliases: ["vtdd"]
  }
];

test("worker returns health", async () => {
  const response = await worker.fetch(new Request("https://example.com/health"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mode, "v2");
});

test("worker returns setup wizard html", async () => {
  const response = await worker.fetch(new Request("https://example.com/setup/wizard"));
  assert.equal(response.status, 200);
  const contentType = response.headers.get("content-type") ?? "";
  assert.equal(contentType.includes("text/html"), true);
  const html = await response.text();
  assert.equal(html.includes("VTDD Setup Wizard"), true);
  assert.equal(html.includes("Custom GPT Construction"), true);
  assert.equal(html.includes("Copy Construction"), true);
  assert.equal(html.includes("Copy Schema"), true);
});

test("worker returns setup wizard json", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard?format=json&repo=marushu/vtdd-v2&surface=custom_gpt"
    )
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.onboarding.customGpt.actionSchemaJson.includes("/v2/gateway"), true);
  assert.equal(body.generatedAnswers.actionEndpointBaseUrl, "https://example.com");
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
  assert.equal(body.repository, "marushu/vtdd-v2");
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
    metadata: { repository: "marushu/vtdd-v2" },
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
    metadata: { repository: "marushu/vtdd-v2" },
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
