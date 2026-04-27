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
          body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini Critical Review\n\n- Recommended action: `approve`"
        }
      ]
    },
    reviewLoop: {
      reviewer: "gemini",
      reviewCommentsCount: 1,
      unresolvedReviewCommentsCount: 0,
      criticalReviewPending: false
    },
    codexGoal: "respond_to_review",
    nextSuggestedActions: ["summarize_for_human", "wait_for_human_go"]
  });

  assert.equal(result.available, true);
  assert.equal(result.headline, "PR #28 is open. Reviewer feedback exists and should be checked before human GO.");
  assert.equal(
    result.humanDecisionFocus.includes(
      "Meaningful reviewer objections remain unresolved; do not issue merge GO + real passkey yet."
    ),
    false
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
