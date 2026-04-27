import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-22-github-read-plane.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-22 evidence doc records GitHub read plane runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(
    doc.includes(
      "node --test test/github-read-plane.test.js test/worker.test.js test/custom-gpt-setup-docs.test.js"
    ),
    true
  );
  assert.equal(doc.includes("repository listing executes through the GitHub App-backed read plane"), true);
  assert.equal(doc.includes("pull reviews, review comments, checks, workflow runs, and branch detail"), true);
  assert.equal(doc.includes("unsupported read resources are rejected"), true);
  assert.equal(doc.includes("missing required identifiers such as `pullNumber` are rejected"), true);
});

test("issue-to-e2e matrix references E2E-22 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-22 GitHub read plane"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-22-github-read-plane.md"), true);
  assert.equal(doc.includes("- Issues: `#46`"), true);
});
