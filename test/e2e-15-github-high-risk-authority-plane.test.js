import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-15-github-high-risk-authority-plane.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-15 evidence doc records happy-path and boundary-path runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(
    doc.includes(
      "node --test test/github-high-risk-plane.test.js test/worker.test.js test/custom-gpt-setup-docs.test.js"
    ),
    true
  );
  assert.equal(doc.includes("`pull_merge` executes through `/v2/action/github-authority`"), true);
  assert.equal(doc.includes("`merged: true`, merge `sha`, and `htmlUrl`"), true);
  assert.equal(doc.includes("bounded `issue_close` only proceeds after merged pull verification"), true);
  assert.equal(doc.includes("missing real approval grant is rejected"), true);
  assert.equal(
    doc.includes("bounded issue close is rejected with `bounded issue close requires a merged pull request`"),
    true
  );
});

test("issue-to-e2e matrix references E2E-15 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-15 GitHub high-risk authority plane"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-15-github-high-risk-authority-plane.md"), true);
});
