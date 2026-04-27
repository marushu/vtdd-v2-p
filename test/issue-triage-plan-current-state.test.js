import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "issue-triage-plan.md");

test("issue triage plan reflects current reading and deprecated boundary", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("`#13` has already been rewritten as the MVP execution anchor"), true);
  assert.equal(doc.includes("`#4` is the current parent contract for the Butler-Codex-Gemini loop"), true);
  assert.equal(doc.includes("`#6` has been closed as historical execution-slice context and must not be"), true);
  assert.equal(doc.includes("overall status is still `partial / in-progress`"), true);
  assert.equal(doc.includes("iPhone-friendly passkey"), true);
  assert.equal(doc.includes("(`#91`)"), true);
  assert.equal(doc.includes("`docs/mvp/issue-to-e2e-matrix.md`"), true);
});

test("issue triage plan no longer reads like pending issue-creation instructions", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("re-opening already triaged scope"), true);
  assert.equal(doc.includes("repository resolution safety was split out and implemented"), true);
  assert.equal(doc.includes("role separation was split out and implemented"), true);
  assert.equal(doc.includes("`#4` for current Butler-Codex-Gemini loop parent authority"), true);
  assert.equal(doc.includes("`#80`, `#82`, and `#84`"), true);
  assert.equal(doc.includes("the current active follow-up is `#91`"), true);
  assert.equal(doc.includes("docs/mvp/open-issue-current-reality-audit.md"), true);
  assert.equal(doc.includes("active open Issues only for remaining bounded work"), true);
});
