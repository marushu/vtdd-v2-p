import test from "node:test";
import assert from "node:assert/strict";
import { buildButlerReviewSynthesis } from "../src/core/index.js";

test("butler review synthesis preserves unresolved reviewer objections and next actions", () => {
  const result = buildButlerReviewSynthesis({
    pullRequest: {
      number: 42,
      url: "https://github.com/example/repo/pull/42",
      state: "open",
      title: "Connect reviewer loop",
      updatedSinceReview: true,
      issueComments: [{ user: { login: "owner" }, body: "Please check the runtime contract." }],
      reviewComments: [{ user: { login: "gemini" }, body: "The blocking loop still looks incomplete." }],
      reviews: [{ user: { login: "gemini" }, state: "COMMENTED", body: "Needs another pass." }]
    },
    reviewLoop: {
      reviewer: "gemini",
      reviewCommentsCount: 2,
      unresolvedReviewCommentsCount: 1,
      criticalReviewPending: true
    },
    codexGoal: "revise_pr",
    nextSuggestedActions: ["apply_pr_feedback", "rerun_gemini_review"]
  });

  assert.equal(result.available, true);
  assert.equal(result.headline.includes("unresolved reviewer objections"), true);
  assert.equal(
    result.humanDecisionFocus.includes(
      "Meaningful reviewer objections remain unresolved; do not issue merge GO + real passkey yet."
    ),
    true
  );
  assert.deepEqual(result.nextSuggestedActions, ["apply_pr_feedback", "rerun_gemini_review"]);
  assert.equal(result.reviewerSignal.recentReviewComments[0].includes("gemini:"), true);
});

test("butler review synthesis reports missing PR state plainly", () => {
  const result = buildButlerReviewSynthesis({
    nextSuggestedActions: ["open_pull_request"]
  });

  assert.equal(result.available, false);
  assert.equal(result.headline, "No active PR is available for Butler synthesis.");
});

test("butler review synthesis does not present approve-only Gemini review as unresolved objection", () => {
  const result = buildButlerReviewSynthesis({
    pullRequest: {
      number: 28,
      url: "https://github.com/example/repo/pull/28",
      state: "open",
      title: "Live Gemini review test",
      issueComments: [
        {
          user: { login: "vtdd-codex[bot]" },
          body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini Critical Review\n\n- Recommended action: `approve`",
          url: "https://github.com/example/repo/pull/28#issuecomment-1",
          includesCreatedEdit: true
        }
      ]
    },
    reviewLoop: {
      reviewer: "gemini",
      reviewerStatus: "gemini_review_available",
      reviewerEvidence: {
        reviewer: "gemini",
        recommendedAction: "approve",
        url: "https://github.com/example/repo/pull/28#issuecomment-1",
        includesCreatedEdit: true
      },
      reviewCommentsCount: 1,
      unresolvedReviewCommentsCount: 0,
      criticalReviewPending: false
    },
    codexGoal: "respond_to_review",
    nextSuggestedActions: ["summarize_for_human", "wait_for_human_go"]
  });

  assert.equal(result.available, true);
  assert.equal(
    result.headline,
    "PR #28 is open. PR conflict runtime truth is unverified; Butler must re-read runtime truth before merge judgment."
  );
  assert.equal(result.prState.mergeability.status, "unverified");
  assert.deepEqual(result.reviewerSignal.reviewerEvidence, {
    reviewer: "gemini",
    recommendedAction: "approve",
    url: "https://github.com/example/repo/pull/28#issuecomment-1",
    createdAt: null,
    updatedAt: null,
    includesCreatedEdit: true
  });
  assert.equal(
    result.humanDecisionFocus.includes(
      "Gemini updates its existing marker comment; GitHub may show the original comment time, so use the current marker body and evidence URL."
    ),
    true
  );
  assert.equal(
    result.humanDecisionFocus.includes(
      "VTDD reviewer marker recommends approve, but GitHub formal PR review approval is absent; do not report GitHub reviewDecision as approved."
    ),
    false
  );
  assert.equal(
    result.humanDecisionFocus.includes(
      "Meaningful reviewer objections remain unresolved; do not issue merge GO + real passkey yet."
    ),
    false
  );
});

test("butler review synthesis blocks merge recommendation when approved PR has conflicts", () => {
  const result = buildButlerReviewSynthesis({
    pullRequest: {
      number: 281,
      url: "https://github.com/example/repo/pull/281",
      state: "open",
      title: "Approved but conflicted",
      mergeable: false,
      mergeableState: "dirty",
      mergeConflict: true,
      mergeBlocked: true,
      mergeBlockedReason: "pull_request_has_merge_conflicts",
      mergeWarning:
        "Warning: PR merge conflicts were detected before merge. Resolve conflicts or recreate a fresh branch before attempting the merge API.",
      freshBranchSuggestion:
        "Recreate a fresh branch from the current base branch, replay the scoped changes, and open/update the PR before retrying merge.",
      conflictFiles: null,
      conflictFilesSource: "not_provided_by_github_pull_request_endpoint"
    },
    reviewLoop: {
      reviewer: "gemini",
      reviewerStatus: "gemini_review_available",
      reviewerEvidence: {
        reviewer: "gemini",
        recommendedAction: "approve",
        url: "https://github.com/example/repo/pull/281#issuecomment-1"
      },
      reviewCommentsCount: 1,
      unresolvedReviewCommentsCount: 0,
      criticalReviewPending: false
    },
    nextSuggestedActions: ["create_fresh_branch", "open_fresh_pull_request"]
  });

  assert.equal(result.available, true);
  assert.match(result.headline, /Merge conflict runtime truth is present/);
  assert.equal(result.prState.mergeability.status, "conflict");
  assert.equal(result.prState.mergeability.mergeConflict, true);
  assert.equal(result.prState.mergeability.mergeBlockedReason, "pull_request_has_merge_conflicts");
  assert.equal(
    result.humanDecisionFocus.includes(
      "Runtime truth shows PR merge conflicts; do not recommend merge even if reviewer evidence is approve."
    ),
    true
  );
  assert.equal(result.humanDecisionFocus.some((line) => line.includes("Recreate a fresh branch")), true);
  assert.deepEqual(result.nextSuggestedActions, ["create_fresh_branch", "open_fresh_pull_request"]);
});

test("butler review synthesis separates VTDD reviewer marker truth from GitHub formal review truth", () => {
  const result = buildButlerReviewSynthesis({
    pullRequest: {
      number: 296,
      url: "https://github.com/example/repo/pull/296",
      state: "open",
      title: "Reviewer signal truth",
      mergeable: true,
      mergeableState: "clean"
    },
    reviewLoop: {
      reviewer: "gemini",
      reviewerStatus: "gemini_review_available",
      reviewerEvidence: {
        reviewer: "gemini",
        recommendedAction: "approve",
        url: "https://github.com/example/repo/pull/296#issuecomment-1"
      },
      reviewerSignalTruth: {
        canonicalSource: "vtdd_reviewer_marker_comment",
        canonicalReviewer: "gemini",
        reviewerStatus: "gemini_review_available",
        recommendedAction: "approve",
        vtddReviewerMarkerPresent: true,
        githubFormalReview: {
          source: "github_formal_review_objects",
          reviewDecision: null,
          hasFormalApproval: false,
          approvalCount: 0,
          blocking: false,
          latestStates: []
        },
        mergeReviewTruth: {
          satisfied: true,
          blocked: false,
          reason: "vtdd_reviewer_marker_approve_no_formal_blocker"
        },
        warnings: [
          "VTDD reviewer marker recommends approve, but GitHub formal PR review approval is absent; do not report GitHub reviewDecision as approved."
        ]
      },
      reviewCommentsCount: 1,
      unresolvedReviewCommentsCount: 0,
      criticalReviewPending: false
    },
    nextSuggestedActions: ["summarize_for_human", "wait_for_human_go"]
  });

  assert.equal(result.reviewerSignal.reviewerSignalTruth.canonicalSource, "vtdd_reviewer_marker_comment");
  assert.equal(result.reviewerSignal.reviewerSignalTruth.githubFormalReview.hasFormalApproval, false);
  assert.equal(result.reviewerSignal.reviewerSignalTruth.mergeReviewTruth.satisfied, true);
  assert.equal(
    result.humanDecisionFocus.includes(
      "VTDD reviewer marker recommends approve, but GitHub formal PR review approval is absent; do not report GitHub reviewDecision as approved."
    ),
    true
  );
  assert.equal(
    result.humanDecisionFocus.includes(
      "GitHub formal review truth: reviewDecision=none, approvals=0, blocking=false."
    ),
    true
  );
});

test("butler review synthesis marks missing conflict runtime truth as unverified", () => {
  const result = buildButlerReviewSynthesis({
    pullRequest: {
      number: 279,
      url: "https://github.com/example/repo/pull/279",
      state: "open",
      title: "Needs runtime truth"
    },
    reviewLoop: {
      reviewer: "gemini",
      reviewerStatus: "gemini_review_available",
      reviewerEvidence: {
        reviewer: "gemini",
        recommendedAction: "approve"
      },
      reviewCommentsCount: 1,
      unresolvedReviewCommentsCount: 0
    },
    nextSuggestedActions: ["refresh_pull_request_runtime_truth", "summarize_for_human"]
  });

  assert.equal(result.prState.mergeability.status, "unverified");
  assert.equal(result.prState.mergeability.verified, false);
  assert.match(result.headline, /conflict runtime truth is unverified/);
  assert.equal(
    result.humanDecisionFocus.includes(
      "PR conflict runtime truth is unverified; call vtddRetrieveGitHub(pulls) again before any merge recommendation."
    ),
    true
  );
});

test("butler review synthesis surfaces Codex fallback review requests plainly", () => {
  const result = buildButlerReviewSynthesis({
    pullRequest: {
      number: 74,
      url: "https://github.com/example/repo/pull/74",
      state: "open",
      title: "Reviewer fallback"
    },
    reviewLoop: {
      reviewer: "codex",
      reviewerStatus: "codex_review_requested",
      reviewCommentsCount: 0,
      unresolvedReviewCommentsCount: 0,
      criticalReviewPending: true
    },
    codexGoal: "wait_for_review",
    nextSuggestedActions: ["wait_for_codex_review", "summarize_for_human"]
  });

  assert.equal(
    result.headline,
    "PR #74 is open. Gemini is temporarily unavailable and Codex fallback review has been requested."
  );
  assert.equal(result.reviewerSignal.reviewerStatus, "codex_review_requested");
  assert.equal(
    result.humanDecisionFocus.includes(
      "Gemini is temporarily unavailable; Codex fallback review has been requested and should arrive before human GO."
    ),
    true
  );
});

test("butler review synthesis surfaces Codex fallback blocker plainly", () => {
  const result = buildButlerReviewSynthesis({
    pullRequest: {
      number: 84,
      url: "https://github.com/example/repo/pull/84",
      state: "open",
      title: "No-manual reviewer fallback"
    },
    reviewLoop: {
      reviewer: "codex",
      reviewerStatus: "codex_review_blocked",
      reviewCommentsCount: 0,
      unresolvedReviewCommentsCount: 0,
      criticalReviewPending: true
    },
    codexGoal: "wait_for_review",
    nextSuggestedActions: ["surface_reviewer_platform_blocker", "summarize_for_human"]
  });

  assert.equal(
    result.headline,
    "PR #84 is open. Gemini is temporarily unavailable and non-manual Codex fallback is currently blocked by platform or repository configuration."
  );
  assert.equal(
    result.humanDecisionFocus.includes(
      "Gemini is temporarily unavailable and non-manual Codex fallback is blocked; do not treat reviewer coverage as satisfied."
    ),
    true
  );
});

test("butler review synthesis warns when revise target branch attribution mismatches runtime truth", () => {
  const result = buildButlerReviewSynthesis({
    pullRequest: {
      number: 285,
      url: "https://github.com/example/repo/pull/285",
      state: "open",
      title: "Fresh replacement PR",
      headRef: "codex/issue-251-v2",
      headSha: "fresh-sha"
    },
    revisionTarget: {
      number: 285,
      headRef: "codex/issue-251",
      headSha: "old-sha"
    },
    codexGoal: "revise_pr"
  });

  assert.equal(result.prState.branchAttribution.mismatch, true);
  assert.match(result.prState.branchAttribution.warning, /Branch attribution mismatch/);
  assert.equal(
    result.humanDecisionFocus.some((line) =>
      line.includes("Do not dispatch revise_pr until the target PR lock is refreshed")
    ),
    true
  );
});
