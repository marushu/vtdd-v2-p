import test from "node:test";
import assert from "node:assert/strict";
import {
  executeGitHubActionsVariableSync,
  validateGitHubActionsVariableSyncApprovalGrant
} from "../src/core/index.js";

function validApprovalGrant(variableName = "VTDD_DASHBOARD_VPS_MAINTENANCE_HOST") {
  return {
    approvalId: "approval-variable-123",
    verified: true,
    expiresAt: "2099-01-01T00:00:00.000Z",
    scope: {
      repositoryInput: "sample-org/vtdd-v2-p",
      highRiskKind: "github_actions_variable_sync",
      variableName
    }
  };
}

test("github actions variable sync creates approved Dashboard VPS host variable without echoing value", async () => {
  const calls = [];
  const result = await executeGitHubActionsVariableSync({
    repository: "sample-org/vtdd-v2-p",
    variableName: "VTDD_DASHBOARD_VPS_MAINTENANCE_HOST",
    variableValue: "x85-131-245-163",
    approvalGrant: validApprovalGrant("VTDD_DASHBOARD_VPS_MAINTENANCE_HOST"),
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_secret",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (init?.method === "GET") {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(null, { status: 201 });
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.variableSync.variableName, "VTDD_DASHBOARD_VPS_MAINTENANCE_HOST");
  assert.equal(result.variableSync.status, "created");
  assert.equal(JSON.stringify(result).includes("x85-131-245-163"), false);
  assert.equal(calls[1].url.endsWith("/actions/variables"), true);
  assert.equal(JSON.parse(calls[1].init.body).name, "VTDD_DASHBOARD_VPS_MAINTENANCE_HOST");
  assert.equal(JSON.parse(calls[1].init.body).value, "x85-131-245-163");
});

test("github actions variable sync updates approved Dashboard VPS workdir variable without echoing value", async () => {
  const calls = [];
  const result = await executeGitHubActionsVariableSync({
    repository: "sample-org/vtdd-v2-p",
    variableName: "VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR",
    variableValue: "/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p",
    approvalGrant: validApprovalGrant("VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR"),
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_secret",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (init?.method === "GET") {
          return new Response(JSON.stringify({ name: "VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR" }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(null, { status: 204 });
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.variableSync.variableName, "VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR");
  assert.equal(result.variableSync.status, "updated");
  assert.equal(JSON.stringify(result).includes("/home/vtdd-runner"), false);
  assert.equal(calls[1].url.endsWith("/actions/variables/VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR"), true);
  assert.equal(calls[1].init.method, "PATCH");
});

test("github actions variable sync blocks unsupported names and wrong passkey scope", async () => {
  const unsupported = await executeGitHubActionsVariableSync({
    repository: "sample-org/vtdd-v2-p",
    variableName: "UNRELATED_VARIABLE",
    variableValue: "value",
    approvalGrant: validApprovalGrant("VTDD_DASHBOARD_VPS_MAINTENANCE_HOST"),
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_secret"
    }
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error, "github_actions_variable_sync_request_invalid");
  assert.equal(
    unsupported.issues.includes(
      "variableName must be VTDD_DASHBOARD_VPS_MAINTENANCE_HOST or VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR"
    ),
    true
  );

  const wrongScope = validateGitHubActionsVariableSyncApprovalGrant({
    repository: "sample-org/vtdd-v2-p",
    approvalGrant: {
      ...validApprovalGrant("VTDD_DASHBOARD_VPS_MAINTENANCE_HOST"),
      scope: {
        repositoryInput: "sample-org/vtdd-v2-p",
        highRiskKind: "deploy_production",
        variableName: "VTDD_DASHBOARD_VPS_MAINTENANCE_HOST"
      }
    }
  });
  assert.equal(wrongScope.ok, false);
  assert.equal(
    wrongScope.issues.includes("approvalGrant scope.highRiskKind must be github_actions_variable_sync"),
    true
  );

  const wrongVariable = validateGitHubActionsVariableSyncApprovalGrant({
    repository: "sample-org/vtdd-v2-p",
    variableName: "VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR",
    approvalGrant: validApprovalGrant("VTDD_DASHBOARD_VPS_MAINTENANCE_HOST")
  });
  assert.equal(wrongVariable.ok, false);
  assert.equal(
    wrongVariable.issues.includes("approvalGrant scope.variableName must match target variableName"),
    true
  );
});

test("github actions variable sync does not write when variable read fails", async () => {
  const calls = [];
  const result = await executeGitHubActionsVariableSync({
    repository: "sample-org/vtdd-v2-p",
    variableName: "VTDD_DASHBOARD_VPS_MAINTENANCE_HOST",
    variableValue: "x85-131-245-163",
    approvalGrant: validApprovalGrant("VTDD_DASHBOARD_VPS_MAINTENANCE_HOST"),
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_secret",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify({ message: "token=secret-token x85-131-245-163" }), {
          status: 500,
          headers: { "content-type": "application/json" }
        });
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
  assert.equal(result.error, "github_actions_variable_sync_failed");
  assert.equal(result.reason.includes("secret-token"), false);
  assert.equal(result.reason.includes("x85-131-245-163"), false);
  assert.equal(calls.length, 1);
});
