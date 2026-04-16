import { TaskMode } from "./types.js";

export const ISSUE_TRACEABILITY_FIELDS = Object.freeze([
  "intentRefs",
  "successCriteriaRefs",
  "nonGoalRefs",
  "outOfScopeChanges",
  "outOfScopeProposedOnly"
]);

export function evaluateIssueTraceability(input) {
  const {
    mode = TaskMode.EXECUTION,
    issueTraceable = null,
    traceability = null
  } = input ?? {};

  if (mode !== TaskMode.EXECUTION) {
    return { ok: true };
  }

  if (typeof issueTraceable === "boolean" && traceability === null) {
    return issueTraceable
      ? { ok: true }
      : {
          ok: false,
          rule: "require_traceability_to_issue_sections",
          reason: "execution requires traceability to issue intent/success/non-goal"
        };
  }

  const normalized = normalizeTraceability(traceability);
  if (
    normalized.intentRefs.length === 0 &&
    normalized.successCriteriaRefs.length === 0 &&
    normalized.nonGoalRefs.length === 0
  ) {
    return {
      ok: false,
      rule: "require_traceability_to_issue_sections",
      reason: "at least one issue section reference is required"
    };
  }

  if (normalized.outOfScopeChanges.length > 0 && !normalized.outOfScopeProposedOnly) {
    return {
      ok: false,
      rule: "no_out_of_scope_implementation",
      reason: "out-of-scope changes must be proposal-only, not implementation"
    };
  }

  return {
    ok: true,
    traceability: normalized
  };
}

function normalizeTraceability(value) {
  return {
    intentRefs: normalizeStringArray(value?.intentRefs),
    successCriteriaRefs: normalizeStringArray(value?.successCriteriaRefs),
    nonGoalRefs: normalizeStringArray(value?.nonGoalRefs),
    outOfScopeChanges: normalizeStringArray(value?.outOfScopeChanges),
    outOfScopeProposedOnly: Boolean(value?.outOfScopeProposedOnly)
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}
