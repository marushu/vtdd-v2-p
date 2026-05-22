import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDashboardAppServerBridgeEndpoint,
  buildAppServerInitializeRequest,
  buildAppServerSandboxOverrides,
  buildAppServerThreadResumeRequest,
  buildAppServerThreadStartRequest,
  buildAppServerTurnStartRequest,
  connectDashboardAppServerBridgeOnce,
  extractAppServerNotificationTurnId,
  handleDashboardTurnRequest,
  mapAppServerNotificationToDashboardEvent,
  matchesAppServerTurnNotification,
  parseBridgeArgs,
  runDashboardAppServerBridge
} from "../scripts/run-dashboard-app-server-bridge.mjs";

test("dashboard app-server bridge builds initialize and thread requests from Codex app-server protocol", () => {
  assert.deepEqual(buildAppServerInitializeRequest(10), {
    method: "initialize",
    id: 10,
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
  });

  const start = buildAppServerThreadStartRequest({ id: 11, cwd: "/repo" });
  assert.equal(start.method, "thread/start");
  assert.equal(start.params.cwd, "/repo");
  assert.equal(start.params.approvalPolicy, "on-request");
  assert.equal(start.params.sandbox, undefined);
  assert.equal(start.params.experimentalRawEvents, false);
  assert.equal(start.params.persistExtendedHistory, false);

  const resume = buildAppServerThreadResumeRequest({ id: 12, codexThreadId: "codex-thread-1", cwd: "/repo" });
  assert.equal(resume.method, "thread/resume");
  assert.equal(resume.params.threadId, "codex-thread-1");
  assert.equal(resume.params.sandbox, undefined);
  assert.equal(resume.params.excludeTurns, true);

  const turn = buildAppServerTurnStartRequest({
    id: 13,
    codexThreadId: "codex-thread-1",
    text: "今日は何日？",
    cwd: "/repo"
  });
  assert.equal(turn.method, "turn/start");
  assert.equal(turn.params.threadId, "codex-thread-1");
  assert.deepEqual(turn.params.input, [{ type: "text", text: "今日は何日？", text_elements: [] }]);
  assert.equal(turn.params.sandboxPolicy, undefined);
});

test("dashboard app-server bridge only enables danger-full-access by explicit trusted VPS opt-in", () => {
  const start = buildAppServerThreadStartRequest({
    id: 21,
    cwd: "/repo",
    sandboxMode: "danger-full-access"
  });
  const resume = buildAppServerThreadResumeRequest({
    id: 22,
    codexThreadId: "codex-thread-1",
    cwd: "/repo",
    sandboxMode: "danger-full-access"
  });
  const turn = buildAppServerTurnStartRequest({
    id: 23,
    codexThreadId: "codex-thread-1",
    text: "今日は何日？",
    cwd: "/repo",
    sandboxMode: "danger-full-access"
  });

  assert.equal(start.params.sandbox, "danger-full-access");
  assert.equal(resume.params.sandbox, "danger-full-access");
  assert.deepEqual(turn.params.sandboxPolicy, { type: "dangerFullAccess" });
  assert.deepEqual(buildAppServerSandboxOverrides("danger-full-access"), {
    threadSandbox: "danger-full-access",
    turnSandboxPolicy: { type: "dangerFullAccess" }
  });
  assert.throws(() => buildAppServerSandboxOverrides("workspace-write"), /unsupported dashboard app-server sandbox mode/);
});

test("dashboard app-server bridge maps Codex app-server notifications to dashboard events", () => {
  const delta = mapAppServerNotificationToDashboardEvent(
    {
      method: "item/agentMessage/delta",
      params: {
        threadId: "codex-thread-1",
        turnId: "turn-1",
        delta: "返答"
      }
    },
    { dashboardThreadId: "dashboard-main", codexThreadId: "codex-thread-1" }
  );
  assert.equal(delta.type, "app_server_reply_delta");
  assert.equal(delta.threadId, "dashboard-main");
  assert.equal(delta.codexThreadId, "codex-thread-1");
  assert.equal(delta.text, "返答");

  const completed = mapAppServerNotificationToDashboardEvent(
    { method: "turn/completed", params: { threadId: "codex-thread-1" } },
    { dashboardThreadId: "dashboard-main", codexThreadId: "codex-thread-1", accumulatedText: "最終返答" }
  );
  assert.equal(completed.type, "app_server_status");
  assert.equal(completed.status, "replied");
  assert.equal(completed.text, "最終返答");
});

test("dashboard app-server bridge filters app-server notifications by Codex thread and turn", () => {
  assert.equal(
    matchesAppServerTurnNotification(
      { method: "item/agentMessage/delta", params: { threadId: "codex-thread-1", turnId: "turn-1" } },
      { codexThreadId: "codex-thread-1", turnId: "turn-1" }
    ),
    true
  );
  assert.equal(
    matchesAppServerTurnNotification(
      { method: "item/agentMessage/delta", params: { threadId: "codex-thread-2", turnId: "turn-1" } },
      { codexThreadId: "codex-thread-1", turnId: "turn-1" }
    ),
    false
  );
  assert.equal(
    matchesAppServerTurnNotification(
      { method: "turn/completed", params: { threadId: "codex-thread-1", turn: { id: "turn-2" } } },
      { codexThreadId: "codex-thread-1", turnId: "turn-1" }
    ),
    false
  );
  assert.equal(extractAppServerNotificationTurnId({ params: { turn: { id: "turn-2" } } }), "turn-2");
});

test("dashboard app-server bridge handles a fresh dashboard turn through thread/start and turn/start", async () => {
  const requests = [];
  const events = [];
  const handlers = new Set();
  let nextId = 1;
  const appServer = {
    nextRequestId() {
      const id = nextId;
      nextId += 1;
      return id;
    },
    onNotification(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    async request(message) {
      requests.push(message);
      if (message.method === "thread/start") {
        return { thread: { id: "codex-thread-1" } };
      }
      if (message.method === "turn/start") {
        for (const handler of handlers) {
          handler({
            method: "item/agentMessage/delta",
            params: {
              threadId: "codex-thread-1",
              turnId: "turn-1",
              delta: "今日は2026年5月22日です。"
            }
          });
          handler({
            method: "turn/completed",
            params: {
              threadId: "codex-thread-1",
              turn: { id: "turn-1", status: "completed" }
            }
          });
        }
        return { turn: { id: "turn-1" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  await handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      codexThreadId: null,
      text: "今日は何日？"
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    cwd: "/repo"
  });

  assert.deepEqual(
    requests.map((request) => request.method),
    ["thread/start", "turn/start"]
  );
  assert.equal(requests[1].params.threadId, "codex-thread-1");
  assert.equal(events[0].type, "app_server_status");
  assert.equal(events[0].codexThreadId, "codex-thread-1");
  assert.equal(events[1].type, "app_server_reply_delta");
  assert.equal(events[2].type, "app_server_reply");
  assert.equal(events[2].text, "今日は2026年5月22日です。");
});

test("dashboard app-server bridge keeps listening for async turn notifications after turn/start response", async () => {
  const requests = [];
  const events = [];
  const handlers = new Set();
  let nextId = 1;
  const appServer = {
    nextRequestId() {
      const id = nextId;
      nextId += 1;
      return id;
    },
    onNotification(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    async request(message) {
      requests.push(message);
      if (message.method === "thread/start") {
        return { thread: { id: "codex-thread-async" } };
      }
      if (message.method === "turn/start") {
        setTimeout(() => {
          for (const handler of handlers) {
            handler({
              method: "item/agentMessage/delta",
              params: {
                threadId: "codex-thread-async",
                turnId: "turn-async",
                delta: "非同期で返りました。"
              }
            });
            handler({
              method: "turn/completed",
              params: {
                threadId: "codex-thread-async",
                turn: { id: "turn-async", status: "completed" }
              }
            });
          }
        }, 0);
        return { turn: { id: "turn-async" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  await handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      codexThreadId: null,
      text: "続きは？"
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    cwd: "/repo",
    turnTimeoutMs: 1000
  });

  assert.deepEqual(
    requests.map((request) => request.method),
    ["thread/start", "turn/start"]
  );
  assert.equal(events.at(-2).type, "app_server_reply_delta");
  assert.equal(events.at(-1).type, "app_server_reply");
  assert.equal(events.at(-1).text, "非同期で返りました。");
  assert.equal(handlers.size, 0);
});

test("dashboard app-server bridge ignores notifications for a different Codex turn", async () => {
  const events = [];
  const handlers = new Set();
  let nextId = 1;
  const appServer = {
    nextRequestId() {
      const id = nextId;
      nextId += 1;
      return id;
    },
    onNotification(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    async request(message) {
      if (message.method === "thread/start") {
        return { thread: { id: "codex-thread-filtered" } };
      }
      if (message.method === "turn/start") {
        setTimeout(() => {
          for (const handler of handlers) {
            handler({
              method: "item/agentMessage/delta",
              params: {
                threadId: "codex-thread-filtered",
                turnId: "other-turn",
                delta: "混線"
              }
            });
            handler({
              method: "item/agentMessage/delta",
              params: {
                threadId: "codex-thread-filtered",
                turnId: "turn-filtered",
                delta: "正しい返信"
              }
            });
            handler({
              method: "turn/completed",
              params: {
                threadId: "codex-thread-filtered",
                turn: { id: "turn-filtered", status: "completed" }
              }
            });
          }
        }, 0);
        return { turn: { id: "turn-filtered" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  await handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      codexThreadId: null,
      text: "混線しない？"
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    cwd: "/repo",
    turnTimeoutMs: 1000
  });

  assert.equal(events.some((event) => event.text === "混線"), false);
  assert.equal(events.at(-1).type, "app_server_reply");
  assert.equal(events.at(-1).text, "正しい返信");
});

test("dashboard app-server bridge args require a dashboard thread id for runtime connection", () => {
  const parsed = parseBridgeArgs([], {
    VTDD_RUNTIME_URL: "https://runtime.example",
    VTDD_GATEWAY_BEARER_TOKEN: "secret-token",
    VTDD_DASHBOARD_CODEX_CWD: "/repo",
    VTDD_DASHBOARD_APP_SERVER_SANDBOX: "danger-full-access"
  });
  assert.equal(parsed.threadId, "");
  assert.equal(parsed.sandboxMode, "danger-full-access");
});

test("dashboard app-server bridge refuses to connect without a dashboard thread id", async () => {
  await assert.rejects(
    runDashboardAppServerBridge({
      runtimeUrl: "https://runtime.example",
      token: "secret-token",
      threadId: "",
      cwd: "/repo"
    }),
    /--thread-id is required/
  );
});

test("dashboard app-server bridge args read runtime, token, and thread from environment", () => {
  const parsed = parseBridgeArgs(["--thread-id", "dashboard-main"], {
    VTDD_RUNTIME_URL: "https://runtime.example",
    VTDD_GATEWAY_BEARER_TOKEN: "secret-token",
    VTDD_DASHBOARD_CODEX_CWD: "/repo"
  });
  assert.equal(parsed.runtimeUrl, "https://runtime.example");
  assert.equal(parsed.token, "secret-token");
  assert.equal(parsed.threadId, "dashboard-main");
  assert.equal(parsed.cwd, "/repo");
  assert.equal(parsed.sandboxMode, "");
  assert.equal(parsed.reconnectDelayMs, 1000);
});

test("dashboard app-server bridge endpoint uses the dashboard app-server thread WebSocket", () => {
  const endpoint = buildDashboardAppServerBridgeEndpoint({
    runtimeUrl: "https://runtime.example",
    threadId: "dashboard-main-unresolved"
  });

  assert.equal(
    String(endpoint),
    "wss://runtime.example/v2/dashboard/app-server/ws?threadId=dashboard-main-unresolved"
  );
});

test("dashboard app-server bridge resolves one connection when the WebSocket closes", async () => {
  const sockets = [];
  class MockWebSocket {
    constructor(endpoint, protocols) {
      this.endpoint = endpoint;
      this.protocols = protocols;
      this.listeners = new Map();
      this.sent = [];
      sockets.push(this);
    }

    addEventListener(type, handler) {
      if (!this.listeners.has(type)) {
        this.listeners.set(type, new Set());
      }
      this.listeners.get(type).add(handler);
    }

    send(payload) {
      this.sent.push(payload);
    }

    emit(type, event = {}) {
      for (const handler of this.listeners.get(type) || []) {
        handler(event);
      }
    }
  }
  const appServer = {
    nextRequestId() {
      return 1;
    },
    onNotification() {
      return () => {};
    },
    async request() {
      throw new Error("turn handling should not run in this close-only test");
    }
  };

  const once = connectDashboardAppServerBridgeOnce({
    endpoint: new URL("wss://runtime.example/v2/dashboard/app-server/ws?threadId=dashboard-main"),
    token: "secret-token",
    appServer,
    WebSocketImpl: MockWebSocket
  });
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].protocols[0], "vtdd-dashboard-bridge");
  assert.match(sockets[0].protocols[1], /^vtdd-bearer\./);

  sockets[0].emit("close");
  await once;
});

test("dashboard app-server bridge reconnects the dashboard WebSocket without reinitializing app-server", async () => {
  const sockets = [];
  class MockWebSocket {
    constructor(endpoint, protocols) {
      this.endpoint = endpoint;
      this.protocols = protocols;
      this.listeners = new Map();
      sockets.push(this);
    }

    addEventListener(type, handler) {
      if (!this.listeners.has(type)) {
        this.listeners.set(type, new Set());
      }
      this.listeners.get(type).add(handler);
    }

    send() {}

    emit(type, event = {}) {
      for (const handler of this.listeners.get(type) || []) {
        handler(event);
      }
    }
  }
  let initializeCount = 0;
  const appServer = {
    async initialize() {
      initializeCount += 1;
    },
    nextRequestId() {
      return 1;
    },
    onNotification() {
      return () => {};
    },
    async request() {
      throw new Error("turn handling should not run in this reconnect test");
    }
  };

  const running = runDashboardAppServerBridge({
    runtimeUrl: "https://runtime.example",
    token: "secret-token",
    threadId: "dashboard-main",
    cwd: "/repo",
    appServer,
    WebSocketImpl: MockWebSocket,
    reconnectDelayMs: 0,
    reconnectLimit: 1
  });
  await waitFor(() => sockets.length === 1);
  sockets[0].emit("close");
  await waitFor(() => sockets.length === 2);
  sockets[1].emit("close");
  await running;

  assert.equal(initializeCount, 1);
  assert.equal(String(sockets[0].endpoint), "wss://runtime.example/v2/dashboard/app-server/ws?threadId=dashboard-main");
  assert.equal(String(sockets[1].endpoint), "wss://runtime.example/v2/dashboard/app-server/ws?threadId=dashboard-main");
});

async function waitFor(predicate, { timeoutMs = 1000 } = {}) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
