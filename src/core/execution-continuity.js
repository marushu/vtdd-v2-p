import { buildButlerReviewSynthesis } from "./butler-review-synthesis.js";
import { parseCodexReviewFallbackComment } from "./codex-review-fallback.js";
import { parseGeminiReviewComment } from "./gemini-pr-review.js";
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
        state: pullRequest.state
      },
      reviewLoop: {
        reviewer: review.reviewer,
        reviewerStatus: review.reviewerStatus,
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
  const reviewCommentsCount =
    parsedGeminiSignals.totalCount > 0 ? parsedGeminiSignals.totalCount : pullRequest.reviewCommentsCount;
  const unresolvedReviewCommentsCount =
    parsedGeminiSignals.totalCount > 0
      ? parsedGeminiSignals.blockingCount
      : pullRequest.unresolvedReviewCommentsCount;
  const reviewerStatus = codexFallback.requested
    ? "codex_review_requested"
    : reviewCommentsCount > 0
      ? "gemini_review_available"
      : "review_unavailable";
  const reviewer = reviewerStatus === "codex_review_requested" ? "codex" : pullRequest.reviewer;
  const criticalReviewPending =
    pullRequest.exists &&
    (reviewerStatus === "codex_review_requested" ||
      (reviewCommentsCount > 0 && unresolvedReviewCommentsCount > 0));
  const rerunReviewer =
    pullRequest.exists &&
    reviewerStatus !== "codex_review_requested" &&
    (pullRequest.updatedSinceReview || unresolvedReviewCommentsCount > 0);

  return {
    reviewer,
    reviewerStatus,
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
    blockingCount: parsed.filter((signal) => signal.blocking).length
  };
}

function collectCodexFallbackSignals(pullRequest) {
  const comments = [...(Array.isArray(pullRequest.issueComments) ? pullRequest.issueComments : [])];
  const parsed = comments.map(parseCodexReviewFallbackComment).filter(Boolean);

  return {
    requested: parsed.length > 0
  };
}

function determineCodexGoal({ pullRequest, review }) {
  if (!pullRequest.exists) {
    return CodexGoal.OPEN_PR;
  }
  if (review.unresolvedReviewCommentsCount > 0) {
    return CodexGoal.REVISE_PR;
  }
  return CodexGoal.WAIT_FOR_REVIEW;
}

function buildNextSuggestedActions({ pullRequest, review, codexGoal }) {
  if (!pullRequest.exists) {
    return ["continue_bounded_coding", "open_pull_request", "request_gemini_review"];
  }

  if (review.reviewerStatus === "codex_review_requested") {
    return ["wait_for_codex_review", "summarize_for_human"];
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
      reviewCommentsCount: normalizeCount(pullRequestInput.reviewCommentsCount),
      unresolvedReviewCommentsCount: normalizeCount(
        pullRequestInput.unresolvedReviewCommentsCount
      ),
      updatedSinceReview: pullRequestInput.updatedSinceReview === true,
      reviewer: normalizeText(pullRequestInput.reviewer) || "gemini",
      issueComments: Array.isArray(pullRequestInput.issueComments) ? pullRequestInput.issueComments : [],
      reviewComments: Array.isArray(pullRequestInput.reviewComments) ? pullRequestInput.reviewComments : [],
      reviews: Array.isArray(pullRequestInput.reviews) ? pullRequestInput.reviews : []
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

function normalizeText(value) {
  return String(value ?? "").trim();
}

function deny(rule, reason) {
  return {
    ok: false,
    rule,
    reason
  };
}
