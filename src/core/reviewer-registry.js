import {
  ReviewerRecommendedAction,
  validateReviewerRequest,
  validateReviewerResponse
} from "./reviewer-contract.js";

export const INITIAL_REVIEWER_ID = "gemini";

export function createReviewerRegistry(initialAdapters = {}) {
  const adapters = new Map();
  for (const [id, adapter] of Object.entries(initialAdapters)) {
    if (typeof adapter === "function") {
      adapters.set(normalize(id), adapter);
    }
  }

  if (!adapters.has(INITIAL_REVIEWER_ID)) {
    adapters.set(INITIAL_REVIEWER_ID, defaultGeminiAdapter);
  }

  return {
    getInitialReviewerId() {
      return INITIAL_REVIEWER_ID;
    },

    listReviewerIds() {
      return [...adapters.keys()];
    },

    registerReviewer(id, adapter) {
      const reviewerId = normalize(id);
      if (!reviewerId) {
        return { ok: false, reason: "reviewer id is required" };
      }
      if (typeof adapter !== "function") {
        return { ok: false, reason: "adapter must be a function" };
      }
      adapters.set(reviewerId, adapter);
      return { ok: true };
    },

    async runReview(input) {
      const requestValidation = validateReviewerRequest(input);
      if (!requestValidation.ok) {
        return { ok: false, issues: requestValidation.issues };
      }

      const request = requestValidation.request;
      const adapter = adapters.get(request.reviewerId);
      if (!adapter) {
        return {
          ok: false,
          issues: [`reviewer '${request.reviewerId}' is not registered`]
        };
      }

      const raw = await adapter({
        prDiff: request.prDiff,
        context: request.context
      });
      const responseValidation = validateReviewerResponse(raw);
      if (!responseValidation.ok) {
        return { ok: false, issues: responseValidation.issues };
      }
      return { ok: true, review: responseValidation.response };
    }
  };
}

function defaultGeminiAdapter() {
  return {
    criticalFindings: ["Gemini adapter is configured as initial reviewer placeholder."],
    risks: ["Connect real reviewer backend before production merge automation."],
    recommendedAction: ReviewerRecommendedAction.MANUAL_REVIEW
  };
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
