import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "day0-setup-wizard-scrub-checklist.md"
);

test("day0 scrub checklist treats owner-specific runtime identifiers as release blockers", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  assert.equal(doc.includes("owner-specific `workers.dev` runtime URLs"), true);
  assert.equal(doc.includes("release blocker for shared/public setup work"), true);
  assert.equal(doc.includes("no public page redirects into an owner-specific runtime"), true);
  assert.equal(doc.includes("Codex handoff"), true);
  assert.equal(doc.includes("Cloudflare runtime URL is treated as internal setup state"), true);
  assert.equal(doc.includes("Passing this checklist does not mean Day0 wizard is complete."), true);
});
