import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

import worker from "../src/worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const evidenceDir = path.join(repoRoot, "docs/mvp/e2e/assets/issue-582/local");
const port = Number(process.env.PORT || 8812);
const origin = `http://127.0.0.1:${port}`;
const dashboardUrl = `${origin}/dashboard?repository=marushu%2Fvtdd-v2-p`;

if (process.env.PW_CHANNEL) {
  test.use({ channel: process.env.PW_CHANNEL });
}

function createInMemoryDashboardChatStore() {
  const messagesByThread = new Map();
  return {
    async appendMany(threadId, messages) {
      const list = messagesByThread.get(threadId) ?? [];
      const normalizedMessages = (Array.isArray(messages) ? messages : []).map((message) => ({
        messageId: message.messageId || `${threadId}-${list.length + 1}`,
        role: message.role || "system",
        repository: message.repository || null,
        relatedIssue: message.relatedIssue || message.issueNumber || null,
        status: message.status || "sent",
        text: message.text || "",
        createdAt: message.createdAt || new Date().toISOString(),
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

test("dashboard composer keeps newline and submits on modified Enter", async ({ page, browserName }) => {
  await page.goto(dashboardUrl);
  const textarea = page.locator("#butler-message");
  await expect(textarea).toBeVisible();
  await expect(textarea).toBeEditable();
  await expect(page.locator("#butler-interrupt-panel")).toHaveCount(0);
  await expect(page.locator(".send-button.stop-state")).toHaveCount(0);
  await expect(page.locator(".send-button")).not.toHaveText("■");

  await textarea.fill("line one");
  await textarea.press("Shift+Enter");
  await textarea.type("line two");
  await expect(textarea).toHaveValue("line one\nline two");

  await textarea.fill("command enter send");
  await textarea.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
  await expect(textarea).toHaveValue("", { timeout: 5000 });
  await expect(page.locator(".bubble.owner").filter({ hasText: "command enter send" })).toHaveCount(1);

  await textarea.fill("control enter send");
  await textarea.press("Control+Enter");
  await expect(textarea).toHaveValue("", { timeout: 5000 });
  await expect(page.locator(".bubble.owner").filter({ hasText: "control enter send" })).toHaveCount(1);

  const state = await page.evaluate(() => ({
    value: document.querySelector("#butler-message")?.value,
    composerReadOnly: Boolean(document.querySelector("#butler-message")?.readOnly),
    interruptPanelCount: document.querySelectorAll("#butler-interrupt-panel").length,
    stopStateButtonCount: document.querySelectorAll(".send-button.stop-state").length,
    sendButtonText: document.querySelector(".send-button")?.textContent || "",
    ownerBubbleTexts: Array.from(document.querySelectorAll(".bubble.owner")).map((node) => node.textContent?.trim() || ""),
    userAgent: navigator.userAgent
  }));
  const statePath = path.join(evidenceDir, `dashboard-composer-shortcut-${browserName}-state.json`);
  const screenshotPath = path.join(evidenceDir, `dashboard-composer-shortcut-${browserName}.png`);
  await fs.writeFile(statePath, JSON.stringify({ ok: true, browserName, platform: process.platform, state }, null, 2));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(JSON.stringify({
    ok: true,
    browserName,
    platform: process.platform,
    verified: [
      "Shift+Enter newline",
      "modified Enter submit",
      "owner bubble rendered",
      "composer remains editable",
      "interrupt panel absent",
      "stop-state send button absent"
    ],
    evidence: { statePath, screenshotPath }
  }));
});
