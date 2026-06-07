#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const DEFAULT_SERVICE = "vtdd-dashboard-app-server-bridge-unresolved.service";
const DEFAULT_REPOSITORY = "";
const DEFAULT_THREAD_ID = "dashboard-main-unresolved";
const DEFAULT_STATE_PATH = path.join(os.homedir(), "vtdd-runner", "state", "dashboard-bridge-watchdog-state.json");
const DEFAULT_LOCK_DIR = path.join(os.homedir(), "vtdd-runner", "state", "dashboard-bridge-watchdog.lock");
const DEFAULT_HEARTBEAT_FILE = path.join(os.homedir(), "vtdd-runner", "run", "dashboard-bridge-unresolved.heartbeat.json");
const DEFAULT_LOG_PATH = path.join(os.homedir(), "vtdd-runner", "logs", "dashboard-bridge-watchdog.log");
const DEFAULT_MAX_LOG_LINES = 100;
const DEFAULT_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_GRACE_MS = 30 * 1000;
const DEFAULT_POST_RESTART_SETTLE_MS = 30 * 1000;
const DEFAULT_STALE_HEARTBEAT_MS = 90 * 1000;
const DEFAULT_LOCK_TTL_MS = 10 * 60 * 1000;
const DEFAULT_RETENTION = 50;

export function parseWatchdogArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    service: env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_SERVICE || DEFAULT_SERVICE,
    repository: env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_REPOSITORY || DEFAULT_REPOSITORY,
    issueNumber: Number(env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_ISSUE || 741),
    threadId: env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_THREAD_ID || DEFAULT_THREAD_ID,
    statePath: env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_STATE_PATH || DEFAULT_STATE_PATH,
    lockDir: env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_LOCK_DIR || DEFAULT_LOCK_DIR,
    heartbeatFile: env.VTDD_DASHBOARD_BRIDGE_HEARTBEAT_FILE || DEFAULT_HEARTBEAT_FILE,
    logPath: env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_LOG_PATH || DEFAULT_LOG_PATH,
    maxLogLines: Number(env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_MAX_LOG_LINES || DEFAULT_MAX_LOG_LINES),
    attemptWindowMs: Number(env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_ATTEMPT_WINDOW_MS || DEFAULT_ATTEMPT_WINDOW_MS),
    maxAttempts: Number(env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS),
    graceMs: Number(env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_GRACE_MS || DEFAULT_GRACE_MS),
    postRestartSettleMs: Number(env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_POST_RESTART_SETTLE_MS || DEFAULT_POST_RESTART_SETTLE_MS),
    staleHeartbeatMs: Number(env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_STALE_HEARTBEAT_MS || DEFAULT_STALE_HEARTBEAT_MS),
    lockTtlMs: Number(env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_LOCK_TTL_MS || DEFAULT_LOCK_TTL_MS),
    retention: Number(env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_RETENTION || DEFAULT_RETENTION),
    runtimeUrl: env.VTDD_RUNTIME_URL || "",
    token: env.VTDD_GATEWAY_BEARER_TOKEN || env.MVP_GATEWAY_BEARER_TOKEN || "",
    dryRun: env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_DRY_RUN === "1",
    reportHealthy: env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_REPORT_HEALTHY === "1",
    report: env.VTDD_DASHBOARD_BRIDGE_WATCHDOG_REPORT !== "0"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--service") options.service = argv[++index] || "";
    else if (arg === "--repository") options.repository = argv[++index] || "";
    else if (arg === "--issue-number") options.issueNumber = Number(argv[++index] || 741);
    else if (arg === "--thread-id") options.threadId = argv[++index] || "";
    else if (arg === "--state-path") options.statePath = argv[++index] || "";
    else if (arg === "--lock-dir") options.lockDir = argv[++index] || "";
    else if (arg === "--heartbeat-file") options.heartbeatFile = argv[++index] || "";
    else if (arg === "--log-path") options.logPath = argv[++index] || "";
    else if (arg === "--max-log-lines") options.maxLogLines = Number(argv[++index] || DEFAULT_MAX_LOG_LINES);
    else if (arg === "--attempt-window-ms") options.attemptWindowMs = Number(argv[++index] || DEFAULT_ATTEMPT_WINDOW_MS);
    else if (arg === "--max-attempts") options.maxAttempts = Number(argv[++index] || DEFAULT_MAX_ATTEMPTS);
    else if (arg === "--grace-ms") options.graceMs = Number(argv[++index] || DEFAULT_GRACE_MS);
    else if (arg === "--post-restart-settle-ms") options.postRestartSettleMs = Number(argv[++index] || DEFAULT_POST_RESTART_SETTLE_MS);
    else if (arg === "--stale-heartbeat-ms") options.staleHeartbeatMs = Number(argv[++index] || DEFAULT_STALE_HEARTBEAT_MS);
    else if (arg === "--lock-ttl-ms") options.lockTtlMs = Number(argv[++index] || DEFAULT_LOCK_TTL_MS);
    else if (arg === "--retention") options.retention = Number(argv[++index] || DEFAULT_RETENTION);
    else if (arg === "--runtime-url") options.runtimeUrl = argv[++index] || "";
    else if (arg === "--token") options.token = argv[++index] || "";
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--report-healthy") options.reportHealthy = true;
    else if (arg === "--no-report") options.report = false;
    else if (arg === "--help") options.help = true;
    else throw new Error(`unsupported argument: ${arg}`);
  }
  return options;
}

function assertSafeService(service) {
  if (service !== DEFAULT_SERVICE) {
    throw new Error(`service must be ${DEFAULT_SERVICE}`);
  }
}

function runCommand({ command, args = [], runner = spawnSync, allowFailure = false }) {
  const result = runner(command, args, {
    encoding: "utf8",
    shell: false,
    maxBuffer: 1024 * 1024
  });
  const exitCode = typeof result.status === "number" ? result.status : result.error ? 1 : 0;
  const record = {
    command,
    args,
    exitCode,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim()
  };
  if (!allowFailure && exitCode !== 0) {
    const error = new Error(`${command} ${args.join(" ")} failed with exit code ${exitCode}`);
    error.commandResult = record;
    throw error;
  }
  return record;
}

export async function runDashboardBridgeWatchdog({
  options = {},
  runner = spawnSync,
  fsImpl = fs,
  fetchImpl = globalThis.fetch,
  nowMs = () => Date.now(),
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
} = {}) {
  const resolved = {
    ...parseWatchdogArgs([], {}),
    ...options
  };
  assertSafeService(resolved.service);
  const startedAtMs = Number(nowMs());
  const startedAt = new Date(startedAtMs).toISOString();
  const lock = await acquireLock({ lockDir: resolved.lockDir, fsImpl, nowMs: startedAtMs, ttlMs: resolved.lockTtlMs });
  if (!lock.ok) {
    return finalizeResult({
      result: {
        ok: false,
        status: "locked",
        reason: lock.reason,
        service: resolved.service,
        startedAt,
        completedAt: new Date(Number(nowMs())).toISOString(),
        attemptedRestart: false
      },
      options: resolved,
      fsImpl
    });
  }

  let result;
  try {
    const before = await readBridgeHealth({
      service: resolved.service,
      heartbeatFile: resolved.heartbeatFile,
      staleHeartbeatMs: resolved.staleHeartbeatMs,
      runner,
      fsImpl,
      nowMs
    });
    if (before.healthy) {
      result = {
        ok: true,
        status: "healthy",
        service: resolved.service,
        startedAt,
        completedAt: new Date(Number(nowMs())).toISOString(),
        attemptedRestart: false,
        before,
        after: before
      };
      return await finalizeResult({ result, options: resolved, fsImpl, fetchImpl });
    }

    if (resolved.graceMs > 0) {
      await delay(resolved.graceMs);
    }
    const afterGrace = await readBridgeHealth({
      service: resolved.service,
      heartbeatFile: resolved.heartbeatFile,
      staleHeartbeatMs: resolved.staleHeartbeatMs,
      runner,
      fsImpl,
      nowMs
    });
    if (afterGrace.healthy) {
      result = {
        ok: true,
        status: "recovered_during_grace",
        service: resolved.service,
        startedAt,
        completedAt: new Date(Number(nowMs())).toISOString(),
        attemptedRestart: false,
        before,
        after: afterGrace
      };
      return await finalizeResult({ result, options: resolved, fsImpl, fetchImpl });
    }

    const state = await readWatchdogState({ statePath: resolved.statePath, fsImpl });
    const attemptBudget = evaluateAttemptBudget({
      state,
      nowMs: Number(nowMs()),
      windowMs: resolved.attemptWindowMs,
      maxAttempts: resolved.maxAttempts
    });
    if (!attemptBudget.ok) {
      result = {
        ok: false,
        status: "circuit_open",
        service: resolved.service,
        startedAt,
        completedAt: new Date(Number(nowMs())).toISOString(),
        attemptedRestart: false,
        before,
        after: afterGrace,
        reason: attemptBudget.reason,
        attemptBudget
      };
      return await finalizeResult({ result, options: resolved, fsImpl, fetchImpl });
    }

    let restart = null;
    if (!resolved.dryRun) {
      restart = runCommand({
        command: "systemctl",
        args: ["--user", "restart", resolved.service],
        runner,
        allowFailure: true
      });
    }
    if (Number(resolved.postRestartSettleMs) > 0) {
      await delay(Number(resolved.postRestartSettleMs));
    }
    const afterRestart = await readBridgeHealth({
      service: resolved.service,
      heartbeatFile: resolved.heartbeatFile,
      staleHeartbeatMs: resolved.staleHeartbeatMs,
      runner,
      fsImpl,
      nowMs
    });
    const restartSucceeded = Boolean(afterRestart.healthy);
    result = {
      ok: restartSucceeded,
      status: restartSucceeded ? "self_healed" : "restart_failed",
      service: resolved.service,
      startedAt,
      completedAt: new Date(Number(nowMs())).toISOString(),
      attemptedRestart: true,
      dryRun: Boolean(resolved.dryRun),
      before,
      after: afterRestart,
      restart,
      attemptBudget
    };
    return await finalizeResult({ result, options: resolved, fsImpl, fetchImpl });
  } finally {
    await releaseLock({ lockDir: resolved.lockDir, fsImpl });
  }
}

export async function readBridgeHealth({
  service,
  heartbeatFile,
  staleHeartbeatMs = DEFAULT_STALE_HEARTBEAT_MS,
  runner = spawnSync,
  fsImpl = fs,
  nowMs = () => Date.now()
} = {}) {
  const active = runCommand({
    command: "systemctl",
    args: ["--user", "is-active", service],
    runner,
    allowFailure: true
  }).stdout;
  const show = runCommand({
    command: "systemctl",
    args: ["--user", "show", service, "--property=ActiveState,SubState,MainPID,ExecMainPID,ExecMainStatus,ActiveEnterTimestamp"],
    runner,
    allowFailure: true
  }).stdout;
  const properties = Object.fromEntries(
    show
      .split("\n")
      .map((line) => line.split("="))
      .filter((parts) => parts.length === 2)
  );
  const activeState = properties.ActiveState || active || "";
  const subState = properties.SubState || "";
  const mainPid = properties.MainPID || properties.ExecMainPID || "";
  const heartbeat = await readHeartbeat({ heartbeatFile, fsImpl, nowMs, staleHeartbeatMs, expectedPid: mainPid });
  const processHealthy = activeState === "active" && subState === "running" && Boolean(mainPid) && mainPid !== "0";
  const heartbeatHealthy = heartbeat.status === "fresh" || heartbeat.status === "disabled";
  const healthy = processHealthy && heartbeatHealthy;
  return {
    healthy,
    active,
    activeState,
    subState,
    mainPid,
    execMainStatus: properties.ExecMainStatus || "",
    activeEnterTimestamp: properties.ActiveEnterTimestamp || "",
    heartbeat,
    reason: healthy ? "bridge process and heartbeat are healthy" : buildHealthReason({ processHealthy, heartbeat })
  };
}

export async function readHeartbeat({
  heartbeatFile = "",
  fsImpl = fs,
  nowMs = () => Date.now(),
  staleHeartbeatMs = DEFAULT_STALE_HEARTBEAT_MS,
  expectedPid = ""
} = {}) {
  if (!heartbeatFile) {
    return { status: "disabled" };
  }
  try {
    const stat = await fsImpl.stat(heartbeatFile);
    const ageMs = Math.max(0, Number(nowMs()) - Number(stat.mtimeMs || 0));
    const staleMs = Math.max(1, Number(staleHeartbeatMs) || DEFAULT_STALE_HEARTBEAT_MS);
    const payload = await readHeartbeatPayload({ heartbeatFile, fsImpl });
    const payloadStatus = normalizeWatchdogText(payload?.status);
    const payloadPid = normalizeWatchdogText(payload?.pid);
    const pidMatches = !expectedPid || !payloadPid || payloadPid === normalizeWatchdogText(expectedPid);
    const pongConfirmed = payloadStatus === "pong_received";
    const freshByTime = ageMs <= staleMs;
    return {
      status: freshByTime && pongConfirmed && pidMatches ? "fresh" : "stale",
      path: heartbeatFile,
      mtimeMs: Number(stat.mtimeMs || 0),
      ageMs,
      staleHeartbeatMs: staleMs,
      payloadStatus,
      payloadPid,
      expectedPid: normalizeWatchdogText(expectedPid),
      pongConfirmed,
      pidMatches
    };
  } catch {
    return {
      status: "missing",
      path: heartbeatFile,
      ageMs: null
    };
  }
}

async function readHeartbeatPayload({ heartbeatFile, fsImpl = fs } = {}) {
  try {
    return JSON.parse(await fsImpl.readFile(heartbeatFile, "utf8"));
  } catch {
    return null;
  }
}

function buildHealthReason({ processHealthy, heartbeat }) {
  if (!processHealthy) return "systemd service is not active/running";
  if (heartbeat?.status === "missing") return "bridge heartbeat file is missing";
  if (heartbeat?.pongConfirmed === false) return "bridge heartbeat is not pong-confirmed";
  if (heartbeat?.pidMatches === false) return "bridge heartbeat pid does not match systemd MainPID";
  if (heartbeat?.status === "stale") return "bridge heartbeat is stale";
  return "bridge heartbeat is unavailable";
}

export function evaluateAttemptBudget({ state = {}, nowMs = Date.now(), windowMs = DEFAULT_ATTEMPT_WINDOW_MS, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
  const attempts = Array.isArray(state.attempts) ? state.attempts : [];
  const windowStart = Number(nowMs) - Math.max(1, Number(windowMs) || DEFAULT_ATTEMPT_WINDOW_MS);
  const attemptsInWindow = attempts.filter((attempt) => Number(attempt.attemptedAtMs || 0) >= windowStart);
  if (attemptsInWindow.length >= Math.max(1, Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS)) {
    return {
      ok: false,
      reason: "bridge watchdog retry budget exceeded",
      attemptsInWindow: attemptsInWindow.length,
      maxAttempts,
      windowMs
    };
  }
  return {
    ok: true,
    attemptsInWindow: attemptsInWindow.length,
    maxAttempts,
    windowMs
  };
}

async function readWatchdogState({ statePath, fsImpl = fs } = {}) {
  try {
    return JSON.parse(await fsImpl.readFile(statePath, "utf8"));
  } catch {
    return { attempts: [], events: [] };
  }
}

async function writeWatchdogState({ statePath, state, fsImpl = fs } = {}) {
  if (!statePath) return false;
  await fsImpl.mkdir(path.dirname(statePath), { recursive: true });
  await fsImpl.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return true;
}

async function finalizeResult({ result, options, fsImpl = fs, fetchImpl = globalThis.fetch } = {}) {
  const state = await readWatchdogState({ statePath: options.statePath, fsImpl });
  const attemptedAtMs = Date.parse(result.startedAt) || Date.now();
  const nextState = {
    ...state,
    attempts: [
      ...(Array.isArray(state.attempts) ? state.attempts : []),
      ...(result.attemptedRestart ? [{ attemptedAt: result.startedAt, attemptedAtMs, status: result.status }] : [])
    ].slice(-Math.max(1, Number(options.retention) || DEFAULT_RETENTION)),
    events: [
      ...(Array.isArray(state.events) ? state.events : []),
      {
        at: result.completedAt,
        status: result.status,
        service: result.service,
        attemptedRestart: result.attemptedRestart,
        beforeMainPid: result.before?.mainPid || "",
        afterMainPid: result.after?.mainPid || ""
      }
    ].slice(-Math.max(1, Number(options.retention) || DEFAULT_RETENTION))
  };
  await writeWatchdogState({ statePath: options.statePath, state: nextState, fsImpl });
  await writeBoundedWatchdogLog({ logPath: options.logPath, result, fsImpl, maxLogLines: options.maxLogLines });
  const report = await postWatchdogReport({ options, result, fetchImpl });
  return {
    ...result,
    report
  };
}

export async function writeBoundedWatchdogLog({ logPath, result, fsImpl = fs, maxLogLines = DEFAULT_MAX_LOG_LINES } = {}) {
  if (!logPath) return false;
  await fsImpl.mkdir(path.dirname(logPath), { recursive: true });
  let existing = "";
  try {
    existing = await fsImpl.readFile(logPath, "utf8");
  } catch {}
  const nextLines = [
    ...String(existing || "")
      .split("\n")
      .filter(Boolean),
    JSON.stringify(redactResultForLog(result))
  ].slice(-Math.max(1, Number(maxLogLines) || DEFAULT_MAX_LOG_LINES));
  await fsImpl.writeFile(logPath, `${nextLines.join("\n")}\n`, "utf8");
  return true;
}

function redactResultForLog(result = {}) {
  return {
    ok: result.ok,
    status: result.status,
    service: result.service,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    attemptedRestart: result.attemptedRestart,
    before: summarizeHealth(result.before),
    after: summarizeHealth(result.after),
    reason: result.reason || result.before?.reason || ""
  };
}

function summarizeHealth(health = null) {
  if (!health) return null;
  return {
    healthy: health.healthy,
    activeState: health.activeState,
    subState: health.subState,
    mainPid: health.mainPid,
    activeEnterTimestamp: health.activeEnterTimestamp,
    heartbeat: health.heartbeat
      ? {
          status: health.heartbeat.status,
          ageMs: health.heartbeat.ageMs ?? null
        }
      : null
  };
}

export function buildWatchdogVpsRunnerEvent({ options = {}, result = {} } = {}) {
  const status = result.status === "self_healed" || result.status === "healthy" || result.status === "recovered_during_grace"
    ? "completed"
    : result.status === "locked"
      ? "queued"
      : "failed";
  return {
    repository: options.repository || DEFAULT_REPOSITORY,
    executionId: `dashboard-bridge-watchdog-${safeIdentifier(result.startedAt || new Date().toISOString())}`,
    threadId: options.threadId || DEFAULT_THREAD_ID,
    issueNumber: Number(options.issueNumber || 741),
    status,
    currentStep: "dashboard_bridge_watchdog",
    lastEvent: result.status || "unknown",
    branch: "",
    progressUrl: "/dashboard/notifications?focus=vps-runner",
    message: buildWatchdogReportMessage(result),
    updatedAt: result.completedAt || new Date().toISOString()
  };
}

function buildWatchdogReportMessage(result = {}) {
  const lines = [
    "Dashboard app-server bridge watchdog report.",
    `status: ${result.status || "unknown"}`,
    `service: ${result.service || DEFAULT_SERVICE}`,
    `attemptedRestart: ${Boolean(result.attemptedRestart)}`,
    `beforeMainPID: ${result.before?.mainPid || "unknown"}`,
    `afterMainPID: ${result.after?.mainPid || "unknown"}`,
    `beforeActive: ${result.before?.activeState || result.before?.active || "unknown"}/${result.before?.subState || "unknown"}`,
    `afterActive: ${result.after?.activeState || result.after?.active || "unknown"}/${result.after?.subState || "unknown"}`,
    `heartbeat: ${result.after?.heartbeat?.status || result.before?.heartbeat?.status || "unknown"}`,
    result.status === "self_healed"
      ? "VPS watchdog が bounded restart を実行し、現在は復旧しています。"
      : result.status === "circuit_open"
        ? "retry budget を超えたため自動復旧を停止しました。緊急 blocked として確認が必要です。"
        : "VPS watchdog が bridge 状態を確認しました。"
  ];
  return lines.join("\n");
}

async function postWatchdogReport({ options = {}, result = {}, fetchImpl = globalThis.fetch } = {}) {
  if (options.report === false) return { ok: false, status: "skipped" };
  if (result.status === "healthy" && !options.reportHealthy) {
    return { ok: false, status: "skipped_healthy" };
  }
  if (!options.runtimeUrl || !options.token || !options.repository || typeof fetchImpl !== "function") {
    return {
      ok: false,
      status: "unconfigured",
      reason: "runtimeUrl, token, repository, or fetch is unavailable"
    };
  }
  try {
    const url = new URL("/v2/events/vps-runner", options.runtimeUrl);
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.token}`
      },
      body: JSON.stringify(buildWatchdogVpsRunnerEvent({ options, result }))
    });
    return {
      ok: response.ok,
      status: response.status
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      reason: error instanceof Error ? error.message : "failed to post watchdog report"
    };
  }
}

async function acquireLock({ lockDir, fsImpl = fs, nowMs = Date.now(), ttlMs = DEFAULT_LOCK_TTL_MS } = {}) {
  if (!lockDir) return { ok: true };
  try {
    await fsImpl.mkdir(path.dirname(lockDir), { recursive: true });
    await fsImpl.mkdir(lockDir, { recursive: false });
    await fsImpl.writeFile(path.join(lockDir, "lock.json"), `${JSON.stringify({ pid: process.pid, createdAt: new Date(Number(nowMs)).toISOString() })}\n`, "utf8");
    return { ok: true };
  } catch (error) {
    if (error?.code && error.code !== "EEXIST") {
      throw error;
    }
    const stale = await isStaleLock({ lockDir, fsImpl, nowMs, ttlMs });
    if (stale) {
      await fsImpl.rm(lockDir, { recursive: true, force: true });
      await fsImpl.mkdir(lockDir, { recursive: false });
      await fsImpl.writeFile(path.join(lockDir, "lock.json"), `${JSON.stringify({ pid: process.pid, createdAt: new Date(Number(nowMs)).toISOString(), recoveredStaleLock: true })}\n`, "utf8");
      return { ok: true, recoveredStaleLock: true };
    }
    return {
      ok: false,
      reason: "bridge watchdog lock is already held"
    };
  }
}

async function isStaleLock({ lockDir, fsImpl = fs, nowMs = Date.now(), ttlMs = DEFAULT_LOCK_TTL_MS } = {}) {
  try {
    const stat = await fsImpl.stat(path.join(lockDir, "lock.json"));
    const ageMs = Math.max(0, Number(nowMs) - Number(stat.mtimeMs || 0));
    return ageMs > Math.max(1, Number(ttlMs) || DEFAULT_LOCK_TTL_MS);
  } catch {
    try {
      const stat = await fsImpl.stat(lockDir);
      const ageMs = Math.max(0, Number(nowMs) - Number(stat.mtimeMs || 0));
      return ageMs > Math.max(1, Number(ttlMs) || DEFAULT_LOCK_TTL_MS);
    } catch {
      return false;
    }
  }
}

async function releaseLock({ lockDir, fsImpl = fs } = {}) {
  if (!lockDir) return false;
  try {
    await fsImpl.rm(lockDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function safeIdentifier(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "watchdog";
}

function normalizeWatchdogText(value) {
  return String(value ?? "").trim();
}

async function main() {
  const options = parseWatchdogArgs();
  if (options.help) {
    process.stdout.write("Usage: node scripts/watch-dashboard-app-server-bridge.mjs [--dry-run] [--no-report]\n");
    return;
  }
  const result = await runDashboardBridgeWatchdog({ options });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}
