export const GeminiReviewFailureKind = Object.freeze({
  TEMPORARY_UNAVAILABLE: "temporary_unavailable",
  OTHER: "other"
});

export function classifyGeminiReviewFailure(input = {}) {
  const status = normalizeNumber(input?.status);
  const providerStatus = normalizeText(input?.providerStatus || input?.errorStatus).toLowerCase();
  const message = normalizeText(input?.message);

  if (
    status === 429 ||
    providerStatus === "resource_exhausted" ||
    /quota exceeded|rate limit|resource_exhausted|too many requests|currently experiencing high demand|try again later|temporarily unavailable/i.test(
      message
    )
  ) {
    return { kind: GeminiReviewFailureKind.TEMPORARY_UNAVAILABLE };
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
