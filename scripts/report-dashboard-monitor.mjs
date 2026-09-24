#!/usr/bin/env node
// Read-only observer. Never launches or controls a monitor; only its own lock is written.
import { readFile, open, unlink, stat } from 'node:fs/promises';
import { isAbsolute, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { normalizeMonitorSnapshot, monitorText } from '../src/core/dashboard-monitor-state.js';

const runFile = promisify(execFile);
export function validateReporterConfig(config) {
  if (!config || !isAbsolute(config.statePath || '')) throw new Error('absolute statePath required');
  const url = new URL(config.runtimeUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('HTTPS runtime origin required');
  if (config.expectedCommand != null && (typeof config.expectedCommand !== 'string' || config.expectedCommand.length < 3 || config.expectedCommand.length > 300 || /[\r\n\0]/.test(config.expectedCommand))) throw new Error('invalid command identity');
  if (config.startTimeToleranceSeconds != null && (!Number.isFinite(config.startTimeToleranceSeconds) || config.startTimeToleranceSeconds < 0 || config.startTimeToleranceSeconds > 30)) throw new Error('invalid start tolerance');
  normalizeMonitorSnapshot({ id: config.id, source: config.source, title: config.title, description: config.description, automationScope: config.automationScope });
  return config;
}
function safeSummary(value, fallback = '') {
  try { return monitorText(value); } catch { return fallback; }
}
// Explicit adapter for the read-only watch state contract. Page changes are not availability.
export function adaptWatchState(input) {
  const result = input.lastResult;
  const mapping = {
    no_slots: ['no_slots', '空きがないことを確認しました', ''],
    check_failed: ['error', '確認に失敗しました', '監視元の確認状況を確認してください'],
    needs_slot_review: ['action_required', 'ページの変化を検出しました。空きは未確定です', '候補の内容を確認してください'],
    signin_or_support_tab_required: ['action_required', 'サインインまたは画面の確認が必要です', '監視元の画面を確認してください'],
    target_mismatch: ['action_required', '確認対象が一致していません', '確認対象を見直してください']
  };
  let [status, resultSummary, requiredAction] = mapping[result?.state] || ['unknown', '確認結果は未確認です', ''];
  if (status === 'no_slots' && !result?.checkedAt) status = 'unknown';
  if (input.checking === true && status === 'no_slots') status = 'checking';
  if (input.mode === 'waiting_for_review' && !['error', 'action_required'].includes(status)) {
    status = 'action_required'; requiredAction = '監視元の内容を確認してください';
  }
  if (input.mode === 'retrying' || input.consecutiveFailures > 0 || input.error) {
    status = 'error'; resultSummary = '確認に失敗しました。前回の空き状況は現在の結果ではありません';
  }
  if (input.running === false || input.mode === 'stopped') status = 'stopped';
  return {
    ...input, status, resultSummary, requiredAction,
    mode: input.mode === 'stopped' ? 'paused' : 'monitoring',
    lastSuccessAt: input.lastSuccessAt ?? (result?.state === 'no_slots' ? result.checkedAt : null)
  };
}
// Raw state may contain private paths, PIDs and errors. Only this projection leaves the machine.
export function projectMonitorState(state, config, { now = Date.now(), processAlive = null } = {}) {
  const raw = state && typeof state === 'object' ? state : {};
  const input = 'running' in raw || 'lastResult' in raw || ['watching', 'retrying', 'waiting_for_review'].includes(raw.mode) ? adaptWatchState(raw) : raw;
  const allowedStatus = ['unknown', 'checking', 'no_slots', 'available', 'error', 'action_required', 'completed', 'stopped'];
  const snapshot = {
    id: config.id, source: config.source, type: 'monitor', title: config.title,
    description: config.description, automationScope: config.automationScope,
    mode: ['monitoring', 'executing', 'paused'].includes(input.mode) ? input.mode : 'monitoring',
    status: allowedStatus.includes(input.status) ? input.status : 'unknown',
    processAlive: raw.running === false || raw.mode === 'stopped' ? false : processAlive, observedAt: new Date(now).toISOString(),
    intervalSeconds: input.intervalSeconds ?? null,
    lastAttemptAt: input.lastAttemptAt ?? null, lastSuccessAt: input.lastSuccessAt ?? null,
    nextCheckAt: input.nextCheckAt ?? null, completedAt: input.completedAt ?? null,
    resultSummary: safeSummary(input.resultSummary, '詳細は監視元で確認してください'),
    evidenceSummary: safeSummary(input.evidenceSummary), requiredAction: safeSummary(input.requiredAction),
    consecutiveFailures: input.consecutiveFailures ?? 0,
    automaticBookingEnabled: input.automaticBookingEnabled ?? null,
    actionURL: '/dashboard/chat'
  };
  // A known failed attempt cannot be projected as an old successful result.
  if (input.error || input.status === 'error') { snapshot.status = 'error'; snapshot.consecutiveFailures = Math.max(1, snapshot.consecutiveFailures); }
  if (raw.running === false || raw.mode === 'stopped') snapshot.status = 'stopped';
  const normalized = normalizeMonitorSnapshot(snapshot, now);
  delete normalized.receivedAt; // Only the server supplies receipt time.
  return normalized;
}
export function matchesNodeMonitor(command, expectedCommand) {
  if (!expectedCommand || typeof command !== 'string') return false;
  const executable = command.trim().split(/\s+/)[0];
  return /^(node|nodejs)(?:\.exe)?$/.test(basename(executable || '')) && command.includes(expectedCommand);
}
// ps output uses a fixed locale/timezone. A reused PID or unreadable identity is unknown.
export function matchMonitorIdentity(output, { startedAt, expectedCommand, startTimeToleranceSeconds = 5 } = {}) {
  const match = String(output).trim().match(/^(\w{3} \w{3}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4})\s+(\S+)\s+(.+)$/);
  if (!match || !/^(node|nodejs)(?:\.exe)?$/.test(basename(match[2]))) return null;
  const actualStart = Date.parse(match[1] + ' UTC');
  const expectedStart = typeof startedAt === 'string' ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(actualStart) || !Number.isFinite(expectedStart) || !Number.isFinite(startTimeToleranceSeconds) || startTimeToleranceSeconds < 0 || startTimeToleranceSeconds > 30 || Math.abs(actualStart - expectedStart) > startTimeToleranceSeconds * 1000) return null;
  const command = match[3];
  const args = command.trim().split(/\s+/);
  const bareNode = /^(node|nodejs)$/.test(basename(args[0])) && args.slice(1).every(arg => arg === '-' || arg.startsWith('--input-type='));
  if (expectedCommand && !bareNode && !matchesNodeMonitor(command, expectedCommand)) return null;
  return true;
}
export async function verifyMonitorProcess(pid, identity = {}, inspect = runFile) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return null;
  try {
    const { stdout } = await inspect('/bin/ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'comm=', '-o', 'args='], {
      timeout: 3000, maxBuffer: 8192, env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' }
    });
    if (!stdout.trim()) return false;
    return matchMonitorIdentity(stdout, identity);
  } catch (error) {
    // ps exit 1 with no output is the documented no-matching-process case.
    if (error.code === 1 && error.stdout === '' && error.stderr === '') return false;
    return null;
  }
}
export async function acquireReporterLock(path) {
  // Existing locks, including stale ones, require explicit operator recovery.
  const handle = await open(path, 'wx', 0o600);
  const identity = await handle.stat();
  await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  return async () => {
    try {
      const current = await stat(path);
      if (current.ino === identity.ino && current.dev === identity.dev) await unlink(path);
    } finally { await handle.close(); }
  };
}
export async function runReporter(configPath, { once = false } = {}) {
  if (!isAbsolute(configPath || '')) throw new Error('absolute config path required');
  const config = validateReporterConfig(JSON.parse(await readFile(configPath, 'utf8')));
  const token = process.env.VTDD_GATEWAY_BEARER_TOKEN;
  if (!token) throw new Error('reporter credential not configured');
  const release = await acquireReporterLock(configPath + '.reporter.lock');
  const lifetime = new AbortController();
  const stop = () => lifetime.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  let lastObservation = 0, failures = 0;
  try {
    do {
      try {
        let state = null;
        try {
          const contents = await readFile(config.statePath, 'utf8');
          if (Buffer.byteLength(contents) > 1048576) throw new Error('state too large');
          state = JSON.parse(contents);
        } catch { /* Unknown state is reported honestly without logging private errors. */ }
        const processAlive = state ? await verifyMonitorProcess(state.pid, { startedAt: state.startedAt, expectedCommand: config.expectedCommand, startTimeToleranceSeconds: config.startTimeToleranceSeconds ?? 5 }) : null;
        const wallTime = Date.now();
        // Do not manufacture future observations when the wall clock moves backwards.
        if (wallTime <= lastObservation) throw new Error('clock not advancing');
        const snapshot = projectMonitorState(state, config, { now: wallTime, processAlive });
        lastObservation = wallTime;
        const body = JSON.stringify(snapshot);
        if (Buffer.byteLength(body) > 16384) throw new Error('summary too large');
        const response = await fetch(new URL('/v2/dashboard/monitors', config.runtimeUrl), {
          method: 'POST', redirect: 'error', signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000)]),
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body
        });
        await response.body?.cancel();
        if (!response.ok) throw new Error('report rejected');
        failures = 0;
        process.stdout.write('Monitor summary delivered.\n');
      } catch {
        if (lifetime.signal.aborted) break;
        failures++;
        process.stderr.write('Monitor summary unavailable; retry deferred.\n');
        if (once) process.exitCode = 1;
      }
      if (once || lifetime.signal.aborted) break;
      await delay(Math.min(60000 * 2 ** Math.min(failures, 4), 900000), undefined, { signal: lifetime.signal }).catch(() => {});
    } while (!lifetime.signal.aborted);
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    await release();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args.includes('--config') || args.some((arg, index) => arg !== '--once' && arg !== '--config' && args[index - 1] !== '--config')) {
    process.stderr.write('Usage: report-dashboard-monitor.mjs --config /absolute/config.json [--once]\n');
    process.exitCode = 1;
  } else {
    runReporter(args[args.indexOf('--config') + 1], { once: args.includes('--once') }).catch(() => {
      process.stderr.write('Reporter could not start; check configuration, credential availability and instance lock.\n');
      process.exitCode = 1;
    });
  }
}
