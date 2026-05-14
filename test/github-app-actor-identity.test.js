import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const doc = fs.readFileSync("docs/security/github-app-actor-identity.md", "utf8");

test("GitHub App actor identity doc maps VTDD roles to visible actors and secrets", () => {
  assert.equal(doc.includes("Issue #351"), true);
  assert.equal(doc.includes("`VTDD Butler V2`"), true);
  assert.equal(doc.includes("`vtdd-codex`"), true);
  assert.equal(doc.includes("`VTDD mac Codex`"), true);
  assert.equal(doc.includes("`VTDD VPS Codex CLI`"), true);
  assert.equal(doc.includes("`VTDD Gemini Reviewer`"), true);
  assert.equal(doc.includes("`VTDD Codex Fallback Reviewer`"), true);
  assert.equal(doc.includes("`marushu`"), true);
  assert.equal(doc.includes("VTDD_MAC_CODEX_APP_ID"), true);
  assert.equal(doc.includes("VTDD_VPS_CODEX_CLI_APP_ID"), true);
  assert.equal(doc.includes("VTDD_GEMINI_REVIEWER_APP_ID"), true);
  assert.equal(doc.includes("VTDD_CODEX_FALLBACK_REVIEWER_APP_ID"), true);
});

test("GitHub App actor identity doc preserves authority and passkey boundaries", () => {
  assert.equal(doc.includes("Reviewer Apps are critique-only."), true);
  assert.equal(doc.includes("Executor Apps may push bounded branch changes"), true);
  assert.equal(doc.includes("`GO + passkey`"), true);
  assert.equal(doc.includes("Registering or updating those secrets is a high-risk external effect"), true);
});
