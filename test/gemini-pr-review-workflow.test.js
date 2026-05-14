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
    workflow.includes("Skipping Gemini review because VTDD_GEMINI_REVIEWER_APP_ID / VTDD_GEMINI_REVIEWER_APP_PRIVATE_KEY are not configured."),
    true
  );
  assert.equal(workflow.includes("VTDD_GEMINI_REVIEWER_APP_ID"), true);
  assert.equal(workflow.includes("VTDD_GEMINI_REVIEWER_APP_PRIVATE_KEY"), true);
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
  assert.equal(workflow.includes("Skipping Gemini review for draft pull request."), false);
  assert.equal(workflow.includes("contents: read"), true);
  assert.equal(workflow.includes("pull-requests: write"), false);
  assert.equal(workflow.includes("issues: write"), false);
});

test("Gemini review workflow skips reviewer marker issue comments before dependency install", () => {
  assert.equal(workflow.includes("github.event_name != 'issue_comment'"), true);
  assert.equal(workflow.includes("!contains(github.event.comment.body, '<!-- vtdd:reviewer=')"), true);
  assert.equal(
    workflow.includes("contains(github.event.comment.body, '<!-- vtdd:reviewer-objection-resolution -->')"),
    true
  );
  assert.equal(
    workflow.indexOf("github.event_name != 'issue_comment'") <
      workflow.indexOf("name: Detect GitHub App secret availability"),
    true
  );
});

test("Gemini review script stops issue-comment reruns when reviewer already approved", () => {
  const script = fs.readFileSync("scripts/run-gemini-pr-review.mjs", "utf8");
  assert.equal(script.includes("isReviewerTerminalApproved"), true);
  assert.equal(script.includes("Skipping Gemini PR review: reviewer already approved current PR head"), true);
  assert.equal(script.includes("headSha: pullRequest?.head?.sha"), true);
});

test("Gemini review script defaults Codex fallback to VPS Codex CLI transport", () => {
  const script = fs.readFileSync("scripts/run-gemini-pr-review.mjs", "utf8");
  assert.equal(script.includes('deliveryMode: "vps_codex_cli"'), true);
  assert.equal(script.includes("Requested VPS Codex reviewer fallback"), true);
  assert.equal(script.includes("@codex review"), false);
  assert.equal(script.includes("OPENAI_API_KEY"), false);
  assert.equal(script.includes("/actions/workflows/codex-pr-review-fallback.yml/dispatches"), false);
});

test("Gemini review script appends reviewer comments instead of updating prior markers", () => {
  const script = fs.readFileSync("scripts/run-gemini-pr-review.mjs", "utf8");
  assert.equal(script.includes("findExistingGeminiReviewComment(issueComments)"), true);
  assert.equal(script.includes("shouldMentionGeminiReviewResult"), true);
  assert.equal(script.includes("method: \"PATCH\""), false);
  assert.equal(script.includes("method: \"DELETE\""), false);
  assert.equal(script.includes("/issues/${prNumber}/comments"), true);
  assert.equal(script.includes("/issues/comments/${existingReviewComment.id}"), false);
  assert.equal(script.includes("/issues/comments/${existingFallbackComment.id}"), false);
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

test("Codex fallback workflow uses the dedicated fallback reviewer GitHub App", () => {
  assert.equal(
    fallbackWorkflow.includes("name: Detect Codex fallback reviewer GitHub App secrets"),
    true
  );
  assert.equal(fallbackWorkflow.includes("VTDD_CODEX_FALLBACK_REVIEWER_APP_ID"), true);
  assert.equal(fallbackWorkflow.includes("VTDD_CODEX_FALLBACK_REVIEWER_APP_PRIVATE_KEY"), true);
  assert.equal(
    fallbackWorkflow.includes("Codex fallback reviewer requires VTDD_CODEX_FALLBACK_REVIEWER_APP_ID / VTDD_CODEX_FALLBACK_REVIEWER_APP_PRIVATE_KEY."),
    true
  );
  assert.equal(
    fallbackWorkflow.includes("name: Mint Codex fallback reviewer GitHub App token"),
    true
  );
});
