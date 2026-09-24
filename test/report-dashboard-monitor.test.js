import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectMonitorState, matchMonitorIdentity, matchesNodeMonitor, verifyMonitorProcess, validateReporterConfig, acquireReporterLock } from '../scripts/report-dashboard-monitor.mjs';
const config = { id: 'sample', source: 'reporter', title: 'Sample repair monitor', statePath: '/example/state.json', runtimeUrl: 'https://example.com', automationScope: '空き状況の確認のみ' };
test('reporter projects allowlisted summary; raw private state never leaves', () => {
  const result = projectMonitorState({ pid: 345, hostname: 'private.internal', token: 'private', statePath: '/private/file', status: 'no_slots', error: '/private/error' }, config);
  assert.equal(result.status, 'error');
  assert.equal(result.processAlive, null);
  for (const key of ['pid', 'hostname', 'token', 'statePath', 'error', 'receivedAt']) assert.equal(key in result, false);
  assert.equal(projectMonitorState({ resultSummary: 'token=private' }, config).resultSummary, '詳細は監視元で確認してください');
  assert.equal(projectMonitorState(null, config).status, 'unknown');
});
test('process identity must be Node AND configured monitor identity', async () => {
  assert.equal(matchesNodeMonitor('/usr/bin/node /example/monitor.mjs', 'monitor.mjs'), true);
  assert.equal(matchesNodeMonitor('/bin/sh monitor.mjs', 'monitor.mjs'), false);
  assert.equal(matchesNodeMonitor('/usr/bin/node other.mjs', 'monitor.mjs'), false);
  assert.equal(await verifyMonitorProcess(123, { startedAt: '2026-09-24T12:00:00Z', expectedCommand: 'monitor.mjs' }, async (cmd, args) => {
    assert.equal(cmd, '/bin/ps'); assert.deepEqual(args, ['-p', '123', '-o', 'lstart=', '-o', 'comm=', '-o', 'args=']);
    return { stdout: 'Thu Sep 24 12:00:00 2026 node /usr/bin/node monitor.mjs' };
  }), true);
});
test('reporter configuration is HTTPS origin only and absolute state path', () => {
  assert.equal(validateReporterConfig(config), config);
  for (const change of [{ statePath: 'relative' }, { runtimeUrl: 'http://example.com' }, { runtimeUrl: 'https://user:password@example.com' }, { runtimeUrl: 'https://example.com/path' }]) assert.throws(() => validateReporterConfig({ ...config, ...change }));
});
test('exclusive lock never deletes an existing lock', async () => {
  const dir = await mkdtemp(resolve('.monitor-lock-test-'));
  const path = dir + '/reporter.lock';
  try {
    const release = await acquireReporterLock(path);
    await assert.rejects(acquireReporterLock(path), { code: 'EEXIST' });
    await release();
    await writeFile(path, 'existing stale lock');
    await assert.rejects(acquireReporterLock(path), { code: 'EEXIST' });
    assert.equal(await readFile(path, 'utf8'), 'existing stale lock');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('bare Node identity uses start time; reused PID and inspection failures remain unknown', async () => {
  const identity = { startedAt: '2026-09-24T12:00:02Z', expectedCommand: 'monitor.mjs' };
  const output = 'Thu Sep 24 12:00:00 2026 node node';
  assert.equal(matchMonitorIdentity(output, identity), true);
  assert.equal(matchMonitorIdentity(output, { ...identity, startedAt: '2026-09-24T11:00:00Z' }), null);
  assert.equal(matchMonitorIdentity(output, {}), null);
  assert.equal(matchMonitorIdentity(output.replace('node node', 'python python'), identity), null);
  assert.equal(matchMonitorIdentity(output.replace('node node', 'node node unrelated.mjs'), identity), null);
  assert.equal(await verifyMonitorProcess(123, identity, async () => ({ stdout: '' })), false);
  assert.equal(await verifyMonitorProcess(123, identity, async () => { throw { code: 1, stdout: '', stderr: '' }; }), false);
  assert.equal(await verifyMonitorProcess(123, identity, async () => { throw { code: 'EPERM' }; }), null);
});
test('watch state adapter preserves confirmed absence, review, error and stopped distinctions', () => {
  const now = Date.parse('2026-09-24T12:00:30Z');
  const state = { running: true, mode: 'watching', checking: false, lastResult: { state: 'no_slots', checkedAt: '2026-09-24T12:00:20Z' }, lastAttemptAt: '2026-09-24T12:00:00Z', lastSuccessAt: '2026-09-24T12:00:20Z', intervalSeconds: 300, automaticBookingEnabled: false };
  const project = extra => projectMonitorState({ ...state, ...extra }, config, { now, processAlive: true });
  assert.equal(project({}).status, 'no_slots');
  for (const result of ['needs_slot_review', 'signin_or_support_tab_required', 'target_mismatch']) {
    const output = project({ lastResult: { state: result, checkedAt: state.lastResult.checkedAt } });
    assert.equal(output.status, 'action_required'); assert.notEqual(output.status, 'available');
  }
  assert.equal(project({ lastResult: { state: 'check_failed' } }).status, 'error');
  assert.equal(project({ consecutiveFailures: 1 }).status, 'error');
  assert.equal(project({ mode: 'retrying', checking: true }).status, 'error');
  assert.equal(project({ checking: true }).status, 'checking');
  assert.equal(project({ running: false, checking: true }).processAlive, false);
  assert.equal(project({ running: false, checking: true }).status, 'stopped');
});
