import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

import worker from "../src/worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const evidenceDir = path.join(repoRoot, "docs/mvp/e2e/assets/issue-631/local");
const port = Number(process.env.PORT || 8813);
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
        relatedIssue: message.relatedIssue || 631,
        status: message.status || "sent",
        text: message.text || "",
        createdAt: message.createdAt || new Date(Date.UTC(2026, 4, 29, 2, index)).toISOString(),
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
      messageId: "issue-631-owner-code",
      role: "owner",
      text: [
        "黒潰れ確認。",
        "- repository: marushu/vtdd-v2-p",
        "- issueNumber: 631",
        "- currentSurface: dashboard_butler",
        "- phase: execution",
        "```",
        "https://vtdd-v2-mvp.polished-tree-da7c.workers.dev/v2/approval/passkey/operator?mode=deploy&repositoryInput=marushu%2Fvtdd-v2-p&phase=execution&issueNumber=631&actionType=deploy_production&highRiskKind=deploy_production",
        "```"
      ].join("\n")
    },
    {
      messageId: "issue-631-butler-link",
      role: "butler",
      text:
        "[Deploy approval を開く](https://vtdd-v2-mvp.polished-tree-da7c.workers.dev/v2/approval/passkey/operator?mode=deploy&repositoryInput=marushu%2Fvtdd-v2-p&phase=execution&issueNumber=631&actionType=deploy_production&highRiskKind=deploy_production)\n\n`go:%0AIssue%20%23631%20contrast%20check`"
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

for (const colorScheme of ["light", "dark"]) {
  test(`dashboard chat keeps owner code and important links readable in ${colorScheme} mode`, async ({ page, browserName }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(dashboardUrl);

    await expect(page.locator(".bubble.owner").filter({ hasText: "黒潰れ確認" })).toBeVisible();
    await expect(page.locator(".bubble").filter({ hasText: "Deploy approval を開く" })).toBeVisible();

    const contrastState = await page.evaluate(() => {
      function pick(selector, pseudoElement) {
        const element = document.querySelector(selector);
        if (!element) return null;
        const style = getComputedStyle(element, pseudoElement);
        const parentStyle = getComputedStyle(element.parentElement || element);
        const bubbleStyle = getComputedStyle(element.closest(".bubble") || element);
        return {
          selector,
          pseudoElement: pseudoElement || null,
          color: style.color,
          backgroundColor: style.backgroundColor,
          parentBackgroundColor: parentStyle.backgroundColor,
          bubbleBackgroundColor: bubbleStyle.backgroundColor,
          text: element.textContent?.slice(0, 160) || ""
        };
      }
      return {
        ownerPre: pick(".bubble.owner pre"),
        ownerPreCode: pick(".bubble.owner pre code"),
        ownerList: pick(".bubble.owner ul"),
        ownerListItem: pick(".bubble.owner li"),
        ownerListMarker: pick(".bubble.owner li", "::marker"),
        butlerLink: pick(".bubble:not(.owner) .chat-link"),
        butlerCode: pick(".bubble:not(.owner) .message-body code")
      };
    });

    assertReadableContrastState(contrastState);

    const screenshotPath = path.join(evidenceDir, `dashboard-chat-contrast-${browserName}-${colorScheme}-390x844.png`);
    const statePath = path.join(evidenceDir, `dashboard-chat-contrast-${browserName}-${colorScheme}-state.json`);
    await fs.writeFile(statePath, JSON.stringify({ ok: true, browserName, colorScheme, contrastState }, null, 2));
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(JSON.stringify({ ok: true, browserName, colorScheme, evidence: { screenshotPath, statePath } }));
  });
}

function assertReadableContrastState(state) {
  for (const key of ["ownerPre", "ownerPreCode", "ownerList", "ownerListItem", "ownerListMarker", "butlerLink", "butlerCode"]) {
    if (!state[key]) {
      throw new Error(`missing contrast target: ${key}`);
    }
  }
  if (state.ownerPre.backgroundColor === state.ownerPreCode.color) {
    throw new Error("owner code text color matches owner code background");
  }
  if (state.ownerListItem.bubbleBackgroundColor === state.ownerListItem.color) {
    throw new Error("owner list item text color matches owner bubble background");
  }
  if (state.ownerListMarker.bubbleBackgroundColor === state.ownerListMarker.color) {
    throw new Error("owner list marker color matches owner bubble background");
  }
  if (state.butlerLink.color === state.butlerLink.parentBackgroundColor) {
    throw new Error("butler link color matches parent background");
  }
}
