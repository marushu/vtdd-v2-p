import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { bootstrapGatewayBearerVault } from "../scripts/bootstrap-gateway-bearer-vault.mjs";

test("gateway bearer vault bootstrap writes token file and manifest without printing token", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-gateway-vault-"));
  const manifestPath = path.join(root, "manifest.json");

  const result = await bootstrapGatewayBearerVault({
    manifestPath,
    env: {
      VTDD_GATEWAY_BEARER_TOKEN: "local-test-token"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.tokenPreview, "[redacted]");
  assert.equal(JSON.stringify(result).includes("local-test-token"), false);

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.gateway.bearerTokenPath, "gateway/bearer-token.txt");
  assert.equal(await fs.readFile(path.join(root, "gateway", "bearer-token.txt"), "utf8"), "local-test-token\n");
});

test("gateway bearer vault bootstrap preserves existing manifest sections", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-gateway-vault-"));
  const manifestPath = path.join(root, "manifest.json");
  await fs.writeFile(
    manifestPath,
    JSON.stringify({
      version: 1,
      githubApp: {
        appId: "123",
        installationId: "456",
        privateKeyPath: "github-app/private-key.pem"
      }
    }),
    "utf8"
  );

  await bootstrapGatewayBearerVault({
    manifestPath,
    stdinText: "stdin-token",
    tokenStdin: true,
    tokenPath: "gateway/custom-token.txt"
  });

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(manifest.githubApp.appId, "123");
  assert.equal(manifest.gateway.bearerTokenPath, "gateway/custom-token.txt");
  assert.equal(await fs.readFile(path.join(root, "gateway", "custom-token.txt"), "utf8"), "stdin-token\n");
});

test("gateway bearer vault bootstrap dry-run does not write files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-gateway-vault-"));
  const manifestPath = path.join(root, "manifest.json");

  const result = await bootstrapGatewayBearerVault({
    manifestPath,
    dryRun: true,
    generate: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  await assert.rejects(() => fs.readFile(manifestPath, "utf8"), /ENOENT/);
});

test("gateway bearer vault bootstrap rejects absolute token paths", async () => {
  await assert.rejects(
    () =>
      bootstrapGatewayBearerVault({
        manifestPath: path.join(os.tmpdir(), "manifest.json"),
        tokenPath: path.join(os.tmpdir(), "token.txt"),
        generate: true
      }),
    /token path must be relative/
  );
});

test("gateway bearer vault bootstrap requires an explicit token source", async () => {
  await assert.rejects(
    () =>
      bootstrapGatewayBearerVault({
        manifestPath: path.join(os.tmpdir(), "manifest.json"),
        env: {}
      }),
    /gateway bearer token source is required/
  );
});
