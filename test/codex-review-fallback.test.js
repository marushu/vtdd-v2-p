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
  assert.equal(body.includes("vtdd:reviewer-meta"), true);
  assert.equal(body.includes("- Status: `requested`"), true);
  assert.equal(body.includes("## Operator Summary"), true);
  assert.equal(body.includes("推奨: merge 非推奨（review 未完了）"), true);
  assert.equal(body.includes("merge blocker: はい"), true);
  assert.equal(body.includes("severity: 重要"), true);
  assert.equal(body.includes("- Delivery mode（実行経路）: `vps_codex_cli`"), true);
  assert.equal(body.includes("@codex review"), false);
  assert.equal(body.includes("VTDD 管理の workflow 実行"), true);
  assert.equal(body.includes("- Repository: `marushu/vtdd-v2-p`"), true);
  assert.equal(body.includes("- Pull request: #152"), true);
  assert.equal(body.includes("gemini_temporarily_unavailable"), true);
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

  assert.equal(body.split("\n")[2], "@marushu VTDD マイルストーン: review が変更要求を出しました。");
  assert.equal(body.split("\n")[3], "## Operator Summary");
  assert.equal(body.includes("推奨: merge 非推奨"), true);
  assert.equal(body.includes("severity: 重要"), true);
  assert.equal(body.includes("- Status: `completed`"), true);
  assert.equal(body.includes("- Recommended action: `request_changes`"), true);
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

test("parseCodexReviewFallbackComment prefers machine metadata over markdown labels", () => {
  const body = `${CODEX_REVIEW_FALLBACK_MARKER}
<!-- vtdd:reviewer-meta {"reviewer":"codex-fallback","status":"completed","recommendedAction":"approve"} -->
## VTDD Codex fallback レビュー

- 状態: \`requested\`
- 推奨アクション: \`manual_review\``;
  const parsed = parseCodexReviewFallbackComment(body);

  assert.equal(parsed.status, "completed");
  assert.equal(parsed.recommendedAction, "approve");
  assert.equal(parsed.blocking, false);
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
  assert.equal(body.includes("推奨: merge 非推奨（reviewer blocked）"), true);
  assert.equal(body.includes("severity: 致命的"), true);
  assert.equal(body.includes("- Blocker: `openai_quota_exceeded`"), true);
  assert.equal(body.includes("### Raw Failure"), true);
  assert.equal(body.includes("ERROR: Quota exceeded."), true);
});

test("fallback script reviews GitHub API diff without checking out untrusted PR code", () => {
  assert.equal(fallbackScript.includes("buildPullRequestDiff"), true);
  assert.equal(fallbackScript.includes("CODEX_FALLBACK_DIFF_CHARACTERS = 180000"), true);
  assert.equal(
    fallbackScript.includes("buildPullRequestDiff(files, { maxCharacters: CODEX_FALLBACK_DIFF_CHARACTERS })"),
    true
  );
  assert.equal(fallbackScript.includes("buildPullRequestReviewContext"), true);
  assert.equal(fallbackScript.includes("shell command の実行や filesystem の検査はしないでください。"), true);
  assert.equal(fallbackScript.includes("criticalFindings[] と risks[] の各説明文は日本語"), true);
  assert.equal(fallbackScript.includes("generated `worker.js` の diff は reviewer prompt では意図的に省略"), true);
  assert.equal(fallbackScript.includes("GitHub App token を mint"), true);
  assert.equal(fallbackScript.includes('["exec", "--skip-git-repo-check", "--ephemeral", "-"]'), true);
  assert.equal(fallbackScript.includes("buildCodexExecutionEnv(process.env)"), true);
  assert.equal(fallbackScript.includes("env: process.env"), false);
  assert.equal(fallbackScript.includes("githubFetchAll"), true);
  assert.equal(fallbackScript.includes("latestIssueComments"), true);
  assert.equal(fallbackScript.includes('rel="next"'), true);
  assert.equal(fallbackScript.includes('["exec", "review"'), false);
  assert.equal(fallbackScript.includes("CODEX_REVIEW_WORKTREE"), false);
});

test("fallback script records blocked marker comments for unavailable Codex review", () => {
  assert.equal(fallbackScript.includes("classifyCodexFallbackFailure"), true);
  assert.equal(fallbackScript.includes("upsertCodexFallbackComment"), true);
  assert.equal(fallbackScript.includes("openai_quota_exceeded"), true);
  assert.equal(fallbackScript.includes("openai_api_key_invalid_or_missing"), true);
  assert.equal(fallbackScript.includes('status: "blocked"'), true);
});
