import { resolveGitHubAppInstallationToken } from "./github-app-repository-index.js";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API_USER_AGENT = "vtdd-v2-github-actions-secret-sync";
const ALLOWED_ACTIONS_SECRET_NAMES = new Set(["OPENAI_API_KEY"]);

export async function executeGitHubActionsSecretSync(input = {}) {
  const repository = normalizeText(input.repository);
  const secretName = normalizeText(input.secretName);
  const secretValue = normalizeText(input.secretValue);
  const approvalGrant = input.approvalGrant ?? null;
  const env = input.env ?? {};
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  const apiBaseUrl = normalizeApiBaseUrl(env?.GITHUB_API_BASE_URL);
  const encryptSecret =
    typeof input.encryptSecret === "function" ? input.encryptSecret : encryptGitHubActionsSecret;

  const validation = validateGitHubActionsSecretSyncRequest({
    repository,
    secretName,
    secretValue,
    approvalGrant
  });
  if (!validation.ok) {
    return {
      ok: false,
      status: 422,
      error: "github_actions_secret_sync_request_invalid",
      reason: validation.issues.join(", "),
      issues: validation.issues
    };
  }

  const tokenResolution = await resolveGitHubAppInstallationToken({ env, fetchImpl, apiBaseUrl }).catch(
    (error) => ({
      ok: false,
      reason: `GitHub App installation token resolution threw: ${sanitizeGitHubActionsSecretSyncErrorMessage(error)}`,
      warning: `GitHub App installation token resolution threw: ${sanitizeGitHubActionsSecretSyncErrorMessage(error)}`
    })
  );
  if (!tokenResolution.ok) {
    return {
      ok: false,
      status: 503,
      error: "github_actions_secret_sync_unavailable",
      reason:
        tokenResolution.warning ||
        "GitHub App installation token is unavailable for GitHub Actions secret sync"
    };
  }

  const encodedRepository = encodeURIComponentRepository(repository);
  const publicKeyResponse = await fetchImpl(`${apiBaseUrl}/repos/${encodedRepository}/actions/secrets/public-key`, {
    method: "GET",
    headers: githubHeaders(tokenResolution.token)
  }).catch(() => null);
  if (!publicKeyResponse) {
    return {
      ok: false,
      status: 503,
      error: "github_actions_secret_sync_failed",
      reason: "failed to read GitHub Actions secret public key"
    };
  }

  const publicKeyBody = await readJsonSafe(publicKeyResponse);
  if (!publicKeyResponse.ok) {
    return {
      ok: false,
      status: publicKeyResponse.status,
      error: "github_actions_secret_sync_failed",
      reason: normalizeText(publicKeyBody?.message) || "GitHub Actions secret public key read failed"
    };
  }

  const keyId = normalizeText(publicKeyBody?.key_id);
  const key = normalizeText(publicKeyBody?.key);
  if (!keyId || !key) {
    return {
      ok: false,
      status: 503,
      error: "github_actions_secret_sync_failed",
      reason: "GitHub Actions secret public key response is incomplete"
    };
  }

  const encryptedValue = await encryptSecret({ publicKey: key, secretValue }).catch((error) => ({
    ok: false,
    error: "github_actions_secret_encryption_failed",
    reason: sanitizeGitHubActionsSecretSyncErrorMessage(error)
  }));
  if (encryptedValue && typeof encryptedValue === "object" && encryptedValue.ok === false) {
    return {
      ok: false,
      status: 503,
      error: encryptedValue.error,
      reason: encryptedValue.reason
    };
  }
  const putResponse = await fetchImpl(
    `${apiBaseUrl}/repos/${encodedRepository}/actions/secrets/${encodeURIComponent(secretName)}`,
    {
      method: "PUT",
      headers: githubHeaders(tokenResolution.token),
      body: JSON.stringify({
        encrypted_value: encryptedValue,
        key_id: keyId
      })
    }
  ).catch(() => null);
  if (!putResponse) {
    return {
      ok: false,
      status: 503,
      error: "github_actions_secret_sync_failed",
      reason: "failed to write GitHub Actions secret"
    };
  }

  if (!putResponse.ok) {
    const putBody = await readJsonSafe(putResponse);
    return {
      ok: false,
      status: putResponse.status,
      error: "github_actions_secret_sync_failed",
      reason: normalizeText(putBody?.message) || "GitHub Actions secret write failed"
    };
  }

  return {
    ok: true,
    secretSync: {
      repository,
      app: "actions",
      secretName,
      status: putResponse.status === 201 ? "created" : "updated"
    }
  };
}

export function validateGitHubActionsSecretSyncRequest({
  repository,
  secretName,
  secretValue,
  approvalGrant
}) {
  const issues = [];
  if (!repository) {
    issues.push("repository is required");
  }
  if (!ALLOWED_ACTIONS_SECRET_NAMES.has(secretName)) {
    issues.push("secretName must be OPENAI_API_KEY");
  }
  if (!secretValue) {
    issues.push("secretValue is required");
  }
  const approvalValidation = validateGitHubActionsSecretSyncApprovalGrant({
    approvalGrant,
    repository
  });
  if (!approvalValidation.ok) {
    issues.push(...approvalValidation.issues);
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

export function validateGitHubActionsSecretSyncApprovalGrant(input = {}) {
  const approvalGrant = input.approvalGrant ?? null;
  const repository = normalizeText(input.repository);
  const now = new Date(input.now ?? Date.now());

  if (!approvalGrant || approvalGrant.verified !== true) {
    return {
      ok: false,
      issues: ["real approvalGrant is required for GitHub Actions secret sync"]
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

  if (normalizeText(scope.highRiskKind) !== "github_actions_secret_sync") {
    return {
      ok: false,
      issues: ["approvalGrant scope.highRiskKind must be github_actions_secret_sync"]
    };
  }

  return { ok: true };
}

export async function encryptGitHubActionsSecret({ publicKey, secretValue }) {
  const sealedbox = await import("tweetnacl-sealedbox-js");
  const seal = sealedbox.seal ?? sealedbox.default?.seal;
  if (typeof seal !== "function") {
    throw new Error("tweetnacl sealed box seal function is unavailable");
  }
  const binaryKey = base64ToBytes(publicKey);
  const binarySecret = new TextEncoder().encode(secretValue);
  return bytesToBase64(seal(binarySecret, binaryKey));
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

function base64ToBytes(value) {
  const normalized = normalizeText(value);
  if (typeof atob === "function") {
    return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
  }
  const bufferCtor = globalThis.Buffer;
  if (bufferCtor) {
    return Uint8Array.from(bufferCtor.from(normalized, "base64"));
  }
  throw new Error("base64 decoder unavailable");
}

function bytesToBase64(bytes) {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  const bufferCtor = globalThis.Buffer;
  if (bufferCtor) {
    return bufferCtor.from(bytes).toString("base64");
  }
  throw new Error("base64 encoder unavailable");
}

export function sanitizeGitHubActionsSecretSyncErrorMessage(error) {
  return normalizeText(error instanceof Error ? error.message : error)
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_OPENAI_KEY]")
    .replace(/(authorization|api[_-]?key|token|secret)(["'\s:=]+)([^"'\s<>&]+)/gi, "$1$2[REDACTED]")
    .slice(0, 500);
}
