import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildCloudflareDeploySecretSyncPlan,
  executeCloudflareDeploySecretSync
} from "../src/core/index.js";

const validApprovalGrant = {
  verified: true,
  expiresAt: "2099-01-01T00:00:00.000Z",
  scope: {
    actionType: "deploy_production",
    highRiskKind: "deploy_production",
    repositoryInput: "marushu/vtdd-v2-p"
  }
};

test("cloudflare deploy secret sync plan targets Actions deploy secrets", () => {
  const result = buildCloudflareDeploySecretSyncPlan({
    repo: "marushu/vtdd-v2-p",
    source: {
      cloudflareApiToken: "cf-token-redacted",
      cloudflareAccountId: "account-123"
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.plan.secrets.map((secret) => secret.name),
    ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]
  );
});

test("cloudflare deploy secret sync plan fails without token source", () => {
  const result = buildCloudflareDeploySecretSyncPlan({
    repo: "marushu/vtdd-v2-p",
    source: {
      cloudflareAccountId: "account-123"
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.includes("source.cloudflareApiToken is required"), true);
});

test("cloudflare deploy secret sync requires deploy_production approval grant", async () => {
  const result = await executeCloudflareDeploySecretSync({
    repo: "marushu/vtdd-v2-p",
    source: {
      cloudflareApiToken: "cf-token-redacted",
      cloudflareAccountId: "account-123"
    },
    approvalGrant: {
      ...validApprovalGrant,
      scope: { ...validApprovalGrant.scope, highRiskKind: "github_app_secret_sync" }
    },
    runner: async () => ({ synced: true })
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.includes("approvalGrant scope.highRiskKind must be deploy_production"),
    true
  );
});

test("cloudflare deploy secret sync calls runner without exposing token", async () => {
  const calls = [];
  const result = await executeCloudflareDeploySecretSync({
    repo: "marushu/vtdd-v2-p",
    source: {
      cloudflareApiToken: "cf-token-redacted",
      cloudflareAccountId: "account-123"
    },
    approvalGrant: validApprovalGrant,
    runner: async (secret) => {
      calls.push(secret);
      return { name: secret.name, synced: true };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].name, "CLOUDFLARE_API_TOKEN");
  assert.equal(calls[0].value, "cf-token-redacted");
});

test("cloudflare deploy secret sync docs distinguish Worker and Actions secrets", () => {
  const doc = fs.readFileSync("docs/setup/cloudflare-deploy-secret-sync.md", "utf8");

  assert.equal(doc.includes("Worker secrets and GitHub Actions secrets are different"), true);
  assert.equal(doc.includes("does not make it available"), true);
  assert.equal(doc.includes("scripts/sync-cloudflare-actions-secrets.mjs"), true);
});
