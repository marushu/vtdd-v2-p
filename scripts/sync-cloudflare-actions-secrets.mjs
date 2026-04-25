import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { executeCloudflareDeploySecretSync, loadDesktopBootstrapVault } from "../src/core/index.js";

const execFileAsync = promisify(execFile);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = normalizeText(args.repo || process.env.GITHUB_REPOSITORY || "marushu/vtdd-v2-p");
  const vault = await resolveVault(args);
  const source = {
    cloudflareApiToken: await resolveApiToken(args),
    cloudflareAccountId: normalizeText(
      args.cloudflareAccountId || process.env.CLOUDFLARE_ACCOUNT_ID || vault?.cloudflare?.accountId
    )
  };

  const approvalGrant = await resolveApprovalGrant({
    runtimeUrl: args.runtimeUrl || process.env.VTDD_RUNTIME_URL,
    approvalGrantId: args.approvalGrantId,
    bearerToken:
      args.gatewayBearerToken ||
      process.env.VTDD_GATEWAY_BEARER_TOKEN ||
      vault?.gateway?.bearerToken
  });

  const result = await executeCloudflareDeploySecretSync({
    repo,
    source,
    approvalGrant,
    runner: async (secret) => {
      await execFileAsync(
        "gh",
        ["secret", "set", secret.name, "--repo", repo, "--app", "actions"],
        {
          input: secret.value,
          maxBuffer: 10 * 1024 * 1024
        }
      );
      console.log(`synced ${secret.name}`);
      return { name: secret.name, synced: true };
    }
  });

  if (!result.ok) {
    throw new Error(result.issues.join(", "));
  }
}

async function resolveApiToken(args) {
  const fromArg = normalizeText(args.cloudflareApiToken);
  if (fromArg) {
    return fromArg;
  }

  const fromEnv = normalizeText(process.env.CLOUDFLARE_API_TOKEN);
  if (fromEnv) {
    return fromEnv;
  }

  const vault = await resolveVault(args);
  const fromVault = normalizeText(vault?.cloudflare?.apiToken);
  if (fromVault) {
    return fromVault;
  }

  const tokenPath = normalizeText(args.cloudflareApiTokenPath);
  if (tokenPath) {
    return normalizeText(await fs.readFile(tokenPath, "utf8"));
  }

  if (args.stdin === true) {
    return normalizeText(await readStdin());
  }

  return "";
}

let cachedVaultResult;
async function resolveVault(args) {
  if (cachedVaultResult !== undefined) {
    return cachedVaultResult;
  }
  const manifestPath = normalizeText(args.manifestPath);
  const result = await loadDesktopBootstrapVault({
    manifestPath: manifestPath || undefined
  });
  cachedVaultResult = result.ok ? result.vault : null;
  return cachedVaultResult;
}

async function resolveApprovalGrant(input = {}) {
  const approvalGrantId = normalizeText(input.approvalGrantId);
  const runtimeUrl = normalizeText(input.runtimeUrl);
  const bearerToken = normalizeText(input.bearerToken);

  if (!approvalGrantId) {
    throw new Error("--approval-grant-id is required");
  }
  if (!runtimeUrl) {
    throw new Error("--runtime-url or VTDD_RUNTIME_URL is required");
  }
  if (!bearerToken) {
    throw new Error("--gateway-bearer-token or VTDD_GATEWAY_BEARER_TOKEN is required");
  }

  const endpoint = new URL("/v2/retrieve/approval-grant", runtimeUrl);
  endpoint.searchParams.set("approvalId", approvalGrantId);
  const response = await fetch(endpoint, {
    headers: {
      authorization: `Bearer ${bearerToken}`
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.reason || `approval grant retrieval failed with status ${response.status}`);
  }
  if (!body?.approvalGrant) {
    throw new Error("approval grant retrieval returned no approvalGrant");
  }
  return body.approvalGrant;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === "--repo") {
      parsed.repo = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--cloudflare-api-token") {
      parsed.cloudflareApiToken = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--cloudflare-api-token-path") {
      parsed.cloudflareApiTokenPath = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--cloudflare-account-id") {
      parsed.cloudflareAccountId = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--manifest-path") {
      parsed.manifestPath = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--stdin") {
      parsed.stdin = true;
      continue;
    }
    if (current === "--runtime-url") {
      parsed.runtimeUrl = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--approval-grant-id") {
      parsed.approvalGrantId = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--gateway-bearer-token") {
      parsed.gatewayBearerToken = args[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
