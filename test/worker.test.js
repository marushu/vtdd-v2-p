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
