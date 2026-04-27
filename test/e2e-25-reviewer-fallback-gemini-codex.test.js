import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-25-reviewer-fallback-gemini-codex.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-25 evidence doc records reviewer fallback runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("`#74`"), true);
  assert.equal(doc.includes("request-state"), true);
  assert.equal(doc.includes("Gemini remains the primary reviewer"), true);
  assert.equal(doc.includes("does not overclaim"), true);
  assert.equal(doc.includes("request-state alone solves"), true);
  assert.equal(doc.includes("tracked by open Issue `#84`"), true);
});

test("issue-to-e2e matrix references E2E-25 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-25 Reviewer fallback request-state preservation"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-25-reviewer-fallback-gemini-codex.md"), true);
  assert.equal(doc.includes("- Issues: `#74`"), true);
});
