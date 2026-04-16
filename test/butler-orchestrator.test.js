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
