import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_LOG_MAX_BYTES = 1024 * 1024;

export function resolveVpsLocalHelperQueuePaths({
  queueRoot = process.env.VTDD_VPS_LOCAL_HELPER_QUEUE_DIR,
  logPath = process.env.VTDD_VPS_LOCAL_HELPER_QUEUE_LOG
} = {}) {
  const root = normalizePath(queueRoot) || path.join(os.homedir(), "vtdd-runner", "run", "vps-helper-queue");
  return {
    root,
    pendingDir: path.join(root, "pending"),
    runningDir: path.join(root, "running"),
    completedDir: path.join(root, "completed"),
    failedDir: path.join(root, "failed"),
    stateDir: path.join(root, "state"),
    logPath: normalizePath(logPath) || path.join(os.homedir(), "vtdd-runner", "logs", "vps-helper-queue.log")
  };
}

export async function enqueueVpsLocalHelperExecution({
  payload,
  queueRoot,
  logPath,
  now = () => new Date().toISOString()
} = {}) {
  const normalized = normalizeVpsLocalHelperExecutionPayload(payload);
  if (!normalized.ok) {
    return normalized;
  }
  const paths = resolveVpsLocalHelperQueuePaths({ queueRoot, logPath });
  await ensureQueueDirectories(paths);
  await pruneVpsLocalHelperQueue({ paths, now });

  const filePath = path.join(paths.pendingDir, `${normalized.payload.executionId}.json`);
  const statePath = path.join(paths.stateDir, `${normalized.payload.executionId}.json`);
  if (await fileExists(filePath)) {
    return {
      ok: true,
      status: "duplicate",
      executionId: normalized.payload.executionId,
      queueFile: filePath,
      stateFile: statePath,
      logPath: paths.logPath
    };
  }
  const queuedAt = now();
  const record = {
    ...normalized.payload,
    lifecycle: {
      status: "pending",
      queuedAt,
      updatedAt: queuedAt
    }
  };
  await writeJsonAtomic(filePath, record, 0o600);
  await writeJsonAtomic(statePath, summarizeState(record), 0o600);
  await appendVpsLocalHelperQueueLog({
    paths,
    event: "queued",
    executionId: record.executionId,
    repository: record.repository,
    issueNumber: record.issueNumber,
    dashboardThreadId: record.dashboardThreadId,
    now
  });
  return {
    ok: true,
    status: "queued",
    executionId: record.executionId,
    queueFile: filePath,
    stateFile: statePath,
    logPath: paths.logPath
  };
}

export async function claimNextVpsLocalHelperExecution({ queueRoot, logPath, now = () => new Date().toISOString() } = {}) {
  const paths = resolveVpsLocalHelperQueuePaths({ queueRoot, logPath });
  await ensureQueueDirectories(paths);
  const entries = await safeReadDir(paths.pendingDir);
  const candidates = entries
    .filter((entry) => entry.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  for (const entry of candidates) {
    const pendingPath = path.join(paths.pendingDir, entry);
    const executionId = entry.slice(0, -5);
    const runningPath = path.join(paths.runningDir, entry);
    try {
      await fs.rename(pendingPath, runningPath);
    } catch {
      continue;
    }
    const record = JSON.parse(await fs.readFile(runningPath, "utf8"));
    const runningAt = now();
    record.lifecycle = {
      ...(record.lifecycle || {}),
      status: "running",
      runningAt,
      updatedAt: runningAt
    };
    await writeJsonAtomic(runningPath, record, 0o600);
    const statePath = path.join(paths.stateDir, `${executionId}.json`);
    await writeJsonAtomic(statePath, summarizeState(record), 0o600);
    await appendVpsLocalHelperQueueLog({
      paths,
      event: "running",
      executionId,
      repository: record.repository,
      issueNumber: record.issueNumber,
      dashboardThreadId: record.dashboardThreadId,
      now
    });
    return {
      ok: true,
      executionId,
      filePath: runningPath,
      stateFile: statePath,
      logPath: paths.logPath,
      payload: record
    };
  }
  return { ok: false, reason: "no_pending_vps_local_helper_execution" };
}

export async function peekNextVpsLocalHelperExecution({ queueRoot, logPath } = {}) {
  const paths = resolveVpsLocalHelperQueuePaths({ queueRoot, logPath });
  const entries = await safeReadDir(paths.pendingDir);
  const entry = entries
    .filter((item) => item.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))[0];
  if (!entry) {
    return { ok: false, reason: "no_pending_vps_local_helper_execution" };
  }
  const payload = await readJsonFile(path.join(paths.pendingDir, entry));
  if (!payload) {
    return { ok: false, reason: "vps_local_helper_queue_payload_unreadable" };
  }
  return {
    ok: true,
    executionId: entry.slice(0, -5),
    payload
  };
}

export async function completeVpsLocalHelperExecution({
  executionId,
  status = "completed",
  result,
  queueRoot,
  logPath,
  now = () => new Date().toISOString()
} = {}) {
  const id = safeExecutionId(executionId);
  if (!id) {
    return { ok: false, reason: "executionId is required" };
  }
  const paths = resolveVpsLocalHelperQueuePaths({ queueRoot, logPath });
  await ensureQueueDirectories(paths);
  const sourcePath = path.join(paths.runningDir, `${id}.json`);
  const targetDir = status === "failed" ? paths.failedDir : paths.completedDir;
  const targetPath = path.join(targetDir, `${id}.json`);
  const record = (await readJsonFile(sourcePath)) || { executionId: id };
  const completedAt = now();
  record.lifecycle = {
    ...(record.lifecycle || {}),
    status,
    completedAt,
    updatedAt: completedAt
  };
  record.result = result || null;
  await writeJsonAtomic(sourcePath, record, 0o600);
  await fs.rename(sourcePath, targetPath).catch(async () => {
    await writeJsonAtomic(targetPath, record, 0o600);
  });
  const statePath = path.join(paths.stateDir, `${id}.json`);
  await writeJsonAtomic(statePath, summarizeState(record), 0o600);
  await appendVpsLocalHelperQueueLog({
    paths,
    event: status,
    executionId: id,
    repository: record.repository,
    issueNumber: record.issueNumber,
    dashboardThreadId: record.dashboardThreadId,
    now
  });
  return { ok: true, status, executionId: id, stateFile: statePath, logPath: paths.logPath };
}

export function normalizeVpsLocalHelperExecutionPayload(payload) {
  const input = payload && typeof payload === "object" ? payload : {};
  const executionId = safeExecutionId(input.executionId);
  const repository = normalizeRepository(input.repository);
  const issueNumber = normalizePositiveInteger(input.issueNumber);
  const dashboardThreadId = normalizeText(
    input.dashboardThreadId || input.dashboard_thread_id || input?.handoff?.dashboardThreadId
  );
  const executionEnvelope = input.executionEnvelope && typeof input.executionEnvelope === "object"
    ? input.executionEnvelope
    : null;
  const issues = [];
  if (!executionId) issues.push("executionId is required");
  if (!repository) issues.push("repository is required");
  if (!issueNumber) issues.push("issueNumber is required");
  if (input.transport !== "vps_privileged_maintenance_helper") {
    issues.push("transport must be vps_privileged_maintenance_helper");
  }
  if (input.approvalScopeMatched !== true) {
    issues.push("approvalScopeMatched must be true");
  }
  if (!executionEnvelope) {
    issues.push("executionEnvelope is required");
  }
  if (executionEnvelope?.kind !== "vps_privileged_maintenance_helper_execution_envelope") {
    issues.push("executionEnvelope.kind must be vps_privileged_maintenance_helper_execution_envelope");
  }
  if (executionEnvelope?.status !== "ready_for_vps_helper_execution") {
    issues.push("executionEnvelope.status must be ready_for_vps_helper_execution");
  }
  if (executionEnvelope?.rootExecutionStarted === true || executionEnvelope?.helperExecutionStarted === true) {
    issues.push("executionEnvelope must not have started root/helper execution before local queue claim");
  }
  if (issues.length > 0) {
    return { ok: false, status: "blocked", issues };
  }
  return {
    ok: true,
    payload: {
      executionId,
      transport: "vps_privileged_maintenance_helper",
      repository,
      issueNumber,
      dashboardThreadId,
      approvalActor: normalizeText(input.approvalActor),
      approvalScopeMatched: true,
      issueTraceability: input.issueTraceability || null,
      handoff: dashboardThreadId ? { dashboardThreadId } : null,
      executionEnvelope
    }
  };
}

async function pruneVpsLocalHelperQueue({
  paths,
  ttlMs = Number(process.env.VTDD_VPS_LOCAL_HELPER_QUEUE_TTL_MS) || DEFAULT_QUEUE_TTL_MS,
  logMaxBytes = Number(process.env.VTDD_VPS_LOCAL_HELPER_QUEUE_LOG_MAX_BYTES) || DEFAULT_LOG_MAX_BYTES,
  now = () => new Date().toISOString()
} = {}) {
  const cutoff = Date.parse(now()) - ttlMs;
  if (Number.isFinite(cutoff)) {
    for (const dir of [paths.completedDir, paths.failedDir]) {
      for (const entry of await safeReadDir(dir)) {
        const filePath = path.join(dir, entry);
        const stat = await fs.stat(filePath).catch(() => null);
        if (stat && stat.mtimeMs < cutoff) {
          await fs.rm(filePath, { force: true });
        }
      }
    }
  }
  const logStat = await fs.stat(paths.logPath).catch(() => null);
  if (logStat && logStat.size > logMaxBytes) {
    await fs.rename(paths.logPath, `${paths.logPath}.bak`).catch(() => {});
  }
}

async function appendVpsLocalHelperQueueLog({ paths, event, executionId, repository, issueNumber, dashboardThreadId, now }) {
  await fs.mkdir(path.dirname(paths.logPath), { recursive: true });
  const line = JSON.stringify({
    at: now(),
    event,
    executionId,
    repository,
    issueNumber,
    dashboardThreadId: dashboardThreadId || null
  });
  await fs.appendFile(paths.logPath, `${line}\n`, { mode: 0o600 });
}

async function ensureQueueDirectories(paths) {
  await Promise.all([
    fs.mkdir(paths.pendingDir, { recursive: true }),
    fs.mkdir(paths.runningDir, { recursive: true }),
    fs.mkdir(paths.completedDir, { recursive: true }),
    fs.mkdir(paths.failedDir, { recursive: true }),
    fs.mkdir(paths.stateDir, { recursive: true }),
    fs.mkdir(path.dirname(paths.logPath), { recursive: true })
  ]);
}

function summarizeState(record) {
  const resultSummary = summarizeResult(record.result);
  return {
    executionId: record.executionId,
    transport: record.transport,
    repository: record.repository,
    issueNumber: record.issueNumber,
    dashboardThreadId: record.dashboardThreadId || null,
    capabilityId: record.executionEnvelope?.capabilityId || null,
    status: record.lifecycle?.status || "unknown",
    queuedAt: record.lifecycle?.queuedAt || null,
    runningAt: record.lifecycle?.runningAt || null,
    completedAt: record.lifecycle?.completedAt || null,
    updatedAt: record.lifecycle?.updatedAt || null,
    result: resultSummary
  };
}

function summarizeResult(result) {
  if (!result || typeof result !== "object") {
    return null;
  }
  const runtimeTruth = result.runtimeTruth && typeof result.runtimeTruth === "object" ? result.runtimeTruth : {};
  const helperResult = result.helperResult && typeof result.helperResult === "object" ? result.helperResult : {};
  const rawFailure = result.rawFailure && typeof result.rawFailure === "object" ? result.rawFailure : {};
  const summary = {
    rootExecutionStarted: result.rootExecutionStarted === true,
    helperExecutionStarted: result.helperExecutionStarted === true,
    runtimeStatus: normalizeText(runtimeTruth.status),
    helperStatus: normalizeText(helperResult.status),
    serviceRestarted: runtimeTruth.serviceRestarted === true,
    restartVerified: runtimeTruth.restartVerified === true,
    syncVerified: runtimeTruth.syncVerified === true,
    beforeSha: normalizeText(runtimeTruth.beforeSha),
    afterSha: normalizeText(runtimeTruth.afterSha),
    targetRefSha: normalizeText(runtimeTruth.targetRefSha),
    beforeServiceMainPid: normalizeText(runtimeTruth.beforeServiceMainPid),
    afterServiceMainPid: normalizeText(runtimeTruth.afterServiceMainPid),
    beforeServiceActiveEnterTimestamp: normalizeText(runtimeTruth.beforeServiceActiveEnterTimestamp),
    afterServiceActiveEnterTimestamp: normalizeText(runtimeTruth.afterServiceActiveEnterTimestamp),
    failureReason: normalizeText(runtimeTruth.reason || rawFailure.reason)
  };
  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== "" && value !== null && value !== false)
  );
}

async function writeJsonAtomic(filePath, value, mode) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(value, null, 2), { mode });
  await fs.rename(tmpPath, filePath);
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function safeReadDir(dir) {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizePath(value) {
  const text = normalizeText(value);
  return text && path.isAbsolute(text) ? text : "";
}

function normalizeRepository(value) {
  const text = normalizeText(value);
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text) ? text : "";
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function safeExecutionId(value) {
  const text = normalizeText(value);
  return /^[A-Za-z0-9_.:-]{1,160}$/.test(text) ? text : "";
}
