import { buildButlerReviewSynthesis } from "./butler-review-synthesis.js";
import {
  parseCodexConnectorSetupComment,
  parseCodexReviewFallbackComment
} from "./codex-review-fallback.js";
import {
  REVIEWER_OBJECTION_RESOLUTION_MARKER,
  buildReviewResponseSummary,
  parseGeminiReviewComment
} from "./gemini-pr-review.js";
import { normalizeText } from "./text-normalization.js";
import { ActorRole, TaskMode } from "./types.js";

export const ExecutionTransferMode = Object.freeze({
  RESUME: "resume",
  HANDOFF_READY: "handoff_ready"
});

export const CodexGoal = Object.freeze({
  OPEN_PR: "open_pr",
  REVISE_PR: "revise_pr",
  RESPOND_TO_REVIEW: "respond_to_review",
  WAIT_FOR_REVIEW: "wait_for_review"
});

export function evaluateExecutionContinuity(input = {}) {
  const mode = normalizeMode(input?.mode);
  if (mode === TaskMode.READ_ONLY) {
    return { ok: true, value: null };
  }

  const actorRole = normalizeActorRole(input?.actorRole);
  const continuation = normalizeContinuationContext(input?.continuationContext);
  const handoffValidation = validateHandoffRequirement({
    actorRole,
    continuation
  });
  if (!handoffValidation.ok) {
    return handoffValidation;
  }

  const github = normalizeGitHubRuntime(input?.runtimeTruth?.runtimeState);
  const pullRequest = github.pullRequest;
  const review = buildReviewState(pullRequest);
  const codexGoal = determineCodexGoal({ pullRequest, review });

  return {
    ok: true,
    value: {
      sourceOfTruth: "github_runtime_truth",
      transferMode:
        continuation.requiresHandoff && actorRole === ActorRole.BUTLER
          ? ExecutionTransferMode.HANDOFF_READY
          : ExecutionTransferMode.RESUME,
      handoffRequired: continuation.requiresHandoff && actorRole === ActorRole.BUTLER,
      codexGoal,
      activeBranch: github.activeBranch,
      pullRequest: {
        exists: pullRequest.exists,
        number: pullRequest.number,
        url: pullRequest.url,
        state: pullRequest.state,
        mergeable: pullRequest.mergeable,
        mergeableState: pullRequest.mergeableState,
        mergeConflict: pullRequest.mergeConflict,
        mergeBlocked: pullRequest.mergeBlocked,
        mergeBlockedReason: pullRequest.mergeBlockedReason,
        mergeabilityVerified: pullRequest.mergeabilityVerified
      },
      reviewLoop: {
        reviewer: review.reviewer,
        reviewerStatus: review.reviewerStatus,
        reviewerEvidence: review.reviewerEvidence,
        reviewerSignalTruth: review.reviewerSignalTruth,
        reviewResponseSummary: review.reviewResponseSummary,
        reviewTimeline: review.reviewTimeline,
        reviewCommentsCount: review.reviewCommentsCount,
        unresolvedReviewCommentsCount: review.unresolvedReviewCommentsCount,
        criticalReviewPending: review.criticalReviewPending,
        rerunReviewer: review.rerunReviewer,
        mergeRequiresHumanGo: true
      },
      butlerSummary: {
        summarizePullRequest: pullRequest.exists,
        summarizeReviewComments: pullRequest.exists,
        suggestNextAction: true
      },
      butlerReviewSynthesis: buildButlerReviewSynthesis({
        pullRequest,
        reviewLoop: {
          reviewer: review.reviewer,
          reviewerStatus: review.reviewerStatus,
          reviewerEvidence: review.reviewerEvidence,
          reviewerSignalTruth: review.reviewerSignalTruth,
          reviewResponseSummary: review.reviewResponseSummary,
          reviewTimeline: review.reviewTimeline,
          reviewCommentsCount: review.reviewCommentsCount,
          unresolvedReviewCommentsCount: review.unresolvedReviewCommentsCount,
          criticalReviewPending: review.criticalReviewPending
        },
        codexGoal,
        nextSuggestedActions: buildNextSuggestedActions({
          pullRequest,
          review,
          codexGoal
        })
      }),
      nextSuggestedActions: buildNextSuggestedActions({
        pullRequest,
        review,
        codexGoal
      })
    }
  };
}

function validateHandoffRequirement({ actorRole, continuation }) {
  const handoffRequired = continuation.requiresHandoff && actorRole === ActorRole.BUTLER;
  if (!handoffRequired) {
    return { ok: true };
  }

  const handoff = continuation.handoff;
  if (!handoff.present) {
    return deny(
      "butler_handoff_required_for_execution_transfer",
      "Butler-mediated execution transfer requires a handoff contract before execution can continue"
    );
  }
  if (!handoff.issueTraceable) {
    return deny(
      "handoff_must_be_issue_traceable",
      "handoff contract must include issue-traceable scope before execution can continue"
    );
  }
  if (!handoff.approvalScopeMatched) {
    return deny(
      "handoff_must_preserve_approval_scope",
      "handoff contract must preserve scoped approval before execution can continue"
    );
  }

  return { ok: true };
}

function buildReviewState(pullRequest) {
  const parsedGeminiSignals = collectGeminiReviewerSignals(pullRequest);
  const codexFallback = collectCodexFallbackSignals(pullRequest);
  const formalReviewTruth = collectFormalReviewTruth(pullRequest);
  const reviewTimeline = buildReviewTimeline(pullRequest);
  const reviewCommentsCount =
    parsedGeminiSignals.totalCount > 0
      ? parsedGeminiSignals.totalCount
      : codexFallback.completed
        ? 1
        : pullRequest.reviewCommentsCount;
  const unresolvedReviewCommentsCount =
    parsedGeminiSignals.totalCount > 0
      ? parsedGeminiSignals.blockingCount
      : codexFallback.completed
        ? (codexFallback.blocking ? 1 : 0)
        : pullRequest.unresolvedReviewCommentsCount;
  const reviewerStatus = codexFallback.completed
    ? "codex_review_available"
    : codexFallback.blocked
      ? "codex_review_blocked"
      : codexFallback.requested
        ? "codex_review_requested"
        : reviewCommentsCount > 0
          ? "gemini_review_available"
          : "review_unavailable";
  const reviewer =
    reviewerStatus.startsWith("codex_review") ? "codex" : pullRequest.reviewer;
  const reviewerEvidence = reviewerStatus.startsWith("codex_review")
    ? codexFallback.latestEvidence
    : parsedGeminiSignals.latestEvidence;
  const reviewResponseSummary = buildReviewResponseSummary({
    pullRequest,
    files: pullRequest.files,
    issueComments: pullRequest.issueComments,
    reviewComments: pullRequest.reviewComments
  });
  const reviewerSignalTruth = buildReviewerSignalTruth({
    reviewer,
    reviewerStatus,
    reviewerEvidence,
    formalReviewTruth,
    reviewResponseSummary
  });
  const criticalReviewPending =
    pullRequest.exists &&
    (reviewerStatus === "codex_review_requested" ||
      reviewerStatus === "codex_review_blocked" ||
      reviewerSignalTruth.mergeReviewTruth.blocked ||
      (reviewCommentsCount > 0 && unresolvedReviewCommentsCount > 0));
  const rerunReviewer =
    pullRequest.exists &&
    reviewerStatus !== "codex_review_requested" &&
    reviewerStatus !== "codex_review_blocked" &&
    (pullRequest.updatedSinceReview || unresolvedReviewCommentsCount > 0);

  return {
    reviewer,
    reviewerStatus,
    reviewerEvidence,
    reviewerSignalTruth,
    reviewResponseSummary,
    reviewTimeline,
    reviewCommentsCount,
    unresolvedReviewCommentsCount,
    criticalReviewPending,
    rerunReviewer
  };
}

function collectGeminiReviewerSignals(pullRequest) {
  const comments = [
    ...(Array.isArray(pullRequest.issueComments) ? pullRequest.issueComments : []),
    ...(Array.isArray(pullRequest.reviewComments) ? pullRequest.reviewComments : [])
  ];
  const parsed = comments.map(parseGeminiReviewComment).filter(Boolean);

  return {
    totalCount: parsed.length,
    blockingCount: parsed.filter((signal) => signal.blocking).length,
    latestEvidence: parsed.at(-1) ?? null
  };
}

function collectCodexFallbackSignals(pullRequest) {
  const comments = [...(Array.isArray(pullRequest.issueComments) ? pullRequest.issueComments : [])];
  const parsed = comments.map(parseCodexReviewFallbackComment).filter(Boolean);
  const connectorBlockers = comments.map(parseCodexConnectorSetupComment).filter(Boolean);
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
          includesCreatedEdit: latest.includesCreatedEdit === true
        }
      : null
  };
}

function buildReviewTimeline(pullRequest) {
  const comments = [
    ...(Array.isArray(pullRequest.issueComments) ? pullRequest.issueComments : []),
    ...(Array.isArray(pullRequest.reviewComments) ? pullRequest.reviewComments : [])
  ];
  return comments
    .map((comment) => buildReviewTimelineItem(comment))
    .filter(Boolean)
    .sort(compareTimelineItems);
}

function buildReviewTimelineItem(comment) {
  const gemini = parseGeminiReviewComment(comment);
  if (gemini) {
    return {
      type: "gemini_review",
      reviewer: "gemini",
      status: gemini.recommendedAction,
      recommendedAction: gemini.recommendedAction,
      blocking: gemini.blocking === true,
      url: gemini.url || normalizeCommentUrl(comment),
      createdAt: gemini.createdAt || normalizeCommentCreatedAt(comment),
      updatedAt: gemini.updatedAt || normalizeCommentUpdatedAt(comment),
      summary: `Gemini reviewer action: ${gemini.recommendedAction}`
    };
  }

  const codex = parseCodexReviewFallbackComment(comment);
  if (codex) {
    const action = codex.recommendedAction ? `, action=${codex.recommendedAction}` : "";
    const blocker = codex.blocker ? `, blocker=${codex.blocker}` : "";
    return {
      type: "codex_fallback",
      reviewer: "codex",
      status: codex.status,
      recommendedAction: codex.recommendedAction || null,
      blocking: codex.blocking === true,
      url: normalizeCommentUrl(comment),
      createdAt: normalizeCommentCreatedAt(comment),
      updatedAt: normalizeCommentUpdatedAt(comment),
      summary: `Codex fallback status: ${codex.status}${action}${blocker}`
    };
  }

  const connector = parseCodexConnectorSetupComment(comment);
  if (connector) {
    return {
      type: "codex_connector_blocker",
      reviewer: "codex",
      status: connector.status,
      recommendedAction: null,
      blocking: true,
      url: normalizeCommentUrl(comment),
      createdAt: normalizeCommentCreatedAt(comment),
      updatedAt: normalizeCommentUpdatedAt(comment),
      summary: `Codex connector blocker: ${connector.blocker}`
    };
  }

  if (normalizeText(comment?.body).includes(REVIEWER_OBJECTION_RESOLUTION_MARKER)) {
    return {
      type: "reviewer_objection_resolution",
      reviewer: normalizeText(comment?.user?.login) || normalizeText(comment?.author?.login) || "unknown",
      status: "posted",
      recommendedAction: null,
      blocking: false,
      url: normalizeCommentUrl(comment),
      createdAt: normalizeCommentCreatedAt(comment),
      updatedAt: normalizeCommentUpdatedAt(comment),
      summary: "Reviewer objection resolution posted"
    };
  }

  return null;
}

function compareTimelineItems(left, right) {
  const leftTime = timelineTimestamp(left);
  const rightTime = timelineTimestamp(right);
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return normalizeText(left.url).localeCompare(normalizeText(right.url));
}

function timelineTimestamp(item) {
  const parsed = Date.parse(normalizeText(item?.createdAt) || normalizeText(item?.updatedAt));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function normalizeCommentUrl(comment) {
  return normalizeText(comment?.url ?? comment?.htmlUrl ?? comment?.html_url) || null;
}

function normalizeCommentCreatedAt(comment) {
  return normalizeText(comment?.createdAt ?? comment?.created_at) || null;
}

function normalizeCommentUpdatedAt(comment) {
  return normalizeText(comment?.updatedAt ?? comment?.updated_at) || null;
}

function collectFormalReviewTruth(pullRequest) {
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

function buildReviewerSignalTruth({ reviewer, reviewerStatus, reviewerEvidence, formalReviewTruth, reviewResponseSummary }) {
  const recommendedAction = normalizeText(reviewerEvidence?.recommendedAction).toLowerCase() || null;
  const vtddReviewerMarkerPresent = Boolean(recommendedAction);
  const markerBlocks =
    recommendedAction === "request_changes" || recommendedAction === "manual_review";
  const formalBlocks = formalReviewTruth.blocking === true;
  const responseBlocks = reviewResponseSummary?.complete === false;
  const satisfied =
    vtddReviewerMarkerPresent &&
    recommendedAction === "approve" &&
    !formalBlocks &&
    !responseBlocks;
  const blocked = markerBlocks || formalBlocks || responseBlocks;
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
  if (responseBlocks) {
    warnings.push(
      "Review response summary has unmapped critical findings; the PR is incomplete until each finding is addressed or explicitly unresolved."
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
        ? formalReviewTruth.blockingReason ||
          (responseBlocks ? "review_response_unmapped_critical_findings" : "vtdd_reviewer_marker_blocks_merge")
        : satisfied
          ? "vtdd_reviewer_marker_approve_no_formal_blocker"
          : "reviewer_signal_missing"
    },
    warnings
  };
}

function determineCodexGoal({ pullRequest, review }) {
  if (!pullRequest.exists) {
    return CodexGoal.OPEN_PR;
  }
  if (pullRequest.mergeConflict) {
    return CodexGoal.REVISE_PR;
  }
  if (review.unresolvedReviewCommentsCount > 0) {
    return CodexGoal.REVISE_PR;
  }
  if (review.reviewerSignalTruth?.mergeReviewTruth?.blocked) {
    return CodexGoal.REVISE_PR;
  }
  return CodexGoal.WAIT_FOR_REVIEW;
}

function buildNextSuggestedActions({ pullRequest, review, codexGoal }) {
  if (!pullRequest.exists) {
    return ["continue_bounded_coding", "open_pull_request", "request_gemini_review"];
  }

  if (pullRequest.mergeConflict) {
    return ["create_fresh_branch", "open_fresh_pull_request", "summarize_for_human"];
  }

  if (review.reviewerStatus === "codex_review_requested") {
    return ["wait_for_codex_review", "summarize_for_human"];
  }

  if (review.reviewerStatus === "codex_review_blocked") {
    return ["surface_reviewer_platform_blocker", "summarize_for_human"];
  }

  if (codexGoal === CodexGoal.REVISE_PR) {
    return ["apply_pr_feedback", "reply_on_pull_request", "rerun_gemini_review"];
  }

  if (codexGoal === CodexGoal.RESPOND_TO_REVIEW) {
    return ["reply_on_pull_request", "rerun_gemini_review"];
  }

  if (review.rerunReviewer) {
    return ["rerun_gemini_review", "summarize_for_human"];
  }

  if (review.reviewerStatus === "review_unavailable") {
    return ["rerun_gemini_review", "summarize_for_human"];
  }

  if (pullRequest.mergeabilityVerified === false) {
    return ["refresh_pull_request_runtime_truth", "summarize_for_human"];
  }

  return ["summarize_for_human", "wait_for_human_go"];
}

function normalizeContinuationContext(value) {
  const input = value && typeof value === "object" ? value : {};
  const handoff = input.handoff && typeof input.handoff === "object" ? input.handoff : {};
  return {
    requiresHandoff: input.requiresHandoff === true,
    handoff: {
      present: Boolean(handoff && Object.keys(handoff).length > 0),
      issueTraceable: handoff.issueTraceable === true,
      approvalScopeMatched: handoff.approvalScopeMatched === true
    }
  };
}

function normalizeGitHubRuntime(value) {
  const runtime = value && typeof value === "object" ? value : {};
  const pullRequestInput =
    runtime.pullRequest && typeof runtime.pullRequest === "object" ? runtime.pullRequest : {};

  return {
    activeBranch: normalizeText(runtime.activeBranch) || null,
    pullRequest: {
      exists: Boolean(
        normalizeText(pullRequestInput.url) ||
          Number.isInteger(Number(pullRequestInput.number)) ||
          normalizeText(pullRequestInput.state)
      ),
      number: normalizeNumber(pullRequestInput.number),
      url: normalizeText(pullRequestInput.url) || null,
      state: normalizeText(pullRequestInput.state) || null,
      title: normalizeText(pullRequestInput.title) || null,
      baseRef: normalizeText(pullRequestInput.baseRef) || normalizeText(pullRequestInput.base?.ref) || null,
      headRef: normalizeText(pullRequestInput.headRef) || normalizeText(pullRequestInput.head?.ref) || null,
      mergeable: normalizeNullableBoolean(pullRequestInput.mergeable),
      mergeableState:
        normalizeText(pullRequestInput.mergeableState) ||
        normalizeText(pullRequestInput.mergeable_state) ||
        normalizeText(pullRequestInput.mergeability?.state) ||
        null,
      mergeConflict:
        pullRequestInput.mergeConflict === true ||
        pullRequestInput.mergeability?.hasConflict === true ||
        normalizeNullableBoolean(pullRequestInput.mergeable) === false ||
        normalizeText(pullRequestInput.mergeableState) === "dirty" ||
        normalizeText(pullRequestInput.mergeable_state) === "dirty" ||
        normalizeText(pullRequestInput.mergeability?.state) === "dirty",
      mergeBlocked: pullRequestInput.mergeBlocked === true || pullRequestInput.mergeability?.blocked === true,
      mergeBlockedReason:
        normalizeText(pullRequestInput.mergeBlockedReason) ||
        normalizeText(pullRequestInput.mergeability?.blockedReason) ||
        null,
      mergeWarning:
        normalizeText(pullRequestInput.mergeWarning) ||
        normalizeText(pullRequestInput.mergeability?.warning) ||
        null,
      freshBranchSuggestion:
        normalizeText(pullRequestInput.freshBranchSuggestion) ||
        normalizeText(pullRequestInput.mergeability?.freshBranchSuggestion) ||
        null,
      conflictFiles: Array.isArray(pullRequestInput.conflictFiles)
        ? pullRequestInput.conflictFiles
        : Array.isArray(pullRequestInput.mergeability?.conflictFiles)
          ? pullRequestInput.mergeability.conflictFiles
          : null,
      conflictFilesSource:
        normalizeText(pullRequestInput.conflictFilesSource) ||
        normalizeText(pullRequestInput.mergeability?.conflictFilesSource) ||
        null,
      mergeabilityVerified:
        typeof pullRequestInput.mergeable === "boolean" ||
        Boolean(
          normalizeText(pullRequestInput.mergeableState) ||
            normalizeText(pullRequestInput.mergeable_state) ||
            normalizeText(pullRequestInput.mergeability?.state)
        ),
      reviewCommentsCount: normalizeCount(pullRequestInput.reviewCommentsCount),
      unresolvedReviewCommentsCount: normalizeCount(
        pullRequestInput.unresolvedReviewCommentsCount
      ),
      updatedSinceReview: pullRequestInput.updatedSinceReview === true,
      reviewer: normalizeText(pullRequestInput.reviewer) || "gemini",
      reviewDecision:
        normalizeText(pullRequestInput.reviewDecision) ||
        normalizeText(pullRequestInput.review_decision) ||
        null,
      issueComments: Array.isArray(pullRequestInput.issueComments) ? pullRequestInput.issueComments : [],
      reviewComments: Array.isArray(pullRequestInput.reviewComments) ? pullRequestInput.reviewComments : [],
      reviews: Array.isArray(pullRequestInput.reviews) ? pullRequestInput.reviews : [],
      files: Array.isArray(pullRequestInput.files) ? pullRequestInput.files : []
    }
  };
}

function normalizeMode(value) {
  const normalized = String(value ?? TaskMode.EXECUTION)
    .trim()
    .toLowerCase();
  return normalized === TaskMode.READ_ONLY ? TaskMode.READ_ONLY : TaskMode.EXECUTION;
}

function normalizeActorRole(value) {
  const normalized = String(value ?? ActorRole.EXECUTOR)
    .trim()
    .toLowerCase();
  return Object.values(ActorRole).includes(normalized) ? normalized : ActorRole.EXECUTOR;
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

function normalizeNullableBoolean(value) {
  return typeof value === "boolean" ? value : null;
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

function deny(rule, reason) {
  return {
    ok: false,
    rule,
    reason
  };
}
