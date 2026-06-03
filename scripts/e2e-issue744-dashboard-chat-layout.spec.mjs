import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import worker from "../src/worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const evidenceDir = path.join(repoRoot, "docs/mvp/e2e/assets/issue-744/local");
const port = Number(process.env.PORT || 8814);
const origin = `http://127.0.0.1:${port}`;
const repository = "marushu/vtdd-v2-p";
const threadId = "dashboard-main-marushu-vtdd-v2-p";
const dashboardUrl = `${origin}/dashboard?repository=${encodeURIComponent(repository)}`;

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
        relatedIssue: message.relatedIssue || 744,
        status: message.status || "sent",
        text: message.text || "",
        createdAt: message.createdAt || new Date(Date.UTC(2026, 5, 2, 7, index)).toISOString(),
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
      messageId: "issue-744-owner-long",
      role: "owner",
      text: [
        "強制リロード後の表示確認。",
        "俺のコメントが見切れず、右寄せのまま読める必要がある。",
        "長いURLも横にはみ出してはいけない: https://vtdd-v2-mvp.polished-tree-da7c.workers.dev/v2/approval/passkey/operator?mode=deploy&repositoryInput=marushu%2Fvtdd-v2-p&phase=execution&actionType=deploy_production&highRiskKind=deploy_production&issueNumber=744"
      ].join("\n")
    },
    {
      messageId: "issue-744-butler-reply",
      role: "butler",
      replyToMessageId: "issue-744-owner-long",
      text: [
        "対象: Issue #744 の chat layout / VRT",
        "",
        "状態:",
        "- owner 発言は読み幅カラムの右へ寄せます。",
        "- Butler 返信は同じ読み幅カラムの左へ寄せます。",
        "- timestamp / copy button / reply preview が本文を押し潰さないか確認します。",
        "",
        "この文章の末尾が切れずに読めることも、この VRT の確認対象です。"
      ].join("\n")
    },
    {
      messageId: "issue-744-owner-short",
      role: "owner",
      text: "今入れたコメントが消えないこと。"
    },
    {
      messageId: "issue-744-owner-no-space-japanese",
      role: "owner",
      text: "今VTDDの状況は？次に進めるべきタスクも示して。"
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

const viewports = [
  { name: "iphone", width: 390, height: 844 },
  { name: "ipad-portrait", width: 820, height: 1180 },
  { name: "ipad-landscape", width: 1180, height: 820 },
  { name: "ipad-real-landscape", width: 1194, height: 834 }
];

for (const viewport of viewports) {
  test(`Issue #744 chat layout keeps owner right and Butler left on ${viewport.name}`, async ({ page, browserName }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(dashboardUrl);

    const owner = page.locator(".message-entry.owner").filter({ hasText: "強制リロード後の表示確認" }).first();
    const ownerShort = page.locator(".message-entry.owner").filter({ hasText: "今入れたコメントが消えないこと" }).first();
    const ownerNoSpace = page.locator(".message-entry.owner").filter({ hasText: "今VTDDの状況は？次に進めるべきタスクも示して" }).first();
    const butler = page.locator(".message-entry.butler").filter({ hasText: "Issue #744 の chat layout" }).first();
    await expect(owner).toBeVisible();
    await expect(ownerShort).toBeVisible();
    await expect(ownerNoSpace).toBeVisible();
    await expect(butler).toBeVisible();
    await expect(page.locator(".reply-context").filter({ hasText: "返信先" })).toBeVisible();

    const layoutState = await page.evaluate(() => {
      function rectFor(selector, text) {
        const elements = [...document.querySelectorAll(selector)];
        const element = elements.find((candidate) => (candidate.textContent || "").includes(text));
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const bubble = element.querySelector(".bubble") || element;
        const body = element.querySelector(".message-body") || bubble;
        const bubbleRect = bubble.getBoundingClientRect();
        const bodyRect = body.getBoundingClientRect();
        const link = element.querySelector(".chat-link, a[href]");
        const linkRect = link?.getBoundingClientRect();
        const bubbleStyle = getComputedStyle(bubble);
        const bodyStyle = getComputedStyle(body);
        return {
          entry: { left: rect.left, right: rect.right, width: rect.width },
          bubble: { left: bubbleRect.left, right: bubbleRect.right, width: bubbleRect.width },
          body: { left: bodyRect.left, right: bodyRect.right, width: bodyRect.width, height: bodyRect.height },
          link: linkRect
            ? { left: linkRect.left, right: linkRect.right, width: linkRect.width, height: linkRect.height }
            : null,
          styles: {
            bubbleBackgroundColor: bubbleStyle.backgroundColor,
            bodyColor: bodyStyle.color,
            bodyDisplay: bodyStyle.display,
            bodyVisibility: bodyStyle.visibility
          },
          text: element.textContent?.slice(0, 180) || ""
        };
      }
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        owner: rectFor(".message-entry.owner", "強制リロード後の表示確認"),
        ownerShort: rectFor(".message-entry.owner", "今入れたコメントが消えないこと"),
        ownerNoSpace: rectFor(".message-entry.owner", "今VTDDの状況は？次に進めるべきタスクも示して"),
        butler: rectFor(".message-entry.butler", "Issue #744 の chat layout")
      };
    });

    assertLayout(layoutState);

    const basename = `issue744-dashboard-chat-layout-${browserName}-${viewport.name}-${viewport.width}x${viewport.height}`;
    const screenshotPath = path.join(evidenceDir, `${basename}.png`);
    const statePath = path.join(evidenceDir, `${basename}-state.json`);
    await fs.writeFile(statePath, JSON.stringify({ ok: true, browserName, viewport, layoutState }, null, 2));
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(JSON.stringify({ ok: true, browserName, viewport, evidence: { screenshotPath, statePath } }));
  });
}

function assertLayout(state) {
  if (!state.owner || !state.ownerShort || !state.ownerNoSpace || !state.butler) {
    throw new Error("missing owner or Butler message layout target");
  }
  for (const [name, target] of [
    ["owner", state.owner],
    ["ownerShort", state.ownerShort],
    ["ownerNoSpace", state.ownerNoSpace],
    ["butler", state.butler]
  ]) {
    if (target.bubble.left < 0 || target.bubble.right > state.viewport.width) {
      throw new Error(`${name} bubble is clipped outside viewport: ${JSON.stringify(target.bubble)}`);
    }
    if (target.entry.left < 0 || target.entry.right > state.viewport.width) {
      throw new Error(`${name} entry is clipped outside viewport: ${JSON.stringify(target.entry)}`);
    }
    if (!target.body || target.body.width <= 0 || target.body.height <= 0) {
      throw new Error(`${name} message body is not rendered: ${JSON.stringify(target.body)}`);
    }
    if (!String(target.text || "").trim()) {
      throw new Error(`${name} message text is empty in rendered DOM`);
    }
    if (target.styles.bodyDisplay === "none" || target.styles.bodyVisibility === "hidden") {
      throw new Error(`${name} message body is hidden: ${JSON.stringify(target.styles)}`);
    }
  }
  const ownerRightGap = Math.abs(state.owner.entry.right - state.owner.bubble.right);
  const ownerShortRightGap = Math.abs(state.ownerShort.entry.right - state.ownerShort.bubble.right);
  const ownerNoSpaceRightGap = Math.abs(state.ownerNoSpace.entry.right - state.ownerNoSpace.bubble.right);
  const butlerLeftGap = Math.abs(state.butler.entry.left - state.butler.bubble.left);
  const expectedHorizontalPadding = Math.min(96, Math.max(18, state.viewport.width * 0.05));
  const minimumExpectedEntryWidth = state.viewport.width - expectedHorizontalPadding * 2 - 80;
  if (state.butler.entry.width < minimumExpectedEntryWidth) {
    throw new Error(
      `Butler entry does not keep full chat width: ${JSON.stringify({
        expectedHorizontalPadding,
        minimumExpectedEntryWidth,
        butler: state.butler.entry
      })}`
    );
  }
  const butlerCoverage = state.butler.bubble.width / state.butler.entry.width;
  if (butlerCoverage < 0.98) {
    throw new Error(`Butler bubble is not full-width inside entry: coverage=${butlerCoverage}`);
  }
  if (ownerRightGap > 2) {
    throw new Error(`owner bubble is not right-aligned within entry: gap=${ownerRightGap}`);
  }
  if (ownerShortRightGap > 2) {
    throw new Error(`short owner bubble is not right-aligned within entry: gap=${ownerShortRightGap}`);
  }
  if (ownerNoSpaceRightGap > 2) {
    throw new Error(`no-space owner bubble is not right-aligned within entry: gap=${ownerNoSpaceRightGap}`);
  }
  if (state.ownerNoSpace.bubble.width < Math.min(420, state.ownerNoSpace.entry.width * 0.45)) {
    throw new Error(`no-space Japanese owner bubble collapsed too narrow: ${JSON.stringify(state.ownerNoSpace.bubble)}`);
  }
  if (!state.owner.link) {
    throw new Error("owner long URL link is not rendered as a measurable link");
  }
  if (state.owner.link.right > state.owner.bubble.right || state.owner.link.left < state.owner.bubble.left) {
    throw new Error(`owner long URL link overflows bubble: ${JSON.stringify({ link: state.owner.link, bubble: state.owner.bubble })}`);
  }
  if (state.owner.link.width > state.owner.body.width + 1) {
    throw new Error(`owner long URL link is wider than message body: ${JSON.stringify({ link: state.owner.link, body: state.owner.body })}`);
  }
  if (state.owner.link.height < 32) {
    throw new Error(`owner long URL link did not wrap across lines: ${JSON.stringify(state.owner.link)}`);
  }
  if (state.ownerShort.bubble.width > state.ownerShort.entry.width * 0.9) {
    throw new Error(
      `short owner bubble expanded too wide instead of fitting content: ${JSON.stringify({
        entry: state.ownerShort.entry,
        bubble: state.ownerShort.bubble
      })}`
    );
  }
  if (state.ownerShort.styles.bubbleBackgroundColor === "rgba(0, 0, 0, 0)") {
    throw new Error("short owner bubble background is transparent");
  }
  if (state.ownerShort.styles.bodyColor === state.ownerShort.styles.bubbleBackgroundColor) {
    throw new Error(`short owner text color matches bubble background: ${JSON.stringify(state.ownerShort.styles)}`);
  }
  if (butlerLeftGap > 2) {
    throw new Error(`Butler bubble is not left-aligned within entry: gap=${butlerLeftGap}`);
  }
}
