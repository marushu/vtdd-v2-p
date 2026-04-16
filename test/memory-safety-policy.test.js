import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "security", "memory-safety-policy.md");

test("memory safety policy defines store and do-not-store boundary", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("decision log"), true);
  assert.equal(doc.includes("proposal log"), true);
  assert.equal(doc.includes("alias registry"), true);
  assert.equal(doc.includes("approval log"), true);
  assert.equal(doc.includes("execution log"), true);
  assert.equal(doc.includes("tokens"), true);
  assert.equal(doc.includes("private keys"), true);
  assert.equal(doc.includes("raw secrets"), true);
  assert.equal(doc.includes("full casual chat transcripts"), true);
});

test("memory safety policy defines canonical separation and secret exclusion", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("shared canonical specification belongs in Git"), true);
  assert.equal(doc.includes("user-specific memory and operational traces belong in DB-backed memory"), true);
  assert.equal(doc.includes("runtime truth must not be replaced by memory recall"), true);
  assert.equal(doc.includes("Memory writes must be rejected"), true);
  assert.equal(doc.includes("selection happens before write"), true);
});
