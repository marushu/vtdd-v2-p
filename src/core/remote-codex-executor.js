import { ActorRole } from "./types.js";
import { resolveGitHubAppInstallationToken } from "./github-app-repository-index.js";
import { isBoundRemoteCodexHandoff } from "./remote-codex-handoff-scope.js";

export const REMOTE_CODEX_WORKFLOW_FILE = "remote-codex-executor.yml";

export const RemoteCodexExecutorTransport = Object.freeze({
  CODEX_CLOUD_GITHUB_COMMENT: "codex_cloud_github_comment",
  API_KEY_RUNNER: "api_key_runner"
});

export const RemoteCodexExecutionStatus = Object.freeze({
  QUEUED: "queued",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  UNKNOWN: "unknown"
});

export function createRemoteCodexExecutionRequest(input = {}) {
  const gatewayResult = input?.gatewayResult ?? {};
  const payload = input?.payload ?? {};
  const issueContext = normalizeObject(payload.issueContext);
  const runtimeState = normalizeObject(payload?.policyInput?.runtimeTruth?.runtimeState);
  const continuationContext = normalizeObject(payload.continuationContext);
  const handoff = normalizeObject(continuationContext.handoff);
  const approvalScopeMatched =
    payload?.policyInput?.approvalScopeMatched === true ||
    isBoundRemoteCodexHandoff({
      continuationContext,
      issueContext,
      policyInput: payload?.policyInput
    });

  const issueNumber = normalizePositiveInteger(
    issueContext.issueNumber ?? handoff.relatedIssue ?? payload.relatedIssue
  );
  const request = {
    executionId: normalizeText(input?.executionId) || buildExecutionId({ issueNumber }),
    actorRole: normalizeText(payload.actorRole),
    repository: normalizeText(gatewayResult.repository),
    issueNumber,
    branch:
      normalizeText(runtimeState.activeBranch) ||
      normalizeText(payload?.executionTarget?.branch) ||
      (issueNumber ? `codex/issue-${issueNumber}` : ""),
    baseRef:
      normalizeText(payload?.executionTarget?.baseRef) ||
      normalizeText(runtimeState.baseRef) ||
      "main",
    codexGoal: normalizeText(gatewayResult?.executionContinuity?.codexGoal),
    approvalPhrase: normalizeText(payload?.policyInput?.approvalPhrase),
    targetConfirmed: payload?.policyInput?.targetConfirmed === true,
    approvalScopeMatched,
    handoffRequired: continuationContext.requiresHandoff === true,
    handoff:
      Object.keys(handoff).length > 0
        ? {
            issueTraceable: handoff.issueTraceable === true,
            approvalScopeMatched: handoff.approvalScopeMatched === true,
            summary: normalizeText(handoff.summary),
            relatedIssue: normalizePositiveInteger(handoff.relatedIssue)
          }
        : null
  };

  const issues = [];
  if (request.actorRole !== ActorRole.BUTLER) {
    issues.push("remote Codex execution must be initiated from Butler role");
  }
  if (!request.repository) {
    issues.push("repository is required");
  }
  if (!request.issueNumber) {
    issues.push("issueNumber is required");
  }
  if (!request.branch) {
    issues.push("branch is required");
  }
  if (!request.codexGoal) {
    issues.push("codexGoal is required");
  }
  if (!request.baseRef) {
    issues.push("baseRef is required");
  }
  if (!request.targetConfirmed) {
    issues.push("targetConfirmed must be true");
  }
  if (!request.approvalScopeMatched) {
    issues.push("approvalScopeMatched must be true");
  }
  if (!request.approvalPhrase) {
    issues.push("approvalPhrase is required");
  }
  if (request.handoffRequired && !request.handoff) {
    issues.push("handoff is required when handoffRequired is true");
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, request };
}

export async function dispatchRemoteCodexExecution(input = {}) {
  const requestValidation = createRemoteCodexExecutionRequest(input);
  if (!requestValidation.ok) {
    return {
      ok: false,
      status: 422,
      blockedByRule: "remote_codex_execution_request_invalid",
      reason: "remote Codex execution request is invalid",
      issues: requestValidation.issues
    };
  }

  const request = requestValidation.request;
  const token = await resolveGitHubExecutionToken(input?.env);
  if (!token.ok) {
    return {
      ok: false,
      status: 503,
      error: "github_execution_token_unavailable",
      reason: token.reason
    };
  }

  const transport = resolveExecutorTransport(input, { requireRequestAcknowledgment: true });
  if (!transport.ok) {
    return {
      ok: false,
      status: 422,
      error: transport.error,
      reason: transport.reason,
      issues: transport.issues
    };
  }
  if (transport.value === RemoteCodexExecutorTransport.CODEX_CLOUD_GITHUB_COMMENT) {
    return dispatchCodexCloudGitHubComment({ request, token: token.value, env: input?.env });
  }

  return dispatchApiBackedWorkflow({ request, token: token.value, env: input?.env });
}

async function dispatchApiBackedWorkflow({ request, token, env }) {
  const controlRepository = resolveControlRepository(env);
  if (!controlRepository) {
    return {
      ok: false,
      status: 503,
      error: "control_repository_unavailable",
      reason: "VTDD_GITHUB_ACTIONS_REPOSITORY must be configured"
    };
  }

  const workflowFile =
    normalizeText(env?.REMOTE_CODEX_WORKFLOW_FILE) || REMOTE_CODEX_WORKFLOW_FILE;
  const workflowRef = normalizeText(env?.REMOTE_CODEX_WORKFLOW_REF) || "main";
  const apiBaseUrl = normalizeText(env?.GITHUB_API_BASE_URL) || "https://api.github.com";
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;

  const dispatchUrl = `${apiBaseUrl}/repos/${encodeURIComponentRepository(
    controlRepository
  )}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`;
  const dispatchBody = {
    ref: workflowRef,
    inputs: {
      execution_id: request.executionId,
      target_repository: request.repository,
      target_issue_number: String(request.issueNumber),
      target_branch: request.branch,
      base_ref: request.baseRef,
      codex_goal: request.codexGoal,
      approval_phrase: request.approvalPhrase,
      handoff_json: request.handoff ? JSON.stringify(request.handoff) : ""
    }
  };

  let response;
  try {
    response = await fetchImpl(dispatchUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json; charset=utf-8",
        "x-github-api-version": "2022-11-28",
        "user-agent": "vtdd-v2-remote-codex-executor"
      },
      body: JSON.stringify(dispatchBody)
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error: "remote_codex_dispatch_failed",
      reason: "failed to dispatch remote Codex workflow"
    };
  }

  if (!response.ok) {
    const body = await readJsonSafe(response);
    return {
      ok: false,
      status: response.status,
      error: "remote_codex_dispatch_failed",
      reason: normalizeText(body?.message) || "GitHub workflow dispatch failed"
    };
  }

  const progress = await retrieveApiBackedWorkflowProgress({
    executionId: request.executionId,
    token,
    env
  });

  return {
    ok: true,
    execution: {
      executionId: request.executionId,
      transport: RemoteCodexExecutorTransport.API_KEY_RUNNER,
      controlRepository,
      workflowFile,
      workflowRef,
      targetRepository: request.repository,
      issueNumber: request.issueNumber,
      branch: request.branch,
      baseRef: request.baseRef,
      codexGoal: request.codexGoal,
      approvalScopeMatched: request.approvalScopeMatched,
      workflowRunId: progress.ok ? progress.progress.workflowRunId : null,
      workflowUrl: progress.ok ? progress.progress.workflowUrl : null,
      workflowConclusion: progress.ok ? progress.progress.conclusion : null,
      progressLookup: progress.ok
        ? null
        : {
            error: progress.error,
            reason: progress.reason
          },
      status: RemoteCodexExecutionStatus.QUEUED
    }
  };
}

export async function retrieveRemoteCodexExecutionProgress(input = {}) {
  const executionId = normalizeText(input?.executionId);
  if (!executionId) {
    return {
      ok: false,
      status: 422,
      error: "execution_id_required",
      reason: "executionId is required"
    };
  }

  const token = await resolveGitHubExecutionToken(input?.env);
  if (!token.ok) {
    return {
      ok: false,
      status: 503,
      error: "github_execution_token_unavailable",
      reason: token.reason
    };
  }

  const transport = resolveExecutorTransport(input, { requireRequestAcknowledgment: false });
  if (!transport.ok) {
    return {
      ok: false,
      status: 422,
      error: transport.error,
      reason: transport.reason,
      issues: transport.issues
    };
  }
  if (transport.value === RemoteCodexExecutorTransport.CODEX_CLOUD_GITHUB_COMMENT) {
    return retrieveCodexCloudGitHubCommentProgress({
      executionId,
      repository: normalizeText(input?.repository),
      issueNumber: normalizePositiveInteger(input?.issueNumber),
      branch: normalizeText(input?.branch),
      token: token.value,
      env: input?.env
    });
  }

  return retrieveApiBackedWorkflowProgress({ executionId, token: token.value, env: input?.env });
}

async function retrieveApiBackedWorkflowProgress({ executionId, token, env }) {
  const controlRepository = resolveControlRepository(env);
  if (!controlRepository) {
    return {
      ok: false,
      status: 503,
      error: "control_repository_unavailable",
      reason: "VTDD_GITHUB_ACTIONS_REPOSITORY must be configured"
    };
  }

  const workflowFile =
    normalizeText(env?.REMOTE_CODEX_WORKFLOW_FILE) || REMOTE_CODEX_WORKFLOW_FILE;
  const apiBaseUrl = normalizeText(env?.GITHUB_API_BASE_URL) || "https://api.github.com";
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  const progressUrl = `${apiBaseUrl}/repos/${encodeURIComponentRepository(
    controlRepository
  )}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?event=workflow_dispatch&per_page=30`;

  let response;
  try {
    response = await fetchImpl(progressUrl, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "vtdd-v2-remote-codex-executor"
      }
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error: "remote_codex_progress_failed",
      reason: "failed to read remote Codex workflow progress"
    };
  }

  const body = await readJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "remote_codex_progress_failed",
      reason: normalizeText(body?.message) || "GitHub workflow runs lookup failed"
    };
  }

  const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
  const run = runs.find((item) => matchesExecutionId(item, executionId));
  if (!run) {
    return {
      ok: false,
      status: 404,
      error: "remote_codex_execution_not_found",
      reason: "no remote Codex workflow run matched executionId"
    };
  }

  return {
    ok: true,
    progress: {
      executionId,
      controlRepository,
      workflowFile,
      workflowRunId: normalizePositiveInteger(run.id),
      workflowUrl: normalizeText(run.html_url) || null,
      status: normalizeRunStatus(run.status),
      conclusion: normalizeText(run.conclusion) || null,
      branch: normalizeText(run.head_branch) || null,
      displayTitle: normalizeText(run.display_title) || null,
      startedAt: normalizeText(run.run_started_at) || null,
      updatedAt: normalizeText(run.updated_at) || null
    }
  };
}

async function dispatchCodexCloudGitHubComment({ request, token, env }) {
  const apiBaseUrl = normalizeText(env?.GITHUB_API_BASE_URL) || "https://api.github.com";
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  const commentUrl = `${apiBaseUrl}/repos/${encodeURIComponentRepository(
    request.repository
  )}/issues/${encodeURIComponent(String(request.issueNumber))}/comments`;
  const body = buildCodexCloudGitHubComment({ request });

  let response;
  try {
    response = await fetchImpl(commentUrl, {
      method: "POST",
      headers: githubJsonHeaders({ token }),
      body: JSON.stringify({ body })
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error: "remote_codex_dispatch_failed",
      reason: "failed to post Codex Cloud GitHub delegation comment"
    };
  }

  const responseBody = await readJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "remote_codex_dispatch_failed",
      reason: normalizeText(responseBody?.message) || "GitHub issue comment creation failed"
    };
  }

  return {
    ok: true,
    execution: {
      executionId: request.executionId,
      transport: RemoteCodexExecutorTransport.CODEX_CLOUD_GITHUB_COMMENT,
      targetRepository: request.repository,
      issueNumber: request.issueNumber,
      branch: request.branch,
      baseRef: request.baseRef,
      codexGoal: request.codexGoal,
      approvalScopeMatched: request.approvalScopeMatched,
      commentId: normalizePositiveInteger(responseBody?.id),
      commentUrl: normalizeText(responseBody?.html_url) || null,
      status: RemoteCodexExecutionStatus.QUEUED
    }
  };
}

async function retrieveCodexCloudGitHubCommentProgress({
  executionId,
  repository,
  issueNumber,
  branch,
  token,
  env
}) {
  if (!repository || !issueNumber) {
    return {
      ok: false,
      status: 422,
      error: "remote_codex_progress_scope_required",
      reason: "repository and issueNumber are required for Codex Cloud GitHub comment progress"
    };
  }

  const apiBaseUrl = normalizeText(env?.GITHUB_API_BASE_URL) || "https://api.github.com";
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  const commentsUrl = `${apiBaseUrl}/repos/${encodeURIComponentRepository(
    repository
  )}/issues/${encodeURIComponent(String(issueNumber))}/comments?per_page=100`;

  let commentsResponse;
  try {
    commentsResponse = await fetchImpl(commentsUrl, {
      method: "GET",
      headers: githubJsonHeaders({ token })
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error: "remote_codex_progress_failed",
      reason: "failed to read Codex Cloud delegation comments"
    };
  }

  const commentsBody = await readJsonSafe(commentsResponse);
  if (!commentsResponse.ok) {
    return {
      ok: false,
      status: commentsResponse.status,
      error: "remote_codex_progress_failed",
      reason: normalizeText(commentsBody?.message) || "GitHub issue comments lookup failed"
    };
  }

  const comments = Array.isArray(commentsBody) ? commentsBody : [];
  const delegationComment = comments.find((comment) =>
    normalizeText(comment?.body).includes(`vtdd:remote-codex-execution:${executionId}`)
  );
  if (!delegationComment) {
    return {
      ok: false,
      status: 404,
      error: "remote_codex_execution_not_found",
      reason: "no Codex Cloud GitHub delegation comment matched executionId"
    };
  }

  const pullRequest = branch
    ? await findPullRequestForBranch({ repository, branch, token, env })
    : { ok: true, pullRequest: null };
  if (!pullRequest.ok) {
    return pullRequest;
  }

  return {
    ok: true,
    progress: {
      executionId,
      transport: RemoteCodexExecutorTransport.CODEX_CLOUD_GITHUB_COMMENT,
      targetRepository: repository,
      issueNumber,
      branch: branch || null,
      delegationCommentId: normalizePositiveInteger(delegationComment.id),
      delegationCommentUrl: normalizeText(delegationComment.html_url) || null,
      status: pullRequest.pullRequest
        ? RemoteCodexExecutionStatus.COMPLETED
        : RemoteCodexExecutionStatus.QUEUED,
      pullRequest: pullRequest.pullRequest
    }
  };
}

async function findPullRequestForBranch({ repository, branch, token, env }) {
  const apiBaseUrl = normalizeText(env?.GITHUB_API_BASE_URL) || "https://api.github.com";
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  const [owner] = repository.split("/");
  const pullsUrl = `${apiBaseUrl}/repos/${encodeURIComponentRepository(
    repository
  )}/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}&per_page=10`;

  let response;
  try {
    response = await fetchImpl(pullsUrl, {
      method: "GET",
      headers: githubJsonHeaders({ token })
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error: "remote_codex_progress_failed",
      reason: "failed to read pull requests for Codex Cloud delegation"
    };
  }

  const body = await readJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "remote_codex_progress_failed",
      reason: normalizeText(body?.message) || "GitHub pull request lookup failed"
    };
  }

  const pull = Array.isArray(body) ? body[0] : null;
  return {
    ok: true,
    pullRequest: pull
      ? {
          number: normalizePositiveInteger(pull.number),
          url: normalizeText(pull.html_url) || null,
          state: normalizeText(pull.state) || null,
          title: normalizeText(pull.title) || null
        }
      : null
  };
}

function buildCodexCloudGitHubComment({ request }) {
  const lines = [
    `<!-- vtdd:remote-codex-execution:${request.executionId} -->`,
    "@codex",
    "",
    "VTDD-managed Codex Cloud delegation request.",
    "",
    "Bounded execution contract:",
    `- Repository: ${request.repository}`,
    `- Issue: #${request.issueNumber}`,
    `- Branch: ${request.branch}`,
    `- Base ref: ${request.baseRef}`,
    `- Goal: ${request.codexGoal}`,
    "- Canonical spec: this GitHub Issue",
    "- Runtime truth: current GitHub branch / diff / PR / review comments",
    "- Completion target: create or update a pull request",
    "",
    "Rules:",
    "- Do not expand scope beyond the Issue.",
    "- Do not merge.",
    "- Do not deploy.",
    "- Preserve reviewer objections for Butler/human judgment.",
    "- If the Issue or runtime truth is insufficient, stop and comment with the blocked reason."
  ];

  if (request.handoff) {
    lines.push("", "Handoff:", fencedJson(request.handoff));
  }

  return lines.join("\n");
}

function resolveExecutorTransport(input = {}, options = {}) {
  const requestValue = normalizeText(
    input?.executorTransport ??
      input?.payload?.executorTransport ??
      input?.payload?.continuationContext?.executorTransport
  );
  const envValue = normalizeText(input?.env?.REMOTE_CODEX_EXECUTOR_TRANSPORT);
  const value = requestValue || envValue;
  if (value === RemoteCodexExecutorTransport.API_KEY_RUNNER) {
    const requestSelected = requestValue === RemoteCodexExecutorTransport.API_KEY_RUNNER;
    const acknowledged =
      input?.apiKeyRunnerAcknowledged === true ||
      input?.payload?.apiKeyRunnerAcknowledged === true ||
      input?.payload?.continuationContext?.apiKeyRunnerAcknowledged === true;
    if (requestSelected && options.requireRequestAcknowledgment !== false && !acknowledged) {
      return {
        ok: false,
        error: "api_key_runner_approval_required",
        reason: "api_key_runner requires explicit human approval because it uses OPENAI_API_KEY",
        issues: ["api_key_runner_acknowledgment_required"]
      };
    }
    return { ok: true, value: RemoteCodexExecutorTransport.API_KEY_RUNNER };
  }
  return { ok: true, value: RemoteCodexExecutorTransport.CODEX_CLOUD_GITHUB_COMMENT };
}

function githubJsonHeaders({ token }) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json; charset=utf-8",
    "x-github-api-version": "2022-11-28",
    "user-agent": "vtdd-v2-remote-codex-executor"
  };
}

function fencedJson(value) {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

async function resolveGitHubExecutionToken(env) {
  const directToken = normalizeText(
    env?.GITHUB_APP_INSTALLATION_TOKEN ?? env?.VTDD_GITHUB_ACTIONS_TOKEN
  );
  if (directToken) {
    return { ok: true, value: directToken };
  }

  const mintedToken = await resolveGitHubAppInstallationToken({
    env,
    fetchImpl: typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch,
    apiBaseUrl: normalizeText(env?.GITHUB_API_BASE_URL) || "https://api.github.com"
  });
  if (mintedToken.ok) {
    return { ok: true, value: mintedToken.token };
  }
  if (mintedToken.warning) {
    return {
      ok: false,
      reason: mintedToken.warning
    };
  }

  const provider = env?.GITHUB_APP_INSTALLATION_TOKEN_PROVIDER;
  if (typeof provider === "function") {
    try {
      const provided = normalizeText(await provider());
      if (provided) {
        return { ok: true, value: provided };
      }
    } catch {
      return {
        ok: false,
        reason: "GitHub execution token provider failed"
      };
    }
  }

  return {
    ok: false,
    reason: "GitHub execution token is not configured"
  };
}

function resolveControlRepository(env) {
  return normalizeText(env?.VTDD_GITHUB_ACTIONS_REPOSITORY ?? env?.GITHUB_REPOSITORY);
}

function matchesExecutionId(run, executionId) {
  const displayTitle = normalizeText(run?.display_title);
  const name = normalizeText(run?.name);
  return displayTitle.includes(executionId) || name.includes(executionId);
}

function normalizeRunStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "queued" || normalized === "waiting" || normalized === "requested") {
    return RemoteCodexExecutionStatus.QUEUED;
  }
  if (normalized === "in_progress" || normalized === "pending" || normalized === "action_required") {
    return RemoteCodexExecutionStatus.IN_PROGRESS;
  }
  if (normalized === "completed") {
    return RemoteCodexExecutionStatus.COMPLETED;
  }
  return RemoteCodexExecutionStatus.UNKNOWN;
}

function buildExecutionId({ issueNumber }) {
  const issuePart = issueNumber ? `issue${issueNumber}` : "issue0";
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `remote-codex-${issuePart}-${randomPart}`;
}

function encodeURIComponentRepository(repository) {
  return repository
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
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

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
