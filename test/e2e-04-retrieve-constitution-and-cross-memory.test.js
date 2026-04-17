import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "e2e", "e2e-04-retrieve-constitution-and-cross-memory.md");
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-04 evidence doc records retrieval happy and boundary runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("structured-first ordering"), true);
  assert.equal(doc.includes("issue-first priority"), true);
  assert.equal(doc.includes("provider-unavailable path returns explicit failure shape"), true);
  assert.equal(doc.includes("503-style unavailable response"), true);
  assert.equal(doc.includes("does not override structured-first ordering"), true);
});

test("matrix references E2E-04 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("docs/mvp/e2e/e2e-04-retrieve-constitution-and-cross-memory.md"), true);
});
