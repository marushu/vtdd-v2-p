import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "butler", "review-protocol.md");

test("butler review protocol doc fixes constitution-first judgment order", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("1. Constitution"), true);
  assert.equal(doc.includes("2. Runtime Truth"), true);
  assert.equal(doc.includes("3. Issue / Proposal / Decision"), true);
  assert.equal(doc.includes("4. Current question / PR / state"), true);
  assert.equal(doc.includes("must not be reordered"), true);
});

test("butler review protocol doc defines exploration and execution duties", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("## Exploration Phase"), true);
  assert.equal(doc.includes("## Execution Phase"), true);
  assert.equal(doc.includes("no judgment without Constitution"), true);
  assert.equal(doc.includes("no execution judgment before runtime truth"), true);
  assert.equal(doc.includes("Human remains the final authority"), true);
});
