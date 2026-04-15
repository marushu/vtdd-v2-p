import test from "node:test";
import assert from "node:assert/strict";
import {
  ActionType,
  ActorRole,
  CredentialTier,
  TaskMode,
  evaluateCredentialBoundary,
  evaluateExecutionPolicy,
  evaluateRoleBoundary,
  evaluateRuntimeTruthPrecondition,
  resolveRepositoryTarget
} from "../src/core/index.js";

const registry = [
  {
    canonicalRepo: "marushu/vtdd-v2",
    productName: "VTDD V2",
    aliases: ["vtdd", "tomio-core"]
  },
  {
    canonicalRepo: "marushu/hibou-piccola-bookkeeping",
    productName: "TOMIO",
    aliases: ["帳簿アプリ", "tomio"]
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

test("read-only mode can proceed safely even when repo is unresolved", () => {
  const resolved = resolveRepositoryTarget({
    input: "unknown-project",
    mode: TaskMode.READ_ONLY,
    aliasRegistry: registry
  });
  assert.equal(resolved.resolved, false);
  assert.equal(resolved.safeToProceedReadOnly, true);
});

test("execution mode blocks unresolved repository target", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    mode: TaskMode.EXECUTION,
    repositoryInput: "unknown-project",
    aliasRegistry: registry,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.blockedByRule, "unresolved_target_blocks_execution");
});

test("high-risk action requires GO + passkey", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.DEPLOY_PRODUCTION,
    mode: TaskMode.EXECUTION,
    repositoryInput: "tomio",
    aliasRegistry: registry,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: highRiskCredential,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, false);
  assert.equal(result.requiredApproval, "go_passkey");
});

test("execution blocks when issue traceability is missing", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    mode: TaskMode.EXECUTION,
    repositoryInput: "vtdd",
    aliasRegistry: registry,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
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
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, true);
  assert.equal(result.repository, "marushu/vtdd-v2");
});

test("execution blocks when constitution is not consulted", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    constitutionConsulted: false,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
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
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: false, safeFallbackChosen: false },
    credential: executeCredential,
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
    constitutionConsulted: true,
    runtimeTruth: {
      runtimeAvailable: true,
      runtimeState: { issueStatus: "open", prCount: 1 },
      memoryState: { issueStatus: "open", prCount: 2 }
    },
    credential: executeCredential,
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
    constitutionConsulted: true,
    runtimeTruth: {
      runtimeAvailable: true,
      observedAt: "2026-04-15T00:00:00Z",
      maxAgeMs: 30_000,
      nowMs: Date.parse("2026-04-15T00:01:00Z")
    },
    credential: executeCredential,
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
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
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
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: executeCredential,
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
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: { model: "personal_access_token", tier: CredentialTier.EXECUTE },
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
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: {
      model: "github_app",
      tier: CredentialTier.HIGH_RISK,
      shortLived: false,
      boundApprovalId: "approval-123"
    },
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
