import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-14-setup-wizard-approval-bound-path.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-14 doc records approval-bound happy path and fail-closed boundary path", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("record a `GO + passkey` request"), true);
  assert.equal(doc.includes("same setup flow"), true);
  assert.equal(doc.includes("blocked_by_operator_prerequisites"), true);
  assert.equal(doc.includes("fail-closed recovery guidance"), true);
  assert.equal(doc.includes("Current repository reading remains `partial / in-progress`"), true);
});

test("matrix references E2E-14 setup wizard approval-bound path evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-14 Setup wizard approval-bound path"), true);
  assert.equal(doc.includes("Issues: `#207 #210`"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-14-setup-wizard-approval-bound-path.md"), true);
  assert.equal(doc.includes("- Status: `partial`"), true);
});
