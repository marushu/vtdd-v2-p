import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_GITHUB_APP_ENV_PATH = path.join(
  process.cwd(),
  "credentials",
  "github-app",
  "load-env.sh"
);

export async function loadGitHubAppSecretSource(input = {}) {
  const envPath = input.envPath || DEFAULT_GITHUB_APP_ENV_PATH;
  const content = await fs.readFile(envPath, "utf8");
  const variables = parseExportedShellVariables(content);

  const appId = normalizeText(variables.GITHUB_APP_ID);
  const privateKeyPath = normalizeText(variables.GITHUB_APP_PRIVATE_KEY_PATH);
  const installationId = normalizeText(variables.GITHUB_APP_INSTALLATION_ID);
  const privateKey = privateKeyPath ? await fs.readFile(privateKeyPath, "utf8") : "";

  const issues = [];
  if (!appId) {
    issues.push("GITHUB_APP_ID is missing from load-env.sh");
  }
  if (!installationId) {
    issues.push("GITHUB_APP_INSTALLATION_ID is missing from load-env.sh");
  }
  if (!privateKeyPath) {
    issues.push("GITHUB_APP_PRIVATE_KEY_PATH is missing from load-env.sh");
  }
  if (!normalizeText(privateKey)) {
    issues.push("GitHub App private key file is empty or unreadable");
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    source: {
      envPath,
      appId,
      installationId,
      privateKeyPath,
      privateKey
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

function parseExportedShellVariables(content) {
  const exports = {};
  const lines = String(content ?? "").split("\n");
  for (const line of lines) {
    const match = line.match(/^export\s+([A-Z0-9_]+)=\"?(.*?)\"?$/);
    if (!match) {
      continue;
    }
    exports[match[1]] = match[2];
  }
  return exports;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
