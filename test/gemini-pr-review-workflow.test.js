import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/gemini-pr-review.yml", "utf8");
const fallbackWorkflow = fs.readFileSync(
  ".github/workflows/codex-pr-review-fallback.yml",
  "utf8"
);

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

test("Gemini review workflow still routes reviewer execution through the script entrypoint", () => {
  assert.equal(workflow.includes("name: Run Gemini PR review"), true);
  assert.equal(workflow.includes("GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}"), true);
  assert.equal(workflow.includes("GEMINI_REVIEW_MODEL: ${{ vars.GEMINI_REVIEW_MODEL }}"), true);
  assert.equal(workflow.includes("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}"), false);
  assert.equal(workflow.includes("contents: read"), true);
  assert.equal(workflow.includes("pull-requests: write"), false);
  assert.equal(workflow.includes("issues: write"), false);
});

test("Gemini review script defaults Codex fallback to Codex Cloud comment transport", () => {
  const script = fs.readFileSync("scripts/run-gemini-pr-review.mjs", "utf8");
  assert.equal(script.includes('deliveryMode: "codex_cloud_github_comment"'), true);
  assert.equal(script.includes("Requested Codex Cloud reviewer fallback"), true);
  assert.equal(script.includes("OPENAI_API_KEY"), false);
  assert.equal(script.includes("/actions/workflows/codex-pr-review-fallback.yml/dispatches"), false);
});

test("Codex fallback workflow runs reviewer-only Codex CLI and writes back via GitHub App token", () => {
  assert.equal(fallbackWorkflow.includes("name: codex-pr-review-fallback"), true);
  assert.equal(fallbackWorkflow.includes("pull_request_number"), true);
  assert.equal(fallbackWorkflow.includes("head_ref"), true);
  assert.equal(fallbackWorkflow.includes("base_ref"), true);
  assert.equal(fallbackWorkflow.includes("name: Checkout trusted reviewer source"), true);
  assert.equal(fallbackWorkflow.includes("path: trusted"), true);
  assert.equal(fallbackWorkflow.includes("name: Checkout target repository"), false);
  assert.equal(fallbackWorkflow.includes("path: target"), false);
  assert.equal(fallbackWorkflow.includes("persist-credentials: false"), true);
  assert.equal(fallbackWorkflow.includes("cache-dependency-path: trusted/package-lock.json"), true);
  assert.equal(fallbackWorkflow.includes("name: Install trusted reviewer dependencies"), true);
  assert.equal(fallbackWorkflow.includes("working-directory: trusted"), true);
  assert.equal(fallbackWorkflow.includes("run: npm ci"), true);
  assert.equal(
    fallbackWorkflow.indexOf("run: npm ci") <
      fallbackWorkflow.indexOf("run: node trusted/scripts/run-codex-pr-review-fallback.mjs"),
    true
  );
  assert.equal(fallbackWorkflow.includes("name: Install Codex CLI"), true);
  assert.equal(fallbackWorkflow.includes("npm install -g @openai/codex"), true);
  assert.equal(fallbackWorkflow.includes("name: Authenticate Codex CLI"), true);
  assert.equal(fallbackWorkflow.includes("printenv OPENAI_API_KEY | codex login --with-api-key"), true);
  assert.equal(
    fallbackWorkflow.indexOf("codex login --with-api-key") <
      fallbackWorkflow.indexOf("run: node trusted/scripts/run-codex-pr-review-fallback.mjs"),
    true
  );
  assert.equal(fallbackWorkflow.includes("CODEX_REVIEW_WORKTREE"), false);
  assert.equal(fallbackWorkflow.includes("run: node trusted/scripts/run-codex-pr-review-fallback.mjs"), true);
  assert.equal(fallbackWorkflow.includes("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}"), true);
  assert.equal(fallbackWorkflow.includes("GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}"), true);
});
