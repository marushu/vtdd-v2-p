import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  buildGitHubAppSecretSyncPlan,
  loadGitHubAppSecretSource
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

  const gate = String(args.approval || "").trim();
  if (gate !== "GO+passkey") {
    throw new Error("execute mode requires --approval GO+passkey");
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
  console.log("secrets to sync:");
  for (const secret of plan.secrets) {
    const detail =
      secret.name === "VTDD_GITHUB_APP_PRIVATE_KEY"
        ? "[redacted private key content]"
        : secret.value;
    console.log(`- ${secret.name}: ${detail}`);
  }
  console.log("This is a high-risk operation. Re-run with --execute --approval GO+passkey to perform sync.");
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
    if (current === "--approval") {
      parsed.approval = args[index + 1];
      index += 1;
    }
  }
  return parsed;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
