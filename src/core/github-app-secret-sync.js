import {
  DEFAULT_VTDD_VAULT_MANIFEST_PATH,
  loadDesktopBootstrapVault
} from "./desktop-bootstrap-vault.js";

export async function loadGitHubAppSecretSource(input = {}) {
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
  const issues = [];

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
      secrets: [
        {
          name: "VTDD_GITHUB_APP_ID",
          value: source.appId
        },
        {
          name: "VTDD_GITHUB_APP_PRIVATE_KEY",
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
