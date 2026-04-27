import test from "node:test";
import assert from "node:assert/strict";
import { GeminiReviewFailureKind, classifyGeminiReviewFailure } from "../src/core/index.js";

test("classifyGeminiReviewFailure treats quota exhaustion as retryable reviewer unavailability", () => {
  const result = classifyGeminiReviewFailure({
    status: 429,
    providerStatus: "RESOURCE_EXHAUSTED",
    message: "Quota exceeded for metric"
  });

  assert.deepEqual(result, { kind: GeminiReviewFailureKind.QUOTA_OR_RATE_LIMIT });
});

test("classifyGeminiReviewFailure keeps unexpected failures as hard errors", () => {
  const result = classifyGeminiReviewFailure({
    status: 500,
    providerStatus: "INTERNAL",
    message: "upstream error"
  });

  assert.deepEqual(result, { kind: GeminiReviewFailureKind.OTHER });
});
