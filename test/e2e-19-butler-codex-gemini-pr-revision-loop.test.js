import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-19-butler-codex-gemini-pr-revision-loop.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-19 evidence doc records revision-loop happy and boundary runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(
    doc.includes(
      "node --test test/execution-continuity.test.js test/butler-review-synthesis.test.js test/mvp-gateway.test.js test/worker.test.js"
    ),
    true
  );
  assert.equal(doc.includes("`resume`"), true);
  assert.equal(doc.includes("`open_pr`"), true);
  assert.equal(doc.includes("`revise_pr`"), true);
  assert.equal(doc.includes("`apply_pr_feedback`"), true);
  assert.equal(doc.includes("`rerun_gemini_review`"), true);
  assert.equal(doc.includes("issue-traceable"), true);
  assert.equal(doc.includes("`GO + real passkey`"), true);
});

test("issue-to-e2e matrix references E2E-19 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-19 Butler-Codex-Gemini PR revision loop"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-19-butler-codex-gemini-pr-revision-loop.md"), true);
  assert.equal(doc.includes("- Issues: `#4`"), true);
});
