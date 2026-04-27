import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "owner-closure-guide.md");

test("owner closure guide treats #91 as the current active non-parent implementation issue", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("`#91` is the current active non-parent implementation issue"), true);
  assert.equal(doc.includes("It does not authorize automatic closure"), true);
  assert.equal(doc.includes("Close only if the owner agrees"), true);
  assert.equal(doc.includes("Keep open if any of these are still useful"), true);
  assert.equal(doc.includes("operator URL"), true);
});

test("owner closure guide keeps #4 as the human judgment parent issue", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("`#4` remains the live parent authority for the Butler-Codex-Gemini loop"), true);
  assert.equal(doc.includes("`#91` is active"), true);
  assert.equal(doc.includes("This guide does not say any issue must be closed now"), true);
});
