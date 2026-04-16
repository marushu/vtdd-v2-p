import { TaskMode } from "./types.js";

export const RUNTIME_TRUTH_FIELDS = Object.freeze([
  "runtimeAvailable",
  "safeFallbackChosen",
  "observedAt",
  "maxAgeMs",
  "runtimeState",
  "memoryState"
]);

export function evaluateRuntimeTruthPrecondition(input) {
  const {
    mode = TaskMode.EXECUTION,
    runtimeAvailable = false,
    safeFallbackChosen = false,
    observedAt = null,
    maxAgeMs = null,
    nowMs = Date.now(),
    runtimeState = null,
    memoryState = null
  } = input ?? {};

  if (mode === TaskMode.READ_ONLY) {
    return { ok: true };
  }

  if (!runtimeAvailable && !safeFallbackChosen) {
    return {
      ok: false,
      rule: "runtime_truth_required_or_safe_fallback",
      reason: "runtime truth is unavailable and no safe fallback is selected"
    };
  }

  if (runtimeAvailable && isStale({ observedAt, maxAgeMs, nowMs })) {
    return {
      ok: false,
      rule: "runtime_truth_stale_requires_reconfirm",
      reason: "runtime truth is stale and must be re-fetched before execution",
      reconcileRequired: true
    };
  }

  if (runtimeAvailable && runtimeState && memoryState && hasConflict(runtimeState, memoryState)) {
    return {
      ok: false,
      rule: "reconcile_when_runtime_conflicts_with_memory",
      reason: "runtime truth conflicts with memory state",
      reconcileRequired: true
    };
  }

  return { ok: true };
}

function isStale({ observedAt, maxAgeMs, nowMs }) {
  if (observedAt === null || observedAt === undefined) {
    return false;
  }
  if (typeof maxAgeMs !== "number" || maxAgeMs <= 0) {
    return false;
  }

  const observedMs =
    typeof observedAt === "number"
      ? observedAt
      : Date.parse(String(observedAt));
  if (!Number.isFinite(observedMs)) {
    return false;
  }

  return nowMs - observedMs > maxAgeMs;
}

function hasConflict(runtimeState, memoryState) {
  return stableSerialize(runtimeState) !== stableSerialize(memoryState);
}

function stableSerialize(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const keys = Object.keys(value).sort();
  const sorted = {};
  for (const key of keys) {
    sorted[key] = sortValue(value[key]);
  }
  return sorted;
}
