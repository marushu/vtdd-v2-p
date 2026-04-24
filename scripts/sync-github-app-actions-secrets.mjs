import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  buildGitHubAppSecretSyncPlan,
  loadGitHubAppSecretSource,
  validateGitHubAppSecretSyncApprovalGrant
} from "../src/core/index.js";

const execFileAsync = promisify(execFile);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = args.repo || process.env.GITHUB_REPOSITORY || "marushu/vtdd-v2-p";
  const execute = args.execute === true;

  const sourceResult = await loadGitHubAppSecretSource({
    envPath: args.envPath
  });
  if (!sourceResult.ok) {
    throw new Error(sourceResult.issues.join(", "));
  }

  const planResult = buildGitHubAppSecretSyncPlan({
    repo,
    source: sourceResult.source,
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
    await execFileAsync(
      "gh",
      ["secret", "set", secret.name, "--repo", repo, "--app", "actions"],
      {
        input: secret.value,
        maxBuffer: 10 * 1024 * 1024
      }
    );
    console.log(`synced ${secret.name}`);
  }
}

function printDryRun(plan, source) {
  console.log("GitHub App secret sync dry-run");
  console.log(`repo: ${plan.repo}`);
  console.log(`env source: ${source.envPath}`);
  console.log(`app id: ${source.appId}`);
  console.log(`installation id: ${source.installationId}`);
  console.log(`private key path: ${source.privateKeyPath}`);
  console.log(
    `gateway bearer token path: ${source.gatewayBearerTokenPath || "[not configured in load-env.sh]"}`
  );
  console.log("secrets to sync:");
  for (const secret of plan.secrets) {
    const detail =
      secret.name === "VTDD_GITHUB_APP_PRIVATE_KEY"
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
    if (current === "--env-path") {
      parsed.envPath = args[index + 1];
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
      "execute mode requires gateway bearer token via --gateway-bearer-token, VTDD_GATEWAY_BEARER_TOKEN, or load-env.sh"
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
