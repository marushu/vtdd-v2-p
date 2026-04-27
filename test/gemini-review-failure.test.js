import test from "node:test";
import assert from "node:assert/strict";
import { GeminiReviewFailureKind, classifyGeminiReviewFailure } from "../src/core/index.js";

test("classifyGeminiReviewFailure treats quota exhaustion as retryable reviewer unavailability", () => {
  const result = classifyGeminiReviewFailure({
    status: 429,
    providerStatus: "RESOURCE_EXHAUSTED",
    message: "Quota exceeded for metric"
  });

  assert.deepEqual(result, { kind: GeminiReviewFailureKind.TEMPORARY_UNAVAILABLE });
});

test("classifyGeminiReviewFailure treats high-demand unavailability as retryable reviewer unavailability", () => {
  const result = classifyGeminiReviewFailure({
    status: 503,
    providerStatus: "UNAVAILABLE",
    message: "This model is currently experiencing high demand. Please try again later."
  });

  assert.deepEqual(result, { kind: GeminiReviewFailureKind.TEMPORARY_UNAVAILABLE });
});

test("classifyGeminiReviewFailure keeps unexpected failures as hard errors", () => {
  const result = classifyGeminiReviewFailure({
    status: 500,
    providerStatus: "INTERNAL",
    message: "upstream error"
  });

  assert.deepEqual(result, { kind: GeminiReviewFailureKind.OTHER });
});
