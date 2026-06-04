import test from "node:test";
import assert from "node:assert/strict";

import { buildCapturePayload } from "../scripts/capture-codex-analytics-usage.mjs";
import {
  COST_CHECKER_MODE_DISABLED,
  COST_CHECKER_MODE_ENABLED,
  COST_CHECKER_MODE_MANUAL,
  buildCodexAnalyticsUsageDelta,
  buildCostCheckerRuntimeTruth,
  normalizeCostCheckerConfig,
  parseCodexAnalyticsUsageText,
  sanitizeCodexAnalyticsUsageSnapshot
} from "../src/core/index.js";

const NOW = "2026-06-04T07:30:00.000Z";

test("codex analytics cost checker defaults to disabled and does not capture", () => {
  const config = normalizeCostCheckerConfig({}, { now: NOW });

  assert.equal(config.mode, COST_CHECKER_MODE_DISABLED);
  assert.equal(config.enabled, false);
  assert.equal(config.valid, true);
  assert.equal(config.captureAllowed, false);
  assert.equal(config.scheduledCaptureAllowed, false);
  assert.equal(config.reason, "disabled_by_default");

  const truth = buildCostCheckerRuntimeTruth({}, { now: NOW });
  assert.deepEqual(truth.costChecker, {
    enabled: false,
    mode: "disabled",
    valid: true,
    reason: "disabled_by_default",
    blockedReason: null,
    observerAvailable: false,
    captureAllowed: false,
    scheduledCaptureAllowed: false,
    lastCapturedAt: null,
    lastSnapshotAvailable: false,
    lastDeltaAvailable: false,
    billingTruth: false,
    source: "chatgpt_codex_analytics_page"
  });
});

test("codex analytics manual mode allows only single-shot capture", () => {
  const config = normalizeCostCheckerConfig(
    {
      mode: COST_CHECKER_MODE_MANUAL,
      ttlSeconds: 300
    },
    { now: NOW }
  );

  assert.equal(config.mode, COST_CHECKER_MODE_MANUAL);
  assert.equal(config.enabled, true);
  assert.equal(config.captureAllowed, true);
  assert.equal(config.scheduledCaptureAllowed, false);
  assert.equal(config.singleShot, true);
  assert.equal(config.reason, "manual_single_shot_only");
  assert.equal(config.expiresAt, "2026-06-04T07:35:00.000Z");
});

test("codex analytics enabled mode requires bounded TTL or session scope", () => {
  const unbounded = normalizeCostCheckerConfig({ mode: COST_CHECKER_MODE_ENABLED }, { now: NOW });
  assert.equal(unbounded.enabled, false);
  assert.equal(unbounded.valid, false);
  assert.equal(unbounded.captureAllowed, false);
  assert.equal(unbounded.reason, "enabled_requires_bounded_scope");
  assert.deepEqual(unbounded.issues, ["enabled mode requires ttl/expiresAt or session scope"]);

  const expired = normalizeCostCheckerConfig(
    {
      mode: COST_CHECKER_MODE_ENABLED,
      expiresAt: "2026-06-04T07:29:59.000Z"
    },
    { now: NOW }
  );
  assert.equal(expired.enabled, false);
  assert.deepEqual(expired.issues, ["enabled mode expiry is already elapsed"]);

  const bounded = normalizeCostCheckerConfig(
    {
      mode: COST_CHECKER_MODE_ENABLED,
      ttlMs: 120000
    },
    { now: NOW }
  );
  assert.equal(bounded.enabled, true);
  assert.equal(bounded.scheduledCaptureAllowed, true);
  assert.equal(bounded.singleShot, false);
  assert.equal(bounded.reason, "enabled_with_bounded_scope");
  assert.equal(bounded.expiresAt, "2026-06-04T07:32:00.000Z");

  const sessionScoped = normalizeCostCheckerConfig(
    {
      mode: COST_CHECKER_MODE_ENABLED,
      sessionId: "codex-usage-check-1"
    },
    { now: NOW }
  );
  assert.equal(sessionScoped.enabled, true);
  assert.equal(sessionScoped.sessionId, "codex-usage-check-1");
});

test("codex analytics snapshot sanitizer keeps only redacted structured limits", () => {
  const snapshot = sanitizeCodexAnalyticsUsageSnapshot({
    captureMode: COST_CHECKER_MODE_MANUAL,
    capturedAt: NOW,
    source: "chatgpt_codex_analytics_page cookie=private",
    captureMethod: "dom token=secret",
    rawHtml: "<html>should not persist</html>",
    cookie: "session=private",
    limits: [
      {
        label: "<b>5時間の使用制限</b> sk-secret",
        remainingPercent: "93% 残り",
        resetAtText: "リセット: 15:16 authorization: bearer-secret"
      },
      {
        label: "bad without percent"
      },
      {
        label: "週間利用上限",
        remainingPercent: 101.234
      }
    ]
  });

  assert.equal(snapshot.kind, "codex_analytics_usage_snapshot");
  assert.equal(snapshot.enabled, true);
  assert.equal(snapshot.redacted, true);
  assert.equal(snapshot.rawHtml, undefined);
  assert.equal(snapshot.cookie, undefined);
  assert.equal(snapshot.limits.length, 2);
  assert.deepEqual(snapshot.limits[0], {
    label: "5時間の使用制限 [REDACTED]",
    remainingPercent: 93,
    resetAtText: "リセット: 15:16 authorization=[REDACTED]"
  });
  assert.deepEqual(snapshot.limits[1], {
    label: "週間利用上限",
    remainingPercent: 100
  });
});

test("codex analytics text parser extracts visible usage percentages without raw page storage", () => {
  const snapshot = parseCodexAnalyticsUsageText(
    [
      "Codex アナリティクス",
      "5時間の使用制限",
      "93% 残り",
      "リセット: 15:16",
      "週間利用上限",
      "99% 残り",
      "リセット: 2026/06/11 10:16",
      "cookie=session-secret"
    ].join("\n"),
    { now: NOW }
  );

  assert.equal(snapshot.captureMethod, "authenticated_browser_text_or_ocr");
  assert.equal(snapshot.limits.length, 2);
  assert.deepEqual(snapshot.limits[0], {
    label: "5時間の使用制限",
    remainingPercent: 93,
    resetAtText: "リセット: 15:16"
  });
  assert.deepEqual(snapshot.limits[1], {
    label: "週間利用上限",
    remainingPercent: 99,
    resetAtText: "リセット: 2026/06/11 10:16"
  });
  assert.equal(JSON.stringify(snapshot).includes("session-secret"), false);
});

test("codex analytics usage delta is display-percent evidence, not billing truth", () => {
  const before = sanitizeCodexAnalyticsUsageSnapshot({
    captureMode: COST_CHECKER_MODE_MANUAL,
    capturedAt: "2026-06-04T07:30:00.000Z",
    limits: [
      { label: "5時間の使用制限", remainingPercent: 93, resetAtText: "15:16" },
      { label: "週間利用上限", remainingPercent: 99 }
    ]
  });
  const after = sanitizeCodexAnalyticsUsageSnapshot({
    captureMode: COST_CHECKER_MODE_MANUAL,
    capturedAt: "2026-06-04T07:45:00.000Z",
    limits: [
      { label: "5時間の使用制限", remainingPercent: 90.4, resetAtText: "15:16" },
      { label: "GPT-5.3-Codex-Spark 5時間の使用制限", remainingPercent: 100 }
    ]
  });

  const delta = buildCodexAnalyticsUsageDelta(before, after);

  assert.equal(delta.kind, "codex_analytics_usage_delta");
  assert.equal(delta.precision, "display_percent_delta_not_billing_truth");
  assert.equal(delta.billingTruth, false);
  assert.deepEqual(delta.limits, [
    {
      label: "5時間の使用制限",
      status: "compared",
      beforeRemainingPercent: 93,
      afterRemainingPercent: 90.4,
      consumedDisplayPercent: 2.6,
      resetChanged: false
    },
    {
      label: "週間利用上限",
      status: "missing_after",
      beforeRemainingPercent: 99,
      afterRemainingPercent: null,
      consumedDisplayPercent: null
    },
    {
      label: "GPT-5.3-Codex-Spark 5時間の使用制限",
      status: "missing_before",
      beforeRemainingPercent: null,
      afterRemainingPercent: 100,
      consumedDisplayPercent: null
    }
  ]);
});

test("codex analytics runtime truth reports snapshot and delta availability without launching observer", () => {
  const snapshot = sanitizeCodexAnalyticsUsageSnapshot({
    captureMode: COST_CHECKER_MODE_MANUAL,
    capturedAt: NOW,
    limits: [{ label: "5時間の使用制限", remainingPercent: 93 }]
  });
  const delta = buildCodexAnalyticsUsageDelta(snapshot, {
    captureMode: COST_CHECKER_MODE_MANUAL,
    capturedAt: "2026-06-04T07:40:00.000Z",
    limits: [{ label: "5時間の使用制限", remainingPercent: 92 }]
  });

  const truth = buildCostCheckerRuntimeTruth(
    {
      mode: COST_CHECKER_MODE_ENABLED,
      ttlSeconds: 600
    },
    {
      now: NOW,
      observerAvailable: true,
      lastSnapshot: snapshot,
      lastDelta: delta
    }
  );

  assert.equal(truth.costChecker.enabled, true);
  assert.equal(truth.costChecker.mode, COST_CHECKER_MODE_ENABLED);
  assert.equal(truth.costChecker.observerAvailable, true);
  assert.equal(truth.costChecker.captureAllowed, true);
  assert.equal(truth.costChecker.scheduledCaptureAllowed, true);
  assert.equal(truth.costChecker.lastCapturedAt, NOW);
  assert.equal(truth.costChecker.lastSnapshotAvailable, true);
  assert.equal(truth.costChecker.lastDeltaAvailable, true);
  assert.equal(truth.costChecker.billingTruth, false);
});

test("codex analytics capture runner dry-run keeps checker disabled by default", async () => {
  const capture = await buildCapturePayload(["--dry-run"], { now: new Date(NOW) });

  assert.equal(capture.config.mode, COST_CHECKER_MODE_DISABLED);
  assert.equal(capture.ok, false);
  assert.equal(capture.runtimeTruth.costChecker.captureAllowed, false);
});

test("codex analytics capture runner builds manual payload without raw page text", async () => {
  const capture = await buildCapturePayload(
    [
      "--mode",
      "manual",
      "--repository",
      "marushu/vtdd-v2-p",
      "--thread-id",
      "dashboard-main-marushu-vtdd-v2-p",
      "--input-text",
      ["5時間の使用制限", "93% 残り", "リセット: 15:16", "token=secret"].join("\n")
    ],
    { now: new Date(NOW) }
  );

  assert.equal(capture.ok, true);
  assert.equal(capture.payload.mode, COST_CHECKER_MODE_MANUAL);
  assert.equal(capture.payload.repository, "marushu/vtdd-v2-p");
  assert.equal(capture.payload.threadId, "dashboard-main-marushu-vtdd-v2-p");
  assert.equal(capture.payload.snapshot.limits[0].remainingPercent, 93);
  assert.equal(JSON.stringify(capture).includes("token=secret"), false);
});
