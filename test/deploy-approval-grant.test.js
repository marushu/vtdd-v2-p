import test from "node:test";
import assert from "node:assert/strict";
import { validateDeployApprovalGrant } from "../src/core/index.js";

test("deploy approval grant requires deploy_production scoped real passkey grant", () => {
  const result = validateDeployApprovalGrant({
    repositoryInput: "marushu/vtdd-v2-p",
    approvalGrant: {
      verified: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "deploy_production",
        highRiskKind: "deploy_production",
        repositoryInput: "marushu/vtdd-v2-p"
      }
    }
  });

  assert.equal(result.ok, true);
});

test("deploy approval grant rejects mismatched scope", () => {
  const result = validateDeployApprovalGrant({
    repositoryInput: "marushu/vtdd-v2-p",
    approvalGrant: {
      verified: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        highRiskKind: "github_app_secret_sync",
        repositoryInput: "marushu/vtdd-v2-p"
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.includes("approvalGrant scope.actionType must be deploy_production"),
    true
  );
});
