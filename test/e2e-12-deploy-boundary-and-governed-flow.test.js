import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "e2e", "e2e-12-deploy-boundary-and-governed-flow.md");
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-12 evidence doc records governed deploy happy and boundary runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("node --test test/production-deploy-path.test.js test/deploy-authority.test.js test/worker.test.js"), true);
  assert.equal(doc.includes("node --test test/guarded-semi-automation-mode.test.js test/deploy-authority-branching-doc.test.js test/worker.test.js"), true);
  assert.equal(doc.includes("degrades recommendation to direct provider path"), true);
  assert.equal(doc.includes("guarded absence blocks high-risk deploy/merge paths"), true);
  assert.equal(doc.includes("traceable in worker execution logs"), true);
});

test("matrix references E2E-12 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("docs/mvp/e2e/e2e-12-deploy-boundary-and-governed-flow.md"), true);
});
