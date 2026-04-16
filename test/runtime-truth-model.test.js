import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RUNTIME_TRUTH_FIELDS,
  TaskMode,
  evaluateRuntimeTruthPrecondition
} from "../src/core/index.js";

test("runtime truth docs list canonical schema fields", () => {
  const doc = readFileSync(
    new URL("../docs/runtime-truth-model.md", import.meta.url),
    "utf8"
  );

  for (const field of RUNTIME_TRUTH_FIELDS) {
    assert.equal(doc.includes(`\`${field}\``), true);
  }
});

test("runtime truth model blocks execution when unavailable without safe fallback", () => {
  const result = evaluateRuntimeTruthPrecondition({
    mode: TaskMode.EXECUTION,
    runtimeAvailable: false,
    safeFallbackChosen: false
  });

  assert.equal(result.ok, false);
  assert.equal(result.rule, "runtime_truth_required_or_safe_fallback");
});

test("runtime truth model marks stale runtime as reconcile-required", () => {
  const result = evaluateRuntimeTruthPrecondition({
    mode: TaskMode.EXECUTION,
    runtimeAvailable: true,
    observedAt: "2026-04-16T00:00:00Z",
    maxAgeMs: 60_000,
    nowMs: Date.parse("2026-04-16T00:02:00Z")
  });

  assert.equal(result.ok, false);
  assert.equal(result.rule, "runtime_truth_stale_requires_reconfirm");
  assert.equal(result.reconcileRequired, true);
});

test("runtime truth model marks runtime-memory conflict as reconcile-required", () => {
  const result = evaluateRuntimeTruthPrecondition({
    mode: TaskMode.EXECUTION,
    runtimeAvailable: true,
    runtimeState: { status: "open", count: 1 },
    memoryState: { status: "open", count: 2 }
  });

  assert.equal(result.ok, false);
  assert.equal(result.rule, "reconcile_when_runtime_conflicts_with_memory");
  assert.equal(result.reconcileRequired, true);
});
