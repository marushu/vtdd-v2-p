import { resolveGitHubAppInstallationToken } from "./github-app-repository-index.js";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API_USER_AGENT = "vtdd-v2-github-actions-variable-sync";
const ALLOWED_ACTIONS_VARIABLE_NAMES = new Set([
  "VTDD_DASHBOARD_VPS_MAINTENANCE_HOST",
  "VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR"
]);

export async function executeGitHubActionsVariableSync(input = {}) {
  const repository = normalizeText(input.repository);
  const variableName = normalizeText(input.variableName);
  const variableValue = normalizeText(input.variableValue);
  const approvalGrant = input.approvalGrant ?? null;
  const env = input.env ?? {};
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  const apiBaseUrl = normalizeApiBaseUrl(env?.GITHUB_API_BASE_URL);
  const sanitizeFailure = (message) =>
    sanitizeGitHubActionsVariableSyncErrorMessage(message, { sensitiveValues: [variableValue] });

  const validation = validateGitHubActionsVariableSyncRequest({
    repository,
    variableName,
    variableValue,
    approvalGrant
  });
  if (!validation.ok) {
    return {
      ok: false,
      status: 422,
      error: "github_actions_variable_sync_request_invalid",
      reason: validation.issues.join(", "),
      issues: validation.issues
    };
  }

  const tokenResolution = await resolveGitHubAppInstallationToken({ env, fetchImpl, apiBaseUrl }).catch(
    (error) => ({
      ok: false,
      reason: `GitHub App installation token resolution threw: ${sanitizeFailure(error)}`,
      warning: `GitHub App installation token resolution threw: ${sanitizeFailure(error)}`
    })
  );
  if (!tokenResolution.ok) {
    return {
      ok: false,
      status: 503,
      error: "github_actions_variable_sync_unavailable",
      reason:
        tokenResolution.warning ||
        "GitHub App installation token is unavailable for GitHub Actions variable sync"
    };
  }

  const encodedRepository = encodeURIComponentRepository(repository);
  const encodedVariableName = encodeURIComponent(variableName);
  const variableUrl = `${apiBaseUrl}/repos/${encodedRepository}/actions/variables/${encodedVariableName}`;
  const existingResponse = await fetchImpl(variableUrl, {
    method: "GET",
    headers: githubHeaders(tokenResolution.token)
  }).catch(() => null);
  if (!existingResponse) {
    return {
      ok: false,
      status: 503,
      error: "github_actions_variable_sync_failed",
      reason: "failed to read GitHub Actions variable"
    };
  }
  if (!existingResponse.ok && existingResponse.status !== 404) {
    const existingBody = await readJsonSafe(existingResponse);
    return {
      ok: false,
      status: existingResponse.status,
      error: "github_actions_variable_sync_failed",
      reason:
        sanitizeFailure(normalizeText(existingBody?.message)) ||
        "GitHub Actions variable read failed"
    };
  }

  const requestBody = JSON.stringify({
    name: variableName,
    value: variableValue
  });
  const writeResponse =
    existingResponse.status === 404
      ? await fetchImpl(`${apiBaseUrl}/repos/${encodedRepository}/actions/variables`, {
          method: "POST",
          headers: githubHeaders(tokenResolution.token),
          body: requestBody
        }).catch(() => null)
      : await fetchImpl(variableUrl, {
          method: "PATCH",
          headers: githubHeaders(tokenResolution.token),
          body: requestBody
        }).catch(() => null);
  if (!writeResponse) {
    return {
      ok: false,
      status: 503,
      error: "github_actions_variable_sync_failed",
      reason: "failed to write GitHub Actions variable"
    };
  }
  if (!writeResponse.ok) {
    const writeBody = await readJsonSafe(writeResponse);
    return {
      ok: false,
      status: writeResponse.status,
      error: "github_actions_variable_sync_failed",
      reason:
        sanitizeFailure(normalizeText(writeBody?.message)) ||
        "GitHub Actions variable write failed"
    };
  }

  return {
    ok: true,
    variableSync: {
      repository,
      app: "actions",
      variableName,
      status: writeResponse.status === 201 ? "created" : "updated"
    }
  };
}

export function validateGitHubActionsVariableSyncRequest({
  repository,
  variableName,
  variableValue,
  approvalGrant
}) {
  const issues = [];
  if (!repository) {
    issues.push("repository is required");
  }
  if (!ALLOWED_ACTIONS_VARIABLE_NAMES.has(variableName)) {
    issues.push(
      "variableName must be VTDD_DASHBOARD_VPS_MAINTENANCE_HOST or VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR"
    );
  }
  if (!variableValue) {
    issues.push("variableValue is required");
  }
  const approvalValidation = validateGitHubActionsVariableSyncApprovalGrant({
    approvalGrant,
    repository,
    variableName
  });
  if (!approvalValidation.ok) {
    issues.push(...approvalValidation.issues);
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

export function validateGitHubActionsVariableSyncApprovalGrant(input = {}) {
  const approvalGrant = input.approvalGrant ?? null;
  const repository = normalizeText(input.repository);
  const variableName = normalizeText(input.variableName);
  const now = new Date(input.now ?? Date.now());

  if (!approvalGrant || approvalGrant.verified !== true) {
    return {
      ok: false,
      issues: ["real approvalGrant is required for GitHub Actions variable sync"]
    };
  }

  const expiresAt = normalizeText(approvalGrant.expiresAt);
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now.valueOf()) {
    return {
      ok: false,
      issues: ["approvalGrant is expired or invalid"]
    };
  }

  const scope = approvalGrant.scope ?? {};
  if (normalizeText(scope.repositoryInput) !== repository) {
    return {
      ok: false,
      issues: ["approvalGrant scope.repositoryInput must match target repo"]
    };
  }

  if (normalizeText(scope.highRiskKind) !== "github_actions_variable_sync") {
    return {
      ok: false,
      issues: ["approvalGrant scope.highRiskKind must be github_actions_variable_sync"]
    };
  }

  if (normalizeText(scope.variableName) !== variableName) {
    return {
      ok: false,
      issues: ["approvalGrant scope.variableName must match target variableName"]
    };
  }

  return { ok: true };
}

export function sanitizeGitHubActionsVariableSyncErrorMessage(error, options = {}) {
  const sensitiveValues = Array.isArray(options.sensitiveValues) ? options.sensitiveValues : [];
  return sensitiveValues
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .reduce(
      (message, value) => message.split(value).join("[REDACTED_VARIABLE_VALUE]"),
      String(error?.message || error || "unknown error")
    )
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_OPENAI_KEY]")
    .replace(/(authorization|api[_-]?key|token|secret)(["'\s:=]+)([^"'\s<>&]+)/gi, "$1$2[REDACTED]");
}

function githubHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json; charset=utf-8",
    "x-github-api-version": GITHUB_API_VERSION,
    "user-agent": GITHUB_API_USER_AGENT
  };
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
  return normalized ? normalized.replace(/\/+$/, "") : GITHUB_API_BASE_URL;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
