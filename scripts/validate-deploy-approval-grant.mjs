import { validateDeployApprovalGrant } from "../src/core/index.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const approvalGrantId = normalizeText(args.approvalGrantId);
  const runtimeUrl = normalizeText(args.runtimeUrl || process.env.VTDD_RUNTIME_URL);
  const repositoryInput = normalizeText(args.repository || process.env.GITHUB_REPOSITORY);
  const bearerToken = normalizeText(
    args.gatewayBearerToken || process.env.VTDD_GATEWAY_BEARER_TOKEN
  );

  if (!approvalGrantId) {
    throw new Error("--approval-grant-id is required");
  }
  if (!runtimeUrl) {
    throw new Error("--runtime-url or VTDD_RUNTIME_URL is required");
  }
  if (!repositoryInput) {
    throw new Error("--repository or GITHUB_REPOSITORY is required");
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

  const validation = validateDeployApprovalGrant({
    approvalGrant: body.approvalGrant,
    repositoryInput
  });
  if (!validation.ok) {
    throw new Error(validation.issues.join(", "));
  }

  console.log("deploy approval grant validated");
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === "--approval-grant-id") {
      parsed.approvalGrantId = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--runtime-url") {
      parsed.runtimeUrl = args[index + 1];
      index += 1;
      continue;
    }
    if (current === "--repository") {
      parsed.repository = args[index + 1];
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

function normalizeText(value) {
  return String(value ?? "").trim();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
