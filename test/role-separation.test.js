import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "butler", "role-separation.md");

test("role separation doc defines Butler, Executor, and Reviewer responsibilities", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("### Butler"), true);
  assert.equal(doc.includes("### Executor"), true);
  assert.equal(doc.includes("### Reviewer"), true);
  assert.equal(doc.includes("structured next-step guidance"), true);
  assert.equal(doc.includes("code changes"), true);
  assert.equal(doc.includes("`critical_findings[]`"), true);
});

test("role separation doc defines handoff contracts and reviewer isolation", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("### Butler -> Executor"), true);
  assert.equal(doc.includes("### Executor -> Reviewer"), true);
  assert.equal(doc.includes("### Reviewer -> Butler"), true);
  assert.equal(doc.includes("Reviewer must not receive execution credentials"), true);
  assert.equal(doc.includes("Reviewer must not receive merge authority"), true);
  assert.equal(doc.includes("Reviewer must not receive deployment authority"), true);
});
