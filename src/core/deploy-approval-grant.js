import { ActionType } from "./types.js";

export function validateDeployApprovalGrant(input = {}) {
  const approvalGrant = input.approvalGrant ?? null;
  const repositoryInput = normalizeText(input.repositoryInput);
  const now = new Date(input.now ?? Date.now());

  if (!approvalGrant || approvalGrant.verified !== true) {
    return {
      ok: false,
      issues: ["real approvalGrant is required for deploy_production"]
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
  if (normalizeText(scope.actionType) !== ActionType.DEPLOY_PRODUCTION) {
    return {
      ok: false,
      issues: ["approvalGrant scope.actionType must be deploy_production"]
    };
  }

  if (normalizeText(scope.highRiskKind) !== ActionType.DEPLOY_PRODUCTION) {
    return {
      ok: false,
      issues: ["approvalGrant scope.highRiskKind must be deploy_production"]
    };
  }

  if (normalizeText(scope.repositoryInput) !== repositoryInput) {
    return {
      ok: false,
      issues: ["approvalGrant scope.repositoryInput must match target repo"]
    };
  }

  return { ok: true };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
