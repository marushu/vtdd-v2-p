import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ReviewerRecommendedAction,
  formatCodexReviewFallbackComment
} from "../src/core/index.js";

const execFileAsync = promisify(execFile);

async function main() {
  const repository = mustGetEnv("TARGET_REPOSITORY");
  const prNumber = mustGetEnv("TARGET_PR_NUMBER");
  const baseRef = mustGetEnv("TARGET_BASE_REF");
  const trigger = mustGetEnv("CODEX_FALLBACK_TRIGGER");
  const reason = mustGetEnv("CODEX_FALLBACK_REASON");
  const githubToken = mustGetEnv("GITHUB_TOKEN");

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for non-manual Codex fallback review");
  }

  const prompt = [
    "You are the VTDD fallback reviewer.",
    "Act only as a critique-only reviewer.",
    "Do not propose merge or execution.",
    "Review the current branch diff against the provided base branch.",
    "Return strict JSON with these fields only:",
    '{',
    '  "criticalFindings": ["..."],',
    '  "risks": ["..."],',
    '  "recommendedAction": "approve|request_changes|manual_review"',
    '}',
    "If there are no major issues, set criticalFindings to [\"No major blocking issues found.\"], risks to [\"Human should still verify the PR before GO.\"], and recommendedAction to \"approve\"."
  ].join("\n");

  const review = await runCodexReview({ baseRef, prompt });
  const parsed = parseReviewerJson(review.stdout);
  const normalizedReview = normalizeReviewerResult(parsed, review.stdout);

  const body = formatCodexReviewFallbackComment({
    status: "completed",
    trigger,
    reason,
    deliveryMode: "workflow_dispatch_codex_cli",
    recommendedAction: normalizedReview.recommendedAction,
    criticalFindings: normalizedReview.criticalFindings,
    risks: normalizedReview.risks,
    rawReview: review.stdout
  });

  const apiBaseUrl = process.env.GITHUB_API_URL || "https://api.github.com";
  const githubFetch = createGitHubFetch({ apiBaseUrl, token: githubToken });
  const existingComments = await githubFetch(`/repos/${repository}/issues/${prNumber}/comments?per_page=100`);
  const existing = existingComments.find((comment) =>
    String(comment?.body || "").includes("<!-- vtdd:reviewer=codex-fallback -->")
  );

  if (existing) {
    await githubFetch(`/repos/${repository}/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: { body }
    });
    console.log(`Updated Codex fallback review comment on PR #${prNumber}.`);
    return;
  }

  await githubFetch(`/repos/${repository}/issues/${prNumber}/comments`, {
    method: "POST",
    body: { body }
  });
  console.log(`Created Codex fallback review comment on PR #${prNumber}.`);
}

async function runCodexReview({ baseRef, prompt }) {
  return execFileAsync("codex", ["review", "--base", baseRef, "-"], {
    cwd: process.cwd(),
    env: process.env,
    input: prompt,
    maxBuffer: 1024 * 1024 * 8
  });
}

function parseReviewerJson(output) {
  const text = String(output ?? "").trim();
  if (!text) {
    return null;
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normalizeReviewerResult(parsed, rawOutput) {
  const criticalFindings = normalizeStringArray(parsed?.criticalFindings);
  const risks = normalizeStringArray(parsed?.risks);
  const recommendedAction = normalizeRecommendedAction(parsed?.recommendedAction);

  if (criticalFindings.length > 0 || risks.length > 0) {
    return {
      criticalFindings,
      risks,
      recommendedAction
    };
  }

  return {
    criticalFindings: ["Codex fallback review returned unstructured output."],
    risks: [
      "Human should inspect the raw Codex review output before revision GO or merge GO + real passkey."
    ],
    recommendedAction: ReviewerRecommendedAction.MANUAL_REVIEW
  };
}

function normalizeRecommendedAction(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return Object.values(ReviewerRecommendedAction).includes(normalized)
    ? normalized
    : ReviewerRecommendedAction.MANUAL_REVIEW;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
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
        "user-agent": "vtdd-v2-codex-fallback-reviewer"
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
