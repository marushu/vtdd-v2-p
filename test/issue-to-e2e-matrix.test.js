import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("issue-to-e2e matrix defines all canonical E2E tracks", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");

  for (const id of [
    "E2E-00",
    "E2E-01",
    "E2E-02",
    "E2E-03",
    "E2E-04",
    "E2E-05",
    "E2E-06",
    "E2E-07",
    "E2E-09",
    "E2E-10",
    "E2E-11",
    "E2E-12",
    "E2E-13",
    "E2E-14",
    "E2E-15",
    "E2E-16",
    "E2E-17",
    "E2E-18"
  ]) {
    assert.equal(doc.includes(`## ${id}`), true);
  }
});

test("issue-to-e2e matrix records happy path, boundary path, evidence, and updated close-reading status", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("- Happy path:"), true);
  assert.equal(doc.includes("- Boundary path:"), true);
  assert.equal(doc.includes("- Implementation evidence:"), true);
  assert.equal(doc.includes("- Test evidence:"), true);
  assert.equal(doc.includes("- Run evidence:"), true);
  assert.equal(doc.includes("- Status:"), true);
  assert.equal(doc.includes("docs/mvp/live-verified-contract.md"), true);
  assert.equal(doc.includes("docs_only"), true);
  assert.equal(doc.includes("code_only"), true);
  assert.equal(doc.includes("surface_connected"), true);
  assert.equal(doc.includes("live_verified"), true);
  assert.equal(doc.includes("e2e_evidenced_pending_human_closure"), true);
  assert.equal(doc.includes("implemented_pending_e2e"), true);
  assert.equal(doc.includes("partial"), true);
  assert.equal(doc.includes("Repository completion status: `partial`"), true);
  assert.equal(doc.includes("mapped E2E evidence now exists across the active main-line matrix"), true);
});
