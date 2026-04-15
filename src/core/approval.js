import { ActionType, ApprovalLevel } from "./types.js";

const GO_REQUIRED_ACTIONS = new Set([
  ActionType.ISSUE_CREATE,
  ActionType.BUILD,
  ActionType.PR_OPERATION
]);

const GO_PASSKEY_REQUIRED_ACTIONS = new Set([
  ActionType.MERGE,
  ActionType.DEPLOY_PRODUCTION,
  ActionType.DESTRUCTIVE,
  ActionType.EXTERNAL_PUBLISH
]);

export function requiredApprovalLevel(actionType) {
  if (GO_PASSKEY_REQUIRED_ACTIONS.has(actionType)) {
    return ApprovalLevel.GO_PASSKEY;
  }
  if (GO_REQUIRED_ACTIONS.has(actionType)) {
    return ApprovalLevel.GO;
  }
  return ApprovalLevel.NONE;
}

export function evaluateApproval({ actionType, go, passkey }) {
  const required = requiredApprovalLevel(actionType);
  if (required === ApprovalLevel.NONE) {
    return { ok: true, required };
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
  if (go && passkey) {
    return { ok: true, required };
  }
  return {
    ok: false,
    required,
    reason: "high-risk action requires GO + passkey"
  };
}
