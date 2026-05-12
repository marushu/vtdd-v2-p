import {
  parseCodexConnectorSetupComment,
  parseCodexReviewFallbackComment
} from "./codex-review-fallback.js";
import { parseGeminiReviewComment } from "./gemini-pr-review.js";

export function collectGeminiReviewerSignals(pullRequest = {}) {
  const comments = [
    ...(Array.isArray(pullRequest.issueComments) ? pullRequest.issueComments : []),
    ...(Array.isArray(pullRequest.reviewComments) ? pullRequest.reviewComments : [])
  ];
  const parsed = comments
    .filter(isTrustedReviewerMarkerComment)
    .sort(compareReviewerMarkerComments)
    .map(parseGeminiReviewComment)
    .filter(Boolean);

  return {
    totalCount: parsed.length,
    blockingCount: parsed.filter((signal) => signal.blocking).length,
    latestEvidence: parsed.at(-1) ?? null
  };
}

export function collectCodexFallbackSignals(pullRequest = {}) {
  const comments = [...(Array.isArray(pullRequest.issueComments) ? pullRequest.issueComments : [])];
  const trustedComments = comments
    .filter(isTrustedReviewerMarkerComment)
    .sort(compareReviewerMarkerComments);
  const parsed = trustedComments
    .map(parseCodexReviewFallbackComment)
    .filter(Boolean);
  const connectorBlockers = comments
    .filter(isTrustedCodexConnectorSetupComment)
    .sort(compareReviewerMarkerComments)
    .map(parseCodexConnectorSetupComment)
    .filter(Boolean);
  const latestConnectorBlocker = connectorBlockers.at(-1) ?? null;
  const latest = latestConnectorBlocker ?? parsed.at(-1) ?? null;

  return {
    requested: latest?.status === "requested",
    completed: latest?.status === "completed",
    blocked: latest?.status === "blocked",
    blocking: latest?.blocking === true,
    latestEvidence: latest?.status === "completed"
      ? {
          reviewer: "codex",
          recommendedAction: latest.recommendedAction || "manual_review",
          url: latest.url || null,
          createdAt: latest.createdAt || null,
          updatedAt: latest.updatedAt || null,
          includesCreatedEdit: latest.includesCreatedEdit === true,
          body: latest.body || null
        }
      : null
  };
}

export function isTrustedReviewerMarkerComment(comment) {
  const author = normalizeText(
    comment?.user?.login ??
      comment?.author?.login ??
      comment?.author
  ).toLowerCase();
  return [
    "vtdd-codex",
    "vtdd-codex[bot]",
    "github-actions[bot]"
  ].includes(author);
}

function isTrustedCodexConnectorSetupComment(comment) {
  const author = normalizeText(
    comment?.user?.login ??
      comment?.author?.login ??
      comment?.author
  ).toLowerCase();
  return author === "chatgpt-codex-connector";
}

export function collectFormalReviewTruth(pullRequest = {}) {
  const reviews = Array.isArray(pullRequest.reviews) ? pullRequest.reviews : [];
  const latestByReviewer = new Map();
  for (const review of reviews) {
    const reviewer = normalizeText(review?.user?.login) || normalizeText(review?.author) || "unknown";
    latestByReviewer.set(reviewer, normalizeReviewState(review?.state));
  }

  const latestStates = [...latestByReviewer.values()].filter(Boolean);
  const reviewDecision = normalizeReviewState(pullRequest.reviewDecision);
  const blocking =
    reviewDecision === "changes_requested" ||
    latestStates.includes("changes_requested");
  const approvalCount = latestStates.filter((state) => state === "approved").length;
  const hasFormalApproval = reviewDecision === "approved" || approvalCount > 0;

  return {
    source: "github_formal_review_objects",
    reviewDecision: reviewDecision || null,
    hasFormalApproval,
    approvalCount,
    blocking,
    blockingReason: blocking ? "github_formal_review_changes_requested" : null,
    latestStates
  };
}

export function buildReviewerSignalTruth({ reviewer, reviewerStatus, reviewerEvidence, formalReviewTruth }) {
  const recommendedAction = normalizeText(reviewerEvidence?.recommendedAction).toLowerCase() || null;
  const vtddReviewerMarkerPresent = Boolean(recommendedAction);
  const markerBlocks =
    recommendedAction === "request_changes" || recommendedAction === "manual_review";
  const formalBlocks = formalReviewTruth.blocking === true;
  const satisfied =
    vtddReviewerMarkerPresent &&
    recommendedAction === "approve" &&
    !formalBlocks;
  const blocked = markerBlocks || formalBlocks;
  const warnings = [];

  if (recommendedAction === "approve" && !formalReviewTruth.hasFormalApproval) {
    warnings.push(
      "VTDD reviewer marker recommends approve, but GitHub formal PR review approval is absent; do not report GitHub reviewDecision as approved."
    );
  }
  if (formalBlocks) {
    warnings.push(
      "GitHub formal review truth has requested changes; it remains blocking even if a VTDD reviewer marker recommends approve."
    );
  }
  if (!vtddReviewerMarkerPresent) {
    warnings.push("No VTDD reviewer marker recommendation is available.");
  }

  return {
    canonicalSource: vtddReviewerMarkerPresent ? "vtdd_reviewer_marker_comment" : "none",
    canonicalReviewer: vtddReviewerMarkerPresent ? reviewer : null,
    reviewerStatus,
    recommendedAction,
    vtddReviewerMarkerPresent,
    githubFormalReview: formalReviewTruth,
    mergeReviewTruth: {
      satisfied,
      blocked,
      reason: blocked
        ? formalReviewTruth.blockingReason || "vtdd_reviewer_marker_blocks_merge"
        : satisfied
          ? "vtdd_reviewer_marker_approve_no_formal_blocker"
          : "reviewer_signal_missing"
    },
    warnings
  };
}

function normalizeReviewState(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "approved") {
    return "approved";
  }
  if (normalized === "changes_requested") {
    return "changes_requested";
  }
  if (normalized === "review_required") {
    return "review_required";
  }
  return normalized;
}

function compareReviewerMarkerComments(left, right) {
  const leftTime = reviewerMarkerCommentTime(left);
  const rightTime = reviewerMarkerCommentTime(right);
  if (leftTime === rightTime) {
    return 0;
  }
  if (!leftTime) {
    return -1;
  }
  if (!rightTime) {
    return 1;
  }
  return leftTime - rightTime;
}

function reviewerMarkerCommentTime(comment) {
  const candidates = [
    comment?.updatedAt,
    comment?.updated_at,
    comment?.createdAt,
    comment?.created_at
  ];
  for (const candidate of candidates) {
    const time = Date.parse(normalizeText(candidate));
    if (Number.isFinite(time)) {
      return time;
    }
  }
  return 0;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
