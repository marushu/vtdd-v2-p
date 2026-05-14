import { resolveGitHubAppInstallationToken } from "./github-app-repository-index.js";
import { normalizePullRequestMergeability } from "./github-mergeability.js";

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
  BRANCHES: "branches",
  CONTENTS: "contents"
});

export async function retrieveGitHubReadPlane(input = {}) {
  const resource = normalizeText(input.resource);
  const repository = normalizeText(input.repository);
  const issueNumber = normalizePositiveInteger(input.issueNumber);
  const pullNumber = normalizePositiveInteger(input.pullNumber);
  const branch = normalizeText(input.branch);
  const head = normalizeText(input.head);
  const ref = normalizeText(input.ref) || branch;
  const state = normalizeText(input.state) || "open";
  const limit = normalizeLimit(input.limit, 20);
  const pathValidation = validateRepositoryPath(input.path);
  const path = pathValidation.path;
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
    ref,
    pathValidation
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
    path,
    branch,
    head,
    state,
    limit,
    token: tokenResolution.token,
    fetchImpl,
    apiBaseUrl
  });
}

function validateGitHubReadRequest({ resource, repository, issueNumber, pullNumber, ref, pathValidation }) {
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

  if (resource === GitHubReadResource.CONTENTS && !pathValidation.ok) {
    issues.push(pathValidation.reason);
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
    path,
    branch,
    head,
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
    path,
    branch,
    head,
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
      path: path || null,
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
  path,
  branch,
  head,
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
      url:
        `${apiBaseUrl}/repos/${encodedRepository}/pulls?state=${encodeURIComponent(state)}&per_page=${limit}` +
        (head ? `&head=${encodeURIComponent(head)}` : "")
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

  if (resource === GitHubReadResource.CONTENTS) {
    const encodedPath = encodeRepositoryPath(path);
    const suffix = encodedPath ? `/${encodedPath}` : "";
    const url = new URL(`${apiBaseUrl}/repos/${encodedRepository}/contents${suffix}`);
    if (ref) {
      url.searchParams.set("ref", ref);
    }
    return { url: url.toString() };
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
  if (resource === GitHubReadResource.CONTENTS) {
    return Array.isArray(body) ? body.map(normalizeContentItem) : [normalizeContentItem(body)];
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
  const createdAt = normalizeText(item?.created_at);
  const updatedAt = normalizeText(item?.updated_at);
  return {
    id: normalizePositiveInteger(item?.id),
    body: normalizeText(item?.body),
    author: normalizeText(item?.user?.login),
    createdAt,
    updatedAt,
    includesCreatedEdit: Boolean(createdAt) && Boolean(updatedAt) && createdAt !== updatedAt,
    htmlUrl: normalizeText(item?.html_url)
  };
}

function normalizePullRequest(item) {
  const mergeability = normalizePullRequestMergeability(item);
  return {
    number: normalizePositiveInteger(item?.number),
    title: normalizeText(item?.title),
    state: normalizeText(item?.state),
    draft: item?.draft === true,
    headRef: normalizeText(item?.head?.ref),
    headSha: normalizeText(item?.head?.sha),
    headOwner:
      normalizeText(item?.head?.repo?.owner?.login) ||
      normalizeText(item?.head?.user?.login) ||
      normalizeText(item?.head?.repo?.full_name).split("/")[0] ||
      null,
    baseRef: normalizeText(item?.base?.ref),
    baseSha: normalizeText(item?.base?.sha),
    merged: item?.merged === true || Boolean(normalizeText(item?.merged_at)),
    mergedAt: normalizeText(item?.merged_at),
    mergeCommitSha: normalizeText(item?.merge_commit_sha),
    mergeable: mergeability.mergeable,
    mergeableState: mergeability.state,
    mergeConflict: mergeability.hasConflict,
    mergeBlocked: mergeability.blocked,
    mergeBlockedReason: mergeability.blockedReason,
    mergeWarning: mergeability.warning,
    freshBranchSuggestion: mergeability.freshBranchSuggestion,
    conflictFiles: mergeability.conflictFiles,
    conflictFilesSource: mergeability.conflictFilesSource,
    mergeability,
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
  const createdAt = normalizeText(item?.created_at);
  const updatedAt = normalizeText(item?.updated_at);
  return {
    id: normalizePositiveInteger(item?.id),
    path: normalizeText(item?.path),
    body: normalizeText(item?.body),
    author: normalizeText(item?.user?.login),
    createdAt,
    updatedAt,
    includesCreatedEdit: Boolean(createdAt) && Boolean(updatedAt) && createdAt !== updatedAt,
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

function normalizeContentItem(item) {
  const type = normalizeText(item?.type);
  const size = normalizePositiveInteger(item?.size);
  const decoded = decodeGitHubContentItem({ item, type, size });
  const content = decoded.content;
  return {
    type,
    path: normalizeText(item?.path),
    name: normalizeText(item?.name),
    sha: normalizeText(item?.sha),
    size,
    encoding: normalizeText(item?.encoding),
    contentAvailable: decoded.available,
    contentStatus: decoded.status,
    contentUnavailableReason: decoded.unavailableReason,
    content: content.slice(0, 12000),
    contentTruncated: decoded.truncated,
    truncationNotice: decoded.truncationNotice,
    snippet: content.slice(0, 4000),
    downloadUrl: normalizeText(item?.download_url),
    htmlUrl: normalizeText(item?.html_url)
  };
}

function decodeGitHubContentItem({ item, type, size }) {
  if (type !== "file") {
    return {
      available: false,
      content: "",
      status: "directory_or_non_file_entry",
      truncated: false,
      truncationNotice: null,
      unavailableReason: "contents API entry is not a file body"
    };
  }

  const encoding = normalizeText(item?.encoding);
  const hasContentField = Object.prototype.hasOwnProperty.call(item ?? {}, "content");
  const rawContent = normalizeText(item?.content);
  const sizeExceedsInlineLimit = Number.isFinite(size) && size > 12000;

  if (!rawContent && !hasContentField) {
    return {
      available: false,
      content: "",
      status: sizeExceedsInlineLimit ? "content_not_returned_large_file" : "content_not_returned",
      truncated: sizeExceedsInlineLimit,
      truncationNotice: sizeExceedsInlineLimit
        ? "content is not returned and file size exceeds inline limit; ask for a narrower path or hand off to Codex for full-file analysis"
        : null,
      unavailableReason: "GitHub response did not include file content"
    };
  }

  if (encoding && encoding !== "base64") {
    return {
      available: false,
      content: "",
      status: "unsupported_content_encoding",
      truncated: sizeExceedsInlineLimit,
      truncationNotice: sizeExceedsInlineLimit
        ? "content is not decoded and file size exceeds inline limit; ask for a narrower path or hand off to Codex for full-file analysis"
        : null,
      unavailableReason: `unsupported GitHub content encoding: ${encoding}`
    };
  }

  const decoded = decodeGitHubContent(rawContent, encoding);
  if (!decoded && rawContent) {
    return {
      available: false,
      content: "",
      status: "content_decode_failed",
      truncated: sizeExceedsInlineLimit,
      truncationNotice: sizeExceedsInlineLimit
        ? "content could not be decoded and file size exceeds inline limit; ask for a narrower path or hand off to Codex for full-file analysis"
        : null,
      unavailableReason: "GitHub file content could not be decoded"
    };
  }

  const decodedExceedsInlineLimit = decoded.length > 12000;
  return {
    available: true,
    content: decoded,
    status: decodedExceedsInlineLimit ? "content_truncated" : "content_available",
    truncated: decodedExceedsInlineLimit,
    truncationNotice: decodedExceedsInlineLimit
      ? "content is truncated; ask for a narrower path or hand off to Codex for full-file analysis"
      : null,
    unavailableReason: null
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

function encodeRepositoryPath(path) {
  return String(path ?? "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function validateRepositoryPath(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return { ok: true, path: "" };
  }

  if (text.includes("\\") || text.includes("\0")) {
    return {
      ok: false,
      path: "",
      reason: "path contains unsupported characters"
    };
  }

  const path = text.replace(/^\/+|\/+$/g, "");
  if (!path) {
    return { ok: true, path: "" };
  }

  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return {
      ok: false,
      path: "",
      reason: "path must not contain empty, dot, or dot-dot segments"
    };
  }

  return { ok: true, path };
}

function decodeGitHubContent(content, encoding) {
  if (normalizeText(encoding) !== "base64") {
    return normalizeText(content);
  }
  const compact = normalizeText(content).replace(/\s+/g, "");
  if (!compact) {
    return "";
  }
  try {
    const binary =
      typeof atob === "function"
        ? atob(compact)
        : Buffer.from(compact, "base64").toString("binary");
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
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
