export const ReviewerRecommendedAction = Object.freeze({
  APPROVE: "approve",
  REQUEST_CHANGES: "request_changes",
  MANUAL_REVIEW: "manual_review"
});

export function validateReviewerRequest(input) {
  const request = {
    reviewerId: normalize(input?.reviewerId),
    prDiff: normalizeText(input?.prDiff),
    context: normalizeText(input?.context)
  };

  const issues = [];
  if (!request.reviewerId) {
    issues.push("reviewerId is required");
  }
  if (!request.prDiff) {
    issues.push("prDiff is required");
  }
  if (!request.context) {
    issues.push("context is required");
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, request };
}

export function validateReviewerResponse(input) {
  const response = {
    criticalFindings: normalizeStringArray(input?.criticalFindings),
    risks: normalizeStringArray(input?.risks),
    recommendedAction: normalize(input?.recommendedAction)
  };

  const issues = [];
  if (!Object.values(ReviewerRecommendedAction).includes(response.recommendedAction)) {
    issues.push("recommendedAction is invalid");
  }
  if (response.criticalFindings.length === 0 && response.risks.length === 0) {
    issues.push("at least one finding or risk is required");
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, response };
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeText(item))
    .filter(Boolean);
}
