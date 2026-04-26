import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-14-github-normal-write-plane.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-14 evidence doc records happy-path and boundary-path runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("node --test test/github-write-plane.test.js test/worker.test.js test/custom-gpt-setup-docs.test.js"), true);
  assert.equal(doc.includes("issue_comment_create"), true);
  assert.equal(doc.includes("branch_create"), true);
  assert.equal(doc.includes("pull_create"), true);
  assert.equal(doc.includes("unsupported high-risk operations such as `merge` are rejected"), true);
});

test("issue-to-e2e matrix references E2E-14 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-14 GitHub normal write plane"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-14-github-normal-write-plane.md"), true);
});
