import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "mvp", "cloudflare-inventory-and-cleanup-audit.md");

test("cloudflare inventory audit records live worker exposure and unresolved inventory areas", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  assert.equal(doc.includes("worker name: `vtdd-v2-mvp`"), true);
  assert.equal(doc.includes("workers.dev account subdomain: `polished-tree-da7c`"), true);
  assert.equal(
    doc.includes("https://vtdd-v2-mvp.polished-tree-da7c.workers.dev/setup/wizard?repo=sample-org/vtdd-v2"),
    true
  );
  assert.equal(doc.includes("custom worker domains are not attached"), true);
  assert.equal(doc.includes("Cloudflare D1 API returned zero databases"), true);
  assert.equal(doc.includes("Cloudflare Vectorize API returned zero indexes"), true);
  assert.equal(doc.includes("Access applications"), true);
  assert.equal(doc.includes("current token could not read Access applications (`403 Forbidden`)"), true);
  assert.equal(doc.includes("current token could not read R2 buckets (`403 Forbidden`)"), true);
  assert.equal(doc.includes("This audit does not say the environment is clean."), true);
});
