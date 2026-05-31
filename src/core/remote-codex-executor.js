import { ActorRole } from "./types.js";
import { resolveGitHubAppInstallationToken } from "./github-app-repository-index.js";
import { isBoundRemoteCodexHandoff } from "./remote-codex-handoff-scope.js";
import { buildExecutionLeadTime } from "./execution-lead-time.js";

export const REMOTE_CODEX_WORKFLOW_FILE = "remote-codex-executor.yml";

export const RemoteCodexExecutorTransport = Object.freeze({
  CODEX_CLOUD_GITHUB_COMMENT: "codex_cloud_github_comment",
  CODEX_CLOUD_CLI_CONTROL_RUNNER: "codex_cloud_cli_control_runner",
  VPS_RUNNER: "vps_runner",
  API_KEY_RUNNER: "api_key_runner"
});

const REMOTE_CODEX_EXECUTOR_TRANSPORT_REGISTRY = Object.freeze({
  [RemoteCodexExecutorTransport.CODEX_CLOUD_GITHUB_COMMENT]: Object.freeze({
    id: RemoteCodexExecutorTransport.CODEX_CLOUD_GITHUB_COMMENT,
    label: "Codex Cloud GitHub comment transport",
    ownerBoundary: "operator_owned_chatgpt_codex_github_integration",
    credentialModel: "chatgpt_managed_codex_github_integration",
    billingModel: "chatgpt_codex_subscription_no_openai_api_key",
    default: true,
    optIn: false,
    requestOnlyUntilRuntimeEvidence: true,
    successEvidence: ["github_branch", "github_pull_request"]
  }),
  [RemoteCodexExecutorTransport.CODEX_CLOUD_CLI_CONTROL_RUNNER]: Object.freeze({
    id: RemoteCodexExecutorTransport.CODEX_CLOUD_CLI_CONTROL_RUNNER,
    label: "Codex Cloud CLI control runner",
    ownerBoundary: "user_owned_private_control_repository_or_trusted_runner",
    credentialModel: "chatgpt_managed_codex_auth_json",
    billingModel: "chatgpt_codex_subscription_plus_user_owned_runner_cost",
    default: false,
    optIn: true,
    usesOpenAiApiKey: false,
    successEvidence: ["github_workflow_run", "github_branch", "github_pull_request"]
  }),
  [RemoteCodexExecutorTransport.VPS_RUNNER]: Object.freeze({
    id: RemoteCodexExecutorTransport.VPS_RUNNER,
    label: "User-owned VPS runner",
    ownerBoundary: "user_owned_trusted_persistent_host",
    credentialModel: "user_owned_runner_credentials",
    billingModel: "user_owned_vps_cost",
    default: false,
    optIn: true,
    implemented: true,
    requestQueue: "github_issue_comment",
    successEvidence: ["runner_execution_log", "github_branch", "github_pull_request"]
  }),
  [RemoteCodexExecutorTransport.API_KEY_RUNNER]: Object.freeze({
    id: RemoteCodexExecutorTransport.API_KEY_RUNNER,
    label: "OpenAI API key runner",
    ownerBoundary: "user_owned_control_repository_or_trusted_runner",
    credentialModel: "openai_api_key",
    billingModel: "openai_api_billing_separate_from_chatgpt_codex_subscription",
    default: false,
    optIn: true,
    usesOpenAiApiKey: true,
    successEvidence: ["github_workflow_run", "github_branch", "github_pull_request"]
  })
});

export const RemoteCodexExecutionStatus = Object.freeze({
  QUEUED: "queued",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  BLOCKED: "blocked",
  CANCELED: "canceled",
  UNKNOWN: "unknown"
});

export const VpsRunnerCancelMode = Object.freeze({
  EXECUTION: "execution",
  ISSUE_PENDING: "issue_pending",
  DRAIN_PENDING: "drain_pending"
});

export const RemoteCodexDispatchGoal = Object.freeze({
  OPEN_PR: "open_pr",
  REVISE_PR: "revise_pr",
  RESPOND_TO_REVIEW: "respond_to_review",
  POST_MERGE_VERIFY: "post_merge_verify"
});

const REMOTE_CODEX_DISPATCH_GOALS = new Set(Object.values(RemoteCodexDispatchGoal));

export function getRemoteCodexExecutorTransportRegistry() {
  return REMOTE_CODEX_EXECUTOR_TRANSPORT_REGISTRY;
}

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
  const codexGoal =
    normalizeText(continuationContext.codexGoal) ||
    normalizeText(payload?.executionTarget?.codexGoal) ||
    normalizeText(gatewayResult?.executionContinuity?.codexGoal);
  const revisionTarget = normalizeRevisionTarget({
    runtimeState,
    executionTarget: normalizeObject(payload?.executionTarget),
    handoff
  });
  const revisionTargetConflicts = collectRevisionTargetConflicts({
    executionTarget: normalizeObject(payload?.executionTarget),
    handoff
  });
  const baseRef =
    normalizeText(payload?.executionTarget?.baseRef) ||
    normalizeText(runtimeState.baseRef) ||
    normalizeText(revisionTarget.baseRef) ||
    "main";
  const request = {
    executionId: normalizeText(input?.executionId) || buildExecutionId({ issueNumber }),
    actorRole: normalizeText(payload.actorRole),
    repository: normalizeText(gatewayResult.repository),
    issueNumber,
    branch:
      (codexGoal === RemoteCodexDispatchGoal.POST_MERGE_VERIFY ? baseRef : "") ||
      (codexGoal === RemoteCodexDispatchGoal.REVISE_PR ? revisionTarget.headRef : "") ||
      normalizeText(runtimeState.activeBranch) ||
      normalizeText(payload?.executionTarget?.branch) ||
      (issueNumber ? `codex/issue-${issueNumber}` : ""),
    baseRef,
    codexGoal,
    approvalPhrase: normalizeText(payload?.policyInput?.approvalPhrase),
    approvalActor:
      normalizeText(payload?.policyInput?.approvalActor) ||
      normalizeText(payload?.policyInput?.goActor) ||
      normalizeText(payload?.sender?.login),
    targetConfirmed: payload?.policyInput?.targetConfirmed === true,
    approvalScopeMatched,
    issueTraceability: {
      canonicalSpec: "github_issue",
      issueNumber,
      relatedIssue: issueNumber,
      issueTraceable: issueNumber > 0
    },
    preflightPolicy: buildExecutionPreflightPolicy({ codexGoal }),
    handoffRequired: continuationContext.requiresHandoff === true,
    revisionTarget,
    handoff:
      Object.keys(handoff).length > 0
        ? {
            issueTraceable: handoff.issueTraceable === true,
            approvalScopeMatched: handoff.approvalScopeMatched === true,
            summary: normalizeText(handoff.summary),
            relatedIssue: normalizePositiveInteger(handoff.relatedIssue),
            ownerMessage: normalizeText(handoff.ownerMessage),
            repositoryInput: normalizeText(handoff.repositoryInput),
            dashboardThreadId: normalizeText(handoff.dashboardThreadId),
            developmentStrategy: normalizeDevelopmentStrategy(handoff.developmentStrategy),
            targetPullRequest: revisionTarget
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
  } else if (!REMOTE_CODEX_DISPATCH_GOALS.has(request.codexGoal)) {
    issues.push("codexGoal must be open_pr, revise_pr, respond_to_review, or post_merge_verify");
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
  if (request.codexGoal === RemoteCodexDispatchGoal.REVISE_PR) {
    issues.push(...validateRevisionTarget(request));
    issues.push(...revisionTargetConflicts);
  }
  if (request.codexGoal === RemoteCodexDispatchGoal.POST_MERGE_VERIFY) {
    issues.push(...validatePostMergeVerificationTarget(request));
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, request };
}

function normalizeDevelopmentStrategy(value) {
  const strategy = normalizeObject(value);
  if (!strategy || Object.keys(strategy).length === 0) {
    return undefined;
  }

  return {
    evidencePath: normalizeText(strategy.evidencePath),
    completionExperience: normalizeText(strategy.completionExperience),
    vtddArea: normalizeText(strategy.vtddArea),
    design: normalizeText(strategy.design),
    hypothesis: normalizeText(strategy.hypothesis),
    verificationPlan: normalizeText(strategy.verificationPlan),
    changeEstimate: normalizeText(strategy.changeEstimate),
    knownPath: normalizeText(strategy.knownPath),
    unknownBoundary: normalizeText(strategy.unknownBoundary),
    likelyGaps: normalizeText(strategy.likelyGaps),
    prePrChecks: normalizeText(strategy.prePrChecks),
    optionsRejected: normalizeText(strategy.optionsRejected),
    postMergeE2E: normalizeText(strategy.postMergeE2E),
    noNextPrReason: normalizeText(strategy.noNextPrReason),
    stopCondition: normalizeText(strategy.stopCondition)
  };
}

function validateRevisionTarget(request) {
  const issues = [];
  const target = request.revisionTarget;
  if (!target.number) {
    issues.push("revise_pr requires target PR number from runtime truth or handoff");
  }
  if (!target.headRef) {
    issues.push("revise_pr requires target PR headRef from runtime truth or handoff");
  }
  if (!target.headSha) {
    issues.push("revise_pr requires target PR headSha from runtime truth or handoff");
  }
  if (target.state !== "open") {
    issues.push("revise_pr target PR must be open");
  }
  if (target.headRef && request.branch !== target.headRef) {
    issues.push("revise_pr branch must match target PR headRef");
  }
  return issues;
}

function validatePostMergeVerificationTarget(request) {
  const issues = [];
  const target = request.revisionTarget;
  if (!target.number) {
    issues.push("post_merge_verify requires target PR number from runtime truth or handoff");
  }
  if (target.state && !["closed", "merged"].includes(target.state)) {
    issues.push("post_merge_verify target PR must be closed or merged");
  }
  if (target.merged === false) {
    issues.push("post_merge_verify target PR must be merged");
  }
  if (request.branch !== request.baseRef) {
    issues.push("post_merge_verify branch must match baseRef");
  }
  return issues;
}

function normalizeRevisionTarget({ runtimeState, executionTarget, handoff }) {
  const pullRequest = normalizeObject(runtimeState.pullRequest);
  const handoffTarget = normalizeObject(
    handoff.targetPullRequest ?? handoff.pullRequest ?? handoff.pr
  );
  const executionTargetPull = normalizeObject(executionTarget.pullRequest);
  const target = {
    number: normalizePositiveInteger(
      executionTarget.prNumber ??
        executionTarget.pullRequestNumber ??
        executionTargetPull.number ??
        handoff.prNumber ??
        handoff.pullRequestNumber ??
        handoffTarget.number ??
        pullRequest.number
    ),
    url:
      normalizeText(executionTarget.prUrl) ||
      normalizeText(executionTargetPull.url) ||
      normalizeText(handoff.prUrl) ||
      normalizeText(handoffTarget.url) ||
      normalizeText(pullRequest.url) ||
      null,
    state:
      normalizeText(
        executionTarget.prState ||
          executionTargetPull.state ||
          handoff.prState ||
          handoffTarget.state ||
          pullRequest.state
      ).toLowerCase() ||
      null,
    headRef:
      normalizeText(executionTarget.headRef) ||
      normalizeText(executionTargetPull.headRef) ||
      normalizeText(executionTargetPull.head?.ref) ||
      normalizeText(handoff.headRef) ||
      normalizeText(handoffTarget.headRef) ||
      normalizeText(handoffTarget.head?.ref) ||
      normalizeText(pullRequest.headRef) ||
      normalizeText(pullRequest.head?.ref) ||
      null,
    headSha:
      normalizeText(executionTarget.headSha) ||
      normalizeText(executionTargetPull.headSha) ||
      normalizeText(executionTargetPull.head?.sha) ||
      normalizeText(handoff.headSha) ||
      normalizeText(handoffTarget.headSha) ||
      normalizeText(handoffTarget.head?.sha) ||
      normalizeText(pullRequest.headSha) ||
      normalizeText(pullRequest.head?.sha) ||
      null
  };
  const baseRef =
    normalizeText(executionTarget.baseRef) ||
    normalizeText(executionTargetPull.baseRef) ||
    normalizeText(executionTargetPull.base?.ref) ||
    normalizeText(handoff.baseRef) ||
    normalizeText(handoffTarget.baseRef) ||
    normalizeText(handoffTarget.base?.ref) ||
    normalizeText(pullRequest.baseRef) ||
    normalizeText(pullRequest.base?.ref);
  const merged =
    typeof executionTarget.merged === "boolean"
      ? executionTarget.merged
      : typeof executionTargetPull.merged === "boolean"
        ? executionTargetPull.merged
        : typeof handoff.merged === "boolean"
          ? handoff.merged
          : typeof handoffTarget.merged === "boolean"
            ? handoffTarget.merged
            : typeof pullRequest.merged === "boolean"
              ? pullRequest.merged
              : null;
  const mergedAt =
    normalizeText(executionTarget.mergedAt) ||
    normalizeText(executionTargetPull.mergedAt) ||
    normalizeText(executionTargetPull.merged_at) ||
    normalizeText(handoff.mergedAt) ||
    normalizeText(handoffTarget.mergedAt) ||
    normalizeText(handoffTarget.merged_at) ||
    normalizeText(pullRequest.mergedAt) ||
    normalizeText(pullRequest.merged_at);
  const mergeCommitSha =
    normalizeText(executionTarget.mergeCommitSha) ||
    normalizeText(executionTargetPull.mergeCommitSha) ||
    normalizeText(executionTargetPull.merge_commit_sha) ||
    normalizeText(handoff.mergeCommitSha) ||
    normalizeText(handoffTarget.mergeCommitSha) ||
    normalizeText(handoffTarget.merge_commit_sha) ||
    normalizeText(pullRequest.mergeCommitSha) ||
    normalizeText(pullRequest.merge_commit_sha);
  if (baseRef) {
    target.baseRef = baseRef;
  }
  if (merged !== null) {
    target.merged = merged;
  }
  if (mergedAt) {
    target.mergedAt = mergedAt;
  }
  if (mergeCommitSha) {
    target.mergeCommitSha = mergeCommitSha;
  }
  return target;
}

function collectRevisionTargetConflicts({ executionTarget, handoff }) {
  const sources = [
    normalizeRevisionTargetSource("executionTarget", {
      number: executionTarget.prNumber ?? executionTarget.pullRequestNumber,
      state: executionTarget.prState,
      headRef: executionTarget.headRef,
      headSha: executionTarget.headSha,
      pullRequest: executionTarget.pullRequest
    }),
    normalizeRevisionTargetSource("handoff", {
      number: handoff.prNumber ?? handoff.pullRequestNumber,
      state: handoff.prState,
      headRef: handoff.headRef,
      headSha: handoff.headSha,
      pullRequest: handoff.targetPullRequest ?? handoff.pullRequest ?? handoff.pr
    })
  ].filter((source) => source.present);

  const issues = [];
  for (let index = 0; index < sources.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < sources.length; nextIndex += 1) {
      const left = sources[index];
      const right = sources[nextIndex];
      for (const field of ["number", "state", "headRef", "headSha"]) {
        if (left[field] && right[field] && left[field] !== right[field]) {
          issues.push(
            `revise_pr target ${field} mismatch between ${left.source} and ${right.source}`
          );
        }
      }
    }
  }

  return issues;
}

function normalizeRevisionTargetSource(source, value = {}) {
  const input = value && typeof value === "object" ? value : {};
  const pullRequest = normalizeObject(input.pullRequest);
  const target = {
    source,
    number: normalizePositiveInteger(input.number ?? pullRequest.number),
    state: normalizeText(input.state ?? pullRequest.state).toLowerCase() || null,
    headRef:
      normalizeText(input.headRef) ||
      normalizeText(pullRequest.headRef) ||
      normalizeText(pullRequest.head?.ref) ||
      null,
    headSha:
      normalizeText(input.headSha) ||
      normalizeText(pullRequest.headSha) ||
      normalizeText(pullRequest.head?.sha) ||
      null
  };
  return {
    ...target,
    present: Boolean(target.number || target.state || target.headRef || target.headSha)
  };
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

  if (transport.value === RemoteCodexExecutorTransport.VPS_RUNNER) {
    return dispatchVpsRunnerGitHubQueue({ request, token: token.value, env: input?.env });
  }

  return dispatchControlRepositoryWorkflow({
    request,
    token: token.value,
    env: input?.env,
    transport: transport.value
  });
}

async function dispatchControlRepositoryWorkflow({ request, token, env, transport }) {
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
      target_pr_number: request.revisionTarget.number
        ? String(request.revisionTarget.number)
        : "",
      target_pr_head_ref: request.revisionTarget.headRef || "",
      target_pr_head_sha: request.revisionTarget.headSha || "",
      target_pr_state: request.revisionTarget.state || "",
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

  const progress = await retrieveControlRepositoryWorkflowProgress({
    executionId: request.executionId,
    token,
    env,
    transport
  });

  return {
    ok: true,
    execution: {
      executionId: request.executionId,
      transport,
      controlRepository,
      workflowFile,
      workflowRef,
      targetRepository: request.repository,
      issueNumber: request.issueNumber,
      branch: request.branch,
      baseRef: request.baseRef,
      codexGoal: request.codexGoal,
      revisionTarget: request.revisionTarget,
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

  if (transport.value === RemoteCodexExecutorTransport.VPS_RUNNER) {
    return retrieveVpsRunnerGitHubQueueProgress({
      executionId,
      repository: normalizeText(input?.repository),
      issueNumber: normalizePositiveInteger(input?.issueNumber),
      branch: normalizeText(input?.branch),
      token: token.value,
      env: input?.env
    });
  }

  return retrieveControlRepositoryWorkflowProgress({
    executionId,
    token: token.value,
    env: input?.env,
    transport: transport.value,
    repository: normalizeText(input?.repository),
    branch: normalizeText(input?.branch)
  });
}

export async function retrieveVpsRunnerHealthStatus(input = {}) {
  const progress = await retrieveRemoteCodexExecutionProgress({
    ...input,
    executorTransport: RemoteCodexExecutorTransport.VPS_RUNNER
  });
  if (!progress.ok) {
    return progress;
  }

  return {
    ok: true,
    health: buildVpsRunnerHealthStatus({
      progress: progress.progress,
      env: input?.env
    }),
    progress: progress.progress
  };
}

export async function cancelVpsRunnerQueue(input = {}) {
  const repository = normalizeText(input?.repository);
  const issueNumber = normalizePositiveInteger(input?.issueNumber);
  const executionId = normalizeText(input?.executionId);
  const mode = normalizeVpsRunnerCancelMode(input?.mode, { executionId, issueNumber });
  const reason = normalizeText(input?.reason) || "Canceled by Butler request.";
  const actor = normalizeText(input?.actor) || null;

  const issues = [];
  if (!repository) {
    issues.push("repository is required");
  }
  if (mode === VpsRunnerCancelMode.EXECUTION && !executionId) {
    issues.push("executionId is required for execution cancel");
  }
  if (mode === VpsRunnerCancelMode.ISSUE_PENDING && !issueNumber) {
    issues.push("issueNumber is required for issue pending cancel");
  }
  if (![VpsRunnerCancelMode.EXECUTION, VpsRunnerCancelMode.ISSUE_PENDING, VpsRunnerCancelMode.DRAIN_PENDING].includes(mode)) {
    issues.push("mode must be execution, issue_pending, or drain_pending");
  }
  if (issues.length > 0) {
    return {
      ok: false,
      status: 422,
      error: "vps_runner_cancel_request_invalid",
      reason: issues.join(", "),
      issues
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

  const apiBaseUrl = normalizeText(input?.env?.GITHUB_API_BASE_URL) || "https://api.github.com";
  const fetchImpl = typeof input?.env?.GITHUB_API_FETCH === "function" ? input.env.GITHUB_API_FETCH.bind(input.env) : fetch;
  let comments;
  try {
    comments = issueNumber
      ? await readAllIssueComments({ apiBaseUrl, repository, issueNumber, token: token.value, fetchImpl })
      : await readRecentRepositoryIssueComments({ apiBaseUrl, repository, token: token.value, fetchImpl });
  } catch (error) {
    return {
      ok: false,
      status: error?.status || 503,
      error: "vps_runner_cancel_failed",
      reason: normalizeText(error?.message) || "failed to read VPS runner queue comments"
    };
  }

  const queueStates = buildVpsRunnerQueueStates(comments);
  const targets = queueStates.filter((state) => {
    if (state.cancellation) {
      return false;
    }
    if (mode === VpsRunnerCancelMode.EXECUTION) {
      return state.executionId === executionId;
    }
    if (mode === VpsRunnerCancelMode.ISSUE_PENDING) {
      return state.issueNumber === issueNumber && state.lifecycle === "pending";
    }
    return state.lifecycle === "pending";
  });

  const canceledAt = new Date().toISOString();
  const canceled = [];
  for (const target of targets) {
    const cancellation = {
      status: "canceled",
      mode,
      executionId: target.executionId,
      repository,
      issueNumber: target.issueNumber,
      reason,
      actor,
      canceledAt,
      runningCancelRequested: target.lifecycle === "running"
    };
    const patchResult = await patchVpsRunnerQueueCancellation({
      apiBaseUrl,
      repository,
      token: token.value,
      fetchImpl,
      comment: target.comment,
      cancellation
    });
    if (!patchResult.ok) {
      return patchResult;
    }
    canceled.push({
      executionId: target.executionId,
      issueNumber: target.issueNumber,
      queueCommentId: normalizePositiveInteger(target.comment?.id),
      queueCommentUrl: normalizeText(target.comment?.html_url) || null,
      previousState: target.lifecycle,
      runningCancelRequested: cancellation.runningCancelRequested
    });
  }

  return {
    ok: true,
    cancellation: {
      repository,
      mode,
      executionId: executionId || null,
      issueNumber: issueNumber || null,
      status: "canceled",
      reason,
      actor,
      canceledAt,
      matchedCount: targets.length,
      canceledCount: canceled.length,
      canceled
    }
  };
}

async function retrieveControlRepositoryWorkflowProgress({
  executionId,
  token,
  env,
  transport,
  repository,
  branch
}) {
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

  const targetRepository = normalizeText(repository);
  const targetBranch = normalizeText(branch);
  const pullRequest =
    targetRepository && targetBranch
      ? await findPullRequestForBranch({
          repository: targetRepository,
          branch: targetBranch,
          token,
          env
        })
      : { ok: true, pullRequest: null };
  if (!pullRequest.ok) {
    return pullRequest;
  }

  const branchState =
    targetRepository && targetBranch && !pullRequest.pullRequest
      ? await findBranch({
          repository: targetRepository,
          branch: targetBranch,
          token,
          env
        })
      : { ok: true, branch: null };
  if (!branchState.ok) {
    return branchState;
  }

  const runStatus = normalizeRunStatus(run.status);
  const conclusion = normalizeText(run.conclusion) || null;
  const targetRuntimeTruth = buildControlRunnerTargetRuntimeTruth({
    runStatus,
    conclusion,
    targetRepository,
    targetBranch,
    pullRequest: pullRequest.pullRequest,
    branch: branchState.branch
  });

  return {
    ok: true,
    progress: {
      executionId,
      transport,
      controlRepository,
      workflowFile,
      workflowRunId: normalizePositiveInteger(run.id),
      workflowUrl: normalizeText(run.html_url) || null,
      status: runStatus,
      conclusion,
      branch: normalizeText(run.head_branch) || null,
      targetRuntimeTruth,
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
      revisionTarget: request.revisionTarget,
      approvalScopeMatched: request.approvalScopeMatched,
      commentId: normalizePositiveInteger(responseBody?.id),
      commentUrl: normalizeText(responseBody?.html_url) || null,
      status: RemoteCodexExecutionStatus.QUEUED
    }
  };
}

async function dispatchVpsRunnerGitHubQueue({ request, token, env }) {
  const apiBaseUrl = normalizeText(env?.GITHUB_API_BASE_URL) || "https://api.github.com";
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  const commentUrl = `${apiBaseUrl}/repos/${encodeURIComponentRepository(
    request.repository
  )}/issues/${encodeURIComponent(String(request.issueNumber))}/comments`;
  const body = buildVpsRunnerGitHubQueueComment({ request });

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
      error: "vps_runner_dispatch_failed",
      reason: "failed to post VPS runner GitHub queue comment"
    };
  }

  const responseBody = await readJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "vps_runner_dispatch_failed",
      reason: normalizeText(responseBody?.message) || "GitHub issue comment creation failed"
    };
  }

  return {
    ok: true,
    execution: {
      executionId: request.executionId,
      transport: RemoteCodexExecutorTransport.VPS_RUNNER,
      targetRepository: request.repository,
      issueNumber: request.issueNumber,
      branch: request.branch,
      baseRef: request.baseRef,
      codexGoal: request.codexGoal,
      revisionTarget: request.revisionTarget,
      approvalScopeMatched: request.approvalScopeMatched,
      queueCommentId: normalizePositiveInteger(responseBody?.id),
      queueCommentUrl: normalizeText(responseBody?.html_url) || null,
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

  const branchState =
    branch && !pullRequest.pullRequest
      ? await findBranch({ repository, branch, token, env })
      : { ok: true, branch: null };
  if (!branchState.ok) {
    return branchState;
  }

  const connectorBlocker =
    !pullRequest.pullRequest && !branchState.branch
      ? findCodexCloudConnectorBlocker({ comments, delegationComment })
      : null;
  const pickupBlocker =
    !pullRequest.pullRequest && !branchState.branch && !connectorBlocker
      ? buildCodexCloudPickupBlocker({ delegationComment, env })
      : null;

  return {
    ok: true,
    progress: {
      executionId,
      transport: RemoteCodexExecutorTransport.CODEX_CLOUD_GITHUB_COMMENT,
      targetRepository: repository,
      issueNumber,
      branch: branchState.branch,
      leadTime: buildRemoteCodexLeadTime({
        queuedAt: normalizeText(delegationComment.created_at),
        branchPushedAt: normalizeText(branchState.branch?.createdAt),
        prCreatedAt: normalizeText(pullRequest.pullRequest?.createdAt),
        completedAt: normalizeText(pullRequest.pullRequest?.createdAt)
      }),
      delegationCommentId: normalizePositiveInteger(delegationComment.id),
      delegationCommentUrl: normalizeText(delegationComment.html_url) || null,
      status: pullRequest.pullRequest
        ? RemoteCodexExecutionStatus.COMPLETED
        : branchState.branch
          ? RemoteCodexExecutionStatus.IN_PROGRESS
          : connectorBlocker
            ? RemoteCodexExecutionStatus.BLOCKED
            : pickupBlocker
              ? RemoteCodexExecutionStatus.BLOCKED
              : RemoteCodexExecutionStatus.QUEUED,
      pullRequest: pullRequest.pullRequest,
      staleBranchAmbiguity: pullRequest.staleBranchAmbiguity,
      blocker: connectorBlocker ?? pickupBlocker
    }
  };
}

async function retrieveVpsRunnerGitHubQueueProgress({
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
      error: "vps_runner_progress_scope_required",
      reason: "repository and issueNumber are required for VPS runner progress"
    };
  }

  const apiBaseUrl = normalizeText(env?.GITHUB_API_BASE_URL) || "https://api.github.com";
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  let comments;
  try {
    comments = await readAllIssueComments({
      apiBaseUrl,
      repository,
      issueNumber,
      token,
      fetchImpl
    });
  } catch (error) {
    return {
      ok: false,
      status: error?.status || 503,
      error: "vps_runner_progress_failed",
      reason: normalizeText(error?.message) || "failed to read VPS runner queue comments"
    };
  }

  const queueComment = comments.find((comment) =>
    normalizeText(comment?.body).includes(`vtdd:vps-runner-execution:${executionId}`)
  );
  if (!queueComment) {
    return {
      ok: false,
      status: 404,
      error: "vps_runner_execution_not_found",
      reason: "no VPS runner queue comment matched executionId"
    };
  }

  const pullRequest = branch
    ? await findPullRequestForBranch({ repository, branch, token, env })
    : { ok: true, pullRequest: null };
  if (!pullRequest.ok) {
    return pullRequest;
  }

  const branchState =
    branch && !pullRequest.pullRequest
      ? await findBranch({ repository, branch, token, env })
      : { ok: true, branch: null };
  if (!branchState.ok) {
    return branchState;
  }

  const runnerEvents = findVpsRunnerEvents({ comments, queueComment });
  const runnerEvent = selectLatestVpsRunnerEvent(runnerEvents);
  const cancellation = parseVpsRunnerCancellationFromQueueComment(queueComment);
  const leadTime = buildVpsRunnerProgressLeadTime({
    queueComment,
    runnerEvents,
    pullRequest: pullRequest.pullRequest
  });
  const runnerEventStaleBlocker =
    runnerEvent && !pullRequest.pullRequest
      ? buildVpsRunnerEventStaleBlocker({ runnerEvent, env })
      : null;
  const staleBlocker =
    !pullRequest.pullRequest && !branchState.branch && !runnerEvent
      ? buildVpsRunnerPickupBlocker({ queueComment, env })
      : null;
  const failureBlocker =
    !pullRequest.pullRequest && runnerEvent?.status === RemoteCodexExecutionStatus.BLOCKED
      ? runnerEvent.rawFailure
      : null;
  const cancellationBlocker = cancellation
    ? {
        error: "vps_runner_execution_canceled",
        reason: cancellation.reason || "VPS runner execution was canceled by Butler request",
        canceledAt: cancellation.canceledAt || null,
        mode: cancellation.mode || null,
        runningCancelRequested: cancellation.runningCancelRequested === true,
        queueCommentId: normalizePositiveInteger(queueComment.id),
        queueCommentUrl: normalizeText(queueComment.html_url) || null
      }
    : null;
  const status = cancellation
    ? RemoteCodexExecutionStatus.CANCELED
    : pullRequest.pullRequest
    ? RemoteCodexExecutionStatus.COMPLETED
    : failureBlocker || runnerEventStaleBlocker || staleBlocker
      ? RemoteCodexExecutionStatus.BLOCKED
      : branchState.branch
        ? RemoteCodexExecutionStatus.IN_PROGRESS
        : runnerEvent?.status || RemoteCodexExecutionStatus.QUEUED;

  return {
    ok: true,
    progress: {
      executionId,
      transport: RemoteCodexExecutorTransport.VPS_RUNNER,
      targetRepository: repository,
      issueNumber,
      branch: branchState.branch,
      queueCommentId: normalizePositiveInteger(queueComment.id),
      queueCommentUrl: normalizeText(queueComment.html_url) || null,
      status,
      pullRequest: pullRequest.pullRequest,
      staleBranchAmbiguity: pullRequest.staleBranchAmbiguity,
      runnerEvent,
      cancellation,
      leadTime,
      blocker: cancellationBlocker ?? failureBlocker ?? runnerEventStaleBlocker ?? staleBlocker
    }
  };
}

async function readAllIssueComments({ apiBaseUrl, repository, issueNumber, token, fetchImpl }) {
  const comments = [];
  for (let page = 1; ; page += 1) {
    const commentsUrl = `${apiBaseUrl}/repos/${encodeURIComponentRepository(
      repository
    )}/issues/${encodeURIComponent(String(issueNumber))}/comments?per_page=100&page=${page}`;
    const response = await fetchImpl(commentsUrl, {
      method: "GET",
      headers: githubJsonHeaders({ token })
    });
    const body = await readJsonSafe(response);
    if (!response.ok) {
      const error = new Error(normalizeText(body?.message) || "GitHub issue comments lookup failed");
      error.status = response.status;
      throw error;
    }
    const pageComments = Array.isArray(body) ? body : [];
    comments.push(...pageComments);
    if (pageComments.length < 100) {
      return comments;
    }
  }
}

async function readRecentRepositoryIssueComments({ apiBaseUrl, repository, token, fetchImpl }) {
  const issuesUrl = `${apiBaseUrl}/repos/${encodeURIComponentRepository(
    repository
  )}/issues?state=open&sort=updated&direction=desc&per_page=100`;
  const issuesResponse = await fetchImpl(issuesUrl, {
    method: "GET",
    headers: githubJsonHeaders({ token })
  });
  const issuesBody = await readJsonSafe(issuesResponse);
  if (!issuesResponse.ok) {
    const error = new Error(normalizeText(issuesBody?.message) || "GitHub issues lookup failed");
    error.status = issuesResponse.status;
    throw error;
  }
  const comments = [];
  for (const issue of (Array.isArray(issuesBody) ? issuesBody : []).filter((item) => !item.pull_request)) {
    const issueNumber = normalizePositiveInteger(issue?.number);
    if (!issueNumber) {
      continue;
    }
    comments.push(
      ...(await readAllIssueComments({
        apiBaseUrl,
        repository,
        issueNumber,
        token,
        fetchImpl
      }))
    );
  }
  return comments;
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

  const pulls = Array.isArray(body) ? body : [];
  const pull = pulls.find((item) => normalizeText(item?.state) === "open") || null;
  const staleBranchAmbiguity =
    !pull && pulls.length > 0
      ? {
          error: "stale_branch_pr_ambiguity",
          reason:
            "target branch is associated only with non-open pull requests; revise_pr must not target this branch without a fresh open PR lock",
          pullRequests: pulls.map(normalizeRuntimePullRequest)
        }
      : null;
  return {
    ok: true,
    pullRequest: pull ? normalizeRuntimePullRequest(pull) : null,
    staleBranchAmbiguity
  };
}

function normalizeRuntimePullRequest(pull) {
  return {
    number: normalizePositiveInteger(pull?.number),
    url: normalizeText(pull?.html_url) || null,
    state: normalizeText(pull?.state) || null,
    title: normalizeText(pull?.title) || null,
    headRef: normalizeText(pull?.head?.ref) || null,
    headSha: normalizeText(pull?.head?.sha) || null,
    createdAt: normalizeText(pull?.created_at) || null,
    updatedAt: normalizeText(pull?.updated_at) || null
  };
}

async function findBranch({ repository, branch, token, env }) {
  const apiBaseUrl = normalizeText(env?.GITHUB_API_BASE_URL) || "https://api.github.com";
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  const branchUrl = `${apiBaseUrl}/repos/${encodeURIComponentRepository(
    repository
  )}/branches/${encodeURIComponent(branch)}`;

  let response;
  try {
    response = await fetchImpl(branchUrl, {
      method: "GET",
      headers: githubJsonHeaders({ token })
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error: "remote_codex_progress_failed",
      reason: "failed to read branch for Codex Cloud delegation"
    };
  }

  const body = await readJsonSafe(response);
  if (response.status === 404) {
    return { ok: true, branch: null };
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "remote_codex_progress_failed",
      reason: normalizeText(body?.message) || "GitHub branch lookup failed"
    };
  }

  return {
    ok: true,
    branch: {
      name: normalizeText(body?.name) || branch,
      url: normalizeText(body?._links?.html) || null,
      sha: normalizeText(body?.commit?.sha) || null
    }
  };
}

function findCodexCloudConnectorBlocker({ comments, delegationComment }) {
  const delegationId = normalizePositiveInteger(delegationComment?.id) ?? 0;
  const laterComments = comments.filter((comment) => {
    const commentId = normalizePositiveInteger(comment?.id) ?? 0;
    return !delegationId || commentId > delegationId;
  });

  const blockerComment = laterComments.find((comment) => {
    const author = normalizeText(comment?.user?.login).toLowerCase();
    const body = normalizeText(comment?.body).toLowerCase();
    return (
      author.includes("chatgpt-codex-connector") &&
      (body.includes("create a codex account and connect to github") ||
        body.includes("to use codex here"))
    );
  });

  if (!blockerComment) {
    return null;
  }

  return {
    error: "codex_cloud_connector_required",
    reason: "Codex Cloud connector is not ready for this repository or account",
    commentId: normalizePositiveInteger(blockerComment.id),
    commentUrl: normalizeText(blockerComment.html_url) || null
  };
}

function buildCodexCloudPickupBlocker({ delegationComment, env }) {
  const graceSeconds = normalizeNonNegativeNumber(
    env?.CODEX_CLOUD_PICKUP_GRACE_SECONDS ?? 300
  );
  const createdAt = Date.parse(normalizeText(delegationComment?.created_at));
  if (!Number.isFinite(createdAt)) {
    return null;
  }

  const ageSeconds = Math.floor((Date.now() - createdAt) / 1000);
  if (ageSeconds < graceSeconds) {
    return null;
  }

  return {
    error: "codex_cloud_pickup_not_observed",
    reason:
      "Codex Cloud did not create a branch or PR from the delegation comment within the pickup grace period",
    commentId: normalizePositiveInteger(delegationComment?.id),
    commentUrl: normalizeText(delegationComment?.html_url) || null,
    graceSeconds,
    ageSeconds
  };
}

function findLatestVpsRunnerEvent({ comments, queueComment }) {
  return selectLatestVpsRunnerEvent(findVpsRunnerEvents({ comments, queueComment }));
}

function findVpsRunnerEvents({ comments, queueComment }) {
  const queueCommentId = normalizePositiveInteger(queueComment?.id) ?? 0;
  const laterComments = comments.filter((comment) => {
    const commentId = normalizePositiveInteger(comment?.id) ?? 0;
    return !queueCommentId || commentId > queueCommentId;
  });

  const events = laterComments
    .map((comment) => {
      const body = normalizeText(comment?.body);
      const marker = `vtdd:vps-runner-event:${extractVpsExecutionIdFromQueueComment(queueComment)}`;
      if (!body.includes(marker)) {
        return null;
      }
      const payload = extractFirstJsonFence(body);
      if (!payload) {
        return null;
      }
      const rawStatus = normalizeText(payload.status);
      const status = normalizeVpsRunnerEventStatus(rawStatus);
      const leadTime = normalizeObject(payload.leadTime);
      return {
        commentId: normalizePositiveInteger(comment?.id),
        commentUrl: normalizeText(comment?.html_url) || null,
        rawStatus,
        status,
        lastEvent: normalizeText(payload.lastEvent) || null,
        currentStep: normalizeText(payload.currentStep) || null,
        heartbeatAt: normalizeText(payload.heartbeatAt) || null,
        leadTime,
        rawFailure: normalizeObject(payload.rawFailure),
        command: normalizeObject(payload.command),
        branch: normalizeText(payload.branch) || null,
        pullRequest: normalizeObject(payload.pullRequest),
        updatedAt:
          normalizeText(payload.updatedAt) ||
          normalizeText(payload.heartbeatAt) ||
          normalizeText(comment?.updated_at) ||
          normalizeText(comment?.created_at) ||
          null
      };
    })
    .filter(Boolean);

  return events;
}

function buildVpsRunnerQueueStates(comments) {
  const queues = new Map();
  const eventsByExecution = new Map();
  for (const comment of comments || []) {
    const queueExecutionId = extractVpsExecutionIdFromQueueComment(comment);
    if (queueExecutionId) {
      const payload = extractFirstJsonFence(comment?.body);
      queues.set(queueExecutionId, {
        executionId: queueExecutionId,
        issueNumber: normalizePositiveInteger(payload?.issueNumber),
        comment,
        cancellation: parseVpsRunnerCancellationFromQueueComment(comment),
        lifecycle: "pending"
      });
      continue;
    }

    const eventExecutionId = extractVpsExecutionIdFromEventComment(comment);
    if (!eventExecutionId) {
      continue;
    }
    const payload = extractFirstJsonFence(comment?.body);
    if (!payload) {
      continue;
    }
    const list = eventsByExecution.get(eventExecutionId) || [];
    list.push({
      rawStatus: normalizeText(payload.status),
      status: normalizeVpsRunnerEventStatus(payload.status),
      updatedAt:
        normalizeText(payload.updatedAt) ||
        normalizeText(payload.heartbeatAt) ||
        normalizeText(comment?.updated_at) ||
        normalizeText(comment?.created_at)
    });
    eventsByExecution.set(eventExecutionId, list);
  }

  for (const state of queues.values()) {
    const latest = selectLatestVpsRunnerEvent(eventsByExecution.get(state.executionId) || []);
    if (latest?.status === RemoteCodexExecutionStatus.IN_PROGRESS) {
      state.lifecycle = "running";
    } else if ([RemoteCodexExecutionStatus.COMPLETED, RemoteCodexExecutionStatus.BLOCKED, RemoteCodexExecutionStatus.CANCELED].includes(latest?.status)) {
      state.lifecycle = "terminal";
    }
  }
  return [...queues.values()];
}

async function patchVpsRunnerQueueCancellation({ apiBaseUrl, repository, token, fetchImpl, comment, cancellation }) {
  const commentId = normalizePositiveInteger(comment?.id);
  if (!commentId) {
    return {
      ok: false,
      status: 422,
      error: "vps_runner_cancel_failed",
      reason: "queue comment id is missing"
    };
  }
  const body = `${normalizeText(comment?.body)}\n\n${buildVpsRunnerCanceledMarker(cancellation)}`;
  const response = await fetchImpl(
    `${apiBaseUrl}/repos/${encodeURIComponentRepository(repository)}/issues/comments/${commentId}`,
    {
      method: "PATCH",
      headers: githubJsonHeaders({ token }),
      body: JSON.stringify({ body })
    }
  );
  const responseBody = await readJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "vps_runner_cancel_failed",
      reason: normalizeText(responseBody?.message) || "GitHub queue comment update failed"
    };
  }
  return { ok: true };
}

function buildVpsRunnerCanceledMarker(cancellation) {
  return [
    `<!-- vtdd:vps-runner-canceled:${cancellation.executionId} -->`,
    "VTDD VPS runner cancellation marker.",
    "",
    fencedJson(cancellation)
  ].join("\n");
}

function parseVpsRunnerCancellationFromQueueComment(comment) {
  const body = normalizeText(comment?.body);
  const executionId = extractVpsExecutionIdFromQueueComment(comment);
  if (!executionId || !body.includes(`vtdd:vps-runner-canceled:${executionId}`)) {
    return null;
  }
  const markerIndex = body.lastIndexOf(`vtdd:vps-runner-canceled:${executionId}`);
  const payload = extractFirstJsonFence(body.slice(markerIndex));
  return {
    status: "canceled",
    executionId,
    mode: normalizeText(payload?.mode) || null,
    reason: normalizeText(payload?.reason) || null,
    actor: normalizeText(payload?.actor) || null,
    canceledAt: normalizeText(payload?.canceledAt) || null,
    runningCancelRequested: payload?.runningCancelRequested === true,
    commentId: normalizePositiveInteger(comment?.id),
    commentUrl: normalizeText(comment?.html_url) || null
  };
}

function extractVpsExecutionIdFromEventComment(comment) {
  const body = normalizeText(comment?.body);
  const match = body.match(/vtdd:vps-runner-event:([a-zA-Z0-9._:-]+)/);
  return match ? match[1] : "";
}

function selectLatestVpsRunnerEvent(events) {
  return [...(Array.isArray(events) ? events : [])]
    .sort((left, right) => {
      const leftUpdatedAt = Date.parse(normalizeText(left?.updatedAt));
      const rightUpdatedAt = Date.parse(normalizeText(right?.updatedAt));
      if (Number.isFinite(leftUpdatedAt) && Number.isFinite(rightUpdatedAt) && leftUpdatedAt !== rightUpdatedAt) {
        return leftUpdatedAt - rightUpdatedAt;
      }
      return (normalizePositiveInteger(left?.commentId) ?? 0) - (normalizePositiveInteger(right?.commentId) ?? 0);
    })
    .at(-1) || null;
}

function buildVpsRunnerProgressLeadTime({ queueComment, runnerEvents, pullRequest }) {
  const latestWithLeadTime = [...(Array.isArray(runnerEvents) ? runnerEvents : [])]
    .reverse()
    .find((event) => Object.keys(normalizeObject(event?.leadTime)).length > 0);
  const eventLeadTime = normalizeObject(latestWithLeadTime?.leadTime);
  const timestamps = {
    queuedAt: normalizeText(eventLeadTime.queued_at) || normalizeText(queueComment?.created_at),
    pickedUpAt: normalizeText(eventLeadTime.picked_up_at),
    codexStartedAt: normalizeText(eventLeadTime.codex_started_at),
    branchPushedAt: normalizeText(eventLeadTime.branch_pushed_at),
    prCreatedAt: normalizeText(eventLeadTime.pr_created_at) || normalizeText(pullRequest?.createdAt),
    completedAt: normalizeText(eventLeadTime.completed_at),
    failedAt: normalizeText(eventLeadTime.failed_at)
  };

  for (const event of runnerEvents || []) {
    const updatedAt = normalizeText(event?.updatedAt);
    if (!timestamps.pickedUpAt && ["picked_up", "runner_started"].includes(normalizeText(event?.lastEvent))) {
      timestamps.pickedUpAt = updatedAt;
    }
    if (!timestamps.codexStartedAt && (normalizeText(event?.currentStep) === "codex_subprocess" || normalizeText(event?.lastEvent) === "codex_started" || normalizeText(event?.lastEvent) === "codex_subprocess_started")) {
      timestamps.codexStartedAt = updatedAt;
    }
    if (!timestamps.branchPushedAt && normalizeText(event?.lastEvent) === "branch_pushed") {
      timestamps.branchPushedAt = updatedAt;
    }
    if (!timestamps.prCreatedAt && ["pull_request_created", "pull_request_updated"].includes(normalizeText(event?.lastEvent))) {
      timestamps.prCreatedAt = updatedAt;
    }
    if (!timestamps.completedAt && normalizeText(event?.rawStatus) === RemoteCodexExecutionStatus.COMPLETED) {
      timestamps.completedAt = updatedAt;
    }
    if (!timestamps.failedAt && normalizeText(event?.status) === RemoteCodexExecutionStatus.BLOCKED && Object.keys(normalizeObject(event?.rawFailure)).length > 0) {
      timestamps.failedAt = updatedAt;
    }
  }

  return buildRemoteCodexLeadTime(timestamps);
}

function buildRemoteCodexLeadTime(timestamps = {}) {
  return buildExecutionLeadTime(timestamps, { normalizeTimestamp });
}

function normalizeTimestamp(value) {
  const text = normalizeText(value);
  return Number.isFinite(Date.parse(text)) ? text : null;
}

function buildVpsRunnerEventStaleBlocker({ runnerEvent, env }) {
  const staleSeconds = normalizeNonNegativeNumber(env?.VPS_RUNNER_EVENT_STALE_SECONDS ?? 600);
  const updatedAt = Date.parse(normalizeText(runnerEvent?.updatedAt));
  if (!Number.isFinite(updatedAt)) {
    return null;
  }
  if (![RemoteCodexExecutionStatus.IN_PROGRESS, RemoteCodexExecutionStatus.UNKNOWN].includes(runnerEvent?.status)) {
    return null;
  }

  const ageSeconds = Math.floor((Date.now() - updatedAt) / 1000);
  if (ageSeconds < staleSeconds) {
    return null;
  }

  return {
    error: "vps_runner_event_stale",
    reason:
      "VPS runner last reported a running step but has not posted a heartbeat or terminal event within the stale threshold",
    commentId: normalizePositiveInteger(runnerEvent?.commentId),
    commentUrl: normalizeText(runnerEvent?.commentUrl) || null,
    lastEvent: normalizeText(runnerEvent?.lastEvent) || null,
    currentStep: normalizeText(runnerEvent?.currentStep) || null,
    lastUpdatedAt: normalizeText(runnerEvent?.updatedAt) || null,
    staleSeconds,
    ageSeconds
  };
}

function buildVpsRunnerPickupBlocker({ queueComment, env }) {
  const graceSeconds = normalizeNonNegativeNumber(env?.VPS_RUNNER_PICKUP_GRACE_SECONDS ?? 300);
  const createdAt = Date.parse(normalizeText(queueComment?.created_at));
  if (!Number.isFinite(createdAt)) {
    return null;
  }

  const ageSeconds = Math.floor((Date.now() - createdAt) / 1000);
  if (ageSeconds < graceSeconds) {
    return null;
  }

  return {
    error: "vps_runner_pickup_not_observed",
    reason:
      "VPS runner did not report pickup and no target branch or PR was observed within the pickup grace period",
    commentId: normalizePositiveInteger(queueComment?.id),
    commentUrl: normalizeText(queueComment?.html_url) || null,
    graceSeconds,
    ageSeconds
  };
}

function buildVpsRunnerHealthStatus({ progress, env }) {
  const runnerEvent = normalizeObject(progress?.runnerEvent);
  const blocker = normalizeObject(progress?.blocker);
  const pullRequest = normalizeObject(progress?.pullRequest);
  const branch = normalizeObject(progress?.branch);
  const cancellation = normalizeObject(progress?.cancellation);
  const lastSeenAt =
    normalizeText(runnerEvent.updatedAt) ||
    normalizeText(runnerEvent.heartbeatAt) ||
    null;
  const heartbeatAt = normalizeText(runnerEvent.heartbeatAt) || null;
  const queuePickedUp = Boolean(
    Object.keys(runnerEvent).length > 0 ||
      Object.keys(branch).length > 0 ||
      Object.keys(pullRequest).length > 0
  );
  const queueStatus = Object.keys(cancellation).length > 0
    ? "canceled"
    : blocker.error === "vps_runner_pickup_not_observed"
    ? "stale"
    : queuePickedUp
      ? "picked_up"
      : "queued";
  const currentStep =
    normalizeText(runnerEvent.currentStep) ||
    normalizeText(runnerEvent.lastEvent) ||
    (Object.keys(pullRequest).length > 0
      ? "pull_request_observed"
      : Object.keys(branch).length > 0
        ? "branch_observed"
        : "queue_waiting");
  const unavailableReason = buildVpsRunnerUnavailableReason({ progress, blocker });
  const runnerAlive = unavailableReason ? false : Boolean(lastSeenAt);
  const runnerStatus = runnerAlive ? "alive" : "unavailable";

  return {
    executionId: normalizeText(progress?.executionId) || null,
    transport: RemoteCodexExecutorTransport.VPS_RUNNER,
    runnerStatus,
    runnerAlive,
    lastSeenAt,
    heartbeatAt,
    queue: {
      status: queueStatus,
      pickedUp: queuePickedUp,
      commentId: normalizePositiveInteger(progress?.queueCommentId),
      commentUrl: normalizeText(progress?.queueCommentUrl) || null
    },
    leadTime: normalizeObject(progress?.leadTime),
    currentStep,
    progressStatus: normalizeText(progress?.status) || RemoteCodexExecutionStatus.UNKNOWN,
    cancellation: Object.keys(cancellation).length > 0 ? cancellation : null,
    reason: unavailableReason?.reason || null,
    reasonCode: unavailableReason?.code || null,
    staleThresholdSeconds: normalizeNonNegativeNumber(env?.VPS_RUNNER_EVENT_STALE_SECONDS ?? 600)
  };
}

function buildVpsRunnerUnavailableReason({ progress, blocker }) {
  const progressStatus = normalizeText(progress?.status);
  const code = normalizeText(blocker?.error);
  if (code) {
    return {
      code,
      reason:
        normalizeText(blocker.reason) ||
        "VPS runner status is unavailable from safe GitHub runtime truth"
    };
  }
  if (progressStatus === RemoteCodexExecutionStatus.QUEUED) {
    return {
      code: "vps_runner_pickup_pending",
      reason: "VPS runner pickup has not been observed yet"
    };
  }
  if (progressStatus === RemoteCodexExecutionStatus.CANCELED) {
    return {
      code: "vps_runner_execution_canceled",
      reason: "VPS runner execution was canceled by Butler request"
    };
  }
  if (!normalizeText(progress?.runnerEvent?.updatedAt) && !normalizeText(progress?.runnerEvent?.heartbeatAt)) {
    return {
      code: "vps_runner_last_seen_missing",
      reason: "VPS runner has not reported a heartbeat or event timestamp"
    };
  }
  return null;
}

function buildControlRunnerTargetRuntimeTruth({
  runStatus,
  conclusion,
  targetRepository,
  targetBranch,
  pullRequest,
  branch
}) {
  if (!targetRepository || !targetBranch) {
    const missing = [];
    if (!targetRepository) {
      missing.push("targetRepository");
    }
    if (!targetBranch) {
      missing.push("targetBranch");
    }
    return {
      status: RemoteCodexExecutionStatus.BLOCKED,
      targetRepository: targetRepository || null,
      targetBranch: targetBranch || null,
      branch: null,
      pullRequest: null,
      blocker: {
        error: "remote_codex_target_runtime_truth_unavailable",
        reason:
          "remote Codex control-runner progress requires target repository and branch to verify GitHub-visible runtime evidence",
        missing
      }
    };
  }

  const status = pullRequest
    ? RemoteCodexExecutionStatus.COMPLETED
    : branch
      ? RemoteCodexExecutionStatus.IN_PROGRESS
      : runStatus === RemoteCodexExecutionStatus.COMPLETED
        ? RemoteCodexExecutionStatus.BLOCKED
        : runStatus;

  const blocker =
    status === RemoteCodexExecutionStatus.BLOCKED && conclusion && conclusion !== "success"
      ? {
          error: "remote_codex_workflow_failed",
          reason:
            "remote Codex control-runner workflow completed without GitHub-visible branch or PR evidence",
          conclusion,
          targetRepository,
          targetBranch
        }
      : status === RemoteCodexExecutionStatus.BLOCKED
        ? {
            error: "remote_codex_runtime_evidence_missing",
            reason:
              "remote Codex control-runner workflow completed but no target branch or PR was observed",
            targetRepository,
            targetBranch
          }
        : null;

  return {
    status,
    targetRepository,
    targetBranch,
    branch,
    pullRequest,
    blocker
  };
}

function buildCodexCloudGitHubComment({ request }) {
  const lines = [
    `<!-- vtdd:remote-codex-execution:${request.executionId} -->`,
    "@codex please implement this bounded development task and open or update the PR.",
    "",
    "VTDD-managed Codex Cloud delegation request.",
    "",
    "Bounded execution contract:",
    `- Repository: ${request.repository}`,
    `- Issue: #${request.issueNumber}`,
    `- Branch: ${request.branch}`,
    `- Base ref: ${request.baseRef}`,
    `- Goal: ${request.codexGoal}`,
    ...(request.codexGoal === RemoteCodexDispatchGoal.REVISE_PR
      ? [
          `- Target PR: #${request.revisionTarget.number}`,
          `- Target PR state: ${request.revisionTarget.state}`,
          `- Target PR headRef: ${request.revisionTarget.headRef}`,
          `- Target PR headSha: ${request.revisionTarget.headSha}`
        ]
      : []),
    ...(request.codexGoal === RemoteCodexDispatchGoal.POST_MERGE_VERIFY
      ? [
          `- Target PR: #${request.revisionTarget.number}`,
          `- Target PR state: ${request.revisionTarget.state || "unknown"}`,
          `- Target PR merged: ${request.revisionTarget.merged === false ? "false" : "true_or_unverified"}`,
          `- Target PR mergedAt: ${request.revisionTarget.mergedAt || "unverified"}`,
          `- Target PR mergeCommitSha: ${request.revisionTarget.mergeCommitSha || "unverified"}`
        ]
      : []),
    "- Canonical spec: this GitHub Issue",
    "- Runtime truth: current GitHub branch / diff / PR / review comments",
    "- Completion target: create or update a pull request",
    "- PR body requirement: before creating or updating a PR, inspect `docs/pr-template-model.md`, `scripts/render-pr-body.mjs`, and `scripts/validate-pr-body.mjs` in the target repository.",
    "- Required PR body markers: `## This PR satisfies Intent`, `## Satisfied Success Criteria`, `## Unsatisfied Success Criteria`, `## Verification Evidence`, `## Surface Update Checklist`.",
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

function buildVpsRunnerGitHubQueueComment({ request }) {
  const payload = {
    executionId: request.executionId,
    transport: RemoteCodexExecutorTransport.VPS_RUNNER,
    repository: request.repository,
    issueNumber: request.issueNumber,
    branch: request.branch,
    baseRef: request.baseRef,
    codexGoal: request.codexGoal,
    revisionTarget: request.revisionTarget,
    approvalScopeMatched: request.approvalScopeMatched,
    approvalActor: request.approvalActor,
    handoff: request.handoff,
    issueTraceability: request.issueTraceability,
    preflightPolicy: request.preflightPolicy
  };
  const lines = [
    `<!-- vtdd:vps-runner-execution:${request.executionId} -->`,
    "VTDD 管理の VPS runner 実行キューです。",
    "",
    "実行境界:",
    `- リポジトリ: ${request.repository}`,
    `- Issue: #${request.issueNumber}`,
    `- ブランチ: ${request.branch}`,
    `- base ref: ${request.baseRef}`,
    `- goal: ${request.codexGoal}`,
    ...(request.codexGoal === RemoteCodexDispatchGoal.REVISE_PR
      ? [
          `- 対象 PR: #${request.revisionTarget.number}`,
          `- 対象 PR state: ${request.revisionTarget.state}`,
          `- 対象 PR headRef: ${request.revisionTarget.headRef}`,
          `- 対象 PR headSha: ${request.revisionTarget.headSha}`
        ]
      : []),
    ...(request.codexGoal === RemoteCodexDispatchGoal.POST_MERGE_VERIFY
      ? [
          `- 対象 PR: #${request.revisionTarget.number}`,
          `- 対象 PR state: ${request.revisionTarget.state || "unknown"}`,
          `- 対象 PR merged: ${request.revisionTarget.merged === false ? "false" : "true_or_unverified"}`,
          `- 対象 PR mergedAt: ${request.revisionTarget.mergedAt || "unverified"}`,
          `- 対象 PR mergeCommitSha: ${request.revisionTarget.mergeCommitSha || "unverified"}`
        ]
      : []),
    "- 正本: この GitHub Issue",
    "- runtime truth: 現在の GitHub branch / diff / PR / review comments",
    request.codexGoal === RemoteCodexDispatchGoal.POST_MERGE_VERIFY
      ? "- 完了条件: merge 後 runtime truth を検証し、GitHub-visible evidence を残す"
      : "- 完了条件: pull request を作成または更新する",
    "- PR body requirement: Codex は `docs/pr-template-model.md`、`scripts/render-pr-body.mjs`、`scripts/validate-pr-body.mjs` を確認します。VPS runner も PR create/update 前に検証・正規化します。",
    "- context preflight: VPS runner は `AGENTS.md`、`docs/butler/thread-independent-startup-contract.md`、正本 Issue、PR body contract files を読んでから編集を開始します。",
    "- 必須 PR body markers: `## This PR satisfies Intent`, `## Satisfied Success Criteria`, `## Unsatisfied Success Criteria`, `## Verification Evidence`, `## Surface Update Checklist`.",
    "- preflight 入力が不足している場合、推測実装は禁止です。runner は Butler/owner に次の判断を求め、bounded request の再発行を待ちます。",
    "",
    "ルール:",
    "- Issue の範囲を勝手に広げない。",
    "- merge しない。",
    "- deploy しない。",
    "- reviewer objection は Butler/human judgment 用に残す。",
    "- Issue または runtime truth が不足している場合は停止し、日本語で blocker reason をコメントする。",
    "",
    "Runner payload:",
    fencedJson(payload)
  ];

  return lines.join("\n");
}

function buildExecutionPreflightPolicy({ codexGoal } = {}) {
  const requiredRepoFiles = [
    "AGENTS.md",
    "docs/butler/thread-independent-startup-contract.md",
    "docs/pr-template-model.md",
    "scripts/render-pr-body.mjs",
    "scripts/validate-pr-body.mjs"
  ];
  return {
    mode: "auto_receipt",
    onMissingContract: "owner_decision_required",
    requiredRepoFiles
  };
}

function resolveExecutorTransport(input = {}, options = {}) {
  const requestValue = normalizeText(
    input?.executorTransport ??
      input?.payload?.executorTransport ??
      input?.payload?.continuationContext?.executorTransport
  );
  const envValue = normalizeText(input?.env?.REMOTE_CODEX_EXECUTOR_TRANSPORT);
  const value = requestValue || envValue;
  if (!value) {
    const configuredControlRepository = resolveControlRepository(input?.env);
    return {
      ok: true,
      value: configuredControlRepository
        ? RemoteCodexExecutorTransport.CODEX_CLOUD_CLI_CONTROL_RUNNER
        : RemoteCodexExecutorTransport.CODEX_CLOUD_GITHUB_COMMENT
    };
  }

  const metadata = REMOTE_CODEX_EXECUTOR_TRANSPORT_REGISTRY[value];
  if (!metadata) {
    return {
      ok: false,
      error: "remote_codex_transport_unknown",
      reason: "executorTransport is not registered",
      issues: [`unsupported executorTransport: ${value}`]
    };
  }

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
  }
  return { ok: true, value };
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

function extractVpsExecutionIdFromQueueComment(queueComment) {
  const body = normalizeText(queueComment?.body);
  const match = body.match(/vtdd:vps-runner-execution:([a-zA-Z0-9._:-]+)/);
  return match ? match[1] : "";
}

function extractFirstJsonFence(text) {
  const match = normalizeText(text).match(/```json\s*([\s\S]*?)```/);
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function normalizeVpsRunnerEventStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "running" || normalized === "in_progress" || normalized === "branch_created") {
    return RemoteCodexExecutionStatus.IN_PROGRESS;
  }
  if (normalized === "pr_created" || normalized === "completed") {
    return RemoteCodexExecutionStatus.COMPLETED;
  }
  if (normalized === "failed" || normalized === "blocked") {
    return RemoteCodexExecutionStatus.BLOCKED;
  }
  if (normalized === "canceled" || normalized === "cancelled") {
    return RemoteCodexExecutionStatus.CANCELED;
  }
  if (normalized === "queued" || normalized === "requested") {
    return RemoteCodexExecutionStatus.QUEUED;
  }
  return RemoteCodexExecutionStatus.UNKNOWN;
}

function normalizeVpsRunnerCancelMode(value, { executionId, issueNumber } = {}) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "execution" || normalized === "execution_id") {
    return VpsRunnerCancelMode.EXECUTION;
  }
  if (normalized === "issue_pending" || normalized === "issue") {
    return VpsRunnerCancelMode.ISSUE_PENDING;
  }
  if (normalized === "drain_pending" || normalized === "drain" || normalized === "all_pending") {
    return VpsRunnerCancelMode.DRAIN_PENDING;
  }
  if (executionId) {
    return VpsRunnerCancelMode.EXECUTION;
  }
  if (issueNumber) {
    return VpsRunnerCancelMode.ISSUE_PENDING;
  }
  return VpsRunnerCancelMode.DRAIN_PENDING;
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

function normalizeNonNegativeNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 300;
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
