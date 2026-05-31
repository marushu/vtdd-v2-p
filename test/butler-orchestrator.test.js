import test from "node:test";
import assert from "node:assert/strict";
import {
  ActionType,
  ConsentCategory,
  CredentialTier,
  JudgmentStep,
  evaluateButlerExecution
} from "../src/core/index.js";

const registry = [
  {
    canonicalRepo: "sample-org/vtdd-v2",
    productName: "VTDD V2",
    aliases: ["vtdd"]
  }
];

const judgmentTrace = [
  JudgmentStep.CONSTITUTION,
  JudgmentStep.RUNTIME_TRUTH,
  JudgmentStep.ISSUE_CONTEXT,
  JudgmentStep.CURRENT_QUERY
];

const fullConsent = {
  grantedCategories: [
    ConsentCategory.READ,
    ConsentCategory.PROPOSE,
    ConsentCategory.EXECUTE,
    ConsentCategory.DESTRUCTIVE,
    ConsentCategory.EXTERNAL_PUBLISH
  ]
};

const approvalContext = {
  approvalPhrase: "GO issue creation",
  approvalScopeMatched: true
};

function developmentStrategy(issueNumber = 125) {
  return {
    evidencePath: `docs/development-strategy/issue-${issueNumber}-butler-handoff.md`,
    completionExperience: "Dashboard Butler から自然文 GO した owner が、実装前作戦図付き handoff で進められる。",
    vtddArea: "Dashboard Butler の自然文 build handoff と VPS runner PR 作成前 guardrail を接続する。",
    design: "Butler が owner intent をすぐ実装へ渡さず、Issue traceability と branch をもとに作戦図を handoff に固定する。",
    hypothesis: "浅い PR 連鎖の原因は、Butler build handoff が実装前の仮説と検証計画を持たずに runner へ渡ることにある。",
    verificationPlan: "worker / orchestrator / remote Codex executor / VPS runner tests で作戦図が保持されることを確認する。",
    changeEstimate: "src/worker/runtime.js、src/core/remote-codex-handoff-scope.js、src/core/remote-codex-executor.js と関連 tests を改修する。",
    knownPath: "既存の Butler execute route、issue refs、VPS runner PR body renderer は存在する。",
    unknownBoundary: "Dashboard 上の専用編集 UI や LLM による深い設計生成はこの handoff draft だけでは未完成として扱う。",
    likelyGaps: "handoff 途中で developmentStrategy を落とすと、VPS runner が PR body を作れなくなる。",
    prePrChecks: "対象 Issue、AGENTS.md、strategy contract、handoff normalization、runner validation を確認する。",
    optionsRejected: "VPS runner 側だけで拒否する案は捨て、Butler 入口で作戦図 draft を持たせる。",
    postMergeE2E: "production deploy 後に Dashboard Butler から自然文 build handoff を通し、queue comment と PR body を確認する。",
    noNextPrReason: "Butler 入口、bounded 判定、executor request 保持、runner PR body 反映を同じ範囲で塞ぐ。",
    stopCondition: "作戦図なしで bounded build handoff が allowed になる場合は停止する。"
  };
}

test("butler orchestrator allows issue creation when all gates pass", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace,
    policyInput: {
      actionType: ActionType.ISSUE_CREATE,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      targetConfirmed: true,
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
      ...approvalContext,
      issueTraceable: true,
      go: true,
      passkey: false
    }
  });
  assert.equal(result.allowed, true);
  assert.equal(result.repository, "sample-org/vtdd-v2");
});

test("butler orchestrator accepts OpenAPI judgment trace objects", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace: judgmentTrace.map((step) => ({
      step,
      status: "checked",
      rationale: `${step} checked before issue creation`
    })),
    policyInput: {
      actionType: ActionType.ISSUE_CREATE,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      targetConfirmed: true,
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
      ...approvalContext,
      issueTraceable: true,
      go: true,
      passkey: false
    }
  });
  assert.equal(result.allowed, true);
  assert.equal(result.repository, "sample-org/vtdd-v2");
});

test("butler orchestrator allows build only as bounded remote Codex handoff", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace,
    runtimeContext: {
      allowButlerRemoteCodexHandoff: true
    },
    issueContext: {
      issueNumber: 125
    },
    continuationContext: {
      requiresHandoff: true,
      handoff: {
        issueTraceable: true,
        approvalScopeMatched: true,
        relatedIssue: 125,
        developmentStrategy: developmentStrategy(125),
        summary: "Issue #125 bounded Codex handoff"
      }
    },
    policyInput: {
      actionType: ActionType.BUILD,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      targetConfirmed: true,
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
      ...approvalContext,
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
  });
  assert.equal(result.allowed, true);
  assert.equal(result.repository, "sample-org/vtdd-v2");
});

test("butler orchestrator blocks build handoff without development strategy", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace,
    runtimeContext: {
      allowButlerRemoteCodexHandoff: true
    },
    issueContext: {
      issueNumber: 125
    },
    continuationContext: {
      requiresHandoff: true,
      handoff: {
        issueTraceable: true,
        approvalScopeMatched: true,
        relatedIssue: 125,
        summary: "Issue #125 bounded Codex handoff"
      }
    },
    policyInput: {
      actionType: ActionType.BUILD,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      targetConfirmed: true,
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
      ...approvalContext,
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
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "role_action_boundary");
});

test("butler orchestrator derives constitution consultation from valid judgment trace", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace,
    runtimeContext: {
      allowButlerRemoteCodexHandoff: true
    },
    issueContext: {
      issueNumber: 125
    },
    continuationContext: {
      requiresHandoff: true,
      handoff: {
        issueTraceable: true,
        approvalScopeMatched: true,
        relatedIssue: 125,
        developmentStrategy: developmentStrategy(125),
        summary: "Issue #125 bounded Codex handoff"
      }
    },
    policyInput: {
      actionType: ActionType.BUILD,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      targetConfirmed: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
      ...approvalContext,
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
  });
  assert.equal(result.allowed, true);
  assert.equal(result.repository, "sample-org/vtdd-v2");
});

test("butler orchestrator derives approval scope match from bounded remote handoff", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace,
    runtimeContext: {
      allowButlerRemoteCodexHandoff: true
    },
    issueContext: {
      issueNumber: 125
    },
    continuationContext: {
      requiresHandoff: true,
      handoff: {
        issueTraceable: true,
        approvalScopeMatched: true,
        relatedIssue: 125,
        developmentStrategy: developmentStrategy(125),
        summary: "Issue #125 bounded Codex handoff"
      }
    },
    policyInput: {
      actionType: ActionType.BUILD,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      targetConfirmed: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
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
  });
  assert.equal(result.allowed, true);
  assert.equal(result.repository, "sample-org/vtdd-v2");
});

test("butler orchestrator derives GitHub App credential from bounded remote handoff", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace,
    runtimeContext: {
      allowButlerRemoteCodexHandoff: true
    },
    issueContext: {
      issueNumber: 125
    },
    continuationContext: {
      requiresHandoff: true,
      handoff: {
        issueTraceable: true,
        approvalScopeMatched: true,
        relatedIssue: 125,
        developmentStrategy: developmentStrategy(125),
        summary: "Issue #125 bounded Codex handoff"
      }
    },
    policyInput: {
      actionType: ActionType.BUILD,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      targetConfirmed: true,
      runtimeTruth: { runtimeAvailable: true },
      consent: fullConsent,
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
  });
  assert.equal(result.allowed, true);
  assert.equal(result.repository, "sample-org/vtdd-v2");
});

test("butler orchestrator does not derive handoff approval from non-string summary", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace,
    runtimeContext: {
      allowButlerRemoteCodexHandoff: true
    },
    issueContext: {
      issueNumber: 125
    },
    continuationContext: {
      requiresHandoff: true,
      handoff: {
        issueTraceable: true,
        approvalScopeMatched: true,
        relatedIssue: 125,
        developmentStrategy: developmentStrategy(125),
        summary: 125
      }
    },
    policyInput: {
      actionType: ActionType.BUILD,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      targetConfirmed: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
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
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "role_action_boundary");
});

test("butler orchestrator does not derive handoff approval from non-string refs", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace,
    runtimeContext: {
      allowButlerRemoteCodexHandoff: true
    },
    issueContext: {
      issueNumber: 125
    },
    continuationContext: {
      requiresHandoff: true,
      handoff: {
        issueTraceable: true,
        approvalScopeMatched: true,
        relatedIssue: 125,
        developmentStrategy: developmentStrategy(125),
        summary: "Issue #125 bounded Codex handoff"
      }
    },
    policyInput: {
      actionType: ActionType.BUILD,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      targetConfirmed: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
      approvalPhrase: "GO Issue #125 Codex handoff",
      issueTraceable: true,
      issueTraceability: {
        relatedIssue: 125,
        intentRefs: [125],
        successCriteriaRefs: ["#125 Success Criteria"],
        nonGoalRefs: ["#125 Non-goals"]
      },
      go: true,
      passkey: false
    }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "role_action_boundary");
});

test("butler orchestrator blocks self-asserted build handoff outside execute route", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace,
    issueContext: {
      issueNumber: 125
    },
    continuationContext: {
      requiresHandoff: true,
      handoff: {
        issueTraceable: true,
        approvalScopeMatched: true,
        relatedIssue: 125,
        developmentStrategy: developmentStrategy(125),
        summary: "Issue #125 bounded Codex handoff"
      }
    },
    policyInput: {
      actionType: ActionType.BUILD,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      targetConfirmed: true,
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
      ...approvalContext,
      issueTraceable: true,
      go: true,
      passkey: false
    }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "role_action_boundary");
});

test("butler orchestrator blocks build handoff when related issue is not bound", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace,
    runtimeContext: {
      allowButlerRemoteCodexHandoff: true
    },
    issueContext: {
      issueNumber: 125
    },
    continuationContext: {
      requiresHandoff: true,
      handoff: {
        issueTraceable: true,
        approvalScopeMatched: true,
        relatedIssue: 4,
        summary: "Mismatched handoff"
      }
    },
    policyInput: {
      actionType: ActionType.BUILD,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      targetConfirmed: true,
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
      ...approvalContext,
      issueTraceable: true,
      go: true,
      passkey: false
    }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "role_action_boundary");
});

test("butler orchestrator blocks build handoff without explicit issue section refs", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace,
    runtimeContext: {
      allowButlerRemoteCodexHandoff: true
    },
    issueContext: {
      issueNumber: 125
    },
    continuationContext: {
      requiresHandoff: true,
      handoff: {
        issueTraceable: true,
        approvalScopeMatched: true,
        relatedIssue: 125,
        developmentStrategy: developmentStrategy(125),
        summary: "Issue #125 bounded Codex handoff"
      }
    },
    policyInput: {
      actionType: ActionType.BUILD,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      targetConfirmed: true,
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
      ...approvalContext,
      issueTraceable: true,
      go: true,
      passkey: false
    }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "role_action_boundary");
});

test("butler orchestrator blocks direct build without remote Codex handoff", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace,
    policyInput: {
      actionType: ActionType.BUILD,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
      ...approvalContext,
      issueTraceable: true,
      go: true,
      passkey: false
    }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "role_action_boundary");
});

test("butler orchestrator blocks invalid judgment order", () => {
  const result = evaluateButlerExecution({
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
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
      ...approvalContext,
      issueTraceable: true,
      go: true,
      passkey: false
    }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "butler_invalid_judgment_order");
});

test("butler orchestrator blocks when surface overrides judgment model", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "web",
      judgmentModelId: "vendor-specific-model"
    },
    judgmentTrace,
    policyInput: {
      actionType: ActionType.ISSUE_CREATE,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
      ...approvalContext,
      issueTraceable: true,
      go: true,
      passkey: false
    }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "surface_must_not_override_judgment_model");
});

test("butler orchestrator propagates policy block for unresolved repository", () => {
  const result = evaluateButlerExecution({
    surfaceContext: {
      surface: "cli",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace,
    policyInput: {
      actionType: ActionType.ISSUE_CREATE,
      mode: "execution",
      repositoryInput: "unknown",
      aliasRegistry: registry,
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
      ...approvalContext,
      issueTraceable: true,
      go: true,
      passkey: false
    }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "unresolved_target_blocks_execution");
});
