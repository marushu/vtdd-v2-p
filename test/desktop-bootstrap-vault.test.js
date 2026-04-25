import test from "node:test";
import assert from "node:assert/strict";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_VTDD_VAULT_MANIFEST_PATH,
  loadDesktopBootstrapVault
} from "../src/core/desktop-bootstrap-vault.js";

test("desktop bootstrap vault loads referenced root credential files", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-vault-"));
  const credentialsDir = path.join(tempDir, "credentials");
  await fs.mkdir(path.join(credentialsDir, "github-app"), { recursive: true });
  await fs.mkdir(path.join(credentialsDir, "cloudflare"), { recursive: true });
  await fs.mkdir(path.join(credentialsDir, "gateway"), { recursive: true });
  await fs.mkdir(path.join(credentialsDir, "reviewer"), { recursive: true });

  const keyPath = path.join(credentialsDir, "github-app", "private-key.pem");
  const cloudflareTokenPath = path.join(credentialsDir, "cloudflare", "api-token.txt");
  const gatewayTokenPath = path.join(credentialsDir, "gateway", "bearer-token.txt");
  const reviewerTokenPath = path.join(credentialsDir, "reviewer", "gemini-api-key.txt");
  const manifestPath = path.join(credentialsDir, "manifest.json");

  await fs.writeFile(keyPath, "-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----\n");
  await fs.writeFile(cloudflareTokenPath, "cf-token-example\n");
  await fs.writeFile(gatewayTokenPath, "gateway-token-example\n");
  await fs.writeFile(reviewerTokenPath, "gemini-token-example\n");
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
        cloudflare: {
          accountId: "account-123",
          apiTokenPath: "cloudflare/api-token.txt"
        },
        gateway: {
          bearerTokenPath: "gateway/bearer-token.txt"
        },
        reviewer: {
          geminiApiKeyPath: "reviewer/gemini-api-key.txt"
        }
      },
      null,
      2
    )
  );

  const result = await loadDesktopBootstrapVault({ manifestPath });
  assert.equal(result.ok, true);
  assert.equal(result.vault.manifestPath, manifestPath);
  assert.equal(result.vault.githubApp.appId, "3467409");
  assert.equal(result.vault.githubApp.installationId, "126180737");
  assert.equal(result.vault.cloudflare.accountId, "account-123");
  assert.equal(result.vault.cloudflare.apiToken, "cf-token-example");
  assert.equal(result.vault.gateway.bearerToken, "gateway-token-example");
  assert.equal(result.vault.reviewer.geminiApiKey, "gemini-token-example");
});

test("desktop bootstrap vault reports missing canonical manifest", async () => {
  const result = await loadDesktopBootstrapVault({
    manifestPath: path.join(os.tmpdir(), "vtdd-missing-manifest", "manifest.json")
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues[0].includes("desktop bootstrap vault manifest not found"), true);
});

test("desktop bootstrap vault constants point to ~/.vtdd by default", () => {
  assert.equal(DEFAULT_VTDD_VAULT_MANIFEST_PATH.endsWith(".vtdd/credentials/manifest.json"), true);
});

test("desktop bootstrap vault doc defines canonical path and desktop maintenance state", () => {
  const docPath = path.join(process.cwd(), "docs", "setup", "desktop-bootstrap-vault.md");
  const doc = fsSync.readFileSync(docPath, "utf8");

  assert.equal(doc.includes("~/.vtdd/credentials/manifest.json"), true);
  assert.equal(doc.includes("desktop maintenance required"), true);
  assert.equal(doc.includes("Short-lived execution credentials must not be stored here."), true);
});
