import { evaluateApprovalGrant } from "./passkey-approval.js";
import { resolveGitHubAppInstallationToken } from "./github-app-repository-index.js";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API_USER_AGENT = "vtdd-v2-github-high-risk-plane";

export const GitHubHighRiskOperation = Object.freeze({
  PULL_MERGE: "pull_merge",
  ISSUE_CLOSE: "issue_close"
});

export async function executeGitHubHighRiskPlane(input = {}) {
  const operation = normalizeText(input.operation);
  const repository = normalizeText(input.repository);
  const issueNumber = normalizePositiveInteger(input.issueNumber);
  const pullNumber = normalizePositiveInteger(input.pullNumber);
  const mergeMethod = normalizeMergeMethod(input.mergeMethod);
  const commitTitle = normalizeText(input.commitTitle);
  const commitMessage = normalizeBody(input.commitMessage);
  const approvalPhrase = normalizeText(input.approvalPhrase);
  const targetConfirmed = input.targetConfirmed === true;
  const approvalScope = input.approvalScope ?? null;
  const approvalGrant = input.approvalGrant ?? null;
  const env = input.env ?? {};
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  const apiBaseUrl = normalizeApiBaseUrl(env?.GITHUB_API_BASE_URL);

  const validation = validateGitHubHighRiskRequest({
    operation,
    repository,
    issueNumber,
    pullNumber,
    mergeMethod,
    approvalPhrase,
    targetConfirmed,
    approvalGrant,
    approvalScope
  });
  if (!validation.ok) {
    return {
      ok: false,
      status: 422,
      error: "github_high_risk_request_invalid",
      reason: validation.issues.join(", "),
      issues: validation.issues
    };
  }

  const tokenResolution = await resolveGitHubAppInstallationToken({ env, fetchImpl, apiBaseUrl });
  if (!tokenResolution.ok) {
    return {
      ok: false,
      status: 503,
      error: "github_high_risk_unavailable",
      reason: tokenResolution.warning || "GitHub App installation token is unavailable"
    };
  }

  return dispatchGitHubHighRisk({
    operation,
    repository,
    issueNumber,
    pullNumber,
    mergeMethod,
    commitTitle,
    commitMessage,
    token: tokenResolution.token,
    fetchImpl,
    apiBaseUrl
  });
}

function validateGitHubHighRiskRequest(input) {
  const issues = [];

  if (!Object.values(GitHubHighRiskOperation).includes(input.operation)) {
    issues.push("operation is unsupported");
  }
  if (!input.repository) {
    issues.push("repository is required");
  }
  if (!input.targetConfirmed) {
    issues.push("targetConfirmed must be true");
  }
  if (normalizeText(input.approvalPhrase).toUpperCase() !== "GO") {
    issues.push("approvalPhrase must be GO");
  }
  if (!input.issueNumber) {
    issues.push("issueNumber is required to bind the approval scope");
  }
  if (!input.pullNumber) {
    issues.push("pullNumber is required");
  }
  if (
    input.operation === GitHubHighRiskOperation.PULL_MERGE &&
    input.mergeMethod &&
    !["merge", "squash", "rebase"].includes(input.mergeMethod)
  ) {
    issues.push("mergeMethod must be merge, squash, or rebase");
  }

  const grantResult = evaluateApprovalGrant({
    approvalGrant: input.approvalGrant,
    scope: input.approvalScope
  });
  if (!grantResult.ok) {
    issues.push(grantResult.reason);
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

async function dispatchGitHubHighRisk(input) {
  if (input.operation === GitHubHighRiskOperation.PULL_MERGE) {
    return executePullMerge(input);
  }

  if (input.operation === GitHubHighRiskOperation.ISSUE_CLOSE) {
    return executeBoundedIssueClose(input);
  }

  return {
    ok: false,
    status: 422,
    error: "github_high_risk_request_invalid",
    reason: "operation is unsupported"
  };
}

async function executePullMerge(input) {
  const encodedRepository = encodeURIComponentRepository(input.repository);
  let response;
  try {
    response = await input.fetchImpl(
      `${input.apiBaseUrl}/repos/${encodedRepository}/pulls/${input.pullNumber}/merge`,
      {
        method: "PUT",
        headers: githubJsonHeaders({ token: input.token }),
        body: JSON.stringify(
          compactObject({
            merge_method: input.mergeMethod || "squash",
            commit_title: input.commitTitle || undefined,
            commit_message: input.commitMessage || undefined
          })
        )
      }
    );
  } catch {
    return {
      ok: false,
      status: 503,
      error: "github_high_risk_failed",
      reason: "failed to execute GitHub merge"
    };
  }

  const responseBody = await readJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "github_high_risk_failed",
      reason: normalizeText(responseBody?.message) || "GitHub merge failed"
    };
  }

  return {
    ok: true,
    authorityAction: {
      operation: input.operation,
      repository: input.repository,
      pullNumber: input.pullNumber,
      merged: responseBody?.merged === true,
      sha: normalizeText(responseBody?.sha) || null,
      message: normalizeText(responseBody?.message) || null,
      htmlUrl: `https://github.com/${input.repository}/pull/${input.pullNumber}`
    }
  };
}

async function executeBoundedIssueClose(input) {
  const encodedRepository = encodeURIComponentRepository(input.repository);

  let prResponse;
  try {
    prResponse = await input.fetchImpl(
      `${input.apiBaseUrl}/repos/${encodedRepository}/pulls/${input.pullNumber}`,
      {
        method: "GET",
        headers: githubJsonHeaders({ token: input.token })
      }
    );
  } catch {
    return {
      ok: false,
      status: 503,
      error: "github_high_risk_failed",
      reason: "failed to verify merged pull request state"
    };
  }

  const prBody = await readJsonSafe(prResponse);
  if (!prResponse.ok) {
    return {
      ok: false,
      status: prResponse.status,
      error: "github_high_risk_failed",
      reason: normalizeText(prBody?.message) || "failed to read pull request before issue close"
    };
  }

  if (!normalizeText(prBody?.merged_at)) {
    return {
      ok: false,
      status: 422,
      error: "github_high_risk_request_invalid",
      reason: "bounded issue close requires a merged pull request"
    };
  }

  let closeResponse;
  try {
    closeResponse = await input.fetchImpl(
      `${input.apiBaseUrl}/repos/${encodedRepository}/issues/${input.issueNumber}`,
      {
        method: "PATCH",
        headers: githubJsonHeaders({ token: input.token }),
        body: JSON.stringify({ state: "closed" })
      }
    );
  } catch {
    return {
      ok: false,
      status: 503,
      error: "github_high_risk_failed",
      reason: "failed to execute bounded issue close"
    };
  }

  const closeBody = await readJsonSafe(closeResponse);
  if (!closeResponse.ok) {
    return {
      ok: false,
      status: closeResponse.status,
      error: "github_high_risk_failed",
      reason: normalizeText(closeBody?.message) || "GitHub issue close failed"
    };
  }

  return {
    ok: true,
    authorityAction: {
      operation: input.operation,
      repository: input.repository,
      issueNumber: input.issueNumber,
      pullNumber: input.pullNumber,
      issueState: normalizeText(closeBody?.state) || "closed",
      mergedAt: normalizeText(prBody?.merged_at) || null,
      htmlUrl:
        normalizeText(closeBody?.html_url) || `https://github.com/${input.repository}/issues/${input.issueNumber}`
    }
  };
}

function githubJsonHeaders({ token }) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "x-github-api-version": GITHUB_API_VERSION,
    "user-agent": GITHUB_API_USER_AGENT
  };
}

function compactObject(input = {}) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function normalizePositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeMergeMethod(value) {
  const text = normalizeText(value).toLowerCase();
  return text || null;
}

function normalizeBody(value) {
  const text = String(value ?? "");
  return text.trim() ? text : "";
}

function normalizeApiBaseUrl(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.replace(/\/+$/, "") : GITHUB_API_BASE_URL;
}

function encodeURIComponentRepository(repository) {
  return repository
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
