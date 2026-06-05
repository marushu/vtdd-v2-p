#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import {
  buildDashboardAppServerUsageCostBoundary,
  normalizeDashboardAppServerUsageProfile
} from "../src/core/dashboard-app-server-usage-profile.js";

const DEFAULT_SCHEMA = "vtdd.dashboard.app_server_bridge.v1";
const DANGER_FULL_ACCESS_SANDBOX = "danger-full-access";
const APP_SERVER_FAILURE_ALREADY_SENT = Symbol("appServerFailureAlreadySent");
const DEFAULT_APP_SERVER_ERROR_TEXT =
  "codex app-server が応答生成中に失敗しました。入力は Dashboard thread に保存済みです。同じ thread で補足するか、内容を短くしてもう一度送れます。";
const MEDIA_APP_SERVER_ERROR_TEXT =
  "codex app-server が応答生成中に失敗しました。入力と添付情報は Dashboard thread に保存済みです。添付画像の取得または解析で失敗した可能性があります。画像なしで要点を短く説明して再送するか、画像を添付し直してください。";
const APP_SERVER_TURN_TIMEOUT_TEXT =
  "codex app-server の応答確認が長引いています。入力と文脈は Dashboard thread に保存済みです。再接続と状態確認を続けています。同じ thread で補足やキャンセル指示を送れます。遅れて返信が届いた場合は、この thread に追加します。";
const APP_SERVER_TURN_QUIET_TEXT =
  "接続と実行状態を確認中です。入力と文脈は保持しています。";
const DASHBOARD_MEDIA_TMP_DIR = "vtdd-dashboard-media";
const DEFAULT_TURN_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_ACTIVITY_QUIET_MS = 90 * 1000;
const DEFAULT_LIVE_PROGRESS_INITIAL_DELAY_MS = 30 * 1000;
const DEFAULT_LIVE_PROGRESS_INTERVAL_MS = 60 * 1000;
const DEBUG_SLOW_TURN_DEFAULT_SECONDS = 150;
const DEBUG_SLOW_TURN_MIN_SECONDS = 10;
const DEBUG_SLOW_TURN_MAX_SECONDS = 10 * 60;
const DEBUG_SLOW_TURN_PROGRESS_INTERVAL_MS = 30 * 1000;
const DEFAULT_REPO_SYNC_BASE_REF = "main";
const KNOWN_BRIDGE_UNTRACKED_ARTIFACT_PREFIXES = [".tmp/", "test-results/"];

export function buildAppServerInitializeRequest(id = 1) {
  return {
    method: "initialize",
    id,
    params: {
      clientInfo: {
        name: "vtdd-dashboard-bridge",
        title: "VTDD Dashboard Bridge",
        version: "0.1.0"
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false
      }
    }
  };
}

export function buildAppServerThreadStartRequest({ id, cwd = process.cwd(), developerInstructions = "", sandboxMode = "" } = {}) {
  const sandbox = buildAppServerSandboxOverrides(sandboxMode);
  return {
    method: "thread/start",
    id,
    params: {
      cwd,
      approvalPolicy: "on-request",
      developerInstructions:
        developerInstructions ||
        [
          "You are backing VTDD Dashboard Butler.",
          "Treat ordinary messages as conversation unless the owner asks for repository, Issue, PR, deploy, credential, or permission work.",
          "For traffic-control requests, read durable Issue/PR/runtime truth first, separate blockers from next actions, and do not claim VTDD completion without Butler-facing evidence.",
          "While working through Dashboard Butler, emit concise Japanese progress narration as the work advances. Do not rely on abstract-only text such as 考えています or コマンドを実行しています. Name the concrete file, command, PR, reviewer state, merge state, deploy state, blocker, or next verification when known.",
          "For long work, prefer short sequential progress lines like: ファイルの修正・変更が完了しました。現在コミット中です。 / PR を作成しています。このままレビュアーを待ちます。 / レビュアーの指摘が入りました。妥当なので修正を当てます。 / レビュアーチェックがパスしました。オートマージが走るのを確認しています。 / マージされました。今回はデプロイが必要です。ここにデプロイURL。",
          "Keep progress narration readable. Use sentence breaks and short paragraphs; avoid one long paragraph of accumulated work.",
          "High-risk work requires explicit GO or passkey approval through VTDD runtime boundaries.",
          "Reply in Japanese by default."
        ].join("\n"),
      threadSource: "user",
      ...(sandbox.threadSandbox ? { sandbox: sandbox.threadSandbox } : {}),
      experimentalRawEvents: false,
      persistExtendedHistory: false
    }
  };
}

export function buildAppServerThreadResumeRequest({ id, codexThreadId, cwd = process.cwd(), sandboxMode = "" } = {}) {
  const sandbox = buildAppServerSandboxOverrides(sandboxMode);
  return {
    method: "thread/resume",
    id,
    params: {
      threadId: codexThreadId,
      cwd,
      approvalPolicy: "on-request",
      ...(sandbox.threadSandbox ? { sandbox: sandbox.threadSandbox } : {}),
      excludeTurns: true,
      persistExtendedHistory: false
    }
  };
}

export function buildAppServerTurnStartRequest({ id, codexThreadId, text, cwd = process.cwd(), sandboxMode = "" } = {}) {
  const sandbox = buildAppServerSandboxOverrides(sandboxMode);
  return {
    method: "turn/start",
    id,
    params: {
      threadId: codexThreadId,
      input: [
        {
          type: "text",
          text,
          text_elements: []
        }
      ],
      cwd,
      approvalPolicy: "on-request",
      ...(sandbox.turnSandboxPolicy ? { sandboxPolicy: sandbox.turnSandboxPolicy } : {})
    }
  };
}

export function buildDashboardAppServerCostBoundary({
  profile = "",
  model = "",
  reasoningEffort = ""
} = {}) {
  const normalizedProfile = normalizeBridgeText(profile) || "default";
  const normalizedModel = normalizeBridgeText(model);
  const normalizedReasoningEffort = normalizeBridgeText(reasoningEffort);
  return {
    profile: normalizedProfile,
    codexWillStart: true,
    appServerBridgeRequired: true,
    modelConfigured: Boolean(normalizedModel),
    reasoningEffortConfigured: Boolean(normalizedReasoningEffort),
    ...(normalizedModel ? { model: normalizedModel } : {}),
    ...(normalizedReasoningEffort ? { reasoningEffort: normalizedReasoningEffort } : {})
  };
}

export function buildDashboardAppServerUsageProfileCommandConfig({
  usageProfile = null,
  defaultProfile = "",
  defaultModel = "",
  defaultReasoningEffort = "",
  ignoreDefaultModel = false
} = {}) {
  const normalizedUsageProfile = normalizeDashboardAppServerUsageProfile(usageProfile || defaultProfile || "conversation");
  const model = normalizeBridgeText(normalizedUsageProfile.model || (ignoreDefaultModel ? "" : defaultModel));
  const reasoningEffort = normalizeBridgeText(normalizedUsageProfile.reasoningEffort || defaultReasoningEffort);
  const profile = normalizeBridgeText(normalizedUsageProfile.profile || defaultProfile) || "conversation";
  return {
    usageProfile: {
      ...normalizedUsageProfile,
      profile,
      ...(model ? { model } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {})
    },
    costBoundary: buildDashboardAppServerUsageCostBoundary({
      ...normalizedUsageProfile,
      profile,
      ...(model ? { model } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {})
    }),
    args: buildDashboardAppServerCommandArgs({
      model,
      reasoningEffort
    })
  };
}

export function buildDashboardAppServerCommandArgs({
  listen = "stdio://",
  model = "",
  reasoningEffort = ""
} = {}) {
  const args = ["app-server", "--listen", normalizeBridgeText(listen) || "stdio://"];
  const normalizedModel = normalizeBridgeText(model);
  const normalizedReasoningEffort = normalizeBridgeText(reasoningEffort);
  if (normalizedModel) {
    args.push("-c", `model=${JSON.stringify(normalizedModel)}`);
  }
  if (normalizedReasoningEffort) {
    args.push("-c", `model_reasoning_effort=${JSON.stringify(normalizedReasoningEffort)}`);
  }
  return args;
}

function parseDashboardAppServerErrorPayload(value) {
  if (!value || typeof value !== "string") {
    return value;
  }
  const text = normalizeBridgeText(value);
  if (!text || !/^[{[]/.test(text)) {
    return value;
  }
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function collectDashboardAppServerErrorMessages(value, seen = new Set()) {
  const parsed = parseDashboardAppServerErrorPayload(value);
  if (!parsed || seen.has(parsed)) {
    return [];
  }
  if (typeof parsed === "object") {
    seen.add(parsed);
  }
  if (typeof parsed === "string") {
    return [parsed];
  }
  if (parsed instanceof Error) {
    return [parsed.message, ...collectDashboardAppServerErrorMessages(parsed.cause, seen)];
  }
  if (typeof parsed !== "object") {
    return [];
  }
  const messages = [];
  for (const key of ["message", "reason", "detail", "text"]) {
    if (typeof parsed[key] === "string") {
      messages.push(parsed[key]);
    }
  }
  for (const key of ["error", "cause"]) {
    messages.push(...collectDashboardAppServerErrorMessages(parsed[key], seen));
  }
  return messages;
}

export function isDashboardAppServerUnsupportedChatGptAccountModelError(errorLike = null) {
  const messages = collectDashboardAppServerErrorMessages(errorLike);
  return messages.some((message) =>
    /\bmodel\b.*\bnot supported\b.*\bCodex\b.*\bChatGPT account\b/i.test(normalizeBridgeText(message))
  );
}

export function extractDashboardAppServerUnsupportedModel(errorLike = null) {
  const messages = collectDashboardAppServerErrorMessages(errorLike);
  for (const message of messages) {
    const normalized = normalizeBridgeText(message);
    const quoted = normalized.match(/['"`]([a-z0-9][a-z0-9._-]*codex[a-z0-9._-]*)['"`]\s+model\s+is\s+not\s+supported/i);
    if (quoted?.[1]) {
      return quoted[1];
    }
    const generic = normalized.match(/\b([a-z0-9][a-z0-9._-]*codex[a-z0-9._-]*)\b.*\bnot supported\b/i);
    if (generic?.[1]) {
      return generic[1];
    }
  }
  return "";
}

export function stripDashboardAppServerModelFromUsageProfile(usageProfile = null) {
  const normalized = normalizeDashboardAppServerUsageProfile(usageProfile || "conversation");
  const { model: _model, ...withoutModel } = normalized;
  return withoutModel;
}

export function buildDashboardTurnInputText(request = {}) {
  const ownerText = String(request.text || "").trim();
  const repository = String(request.repository || "").trim();
  const relatedIssue = request.relatedIssue || request.issueNumber || "";
  const authority = request.authority && typeof request.authority === "object" ? request.authority : null;
  const trafficControl =
    request.trafficControl && typeof request.trafficControl === "object"
      ? request.trafficControl
      : null;
  const vpsMaintenancePassThrough =
    request.vpsMaintenancePassThrough && typeof request.vpsMaintenancePassThrough === "object"
      ? request.vpsMaintenancePassThrough
      : null;
  const usageProfile =
    request.usageProfile && typeof request.usageProfile === "object"
      ? normalizeDashboardAppServerUsageProfile(request.usageProfile)
      : null;
  const costBoundary = request.costBoundary && typeof request.costBoundary === "object" ? request.costBoundary : null;
  const mediaReferences = Array.isArray(request.mediaReferences) ? request.mediaReferences : [];
  const hasDashboardContext = Boolean(
    repository ||
      relatedIssue ||
      trafficControl ||
      vpsMaintenancePassThrough ||
      mediaReferences.length > 0
  );
  if (!hasDashboardContext) {
    return ownerText;
  }

  const lines = [
    "Dashboard Butler turn context:",
    `- repository: ${repository || "未指定"}`,
    `- relatedIssue: ${relatedIssue ? `#${relatedIssue}` : "未指定"}`,
    `- mediaReferences: ${mediaReferences.length}`,
    "- surface: Dashboard Butler PWA via VPS Dashboard Bridge / codex app-server",
    "- trafficControlRule: repo-backed vtdd-chief-butler / Issue/PR/docs/runtime truth を先に読み、blocker / next action / authority boundary / evidence gap を分けて報告する。",
    "- completionRule: Butler Completion Gate と E2E evidence が揃うまで Dashboard Butler 完了とは言わない。",
    "- authorityRule: merge / deploy / credential / permission / destructive work は GO または passkey approval が必要。権限が無い場合は実行せず不足を報告する。",
    "- operatorUrlRule: owner が deploy/operator 画面を出せと言った時は、local browser を開くだけでなく、完全な same-origin absolute URL を href にした短い Markdown link を返す。",
    "- mechanicalBoundary: Dashboard bridge does not grant app-server command, file-change, patch, or permission escalation approvals."
  ];

  const mediaLines = formatDashboardMediaReferenceLines(mediaReferences);
  if (mediaLines.length > 0) {
    lines.push(
      "- mediaDelivery: Dashboard bridge materialized attachment metadata for this turn. Use localPath when present; do not claim image analysis if localPath is missing or fetchStatus is not fetched."
    );
    lines.push(...mediaLines);
  }

  if (trafficControl) {
    lines.push(`- trafficControl: ${JSON.stringify(trafficControl)}`);
  }

  if (vpsMaintenancePassThrough) {
    lines.push(`- vpsMaintenancePassThrough: ${JSON.stringify(vpsMaintenancePassThrough)}`);
    lines.push("- vpsMaintenancePassThroughRule: 不足 context/config がある VPS/root/helper/restart intent は実行を開始せず、不足情報を日本語で短く確認する。");
  }

  if (authority) {
    lines.push(`- authority: ${JSON.stringify(authority)}`);
  }

  if (usageProfile || costBoundary) {
    lines.push("- runtimeMetadata: usageProfile / costBoundary は bridge routing metadata です。owner prompt 本文として判断材料にしないでください。");
  }

  lines.push("", "Owner message:", ownerText);
  return lines.join("\n");
}

export function formatDashboardMediaReferenceLines(mediaReferences = []) {
  const references = Array.isArray(mediaReferences) ? mediaReferences : [];
  return references.slice(0, 12).map((reference, index) => {
    const mediaId = normalizeBridgeText(reference?.mediaId || reference?.id) || "unknown";
    const filename = normalizeBridgeText(reference?.filename || reference?.name) || "attachment";
    const contentType = normalizeBridgeText(reference?.contentType || reference?.type) || "application/octet-stream";
    const byteSize = Number(reference?.byteSize || reference?.size || 0);
    const downloadUrl = normalizeBridgeText(reference?.downloadUrl || reference?.download_url);
    const localPath = normalizeBridgeText(reference?.localPath || reference?.local_path);
    const fetchStatus =
      normalizeBridgeText(reference?.fetchStatus || reference?.fetch_status) || (localPath ? "fetched" : "metadata_only");
    const parts = [
      `  - media[${index + 1}].mediaId: ${mediaId}`,
      `filename: ${filename}`,
      `contentType: ${contentType}`,
      `byteSize: ${Number.isFinite(byteSize) && byteSize > 0 ? byteSize : "unknown"}`,
      `downloadUrl: ${downloadUrl || "unavailable"}`,
      `fetchStatus: ${fetchStatus}`
    ];
    if (localPath) {
      parts.push(`localPath: ${localPath}`);
    }
    const fetchError = normalizeBridgeText(reference?.fetchError || reference?.fetch_error);
    if (fetchError) {
      parts.push(`fetchError: ${fetchError}`);
    }
    return parts.join("; ");
  });
}

export async function materializeDashboardMediaReferences({
  mediaReferences = [],
  runtimeUrl = "",
  token = "",
  fetchImpl = globalThis.fetch,
  tmpRoot = os.tmpdir()
} = {}) {
  const references = Array.isArray(mediaReferences) ? mediaReferences : [];
  if (references.length === 0) {
    return [];
  }
  return Promise.all(
    references
      .slice(0, 12)
      .map((reference) => materializeDashboardMediaReference({ reference, runtimeUrl, token, fetchImpl, tmpRoot }))
  );
}

export function buildVpsRunnerWakeupCommand() {
  return {
    command: "systemctl",
    args: ["--user", "start", "vtdd-vps-runner.service"],
    shell: false
  };
}

export async function executeVpsRunnerWakeup({
  request = {},
  spawnImpl = spawn,
  now = () => new Date().toISOString()
} = {}) {
  const command = buildVpsRunnerWakeupCommand();
  const startedAt = now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let child;
    try {
      child = spawnImpl(command.command, command.args, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      resolve({
        type: "runner_wakeup_result",
        schema: DEFAULT_SCHEMA,
        threadId: normalizeBridgeText(request.threadId),
        requestId: normalizeBridgeText(request.requestId),
        executionId: normalizeBridgeText(request.executionId),
        status: "failed",
        attempted: true,
        fallback: "vtdd-vps-runner.timer",
        command,
        startedAt,
        completedAt: now(),
        exitCode: null,
        reason: normalizeBridgeText(error?.message || "failed to start vtdd-vps-runner.service").slice(0, 240)
      });
      return;
    }
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("error", (error) => {
      resolve({
        type: "runner_wakeup_result",
        schema: DEFAULT_SCHEMA,
        threadId: normalizeBridgeText(request.threadId),
        requestId: normalizeBridgeText(request.requestId),
        executionId: normalizeBridgeText(request.executionId),
        status: "failed",
        attempted: true,
        fallback: "vtdd-vps-runner.timer",
        command,
        startedAt,
        completedAt: now(),
        exitCode: null,
        reason: normalizeBridgeText(error?.message || "failed to start vtdd-vps-runner.service").slice(0, 240)
      });
    });
    child.on("close", (exitCode) => {
      const normalizedExitCode = Number.isInteger(exitCode) ? exitCode : null;
      const reason = normalizeBridgeText(stderr || stdout);
      resolve({
        type: "runner_wakeup_result",
        schema: DEFAULT_SCHEMA,
        threadId: normalizeBridgeText(request.threadId),
        requestId: normalizeBridgeText(request.requestId),
        executionId: normalizeBridgeText(request.executionId),
        repository: normalizeBridgeText(request.repository),
        issueNumber: Number(request.issueNumber || 0) || null,
        queueCommentUrl: normalizeBridgeText(request.queueCommentUrl),
        status: normalizedExitCode === 0 ? "started" : "failed",
        attempted: true,
        fallback: "vtdd-vps-runner.timer",
        command,
        startedAt,
        completedAt: now(),
        exitCode: normalizedExitCode,
        reason: reason ? reason.slice(0, 240) : null
      });
    });
  });
}

async function materializeDashboardMediaReference({ reference, runtimeUrl, token, fetchImpl, tmpRoot }) {
  const normalized = normalizeDashboardMediaReferenceForBridge(reference);
  if (!normalized.mediaId) {
    return {
      ...normalized,
      fetchStatus: "metadata_invalid",
      fetchError: "mediaId is missing"
    };
  }
  if (!runtimeUrl || !token || !normalized.downloadUrl || typeof fetchImpl !== "function") {
    return {
      ...normalized,
      fetchStatus: "metadata_only",
      fetchError: "runtimeUrl, token, downloadUrl, or fetch is unavailable"
    };
  }
  let url;
  try {
    url = new URL(normalized.downloadUrl, runtimeUrl);
  } catch {
    return {
      ...normalized,
      fetchStatus: "fetch_failed",
      fetchError: "downloadUrl is invalid"
    };
  }
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: normalized.contentType || "application/octet-stream",
        authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      return {
        ...normalized,
        fetchStatus: "fetch_failed",
        fetchError: `media download failed with HTTP ${response.status}`
      };
    }
    const arrayBuffer = await response.arrayBuffer();
    const byteSize = Number(arrayBuffer.byteLength || 0);
    if (byteSize <= 0) {
      return {
        ...normalized,
        fetchStatus: "fetch_failed",
        fetchError: "media download returned an empty body"
      };
    }
    const directory = path.join(tmpRoot, DASHBOARD_MEDIA_TMP_DIR);
    await fs.mkdir(directory, { recursive: true });
    const localPath = path.join(
      directory,
      `${sanitizeBridgeFilename(normalized.mediaId)}-${sanitizeBridgeFilename(normalized.filename || "attachment")}`
    );
    await fs.writeFile(localPath, Buffer.from(arrayBuffer));
    return {
      ...normalized,
      byteSize: normalized.byteSize || byteSize,
      localPath,
      fetchStatus: "fetched"
    };
  } catch (error) {
    return {
      ...normalized,
      fetchStatus: "fetch_failed",
      fetchError: sanitizeBridgeError(error)
    };
  }
}

function normalizeDashboardMediaReferenceForBridge(reference) {
  const input = reference && typeof reference === "object" ? reference : {};
  const mediaId = normalizeBridgeText(input.mediaId || input.id);
  return {
    mediaId,
    filename: normalizeBridgeText(input.filename || input.name) || "attachment",
    contentType: normalizeBridgeText(input.contentType || input.type) || "application/octet-stream",
    byteSize: Number(input.byteSize || input.size || 0) || 0,
    downloadUrl: normalizeBridgeText(input.downloadUrl || input.download_url || (mediaId ? `/v2/media/${mediaId}/download` : "")),
    metadataUrl: normalizeBridgeText(input.metadataUrl || input.metadata_url || (mediaId ? `/v2/media/${mediaId}` : "")),
    repository: normalizeBridgeText(input.repository),
    relatedIssue: Number(input.relatedIssue || input.issueNumber || input.related_issue) || null
  };
}

function normalizeBridgeText(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 500);
}

function normalizeBridgeRepository(value) {
  const text = normalizeBridgeText(value).toLowerCase();
  return /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(text) ? text : "";
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function sanitizeBridgeActionId(value) {
  return normalizeBridgeText(value)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sanitizeBridgeFilename(value) {
  return (
    normalizeBridgeText(value)
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "attachment"
  );
}

function sanitizeBridgeError(error) {
  return normalizeBridgeText(error?.message || error || "media fetch failed").slice(0, 240);
}

function sanitizeOptionalBridgeError(error) {
  return normalizeBridgeText(error?.message || error || "").slice(0, 240);
}

export function buildAppServerSandboxOverrides(sandboxMode = "") {
  const normalized = String(sandboxMode || "").trim().toLowerCase();
  if (!normalized) {
    return {};
  }
  if (normalized !== DANGER_FULL_ACCESS_SANDBOX) {
    throw new Error(`unsupported dashboard app-server sandbox mode: ${sandboxMode}`);
  }
  return {
    threadSandbox: DANGER_FULL_ACCESS_SANDBOX,
    turnSandboxPolicy: {
      type: "dangerFullAccess"
    }
  };
}

export function buildAppServerRequestApprovalResponse(message) {
  const method = String(message?.method || "");
  if ((message?.id === undefined || message?.id === null) || !method) {
    return null;
  }
  if (method === "item/commandExecution/requestApproval") {
    return {
      id: message.id,
      result: {
        decision: "decline"
      }
    };
  }
  if (method === "execCommandApproval") {
    return {
      id: message.id,
      result: {
        decision: "denied"
      }
    };
  }
  if (method === "item/fileChange/requestApproval") {
    return {
      id: message.id,
      result: {
        decision: "decline"
      }
    };
  }
  if (method === "applyPatchApproval") {
    return {
      id: message.id,
      result: {
        decision: "denied"
      }
    };
  }
  if (method === "item/permissions/requestApproval") {
    return {
      id: message.id,
      error: {
        code: -32001,
        message: "Dashboard bridge does not grant app-server permission escalation"
      }
    };
  }
  return {
    id: message.id,
    error: {
      code: -32601,
      message: `Dashboard bridge does not support app-server request method: ${method}`
    }
  };
}

export function buildOwnerActionRequiredPayloadForAppServerApproval({
  message,
  request = {},
  codexThreadId = "",
  dashboardThreadId = "",
  approvalResponse = null
} = {}) {
  const method = String(message?.method || "");
  const repository = normalizeBridgeRepository(request.repository);
  const relatedIssue = normalizePositiveInteger(request.relatedIssue || request.issueNumber);
  const messageId = String(message?.id ?? "");
  const actionId = [
    "app-server-approval",
    dashboardThreadId || request.threadId || "dashboard-thread",
    codexThreadId || request.codexThreadId || "codex-thread",
    method || "approval-request",
    messageId || method || "request"
  ]
    .map((part) => sanitizeBridgeActionId(part))
    .filter(Boolean)
    .join(":");
  if (!repository || !actionId) {
    return null;
  }
  const decision = approvalResponse?.result?.decision || approvalResponse?.error?.message || "declined";
  return {
    repository,
    actionId,
    title: "Codex app-server approval request",
    summary: `Dashboard bridge declined ${method || "approval request"}; owner attention may be required.`,
    issueNumber: relatedIssue || undefined,
    workflowName: "dashboard-app-server-bridge",
    url: "/dashboard/notifications?focus=owner-action",
    source: {
      method,
      decision: String(decision)
    }
  };
}

export async function postOwnerActionRequiredEvent({
  runtimeUrl = "",
  token = "",
  payload = null,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!runtimeUrl || !token || !payload || typeof fetchImpl !== "function") {
    return {
      ok: false,
      skipped: true,
      reason: "runtimeUrl, token, payload, and fetch are required"
    };
  }
  try {
    const url = new URL("/v2/events/owner-action-required", runtimeUrl);
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return {
      ok: response.ok,
      status: response.status,
      reason: response.ok ? "accepted" : `runtime returned HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: "owner_action_required_post_failed",
      reason: sanitizeBridgeError(error)
    };
  }
}

export function mapAppServerNotificationToDashboardEvent(message, context = {}) {
  const method = String(message?.method || "");
  const params = message?.params && typeof message.params === "object" ? message.params : {};
  if (method === "item/agentMessage/delta" && params.delta) {
    const delta = String(params.delta);
    return {
      type: "app_server_reply_delta",
      schema: DEFAULT_SCHEMA,
      threadId: context.dashboardThreadId,
      codexThreadId: params.threadId || context.codexThreadId || null,
      turnId: params.turnId || null,
      text: delta,
      progressText: buildAppServerReplyDeltaProgressText({
        accumulatedText: context.accumulatedText,
        delta
      })
    };
  }
  if (method === "turn/started") {
    return {
      type: "app_server_status",
      schema: DEFAULT_SCHEMA,
      threadId: context.dashboardThreadId,
      codexThreadId: params.threadId || context.codexThreadId || null,
      status: "thinking",
      persistProgress: true,
      text: "codex app-server が応答を生成しています。"
    };
  }
  if (method === "thread/status/changed") {
    const statusType = String(params.status?.type || params.status || "");
    const activeFlags = Array.isArray(params.status?.activeFlags) ? params.status.activeFlags : [];
    const stage = activeFlags.includes("waitingOnApproval")
      ? "waiting_approval"
      : activeFlags.includes("waitingOnUserInput")
        ? "waiting_user_input"
        : statusType === "active"
          ? "thinking"
          : "inspect_context";
    return {
      type: "app_server_status",
      schema: DEFAULT_SCHEMA,
      threadId: context.dashboardThreadId,
      codexThreadId: params.threadId || context.codexThreadId || null,
      status: "thinking",
      stage,
      persistProgress: shouldPersistAppServerProgressStage(stage),
      text: "codex app-server の実行状態が更新されました。"
    };
  }
  if (method === "turn/plan/updated" || method === "item/plan/delta") {
    return {
      type: "app_server_status",
      schema: DEFAULT_SCHEMA,
      threadId: context.dashboardThreadId,
      codexThreadId: params.threadId || context.codexThreadId || null,
      turnId: params.turnId || null,
      status: "thinking",
      stage: "planning",
      persistProgress: true,
      text: buildAppServerConcreteProgressText({
        params,
        prefix: "方針を整理しています。",
        fallback: "方針を整理しています。"
      })
    };
  }
  if (method === "turn/diff/updated" || method === "item/fileChange/patchUpdated" || method === "item/fileChange/outputDelta") {
    return {
      type: "app_server_status",
      schema: DEFAULT_SCHEMA,
      threadId: context.dashboardThreadId,
      codexThreadId: params.threadId || context.codexThreadId || null,
      turnId: params.turnId || null,
      status: "thinking",
      stage: "file_change",
      persistProgress: true,
      text: buildAppServerConcreteProgressText({
        params,
        prefix: "ファイル変更を確認しています。",
        fallback: "ファイル変更を確認しています。",
        target: extractAppServerProgressTarget(params, ["path", "filePath", "file", "filename"])
      })
    };
  }
  if (method === "command/exec/outputDelta" || method === "item/commandExecution/outputDelta") {
    return {
      type: "app_server_status",
      schema: DEFAULT_SCHEMA,
      threadId: context.dashboardThreadId,
      codexThreadId: params.threadId || context.codexThreadId || null,
      turnId: params.turnId || null,
      status: "thinking",
      stage: "command",
      persistProgress: true,
      text: buildAppServerConcreteProgressText({
        params,
        prefix: "コマンドを実行しています。",
        fallback: "コマンドを実行しています。",
        target: extractAppServerProgressTarget(params, ["command", "cmd", "shellCommand"])
      })
    };
  }
  if (method === "item/mcpToolCall/progress") {
    return {
      type: "app_server_status",
      schema: DEFAULT_SCHEMA,
      threadId: context.dashboardThreadId,
      codexThreadId: params.threadId || context.codexThreadId || null,
      turnId: params.turnId || null,
      status: "thinking",
      stage: "tool_call",
      persistProgress: true,
      text: "外部ツールの結果を待っています。"
    };
  }
  if (method === "item/started" || method === "item/completed") {
    return {
      type: "app_server_status",
      schema: DEFAULT_SCHEMA,
      threadId: context.dashboardThreadId,
      codexThreadId: params.threadId || context.codexThreadId || null,
      turnId: params.turnId || null,
      status: "thinking",
      stage: mapAppServerItemToProgressStage(params.item),
      persistProgress: shouldPersistAppServerProgressStage(mapAppServerItemToProgressStage(params.item)),
      text: "codex app-server の処理が進行しています。"
    };
  }
  if (method === "item/reasoning/summaryTextDelta" || method === "item/reasoning/summaryPartAdded" || method === "item/reasoning/textDelta") {
    return {
      type: "app_server_status",
      schema: DEFAULT_SCHEMA,
      threadId: context.dashboardThreadId,
      codexThreadId: params.threadId || context.codexThreadId || null,
      turnId: params.turnId || null,
      status: "thinking",
      stage: "thinking",
      persistProgress: true,
      text: buildAppServerConcreteProgressText({
        params,
        prefix: "考えを整理しています。",
        fallback: "考えています。"
      })
    };
  }
  if (method === "turn/completed") {
    const turnStatus = String(params.turn?.status || params.status || "completed");
    if (turnStatus === "failed" || turnStatus === "interrupted") {
      return {
        type: "app_server_turn_failed",
        schema: DEFAULT_SCHEMA,
        threadId: context.dashboardThreadId,
        codexThreadId: params.threadId || context.codexThreadId || null,
        status: turnStatus,
        text:
          turnStatus === "interrupted"
            ? "生成を停止しました。"
            : buildDashboardAppServerFailureText({
                text: params.message || params.reason || params.error,
                status: turnStatus,
                mediaReferences: context.mediaReferences
              }),
        recovery: buildDashboardAppServerFailureRecovery({
          text: params.message || params.reason || params.error,
          status: turnStatus,
          ownerText: context.ownerText,
          ownerMessageId: context.ownerMessageId,
          resumedExistingThread: context.resumedExistingThread
        })
      };
    }
    return {
      type: "app_server_status",
      schema: DEFAULT_SCHEMA,
      threadId: context.dashboardThreadId,
      codexThreadId: params.threadId || context.codexThreadId || null,
      status: "replied",
      text: context.accumulatedText || "codex app-server の turn が完了しました。"
    };
  }
  if (method === "error") {
    return {
      type: "app_server_turn_failed",
      schema: DEFAULT_SCHEMA,
      threadId: context.dashboardThreadId,
      codexThreadId: context.codexThreadId || null,
      text: buildDashboardAppServerFailureText({
        text: params.message || params.reason || params.error,
        status: "failed",
        mediaReferences: context.mediaReferences
      }),
      recovery: buildDashboardAppServerFailureRecovery({
        text: params.message || params.reason || params.error,
        status: "failed",
        ownerText: context.ownerText,
        ownerMessageId: context.ownerMessageId,
        resumedExistingThread: context.resumedExistingThread
      })
    };
  }
  return null;
}

export function isDashboardAppServerContextWindowExceededText(text = "") {
  return /ran out of room in the model'?s context window|context window|clear earlier history/i.test(
    normalizeBridgeText(text)
  );
}

export function buildDashboardAppServerFailureRecovery({
  text = "",
  status = "",
  ownerText = "",
  ownerMessageId = "",
  resumedExistingThread = false
} = {}) {
  const detail = sanitizeOptionalBridgeError(text);
  if (
    normalizeBridgeText(status).toLowerCase() !== "interrupted" &&
    isDashboardAppServerUnsupportedChatGptAccountModelError(detail)
  ) {
    return {
      status: "unsupported_model",
      retryable: true,
      resetBackendThread: true,
      autoRetry: true,
      originalText: normalizeBridgeText(ownerText),
      originalMessageId: normalizeBridgeText(ownerMessageId)
    };
  }
  if (
    normalizeBridgeText(status).toLowerCase() !== "interrupted" &&
    resumedExistingThread === true &&
    isDashboardAppServerContextWindowExceededText(detail)
  ) {
    return {
      status: "context_window_exceeded",
      retryable: true,
      resetBackendThread: true,
      autoRetry: true,
      originalText: normalizeBridgeText(ownerText),
      originalMessageId: normalizeBridgeText(ownerMessageId)
    };
  }
  return null;
}

export function buildDashboardAppServerFailureText({ text = "", status = "", mediaReferences = [] } = {}) {
  const normalizedStatus = normalizeBridgeText(status).toLowerCase();
  if (normalizedStatus === "interrupted") {
    return "生成を停止しました。";
  }
  const references = Array.isArray(mediaReferences) ? mediaReferences.filter(Boolean) : [];
  const baseText = references.length > 0 ? MEDIA_APP_SERVER_ERROR_TEXT : DEFAULT_APP_SERVER_ERROR_TEXT;
  const detail = sanitizeOptionalBridgeError(text);
  const mediaDetail = buildDashboardAppServerMediaFailureDetail(references);
  return [baseText, detail ? `詳細: ${detail}` : "", mediaDetail].filter(Boolean).join("\n");
}

function buildDashboardAppServerMediaFailureDetail(mediaReferences = []) {
  const references = Array.isArray(mediaReferences) ? mediaReferences.filter(Boolean) : [];
  if (references.length === 0) {
    return "";
  }
  const statuses = references.map((reference) => {
    const mediaId = normalizeBridgeText(reference?.mediaId || reference?.id) || "unknown";
    const fetchStatus = normalizeBridgeText(reference?.fetchStatus || reference?.fetch_status) || "metadata_only";
    const fetchError = sanitizeOptionalBridgeError(reference?.fetchError || reference?.fetch_error);
    return fetchError ? `${mediaId}: ${fetchStatus} (${fetchError})` : `${mediaId}: ${fetchStatus}`;
  });
  return `添付取得状態: ${statuses.slice(0, 3).join(" / ")}${statuses.length > 3 ? ` / 他${statuses.length - 3}件` : ""}`;
}

export function buildAppServerReplyDeltaProgressText({ accumulatedText = "", delta = "", maxLength = 1200 } = {}) {
  const fullText = String(`${accumulatedText || ""}${delta || ""}`).replace(/\r\n?/g, "\n");
  if (!fullText) return "";
  const normalized = formatAppServerProgressNarration(fullText);
  if (normalized.length <= maxLength) return normalized;
  const tail = normalized.slice(-maxLength);
  const paragraphStart = tail.indexOf("\n\n");
  if (paragraphStart >= 0 && paragraphStart < Math.floor(maxLength / 2)) {
    return `…\n\n${tail.slice(paragraphStart + 2).trim()}`;
  }
  return `…${tail.trimStart()}`;
}

export function buildAppServerConcreteProgressText({
  params = {},
  prefix = "",
  fallback = "",
  target = "",
  maxLength = 420
} = {}) {
  const cleanPrefix = normalizeBridgeText(prefix || fallback);
  const cleanTarget = normalizeBridgeText(target);
  const detail = buildAppServerProgressDetail(params, { maxLength });
  const head = cleanPrefix || normalizeBridgeText(fallback);
  const targetLine = cleanTarget ? `対象: ${cleanTarget}` : "";
  if (!detail) return [head, targetLine].filter(Boolean).join("\n");
  return [head, targetLine, detail].filter(Boolean).join("\n");
}

function buildAppServerProgressDetail(params = {}, { maxLength = 420 } = {}) {
  const candidates = [
    params.delta,
    params.text,
    params.message,
    params.summary,
    params.output,
    params.patch,
    params.diff
  ];
  const raw = candidates.find((value) => String(value || "").trim());
  if (!raw) return "";
  const normalized = String(raw)
    .replace(/\r\n?/g, "\n")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `…${normalized.slice(-maxLength).trimStart()}`;
}

function extractAppServerProgressTarget(params = {}, keys = []) {
  const nestedTargets = collectAppServerProgressTargets(params);
  if (nestedTargets.length > 0) return nestedTargets.join(", ");
  for (const key of keys) {
    const direct = normalizeBridgeText(params?.[key]);
    if (direct) return direct;
    const itemValue = normalizeBridgeText(params?.item?.[key]);
    if (itemValue) return itemValue;
  }
  return "";
}

function collectAppServerProgressTargets(params = {}) {
  const targets = [];
  const push = (value) => {
    const normalized = normalizeBridgeText(value);
    if (normalized && !targets.includes(normalized)) targets.push(normalized);
  };
  const visit = (value, depth = 0) => {
    if (!value || depth > 3 || targets.length >= 6) return;
    if (typeof value === "string") return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    for (const key of ["path", "filePath", "file", "filename", "relativePath", "command", "cmd", "shellCommand"]) {
      push(value[key]);
    }
    for (const key of ["paths", "files", "filenames", "changedFiles", "changes", "patches", "commandActions"]) {
      visit(value[key], depth + 1);
    }
  };
  visit(params, 0);
  visit(params?.item, 0);
  return targets;
}

export function formatAppServerProgressNarration(value = "") {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/([。！？!?])(?=[^\s\n])/g, "$1\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shouldPersistAppServerProgressStage(stage = "") {
  const normalized = String(stage || "").trim().toLowerCase().replaceAll("-", "_");
  return [
    "thinking",
    "planning",
    "hypothesis",
    "target",
    "verify",
    "verification",
    "command",
    "file_change",
    "tool_call",
    "web_search",
    "waiting_approval",
    "waiting_user_input",
    "implementation",
    "test",
    "tests",
    "pr_body",
    "pr_create",
    "reviewer_wait",
    "reviewer_revision",
    "debug_slow_turn",
    "long_turn_checkpoint"
  ].includes(normalized);
}

function isDashboardBridgeOwnerFacingProgressEvent(event = {}) {
  if (!event || event.type !== "app_server_status" || event.persistProgress !== true) {
    return false;
  }
  const stage = String(event.stage || "").trim().toLowerCase().replaceAll("-", "_");
  return [
    "planning",
    "hypothesis",
    "target",
    "verify",
    "verification",
    "waiting_approval",
    "waiting_user_input",
    "implementation",
    "test",
    "tests",
    "pr_body",
    "pr_create",
    "reviewer_wait",
    "reviewer_revision",
    "debug_slow_turn",
    "long_turn_checkpoint"
  ].includes(stage);
}

export function buildDashboardBridgeLiveProgressFallbackEvent({
  dashboardThreadId = "",
  codexThreadId = "",
  turnId = "",
  messageId = "",
  checkpointNumber = 1,
  now = new Date().toISOString()
} = {}) {
  const count = Number.isFinite(Number(checkpointNumber)) && Number(checkpointNumber) > 1 ? Number(checkpointNumber) : 1;
  return {
    type: "app_server_status",
    schema: DEFAULT_SCHEMA,
    threadId: dashboardThreadId,
    codexThreadId: codexThreadId || null,
    turnId: turnId || null,
    status: "thinking",
    stage: "long_turn_checkpoint",
    persistProgress: true,
    text:
      count === 1
        ? "作業を継続しています。まだ最終回答は生成中です。"
        : "作業を継続しています。追加の進行イベントを待っています。",
    bridgeLifecycle: {
      status: "long_turn_checkpoint",
      dashboardThreadId: dashboardThreadId || null,
      codexThreadId: codexThreadId || null,
      turnId: turnId || null,
      messageId: messageId || null,
      checkpointNumber: count,
      updatedAt: String(now || new Date().toISOString())
    }
  };
}

function mapAppServerItemToProgressStage(item = {}) {
  const type = String(item?.type || item?.kind || "").toLowerCase();
  if (type.includes("command")) return "command";
  if (type.includes("filechange") || type.includes("file_change") || type.includes("patch")) return "file_change";
  if (type.includes("mcptool") || type.includes("tool")) return "tool_call";
  if (type.includes("websearch") || type.includes("web_search")) return "web_search";
  if (type.includes("plan")) return "planning";
  if (type.includes("reasoning")) return "thinking";
  return "thinking";
}

export function isAppServerActivityNotification(message) {
  const method = String(message?.method || "");
  const progressMethods = [
    "turn/started",
    "item/agentMessage/delta",
    "item/plan/delta",
    "turn/plan/updated",
    "turn/diff/updated",
    "command/exec/outputDelta",
    "item/commandExecution/outputDelta",
    "item/commandExecution/terminalInteraction",
    "item/fileChange/outputDelta",
    "item/fileChange/patchUpdated",
    "item/mcpToolCall/progress",
    "item/reasoning/summaryTextDelta",
    "item/reasoning/summaryPartAdded",
    "item/reasoning/textDelta"
  ];
  if (progressMethods.includes(method)) {
    return true;
  }
  const params = message?.params && typeof message.params === "object" ? message.params : {};
  if (method === "thread/status/changed") {
    const activeFlags = Array.isArray(params.status?.activeFlags) ? params.status.activeFlags : [];
    const statusType = String(params.status?.type || params.status || "");
    return (
      statusType === "active" ||
      activeFlags.includes("waitingOnApproval") ||
      activeFlags.includes("waitingOnUserInput")
    );
  }
  if (method !== "item/started" && method !== "item/completed") {
    return false;
  }
  const stage = mapAppServerItemToProgressStage(params.item);
  return ["command", "file_change", "tool_call", "web_search", "planning"].includes(stage);
}

function createAppServerFailureAlreadySentError(message) {
  const error = new Error(message || DEFAULT_APP_SERVER_ERROR_TEXT);
  error[APP_SERVER_FAILURE_ALREADY_SENT] = true;
  return error;
}

function buildAppServerTurnTimeoutEvent({
  dashboardThreadId,
  codexThreadId,
  repository,
  relatedIssue,
  ownerText
} = {}) {
  return {
    type: "app_server_turn_failed",
    schema: DEFAULT_SCHEMA,
    threadId: dashboardThreadId,
    codexThreadId: codexThreadId || null,
    repository: repository || null,
    relatedIssue: relatedIssue || null,
    status: "timeout",
    text: APP_SERVER_TURN_TIMEOUT_TEXT,
    recovery: {
      status: "stalled",
      retryable: true,
      originalText: String(ownerText || ""),
      actions: ["wait", "retry", "shorten_and_resend", "cancel"]
    }
  };
}

export function parseDashboardDebugSlowTurnRequest(request = {}) {
  const text = normalizeBridgeText(request.text);
  const relatedIssue = normalizePositiveInteger(request.relatedIssue || request.issueNumber);
  const hasIssue590Context = relatedIssue === 590 || /(?:issue\s*)?#?590/i.test(text);
  const hasSlowTurnIntent =
    /debug[_ -]?slow[_ -]?turn/i.test(text) ||
    /slow[_ -]?turn/i.test(text) ||
    /timeout\s*e2e/i.test(text) ||
    /slow\s*e2e/i.test(text) ||
    /遅延.*(?:e2e|検証)/i.test(text) ||
    /スローターン/i.test(text);

  if (!hasIssue590Context || !hasSlowTurnIntent) {
    return { enabled: false };
  }

  const durationSeconds = extractDebugSlowTurnDurationSeconds(text);
  if (
    !Number.isInteger(durationSeconds) ||
    durationSeconds < DEBUG_SLOW_TURN_MIN_SECONDS ||
    durationSeconds > DEBUG_SLOW_TURN_MAX_SECONDS
  ) {
    return {
      enabled: true,
      ok: false,
      durationSeconds,
      reason: `durationSeconds must be ${DEBUG_SLOW_TURN_MIN_SECONDS}-${DEBUG_SLOW_TURN_MAX_SECONDS}`
    };
  }

  return {
    enabled: true,
    ok: true,
    durationSeconds
  };
}

function extractDebugSlowTurnDurationSeconds(text = "") {
  const normalized = normalizeBridgeText(text);
  const secondMatch = normalized.match(/(\d{1,4})\s*(?:秒|sec|secs|second|seconds|s)(?![a-z])/i);
  if (secondMatch) {
    return Number(secondMatch[1]);
  }
  const minuteMatch = normalized.match(/(\d{1,3})\s*(?:分|min|mins|minute|minutes|m)(?![a-z])/i);
  if (minuteMatch) {
    return Number(minuteMatch[1]) * 60;
  }
  return DEBUG_SLOW_TURN_DEFAULT_SECONDS;
}

export async function runDashboardDebugSlowTurn({
  request = {},
  sendDashboardEvent,
  durationSeconds = DEBUG_SLOW_TURN_DEFAULT_SECONDS,
  progressIntervalMs = DEBUG_SLOW_TURN_PROGRESS_INTERVAL_MS,
  delayImpl = delay,
  now = () => new Date().toISOString()
} = {}) {
  const dashboardThreadId = String(request.threadId || "");
  const repository = request.repository || null;
  const relatedIssue = request.relatedIssue || request.issueNumber || null;
  const startedAt = now();
  await sendDashboardEvent({
    type: "app_server_status",
    schema: DEFAULT_SCHEMA,
    threadId: dashboardThreadId,
    repository,
    relatedIssue,
    status: "thinking",
    stage: "debug_slow_turn",
    persistProgress: true,
    text: `Issue #590 slow turn E2E を開始しました。指定待機時間: ${durationSeconds}秒。`,
    debugSlowTurn: {
      startedAt,
      durationSeconds,
      lowRisk: true
    }
  });

  let elapsedMs = 0;
  const intervalMs = Math.max(1, Number(progressIntervalMs) || DEBUG_SLOW_TURN_PROGRESS_INTERVAL_MS);
  const durationMs = durationSeconds * 1000;
  while (elapsedMs < durationMs) {
    const remainingMs = durationMs - elapsedMs;
    const nextWaitMs = Math.min(intervalMs, remainingMs);
    await delayImpl(nextWaitMs);
    elapsedMs = Math.min(durationMs, elapsedMs + nextWaitMs);
    if (elapsedMs >= durationMs) {
      break;
    }
    await sendDashboardEvent({
      type: "app_server_status",
      schema: DEFAULT_SCHEMA,
      threadId: dashboardThreadId,
      repository,
      relatedIssue,
      status: "thinking",
      stage: "debug_slow_turn",
      persistProgress: true,
      text: `Issue #590 slow turn E2E 継続中です。経過: ${Math.floor(elapsedMs / 1000)}秒 / ${durationSeconds}秒。`,
      debugSlowTurn: {
        startedAt,
        elapsedSeconds: Math.floor(elapsedMs / 1000),
        durationSeconds,
        lowRisk: true
      }
    });
  }

  const completedAt = now();
  await sendDashboardEvent({
    type: "app_server_reply",
    schema: DEFAULT_SCHEMA,
    threadId: dashboardThreadId,
    repository,
    relatedIssue,
    status: "replied",
    text: [
      "Issue #590 slow turn E2E が完了しました。",
      "",
      `指定待機時間: ${durationSeconds}秒`,
      `開始: ${startedAt}`,
      `完了: ${completedAt}`,
      "",
      "この診断は sleep と progress event だけを使う低リスク検証です。root / sudo / deploy / credential / repository mutation は実行していません。"
    ].join("\n"),
    debugSlowTurn: {
      startedAt,
      completedAt,
      durationSeconds,
      lowRisk: true
    }
  });
}

function isAppServerFailureAlreadySent(error) {
  return Boolean(error && error[APP_SERVER_FAILURE_ALREADY_SENT]);
}

export function extractAppServerNotificationTurnId(message) {
  const params = message?.params && typeof message.params === "object" ? message.params : {};
  return String(params.turnId || params.turn?.id || "");
}

export function matchesAppServerTurnNotification(message, context = {}) {
  const params = message?.params && typeof message.params === "object" ? message.params : {};
  const expectedThreadId = String(context.codexThreadId || "");
  const actualThreadId = String(params.threadId || "");
  if (expectedThreadId && actualThreadId && actualThreadId !== expectedThreadId) {
    return false;
  }
  const expectedTurnId = String(context.turnId || "");
  const actualTurnId = extractAppServerNotificationTurnId(message);
  if (expectedTurnId && actualTurnId && actualTurnId !== expectedTurnId) {
    return false;
  }
  return true;
}

export class JsonLineAppServerClient {
  constructor({ command = "codex", args = ["app-server", "--listen", "stdio://"], cwd = process.cwd(), onApprovalRequest = null } = {}) {
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.nextId = 1;
    this.pending = new Map();
    this.notificationHandlers = new Set();
    this.buffer = "";
    this.child = null;
    this.onApprovalRequest = typeof onApprovalRequest === "function" ? onApprovalRequest : null;
    this.approvalRequestTasks = new Set();
  }

  start() {
    if (this.child) return;
    this.child = spawn(this.command, this.args, {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "inherit"]
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.handleChunk(chunk));
    this.child.on("exit", (code, signal) => {
      const error = new Error(`codex app-server exited: code=${code ?? "null"} signal=${signal ?? "null"}`);
      for (const { reject } of this.pending.values()) {
        reject(error);
      }
      this.pending.clear();
      this.child = null;
    });
  }

  async initialize() {
    this.start();
    await this.request(buildAppServerInitializeRequest(this.nextRequestId()));
    this.notify({ method: "initialized" });
  }

  nextRequestId() {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  request(message) {
    this.start();
    const id = message.id ?? this.nextRequestId();
    const request = { ...message, id };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write(request);
    });
  }

  notify(message) {
    this.start();
    this.write(message);
  }

  write(message) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  onNotification(handler) {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  setApprovalRequestHandler(handler) {
    const previous = this.onApprovalRequest;
    this.onApprovalRequest = typeof handler === "function" ? handler : null;
    return () => {
      this.onApprovalRequest = previous;
    };
  }

  notifyApprovalRequest(input) {
    if (!this.onApprovalRequest) {
      return null;
    }
    const task = Promise.resolve()
      .then(() => this.onApprovalRequest(input))
      .catch((error) => {
        this.lastApprovalRequestError = sanitizeBridgeError(error);
        return {
          ok: false,
          error: "approval_request_handler_failed",
          reason: this.lastApprovalRequestError
        };
      });
    this.approvalRequestTasks.add(task);
    task.finally(() => this.approvalRequestTasks.delete(task));
    return task;
  }

  async drainApprovalRequests() {
    await Promise.allSettled([...this.approvalRequestTasks]);
  }

  handleChunk(chunk) {
    this.buffer += chunk;
    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message.id !== undefined && message.id !== null && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
        } else {
          pending.resolve(message.result);
        }
        continue;
      }
      const approvalResponse = buildAppServerRequestApprovalResponse(message);
      if (approvalResponse) {
        this.notifyApprovalRequest({ message, approvalResponse });
        this.write(approvalResponse);
        continue;
      }
      for (const handler of this.notificationHandlers) {
        handler(message);
      }
    }
  }

  stop() {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }
}

function createAppServerTurnActivityWatchdog({
  activityQuietMs = DEFAULT_ACTIVITY_QUIET_MS,
  turnTimeoutMs = 0,
  onQuiet = () => {},
  onStalled = () => {}
} = {}) {
  let quietHandle = null;
  let stalledHandle = null;
  let stopped = false;

  const clearQuiet = () => {
    if (!quietHandle) return;
    clearTimeout(quietHandle);
    quietHandle = null;
  };
  const clearStalled = () => {
    if (!stalledHandle) return;
    clearTimeout(stalledHandle);
    stalledHandle = null;
  };
  const stop = () => {
    stopped = true;
    clearQuiet();
    clearStalled();
  };
  const markActivity = () => {
    if (stopped) return;
    clearQuiet();
    clearStalled();
    const quietMs = Number(activityQuietMs);
    const stalledMs = Number(turnTimeoutMs);
    const scheduleQuiet = () => {
      quietHandle = setTimeout(() => {
        quietHandle = null;
        if (stopped) return;
        void onQuiet();
        if (stopped) return;
        if (Number.isFinite(stalledMs) && stalledMs > 0 && quietMs >= stalledMs) return;
        scheduleQuiet();
      }, quietMs);
    };
    if (Number.isFinite(quietMs) && quietMs > 0 && (!Number.isFinite(stalledMs) || stalledMs <= 0 || quietMs < stalledMs)) {
      scheduleQuiet();
    }
    if (!Number.isFinite(stalledMs) || stalledMs <= 0) {
      return;
    }
    stalledHandle = setTimeout(() => {
      stalledHandle = null;
      if (stopped) return;
      stop();
      void onStalled();
    }, stalledMs);
  };

  return {
    markActivity,
    stop
  };
}

export async function handleDashboardTurnRequest({
  request,
  appServer,
  sendDashboardEvent,
  cwd = process.cwd(),
  sandboxMode = "",
  turnTimeoutMs = 0,
  activityQuietMs = DEFAULT_ACTIVITY_QUIET_MS,
  lateCompletionTimeoutMs = 30 * 60 * 1000,
  runtimeUrl = "",
  token = "",
  fetchImpl = globalThis.fetch,
  mediaTmpRoot = os.tmpdir(),
  usageProfile = null,
  costBoundary = null,
  debugSlowTurnDelayImpl = delay,
  debugSlowTurnProgressIntervalMs = DEBUG_SLOW_TURN_PROGRESS_INTERVAL_MS,
  liveProgressInitialDelayMs = DEFAULT_LIVE_PROGRESS_INITIAL_DELAY_MS,
  liveProgressIntervalMs = DEFAULT_LIVE_PROGRESS_INTERVAL_MS
}) {
  const dashboardThreadId = String(request.threadId || "");
  const text = String(request.text || "");
  const turnUsageProfile = normalizeDashboardAppServerUsageProfile(usageProfile || request.usageProfile || "conversation");
  const turnCostBoundary =
    costBoundary && typeof costBoundary === "object"
      ? costBoundary
      : buildDashboardAppServerUsageCostBoundary(turnUsageProfile);
  if (!dashboardThreadId || !text) {
    await sendDashboardEvent({
      type: "app_server_turn_failed",
      schema: DEFAULT_SCHEMA,
      threadId: dashboardThreadId,
      text: "dashboard threadId and text are required"
    });
    return;
  }

  const debugSlowTurn = parseDashboardDebugSlowTurnRequest(request);
  if (debugSlowTurn.enabled) {
    if (!debugSlowTurn.ok) {
      await sendDashboardEvent({
        type: "app_server_turn_failed",
        schema: DEFAULT_SCHEMA,
        threadId: dashboardThreadId,
        repository: request.repository || null,
        relatedIssue: request.relatedIssue || request.issueNumber || null,
        status: "invalid_debug_slow_turn_duration",
        text: `Issue #590 slow turn E2E の待機時間は ${DEBUG_SLOW_TURN_MIN_SECONDS}秒から ${DEBUG_SLOW_TURN_MAX_SECONDS}秒までにしてください。例: 「Issue #590 の slow turn を 3分で実行して」。`
      });
      return;
    }
    await runDashboardDebugSlowTurn({
      request,
      sendDashboardEvent,
      durationSeconds: debugSlowTurn.durationSeconds,
      progressIntervalMs: debugSlowTurnProgressIntervalMs,
      delayImpl: debugSlowTurnDelayImpl
    });
    return;
  }

  let codexThreadId = request.codexThreadId || null;
  let timedOut = false;
  let timeoutFailureSent = false;
  const sendTimeoutFailureOnce = async () => {
    if (timeoutFailureSent) return;
    timeoutFailureSent = true;
    timedOut = true;
    await sendDashboardEvent(
      buildAppServerTurnTimeoutEvent({
        dashboardThreadId,
        codexThreadId,
        repository: request.repository,
        relatedIssue: request.relatedIssue || request.issueNumber,
        ownerText: text
      })
    );
  };
  const awaitAppServerRequestWithTimeout = async (promise) => {
    const timeoutMs = Number(turnTimeoutMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return await promise;
    }
    let timeoutHandle = null;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => {
            sendTimeoutFailureOnce()
              .catch(() => {})
              .finally(() => reject(createAppServerFailureAlreadySentError(APP_SERVER_TURN_TIMEOUT_TEXT)));
          }, timeoutMs);
        })
      ]);
    } finally {
      clearTimeout(timeoutHandle);
    }
  };
  const resumedExistingThread = Boolean(codexThreadId);
  if (codexThreadId) {
    await awaitAppServerRequestWithTimeout(
      appServer.request(buildAppServerThreadResumeRequest({ id: appServer.nextRequestId(), codexThreadId, cwd, sandboxMode }))
    );
    await sendDashboardEvent(
      buildDashboardBridgeResumeStatusEvent({
        dashboardThreadId,
        codexThreadId,
        messageId: request.messageId
      })
    );
  } else {
    const started = await awaitAppServerRequestWithTimeout(
      appServer.request(buildAppServerThreadStartRequest({ id: appServer.nextRequestId(), cwd, sandboxMode }))
    );
    codexThreadId = started?.thread?.id || null;
    await sendDashboardEvent({
      type: "app_server_status",
      schema: DEFAULT_SCHEMA,
      threadId: dashboardThreadId,
      codexThreadId,
      status: "thinking",
      text: "codex app-server thread を開始しました。"
    });
  }

  let accumulatedText = "";
  let activeTurnId = "";
  let turnSettled = false;
  let lateCompletionCleanupHandle = null;
  let liveProgressFallbackHandle = null;
  let liveProgressFallbackCount = 0;
  let ownerFacingProgressSeen = false;
  let materializedMediaReferences = [];
  let cleanupNotifications = () => {};
  let resolveTurn = () => {};
  let rejectTurn = () => {};
  const activityWatchdog = createAppServerTurnActivityWatchdog({
    activityQuietMs,
    turnTimeoutMs,
    onQuiet: () =>
      sendDashboardEvent({
        type: "app_server_status",
        schema: DEFAULT_SCHEMA,
        threadId: dashboardThreadId,
        codexThreadId: codexThreadId || null,
        status: "quiet",
        stage: "quiet",
        text: APP_SERVER_TURN_QUIET_TEXT
      }),
    onStalled: () => {
      void sendTimeoutFailureOnce();
      lateCompletionCleanupHandle = setTimeout(() => {
        cleanupNotifications();
      }, lateCompletionTimeoutMs);
      finishTurn(resolveTurn);
    }
  });

  const finishTurn = (callback) => {
    if (turnSettled) return;
    turnSettled = true;
    activityWatchdog.stop();
    callback();
  };

  const markAppServerActivity = () => {
    if (turnSettled || timedOut) return;
    activityWatchdog.markActivity();
  };

  const stopLiveProgressFallback = () => {
    clearTimeout(liveProgressFallbackHandle);
    liveProgressFallbackHandle = null;
  };

  const scheduleLiveProgressFallback = (delayMs = liveProgressInitialDelayMs) => {
    stopLiveProgressFallback();
    const normalizedDelay = Math.max(0, Number(delayMs) || 0);
    liveProgressFallbackHandle = setTimeout(async () => {
      liveProgressFallbackHandle = null;
      if (turnSettled || timedOut || ownerFacingProgressSeen) {
        return;
      }
      liveProgressFallbackCount += 1;
      const fallbackEvent = buildDashboardBridgeLiveProgressFallbackEvent({
        dashboardThreadId,
        codexThreadId: codexThreadId || null,
        turnId: activeTurnId || "",
        messageId: request.messageId,
        checkpointNumber: liveProgressFallbackCount
      });
      ownerFacingProgressSeen = true;
      await sendDashboardEvent(fallbackEvent);
      ownerFacingProgressSeen = false;
      scheduleLiveProgressFallback(liveProgressIntervalMs);
    }, normalizedDelay);
  };

  const turnCompletion = new Promise((resolve, reject) => {
    resolveTurn = resolve;
    rejectTurn = reject;
  });
  activityWatchdog.markActivity();
  const unsubscribe = appServer.onNotification((message) => {
    if (!matchesAppServerTurnNotification(message, { codexThreadId, turnId: activeTurnId })) {
      return;
    }
    const notificationTurnId = extractAppServerNotificationTurnId(message);
    if (!activeTurnId && notificationTurnId) {
      activeTurnId = notificationTurnId;
    }
    if (isAppServerActivityNotification(message)) {
      markAppServerActivity();
    }
    const event = mapAppServerNotificationToDashboardEvent(message, {
      dashboardThreadId,
      codexThreadId,
      accumulatedText,
      mediaReferences: materializedMediaReferences,
      ownerText: text,
      ownerMessageId: request.messageId,
      resumedExistingThread
    });
    if (!event) return;
    if (event.type === "app_server_reply_delta") {
      accumulatedText += event.text;
      void sendDashboardEvent(event);
      return;
    }
    if (isDashboardBridgeOwnerFacingProgressEvent(event)) {
      ownerFacingProgressSeen = true;
      stopLiveProgressFallback();
    }
    if (event.type === "app_server_status" && event.status === "replied") {
      event.type = "app_server_reply";
      event.text = accumulatedText || event.text;
      if (timedOut) {
        event.lateCompletion = true;
        event.text = `遅れて返信が届きました。\n\n${event.text}`;
      }
      void sendDashboardEvent(event);
      if (timedOut) {
        cleanupNotifications();
        return;
      }
      finishTurn(resolveTurn);
      return;
    }
    if (event.type === "app_server_turn_failed") {
      if (
        turnCostBoundary?.modelConfigured === true &&
        isDashboardAppServerUnsupportedChatGptAccountModelError(event.text)
      ) {
        if (timedOut) {
          cleanupNotifications();
          return;
        }
        finishTurn(() => rejectTurn(new Error(event.text)));
        return;
      }
      void sendDashboardEvent(event);
      if (timedOut) {
        cleanupNotifications();
        return;
      }
      finishTurn(() => rejectTurn(createAppServerFailureAlreadySentError(event.text)));
      return;
    }
    void sendDashboardEvent(event);
  });
  const restoreApprovalRequestHandler =
    typeof appServer.setApprovalRequestHandler === "function"
      ? appServer.setApprovalRequestHandler(async ({ message, approvalResponse }) => {
          const payload = buildOwnerActionRequiredPayloadForAppServerApproval({
            message,
            request,
            codexThreadId,
            dashboardThreadId,
            approvalResponse
          });
          if (!payload) {
            return;
          }
          const result = await postOwnerActionRequiredEvent({
            runtimeUrl,
            token,
            payload,
            fetchImpl
          });
          if (!result.ok) {
            await sendDashboardEvent({
              type: "app_server_turn_failed",
              schema: DEFAULT_SCHEMA,
              threadId: dashboardThreadId,
              codexThreadId: codexThreadId || null,
              repository: request.repository || null,
              relatedIssue: request.relatedIssue || request.issueNumber || null,
              status: "owner_action_notification_failed",
              text: `owner action PWA通知を送信できませんでした。${result.reason || result.error || "runtime event route failed"}`
            });
          }
        })
      : () => {};
  cleanupNotifications = () => {
    clearTimeout(lateCompletionCleanupHandle);
    unsubscribe();
    restoreApprovalRequestHandler();
  };
  try {
    materializedMediaReferences = await materializeDashboardMediaReferences({
      mediaReferences: request.mediaReferences,
      runtimeUrl,
      token,
      fetchImpl,
      tmpRoot: mediaTmpRoot
    });
    const turnInputText = buildDashboardTurnInputText({
      text,
      repository: request.repository,
      relatedIssue: request.relatedIssue || request.issueNumber,
      authority: request.authority,
      trafficControl: request.trafficControl,
      vpsMaintenancePassThrough: request.vpsMaintenancePassThrough,
      usageProfile: turnUsageProfile,
      costBoundary: turnCostBoundary,
      mediaReferences: materializedMediaReferences
    });
    const startedTurn = await awaitAppServerRequestWithTimeout(
      appServer.request(
        buildAppServerTurnStartRequest({
          id: appServer.nextRequestId(),
          codexThreadId,
          text: turnInputText,
          cwd,
          sandboxMode
        })
      )
    );
    const startedTurnId = String(startedTurn?.turn?.id || "");
    if (activeTurnId && startedTurnId && activeTurnId !== startedTurnId) {
      throw new Error("codex app-server returned a different turn id than the active notification stream");
    }
    if (!activeTurnId && startedTurnId) {
      activeTurnId = startedTurnId;
    }
    await sendDashboardEvent(
      buildDashboardBridgeTurnStartedStatusEvent({
        dashboardThreadId,
        codexThreadId,
        turnId: activeTurnId || startedTurnId,
        messageId: request.messageId,
        resumedExistingThread,
        usageProfile: turnUsageProfile,
        costBoundary: turnCostBoundary
      })
    );
    scheduleLiveProgressFallback(liveProgressInitialDelayMs);
    markAppServerActivity();
    await turnCompletion;
  } finally {
    activityWatchdog.stop();
    stopLiveProgressFallback();
    if (!timedOut && typeof appServer.drainApprovalRequests === "function") {
      await appServer.drainApprovalRequests();
    }
    if (!timedOut) {
      cleanupNotifications();
    }
  }
}

export function parseBridgeArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    runtimeUrl: env.VTDD_RUNTIME_URL || "",
    token: env.VTDD_GATEWAY_BEARER_TOKEN || env.MVP_GATEWAY_BEARER_TOKEN || "",
    threadId: env.VTDD_DASHBOARD_THREAD_ID || "",
    cwd: env.VTDD_DASHBOARD_CODEX_CWD || process.cwd(),
    repoSyncPreflight: env.VTDD_DASHBOARD_BRIDGE_REPO_SYNC_PREFLIGHT !== "0",
    repoSyncBaseRef: env.VTDD_DASHBOARD_BRIDGE_REPO_SYNC_BASE_REF || DEFAULT_REPO_SYNC_BASE_REF,
    sandboxMode: env.VTDD_DASHBOARD_APP_SERVER_SANDBOX || "",
    appServerCostProfile: env.VTDD_DASHBOARD_APP_SERVER_PROFILE || "",
    appServerModel: env.VTDD_DASHBOARD_APP_SERVER_MODEL || "",
    appServerReasoningEffort: env.VTDD_DASHBOARD_APP_SERVER_REASONING_EFFORT || "",
    turnTimeoutMs: Number(env.VTDD_DASHBOARD_APP_SERVER_TURN_TIMEOUT_MS || DEFAULT_TURN_TIMEOUT_MS),
    activityQuietMs: Number(env.VTDD_DASHBOARD_APP_SERVER_ACTIVITY_QUIET_MS || DEFAULT_ACTIVITY_QUIET_MS),
    reconnectDelayMs: Number(env.VTDD_DASHBOARD_BRIDGE_RECONNECT_DELAY_MS || 1000),
    heartbeatMs: Number(env.VTDD_DASHBOARD_BRIDGE_HEARTBEAT_MS || 25000)
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--runtime-url") options.runtimeUrl = argv[++index] || "";
    if (arg === "--token") options.token = argv[++index] || "";
    if (arg === "--thread-id") options.threadId = argv[++index] || "";
    if (arg === "--cwd") options.cwd = argv[++index] || "";
    if (arg === "--repo-sync-base-ref") options.repoSyncBaseRef = argv[++index] || DEFAULT_REPO_SYNC_BASE_REF;
    if (arg === "--skip-repo-sync-preflight") options.repoSyncPreflight = false;
    if (arg === "--sandbox") options.sandboxMode = argv[++index] || "";
    if (arg === "--app-server-cost-profile") options.appServerCostProfile = argv[++index] || "";
    if (arg === "--app-server-model") options.appServerModel = argv[++index] || "";
    if (arg === "--app-server-reasoning-effort") options.appServerReasoningEffort = argv[++index] || "";
    if (arg === "--turn-timeout-ms") options.turnTimeoutMs = Number(argv[++index] || DEFAULT_TURN_TIMEOUT_MS);
    if (arg === "--activity-quiet-ms") options.activityQuietMs = Number(argv[++index] || DEFAULT_ACTIVITY_QUIET_MS);
    if (arg === "--reconnect-delay-ms") options.reconnectDelayMs = Number(argv[++index] || 1000);
    if (arg === "--heartbeat-ms") options.heartbeatMs = Number(argv[++index] || 25000);
  }
  return options;
}

export async function runDashboardAppServerBridge(options = parseBridgeArgs()) {
  if (!options.runtimeUrl) {
    throw new Error("VTDD_RUNTIME_URL or --runtime-url is required");
  }
  if (!options.token) {
    throw new Error("VTDD_GATEWAY_BEARER_TOKEN or --token is required");
  }
  if (!options.threadId) {
    throw new Error("VTDD_DASHBOARD_THREAD_ID or --thread-id is required so the bridge joins the same dashboard thread Durable Object");
  }
  if (typeof WebSocket !== "function") {
    throw new Error("global WebSocket is required. Run with Node.js that provides WebSocket.");
  }
  if (options.repoSyncPreflight !== false) {
    const repoSync = await ensureDashboardBridgeRepoSynced({
      repoRoot: options.cwd,
      baseRef: options.repoSyncBaseRef || DEFAULT_REPO_SYNC_BASE_REF,
      env: options.env || process.env,
      run: options.run || runBridgeCommand
    });
    if (!repoSync.developmentAllowed) {
      throw new Error(`Dashboard app-server bridge repo sync preflight blocked startup: ${repoSync.reason}`);
    }
  }
  const endpoint = buildDashboardAppServerBridgeEndpoint(options);
  const costBoundary =
    options.costBoundary ||
    buildDashboardAppServerCostBoundary({
      profile: options.appServerCostProfile,
      model: options.appServerModel,
      reasoningEffort: options.appServerReasoningEffort
    });
  const appServerArgs = buildDashboardAppServerCommandArgs({
    model: options.appServerModel,
    reasoningEffort: options.appServerReasoningEffort
  });
  const appServerFactory =
    typeof options.appServerFactory === "function"
      ? options.appServerFactory
      : (clientOptions) => new JsonLineAppServerClient(clientOptions);
  const appServer =
    options.appServer ||
    appServerFactory({
      cwd: options.cwd,
      args: appServerArgs
    });
  await appServer.initialize();
  const selectAppServerForRequest = createDashboardAppServerClientSelector({
    defaultAppServer: appServer,
    staticAppServer: Boolean(options.appServer),
    appServerFactory,
    cwd: options.cwd,
    defaultProfile: options.appServerCostProfile,
    defaultModel: options.appServerModel,
    defaultReasoningEffort: options.appServerReasoningEffort
  });
  let reconnects = 0;
  for (;;) {
    await connectDashboardAppServerBridgeOnce({
      ...options,
      endpoint,
      appServer,
      selectAppServerForRequest,
      costBoundary,
      WebSocketImpl: options.WebSocketImpl || WebSocket
    });
    if (options.reconnect === false) {
      return;
    }
    if (Number.isFinite(options.reconnectLimit) && reconnects >= options.reconnectLimit) {
      return;
    }
    reconnects += 1;
    await delay(normalizeReconnectDelayMs(options.reconnectDelayMs));
  }
}

export function createDashboardAppServerClientSelector({
  defaultAppServer = null,
  staticAppServer = false,
  appServerFactory,
  cwd = process.cwd(),
  defaultProfile = "",
  defaultModel = "",
  defaultReasoningEffort = ""
} = {}) {
  const clients = new Map();
  async function selectAppServerForRequestWithOptions(request = {}, { ignoreDefaultModel = false, rejectedModel = "" } = {}) {
    const usageProfile = ignoreDefaultModel
      ? stripDashboardAppServerModelFromUsageProfile(request.usageProfile || defaultProfile || "conversation")
      : request.usageProfile;
    const config = buildDashboardAppServerUsageProfileCommandConfig({
      usageProfile,
      defaultProfile,
      defaultModel,
      defaultReasoningEffort,
      ignoreDefaultModel
    });
    if (normalizeBridgeText(rejectedModel)) {
      config.costBoundary = {
        ...config.costBoundary,
        unsupportedModelFallback: true,
        rejectedModel: normalizeBridgeText(rejectedModel)
      };
    }
    if (staticAppServer || (!request.usageProfile && !ignoreDefaultModel)) {
      return {
        appServer: defaultAppServer,
        ...config
      };
    }
    const key = JSON.stringify(config.args);
    if (!clients.has(key)) {
      const client = appServerFactory({
        cwd,
        args: config.args
      });
      await client.initialize();
      clients.set(key, client);
    }
    return {
      appServer: clients.get(key),
      ...config
    };
  }
  const selector = (request = {}) => selectAppServerForRequestWithOptions(request);
  selector.withoutModel = (request = {}, options = {}) =>
    selectAppServerForRequestWithOptions(request, {
      ...options,
      ignoreDefaultModel: true
    });
  selector.fallbackForUnsupportedModel = (request = {}, options = {}) => {
    const rejectedModel = normalizeBridgeText(options?.rejectedModel);
    const ignoreDefaultModel =
      Boolean(rejectedModel) && Boolean(normalizeBridgeText(defaultModel)) && rejectedModel === normalizeBridgeText(defaultModel);
    return selectAppServerForRequestWithOptions(
      {
        ...request,
        codexThreadId: null,
        usageProfile: stripDashboardAppServerModelFromUsageProfile(request.usageProfile || defaultProfile || "conversation")
      },
      {
        ...options,
        ignoreDefaultModel
      }
    );
  };
  return selector;
}

export function buildDashboardAppServerBridgeEndpoint(options = {}) {
  const endpoint = new URL("/v2/dashboard/app-server/ws", options.runtimeUrl);
  endpoint.searchParams.set("threadId", options.threadId);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  return endpoint;
}

export async function ensureDashboardBridgeRepoSynced({
  repoRoot = process.cwd(),
  baseRef = DEFAULT_REPO_SYNC_BASE_REF,
  env = process.env,
  run = runBridgeCommand
} = {}) {
  const first = await collectDashboardBridgeRepoSyncStatus({ repoRoot, baseRef, env, run });
  if (!first.ok || first.developmentAllowed || first.behindCount <= 0 || !first.safeToFastForward) {
    return first;
  }
  try {
    await run("git", ["pull", "--ff-only", "origin", baseRef], { cwd: repoRoot, env });
  } catch (error) {
    return {
      ...first,
      developmentAllowed: false,
      safeToFastForward: false,
      syncAction: "pull_ff_only_failed",
      reason: `bridge repo is behind origin/${baseRef}, but git pull --ff-only failed: ${
        summarizeBridgeDiagnostic(error?.stderr || error?.message) || "unknown failure"
      }`,
      error: summarizeBridgeDiagnostic(error?.stderr || error?.message)
    };
  }
  const second = await collectDashboardBridgeRepoSyncStatus({
    repoRoot,
    baseRef,
    env,
    run,
    skipFetch: true
  });
  return {
    ...second,
    syncAction: second.developmentAllowed ? "fast_forwarded" : "fast_forwarded_but_still_blocked"
  };
}

export async function collectDashboardBridgeRepoSyncStatus({
  repoRoot = process.cwd(),
  baseRef = DEFAULT_REPO_SYNC_BASE_REF,
  env = process.env,
  run = runBridgeCommand,
  skipFetch = false
} = {}) {
  const result = {
    ok: false,
    developmentAllowed: false,
    safeToFastForward: false,
    syncAction: "none",
    reason: null,
    repoRoot,
    baseRef,
    currentBranch: null,
    headSha: null,
    originHeadSha: null,
    aheadCount: 0,
    behindCount: 0,
    inSyncWithOrigin: false,
    trackedDirtyPaths: [],
    unknownUntrackedPaths: [],
    knownUntrackedArtifacts: [],
    blockedBy: [],
    error: null
  };
  try {
    if (!skipFetch) {
      await run("git", ["fetch", "origin", baseRef], { cwd: repoRoot, env });
    }
    const [branch, head, originHead, revList, status] = await Promise.all([
      run("git", ["symbolic-ref", "--short", "HEAD"], { cwd: repoRoot, env }),
      run("git", ["rev-parse", "HEAD"], { cwd: repoRoot, env }),
      run("git", ["rev-parse", `origin/${baseRef}`], { cwd: repoRoot, env }),
      run("git", ["rev-list", "--left-right", "--count", `HEAD...origin/${baseRef}`], { cwd: repoRoot, env }),
      run("git", ["status", "--porcelain=v1"], { cwd: repoRoot, env })
    ]);
    const parsedStatus = parseDashboardBridgeRepoPorcelainStatus(status.stdout);
    const [aheadText, behindText] = normalizeBridgeText(revList.stdout).split(/\s+/);
    result.currentBranch = normalizeBridgeText(branch.stdout) || null;
    result.headSha = normalizeBridgeText(head.stdout) || null;
    result.originHeadSha = normalizeBridgeText(originHead.stdout) || null;
    result.aheadCount = Number.parseInt(aheadText || "0", 10) || 0;
    result.behindCount = Number.parseInt(behindText || "0", 10) || 0;
    result.inSyncWithOrigin = Boolean(result.headSha && result.headSha === result.originHeadSha);
    result.trackedDirtyPaths = parsedStatus.trackedDirtyPaths;
    result.unknownUntrackedPaths = parsedStatus.unknownUntrackedPaths;
    result.knownUntrackedArtifacts = parsedStatus.knownUntrackedArtifacts;
    result.ok = true;
    if (result.currentBranch !== baseRef) {
      result.blockedBy.push("not_on_base_branch");
    }
    if (result.trackedDirtyPaths.length > 0) {
      result.blockedBy.push("tracked_dirty");
    }
    if (result.unknownUntrackedPaths.length > 0) {
      result.blockedBy.push("unknown_untracked");
    }
    if (result.aheadCount > 0 && result.behindCount > 0) {
      result.blockedBy.push("diverged_from_origin");
    } else if (result.aheadCount > 0) {
      result.blockedBy.push("ahead_of_origin");
    }
    result.safeToFastForward =
      result.blockedBy.length === 0 &&
      result.behindCount > 0 &&
      result.currentBranch === baseRef;
    result.developmentAllowed =
      result.blockedBy.length === 0 &&
      result.behindCount === 0 &&
      result.inSyncWithOrigin;
    result.reason = buildDashboardBridgeRepoSyncReason(result);
  } catch (error) {
    result.error = summarizeBridgeDiagnostic(error?.stderr || error?.message);
    result.reason = `bridge repo sync preflight failed: ${result.error || "unknown failure"}`;
  }
  return result;
}

function parseDashboardBridgeRepoPorcelainStatus(stdout) {
  const trackedDirtyPaths = [];
  const unknownUntrackedPaths = [];
  const knownUntrackedArtifacts = [];
  for (const line of String(stdout || "").split("\n")) {
    if (!line.trim()) {
      continue;
    }
    if (line.startsWith("?? ")) {
      const filePath = normalizeBridgeText(line.slice(3));
      if (isKnownBridgeUntrackedArtifact(filePath)) {
        knownUntrackedArtifacts.push(filePath);
      } else {
        unknownUntrackedPaths.push(filePath);
      }
      continue;
    }
    trackedDirtyPaths.push(normalizeBridgeText(line.slice(3)) || normalizeBridgeText(line));
  }
  return {
    trackedDirtyPaths,
    unknownUntrackedPaths,
    knownUntrackedArtifacts
  };
}

function isKnownBridgeUntrackedArtifact(filePath) {
  const normalized = normalizeBridgeText(filePath);
  return KNOWN_BRIDGE_UNTRACKED_ARTIFACT_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function buildDashboardBridgeRepoSyncReason(result) {
  if (!result.ok) {
    return result.reason;
  }
  if (result.developmentAllowed) {
    return `bridge repo is synced with origin/${result.baseRef}.`;
  }
  if (result.safeToFastForward) {
    return `bridge repo is behind origin/${result.baseRef} and can be fast-forwarded.`;
  }
  const reasons = [];
  if (result.blockedBy.includes("not_on_base_branch")) {
    reasons.push(`current branch is ${result.currentBranch || "unknown"}, expected ${result.baseRef}`);
  }
  if (result.blockedBy.includes("tracked_dirty")) {
    reasons.push(`tracked dirty paths: ${result.trackedDirtyPaths.join(", ")}`);
  }
  if (result.blockedBy.includes("unknown_untracked")) {
    reasons.push(`unknown untracked paths: ${result.unknownUntrackedPaths.join(", ")}`);
  }
  if (result.blockedBy.includes("diverged_from_origin")) {
    reasons.push(`HEAD diverged from origin/${result.baseRef} (${result.aheadCount} ahead, ${result.behindCount} behind)`);
  } else if (result.blockedBy.includes("ahead_of_origin")) {
    reasons.push(`HEAD is ${result.aheadCount} commit(s) ahead of origin/${result.baseRef}`);
  }
  if (result.behindCount > 0 && result.blockedBy.length > 0) {
    reasons.push(`also ${result.behindCount} commit(s) behind origin/${result.baseRef}`);
  }
  return reasons.length > 0
    ? `bridge repo is not safe to use before recovery: ${reasons.join("; ")}.`
    : `bridge repo is not synced with origin/${result.baseRef}.`;
}

function summarizeBridgeDiagnostic(value, maxLength = 500) {
  const text = normalizeBridgeText(value).replace(/\s+/g, " ");
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)} [truncated]`;
}

function runBridgeCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`${command} ${args.join(" ")} failed with exit code ${code}: ${stderr || stdout}`);
      error.exitCode = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
    child.stdin.end();
  });
}

export function buildDashboardBridgeConnectedEvent({
  endpoint,
  threadId = "",
  cwd = process.cwd(),
  resumedAt = new Date().toISOString(),
  costBoundary = null
} = {}) {
  const dashboardThreadId =
    normalizeBridgeText(threadId) ||
    (() => {
      try {
        return normalizeBridgeText(new URL(String(endpoint || "")).searchParams.get("threadId"));
      } catch {
        return "";
      }
    })();
  return {
    type: "app_server_status",
    schema: DEFAULT_SCHEMA,
    threadId: dashboardThreadId,
    status: "bridge_connected",
    stage: "bridge_connected",
    text: "app-server bridge が接続しました。保存済み文脈と未送信 owner message を同じ Dashboard thread で復帰できます。",
    bridgeLifecycle: {
      status: "connected",
      threadId: dashboardThreadId || null,
      cwd: normalizeBridgeText(cwd) || null,
      connectedAt: normalizeBridgeText(resumedAt) || new Date().toISOString(),
      costBoundary: costBoundary && typeof costBoundary === "object" ? costBoundary : buildDashboardAppServerCostBoundary()
    }
  };
}

export function buildDashboardBridgeResumeStatusEvent({
  dashboardThreadId = "",
  codexThreadId = "",
  messageId = "",
  resumedAt = new Date().toISOString()
} = {}) {
  return {
    type: "app_server_status",
    schema: DEFAULT_SCHEMA,
    threadId: dashboardThreadId,
    codexThreadId: codexThreadId || null,
    status: "resumed_existing_thread",
    stage: "thread_resume",
    text: "既存 Codex thread を resume しました。deploy 後 restart でも前の文脈から続けられます。",
    bridgeLifecycle: {
      status: "resumed_existing_thread",
      dashboardThreadId: dashboardThreadId || null,
      codexThreadId: codexThreadId || null,
      messageId: messageId || null,
      resumedAt: normalizeBridgeText(resumedAt) || new Date().toISOString()
    }
  };
}

export function buildDashboardBridgeTurnStartedStatusEvent({
  dashboardThreadId = "",
  codexThreadId = "",
  turnId = "",
  messageId = "",
  resumedExistingThread = false,
  usageProfile = null,
  costBoundary = null,
  startedAt = new Date().toISOString()
} = {}) {
  const normalizedUsageProfile = usageProfile ? normalizeDashboardAppServerUsageProfile(usageProfile) : null;
  return {
    type: "app_server_status",
    schema: DEFAULT_SCHEMA,
    threadId: dashboardThreadId,
    codexThreadId: codexThreadId || null,
    status: "turn_started",
    stage: "turn_started",
    text: resumedExistingThread
      ? "復帰した Codex thread で turn を開始しました。進行中状態を同じ Dashboard thread に返します。"
      : "Codex thread で turn を開始しました。進行中状態を同じ Dashboard thread に返します。",
    bridgeLifecycle: {
      status: "turn_started",
      dashboardThreadId: dashboardThreadId || null,
      codexThreadId: codexThreadId || null,
      turnId: turnId || null,
      messageId: messageId || null,
      resumedExistingThread: Boolean(resumedExistingThread),
      usageProfile: normalizedUsageProfile,
      costBoundary: costBoundary && typeof costBoundary === "object" ? costBoundary : null,
      startedAt: normalizeBridgeText(startedAt) || new Date().toISOString()
    }
  };
}

export async function connectDashboardAppServerBridgeOnce({
  endpoint,
  token,
  appServer,
  selectAppServerForRequest = null,
  cwd = process.cwd(),
  sandboxMode = "",
  turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS,
  activityQuietMs = DEFAULT_ACTIVITY_QUIET_MS,
  heartbeatMs = 25000,
  runtimeUrl = "",
  fetchImpl = globalThis.fetch,
  mediaTmpRoot = os.tmpdir(),
  costBoundary = null,
  WebSocketImpl = WebSocket
} = {}) {
  const bearerProtocol = `vtdd-bearer.${Buffer.from(token, "utf8").toString("base64url")}`;
  const socket = new WebSocketImpl(endpoint, ["vtdd-dashboard-bridge", bearerProtocol]);
  let turnQueue = Promise.resolve();
  let settled = false;
  let heartbeatTimer = null;

  const safeSend = (payload) => {
    try {
      socket.send(JSON.stringify(payload));
    } catch {
      // The reconnect loop owns transport recovery; failed sends cannot be replayed safely.
    }
  };

  const stopHeartbeat = () => {
    if (!heartbeatTimer) return;
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  };

  const scheduleHeartbeat = () => {
    stopHeartbeat();
    const delayMs = Number(heartbeatMs);
    if (!Number.isFinite(delayMs) || delayMs <= 0) return;
    heartbeatTimer = setTimeout(() => {
      heartbeatTimer = null;
      try {
        socket.send("ping");
      } catch {}
      scheduleHeartbeat();
    }, delayMs);
  };

  const disconnected = new Promise((resolve) => {
    const finish = () => {
      if (settled) return;
      settled = true;
      stopHeartbeat();
      resolve();
    };
    socket.addEventListener("close", finish);
    socket.addEventListener("error", finish);
  });

  socket.addEventListener("open", () => {
    scheduleHeartbeat();
    safeSend(buildDashboardBridgeConnectedEvent({ endpoint, cwd, costBoundary }));
  });

  socket.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(String(event.data || ""));
    } catch {
      return;
    }
    if (payload?.type === "app_server_turn_requested") {
      turnQueue = turnQueue
        .catch(() => {})
        .then(async () => {
          const selected =
            typeof selectAppServerForRequest === "function"
              ? await selectAppServerForRequest(payload)
              : { appServer, usageProfile: payload.usageProfile || null, costBoundary: payload.costBoundary || null };
          const runSelectedTurn = (turnSelection, turnPayload = payload) =>
            handleDashboardTurnRequest({
              request: turnPayload,
              appServer: turnSelection.appServer || appServer,
              usageProfile: turnSelection.usageProfile || turnPayload.usageProfile || null,
              costBoundary: turnSelection.costBoundary || turnPayload.costBoundary || null,
              sendDashboardEvent: async (dashboardEvent) => safeSend(dashboardEvent),
              cwd,
              sandboxMode,
              turnTimeoutMs,
              activityQuietMs,
              runtimeUrl,
              token,
              fetchImpl,
              mediaTmpRoot
            });
          try {
            return await runSelectedTurn(selected);
          } catch (error) {
            if (
              !isAppServerFailureAlreadySent(error) &&
              isDashboardAppServerUnsupportedChatGptAccountModelError(error) &&
              selected?.costBoundary?.modelConfigured === true &&
              (typeof selectAppServerForRequest?.fallbackForUnsupportedModel === "function" ||
                typeof selectAppServerForRequest?.withoutModel === "function")
            ) {
              const fallbackPayload = {
                ...payload,
                codexThreadId: null,
                appServer: {
                  ...(payload.appServer && typeof payload.appServer === "object" ? payload.appServer : {}),
                  startThreadMethod: "thread/start"
                }
              };
              const fallbackSelector =
                typeof selectAppServerForRequest.fallbackForUnsupportedModel === "function"
                  ? selectAppServerForRequest.fallbackForUnsupportedModel
                  : selectAppServerForRequest.withoutModel;
              const rejectedModel =
                extractDashboardAppServerUnsupportedModel(error) ||
                selected.usageProfile?.model ||
                selected.costBoundary?.model ||
                payload.usageProfile?.model ||
                "";
              const fallbackSelected = await fallbackSelector(fallbackPayload, {
                rejectedModel
              });
              safeSend({
                type: "app_server_status",
                schema: DEFAULT_SCHEMA,
                threadId: payload.threadId,
                codexThreadId: null,
                status: "unsupported_model_fallback",
                stage: "runtime_recovery",
                text: "指定 model または古い backend thread が ChatGPT account で非対応のため、新しい app-server thread で再送しています。",
                persistProgress: true,
                usageProfile: fallbackSelected.usageProfile || null,
                costBoundary: fallbackSelected.costBoundary || null
              });
              return await runSelectedTurn(fallbackSelected, fallbackPayload);
            }
            throw error;
          }
        })
        .catch((error) => {
          if (isAppServerFailureAlreadySent(error)) {
            return;
          }
          safeSend({
            type: "app_server_turn_failed",
            schema: DEFAULT_SCHEMA,
            threadId: payload.threadId,
            text: buildDashboardAppServerFailureText({
              text: error?.message,
              status: "failed",
              mediaReferences: payload.mediaReferences
            }),
            recovery: buildDashboardAppServerFailureRecovery({
              text: error?.message,
              status: "failed",
              ownerText: payload.text,
              ownerMessageId: payload.messageId,
              resumedExistingThread: Boolean(payload.codexThreadId)
            })
          });
        });
    }
    if (payload?.type === "runner_wakeup_requested") {
      executeVpsRunnerWakeup({ request: payload }).then((result) => safeSend(result));
    }
  });

  await disconnected;
}

function normalizeReconnectDelayMs(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 1000;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDashboardAppServerBridge().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
