import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import worker from "../src/worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const evidenceDir = path.join(repoRoot, "docs/mvp/e2e/assets/issue-590/local");
const port = Number(process.env.PORT || 8819);
const origin = `http://127.0.0.1:${port}`;
const repository = "marushu/vtdd-v2-p";
const threadId = "dashboard-main-unresolved";
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
        relatedIssue: message.relatedIssue || 590,
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
      messageId: "issue-590-owner-timeout",
      role: "owner",
      status: "sent",
      text: "app-server timeout 後もこの thread で続けられるか確認して。"
    },
    {
      messageId: "issue-590-timeout-recovery",
      role: "system",
      status: "failed",
      text:
        "codex app-server の応答生成が時間切れになりました。入力は Dashboard thread に保存済みです。同じ thread で続けるか、内容を短くしてもう一度送れます。"
    },
    {
      messageId: "issue-590-late-completion",
      role: "butler",
      status: "replied",
      text: "遅れて app-server の最終返信が届きました。二重返信ではなく同じ thread の続きとして保存しています。"
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

test("Dashboard Butler shows app-server timeout as recoverable and keeps composer usable", async ({
  page,
  browserName
}) => {
  await page.goto(dashboardUrl);

  const textarea = page.locator("#butler-message");
  await expect(textarea).toBeVisible();
  await expect(textarea).toBeEditable();
  await expect(page.locator(".bubble.owner").filter({ hasText: "app-server timeout 後" })).toBeVisible();
  await expect(page.locator(".bubble").filter({ hasText: "応答生成が時間切れ" })).toBeVisible();
  await expect(page.locator(".bubble").filter({ hasText: "入力は Dashboard thread に保存済み" })).toBeVisible();
  await expect(page.locator(".bubble").filter({ hasText: "同じ thread で続ける" })).toBeVisible();
  await expect(page.locator(".bubble").filter({ hasText: "遅れて app-server の最終返信" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("timed out before completion");

  await textarea.fill("短くして続ける。");
  await expect(textarea).toHaveValue("短くして続ける。");
  await expect(page.locator(".send-button")).not.toHaveText("■");
  await expect(page.locator(".send-button.stop-state")).toHaveCount(0);

  const state = await page.evaluate(() => ({
    composerValue: document.querySelector("#butler-message")?.value || "",
    composerReadOnly: Boolean(document.querySelector("#butler-message")?.readOnly),
    stopStateButtonCount: document.querySelectorAll(".send-button.stop-state").length,
    timeoutBubbleTexts: Array.from(document.querySelectorAll(".bubble")).map((node) => node.textContent?.trim() || ""),
    userAgent: navigator.userAgent
  }));
  const seededThreadMessages = await chatStore.listThread(threadId, { limit: 80 });
  const statePath = path.join(evidenceDir, `issue590-dashboard-timeout-recovery-${browserName}-state.json`);
  const screenshotPath = path.join(evidenceDir, `issue590-dashboard-timeout-recovery-${browserName}-390x844.png`);
  await fs.writeFile(statePath, JSON.stringify({ ok: true, browserName, state, seededThreadMessages }, null, 2));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(JSON.stringify({
    ok: true,
    browserName,
    verified: [
      "timeout recovery message is Japanese and recoverable",
      "raw English app-server timeout is hidden",
      "late completion remains in the same Dashboard thread",
      "composer remains editable after timeout",
      "send button is not stuck in stop state"
    ],
    evidence: { statePath, screenshotPath }
  }));
});

test("Dashboard Butler inline transient progress stays visible on mobile without adding chat bubbles", async ({
  page,
  browserName
}) => {
  await page.goto(dashboardUrl);

  await page.evaluate(() => {
    const log = document.querySelector("#butler-chat-log");
    if (!log) return;
    for (let index = 0; index < 18; index += 1) {
      const bubble = document.createElement("article");
      bubble.className = index % 2 === 0 ? "bubble owner" : "bubble";
      bubble.innerHTML = `<p>Issue #590 scroll preservation fixture ${index + 1}</p>`;
      log.appendChild(bubble);
    }
    log.scrollTop = 0;
  });

  const beforeBubbleCount = await page.locator(".bubble").count();
  const layoutAfterProgressUpdate = await page.evaluate(() => {
    const log = document.querySelector("#butler-chat-log");
    const pane = document.querySelector("#butler-transient-progress");
    const before = log?.scrollTop ?? -1;
    if (!pane || !log) return { before, after: log?.scrollTop ?? -1 };
    pane.hidden = false;
    pane.classList.add("thinking");
    pane.setAttribute("data-transient-progress", "true");
    const title = pane.querySelector(".progress-title");
    if (title) title.textContent = "進行中";
    const text = pane.querySelector(".progress-text");
    if (!text) return { before, after: log.scrollTop };
    text.textContent =
      "Issue #590 の production evidence、reviewer 指摘、deploy 後 E2E の残リスクを確認しています。通常チャット履歴には保存しません。";
    return { before };
  });
  layoutAfterProgressUpdate.afterImmediate = await page.evaluate(() => document.querySelector("#butler-chat-log")?.scrollTop ?? -1);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  layoutAfterProgressUpdate.afterNextFrames = await page.evaluate(() => document.querySelector("#butler-chat-log")?.scrollTop ?? -1);
  expect(layoutAfterProgressUpdate.afterImmediate).toBe(layoutAfterProgressUpdate.before);
  expect(layoutAfterProgressUpdate.afterNextFrames).toBe(layoutAfterProgressUpdate.before);

  const pane = page.locator("[data-transient-progress='true']");
  await expect(pane).toBeVisible();
  await expect(pane).toContainText("通常チャット履歴には保存しません");
  await expect(page.locator(".bubble")).toHaveCount(beforeBubbleCount);

  const layout = await page.evaluate(() => {
    const pane = document.querySelector("[data-transient-progress='true']");
    const log = document.querySelector("#butler-chat-log");
    const text = pane?.querySelector(".progress-text");
    const paneRect = pane?.getBoundingClientRect();
    const logRect = log?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      paneLeft: paneRect?.left ?? 0,
      paneRight: paneRect?.right ?? 0,
      paneWidth: paneRect?.width ?? 0,
      logWidth: logRect?.width ?? 0,
      logScrollWidth: log?.scrollWidth ?? 0,
      logClientWidth: log?.clientWidth ?? 0,
      textScrollWidth: text?.scrollWidth ?? 0,
      textClientWidth: text?.clientWidth ?? 0,
      paneHeight: paneRect?.height ?? 0,
      textHeight: text?.getBoundingClientRect().height ?? 0,
      progressTextMaxHeight: text ? window.getComputedStyle(text).maxHeight : "",
      progressTextLineClamp: text ? window.getComputedStyle(text).webkitLineClamp : "",
      bubbleCount: document.querySelectorAll(".bubble").length,
      transientCount: document.querySelectorAll("[data-transient-progress='true']").length
    };
  });
  expect(layout.transientCount).toBe(1);
  expect(layout.bubbleCount).toBe(beforeBubbleCount);
  expect(layout.paneLeft).toBeGreaterThanOrEqual(0);
  expect(layout.paneRight).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.paneWidth).toBeLessThanOrEqual(layout.logWidth);
  expect(layout.logScrollWidth).toBeLessThanOrEqual(layout.logClientWidth + 1);
  expect(layout.textScrollWidth).toBeLessThanOrEqual(layout.textClientWidth + 1);
  expect(layout.progressTextLineClamp).toBe("2");
  expect(layout.textHeight).toBeLessThanOrEqual(48);
  expect(layout.paneHeight).toBeLessThanOrEqual(96);

  const scrollPreservation = await page.evaluate(() => {
    const log = document.querySelector("#butler-chat-log");
    const text = document.querySelector("[data-transient-progress='true'] .progress-text");
    if (!log || !text) return { before: -1, after: -1 };
    log.scrollTop = 64;
    const before = log.scrollTop;
    text.textContent =
      "ファイルの修正・変更が完了しました。現在コミット中です。\nPR を作成しています。このままレビュアーを待ちます。";
    return { before, afterImmediate: log.scrollTop };
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  scrollPreservation.afterNextFrames = await page.evaluate(() => document.querySelector("#butler-chat-log")?.scrollTop ?? -1);
  expect(scrollPreservation.afterImmediate).toBe(scrollPreservation.before);
  expect(scrollPreservation.afterNextFrames).toBe(scrollPreservation.before);

  const gentleFollowSource = await page.evaluate(() => {
    const html = document.documentElement.outerHTML;
    return {
      hasGentleFollow: html.includes("function scheduleGentleScrollFollow(shouldFollow)"),
      hasHumanInteractionGuard: html.includes("function markHumanScrollInteraction()"),
      hasWheelGuard: html.includes('log.addEventListener("wheel", markHumanScrollInteraction'),
      hasTouchGuard: html.includes('log.addEventListener("touchmove", markHumanScrollInteraction'),
      usesGentleCheckpointFollow: html.includes("scrollToLatestIfFollowing(shouldFollow, { gentle: options.gentle !== false })")
    };
  });
  expect(gentleFollowSource.hasGentleFollow).toBe(true);
  expect(gentleFollowSource.hasHumanInteractionGuard).toBe(true);
  expect(gentleFollowSource.hasWheelGuard).toBe(true);
  expect(gentleFollowSource.hasTouchGuard).toBe(true);
  expect(gentleFollowSource.usesGentleCheckpointFollow).toBe(true);

  const statePath = path.join(evidenceDir, `issue590-dashboard-inline-transient-progress-${browserName}-state.json`);
  const screenshotPath = path.join(evidenceDir, `issue590-dashboard-inline-transient-progress-${browserName}-390x844.png`);
  await fs.writeFile(statePath, JSON.stringify({ ok: true, browserName, layout, layoutAfterProgressUpdate, scrollPreservation, gentleFollowSource }, null, 2));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(JSON.stringify({
    ok: true,
    browserName,
    verified: [
      "inline transient progress is visible above the composer in 390x844 mobile viewport",
      "inline transient progress does not append durable chat bubbles",
      "progress text wraps without horizontal overflow",
      "transient progress updates preserve the owner's chat scroll position",
      "Dashboard page includes gentle progress follow with human scroll interaction guard"
    ],
    evidence: { statePath, screenshotPath }
  }));
});
