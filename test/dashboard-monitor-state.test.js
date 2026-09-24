import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMonitorSnapshot as normalize, computeMonitorView as view, readMonitorBody, createInMemoryDashboardMonitorStore, createD1DashboardMonitorStore } from '../src/core/dashboard-monitor-state.js';
const now = Date.parse('2026-09-24T03:00:00Z');
const iso = seconds => new Date(now + seconds * 1000).toISOString();
export const sample = (extra = {}) => ({ id: 'sample', source: 'test', title: 'Sample repair monitor', status: 'no_slots', processAlive: true, intervalSeconds: 60, observedAt: iso(0), lastAttemptAt: iso(-10), lastSuccessAt: iso(-10), nextCheckAt: iso(50), ...extra });
test('allowlist removes raw fields and replaces client receipt', () => {
  const m = normalize(sample({ pid: 432, statePath: '/private/example', hostname: 'private.local', credential: 'hidden', receivedAt: iso(999) }), now);
  assert.equal(m.receivedAt, iso(0));
  for (const key of ['pid', 'statePath', 'hostname', 'credential']) assert.equal(key in m, false);
});
test('strict identifiers, types, boolean, enums, private text and paths', () => {
  for (const change of [{ id: '../a' }, { source: 'Bad host' }, { type: 'script' }, { status: 'healthy' }, { mode: 'auto' }, { processAlive: 'true' }, { automaticBookingEnabled: 1 }, { intervalSeconds: 0 }, { consecutiveFailures: -1 }, { title: 'file /private/state' }, { description: 'host.internal' }, { resultSummary: 'token=secret' }, { actionURL: '//evil.example' }, { actionURL: '/dashboard/../other' }, { actionURL: '/dashboard/chat?redirect=https://evil.example' }]) assert.throws(() => normalize(sample(change), now));
  assert.equal(normalize(sample({ actionURL: '/dashboard/chat' }), now).actionURL, '/dashboard/chat');
});
test('strict real timestamps, skew and event ordering', () => {
  for (const change of [{ observedAt: 'yesterday' }, { observedAt: '2026-02-30T00:00:00Z' }, { observedAt: iso(121) }, { lastSuccessAt: iso(1) }]) assert.throws(() => normalize(sample(change), now));
  assert.equal(normalize(sample({ observedAt: iso(120) }), now).observedAt, iso(120));
});
test('freshness is derived at read time and cannot silently become healthy', () => {
  const m = normalize(sample(), now);
  assert.equal(view(m, now).currentState, 'no_slots');
  assert.equal(view(m, now + 121000).currentState, 'sync_stale');
  assert.equal(view({ ...m, lastSuccessAt: iso(-181) }, now).currentState, 'checking_unverified');
  assert.equal(view({ ...m, processAlive: false }, now).currentState, 'stopped');
  assert.equal(view({ ...m, consecutiveFailures: 1 }, now).currentState, 'error');
  assert.equal(view({ ...m, status: 'error' }, now).healthy, false);
  assert.equal(view(m, now, false).currentState, 'unknown');
  for (const field of ['observedAt', 'receivedAt', 'processAlive', 'intervalSeconds', 'lastAttemptAt', 'lastSuccessAt']) assert.equal(view({ ...m, [field]: null }, now).currentState, 'unknown', field);
});
test('completion requires timestamp and evidence, not boolean', () => {
  assert.equal(view(normalize(sample({ status: 'completed', completed: true }), now), now).currentState, 'unknown');
  assert.equal(view(normalize(sample({ status: 'completed', completedAt: iso(-5), evidenceSummary: 'Receipt confirmed', processAlive: false }), now), now).currentState, 'completed');
});
test('streaming body limit applies without content-length and accepts split UTF8', async () => {
  const req = body => new Request('https://example.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half' });
  assert.deepEqual(await readMonitorBody(req('{"title":"確認"}')), { title: '確認' });
  await assert.rejects(readMonitorBody(req(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(16000)); c.enqueue(new Uint8Array(385)); c.close(); } }))), error => error.status === 413);
  await assert.rejects(readMonitorBody(req('{')), /invalid JSON/);
  await assert.rejects(readMonitorBody(new Request('https://example.com', { method: 'POST', body: '{}' })), error => error.status === 415);
});
async function exerciseStore(store) {
  const first = normalize(sample(), now);
  await store.put(first);
  await assert.rejects(store.put(first), error => error.status === 409);
  await assert.rejects(store.put(normalize(sample({ observedAt: iso(-1), lastAttemptAt: null, lastSuccessAt: null }), now)), error => error.status === 409);
  await store.put(normalize(sample({ observedAt: iso(1) }), now + 1000));
  for (let i = 1; i < 100; i++) await store.put(normalize(sample({ id: `sample-${i}` }), now));
  await assert.rejects(store.put(normalize(sample({ id: 'overflow' }), now)), error => error.status === 409);
  assert.equal((await store.list()).length, 100);
  await store.put(normalize(sample({ observedAt: iso(2) }), now + 2000));
}
test('memory store ordering and global capacity', async () => exerciseStore(createInMemoryDashboardMonitorStore()));
test('D1 SQL executes against SQLite, same ordering/capacity behavior', async t => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch { t.skip('node:sqlite unavailable'); return; }
  const db = new DatabaseSync(':memory:');
  const d1 = { prepare(sql) {
    let args = [];
    return { bind(...values) { args = values; return this; }, async run() { const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; }, async all() { return { results: db.prepare(sql).all(...args) }; } };
  } };
  try { await exerciseStore(createD1DashboardMonitorStore(d1)); } finally { db.close(); }
});
test('attempt start precedes successful completion; later failure preserves previous success', () => {
  const input = sample({ lastAttemptAt: '2026-09-24T12:00:00Z', lastSuccessAt: '2026-09-24T12:00:20Z', observedAt: '2026-09-24T12:00:30Z' });
  const at = Date.parse(input.observedAt);
  assert.equal(normalize(input, at).lastSuccessAt, '2026-09-24T12:00:20.000Z');
  const failed = normalize({ ...input, lastAttemptAt: '2026-09-24T12:00:25Z', status: 'error', consecutiveFailures: 1 }, at);
  assert.equal(failed.lastSuccessAt, '2026-09-24T12:00:20.000Z');
  assert.equal(view(failed, at).currentState, 'error');
});
test('documented completion survives reporter retirement and offline without healthy monitoring', () => {
  const completed = normalize(sample({ status: 'completed', completedAt: iso(-5), evidenceSummary: 'Receipt confirmed', processAlive: false }), now);
  for (const connected of [true, false]) {
    const result = view(completed, now + 86400000, connected);
    assert.equal(result.currentState, 'completed');
    assert.equal(result.documentedCompletion, true);
    assert.equal(result.healthy, false);
    assert.equal(result.needsAction, false);
    assert.equal(result.reporterState, connected ? 'sync_stale' : 'unknown');
  }
  assert.notEqual(view({ ...completed, evidenceSummary: '' }, now + 86400000).currentState, 'completed');
});
