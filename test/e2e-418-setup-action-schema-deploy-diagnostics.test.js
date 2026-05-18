import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const EVIDENCE_PATH = "docs/mvp/e2e/e2e-418-setup-action-schema-deploy-diagnostics.md";

test("E2E-418 evidence doc records setup diagnostics runs and boundaries", () => {
  const doc = fs.readFileSync(EVIDENCE_PATH, "utf8");

  assert.equal(doc.includes("Issue #418"), true);
  assert.equal(doc.includes("/setup/diagnostics"), true);
  assert.equal(doc.includes("/v2/retrieve/setup-diagnostics"), true);
  assert.equal(doc.includes("custom_gpt_action_schema_update_required"), true);
  assert.equal(doc.includes("action_auth_bearer_missing_or_unverified"), true);
  assert.equal(doc.includes("cloudflare_deploy_update_required"), true);
  assert.equal(doc.includes("editor_state_unreadable"), true);
  assert.equal(doc.includes("does not execute Cloudflare deploy"), true);
  assert.equal(doc.includes("mutate credentials"), true);
});
