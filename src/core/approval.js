import { evaluateApprovalGrant } from "./passkey-approval.js";
import { ActionType, ApprovalLevel, ConsentCategory } from "./types.js";

const GO_REQUIRED_ACTIONS = new Set([
  ActionType.ISSUE_CREATE,
  ActionType.BUILD,
  ActionType.PR_REVIEW_SUBMIT,
  ActionType.PR_OPERATION
]);

const GO_PASSKEY_REQUIRED_ACTIONS = new Set([
  ActionType.MERGE,
  ActionType.DEPLOY_PRODUCTION,
  ActionType.DESTRUCTIVE,
  ActionType.EXTERNAL_PUBLISH
]);

const CONSENT_REQUIREMENTS = Object.freeze({
  [ActionType.READ]: ConsentCategory.READ,
  [ActionType.SUMMARIZE]: ConsentCategory.READ,
  [ActionType.ISSUE_CREATE]: ConsentCategory.PROPOSE,
  [ActionType.BUILD]: ConsentCategory.EXECUTE,
  [ActionType.PR_COMMENT]: ConsentCategory.EXECUTE,
  [ActionType.PR_REVIEW_SUBMIT]: ConsentCategory.EXECUTE,
  [ActionType.PR_OPERATION]: ConsentCategory.EXECUTE,
  [ActionType.MERGE]: ConsentCategory.EXECUTE,
  [ActionType.DEPLOY_PRODUCTION]: ConsentCategory.EXECUTE,
  [ActionType.DESTRUCTIVE]: ConsentCategory.DESTRUCTIVE,
  [ActionType.EXTERNAL_PUBLISH]: ConsentCategory.EXTERNAL_PUBLISH
});

export const APPROVAL_REQUIREMENTS = Object.freeze({
  [ActionType.READ]: ApprovalLevel.NONE,
  [ActionType.SUMMARIZE]: ApprovalLevel.NONE,
  [ActionType.ISSUE_CREATE]: ApprovalLevel.GO,
  [ActionType.BUILD]: ApprovalLevel.GO,
  [ActionType.PR_COMMENT]: ApprovalLevel.NONE,
  [ActionType.PR_REVIEW_SUBMIT]: ApprovalLevel.GO,
  [ActionType.PR_OPERATION]: ApprovalLevel.GO,
  [ActionType.MERGE]: ApprovalLevel.GO_PASSKEY,
  [ActionType.DEPLOY_PRODUCTION]: ApprovalLevel.GO_PASSKEY,
  [ActionType.DESTRUCTIVE]: ApprovalLevel.GO_PASSKEY,
  [ActionType.EXTERNAL_PUBLISH]: ApprovalLevel.GO_PASSKEY
});

export const CONSENT_REQUIREMENT_MAP = CONSENT_REQUIREMENTS;

export function requiredApprovalLevel(actionType) {
  if (APPROVAL_REQUIREMENTS[actionType]) {
    return APPROVAL_REQUIREMENTS[actionType];
  }
  if (GO_PASSKEY_REQUIRED_ACTIONS.has(actionType)) {
    return ApprovalLevel.GO_PASSKEY;
  }
  if (GO_REQUIRED_ACTIONS.has(actionType)) {
    return ApprovalLevel.GO;
  }
  return ApprovalLevel.NONE;
}

export function requiredConsentCategory(actionType) {
  return CONSENT_REQUIREMENTS[actionType] ?? ConsentCategory.READ;
}

export function evaluateConsent({ actionType, consent }) {
  const required = requiredConsentCategory(actionType);
  const granted = new Set((consent?.grantedCategories ?? []).map(normalize));
  if (granted.has(normalize(required))) {
    return { ok: true, required };
  }
  return {
    ok: false,
    required,
    reason: `consent category '${required}' is required`
  };
}

export function evaluateApproval({
  actionType,
  go,
  passkey,
  approvalGrant,
  approvalScope,
  approvalPhrase,
  approvalScopeMatched = false
}) {
  const required = requiredApprovalLevel(actionType);
  if (required === ApprovalLevel.NONE) {
    return { ok: true, required };
  }
  if (!approvalScopeMatched) {
    return {
      ok: false,
      required,
      reason: "approval must be bound to the target scope"
    };
  }

  const phrase = normalize(approvalPhrase);
  if (!phrase) {
    return {
      ok: false,
      required,
      reason: "approval phrase is required"
    };
  }

  if (required === ApprovalLevel.GO) {
    return go
      ? { ok: true, required }
      : {
          ok: false,
          required,
          reason: "explicit GO is required before execution"
        };
  }
  const grantResult = evaluateApprovalGrant({
    approvalGrant,
    scope: approvalScope
  });
  if (go && (passkey || grantResult.ok)) {
    return { ok: true, required };
  }
  return {
    ok: false,
    required,
    reason: passkey
      ? "high-risk action requires GO + passkey"
      : grantResult.reason || "high-risk action requires GO + passkey"
  };
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
