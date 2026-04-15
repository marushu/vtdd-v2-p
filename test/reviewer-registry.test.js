import test from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_REVIEWER_ID,
  ReviewerRecommendedAction,
  createReviewerRegistry,
  validateReviewerResponse
} from "../src/core/index.js";

test("registry exposes gemini as initial reviewer", () => {
  const registry = createReviewerRegistry();
  assert.equal(registry.getInitialReviewerId(), INITIAL_REVIEWER_ID);
  assert.equal(registry.listReviewerIds().includes("gemini"), true);
});

test("registry can register and run pluggable reviewer", async () => {
  const registry = createReviewerRegistry();
  const registered = registry.registerReviewer("mock-reviewer", async () => ({
    criticalFindings: ["Potential null dereference in policy gate."],
    risks: ["May bypass approval checks in edge path."],
    recommendedAction: ReviewerRecommendedAction.REQUEST_CHANGES
  }));
  assert.equal(registered.ok, true);

  const result = await registry.runReview({
    reviewerId: "mock-reviewer",
    prDiff: "diff --git a/src/core/policy.js b/src/core/policy.js",
    context: "Issue #11 reviewer contract verification"
  });
  assert.equal(result.ok, true);
  assert.equal(result.review.recommendedAction, ReviewerRecommendedAction.REQUEST_CHANGES);
});

test("registry fails when reviewer response schema is invalid", async () => {
  const registry = createReviewerRegistry({
    bad: async () => ({
      criticalFindings: [],
      risks: [],
      recommendedAction: "approve"
    })
  });
  const result = await registry.runReview({
    reviewerId: "bad",
    prDiff: "dummy",
    context: "dummy"
  });
  assert.equal(result.ok, false);
});

test("validateReviewerResponse enforces action enum", () => {
  const result = validateReviewerResponse({
    criticalFindings: ["one"],
    risks: [],
    recommendedAction: "invalid-action"
  });
  assert.equal(result.ok, false);
  assert.equal(result.issues.includes("recommendedAction is invalid"), true);
});
