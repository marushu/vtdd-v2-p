import { resolveGitHubAppInstallationToken } from "./github-app-repository-index.js";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API_USER_AGENT = "vtdd-v2-github-read-plane";
const INSTALLATION_REPOSITORIES_PATH = "/installation/repositories";

export const GitHubReadResource = Object.freeze({
  REPOSITORIES: "repositories",
  ISSUES: "issues",
  ISSUE_COMMENTS: "issue_comments",
  PULLS: "pulls",
  PULL_REVIEWS: "pull_reviews",
  PULL_REVIEW_COMMENTS: "pull_review_comments",
  CHECKS: "checks",
  WORKFLOW_RUNS: "workflow_runs",
  BRANCHES: "branches"
});

export async function retrieveGitHubReadPlane(input = {}) {
  const resource = normalizeText(input.resource);
  const repository = normalizeText(input.repository);
  const issueNumber = normalizePositiveInteger(input.issueNumber);
  const pullNumber = normalizePositiveInteger(input.pullNumber);
  const branch = normalizeText(input.branch);
  const ref = normalizeText(input.ref) || branch;
  const state = normalizeText(input.state) || "open";
  const limit = normalizeLimit(input.limit, 20);
  const env = input.env ?? {};
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  const apiBaseUrl = normalizeApiBaseUrl(env?.GITHUB_API_BASE_URL);

  const tokenResolution = await resolveGitHubAppInstallationToken({ env, fetchImpl, apiBaseUrl });
  if (!tokenResolution.ok) {
    return {
      ok: false,
      status: 503,
      error: "github_read_unavailable",
      reason: tokenResolution.warning || "GitHub App installation token is unavailable"
    };
  }

  const validation = validateGitHubReadRequest({
    resource,
    repository,
    issueNumber,
    pullNumber,
    ref
  });
  if (!validation.ok) {
    return {
      ok: false,
      status: 422,
      error: "github_read_request_invalid",
      reason: validation.issues.join(", "),
      issues: validation.issues
    };
  }

  return fetchGitHubReadResource({
    resource,
    repository,
    issueNumber,
    pullNumber,
    ref,
    branch,
    state,
    limit,
    token: tokenResolution.token,
    fetchImpl,
    apiBaseUrl
  });
}

function validateGitHubReadRequest({ resource, repository, issueNumber, pullNumber, ref }) {
  const issues = [];
  if (!Object.values(GitHubReadResource).includes(resource)) {
    issues.push("resource is unsupported");
  }

  if (resource !== GitHubReadResource.REPOSITORIES && !repository) {
    issues.push("repository is required");
  }

  if (resource === GitHubReadResource.ISSUE_COMMENTS && !issueNumber) {
    issues.push("issueNumber is required for issue_comments");
  }

  if (
    (resource === GitHubReadResource.PULL_REVIEWS ||
      resource === GitHubReadResource.PULL_REVIEW_COMMENTS) &&
    !pullNumber
  ) {
    issues.push("pullNumber is required for pull review resources");
  }

  if (resource === GitHubReadResource.CHECKS && !ref) {
    issues.push("ref or branch is required for checks");
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

async function fetchGitHubReadResource(input) {
  const {
    resource,
    repository,
    issueNumber,
    pullNumber,
    ref,
    branch,
    state,
    limit,
    token,
    fetchImpl,
    apiBaseUrl
  } = input;

  const request = buildGitHubReadRequest({
    resource,
    repository,
    issueNumber,
    pullNumber,
    ref,
    branch,
    state,
    limit,
    apiBaseUrl
  });

  let response;
  try {
    response = await fetchImpl(request.url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": GITHUB_API_VERSION,
        "user-agent": GITHUB_API_USER_AGENT
      }
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error: "github_read_failed",
      reason: `failed to read GitHub resource: ${resource}`
    };
  }

  const body = await readJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "github_read_failed",
      reason: normalizeText(body?.message) || `GitHub read failed for ${resource}`
    };
  }

  return {
    ok: true,
    read: {
      resource,
      repository: repository || null,
      issueNumber: issueNumber || null,
      pullNumber: pullNumber || null,
      branch: branch || null,
      ref: ref || null,
      state,
      records: normalizeGitHubReadRecords(resource, body)
    }
  };
}

function buildGitHubReadRequest({
  resource,
  repository,
  issueNumber,
  pullNumber,
  ref,
  branch,
  state,
  limit,
  apiBaseUrl
}) {
  const encodedRepository = repository ? encodeURIComponentRepository(repository) : "";

  if (resource === GitHubReadResource.REPOSITORIES) {
    return {
      url: `${apiBaseUrl}${INSTALLATION_REPOSITORIES_PATH}?per_page=${limit}`
    };
  }

  if (resource === GitHubReadResource.ISSUES) {
    if (issueNumber) {
      return {
        url: `${apiBaseUrl}/repos/${encodedRepository}/issues/${issueNumber}`
      };
    }
    return {
      url: `${apiBaseUrl}/repos/${encodedRepository}/issues?state=${encodeURIComponent(state)}&per_page=${limit}`
    };
  }

  if (resource === GitHubReadResource.ISSUE_COMMENTS) {
    return {
      url: `${apiBaseUrl}/repos/${encodedRepository}/issues/${issueNumber}/comments?per_page=${limit}`
    };
  }

  if (resource === GitHubReadResource.PULLS) {
    if (pullNumber) {
      return {
        url: `${apiBaseUrl}/repos/${encodedRepository}/pulls/${pullNumber}`
      };
    }
    return {
      url: `${apiBaseUrl}/repos/${encodedRepository}/pulls?state=${encodeURIComponent(state)}&per_page=${limit}`
    };
  }

  if (resource === GitHubReadResource.PULL_REVIEWS) {
    return {
      url: `${apiBaseUrl}/repos/${encodedRepository}/pulls/${pullNumber}/reviews?per_page=${limit}`
    };
  }

  if (resource === GitHubReadResource.PULL_REVIEW_COMMENTS) {
    return {
      url: `${apiBaseUrl}/repos/${encodedRepository}/pulls/${pullNumber}/comments?per_page=${limit}`
    };
  }

  if (resource === GitHubReadResource.CHECKS) {
    return {
      url: `${apiBaseUrl}/repos/${encodedRepository}/commits/${encodeURIComponent(ref)}/check-runs?per_page=${limit}`
    };
  }

  if (resource === GitHubReadResource.WORKFLOW_RUNS) {
    const url = new URL(`${apiBaseUrl}/repos/${encodedRepository}/actions/runs`);
    url.searchParams.set("per_page", String(limit));
    if (branch) {
      url.searchParams.set("branch", branch);
    }
    return { url: url.toString() };
  }

  if (resource === GitHubReadResource.BRANCHES) {
    if (branch) {
      return {
        url: `${apiBaseUrl}/repos/${encodedRepository}/branches/${encodeURIComponent(branch)}`
      };
    }
    return {
      url: `${apiBaseUrl}/repos/${encodedRepository}/branches?per_page=${limit}`
    };
  }

  return { url: `${apiBaseUrl}/repos/${encodedRepository}` };
}

function normalizeGitHubReadRecords(resource, body) {
  if (resource === GitHubReadResource.REPOSITORIES) {
    return normalizeRepositories(body?.repositories ?? []);
  }
  if (resource === GitHubReadResource.ISSUES) {
    if (Array.isArray(body)) {
      return body.filter((item) => !item?.pull_request).map(normalizeIssue);
    }
    return body?.pull_request ? [] : [normalizeIssue(body)];
  }
  if (resource === GitHubReadResource.ISSUE_COMMENTS) {
    return Array.isArray(body) ? body.map(normalizeIssueComment) : [];
  }
  if (resource === GitHubReadResource.PULLS) {
    return Array.isArray(body) ? body.map(normalizePullRequest) : [normalizePullRequest(body)];
  }
  if (resource === GitHubReadResource.PULL_REVIEWS) {
    return Array.isArray(body) ? body.map(normalizePullReview) : [];
  }
  if (resource === GitHubReadResource.PULL_REVIEW_COMMENTS) {
    return Array.isArray(body) ? body.map(normalizePullReviewComment) : [];
  }
  if (resource === GitHubReadResource.CHECKS) {
    return Array.isArray(body?.check_runs) ? body.check_runs.map(normalizeCheckRun) : [];
  }
  if (resource === GitHubReadResource.WORKFLOW_RUNS) {
    return Array.isArray(body?.workflow_runs) ? body.workflow_runs.map(normalizeWorkflowRun) : [];
  }
  if (resource === GitHubReadResource.BRANCHES) {
    return Array.isArray(body) ? body.map(normalizeBranch) : [normalizeBranch(body)];
  }
  return [];
}

function normalizeRepositories(items) {
  return items.map((item) => ({
    fullName: normalizeText(item?.full_name),
    name: normalizeText(item?.name),
    visibility: item?.private === true ? "private" : "public",
    defaultBranch: normalizeText(item?.default_branch),
    htmlUrl: normalizeText(item?.html_url)
  }));
}

function normalizeIssue(item) {
  return {
    number: normalizePositiveInteger(item?.number),
    title: normalizeText(item?.title),
    body: normalizeText(item?.body),
    state: normalizeText(item?.state),
    htmlUrl: normalizeText(item?.html_url),
    author: normalizeText(item?.user?.login)
  };
}

function normalizeIssueComment(item) {
  return {
    id: normalizePositiveInteger(item?.id),
    body: normalizeText(item?.body),
    author: normalizeText(item?.user?.login),
    createdAt: normalizeText(item?.created_at),
    htmlUrl: normalizeText(item?.html_url)
  };
}

function normalizePullRequest(item) {
  return {
    number: normalizePositiveInteger(item?.number),
    title: normalizeText(item?.title),
    state: normalizeText(item?.state),
    draft: item?.draft === true,
    headRef: normalizeText(item?.head?.ref),
    baseRef: normalizeText(item?.base?.ref),
    htmlUrl: normalizeText(item?.html_url)
  };
}

function normalizePullReview(item) {
  return {
    id: normalizePositiveInteger(item?.id),
    state: normalizeText(item?.state),
    body: normalizeText(item?.body),
    author: normalizeText(item?.user?.login),
    submittedAt: normalizeText(item?.submitted_at),
    htmlUrl: normalizeText(item?.html_url)
  };
}

function normalizePullReviewComment(item) {
  return {
    id: normalizePositiveInteger(item?.id),
    path: normalizeText(item?.path),
    body: normalizeText(item?.body),
    author: normalizeText(item?.user?.login),
    createdAt: normalizeText(item?.created_at),
    htmlUrl: normalizeText(item?.html_url)
  };
}

function normalizeCheckRun(item) {
  return {
    id: normalizePositiveInteger(item?.id),
    name: normalizeText(item?.name),
    status: normalizeText(item?.status),
    conclusion: normalizeText(item?.conclusion),
    htmlUrl: normalizeText(item?.html_url)
  };
}

function normalizeWorkflowRun(item) {
  return {
    id: normalizePositiveInteger(item?.id),
    name: normalizeText(item?.name),
    status: normalizeText(item?.status),
    conclusion: normalizeText(item?.conclusion),
    headBranch: normalizeText(item?.head_branch),
    htmlUrl: normalizeText(item?.html_url)
  };
}

function normalizeBranch(item) {
  return {
    name: normalizeText(item?.name),
    protected: item?.protected === true,
    sha: normalizeText(item?.commit?.sha),
    htmlUrl: normalizeText(item?.commit?.url)
  };
}

function readJsonSafe(response) {
  return response
    .json()
    .catch(async () => ({ message: normalizeText(await response.text().catch(() => "")) }));
}

function encodeURIComponentRepository(repository) {
  return String(repository ?? "")
    .trim()
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function normalizeApiBaseUrl(value) {
  const text = normalizeText(value);
  return text ? text.replace(/\/+$/, "") : GITHUB_API_BASE_URL;
}

function normalizeLimit(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 100);
}

function normalizePositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
