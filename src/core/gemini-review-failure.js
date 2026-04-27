export const GeminiReviewFailureKind = Object.freeze({
  QUOTA_OR_RATE_LIMIT: "quota_or_rate_limit",
  OTHER: "other"
});

export function classifyGeminiReviewFailure(input = {}) {
  const status = normalizeNumber(input?.status);
  const providerStatus = normalizeText(input?.providerStatus || input?.errorStatus).toLowerCase();
  const message = normalizeText(input?.message);

  if (
    status === 429 ||
    providerStatus === "resource_exhausted" ||
    /quota exceeded|rate limit|resource_exhausted|too many requests/i.test(message)
  ) {
    return { kind: GeminiReviewFailureKind.QUOTA_OR_RATE_LIMIT };
  }

  return { kind: GeminiReviewFailureKind.OTHER };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
