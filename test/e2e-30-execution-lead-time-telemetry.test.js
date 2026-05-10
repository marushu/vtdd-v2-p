import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-30-execution-lead-time-telemetry.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-30 evidence doc records Issue 260 lead-time telemetry coverage", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  assert.equal(doc.includes("Issue `#260`"), true);
  assert.equal(doc.includes("queued_at"), true);
  assert.equal(doc.includes("picked_up_at"), true);
  assert.equal(doc.includes("codex_started_at"), true);
  assert.equal(doc.includes("branch_pushed_at"), true);
  assert.equal(doc.includes("pr_created_at"), true);
  assert.equal(doc.includes("completed_at"), true);
  assert.equal(doc.includes("failed_at"), true);
  assert.equal(doc.includes("vtddExecutionProgress"), true);
  assert.equal(doc.includes("vtddVpsRunnerStatus"), true);
  assert.equal(doc.includes("GitHub comment runtime truth"), true);
  assert.equal(doc.includes("explicit `completed_at` is the total lead-time terminal timestamp"), true);
  assert.equal(doc.includes("not run in this revision"), true);
  assert.equal(doc.includes("reviewer objection is preserved"), true);
  assert.equal(doc.includes("must not be described as complete"), true);
});

test("issue-to-e2e matrix references E2E-30 without overclaiming live evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");

  assert.equal(doc.includes("## E2E-30 Execution lead-time telemetry"), true);
  assert.equal(doc.includes("- Issues: `#260`"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-30-execution-lead-time-telemetry.md"), true);
  assert.equal(doc.includes("- Status: `implemented_pending_e2e`"), true);
});
