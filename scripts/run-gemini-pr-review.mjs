import fs from "node:fs/promises";
import {
  classifyGeminiReviewFailure,
  DEFAULT_GEMINI_REVIEW_MODEL,
  GeminiReviewFailureKind,
  buildGeminiReviewRequestBody,
  buildPullRequestDiff,
  buildPullRequestReviewContext,
  extractReviewerResponseFromGemini,
  findExistingCodexReviewFallbackComment,
  findExistingGeminiReviewComment,
  formatCodexReviewFallbackComment,
  formatGeminiReviewComment,
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
  const existingFallbackComment = findExistingCodexReviewFallbackComment(issueComments);

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
      if (!process.env.OPENAI_API_KEY) {
        const fallbackBody = formatCodexReviewFallbackComment({
          status: "blocked",
          trigger: triggerResult.value.trigger,
          reason: "gemini_temporarily_unavailable",
          deliveryMode: "workflow_dispatch_codex_cli",
          blocker: "openai_api_key_not_configured"
        });
        if (existingFallbackComment) {
          await githubFetch(`/repos/${repository}/issues/comments/${existingFallbackComment.id}`, {
            method: "PATCH",
            body: { body: fallbackBody }
          });
          console.log(`Updated Codex fallback blocker state on PR #${prNumber}.`);
          return;
        }

        await githubFetch(`/repos/${repository}/issues/${prNumber}/comments`, {
          method: "POST",
          body: { body: fallbackBody }
        });
        console.log(`Recorded Codex fallback blocker state on PR #${prNumber}.`);
        return;
      }

      const fallbackBody = formatCodexReviewFallbackComment({
        status: "requested",
        trigger: triggerResult.value.trigger,
        reason: "gemini_temporarily_unavailable",
        deliveryMode: "workflow_dispatch_codex_cli"
      });
      if (existingFallbackComment) {
        await githubFetch(`/repos/${repository}/issues/comments/${existingFallbackComment.id}`, {
          method: "PATCH",
          body: { body: fallbackBody }
        });
      } else {
        await githubFetch(`/repos/${repository}/issues/${prNumber}/comments`, {
          method: "POST",
          body: { body: fallbackBody }
        });
      }

      await githubFetch(`/repos/${repository}/actions/workflows/codex-pr-review-fallback.yml/dispatches`, {
        method: "POST",
        body: {
          ref: pullRequest.base.ref,
          inputs: {
            target_repository: repository,
            pull_request_number: String(prNumber),
            head_ref: pullRequest.head.ref,
            base_ref: pullRequest.base.ref,
            trigger: triggerResult.value.trigger,
            reason: "gemini_temporarily_unavailable"
          }
        }
      });
      console.log(`Dispatched non-manual Codex reviewer fallback on PR #${prNumber}.`);
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
    model
  });
  const existingComment = findExistingGeminiReviewComment(issueComments);

  if (existingFallbackComment) {
    await githubFetch(`/repos/${repository}/issues/comments/${existingFallbackComment.id}`, {
      method: "DELETE"
    });
    console.log(`Cleared Codex reviewer fallback request on PR #${prNumber}.`);
  }

  if (existingComment) {
    await githubFetch(`/repos/${repository}/issues/comments/${existingComment.id}`, {
      method: "PATCH",
      body: { body: commentBody }
    });
    console.log(`Updated Gemini review comment on PR #${prNumber}.`);
    return;
  }

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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
