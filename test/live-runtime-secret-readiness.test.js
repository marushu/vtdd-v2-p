import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const docPath = new URL("../docs/mvp/live-runtime-secret-readiness.md", import.meta.url);

test("live runtime secret readiness doc records confirmed ready and missing runtime secrets", async () => {
  const text = await readFile(docPath, "utf8");

  assert.equal(text.includes("CLOUDFLARE_API_TOKEN"), true);
  assert.equal(text.includes("CLOUDFLARE_ACCOUNT_ID"), true);
  assert.equal(text.includes("SETUP_WIZARD_PASSCODE"), true);
  assert.equal(text.includes("VTDD_GATEWAY_BEARER_TOKEN"), true);
  assert.equal(text.includes("GITHUB_APP_ID"), true);
  assert.equal(text.includes("GITHUB_APP_INSTALLATION_ID"), true);
  assert.equal(text.includes("GITHUB_APP_PRIVATE_KEY"), true);
});

test("live runtime secret readiness doc distinguishes ready vs not ready live-manual scope", async () => {
  const text = await readFile(docPath, "utf8");

  assert.equal(text.includes("### Ready"), true);
  assert.equal(text.includes("### Not Ready"), true);
  assert.equal(text.includes("fail-closed machine-auth boundary behavior"), true);
  assert.equal(text.includes("Custom GPT action execution through live gateway"), true);
  assert.equal(text.includes("GitHub App-backed runtime behavior"), true);
});
