import { ActorRole } from "./types.js";

export const REMOTE_CODEX_WORKFLOW_FILE = "remote-codex-executor.yml";

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
    approvalScopeMatched: payload?.policyInput?.approvalScopeMatched === true,
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

  const controlRepository = resolveControlRepository(input?.env);
  if (!controlRepository) {
    return {
      ok: false,
      status: 503,
      error: "control_repository_unavailable",
      reason: "VTDD_GITHUB_ACTIONS_REPOSITORY must be configured"
    };
  }

  const workflowFile =
    normalizeText(input?.env?.REMOTE_CODEX_WORKFLOW_FILE) || REMOTE_CODEX_WORKFLOW_FILE;
  const workflowRef = normalizeText(input?.env?.REMOTE_CODEX_WORKFLOW_REF) || "main";
  const apiBaseUrl = normalizeText(input?.env?.GITHUB_API_BASE_URL) || "https://api.github.com";
  const fetchImpl =
    typeof input?.env?.GITHUB_API_FETCH === "function" ? input.env.GITHUB_API_FETCH.bind(input.env) : fetch;

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
        authorization: `Bearer ${token.value}`,
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

  return {
    ok: true,
    execution: {
      executionId: request.executionId,
      controlRepository,
      workflowFile,
      workflowRef,
      targetRepository: request.repository,
      issueNumber: request.issueNumber,
      branch: request.branch,
      baseRef: request.baseRef,
      codexGoal: request.codexGoal,
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

  const controlRepository = resolveControlRepository(input?.env);
  if (!controlRepository) {
    return {
      ok: false,
      status: 503,
      error: "control_repository_unavailable",
      reason: "VTDD_GITHUB_ACTIONS_REPOSITORY must be configured"
    };
  }

  const workflowFile =
    normalizeText(input?.env?.REMOTE_CODEX_WORKFLOW_FILE) || REMOTE_CODEX_WORKFLOW_FILE;
  const apiBaseUrl = normalizeText(input?.env?.GITHUB_API_BASE_URL) || "https://api.github.com";
  const fetchImpl =
    typeof input?.env?.GITHUB_API_FETCH === "function" ? input.env.GITHUB_API_FETCH.bind(input.env) : fetch;
  const progressUrl = `${apiBaseUrl}/repos/${encodeURIComponentRepository(
    controlRepository
  )}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?event=workflow_dispatch&per_page=30`;

  let response;
  try {
    response = await fetchImpl(progressUrl, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token.value}`,
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

async function resolveGitHubExecutionToken(env) {
  const directToken = normalizeText(
    env?.GITHUB_APP_INSTALLATION_TOKEN ?? env?.VTDD_GITHUB_ACTIONS_TOKEN
  );
  if (directToken) {
    return { ok: true, value: directToken };
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
