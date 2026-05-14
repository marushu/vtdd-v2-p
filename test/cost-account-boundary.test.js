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

test("remote Codex docs define private repository VPS Actions-minimization boundary", () => {
  const doc = read("docs/butler/remote-codex-cli-executor.md");

  assert.equal(doc.includes("Private Repository Actions-Minimization Mode"), true);
  assert.equal(doc.includes("use `vps_runner` for Codex implementation, branch push, and PR creation"), true);
  assert.equal(
    doc.includes("do not use `remote-codex-executor.yml` for normal private-repository Codex"),
    true
  );
  assert.equal(doc.includes("does not eliminate Actions minutes"), true);
  assert.equal(doc.includes('"baseRefs": ["private"]'), true);
  assert.equal(doc.includes("owner/private-repo"), true);
  assert.equal(doc.includes("marushu/tomio"), false);
  assert.equal(doc.includes("marushu/hibou-piccola-bookkeeping"), false);
  assert.equal(doc.includes("Codex implementation moved off\nGitHub-hosted Actions"), true);
  assert.equal(doc.includes("Actions cost is zero"), true);
});

test("remote Codex docs require VPS handoff note as restart context", () => {
  const doc = read("docs/butler/remote-codex-cli-executor.md");

  assert.equal(doc.includes("preflight receipt must also include a `handoffNote`"), true);
  assert.equal(doc.includes("readable by Butler, mac Codex, and VPS Codex CLI"), true);
  assert.equal(doc.includes("restart context,\nnot a substitute for GitHub runtime truth"), true);
  assert.equal(doc.includes("RAG checkpoint candidates before handoff ends"), true);
  assert.equal(doc.includes("surface the mismatch rather than guessing"), true);
});

test("reviewer policy requires explicit cost/account choice for API-key reviewers", () => {
  const doc = read("docs/security/reviewer-policy.md");

  assert.equal(doc.includes("explicit opt-in cost/account choice"), true);
  assert.equal(doc.includes("silently add a new paid API dependency"), true);
});
