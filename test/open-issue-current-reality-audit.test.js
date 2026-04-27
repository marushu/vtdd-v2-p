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
  assert.equal(doc.includes("`#80`"), true);
  assert.equal(doc.includes("`#82`"), true);
  assert.equal(doc.includes("`#84`"), true);
  assert.equal(doc.includes("`#6`"), true);
  assert.equal(doc.includes("`#6` is directly evidenced through `E2E-19`"), true);
  assert.equal(doc.includes("Still Missing Direct Matrix Mapping"), false);
});

test("open issue current-reality audit records resolved stale readings", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("treating `#13` as a currently open issue"), true);
  assert.equal(doc.includes("treating `#1` as a currently open issue"), true);
  assert.equal(doc.includes("treating `#6` as the current parent authority"), true);
  assert.equal(doc.includes("treating closed reviewer-fallback issue `#74` as proof that no-manual Codex"), true);
  assert.equal(doc.includes("fallback is already solved"), true);
});

test("close-readiness audit points readers to open issue current-reality audit", () => {
  const doc = fs.readFileSync(CLOSE_AUDIT_PATH, "utf8");
  assert.equal(doc.includes("docs/mvp/open-issue-current-reality-audit.md"), true);
  assert.equal(doc.includes("`#4` current loop parent"), true);
  assert.equal(doc.includes("`#6` historical execution-slice issue"), true);
  assert.equal(doc.includes("`#80` self-parity natural-language trigger improvement"), true);
  assert.equal(doc.includes("`#82`"), true);
  assert.equal(doc.includes("`#84`"), true);
});
