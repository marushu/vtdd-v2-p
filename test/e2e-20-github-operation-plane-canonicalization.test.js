import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-20-github-operation-plane-canonicalization.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-20 evidence doc records full-scope GitHub operation plane runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(
    doc.includes(
      "node --test test/github-operation-plane.test.js test/github-read-plane.test.js test/github-write-plane.test.js test/github-high-risk-plane.test.js test/worker.test.js"
    ),
    true
  );
  assert.equal(doc.includes("explicitly prohibits capability narrowing"), true);
  assert.equal(doc.includes("read, normal write, and Butler-side high-risk GitHub paths"), true);
  assert.equal(doc.includes("merge and bounded issue close remain Butler-side authority actions"), true);
});

test("issue-to-e2e matrix references E2E-20 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-20 GitHub operation plane canonicalization"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-20-github-operation-plane-canonicalization.md"), true);
  assert.equal(doc.includes("- Issues: `#42`"), true);
});
