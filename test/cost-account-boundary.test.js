import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("README states API-key Codex runner is not the no-extra-cost default", () => {
  const readme = read("README.md");

  assert.equal(readme.includes("Cost And Account Boundary"), true);
  assert.equal(readme.includes("OPENAI_API_KEY"), true);
  assert.equal(readme.includes("explicit opt-in API-backed executor"), true);
  assert.equal(readme.includes("Executor transport is pluggable and user-owned."), true);
  assert.equal(readme.includes("not a shared hosted runner"), true);
  assert.equal(readme.includes("codex_cloud_cli_control_runner"), true);
  assert.equal(readme.includes("private GitHub Actions minutes"), true);
  assert.equal(readme.includes("vps_runner"), true);
  assert.equal(readme.includes("vtdd-v2-secret"), true);
});

test("remote Codex docs keep API-backed runner optional", () => {
  const doc = read("docs/butler/remote-codex-cli-executor.md");

  assert.equal(doc.includes("no-extra-API-cost default"), true);
  assert.equal(doc.includes("Executor transport is a pluggable registry."), true);
  assert.equal(doc.includes("not a shared hosted runner"), true);
  assert.equal(doc.includes("Default Codex Cloud GitHub Comment Runner"), true);
  assert.equal(doc.includes("This runner does not use `OPENAI_API_KEY`."), true);
  assert.equal(doc.includes("Codex Cloud CLI Control Runner"), true);
  assert.equal(doc.includes("private GitHub Actions minutes"), true);
  assert.equal(doc.includes("User-owned VPS Runner"), true);
  assert.equal(doc.includes("Queued/requested/comment-only evidence is not\nimplementation success."), true);
  assert.equal(doc.includes("optional `api_key_runner`"), true);
  assert.equal(doc.includes("Do not present it as the only VTDD remote executor path."), true);
});

test("reviewer policy requires explicit cost/account choice for API-key reviewers", () => {
  const doc = read("docs/security/reviewer-policy.md");

  assert.equal(doc.includes("explicit opt-in cost/account choice"), true);
  assert.equal(doc.includes("silently add a new paid API dependency"), true);
});
