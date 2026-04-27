import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "open-issue-current-reality-audit.md"
);
const CLOSE_AUDIT_PATH = path.join(process.cwd(), "docs", "mvp", "close-readiness-audit.md");

test("open issue current-reality audit distinguishes mapped and historical open issues", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("`#4`"), true);
  assert.equal(doc.includes("`#42`"), true);
  assert.equal(doc.includes("`#43`"), true);
  assert.equal(doc.includes("`#44`"), true);
  assert.equal(doc.includes("`#45`"), true);
  assert.equal(doc.includes("`#46`"), true);
  assert.equal(doc.includes("`#15`"), true);
  assert.equal(doc.includes("`#26`"), true);
  assert.equal(doc.includes("`#52`"), true);
  assert.equal(doc.includes("`#55`"), true);
  assert.equal(doc.includes("`#57`"), true);
  assert.equal(doc.includes("`#74`"), true);
  assert.equal(doc.includes("`#9` and `#12`"), true);
  assert.equal(doc.includes("`#6`"), true);
  assert.equal(doc.includes("`#6` is directly evidenced through `E2E-19`"), true);
  assert.equal(doc.includes("Still Missing Direct Matrix Mapping"), false);
});

test("open issue current-reality audit records resolved stale readings", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("treating `#13` as a currently open issue"), true);
  assert.equal(doc.includes("treating `#1` as a currently open issue"), true);
  assert.equal(doc.includes("treating `#6` as the current parent authority"), true);
});

test("close-readiness audit points readers to open issue current-reality audit", () => {
  const doc = fs.readFileSync(CLOSE_AUDIT_PATH, "utf8");
  assert.equal(doc.includes("docs/mvp/open-issue-current-reality-audit.md"), true);
  assert.equal(doc.includes("`#4` current loop parent"), true);
  assert.equal(doc.includes("`#6` historical execution-slice issue"), true);
  assert.equal(doc.includes("`#13` parent execution anchor"), false);
  assert.equal(doc.includes("`#1` top-level VTDD V2 draft"), false);
});
