import { resolveGitHubAppInstallationToken } from "./github-app-repository-index.js";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API_USER_AGENT = "vtdd-v2-github-write-plane";

export const GitHubWriteOperation = Object.freeze({
  ISSUE_CREATE: "issue_create",
  ISSUE_COMMENT_CREATE: "issue_comment_create",
  ISSUE_COMMENT_UPDATE: "issue_comment_update",
  BRANCH_CREATE: "branch_create",
  PULL_CREATE: "pull_create",
  PULL_UPDATE: "pull_update",
  PULL_COMMENT_CREATE: "pull_comment_create"
});

export async function executeGitHubWritePlane(input = {}) {
  const operation = normalizeText(input.operation);
  const repository = normalizeText(input.repository);
  const issueNumber = normalizePositiveInteger(input.issueNumber);
  const pullNumber = normalizePositiveInteger(input.pullNumber);
  const commentId = normalizePositiveInteger(input.commentId);
  const branch = normalizeText(input.branch);
  const baseRef = normalizeText(input.baseRef) || "main";
  const title = normalizeText(input.title);
  const body = normalizeBody(input.body);
  const head = normalizeText(input.head) || branch;
  const env = input.env ?? {};
  const fetchImpl = resolveGitHubWriteFetch(env);
  const apiBaseUrl = normalizeApiBaseUrl(env?.GITHUB_API_BASE_URL);

  const validation = validateGitHubWriteRequest({
    operation,
    repository,
    issueNumber,
    pullNumber,
    commentId,
    branch,
    head,
    title,
    body,
    approvalPhrase: normalizeText(input.approvalPhrase),
    targetConfirmed: input.targetConfirmed === true,
    approvalScopeMatched: input.approvalScopeMatched === true
  });
  if (!validation.ok) {
    return {
      ok: false,
      status: 422,
      error: "github_write_request_invalid",
      reason: validation.issues.join(", "),
      issues: validation.issues
    };
  }

  const tokenResolution = await resolveGitHubAppInstallationToken({ env, fetchImpl, apiBaseUrl });
  if (!tokenResolution.ok) {
    return {
      ok: false,
      status: 503,
      error: "github_write_unavailable",
      reason: tokenResolution.warning || "GitHub App installation token is unavailable"
    };
  }

  return dispatchGitHubWrite({
    operation,
    repository,
    issueNumber,
    pullNumber,
    commentId,
    branch,
    baseRef,
    title,
    body,
    head,
    token: tokenResolution.token,
    fetchImpl,
    apiBaseUrl
  });
}

function validateGitHubWriteRequest(input) {
  const issues = [];
  if (!Object.values(GitHubWriteOperation).includes(input.operation)) {
    issues.push("operation is unsupported");
  }
  if (!input.repository) {
    issues.push("repository is required");
  }
  if (!input.targetConfirmed) {
    issues.push("targetConfirmed must be true");
  }
  if (!input.approvalScopeMatched) {
    issues.push("approvalScopeMatched must be true");
  }
  if (normalizeText(input.approvalPhrase).toUpperCase() !== "GO") {
    issues.push("approvalPhrase must be GO");
  }

  if (
    (input.operation === GitHubWriteOperation.ISSUE_COMMENT_CREATE ||
      input.operation === GitHubWriteOperation.ISSUE_COMMENT_UPDATE) &&
    !input.issueNumber
  ) {
    issues.push("issueNumber is required for issue comment operations");
  }

  if (input.operation === GitHubWriteOperation.ISSUE_COMMENT_UPDATE && !input.commentId) {
    issues.push("commentId is required for issue comment update");
  }

  if (
    (input.operation === GitHubWriteOperation.ISSUE_CREATE ||
      input.operation === GitHubWriteOperation.ISSUE_COMMENT_CREATE ||
      input.operation === GitHubWriteOperation.ISSUE_COMMENT_UPDATE ||
      input.operation === GitHubWriteOperation.PULL_CREATE ||
      input.operation === GitHubWriteOperation.PULL_COMMENT_CREATE) &&
    !input.body
  ) {
    issues.push("body is required for this operation");
  }

  if (input.operation === GitHubWriteOperation.ISSUE_CREATE && !input.title) {
    issues.push("title is required for issue creation");
  }

  if (input.operation === GitHubWriteOperation.BRANCH_CREATE && !input.branch) {
    issues.push("branch is required for branch creation");
  }

  if (input.operation === GitHubWriteOperation.PULL_CREATE) {
    if (!input.title) {
      issues.push("title is required for pull creation");
    }
    if (!input.head) {
      issues.push("head or branch is required for pull creation");
    }
  }

  if (input.operation === GitHubWriteOperation.PULL_UPDATE) {
    if (!input.pullNumber) {
      issues.push("pullNumber is required for pull update");
    }
    if (!input.title && !input.body) {
      issues.push("title or body is required for pull update");
    }
  }

  if (input.operation === GitHubWriteOperation.PULL_COMMENT_CREATE && !input.pullNumber) {
    issues.push("pullNumber is required for pull comment creation");
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

async function dispatchGitHubWrite(input) {
  const request = await buildGitHubWriteRequest(input);
  if (!request.ok) {
    return request;
  }

  let response;
  try {
    response = await input.fetchImpl(request.url, {
      method: request.method,
      headers: githubJsonHeaders({ token: input.token }),
      body: request.body ? JSON.stringify(request.body) : undefined
    });
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: "github_write_failed",
      reason: `failed to execute GitHub write operation: ${input.operation}`,
      issues: ["github_write_fetch_exception"],
      diagnostics: buildGitHubWriteFetchExceptionDiagnostics({
        operation: input.operation,
        method: request.method,
        url: request.url,
        error
      })
    };
  }

  const responseBody = await readJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "github_write_failed",
      reason: normalizeText(responseBody?.message) || `GitHub write failed for ${input.operation}`
    };
  }

  return {
    ok: true,
    write: normalizeGitHubWriteResult({
      operation: input.operation,
      repository: input.repository,
      issueNumber: input.issueNumber,
      pullNumber: input.pullNumber,
      branch: input.branch,
      baseRef: input.baseRef,
      responseBody
    })
  };
}

async function buildGitHubWriteRequest(input) {
  const encodedRepository = encodeURIComponentRepository(input.repository);

  if (input.operation === GitHubWriteOperation.ISSUE_CREATE) {
    return {
      ok: true,
      method: "POST",
      url: `${input.apiBaseUrl}/repos/${encodedRepository}/issues`,
      body: {
        title: input.title,
        body: input.body
      }
    };
  }

  if (input.operation === GitHubWriteOperation.ISSUE_COMMENT_CREATE) {
    return {
      ok: true,
      method: "POST",
      url: `${input.apiBaseUrl}/repos/${encodedRepository}/issues/${input.issueNumber}/comments`,
      body: { body: input.body }
    };
  }

  if (input.operation === GitHubWriteOperation.ISSUE_COMMENT_UPDATE) {
    return {
      ok: true,
      method: "PATCH",
      url: `${input.apiBaseUrl}/repos/${encodedRepository}/issues/comments/${input.commentId}`,
      body: { body: input.body }
    };
  }

  if (input.operation === GitHubWriteOperation.BRANCH_CREATE) {
    const resolvedSha = await resolveRefSha({
      repository: input.repository,
      ref: input.baseRef,
      token: input.token,
      fetchImpl: input.fetchImpl,
      apiBaseUrl: input.apiBaseUrl
    });
    if (!resolvedSha.ok) {
      return resolvedSha;
    }

    return {
      ok: true,
      method: "POST",
      url: `${input.apiBaseUrl}/repos/${encodedRepository}/git/refs`,
      body: {
        ref: `refs/heads/${input.branch}`,
        sha: resolvedSha.sha
      }
    };
  }

  if (input.operation === GitHubWriteOperation.PULL_CREATE) {
    return {
      ok: true,
      method: "POST",
      url: `${input.apiBaseUrl}/repos/${encodedRepository}/pulls`,
      body: {
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.baseRef
      }
    };
  }

  if (input.operation === GitHubWriteOperation.PULL_UPDATE) {
    return {
      ok: true,
      method: "PATCH",
      url: `${input.apiBaseUrl}/repos/${encodedRepository}/pulls/${input.pullNumber}`,
      body: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.body ? { body: input.body } : {})
      }
    };
  }

  if (input.operation === GitHubWriteOperation.PULL_COMMENT_CREATE) {
    return {
      ok: true,
      method: "POST",
      url: `${input.apiBaseUrl}/repos/${encodedRepository}/issues/${input.pullNumber}/comments`,
      body: { body: input.body }
    };
  }

  return {
    ok: false,
    status: 422,
    error: "github_write_request_invalid",
    reason: "operation is unsupported"
  };
}

async function resolveRefSha({ repository, ref, token, fetchImpl, apiBaseUrl }) {
  const encodedRepository = encodeURIComponentRepository(repository);
  let response;
  try {
    response = await fetchImpl(
      `${apiBaseUrl}/repos/${encodedRepository}/git/ref/heads/${encodeURIComponent(ref)}`,
      {
        method: "GET",
        headers: githubJsonHeaders({ token })
      }
    );
  } catch {
    return {
      ok: false,
      status: 503,
      error: "github_write_failed",
      reason: `failed to resolve base ref sha for ${ref}`
    };
  }

  const body = await readJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "github_write_failed",
      reason: normalizeText(body?.message) || `failed to resolve base ref sha for ${ref}`
    };
  }

  const sha = normalizeText(body?.object?.sha);
  if (!sha) {
    return {
      ok: false,
      status: 503,
      error: "github_write_failed",
      reason: `base ref ${ref} did not return a sha`
    };
  }

  return { ok: true, sha };
}

function normalizeGitHubWriteResult(input) {
  const responseBody = input.responseBody ?? {};
  return {
    operation: input.operation,
    repository: input.repository,
    issueNumber: input.issueNumber ?? normalizePositiveInteger(responseBody?.number) ?? null,
    pullNumber: normalizePositiveInteger(responseBody?.number) ?? input.pullNumber ?? null,
    branch: input.branch || null,
    baseRef: input.baseRef || null,
    commentId: normalizePositiveInteger(responseBody?.id),
    nodeId: normalizeText(responseBody?.node_id) || null,
    url: normalizeText(responseBody?.html_url) || null,
    state: normalizeText(responseBody?.state) || null,
    title: normalizeText(responseBody?.title) || null,
    ref: normalizeText(responseBody?.ref) || null
  };
}

function githubJsonHeaders({ token }) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json; charset=utf-8",
    "x-github-api-version": GITHUB_API_VERSION,
    "user-agent": GITHUB_API_USER_AGENT
  };
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeBody(value) {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text.trim();
}

function normalizePositiveInteger(value) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeApiBaseUrl(value) {
  const normalized = normalizeText(value);
  return normalized || GITHUB_API_BASE_URL;
}

function encodeURIComponentRepository(repository) {
  return repository
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function resolveGitHubWriteFetch(env) {
  if (typeof env?.GITHUB_API_FETCH === "function") {
    return env.GITHUB_API_FETCH.bind(env);
  }
  return globalThis.fetch.bind(globalThis);
}

function buildGitHubWriteFetchExceptionDiagnostics({ operation, method, url, error }) {
  return {
    operation,
    requestMethod: method,
    requestUrl: sanitizeGitHubWriteDiagnosticText(url),
    exceptionName: sanitizeGitHubWriteDiagnosticText(error?.name || "Error"),
    exceptionMessage: sanitizeGitHubWriteDiagnosticText(error?.message || error)
  };
}

function sanitizeGitHubWriteDiagnosticText(value) {
  return normalizeText(value)
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_OPENAI_KEY]")
    .replace(/gh[psuro]_[A-Za-z0-9_]+/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/Bearer\s+[A-Za-z0-9_.=-]+/gi, "Bearer [REDACTED]")
    .replace(/(authorization|api[_-]?key|token|secret)(["'\s:=]+)([^"'\s<>&]+)/gi, "$1$2[REDACTED]")
    .replace(/\/Users\/[^\s"'<>]+/g, "/Users/[REDACTED_PATH]")
    .slice(0, 500);
}
