import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildGitHubAppSecretSyncPlan,
  executeGitHubAppSecretSync,
  loadGitHubAppSecretSource,
  validateGitHubAppSecretSyncApprovalGrant
} from "../src/core/index.js";

test("loadGitHubAppSecretSource reads app id and private key from existing env file", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-app-sync-"));
  const keyPath = path.join(tempDir, "app.pem");
  const envPath = path.join(tempDir, "load-env.sh");
  const tokenPath = path.join(tempDir, "gateway-token.txt");

  await fs.writeFile(
    keyPath,
    "-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----\n",
    "utf8"
  );
  await fs.writeFile(tokenPath, "test-bearer-token\n", "utf8");
  await fs.writeFile(
    envPath,
    [
      'export GITHUB_APP_ID="3467409"',
      'export GITHUB_APP_INSTALLATION_ID="126180737"',
      `export GITHUB_APP_PRIVATE_KEY_PATH="${keyPath}"`,
      `export VTDD_GATEWAY_BEARER_TOKEN_PATH="${tokenPath}"`
    ].join("\n"),
    "utf8"
  );

  const result = await loadGitHubAppSecretSource({ envPath });
  assert.equal(result.ok, true);
  assert.equal(result.source.appId, "3467409");
  assert.equal(result.source.installationId, "126180737");
  assert.equal(result.source.privateKey.includes("BEGIN PRIVATE KEY"), true);
  assert.equal(result.source.gatewayBearerToken, "test-bearer-token");
});

test("buildGitHubAppSecretSyncPlan targets actions secrets from source of truth", () => {
  const result = buildGitHubAppSecretSyncPlan({
    repo: "marushu/vtdd-v2-p",
    source: {
      appId: "3467409",
      privateKey: "-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----"
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.plan.secrets.map((secret) => secret.name),
    ["VTDD_GITHUB_APP_ID", "VTDD_GITHUB_APP_PRIVATE_KEY"]
  );
});

test("executeGitHubAppSecretSync calls runner for each target secret", async () => {
  const calls = [];
  const result = await executeGitHubAppSecretSync({
    repo: "marushu/vtdd-v2-p",
    source: {
      appId: "3467409",
      privateKey: "-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----"
    },
    runner: async (secret) => {
      calls.push(secret.name);
      return { ok: true, name: secret.name };
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["VTDD_GITHUB_APP_ID", "VTDD_GITHUB_APP_PRIVATE_KEY"]);
});

test("GitHub App secret sync approval grant must match repo and high-risk kind", () => {
  const ok = validateGitHubAppSecretSyncApprovalGrant({
    repo: "marushu/vtdd-v2-p",
    approvalGrant: {
      verified: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        repositoryInput: "marushu/vtdd-v2-p",
        highRiskKind: "github_app_secret_sync"
      }
    }
  });
  assert.equal(ok.ok, true);

  const bad = validateGitHubAppSecretSyncApprovalGrant({
    repo: "marushu/vtdd-v2-p",
    approvalGrant: {
      verified: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        repositoryInput: "marushu/vtdd-v2-p",
        highRiskKind: "deploy"
      }
    }
  });
  assert.equal(bad.ok, false);
});
