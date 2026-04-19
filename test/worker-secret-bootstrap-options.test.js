import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "security", "worker-secret-bootstrap-options.md");

test("worker secret bootstrap options define candidate comparison and evaluation axes", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("Option A: Cloudflare Dashboard secret entry on iPhone or browser"), true);
  assert.equal(doc.includes("Option B: Wrangler / CI-assisted secret provisioning"), true);
  assert.equal(doc.includes("Option C: Brokered one-time bootstrap session behind approval boundary"), true);
  assert.equal(doc.includes("secret never flows through chat or the default setup wizard read path"), true);
  assert.equal(doc.includes("iPhone-first is preserved or degraded explicitly"), true);
  assert.equal(doc.includes("private repo / solo operator use remains realistic"), true);
});

test("worker secret bootstrap options record adopted baseline and rejected paths", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("adopted now: Option A"), true);
  assert.equal(doc.includes("allowed optional operator path: Option B"), true);
  assert.equal(doc.includes("deferred for future bounded design: Option C"), true);
  assert.equal(doc.includes("That bounded design is now tracked by Issue #210."), true);
  assert.equal(doc.includes("adding generic or unauthenticated secret input fields to setup wizard"), true);
  assert.equal(doc.includes("asking the user to paste secrets into chat"), true);
  assert.equal(doc.includes("generic secret write API without narrow approval and audit controls"), true);
  assert.equal(doc.includes("Issue #181 introduces a bounded exception"), true);
});
