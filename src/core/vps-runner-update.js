import { evaluateApprovalGrant } from "./passkey-approval.js";
import { resolveGitHubAppInstallationToken } from "./github-app-repository-index.js";

export const VPS_RUNNER_UPDATE_QUEUE_MARKER = "vtdd:vps-runner-update";
export const VPS_RUNNER_UPDATE_EVENT_MARKER = "vtdd:vps-runner-update-event";

export const VpsRunnerUpdateActionType = Object.freeze({
  UPDATE_RESTART: "vps_runner_update_restart",
  UPDATE_RELOAD: "vps_runner_update_reload"
});

export const VpsRunnerUpdateStatus = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  STALE: "stale"
});

const ALLOWED_ACTION_TYPES = new Set(Object.values(VpsRunnerUpdateActionType));
const DEFAULT_REF = "main";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_USER_AGENT = "vtdd-v2-vps-runner-update";

export async function requestVpsRunnerUpdate(input = {}) {
  const validation = validateVpsRunnerUpdateRequest(input);
  if (!validation.ok) {
    return {
      ok: false,
      status: 422,
      error: "vps_runner_update_request_invalid",
      reason: validation.issues.join(", "),
      issues: validation.issues
    };
  }

  const request = validation.request;
  const approvalValidation = validateVpsRunnerUpdateApprovalGrant({
    approvalGrant: input.approvalGrant,
    request
  });
  if (!approvalValidation.ok) {
    return {
      ok: false,
      status: 422,
      error: "vps_runner_update_approval_invalid",
      reason: approvalValidation.reason,
      issues: [approvalValidation.reason]
    };
  }

  const tokenResolution = await resolveGitHubAppInstallationToken({
    env: input.env,
    fetchImpl: resolveFetch(input.env),
    apiBaseUrl: normalizeApiBaseUrl(input.env?.GITHUB_API_BASE_URL)
  });
  if (!tokenResolution.ok) {
    return {
      ok: false,
      status: 503,
      error: "github_execution_token_unavailable",
      reason:
        tokenResolution.warning ||
        "GitHub App installation token is unavailable for VPS runner update queue"
    };
  }

  const apiBaseUrl = normalizeApiBaseUrl(input.env?.GITHUB_API_BASE_URL);
  const fetchImpl = resolveFetch(input.env);
  const commentUrl = `${apiBaseUrl}/repos/${encodeURIComponentRepository(
    request.repository
  )}/issues/${encodeURIComponent(String(request.issueNumber))}/comments`;
  const body = buildVpsRunnerUpdateQueueComment({ request });
  let response;
  try {
    response = await fetchImpl(commentUrl, {
      method: "POST",
      headers: githubJsonHeaders({ token: tokenResolution.token }),
      body: JSON.stringify({ body })
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error: "vps_runner_update_dispatch_failed",
      reason: "failed to post VPS runner update queue comment"
    };
  }

  const responseBody = await readJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "vps_runner_update_dispatch_failed",
      reason: normalizeText(responseBody?.message) || "GitHub issue comment creation failed"
    };
  }

  return {
    ok: true,
    update: {
      updateId: request.updateId,
      repository: request.repository,
      issueNumber: request.issueNumber,
      ref: request.ref,
      phase: request.phase,
      actionType: request.actionType,
      status: VpsRunnerUpdateStatus.QUEUED,
      queueCommentId: normalizePositiveInteger(responseBody?.id),
      queueCommentUrl: normalizeText(responseBody?.html_url) || null
    }
  };
}

export async function retrieveVpsRunnerUpdateStatus(input = {}) {
  const repository = normalizeRepository(input.repository);
  const issueNumber = normalizePositiveInteger(input.issueNumber);
  const updateId = normalizeUpdateId(input.updateId);
  const issues = [];
  if (!repository) {
    issues.push("repository is required");
  }
  if (!issueNumber) {
    issues.push("issueNumber is required");
  }
  if (!updateId) {
    issues.push("updateId is required");
  }
  if (issues.length > 0) {
    return {
      ok: false,
      status: 422,
      error: "vps_runner_update_status_request_invalid",
      reason: issues.join(", "),
      issues
    };
  }

  const tokenResolution = await resolveGitHubAppInstallationToken({
    env: input.env,
    fetchImpl: resolveFetch(input.env),
    apiBaseUrl: normalizeApiBaseUrl(input.env?.GITHUB_API_BASE_URL)
  });
  if (!tokenResolution.ok) {
    return {
      ok: false,
      status: 503,
      error: "github_execution_token_unavailable",
      reason:
        tokenResolution.warning ||
        "GitHub App installation token is unavailable for VPS runner update status"
    };
  }

  const apiBaseUrl = normalizeApiBaseUrl(input.env?.GITHUB_API_BASE_URL);
  const fetchImpl = resolveFetch(input.env);
  let comments;
  try {
    comments = await readAllIssueComments({
      apiBaseUrl,
      repository,
      issueNumber,
      token: tokenResolution.token,
      fetchImpl
    });
  } catch (error) {
    return {
      ok: false,
      status: error?.status || 503,
      error: "vps_runner_update_status_failed",
      reason: normalizeText(error?.message) || "failed to read VPS runner update comments"
    };
  }

  const queueComment = comments.find((comment) =>
    normalizeText(comment?.body).includes(`${VPS_RUNNER_UPDATE_QUEUE_MARKER}:${updateId}`)
  );
  if (!queueComment) {
    return {
      ok: false,
      status: 404,
      error: "vps_runner_update_not_found",
      reason: "no VPS runner update queue comment matched updateId"
    };
  }

  const queuePayload = parseVpsRunnerUpdateQueueComment(queueComment?.body);
  const events = comments
    .filter((comment) => normalizeText(comment?.body).includes(`${VPS_RUNNER_UPDATE_EVENT_MARKER}:${updateId}`))
    .map((comment) => ({
      commentId: normalizePositiveInteger(comment?.id),
      commentUrl: normalizeText(comment?.html_url) || null,
      createdAt: normalizeText(comment?.created_at) || null,
      event: extractFirstJsonFence(comment?.body)
    }))
    .filter((item) => item.event)
    .map((item) => ({
      ...item,
      event: normalizeVpsRunnerUpdateEvent(item.event)
    }));
  const latest = selectLatestUpdateEvent(events);
  const staleBlocker =
    !latest && queueComment
      ? buildUpdatePickupStaleBlocker({
          queueComment,
          env: input.env
        })
      : latest?.event?.status === VpsRunnerUpdateStatus.RUNNING
        ? buildUpdateEventStaleBlocker({
            latest,
            env: input.env
          })
        : null;

  return {
    ok: true,
    update: {
      updateId,
      repository,
      issueNumber,
      ref: queuePayload.payload?.ref || DEFAULT_REF,
      phase: queuePayload.payload?.phase || "execution",
      actionType: queuePayload.payload?.actionType || null,
      status: staleBlocker
        ? VpsRunnerUpdateStatus.STALE
        : latest?.event?.status || VpsRunnerUpdateStatus.QUEUED,
      queueCommentId: normalizePositiveInteger(queueComment?.id),
      queueCommentUrl: normalizeText(queueComment?.html_url) || null,
      lastSeenAt: latest?.event?.lastSeenAt || latest?.event?.updatedAt || null,
      runnerVersion: latest?.event?.runnerVersion || null,
      commitSha: latest?.event?.commitSha || null,
      currentStep: latest?.event?.currentStep || null,
      latestEvent: latest?.event || null,
      blocker: latest?.event?.rawFailure || staleBlocker || null
    }
  };
}

export function validateVpsRunnerUpdateRequest(input = {}) {
  const repository = normalizeRepository(input.repository);
  const issueNumber = normalizePositiveInteger(input.issueNumber);
  const ref = normalizeRef(input.ref || DEFAULT_REF);
  const phase = normalizeText(input.phase) || "execution";
  const actionType = normalizeText(input.actionType);
  const updateId = normalizeUpdateId(input.updateId) || buildVpsRunnerUpdateId({ issueNumber });
  const approvalPhrase = normalizeText(input.approvalPhrase);
  const approvalGrantId = normalizeText(input.approvalGrantId || input.approvalGrant?.approvalId);
  const approvalActor = normalizeText(input.approvalActor);

  const issues = [];
  if (!repository) {
    issues.push("repository is required");
  }
  if (!issueNumber) {
    issues.push("issueNumber is required");
  }
  if (ref !== DEFAULT_REF) {
    issues.push("ref must be main for VPS runner self-update");
  }
  if (!phase) {
    issues.push("phase is required");
  }
  if (!ALLOWED_ACTION_TYPES.has(actionType)) {
    issues.push("actionType must be vps_runner_update_restart or vps_runner_update_reload");
  }
  if (approvalPhrase !== "GO") {
    issues.push("approvalPhrase must be GO");
  }
  if (!approvalGrantId) {
    issues.push("approvalGrantId is required");
  }

  return issues.length > 0
    ? { ok: false, issues }
    : {
        ok: true,
        request: {
          updateId,
          repository,
          issueNumber,
          ref,
          phase,
          actionType,
          approvalGrantId,
          approvalActor,
          requestedAt: new Date().toISOString()
        }
      };
}

export function validateVpsRunnerUpdateApprovalGrant({ approvalGrant, request } = {}) {
  const scope = buildVpsRunnerUpdateApprovalScope(request);
  const grantValidation = evaluateApprovalGrant({
    approvalGrant,
    scope
  });
  return grantValidation.ok
    ? { ok: true }
    : {
        ok: false,
        reason: grantValidation.reason
      };
}

export function buildVpsRunnerUpdateApprovalScope(request = {}) {
  return {
    actionType: normalizeText(request.actionType),
    highRiskKind: "vps_runner_admin",
    repositoryInput: normalizeRepository(request.repository),
    issueNumber: normalizeText(request.issueNumber),
    relatedIssue: normalizeText(request.issueNumber),
    phase: normalizeText(request.phase) || "execution",
    ref: normalizeRef(request.ref || DEFAULT_REF)
  };
}

export function buildVpsRunnerUpdateQueueComment({ request }) {
  const payload = {
    updateId: request.updateId,
    operation: "vps_runner_update",
    repository: request.repository,
    issueNumber: request.issueNumber,
    ref: request.ref,
    phase: request.phase,
    actionType: request.actionType,
    approvalScopeMatched: true,
    approvalActor: request.approvalActor || null,
    requestedAt: request.requestedAt || new Date().toISOString()
  };
  return [
    `<!-- ${VPS_RUNNER_UPDATE_QUEUE_MARKER}:${request.updateId} -->`,
    "VTDD-managed VPS runner self-update request.",
    "",
    "Bounded update contract:",
    `- Repository: ${request.repository}`,
    `- Issue: #${request.issueNumber}`,
    `- Ref: ${request.ref}`,
    `- Phase: ${request.phase}`,
    `- Action Type: ${request.actionType}`,
    "- Operation: allowlisted git fetch / checkout main / pull --ff-only plus configured restart/reload",
    "- Runtime truth: GitHub update queue and runner event comments",
    "",
    "Rules:",
    "- Do not execute arbitrary shell commands.",
    "- Do not merge.",
    "- Do not deploy Cloudflare.",
    "- Do not print secrets.",
    "",
    "Runner payload:",
    fencedJson(payload)
  ].join("\n");
}

export function parseVpsRunnerUpdateQueueComment(body) {
  const text = normalizeText(body);
  const marker = text.match(/vtdd:vps-runner-update:([a-zA-Z0-9._:-]+)/);
  if (!marker) {
    return { ok: false, reason: "vps_runner_update_marker_missing" };
  }
  const payload = extractFirstJsonFence(text);
  if (!payload) {
    return { ok: false, reason: "vps_runner_update_payload_missing", updateId: marker[1] };
  }
  const normalized = {
    updateId: normalizeUpdateId(payload.updateId),
    operation: normalizeText(payload.operation),
    repository: normalizeRepository(payload.repository),
    issueNumber: normalizePositiveInteger(payload.issueNumber),
    ref: normalizeRef(payload.ref || DEFAULT_REF),
    phase: normalizeText(payload.phase) || "execution",
    actionType: normalizeText(payload.actionType),
    approvalScopeMatched: payload.approvalScopeMatched === true,
    approvalActor: normalizeText(payload.approvalActor),
    requestedAt: normalizeText(payload.requestedAt)
  };
  const issues = [];
  if (normalized.updateId !== marker[1]) {
    issues.push("updateId does not match queue marker");
  }
  if (normalized.operation !== "vps_runner_update") {
    issues.push("operation must be vps_runner_update");
  }
  if (!normalized.repository) {
    issues.push("repository is required");
  }
  if (!normalized.issueNumber) {
    issues.push("issueNumber is required");
  }
  if (normalized.ref !== DEFAULT_REF) {
    issues.push("ref must be main");
  }
  if (!ALLOWED_ACTION_TYPES.has(normalized.actionType)) {
    issues.push("actionType must be allowlisted");
  }
  if (!normalized.approvalScopeMatched) {
    issues.push("approvalScopeMatched must be true");
  }
  return issues.length > 0
    ? { ok: false, reason: "vps_runner_update_payload_invalid", updateId: marker[1], issues }
    : { ok: true, updateId: normalized.updateId, payload: normalized };
}

export function buildVpsRunnerUpdateEventComment({ updateId, event }) {
  return [
    `<!-- ${VPS_RUNNER_UPDATE_EVENT_MARKER}:${updateId} -->`,
    "VTDD VPS runner self-update event.",
    "",
    fencedJson(event)
  ].join("\n");
}

function normalizeVpsRunnerUpdateEvent(event = {}) {
  return {
    status: normalizeUpdateStatus(event.status),
    updateId: normalizeUpdateId(event.updateId),
    repository: normalizeRepository(event.repository),
    issueNumber: normalizePositiveInteger(event.issueNumber),
    ref: normalizeRef(event.ref || DEFAULT_REF),
    phase: normalizeText(event.phase),
    actionType: normalizeText(event.actionType),
    currentStep: normalizeText(event.currentStep) || null,
    lastEvent: normalizeText(event.lastEvent) || null,
    lastSeenAt: normalizeText(event.lastSeenAt) || null,
    runnerVersion: normalizeText(event.runnerVersion) || null,
    commitSha: normalizeText(event.commitSha) || null,
    previousCommitSha: normalizeText(event.previousCommitSha) || null,
    updatedAt: normalizeText(event.updatedAt) || normalizeText(event.lastSeenAt) || null,
    rawFailure: event.rawFailure && typeof event.rawFailure === "object" ? event.rawFailure : null
  };
}

function normalizeUpdateStatus(value) {
  const status = normalizeText(value);
  return Object.values(VpsRunnerUpdateStatus).includes(status) ? status : VpsRunnerUpdateStatus.RUNNING;
}

function buildUpdatePickupStaleBlocker({ queueComment, env }) {
  const graceSeconds = normalizeNonNegativeNumber(env?.VPS_RUNNER_UPDATE_PICKUP_GRACE_SECONDS ?? 300);
  const createdAt = Date.parse(normalizeText(queueComment?.created_at));
  if (!Number.isFinite(createdAt)) {
    return null;
  }
  const ageSeconds = Math.floor((Date.now() - createdAt) / 1000);
  if (ageSeconds < graceSeconds) {
    return null;
  }
  return {
    error: "vps_runner_update_pickup_not_observed",
    reason: "VPS runner did not report self-update pickup within the pickup grace period",
    graceSeconds,
    ageSeconds
  };
}

function buildUpdateEventStaleBlocker({ latest, env }) {
  const staleSeconds = normalizeNonNegativeNumber(env?.VPS_RUNNER_UPDATE_STALE_SECONDS ?? 600);
  const updatedAt = Date.parse(normalizeText(latest?.event?.updatedAt));
  if (!Number.isFinite(updatedAt)) {
    return null;
  }
  const ageSeconds = Math.floor((Date.now() - updatedAt) / 1000);
  if (ageSeconds < staleSeconds) {
    return null;
  }
  return {
    error: "vps_runner_update_event_stale",
    reason:
      "VPS runner self-update is running but has not posted a fresh event within the stale threshold",
    staleSeconds,
    ageSeconds
  };
}

function selectLatestUpdateEvent(events) {
  return [...(Array.isArray(events) ? events : [])]
    .sort((left, right) => {
      const leftUpdatedAt = Date.parse(normalizeText(left?.event?.updatedAt));
      const rightUpdatedAt = Date.parse(normalizeText(right?.event?.updatedAt));
      if (Number.isFinite(leftUpdatedAt) && Number.isFinite(rightUpdatedAt) && leftUpdatedAt !== rightUpdatedAt) {
        return leftUpdatedAt - rightUpdatedAt;
      }
      return (left.commentId || 0) - (right.commentId || 0);
    })
    .at(-1) || null;
}

async function readAllIssueComments({ apiBaseUrl, repository, issueNumber, token, fetchImpl }) {
  const comments = [];
  for (let page = 1; ; page += 1) {
    const response = await fetchImpl(
      `${apiBaseUrl}/repos/${encodeURIComponentRepository(repository)}/issues/${encodeURIComponent(
        String(issueNumber)
      )}/comments?per_page=100&page=${page}`,
      {
        method: "GET",
        headers: githubJsonHeaders({ token })
      }
    );
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

function buildVpsRunnerUpdateId({ issueNumber }) {
  return `vps-update-issue${issueNumber || "unknown"}-${Date.now().toString(36)}`;
}

function normalizeUpdateId(value) {
  const text = normalizeText(value);
  return /^[A-Za-z0-9._:-]+$/.test(text) ? text : "";
}

function normalizeRepository(value) {
  const text = normalizeText(value);
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text) ? text : "";
}

function normalizeRef(value) {
  const text = normalizeText(value);
  return /^[A-Za-z0-9._/-]+$/.test(text) ? text : "";
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function normalizeNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeApiBaseUrl(value) {
  return normalizeText(value) || "https://api.github.com";
}

function resolveFetch(env = {}) {
  return typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
}

function encodeURIComponentRepository(repository) {
  const [owner = "", name = ""] = normalizeText(repository).split("/");
  return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function githubJsonHeaders({ token }) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json; charset=utf-8",
    "x-github-api-version": GITHUB_API_VERSION,
    "user-agent": GITHUB_USER_AGENT
  };
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractFirstJsonFence(text) {
  const fenced = String(text || "").match(/```json\s*([\s\S]*?)```/i);
  if (!fenced) {
    return null;
  }
  try {
    return JSON.parse(fenced[1]);
  } catch {
    return null;
  }
}

function fencedJson(value) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}
