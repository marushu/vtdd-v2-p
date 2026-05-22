#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

const DEFAULT_SCHEMA = "vtdd.dashboard.app_server_bridge.v1";

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

export function buildAppServerThreadStartRequest({ id, cwd = process.cwd(), developerInstructions = "" } = {}) {
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
      experimentalRawEvents: false,
      persistExtendedHistory: false
    }
  };
}

export function buildAppServerThreadResumeRequest({ id, codexThreadId, cwd = process.cwd() } = {}) {
  return {
    method: "thread/resume",
    id,
    params: {
      threadId: codexThreadId,
      cwd,
      approvalPolicy: "on-request",
      excludeTurns: true,
      persistExtendedHistory: false
    }
  };
}

export function buildAppServerTurnStartRequest({ id, codexThreadId, text, cwd = process.cwd() } = {}) {
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
      approvalPolicy: "on-request"
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
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
        } else {
          pending.resolve(message.result);
        }
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
    await appServer.request(buildAppServerThreadResumeRequest({ id: appServer.nextRequestId(), codexThreadId, cwd }));
  } else {
    const started = await appServer.request(buildAppServerThreadStartRequest({ id: appServer.nextRequestId(), cwd }));
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
    await appServer.request(buildAppServerTurnStartRequest({ id: appServer.nextRequestId(), codexThreadId, text, cwd }));
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
    cwd: env.VTDD_DASHBOARD_CODEX_CWD || process.cwd()
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--runtime-url") options.runtimeUrl = argv[++index] || "";
    if (arg === "--token") options.token = argv[++index] || "";
    if (arg === "--thread-id") options.threadId = argv[++index] || "";
    if (arg === "--cwd") options.cwd = argv[++index] || "";
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
  if (typeof WebSocket !== "function") {
    throw new Error("global WebSocket is required. Run with Node.js that provides WebSocket.");
  }
  const endpoint = new URL("/v2/dashboard/app-server/ws", options.runtimeUrl);
  if (options.threadId) {
    endpoint.searchParams.set("threadId", options.threadId);
  }
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";

  const appServer = new JsonLineAppServerClient({ cwd: options.cwd });
  await appServer.initialize();
  const bearerProtocol = `vtdd-bearer.${Buffer.from(options.token, "utf8").toString("base64url")}`;
  const socket = new WebSocket(endpoint, ["vtdd-dashboard-bridge", bearerProtocol]);

  const sendDashboardEvent = async (event) => {
    socket.send(JSON.stringify(event));
  };
  socket.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(String(event.data || ""));
    } catch {
      return;
    }
    if (payload?.type === "app_server_turn_requested") {
      void handleDashboardTurnRequest({
        request: payload,
        appServer,
        sendDashboardEvent,
        cwd: options.cwd
      }).catch((error) => {
        socket.send(
          JSON.stringify({
            type: "app_server_turn_failed",
            schema: DEFAULT_SCHEMA,
            threadId: payload.threadId,
            text: error?.message || "codex app-server bridge failed"
          })
        );
      });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDashboardAppServerBridge().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
