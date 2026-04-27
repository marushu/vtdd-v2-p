import test from "node:test";
import assert from "node:assert/strict";
import { executeDeployProductionPlane } from "../src/core/index.js";

test("deploy production plane dispatches governed workflow with GO + passkey inputs", async () => {
  const calls = [];
  const result = await executeDeployProductionPlane({
    repository: "sample-org/vtdd-v2-p",
    runtimeUrl: "https://sample-user-vtdd.example.workers.dev",
    approvalPhrase: "GO",
    approvalGrantId: "approval-deploy-123",
    approvalGrant: {
      approvalId: "approval-deploy-123",
      verified: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "deploy_production",
        highRiskKind: "deploy_production",
        repositoryInput: "sample-org/vtdd-v2-p"
      }
    },
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_deploy",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(null, { status: 204 });
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.deploy.status, "dispatched");
  assert.equal(calls[0].url.includes("/actions/workflows/deploy-production.yml/dispatches"), true);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.inputs.approval_phrase, "GO");
  assert.equal(body.inputs.approval_grant_id, "approval-deploy-123");
  assert.equal(body.inputs.runtime_url, "https://sample-user-vtdd.example.workers.dev");
});

test("deploy production plane blocks missing GO + passkey inputs", async () => {
  const result = await executeDeployProductionPlane({
    repository: "sample-org/vtdd-v2-p",
    runtimeUrl: "",
    approvalPhrase: "NO",
    approvalGrantId: "",
    approvalGrant: null,
    env: {}
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "deploy_request_invalid");
  assert.equal(result.issues.includes("runtimeUrl is required"), true);
  assert.equal(result.issues.includes("approvalPhrase must be GO"), true);
  assert.equal(result.issues.includes("real approvalGrant is required for deploy_production"), true);
});

test("deploy production plane returns explicit unavailable category when deploy credentials are missing", async () => {
  const result = await executeDeployProductionPlane({
    repository: "sample-org/vtdd-v2-p",
    runtimeUrl: "https://sample-user-vtdd.example.workers.dev",
    approvalPhrase: "GO",
    approvalGrantId: "approval-deploy-123",
    approvalGrant: {
      approvalId: "approval-deploy-123",
      verified: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "deploy_production",
        highRiskKind: "deploy_production",
        repositoryInput: "sample-org/vtdd-v2-p"
      }
    },
    env: {}
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "deploy_unavailable");
  assert.equal(result.reason.includes("installation token"), true);
});
