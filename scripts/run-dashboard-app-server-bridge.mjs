#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

const DEFAULT_SCHEMA = "vtdd.dashboard.app_server_bridge.v1";
const DANGER_FULL_ACCESS_SANDBOX = "danger-full-access";

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
  if (method === "turn/completed") {
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
      text: params.message || params.reason || "codex app-server returned an error"
    };
  }
  return null;
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
  constructor({ command = "codex", args = ["app-server", "--listen", "stdio://"], cwd = process.cwd() } = {}) {
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.nextId = 1;
    this.pending = new Map();
    this.notificationHandlers = new Set();
    this.buffer = "";
    this.child = null;
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
  turnTimeoutMs = 10 * 60 * 1000
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
  let timeoutHandle = null;
  let resolveTurn = () => {};
  let rejectTurn = () => {};
  const turnCompletion = new Promise((resolve, reject) => {
    resolveTurn = resolve;
    rejectTurn = reject;
    timeoutHandle = setTimeout(() => {
      reject(new Error("codex app-server turn timed out before completion"));
    }, turnTimeoutMs);
  });
  const finishTurn = (callback) => {
    if (turnSettled) return;
    turnSettled = true;
    clearTimeout(timeoutHandle);
    callback();
  };
  const unsubscribe = appServer.onNotification((message) => {
    if (!matchesAppServerTurnNotification(message, { codexThreadId, turnId: activeTurnId })) {
      return;
    }
    const notificationTurnId = extractAppServerNotificationTurnId(message);
    if (!activeTurnId && notificationTurnId) {
      activeTurnId = notificationTurnId;
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
      void sendDashboardEvent(event);
      finishTurn(resolveTurn);
      return;
    }
    if (event.type === "app_server_turn_failed") {
      void sendDashboardEvent(event);
      finishTurn(() => rejectTurn(new Error(event.text || "codex app-server turn failed")));
      return;
    }
    void sendDashboardEvent(event);
  });
  try {
    const startedTurn = await appServer.request(buildAppServerTurnStartRequest({ id: appServer.nextRequestId(), codexThreadId, text, cwd, sandboxMode }));
    const startedTurnId = String(startedTurn?.turn?.id || "");
    if (activeTurnId && startedTurnId && activeTurnId !== startedTurnId) {
      throw new Error("codex app-server returned a different turn id than the active notification stream");
    }
    if (!activeTurnId && startedTurnId) {
      activeTurnId = startedTurnId;
    }
    await turnCompletion;
  } finally {
    clearTimeout(timeoutHandle);
    unsubscribe();
  }
}

export function parseBridgeArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    runtimeUrl: env.VTDD_RUNTIME_URL || "",
    token: env.VTDD_GATEWAY_BEARER_TOKEN || env.MVP_GATEWAY_BEARER_TOKEN || "",
    threadId: env.VTDD_DASHBOARD_THREAD_ID || "",
    cwd: env.VTDD_DASHBOARD_CODEX_CWD || process.cwd(),
    sandboxMode: env.VTDD_DASHBOARD_APP_SERVER_SANDBOX || "",
    reconnectDelayMs: Number(env.VTDD_DASHBOARD_BRIDGE_RECONNECT_DELAY_MS || 1000)
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--runtime-url") options.runtimeUrl = argv[++index] || "";
    if (arg === "--token") options.token = argv[++index] || "";
    if (arg === "--thread-id") options.threadId = argv[++index] || "";
    if (arg === "--cwd") options.cwd = argv[++index] || "";
    if (arg === "--sandbox") options.sandboxMode = argv[++index] || "";
    if (arg === "--reconnect-delay-ms") options.reconnectDelayMs = Number(argv[++index] || 1000);
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
  WebSocketImpl = WebSocket
} = {}) {
  const bearerProtocol = `vtdd-bearer.${Buffer.from(token, "utf8").toString("base64url")}`;
  const socket = new WebSocketImpl(endpoint, ["vtdd-dashboard-bridge", bearerProtocol]);
  let turnQueue = Promise.resolve();
  let settled = false;

  const safeSend = (payload) => {
    try {
      socket.send(JSON.stringify(payload));
    } catch {
      // The reconnect loop owns transport recovery; failed sends cannot be replayed safely.
    }
  };

  const disconnected = new Promise((resolve) => {
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    socket.addEventListener("close", finish);
    socket.addEventListener("error", finish);
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
        .then(() =>
          handleDashboardTurnRequest({
            request: payload,
            appServer,
            sendDashboardEvent: async (dashboardEvent) => safeSend(dashboardEvent),
            cwd,
            sandboxMode
          })
        )
        .catch((error) => {
          safeSend({
            type: "app_server_turn_failed",
            schema: DEFAULT_SCHEMA,
            threadId: payload.threadId,
            text: error?.message || "codex app-server bridge failed"
          });
        });
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
