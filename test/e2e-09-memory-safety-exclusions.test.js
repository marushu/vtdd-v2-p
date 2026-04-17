import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "e2e", "e2e-09-memory-safety-exclusions.md");
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-09 evidence doc records memory safety happy/boundary runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("records are allowed when they do not contain sensitive material"), true);
  assert.equal(doc.includes("Git vs DB source-of-truth separation remains explicit"), true);
  assert.equal(doc.includes("private key material is blocked"), true);
  assert.equal(doc.includes("full casual transcript storage is not allowed by default"), true);
  assert.equal(doc.includes("rejected rather than silently persisted"), true);
});

test("matrix references E2E-09 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("docs/mvp/e2e/e2e-09-memory-safety-exclusions.md"), true);
});
