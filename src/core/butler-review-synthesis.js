export function buildButlerReviewSynthesis(input = {}) {
  const pullRequest = normalizePullRequest(input.pullRequest);
  const branchAttribution = buildBranchAttribution({
    pullRequest,
    revisionTarget: input.revisionTarget,
    expectedBranch: input.expectedBranch ?? input.branch
  });
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
      headRef: pullRequest.headRef,
      headSha: pullRequest.headSha,
      branchAttribution,
      mergeability: pullRequest.mergeability
    },
    reviewerSignal: {
      reviewer: reviewLoop.reviewer,
      reviewerStatus: reviewLoop.reviewerStatus,
      reviewerEvidence: reviewLoop.reviewerEvidence,
      reviewerSignalTruth: reviewLoop.reviewerSignalTruth,
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
      codexGoal,
      branchAttribution
    }),
    nextSuggestedActions
  };
}

function buildHeadline({ pullRequest, reviewLoop }) {
  const base = `PR #${pullRequest.number} is ${pullRequest.state || "open"}.`;
  if (pullRequest.mergeability.status === "conflict") {
    return `${base} Merge conflict runtime truth is present; Butler should propose a fresh branch / fresh PR instead of merge.`;
  }
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
  if (
    reviewLoop.reviewerStatus === "gemini_review_available" &&
    reviewLoop.reviewerEvidence?.recommendedAction === "approve"
  ) {
    if (pullRequest.mergeability.status === "unverified") {
      return `${base} PR conflict runtime truth is unverified; Butler must re-read runtime truth before merge judgment.`;
    }
    const url = reviewLoop.reviewerEvidence.url
      ? ` Approve evidence: ${reviewLoop.reviewerEvidence.url}`
      : "";
    return `${base} Gemini reviewer action is approve.${url}`;
  }
  if (reviewLoop.reviewCommentsCount > 0) {
    return `${base} Reviewer feedback exists and should be checked before human GO.`;
  }
  if (pullRequest.mergeability.status === "unverified") {
    return `${base} PR conflict runtime truth is unverified; Butler must re-read runtime truth before merge judgment.`;
  }
  return `${base} Reviewer evidence is not yet available.`;
}

function buildHumanDecisionFocus({ pullRequest, reviewLoop, codexGoal, branchAttribution }) {
  const focus = [];

  if (branchAttribution.warning) {
    focus.push(branchAttribution.warning);
  }
  if (pullRequest.mergeability.status === "conflict") {
    focus.push("Runtime truth shows PR merge conflicts; do not recommend merge even if reviewer evidence is approve.");
    if (pullRequest.mergeability.freshBranchSuggestion) {
      focus.push(pullRequest.mergeability.freshBranchSuggestion);
    }
  }
  if (pullRequest.mergeability.status === "unverified") {
    focus.push("PR conflict runtime truth is unverified; call vtddRetrieveGitHub(pulls) again before any merge recommendation.");
  }
  if (pullRequest.mergeability.warning) {
    focus.push(pullRequest.mergeability.warning);
  }
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
  if (reviewLoop.reviewerEvidence?.recommendedAction) {
    const action = reviewLoop.reviewerEvidence.recommendedAction;
    const url = reviewLoop.reviewerEvidence.url ? ` ${reviewLoop.reviewerEvidence.url}` : "";
    focus.push(`Latest ${reviewLoop.reviewer} reviewer action is ${action}.${url}`);
  }
  for (const warning of reviewLoop.reviewerSignalTruth?.warnings ?? []) {
    focus.push(warning);
  }
  if (reviewLoop.reviewerSignalTruth?.githubFormalReview) {
    const formal = reviewLoop.reviewerSignalTruth.githubFormalReview;
    focus.push(
      `GitHub formal review truth: reviewDecision=${formal.reviewDecision || "none"}, approvals=${formal.approvalCount}, blocking=${formal.blocking === true}.`
    );
  }
  if (reviewLoop.reviewer === "gemini" && reviewLoop.reviewerEvidence?.includesCreatedEdit) {
    focus.push(
      "Gemini updates its existing marker comment; GitHub may show the original comment time, so use the current marker body and evidence URL."
    );
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
    headSha: normalizeText(input.headSha) || normalizeText(input.head?.sha) || null,
    mergeability: normalizeMergeability(input),
    updatedSinceReview: input.updatedSinceReview === true,
    issueComments: Array.isArray(input.issueComments) ? input.issueComments : [],
    reviewComments: Array.isArray(input.reviewComments) ? input.reviewComments : [],
    reviews: Array.isArray(input.reviews) ? input.reviews : []
  };
}

function buildBranchAttribution({ pullRequest, revisionTarget, expectedBranch }) {
  const target = revisionTarget && typeof revisionTarget === "object" ? revisionTarget : {};
  const expectedHeadRef =
    normalizeText(target.headRef) ||
    normalizeText(target.head?.ref) ||
    normalizeText(expectedBranch) ||
    null;
  const expectedHeadSha =
    normalizeText(target.headSha) ||
    normalizeText(target.head?.sha) ||
    null;
  const mismatches = [];
  if (expectedHeadRef && pullRequest.headRef && expectedHeadRef !== pullRequest.headRef) {
    mismatches.push(`headRef expected ${expectedHeadRef} but runtime truth shows ${pullRequest.headRef}`);
  }
  if (expectedHeadSha && pullRequest.headSha && expectedHeadSha !== pullRequest.headSha) {
    mismatches.push(`headSha expected ${expectedHeadSha} but runtime truth shows ${pullRequest.headSha}`);
  }
  return {
    expectedHeadRef,
    expectedHeadSha,
    actualHeadRef: pullRequest.headRef,
    actualHeadSha: pullRequest.headSha,
    mismatch: mismatches.length > 0,
    warning:
      mismatches.length > 0
        ? `Branch attribution mismatch for PR #${pullRequest.number}: ${mismatches.join("; ")}. Do not dispatch revise_pr until the target PR lock is refreshed.`
        : null
  };
}

function normalizeReviewLoop(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    reviewer: normalizeText(input.reviewer) || "gemini",
    reviewerStatus: normalizeText(input.reviewerStatus) || "review_unavailable",
    reviewerEvidence: normalizeReviewerEvidence(input.reviewerEvidence),
    reviewerSignalTruth: normalizeReviewerSignalTruth(input.reviewerSignalTruth),
    reviewCommentsCount: normalizeCount(input.reviewCommentsCount),
    unresolvedReviewCommentsCount: normalizeCount(input.unresolvedReviewCommentsCount),
    criticalReviewPending: input.criticalReviewPending === true
  };
}

function normalizeReviewerSignalTruth(value) {
  const input = value && typeof value === "object" ? value : {};
  if (!normalizeText(input.canonicalSource) && !input.githubFormalReview) {
    return null;
  }
  const formal = input.githubFormalReview && typeof input.githubFormalReview === "object"
    ? input.githubFormalReview
    : {};
  const mergeReviewTruth = input.mergeReviewTruth && typeof input.mergeReviewTruth === "object"
    ? input.mergeReviewTruth
    : {};
  return {
    canonicalSource: normalizeText(input.canonicalSource) || "none",
    canonicalReviewer: normalizeText(input.canonicalReviewer) || null,
    reviewerStatus: normalizeText(input.reviewerStatus) || null,
    recommendedAction: normalizeText(input.recommendedAction) || null,
    vtddReviewerMarkerPresent: input.vtddReviewerMarkerPresent === true,
    githubFormalReview: {
      source: normalizeText(formal.source) || "github_formal_review_objects",
      reviewDecision: normalizeText(formal.reviewDecision) || null,
      hasFormalApproval: formal.hasFormalApproval === true,
      approvalCount: normalizeCount(formal.approvalCount),
      blocking: formal.blocking === true,
      blockingReason: normalizeText(formal.blockingReason) || null,
      latestStates: Array.isArray(formal.latestStates) ? formal.latestStates.map(normalizeText).filter(Boolean) : []
    },
    mergeReviewTruth: {
      satisfied: mergeReviewTruth.satisfied === true,
      blocked: mergeReviewTruth.blocked === true,
      reason: normalizeText(mergeReviewTruth.reason) || null
    },
    warnings: normalizeStringArray(input.warnings)
  };
}

function normalizeReviewerEvidence(value) {
  const input = value && typeof value === "object" ? value : {};
  const recommendedAction = normalizeText(input.recommendedAction).toLowerCase();
  if (!recommendedAction) {
    return null;
  }
  return {
    reviewer: normalizeText(input.reviewer) || null,
    recommendedAction,
    url: normalizeText(input.url) || null,
    createdAt: normalizeText(input.createdAt) || null,
    updatedAt: normalizeText(input.updatedAt) || null,
    includesCreatedEdit: input.includesCreatedEdit === true
  };
}

function normalizeMergeability(input) {
  const raw = input.mergeability && typeof input.mergeability === "object" ? input.mergeability : {};
  const mergeable = typeof input.mergeable === "boolean" ? input.mergeable : normalizeNullableBoolean(raw.mergeable);
  const mergeableState =
    normalizeText(input.mergeableState) ||
    normalizeText(input.mergeable_state) ||
    normalizeText(raw.state) ||
    normalizeText(raw.mergeableState) ||
    null;
  const mergeConflict =
    input.mergeConflict === true ||
    raw.hasConflict === true ||
    mergeable === false ||
    mergeableState === "dirty";
  const mergeBlocked = input.mergeBlocked === true || raw.blocked === true || mergeConflict;
  const mergeBlockedReason =
    normalizeText(input.mergeBlockedReason) ||
    normalizeText(raw.blockedReason) ||
    (mergeConflict ? "pull_request_has_merge_conflicts" : null);
  const warning = normalizeText(input.mergeWarning) || normalizeText(raw.warning) || null;
  const freshBranchSuggestion =
    normalizeText(input.freshBranchSuggestion) || normalizeText(raw.freshBranchSuggestion) || null;
  const conflictFiles = Array.isArray(input.conflictFiles)
    ? input.conflictFiles
    : Array.isArray(raw.conflictFiles)
      ? raw.conflictFiles
      : null;
  const conflictFilesSource =
    normalizeText(input.conflictFilesSource) || normalizeText(raw.conflictFilesSource) || null;
  const verified = typeof mergeable === "boolean" || Boolean(mergeableState);
  const status = mergeConflict ? "conflict" : verified ? "verified" : "unverified";

  return {
    status,
    verified,
    mergeable,
    mergeableState,
    mergeConflict,
    mergeBlocked,
    mergeBlockedReason,
    warning,
    freshBranchSuggestion,
    conflictFiles,
    conflictFilesSource
  };
}

function normalizeNullableBoolean(value) {
  return typeof value === "boolean" ? value : null;
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
