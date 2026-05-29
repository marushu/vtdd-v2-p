import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildDashboardAppServerBridgeEndpoint,
  buildAppServerInitializeRequest,
  buildOwnerActionRequiredPayloadForAppServerApproval,
  buildAppServerRequestApprovalResponse,
  buildAppServerSandboxOverrides,
  buildAppServerThreadResumeRequest,
  buildAppServerThreadStartRequest,
  buildAppServerTurnStartRequest,
  buildDashboardTurnInputText,
  connectDashboardAppServerBridgeOnce,
  extractAppServerNotificationTurnId,
  formatDashboardMediaReferenceLines,
  handleDashboardTurnRequest,
  JsonLineAppServerClient,
  mapAppServerNotificationToDashboardEvent,
  matchesAppServerTurnNotification,
  materializeDashboardMediaReferences,
  parseBridgeArgs,
  postOwnerActionRequiredEvent,
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

test("dashboard app-server bridge wraps repository traffic-control context into turn input", () => {
  const text = buildDashboardTurnInputText({
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 450,
    text: "Dashboard Butler が交通整理できるようにして",
    authority: {
      ordinaryConversationAllowed: true,
      highRiskActionsRequire: ["GO", "passkey_approval"]
    },
    trafficControl: {
      status: "read",
      currentSurface: "dashboard_butler",
      currentNow: "Issue #590: app-server turn timeout must become recoverable.",
      ownerFacingSummary: "現在の Now は Issue #590"
    }
  });

  assert.match(text, /Dashboard Butler turn context/);
  assert.match(text, /repository: marushu\/vtdd-v2-p/);
  assert.match(text, /relatedIssue: #450/);
  assert.match(text, /trafficControlRule/);
  assert.match(text, /repo-backed vtdd-chief-butler/);
  assert.match(text, /operatorUrlRule/);
  assert.match(text, /same-origin absolute URL/);
  assert.match(text, /"currentSurface":"dashboard_butler"/);
  assert.match(text, /"currentNow":"Issue #590: app-server turn timeout must become recoverable\."/);
  assert.match(text, /Butler Completion Gate/);
  assert.match(text, /GO.*passkey approval/);
  assert.match(text, /mechanicalBoundary/);
  assert.match(text, /does not grant app-server command, file-change, patch, or permission escalation approvals/);
  assert.match(text, /Owner message:\nDashboard Butler が交通整理できるようにして/);
});

test("dashboard app-server bridge includes attachment delivery truth in turn input", () => {
  const text = buildDashboardTurnInputText({
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 498,
    text: "添付画像を確認して",
    mediaReferences: [
      {
        mediaId: "med_dashboard_image",
        filename: "dashboard.png",
        contentType: "image/png",
        byteSize: 1234,
        downloadUrl: "/v2/media/med_dashboard_image/download",
        localPath: "/tmp/vtdd-dashboard-media/med_dashboard_image-dashboard.png",
        fetchStatus: "fetched"
      }
    ]
  });

  assert.match(text, /mediaReferences: 1/);
  assert.match(text, /mediaDelivery/);
  assert.match(text, /media\[1\]\.mediaId: med_dashboard_image/);
  assert.match(text, /filename: dashboard\.png/);
  assert.match(text, /contentType: image\/png/);
  assert.match(text, /downloadUrl: \/v2\/media\/med_dashboard_image\/download/);
  assert.match(text, /fetchStatus: fetched/);
  assert.match(text, /localPath: \/tmp\/vtdd-dashboard-media\/med_dashboard_image-dashboard\.png/);
  assert.match(text, /do not claim image analysis if localPath is missing/);
});

test("dashboard app-server bridge formats failed media delivery without raw binary", () => {
  const lines = formatDashboardMediaReferenceLines([
    {
      mediaId: "med_missing",
      filename: "screen.png",
      contentType: "image/png",
      fetchStatus: "fetch_failed",
      fetchError: "media download failed with HTTP 404",
      rawBinary: "fake image bytes"
    }
  ]);

  assert.equal(lines.length, 1);
  assert.match(lines[0], /media\[1\]\.mediaId: med_missing/);
  assert.match(lines[0], /fetchStatus: fetch_failed/);
  assert.match(lines[0], /fetchError: media download failed with HTTP 404/);
  assert.equal(lines[0].includes("fake image bytes"), false);
});

test("dashboard app-server bridge materializes dashboard media with bearer auth", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-bridge-media-test-"));
  const requested = [];
  const references = await materializeDashboardMediaReferences({
    runtimeUrl: "https://runtime.example",
    token: "runtime-token",
    tmpRoot,
    mediaReferences: [
      {
        mediaId: "med_fetchable",
        filename: "screen shot.png",
        contentType: "image/png",
        downloadUrl: "/v2/media/med_fetchable/download"
      }
    ],
    fetchImpl: async (url, options) => {
      requested.push({ url: String(url), authorization: options.headers.authorization });
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" }
      });
    }
  });

  assert.equal(requested[0].url, "https://runtime.example/v2/media/med_fetchable/download");
  assert.equal(requested[0].authorization, "Bearer runtime-token");
  assert.equal(references[0].fetchStatus, "fetched");
  assert.match(references[0].localPath, /vtdd-dashboard-media/);
  assert.match(references[0].localPath, /med_fetchable-screen_shot\.png$/);
  assert.deepEqual([...await fs.readFile(references[0].localPath)], [0x89, 0x50, 0x4e, 0x47]);
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

test("dashboard app-server bridge answers command approvals without granting execution", () => {
  assert.deepEqual(
    buildAppServerRequestApprovalResponse({
      id: 0,
      method: "item/commandExecution/requestApproval",
      params: { commandActions: [{ type: "read" }] }
    }),
    { id: 0, result: { decision: "decline" } }
  );
  assert.deepEqual(
    buildAppServerRequestApprovalResponse({
      id: 32,
      method: "execCommandApproval",
      params: { parsedCmd: [{ type: "search" }] }
    }),
    { id: 32, result: { decision: "denied" } }
  );
});

test("dashboard app-server bridge declines write, patch, permission, and unsafe command approvals", () => {
  assert.deepEqual(
    buildAppServerRequestApprovalResponse({
      id: 41,
      method: "item/commandExecution/requestApproval",
      params: { commandActions: [{ type: "write" }] }
    }),
    { id: 41, result: { decision: "decline" } }
  );
  assert.deepEqual(
    buildAppServerRequestApprovalResponse({
      id: 42,
      method: "item/fileChange/requestApproval",
      params: {}
    }),
    { id: 42, result: { decision: "decline" } }
  );
  assert.deepEqual(
    buildAppServerRequestApprovalResponse({
      id: 43,
      method: "applyPatchApproval",
      params: {}
    }),
    { id: 43, result: { decision: "denied" } }
  );
  assert.deepEqual(
    buildAppServerRequestApprovalResponse({
      id: 44,
      method: "item/permissions/requestApproval",
      params: {}
    }),
    {
      id: 44,
      error: {
        code: -32001,
        message: "Dashboard bridge does not grant app-server permission escalation"
      }
    }
  );
  assert.deepEqual(
    buildAppServerRequestApprovalResponse({
      id: 45,
      method: "future/requestApproval",
      params: {}
    }),
    {
      id: 45,
      error: {
        code: -32601,
        message: "Dashboard bridge does not support app-server request method: future/requestApproval"
      }
    }
  );
});

test("dashboard app-server bridge writes JSON-RPC responses for app-server approval requests", async () => {
  const client = new JsonLineAppServerClient({ command: "unused" });
  const writes = [];
  const notifications = [];
  const approvals = [];
  client.child = {
    stdin: {
      write(chunk) {
        writes.push(JSON.parse(String(chunk).trim()));
      }
    },
    kill() {}
  };
  client.onNotification((message) => notifications.push(message));
  client.setApprovalRequestHandler(({ message, approvalResponse }) => {
    approvals.push({ message, approvalResponse });
  });

  client.handleChunk(
    [
      JSON.stringify({
        id: 0,
        method: "item/commandExecution/requestApproval",
        params: {
          cwd: "/repo",
          commandActions: [{ type: "read", path: "package.json" }]
        }
      }),
      JSON.stringify({
        id: 1,
        method: "future/requestApproval",
        params: {}
      }),
      JSON.stringify({
        method: "turn/started",
        params: { threadId: "codex-thread-1" }
      })
    ].join("\n") + "\n"
  );
  await client.drainApprovalRequests();

  assert.deepEqual(writes, [
    { id: 0, result: { decision: "decline" } },
    {
      id: 1,
      error: {
        code: -32601,
        message: "Dashboard bridge does not support app-server request method: future/requestApproval"
      }
    }
  ]);
  assert.equal(approvals.length, 2);
  assert.equal(approvals[0].message.method, "item/commandExecution/requestApproval");
  assert.deepEqual(approvals[0].approvalResponse, { id: 0, result: { decision: "decline" } });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].method, "turn/started");
});

test("dashboard app-server bridge captures approval notification handler failures", async () => {
  const client = new JsonLineAppServerClient({
    command: "unused",
    onApprovalRequest: async () => {
      throw new Error("runtime unavailable");
    }
  });
  const writes = [];
  client.child = {
    stdin: {
      write(chunk) {
        writes.push(JSON.parse(String(chunk).trim()));
      }
    },
    kill() {}
  };

  client.handleChunk(
    JSON.stringify({
      id: 7,
      method: "item/commandExecution/requestApproval",
      params: {}
    }) + "\n"
  );
  await client.drainApprovalRequests();
  assert.deepEqual(writes, [{ id: 7, result: { decision: "decline" } }]);
  assert.equal(client.lastApprovalRequestError, "runtime unavailable");
});

test("dashboard app-server bridge builds owner-action-required payloads for approval requests", () => {
  const payload = buildOwnerActionRequiredPayloadForAppServerApproval({
    message: {
      id: 44,
      method: "item/permissions/requestApproval",
      params: { reason: "needs permission escalation" }
    },
    request: {
      threadId: "dashboard-main",
      codexThreadId: "codex-thread-1",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 637
    },
    dashboardThreadId: "dashboard-main",
    codexThreadId: "codex-thread-1",
    approvalResponse: {
      id: 44,
      error: {
        code: -32001,
        message: "Dashboard bridge does not grant app-server permission escalation"
      }
    }
  });
  assert.equal(payload.repository, "marushu/vtdd-v2-p");
  assert.equal(payload.actionId, "app-server-approval:dashboard-main:codex-thread-1:item-permissions-requestApproval:44");
  assert.equal(payload.issueNumber, 637);
  assert.equal(payload.workflowName, "dashboard-app-server-bridge");
  assert.equal(payload.url, "/dashboard/notifications?focus=owner-action");
  assert.match(payload.summary, /item\/permissions\/requestApproval/);
  assert.equal(
    buildOwnerActionRequiredPayloadForAppServerApproval({
      message: { id: 1, method: "item/commandExecution/requestApproval" },
      request: { repository: "", threadId: "dashboard-main" }
    }),
    null
  );
});

test("dashboard app-server bridge removes colon ambiguity from owner-action action id components", () => {
  const payload = buildOwnerActionRequiredPayloadForAppServerApproval({
    message: {
      id: "request:44",
      method: "item/permissions/requestApproval"
    },
    request: {
      threadId: "dashboard:main",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 637
    },
    dashboardThreadId: "dashboard:main",
    codexThreadId: "codex:thread:1",
    approvalResponse: {
      id: "request:44",
      error: {
        code: -32001,
        message: "Dashboard bridge does not grant app-server permission escalation"
      }
    }
  });

  assert.equal(payload.actionId, "app-server-approval:dashboard-main:codex-thread-1:item-permissions-requestApproval:request-44");
});

test("dashboard app-server bridge posts owner-action-required event with bearer auth", async () => {
  const calls = [];
  const result = await postOwnerActionRequiredEvent({
    runtimeUrl: "https://runtime.example",
    token: "runtime-token",
    payload: {
      repository: "marushu/vtdd-v2-p",
      actionId: "app-server-approval:dashboard-main:codex-thread-1:item-permissions-requestApproval:44",
      title: "Codex app-server approval request",
      summary: "Dashboard bridge declined item/permissions/requestApproval; owner attention may be required.",
      issueNumber: 637,
      workflowName: "dashboard-app-server-bridge",
      url: "/dashboard/notifications?focus=owner-action"
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 202 });
    }
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].url, "https://runtime.example/v2/events/owner-action-required");
  assert.equal(calls[0].init.headers.authorization, "Bearer runtime-token");
  assert.equal(JSON.parse(calls[0].init.body).issueNumber, 637);
});

test("dashboard app-server bridge returns structured owner-action-required post failures", async () => {
  const failed = await postOwnerActionRequiredEvent({
    runtimeUrl: "not a url",
    token: "runtime-token",
    payload: {
      repository: "marushu/vtdd-v2-p",
      actionId: "app-server-approval",
      title: "Codex app-server approval request",
      summary: "approval needed",
      url: "/dashboard/notifications?focus=owner-action"
    },
    fetchImpl: async () => new Response(null, { status: 202 })
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.error, "owner_action_required_post_failed");
});

test("dashboard app-server bridge resolves pending JSON-RPC response id zero", async () => {
  const client = new JsonLineAppServerClient({ command: "unused" });
  const writes = [];
  client.nextId = 0;
  client.child = {
    stdin: {
      write(chunk) {
        writes.push(JSON.parse(String(chunk).trim()));
      }
    },
    kill() {}
  };

  const pending = client.request({ method: "thread/start", params: {} });
  assert.equal(writes[0].id, 0);
  client.handleChunk(JSON.stringify({ id: 0, result: { thread: { id: "codex-thread-0" } } }) + "\n");

  assert.deepEqual(await pending, { thread: { id: "codex-thread-0" } });
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

test("dashboard app-server bridge posts owner-action-required when app-server requests approval during a turn", async () => {
  const events = [];
  const runtimeCalls = [];
  const handlers = new Set();
  let nextId = 1;
  let approvalHandler = null;
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
    setApprovalRequestHandler(handler) {
      approvalHandler = handler;
      return () => {
        approvalHandler = null;
      };
    },
    async request(message) {
      if (message.method === "thread/start") {
        return { thread: { id: "codex-thread-approval" } };
      }
      if (message.method === "turn/start") {
        await approvalHandler({
          message: {
            id: 7,
            method: "item/commandExecution/requestApproval",
            params: { commandActions: [{ type: "read", path: "package.json" }] }
          },
          approvalResponse: { id: 7, result: { decision: "decline" } }
        });
        for (const handler of handlers) {
          handler({
            method: "turn/completed",
            params: {
              threadId: "codex-thread-approval",
              turn: { id: "turn-approval", status: "completed" }
            }
          });
        }
        return { turn: { id: "turn-approval" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  await handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      codexThreadId: null,
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 637,
      text: "VPS の状態を見て"
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    cwd: "/repo",
    runtimeUrl: "https://runtime.example",
    token: "runtime-token",
    fetchImpl: async (url, init) => {
      runtimeCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 202 });
    }
  });

  assert.equal(runtimeCalls.length, 1);
  assert.equal(runtimeCalls[0].url, "https://runtime.example/v2/events/owner-action-required");
  const body = JSON.parse(runtimeCalls[0].init.body);
  assert.equal(body.repository, "marushu/vtdd-v2-p");
  assert.equal(body.actionId, "app-server-approval:dashboard-main:codex-thread-approval:item-commandExecution-requestApproval:7");
  assert.equal(body.issueNumber, 637);
  assert.equal(body.url, "/dashboard/notifications?focus=owner-action");
  assert.equal(events.at(-1).type, "app_server_reply");
});

test("dashboard app-server bridge records owner-action notification failure in dashboard thread", async () => {
  const events = [];
  let approvalHandler = null;
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
    setApprovalRequestHandler(handler) {
      approvalHandler = handler;
      return () => {
        approvalHandler = null;
      };
    },
    async request(message) {
      if (message.method === "thread/start") {
        return { thread: { id: "codex-thread-failed-notify" } };
      }
      if (message.method === "turn/start") {
        await approvalHandler({
          message: {
            id: 8,
            method: "item/permissions/requestApproval",
            params: {}
          },
          approvalResponse: { id: 8, error: { code: -32001, message: "denied" } }
        });
        for (const handler of handlers) {
          handler({
            method: "turn/completed",
            params: {
              threadId: "codex-thread-failed-notify",
              turn: { id: "turn-failed-notify", status: "completed" }
            }
          });
        }
        return { turn: { id: "turn-failed-notify" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  await handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 637,
      text: "権限が必要な確認をして"
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    runtimeUrl: "https://runtime.example",
    token: "runtime-token",
    fetchImpl: async () => new Response(null, { status: 503 })
  });

  const failure = events.find((event) => event.status === "owner_action_notification_failed");
  assert.ok(failure);
  assert.equal(failure.type, "app_server_turn_failed");
  assert.match(failure.text, /owner action PWA通知を送信できませんでした/);
});

test("dashboard app-server bridge drains real client approval notification tasks before normal turn cleanup", async () => {
  const events = [];
  const runtimeCalls = [];
  let postFinished = false;
  const client = new JsonLineAppServerClient({ command: "unused" });
  client.child = {
    stdin: {
      write(chunk) {
        const message = JSON.parse(String(chunk).trim());
        if (message.method === "thread/start") {
          setTimeout(() => {
            client.handleChunk(
              JSON.stringify({
                id: message.id,
                result: { thread: { id: "codex-thread-drain" } }
              }) + "\n"
            );
          }, 0);
          return;
        }
        if (message.method === "turn/start") {
          setTimeout(() => {
            client.handleChunk(
              JSON.stringify({
                id: 99,
                method: "item/commandExecution/requestApproval",
                params: {}
              }) + "\n"
            );
            client.handleChunk(
              JSON.stringify({
                id: message.id,
                result: { turn: { id: "turn-drain" } }
              }) + "\n"
            );
            client.handleChunk(
              JSON.stringify({
                method: "turn/completed",
                params: {
                  threadId: "codex-thread-drain",
                  turn: { id: "turn-drain", status: "completed" }
                }
              }) + "\n"
            );
          }, 0);
        }
      }
    },
    kill() {}
  };

  await handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 637,
      text: "権限が必要な確認をして"
    },
    appServer: client,
    sendDashboardEvent: async (event) => events.push(event),
    runtimeUrl: "https://runtime.example",
    token: "runtime-token",
    fetchImpl: async (url, init) => {
      runtimeCalls.push({ url: String(url), init });
      await new Promise((resolve) => setTimeout(resolve, 20));
      postFinished = true;
      return new Response(null, { status: 202 });
    }
  });

  assert.equal(postFinished, true);
  assert.equal(runtimeCalls.length, 1);
  assert.equal(
    JSON.parse(runtimeCalls[0].init.body).actionId,
    "app-server-approval:dashboard-main:codex-thread-drain:item-commandExecution-requestApproval:99"
  );
  assert.equal(events.at(-1).type, "app_server_reply");
});

test("dashboard app-server bridge passes traffic-control context to codex app-server turns", async () => {
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
        return { thread: { id: "codex-thread-traffic" } };
      }
      if (message.method === "turn/start") {
        for (const handler of handlers) {
          handler({
            method: "item/agentMessage/delta",
            params: {
              threadId: "codex-thread-traffic",
              turnId: "turn-traffic",
              delta: "交通整理します。"
            }
          });
          handler({
            method: "turn/completed",
            params: {
              threadId: "codex-thread-traffic",
              turn: { id: "turn-traffic", status: "completed" }
            }
          });
        }
        return { turn: { id: "turn-traffic" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  await handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      codexThreadId: null,
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 450,
      text: "Dashboard Butler が交通整理できるか確認して",
      authority: {
        ordinaryConversationAllowed: true,
        repositoryRequired: false,
        highRiskActionsRequire: ["GO", "passkey_approval"]
      },
      trafficControl: {
        status: "read",
        currentSurface: "dashboard_butler",
        currentNow: "Issue #590: app-server turn timeout must become recoverable.",
        sectionSummaries: {
          "Root Blockers": {
            firstBullet: "Issue #450: Dashboard Butler live runtime remains central."
          }
        }
      }
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    cwd: "/repo"
  });

  const turnStart = requests.find((request) => request.method === "turn/start");
  assert.ok(turnStart);
  const inputText = turnStart.params.input[0].text;
  assert.match(inputText, /repository: marushu\/vtdd-v2-p/);
  assert.match(inputText, /relatedIssue: #450/);
  assert.match(inputText, /trafficControlRule/);
  assert.match(inputText, /repo-backed vtdd-chief-butler/);
  assert.match(inputText, /operatorUrlRule/);
  assert.match(inputText, /same-origin absolute URL/);
  assert.match(inputText, /"currentSurface":"dashboard_butler"/);
  assert.match(inputText, /"currentNow":"Issue #590: app-server turn timeout must become recoverable\."/);
  assert.match(inputText, /mechanicalBoundary/);
  assert.match(inputText, /Owner message:\nDashboard Butler が交通整理できるか確認して/);
  assert.equal(events.at(-1).type, "app_server_reply");
});

test("dashboard app-server bridge passes materialized media paths to codex app-server turns", async () => {
  const requests = [];
  const events = [];
  const handlers = new Set();
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-bridge-turn-media-test-"));
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
        return { thread: { id: "codex-thread-media" } };
      }
      if (message.method === "turn/start") {
        for (const handler of handlers) {
          handler({
            method: "turn/completed",
            params: {
              threadId: "codex-thread-media",
              turn: { id: "turn-media", status: "completed" }
            }
          });
        }
        return { turn: { id: "turn-media" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  await handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      codexThreadId: null,
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 498,
      text: "添付画像を確認して",
      mediaReferences: [
        {
          mediaId: "med_turn_image",
          filename: "dashboard.png",
          contentType: "image/png",
          downloadUrl: "/v2/media/med_turn_image/download"
        }
      ]
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    cwd: "/repo",
    runtimeUrl: "https://runtime.example",
    token: "runtime-token",
    mediaTmpRoot: tmpRoot,
    fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })
  });

  const turnStart = requests.find((request) => request.method === "turn/start");
  assert.ok(turnStart);
  const inputText = turnStart.params.input[0].text;
  assert.match(inputText, /mediaReferences: 1/);
  assert.match(inputText, /fetchStatus: fetched/);
  assert.match(inputText, /localPath: .*med_turn_image-dashboard\.png/);
  assert.equal(events.at(-1).type, "app_server_reply");
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
    cwd: "/repo"
  });

  assert.deepEqual(
    requests.map((request) => request.method),
    ["thread/start", "turn/start"]
  );
  assert.equal(events.at(-2).type, "app_server_reply_delta");
  assert.equal(events.at(-1).type, "app_server_reply");
  assert.equal(events.at(-1).text, "非同期で返りました。");
  assert.equal(events.some((event) => event.type === "app_server_turn_failed"), false);
  assert.equal(handlers.size, 0);
});

test("dashboard app-server bridge sends Japanese recoverable timeout failure", async () => {
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
        return { thread: { id: "codex-thread-timeout" } };
      }
      if (message.method === "turn/start") {
        return { turn: { id: "turn-timeout" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  await handleDashboardTurnRequest({
      request: {
        threadId: "dashboard-main",
        repository: "marushu/vtdd-v2-p",
        relatedIssue: 590,
        text: "timeout を再現して"
      },
      appServer,
      sendDashboardEvent: async (event) => events.push(event),
      cwd: "/repo",
      turnTimeoutMs: 1,
      lateCompletionTimeoutMs: 1
    });

  const timeoutEvent = events.find((event) => event.type === "app_server_turn_failed");
  assert.ok(timeoutEvent);
  assert.equal(timeoutEvent.status, "timeout");
  assert.equal(timeoutEvent.threadId, "dashboard-main");
  assert.equal(timeoutEvent.repository, "marushu/vtdd-v2-p");
  assert.equal(timeoutEvent.relatedIssue, 590);
  assert.match(timeoutEvent.text, /入力は Dashboard thread に保存済み/);
  assert.doesNotMatch(timeoutEvent.text, /timed out before completion/);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(handlers.size, 0);
});

test("dashboard app-server bridge persists late completion after timeout instead of losing the final reply", async () => {
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
        return { thread: { id: "codex-thread-late" } };
      }
      if (message.method === "turn/start") {
        return { turn: { id: "turn-late" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  await handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 590,
      text: "PR 作成まで進めて"
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    cwd: "/repo",
    turnTimeoutMs: 1,
    lateCompletionTimeoutMs: 1000
  });

  assert.equal(events.filter((event) => event.type === "app_server_turn_failed").length, 1);
  assert.equal(handlers.size, 1);

  for (const handler of handlers) {
    handler({
      method: "item/agentMessage/delta",
      params: {
        threadId: "codex-thread-late",
        turnId: "turn-late",
        delta: "PR #632 を Draft で作成済みです。"
      }
    });
    handler({
      method: "turn/completed",
      params: {
        threadId: "codex-thread-late",
        turn: { id: "turn-late", status: "completed" }
      }
    });
  }

  const finalReply = events.find((event) => event.type === "app_server_reply");
  assert.ok(finalReply);
  assert.equal(finalReply.threadId, "dashboard-main");
  assert.equal(finalReply.codexThreadId, "codex-thread-late");
  assert.equal(finalReply.text, "PR #632 を Draft で作成済みです。");
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

test("dashboard app-server bridge sends one Japanese failure for app-server error notifications", async () => {
  const sockets = [];
  const handlers = new Set();
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
    onNotification(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    async request(message) {
      if (message.method === "thread/start") {
        return { thread: { id: "codex-thread-error" } };
      }
      if (message.method === "turn/start") {
        for (const handler of handlers) {
          handler({
            method: "error",
            params: {
              threadId: "codex-thread-error",
              turnId: "turn-error"
            }
          });
        }
        return { turn: { id: "turn-error" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  const once = connectDashboardAppServerBridgeOnce({
    endpoint: new URL("wss://runtime.example/v2/dashboard/app-server/ws?threadId=dashboard-main"),
    token: "secret-token",
    appServer,
    WebSocketImpl: MockWebSocket
  });
  const socket = sockets[0];
  socket.emit("message", {
    data: JSON.stringify({
      type: "app_server_turn_requested",
      threadId: "dashboard-main",
      text: "画像アップロードテスト"
    })
  });

  await waitFor(() => socket.sent.map((payload) => JSON.parse(payload)).some((payload) => payload.type === "app_server_turn_failed"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const failures = socket.sent.map((payload) => JSON.parse(payload)).filter((payload) => payload.type === "app_server_turn_failed");
  assert.equal(failures.length, 1);
  const failure = failures[0];
  assert.equal(failure.type, "app_server_turn_failed");
  assert.equal(failure.threadId, "dashboard-main");
  assert.match(failure.text, /codex app-server が応答生成中に失敗しました/);
  socket.emit("close");
  await once;
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
  assert.equal(parsed.turnTimeoutMs, 0);
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
  const parsed = parseBridgeArgs(["--thread-id", "dashboard-main", "--turn-timeout-ms", "1500"], {
    VTDD_RUNTIME_URL: "https://runtime.example",
    VTDD_GATEWAY_BEARER_TOKEN: "secret-token",
    VTDD_DASHBOARD_CODEX_CWD: "/repo",
    VTDD_DASHBOARD_APP_SERVER_TURN_TIMEOUT_MS: "0"
  });
  assert.equal(parsed.runtimeUrl, "https://runtime.example");
  assert.equal(parsed.token, "secret-token");
  assert.equal(parsed.threadId, "dashboard-main");
  assert.equal(parsed.cwd, "/repo");
  assert.equal(parsed.sandboxMode, "");
  assert.equal(parsed.turnTimeoutMs, 1500);
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
