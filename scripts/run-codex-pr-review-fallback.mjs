import { spawn } from "node:child_process";
import {
  ReviewerRecommendedAction,
  buildPullRequestDiff,
  buildPullRequestReviewContext,
  formatCodexReviewFallbackComment
} from "../src/core/index.js";

async function main() {
  const repository = mustGetEnv("TARGET_REPOSITORY");
  const prNumber = mustGetEnv("TARGET_PR_NUMBER");
  const trigger = mustGetEnv("CODEX_FALLBACK_TRIGGER");
  const reason = mustGetEnv("CODEX_FALLBACK_REASON");
  const githubToken = mustGetEnv("GITHUB_TOKEN");

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for non-manual Codex fallback review");
  }

  const apiBaseUrl = process.env.GITHUB_API_URL || "https://api.github.com";
  const githubFetch = createGitHubFetch({ apiBaseUrl, token: githubToken });

  const pullRequest = await githubFetch(`/repos/${repository}/pulls/${prNumber}`);
  const files = await githubFetchAll(githubFetch, `/repos/${repository}/pulls/${prNumber}/files?per_page=100`);
  const issueComments = await githubFetchAll(
    githubFetch,
    `/repos/${repository}/issues/${prNumber}/comments?per_page=100`
  );
  const reviewComments = await githubFetchAll(
    githubFetch,
    `/repos/${repository}/pulls/${prNumber}/comments?per_page=100`
  );
  const reviews = await githubFetchAll(githubFetch, `/repos/${repository}/pulls/${prNumber}/reviews?per_page=100`);
  const prDiff = buildPullRequestDiff(files);
  const context = buildPullRequestReviewContext({
    repository,
    trigger,
    pullRequest,
    files,
    issueComments,
    reviewComments,
    reviews
  });

  const prompt = buildCodexFallbackReviewPrompt({ context, prDiff });
  const review = await runCodexReview({ prompt });
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

  const latestIssueComments = await githubFetchAll(
    githubFetch,
    `/repos/${repository}/issues/${prNumber}/comments?per_page=100`
  );
  const existing = latestIssueComments.find((comment) =>
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

function buildCodexFallbackReviewPrompt({ context, prDiff }) {
  return [
    "You are the VTDD fallback reviewer.",
    "Act only as a critique-only reviewer.",
    "Do not run shell commands or inspect the filesystem.",
    "Review only the PR context and diff provided in this prompt.",
    "Do not propose merge or execution.",
    "Return strict JSON with these fields only:",
    "{",
    '  "criticalFindings": ["..."],',
    '  "risks": ["..."],',
    '  "recommendedAction": "approve|request_changes|manual_review"',
    "}",
    'If there are no major issues, set criticalFindings to ["No major blocking issues found."], risks to ["Human should still verify the PR before revision GO or merge GO + real passkey."], and recommendedAction to "approve".',
    'If the provided diff or context is insufficient for critique, set recommendedAction to "manual_review" and explain exactly what is missing.',
    "",
    "PR context:",
    context,
    "",
    "PR diff:",
    prDiff
  ].join("\n");
}

async function runCodexReview({ prompt }) {
  return spawnWithInput("codex", ["exec", "--skip-git-repo-check", "--ephemeral", "-"], prompt, {
    cwd: process.cwd(),
    env: buildCodexExecutionEnv(process.env),
    maxBuffer: 1024 * 1024 * 8
  });
}

function buildCodexExecutionEnv(env) {
  const allowedNames = [
    "CI",
    "CODEX_HOME",
    "HOME",
    "LANG",
    "LC_ALL",
    "PATH",
    "RUNNER_TEMP",
    "TMPDIR",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME"
  ];
  return Object.fromEntries(
    allowedNames
      .map((name) => [name, env[name]])
      .filter(([, value]) => typeof value === "string" && value.length > 0)
  );
}

function spawnWithInput(command, args, input, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const maxBuffer = options.maxBuffer || 1024 * 1024;
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > maxBuffer) {
        child.kill("SIGTERM");
        reject(new Error(`${command} stdout exceeded ${maxBuffer} bytes`));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > maxBuffer) {
        child.kill("SIGTERM");
        reject(new Error(`${command} stderr exceeded ${maxBuffer} bytes`));
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}: ${stderr || stdout}`));
    });
    child.stdin.end(input);
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

    const data = await response.json();
    if (options.includeHeaders) {
      return {
        data,
        link: response.headers.get("link") || ""
      };
    }

    return data;
  };
}

async function githubFetchAll(githubFetch, firstPath) {
  const records = [];
  let path = firstPath;

  while (path) {
    const page = await githubFetch(path, { includeHeaders: true });
    if (!Array.isArray(page.data)) {
      throw new Error(`Expected paginated GitHub API array for ${firstPath}`);
    }
    records.push(...page.data);
    path = parseNextLinkPath(page.link);
  }

  return records;
}

function parseNextLinkPath(linkHeader) {
  const links = String(linkHeader || "").split(",");
  for (const link of links) {
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    if (!match) {
      continue;
    }
    const url = new URL(match[1]);
    return `${url.pathname}${url.search}`;
  }
  return "";
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
