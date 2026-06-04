const MODE_DISABLED = "disabled";
const MODE_MANUAL = "manual";
const MODE_ENABLED = "enabled";

const VALID_MODES = new Set([MODE_DISABLED, MODE_MANUAL, MODE_ENABLED]);
const DEFAULT_SOURCE = "chatgpt_codex_analytics_page";
const DEFAULT_CAPTURE_METHOD = "authenticated_browser_dom_or_ocr";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMode(value) {
  const mode = normalizeText(value).toLowerCase();
  return VALID_MODES.has(mode) ? mode : MODE_DISABLED;
}

function normalizeDate(value, now = new Date()) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return date;
}

function normalizePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function isoDate(value) {
  const date = normalizeDate(value);
  return date ? date.toISOString() : null;
}

function sanitizeShortText(value, { maxLength = 120 } = {}) {
  return normalizeText(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\b(sk-[A-Za-z0-9_-]+|gh[psuor]_[A-Za-z0-9_]+|approval:[A-Za-z0-9-]+)\b/g, "[REDACTED]")
    .replace(/\b(cookie|authorization|token|secret|session)\s*[:=]\s*[^\s]+/gi, "$1=[REDACTED]")
    .replace(/\s+/g, " ")
    .slice(0, maxLength)
    .trim();
}

function normalizePercent(value) {
  if (typeof value === "string") {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (!match) {
      return null;
    }
    value = match[0];
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  const clamped = Math.min(100, Math.max(0, number));
  return Math.round(clamped * 10) / 10;
}

function normalizeLimit(input = {}) {
  const label = sanitizeShortText(input.label || input.name || input.title, { maxLength: 80 });
  const remainingPercent = normalizePercent(
    input.remainingPercent ?? input.remaining_percent ?? input.percentRemaining ?? input.percent
  );
  if (!label || remainingPercent === null) {
    return null;
  }
  const resetAtText = sanitizeShortText(input.resetAtText || input.reset_at_text || input.reset || "", {
    maxLength: 80
  });
  return {
    label,
    remainingPercent,
    ...(resetAtText ? { resetAtText } : {})
  };
}

function normalizeCaptureMode(value, fallbackMode = MODE_DISABLED) {
  const mode = normalizeMode(value || fallbackMode);
  return mode === MODE_ENABLED ? MODE_ENABLED : mode === MODE_MANUAL ? MODE_MANUAL : MODE_DISABLED;
}

function normalizeCostCheckerConfig(input = {}, options = {}) {
  const now = normalizeDate(options.now) || new Date();
  const mode = normalizeMode(input.mode ?? input.captureMode ?? input.enabledMode);
  const issues = [];
  const ttlMs =
    normalizePositiveNumber(input.ttlMs ?? input.ttl_ms) ||
    normalizePositiveNumber(input.ttlSeconds ?? input.ttl_seconds) * 1000;
  const requestedExpiresAt = normalizeDate(input.expiresAt ?? input.expires_at, now);
  const expiresAt = requestedExpiresAt || (ttlMs ? new Date(now.getTime() + ttlMs) : null);
  const sessionId = sanitizeShortText(input.sessionId || input.session_id || "", { maxLength: 80 });

  if (mode === MODE_DISABLED) {
    return {
      mode,
      enabled: false,
      valid: true,
      captureAllowed: false,
      scheduledCaptureAllowed: false,
      singleShot: false,
      reason: "disabled_by_default",
      issues
    };
  }

  if (mode === MODE_MANUAL) {
    return {
      mode,
      enabled: true,
      valid: true,
      captureAllowed: true,
      scheduledCaptureAllowed: false,
      singleShot: true,
      reason: "manual_single_shot_only",
      ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
      ...(sessionId ? { sessionId } : {}),
      issues
    };
  }

  if (!expiresAt && !sessionId) {
    issues.push("enabled mode requires ttl/expiresAt or session scope");
  }
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    issues.push("enabled mode expiry is already elapsed");
  }
  const valid = issues.length === 0;
  return {
    mode,
    enabled: valid,
    valid,
    captureAllowed: valid,
    scheduledCaptureAllowed: valid,
    singleShot: false,
    reason: valid ? "enabled_with_bounded_scope" : "enabled_requires_bounded_scope",
    ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
    ...(sessionId ? { sessionId } : {}),
    issues
  };
}

function sanitizeCodexAnalyticsUsageSnapshot(input = {}, options = {}) {
  const captureMode = normalizeCaptureMode(input.captureMode || input.mode, options.captureMode || MODE_MANUAL);
  const capturedAt = isoDate(input.capturedAt || input.captured_at || options.now || new Date()) || new Date().toISOString();
  const rawLimits = Array.isArray(input.limits) ? input.limits : [];
  const limits = rawLimits.map((limit) => normalizeLimit(limit)).filter(Boolean);
  return {
    kind: "codex_analytics_usage_snapshot",
    captureMode,
    enabled: captureMode !== MODE_DISABLED,
    capturedAt,
    source: sanitizeShortText(input.source || DEFAULT_SOURCE, { maxLength: 80 }) || DEFAULT_SOURCE,
    captureMethod:
      sanitizeShortText(input.captureMethod || input.capture_method || DEFAULT_CAPTURE_METHOD, { maxLength: 80 }) ||
      DEFAULT_CAPTURE_METHOD,
    limits,
    redacted: true
  };
}

function parseCodexAnalyticsUsageText(text, options = {}) {
  const sourceText = normalizeText(text);
  const limits = [];
  if (!sourceText) {
    return sanitizeCodexAnalyticsUsageSnapshot({ limits: [], captureMode: options.captureMode }, options);
  }
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => sanitizeShortText(line, { maxLength: 140 }))
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const percentMatch = line.match(/(\d+(?:\.\d+)?)\s*%\s*(?:残り|remaining)?/i);
    if (!percentMatch) {
      continue;
    }
    const remainingPercent = normalizePercent(percentMatch[1]);
    const labelCandidates = [lines[index - 1], line.replace(percentMatch[0], ""), lines[index - 2]].filter(Boolean);
    const label =
      labelCandidates.find((candidate) => /制限|上限|limit|usage|spark|codex/i.test(candidate)) ||
      `Codex usage limit ${limits.length + 1}`;
    const nextLine = lines[index + 1] || "";
    const resetAtText = /リセット|reset/i.test(nextLine) ? nextLine : "";
    const normalized = normalizeLimit({ label, remainingPercent, resetAtText });
    if (normalized) {
      limits.push(normalized);
    }
  }

  return sanitizeCodexAnalyticsUsageSnapshot(
    {
      captureMode: options.captureMode || MODE_MANUAL,
      capturedAt: options.now,
      captureMethod: options.captureMethod || "authenticated_browser_text_or_ocr",
      limits
    },
    options
  );
}

function buildCodexAnalyticsUsageDelta(beforeSnapshot, afterSnapshot) {
  const before = sanitizeCodexAnalyticsUsageSnapshot(beforeSnapshot || {}, { captureMode: MODE_MANUAL });
  const after = sanitizeCodexAnalyticsUsageSnapshot(afterSnapshot || {}, { captureMode: MODE_MANUAL });
  const afterByLabel = new Map(after.limits.map((limit) => [limit.label, limit]));
  const limits = before.limits.map((beforeLimit) => {
    const afterLimit = afterByLabel.get(beforeLimit.label);
    if (!afterLimit) {
      return {
        label: beforeLimit.label,
        status: "missing_after",
        beforeRemainingPercent: beforeLimit.remainingPercent,
        afterRemainingPercent: null,
        consumedDisplayPercent: null
      };
    }
    const consumed = Math.round((beforeLimit.remainingPercent - afterLimit.remainingPercent) * 10) / 10;
    return {
      label: beforeLimit.label,
      status: "compared",
      beforeRemainingPercent: beforeLimit.remainingPercent,
      afterRemainingPercent: afterLimit.remainingPercent,
      consumedDisplayPercent: consumed,
      resetChanged: (beforeLimit.resetAtText || "") !== (afterLimit.resetAtText || "")
    };
  });
  for (const afterLimit of after.limits) {
    if (!before.limits.some((beforeLimit) => beforeLimit.label === afterLimit.label)) {
      limits.push({
        label: afterLimit.label,
        status: "missing_before",
        beforeRemainingPercent: null,
        afterRemainingPercent: afterLimit.remainingPercent,
        consumedDisplayPercent: null
      });
    }
  }
  return {
    kind: "codex_analytics_usage_delta",
    beforeCapturedAt: before.capturedAt,
    afterCapturedAt: after.capturedAt,
    limits,
    precision: "display_percent_delta_not_billing_truth",
    billingTruth: false,
    redacted: true
  };
}

function buildCostCheckerRuntimeTruth(configInput = {}, state = {}) {
  const config = normalizeCostCheckerConfig(configInput, { now: state.now });
  const lastSnapshot = state.lastSnapshot
    ? sanitizeCodexAnalyticsUsageSnapshot(state.lastSnapshot, { captureMode: config.mode, now: state.now })
    : null;
  const lastDelta = state.lastDelta || null;
  const observerAvailable = state.observerAvailable === true;
  return {
    costChecker: {
      enabled: config.enabled,
      mode: config.mode,
      valid: config.valid,
      reason: config.reason,
      blockedReason: config.valid ? null : config.issues.join("; "),
      observerAvailable,
      captureAllowed: config.captureAllowed,
      scheduledCaptureAllowed: config.scheduledCaptureAllowed,
      lastCapturedAt: lastSnapshot?.capturedAt || null,
      lastSnapshotAvailable: Boolean(lastSnapshot && lastSnapshot.limits.length > 0),
      lastDeltaAvailable: Boolean(lastDelta),
      billingTruth: false,
      source: DEFAULT_SOURCE
    }
  };
}

export {
  MODE_DISABLED as COST_CHECKER_MODE_DISABLED,
  MODE_ENABLED as COST_CHECKER_MODE_ENABLED,
  MODE_MANUAL as COST_CHECKER_MODE_MANUAL,
  buildCodexAnalyticsUsageDelta,
  buildCostCheckerRuntimeTruth,
  normalizeCostCheckerConfig,
  parseCodexAnalyticsUsageText,
  sanitizeCodexAnalyticsUsageSnapshot
};
