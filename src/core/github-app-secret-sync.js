import {
  DEFAULT_VTDD_VAULT_MANIFEST_PATH,
  loadDesktopBootstrapVault
} from "./desktop-bootstrap-vault.js";
import fs from "node:fs/promises";

export const GITHUB_APP_SECRET_SYNC_ROLES = {
  legacy: {
    label: "Legacy vtdd-codex",
    appIdSecretName: "VTDD_GITHUB_APP_ID",
    privateKeySecretName: "VTDD_GITHUB_APP_PRIVATE_KEY"
  },
  "gemini-reviewer": {
    label: "VTDD Gemini Reviewer",
    appIdSecretName: "VTDD_GEMINI_REVIEWER_APP_ID",
    privateKeySecretName: "VTDD_GEMINI_REVIEWER_APP_PRIVATE_KEY"
  },
  "codex-fallback-reviewer": {
    label: "VTDD Codex Fallback Reviewer",
    appIdSecretName: "VTDD_CODEX_FALLBACK_REVIEWER_APP_ID",
    privateKeySecretName: "VTDD_CODEX_FALLBACK_REVIEWER_APP_PRIVATE_KEY"
  },
  "mac-codex": {
    label: "VTDD mac Codex",
    appIdSecretName: "VTDD_MAC_CODEX_APP_ID",
    privateKeySecretName: "VTDD_MAC_CODEX_APP_PRIVATE_KEY"
  },
  "vps-codex-cli": {
    label: "VTDD VPS Codex CLI",
    appIdSecretName: "VTDD_VPS_CODEX_CLI_APP_ID",
    privateKeySecretName: "VTDD_VPS_CODEX_CLI_APP_PRIVATE_KEY"
  }
};

export async function loadGitHubAppSecretSource(input = {}) {
  const role = normalizeGitHubAppSecretSyncRole(input.role);
  if (role !== "legacy" || normalizeText(input.appId) || normalizeText(input.privateKeyPath)) {
    return loadExplicitGitHubAppSecretSource({ ...input, role });
  }

  const manifestPath = input.manifestPath || DEFAULT_VTDD_VAULT_MANIFEST_PATH;
  const vaultResult = await loadDesktopBootstrapVault({ manifestPath });
  if (!vaultResult.ok) {
    return vaultResult;
  }

  const vault = vaultResult.vault;
  return {
    ok: true,
    source: {
      sourceType: "desktop_bootstrap_vault",
      role,
      manifestPath: vault.manifestPath,
      appId: vault.githubApp.appId,
      installationId: vault.githubApp.installationId,
      privateKeyPath: vault.githubApp.privateKeyPath,
      privateKey: vault.githubApp.privateKey,
      gatewayBearerTokenPath: vault.gateway.bearerTokenPath,
      gatewayBearerToken: vault.gateway.bearerToken
    }
  };
}

export function buildGitHubAppSecretSyncPlan(input = {}) {
  const source = input.source ?? {};
  const repo = normalizeText(input.repo);
  const execute = input.execute === true;
  const role = normalizeGitHubAppSecretSyncRole(input.role || source.role);
  const roleConfig = GITHUB_APP_SECRET_SYNC_ROLES[role];
  const issues = [];

  if (!roleConfig) {
    issues.push("unsupported GitHub App secret sync role");
  }
  if (!repo) {
    issues.push("repo is required");
  }
  if (!normalizeText(source.appId)) {
    issues.push("source.appId is required");
  }
  if (!normalizeText(source.privateKey)) {
    issues.push("source.privateKey is required");
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    plan: {
      repo,
      execute,
      role,
      roleLabel: roleConfig.label,
      secrets: [
        {
          name: roleConfig.appIdSecretName,
          value: source.appId
        },
        {
          name: roleConfig.privateKeySecretName,
          value: source.privateKey
        }
      ]
    }
  };
}

export async function executeGitHubAppSecretSync(input = {}) {
  const planResult = buildGitHubAppSecretSyncPlan(input);
  if (!planResult.ok) {
    return planResult;
  }

  const plan = planResult.plan;
  const runner = input.runner;
  if (typeof runner !== "function") {
    return { ok: false, issues: ["runner is required"] };
  }

  const results = [];
  for (const secret of plan.secrets) {
    const result = await runner(secret);
    results.push(result);
  }

  return {
    ok: true,
    result: {
      repo: plan.repo,
      synced: results
    }
  };
}

export function normalizeGitHubAppSecretSyncRole(value) {
  const normalized = normalizeText(value) || "legacy";
  return Object.hasOwn(GITHUB_APP_SECRET_SYNC_ROLES, normalized) ? normalized : "";
}

async function loadExplicitGitHubAppSecretSource(input = {}) {
  const role = normalizeGitHubAppSecretSyncRole(input.role);
  const appId = normalizeText(input.appId);
  const privateKeyPath = normalizeText(input.privateKeyPath);
  const issues = [];

  if (!role) {
    issues.push("unsupported GitHub App secret sync role");
  }
  if (!appId) {
    issues.push("appId is required for role-specific GitHub App secret sync");
  }
  if (!privateKeyPath) {
    issues.push("privateKeyPath is required for role-specific GitHub App secret sync");
  }

  let privateKey = "";
  if (privateKeyPath) {
    try {
      privateKey = normalizeText(await fs.readFile(privateKeyPath, "utf8"));
    } catch {
      issues.push(`GitHub App private key file is unreadable: ${privateKeyPath}`);
    }
  }
  if (privateKeyPath && !privateKey) {
    issues.push("GitHub App private key file is empty or unreadable");
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const manifestPath = input.manifestPath || DEFAULT_VTDD_VAULT_MANIFEST_PATH;
  const vaultResult = await loadDesktopBootstrapVault({ manifestPath }).catch(() => null);
  const vault = vaultResult?.ok ? vaultResult.vault : null;

  return {
    ok: true,
    source: {
      sourceType: "explicit_role_private_key",
      role,
      manifestPath: vault?.manifestPath || normalizeText(input.manifestPath),
      appId,
      installationId: normalizeText(input.installationId),
      privateKeyPath,
      privateKey,
      gatewayBearerTokenPath: vault?.gateway?.bearerTokenPath || "",
      gatewayBearerToken: vault?.gateway?.bearerToken || ""
    }
  };
}

export function validateGitHubAppSecretSyncApprovalGrant(input = {}) {
  const approvalGrant = input.approvalGrant ?? null;
  const repo = normalizeText(input.repo);
  const now = new Date(input.now ?? Date.now());

  if (!approvalGrant || approvalGrant.verified !== true) {
    return {
      ok: false,
      issues: ["real approvalGrant is required for GitHub App secret sync"]
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
  if (normalizeText(scope.repositoryInput) !== repo) {
    return {
      ok: false,
      issues: ["approvalGrant scope.repositoryInput must match target repo"]
    };
  }

  if (normalizeText(scope.highRiskKind) !== "github_app_secret_sync") {
    return {
      ok: false,
      issues: ["approvalGrant scope.highRiskKind must be github_app_secret_sync"]
    };
  }

  return { ok: true };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
