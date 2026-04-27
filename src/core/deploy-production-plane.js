import { resolveGitHubAppInstallationToken } from "./github-app-repository-index.js";
import { validateDeployApprovalGrant } from "./deploy-approval-grant.js";

const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API_USER_AGENT = "vtdd-v2-deploy-production-plane";
const DEFAULT_DEPLOY_WORKFLOW_FILE = "deploy-production.yml";
const DEFAULT_DEPLOY_WORKFLOW_REF = "main";

export async function executeDeployProductionPlane(input = {}) {
  const repository = normalizeText(input.repository);
  const runtimeUrl = normalizeText(input.runtimeUrl);
  const approvalPhrase = normalizeText(input.approvalPhrase);
  const approvalGrant = input.approvalGrant ?? null;
  const approvalGrantId =
    normalizeText(input.approvalGrantId) || normalizeText(approvalGrant?.approvalId);
  const env = input.env ?? {};
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  const apiBaseUrl = normalizeApiBaseUrl(env?.GITHUB_API_BASE_URL);

  const validation = validateDeployProductionRequest({
    repository,
    runtimeUrl,
    approvalPhrase,
    approvalGrant,
    approvalGrantId
  });
  if (!validation.ok) {
    return {
      ok: false,
      status: 422,
      error: "deploy_request_invalid",
      reason: validation.issues.join(", "),
      issues: validation.issues
    };
  }

  const tokenResolution = await resolveGitHubAppInstallationToken({ env, fetchImpl, apiBaseUrl });
  if (!tokenResolution.ok) {
    return {
      ok: false,
      status: 503,
      error: "deploy_unavailable",
      reason: tokenResolution.warning || "GitHub App installation token is unavailable for deploy dispatch"
    };
  }

  const workflowRepository =
    normalizeText(env?.DEPLOY_WORKFLOW_REPOSITORY) ||
    normalizeText(env?.VTDD_GITHUB_ACTIONS_REPOSITORY) ||
    repository;
  const workflowFile = normalizeText(env?.DEPLOY_WORKFLOW_FILE) || DEFAULT_DEPLOY_WORKFLOW_FILE;
  const workflowRef = normalizeText(env?.DEPLOY_WORKFLOW_REF) || DEFAULT_DEPLOY_WORKFLOW_REF;

  const dispatchUrl = `${apiBaseUrl}/repos/${encodeURIComponentRepository(
    workflowRepository
  )}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`;
  const dispatchBody = {
    ref: workflowRef,
    inputs: {
      approval_phrase: "GO",
      runtime_url: runtimeUrl,
      approval_grant_id: approvalGrantId
    }
  };

  let response;
  try {
    response = await fetchImpl(dispatchUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenResolution.token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json; charset=utf-8",
        "x-github-api-version": GITHUB_API_VERSION,
        "user-agent": GITHUB_API_USER_AGENT
      },
      body: JSON.stringify(dispatchBody)
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error: "deploy_dispatch_failed",
      reason: "failed to dispatch deploy workflow"
    };
  }

  if (!response.ok) {
    const body = await readJsonSafe(response);
    return {
      ok: false,
      status: response.status,
      error: "deploy_dispatch_failed",
      reason: normalizeText(body?.message) || "GitHub deploy workflow dispatch failed"
    };
  }

  return {
    ok: true,
    deploy: {
      repository,
      workflowRepository,
      workflowFile,
      workflowRef,
      approvalGrantId,
      runtimeUrl,
      status: "dispatched"
    }
  };
}

function validateDeployProductionRequest({
  repository,
  runtimeUrl,
  approvalPhrase,
  approvalGrant,
  approvalGrantId
}) {
  const issues = [];
  if (!repository) {
    issues.push("repository is required");
  }
  if (!runtimeUrl) {
    issues.push("runtimeUrl is required");
  }
  if (approvalPhrase !== "GO") {
    issues.push("approvalPhrase must be GO");
  }
  if (!approvalGrantId) {
    issues.push("approvalGrantId is required");
  }

  const approvalValidation = validateDeployApprovalGrant({
    approvalGrant,
    repositoryInput: repository
  });
  if (!approvalValidation.ok) {
    issues.push(...approvalValidation.issues);
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

function encodeURIComponentRepository(repository) {
  const [owner = "", name = ""] = normalizeText(repository).split("/");
  return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

async function readJsonSafe(response) {
  return response.json().catch(() => ({}));
}

function normalizeApiBaseUrl(value) {
  const normalized = normalizeText(value);
  return normalized || "https://api.github.com";
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
