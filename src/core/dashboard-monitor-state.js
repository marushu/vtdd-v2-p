// Monitor snapshots are observations, never execution authority or notification history.
export class MonitorInputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new MonitorInputError(message, status); };
const statuses = ['unknown', 'checking', 'no_slots', 'available', 'error', 'action_required', 'completed', 'stopped'];
const modes = ['monitoring', 'executing', 'paused'];
// Human summaries must not become a second store for private machine state.
export function monitorText(value, max = 500) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) fail('invalid summary');
  if (/[/\\]/.test(value)) fail('private machine paths are not allowed');
  if (/[\x00-\x1f\x7f]|(?:https?:\/\/|(?:^|\s)[/~\\]|[A-Za-z]:\\)|\b(?:bearer|password|secret|token|pid)\s*[:= ]|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b[a-z0-9-]+\.(?:[a-z]{2,})(?:\b|\/)/i.test(value)) fail('private machine details are not allowed');
  return value.trim();
}
function timestamp(value, now, future = false) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) fail('invalid timestamp');
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().replace('.000Z', 'Z') !== value.replace('.000Z', 'Z')) fail('invalid timestamp');
  if (!future && parsed > now + 120000) fail('future observation');
  return new Date(parsed).toISOString();
}
export function normalizeMonitorSnapshot(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid monitor');
  const out = {};
  for (const key of ['source', 'id']) {
    if (typeof input[key] !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(input[key])) fail(`invalid ${key}`);
    out[key] = input[key];
  }
  if (input.executionKind != null) {
    if (input.executionKind !== 'durable_alarm') fail('invalid execution kind');
    out.executionKind = input.executionKind;
  }
  out.type = input.type ?? 'monitor';
  if (!['monitor', 'task'].includes(out.type)) fail('invalid type');
  out.status = input.status ?? 'unknown';
  if (!statuses.includes(out.status)) fail('invalid status');
  out.mode = input.mode ?? 'monitoring';
  if (!modes.includes(out.mode)) fail('invalid mode');
  for (const key of ['title', 'description', 'resultSummary', 'automationScope', 'requiredAction', 'evidenceSummary']) out[key] = monitorText(input[key], key === 'title' ? 100 : 500);
  if (!out.title) fail('title required');
  for (const key of ['processAlive', 'automaticBookingEnabled']) {
    if (input[key] != null && typeof input[key] !== 'boolean') fail(`invalid ${key}`);
    out[key] = input[key] ?? null;
  }
  out.intervalSeconds = input.intervalSeconds ?? null;
  if (out.intervalSeconds !== null && (!Number.isInteger(out.intervalSeconds) || out.intervalSeconds < 1 || out.intervalSeconds > 86400)) fail('invalid interval');
  out.consecutiveFailures = input.consecutiveFailures ?? 0;
  if (!Number.isInteger(out.consecutiveFailures) || out.consecutiveFailures < 0 || out.consecutiveFailures > 1000000) fail('invalid failure count');
  for (const key of ['observedAt', 'lastAttemptAt', 'lastSuccessAt', 'completedAt', 'nextCheckAt']) out[key] = timestamp(input[key], now, key === 'nextCheckAt');
  for (const key of ['lastAttemptAt', 'lastSuccessAt', 'completedAt']) {
    if (out[key] && out.observedAt && out[key] > out.observedAt) fail('event after observation');
  }
  out.actionURL = input.actionURL ?? null;
  if (out.actionURL !== null && !['/dashboard/chat', '/dashboard/notifications', '/dashboard'].includes(out.actionURL)) fail('invalid action path');
  out.receivedAt = new Date(now).toISOString();
  return out;
}
// Kept self-contained so the browser uses exactly the server freshness rules.
export function computeMonitorView(snapshot, now = Date.now(), connected = true) {
  const m = snapshot;
  const age = value => value && Number.isFinite(Date.parse(value)) ? (now - Date.parse(value)) / 1000 : Infinity;
  let state = m.status;
  const durable = m.executionKind === 'durable_alarm';
  const reportingWindow = durable ? Math.max(2 * m.intervalSeconds + 60, 180) : 120;
  const documentedCompletion = m.status === 'completed' && Boolean(m.observedAt && m.completedAt && m.evidenceSummary) && !m.consecutiveFailures;
  const reporterState = !connected ? 'unknown' : age(m.receivedAt) > reportingWindow || age(m.observedAt) > reportingWindow ? 'sync_stale' : 'connected';
  if (documentedCompletion) state = 'completed';
  else if (!connected) state = 'unknown';
  else if (!m.observedAt || !m.receivedAt || (!durable && m.processAlive == null) || !m.intervalSeconds) state = 'unknown';
  else if (age(m.receivedAt) > reportingWindow || age(m.observedAt) > reportingWindow) state = 'sync_stale';
  else if (m.status === 'error' || m.consecutiveFailures > 0) state = 'error';
  else if (m.status === 'action_required') state = 'action_required';
  else if (m.processAlive === false || m.mode === 'paused' || m.status === 'stopped') state = 'stopped';
  else if (!m.lastAttemptAt || !m.lastSuccessAt) state = 'unknown';
  else if (age(m.lastSuccessAt) > Math.max(2 * m.intervalSeconds + 60, 180)) state = 'checking_unverified';
  else if (m.status === 'completed') state = 'unknown';
  const needsAction = ['error', 'action_required', 'stopped', 'sync_stale', 'checking_unverified'].includes(state);
  return { ...m, currentState: state, reporterState, documentedCompletion, needsAction, healthy: ['no_slots', 'available', 'checking'].includes(state) };
}
export async function readMonitorBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail('JSON required', 415);
  if (Number(request.headers.get('content-length')) > 16384) fail('body too large', 413);
  const reader = request.body?.getReader();
  if (!reader) fail('body required');
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); fail('body too large', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('invalid JSON'); }
}
export function createInMemoryDashboardMonitorStore() {
  const records = new Map();
  return {
    async list() { return Array.from(records.values(), value => structuredClone(value)); },
    async put(snapshot) {
      const key = `${snapshot.source}:${snapshot.id}`;
      const previous = records.get(key);
      if (previous && (!snapshot.observedAt || (previous.observedAt && snapshot.observedAt <= previous.observedAt))) fail('out-of-order observation', 409);
      if (!previous && records.size >= 100) fail('monitor limit reached', 409);
      records.set(key, structuredClone(snapshot));
    }
  };
}
export function createD1DashboardMonitorStore(d1) {
  let schema;
  const ready = () => schema ??= d1.prepare(`CREATE TABLE IF NOT EXISTS vtdd_dashboard_monitors (
    source TEXT NOT NULL, id TEXT NOT NULL, observed_at TEXT, payload_json TEXT NOT NULL,
    PRIMARY KEY (source, id))`).run().catch(error => { schema = null; throw error; });
  return {
    async list() {
      await ready();
      const rows = await d1.prepare('SELECT payload_json FROM vtdd_dashboard_monitors ORDER BY source, id LIMIT 100').all();
      return (rows.results ?? []).map(row => JSON.parse(row.payload_json));
    },
    async put(m) {
      await ready();
      // Capacity and ordering are checked in the same SQLite statement as the write.
      const result = await d1.prepare(`INSERT INTO vtdd_dashboard_monitors (source, id, observed_at, payload_json)
        SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM vtdd_dashboard_monitors) < 100
          OR EXISTS (SELECT 1 FROM vtdd_dashboard_monitors WHERE source = ? AND id = ?)
        ON CONFLICT(source, id) DO UPDATE SET observed_at = excluded.observed_at, payload_json = excluded.payload_json
        WHERE excluded.observed_at IS NOT NULL AND (vtdd_dashboard_monitors.observed_at IS NULL OR excluded.observed_at > vtdd_dashboard_monitors.observed_at)`)
        .bind(m.source, m.id, m.observedAt, JSON.stringify(m), m.source, m.id).run();
      if (!result.meta?.changes) fail('out-of-order observation or monitor limit reached', 409);
    }
  };
}
const stores = new WeakMap();
export function resolveDashboardMonitorStore(env) {
  if (env.DASHBOARD_MONITOR_STORE) return env.DASHBOARD_MONITOR_STORE;
  const d1 = env.VTDD_MEMORY_D1 ?? env.MEMORY_D1;
  if (!d1?.prepare) return null;
  if (!stores.has(d1)) stores.set(d1, createD1DashboardMonitorStore(d1));
  return stores.get(d1);
}
