import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "e2e", "e2e-06-policy-consent-approval-state-machine.md");
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-06 evidence doc records happy and boundary runs for policy stack", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("deterministic policy order allows execution only after earlier gates pass"), true);
  assert.equal(doc.includes("runtime stale/conflict paths are blocked"), true);
  assert.equal(doc.includes("missing approval phrase or invalid approval scope is blocked"), true);
  assert.equal(doc.includes("illegal or out-of-order workflow transitions are blocked"), true);
  assert.equal(doc.includes("invalid policy input is rejected in worker path"), true);
});

test("matrix references E2E-06 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("docs/mvp/e2e/e2e-06-policy-consent-approval-state-machine.md"), true);
});
