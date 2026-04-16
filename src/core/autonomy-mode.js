import { ActionType, AutonomyMode, TaskMode } from "./types.js";

const GUARDED_ABSENCE_ALLOWED_ACTIONS = new Set([
  ActionType.READ,
  ActionType.SUMMARIZE,
  ActionType.ISSUE_CREATE,
  ActionType.BUILD,
  ActionType.PR_COMMENT,
  ActionType.PR_OPERATION
]);

export function evaluateAutonomyModeBoundary(input = {}) {
  const autonomyMode = normalizeAutonomyMode(input.autonomyMode);
  const mode = normalizeTaskMode(input.mode);
  if (mode !== TaskMode.EXECUTION || autonomyMode !== AutonomyMode.GUARDED_ABSENCE) {
    return { ok: true, autonomyMode };
  }

  if (!GUARDED_ABSENCE_ALLOWED_ACTIONS.has(input.actionType)) {
    return deny(
      "guarded_absence_forbids_action",
      `action '${input.actionType}' is not allowed in guarded absence mode`,
      {
        autonomyMode,
        allowedActions: [...GUARDED_ABSENCE_ALLOWED_ACTIONS]
      }
    );
  }

  const ambiguity = normalizeObject(input.ambiguity);
  if (ambiguity.ambiguousRequest === true) {
    return deny(
      "guarded_absence_blocks_ambiguous_request",
      "ambiguous request must stop in guarded absence mode",
      { autonomyMode }
    );
  }
  if (ambiguity.specConflict === true) {
    return deny(
      "guarded_absence_blocks_spec_conflict",
      "spec conflict must stop in guarded absence mode",
      { autonomyMode }
    );
  }

  if (input.targetConfirmed === false || ambiguity.targetUnconfirmed === true) {
    return deny(
      "guarded_absence_requires_confirmed_target",
      "target must be explicitly confirmed in guarded absence mode",
      { autonomyMode }
    );
  }

  const issuePrCount = resolveIssuePrCount(input.runtimeTruth, ambiguity);
  if (issuePrCount !== null && issuePrCount > 1) {
    return deny(
      "guarded_absence_requires_one_issue_one_pr",
      "guarded absence mode requires one active issue per open PR",
      { autonomyMode, issuePrCount }
    );
  }

  return {
    ok: true,
    autonomyMode,
    allowedActions: [...GUARDED_ABSENCE_ALLOWED_ACTIONS]
  };
}

export function normalizeAutonomyMode(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === AutonomyMode.GUARDED_ABSENCE) {
    return AutonomyMode.GUARDED_ABSENCE;
  }
  return AutonomyMode.NORMAL;
}

function normalizeTaskMode(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === TaskMode.READ_ONLY) {
    return TaskMode.READ_ONLY;
  }
  return TaskMode.EXECUTION;
}

function resolveIssuePrCount(runtimeTruth, ambiguity) {
  const runtime = normalizeObject(runtimeTruth);
  const runtimeState = normalizeObject(runtime.runtimeState);
  const candidates = [
    ambiguity.issuePrCount,
    ambiguity.openPrCountForIssue,
    runtime.issuePrCount,
    runtime.openPrCountForIssue,
    runtimeState.issuePrCount,
    runtimeState.openPrCountForIssue
  ];
  for (const candidate of candidates) {
    const value = normalizePositiveInteger(candidate);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function normalizePositiveInteger(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function deny(rule, reason, detail = {}) {
  return {
    ok: false,
    rule,
    reason,
    ...detail
  };
}
