import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CODEX_REVIEW_FALLBACK_MARKER,
  CodexReviewFallbackBlocker,
  findExistingCodexReviewFallbackComment,
  formatCodexReviewFallbackComment,
  parseCodexConnectorSetupComment,
  parseCodexReviewFallbackComment
} from "../src/core/index.js";

const fallbackScript = fs.readFileSync("scripts/run-codex-pr-review-fallback.mjs", "utf8");

test("formatCodexReviewFallbackComment renders marker and requested fallback state", () => {
  const body = formatCodexReviewFallbackComment({
    status: "requested",
    trigger: "pull_request_target:synchronize",
    reason: "gemini_temporarily_unavailable",
    deliveryMode: "vps_codex_cli",
    repository: "marushu/vtdd-v2-p",
    pullRequestNumber: 152
  });

  assert.equal(body.includes(CODEX_REVIEW_FALLBACK_MARKER), true);
  assert.equal(body.includes("- Status: `requested`"), true);
  assert.equal(body.includes("## Operator Summary"), true);
  assert.equal(body.includes("推奨: merge 非推奨（review 未完了）"), true);
  assert.equal(body.includes("merge blocker: はい"), true);
  assert.equal(body.includes("severity: 重要"), true);
  assert.equal(body.includes("- Delivery mode: `vps_codex_cli`"), true);
  assert.equal(body.includes("@codex review"), false);
  assert.equal(body.includes("Non-manual Codex fallback review は VTDD-managed workflow execution 経由で dispatch 済みです。"), true);
  assert.equal(body.includes("- Repository: `marushu/vtdd-v2-p`"), true);
  assert.equal(body.includes("- Pull request: #152"), true);
  assert.equal(body.includes("gemini_temporarily_unavailable"), true);
  assert.equal(body.includes("Reviewer は批評専用です。"), true);
});

test("formatCodexReviewFallbackComment can render a short operator milestone mention", () => {
  const body = formatCodexReviewFallbackComment({
    status: "completed",
    trigger: "pull_request_target:synchronize",
    reason: "gemini_temporarily_unavailable",
    deliveryMode: "vps_codex_cli",
    recommendedAction: "request_changes",
    notificationMention: "marushu"
  });

  assert.equal(body.split("\n")[1], "@marushu VTDD milestone: review が変更を要求。");
  assert.equal(body.split("\n")[2], "## Operator Summary");
  assert.equal(body.includes("推奨: merge 非推奨"), true);
  assert.equal(body.includes("severity: 重要"), true);
  assert.equal(body.includes("- Status: `completed`"), true);
  assert.equal(body.includes("- Recommended action: `request_changes`"), true);
  assert.equal(body.includes("### 重要指摘"), true);
  assert.equal(body.includes("### 残リスク"), true);
});

test("findExistingCodexReviewFallbackComment locates prior fallback request", () => {
  const comment = findExistingCodexReviewFallbackComment([
    { id: 1, body: "ordinary comment" },
    { id: 2, body: `${CODEX_REVIEW_FALLBACK_MARKER}\n- Status: \`requested\`` }
  ]);

  assert.deepEqual(comment, {
    id: 2,
    body: `${CODEX_REVIEW_FALLBACK_MARKER}\n- Status: \`requested\``
  });
});

test("parseCodexReviewFallbackComment exposes requested fallback reviewer state", () => {
  const body = `${CODEX_REVIEW_FALLBACK_MARKER}
- Status: \`requested\``;
  const parsed = parseCodexReviewFallbackComment(body);

  assert.deepEqual(parsed, {
    reviewer: "codex",
    status: "requested",
    blocking: true,
    recommendedAction: null,
    blocker: null,
    body
  });
});

test("parseCodexReviewFallbackComment exposes completed fallback reviewer state", () => {
  const body = `${CODEX_REVIEW_FALLBACK_MARKER}
## VTDD Codex Reviewer Fallback Request

- Status: \`completed\`
- Recommended action: \`approve\``;
  const parsed = parseCodexReviewFallbackComment(body);

  assert.deepEqual(parsed, {
    reviewer: "codex",
    status: "completed",
    blocking: false,
    recommendedAction: "approve",
    blocker: null,
    body
  });
});

test("parseCodexReviewFallbackComment exposes blocked fallback reviewer state", () => {
  const body = `${CODEX_REVIEW_FALLBACK_MARKER}
## VTDD Codex Reviewer Fallback Request

- Status: \`blocked\`
- Blocker: \`openai_api_key_not_configured\``;
  const parsed = parseCodexReviewFallbackComment(body);

  assert.deepEqual(parsed, {
    reviewer: "codex",
    status: "blocked",
    blocking: true,
    recommendedAction: null,
    blocker: "openai_api_key_not_configured",
    body
  });
});

test("parseCodexConnectorSetupComment exposes connector setup blocker", () => {
  const body = "To use Codex here, [create a Codex account and connect to github](https://chatgpt.com/codex/cloud/settings/connectors).";
  const parsed = parseCodexConnectorSetupComment({
    author: { login: "chatgpt-codex-connector" },
    body
  });

  assert.deepEqual(parsed, {
    reviewer: "codex",
    status: "blocked",
    blocking: true,
    recommendedAction: null,
    blocker: CodexReviewFallbackBlocker.CODEX_CONNECTOR_NOT_CONFIGURED,
    body
  });
});

test("parseCodexConnectorSetupComment ignores untrusted setup-like comments", () => {
  const parsed = parseCodexConnectorSetupComment({
    author: { login: "random-user" },
    body: "To use Codex here, create a Codex account and connect to github."
  });

  assert.equal(parsed, null);
});

test("formatCodexReviewFallbackComment renders raw blocked failure details", () => {
  const body = formatCodexReviewFallbackComment({
    status: "blocked",
    trigger: "pull_request_target:synchronize",
    reason: "gemini_temporarily_unavailable",
    deliveryMode: "workflow_dispatch_codex_cli",
    blocker: "openai_quota_exceeded",
    rawReview: "ERROR: Quota exceeded. Check your plan and billing details."
  });

  assert.equal(body.includes("- Status: `blocked`"), true);
  assert.equal(body.includes("推奨: merge 非推奨（reviewer 実行 blocked）"), true);
  assert.equal(body.includes("severity: 致命的"), true);
  assert.equal(body.includes("- Blocker: `openai_quota_exceeded`"), true);
  assert.equal(body.includes("### 生の失敗ログ"), true);
  assert.equal(body.includes("ERROR: Quota exceeded."), true);
});

test("Codex fallback Cloud comment request is Japanese-first while preserving machine fields", () => {
  const body = formatCodexReviewFallbackComment({
    status: "requested",
    trigger: "pull_request_target:opened",
    deliveryMode: "codex_cloud_github_comment",
    repository: "marushu/vtdd-v2-p",
    pullRequestNumber: 316
  });

  assert.equal(body.includes("Gemini reviewer は一時的に利用できません。"), true);
  assert.equal(body.includes("owner-facing の重要指摘・残リスク・推奨理由は日本語で書いてください。"), true);
  assert.equal(body.includes("`Recommended action` は `approve` / `request_changes` / `manual_review` の enum のまま"), true);
  assert.equal(body.includes("@codex review"), true);
});

test("fallback script reviews GitHub API diff without checking out untrusted PR code", () => {
  assert.equal(fallbackScript.includes("buildPullRequestDiff"), true);
  assert.equal(fallbackScript.includes("buildPullRequestReviewContext"), true);
  assert.equal(fallbackScript.includes("Do not run shell commands or inspect the filesystem."), true);
  assert.equal(fallbackScript.includes("Japanese-first owner-facing prose"), true);
  assert.equal(fallbackScript.includes("重大 blocker は見つかりませんでした。"), true);
  assert.equal(fallbackScript.includes('["exec", "--model", model, "--skip-git-repo-check", "--ephemeral", "-"]'), true);
  assert.equal(fallbackScript.includes('const DEFAULT_CODEX_FALLBACK_REVIEW_MODEL = "gpt-5.4-mini";'), true);
  assert.equal(fallbackScript.includes("resolveCodexFallbackReviewModel(process.env)"), true);
  assert.equal(fallbackScript.includes("buildCodexExecutionEnv(process.env)"), true);
  assert.equal(fallbackScript.includes("env: process.env"), false);
  assert.equal(fallbackScript.includes("githubFetchAll"), true);
  assert.equal(fallbackScript.includes('rel="next"'), true);
  assert.equal(fallbackScript.includes('["exec", "review"'), false);
  assert.equal(fallbackScript.includes("CODEX_REVIEW_WORKTREE"), false);
});

test("fallback script records blocked marker comments for unavailable Codex review", () => {
  assert.equal(fallbackScript.includes("classifyCodexFallbackFailure"), true);
  assert.equal(fallbackScript.includes("createCodexFallbackComment"), true);
  assert.equal(fallbackScript.includes("openai_quota_exceeded"), true);
  assert.equal(fallbackScript.includes("openai_api_key_invalid_or_missing"), true);
  assert.equal(fallbackScript.includes("openai_model_unsupported"), true);
  assert.equal(fallbackScript.includes("model is not supported"), true);
  assert.equal(fallbackScript.includes('status: "blocked"'), true);
});

test("fallback script appends reviewer comments instead of updating prior markers", () => {
  assert.equal(fallbackScript.includes("findExistingCodexReviewFallbackComment(issueComments)"), true);
  assert.equal(fallbackScript.includes("shouldMentionCodexFallback"), true);
  assert.equal(fallbackScript.includes("method: \"PATCH\""), false);
  assert.equal(fallbackScript.includes("method: \"DELETE\""), false);
  assert.equal(fallbackScript.includes("/issues/${prNumber}/comments"), true);
  assert.equal(fallbackScript.includes("/issues/comments/"), false);
});
