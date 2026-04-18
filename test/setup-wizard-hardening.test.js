import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "security", "setup-wizard-hardening.md");

test("setup wizard hardening doc separates bootstrap surface from internal api and requires fail-closed internal auth", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  assert.equal(doc.includes("`/setup/wizard` is a browser-facing bootstrap surface."), true);
  assert.equal(doc.includes("`/v2/gateway`"), true);
  assert.equal(doc.includes("`/v2/retrieve/constitution`"), true);
  assert.equal(doc.includes("Cloudflare Access OTP or equivalent short-friction user auth"), true);
  assert.equal(doc.includes("missing machine-auth runtime configuration must be treated as a blocking error"), true);
  assert.equal(doc.includes("This means `/v2/gateway` and `/v2/retrieve/*` should be fail-closed."), true);
  assert.equal(doc.includes("adding secret input fields to setup wizard"), true);
  assert.equal(doc.includes("setup wizard public exposure is not considered the desired steady state"), true);
});
