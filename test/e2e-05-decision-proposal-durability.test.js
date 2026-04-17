import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "e2e", "e2e-05-decision-proposal-durability.md");
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-05 evidence doc records decision/proposal happy and boundary runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("persists decision log entries and returns decision references"), true);
  assert.equal(doc.includes("persists proposal log entries and returns proposal references"), true);
  assert.equal(doc.includes("invalid decision/proposal schema is blocked"), true);
  assert.equal(doc.includes("missing memory provider blocks persistence"), true);
  assert.equal(doc.includes("canonical field requirements"), true);
});

test("matrix references E2E-05 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("docs/mvp/e2e/e2e-05-decision-proposal-durability.md"), true);
});
