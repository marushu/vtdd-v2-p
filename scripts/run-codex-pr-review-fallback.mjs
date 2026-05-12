import { spawn } from "node:child_process";
import {
  ReviewerRecommendedAction,
  buildPullRequestDiff,
  buildPullRequestReviewContext,
  findExistingCodexReviewFallbackComment,
  formatCodexReviewFallbackComment,
  parseCodexReviewFallbackComment,
  resolveOperatorMention
} from "../src/core/index.js";

const CODEX_FALLBACK_DIFF_CHARACTERS = 180000;

async function main() {
  const repository = mustGetEnv("TARGET_REPOSITORY");
  const prNumber = mustGetEnv("TARGET_PR_NUMBER");
  const trigger = mustGetEnv("CODEX_FALLBACK_TRIGGER");
  const reason = mustGetEnv("CODEX_FALLBACK_REASON");
  const githubToken = mustGetEnv("GITHUB_TOKEN");
  const deliveryMode = process.env.CODEX_FALLBACK_DELIVERY_MODE || "workflow_dispatch_codex_cli";

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
  const existingFallbackComment = findExistingCodexReviewFallbackComment(issueComments);
  const prDiff = buildPullRequestDiff(files, { maxCharacters: CODEX_FALLBACK_DIFF_CHARACTERS });
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
  let review;
  try {
    review = await runCodexReview({ prompt });
  } catch (error) {
    const failure = classifyCodexFallbackFailure(error);
    await upsertCodexFallbackComment({
      githubFetch,
      repository,
      prNumber,
      body: formatCodexReviewFallbackComment({
        status: "blocked",
        trigger,
        reason,
        deliveryMode,
        blocker: failure.blocker,
        rawReview: failure.rawFailure,
        notificationMention: shouldMentionCodexFallback({
          existingComment: existingFallbackComment,
          status: "blocked"
        })
          ? resolveOperatorMention([pullRequest?.user?.login])
          : ""
      })
    });
    console.log(`Recorded Codex fallback blocker state on PR #${prNumber}: ${failure.blocker}.`);
    return;
  }
  const parsed = parseReviewerJson(review.stdout);
  const normalizedReview = normalizeReviewerResult(parsed, review.stdout);

  const body = formatCodexReviewFallbackComment({
    status: "completed",
    trigger,
    reason,
    deliveryMode,
    recommendedAction: normalizedReview.recommendedAction,
    criticalFindings: normalizedReview.criticalFindings,
    risks: normalizedReview.risks,
    rawReview: review.stdout,
    notificationMention: shouldMentionCodexFallback({
      existingComment: existingFallbackComment,
      status: "completed",
      recommendedAction: normalizedReview.recommendedAction
    })
      ? resolveOperatorMention([pullRequest?.user?.login])
      : ""
  });

  const result = await upsertCodexFallbackComment({
    githubFetch,
    repository,
    prNumber,
    body
  });
  console.log(`${result === "updated" ? "Updated" : "Created"} Codex fallback review comment on PR #${prNumber}.`);
}

function buildCodexFallbackReviewPrompt({ context, prDiff }) {
  return [
    "あなたは VTDD の fallback reviewer です。",
    "批判専用の reviewer としてだけ振る舞ってください。",
    "shell command の実行や filesystem の検査はしないでください。",
    "この prompt に含まれる PR context と diff だけを review してください。",
    "merge や実行の提案はしないでください。",
    "criticalFindings[] と risks[] の各説明文は日本語で書いてください。",
    "ファイルパス、コード識別子、API 名、enum 値は原文のままで構いません。",
    "generated `worker.js` の diff は reviewer prompt では意図的に省略されます。source diff と PR body の `check:generated-worker` evidence で整合性を確認してください。",
    "reviewer marker の writeback workflow は GitHub App token を mint して `GITHUB_TOKEN` に使う設計です。comment author は `vtdd-codex` / `vtdd-codex[bot]` を trusted とし、一般 user comment は trusted marker として扱いません。",
    "Return strict JSON with these fields only:",
    "{",
    '  "criticalFindings": ["..."],',
    '  "risks": ["..."],',
    '  "recommendedAction": "approve|request_changes|manual_review"',
    "}",
    '重大な問題がない場合は criticalFindings を ["重大な blocking issue は見つかりません。"], risks を ["revision GO または merge GO + real passkey の前に、人間が PR を最終確認する必要があります。"], recommendedAction を "approve" にしてください。',
    '提供された diff や context が批判レビューに不足している場合は recommendedAction を "manual_review" にし、何が不足しているかを日本語で具体的に説明してください。',
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
    criticalFindings: ["Codex fallback review が構造化されていない出力を返しました。"],
    risks: [
      "revision GO または merge GO + real passkey の前に、人間が Codex review の生出力を確認する必要があります。"
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

function shouldMentionCodexFallback({ existingComment, status, recommendedAction }) {
  const existing = parseCodexReviewFallbackComment(existingComment);
  if (!existing) {
    return true;
  }
  const nextStatus = String(status || "").trim().toLowerCase();
  const nextAction = String(recommendedAction || "").trim().toLowerCase() || null;
  return existing.status !== nextStatus || existing.recommendedAction !== nextAction;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

async function upsertCodexFallbackComment({ githubFetch, repository, prNumber, body }) {
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
    return "updated";
  }

  await githubFetch(`/repos/${repository}/issues/${prNumber}/comments`, {
    method: "POST",
    body: { body }
  });
  return "created";
}

function classifyCodexFallbackFailure(error) {
  const raw = String(error?.message || error || "");
  const lowered = raw.toLowerCase();
  let blocker = "codex_fallback_review_failed";

  if (lowered.includes("quota exceeded")) {
    blocker = "openai_quota_exceeded";
  } else if (
    lowered.includes("not authenticated") ||
    lowered.includes("login") ||
    lowered.includes("missing bearer") ||
    lowered.includes("401") ||
    lowered.includes("unauthorized") ||
    lowered.includes("api key")
  ) {
    blocker = "openai_api_key_invalid_or_missing";
  } else if (lowered.includes("rate limit")) {
    blocker = "openai_rate_limited";
  }

  return {
    blocker,
    rawFailure: summarizeCodexFallbackFailure(raw)
  };
}

function summarizeCodexFallbackFailure(raw) {
  const text = String(raw || "").replace(/\r/g, "");
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const salient = lines.filter((line) =>
    /error|quota|missing bearer|unauthorized|rate limit|failed with exit code/i.test(line)
  );
  const summary = (salient.length > 0 ? salient : lines).slice(0, 12).join("\n");
  return summary.slice(0, 4000) || "Codex fallback review failed without visible stderr/stdout.";
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
