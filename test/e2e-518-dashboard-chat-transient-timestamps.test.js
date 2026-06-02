import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import worker, { DashboardChatRoom } from "../src/worker.js";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-518-dashboard-chat-transient-timestamps.md"
);
const MOBILE_SCREENSHOT_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "assets",
  "issue-518",
  "dashboard-chat-timestamps-mobile-390x844.png"
);

const dashboardAccessHeaders = {
  "cf-access-authenticated-user-email": "owner@example.com",
  "cf-access-jwt-assertion": "test-access-jwt"
};

const dashboardAccessEnv = {
  VTDD_DASHBOARD_ALLOWED_EMAILS: "owner@example.com",
  CF_ACCESS_JWT_VERIFIER: async (token) => ({
    ok: token === "test-access-jwt",
    status: token === "test-access-jwt" ? 200 : 403,
    reason: token === "test-access-jwt" ? undefined : "test access jwt invalid",
    payload: token === "test-access-jwt" ? { email: "owner@example.com", exp: 4102444800 } : null
  })
};

function createMockSocket(role, threadId) {
  return {
    readyState: 1,
    sent: [],
    send(message) {
      this.sent.push(message);
    },
    deserializeAttachment() {
      return { role, threadId };
    }
  };
}

function createMockDurableObjectStorage() {
  const values = new Map();
  return {
    values,
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      values.set(key, value);
    }
  };
}

function createInMemoryDashboardChatStore() {
  const messages = [];
  return {
    async appendMany(threadId, incoming) {
      const stored = incoming.map((message) => ({ ...message, threadId }));
      messages.push(...stored);
      return stored;
    },
    async listThread(threadId) {
      return messages.filter((message) => message.threadId === threadId);
    }
  };
}

test("E2E-518 evidence doc records Dashboard timestamp and transient status run", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("Issue `#518`"), true);
  assert.equal(doc.includes("message-meta"), true);
  assert.equal(doc.includes("transient_status"), true);
  assert.equal(doc.includes("Dashboard thread 接続済み。"), true);
  assert.equal(doc.includes("既存 Issue / PR / docs を確認しています。"), true);
  assert.equal(doc.includes("reviewer 指摘を反映しています。"), true);
  assert.equal(doc.includes("390 x 844"), true);
  assert.equal(doc.includes(["", "Users", "shuhei"].join("/") + "/"), false);
  assert.equal(doc.includes(["", "opt", "homebrew"].join("/") + "/"), false);
  assert.equal(doc.includes("does not deploy to Cloudflare"), true);
  assert.equal(doc.includes("generic progress stays transient-only"), true);
  assert.equal(doc.includes("does not close Issue `#518`"), true);
});

test("E2E-518 mobile screenshot artifact is present in repo evidence", () => {
  assert.equal(fs.existsSync(MOBILE_SCREENSHOT_PATH), true);
  assert.ok(fs.statSync(MOBILE_SCREENSHOT_PATH).size > 50_000);

  const png = fs.readFileSync(MOBILE_SCREENSHOT_PATH);
  assert.equal(png.readUInt32BE(16), 390);
  assert.equal(png.readUInt32BE(20), 844);
});

test("E2E-518 dashboard route exposes timestamp renderer and transient status UI path", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/dashboard?repository=sample-org/vtdd-v2-p", {
      headers: dashboardAccessHeaders
    }),
    dashboardAccessEnv
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes('class="chat-scroll" id="butler-chat-log"'), true);
  assert.equal(html.includes(".message-meta { margin-top: 6px;"), true);
  assert.equal(html.includes("function formatMessageTimestamp("), true);
  assert.equal(html.includes('body.type === "transient_status"'), true);
  assert.equal(html.includes(".transient-progress-card"), false);
  assert.equal(html.includes(".composer-progress"), true);
  assert.equal(html.includes('id="butler-transient-progress"'), true);
  assert.equal(html.includes("function updateTransientProgress(text, options = {})"), true);
  assert.equal(html.includes("function clearTransientProgress()"), true);
  assert.equal(html.includes(".reply-context { display: grid;"), true);
  assert.equal(html.includes("function buildReplyContext("), true);
  assert.equal(html.includes("function renderReplyContext("), true);
  assert.equal(html.includes("function appendMessage(message, target = log, options = {})"), true);
  assert.equal(html.includes("appendMessage(message, fragment, { scroll: false })"), true);
  assert.equal(html.includes('data-thread-endpoint="https://example.com/v2/dashboard/chat/dashboard-main-sample-org-vtdd-v2-p"'), true);
});

test("E2E-518 app-server stages update transient status without generic chat spam and final reply resets status", async () => {
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const storage = createMockDurableObjectStorage();
  const room = new DashboardChatRoom(
    {
      storage,
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store }
  );

  await room.webSocketMessage(
    bridgeSocket,
    JSON.stringify({
      type: "app_server_status",
      status: "thinking",
      stage: "test",
      threadId: "dashboard-main-unresolved",
      codexThreadId: "codex-thread-518",
      text: "raw runner text"
    })
  );

  let stored = await store.listThread("dashboard-main-unresolved");
  assert.equal(stored.length, 0);
  assert.equal(dashboardSocket.sent.length, 1);
  const transient = JSON.parse(dashboardSocket.sent[0]);
  assert.equal(transient.type, "transient_status");
  assert.equal(transient.status, "thinking");
  assert.equal(transient.text, "テストを実行しています。");

  await room.webSocketMessage(
    bridgeSocket,
    JSON.stringify({
      type: "app_server_reply",
      status: "replied",
      threadId: "dashboard-main-unresolved",
      codexThreadId: "codex-thread-518",
      text: "PR #519 の残りを確認しました。"
    })
  );

  stored = await store.listThread("dashboard-main-unresolved");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].role, "butler");
  assert.equal(stored[0].status, "replied");
  assert.equal(dashboardSocket.sent.length, 3);
  const finalStatus = JSON.parse(dashboardSocket.sent[1]);
  assert.equal(finalStatus.type, "transient_status");
  assert.equal(finalStatus.status, "replied");
  assert.equal(finalStatus.text, "Dashboard thread 接続済み。");
  const finalThread = JSON.parse(dashboardSocket.sent[2]);
  assert.equal(finalThread.type, "thread");
  assert.equal(finalThread.messages.at(-1).text, "PR #519 の残りを確認しました。");
});
