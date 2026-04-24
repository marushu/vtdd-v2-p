import test from "node:test";
import assert from "node:assert/strict";
import {
  ActionType,
  ActorRole,
  ConsentCategory,
  CredentialTier,
  JudgmentStep,
  TaskMode,
  WorkflowEvent,
  WorkflowStage,
  runMvpGateway
} from "../src/core/index.js";

const registry = [
  {
    canonicalRepo: "sample-org/vtdd-v2",
    productName: "VTDD V2",
    visibility: "private",
    aliases: ["vtdd"]
  },
  {
    canonicalRepo: "sample-org/accounting-app",
    productName: "Tomio Bookkeeping",
    visibility: "public",
    aliases: ["ledger", "bookkeeping"]
  }
];

const validJudgmentTrace = [
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
  approvalPhrase: "GO scoped in gateway",
  approvalScopeMatched: true
};

test("gateway allows butler issue creation and transitions workflow", () => {
  const result = runMvpGateway({
    phase: "execution",
    actorRole: ActorRole.BUTLER,
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace: validJudgmentTrace,
    currentWorkflowState: {
      stage: WorkflowStage.IDEA,
      reconcileRequired: false,
      reconcileReturnStage: null
    },
    workflowEvent: WorkflowEvent.DRAFT_PROPOSAL,
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
    },
    memoryRecord: {
      recordType: "decision_log",
      content: "decided to prepare issue #13 update",
      metadata: { issue: 13 }
    }
  });

  assert.equal(result.allowed, true);
  assert.equal(result.workflowState.stage, WorkflowStage.PROPOSAL);
  assert.equal(result.repository, "sample-org/vtdd-v2");
  assert.equal(result.repositoryCandidates.length, 2);
  assert.equal(result.repositoryCandidates[0].canonicalRepo, "sample-org/vtdd-v2");
  assert.equal(result.repositoryCandidates[0].visibility, "private");
  assert.equal(result.memoryWrite.recordType, "decision_log");
});

test("gateway blocks when memory record contains secret", () => {
  const result = runMvpGateway({
    phase: "execution",
    actorRole: ActorRole.EXECUTOR,
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
    },
    memoryRecord: {
      recordType: "execution_log",
      content: "token=ghp_abcdefghijklmnopqrstuvwxyz1234"
    }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "memory_must_exclude_secrets");
  assert.equal(result.repositoryCandidates.length, 2);
});

test("gateway blocks invalid workflow transition", () => {
  const result = runMvpGateway({
    phase: "execution",
    actorRole: ActorRole.EXECUTOR,
    currentWorkflowState: {
      stage: WorkflowStage.ISSUE,
      reconcileRequired: false,
      reconcileReturnStage: null
    },
    workflowEvent: WorkflowEvent.OPEN_PR,
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
  assert.equal(result.blockedByRule, "workflow_transition_blocked");
});

test("gateway exploration phase includes conversation in retrieval plan", () => {
  const result = runMvpGateway({
    phase: "exploration",
    actorRole: ActorRole.EXECUTOR,
    policyInput: {
      actionType: ActionType.READ,
      mode: "read_only",
      repositoryInput: "unknown",
      aliasRegistry: registry,
    targetConfirmed: true,
      constitutionConsulted: false,
      runtimeTruth: { runtimeAvailable: false, safeFallbackChosen: true },
      credential: { model: "github_app", tier: CredentialTier.READ },
      consent: {
        grantedCategories: [ConsentCategory.READ]
      },
      issueTraceable: false,
      go: false,
      passkey: false
    }
  });
  assert.equal(result.allowed, true);
  assert.equal(result.retrievalPlan.phase, "exploration");
  assert.equal(result.retrievalPlan.sources.includes("conversation"), true);
});

test("gateway infers repository list intent from natural conversation", () => {
  const result = runMvpGateway({
    phase: "exploration",
    actorRole: ActorRole.EXECUTOR,
    conversation: {
      userText: "俺の持ってるリポジトリ一覧出して"
    },
    policyInput: {
      actionType: ActionType.READ,
      mode: "read_only",
      repositoryInput: "unknown",
      aliasRegistry: registry,
    targetConfirmed: true,
      runtimeTruth: { runtimeAvailable: false, safeFallbackChosen: true },
      consent: {
        grantedCategories: [ConsentCategory.READ]
      },
      issueTraceable: false
    }
  });
  assert.equal(result.allowed, true);
  assert.equal(result.conversationAssist.detectedIntent, "list_repositories");
  assert.equal(result.conversationAssist.hideTechnicalPaths, true);
  assert.equal(result.conversationAssist.responseGuide.style, "repository_list");
  assert.equal(result.repositoryCandidates[1].visibility, "public");
});

test("gateway asks confirmation when conversation implies repository switch", () => {
  const result = runMvpGateway({
    phase: "exploration",
    actorRole: ActorRole.EXECUTOR,
    conversation: {
      userText: "VTDD V2 を開いて",
      currentRepository: "sample-org/accounting-app"
    },
    policyInput: {
      actionType: ActionType.READ,
      mode: "read_only",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
    targetConfirmed: true,
      runtimeTruth: { runtimeAvailable: false, safeFallbackChosen: true },
      consent: {
        grantedCategories: [ConsentCategory.READ]
      },
      issueTraceable: false
    }
  });
  assert.equal(result.allowed, true);
  assert.equal(result.repository, "sample-org/vtdd-v2");
  assert.equal(result.conversationAssist.mentionedRepository, "sample-org/vtdd-v2");
  assert.equal(result.conversationAssist.requiresConfirmation, true);
});

test("gateway returns natural consent question for blocked consent boundary", () => {
  const result = runMvpGateway({
    phase: "exploration",
    actorRole: ActorRole.EXECUTOR,
    conversation: {
      userText: "今の状態だけ確認したい"
    },
    policyInput: {
      actionType: ActionType.READ,
      mode: "read_only",
      repositoryInput: "vtdd",
      aliasRegistry: registry
    }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "consent_boundary");
  assert.equal(
    result.conversationAssist.nextQuestion,
    "読み取り同意が必要です。読み取りを許可して進めますか？"
  );
});

test("gateway sets cross retrieval assist for natural recall conversation", () => {
  const result = runMvpGateway({
    phase: "exploration",
    actorRole: ActorRole.EXECUTOR,
    conversation: {
      userText: "Issue #19 って何だっけ？過去の判断と提案を思い出したい"
    },
    policyInput: {
      actionType: ActionType.READ,
      mode: "read_only",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
    targetConfirmed: true,
      runtimeTruth: { runtimeAvailable: false, safeFallbackChosen: true },
      consent: {
        grantedCategories: [ConsentCategory.READ]
      },
      issueTraceable: false
    }
  });

  assert.equal(result.allowed, true);
  assert.equal(result.conversationAssist.detectedIntent, "recall_context");
  assert.equal(result.conversationAssist.responseGuide.style, "cross_retrieval");
  assert.equal(result.conversationAssist.crossRetrievalRequest.enabled, true);
  assert.equal(result.conversationAssist.crossRetrievalRequest.phase, "exploration");
  assert.equal(result.conversationAssist.crossRetrievalRequest.relatedIssue, 19);
  assert.equal(result.conversationAssist.crossRetrievalRequest.displayMode, "short");
});

test("gateway asks clarification when recall conversation mentions multiple issues", () => {
  const result = runMvpGateway({
    phase: "exploration",
    actorRole: ActorRole.EXECUTOR,
    conversation: {
      userText: "Issue #19 と #22 の経緯を振り返りたい"
    },
    policyInput: {
      actionType: ActionType.READ,
      mode: "read_only",
      repositoryInput: "vtdd",
      aliasRegistry: registry,
    targetConfirmed: true,
      runtimeTruth: { runtimeAvailable: false, safeFallbackChosen: true },
      consent: {
        grantedCategories: [ConsentCategory.READ]
      },
      issueTraceable: false
    }
  });

  assert.equal(result.allowed, true);
  assert.equal(result.conversationAssist.detectedIntent, "recall_context");
  assert.equal(result.conversationAssist.requiresConfirmation, true);
  assert.equal(
    result.conversationAssist.confirmationPrompt.includes("#19"),
    true
  );
  assert.equal(
    result.conversationAssist.confirmationPrompt.includes("#22"),
    true
  );
});

test("gateway returns execution continuity guidance for PR-reaching execution", () => {
  const result = runMvpGateway({
    phase: "execution",
    actorRole: ActorRole.BUTLER,
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace: validJudgmentTrace,
    policyInput: {
      actionType: ActionType.ISSUE_CREATE,
      mode: TaskMode.EXECUTION,
      repositoryInput: "vtdd",
      aliasRegistry: registry,
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
            reviewCommentsCount: 2,
            unresolvedReviewCommentsCount: 1,
            updatedSinceReview: true,
            reviewer: "gemini"
          }
        }
      },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: fullConsent,
      ...approvalContext,
      issueTraceable: true,
      go: true,
      passkey: false
    }
  });

  assert.equal(result.allowed, true);
  assert.equal(result.executionContinuity.codexGoal, "revise_pr");
  assert.equal(result.executionContinuity.reviewLoop.rerunReviewer, true);
  assert.equal(
    result.executionContinuity.nextSuggestedActions.includes("rerun_gemini_review"),
    true
  );
});

test("gateway surfaces blocked continuity when Butler-mediated handoff is required but missing", () => {
  const result = runMvpGateway({
    phase: "execution",
    actorRole: ActorRole.BUTLER,
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace: validJudgmentTrace,
    continuationContext: {
      requiresHandoff: true
    },
    policyInput: {
      actionType: ActionType.ISSUE_CREATE,
      mode: TaskMode.EXECUTION,
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
  assert.equal(result.blockedByRule, "butler_handoff_required_for_execution_transfer");
});
