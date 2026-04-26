import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-18-gemini-pr-review-comment-writeback.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-18 evidence doc records live Gemini reviewer writeback and boundary tests", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("pull/28#issuecomment-4317590536"), true);
  assert.equal(doc.includes("actions/runs/24920443157/job/72980775527"), true);
  assert.equal(doc.includes("Trigger: pull_request_target:opened"), true);
  assert.equal(
    doc.includes("node --test test/gemini-pr-review-workflow.test.js test/gemini-pr-review.test.js"),
    true
  );
  assert.equal(doc.includes("VTDD_GITHUB_APP_ID"), true);
  assert.equal(doc.includes("VTDD_GITHUB_APP_PRIVATE_KEY"), true);
  assert.equal(doc.includes("uncontrolled comment loops"), true);
});

test("issue-to-e2e matrix references E2E-18 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-18 Gemini PR review comment writeback"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-18-gemini-pr-review-comment-writeback.md"), true);
  assert.equal(doc.includes("- Issues: `#9 #12`"), true);
});
