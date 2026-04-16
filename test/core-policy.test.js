import test from "node:test";
import assert from "node:assert/strict";
import {
  ActionType,
  ActorRole,
  AutonomyMode,
  ConsentCategory,
  CredentialTier,
  TaskMode,
  evaluateCredentialBoundary,
  evaluateExecutionPolicy,
  evaluateIssueTraceability,
  evaluateRoleBoundary,
  evaluateRuntimeTruthPrecondition,
  resolveRepositoryTarget
} from "../src/core/index.js";

const registry = [
  {
    canonicalRepo: "sample-org/vtdd-v2",
    productName: "VTDD V2",
    aliases: ["vtdd", "acct-core"]
  },
  {
    canonicalRepo: "sample-org/accounting-app",
    productName: "LEDGER_APP",
    aliases: ["帳簿アプリ", "ledger"]
  }
];

const executeCredential = {
  model: "github_app",
  tier: CredentialTier.EXECUTE
};

const highRiskCredential = {
  model: "github_app",
  tier: CredentialTier.HIGH_RISK,
  shortLived: true,
  boundApprovalId: "approval-123"
};

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
  approvalPhrase: "GO for scoped task",
  approvalScopeMatched: true
};

test("read-only mode can proceed safely even when repo is unresolved", () => {
  const resolved = resolveRepositoryTarget({
    input: "unknown-project",
    mode: TaskMode.READ_ONLY,
    aliasRegistry: registry
  });
  assert.equal(resolved.resolved, false);
  assert.equal(resolved.safeToProceedReadOnly, true);
});

test("repository resolution does not throw when alias registry is missing", () => {
  const readOnly = resolveRepositoryTarget({
    input: "vtdd",
    mode: TaskMode.READ_ONLY
  });
  assert.equal(readOnly.resolved, false);
  assert.equal(readOnly.safeToProceedReadOnly, true);

  const execution = resolveRepositoryTarget({
    input: "vtdd",
    mode: TaskMode.EXECUTION
  });
  assert.equal(execution.resolved, false);
  assert.equal(execution.safeToProceedReadOnly, false);
});

test("execution mode blocks unresolved repository target", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    mode: TaskMode.EXECUTION,
    repositoryInput: "unknown-project",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "unresolved_target_blocks_execution");
});

test("execution mode requires explicit confirmation when target is resolved via alias", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    mode: TaskMode.EXECUTION,
    repositoryInput: "ledger",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false,
    targetConfirmed: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "target_confirmation_required");
});

test("execution mode allows alias-resolved target after explicit confirmation", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    mode: TaskMode.EXECUTION,
    repositoryInput: "ledger",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false,
    targetConfirmed: true
  });
  assert.equal(result.allowed, true);
  assert.equal(result.repository, "sample-org/accounting-app");
});

test("high-risk action requires GO + passkey", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.DEPLOY_PRODUCTION,
    mode: TaskMode.EXECUTION,
    repositoryInput: "ledger",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: highRiskCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.requiredApproval, "go_passkey");
});

test("guarded absence mode blocks merge even with GO + passkey", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.MERGE,
    mode: TaskMode.EXECUTION,
    autonomyMode: AutonomyMode.GUARDED_ABSENCE,
    repositoryInput: "ledger",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: highRiskCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: true
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "guarded_absence_forbids_action");
});

test("guarded absence mode blocks ambiguous request", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    mode: TaskMode.EXECUTION,
    autonomyMode: AutonomyMode.GUARDED_ABSENCE,
    ambiguity: { ambiguousRequest: true },
    repositoryInput: "ledger",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "guarded_absence_blocks_ambiguous_request");
});

test("guarded absence mode blocks one-issue-many-pr violation when runtime truth provides count", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.PR_OPERATION,
    mode: TaskMode.EXECUTION,
    autonomyMode: AutonomyMode.GUARDED_ABSENCE,
    repositoryInput: "ledger",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: {
      runtimeAvailable: true,
      runtimeState: {
        issuePrCount: 2
      }
    },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "guarded_absence_requires_one_issue_one_pr");
});

test("guarded absence mode allows pr operation when boundaries are satisfied", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.PR_OPERATION,
    mode: TaskMode.EXECUTION,
    autonomyMode: AutonomyMode.GUARDED_ABSENCE,
    repositoryInput: "ledger",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true, runtimeState: { issuePrCount: 1 } },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, true);
  assert.equal(result.autonomyMode, "guarded_absence");
});

test("pr comment is allowed without GO when other gates pass", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.PR_COMMENT,
    mode: TaskMode.EXECUTION,
    repositoryInput: "ledger",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    approvalPhrase: "",
    approvalScopeMatched: false,
    issueTraceable: true,
    go: false,
    passkey: false
  });
  assert.equal(result.allowed, true);
});

test("pr review submit still requires GO", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.PR_REVIEW_SUBMIT,
    mode: TaskMode.EXECUTION,
    repositoryInput: "ledger",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: false,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "approval_boundary");
  assert.equal(result.requiredApproval, "go");
});

test("execution blocks when issue traceability is missing", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    mode: TaskMode.EXECUTION,
    repositoryInput: "vtdd",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: false,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "require_traceability_to_issue_sections");
});

test("execution allows build with resolved repo and GO", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, true);
  assert.equal(result.repository, "sample-org/vtdd-v2");
});

test("execution blocks when constitution is not consulted", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: false,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "butler_must_read_constitution_before_judgment");
});

test("execution blocks when runtime truth is unavailable and no safe fallback is set", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: false, safeFallbackChosen: false },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "runtime_truth_required_or_safe_fallback");
});

test("runtime-memory conflict requires reconcile", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: {
      runtimeAvailable: true,
      runtimeState: { issueStatus: "open", prCount: 1 },
      memoryState: { issueStatus: "open", prCount: 2 }
    },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "reconcile_when_runtime_conflicts_with_memory");
  assert.equal(result.reconcileRequired, true);
});

test("runtime truth precondition allows safe fallback when runtime is unavailable", () => {
  const result = evaluateRuntimeTruthPrecondition({
    mode: TaskMode.EXECUTION,
    runtimeAvailable: false,
    safeFallbackChosen: true
  });
  assert.equal(result.ok, true);
});

test("runtime truth precondition blocks stale runtime truth", () => {
  const result = evaluateRuntimeTruthPrecondition({
    mode: TaskMode.EXECUTION,
    runtimeAvailable: true,
    observedAt: "2026-04-15T00:00:00Z",
    maxAgeMs: 60_000,
    nowMs: Date.parse("2026-04-15T00:02:00Z")
  });
  assert.equal(result.ok, false);
  assert.equal(result.rule, "runtime_truth_stale_requires_reconfirm");
});

test("execution blocks when runtime truth is stale", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: {
      runtimeAvailable: true,
      observedAt: "2026-04-15T00:00:00Z",
      maxAgeMs: 30_000,
      nowMs: Date.parse("2026-04-15T00:01:00Z")
    },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "runtime_truth_stale_requires_reconfirm");
});

test("reviewer role cannot run build action", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    actorRole: ActorRole.REVIEWER,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "role_action_boundary");
});

test("butler role can create issue with GO", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.ISSUE_CREATE,
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, true);
});

test("unknown role is rejected", () => {
  const result = evaluateRoleBoundary({
    actorRole: "random-agent",
    actionType: ActionType.READ
  });
  assert.equal(result.ok, false);
  assert.equal(result.rule, "unknown_actor_role");
});

test("execution blocks when credential model is not github_app", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: { model: "personal_access_token", tier: CredentialTier.EXECUTE },
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "github_app_credential_required");
});

test("high-risk action blocks when credential is not short-lived", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.DEPLOY_PRODUCTION,
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: {
      model: "github_app",
      tier: CredentialTier.HIGH_RISK,
      shortLived: false,
      boundApprovalId: "approval-123"
    },
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: true
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "short_lived_credential_required_for_high_risk");
});

test("credential boundary helper rejects always-on destructive credential", () => {
  const result = evaluateCredentialBoundary({
    actionType: ActionType.DESTRUCTIVE,
    credential: {
      model: "github_app",
      tier: CredentialTier.HIGH_RISK,
      shortLived: true,
      boundApprovalId: "approval-123",
      destructiveAlwaysOn: true
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.rule, "no_permanent_destructive_credentials");
});

test("execution blocks when required consent category is missing", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.DESTRUCTIVE,
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: {
      model: "github_app",
      tier: CredentialTier.HIGH_RISK,
      shortLived: true,
      boundApprovalId: "approval-123"
    },
    consent: {
      grantedCategories: [ConsentCategory.READ, ConsentCategory.EXECUTE]
    },
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: true
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "consent_boundary");
});

test("execution blocks when approval phrase is missing", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    approvalPhrase: "",
    approvalScopeMatched: true,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "approval_boundary");
});

test("execution blocks when approval scope does not match", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    approvalPhrase: "GO for another scope",
    approvalScopeMatched: false,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "approval_boundary");
});

test("issue traceability helper blocks empty structured references", () => {
  const result = evaluateIssueTraceability({
    mode: TaskMode.EXECUTION,
    traceability: {
      intentRefs: [],
      successCriteriaRefs: [],
      nonGoalRefs: []
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.rule, "require_traceability_to_issue_sections");
});

test("execution blocks out-of-scope implementation when not proposal-only", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceability: {
      intentRefs: ["Intent-1"],
      outOfScopeChanges: ["Refactor unrelated module"],
      outOfScopeProposedOnly: false
    },
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "no_out_of_scope_implementation");
});

test("execution allows out-of-scope note when proposal-only", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceability: {
      intentRefs: ["Intent-1"],
      outOfScopeChanges: ["Potential cleanup idea"],
      outOfScopeProposedOnly: true
    },
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, true);
});

test("policy order is deterministic: role boundary blocks before constitution check", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    actorRole: ActorRole.REVIEWER,
    mode: TaskMode.EXECUTION,
    repositoryInput: "unknown-project",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: false,
    runtimeTruth: { runtimeAvailable: false, safeFallbackChosen: false },
    credential: { model: "personal_access_token", tier: CredentialTier.EXECUTE },
    consent: { grantedCategories: [] },
    approvalPhrase: "",
    approvalScopeMatched: false,
    issueTraceable: false,
    go: false,
    passkey: false
  });

  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "role_action_boundary");
});

test("policy order is deterministic: constitution check blocks before runtime and repository checks", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    repositoryInput: "unknown-project",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: false,
    runtimeTruth: { runtimeAvailable: false, safeFallbackChosen: false },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });

  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "butler_must_read_constitution_before_judgment");
});

test("policy order is deterministic: runtime check blocks before repository resolution", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    repositoryInput: "unknown-project",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: false, safeFallbackChosen: false },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });

  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "runtime_truth_required_or_safe_fallback");
});

test("policy order is deterministic: repository resolution blocks before traceability", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    repositoryInput: "unknown-project",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: false,
    go: true,
    passkey: false
  });

  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "unresolved_target_blocks_execution");
});

test("policy order is deterministic: traceability blocks before consent, approval, and credential", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.DEPLOY_PRODUCTION,
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    repositoryInput: "vtdd",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: {
      model: "personal_access_token",
      tier: CredentialTier.HIGH_RISK,
      shortLived: false
    },
    consent: {
      grantedCategories: [ConsentCategory.READ]
    },
    approvalPhrase: "",
    approvalScopeMatched: false,
    issueTraceable: false,
    go: false,
    passkey: false
  });

  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "require_traceability_to_issue_sections");
});

test("policy order is deterministic: consent blocks before approval and credential", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.DESTRUCTIVE,
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    repositoryInput: "vtdd",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: {
      model: "personal_access_token",
      tier: CredentialTier.HIGH_RISK,
      shortLived: false
    },
    consent: {
      grantedCategories: [ConsentCategory.READ, ConsentCategory.EXECUTE]
    },
    approvalPhrase: "",
    approvalScopeMatched: false,
    issueTraceable: true,
    go: false,
    passkey: false
  });

  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "consent_boundary");
});

test("policy order is deterministic: approval blocks before credential", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    repositoryInput: "vtdd",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: { model: "personal_access_token", tier: CredentialTier.EXECUTE },
    consent: fullConsent,
    approvalPhrase: "",
    approvalScopeMatched: false,
    issueTraceable: true,
    go: false,
    passkey: false
  });

  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "approval_boundary");
});

test("policy order is deterministic: credential check is reached only after earlier gates pass", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    repositoryInput: "vtdd",
    aliasRegistry: registry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: { model: "personal_access_token", tier: CredentialTier.EXECUTE },
    consent: fullConsent,
    ...approvalContext,
    issueTraceable: true,
    go: true,
    passkey: false
  });

  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "github_app_credential_required");
});
