import test from "node:test";
import assert from "node:assert/strict";
import {
  GitHubOwnerOperationStatus,
  explainGitHubOwnerOperation,
  listGitHubOwnerOperationInventory,
  validateGitHubOwnerOperationInventory
} from "../src/core/github-owner-operation-inventory.js";

const REQUIRED_GROUPS = [
  "issue",
  "pull_request",
  "branch",
  "workflow",
  "repository_settings",
  "permissions",
  "secrets",
  "release",
  "deployment"
];

test("owner operation inventory is queryable and validates required #244 fields", () => {
  const inventory = listGitHubOwnerOperationInventory();
  const validation = validateGitHubOwnerOperationInventory(inventory);

  assert.equal(validation.ok, true);
  assert.equal(validation.issues.length, 0);
  assert.equal(inventory.length >= REQUIRED_GROUPS.length, true);

  for (const group of REQUIRED_GROUPS) {
    assert.equal(
      inventory.some((entry) => entry.group === group),
      true,
      `${group} must stay in the owner operation inventory`
    );
  }

  for (const entry of inventory) {
    assert.equal(Boolean(entry.requiredGitHubAppPermission), true);
    assert.equal(Boolean(entry.requiredButlerActionSurface), true);
    assert.equal(Boolean(entry.requiredPasskeyOperatorBoundary), true);
    assert.equal(Boolean(entry.runtimeTruthVerificationMethod), true);
  }
});

test("unsupported owner operations always name a remediation issue", () => {
  const unsupported = listGitHubOwnerOperationInventory().filter(
    (entry) => entry.status === GitHubOwnerOperationStatus.UNSUPPORTED
  );

  assert.equal(unsupported.length > 0, true);
  for (const entry of unsupported) {
    assert.equal(entry.remediationIssue, "#244");
  }
});

test("Butler explainer reports supported, gated, unsupported, and intentionally blocked operations", () => {
  assert.equal(explainGitHubOwnerOperation("issue_create").status, GitHubOwnerOperationStatus.SUPPORTED);
  assert.equal(explainGitHubOwnerOperation("pull_merge").status, GitHubOwnerOperationStatus.GATED);
  assert.equal(
    explainGitHubOwnerOperation("releases_tags_packages").status,
    GitHubOwnerOperationStatus.UNSUPPORTED
  );
  assert.equal(
    explainGitHubOwnerOperation("repository_archive_delete_transfer_visibility_destructive_cleanup").status,
    GitHubOwnerOperationStatus.INTENTIONALLY_BLOCKED
  );

  const missing = explainGitHubOwnerOperation("unknown_owner_operation");
  assert.equal(missing.ok, false);
  assert.equal(missing.status, GitHubOwnerOperationStatus.UNSUPPORTED);
  assert.equal(missing.remediationIssue, "#244");
});
