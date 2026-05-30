import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import worker from "../src/worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const evidenceDir = path.join(repoRoot, "docs/mvp/e2e/assets/issue-654/local");
const port = Number(process.env.PORT || 8821);
const origin = `http://127.0.0.1:${port}`;
const repository = "marushu/vtdd-v2-p";
const threadId = "dashboard-main-marushu-vtdd-v2-p";
const dashboardUrl = `${origin}/dashboard?repository=${encodeURIComponent(repository)}`;

if (process.env.PW_CHANNEL) {
  test.use({ channel: process.env.PW_CHANNEL });
}

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});

function createInMemoryDashboardChatStore() {
  const messagesByThread = new Map();
  return {
    async appendMany(threadId, messages) {
      const list = messagesByThread.get(threadId) ?? [];
      const normalizedMessages = (Array.isArray(messages) ? messages : []).map((message, index) => ({
        messageId: message.messageId || `${threadId}-${list.length + index + 1}`,
        role: message.role || "system",
        repository: message.repository || repository,
        relatedIssue: message.relatedIssue || 654,
        status: message.status || "sent",
        text: message.text || "",
        createdAt: message.createdAt || new Date(Date.UTC(2026, 4, 30, 14, index)).toISOString(),
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

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

const chatStore = createInMemoryDashboardChatStore();
const env = {
  VTDD_DASHBOARD_ALLOWED_EMAILS: "owner@example.com",
  CF_ACCESS_JWT_VERIFIER: async (token) => ({
    ok: token === "test-access-jwt",
    status: token === "test-access-jwt" ? 200 : 403,
    reason: token === "test-access-jwt" ? undefined : "test access jwt invalid",
    payload: token === "test-access-jwt" ? { email: "owner@example.com", exp: 4102444800 } : null
  }),
  DASHBOARD_CHAT_STORE: chatStore
};

let server;

test.beforeAll(async () => {
  await fs.mkdir(evidenceDir, { recursive: true });
  await chatStore.appendMany(threadId, [
    {
      messageId: "issue-654-initial-owner",
      role: "owner",
      text: "WebSocket が切れても、通常チャットに古い未接続説明を出さないで。"
    }
  ]);
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

test("Dashboard Butler HTTP fallback saves owner input without stale disconnected reply", async ({
  page,
  browserName
}) => {
  await page.goto(dashboardUrl);

  const textarea = page.locator("#butler-message");
  const status = page.locator("#butler-chat-status");
  await expect(textarea).toBeEditable();
  await textarea.fill("WebSocket が閉じてもこの thread に保存して、再接続後に続ける。");

  const messageResponse = page.waitForResponse((response) =>
    response.url().endsWith("/v2/dashboard/chat/messages") && response.request().method() === "POST"
  );
  await page.locator(".send-button").click();
  const response = await messageResponse;
  expect(response.status()).toBe(202);

  await expect(page.locator(".bubble.owner").filter({ hasText: "WebSocket が閉じてもこの thread に保存" })).toBeVisible();
  await expect(status).toContainText("接続が不安定なため保存しました。");
  await expect(textarea).toHaveValue("");
  await expect(textarea).toBeEditable();
  await expect(page.locator("body")).not.toContainText("旧 codex exec");
  await expect(page.locator("body")).not.toContainText("旧 `codex exec`");
  await expect(page.locator("body")).not.toContainText("Custom GPT Butler");
  await expect(page.locator("body")).not.toContainText("app-server 接続 PR");

  const state = await page.evaluate(() => ({
    composerValue: document.querySelector("#butler-message")?.value || "",
    composerReadOnly: Boolean(document.querySelector("#butler-message")?.readOnly),
    statusText: document.querySelector("#butler-chat-status")?.textContent?.trim() || "",
    messages: Array.from(document.querySelectorAll(".bubble")).map((node) => node.textContent?.trim() || ""),
    forbiddenTextPresent: document.body.textContent.includes("Custom GPT Butler") ||
      document.body.textContent.includes("旧 `codex exec`") ||
      document.body.textContent.includes("app-server 接続 PR"),
    userAgent: navigator.userAgent
  }));
  expect(state.forbiddenTextPresent).toBe(false);
  const statePath = path.join(evidenceDir, `issue654-dashboard-http-reconnect-${browserName}-state.json`);
  const screenshotPath = path.join(evidenceDir, `issue654-dashboard-http-reconnect-${browserName}-390x844.png`);
  await fs.writeFile(statePath, JSON.stringify({ ok: true, browserName, state }, null, 2));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(JSON.stringify({
    ok: true,
    browserName,
    verified: [
      "HTTP fallback saves the owner message",
      "stale disconnected codex-exec reply is not rendered",
      "Custom GPT fallback copy is not rendered in normal Dashboard chat",
      "composer remains editable after fallback save"
    ],
    evidence: { statePath, screenshotPath }
  }));
});
