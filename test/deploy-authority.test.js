import test from "node:test";
import assert from "node:assert/strict";
import {
  DeployAuthorityPath,
  evaluateDeployAuthorityStrategy
} from "../src/core/index.js";

test("deploy authority prefers one-shot GitHub Actions when protection availability is unknown", () => {
  const result = evaluateDeployAuthorityStrategy({});
  assert.equal(result.selectedPath, DeployAuthorityPath.ONE_SHOT_GITHUB_ACTIONS);
  assert.equal(result.fallbackPath, DeployAuthorityPath.DIRECT_PROVIDER);
  assert.equal(result.protectionAvailability.protectionAvailable, false);
});

test("deploy authority degrades to direct provider when protection APIs are forbidden", () => {
  const result = evaluateDeployAuthorityStrategy({
    repositoryVisibility: "private",
    branchProtectionApiStatus: "forbidden",
    rulesetsApiStatus: "forbidden"
  });
  assert.equal(result.selectedPath, DeployAuthorityPath.DIRECT_PROVIDER);
  assert.equal(
    result.relationshipToIssue37,
    "degrade_from_github_actions_mvp_path_to_provider_managed_path"
  );
});

test("deploy authority respects explicit VTDD-managed operator preference", () => {
  const result = evaluateDeployAuthorityStrategy({
    repositoryVisibility: "public",
    branchProtectionApiStatus: "available",
    rulesetsApiStatus: "available",
    operatorPreference: "vtdd_managed"
  });
  assert.equal(result.selectedPath, DeployAuthorityPath.DIRECT_PROVIDER);
  assert.equal(result.protectionAvailability.protectionAvailable, true);
});
