import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-28-repository-nickname-context-resolution.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-28 evidence doc records repository nickname runtime and boundary runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("`#89`"), true);
  assert.equal(doc.includes("`公開VTDD`"), true);
  assert.equal(doc.includes("/v2/retrieve/repository-nicknames"), true);
  assert.equal(doc.includes("GitHub App repository index"), true);
  assert.equal(doc.includes("target repository nickname is ambiguous"), true);
  assert.equal(doc.includes("no default repository"), true);
});

test("issue-to-e2e matrix references E2E-28 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-28 Repository nickname context resolution"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-28-repository-nickname-context-resolution.md"), true);
  assert.equal(doc.includes("- Issues: `#89`"), true);
});
