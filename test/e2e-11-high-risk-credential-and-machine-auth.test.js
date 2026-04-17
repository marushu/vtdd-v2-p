import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "e2e", "e2e-11-high-risk-credential-and-machine-auth.md");
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-11 evidence doc records credential and machine auth happy/boundary runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("minted installation token flow"), true);
  assert.equal(doc.includes("valid bearer-token machine auth callers"), true);
  assert.equal(doc.includes("valid Cloudflare Access service token header callers"), true);
  assert.equal(doc.includes("missing GitHub App configuration degrades safely"), true);
  assert.equal(doc.includes("invalid/static/missing auth headers are blocked"), true);
});

test("matrix references E2E-11 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("docs/mvp/e2e/e2e-11-high-risk-credential-and-machine-auth.md"), true);
});
