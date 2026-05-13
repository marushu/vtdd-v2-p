import { normalizeMentionLogin } from "./github-mention.js";
import { formatReviewerOperatorSummary } from "./reviewer-operator-summary.js";

export const CODEX_REVIEW_FALLBACK_MARKER = "<!-- vtdd:reviewer=codex-fallback -->";

export const CodexReviewFallbackStatus = Object.freeze({
  REQUESTED: "requested",
  COMPLETED: "completed",
  BLOCKED: "blocked"
});

export const CodexReviewFallbackBlocker = Object.freeze({
  CODEX_CONNECTOR_NOT_CONFIGURED: "codex_connector_not_configured"
});

export function formatCodexReviewFallbackComment(input = {}) {
  const trigger = normalizeText(input.trigger) || "unknown";
  const reason = normalizeText(input.reason) || "gemini_temporarily_unavailable";
  const status = normalizeFallbackStatus(input.status) || CodexReviewFallbackStatus.REQUESTED;
  const deliveryMode = normalizeText(input.deliveryMode) || "workflow_dispatch";
  const blocker = normalizeText(input.blocker);
  const recommendedAction = normalizeText(input.recommendedAction) || "manual_review";
  const criticalFindings = normalizeStringArray(input.criticalFindings);
  const risks = normalizeStringArray(input.risks);
  const rawReview = normalizeText(input.rawReview);
  const repository = normalizeText(input.repository);
  const pullRequestNumber = normalizeText(input.pullRequestNumber);
  const notificationMention = normalizeMentionLogin(input.notificationMention);

  const lines = [
    CODEX_REVIEW_FALLBACK_MARKER,
    ...(notificationMention ? [`@${notificationMention} VTDD milestone: ${formatFallbackMilestoneLabel(status, recommendedAction)}。`] : []),
    formatReviewerOperatorSummary({
      reviewer: "codex-fallback",
      status,
      recommendedAction,
      criticalFindings,
      risks,
      blocker
    }),
    "",
    "## VTDD Codex fallback レビュー",
    "",
    `- Status: \`${status}\``,
    `- Trigger: \`${trigger}\``,
    `- Reason: \`${reason}\``,
    `- Delivery mode: \`${deliveryMode}\``,
    "",
    ...buildStatusSection({
      status,
      deliveryMode,
      blocker,
      recommendedAction,
      criticalFindings,
      risks,
      rawReview,
      repository,
      pullRequestNumber
    }),
    "",
    "_Reviewer は批評専用です。修正 GO / merge GO + real passkey authority は人間が保持します。_"
  ];

  return lines.join("\n");
}

export function findExistingCodexReviewFallbackComment(comments = []) {
  return comments.find((comment) => containsMarker(comment?.body)) ?? null;
}

export function parseCodexReviewFallbackComment(comment = {}) {
  const body = normalizeText(typeof comment === "string" ? comment : comment?.body);
  if (!body || !containsMarker(body)) {
    return null;
  }

  const status =
    extractBacktickedValue(body, "Status") ||
    (body.includes("@codex review") ? CodexReviewFallbackStatus.REQUESTED : "");
  const recommendedAction = extractBacktickedValue(body, "Recommended action");
  const blocker = extractBacktickedValue(body, "Blocker");

  return {
    reviewer: "codex",
    status: normalizeFallbackStatus(status) || CodexReviewFallbackStatus.REQUESTED,
    blocking: determineBlocking({
      status,
      recommendedAction,
      blocker
    }),
    recommendedAction: recommendedAction || null,
    blocker: blocker || null,
    body
  };
}

export function parseCodexConnectorSetupComment(comment = {}) {
  const body = normalizeText(typeof comment === "string" ? comment : comment?.body);
  const author = normalizeText(comment?.author?.login ?? comment?.user?.login);
  if (!isCodexConnectorAuthor(author) || !isCodexConnectorSetupBody(body)) {
    return null;
  }

  return {
    reviewer: "codex",
    status: CodexReviewFallbackStatus.BLOCKED,
    blocking: true,
    recommendedAction: null,
    blocker: CodexReviewFallbackBlocker.CODEX_CONNECTOR_NOT_CONFIGURED,
    body
  };
}

function containsMarker(value) {
  return normalizeText(value).includes(CODEX_REVIEW_FALLBACK_MARKER);
}

function isCodexConnectorAuthor(value) {
  return normalizeText(value).toLowerCase() === "chatgpt-codex-connector";
}

function isCodexConnectorSetupBody(value) {
  const body = normalizeText(value).toLowerCase();
  return (
    body.includes("to use codex here") &&
    body.includes("connect to github")
  );
}

function buildStatusSection({
  status,
  deliveryMode,
  blocker,
  recommendedAction,
  criticalFindings,
  risks,
  rawReview,
  repository,
  pullRequestNumber
}) {
  if (status === CodexReviewFallbackStatus.BLOCKED) {
    return [
      `- Blocker: \`${blocker || "codex_fallback_unavailable"}\``,
      "",
      "Gemini reviewer は一時的に利用できません。現在の repository/runtime configuration では non-manual Codex fallback も開始できませんでした。",
      ...(rawReview
        ? ["", "### 生の失敗ログ", "", "```text", rawReview, "```"]
        : [])
    ];
  }

  if (status === CodexReviewFallbackStatus.COMPLETED) {
    return [
      `- Recommended action: \`${recommendedAction}\``,
      "",
      "### 重要指摘",
      ...formatListOrFallback(criticalFindings, "- 報告なし。"),
      "",
      "### 残リスク",
      ...formatListOrFallback(risks, "- 報告なし。"),
      ...(rawReview
        ? ["", "### 生の Codex 出力", "", "```text", rawReview, "```"]
        : [])
    ];
  }

  if (deliveryMode === "codex_cloud_github_comment") {
    return [
      "Gemini reviewer は一時的に利用できません。",
      "VTDD は GitHub comment transport 経由で Codex Cloud review を依頼しました。",
      "この依頼は `OPENAI_API_KEY` を使いません。Codex が completed reviewer marker を返すまでは request-state のみです。",
      "",
      "@codex review",
      "",
      "この pull request に対して、批評専用の VTDD reviewer pass を実行してください。",
      "owner-facing の重要指摘・残リスク・推奨理由は日本語で書いてください。",
      "`Recommended action` は `approve` / `request_changes` / `manual_review` の enum のまま、`vtdd:reviewer=codex-fallback` completed comment を返すか更新してください。",
      ...(repository || pullRequestNumber
        ? [
            "",
            "### Target",
            ...(repository ? [`- Repository: \`${repository}\``] : []),
            ...(pullRequestNumber ? [`- Pull request: #${pullRequestNumber}`] : [])
          ]
        : [])
    ];
  }

  return [
    "Gemini reviewer は一時的に利用できません。",
    "Non-manual Codex fallback review は VTDD-managed workflow execution 経由で dispatch 済みです。",
    ...(repository || pullRequestNumber
      ? [
          "",
          "### Target",
          ...(repository ? [`- Repository: \`${repository}\``] : []),
          ...(pullRequestNumber ? [`- Pull request: #${pullRequestNumber}`] : [])
        ]
      : [])
  ];
}

function determineBlocking({ status, recommendedAction, blocker }) {
  const normalizedStatus = normalizeFallbackStatus(status);
  if (normalizedStatus === CodexReviewFallbackStatus.BLOCKED) {
    return true;
  }
  if (normalizedStatus === CodexReviewFallbackStatus.REQUESTED) {
    return true;
  }
  if (blocker) {
    return true;
  }
  return normalizeText(recommendedAction) !== "approve";
}

function formatListOrFallback(values, fallbackLine) {
  if (!Array.isArray(values) || values.length === 0) {
    return [fallbackLine];
  }
  return values.map((value) => `- ${value}`);
}

function extractBacktickedValue(body, label) {
  const pattern = new RegExp(`- ${escapeRegExp(label)}: \\\`([^\\\`]+)\\\``);
  const match = body.match(pattern);
  return normalizeText(match?.[1]);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFallbackStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  return Object.values(CodexReviewFallbackStatus).includes(normalized) ? normalized : "";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(normalizeText).filter(Boolean);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function formatFallbackMilestoneLabel(status, recommendedAction) {
  if (status === CodexReviewFallbackStatus.REQUESTED) {
    return "review 未完了";
  }
  if (status === CodexReviewFallbackStatus.BLOCKED) {
    return "reviewer 実行 blocked";
  }
  if (recommendedAction === "request_changes") {
    return "review が変更を要求";
  }
  if (recommendedAction === "approve") {
    return "review 承認";
  }
  return "人間確認が必要";
}
