import fs from "node:fs/promises";
import {
  classifyGeminiReviewFailure,
  DEFAULT_GEMINI_REVIEW_MODEL,
  DEFAULT_REVIEWER_RUNAWAY_MAX_COMMENTS,
  DEFAULT_REVIEWER_RUNAWAY_WINDOW_MINUTES,
  GeminiReviewFailureKind,
  buildGeminiReviewRequestBody,
  buildPullRequestDiff,
  buildPullRequestReviewContext,
  detectGeminiReviewerRunaway,
  extractReviewerResponseFromGemini,
  findExistingCodexReviewFallbackComment,
  findExistingGeminiReviewComment,
  formatCodexReviewFallbackComment,
  formatGeminiReviewComment,
  formatGeminiReviewRunawayGuardComment,
  isReviewerTerminalApproved,
  parseGeminiReviewComment,
  resolveOperatorMention,
  resolveGeminiReviewTrigger
} from "../src/core/index.js";

async function main() {
  const eventName = mustGetEnv("GITHUB_EVENT_NAME");
  const repository = mustGetEnv("GITHUB_REPOSITORY");
  const eventPath = mustGetEnv("GITHUB_EVENT_PATH");
  const githubToken = mustGetEnv("GITHUB_TOKEN");
  const payload = JSON.parse(await fs.readFile(eventPath, "utf8"));

  const triggerResult = resolveGeminiReviewTrigger({ eventName, payload });
  if (!triggerResult.ok) {
    throw new Error(triggerResult.issues?.join(", ") || "failed to resolve Gemini review trigger");
  }
  if (!triggerResult.value.shouldReview) {
    console.log(`Skipping Gemini PR review: ${triggerResult.value.reason}`);
    return;
  }

  const apiBaseUrl = process.env.GITHUB_API_URL || "https://api.github.com";
  const githubFetch = createGitHubFetch({ apiBaseUrl, token: githubToken });
  const prNumber = triggerResult.value.pullRequestNumber;

  const pullRequest = await githubFetch(`/repos/${repository}/pulls/${prNumber}`);
  const files = await githubFetch(`/repos/${repository}/pulls/${prNumber}/files?per_page=100`);
  const issueComments = await githubFetch(`/repos/${repository}/issues/${prNumber}/comments?per_page=100`);
  const reviewComments = await githubFetch(`/repos/${repository}/pulls/${prNumber}/comments?per_page=100`);
  const reviews = await githubFetch(`/repos/${repository}/pulls/${prNumber}/reviews?per_page=100`);
  const existingReviewComment = findExistingGeminiReviewComment(issueComments);
  const existingFallbackComment = findExistingCodexReviewFallbackComment(issueComments);
  if (
    triggerResult.value.trigger === "issue_comment:created" &&
    isReviewerTerminalApproved({
      comments: issueComments,
      headSha: pullRequest?.head?.sha
    })
  ) {
    console.log(`Skipping Gemini PR review: reviewer already approved current PR head on PR #${prNumber}.`);
    return;
  }

  const runawayGuard = detectGeminiReviewerRunaway({
    issueComments,
    windowMinutes: parsePositiveInteger(process.env.VTDD_REVIEWER_RUNAWAY_WINDOW_MINUTES) || DEFAULT_REVIEWER_RUNAWAY_WINDOW_MINUTES,
    maxReviewerComments: parsePositiveInteger(process.env.VTDD_REVIEWER_RUNAWAY_MAX_COMMENTS) || DEFAULT_REVIEWER_RUNAWAY_MAX_COMMENTS
  });
  if (runawayGuard.triggered) {
    if (runawayGuard.shouldNotifyOwner) {
      const guardBody = formatGeminiReviewRunawayGuardComment({
        repository,
        pullRequestNumber: prNumber,
        headSha: pullRequest?.head?.sha,
        windowMinutes: runawayGuard.windowMinutes,
        maxReviewerComments: runawayGuard.maxReviewerComments,
        recentReviewerCommentCount: runawayGuard.recentReviewerCommentCount,
        notificationMention: resolveOperatorMention([pullRequest?.user?.login, payload?.sender?.login])
      });
      await githubFetch(`/repos/${repository}/issues/${prNumber}/comments`, {
        method: "POST",
        body: { body: guardBody }
      });
    }
    console.log(
      `Skipping Gemini PR review: runaway guard triggered on PR #${prNumber} (${runawayGuard.recentReviewerCommentCount}/${runawayGuard.maxReviewerComments} reviewer comments in ${runawayGuard.windowMinutes}m).`
    );
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    console.log("Skipping Gemini PR review: GEMINI_API_KEY is not configured.");
    return;
  }

  if (!githubToken.startsWith("gh")) {
    console.log("Warning: GITHUB_TOKEN does not look like a GitHub App token.");
  }

  const prDiff = buildPullRequestDiff(files);
  const context = buildPullRequestReviewContext({
    repository,
    trigger: triggerResult.value.trigger,
    pullRequest,
    files,
    issueComments,
    reviewComments,
    reviews
  });

  const model = process.env.GEMINI_REVIEW_MODEL || DEFAULT_GEMINI_REVIEW_MODEL;
  const requestBody = buildGeminiReviewRequestBody({ prDiff, context });
  let geminiResponse;
  try {
    geminiResponse = await callGemini({
      apiKey: process.env.GEMINI_API_KEY,
      model,
      body: requestBody
    });
  } catch (error) {
    const failure = classifyGeminiReviewFailure(error instanceof Error ? error : {});
    if (failure.kind === GeminiReviewFailureKind.TEMPORARY_UNAVAILABLE) {
      const fallbackBody = formatCodexReviewFallbackComment({
        status: "requested",
        trigger: triggerResult.value.trigger,
        reason: "gemini_temporarily_unavailable",
        deliveryMode: "vps_codex_cli",
        repository,
        pullRequestNumber: prNumber,
        headSha: pullRequest?.head?.sha,
        notificationMention: resolveOperatorMention([pullRequest?.user?.login, payload?.sender?.login])
      });
      await githubFetch(`/repos/${repository}/issues/${prNumber}/comments`, {
        method: "POST",
        body: { body: fallbackBody }
      });

      console.log(`Requested VPS Codex reviewer fallback on PR #${prNumber}.`);
      return;
    }
    throw error;
  }
  const reviewResult = extractReviewerResponseFromGemini(geminiResponse);
  if (!reviewResult.ok) {
    throw new Error(reviewResult.issues.join(", "));
  }

  const commentBody = formatGeminiReviewComment({
    review: reviewResult.review,
    trigger: triggerResult.value.trigger,
    model,
    headSha: pullRequest?.head?.sha,
    notificationMention: shouldMentionGeminiReviewResult({
      existingComment: existingReviewComment,
      recommendedAction: reviewResult.review.recommendedAction
    })
      ? resolveOperatorMention([pullRequest?.user?.login, payload?.sender?.login])
      : ""
  });

  await githubFetch(`/repos/${repository}/issues/${prNumber}/comments`, {
    method: "POST",
    body: { body: commentBody }
  });
  console.log(`Created Gemini review comment on PR #${prNumber}.`);
}

function createGitHubFetch({ apiBaseUrl, token }) {
  return async (path, options = {}) => {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json; charset=utf-8",
        "x-github-api-version": "2022-11-28",
        "user-agent": "vtdd-v2-gemini-reviewer"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API request failed (${response.status}): ${text}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  };
}

async function callGemini({ apiKey, model, body }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify(body)
    }
  );

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json?.error?.message || `Gemini API request failed with status ${response.status}`);
    error.status = response.status;
    error.providerStatus = json?.error?.status;
    throw error;
  }
  return json;
}

function mustGetEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parsePositiveInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function shouldMentionGeminiReviewResult({ existingComment, recommendedAction }) {
  const currentAction = String(recommendedAction || "").trim().toLowerCase() || "manual_review";
  const existing = parseGeminiReviewComment(existingComment);
  return !existing || existing.recommendedAction !== currentAction;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
