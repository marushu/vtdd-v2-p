import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "e2e", "e2e-02-issue-pr-template-discipline.md");
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-02 evidence doc records template-discipline happy and boundary runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("issue template contains required intent, success criteria"), true);
  assert.equal(doc.includes("PR template contains required intent, satisfied/unsatisfied criteria"), true);
  assert.equal(doc.includes("required-check workflow exists and includes the `guarded-policy` and `test` jobs"), true);
  assert.equal(doc.includes("PRs missing required evidence markers are meant to be blocked"), true);
});

test("matrix references E2E-02 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("docs/mvp/e2e/e2e-02-issue-pr-template-discipline.md"), true);
});
