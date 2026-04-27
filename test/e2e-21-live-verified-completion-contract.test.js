import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-21-live-verified-completion-contract.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-21 evidence doc records live-verified contract runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(
    doc.includes("node --test test/live-verified-contract.test.js test/issue-to-e2e-matrix.test.js"),
    true
  );
  assert.equal(doc.includes("human-observable external evidence"), true);
  assert.equal(doc.includes("`docs_only`, `code_only`, `surface_connected`, and `live_verified`"), true);
  assert.equal(doc.includes("a file existing in the repository is explicitly insufficient"), true);
  assert.equal(doc.includes("a Codex task summary and an internal runtime flag are explicitly insufficient"), true);
});

test("issue-to-e2e matrix references E2E-21 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-21 Live verified completion contract"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-21-live-verified-completion-contract.md"), true);
  assert.equal(doc.includes("- Issues: `#44`"), true);
});
