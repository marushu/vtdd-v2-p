import test from "node:test";
import assert from "node:assert/strict";
import { ActionType, TaskMode, evaluateExecutionPolicy, resolveRepositoryTarget } from "../src/core/index.js";

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
    issueTraceable: true,
    go: true,
    passkey: false
  });
  assert.equal(result.allowed, true);
  assert.equal(result.repository, "marushu/vtdd-v2");
});
