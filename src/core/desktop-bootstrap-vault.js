import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEFAULT_VTDD_HOME_PATH = path.join(os.homedir(), ".vtdd");
export const DEFAULT_VTDD_CREDENTIALS_DIR = path.join(DEFAULT_VTDD_HOME_PATH, "credentials");
export const DEFAULT_VTDD_VAULT_MANIFEST_PATH = path.join(
  DEFAULT_VTDD_CREDENTIALS_DIR,
  "manifest.json"
);

export async function loadDesktopBootstrapVault(input = {}) {
  const manifestPath = normalizeText(input.manifestPath) || DEFAULT_VTDD_VAULT_MANIFEST_PATH;
  const manifestDir = path.dirname(manifestPath);
  const issues = [];

  let manifest;
  try {
    const content = await fs.readFile(manifestPath, "utf8");
    manifest = JSON.parse(content);
  } catch (error) {
    return {
      ok: false,
      issues: [
        error?.code === "ENOENT"
          ? `desktop bootstrap vault manifest not found: ${manifestPath}`
          : `desktop bootstrap vault manifest is unreadable: ${manifestPath}`
      ]
    };
  }

  if (Number(manifest?.version) !== 1) {
    issues.push("desktop bootstrap vault manifest version must be 1");
  }

  const githubApp = manifest?.githubApp ?? {};
  const cloudflare = manifest?.cloudflare ?? {};
  const gateway = manifest?.gateway ?? {};
  const reviewer = manifest?.reviewer ?? {};

  const githubAppPrivateKeyPath = resolveReferencedPath(manifestDir, githubApp.privateKeyPath);
  const cloudflareApiTokenPath = resolveReferencedPath(manifestDir, cloudflare.apiTokenPath);
  const gatewayBearerTokenPath = resolveReferencedPath(manifestDir, gateway.bearerTokenPath);
  const geminiApiKeyPath = resolveReferencedPath(manifestDir, reviewer.geminiApiKeyPath);

  const githubAppPrivateKey = await readOptionalTextFile(githubAppPrivateKeyPath, issues);
  const cloudflareApiToken = await readOptionalTextFile(cloudflareApiTokenPath, issues);
  const gatewayBearerToken = await readOptionalTextFile(gatewayBearerTokenPath, issues);
  const geminiApiKey = await readOptionalTextFile(geminiApiKeyPath, issues);

  if (!normalizeText(githubApp.appId)) {
    issues.push("githubApp.appId is required in desktop bootstrap vault manifest");
  }
  if (!normalizeText(githubApp.installationId)) {
    issues.push("githubApp.installationId is required in desktop bootstrap vault manifest");
  }
  if (!normalizeText(githubApp.privateKeyPath)) {
    issues.push("githubApp.privateKeyPath is required in desktop bootstrap vault manifest");
  }
  if (normalizeText(githubApp.privateKeyPath) && !normalizeText(githubAppPrivateKey)) {
    issues.push("desktop bootstrap vault GitHub App private key file is empty or unreadable");
  }
  if (normalizeText(cloudflare.apiTokenPath) && !normalizeText(cloudflareApiToken)) {
    issues.push("desktop bootstrap vault Cloudflare API token file is empty or unreadable");
  }
  if (normalizeText(gateway.bearerTokenPath) && !normalizeText(gatewayBearerToken)) {
    issues.push("desktop bootstrap vault gateway bearer token file is empty or unreadable");
  }
  if (normalizeText(reviewer.geminiApiKeyPath) && !normalizeText(geminiApiKey)) {
    issues.push("desktop bootstrap vault reviewer API key file is empty or unreadable");
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    vault: {
      manifestPath,
      manifestDir,
      githubApp: {
        appId: normalizeText(githubApp.appId),
        installationId: normalizeText(githubApp.installationId),
        privateKeyPath: githubAppPrivateKeyPath,
        privateKey: githubAppPrivateKey
      },
      cloudflare: {
        accountId: normalizeText(cloudflare.accountId),
        apiTokenPath: cloudflareApiTokenPath,
        apiToken: cloudflareApiToken
      },
      gateway: {
        bearerTokenPath: gatewayBearerTokenPath,
        bearerToken: gatewayBearerToken
      },
      reviewer: {
        geminiApiKeyPath,
        geminiApiKey
      }
    }
  };
}

function resolveReferencedPath(manifestDir, referencedPath) {
  const normalized = normalizeText(referencedPath);
  if (!normalized) {
    return "";
  }
  if (path.isAbsolute(normalized)) {
    return normalized;
  }
  return path.join(manifestDir, normalized);
}

async function readOptionalTextFile(filePath, issues) {
  const normalizedPath = normalizeText(filePath);
  if (!normalizedPath) {
    return "";
  }

  try {
    return normalizeText(await fs.readFile(normalizedPath, "utf8"));
  } catch {
    issues.push(`desktop bootstrap vault referenced file is unreadable: ${normalizedPath}`);
    return "";
  }
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
