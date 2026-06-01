#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const DEFAULT_SCHEMA = "vtdd.dashboard.app_server_bridge.v1";
const DANGER_FULL_ACCESS_SANDBOX = "danger-full-access";
const APP_SERVER_FAILURE_ALREADY_SENT = Symbol("appServerFailureAlreadySent");
const DEFAULT_APP_SERVER_ERROR_TEXT =
  "codex app-server が応答生成中に失敗しました。画像を解析できなかった可能性があります。もう一度送るか、画像なしで内容を短く説明してください。";
const APP_SERVER_TURN_TIMEOUT_TEXT =
  "codex app-server から進行イベントがしばらく届いていません。この依頼は Dashboard thread に保存済みです。待つ、同じ内容でもう一度実行する、短くして再送する、キャンセルする、のいずれかで復旧できます。遅れて返信が届いた場合は、この thread に追加します。";
const APP_SERVER_TURN_QUIET_TEXT =
  "codex app-server から進行イベントがしばらく届いていません。処理中の可能性があります。接続と実行状態を確認しています。";
const DASHBOARD_MEDIA_TMP_DIR = "vtdd-dashboard-media";
const DEFAULT_TURN_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_ACTIVITY_QUIET_MS = 90 * 1000;

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
          "High-risk work requires explicit GO or passkey approval through VTDD runtime boundaries.",
          "Reply in Japanese by default."
        ].join("\n"),
      threadSource: "app_server",
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

export function buildDashboardTurnInputText(request = {}) {
  const ownerText = String(request.text || "").trim();
  const repository = String(request.repository || "").trim();
  const relatedIssue = request.relatedIssue || request.issueNumber || "";
  const authority = request.authority && typeof request.authority === "object" ? request.authority : null;
  const trafficControl =
    request.trafficControl && typeof request.trafficControl === "object"
      ? request.trafficControl
      : null;
  const mediaReferences = Array.isArray(request.mediaReferences) ? request.mediaReferences : [];
  const hasDashboardContext = Boolean(
    repository ||
      relatedIssue ||
      authority ||
      trafficControl ||
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

  if (authority) {
    lines.push(`- authority: ${JSON.stringify(authority)}`);
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
    return {
      type: "app_server_reply_delta",
      schema: DEFAULT_SCHEMA,
      threadId: context.dashboardThreadId,
      codexThreadId: params.threadId || context.codexThreadId || null,
      turnId: params.turnId || null,
      text: String(params.delta)
    };
  }
  if (method === "turn/started") {
    return {
      type: "app_server_status",
      schema: DEFAULT_SCHEMA,
      threadId: context.dashboardThreadId,
      codexThreadId: params.threadId || context.codexThreadId || null,
      status: "thinking",
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
      text: "方針を整理しています。"
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
      text: "ファイル変更を確認しています。"
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
      text: "コマンドを実行しています。"
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
      text: params.message || "外部ツールの結果を待っています。"
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
      text: "考えています。"
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
        text: turnStatus === "interrupted" ? "生成を停止しました。" : DEFAULT_APP_SERVER_ERROR_TEXT
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
      text: params.message || params.reason || DEFAULT_APP_SERVER_ERROR_TEXT
    };
  }
  return null;
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
  return [
    "turn/started",
    "turn/completed",
    "thread/status/changed",
    "hook/started",
    "hook/completed",
    "item/started",
    "item/completed",
    "rawResponseItem/completed",
    "item/agentMessage/delta",
    "item/plan/delta",
    "turn/plan/updated",
    "turn/diff/updated",
    "command/exec/outputDelta",
    "item/commandExecution/outputDelta",
    "item/commandExecution/terminalInteraction",
    "item/fileChange/outputDelta",
    "item/fileChange/patchUpdated",
    "serverRequest/resolved",
    "item/mcpToolCall/progress",
    "mcpServer/startupStatus/updated",
    "item/reasoning/summaryTextDelta",
    "item/reasoning/summaryPartAdded",
    "item/reasoning/textDelta",
    "thread/compacted",
    "model/rerouted",
    "model/verification",
    "warning",
    "guardianWarning",
    "configWarning"
  ].includes(method);
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
  mediaTmpRoot = os.tmpdir()
}) {
  const dashboardThreadId = String(request.threadId || "");
  const text = String(request.text || "");
  if (!dashboardThreadId || !text) {
    await sendDashboardEvent({
      type: "app_server_turn_failed",
      schema: DEFAULT_SCHEMA,
      threadId: dashboardThreadId,
      text: "dashboard threadId and text are required"
    });
    return;
  }

  let codexThreadId = request.codexThreadId || null;
  if (codexThreadId) {
    await appServer.request(buildAppServerThreadResumeRequest({ id: appServer.nextRequestId(), codexThreadId, cwd, sandboxMode }));
  } else {
    const started = await appServer.request(buildAppServerThreadStartRequest({ id: appServer.nextRequestId(), cwd, sandboxMode }));
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
  let timedOut = false;
  let quietHandle = null;
  let timeoutHandle = null;
  let lateCompletionCleanupHandle = null;
  let cleanupNotifications = () => {};
  let resolveTurn = () => {};
  let rejectTurn = () => {};

  const clearActivityWatchdog = () => {
    clearTimeout(quietHandle);
    clearTimeout(timeoutHandle);
    quietHandle = null;
    timeoutHandle = null;
  };

  const finishTurn = (callback) => {
    if (turnSettled) return;
    turnSettled = true;
    clearActivityWatchdog();
    callback();
  };

  const scheduleActivityWatchdog = () => {
    clearActivityWatchdog();
    if (turnSettled || timedOut) return;
    const quietMs = Number(activityQuietMs);
    const stalledMs = Number(turnTimeoutMs);
    if (Number.isFinite(quietMs) && quietMs > 0 && (!Number.isFinite(stalledMs) || stalledMs <= 0 || quietMs < stalledMs)) {
      quietHandle = setTimeout(() => {
        quietHandle = null;
        if (turnSettled || timedOut) return;
        void sendDashboardEvent({
          type: "app_server_status",
          schema: DEFAULT_SCHEMA,
          threadId: dashboardThreadId,
          codexThreadId: codexThreadId || null,
          status: "quiet",
          stage: "quiet",
          text: APP_SERVER_TURN_QUIET_TEXT
        });
      }, quietMs);
    }
    if (!Number.isFinite(stalledMs) || stalledMs <= 0) {
      return;
    }
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      const timeoutEvent = buildAppServerTurnTimeoutEvent({
        dashboardThreadId,
        codexThreadId,
        repository: request.repository,
        relatedIssue: request.relatedIssue || request.issueNumber,
        ownerText: text
      });
      void sendDashboardEvent(timeoutEvent);
      lateCompletionCleanupHandle = setTimeout(() => {
        cleanupNotifications();
      }, lateCompletionTimeoutMs);
      finishTurn(resolveTurn);
    }, stalledMs);
  };

  const markAppServerActivity = () => {
    if (turnSettled || timedOut) return;
    scheduleActivityWatchdog();
  };

  const turnCompletion = new Promise((resolve, reject) => {
    resolveTurn = resolve;
    rejectTurn = reject;
  });
  scheduleActivityWatchdog();
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
      accumulatedText
    });
    if (!event) return;
    if (event.type === "app_server_reply_delta") {
      accumulatedText += event.text;
      void sendDashboardEvent(event);
      return;
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
    const materializedMediaReferences = await materializeDashboardMediaReferences({
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
      mediaReferences: materializedMediaReferences
    });
    const startedTurn = await appServer.request(
      buildAppServerTurnStartRequest({
        id: appServer.nextRequestId(),
        codexThreadId,
        text: turnInputText,
        cwd,
        sandboxMode
      })
    );
    const startedTurnId = String(startedTurn?.turn?.id || "");
    if (activeTurnId && startedTurnId && activeTurnId !== startedTurnId) {
      throw new Error("codex app-server returned a different turn id than the active notification stream");
    }
    if (!activeTurnId && startedTurnId) {
      activeTurnId = startedTurnId;
    }
    markAppServerActivity();
    await turnCompletion;
  } finally {
    clearActivityWatchdog();
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
    sandboxMode: env.VTDD_DASHBOARD_APP_SERVER_SANDBOX || "",
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
    if (arg === "--sandbox") options.sandboxMode = argv[++index] || "";
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
  const endpoint = buildDashboardAppServerBridgeEndpoint(options);
  const appServer = options.appServer || new JsonLineAppServerClient({ cwd: options.cwd });
  await appServer.initialize();
  let reconnects = 0;
  for (;;) {
    await connectDashboardAppServerBridgeOnce({
      ...options,
      endpoint,
      appServer,
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

export function buildDashboardAppServerBridgeEndpoint(options = {}) {
  const endpoint = new URL("/v2/dashboard/app-server/ws", options.runtimeUrl);
  endpoint.searchParams.set("threadId", options.threadId);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  return endpoint;
}

export async function connectDashboardAppServerBridgeOnce({
  endpoint,
  token,
  appServer,
  cwd = process.cwd(),
  sandboxMode = "",
  turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS,
  activityQuietMs = DEFAULT_ACTIVITY_QUIET_MS,
  heartbeatMs = 25000,
  runtimeUrl = "",
  fetchImpl = globalThis.fetch,
  mediaTmpRoot = os.tmpdir(),
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

  socket.addEventListener("open", scheduleHeartbeat);

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
        .then(() =>
          handleDashboardTurnRequest({
            request: payload,
            appServer,
            sendDashboardEvent: async (dashboardEvent) => safeSend(dashboardEvent),
            cwd,
            sandboxMode,
            turnTimeoutMs,
            activityQuietMs,
            runtimeUrl,
            token,
            fetchImpl,
            mediaTmpRoot
          })
        )
        .catch((error) => {
          if (isAppServerFailureAlreadySent(error)) {
            return;
          }
          safeSend({
            type: "app_server_turn_failed",
            schema: DEFAULT_SCHEMA,
            threadId: payload.threadId,
            text: error?.message || DEFAULT_APP_SERVER_ERROR_TEXT
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
