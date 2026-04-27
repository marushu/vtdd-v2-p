import test from "node:test";
import assert from "node:assert/strict";
import {
  CODEX_REVIEW_FALLBACK_MARKER,
  findExistingCodexReviewFallbackComment,
  formatCodexReviewFallbackComment,
  parseCodexReviewFallbackComment
} from "../src/core/index.js";

test("formatCodexReviewFallbackComment renders marker and requested fallback state", () => {
  const body = formatCodexReviewFallbackComment({
    status: "requested",
    trigger: "pull_request_target:synchronize",
    reason: "gemini_temporarily_unavailable"
  });

  assert.equal(body.includes(CODEX_REVIEW_FALLBACK_MARKER), true);
  assert.equal(body.includes("- Status: `requested`"), true);
  assert.equal(body.includes("workflow execution"), true);
  assert.equal(body.includes("gemini_temporarily_unavailable"), true);
});

test("findExistingCodexReviewFallbackComment locates prior fallback request", () => {
  const comment = findExistingCodexReviewFallbackComment([
    { id: 1, body: "ordinary comment" },
    { id: 2, body: `${CODEX_REVIEW_FALLBACK_MARKER}\n- Status: \`requested\`` }
  ]);

  assert.deepEqual(comment, {
    id: 2,
    body: `${CODEX_REVIEW_FALLBACK_MARKER}\n- Status: \`requested\``
  });
});

test("parseCodexReviewFallbackComment exposes requested fallback reviewer state", () => {
  const body = `${CODEX_REVIEW_FALLBACK_MARKER}
- Status: \`requested\``;
  const parsed = parseCodexReviewFallbackComment(body);

  assert.deepEqual(parsed, {
    reviewer: "codex",
    status: "requested",
    blocking: true,
    recommendedAction: null,
    blocker: null,
    body
  });
});

test("parseCodexReviewFallbackComment exposes completed fallback reviewer state", () => {
  const body = `${CODEX_REVIEW_FALLBACK_MARKER}
## VTDD Codex Reviewer Fallback Request

- Status: \`completed\`
- Recommended action: \`approve\``;
  const parsed = parseCodexReviewFallbackComment(body);

  assert.deepEqual(parsed, {
    reviewer: "codex",
    status: "completed",
    blocking: false,
    recommendedAction: "approve",
    blocker: null,
    body
  });
});

test("parseCodexReviewFallbackComment exposes blocked fallback reviewer state", () => {
  const body = `${CODEX_REVIEW_FALLBACK_MARKER}
## VTDD Codex Reviewer Fallback Request

- Status: \`blocked\`
- Blocker: \`openai_api_key_not_configured\``;
  const parsed = parseCodexReviewFallbackComment(body);

  assert.deepEqual(parsed, {
    reviewer: "codex",
    status: "blocked",
    blocking: true,
    recommendedAction: null,
    blocker: "openai_api_key_not_configured",
    body
  });
});
