import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import worker from "../src/worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const evidenceDir = path.join(repoRoot, "docs/mvp/e2e/assets/issue-579/local");
const port = Number(process.env.PORT || 8822);
const origin = `http://127.0.0.1:${port}`;
const repository = "marushu/vtdd-v2-p";
const threadId = "dashboard-main-marushu-vtdd-v2-p";
const dashboardUrl = `${origin}/dashboard?repository=${encodeURIComponent(repository)}&issue=579`;

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
        relatedIssue: message.relatedIssue || 579,
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
let dashboardAuthValid = true;
const env = {
  VTDD_DASHBOARD_ALLOWED_EMAILS: "owner@example.com",
  CF_ACCESS_JWT_VERIFIER: async (token) => ({
    ok: dashboardAuthValid && token === "test-access-jwt",
    status: dashboardAuthValid && token === "test-access-jwt" ? 200 : 403,
    reason: dashboardAuthValid && token === "test-access-jwt" ? undefined : "test access jwt invalid",
    payload: dashboardAuthValid && token === "test-access-jwt" ? { email: "owner@example.com", exp: 4102444800 } : null
  }),
  DASHBOARD_CHAT_STORE: chatStore
};

let server;

test.beforeAll(async () => {
  await fs.mkdir(evidenceDir, { recursive: true });
  await chatStore.appendMany(threadId, [
    {
      messageId: "issue-579-initial-owner",
      role: "owner",
      text: "画面オフ復帰後も、Dashboard Butler で普通に続けたい。"
    }
  ]);
  server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", origin);
      if (url.pathname === "/__e2e/auth-expire") {
        dashboardAuthValid = false;
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true, dashboardAuthValid }));
        return;
      }
      if (url.pathname === "/__e2e/auth-reset") {
        dashboardAuthValid = true;
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true, dashboardAuthValid }));
        return;
      }
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

test.beforeEach(async ({ page }) => {
  dashboardAuthValid = true;
  await page.goto(`${origin}/__e2e/auth-reset`);
});

test("Dashboard Butler keeps owner input through PWA reconnect and auth recovery states", async ({
  page,
  context,
  browserName
}) => {
  await page.goto(dashboardUrl);

  const textarea = page.locator("#butler-message");
  const status = page.locator("#butler-chat-status");
  await expect(textarea).toBeEditable();

  await textarea.fill("画面復帰後もこの入力を失わず、同じ thread で続ける。");
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  await page.reload();
  await expect(textarea).toHaveValue("画面復帰後もこの入力を失わず、同じ thread で続ける。");
  await expect(textarea).toBeEditable();

  await context.setOffline(true);
  await expect(status).toContainText("オフラインです。入力は保持しています。");
  await expect(textarea).toHaveValue("画面復帰後もこの入力を失わず、同じ thread で続ける。");
  await expect(textarea).toBeEditable();

  await context.setOffline(false);
  await expect(status).toContainText(/ネットワーク復帰|接続を復帰|履歴の再取得|入力は保持/);
  await expect(textarea).toHaveValue("画面復帰後もこの入力を失わず、同じ thread で続ける。");

  await textarea.fill("WebSocket が閉じた復帰状態でも HTTP fallback で保存して続ける。");
  const messageResponse = page.waitForResponse((response) =>
    response.url().endsWith("/v2/dashboard/chat/messages") && response.request().method() === "POST"
  );
  await page.locator(".send-button").click();
  const response = await messageResponse;
  expect(response.status()).toBe(202);
  await expect(page.locator(".bubble.owner").filter({ hasText: "HTTP fallback で保存して続ける" })).toBeVisible();
  await expect(status).toContainText("接続が不安定なため保存しました。");
  await expect(textarea).toHaveValue("");
  await expect(textarea).toBeEditable();
  await expect(page.locator("body")).not.toContainText("履歴の再取得に失敗しました。WebSocket を再接続しています");

  await textarea.fill("認証が切れてもこの入力は残す。");
  await page.evaluate(async () => {
    await fetch("/__e2e/auth-expire", { credentials: "same-origin" });
  });
  const expiredResponse = page.waitForResponse((response) =>
    response.url().endsWith("/v2/dashboard/chat/messages") && response.request().method() === "POST"
  );
  await page.locator(".send-button").click();
  const expired = await expiredResponse;
  expect([401, 403]).toContain(expired.status());
  await expect(status).toContainText("Dashboard のログインが切れています。入力は残したまま再ログインしてください。");
  await expect(status.locator("a", { hasText: "Passkey で再ログイン" })).toBeVisible();
  await expect(textarea).toHaveValue("認証が切れてもこの入力は残す。");
  await expect(textarea).toBeEditable();

  const state = await page.evaluate(() => ({
    composerValue: document.querySelector("#butler-message")?.value || "",
    composerReadOnly: Boolean(document.querySelector("#butler-message")?.readOnly),
    statusText: document.querySelector("#butler-chat-status")?.textContent?.trim() || "",
    messages: Array.from(document.querySelectorAll(".bubble")).map((node) => node.textContent?.trim() || ""),
    passkeyLink: document.querySelector("#butler-chat-status a")?.getAttribute("href") || "",
    staleBlockingTextPresent: document.body.textContent.includes("履歴の再取得に失敗しました。WebSocket を再接続しています"),
    userAgent: navigator.userAgent
  }));
  expect(state.composerValue).toBe("認証が切れてもこの入力は残す。");
  expect(state.composerReadOnly).toBe(false);
  expect(state.staleBlockingTextPresent).toBe(false);
  expect(state.passkeyLink).toContain("mode=dashboard");
  const statePath = path.join(evidenceDir, `issue579-dashboard-pwa-reconnect-${browserName}-state.json`);
  const screenshotPath = path.join(evidenceDir, `issue579-dashboard-pwa-reconnect-${browserName}-390x844.png`);
  await fs.writeFile(statePath, JSON.stringify({ ok: true, browserName, state }, null, 2));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(JSON.stringify({
    ok: true,
    browserName,
    verified: [
      "draft survives pagehide and reload",
      "offline and online recovery keep composer editable",
      "WebSocket unavailable send uses HTTP fallback",
      "dashboard auth expiry leaves owner input in place with passkey recovery link"
    ],
    evidence: { statePath, screenshotPath }
  }));
});
