import test from "node:test";
import assert from "node:assert/strict";
import {
  ActionType,
  ActorRole,
  CredentialTier,
  JudgmentStep,
  WorkflowEvent,
  WorkflowStage,
  runMvpGateway
} from "../src/core/index.js";

const registry = [
  {
    canonicalRepo: "marushu/vtdd-v2",
    productName: "VTDD V2",
    aliases: ["vtdd"]
  }
];

const validJudgmentTrace = [
  JudgmentStep.CONSTITUTION,
  JudgmentStep.RUNTIME_TRUTH,
  JudgmentStep.ISSUE_CONTEXT,
  JudgmentStep.CURRENT_QUERY
];

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
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
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
  assert.equal(result.repository, "marushu/vtdd-v2");
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
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
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
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
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
      constitutionConsulted: false,
      runtimeTruth: { runtimeAvailable: false, safeFallbackChosen: true },
      credential: { model: "github_app", tier: CredentialTier.READ },
      issueTraceable: false,
      go: false,
      passkey: false
    }
  });
  assert.equal(result.allowed, true);
  assert.equal(result.retrievalPlan.phase, "exploration");
  assert.equal(result.retrievalPlan.sources.includes("conversation"), true);
});
