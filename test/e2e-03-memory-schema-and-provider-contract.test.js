import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "e2e", "e2e-03-memory-schema-and-provider-contract.md");
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-03 evidence doc records memory schema/provider happy and boundary runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("canonical memory record creation and validation succeeds"), true);
  assert.equal(doc.includes("Cloudflare adapter satisfies the canonical provider interface"), true);
  assert.equal(doc.includes("missing canonical provider methods are rejected"), true);
  assert.equal(doc.includes("malformed memory records are rejected by schema validation"), true);
  assert.equal(doc.includes("rejects invalid records before storage mutation"), true);
});

test("matrix references E2E-03 run evidence and current test evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("docs/mvp/e2e/e2e-03-memory-schema-and-provider-contract.md"), true);
  assert.equal(doc.includes("test/memory-provider.test.js"), true);
  assert.equal(doc.includes("test/cloudflare-provider.test.js"), true);
  assert.equal(doc.includes("test/memory-schema.test.js"), false);
});
