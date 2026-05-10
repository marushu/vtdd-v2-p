function normalizeText(value) {
  return String(value ?? "").trim();
}

function defaultNormalizeTimestamp(value) {
  const text = normalizeText(value);
  return Number.isFinite(Date.parse(text)) ? text : null;
}

export function buildExecutionLeadTime(timestamps = {}, options = {}) {
  const normalizeTimestamp = options.normalizeTimestamp || defaultNormalizeTimestamp;
  const queuedAt = normalizeTimestamp(timestamps.queuedAt ?? timestamps.queued_at);
  const pickedUpAt = normalizeTimestamp(timestamps.pickedUpAt ?? timestamps.picked_up_at);
  const codexStartedAt = normalizeTimestamp(timestamps.codexStartedAt ?? timestamps.codex_started_at);
  const branchPushedAt = normalizeTimestamp(timestamps.branchPushedAt ?? timestamps.branch_pushed_at);
  const prCreatedAt = normalizeTimestamp(timestamps.prCreatedAt ?? timestamps.pr_created_at);
  const completedAt = normalizeTimestamp(timestamps.completedAt ?? timestamps.completed_at);
  const failedAt = normalizeTimestamp(timestamps.failedAt ?? timestamps.failed_at);
  const terminalAt = completedAt || failedAt || prCreatedAt || null;

  return {
    queued_at: queuedAt,
    picked_up_at: pickedUpAt,
    codex_started_at: codexStartedAt,
    branch_pushed_at: branchPushedAt,
    pr_created_at: prCreatedAt,
    completed_at: completedAt,
    failed_at: failedAt,
    durations: {
      queue_wait_duration: buildExecutionDuration(queuedAt, pickedUpAt),
      codex_execution_duration: buildExecutionDuration(
        codexStartedAt,
        branchPushedAt || prCreatedAt || completedAt || failedAt
      ),
      pr_creation_duration: buildExecutionDuration(branchPushedAt, prCreatedAt),
      total_lead_time: buildExecutionDuration(queuedAt, terminalAt)
    }
  };
}

export function buildExecutionDuration(start, end) {
  const startMs = Date.parse(normalizeText(start));
  const endMs = Date.parse(normalizeText(end));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  const seconds = Math.round((endMs - startMs) / 1000);
  return {
    seconds,
    label: formatExecutionDurationSeconds(seconds)
  };
}

export function formatExecutionDurationSeconds(seconds) {
  if (!Number.isFinite(seconds)) {
    return null;
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) {
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const minuteRemainder = minutes % 60;
  return minuteRemainder ? `${hours}h ${minuteRemainder}m` : `${hours}h`;
}
