import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "e2e", "e2e-01-canonical-docs-reference-integrity.md");
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-01 evidence doc records happy-path and boundary-path runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("node --test test/canonical-docs-restoration.test.js"), true);
  assert.equal(doc.includes("node --test test/constitution-schema.test.js"), true);
  assert.equal(doc.includes("all eight canonical docs exist in repo"), true);
  assert.equal(doc.includes("validation fails"), true);
});

test("issue-to-e2e matrix references E2E-01 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("- Run evidence:"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-01-canonical-docs-reference-integrity.md"), true);
});
