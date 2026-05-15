#!/usr/bin/env node
import { loadGatewayBearerTokenFromVault } from "../src/core/desktop-bootstrap-vault.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await validateGatewayBearerVaultApprovalGrant({
    approvalGrantId: args.approvalGrantId,
    runtimeUrl: args.runtimeUrl || process.env.VTDD_RUNTIME_URL,
    repositoryInput: args.repository || process.env.GITHUB_REPOSITORY,
    gatewayBearerToken: args.gatewayBearerToken || process.env.VTDD_GATEWAY_BEARER_TOKEN,
    manifestPath: args.manifestPath
  });

  if (!result.ok) {
    throw new Error(result.issues.join(", "));
  }
  process.stdout.write("gateway bearer vault approval grant validated\n");
}

export async function validateGatewayBearerVaultApprovalGrant(input = {}) {
  const approvalGrantId = normalizeText(input.approvalGrantId);
  const runtimeUrl = normalizeText(input.runtimeUrl);
  const repositoryInput = normalizeText(input.repositoryInput);
  const bearerToken = await resolveGatewayBearerToken(input);
  const issues = [];

  if (!approvalGrantId) {
    issues.push("--approval-grant-id is required");
  }
  if (!runtimeUrl) {
    issues.push("--runtime-url or VTDD_RUNTIME_URL is required");
  }
  if (!repositoryInput) {
    issues.push("--repository or GITHUB_REPOSITORY is required");
  }
  if (!bearerToken) {
    issues.push("--gateway-bearer-token, VTDD_GATEWAY_BEARER_TOKEN, or gateway vault token is required");
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const endpoint = new URL("/v2/retrieve/approval-grant", runtimeUrl);
  endpoint.searchParams.set("approvalId", approvalGrantId);
  const response = await (input.fetch || fetch)(endpoint, {
    headers: {
      authorization: `Bearer ${bearerToken}`
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      issues: [normalizeText(body.reason || body.error) || `approval grant retrieval failed with status ${response.status}`]
    };
  }

  const approvalGrant = body?.approvalGrant;
  const validation = validateGatewayBearerVaultApprovalGrantObject({
    approvalGrant,
    repositoryInput
  });
  if (!validation.ok) {
    return validation;
  }

  return {
    ok: true,
    approvalGrant: {
      approvalId: normalizeText(approvalGrant.approvalId),
      expiresAt: normalizeText(approvalGrant.expiresAt),
      scope: approvalGrant.scope
    }
  };
}

export function validateGatewayBearerVaultApprovalGrantObject({ approvalGrant, repositoryInput } = {}) {
  const issues = [];
  if (!approvalGrant || approvalGrant.verified !== true) {
    issues.push("real approvalGrant is required for gateway bearer vault bootstrap");
  }
  const expiresAt = normalizeText(approvalGrant?.expiresAt);
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) {
    issues.push("approvalGrant is expired or invalid");
  }
  const scope = approvalGrant?.scope ?? {};
  if (normalizeText(scope.repositoryInput) !== normalizeText(repositoryInput)) {
    issues.push("approvalGrant scope.repositoryInput must match target repo");
  }
  if (normalizeText(scope.actionType) !== "destructive") {
    issues.push("approvalGrant scope.actionType must be destructive");
  }
  if (normalizeText(scope.highRiskKind) !== "gateway_bearer_vault_bootstrap") {
    issues.push("approvalGrant scope.highRiskKind must be gateway_bearer_vault_bootstrap");
  }
  return {
    ok: issues.length === 0,
    issues
  };
}

async function resolveGatewayBearerToken(input = {}) {
  const direct = normalizeText(input.gatewayBearerToken);
  if (direct) {
    return direct;
  }
  const vault = await loadGatewayBearerTokenFromVault({ manifestPath: input.manifestPath });
  if (!vault.ok) {
    return "";
  }
  return normalizeText(vault.gateway?.bearerToken);
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
      continue;
    }
    if (current === "--manifest-path") {
      parsed.manifestPath = args[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
