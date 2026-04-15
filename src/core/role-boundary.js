import { ActionType, ActorRole } from "./types.js";

const BUTLER_ALLOWED_ACTIONS = new Set([
  ActionType.READ,
  ActionType.SUMMARIZE,
  ActionType.ISSUE_CREATE
]);

const EXECUTOR_ALLOWED_ACTIONS = new Set([
  ActionType.READ,
  ActionType.SUMMARIZE,
  ActionType.ISSUE_CREATE,
  ActionType.BUILD,
  ActionType.PR_COMMENT,
  ActionType.PR_REVIEW_SUBMIT,
  ActionType.PR_OPERATION,
  ActionType.MERGE,
  ActionType.DEPLOY_PRODUCTION,
  ActionType.DESTRUCTIVE,
  ActionType.EXTERNAL_PUBLISH
]);

const REVIEWER_ALLOWED_ACTIONS = new Set([ActionType.READ, ActionType.SUMMARIZE]);

export function evaluateRoleBoundary({ actorRole = ActorRole.EXECUTOR, actionType }) {
  const role = String(actorRole ?? "").trim().toLowerCase();
  const table = roleToActions(role);

  if (!table) {
    return {
      ok: false,
      rule: "unknown_actor_role",
      reason: `unknown actor role: ${actorRole}`
    };
  }

  if (!table.has(actionType)) {
    return {
      ok: false,
      rule: "role_action_boundary",
      reason: `${role} is not allowed to execute action: ${actionType}`
    };
  }

  return { ok: true };
}

function roleToActions(role) {
  if (role === ActorRole.BUTLER) {
    return BUTLER_ALLOWED_ACTIONS;
  }
  if (role === ActorRole.EXECUTOR) {
    return EXECUTOR_ALLOWED_ACTIONS;
  }
  if (role === ActorRole.REVIEWER) {
    return REVIEWER_ALLOWED_ACTIONS;
  }
  return null;
}
