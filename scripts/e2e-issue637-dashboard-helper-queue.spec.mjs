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
  await textarea.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
  await expect(page.locator(".bubble.owner").filter({ hasText: "Issue #637" })).toHaveCount(1);

  const proposalBody = await page.evaluate(async ({ gatewayToken: token }) => {
    const response = await fetch("/v2/vps/privileged-maintenance/proposals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        host: "x85-131-245-163",
        repository: "marushu/vtdd-v2-p",
        relatedIssue: 637,
        operation: "add",
        id: "playwright.chromium.deps",
        title: "Playwright Chromium dependency install",
        commandClass: "playwright_install_deps_chromium",
        riskLevel: "high",
        workingDirectories: ["/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"],
        allowedArgs: ["npx playwright install-deps chromium"],
        affectedPaths: ["/usr/lib", "/usr/share/fonts"],
        redactionRules: ["no secrets", "summarize package list"],
        rollbackPlan: "disable capability and keep audit history",
        expectedRuntimeTruth: ["before package check", "exit code", "after Chromium launch check"],
        reason: "Issue #637 Dashboard Butler E2E: queue handoff only, no root execution"
      })
    });
    return { status: response.status, body: await response.json() };
  }, { gatewayToken });
  expect(proposalBody.status).toBe(200);
  expect(proposalBody.body.ok).toBe(true);

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
      scope: proposalBody.body.approvalScope
    },
    metadata: { source: "issue637-dashboard-e2e" },
    priority: 96,
    tags: ["passkey_grant", "passkey_approval", "verified"],
    createdAt: "2026-05-30T00:00:00.000Z"
  });

  const routeBodies = await page.evaluate(async ({ gatewayToken: token, proposalId }) => {
    async function postJson(pathname, body) {
      const response = await fetch(pathname, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      return { status: response.status, body: await response.json() };
    }

    const helper = await postJson("/v2/vps/privileged-maintenance/helper-requests", {
      vpsProposalId: proposalId,
      approvalGrantId: "approval:issue637-dashboard-e2e"
    });
    const manifest = {
      version: 1,
      host: "x85-131-245-163",
      repository: "marushu/vtdd-v2-p",
      updatedAt: "2026-05-30T00:00:00.000Z",
      capabilities: [
        {
          ...helper.body.helperRequest.capability,
          status: "enabled",
          createdAt: "2026-05-30T00:00:00.000Z",
          updatedAt: "2026-05-30T00:00:00.000Z"
        }
      ]
    };
    const execution = await postJson("/v2/vps/privileged-maintenance/helper-executions", {
      manifest,
      helperRequest: helper.body.helperRequest,
      now: "2026-05-30T00:00:00.000Z"
    });
    const queue = await postJson("/v2/vps/privileged-maintenance/helper-execution-queues", {
      repository: "marushu/vtdd-v2-p",
      issueNumber: 637,
      executionId: "issue637-dashboard-e2e",
      approvalActor: "Dashboard Butler E2E",
      executionEnvelope: execution.body.executionEnvelope
    });
    return { helper, execution, queue };
  }, { gatewayToken, proposalId: proposalBody.body.vpsProposalId });

  expect(routeBodies.helper.status).toBe(200);
  expect(routeBodies.helper.body.runtimeTruth.status).toBe("ready_for_vps_helper");
  expect(routeBodies.execution.status).toBe(200);
  expect(routeBodies.execution.body.executionEnvelope.status).toBe("ready_for_vps_helper_execution");
  expect(routeBodies.execution.body.runtimeTruth.rootExecutionStarted).toBe(false);
  expect(routeBodies.execution.body.runtimeTruth.helperExecutionStarted).toBe(false);
  expect(routeBodies.queue.status).toBe(200);
  expect(routeBodies.queue.body.runtimeTruth.status).toBe("queued_for_vps_helper_execution");
  expect(routeBodies.queue.body.runtimeTruth.rootExecutionStarted).toBe(false);
  expect(routeBodies.queue.body.runtimeTruth.helperExecutionStarted).toBe(false);
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
      status: proposalBody.status,
      vpsProposalId: proposalBody.body.vpsProposalId,
      approvalBoundary: proposalBody.body.approvalBoundary || proposalBody.body.approvalScope || null
    },
    helperRuntimeTruth: routeBodies.helper.body.runtimeTruth,
    executionRuntimeTruth: routeBodies.execution.body.runtimeTruth,
    queueRuntimeTruth: routeBodies.queue.body.runtimeTruth,
    queueExecution: routeBodies.queue.body.execution,
    queueCommentPosted: githubCalls.length === 1,
    queueCommentBody,
    rootExecutionStarted: routeBodies.queue.body.runtimeTruth.rootExecutionStarted,
    helperExecutionStarted: routeBodies.queue.body.runtimeTruth.helperExecutionStarted,
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
      "proposal/helper-request/helper-execution routes were reachable from same-origin Dashboard page",
      "helper execution envelope was queued through mocked GitHub App comment transport",
      "rootExecutionStarted=false and helperExecutionStarted=false"
    ],
    evidence: { statePath, screenshotPath }
  }));
});
