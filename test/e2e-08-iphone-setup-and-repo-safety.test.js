import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "e2e", "e2e-08-iphone-setup-and-repo-safety.md");
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-08 evidence doc records iPhone setup happy-path and boundary-path runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("node --test test/setup-wizard.test.js test/worker.test.js"), true);
  assert.equal(doc.includes("schema import URL is present"), true);
  assert.equal(doc.includes("full Instructions replacement guidance"), true);
  assert.equal(doc.includes("unresolved repository blocks execution"), true);
  assert.equal(doc.includes("does not expose secret credential input fields"), true);
});

test("matrix references E2E-08 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("docs/mvp/e2e/e2e-08-iphone-setup-and-repo-safety.md"), true);
});
