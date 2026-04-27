import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-23-pr-body-guardrail.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-23 evidence doc records PR body guardrail runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(
    doc.includes(
      "node --test test/pr-body-guardrail.test.js test/remote-codex-workflow.test.js test/pr-template-model.test.js"
    ),
    true
  );
  assert.equal(doc.includes("helper renders all required guarded-policy headings"), true);
  assert.equal(doc.includes("validator accepts a helper-rendered PR body"), true);
  assert.equal(doc.includes("workflow uses the helper-generated `--body-file` path"), true);
  assert.equal(doc.includes("validation fails when required evidence markers are missing"), true);
});

test("issue-to-e2e matrix references E2E-23 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-23 PR body guardrail"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-23-pr-body-guardrail.md"), true);
  assert.equal(doc.includes("- Issues: `#57`"), true);
});
