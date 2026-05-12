import test from "node:test";
import assert from "node:assert/strict";
import { isPullRequestReviewable } from "../scripts/run-gemini-pr-review.mjs";

test("isPullRequestReviewable rejects merged pull requests", () => {
  const result = isPullRequestReviewable({
    state: "closed",
    merged_at: "2026-05-12T12:01:32Z"
  });

  assert.deepEqual(result, {
    reviewable: false,
    reason: "pull_request_already_merged"
  });
});

test("isPullRequestReviewable rejects non-open unmerged pull requests", () => {
  const result = isPullRequestReviewable({
    state: "closed",
    merged_at: null
  });

  assert.deepEqual(result, {
    reviewable: false,
    reason: "pull_request_not_open:closed"
  });
});

test("isPullRequestReviewable accepts open pull requests", () => {
  const result = isPullRequestReviewable({
    state: "open",
    merged_at: null
  });

  assert.deepEqual(result, {
    reviewable: true,
    reason: null
  });
});
