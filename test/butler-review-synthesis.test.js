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
      "Meaningful reviewer objections remain unresolved; do not issue merge GO yet."
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
