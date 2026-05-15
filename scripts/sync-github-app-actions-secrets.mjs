import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildGitHubAppSecretSyncPlan,
  loadGitHubAppSecretSource,
  validateGitHubAppSecretSyncApprovalGrant
} from "../src/core/github-app-secret-sync.js";

const DEFAULT_GH_SECRET_SET_TIMEOUT_MS = 30_000;
const DEFAULT_GH_SECRET_SET_KILL_GRACE_MS = 2_000;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = args.repo || process.env.GITHUB_REPOSITORY || "marushu/vtdd-v2-p";
  const execute = args.execute === true;

  const sourceResult = await loadGitHubAppSecretSource({
    manifestPath: args.manifestPath,
    role: args.appRole,
    appId: args.appId,
    privateKeyPath: args.privateKeyPath,
    installationId: args.installationId
  });
  if (!sourceResult.ok) {
    throw new Error(sourceResult.issues.join(", "));
  }

  const planResult = buildGitHubAppSecretSyncPlan({
    repo,
    source: sourceResult.source,
    role: args.appRole,
    execute
  });
  if (!planResult.ok) {
    throw new Error(planResult.issues.join(", "));
  }

  const plan = planResult.plan;
  if (!execute) {
    printDryRun(plan, sourceResult.source);
    return;
  }

  const approvalGrant = await resolveApprovalGrant({
    runtimeUrl: args.runtimeUrl || process.env.VTDD_RUNTIME_URL,
    approvalGrantId: args.approvalGrantId,
    bearerToken:
      args.gatewayBearerToken ||
      process.env.VTDD_GATEWAY_BEARER_TOKEN ||
      sourceResult.source.gatewayBearerToken
  });
  const approvalValidation = validateGitHubAppSecretSyncApprovalGrant({
    approvalGrant,
    repo
  });
  if (!approvalValidation.ok) {
    throw new Error(approvalValidation.issues.join(", "));
  }

  for (const secret of plan.secrets) {
    await setGitHubActionsSecret({
      repo,
      secret,
      timeoutMs: args.secretSetTimeoutMs
    });
    console.log(`synced ${secret.name}`);
  }
}

export function setGitHubActionsSecret({
  repo,
  secret,
  timeoutMs = DEFAULT_GH_SECRET_SET_TIMEOUT_MS,
  killGraceMs = DEFAULT_GH_SECRET_SET_KILL_GRACE_MS,
  spawnImpl = spawn
}) {
  const secretName = String(secret?.name ?? "").trim();
  const secretValue = String(secret?.value ?? "");
  const normalizedRepo = String(repo ?? "").trim();
  const normalizedTimeoutMs = normalizeTimeoutMs(timeoutMs);
  const normalizedKillGraceMs = normalizeTimeoutMs(killGraceMs);

  if (!normalizedRepo) {
    throw new Error("repo is required for GitHub App secret sync");
  }
  if (!secretName) {
    throw new Error("secret name is required for GitHub App secret sync");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let closed = false;
    let killTimer = null;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const child = spawnImpl(
      "gh",
      ["secret", "set", secretName, "--repo", normalizedRepo, "--app", "actions"],
      {
        stdio: ["pipe", "pipe", "pipe"]
      }
    );

    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (closed && killTimer) {
        clearTimeout(killTimer);
      }
      callback(value);
    };

    const fail = (reason) => {
      finish(reject, new Error(`gh secret set failed for ${secretName}: ${reason}`));
    };

    const timer = setTimeout(() => {
      if (typeof child.kill === "function") {
        child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          if (!closed && typeof child.kill === "function") {
            child.kill("SIGKILL");
          }
        }, normalizedKillGraceMs);
        killTimer.unref?.();
      }
      fail(`timeout after ${normalizedTimeoutMs}ms`);
    }, normalizedTimeoutMs);

    child.stdout?.on?.("data", (chunk) => {
      stdoutBytes += Buffer.byteLength(chunk);
    });
    child.stderr?.on?.("data", (chunk) => {
      stderrBytes += Buffer.byteLength(chunk);
    });
    child.on?.("error", (error) => {
      fail(error instanceof Error ? error.message : String(error));
    });
    child.on?.("close", (code, signal) => {
      closed = true;
      if (killTimer) {
        clearTimeout(killTimer);
      }
      if (settled) {
        return;
      }
      if (code === 0) {
        finish(resolve, { ok: true, name: secretName });
        return;
      }
      const suffix = signal
        ? `signal ${signal}`
        : `exit code ${code}`;
      fail(`${suffix}; stdout=${stdoutBytes} bytes; stderr=${stderrBytes} bytes`);
    });

    child.stdin?.on?.("error", (error) => {
      fail(`stdin error: ${error instanceof Error ? error.message : String(error)}`);
    });
    child.stdin?.write?.(secretValue);
    child.stdin?.end?.();
  });
}

function normalizeTimeoutMs(value) {
  const timeoutMs = Number(value ?? DEFAULT_GH_SECRET_SET_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("secret set timeout must be a positive integer");
  }
  return timeoutMs;
}

function printDryRun(plan, source) {
  console.log("GitHub App secret sync dry-run");
  console.log(`repo: ${plan.repo}`);
  console.log(`role: ${plan.role} (${plan.roleLabel})`);
  console.log(`vault manifest: ${source.manifestPath || "[not used for role-specific key]"}`);
  console.log(`app id: ${source.appId}`);
  console.log(`installation id: ${source.installationId || "[not provided]"}`);
  console.log(`private key path: ${source.privateKeyPath}`);
  console.log(
    `gateway bearer token path: ${source.gatewayBearerTokenPath || "[not configured in vault manifest]"}`
  );
  console.log("secrets to sync:");
  for (const secret of plan.secrets) {
    const detail =
      secret.name.endsWith("_PRIVATE_KEY")
        ? "[redacted private key content]"
        : secret.value;
    console.log(`- ${secret.name}: ${detail}`);
  }
  console.log(
    "This is a high-risk operation. Re-run with --execute --runtime-url <url> --approval-grant-id <id> after real passkey approval."
  );
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === "--execute") {
      parsed.execute = true;
      continue;
    }
    if (current === "--repo") {
      parsed.repo = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--manifest-path") {
      parsed.manifestPath = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--app-role") {
      parsed.appRole = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--app-id") {
      parsed.appId = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--private-key-path") {
      parsed.privateKeyPath = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--installation-id") {
      parsed.installationId = args[index + 1];
      index += 1;
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
      continue;
    }
    if (current === "--secret-set-timeout-ms") {
      parsed.secretSetTimeoutMs = args[index + 1];
      index += 1;
    }
  }
  return parsed;
}

async function resolveApprovalGrant(input = {}) {
  const approvalGrantId = String(input.approvalGrantId ?? "").trim();
  const runtimeUrl = String(input.runtimeUrl ?? "").trim();
  const bearerToken = String(input.bearerToken ?? "").trim();

  if (!approvalGrantId) {
    throw new Error("execute mode requires --approval-grant-id");
  }
  if (!runtimeUrl) {
    throw new Error("execute mode requires --runtime-url or VTDD_RUNTIME_URL");
  }
  if (!bearerToken) {
    throw new Error(
      "execute mode requires gateway bearer token via --gateway-bearer-token, VTDD_GATEWAY_BEARER_TOKEN, or ~/.vtdd/credentials/manifest.json"
    );
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
