import test from "node:test";
import assert from "node:assert/strict";
import {
  CODEX_REVIEW_FALLBACK_MARKER,
  findExistingCodexReviewFallbackComment,
  formatCodexReviewFallbackComment,
  parseCodexReviewFallbackComment
} from "../src/core/index.js";

test("formatCodexReviewFallbackComment renders marker and @codex request", () => {
  const body = formatCodexReviewFallbackComment({
    trigger: "pull_request_target:synchronize",
    reason: "gemini_temporarily_unavailable"
  });

  assert.equal(body.includes(CODEX_REVIEW_FALLBACK_MARKER), true);
  assert.equal(body.includes("@codex review"), true);
  assert.equal(body.includes("gemini_temporarily_unavailable"), true);
});

test("findExistingCodexReviewFallbackComment locates prior fallback request", () => {
  const comment = findExistingCodexReviewFallbackComment([
    { id: 1, body: "ordinary comment" },
    { id: 2, body: `${CODEX_REVIEW_FALLBACK_MARKER}\n@codex review` }
  ]);

  assert.deepEqual(comment, {
    id: 2,
    body: `${CODEX_REVIEW_FALLBACK_MARKER}\n@codex review`
  });
});

test("parseCodexReviewFallbackComment exposes requested fallback reviewer state", () => {
  const parsed = parseCodexReviewFallbackComment(`${CODEX_REVIEW_FALLBACK_MARKER}
@codex review`);

  assert.deepEqual(parsed, {
    reviewer: "codex",
    status: "requested",
    blocking: false,
    body: `${CODEX_REVIEW_FALLBACK_MARKER}
@codex review`
  });
});
