export const CODEX_REVIEW_FALLBACK_MARKER = "<!-- vtdd:reviewer=codex-fallback -->";

export function formatCodexReviewFallbackComment(input = {}) {
  const trigger = normalizeText(input.trigger) || "unknown";
  const reason = normalizeText(input.reason) || "gemini_quota_or_rate_limit";

  return [
    CODEX_REVIEW_FALLBACK_MARKER,
    "@codex review",
    "",
    "## VTDD Codex Reviewer Fallback Request",
    "",
    `- Trigger: \`${trigger}\``,
    `- Reason: \`${reason}\``,
    "",
    "Gemini critical review is temporarily unavailable.",
    "Please provide critique-only PR feedback.",
    "",
    "_Reviewer remains critique-only. Human keeps revision GO / merge GO + real passkey authority._"
  ].join("\n");
}

export function findExistingCodexReviewFallbackComment(comments = []) {
  return comments.find((comment) => containsMarker(comment?.body)) ?? null;
}

export function parseCodexReviewFallbackComment(comment = {}) {
  const body = normalizeText(typeof comment === "string" ? comment : comment?.body);
  if (!body || !containsMarker(body)) {
    return null;
  }

  return {
    reviewer: "codex",
    status: "requested",
    blocking: false,
    body
  };
}

function containsMarker(value) {
  return normalizeText(value).includes(CODEX_REVIEW_FALLBACK_MARKER);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
