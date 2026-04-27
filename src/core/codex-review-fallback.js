export const CODEX_REVIEW_FALLBACK_MARKER = "<!-- vtdd:reviewer=codex-fallback -->";

export const CodexReviewFallbackStatus = Object.freeze({
  REQUESTED: "requested",
  COMPLETED: "completed",
  BLOCKED: "blocked"
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

  const lines = [
    CODEX_REVIEW_FALLBACK_MARKER,
    "## VTDD Codex Reviewer Fallback Request",
    "",
    `- Status: \`${status}\``,
    `- Trigger: \`${trigger}\``,
    `- Reason: \`${reason}\``,
    `- Delivery mode: \`${deliveryMode}\``,
    "",
    ...buildStatusSection({
      status,
      blocker,
      recommendedAction,
      criticalFindings,
      risks,
      rawReview
    }),
    "",
    "_Reviewer remains critique-only. Human keeps revision GO / merge GO + real passkey authority._"
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

function containsMarker(value) {
  return normalizeText(value).includes(CODEX_REVIEW_FALLBACK_MARKER);
}

function buildStatusSection({
  status,
  blocker,
  recommendedAction,
  criticalFindings,
  risks,
  rawReview
}) {
  if (status === CodexReviewFallbackStatus.BLOCKED) {
    return [
      `- Blocker: \`${blocker || "codex_fallback_unavailable"}\``,
      "",
      "Gemini critical review is temporarily unavailable, and non-manual Codex fallback could not be started from the current repository/runtime configuration."
    ];
  }

  if (status === CodexReviewFallbackStatus.COMPLETED) {
    return [
      `- Recommended action: \`${recommendedAction}\``,
      "",
      "### Critical Findings",
      ...formatListOrFallback(criticalFindings, "- None reported."),
      "",
      "### Risks",
      ...formatListOrFallback(risks, "- None reported."),
      ...(rawReview
        ? ["", "### Raw Codex Output", "", "```text", rawReview, "```"]
        : [])
    ];
  }

  return [
    "Gemini critical review is temporarily unavailable.",
    "Non-manual Codex fallback review has been dispatched through VTDD-managed workflow execution."
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
