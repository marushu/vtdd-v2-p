import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "e2e", "e2e-10-surface-and-role-separation.md");
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-10 evidence doc records role/surface happy and boundary runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("responsibilities remain structurally separated"), true);
  assert.equal(doc.includes("preserves the canonical judgment model"), true);
  assert.equal(doc.includes("reviewer has no execution authority"), true);
  assert.equal(doc.includes("invalid role/surface combinations are rejected"), true);
  assert.equal(doc.includes("judgment model override by surface is treated as a block"), true);
});

test("matrix references E2E-10 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("docs/mvp/e2e/e2e-10-surface-and-role-separation.md"), true);
});
