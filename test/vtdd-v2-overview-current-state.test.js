import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "vision", "vtdd-v2-overview.md");

test("overview reflects current reading and non-lock-in/iPhone-first direction", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("partial / in-progress"), true);
  assert.equal(doc.includes("iPhone-first, editor-optional development experience"), true);
  assert.equal(doc.includes("requires GitHub Pro as an MVP prerequisite"), true);
  assert.equal(doc.includes("GitHub App credential boundary"), true);
});

test("overview includes current operational direction boundaries", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("alias/context-first repository resolution"), true);
  assert.equal(doc.includes("no default repository"), true);
  assert.equal(doc.includes("unresolved target blocks execution"), true);
  assert.equal(doc.includes("high-risk actions require `GO + passkey`"), true);
  assert.equal(doc.includes("should not require pasting secrets into chat or setup answers"), true);
});
