import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "e2e", "e2e-13-parent-readiness.md");
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-13 parent readiness doc records anchor established and human-gated still-open reading", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("parent anchor is established"), true);
  assert.equal(doc.includes("repository completion is still `partial / in-progress`"), true);
  assert.equal(doc.includes("mapped E2E run evidence now exists across the matrix"), true);
  assert.equal(doc.includes("must not be presented as complete until the human closure gate is satisfied"), true);
});

test("matrix references parent execution anchor readiness track", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-00 Parent execution anchor readiness"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-13-parent-readiness.md"), true);
  assert.equal(doc.includes("Issues: `#13`"), true);
});
