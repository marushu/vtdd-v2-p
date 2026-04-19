import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "security",
  "setup-wizard-approval-bound-automation-path.md"
);

test("setup wizard approval-bound automation path defines wizard-complete target without generic secret ingestion", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("Issue #210"), true);
  assert.equal(doc.includes("manual bridging"), true);
  assert.equal(doc.includes("no generic secret terminal in setup wizard"), true);
  assert.equal(doc.includes("`GO + passkey` remains required for privileged bootstrap authority"), true);
  assert.equal(doc.includes("Cloudflare remains the system of record for Worker secret storage"), true);
});

test("setup wizard approval-bound automation path fixes the bounded automation candidate and future acceptance criteria", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("brokered one-time\nbootstrap session behind approval boundary"), true);
  assert.equal(doc.includes("GitHub App installation detection and binding"), true);
  assert.equal(doc.includes("approval-bound write of allowlisted setup-critical runtime material"), true);
  assert.equal(doc.includes("does not require manual copy/paste of setup-critical\n   IDs or secrets"), true);
  assert.equal(doc.includes("Current VTDD does not yet satisfy this target."), true);
});
