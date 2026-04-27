export function buildButlerReviewSynthesis(input = {}) {
  const pullRequest = normalizePullRequest(input.pullRequest);
  if (!pullRequest.exists) {
    return {
      available: false,
      headline: "No active PR is available for Butler synthesis.",
      nextSuggestedActions: normalizeStringArray(input.nextSuggestedActions)
    };
  }

  const reviewLoop = normalizeReviewLoop(input.reviewLoop);
  const codexGoal = normalizeText(input.codexGoal) || "wait_for_review";
  const nextSuggestedActions = normalizeStringArray(input.nextSuggestedActions);
  const recentSignals = collectRecentSignals(pullRequest);

  return {
    available: true,
    headline: buildHeadline({ pullRequest, reviewLoop }),
    prState: {
      number: pullRequest.number,
      url: pullRequest.url,
      state: pullRequest.state,
      title: pullRequest.title,
      baseRef: pullRequest.baseRef,
      headRef: pullRequest.headRef
    },
    reviewerSignal: {
      reviewer: reviewLoop.reviewer,
      reviewerStatus: reviewLoop.reviewerStatus,
      reviewCommentsCount: reviewLoop.reviewCommentsCount,
      unresolvedReviewCommentsCount: reviewLoop.unresolvedReviewCommentsCount,
      criticalReviewPending: reviewLoop.criticalReviewPending,
      updatedSinceReview: pullRequest.updatedSinceReview,
      recentIssueComments: recentSignals.issueComments,
      recentReviewComments: recentSignals.reviewComments,
      recentReviews: recentSignals.reviews
    },
    humanDecisionFocus: buildHumanDecisionFocus({
      pullRequest,
      reviewLoop,
      codexGoal
    }),
    nextSuggestedActions
  };
}

function buildHeadline({ pullRequest, reviewLoop }) {
  const base = `PR #${pullRequest.number} is ${pullRequest.state || "open"}.`;
  if (reviewLoop.reviewerStatus === "codex_review_blocked") {
    return `${base} Gemini is temporarily unavailable and non-manual Codex fallback is currently blocked by platform or repository configuration.`;
  }
  if (reviewLoop.reviewerStatus === "codex_review_requested") {
    return `${base} Gemini is temporarily unavailable and Codex fallback review has been requested.`;
  }
  if (reviewLoop.reviewerStatus === "codex_review_available") {
    return `${base} Codex fallback reviewer evidence is available and should be checked before human GO.`;
  }
  if (reviewLoop.unresolvedReviewCommentsCount > 0) {
    return `${base} ${reviewLoop.unresolvedReviewCommentsCount} unresolved reviewer objections remain.`;
  }
  if (reviewLoop.reviewCommentsCount > 0) {
    return `${base} Reviewer feedback exists and should be checked before human GO.`;
  }
  return `${base} Reviewer evidence is not yet available.`;
}

function buildHumanDecisionFocus({ pullRequest, reviewLoop, codexGoal }) {
  const focus = [];

  if (reviewLoop.unresolvedReviewCommentsCount > 0) {
    focus.push("Meaningful reviewer objections remain unresolved; do not issue merge GO + real passkey yet.");
  }
  if (reviewLoop.reviewerStatus === "codex_review_requested") {
    focus.push("Gemini is temporarily unavailable; Codex fallback review has been requested and should arrive before human GO.");
  }
  if (reviewLoop.reviewerStatus === "codex_review_blocked") {
    focus.push("Gemini is temporarily unavailable and non-manual Codex fallback is blocked; do not treat reviewer coverage as satisfied.");
  }
  if (pullRequest.updatedSinceReview) {
    focus.push("The PR changed after the last review signal; reviewer evidence should be refreshed against the current diff.");
  }
  if (codexGoal === "revise_pr") {
    focus.push("Codex should apply bounded PR revisions before Butler asks for merge judgment.");
  }
  if (codexGoal === "respond_to_review") {
    focus.push("Codex should respond on the PR without treating reviewer comments as resolved by silence.");
  }
  if (reviewLoop.reviewCommentsCount === 0 && reviewLoop.reviewerStatus !== "codex_review_requested") {
    focus.push("Reviewer evidence is not yet present on the PR.");
  }
  focus.push("Human remains the final authority for revision GO and merge GO + real passkey.");

  return focus;
}

function collectRecentSignals(pullRequest) {
  return {
    issueComments: summarizeComments(pullRequest.issueComments),
    reviewComments: summarizeComments(pullRequest.reviewComments),
    reviews: summarizeReviews(pullRequest.reviews)
  };
}

function summarizeComments(comments) {
  const list = Array.isArray(comments) ? comments : [];
  return list
    .slice(-3)
    .map((item) => {
      const author = normalizeText(item?.user?.login) || normalizeText(item?.author) || "unknown";
      const body = normalizeText(item?.body);
      return body ? `${author}: ${body}` : null;
    })
    .filter(Boolean);
}

function summarizeReviews(reviews) {
  const list = Array.isArray(reviews) ? reviews : [];
  return list
    .slice(-3)
    .map((item) => {
      const author = normalizeText(item?.user?.login) || "unknown";
      const state = normalizeText(item?.state) || "COMMENTED";
      const body = normalizeText(item?.body);
      return body ? `${author} (${state}): ${body}` : `${author} (${state})`;
    })
    .filter(Boolean);
}

function normalizePullRequest(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    exists:
      Boolean(normalizeNumber(input.number)) ||
      Boolean(normalizeText(input.url)) ||
      Boolean(normalizeText(input.state)),
    number: normalizeNumber(input.number),
    url: normalizeText(input.url) || null,
    state: normalizeText(input.state) || "open",
    title: normalizeText(input.title) || null,
    baseRef: normalizeText(input.baseRef) || normalizeText(input.base?.ref) || null,
    headRef: normalizeText(input.headRef) || normalizeText(input.head?.ref) || null,
    updatedSinceReview: input.updatedSinceReview === true,
    issueComments: Array.isArray(input.issueComments) ? input.issueComments : [],
    reviewComments: Array.isArray(input.reviewComments) ? input.reviewComments : [],
    reviews: Array.isArray(input.reviews) ? input.reviews : []
  };
}

function normalizeReviewLoop(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    reviewer: normalizeText(input.reviewer) || "gemini",
    reviewerStatus: normalizeText(input.reviewerStatus) || "review_unavailable",
    reviewCommentsCount: normalizeCount(input.reviewCommentsCount),
    unresolvedReviewCommentsCount: normalizeCount(input.unresolvedReviewCommentsCount),
    criticalReviewPending: input.criticalReviewPending === true
  };
}

function normalizeStringArray(value) {
  return (Array.isArray(value) ? value : []).map(normalizeText).filter(Boolean);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Math.floor(numeric);
}

function normalizeNumber(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}
