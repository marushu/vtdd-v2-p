import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "close-readiness-audit.md");

test("close-readiness audit distinguishes close-ready from auto-closed", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("It does not close any Issue automatically"), true);
  assert.equal(doc.includes("human-gated" ) || doc.includes("Human judgment is still required"), true);
  assert.equal(doc.includes("docs/mvp/open-issue-current-reality-audit.md"), true);
  assert.equal(doc.includes("`#4` is the current parent contract for the Butler-Codex-Gemini revision loop"), true);
  assert.equal(doc.includes("`#6` remains a historical execution-slice issue"), true);
  assert.equal(doc.includes("Its execution-spine behavior is already directly evidenced through `E2E-19`."), true);
  assert.equal(doc.includes("`#13` parent execution anchor"), false);
  assert.equal(doc.includes("`#1` top-level VTDD V2 draft"), false);
});
