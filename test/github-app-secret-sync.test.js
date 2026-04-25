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
} from "../src/core/github-app-secret-sync.js";

test("loadGitHubAppSecretSource reads app id and private key from desktop bootstrap vault", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-app-sync-"));
  const credentialsDir = path.join(tempDir, "credentials");
  await fs.mkdir(path.join(credentialsDir, "github-app"), { recursive: true });
  await fs.mkdir(path.join(credentialsDir, "gateway"), { recursive: true });
  const keyPath = path.join(credentialsDir, "github-app", "private-key.pem");
  const tokenPath = path.join(credentialsDir, "gateway", "bearer-token.txt");
  const manifestPath = path.join(credentialsDir, "manifest.json");

  await fs.writeFile(keyPath, "-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----\n", "utf8");
  await fs.writeFile(tokenPath, "test-bearer-token\n", "utf8");
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: 1,
        githubApp: {
          appId: "3467409",
          installationId: "126180737",
          privateKeyPath: "github-app/private-key.pem"
        },
        gateway: {
          bearerTokenPath: "gateway/bearer-token.txt"
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const result = await loadGitHubAppSecretSource({ manifestPath });
  assert.equal(result.ok, true);
  assert.equal(result.source.sourceType, "desktop_bootstrap_vault");
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
