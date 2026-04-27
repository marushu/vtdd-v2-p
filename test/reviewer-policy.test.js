import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "security", "reviewer-policy.md");

test("reviewer policy defines Gemini initial choice and Antigravity emergency fallback", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("Gemini is the initial reviewer"), true);
  assert.equal(doc.includes("Antigravity may be used only as an emergency fallback"), true);
  assert.equal(doc.includes("learning-use is disabled"), true);
});

test("reviewer policy defines vendor-neutral contract and no execution authority", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("vendor-neutral contract"), true);
  assert.equal(doc.includes("PR diff"), true);
  assert.equal(doc.includes("context"), true);
  assert.equal(doc.includes("`critical_findings[]`"), true);
  assert.equal(doc.includes("`risks[]`"), true);
  assert.equal(doc.includes("`recommended_action`"), true);
  assert.equal(doc.includes("must not receive execution credentials"), true);
  assert.equal(doc.includes("does not hold merge authority"), true);
  assert.equal(doc.includes("does not hold deployment authority"), true);
});

test("reviewer policy does not overclaim no-manual Codex fallback", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("bot-authored `@codex review` request"), true);
  assert.equal(doc.includes("VTDD-managed workflow execution"), true);
  assert.equal(doc.includes("manual PR comment paste as the normal"), true);
});
