import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExecutionDuration,
  buildExecutionLeadTime,
  formatExecutionDurationSeconds
} from "../src/core/execution-lead-time.js";

test("execution lead time computes concise lifecycle durations", () => {
  const leadTime = buildExecutionLeadTime({
    queuedAt: "2026-05-09T10:00:00.000Z",
    pickedUpAt: "2026-05-09T10:00:12.000Z",
    codexStartedAt: "2026-05-09T10:00:20.000Z",
    branchPushedAt: "2026-05-09T10:04:02.000Z",
    prCreatedAt: "2026-05-09T10:04:10.000Z"
  });

  assert.equal(leadTime.queued_at, "2026-05-09T10:00:00.000Z");
  assert.equal(leadTime.durations.queue_wait_duration.label, "12s");
  assert.equal(leadTime.durations.codex_execution_duration.label, "3m 42s");
  assert.equal(leadTime.durations.pr_creation_duration.label, "8s");
  assert.equal(leadTime.durations.total_lead_time.label, "4m 10s");
  assert.equal(leadTime.completed_at, null);
});

test("execution duration rejects missing or reversed timestamps", () => {
  assert.equal(buildExecutionDuration(null, "2026-05-09T10:00:00.000Z"), null);
  assert.equal(
    buildExecutionDuration("2026-05-09T10:00:10.000Z", "2026-05-09T10:00:00.000Z"),
    null
  );
});

test("execution duration formatter keeps GitHub comments compact", () => {
  assert.equal(formatExecutionDurationSeconds(59), "59s");
  assert.equal(formatExecutionDurationSeconds(60), "1m");
  assert.equal(formatExecutionDurationSeconds(222), "3m 42s");
  assert.equal(formatExecutionDurationSeconds(3660), "1h 1m");
});
