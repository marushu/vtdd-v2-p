import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "owner-closure-guide.md");

test("owner closure guide distinguishes #13 as strongest close candidate without auto-closing", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("`#13` is the strongest current close candidate"), true);
  assert.equal(doc.includes("It does not authorize automatic closure"), true);
  assert.equal(doc.includes("Close only if the owner agrees"), true);
  assert.equal(doc.includes("Keep open if any of these are still useful"), true);
});

test("owner closure guide keeps #1 and #6 as human judgment calls", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("`#6` is historical execution-transport context"), true);
  assert.equal(doc.includes("`#4` now holds that role"), true);
  assert.equal(doc.includes("`#1` is still the broadest top-level draft / umbrella reference"), true);
  assert.equal(doc.includes("This guide does not say any issue must be closed now"), true);
});
