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
    ...(notificationMention ? [`@${notificationMention} VTDD マイルストーン: ${formatFallbackMilestoneLabel(status, recommendedAction)}。`] : []),
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
    `- Trigger（契機）: \`${trigger}\``,
    `- Reason（理由）: \`${reason}\``,
    `- Delivery mode（実行経路）: \`${deliveryMode}\``,
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
    "_レビュアーは批判専用です。revision GO / merge GO + real passkey の権限は人間が保持します。_"
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
  const source = typeof comment === "object" && comment !== null ? comment : {};
  const createdAt = normalizeText(source.createdAt ?? source.created_at);
  const updatedAt = normalizeText(source.updatedAt ?? source.updated_at);

  const parsed = {
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
  const url = normalizeText(source.url ?? source.htmlUrl ?? source.html_url);
  if (url) {
    parsed.url = url;
  }
  if (createdAt) {
    parsed.createdAt = createdAt;
  }
  if (updatedAt) {
    parsed.updatedAt = updatedAt;
  }
  if (source.includesCreatedEdit === true || (Boolean(createdAt) && Boolean(updatedAt) && createdAt !== updatedAt)) {
    parsed.includesCreatedEdit = true;
  }
  return parsed;
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
      "Gemini の批判レビューが一時的に使えず、現在の repository/runtime 設定では非手動の Codex fallback も開始できませんでした。",
      ...(rawReview
        ? ["", "### Raw Failure（失敗詳細）", "", "```text", rawReview, "```"]
        : [])
    ];
  }

  if (status === CodexReviewFallbackStatus.COMPLETED) {
    return [
      `- Recommended action: \`${recommendedAction}\``,
      "",
      "### Critical Findings",
      ...formatListOrFallback(criticalFindings, "- 重要指摘なし。"),
      "",
      "### Risks",
      ...formatListOrFallback(risks, "- 残リスクなし。"),
      ...(rawReview
        ? ["", "### Raw Codex Output（Codex 生出力）", "", "```text", rawReview, "```"]
        : [])
    ];
  }

  if (deliveryMode === "codex_cloud_github_comment") {
    return [
      "Gemini の批判レビューが一時的に使えません。",
      "VTDD は GitHub コメント経由で Codex Cloud review を依頼しました。",
      "この依頼は `OPENAI_API_KEY` を使いません。Codex が completed の reviewer marker を返すまでは request-state として扱います。",
      "",
      "@codex review",
      "",
      "この pull request に対して、批判専用の VTDD reviewer pass を実行してください。",
      "`Recommended action`, `Critical Findings`, `Risks` を含む completed の `vtdd:reviewer=codex-fallback` コメントを返すか更新してください。",
      ...(repository || pullRequestNumber
        ? [
            "",
            "### Target（対象）",
            ...(repository ? [`- Repository: \`${repository}\``] : []),
            ...(pullRequestNumber ? [`- Pull request: #${pullRequestNumber}`] : [])
          ]
        : [])
    ];
  }

  return [
    "Gemini の批判レビューが一時的に使えません。",
    "VTDD 管理の workflow 実行で、非手動の Codex fallback review を開始しました。",
    ...(repository || pullRequestNumber
      ? [
          "",
          "### Target（対象）",
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
    return "manual review が必要です";
  }
  if (status === CodexReviewFallbackStatus.BLOCKED) {
    return "reviewer が block されました";
  }
  if (recommendedAction === "request_changes") {
    return "review が変更要求を出しました";
  }
  if (recommendedAction === "approve") {
    return "review は approve です";
  }
  return "manual review が必要です";
}
