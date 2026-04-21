import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SPEC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "day0-setup-wizard-shared-use-spec.md"
);

test("day0 shared-use spec requires user-owned runtime creation and forbids owner runtime dependency", () => {
  const doc = fs.readFileSync(SPEC_PATH, "utf8");

  assert.equal(doc.includes("user-owned Cloudflare runtime"), true);
  assert.equal(doc.includes("must not embed the owner's personal runtime URL"), true);
  assert.equal(doc.includes("Cloudflare runtime creation inside wizard"), true);
  assert.equal(doc.includes("shared VTDD GPT link only after wizard state is ready"), true);
  assert.equal(doc.includes("Codex handoff"), true);
  assert.equal(doc.includes("API Token flow"), true);
  assert.equal(doc.includes("must not expose the raw runtime URL by default"), true);
  assert.equal(doc.includes("The wizard must treat OAuth as deferred"), true);
  assert.equal(doc.includes("Workers Scripts Write"), true);
  assert.equal(doc.includes("token_pending"), true);
  assert.equal(doc.includes("reused_existing_runtime"), true);
  assert.equal(doc.includes("blocked_runtime_ambiguity"), true);
  assert.equal(doc.includes("server-controlled temporary setup state"), true);
  assert.equal(doc.includes("must not"), true);
  assert.equal(doc.includes("place the raw token in redirect targets"), true);
});
