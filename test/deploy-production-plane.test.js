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
      DEPLOY_DISPATCH_VERIFY_DELAY_MS: "0",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).includes("/actions/workflows/deploy-production.yml/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 123456,
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/123456",
                  status: "queued",
                  conclusion: null
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(null, { status: 204 });
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.deploy.status, "dispatched");
  assert.equal(result.deploy.runId, 123456);
  assert.equal(result.deploy.runUrl, "https://github.com/sample-org/vtdd-v2-p/actions/runs/123456");
  assert.equal(calls[0].url.includes("/actions/workflows/deploy-production.yml/dispatches"), true);
  assert.equal(calls[1].url.includes("/actions/workflows/deploy-production.yml/runs"), true);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.inputs.approval_phrase, "GO");
  assert.equal(body.inputs.approval_grant_id, "approval-deploy-123");
  assert.equal(body.inputs.runtime_url, "https://sample-user-vtdd.example.workers.dev");
});

test("deploy production plane blocks when dispatch cannot be observed as a workflow run", async () => {
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
      DEPLOY_DISPATCH_VERIFY_ATTEMPTS: "1",
      DEPLOY_DISPATCH_VERIFY_DELAY_MS: "0",
      GITHUB_API_FETCH: async (url) => {
        if (String(url).includes("/actions/workflows/deploy-production.yml/runs")) {
          return new Response(JSON.stringify({ workflow_runs: [] }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(null, { status: 204 });
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "deploy_dispatch_unverified");
  assert.equal(result.deploy.status, "dispatch_unverified");
  assert.equal(result.deploy.workflowFile, "deploy-production.yml");
  assert.equal(result.deploy.repository, "sample-org/vtdd-v2-p");
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
