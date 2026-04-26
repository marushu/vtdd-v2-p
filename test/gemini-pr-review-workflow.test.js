import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/gemini-pr-review.yml", "utf8");

test("Gemini review workflow skips when GitHub App secrets are not configured", () => {
  assert.equal(workflow.includes("name: Detect GitHub App secret availability"), true);
  assert.equal(
    workflow.includes("Skipping Gemini review because VTDD_GITHUB_APP_ID / VTDD_GITHUB_APP_PRIVATE_KEY are not configured."),
    true
  );
});

test("Gemini review workflow mints a GitHub App token and passes it to reviewer writeback", () => {
  assert.equal(workflow.includes("name: Mint GitHub App token"), true);
  assert.equal(workflow.includes("uses: actions/create-github-app-token@v1"), true);
  assert.equal(workflow.includes("token: ${{ steps.app-token.outputs.token }}"), true);
  assert.equal(workflow.includes("GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}"), true);
  assert.equal(workflow.includes("run: node scripts/run-gemini-pr-review.mjs"), true);
});
