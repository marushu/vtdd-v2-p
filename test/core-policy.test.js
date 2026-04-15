import test from "node:test";
import assert from "node:assert/strict";
import {
  ActionType,
  ActorRole,
  TaskMode,
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

test("reviewer role cannot run build action", () => {
  const result = evaluateExecutionPolicy({
    actionType: ActionType.BUILD,
    actorRole: ActorRole.REVIEWER,
    mode: TaskMode.EXECUTION,
    repositoryInput: "VTDD V2",
    aliasRegistry: registry,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
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
