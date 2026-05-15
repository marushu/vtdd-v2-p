import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCorsHeaders } from "../scripts/run-passkey-operator-helper.mjs";

const helperSource = fs.readFileSync("scripts/run-passkey-operator-helper.mjs", "utf8");

test("desktop helper bridge returns CORS headers for worker-hosted sync requests", () => {
  const headers = buildCorsHeaders("https://sample-user-vtdd.example.workers.dev");
  assert.equal(headers["access-control-allow-origin"], "https://sample-user-vtdd.example.workers.dev");
  assert.equal(headers["access-control-allow-methods"], "POST, GET, OPTIONS");
  assert.equal(headers["access-control-allow-headers"], "content-type");
});

test("desktop helper bridge passes role-specific GitHub App sync arguments", () => {
  assert.equal(helperSource.includes("--app-role"), true);
  assert.equal(helperSource.includes("--app-id"), true);
  assert.equal(helperSource.includes("--private-key-path"), true);
  assert.equal(helperSource.includes("githubAppRole"), true);
  assert.equal(helperSource.includes("github_app_role_not_served"), true);
});

test("desktop helper bridge exposes gateway bearer vault bootstrap without printing token", () => {
  assert.equal(helperSource.includes("/api/gateway-bearer-vault/bootstrap"), true);
  assert.equal(helperSource.includes("bootstrap-gateway-bearer-vault.mjs"), true);
  assert.equal(helperSource.includes("--token-stdin"), true);
  assert.equal(helperSource.includes("gateway_bearer_vault_bootstrap_failed"), true);
  assert.equal(helperSource.includes("gateway_bearer_vault_approval_invalid"), true);
  assert.equal(helperSource.includes("not_checked_initial_bootstrap_gateway_bearer_missing"), true);
  assert.equal(helperSource.includes("verified_runtime_approval_grant"), true);
  assert.equal(helperSource.includes("redactSecretText"), true);
});

test("desktop helper bridge does not proxy local passkey WebAuthn APIs", () => {
  assert.equal(helperSource.includes('url.pathname.startsWith("/api/approval/passkey/")'), false);
  assert.equal(helperSource.includes("function proxyPasskeyApi"), false);
  assert.equal(helperSource.includes("passkeyEnabled: false"), true);
  assert.equal(helperSource.includes("この local helper は passkey/WebAuthn を実行しません。"), true);
});
