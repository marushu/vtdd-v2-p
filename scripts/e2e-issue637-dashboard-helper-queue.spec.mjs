import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import worker from "../src/worker.js";
import { MemoryRecordType, createInMemoryMemoryProvider } from "../src/core/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const evidenceDir = path.join(repoRoot, "docs/mvp/e2e/assets/issue-637/local");
const port = Number(process.env.PORT || 8817);
const origin = `http://127.0.0.1:${port}`;
const dashboardUrl = `${origin}/dashboard?repository=marushu%2Fvtdd-v2-p`;
const gatewayToken = "test-token";

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

const provider = createInMemoryMemoryProvider();
const githubCalls = [];
const chatStore = createInMemoryDashboardChatStore();
const env = {
  VTDD_GATEWAY_BEARER_TOKEN: gatewayToken,
  VTDD_DASHBOARD_ALLOWED_EMAILS: "owner@example.com",
  CF_ACCESS_JWT_VERIFIER: async (token) => ({
    ok: token === "test-access-jwt",
    status: token === "test-access-jwt" ? 200 : 403,
    reason: token === "test-access-jwt" ? undefined : "test access jwt invalid",
    payload: token === "test-access-jwt" ? { email: "owner@example.com", exp: 4102444800 } : null
  }),
  DASHBOARD_CHAT_STORE: chatStore,
  MEMORY_PROVIDER: provider,
  VTDD_DASHBOARD_VPS_MAINTENANCE_HOST: "x85-131-245-163",
  VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR: "/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p",
  GITHUB_APP_INSTALLATION_TOKEN: "ghs_issue637_e2e",
  GITHUB_API_FETCH: async (url, init) => {
    githubCalls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        id: 63701,
        html_url: "https://github.com/marushu/vtdd-v2-p/issues/637#issuecomment-63701"
      }),
      { status: 201, headers: { "content-type": "application/json" } }
    );
  }
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

test("Dashboard Butler mobile flow reaches VPS helper execution queue without root execution", async ({
  page,
  browserName
}) => {
  await page.goto(dashboardUrl);
  const textarea = page.locator("#butler-message");
  await expect(textarea).toBeVisible();
  await expect(textarea).toBeEditable();

  const ownerIntent =
    "Issue #637: Dashboard Butler から VPS helper queue まで到達できるか確認。root 実行は passkey 境界で止める。";
  await textarea.fill(ownerIntent);
  const firstTurnPromise = page.waitForResponse((response) =>
    response.url().endsWith("/v2/dashboard/chat/messages") && response.request().method() === "POST"
  );
  await textarea.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
  await expect(page.locator(".bubble.owner").filter({ hasText: "Issue #637" })).toHaveCount(1);

  const firstTurn = await firstTurnPromise;
  const firstTurnBody = await firstTurn.json();
  expect(firstTurn.status()).toBe(202);
  expect(firstTurnBody.ok).toBe(true);
  expect(firstTurnBody.execution.status).toBe("approval_required");
  expect(firstTurnBody.execution.runtimeTruth.dashboardNaturalLanguagePathReached).toBe(true);
  expect(firstTurnBody.execution.runtimeTruth.helperQueueReached).toBe(false);

  await provider.store({
    id: "approval:issue637-dashboard-e2e",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval:issue637-dashboard-e2e",
      credentialId: "AQIDBA",
      verifiedAt: "2026-05-30T00:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
      scope: firstTurnBody.execution.approvalScope
    },
    metadata: { source: "issue637-dashboard-e2e" },
    priority: 96,
    tags: ["passkey_grant", "passkey_approval", "verified"],
    createdAt: "2026-05-30T00:00:00.000Z"
  });

  const approvedTurn = await page.evaluate(async ({ proposalId }) => {
    const response = await fetch("/v2/dashboard/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        repository: "marushu/vtdd-v2-p",
        issueNumber: 637,
        text: "承認済みなので Dashboard Butler から VPS helper queue へ進めて。",
        vpsProposalId: proposalId,
        approvalGrantId: "approval:issue637-dashboard-e2e",
        executionId: "issue637-dashboard-e2e"
      })
    });
    return { status: response.status, body: await response.json() };
  }, { proposalId: firstTurnBody.execution.vpsProposalId });

  expect(approvedTurn.status).toBe(202);
  expect(approvedTurn.body.execution.status).toBe("queued_for_vps_helper_execution");
  expect(approvedTurn.body.execution.runtimeTruth.status).toBe("queued_for_vps_helper_execution");
  expect(approvedTurn.body.execution.runtimeTruth.rootExecutionStarted).toBe(false);
  expect(approvedTurn.body.execution.runtimeTruth.helperExecutionStarted).toBe(false);
  expect(approvedTurn.body.execution.runtimeTruth.dashboardNaturalLanguagePathReached).toBe(true);
  expect(approvedTurn.body.execution.runtimeTruth.helperQueueReached).toBe(true);
  expect(githubCalls).toHaveLength(1);
  const queueCommentBody = JSON.parse(githubCalls[0].init.body).body;
  expect(queueCommentBody).toContain("vtdd:vps-privileged-maintenance-execution:issue637-dashboard-e2e");
  expect(queueCommentBody).toContain('"transport": "vps_privileged_maintenance_helper"');
  expect(queueCommentBody).toContain('"helperExecutionInput"');

  const state = {
    browserName,
    dashboardUrl,
    ownerIntent,
    proposal: {
      status: firstTurn.status(),
      vpsProposalId: firstTurnBody.execution.vpsProposalId,
      approvalBoundary: firstTurnBody.execution.approvalScope || null
    },
    firstTurnExecution: firstTurnBody.execution,
    queueRuntimeTruth: approvedTurn.body.execution.runtimeTruth,
    queueExecution: approvedTurn.body.execution.queue,
    queueCommentPosted: githubCalls.length === 1,
    queueCommentBody,
    rootExecutionStarted: approvedTurn.body.execution.runtimeTruth.rootExecutionStarted,
    helperExecutionStarted: approvedTurn.body.execution.runtimeTruth.helperExecutionStarted,
    userAgent: await page.evaluate(() => navigator.userAgent)
  };
  const statePath = path.join(evidenceDir, `issue637-dashboard-helper-queue-${browserName}-state.json`);
  const screenshotPath = path.join(evidenceDir, `issue637-dashboard-helper-queue-${browserName}-390x844.png`);
  await fs.writeFile(statePath, JSON.stringify({ ok: true, state }, null, 2));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(JSON.stringify({
    ok: true,
    browserName,
    verified: [
      "Dashboard Butler mobile chat surface accepted owner intent",
      "Dashboard Butler natural-language chat created approval proposal and queued helper handoff after approval grant",
      "helper execution envelope was queued through mocked GitHub App comment transport",
      "rootExecutionStarted=false and helperExecutionStarted=false"
    ],
    evidence: { statePath, screenshotPath }
  }));
});
