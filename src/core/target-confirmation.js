import { ActionType, TaskMode } from "./types.js";

const ACTIONS_REQUIRING_TARGET_CONFIRMATION = new Set([
  ActionType.BUILD,
  ActionType.PR_COMMENT,
  ActionType.PR_REVIEW_SUBMIT,
  ActionType.PR_OPERATION,
  ActionType.MERGE,
  ActionType.DEPLOY_PRODUCTION,
  ActionType.DESTRUCTIVE,
  ActionType.EXTERNAL_PUBLISH
]);

export function evaluateTargetConfirmationBoundary(input = {}) {
  const mode = normalizeText(input.mode).toLowerCase();
  const actionType = normalizeText(input.actionType).toLowerCase();
  const repository = normalizeText(input.repository);
  const via = normalizeText(input.via).toLowerCase();

  if (mode !== TaskMode.EXECUTION) {
    return { ok: true };
  }

  if (!ACTIONS_REQUIRING_TARGET_CONFIRMATION.has(actionType)) {
    return { ok: true };
  }

  if (via !== "alias") {
    return { ok: true };
  }

  if (input.targetConfirmed === true) {
    return { ok: true };
  }

  return {
    ok: false,
    rule: "target_confirmation_required",
    reason: `resolved target '${repository}' must be explicitly confirmed before executing '${actionType}'`,
    repository,
    via: "alias"
  };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
