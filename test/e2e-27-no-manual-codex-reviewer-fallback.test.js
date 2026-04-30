import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-27-no-manual-codex-reviewer-fallback.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-27 evidence doc records no-manual Codex fallback runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("`#84`"), true);
  assert.equal(doc.includes("Codex Cloud"), true);
  assert.equal(doc.includes("deliveryMode=codex_cloud_github_comment"), true);
  assert.equal(doc.includes("does not require `OPENAI_API_KEY`"), true);
  assert.equal(doc.includes("requested"), true);
  assert.equal(doc.includes("completed"), true);
  assert.equal(doc.includes("blocked"), true);
  assert.equal(doc.includes("manual PR-comment paste"), true);
});

test("issue-to-e2e matrix references E2E-27 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-27 No-manual Codex reviewer fallback"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-27-no-manual-codex-reviewer-fallback.md"), true);
  assert.equal(doc.includes("- Issues: `#84`"), true);
});
