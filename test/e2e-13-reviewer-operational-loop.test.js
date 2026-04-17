import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "e2e", "e2e-13-reviewer-operational-loop.md");
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-13 evidence doc records reviewer happy and boundary runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("registry exposes the initial reviewer and can run a pluggable reviewer"), true);
  assert.equal(doc.includes("reviewer contract remains vendor-neutral and authority-limited"), true);
  assert.equal(doc.includes("invalid reviewer response schema is rejected"), true);
  assert.equal(doc.includes("invalid `recommendedAction` values are rejected"), true);
  assert.equal(doc.includes("forbid execution credentials, merge authority, and deployment authority"), true);
});

test("matrix references E2E-13 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("docs/mvp/e2e/e2e-13-reviewer-operational-loop.md"), true);
});
