import { ActionType, CredentialTier } from "./types.js";

const TIER_ORDER = Object.freeze({
  [CredentialTier.READ]: 1,
  [CredentialTier.EXECUTE]: 2,
  [CredentialTier.HIGH_RISK]: 3
});

export function requiredCredentialTier(actionType) {
  if (
    actionType === ActionType.MERGE ||
    actionType === ActionType.DEPLOY_PRODUCTION ||
    actionType === ActionType.DESTRUCTIVE ||
    actionType === ActionType.EXTERNAL_PUBLISH
  ) {
    return CredentialTier.HIGH_RISK;
  }

  if (
    actionType === ActionType.ISSUE_CREATE ||
    actionType === ActionType.BUILD ||
    actionType === ActionType.PR_OPERATION
  ) {
    return CredentialTier.EXECUTE;
  }

  return CredentialTier.READ;
}

export function evaluateCredentialBoundary({ actionType, credential }) {
  const requiredTier = requiredCredentialTier(actionType);
  const model = normalize(credential?.model);
  if (model !== "github_app") {
    return {
      ok: false,
      rule: "github_app_credential_required",
      reason: "credential model must be github_app",
      requiredTier
    };
  }

  const givenTier = normalize(credential?.tier);
  if (!isTierSufficient(givenTier, requiredTier)) {
    return {
      ok: false,
      rule: "insufficient_credential_tier",
      reason: `credential tier ${givenTier || "unknown"} is insufficient for ${requiredTier}`,
      requiredTier
    };
  }

  if (credential?.destructiveAlwaysOn === true) {
    return {
      ok: false,
      rule: "no_permanent_destructive_credentials",
      reason: "destructive permission must not be always-on",
      requiredTier
    };
  }

  if (requiredTier === CredentialTier.HIGH_RISK) {
    if (credential?.shortLived !== true) {
      return {
        ok: false,
        rule: "short_lived_credential_required_for_high_risk",
        reason: "high-risk action requires short-lived credential",
        requiredTier
      };
    }

    if (!credential?.boundApprovalId) {
      return {
        ok: false,
        rule: "approval_bound_credential_required",
        reason: "high-risk credential must be bound to explicit approval",
        requiredTier
      };
    }
  }

  return { ok: true, requiredTier };
}

function isTierSufficient(givenTier, requiredTier) {
  return (TIER_ORDER[givenTier] ?? 0) >= (TIER_ORDER[requiredTier] ?? 99);
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
