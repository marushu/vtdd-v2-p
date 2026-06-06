import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import worker from "../src/worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const evidenceDir = path.join(repoRoot, "docs/mvp/e2e/assets/issue-811/local");
const port = Number(process.env.PORT || 8815);
const origin = `http://127.0.0.1:${port}`;
const repository = "marushu/vtdd-v2-p";
const threadId = "dashboard-main-unresolved";
const dashboardUrl = `${origin}/dashboard?repository=${encodeURIComponent(repository)}&threadId=${encodeURIComponent(threadId)}`;
const notificationsUrl = `${origin}/dashboard/notifications?focus=github-actions&eventId=issue811-test`;

if (process.env.PW_CHANNEL) {
  test.use({ channel: process.env.PW_CHANNEL });
}

function createInMemoryDashboardChatStore() {
  const messagesByThread = new Map();
  return {
    async appendMany(threadId, messages) {
      const list = messagesByThread.get(threadId) ?? [];
      const normalizedMessages = (Array.isArray(messages) ? messages : []).map((message, index) => ({
        messageId: message.messageId || `${threadId}-${list.length + index + 1}`,
        role: message.role || "system",
        repository: message.repository || repository,
        relatedIssue: message.relatedIssue || 811,
        status: message.status || "sent",
        text: message.text || "",
        createdAt: message.createdAt || new Date(Date.UTC(2026, 5, 6, 9, index)).toISOString(),
        ...message,
        threadId
      }));
      list.push(...normalizedMessages);
      messagesByThread.set(threadId, list);
      return normalizedMessages;
    },
    async listThread(threadId, filter = {}) {
      const limit = Number(filter.limit) || 80;
      return (messagesByThread.get(threadId) ?? []).slice(-limit);
    },
    async putSummary() {
      return null;
    },
    async getSummary() {
      return null;
    },
    async search() {
      return [];
    }
  };
}

function createInMemoryDashboardEventStore() {
  const events = new Map();
  return {
    async put(event) {
      events.set(event.id, event);
      return event;
    },
    async appendEvent(event) {
      const record = {
        id: event.id || `issue811-event-${events.size + 1}`,
        kind: event.kind || event.type || "github_actions_workflow_run",
        title: event.title || "PR #811 Dashboard Butler V3 main chat",
        repository: event.repository || repository,
        workflowName: event.workflowName || event.workflow || "deploy-production",
        runId: event.runId || "issue811-run",
        runUrl: event.runUrl || `${origin}/dashboard/notifications?eventId=${event.id || "issue811-test"}`,
        sha: event.sha || "811abc",
        headSha: event.headSha || event.sha || "811abc",
        headBranch: event.headBranch || "main",
        status: event.status || "completed",
        conclusion: event.conclusion || "success",
        createdAt: event.createdAt || new Date(Date.UTC(2026, 5, 6, 9, events.size)).toISOString(),
        updatedAt: event.updatedAt || event.createdAt || new Date(Date.UTC(2026, 5, 6, 9, events.size)).toISOString(),
        ...event
      };
      events.set(record.id, record);
      return record;
    },
    async get(eventId) {
      return events.get(eventId) || null;
    },
    async latest(filter = {}) {
      const matches = await this.listRecent(filter);
      return matches[0] || null;
    },
    async listRecent(filter = {}) {
      const matches = [...events.values()].filter((event) => {
        if (filter.kind && event.kind !== filter.kind) return false;
        if (filter.repository && event.repository !== filter.repository) return false;
        if (filter.workflowName && event.workflowName !== filter.workflowName) return false;
        return true;
      });
      matches.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
      return matches.slice(0, Number(filter.limit) || 30);
    },
    async listRecentEvents() {
      return [...events.values()];
    },
    async getEventById(id) {
      return events.get(id) || null;
    }
  };
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

const chatStore = createInMemoryDashboardChatStore();
const dashboardEventStore = createInMemoryDashboardEventStore();
const env = {
  VTDD_DASHBOARD_ALLOWED_EMAILS: "owner@example.com",
  CF_ACCESS_JWT_VERIFIER: async (token) => ({
    ok: token === "test-access-jwt",
    status: token === "test-access-jwt" ? 200 : 403,
    reason: token === "test-access-jwt" ? undefined : "test access jwt invalid",
    payload: token === "test-access-jwt" ? { email: "owner@example.com", exp: 4102444800 } : null
  }),
  DASHBOARD_CHAT_STORE: chatStore,
  DASHBOARD_EVENT_STORE: dashboardEventStore
};

let server;

test.beforeAll(async () => {
  await fs.mkdir(evidenceDir, { recursive: true });
  await chatStore.appendMany(threadId, [
    {
      messageId: "issue-811-owner",
      role: "owner",
      text: "Dashboard Butler V3 のメインチャットを一体で作り直して。"
    },
    {
      messageId: "issue-811-butler",
      role: "butler",
      replyToMessageId: "issue-811-owner",
      text: [
        "Issue #811 として扱います。",
        "チャットを主役にし、進捗、承認、復旧、通知センター導線を通常会話から浮かせます。",
        `[VPS 復旧の承認を開く](${origin}/v2/approval/passkey/operator?mode=vps_runner_admin&phase=execution&actionType=destructive&highRiskKind=vps_runner_admin&issueNumber=811)`
      ].join("\n")
    }
  ]);
  await dashboardEventStore.appendEvent({
    id: "issue811-test",
    title: "PR #811 Dashboard Butler V3 main chat",
    type: "github_actions_workflow_run"
  });
  server = http.createServer(async (request, response) => {
    try {
      const body = request.method === "GET" || request.method === "HEAD" ? undefined : await readRequestBody(request);
      const headers = new Headers(request.headers);
      headers.set("cf-access-authenticated-user-email", "owner@example.com");
      headers.set("cf-access-jwt-assertion", "test-access-jwt");
      const workerResponse = await worker.fetch(
        new Request(new URL(request.url || "/", origin), {
          method: request.method,
          headers,
          body
        }),
        env
      );
      response.writeHead(workerResponse.status, Object.fromEntries(workerResponse.headers.entries()));
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      response.end(Buffer.from(await workerResponse.arrayBuffer()));
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error?.stack || String(error));
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
});

test.afterAll(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function installFakeDashboardSocket(page) {
  await page.addInitScript(() => {
    class FakeDashboardWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      constructor(url) {
        super();
        this.url = url;
        this.readyState = FakeDashboardWebSocket.CONNECTING;
        this.sent = [];
        window.__vtddFakeSockets = window.__vtddFakeSockets || [];
        window.__vtddFakeSockets.push(this);
        setTimeout(() => {
          this.readyState = FakeDashboardWebSocket.OPEN;
          this.dispatchEvent(new Event("open"));
        }, 0);
      }
      send(data) {
        this.sent.push(String(data));
      }
      close() {
        this.readyState = FakeDashboardWebSocket.CLOSED;
        this.dispatchEvent(new Event("close"));
      }
      emit(data) {
        this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
      }
    }
    window.WebSocket = FakeDashboardWebSocket;
  });
}

async function installMobilePointerMedia(page) {
  await page.addInitScript(() => {
    const originalMatchMedia = window.matchMedia?.bind(window);
    window.matchMedia = (query) => {
      if (String(query || "").includes("pointer: coarse")) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          }
        };
      }
      return originalMatchMedia
        ? originalMatchMedia(query)
        : {
            matches: false,
            media: query,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() {
              return false;
            }
          };
    };
  });
}

async function installFakeSpeechRecognition(page) {
  await page.addInitScript(() => {
    class FakeSpeechRecognition {
      constructor() {
        window.__vtddSpeechRecognition = this;
        this.lang = "";
        this.continuous = false;
        this.interimResults = false;
      }
      start() {
        this.onstart?.();
      }
      stop() {
        this.onend?.();
      }
      emitTranscript(text) {
        const result = [{ transcript: text }];
        result.isFinal = true;
        this.onresult?.({ resultIndex: 0, results: [result] });
      }
    }
    window.SpeechRecognition = FakeSpeechRecognition;
    window.webkitSpeechRecognition = FakeSpeechRecognition;
  });
}

async function captureEvidence(page, name, details = {}) {
  const screenshotPath = path.join(evidenceDir, `${name}.png`);
  const statePath = path.join(evidenceDir, `${name}-state.json`);
  const state = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    topbar: document.querySelector(".topbar") ? getComputedStyle(document.querySelector(".topbar")).cssText : "",
    drawerChecked: Boolean(document.querySelector("#mobile-menu-toggle")?.checked),
    drawerVisible: Boolean(document.querySelector(".mobile-drawer") && getComputedStyle(document.querySelector(".mobile-drawer")).display !== "none"),
    passkeyModalHidden: Boolean(document.querySelector("#butler-passkey-modal")?.hidden),
    followupDraftHidden: Boolean(document.querySelector("#butler-followup-draft")?.hidden),
    followupQueueText: document.querySelector("#butler-followup-queue-list")?.textContent || "",
    status: document.querySelector("#butler-chat-status")?.textContent || "",
    bodyText: document.body.innerText.slice(0, 3000)
  }));
  await fs.writeFile(statePath, JSON.stringify({ ok: true, ...details, state }, null, 2));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return { screenshotPath, statePath };
}

test("Issue #811 mobile main chat keeps floating header, drawer overlay, passkey modal, and follow-up queue", async ({ page, browserName }) => {
  await installFakeDashboardSocket(page);
  await installMobilePointerMedia(page);
  await installFakeSpeechRecognition(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(dashboardUrl);

  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator("#butler-message")).toHaveAttribute("data-mobile-composer", "true");
  await expect(page.locator(".desktop-side-nav")).toBeHidden();
  await expect(page.locator(".menu-open").first()).toBeVisible();
  await page.locator("#butler-message").fill("テキスト送信確認");
  await expect(page.locator("#butler-send-button")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const sendBox = document.querySelector("#butler-send-button")?.getBoundingClientRect();
    const textBox = document.querySelector("#butler-message")?.getBoundingClientRect();
    return Boolean(sendBox && textBox && sendBox.left > textBox.left);
  })).toBe(true);
  await page.locator("#butler-message").fill("");
  await page.locator("#butler-voice-button").click();
  await page.evaluate(() => window.__vtddSpeechRecognition?.emitTranscript("音声から追加したメモ"));
  await expect.poll(async () => page.evaluate(() => {
    const sent = window.__vtddFakeSockets?.[0]?.sent || [];
    return sent.some((entry) => {
      try {
        const parsed = JSON.parse(entry);
        return parsed.type === "owner_message" && parsed.text === "音声から追加したメモ";
      } catch {
        return false;
      }
    });
  })).toBe(true);
  await page.evaluate(() => window.__vtddSpeechRecognition?.emitTranscript("ボイスモード終了"));
  await expect(page.locator("#butler-voice-button")).toHaveAttribute("data-listening", "false");
  await page.evaluate(() => {
    window.__vtddFakeSockets?.[0]?.emit({
      type: "owner_message_accepted",
      ok: true,
      clientMessageId: JSON.parse(window.__vtddFakeSockets?.[0]?.sent?.at(-1) || "{}").clientMessageId
    });
  });
  await page.locator("#butler-message").fill("");

  await page.evaluate(() => {
    window.__vtddFakeSockets?.[0]?.emit({
      type: "transient_status",
      ok: true,
      status: "thinking",
      text: "Issue #811 のメインチャットを実行中です。",
      transientProgressSnapshot: { title: "進行中", text: "入力体験と復旧導線を確認しています。" }
    });
  });
  await expect(page.locator("#butler-send-button")).toHaveAttribute("data-mode", "stop");
  await page.locator("#butler-message").fill("これは現在の実行に差し込む補足。");
  await expect(page.locator("#butler-followup-draft")).toBeVisible();
  await page.locator("#butler-followup-queue").click();
  await expect(page.locator("#butler-followup-queue-list")).toContainText("差し込み済み");
  await expect(page.locator("#butler-followup-queue-list")).toContainText("これは現在の実行に差し込む補足。");

  await page.locator(".menu-open").first().click();
  await expect(page.locator(".mobile-drawer")).toBeVisible();
  await page.evaluate(() => {
    window.__vtddFakeSockets?.[0]?.emit({
      type: "thread",
      ok: true,
      messages: [
        {
          messageId: "issue-811-live-while-drawer-open",
          role: "butler",
          status: "replied",
          text: "ドロワーを開いていても返信ストリームは裏で継続します。",
          createdAt: "2026-06-06T09:30:00.000Z"
        }
      ]
    });
  });
  await expect(page.locator(".message-entry.butler").filter({ hasText: "ドロワーを開いていても返信ストリームは裏で継続します" })).toBeVisible();

  await page.locator(".mobile-backdrop").click({ position: { x: 350, y: 20 } });
  await page.locator("a", { hasText: "VPS 復旧の承認を開く" }).click();
  await expect(page.locator("#butler-passkey-modal")).toBeVisible();
  await expect(page.locator("#butler-passkey-frame")).toHaveAttribute("src", /v2\/approval\/passkey\/operator/);

  const evidence = await captureEvidence(page, `issue811-mobile-main-chat-${browserName}`, {
    viewport: "iphone",
    verified: ["floating header", "mobile Enter separation", "voice transcript", "follow-up queue", "drawer overlay", "stream continues behind drawer", "passkey modal"]
  });
  console.log(JSON.stringify({ ok: true, browserName, evidence }));
});

test("Issue #811 iPad layout keeps wider content and notification taps can land on notification center", async ({ page, browserName }) => {
  await installFakeDashboardSocket(page);
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto(dashboardUrl);

  await expect(page.locator(".desktop-side-nav")).toBeVisible();
  await expect(page.locator(".menu-open").first()).toBeHidden();
  const layout = await page.evaluate(() => {
    const app = document.querySelector(".dashboard-app")?.getBoundingClientRect();
    const chat = document.querySelector(".chat-scroll")?.getBoundingClientRect();
    return {
      appWidth: app?.width || 0,
      chatWidth: chat?.width || 0,
      viewportWidth: window.innerWidth
    };
  });
  expect(layout.chatWidth).toBeGreaterThan(800);

  await page.goto(notificationsUrl);
  await expect(page.locator("h1")).toContainText("通知センター");
  expect(page.url()).toContain("/dashboard/notifications?focus=github-actions");
  await expect(page.locator("body")).toContainText("通知タップは通知センターへ戻ります");

  const evidence = await captureEvidence(page, `issue811-ipad-notification-center-${browserName}`, {
    viewport: "ipad-landscape",
    layout,
    verified: ["desktop side nav", "wide iPad content", "notification center direct URL"]
  });
  console.log(JSON.stringify({ ok: true, browserName, evidence }));
});
