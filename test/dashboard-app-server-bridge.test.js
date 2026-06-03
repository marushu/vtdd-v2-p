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
  buildVpsRunnerWakeupCommand,
  buildAppServerThreadResumeRequest,
  buildAppServerThreadStartRequest,
  buildAppServerTurnStartRequest,
  buildDashboardBridgeConnectedEvent,
  buildDashboardBridgeResumeStatusEvent,
  buildDashboardBridgeTurnStartedStatusEvent,
  buildDashboardTurnInputText,
  collectDashboardBridgeRepoSyncStatus,
  connectDashboardAppServerBridgeOnce,
  ensureDashboardBridgeRepoSynced,
  executeVpsRunnerWakeup,
  extractAppServerNotificationTurnId,
  formatDashboardMediaReferenceLines,
  handleDashboardTurnRequest,
  isAppServerActivityNotification,
  JsonLineAppServerClient,
  mapAppServerNotificationToDashboardEvent,
  matchesAppServerTurnNotification,
  materializeDashboardMediaReferences,
  parseBridgeArgs,
  parseDashboardDebugSlowTurnRequest,
  postOwnerActionRequiredEvent,
  runDashboardAppServerBridge,
  runDashboardDebugSlowTurn
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
  assert.match(start.params.developerInstructions, /concrete file, command, PR, reviewer state, merge state, deploy state/);
  assert.match(start.params.developerInstructions, /ファイルの修正・変更が完了しました。現在コミット中です。/);
  assert.match(start.params.developerInstructions, /マージされました。今回はデプロイが必要です。ここにデプロイURL。/);
  assert.match(start.params.developerInstructions, /avoid one long paragraph of accumulated work/);

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

test("dashboard app-server bridge formats lifecycle resume status events", () => {
  const connected = buildDashboardBridgeConnectedEvent({
    endpoint: "wss://runtime.example/v2/dashboard/app-server/ws?threadId=dashboard-main-unresolved",
    cwd: "/repo",
    resumedAt: "2026-06-02T00:00:00.000Z"
  });
  assert.equal(connected.type, "app_server_status");
  assert.equal(connected.threadId, "dashboard-main-unresolved");
  assert.equal(connected.status, "bridge_connected");
  assert.equal(connected.stage, "bridge_connected");
  assert.match(connected.text, /保存済み文脈/);
  assert.equal(connected.bridgeLifecycle.cwd, "/repo");

  const resumed = buildDashboardBridgeResumeStatusEvent({
    dashboardThreadId: "dashboard-main-unresolved",
    codexThreadId: "codex-thread-741",
    messageId: "owner-message-1",
    resumedAt: "2026-06-02T00:00:01.000Z"
  });
  assert.equal(resumed.status, "resumed_existing_thread");
  assert.equal(resumed.stage, "thread_resume");
  assert.equal(resumed.codexThreadId, "codex-thread-741");
  assert.equal(resumed.bridgeLifecycle.messageId, "owner-message-1");
  assert.match(resumed.text, /前の文脈から続けられます/);

  const turnStarted = buildDashboardBridgeTurnStartedStatusEvent({
    dashboardThreadId: "dashboard-main-unresolved",
    codexThreadId: "codex-thread-741",
    turnId: "turn-741",
    messageId: "owner-message-1",
    resumedExistingThread: true,
    startedAt: "2026-06-02T00:00:02.000Z"
  });
  assert.equal(turnStarted.status, "turn_started");
  assert.equal(turnStarted.stage, "turn_started");
  assert.equal(turnStarted.bridgeLifecycle.turnId, "turn-741");
  assert.equal(turnStarted.bridgeLifecycle.resumedExistingThread, true);
  assert.match(turnStarted.text, /復帰した Codex thread/);
});

test("dashboard app-server bridge runner wakeup uses only fixed user systemd start command", async () => {
  assert.deepEqual(buildVpsRunnerWakeupCommand(), {
    command: "systemctl",
    args: ["--user", "start", "vtdd-vps-runner.service"],
    shell: false
  });

  const spawnCalls = [];
  const result = await executeVpsRunnerWakeup({
    request: {
      threadId: "dashboard-main",
      requestId: "runner-wakeup:test",
      executionId: "remote-codex-issue717",
      repository: "marushu/vtdd-v2-p",
      issueNumber: 717,
      queueCommentUrl: "https://github.com/marushu/vtdd-v2-p/issues/717#issuecomment-1"
    },
    now: (() => {
      const values = ["2026-06-01T00:00:00.000Z", "2026-06-01T00:00:01.000Z"];
      return () => values.shift() || "2026-06-01T00:00:01.000Z";
    })(),
    spawnImpl(command, args, options) {
      spawnCalls.push({ command, args, options });
      const listeners = new Map();
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        on(type, handler) {
          listeners.set(type, handler);
          if (type === "close") {
            queueMicrotask(() => handler(0));
          }
        }
      };
    }
  });

  assert.equal(spawnCalls.length, 1);
  assert.deepEqual(spawnCalls[0], {
    command: "systemctl",
    args: ["--user", "start", "vtdd-vps-runner.service"],
    options: { shell: false, stdio: ["ignore", "pipe", "pipe"] }
  });
  assert.equal(result.type, "runner_wakeup_result");
  assert.equal(result.status, "started");
  assert.equal(result.attempted, true);
  assert.equal(result.fallback, "vtdd-vps-runner.timer");
  assert.equal(result.threadId, "dashboard-main");
  assert.equal(result.executionId, "remote-codex-issue717");
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
  assert.equal(delta.progressText, "返答");

  const accumulatedDelta = mapAppServerNotificationToDashboardEvent(
    {
      method: "item/agentMessage/delta",
      params: {
        threadId: "codex-thread-1",
        turnId: "turn-1",
        delta: "次を確認します。"
      }
    },
    { dashboardThreadId: "dashboard-main", codexThreadId: "codex-thread-1", accumulatedText: "Issue #590 を確認しています。\n\n" }
  );
  assert.equal(accumulatedDelta.text, "次を確認します。");
  assert.equal(accumulatedDelta.progressText, "Issue #590 を確認しています。\n\n次を確認します。");

  const readableProgress = mapAppServerNotificationToDashboardEvent(
    {
      method: "item/agentMessage/delta",
      params: {
        threadId: "codex-thread-1",
        turnId: "turn-1",
        delta:
          "進行確認を始めます。対象は Issue #590 / PR #733 です。次は queue と bridge runtime を確認します。"
      }
    },
    { dashboardThreadId: "dashboard-main", codexThreadId: "codex-thread-1" }
  );
  assert.equal(
    readableProgress.progressText,
    [
      "進行確認を始めます。",
      "対象は Issue #590 / PR #733 です。",
      "次は queue と bridge runtime を確認します。"
    ].join("\n")
  );

  const completed = mapAppServerNotificationToDashboardEvent(
    { method: "turn/completed", params: { threadId: "codex-thread-1" } },
    { dashboardThreadId: "dashboard-main", codexThreadId: "codex-thread-1", accumulatedText: "最終返答" }
  );
  assert.equal(completed.type, "app_server_status");
  assert.equal(completed.status, "replied");
  assert.equal(completed.text, "最終返答");

  const started = mapAppServerNotificationToDashboardEvent(
    { method: "turn/started", params: { threadId: "codex-thread-1", turnId: "turn-1" } },
    { dashboardThreadId: "dashboard-main", codexThreadId: "codex-thread-1" }
  );
  assert.equal(started.type, "app_server_status");
  assert.equal(started.persistProgress, true);
  assert.equal(started.text, "codex app-server が応答を生成しています。");

  const plan = mapAppServerNotificationToDashboardEvent(
    { method: "turn/plan/updated", params: { threadId: "codex-thread-1", turnId: "turn-1", delta: "Issue #590 の runtime mapping を確認します。" } },
    { dashboardThreadId: "dashboard-main", codexThreadId: "codex-thread-1" }
  );
  assert.equal(plan.type, "app_server_status");
  assert.equal(plan.stage, "planning");
  assert.equal(plan.persistProgress, true);
  assert.equal(plan.text, "方針を整理しています。\nIssue #590 の runtime mapping を確認します。");

  const command = mapAppServerNotificationToDashboardEvent(
    { method: "item/commandExecution/outputDelta", params: { threadId: "codex-thread-1", turnId: "turn-1", command: "node --test test/worker.test.js", delta: "250 tests passed" } },
    { dashboardThreadId: "dashboard-main", codexThreadId: "codex-thread-1" }
  );
  assert.equal(command.type, "app_server_status");
  assert.equal(command.stage, "command");
  assert.equal(command.persistProgress, true);
  assert.equal(command.text, "コマンドを実行しています。\n対象: node --test test/worker.test.js\n250 tests passed");

  const diff = mapAppServerNotificationToDashboardEvent(
    { method: "turn/diff/updated", params: { threadId: "codex-thread-1", turnId: "turn-1", path: "src/worker/runtime.js", delta: "composer progress の重複 status を外します。" } },
    { dashboardThreadId: "dashboard-main", codexThreadId: "codex-thread-1" }
  );
  assert.equal(diff.type, "app_server_status");
  assert.equal(diff.stage, "file_change");
  assert.equal(diff.persistProgress, true);
  assert.equal(diff.text, "ファイル変更を確認しています。\n対象: src/worker/runtime.js\ncomposer progress の重複 status を外します。");

  const nestedDiff = mapAppServerNotificationToDashboardEvent(
    {
      method: "item/fileChange/patchUpdated",
      params: {
        threadId: "codex-thread-1",
        turnId: "turn-1",
        item: {
          files: [
            { path: "scripts/run-dashboard-app-server-bridge.mjs" },
            { path: "test/dashboard-app-server-bridge.test.js" }
          ]
        },
        diff: "@@ -1 +1 @@\n-ざっくり\n+対象ファイル名も出す"
      }
    },
    { dashboardThreadId: "dashboard-main", codexThreadId: "codex-thread-1" }
  );
  assert.equal(
    nestedDiff.text,
    [
      "ファイル変更を確認しています。",
      "対象: scripts/run-dashboard-app-server-bridge.mjs, test/dashboard-app-server-bridge.test.js",
      "@@ -1 +1 @@",
      "-ざっくり",
      "+対象ファイル名も出す"
    ].join("\n")
  );

  const commandAction = mapAppServerNotificationToDashboardEvent(
    {
      method: "item/commandExecution/outputDelta",
      params: {
        threadId: "codex-thread-1",
        turnId: "turn-1",
        item: {
          commandActions: [{ command: "git diff -- src/worker/runtime.js" }]
        },
        output: "diff --git a/src/worker/runtime.js b/src/worker/runtime.js"
      }
    },
    { dashboardThreadId: "dashboard-main", codexThreadId: "codex-thread-1" }
  );
  assert.equal(
    commandAction.text,
    [
      "コマンドを実行しています。",
      "対象: git diff -- src/worker/runtime.js",
      "diff --git a/src/worker/runtime.js b/src/worker/runtime.js"
    ].join("\n")
  );

  const toolProgress = mapAppServerNotificationToDashboardEvent(
    { method: "item/mcpToolCall/progress", params: { threadId: "codex-thread-1", turnId: "turn-1", message: "raw provider progress" } },
    { dashboardThreadId: "dashboard-main", codexThreadId: "codex-thread-1" }
  );
  assert.equal(toolProgress.type, "app_server_status");
  assert.equal(toolProgress.stage, "tool_call");
  assert.equal(toolProgress.persistProgress, true);
  assert.equal(toolProgress.text, "外部ツールの結果を待っています。");
  assert.doesNotMatch(toolProgress.text, /raw provider progress/);

  assert.equal(isAppServerActivityNotification({ method: "item/reasoning/summaryTextDelta", params: {} }), true);
  assert.equal(isAppServerActivityNotification({ method: "thread/status/changed", params: {} }), false);
  assert.equal(
    isAppServerActivityNotification({
      method: "thread/status/changed",
      params: { status: { activeFlags: ["waitingOnApproval"] } }
    }),
    true
  );
  assert.equal(
    isAppServerActivityNotification({
      method: "thread/status/changed",
      params: { status: { activeFlags: ["waitingOnUserInput"] } }
    }),
    true
  );
  assert.equal(isAppServerActivityNotification({ method: "warning", params: {} }), false);
  assert.equal(isAppServerActivityNotification({ method: "model/rerouted", params: {} }), false);
  assert.equal(isAppServerActivityNotification({ method: "item/reasoning/textDelta", params: {} }), true);
  assert.equal(isAppServerActivityNotification({ method: "item/started", params: { item: { type: "reasoning" } } }), false);
  assert.equal(isAppServerActivityNotification({ method: "item/started", params: { item: { type: "commandExecution" } } }), true);
  assert.equal(isAppServerActivityNotification({ method: "thread/name/updated", params: {} }), false);
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
  const turnStarted = events.find((event) => event.status === "turn_started");
  assert.ok(turnStarted);
  assert.equal(turnStarted.codexThreadId, "codex-thread-1");
  assert.equal(turnStarted.bridgeLifecycle.turnId, "turn-1");
  assert.equal(turnStarted.bridgeLifecycle.resumedExistingThread, false);
  const delta = events.find((event) => event.type === "app_server_reply_delta");
  const reply = events.find((event) => event.type === "app_server_reply");
  assert.ok(delta);
  assert.ok(reply);
  assert.equal(reply.text, "今日は2026年5月22日です。");
});

test("dashboard app-server bridge resumes an existing Codex thread and reports resume state", async () => {
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
      if (message.method === "thread/resume") {
        return { thread: { id: "codex-thread-existing" } };
      }
      if (message.method === "turn/start") {
        for (const handler of handlers) {
          handler({
            method: "item/agentMessage/delta",
            params: {
              threadId: "codex-thread-existing",
              turnId: "turn-resumed",
              delta: "続きから確認しています。"
            }
          });
          handler({
            method: "turn/completed",
            params: {
              threadId: "codex-thread-existing",
              turn: { id: "turn-resumed", status: "completed" }
            }
          });
        }
        return { turn: { id: "turn-resumed" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  await handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main-unresolved",
      codexThreadId: "codex-thread-existing",
      messageId: "owner-message-resume",
      text: "続きは？"
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    cwd: "/repo"
  });

  assert.deepEqual(
    requests.map((request) => request.method),
    ["thread/resume", "turn/start"]
  );
  const resumed = events.find((event) => event.status === "resumed_existing_thread");
  assert.ok(resumed);
  assert.equal(resumed.threadId, "dashboard-main-unresolved");
  assert.equal(resumed.codexThreadId, "codex-thread-existing");
  assert.equal(resumed.bridgeLifecycle.messageId, "owner-message-resume");
  const turnStarted = events.find((event) => event.status === "turn_started");
  assert.ok(turnStarted);
  assert.equal(turnStarted.bridgeLifecycle.turnId, "turn-resumed");
  assert.equal(turnStarted.bridgeLifecycle.resumedExistingThread, true);
  const reply = events.find((event) => event.type === "app_server_reply");
  assert.ok(reply);
  assert.equal(reply.text, "続きから確認しています。");
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
  assert.ok(events.find((event) => event.type === "app_server_reply"));
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
  assert.ok(events.find((event) => event.type === "app_server_reply"));
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
  assert.ok(events.find((event) => event.type === "app_server_reply"));
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
  assert.ok(events.find((event) => event.type === "app_server_reply"));
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
  assert.match(timeoutEvent.text, /応答確認が長引いています/);
  assert.match(timeoutEvent.text, /入力と文脈は Dashboard thread に保存済み/);
  assert.match(timeoutEvent.text, /補足やキャンセル指示/);
  assert.deepEqual(timeoutEvent.recovery.actions, ["wait", "retry", "shorten_and_resend", "cancel"]);
  assert.equal(timeoutEvent.recovery.status, "stalled");
  assert.equal(timeoutEvent.recovery.retryable, true);
  assert.equal(timeoutEvent.recovery.originalText, "timeout を再現して");
  assert.doesNotMatch(timeoutEvent.text, /timed out before completion/);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(handlers.size, 0);
});

test("dashboard app-server bridge parses Issue #590 debug slow turn duration from natural language", () => {
  assert.deepEqual(
    parseDashboardDebugSlowTurnRequest({
      relatedIssue: 590,
      text: "Issue #590 の slow turn を 3分で実行して"
    }),
    {
      enabled: true,
      ok: true,
      durationSeconds: 180
    }
  );

  assert.deepEqual(
    parseDashboardDebugSlowTurnRequest({
      text: "Issue #590 timeout E2E を 45秒で実行"
    }),
    {
      enabled: true,
      ok: true,
      durationSeconds: 45
    }
  );

  assert.equal(parseDashboardDebugSlowTurnRequest({ text: "普通に返信して" }).enabled, false);
  assert.equal(parseDashboardDebugSlowTurnRequest({ relatedIssue: 498, text: "slow turn を 3分で実行" }).enabled, false);
  assert.equal(parseDashboardDebugSlowTurnRequest({ relatedIssue: 590, text: "slow turn を 11分で実行" }).ok, false);
});

test("dashboard app-server bridge runs Issue #590 debug slow turn without starting Codex", async () => {
  const events = [];
  let requestCount = 0;
  const appServer = {
    nextRequestId() {
      return 1;
    },
    onNotification() {
      return () => {};
    },
    async request() {
      requestCount += 1;
      throw new Error("debug slow turn must not call codex app-server");
    }
  };

  await handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 590,
      text: "Issue #590 の slow turn を 10秒で実行して"
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    debugSlowTurnDelayImpl: async () => {},
    debugSlowTurnProgressIntervalMs: 1000
  });

  assert.equal(requestCount, 0);
  assert.equal(events[0].type, "app_server_status");
  assert.equal(events[0].stage, "debug_slow_turn");
  assert.equal(events[0].persistProgress, true);
  assert.match(events[0].text, /slow turn E2E を開始/);
  assert.ok(
    events.some((event) => event.type === "app_server_status" && event.persistProgress === true && /継続中/.test(event.text))
  );
  const reply = events.find((event) => event.type === "app_server_reply");
  assert.ok(reply);
  assert.equal(reply.threadId, "dashboard-main");
  assert.equal(reply.repository, "marushu/vtdd-v2-p");
  assert.equal(reply.relatedIssue, 590);
  assert.match(reply.text, /low turn E2E が完了/);
  assert.match(reply.text, /root \/ sudo \/ deploy \/ credential \/ repository mutation は実行していません/);
});

test("dashboard app-server bridge rejects out-of-range Issue #590 debug slow turn duration", async () => {
  const events = [];
  await handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 590,
      text: "Issue #590 の slow turn を 0秒で実行して"
    },
    appServer: {
      nextRequestId() {
        throw new Error("must not call codex app-server");
      }
    },
    sendDashboardEvent: async (event) => events.push(event)
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "app_server_turn_failed");
  assert.equal(events[0].status, "invalid_debug_slow_turn_duration");
  assert.match(events[0].text, /10秒から 600秒まで/);
});

test("dashboard app-server bridge can run debug slow turn with injected timing", async () => {
  const events = [];
  await runDashboardDebugSlowTurn({
    request: {
      threadId: "dashboard-main",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 590
    },
    sendDashboardEvent: async (event) => events.push(event),
    durationSeconds: 10,
    progressIntervalMs: 2500,
    delayImpl: async () => {},
    now: (() => {
      const values = ["2026-06-02T00:00:00.000Z", "2026-06-02T00:00:10.000Z"];
      return () => values.shift() || "2026-06-02T00:00:10.000Z";
    })()
  });

  assert.equal(events[0].type, "app_server_status");
  assert.equal(events[0].persistProgress, true);
  assert.equal(events[0].debugSlowTurn.lowRisk, true);
  assert.ok(
    events.filter((event) => event.type === "app_server_status" && event.stage === "debug_slow_turn" && event.persistProgress === true).length >= 2
  );
  assert.equal(events.at(-1).type, "app_server_reply");
  assert.match(events.at(-1).text, /指定待機時間: 10秒/);
});

test("dashboard app-server bridge repeats quiet status before hard stalled timeout without ending the turn", async () => {
  const events = [];
  let nextId = 1;
  const appServer = {
    nextRequestId() {
      const id = nextId;
      nextId += 1;
      return id;
    },
    onNotification() {
      return () => {};
    },
    async request(message) {
      if (message.method === "thread/start") {
        return { thread: { id: "codex-thread-quiet" } };
      }
      if (message.method === "turn/start") {
        return { turn: { id: "turn-quiet" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  await handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 590,
      text: "長めの開発を進めて"
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    cwd: "/repo",
    activityQuietMs: 3,
    turnTimeoutMs: 18,
    lateCompletionTimeoutMs: 1
  });

  const quietEvents = events.filter((event) => event.type === "app_server_status" && event.status === "quiet");
  const quietEvent = quietEvents[0];
  assert.ok(quietEvent);
  assert.ok(quietEvents.length >= 2);
  assert.equal(quietEvent.stage, "quiet");
  assert.match(quietEvent.text, /接続と実行状態を確認中/);
  assert.equal(events.filter((event) => event.type === "app_server_turn_failed").length, 1);
});

test("dashboard app-server bridge resets stalled timeout when app-server activity continues", async () => {
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
        return { thread: { id: "codex-thread-active" } };
      }
      if (message.method === "turn/start") {
        return { turn: { id: "turn-active" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  const pending = handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 590,
      text: "テストまで進めて"
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    cwd: "/repo",
    activityQuietMs: 0,
    turnTimeoutMs: 40
  });

  await waitFor(() => handlers.size === 1);
  await new Promise((resolve) => setTimeout(resolve, 25));
  for (const handler of handlers) {
    handler({
      method: "turn/plan/updated",
      params: {
        threadId: "codex-thread-active",
        turnId: "turn-active"
      }
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(events.some((event) => event.type === "app_server_turn_failed"), false);
  for (const handler of handlers) {
    handler({
      method: "item/agentMessage/delta",
      params: {
        threadId: "codex-thread-active",
        turnId: "turn-active",
        delta: "テストまで完了しました。"
      }
    });
    handler({
      method: "turn/completed",
      params: {
        threadId: "codex-thread-active",
        turn: { id: "turn-active", status: "completed" }
      }
    });
  }
  await pending;

  assert.equal(events.some((event) => event.type === "app_server_turn_failed"), false);
  assert.equal(events.at(-1).type, "app_server_reply");
  assert.equal(events.at(-1).text, "テストまで完了しました。");
});

test("dashboard app-server bridge treats active thread status as activity", async () => {
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
        return { thread: { id: "codex-thread-non-progress" } };
      }
      if (message.method === "turn/start") {
        return { turn: { id: "turn-non-progress" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  const pending = handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 590,
      text: "active status を確認して"
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    cwd: "/repo",
    activityQuietMs: 0,
    turnTimeoutMs: 40
  });

  await waitFor(() => handlers.size === 1);
  await new Promise((resolve) => setTimeout(resolve, 25));
  for (const handler of handlers) {
    handler({
      method: "thread/status/changed",
      params: {
        threadId: "codex-thread-non-progress",
        turnId: "turn-non-progress",
        status: { type: "active", activeFlags: [] }
      }
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(events.some((event) => event.type === "app_server_turn_failed"), false);

  for (const handler of handlers) {
    handler({
      method: "item/agentMessage/delta",
      params: {
        threadId: "codex-thread-non-progress",
        turnId: "turn-non-progress",
        delta: "active status を活動として扱いました。"
      }
    });
    handler({
      method: "turn/completed",
      params: {
        threadId: "codex-thread-non-progress",
        turn: { id: "turn-non-progress", status: "completed" }
      }
    });
  }
  await pending;

  assert.equal(events.some((event) => event.type === "app_server_turn_failed"), false);
  assert.equal(events.at(-1).type, "app_server_reply");
  assert.equal(events.at(-1).text, "active status を活動として扱いました。");
});

test("dashboard app-server bridge does not reset stalled timeout for non-progress notifications", async () => {
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
        return { thread: { id: "codex-thread-warning" } };
      }
      if (message.method === "turn/start") {
        return { turn: { id: "turn-warning" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  const pending = handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 590,
      text: "止まったかどうか確認して"
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    cwd: "/repo",
    activityQuietMs: 0,
    turnTimeoutMs: 30,
    lateCompletionTimeoutMs: 1
  });

  await waitFor(() => handlers.size === 1);
  await new Promise((resolve) => setTimeout(resolve, 15));
  for (const handler of handlers) {
    handler({
      method: "warning",
      params: {
        threadId: "codex-thread-warning",
        turnId: "turn-warning",
        message: "non-progress warning"
      }
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 25));

  const timeoutEvent = events.find((event) => event.type === "app_server_turn_failed");
  assert.ok(timeoutEvent);
  assert.equal(timeoutEvent.status, "timeout");
  await pending;
});

test("dashboard app-server bridge keeps approval wait status from becoming stalled", async () => {
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
        return { thread: { id: "codex-thread-approval-wait" } };
      }
      if (message.method === "turn/start") {
        return { turn: { id: "turn-approval-wait" } };
      }
      throw new Error(`unexpected method ${message.method}`);
    }
  };

  const pending = handleDashboardTurnRequest({
    request: {
      threadId: "dashboard-main",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 590,
      text: "承認待ちを確認して"
    },
    appServer,
    sendDashboardEvent: async (event) => events.push(event),
    cwd: "/repo",
    activityQuietMs: 0,
    turnTimeoutMs: 40
  });

  await waitFor(() => handlers.size === 1);
  await new Promise((resolve) => setTimeout(resolve, 25));
  for (const handler of handlers) {
    handler({
      method: "thread/status/changed",
      params: {
        threadId: "codex-thread-approval-wait",
        turnId: "turn-approval-wait",
        status: { type: "active", activeFlags: ["waitingOnApproval"] }
      }
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(events.some((event) => event.type === "app_server_turn_failed"), false);

  for (const handler of handlers) {
    handler({
      method: "item/agentMessage/delta",
      params: {
        threadId: "codex-thread-approval-wait",
        turnId: "turn-approval-wait",
        delta: "承認待ちを保持しました。"
      }
    });
    handler({
      method: "turn/completed",
      params: {
        threadId: "codex-thread-approval-wait",
        turn: { id: "turn-approval-wait", status: "completed" }
      }
    });
  }
  await pending;

  assert.equal(events.some((event) => event.type === "app_server_turn_failed"), false);
  assert.equal(events.at(-1).type, "app_server_reply");
  assert.equal(events.at(-1).text, "承認待ちを保持しました。");
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
  assert.equal(finalReply.lateCompletion, true);
  assert.equal(finalReply.text, "遅れて返信が届きました。\n\nPR #632 を Draft で作成済みです。");
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
  assert.equal(parsed.turnTimeoutMs, 600000);
  assert.equal(parsed.activityQuietMs, 90000);
});

test("dashboard app-server bridge args preserve explicit disabled turn timeout", () => {
  const parsed = parseBridgeArgs([], {
    VTDD_RUNTIME_URL: "https://runtime.example",
    VTDD_GATEWAY_BEARER_TOKEN: "secret-token",
    VTDD_DASHBOARD_THREAD_ID: "dashboard-main",
    VTDD_DASHBOARD_APP_SERVER_TURN_TIMEOUT_MS: "0",
    VTDD_DASHBOARD_APP_SERVER_ACTIVITY_QUIET_MS: "0"
  });
  assert.equal(parsed.threadId, "dashboard-main");
  assert.equal(parsed.turnTimeoutMs, 0);
  assert.equal(parsed.activityQuietMs, 0);
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
  const parsed = parseBridgeArgs(["--thread-id", "dashboard-main", "--turn-timeout-ms", "1500", "--activity-quiet-ms", "700"], {
    VTDD_RUNTIME_URL: "https://runtime.example",
    VTDD_GATEWAY_BEARER_TOKEN: "secret-token",
    VTDD_DASHBOARD_CODEX_CWD: "/repo",
    VTDD_DASHBOARD_APP_SERVER_TURN_TIMEOUT_MS: "0",
    VTDD_DASHBOARD_BRIDGE_HEARTBEAT_MS: "30000"
  });
  assert.equal(parsed.runtimeUrl, "https://runtime.example");
  assert.equal(parsed.token, "secret-token");
  assert.equal(parsed.threadId, "dashboard-main");
  assert.equal(parsed.cwd, "/repo");
  assert.equal(parsed.sandboxMode, "");
  assert.equal(parsed.turnTimeoutMs, 1500);
  assert.equal(parsed.activityQuietMs, 700);
  assert.equal(parsed.reconnectDelayMs, 1000);
  assert.equal(parsed.heartbeatMs, 30000);
});

test("dashboard app-server bridge repo sync preflight allows clean in-sync main with known artifacts", async () => {
  const status = await collectDashboardBridgeRepoSyncStatus({
    repoRoot: "/srv/vtdd-runner/repos/vtdd-v2-p",
    baseRef: "main",
    run: mockBridgeRepoSyncRun({
      branch: "main",
      headSha: "abc123",
      originHeadSha: "abc123",
      ahead: 0,
      behind: 0,
      status: "?? .tmp/runtime.json\n?? test-results/bridge/output.log\n"
    })
  });

  assert.equal(status.ok, true);
  assert.equal(status.developmentAllowed, true);
  assert.equal(status.inSyncWithOrigin, true);
  assert.deepEqual(status.knownUntrackedArtifacts, [".tmp/runtime.json", "test-results/bridge/output.log"]);
  assert.deepEqual(status.unknownUntrackedPaths, []);
});

test("dashboard app-server bridge repo sync preflight fast-forwards clean behind-only main", async () => {
  const calls = [];
  let pulled = false;
  const status = await ensureDashboardBridgeRepoSynced({
    repoRoot: "/srv/vtdd-runner/repos/vtdd-v2-p",
    baseRef: "main",
    run: async (command, args, options) => {
      calls.push(args.join(" "));
      if (args[0] === "pull") {
        pulled = true;
        return { stdout: "", stderr: "" };
      }
      return mockBridgeRepoSyncRun({
        branch: "main",
        headSha: pulled ? "def456" : "abc123",
        originHeadSha: "def456",
        ahead: 0,
        behind: pulled ? 0 : 1,
        status: ""
      })(command, args, options);
    }
  });

  assert.equal(status.developmentAllowed, true);
  assert.equal(status.syncAction, "fast_forwarded");
  assert.equal(status.headSha, "def456");
  assert.equal(calls.includes("pull --ff-only origin main"), true);
});

test("dashboard app-server bridge repo sync preflight blocks tracked dirty, ahead, and unknown untracked drift", async () => {
  const dirty = await collectDashboardBridgeRepoSyncStatus({
    run: mockBridgeRepoSyncRun({
      branch: "main",
      headSha: "abc123",
      originHeadSha: "abc123",
      ahead: 0,
      behind: 0,
      status: " M scripts/run-dashboard-app-server-bridge.mjs\n"
    })
  });
  const ahead = await collectDashboardBridgeRepoSyncStatus({
    run: mockBridgeRepoSyncRun({
      branch: "main",
      headSha: "abc123",
      originHeadSha: "def456",
      ahead: 1,
      behind: 0,
      status: ""
    })
  });
  const unknownUntracked = await collectDashboardBridgeRepoSyncStatus({
    run: mockBridgeRepoSyncRun({
      branch: "main",
      headSha: "abc123",
      originHeadSha: "abc123",
      ahead: 0,
      behind: 0,
      status: "?? scripts/local-hotfix.mjs\n"
    })
  });

  assert.equal(dirty.developmentAllowed, false);
  assert.deepEqual(dirty.blockedBy, ["tracked_dirty"]);
  assert.equal(ahead.developmentAllowed, false);
  assert.deepEqual(ahead.blockedBy, ["ahead_of_origin"]);
  assert.equal(unknownUntracked.developmentAllowed, false);
  assert.deepEqual(unknownUntracked.blockedBy, ["unknown_untracked"]);
});

test("dashboard app-server bridge repo sync preflight blocks app-server initialization before connect", async () => {
  let initializeCount = 0;
  const appServer = {
    async initialize() {
      initializeCount += 1;
    }
  };

  await assert.rejects(
    runDashboardAppServerBridge({
      runtimeUrl: "https://runtime.example",
      token: "secret-token",
      threadId: "dashboard-main",
      cwd: "/repo",
      appServer,
      run: mockBridgeRepoSyncRun({
        branch: "main",
        headSha: "abc123",
        originHeadSha: "abc123",
        ahead: 0,
        behind: 0,
        status: "?? scripts/local-hotfix.mjs\n"
      }),
      WebSocketImpl: class MockWebSocket {}
    }),
    /repo sync preflight blocked startup/
  );
  assert.equal(initializeCount, 0);
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
    repoSyncPreflight: false,
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

test("dashboard app-server bridge sends heartbeat pings on an open socket", async () => {
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
      throw new Error("turn handling should not run in this heartbeat test");
    }
  };

  const once = connectDashboardAppServerBridgeOnce({
    endpoint: new URL("wss://runtime.example/v2/dashboard/app-server/ws?threadId=dashboard-main"),
    token: "secret-token",
    appServer,
    WebSocketImpl: MockWebSocket,
    heartbeatMs: 1
  });
  assert.equal(sockets.length, 1);
  sockets[0].emit("open");
  await waitFor(() => sockets[0].sent.includes("ping"));
  sockets[0].emit("close");
  await once;
});

function mockBridgeRepoSyncRun({
  branch = "main",
  headSha = "abc123",
  originHeadSha = "abc123",
  ahead = 0,
  behind = 0,
  status = ""
} = {}) {
  return async (_command, args) => {
    const signature = args.join(" ");
    if (signature.startsWith("fetch origin ")) {
      return { stdout: "", stderr: "" };
    }
    if (signature === "symbolic-ref --short HEAD") {
      return { stdout: `${branch}\n`, stderr: "" };
    }
    if (signature === "rev-parse HEAD") {
      return { stdout: `${headSha}\n`, stderr: "" };
    }
    if (signature.startsWith("rev-parse origin/")) {
      return { stdout: `${originHeadSha}\n`, stderr: "" };
    }
    if (signature.startsWith("rev-list --left-right --count HEAD...origin/")) {
      return { stdout: `${ahead}\t${behind}\n`, stderr: "" };
    }
    if (signature === "status --porcelain=v1") {
      return { stdout: status, stderr: "" };
    }
    throw new Error(`Unexpected git command in mock: ${signature}`);
  };
}

async function waitFor(predicate, { timeoutMs = 1000 } = {}) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
