import { validateDeployApprovalGrant } from "./deploy-approval-grant.js";

export const CLOUDFLARE_DEPLOY_ACTIONS_SECRETS = Object.freeze([
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID"
]);

export function buildCloudflareDeploySecretSyncPlan(input = {}) {
  const repo = normalizeText(input.repo);
  const source = input.source ?? {};
  const apiToken = normalizeText(source.cloudflareApiToken);
  const accountId = normalizeText(source.cloudflareAccountId);
  const issues = [];

  if (!repo) {
    issues.push("repo is required");
  }
  if (!apiToken) {
    issues.push("source.cloudflareApiToken is required");
  }
  if (!accountId) {
    issues.push("source.cloudflareAccountId is required");
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    plan: {
      repo,
      secrets: [
        {
          name: "CLOUDFLARE_API_TOKEN",
          value: apiToken
        },
        {
          name: "CLOUDFLARE_ACCOUNT_ID",
          value: accountId
        }
      ]
    }
  };
}

export async function executeCloudflareDeploySecretSync(input = {}) {
  const planResult = buildCloudflareDeploySecretSyncPlan(input);
  if (!planResult.ok) {
    return planResult;
  }

  const approvalValidation = validateDeployApprovalGrant({
    approvalGrant: input.approvalGrant,
    repositoryInput: input.repo,
    now: input.now
  });
  if (!approvalValidation.ok) {
    return approvalValidation;
  }

  const runner = input.runner;
  if (typeof runner !== "function") {
    return { ok: false, issues: ["runner is required"] };
  }

  const synced = [];
  for (const secret of planResult.plan.secrets) {
    synced.push(await runner(secret));
  }

  return {
    ok: true,
    result: {
      repo: planResult.plan.repo,
      synced
    }
  };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
