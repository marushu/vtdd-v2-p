import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "e2e", "e2e-07-butler-constitution-first-judgment.md");
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-07 evidence doc records Butler happy/boundary runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("constitution-first judgment order is satisfied"), true);
  assert.equal(doc.includes("invalid judgment order is blocked"), true);
  assert.equal(doc.includes("unsupported surface/judgment-model override is blocked"), true);
  assert.equal(doc.includes("unresolved repository policy block propagates"), true);
});

test("matrix references E2E-07 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("docs/mvp/e2e/e2e-07-butler-constitution-first-judgment.md"), true);
});
