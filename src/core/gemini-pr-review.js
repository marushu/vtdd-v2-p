import { validateReviewerResponse } from "./reviewer-contract.js";

export const GEMINI_PR_REVIEW_MARKER = "<!-- vtdd:reviewer=gemini -->";
export const DEFAULT_GEMINI_REVIEW_MODEL = "gemini-2.5-flash";
export const MAX_DIFF_CHARACTERS = 60000;
export const MAX_CONTEXT_COMMENTS = 10;

export function resolveGeminiReviewTrigger(input = {}) {
  const eventName = normalizeText(input.eventName);
  const payload = normalizeObject(input.payload);

  if (eventName === "pull_request_target") {
    const action = normalizeText(payload.action);
    const pullRequest = normalizeObject(payload.pull_request);
    if (!["opened", "reopened", "synchronize", "ready_for_review"].includes(action)) {
      return skip("unsupported_pull_request_action");
    }
    if (pullRequest.draft === true && action !== "ready_for_review") {
      return skip("draft_pull_request");
    }
    return {
      ok: true,
      value: {
        shouldReview: true,
        trigger: `pull_request_target:${action}`,
        pullRequestNumber: normalizePositiveInteger(pullRequest.number)
      }
    };
  }

  if (eventName === "issue_comment") {
    const issue = normalizeObject(payload.issue);
    const comment = normalizeObject(payload.comment);
    if (!issue.pull_request) {
      return skip("issue_comment_not_for_pull_request");
    }
    if (isBotTriggered(payload) || containsMarker(comment.body)) {
      return skip("bot_or_marker_comment");
    }
    return {
      ok: true,
      value: {
        shouldReview: true,
        trigger: "issue_comment:created",
        pullRequestNumber: normalizePositiveInteger(issue.number)
      }
    };
  }

  if (eventName === "pull_request_review") {
    const review = normalizeObject(payload.review);
    const pullRequest = normalizeObject(payload.pull_request);
    if (!["submitted", "edited"].includes(normalizeText(payload.action))) {
      return skip("unsupported_pull_request_review_action");
    }
    if (isBotTriggered(payload) || containsMarker(review.body)) {
      return skip("bot_or_marker_review");
    }
    return {
      ok: true,
      value: {
        shouldReview: true,
        trigger: `pull_request_review:${normalizeText(payload.action)}`,
        pullRequestNumber: normalizePositiveInteger(pullRequest.number)
      }
    };
  }

  if (eventName === "pull_request_review_comment") {
    const comment = normalizeObject(payload.comment);
    const pullRequest = normalizeObject(payload.pull_request);
    if (!["created", "edited"].includes(normalizeText(payload.action))) {
      return skip("unsupported_pull_request_review_comment_action");
    }
    if (isBotTriggered(payload) || containsMarker(comment.body)) {
      return skip("bot_or_marker_review_comment");
    }
    return {
      ok: true,
      value: {
        shouldReview: true,
        trigger: `pull_request_review_comment:${normalizeText(payload.action)}`,
        pullRequestNumber: normalizePositiveInteger(pullRequest.number)
      }
    };
  }

  return skip("unsupported_event");
}

export function buildPullRequestDiff(files = [], options = {}) {
  const maxCharacters = normalizePositiveInteger(options.maxCharacters) || MAX_DIFF_CHARACTERS;
  const chunks = [];

  for (const file of files) {
    const name = normalizeText(file?.filename) || "unknown";
    const status = normalizeText(file?.status) || "modified";
    const patch = normalizeText(file?.patch);
    const fileChunk = [
      `diff --git a/${name} b/${name}`,
      `status: ${status}`,
      patch || "[patch unavailable]"
    ].join("\n");
    chunks.push(fileChunk);
  }

  const joined = chunks.join("\n\n");
  if (joined.length <= maxCharacters) {
    return joined;
  }
  return `${joined.slice(0, maxCharacters)}\n\n[diff truncated]`;
}

export function buildPullRequestReviewContext(input = {}) {
  const repository = normalizeText(input.repository) || "unknown/unknown";
  const trigger = normalizeText(input.trigger) || "unknown";
  const pullRequest = normalizeObject(input.pullRequest);
  const files = Array.isArray(input.files) ? input.files : [];
  const issueComments = summarizeComments(input.issueComments);
  const reviewComments = summarizeComments(input.reviewComments);
  const reviews = summarizeReviews(input.reviews);

  const fileSummary = files.map((file) => {
    const filename = normalizeText(file?.filename) || "unknown";
    const status = normalizeText(file?.status) || "modified";
    return `- ${filename} (${status})`;
  });

  return [
    `Repository: ${repository}`,
    `Trigger: ${trigger}`,
    `PR: #${normalizePositiveInteger(pullRequest.number) || "unknown"} ${normalizeText(pullRequest.title)}`,
    `PR state: ${normalizeText(pullRequest.state) || "open"}`,
    `Base <- Head: ${normalizeText(pullRequest.base?.ref)} <- ${normalizeText(pullRequest.head?.ref)}`,
    `Author: ${normalizeText(pullRequest.user?.login) || "unknown"}`,
    "",
    "PR body:",
    normalizeMultilineText(pullRequest.body) || "[no body]",
    "",
    "Changed files:",
    fileSummary.length > 0 ? fileSummary.join("\n") : "[no changed files]",
    "",
    "Recent PR comments:",
    issueComments.length > 0 ? issueComments.join("\n") : "[no recent PR comments]",
    "",
    "Recent review comments:",
    reviewComments.length > 0 ? reviewComments.join("\n") : "[no recent review comments]",
    "",
    "Recent reviews:",
    reviews.length > 0 ? reviews.join("\n") : "[no recent reviews]"
  ].join("\n");
}

export function buildGeminiReviewRequestBody(input = {}) {
  const prDiff = normalizeMultilineText(input.prDiff);
  const context = normalizeMultilineText(input.context);
  if (!prDiff) {
    throw new Error("prDiff is required");
  }
  if (!context) {
    throw new Error("context is required");
  }

  return {
    systemInstruction: {
      parts: [
        {
          text: [
            "You are VTDD's Gemini reviewer.",
            "You are critique-only.",
            "You do not execute fixes, decide merge, or erase uncertainty.",
            "Return JSON only.",
            "The JSON must contain criticalFindings[], risks[], and recommendedAction.",
            "recommendedAction must be one of: approve, request_changes, manual_review.",
            "If there are no critical findings, keep criticalFindings empty and put at least one residual risk in risks."
          ].join(" ")
        }
      ]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `PR diff:\n${prDiff}\n\nPR context:\n${context}`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        required: ["criticalFindings", "risks", "recommendedAction"],
        properties: {
          criticalFindings: {
            type: "ARRAY",
            items: { type: "STRING" }
          },
          risks: {
            type: "ARRAY",
            items: { type: "STRING" }
          },
          recommendedAction: {
            type: "STRING",
            enum: ["approve", "request_changes", "manual_review"]
          }
        }
      }
    }
  };
}

export function extractReviewerResponseFromGemini(input = {}) {
  const candidateText =
    normalizeText(input?.candidates?.[0]?.content?.parts?.[0]?.text) || normalizeText(input?.text);
  if (!candidateText) {
    return {
      ok: false,
      issues: ["Gemini response did not contain text output"]
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(candidateText);
  } catch {
    return {
      ok: false,
      issues: ["Gemini response was not valid JSON"]
    };
  }

  const validated = validateReviewerResponse(parsed);
  if (!validated.ok) {
    return validated;
  }

  return {
    ok: true,
    review: validated.response
  };
}

export function formatGeminiReviewComment(input = {}) {
  const review = normalizeObject(input.review);
  const trigger = normalizeText(input.trigger) || "unknown";
  const model = normalizeText(input.model) || DEFAULT_GEMINI_REVIEW_MODEL;
  const criticalFindings = normalizeStringArray(review.criticalFindings);
  const risks = normalizeStringArray(review.risks);
  const recommendedAction = normalizeText(review.recommendedAction) || "manual_review";

  return [
    GEMINI_PR_REVIEW_MARKER,
    "## VTDD Gemini Critical Review",
    "",
    `- Trigger: \`${trigger}\``,
    `- Model: \`${model}\``,
    `- Recommended action: \`${recommendedAction}\``,
    "",
    "### Critical Findings",
    formatListOrFallback(criticalFindings, "- None reported."),
    "",
    "### Risks",
    formatListOrFallback(risks, "- None reported."),
    "",
    "_Reviewer remains critique-only. Human keeps revision GO / merge GO authority._"
  ].join("\n");
}

export function findExistingGeminiReviewComment(comments = []) {
  return (
    comments.find((comment) => containsMarker(comment?.body)) ??
    null
  );
}

function summarizeComments(comments) {
  const list = Array.isArray(comments) ? comments : [];
  return list
    .filter((comment) => !containsMarker(comment?.body))
    .slice(-MAX_CONTEXT_COMMENTS)
    .map((comment) => {
      const author = normalizeText(comment?.user?.login) || "unknown";
      const body = normalizeInlineText(comment?.body) || "[empty]";
      return `- ${author}: ${body}`;
    });
}

function summarizeReviews(reviews) {
  const list = Array.isArray(reviews) ? reviews : [];
  return list
    .slice(-MAX_CONTEXT_COMMENTS)
    .map((review) => {
      const author = normalizeText(review?.user?.login) || "unknown";
      const state = normalizeText(review?.state) || "commented";
      const body = normalizeInlineText(review?.body) || "[empty]";
      return `- ${author} (${state}): ${body}`;
    });
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function formatListOrFallback(values, fallback) {
  if (!values.length) {
    return fallback;
  }
  return values.map((value) => `- ${value}`).join("\n");
}

function isBotTriggered(payload) {
  const senderLogin = normalizeText(payload?.sender?.login);
  return senderLogin.endsWith("[bot]");
}

function containsMarker(value) {
  return normalizeText(value).includes(GEMINI_PR_REVIEW_MARKER);
}

function normalizeInlineText(value) {
  return normalizeMultilineText(value).replace(/\s+/g, " ").trim();
}

function normalizeMultilineText(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizePositiveInteger(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function normalizeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function skip(reason) {
  return {
    ok: true,
    value: {
      shouldReview: false,
      reason
    }
  };
}
