import {
  AutonomyMode,
  ActorRole,
  buildCustomGptRecoveryBundle,
  CustomGptSetupChannel,
  MemoryRecordType,
  appendDecisionLogFromGateway,
  appendProposalLogFromGateway,
  createCloudflareMemoryProvider,
  createPasskeyApprovalOptions,
  createPasskeyRegistrationOptions,
  createMemoryRecord,
  createRemoteCodexExecutionRequest,
  deleteRepositoryNickname,
  dedupePasskeys,
  dispatchRemoteCodexExecution,
  executeDeployProductionPlane,
  executeGitHubActionsSecretSync,
  evaluateButlerSelfParity,
  evaluateCustomGptSetupDiagnostics,
  evaluateExecutionContinuity,
  evaluateMemorySafety,
  executeGitHubHighRiskPlane,
  inferRelatedIssueFromGatewayInput,
  inferRelatedIssueFromProposalGatewayInput,
  isExpiredPasskeyEphemeralRecord,
  normalizeScopeSnapshot,
  normalizeAutonomyMode,
  retrieveRemoteCodexExecutionProgress,
  retrieveVpsRunnerHealthStatus,
  retrieveCrossIssueMemoryIndex,
  retrieveOperationalMemory,
  retrieveDecisionLogReferences,
  retrieveProposalLogReferences,
  retrieveConstitution,
  retrieveCustomGptSetupArtifact,
  renderPasskeyOperatorPage,
  renderCustomGptSetupDiagnosticsPage,
  renderCustomGptRecoveryPage,
  buildVtddCloudflarePageDirectory,
  renderVtddHelpGuidePage,
  sanitizeGitHubActionsSecretSyncErrorMessage,
  RepositoryNicknameMode,
  resolveGatewayAliasRegistryFromGitHubApp,
  resolveRepositoryTarget,
  GitHubHighRiskOperation,
  getGitHubAppOperation,
  mergeAliasRegistries,
  retrieveStoredAliasRegistry,
  retrieveGitHubReadPlane,
  TaskMode,
  bindNaturalGitHubWriteApproval,
  cancelVpsRunnerQueue,
  executeGitHubWritePlane,
  runMvpGateway,
  upsertRepositoryNickname,
  validateMemoryProvider,
  verifyPasskeyApproval,
  verifyPasskeyRegistration
} from "../core/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as z from "zod";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8"
};

const CANONICAL_API_PREFIX = "/v2";
const LEGACY_API_PREFIX = "/mvp";
const MCP_PATH = "/mcp";
const MCP_PROTOCOL_VERSION = "2025-03-26";
const MCP_PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
const MCP_PROTECTED_RESOURCE_METADATA_MIRROR_PATH = `${MCP_PROTECTED_RESOURCE_METADATA_PATH}/mcp`;
const MCP_SERVER_INFO = Object.freeze({
  name: "vtdd-mcp",
  version: "0.1.0"
});
const MCP_INSTRUCTIONS =
  "VTDD MCP は Butler と同じ runtime truth / review truth / operational memory を読むための read-first surface です。現在の truth は runtime truth を優先し、memory は補助として扱ってください。";

export class DashboardChatRoom {
  constructor(state, env) {
    this.ctx = state;
    this.env = env;
    this.sessions = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/broadcast") {
      const payload = await readJson(request);
      const threadId = normalizeDashboardThreadId(payload.threadId || payload.thread_id);
      if (!threadId) {
        return json(422, {
          ok: false,
          error: "thread_id_required",
          reason: "threadId is required"
        });
      }
      await this.broadcastThread({
        threadId,
        messages: Array.isArray(payload.messages) ? payload.messages : null
      });
      return json(202, { ok: true, threadId });
    }

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json(426, {
        ok: false,
        error: "websocket_upgrade_required",
        reason: "dashboard chat room requires a WebSocket upgrade"
      });
    }
    if (typeof WebSocketPair !== "function") {
      return json(501, {
        ok: false,
        error: "websocket_runtime_unavailable",
        reason: "WebSocketPair is not available in this runtime"
      });
    }

    const appServerBridgeSocket = isDashboardAppServerBridgeSocketPath(url.pathname);
    const threadId = appServerBridgeSocket
      ? normalizeDashboardThreadId(url.searchParams.get("threadId") || url.searchParams.get("thread_id"))
      : extractDashboardChatSocketThreadId(url.pathname);
    if (appServerBridgeSocket) {
      return this.acceptSocket({ request, role: "app_server_bridge", threadId });
    }
    if (!threadId) {
      return json(422, {
        ok: false,
        error: "thread_id_required",
        reason: "threadId is required"
      });
    }

    return this.acceptSocket({ request, role: "dashboard", threadId });
  }

  async acceptSocket({ request, role, threadId }) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const attachment = { role, threadId };
    if (typeof this.ctx?.acceptWebSocket === "function") {
      server.serializeAttachment(attachment);
      this.ctx.acceptWebSocket(server);
    } else {
      server.accept();
      this.sessions.set(server, attachment);
      server.addEventListener("close", () => this.sessions.delete(server));
      server.addEventListener("error", () => this.sessions.delete(server));
      server.addEventListener("message", (event) => this.handleSocketMessage(server, event?.data, attachment));
    }
    if (role === "app_server_bridge") {
      this.sendSocket(server, {
        type: "app_server_bridge_connected",
        ok: true,
        threadId: threadId || null,
        schema: "vtdd.dashboard.app_server_bridge.v1"
      });
    } else {
      await this.sendThread(server, threadId);
    }

    const headers =
      role === "app_server_bridge" && normalizeDashboardEventText(request.headers.get("sec-websocket-protocol")).includes("vtdd-dashboard-bridge")
        ? { "sec-websocket-protocol": "vtdd-dashboard-bridge" }
        : {};
    return new Response(null, {
      status: 101,
      headers,
      webSocket: client
    });
  }

  async webSocketMessage(socket, message) {
    const attachment = typeof socket.deserializeAttachment === "function" ? socket.deserializeAttachment() : null;
    await this.handleSocketMessage(socket, message, attachment);
  }

  webSocketClose(socket) {
    this.sessions.delete(socket);
  }

  webSocketError(socket) {
    this.sessions.delete(socket);
  }

  async handleSocketMessage(socket, message, attachment = {}) {
    const socketAttachment = attachment || this.sessions.get(socket) || {};
    const threadId = normalizeDashboardThreadId(socketAttachment.threadId);
    const text = normalizeDashboardEventText(message);
    const lowerText = text.toLowerCase();
    if (lowerText === "ping" && isSocketOpen(socket)) {
      socket.send(JSON.stringify({ type: "pong", ok: true, threadId }));
      return;
    }
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (payload?.type === "owner_message") {
      await this.acceptOwnerMessage({ socket, threadId, payload });
      return;
    }
    if (socketAttachment.role === "app_server_bridge") {
      await this.acceptAppServerBridgeMessage({ socket, attachment: socketAttachment, payload });
    }
  }

  async acceptOwnerMessage({ socket, threadId, payload }) {
    const clientMessageId = sanitizeDashboardChatText(payload?.clientMessageId || payload?.client_message_id);
    const inputMediaReferences = payload?.mediaReferences || payload?.media_references || payload?.media;
    const mediaReferences = normalizeMediaReferences(inputMediaReferences);
    const text =
      sanitizeDashboardChatText(payload?.text || payload?.message || payload?.body) ||
      (mediaReferences.length > 0 ? "添付を追加しました。" : "");
    if (!threadId || !text) {
      if (isSocketOpen(socket)) {
        socket.send(JSON.stringify({
          type: "error",
          ok: false,
          reason: "message text is required",
          clientMessageId
        }));
      }
      return;
    }
    const relatedIssue =
      normalizePositiveInteger(payload?.relatedIssue || payload?.issueNumber) || extractIssueNumberFromDashboardChatText(text);
    const now = new Date().toISOString();
    const store = resolveDashboardChatStore(this.env);
    if (clientMessageId && await this.hasAcceptedOwnerMessage({ threadId, clientMessageId, store })) {
      this.sendSocket(socket, {
        type: "owner_message_accepted",
        ok: true,
        clientMessageId,
        messageId: clientMessageId,
        duplicate: true
      });
      await this.broadcastThread({ threadId });
      return;
    }
    const repositoryResolution = await resolveDashboardChatRepository({
      payload: { ...normalizeObject(payload), text, threadId },
      env: this.env
    });
    const repository = repositoryResolution.ok ? repositoryResolution.repository : "";
    const mediaValidation = await resolveDashboardChatMediaReferences({
      env: this.env,
      mediaReferences: inputMediaReferences,
      repository,
      relatedIssue
    });
    if (!mediaValidation.ok) {
      if (isSocketOpen(socket)) {
        socket.send(JSON.stringify({
          type: "error",
          ok: false,
          reason: mediaValidation.reason,
          clientMessageId
        }));
      }
      return;
    }
    const ownerMessage = normalizeDashboardChatMessage(
      {
        threadId,
        role: "owner",
        repository,
        relatedIssue,
        status: "sent",
        text,
        messageId: clientMessageId || undefined,
        mediaReferences: mediaValidation.mediaReferences,
        createdAt: now
      },
      { threadId }
    );
    const bridgeSockets = this.connectedAppServerBridgeSockets(threadId);
    if (bridgeSockets.length === 0) {
      const butlerMessage = normalizeDashboardChatMessage(
        {
          threadId,
          role: "butler",
          repository,
          relatedIssue,
          status: "blocked",
          text: buildDashboardAppServerNotConnectedReply({ repository, relatedIssue }),
          createdAt: new Date(Date.parse(now) + 1).toISOString()
        },
        { threadId }
      );
      const messages = store ? await store.appendMany(threadId, [ownerMessage, butlerMessage]) : [ownerMessage, butlerMessage].filter(Boolean);
      await this.writeAcceptedOwnerMessage({ threadId, clientMessageId, messageId: ownerMessage.messageId, acceptedAt: now });
      await this.broadcastThread({ threadId, messages });
      this.sendSocket(socket, {
        type: "owner_message_accepted",
        ok: true,
        clientMessageId,
        messageId: ownerMessage.messageId
      });
      return;
    }

    const messages = store ? await store.appendMany(threadId, [ownerMessage]) : [ownerMessage].filter(Boolean);
    await this.writeAcceptedOwnerMessage({ threadId, clientMessageId, messageId: ownerMessage.messageId, acceptedAt: now });
    await this.broadcastThread({ threadId, messages });
    this.sendSocket(socket, {
      type: "owner_message_accepted",
      ok: true,
      clientMessageId,
      messageId: ownerMessage.messageId
    });
    await this.broadcastTransientStatus({
      threadId,
      status: "thinking",
      text: "app-server bridge の返信を待っています"
    });
    const mapping = await this.readAppServerThreadMapping(threadId);
    const turnRequest = {
      type: "app_server_turn_requested",
      schema: "vtdd.dashboard.app_server_bridge.v1",
      requestId: createDashboardRequestId("app-server-turn"),
      threadId,
      codexThreadId: mapping.codexThreadId || null,
      repository: repository || null,
      relatedIssue: relatedIssue || null,
      text,
      mediaReferences: mediaValidation.mediaReferences,
      messageId: ownerMessage.messageId,
      createdAt: now,
      appServer: {
        startThreadMethod: mapping.codexThreadId ? "thread/resume" : "thread/start",
        turnMethod: "turn/start"
      },
      authority: buildDashboardAppServerAuthorityHint({ repository, relatedIssue, text })
    };
    this.sendSocket(bridgeSockets[0], turnRequest);
  }

  async acceptAppServerBridgeMessage({ socket, attachment, payload }) {
    const normalized = normalizeDashboardAppServerBridgeEvent(payload, {
      fallbackThreadId: attachment?.threadId
    });
    if (!normalized.ok) {
      this.sendSocket(socket, {
        type: "error",
        ok: false,
        reason: normalized.reason
      });
      return;
    }
    const attachmentThreadId = normalizeDashboardThreadId(attachment?.threadId);
    if (attachmentThreadId && normalized.threadId !== attachmentThreadId) {
      this.sendSocket(socket, {
        type: "error",
        ok: false,
        reason: "bridge threadId does not match the connected dashboard thread"
      });
      return;
    }
    if (normalized.codexThreadId) {
      await this.writeAppServerThreadMapping(normalized.threadId, {
        codexThreadId: normalized.codexThreadId,
        updatedAt: normalized.createdAt
      });
    }
    if (normalized.transientStatus) {
      await this.broadcastTransientStatus({
        threadId: normalized.threadId,
        status: normalized.transientStatus,
        text: normalized.text
      });
    }
    if (normalized.messages.length === 0) {
      return;
    }
    const store = resolveDashboardChatStore(this.env);
    const messages = store
      ? await store.appendMany(normalized.threadId, normalized.messages)
      : normalized.messages;
    await this.broadcastThread({ threadId: normalized.threadId, messages });
  }

  async broadcastThread({ threadId, messages = null }) {
    const resolvedMessages = Array.isArray(messages) ? messages : await this.listThreadMessages(threadId);
    const payload = JSON.stringify({
      type: "thread",
      ok: true,
      threadId,
      messages: resolvedMessages
    });
    for (const socket of this.connectedSockets()) {
      const attachment = this.getSocketAttachment(socket);
      if (
        attachment.role !== "vps_runner" &&
        attachment.role !== "app_server_bridge" &&
        (!attachment.threadId || attachment.threadId === threadId) &&
        isSocketOpen(socket)
      ) {
        socket.send(payload);
      }
    }
  }

  async broadcastTransientStatus({ threadId, status, text }) {
    const payload = JSON.stringify({
      type: "transient_status",
      ok: true,
      threadId,
      status,
      text
    });
    for (const socket of this.connectedSockets()) {
      const attachment = this.getSocketAttachment(socket);
      if (
        attachment.role !== "vps_runner" &&
        attachment.role !== "app_server_bridge" &&
        (!attachment.threadId || attachment.threadId === threadId) &&
        isSocketOpen(socket)
      ) {
        socket.send(payload);
      }
    }
  }

  async sendThread(socket, threadId) {
    if (!isSocketOpen(socket)) return;
    try {
      socket.send(
        JSON.stringify({
          type: "thread",
          ok: true,
          threadId,
          messages: await this.listThreadMessages(threadId)
        })
      );
    } catch (error) {
      if (isSocketOpen(socket)) {
        socket.send(
          JSON.stringify({
            type: "error",
            ok: false,
            reason: sanitizeDashboardChatText(error?.message || "dashboard chat room failed")
          })
        );
      }
    }
  }

  async listThreadMessages(threadId) {
    const store = resolveDashboardChatStore(this.env);
    if (!store) {
      return [];
    }
    return store.listThread(threadId, { limit: 80 });
  }

  connectedSockets() {
    if (typeof this.ctx?.getWebSockets === "function") {
      return this.ctx.getWebSockets();
    }
    return Array.from(this.sessions.keys());
  }

  getSocketAttachment(socket) {
    if (typeof socket?.deserializeAttachment === "function") {
      return socket.deserializeAttachment() || {};
    }
    return this.sessions.get(socket) || {};
  }

  connectedAppServerBridgeSockets(threadId) {
    return this.connectedSockets().filter((socket) => {
      const attachment = this.getSocketAttachment(socket);
      return (
        attachment.role === "app_server_bridge" &&
        (!attachment.threadId || attachment.threadId === threadId) &&
        isSocketOpen(socket)
      );
    });
  }

  sendSocket(socket, payload) {
    if (!isSocketOpen(socket)) {
      return false;
    }
    socket.send(JSON.stringify(payload));
    return true;
  }

  async readAppServerThreadMapping(threadId) {
    const key = `app_server_thread:${normalizeDashboardThreadId(threadId)}`;
    if (!key || typeof this.ctx?.storage?.get !== "function") {
      return {};
    }
    try {
      const record = await this.ctx.storage.get(key);
      return normalizeObject(record);
    } catch {
      return {};
    }
  }

  async writeAppServerThreadMapping(threadId, mapping) {
    const normalizedThreadId = normalizeDashboardThreadId(threadId);
    if (!normalizedThreadId || typeof this.ctx?.storage?.put !== "function") {
      return false;
    }
    const codexThreadId = normalizeDashboardEventText(mapping?.codexThreadId || mapping?.codex_thread_id);
    if (!codexThreadId) {
      return false;
    }
    await this.ctx.storage.put(`app_server_thread:${normalizedThreadId}`, {
      codexThreadId,
      updatedAt: normalizeIsoTimestamp(mapping?.updatedAt) || new Date().toISOString()
    });
    return true;
  }

  async hasAcceptedOwnerMessage({ threadId, clientMessageId, store }) {
    const normalizedThreadId = normalizeDashboardThreadId(threadId);
    const normalizedClientMessageId = normalizeDashboardEventText(clientMessageId);
    if (!normalizedThreadId || !normalizedClientMessageId) {
      return false;
    }
    if (typeof this.ctx?.storage?.get === "function") {
      try {
        const record = await this.ctx.storage.get(`owner_message:${normalizedThreadId}:${normalizedClientMessageId}`);
        if (record) {
          return true;
        }
      } catch {
        // Fall back to thread history below.
      }
    }
    if (store && typeof store.listThread === "function") {
      try {
        const messages = await store.listThread(normalizedThreadId, { limit: 80 });
        return messages.some((message) => message?.role === "owner" && message?.messageId === normalizedClientMessageId);
      } catch {
        return false;
      }
    }
    return false;
  }

  async writeAcceptedOwnerMessage({ threadId, clientMessageId, messageId, acceptedAt }) {
    const normalizedThreadId = normalizeDashboardThreadId(threadId);
    const normalizedClientMessageId = normalizeDashboardEventText(clientMessageId);
    if (!normalizedThreadId || !normalizedClientMessageId || typeof this.ctx?.storage?.put !== "function") {
      return false;
    }
    await this.ctx.storage.put(`owner_message:${normalizedThreadId}:${normalizedClientMessageId}`, {
      messageId: normalizeDashboardEventText(messageId) || normalizedClientMessageId,
      acceptedAt: normalizeIsoTimestamp(acceptedAt) || new Date().toISOString()
    });
    return true;
  }
}
const CLOUDFLARE_ACCESS_JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const DASHBOARD_PASSKEY_SESSION_COOKIE = "vtdd_dashboard_session";
const DASHBOARD_PASSKEY_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const cloudflareAccessJwksCache = new Map();
const AUTONOMY_MODE_ENV = "VTDD_AUTONOMY_MODE";
const LEGACY_AUTONOMY_MODE_ENV = "MVP_AUTONOMY_MODE";
const MEMORY_D1_BINDING = "VTDD_MEMORY_D1";
const MEMORY_R2_BINDING = "VTDD_MEMORY_R2";
const MEDIA_R2_BINDING = "VTDD_MEDIA_R2";
const MEMORY_BLOB_THRESHOLD_ENV = "VTDD_MEMORY_BLOB_THRESHOLD";
const WEB_PUSH_PUBLIC_KEY_ENV = "VTDD_WEB_PUSH_PUBLIC_KEY";
const WEB_PUSH_PRIVATE_KEY_ENV = "VTDD_WEB_PUSH_PRIVATE_KEY";
const WEB_PUSH_SUBJECT_ENV = "VTDD_WEB_PUSH_SUBJECT";
const DEFAULT_MEMORY_LIMIT = 20;
const MAX_MEMORY_LIMIT = 200;
const memoryProviderCache = new WeakMap();
const d1AdapterCache = new WeakMap();
const dashboardEventStoreCache = new WeakMap();
const dashboardChatStoreCache = new WeakMap();
const dashboardPushSubscriptionStoreCache = new WeakMap();
const mediaObjectStoreCache = new WeakMap();
const MEDIA_UPLOAD_SOFT_LIMIT_BYTES = 5 * 1024 * 1024;
const MEDIA_UPLOAD_HARD_LIMIT_BYTES = 20 * 1024 * 1024;
const MEDIA_REFERENCE_LIMIT = 12;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, {
        ok: true,
        service: "vtdd-v2-worker",
        mode: "v2",
        autonomyMode: resolveRuntimeAutonomyMode(env)
      });
    }

    if (request.method === "GET" && url.pathname === "/status") {
      return html(
        200,
        renderV2StatusPage({
          runtimeOrigin: url.origin,
          autonomyMode: resolveRuntimeAutonomyMode(env)
        })
      );
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/setup" ||
        url.pathname === "/setup/recovery" ||
        url.pathname === "/setup/latest" ||
        url.pathname === "/setup/known-good")
    ) {
      return handleCustomGptRecoveryPageRequest(url, env);
    }

    if (request.method === "GET" && url.pathname === "/setup/diagnostics") {
      return handleCustomGptSetupDiagnosticsPageRequest(url, env);
    }

    if (request.method === "GET" && (url.pathname === "/help" || url.pathname === "/guide")) {
      return html(
        200,
        renderVtddHelpGuidePage({
          runtimeOrigin: url.origin,
          mcpPath: MCP_PATH
        })
      );
    }

    if (request.method === "GET" && url.pathname === "/dashboard.webmanifest") {
      return json(200, buildDashboardWebManifest(url), {
        "content-type": "application/manifest+json; charset=utf-8"
      });
    }

    if (request.method === "GET" && url.pathname === "/dashboard-sw.js") {
      return javascript(200, renderDashboardServiceWorkerScript());
    }

    if (request.method === "GET" && url.pathname === "/dashboard-icon.svg") {
      return svg(200, renderDashboardIconSvg());
    }

    if (request.method === "GET" && isDashboardPagePath(url.pathname)) {
      const auth = await authorizeDashboardRequest({ request, env, apiSuffix: url.pathname });
      if (!auth.ok) {
        return html(auth.status, renderDashboardAuthRequiredPage({ runtimeOrigin: url.origin, reason: auth.reason }));
      }
    }

    if (request.method === "GET" && (url.pathname === "/dashboard" || url.pathname === "/orchestrator")) {
      return html(
        200,
        await renderV2DashboardPage({
          runtimeOrigin: url.origin,
          url,
          dashboardEventStore: resolveDashboardEventStore(env)
        })
      );
    }

    if (request.method === "GET" && url.pathname === "/dashboard/github") {
      return html(200, await renderDashboardGitHubTruthPage({ url, env }));
    }

    if (request.method === "GET" && url.pathname === "/dashboard/preflight") {
      return html(200, await renderDashboardPreflightPage({ url, env }));
    }

    if (request.method === "GET" && url.pathname === "/dashboard/progress") {
      return html(200, await renderDashboardProgressPage({ url, env }));
    }

    if (request.method === "GET" && url.pathname === "/dashboard/vps-runner") {
      return html(200, await renderDashboardVpsRunnerPage({ url, env }));
    }

    if (request.method === "GET" && url.pathname === "/dashboard/memory") {
      return html(200, await renderDashboardMemoryPage({ url, env }));
    }

    if (request.method === "GET" && url.pathname === "/dashboard/self-parity") {
      return html(200, await renderDashboardSelfParityPage({ url, env }));
    }

    if (request.method === "GET" && url.pathname === "/dashboard/notifications") {
      return html(
        200,
        await renderDashboardNotificationsPage({
          runtimeOrigin: url.origin,
          dashboardEventStore: resolveDashboardEventStore(env),
          env
        })
      );
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/dashboard/chat/messages")) {
      return handleDashboardChatMessageRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/media/upload")) {
      return handleMediaUploadRequest(request, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/media/search")) {
      return handleMediaSearchRequest(request, url, env);
    }

    const mediaRoute = matchMediaObjectRoute(url.pathname);
    if (mediaRoute && request.method === "GET") {
      return handleMediaObjectRequest(request, env, mediaRoute);
    }

    if (mediaRoute && request.method === "DELETE") {
      return handleMediaDeleteRequest(request, env, mediaRoute);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/dashboard/push/subscription")) {
      return handleDashboardPushSubscriptionRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/dashboard/push/status")) {
      return handleDashboardPushStatusRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/dashboard/push/test")) {
      return handleDashboardPushTestRequest(request, env);
    }

    if (request.method === "GET" && isDashboardChatSocketApiPath(url.pathname)) {
      return handleDashboardChatSocketRequest(request, url, env);
    }

    if (request.method === "GET" && isDashboardAppServerBridgeSocketPath(url.pathname)) {
      return handleDashboardAppServerBridgeSocketRequest(request, url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/dashboard/chat/search")) {
      return handleDashboardChatSearchRequest(request, url, env);
    }

    if (
      (request.method === "GET" || request.method === "POST") &&
      isDashboardChatSummaryApiPath(url.pathname)
    ) {
      return handleDashboardChatSummaryRequest(request, url, env);
    }

    if (request.method === "GET" && isDashboardChatThreadApiPath(url.pathname)) {
      return handleDashboardChatThreadRequest(request, url, env);
    }

    if (
      request.method === "GET" &&
      (url.pathname === MCP_PROTECTED_RESOURCE_METADATA_PATH ||
        url.pathname === MCP_PROTECTED_RESOURCE_METADATA_MIRROR_PATH)
    ) {
      return json(200, buildMcpProtectedResourceMetadata(url));
    }

    if ((request.method === "POST" || request.method === "GET") && url.pathname === MCP_PATH) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: MCP_PATH });
      if (!auth.ok) {
        const headers =
          auth.status === 401 ? buildMcpUnauthorizedHeaders(url, auth.headers ?? {}) : auth.headers ?? {};
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        }, headers);
      }
      return handleMcpRequest({ request, env, url });
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/approval/passkey/operator")) {
      await purgeExpiredPasskeyArtifacts(resolveMemoryProvider(env));
      return handlePasskeyOperatorPageRequest(request);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/gateway")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/gateway" });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      const payload = await readJson(request);
      const prepared = await prepareGatewayPayload({ payload, env });
      const result = appendWarnings(runMvpGateway(prepared.payload), prepared.warnings);
      const gatewayOutcome = result.allowed
        ? await completeGatewayRuntime({
            payload: prepared.payload,
            gatewayResult: result,
            env
          })
        : { status: 422, body: result };

      const auditedGatewayOutcome = await appendGuardedAbsenceExecutionLog({
        payload: prepared.payload,
        gatewayOutcome,
        env
      });
      return json(auditedGatewayOutcome.status, auditedGatewayOutcome.body);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/execute")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/action/execute" });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      const payload = await readJson(request);
      const prepared = await prepareGatewayPayload({
        payload,
        env,
        allowRemoteCodexHandoffNormalization: true
      });
      const result = appendWarnings(
        runMvpGateway(prepared.payload, {
          allowButlerRemoteCodexHandoff: true
        }),
        prepared.warnings
      );
      if (!result.allowed) {
        return json(422, result);
      }

      const requestValidation = createRemoteCodexExecutionRequest({
        payload: prepared.payload,
        gatewayResult: result
      });
      if (!requestValidation.ok) {
        return json(422, {
          ok: false,
          error: "remote_codex_execution_request_invalid",
          issues: requestValidation.issues
        });
      }

      const dispatched = await dispatchRemoteCodexExecution({
        payload: prepared.payload,
        gatewayResult: result,
        env
      });
      if (!dispatched.ok) {
        return json(dispatched.status ?? 503, {
          ok: false,
          error: dispatched.error ?? "remote_codex_dispatch_failed",
          blockedByRule: dispatched.blockedByRule ?? null,
          reason: dispatched.reason,
          issues: dispatched.issues ?? []
        });
      }

      return json(202, {
        ok: true,
        allowed: true,
        execution: dispatched.execution
      });
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/github")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/action/github" });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleGitHubWritePlaneRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/memory-write")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/action/memory-write"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleMemoryWriteRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/github-authority")) {
      const auth = authorizePasskeyBrowserOrMachineRequest({
        request,
        env,
        apiSuffix: "/action/github-authority"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleGitHubHighRiskPlaneRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/deploy")) {
      const auth = authorizePasskeyBrowserOrMachineRequest({
        request,
        env,
        apiSuffix: "/action/deploy"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleDeployProductionRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/events/github-actions")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/events/github-actions"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleGitHubActionsEventRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/events/vps-runner")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/events/vps-runner"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleVpsRunnerEventRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/github-actions-secret")) {
      const auth = authorizePasskeyBrowserOrMachineRequest({
        request,
        env,
        apiSuffix: "/action/github-actions-secret"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleGitHubActionsSecretSyncRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/repository-nickname")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/action/repository-nickname"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleRepositoryNicknameUpsertRequest(request, env);
    }

    if (
      request.method === "POST" &&
      isApiPath(url.pathname, "/action/repository-nickname/delete")
    ) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/action/repository-nickname/delete"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleRepositoryNicknameDeleteRequest(request, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/action/progress")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/action/progress" });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      const progress = await retrieveRemoteCodexExecutionProgress({
        executionId: url.searchParams.get("executionId"),
        repository: url.searchParams.get("repository"),
        issueNumber: url.searchParams.get("issueNumber"),
        branch: url.searchParams.get("branch"),
        executorTransport: url.searchParams.get("executorTransport"),
        env
      });
      if (!progress.ok) {
        return json(progress.status ?? 503, {
          ok: false,
          error: progress.error,
          reason: progress.reason
        });
      }

      return json(200, {
        ok: true,
        progress: progress.progress
      });
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/action/vps-runner-status")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/action/vps-runner-status"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      const status = await retrieveVpsRunnerHealthStatus({
        executionId: url.searchParams.get("executionId"),
        repository: url.searchParams.get("repository"),
        issueNumber: url.searchParams.get("issueNumber"),
        branch: url.searchParams.get("branch"),
        env
      });
      if (!status.ok) {
        return json(status.status ?? 503, {
          ok: false,
          error: status.error,
          reason: status.reason
        });
      }

      return json(200, {
        ok: true,
        health: status.health,
        progress: status.progress
      });
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/vps-runner-cancel")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/action/vps-runner-cancel"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      const payload = await readJson(request);
      const cancellation = await cancelVpsRunnerQueue({
        repository: payload.repository,
        issueNumber: payload.issueNumber,
        executionId: payload.executionId,
        mode: payload.mode,
        reason: payload.reason,
        actor: payload.actor,
        env
      });
      if (!cancellation.ok) {
        return json(cancellation.status ?? 503, {
          ok: false,
          error: cancellation.error,
          reason: cancellation.reason,
          issues: cancellation.issues ?? []
        });
      }

      return json(200, {
        ok: true,
        cancellation: cancellation.cancellation
      });
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/approval-grant")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/approval-grant" });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveApprovalGrantRequest(url, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/approval/passkey/register/options")) {
      await purgeExpiredPasskeyArtifacts(resolveMemoryProvider(env));
      const auth = await authorizePasskeyRegistrationRequest({
        request,
        env,
        apiSuffix: "/approval/passkey/register/options"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handlePasskeyRegistrationOptionsRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/approval/passkey/register/verify")) {
      await purgeExpiredPasskeyArtifacts(resolveMemoryProvider(env));
      const auth = await authorizePasskeyRegistrationRequest({
        request,
        env,
        apiSuffix: "/approval/passkey/register/verify"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handlePasskeyRegistrationVerifyRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/approval/passkey/challenge")) {
      await purgeExpiredPasskeyArtifacts(resolveMemoryProvider(env));
      const auth = authorizePasskeyBrowserOrMachineRequest({
        request,
        env,
        apiSuffix: "/approval/passkey/challenge"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handlePasskeyApprovalOptionsRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/approval/passkey/verify")) {
      await purgeExpiredPasskeyArtifacts(resolveMemoryProvider(env));
      const auth = authorizePasskeyBrowserOrMachineRequest({
        request,
        env,
        apiSuffix: "/approval/passkey/verify"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handlePasskeyApprovalVerifyRequest(request, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/constitution")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/constitution" });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveConstitutionRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/decisions")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/decisions" });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveDecisionLogsRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/proposals")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/proposals" });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveProposalLogsRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/cross")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/cross" });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveCrossIssueRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/operational-memory")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/retrieve/operational-memory"
      });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveOperationalMemoryRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/startup-preflight")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/retrieve/startup-preflight"
      });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveStartupPreflightRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/github")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/github" });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveGitHubReadPlaneRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/cloudflare-pages")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/retrieve/cloudflare-pages"
      });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveCloudflarePagesRequest(url);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/setup-artifact")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/setup-artifact" });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveCustomGptSetupArtifactRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/self-parity")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/self-parity" });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveButlerSelfParityRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/setup-diagnostics")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/setup-diagnostics" });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveCustomGptSetupDiagnosticsRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/repository-nicknames")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/retrieve/repository-nicknames"
      });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveRepositoryNicknamesRequest(env);
    }

    return json(404, {
      ok: false,
      error: "not_found"
    });
  }
};

async function handleRetrieveConstitutionRequest(url, env) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return retrieveErrorJson(url, 503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for constitution retrieval"
    });
  }

  const limit = normalizeLimit(url.searchParams.get("limit"), 5);
  const records = await retrieveConstitution(provider, limit);
  return json(200, {
    ok: true,
    recordType: "constitution",
    recordCount: records.length,
    records
  });
}

async function handleRetrieveDecisionLogsRequest(url, env) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return retrieveErrorJson(url, 503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for decision log retrieval"
    });
  }

  const limit = normalizeLimit(url.searchParams.get("limit"), 5);
  const relatedIssue = normalizeIssue(url.searchParams.get("relatedIssue"));
  const retrieved = await retrieveDecisionLogReferences(provider, {
    limit,
    relatedIssue
  });

  if (!retrieved.ok) {
    return retrieveErrorJson(url, retrieved.status, {
      ok: false,
      error: retrieved.error ?? "memory_read_failed",
      reason: retrieved.reason
    });
  }

  return json(200, {
    ok: true,
    recordType: "decision_log",
    recordCount: retrieved.references.length,
    references: retrieved.references
  });
}

async function handleRetrieveProposalLogsRequest(url, env) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return retrieveErrorJson(url, 503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for proposal log retrieval"
    });
  }

  const limit = normalizeLimit(url.searchParams.get("limit"), 5);
  const relatedIssue = normalizeIssue(url.searchParams.get("relatedIssue"));
  const retrieved = await retrieveProposalLogReferences(provider, {
    limit,
    relatedIssue
  });

  if (!retrieved.ok) {
    return retrieveErrorJson(url, retrieved.status, {
      ok: false,
      error: retrieved.error ?? "memory_read_failed",
      reason: retrieved.reason
    });
  }

  return json(200, {
    ok: true,
    recordType: "proposal_log",
    recordCount: retrieved.references.length,
    references: retrieved.references
  });
}

async function handleRetrieveCrossIssueRequest(url, env) {
  const provider = resolveMemoryProvider(env);
  const phase = normalize(url.searchParams.get("phase")) || "execution";
  const limit = normalizeLimit(url.searchParams.get("limit"), 5);
  const relatedIssue = normalizeIssue(url.searchParams.get("relatedIssue"));
  const issueNumber = normalizeIssue(url.searchParams.get("issueNumber"));
  const issueTitle = normalizeText(url.searchParams.get("issueTitle"));
  const issueUrl = normalizeText(url.searchParams.get("issueUrl"));
  const queryText =
    normalizeText(url.searchParams.get("text")) || normalizeText(url.searchParams.get("q"));
  const semanticEnabled = parseBooleanQueryParam(url.searchParams.get("semantic"));

  const retrieved = await retrieveCrossIssueMemoryIndex(provider, {
    phase,
    limit,
    relatedIssue,
    text: queryText,
    semanticRetrieval: {
      enabled: semanticEnabled,
      mode: semanticEnabled ? "assistive" : "disabled"
    },
    issueContext:
      issueNumber || issueTitle || issueUrl
        ? {
            issueNumber,
            issueTitle,
            issueUrl
          }
        : null
  });
  if (!retrieved.ok) {
    return retrieveErrorJson(url, retrieved.status ?? 503, {
      ok: false,
      error: retrieved.error ?? "memory_read_failed",
      reason: retrieved.reason
    });
  }

  return json(200, {
    ok: true,
    retrievalPlan: retrieved.retrievalPlan,
    relatedIssue: retrieved.relatedIssue,
    queryText: retrieved.queryText,
    semanticRetrieval: retrieved.semanticRetrieval,
    primaryReference: retrieved.primaryReference,
    referencesBySource: retrieved.referencesBySource,
    orderedReferences: retrieved.orderedReferences
  });
}

async function handleRetrieveOperationalMemoryRequest(url, env) {
  const provider = resolveMemoryProvider(env);
  const limit = normalizeLimit(url.searchParams.get("limit"), 8);
  const queryText =
    normalizeText(url.searchParams.get("text")) || normalizeText(url.searchParams.get("q"));
  const recordId = normalizeText(url.searchParams.get("recordId"));
  const repository = normalizeText(url.searchParams.get("repository"));
  const runtimeTruth = buildRetrieveRuntimeTruth(url);

  const retrieved = await retrieveOperationalMemory(provider, {
    text: queryText,
    recordId,
    repository,
    limit,
    runtimeTruth
  });
  if (!retrieved.ok) {
    return retrieveErrorJson(url, retrieved.status ?? 503, {
      ok: false,
      error: retrieved.error ?? "operational_memory_read_failed",
      reason: retrieved.reason
    });
  }

  return json(200, {
    ok: true,
    architecture: retrieved.architecture,
    queryText: retrieved.queryText,
    repository: retrieved.repository,
    runtimeTruth: retrieved.runtimeTruth,
    recordIdLookup: retrieved.recordIdLookup,
    memoryUseRule: retrieved.memoryUseRule,
    compactContext: retrieved.compactContext,
    referencesByLayer: retrieved.referencesByLayer,
    retrievalSignals: retrieved.retrievalSignals
  });
}

async function handleRetrieveStartupPreflightRequest(url, env) {
  const repository = normalizeText(url.searchParams.get("repository"));
  if (!repository) {
    return retrieveErrorJson(url, 422, {
      ok: false,
      error: "startup_preflight_request_invalid",
      reason: "repository is required",
      issues: ["repository is required"]
    });
  }

  const ref = normalizeText(url.searchParams.get("ref")) || "main";
  const issueNumber = normalizeIssue(url.searchParams.get("issueNumber"));
  const phase = normalizeText(url.searchParams.get("phase")) || "execution";
  const currentSurface = normalizeText(url.searchParams.get("currentSurface")) || "butler";
  const queryText =
    normalizeText(url.searchParams.get("text")) ||
    [
      "VTDD startup preflight",
      "Butler-first",
      "iPhone iPad first",
      "VPS Codex CLI",
      issueNumber ? `Issue #${issueNumber}` : ""
    ]
      .filter(Boolean)
      .join(" ");

  const startupPreflight = await buildStartupPreflight({
    repository,
    ref,
    issueNumber,
    phase,
    currentSurface,
    queryText,
    runtimeOrigin: url.origin,
    env
  });

  return json(200, {
    ok: true,
    startupPreflight
  });
}

async function buildStartupPreflight({
  repository,
  ref,
  issueNumber,
  phase,
  currentSurface,
  queryText,
  runtimeOrigin,
  env
}) {
  const requiredSourcePaths = [
    "AGENTS.md",
    "docs/butler/thread-independent-startup-contract.md",
    "docs/butler/capability-matrix.md"
  ];
  const [sourceResults, issueResult, openIssuesResult, memoryResult, parityResult] =
    await Promise.all([
      Promise.all(
        requiredSourcePaths.map((path) =>
          readStartupPreflightSource({ repository, ref, path, env })
        )
      ),
      issueNumber
        ? readStartupPreflightGitHub({
            resource: "issues",
            repository,
            issueNumber,
            env
          })
        : Promise.resolve({ ok: false, status: "not_requested", reason: "issueNumber is missing" }),
      readStartupPreflightGitHub({
        resource: "issues",
        repository,
        state: "open",
        limit: 10,
        env
      }),
      readStartupPreflightOperationalMemory({
        repository,
        queryText,
        currentSurface,
        phase,
        env
      }),
      evaluateStartupPreflightSelfParity({
        repository,
        ref,
        issueNumber,
        runtimeOrigin,
        env
      })
    ]);

  const sources = sourceResults.map((result) => ({
    path: result.path,
    status: result.ok ? "read" : "未確認",
    sha: result.record?.sha || null,
    htmlUrl: result.record?.htmlUrl || null,
    excerpt: result.ok ? compactExcerpt(result.record?.content, 420) : null,
    reason: result.ok ? null : result.reason
  }));
  const missingSources = sources
    .filter((source) => source.status !== "read")
    .map((source) => ({ path: source.path, reason: source.reason || "unverified" }));

  const issueRecords = issueResult.ok ? issueResult.read.records : [];
  const activeIssue = issueRecords[0] ?? null;
  const openIssues = openIssuesResult.ok ? openIssuesResult.read.records : [];
  const threadLocalAssumptionsPromoted =
    startupSourceContentIncludes({
      sourceResults,
      path: "AGENTS.md",
      text: "Butler-First Operating Principle"
    }) &&
    startupSourceContentIncludes({
      sourceResults,
      path: "docs/butler/thread-independent-startup-contract.md",
      text: "threadLocalAssumptionsPromoted"
    });
  const butlerFirstPrincipleStatus = threadLocalAssumptionsPromoted ? "promoted" : "未確認";

  return {
    schemaVersion: "startup_preflight_v1",
    issueNumber: issueNumber || null,
    repository,
    ref,
    phase,
    currentSurface,
    generatedAt: new Date().toISOString(),
    sourceOrder: [
      "explicit_user_instruction",
      "active_github_issue",
      "AGENTS.md",
      "thread_independent_startup_contract",
      "github_runtime_truth",
      "operational_memory",
      "surface_capability"
    ],
    butlerFirstPrinciple: {
      status: butlerFirstPrincipleStatus,
      summary:
        "VTDD is iPhone/iPad-first and handoff-first. Butler is the owner delegate; VPS Codex CLI is the always-on execution surface; mac Codex is auxiliary, not the normal operating center.",
      macCodexCompletionRule:
        "If mac Codex performs a step Butler cannot perform, classify it as mac_codex_only_probe or a Butler/VPS/recovery gap, not VTDD completion."
    },
    threadLocalAssumptionsPromoted,
    sources,
    missingSources,
    activeIssue: activeIssue
      ? {
          number: activeIssue.number,
          title: activeIssue.title,
          state: activeIssue.state,
          htmlUrl: activeIssue.htmlUrl,
          bodyExcerpt: compactExcerpt(activeIssue.body, 520)
        }
      : null,
    openIssues: openIssues.map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      htmlUrl: issue.htmlUrl
    })),
    memory: memoryResult,
    setup: parityResult,
    surfaceCapability: buildStartupSurfaceCapability(currentSurface),
    gapClassification: buildStartupGapClassification({ currentSurface, missingSources, memoryResult }),
    nextSafeAction: buildStartupNextSafeAction({
      issueNumber,
      currentSurface,
      missingSources,
      memoryResult
    }),
    stopCondition:
      "If repository/Issue/runtime/RAG/source truth is 未確認, do not claim Butler-complete execution. Ask for owner direction or create a bounded remediation Issue."
  };
}

async function readStartupPreflightSource({ repository, ref, path, env }) {
  const result = await readStartupPreflightGitHub({
    resource: "contents",
    repository,
    ref,
    path,
    env
  });
  return {
    ...result,
    path,
    record: result.ok ? result.read.records[0] : null
  };
}

async function readStartupPreflightGitHub(input) {
  try {
    const result = await retrieveGitHubReadPlane(input);
    if (!result.ok) {
      return {
        ok: false,
        status: "未確認",
        reason: result.reason || result.error || "github read failed",
        issues: result.issues ?? []
      };
    }
    return { ok: true, read: result.read };
  } catch (error) {
    return {
      ok: false,
      status: "未確認",
      reason: normalizeText(error?.message) || "github read threw"
    };
  }
}

async function readStartupPreflightOperationalMemory({
  repository,
  queryText,
  currentSurface,
  phase,
  env
}) {
  const provider = resolveMemoryProvider(env);
  const result = await retrieveOperationalMemory(provider, {
    text: queryText,
    repository,
    limit: 5,
    runtimeTruth: {
      currentState: `startup preflight from ${currentSurface}`,
      runtimeTruthSource: "vtdd_startup_preflight",
      checkedAt: new Date().toISOString(),
      phase
    }
  });
  if (!result.ok) {
    return {
      status: "未確認",
      reason: result.reason || result.error || "operational memory unavailable",
      compactContext: [],
      retrievalSignals: []
    };
  }
  return {
    status: "read",
    queryText: result.queryText,
    memoryUseRule: result.memoryUseRule,
    compactContext: result.compactContext,
    retrievalSignals: result.retrievalSignals
  };
}

async function evaluateStartupPreflightSelfParity({
  repository,
  ref,
  issueNumber,
  runtimeOrigin,
  env
}) {
  const result = await evaluateButlerSelfParity({
    repository,
    ref,
    issueNumber,
    runtimeOrigin,
    env
  });
  if (!result.ok) {
    return {
      status: "未確認",
      reason: result.reason || result.error || "self parity unavailable"
    };
  }
  return {
    status: "read",
    runtimeParity: result.selfParity.runtimeParity,
    deployState: result.selfParity.surfaceUpdateChecklist?.cloudflareDeploy?.status || "未確認",
    actionSchemaState:
      result.selfParity.surfaceUpdateChecklist?.customGptActionSchema?.status || "未確認",
    instructionsState:
      result.selfParity.surfaceUpdateChecklist?.customGptInstructions?.status || "未確認",
    deployOperatorUrl: result.selfParity.deployOperatorUrl || null,
    issueCloseOperatorUrl: result.selfParity.issueCloseOperatorUrl || null
  };
}

function buildStartupSurfaceCapability(currentSurface) {
  const surface = normalizeText(currentSurface) || "butler";
  if (surface === "mac_codex") {
    return {
      surface,
      macRequired: true,
      preferredRole: "auxiliary_or_repair",
      ownerFacingWarning: "Mac dependency detected. Do not treat this as normal Butler completion."
    };
  }
  if (surface === "vps_codex_cli" || surface === "vps_runner") {
    return {
      surface,
      macRequired: false,
      preferredRole: "always_on_execution_surface",
      ownerFacingWarning: null
    };
  }
  return {
    surface,
    macRequired: false,
    preferredRole: "owner_delegate_entrypoint",
    ownerFacingWarning: null
  };
}

function buildStartupGapClassification({ currentSurface, missingSources, memoryResult }) {
  const gaps = [];
  if (normalizeText(currentSurface) === "mac_codex") {
    gaps.push("mac_codex_only_probe");
  }
  if (missingSources.length > 0) {
    gaps.push("butler_gap_found");
  }
  if (memoryResult.status !== "read") {
    gaps.push("recovery_gap_found");
  }
  return gaps.length > 0 ? gaps : ["none"];
}

function buildStartupNextSafeAction({ issueNumber, currentSurface, missingSources, memoryResult }) {
  if (missingSources.length > 0) {
    return "不足している startup source を確認し、推測で実装を始めない。";
  }
  if (memoryResult.status !== "read") {
    return "RAG/operational memory は未確認として扱い、GitHub runtime truth を優先して短い確認を owner に返す。";
  }
  if (normalizeText(currentSurface) === "mac_codex") {
    return "mac Codex で進める前に、同じ作業を Butler/VPS Codex CLI に渡せるかを明示する。";
  }
  return issueNumber
    ? `Issue #${issueNumber} の Intent / Success Criteria / Non-goals に沿って dry-run impact gate へ進む。`
    : "対象 Issue を確認してから dry-run impact gate へ進む。";
}

function startupSourceContentIncludes({ sourceResults, path, text }) {
  return sourceResults.some(
    (result) =>
      result.ok &&
      result.path === path &&
      String(result.record?.content || "").includes(text)
  );
}

function compactExcerpt(value, maxLength = 400) {
  const text = normalizeText(value).replace(/\s+/g, " ");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

async function handleRetrieveApprovalGrantRequest(url, env) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return retrieveErrorJson(url, 503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for approval grant retrieval"
    });
  }

  const approvalId = normalizeText(url.searchParams.get("approvalId"));
  if (!approvalId) {
    return retrieveErrorJson(url, 422, {
      ok: false,
      error: "approval_id_required",
      reason: "approvalId query parameter is required"
    });
  }

  const record = await findApprovalRecordById(provider, approvalId);
  if (!record || normalizeText(record?.content?.kind) !== "passkey_grant") {
    return retrieveErrorJson(url, 404, {
      ok: false,
      error: "approval_grant_not_found",
      reason: "matching passkey approval grant was not found"
    });
  }
  if (isExpiredPasskeyEphemeralRecord(record)) {
    return retrieveErrorJson(url, 410, {
      ok: false,
      error: "approval_grant_expired",
      reason: "approval grant is expired. Worker origin で再承認して、新しい approvalGrantId を取得してください。"
    });
  }

  return json(200, {
    ok: true,
    approvalGrant: {
      approvalId: normalizeText(record.content.approvalId) || record.id,
      verified: record.content.status === "verified",
      verifiedAt: normalizeText(record.content.verifiedAt) || null,
      expiresAt: normalizeText(record.content.expiresAt) || null,
      scope: normalizeScopeSnapshot(record.content.scope)
    }
  });
}

async function handleMemoryWriteRequest(request, env) {
  const payload = await readJson(request);
  const confirmed = payload?.confirmed === true || normalize(payload?.ownerConsent) === "go";
  if (!confirmed) {
    return json(422, {
      ok: false,
      error: "memory_write_confirmation_required",
      reason: "memory write requires Butler to show the structured memory candidate and receive GO"
    });
  }

  const memoryRecord = buildMemoryWriteRecord(payload);
  if (!memoryRecord.ok) {
    return json(422, {
      ok: false,
      error: "memory_write_request_invalid",
      reason: memoryRecord.reason,
      issues: memoryRecord.issues ?? []
    });
  }

  const safety = evaluateMemorySafety({
    recordType: memoryRecord.record.recordType,
    content: memoryRecord.record.content,
    metadata: {
      ...memoryRecord.record.metadata,
      tags: memoryRecord.record.tags
    }
  });
  if (!safety.ok) {
    return json(422, {
      ok: false,
      error: "memory_write_blocked",
      blockedByRule: safety.rule,
      reason: safety.reason,
      findings: safety.findings ?? []
    });
  }

  const provider = resolveMemoryProvider(env);
  const providerValidation = validateMemoryProvider(provider);
  if (!providerValidation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for operational memory writes"
    });
  }

  const gatewayInput = {
    phase: normalizeText(payload.phase) || "execution",
    actorRole: normalizeText(payload.actorRole) || "butler",
    memoryRecord: {
      recordType: memoryRecord.record.recordType,
      content: memoryRecord.record.content,
      metadata: memoryRecord.record.metadata
    }
  };
  const gatewayResult = {
    repository: normalizeText(payload.repository) || null
  };

  if (memoryRecord.record.recordType === MemoryRecordType.DECISION_LOG) {
    const persisted = await appendDecisionLogFromGateway(provider, gatewayInput, gatewayResult);
    return memoryWriteResponse({ persisted, provider, relatedIssue: memoryRecord.relatedIssue });
  }

  if (memoryRecord.record.recordType === MemoryRecordType.PROPOSAL_LOG) {
    const persisted = await appendProposalLogFromGateway(provider, gatewayInput, gatewayResult);
    return memoryWriteResponse({ persisted, provider, relatedIssue: memoryRecord.relatedIssue });
  }

  const created = createMemoryRecord({
    id: makeOperationalMemoryRecordId(memoryRecord.record),
    type: memoryRecord.record.recordType,
    content: memoryRecord.record.content,
    metadata: memoryRecord.record.metadata,
    priority: memoryRecord.record.priority,
    tags: memoryRecord.record.tags,
    createdAt: memoryRecord.record.timestamp
  });
  if (!created.ok) {
    return json(422, {
      ok: false,
      error: "memory_record_invalid",
      reason: "memory record does not satisfy the shared memory schema",
      issues: created.issues
    });
  }

  const stored = await provider.store(created.record);
  if (!stored?.ok) {
    return json(503, {
      ok: false,
      error: "memory_write_failed",
      reason: "failed to persist operational memory",
      issues: Array.isArray(stored?.issues) ? stored.issues : []
    });
  }

  const postWriteRetrieval = await retrievePostWriteMemory({
    provider,
    relatedIssue: memoryRecord.relatedIssue
  });

  return json(200, {
    ok: true,
    memoryWritePersisted: {
      recordId: stored.record.id,
      recordType: stored.record.type,
      relatedIssue: memoryRecord.relatedIssue,
      timestamp: stored.record.createdAt
    },
    postWriteRetrieval
  });
}

async function memoryWriteResponse({ persisted, provider, relatedIssue }) {
  if (!persisted.ok) {
    return json(persisted.status ?? 503, {
      ok: false,
      error: persisted.error ?? "memory_write_failed",
      blockedByRule: persisted.blockedByRule ?? null,
      reason: persisted.reason,
      issues: persisted.issues ?? []
    });
  }

  const postWriteRetrieval = await retrievePostWriteMemory({ provider, relatedIssue });

  return json(200, {
    ok: true,
    memoryWritePersisted: {
      recordId: persisted.record.id,
      recordType: persisted.record.type,
      relatedIssue: persisted.entry.relatedIssue ?? relatedIssue ?? null,
      timestamp: persisted.entry.timestamp
    },
    postWriteRetrieval
  });
}

async function retrievePostWriteMemory({ provider, relatedIssue }) {
  if (!relatedIssue) {
    return null;
  }

  const retrieved = await retrieveCrossIssueMemoryIndex(provider, {
    phase: "execution",
    relatedIssue,
    limit: 5,
    displayMode: "short"
  });
  return retrieved.ok
    ? formatCrossRetrievalOutput(retrieved, "short")
    : { ok: false, error: retrieved.error, reason: retrieved.reason };
}

function buildMemoryWriteRecord(payload = {}) {
  const recordType = normalizeMemoryWriteRecordType(payload.recordType ?? payload.type);
  if (!recordType) {
    return {
      ok: false,
      reason: "recordType must be decision_log, proposal_log, working_memory, or repair_case",
      issues: ["recordType is required"]
    };
  }

  const relatedIssue = normalizeIssue(payload.relatedIssue);
  const repository = normalizeText(payload.repository) || null;
  const timestamp = normalizeText(payload.timestamp) || new Date().toISOString();
  const metadata = {
    ...normalizeObject(payload.metadata),
    relatedIssue,
    repository,
    source: "butler_memory_write_action",
    fullCasualChat: false
  };

  if (recordType === MemoryRecordType.DECISION_LOG) {
    return {
      ok: true,
      relatedIssue,
      record: {
        recordType,
        content: {
          decision: normalizeText(payload.decision ?? payload.summary),
          rationale: normalizeText(payload.rationale),
          relatedIssue,
          decidedBy: normalizeText(payload.decidedBy) || "butler_with_owner_go",
          timestamp,
          supersededBy: normalizeText(payload.supersededBy) || null
        },
        metadata,
        timestamp,
        priority: normalizeMemoryPriority(payload.priority, 90),
        tags: buildMemoryWriteTags({ recordType, relatedIssue, repository, extraTags: payload.tags })
      }
    };
  }

  if (recordType === MemoryRecordType.PROPOSAL_LOG) {
    return {
      ok: true,
      relatedIssue,
      record: {
        recordType,
        content: {
          hypothesis: normalizeText(payload.hypothesis ?? payload.summary),
          options: normalizeStringArray(payload.options),
          rejectedReasons: normalizeRejectedReasons(payload.rejectedReasons),
          concerns: normalizeStringArray(payload.concerns),
          unresolvedQuestions: normalizeStringArray(payload.unresolvedQuestions),
          relatedIssue,
          proposedBy: normalizeText(payload.proposedBy) || "butler_with_owner_go",
          timestamp
        },
        metadata,
        timestamp,
        priority: normalizeMemoryPriority(payload.priority, 80),
        tags: buildMemoryWriteTags({ recordType, relatedIssue, repository, extraTags: payload.tags })
      }
    };
  }

  const summary = normalizeText(payload.summary);
  if (!summary) {
    return {
      ok: false,
      reason: "summary is required for working_memory and repair_case",
      issues: ["summary is required"]
    };
  }

  return {
    ok: true,
    relatedIssue,
    record: {
      recordType,
      content: {
        summary,
        details: normalizeText(payload.details) || null,
        checkpointReason: normalizeText(payload.checkpointReason) || null,
        thoughtLocation: normalizeText(payload.thoughtLocation) || null,
        userTension: normalizeText(payload.userTension) || null,
        origin: normalizeMemoryOrigin(payload.origin),
        user_words: normalizeBoundedMemoryStringArray(
          payload.user_words ?? payload.userWords ?? payload.userWord,
          { maxItems: 3, maxLength: 160 }
        ),
        tension_note: normalizeTensionNote(payload.tension_note ?? payload.tensionNote),
        contextSourceQuality: normalizeText(payload.contextSourceQuality) || null,
        hypothesis: normalizeText(payload.hypothesis) || null,
        explorationHypothesis: normalizeExplorationHypothesis(payload.explorationHypothesis),
        suspectedFiles: normalizeStringArray(payload.suspectedFiles),
        suspectedLines: normalizeSuspectedLines(payload.suspectedLines),
        rejectedHypotheses: normalizeRejectedHypotheses(payload.rejectedHypotheses),
        stopReason: normalizeMemorySummaryObject(payload.stopReason),
        uncertainty: normalizeMemorySummaryObject(payload.uncertainty),
        failureReasoning: normalizeMemorySummaryObject(payload.failureReasoning),
        successPattern: normalizeMemorySummaryObject(payload.successPattern),
        handoffMemory: normalizeMemorySummaryObject(payload.handoffMemory),
        expectedFiles: normalizeStringArray(payload.expectedFiles),
        evidenceLinks: normalizeStringArray(payload.evidenceLinks),
        previousRecordIds: normalizeStringArray(payload.previousRecordIds),
        captureBoundary:
          normalizeText(payload.captureBoundary) ||
          (normalizeText(payload.checkpointReason)
            ? "judgment_log_not_chain_of_thought"
            : null),
        relatedIssue,
        repository,
        timestamp
      },
      metadata,
      timestamp,
      priority: normalizeMemoryPriority(payload.priority, recordType === MemoryRecordType.REPAIR_CASE ? 85 : 60),
      tags: buildMemoryWriteTags({ recordType, relatedIssue, repository, extraTags: payload.tags })
    }
  };
}

function normalizeMemoryWriteRecordType(value) {
  const type = normalize(value);
  if (
    [
      MemoryRecordType.DECISION_LOG,
      MemoryRecordType.PROPOSAL_LOG,
      MemoryRecordType.WORKING_MEMORY,
      MemoryRecordType.REPAIR_CASE
    ].includes(type)
  ) {
    return type;
  }
  return "";
}

function normalizeMemoryPriority(value, fallback) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function buildMemoryWriteTags({ recordType, relatedIssue, repository, extraTags }) {
  const tags = [
    recordType,
    relatedIssue ? `issue:${relatedIssue}` : null,
    repository ? `repo:${normalizeTag(repository.replace("/", "_"))}` : null,
    ...normalizeStringArray(extraTags)
  ].filter(Boolean);
  return [...new Set(tags)];
}

function normalizeStringArray(value) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.map(normalizeText).filter(Boolean);
}

function normalizeBoundedMemoryStringArray(value, { maxItems, maxLength }) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values
    .map((item) => normalizeMemoryRecallText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function normalizeMemoryOrigin(value) {
  const input = normalizeObject(value);
  const origin = {
    surface: normalizeMemoryRecallText(input.surface, 80),
    moment: normalizeMemoryRecallText(input.moment, 160),
    trigger: normalizeMemoryRecallText(input.trigger, 240)
  };
  return Object.values(origin).some(Boolean) ? origin : null;
}

function normalizeTensionNote(value) {
  const input = normalizeObject(value);
  const note = {
    summary: normalizeMemoryRecallText(input.summary, 240),
    intensity: normalizeMemoryRecallText(input.intensity, 40),
    mode: normalizeMemoryRecallText(input.mode, 40),
    why_it_matters: normalizeMemoryRecallText(input.why_it_matters ?? input.whyItMatters, 320)
  };
  return Object.values(note).some(Boolean) ? note : null;
}

function normalizeExplorationHypothesis(value) {
  const input = normalizeObject(value);
  const hypothesis = {
    summary: normalizeMemoryRecallText(input.summary ?? input.hypothesis, 500),
    whySuspected: normalizeMemoryRecallText(input.whySuspected, 500),
    status: normalizeMemoryRecallText(input.status, 40),
    suspectedFiles: normalizeStringArray(input.suspectedFiles),
    suspectedLines: normalizeSuspectedLines(input.suspectedLines),
    actualRootCause: normalizeMemoryRecallText(input.actualRootCause, 500)
  };
  return Object.values(hypothesis).some((item) => (Array.isArray(item) ? item.length > 0 : Boolean(item)))
    ? hypothesis
    : null;
}

function normalizeSuspectedLines(value) {
  const values = Array.isArray(value) ? value : [];
  return values
    .map((item) => {
      const input = normalizeObject(item);
      return {
        file: normalizeMemoryRecallText(input.file, 240),
        line: normalizePositiveLine(input.line),
        lineStart: normalizePositiveLine(input.lineStart),
        lineEnd: normalizePositiveLine(input.lineEnd),
        reason: normalizeMemoryRecallText(input.reason, 500)
      };
    })
    .filter((item) => item.file);
}

function normalizeRejectedHypotheses(value) {
  const values = Array.isArray(value) ? value : [];
  return values
    .map((item) => {
      const input = normalizeObject(item);
      return {
        summary: normalizeMemoryRecallText(input.summary ?? input.hypothesis, 500),
        whyRejected: normalizeMemoryRecallText(input.whyRejected ?? input.reason, 500),
        evidence: normalizeMemoryRecallText(input.evidence, 500)
      };
    })
    .filter((item) => item.summary && item.whyRejected);
}

function normalizeMemorySummaryObject(value) {
  const input = normalizeObject(value);
  const output = {};
  for (const [key, item] of Object.entries(input)) {
    if (Array.isArray(item)) {
      const normalized = normalizeStringArray(item);
      if (normalized.length > 0) {
        output[key] = normalized;
      }
      continue;
    }
    const normalized = normalizeMemoryRecallText(item, 600);
    if (normalized) {
      output[key] = normalized;
    }
  }
  return Object.keys(output).length > 0 ? output : null;
}

function normalizePositiveLine(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeMemoryRecallText(value, maxLength) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : "";
}

function normalizeRejectedReasons(value) {
  const values = Array.isArray(value) ? value : [];
  return values
    .map((item) => ({
      option: normalizeText(item?.option),
      reason: normalizeText(item?.reason)
    }))
    .filter((item) => item.option && item.reason);
}

function makeOperationalMemoryRecordId(record) {
  return `mem_${crypto.randomUUID()}`;
}

async function handleRetrieveGitHubReadPlaneRequest(url, env) {
  const retrieved = await retrieveGitHubReadPlane({
    resource: url.searchParams.get("resource"),
    repository: url.searchParams.get("repository"),
    issueNumber: url.searchParams.get("issueNumber"),
    pullNumber: url.searchParams.get("pullNumber"),
    branch: url.searchParams.get("branch"),
    ref: url.searchParams.get("ref"),
    path: url.searchParams.get("path"),
    runId: url.searchParams.get("runId"),
    state: url.searchParams.get("state"),
    limit: url.searchParams.get("limit"),
    env
  });

  if (!retrieved.ok) {
    return retrieveErrorJson(url, retrieved.status ?? 503, {
      ok: false,
      error: retrieved.error ?? "github_read_failed",
      reason: retrieved.reason,
      issues: retrieved.issues ?? []
    });
  }

  return json(200, {
    ok: true,
    read: retrieved.read
  });
}

async function handleRetrieveCustomGptSetupArtifactRequest(url, env) {
  const retrieved = await retrieveCustomGptSetupArtifact({
    artifact: normalizeText(url.searchParams.get("artifact")),
    repository: normalizeText(url.searchParams.get("repository")),
    ref: normalizeText(url.searchParams.get("ref")),
    env
  });

  if (!retrieved.ok) {
    return retrieveErrorJson(url, retrieved.status ?? 503, {
      ok: false,
      error: retrieved.error ?? "custom_gpt_setup_artifact_unavailable",
      reason: retrieved.reason,
      issues: retrieved.issues ?? []
    });
  }

  return json(200, {
    ok: true,
    artifact: retrieved.artifact
  });
}

function handleRetrieveCloudflarePagesRequest(url) {
  return json(200, buildVtddCloudflarePageDirectory({ runtimeOrigin: url.origin }));
}

async function handleRetrieveButlerSelfParityRequest(url, env) {
  const parity = await evaluateButlerSelfParity({
    repository: normalizeText(url.searchParams.get("repository")),
    ref: normalizeText(url.searchParams.get("ref")),
    issueNumber: normalizeIssue(url.searchParams.get("issueNumber")),
    pullNumber: normalizeIssue(url.searchParams.get("pullNumber")),
    runtimeOrigin: url.origin,
    env
  });

  if (!parity.ok) {
    return retrieveErrorJson(url, parity.status ?? 503, {
      ok: false,
      error: parity.error ?? "custom_gpt_self_parity_unavailable",
      reason: parity.reason
    });
  }

  return json(200, {
    ok: true,
    selfParity: parity.selfParity
  });
}

async function handleRetrieveCustomGptSetupDiagnosticsRequest(url, env) {
  const result = await evaluateCustomGptSetupDiagnostics({
    repository: normalizeText(url.searchParams.get("repository")),
    ref: normalizeText(url.searchParams.get("ref")),
    issueNumber: normalizeIssue(url.searchParams.get("issueNumber")),
    runtimeOrigin: url.origin,
    observedFailure: readObservedSetupFailureFromUrl(url),
    env
  });

  if (!result.ok) {
    return retrieveErrorJson(url, result.status ?? 503, {
      ok: false,
      error: result.error ?? "custom_gpt_setup_diagnostics_unavailable",
      reason: result.reason
    });
  }

  return json(200, {
    ok: true,
    diagnostics: result.diagnostics
  });
}

async function handleCustomGptSetupDiagnosticsPageRequest(url, env) {
  const repository = normalizeText(url.searchParams.get("repository")) || "marushu/vtdd-v2-p";
  const ref = normalizeText(url.searchParams.get("ref")) || "main";
  const issueNumber = normalizeIssue(url.searchParams.get("issueNumber"));
  const result = await evaluateCustomGptSetupDiagnostics({
    repository,
    ref,
    issueNumber,
    runtimeOrigin: url.origin,
    observedFailure: readObservedSetupFailureFromUrl(url),
    env
  });

  return html(
    200,
    renderCustomGptSetupDiagnosticsPage({
      repository,
      ref,
      issueNumber,
      diagnostics: result.ok ? result.diagnostics : null,
      error: result.ok
        ? null
        : {
            error: result.error,
            reason: result.reason
          }
    })
  );
}

async function handleRetrieveRepositoryNicknamesRequest(env) {
  const provider = resolveMemoryProvider(env);
  const retrieved = await safeRetrieveStoredAliasRegistry(provider);
  if (!retrieved.ok) {
    return json(200, {
      ok: false,
      httpStatus: retrieved.status ?? 503,
      error: retrieved.error,
      reason: retrieved.reason,
      issues: retrieved.issues ?? [],
      recordType: MemoryRecordType.ALIAS_REGISTRY,
      recordCount: 0,
      aliasRegistry: []
    });
  }

  return json(200, {
    ok: true,
    recordType: MemoryRecordType.ALIAS_REGISTRY,
    recordCount: retrieved.aliasRegistry.length,
    aliasRegistry: retrieved.aliasRegistry
  });
}

async function handleMcpRequest({ request, env, url }) {
  if (request.method === "GET") {
    return json(
      405,
      {
        ok: false,
        error: "mcp_post_required",
        reason:
          "VTDD MCP endpoint requires MCP JSON-RPC POST requests. This stateless read surface does not expose an SSE GET stream.",
        protectedResourceMetadataUrl: buildRuntimeUrl(
          url.origin,
          MCP_PROTECTED_RESOURCE_METADATA_MIRROR_PATH
        )
      },
      {
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
        allow: "POST"
      }
    );
  }
  const server = createVtddMcpServer({ env, runtimeOrigin: url.origin });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  await server.connect(transport);
  const response = await transport.handleRequest(normalizeMcpTransportRequest(request));
  return withMcpProtocolVersionHeader(response);
}

function normalizeMcpTransportRequest(request) {
  const headers = new Headers(request.headers);
  if (!normalizeText(headers.get("accept"))) {
    headers.set("accept", "application/json, text/event-stream");
  }
  if (!normalizeText(headers.get("mcp-protocol-version"))) {
    headers.set("mcp-protocol-version", MCP_PROTOCOL_VERSION);
  }
  return new Request(request, { headers });
}

function createVtddMcpServer({ env, runtimeOrigin }) {
  const server = new McpServer(MCP_SERVER_INFO, {
    instructions: MCP_INSTRUCTIONS
  });

  server.registerTool(
    "vtdd_runtime_truth",
    {
      description:
        "指定した repository / Issue / PR / branch の current runtime truth を返します。GitHub state が current truth です。",
      inputSchema: {
        repository: z.string().min(1).describe("owner/repo 形式の repository。"),
        issueNumber: z.number().int().positive().optional().describe("対象 Issue 番号。"),
        pullNumber: z.number().int().positive().optional().describe("対象 Pull Request 番号。"),
        branch: z.string().optional().describe("対象 branch 名。"),
        includeChecks: z.boolean().optional().describe("check runs を含めるか。"),
        includeWorkflowRuns: z.boolean().optional().describe("workflow runs を含めるか。"),
        limit: z.number().int().positive().optional().describe("一覧系 read の最大件数。")
      }
    },
    async (args) => buildMcpToolResult(await executeMcpRuntimeTruth(args, env))
  );

  server.registerTool(
    "vtdd_review_truth",
    {
      description:
        "指定 PR の reviewer truth を返します。GitHub formal reviews、VTDD reviewer markers、blocking 状態、次の安全な action をまとめます。",
      inputSchema: {
        repository: z.string().min(1).describe("owner/repo 形式の repository。"),
        pullNumber: z.number().int().positive().describe("対象 Pull Request 番号。")
      }
    },
    async (args) => buildMcpToolResult(await executeMcpReviewTruth(args, env))
  );

  server.registerTool(
    "vtdd_search_operational_memory",
    {
      description:
        "structured operational memory を検索します。runtime truth を currentState として添えると memory との差異も返せます。",
      inputSchema: {
        text: z.string().min(1).describe("検索テキスト。"),
        repository: z.string().optional().describe("owner/repo 形式の repository。"),
        currentState: z.string().optional().describe("現在の runtime truth の短い説明。"),
        runtimeTruthSource: z.string().optional().describe("runtime truth source。"),
        checkedAt: z.string().optional().describe("runtime truth observed timestamp (ISO8601)."),
        limit: z.number().int().positive().optional().describe("返す compact context の最大件数。")
      }
    },
    async (args) => buildMcpToolResult(await executeMcpOperationalMemorySearch(args, env))
  );

  server.registerTool(
    "vtdd_recall_implementation",
    {
      description:
        "『あれどうやって実装したっけ？』に答えるための shared implementation recall を返します。",
      inputSchema: {
        repository: z.string().min(1).describe("owner/repo 形式の repository。"),
        issueNumber: z.number().int().positive().optional().describe("関連 Issue 番号。"),
        pullNumber: z.number().int().positive().optional().describe("関連 Pull Request 番号。"),
        text: z.string().optional().describe("実装 recall の補助クエリ。"),
        limit: z.number().int().positive().optional().describe("memory references の最大件数。")
      }
    },
    async (args) => buildMcpToolResult(await executeMcpImplementationRecall(args, env))
  );

  server.registerTool(
    "vtdd_pr_status",
    {
      description:
        "指定 PR の state / checks / review truth を Butler と同じ runtime truth モデルで返します。",
      inputSchema: {
        repository: z.string().min(1).describe("owner/repo 形式の repository。"),
        pullNumber: z.number().int().positive().describe("対象 Pull Request 番号。")
      }
    },
    async (args) => buildMcpToolResult(await executeMcpPrStatus(args, env))
  );

  server.registerTool(
    "vtdd_issue_status",
    {
      description: "指定 Issue の intent / body / memory references / blockers を返します。",
      inputSchema: {
        repository: z.string().min(1).describe("owner/repo 形式の repository。"),
        issueNumber: z.number().int().positive().describe("対象 Issue 番号。"),
        limit: z.number().int().positive().optional().describe("memory references の最大件数。")
      }
    },
    async (args) => buildMcpToolResult(await executeMcpIssueStatus(args, env, runtimeOrigin))
  );

  return server;
}

function buildMcpToolResult(result) {
  if (!result.ok) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: false,
              error: result.error,
              reason: result.reason,
              issues: result.issues ?? []
            },
            null,
            2
          )
        }
      ],
      isError: true
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result.value, null, 2)
      }
    ],
    structuredContent: result.value,
    isError: false
  };
}

function withMcpProtocolVersionHeader(response) {
  if (normalizeText(response.headers.get("mcp-protocol-version"))) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("mcp-protocol-version", MCP_PROTOCOL_VERSION);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function executeMcpToolCall({ toolName, toolArguments, env, runtimeOrigin }) {
  if (toolName === "vtdd_runtime_truth") {
    return executeMcpRuntimeTruth(toolArguments, env);
  }
  if (toolName === "vtdd_review_truth") {
    return executeMcpReviewTruth(toolArguments, env);
  }
  if (toolName === "vtdd_search_operational_memory") {
    return executeMcpOperationalMemorySearch(toolArguments, env);
  }
  if (toolName === "vtdd_recall_implementation") {
    return executeMcpImplementationRecall(toolArguments, env);
  }
  if (toolName === "vtdd_pr_status") {
    return executeMcpPrStatus(toolArguments, env);
  }
  if (toolName === "vtdd_issue_status") {
    return executeMcpIssueStatus(toolArguments, env, runtimeOrigin);
  }
  return {
    ok: false,
    error: "mcp_tool_unknown",
    reason: `unknown MCP tool: ${toolName || "unknown"}`
  };
}

async function executeMcpRuntimeTruth(argumentsInput, env) {
  const repository = normalizeText(argumentsInput.repository);
  if (!repository) {
    return {
      ok: false,
      error: "repository_required",
      reason: "repository is required"
    };
  }

  const issueNumber = normalizeIssue(argumentsInput.issueNumber);
  const pullNumber = normalizeIssue(argumentsInput.pullNumber);
  const branch = normalizeText(argumentsInput.branch);
  const limit = normalizeLimit(argumentsInput.limit, 10);
  const includeChecks = argumentsInput.includeChecks !== false;
  const includeWorkflowRuns = argumentsInput.includeWorkflowRuns === true;

  const issue = issueNumber
    ? await readGitHubResource({
        resource: "issues",
        repository,
        issueNumber,
        env
      })
    : { ok: true, records: [] };
  if (!issue.ok) {
    return issue;
  }

  const pull = pullNumber
    ? await readGitHubResource({
        resource: "pulls",
        repository,
        pullNumber,
        env
      })
    : { ok: true, records: [] };
  if (!pull.ok) {
    return pull;
  }

  const activePull = pull.records?.[0] ?? null;
  const ref = branch || activePull?.headRef || "";
  const checks =
    includeChecks && ref
      ? await readGitHubResource({
          resource: "checks",
          repository,
          ref,
          limit,
          env
        })
      : { ok: true, records: [] };
  if (!checks.ok) {
    return checks;
  }

  const workflowRuns =
    includeWorkflowRuns && (branch || activePull?.headRef)
      ? await readGitHubResource({
          resource: "workflow_runs",
          repository,
          branch: branch || activePull?.headRef,
          limit,
          env
        })
      : { ok: true, records: [] };
  if (!workflowRuns.ok) {
    return workflowRuns;
  }

  const branches = branch
    ? await readGitHubResource({
        resource: "branches",
        repository,
        branch,
        env
      })
    : { ok: true, records: [] };
  if (!branches.ok) {
    return branches;
  }

  return {
    ok: true,
    value: {
      ok: true,
      repository,
      issue: issue.records?.[0] ?? null,
      pullRequest: activePull,
      checks: checks.records ?? [],
      workflowRuns: workflowRuns.records ?? [],
      branch: branches.records?.[0] ?? null,
      sourceOfTruth: "github_runtime_truth"
    }
  };
}

async function executeMcpReviewTruth(argumentsInput, env) {
  const repository = normalizeText(argumentsInput.repository);
  const pullNumber = normalizeIssue(argumentsInput.pullNumber);
  if (!repository || !pullNumber) {
    return {
      ok: false,
      error: "repository_and_pull_required",
      reason: "repository and pullNumber are required"
    };
  }

  const pull = await readGitHubResource({ resource: "pulls", repository, pullNumber, env });
  if (!pull.ok || !pull.records?.[0]) {
    return pull.ok
      ? {
          ok: false,
          error: "pull_not_found",
          reason: "pull request runtime truth was not found"
        }
      : pull;
  }

  const reviews = await readGitHubResource({
    resource: "pull_reviews",
    repository,
    pullNumber,
    env
  });
  if (!reviews.ok) {
    return reviews;
  }

  const issueComments = await readGitHubResource({
    resource: "issue_comments",
    repository,
    issueNumber: pullNumber,
    env
  });
  if (!issueComments.ok) {
    return issueComments;
  }

  const reviewComments = await readGitHubResource({
    resource: "pull_review_comments",
    repository,
    pullNumber,
    env
  });
  if (!reviewComments.ok) {
    return reviewComments;
  }

  const continuity = evaluateExecutionContinuity({
    mode: TaskMode.EXECUTION,
    actorRole: ActorRole.BUTLER,
    continuationContext: { requiresHandoff: false },
    runtimeTruth: {
      runtimeState: {
        activeBranch: pull.records[0].headRef,
        pullRequest: {
          ...pull.records[0],
          issueComments: issueComments.records ?? [],
          reviewComments: reviewComments.records ?? [],
          reviews: reviews.records ?? [],
          reviewCommentsCount: Array.isArray(reviewComments.records) ? reviewComments.records.length : 0,
          unresolvedReviewCommentsCount: Array.isArray(reviewComments.records)
            ? reviewComments.records.length
            : 0,
          reviewer: "gemini",
          updatedSinceReview: false
        }
      }
    }
  });

  if (!continuity.ok) {
    return {
      ok: false,
      error: continuity.rule ?? "review_truth_unavailable",
      reason: continuity.reason || "failed to build review truth"
    };
  }

  return {
    ok: true,
    value: {
      ok: true,
      repository,
      pullNumber,
      reviewTruth: continuity.value.reviewLoop,
      butlerReviewSynthesis: continuity.value.butlerReviewSynthesis,
      nextSuggestedActions: continuity.value.nextSuggestedActions,
      sourceOfTruth: continuity.value.sourceOfTruth
    }
  };
}

async function executeMcpOperationalMemorySearch(argumentsInput, env) {
  const text = normalizeText(argumentsInput.text);
  if (!text) {
    return {
      ok: false,
      error: "text_required",
      reason: "text is required"
    };
  }

  const query = new URLSearchParams();
  query.set("text", text);
  if (normalizeText(argumentsInput.repository)) {
    query.set("repository", normalizeText(argumentsInput.repository));
  }
  if (normalizeText(argumentsInput.currentState)) {
    query.set("currentState", normalizeText(argumentsInput.currentState));
  }
  if (normalizeText(argumentsInput.runtimeTruthSource)) {
    query.set("runtimeTruthSource", normalizeText(argumentsInput.runtimeTruthSource));
  }
  if (normalizeText(argumentsInput.checkedAt)) {
    query.set("checkedAt", normalizeText(argumentsInput.checkedAt));
  }
  if (normalizePositiveInteger(argumentsInput.limit)) {
    query.set("limit", String(normalizePositiveInteger(argumentsInput.limit)));
  }

  const response = await handleRetrieveOperationalMemoryRequest(
    new URL(`https://mcp.local${CANONICAL_API_PREFIX}/retrieve/operational-memory?${query.toString()}`),
    env
  );
  return responseToMcpToolResult(response);
}

async function executeMcpImplementationRecall(argumentsInput, env) {
  const repository = normalizeText(argumentsInput.repository);
  if (!repository) {
    return {
      ok: false,
      error: "repository_required",
      reason: "repository is required"
    };
  }

  const issueNumber = normalizeIssue(argumentsInput.issueNumber);
  const pullNumber = normalizeIssue(argumentsInput.pullNumber);
  const text = normalizeText(argumentsInput.text);
  const limit = normalizeLimit(argumentsInput.limit, 8);

  const decisionLogs = issueNumber
    ? await readDecisionLogReferences({ env, relatedIssue: issueNumber, limit: 5 })
    : { ok: true, references: [] };
  if (!decisionLogs.ok) {
    return decisionLogs;
  }

  const proposalLogs = issueNumber
    ? await readProposalLogReferences({ env, relatedIssue: issueNumber, limit: 5 })
    : { ok: true, references: [] };
  if (!proposalLogs.ok) {
    return proposalLogs;
  }

  const cross = issueNumber
    ? await readCrossIssueMemory({
        env,
        relatedIssue: issueNumber,
        issueNumber,
        text,
        limit
      })
    : { ok: true, body: null };
  if (!cross.ok) {
    return cross;
  }

  const issue = issueNumber
    ? await readGitHubResource({ resource: "issues", repository, issueNumber, env })
    : { ok: true, records: [] };
  if (!issue.ok) {
    return issue;
  }

  const pull = pullNumber
    ? await readGitHubResource({ resource: "pulls", repository, pullNumber, env })
    : { ok: true, records: [] };
  if (!pull.ok) {
    return pull;
  }

  const pullRecord = pull.records?.[0] ?? null;
  const runtimeStatus = pullRecord
    ? pullRecord.merged
      ? "merged"
      : pullRecord.state === "open"
        ? "open_pr"
        : "unknown"
    : "unknown";
  const memoryReferences = cross.body?.orderedReferences ?? [];
  const prContextReferences = memoryReferences
    .filter((item) => normalizeText(item?.source) === "pr_context")
    .map((item) => normalizeObject(item?.reference));
  const memoryCommits = prContextReferences.flatMap((item) => normalizeTextList(item.commits));
  const files = uniqueTextList(prContextReferences.flatMap((item) => normalizeTextList(item.files)));
  const tests = uniqueTextList(prContextReferences.flatMap((item) => normalizeTextList(item.tests)));
  const evidence = uniqueTextList([
    ...prContextReferences.flatMap((item) => normalizeTextList(item.evidence)),
    ...memoryReferences.map((item) => item?.reference?.url || item?.reference?.id || item?.url || item?.id),
    pullRecord?.htmlUrl
  ]);

  return {
    ok: true,
    value: {
      repository,
      issueNumber: issueNumber ?? null,
      pullNumber: pullNumber ?? null,
      commits: uniqueTextList([pullRecord?.headSha, pullRecord?.mergeCommitSha, ...memoryCommits]),
      files,
      tests,
      evidence,
      decisions: (decisionLogs.references ?? [])
        .map((item) => item.decision || item.summary || item.id)
        .filter(Boolean),
      reviewerResolutions: (proposalLogs.references ?? [])
        .map((item) => item.hypothesis || item.summary || item.id)
        .filter(Boolean),
      runtimeStatus,
      relatedIssue: issue.records?.[0] ?? null,
      relatedPullRequest: pullRecord,
      memoryReferences
    }
  };
}

async function executeMcpPrStatus(argumentsInput, env) {
  const repository = normalizeText(argumentsInput.repository);
  const pullNumber = normalizeIssue(argumentsInput.pullNumber);
  if (!repository || !pullNumber) {
    return {
      ok: false,
      error: "repository_and_pull_required",
      reason: "repository and pullNumber are required"
    };
  }

  const runtimeTruth = await executeMcpRuntimeTruth(
    {
      repository,
      pullNumber,
      includeChecks: true,
      includeWorkflowRuns: true
    },
    env
  );
  if (!runtimeTruth.ok) {
    return runtimeTruth;
  }

  const reviewTruth = await executeMcpReviewTruth({ repository, pullNumber }, env);
  if (!reviewTruth.ok) {
    return reviewTruth;
  }

  return {
    ok: true,
    value: {
      ok: true,
      repository,
      pullNumber,
      runtimeTruth: runtimeTruth.value,
      reviewTruth: reviewTruth.value.reviewTruth,
      butlerReviewSynthesis: reviewTruth.value.butlerReviewSynthesis,
      nextSuggestedActions: reviewTruth.value.nextSuggestedActions
    }
  };
}

async function executeMcpIssueStatus(argumentsInput, env, runtimeOrigin) {
  const repository = normalizeText(argumentsInput.repository);
  const issueNumber = normalizeIssue(argumentsInput.issueNumber);
  if (!repository || !issueNumber) {
    return {
      ok: false,
      error: "repository_and_issue_required",
      reason: "repository and issueNumber are required"
    };
  }

  const issue = await readGitHubResource({ resource: "issues", repository, issueNumber, env });
  if (!issue.ok) {
    return issue;
  }

  const cross = await readCrossIssueMemory({
    env,
    relatedIssue: issueNumber,
    issueNumber,
    limit: normalizeLimit(argumentsInput.limit, 8)
  });
  if (!cross.ok) {
    return cross;
  }

  return {
    ok: true,
    value: {
      ok: true,
      repository,
      issueNumber,
      issue: issue.records?.[0] ?? null,
      blockers: (cross.body?.orderedReferences ?? []).map((item) => item.summary || item.id).filter(Boolean),
      memoryReferences: cross.body?.orderedReferences ?? [],
      runtimeOrigin
    }
  };
}

async function readGitHubResource(input) {
  const retrieved = await retrieveGitHubReadPlane({
    ...input,
    env: input.env
  });
  if (!retrieved.ok) {
    return {
      ok: false,
      error: retrieved.error ?? "github_read_failed",
      reason: retrieved.reason,
      issues: retrieved.issues ?? []
    };
  }
  return {
    ok: true,
    records: Array.isArray(retrieved.read?.records) ? retrieved.read.records : []
  };
}

async function readDecisionLogReferences({ env, relatedIssue, limit }) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for decision log retrieval"
    };
  }
  const retrieved = await retrieveDecisionLogReferences(provider, { relatedIssue, limit });
  if (!retrieved.ok) {
    return {
      ok: false,
      error: retrieved.error ?? "memory_read_failed",
      reason: retrieved.reason
    };
  }
  return {
    ok: true,
    references: retrieved.references
  };
}

async function readProposalLogReferences({ env, relatedIssue, limit }) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for proposal log retrieval"
    };
  }
  const retrieved = await retrieveProposalLogReferences(provider, { relatedIssue, limit });
  if (!retrieved.ok) {
    return {
      ok: false,
      error: retrieved.error ?? "memory_read_failed",
      reason: retrieved.reason
    };
  }
  return {
    ok: true,
    references: retrieved.references
  };
}

async function readCrossIssueMemory({ env, relatedIssue, issueNumber, text, limit }) {
  const provider = resolveMemoryProvider(env);
  const retrieved = await retrieveCrossIssueMemoryIndex(provider, {
    phase: "execution",
    relatedIssue,
    limit,
    text: normalizeText(text) || null,
    semanticRetrieval: {
      enabled: Boolean(normalizeText(text)),
      mode: normalizeText(text) ? "assistive" : "disabled"
    },
    issueContext: issueNumber
      ? {
          issueNumber,
          issueTitle: null,
          issueUrl: null
        }
      : null
  });
  if (!retrieved.ok) {
    return {
      ok: false,
      error: retrieved.error ?? "memory_read_failed",
      reason: retrieved.reason
    };
  }
  return {
    ok: true,
    body: {
      retrievalPlan: retrieved.retrievalPlan,
      relatedIssue: retrieved.relatedIssue,
      queryText: retrieved.queryText,
      primaryReference: retrieved.primaryReference,
      orderedReferences: retrieved.orderedReferences
    }
  };
}

async function responseToMcpToolResult(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    return {
      ok: false,
      error: body?.error ?? "mcp_tool_failed",
      reason: body?.reason ?? `request failed with status ${response.status}`,
      issues: body?.issues ?? []
    };
  }
  return {
    ok: true,
    value: body
  };
}

function mcpJsonResponse(status, body, protocolVersion = MCP_PROTOCOL_VERSION) {
  return json(status, body, {
    "mcp-protocol-version": protocolVersion
  });
}

function mcpResultResponse(id, result, protocolVersion = MCP_PROTOCOL_VERSION) {
  return mcpJsonResponse(200, {
    jsonrpc: "2.0",
    id,
    result
  }, protocolVersion);
}

function mcpErrorResponse(id, code, message, protocolVersion = MCP_PROTOCOL_VERSION) {
  return mcpJsonResponse(200, {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  }, protocolVersion);
}

function buildMcpProtectedResourceMetadata(url) {
  const resource = buildRuntimeUrl(url.origin, MCP_PATH);
  return {
    resource,
    resource_name: "VTDD MCP",
    resource_documentation: buildRuntimeUrl(url.origin, "/help#paths"),
    bearer_methods_supported: ["header"],
    scopes_supported: ["vtdd:mcp:read"]
  };
}

function buildMcpUnauthorizedHeaders(url, baseHeaders = {}) {
  return {
    ...baseHeaders,
    "www-authenticate": `Bearer realm="vtdd-mcp", resource_metadata="${buildRuntimeUrl(
      url.origin,
      MCP_PROTECTED_RESOURCE_METADATA_MIRROR_PATH
    )}"`,
    "mcp-protocol-version": MCP_PROTOCOL_VERSION
  };
}

function buildRuntimeUrl(origin, path) {
  try {
    return new URL(path, `${origin}/`).href;
  } catch {
    return path;
  }
}

async function safeRetrieveStoredAliasRegistry(provider) {
  try {
    return await retrieveStoredAliasRegistry(provider);
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: "repository_nickname_retrieval_failed",
      reason: error instanceof Error ? error.message : String(error),
      issues: ["repository_nickname_retrieval_exception"]
    };
  }
}

async function handleGitHubWritePlaneRequest(request, env) {
  const payload = await readJson(request);
  if (!payload || typeof payload !== "object") {
    return json(422, {
      ok: false,
      error: "request_body_required",
      reason: "valid JSON request body is required"
    });
  }

  const policyInput =
    payload.policyInput && typeof payload.policyInput === "object" ? payload.policyInput : {};
  const boundPolicyInput = bindNaturalGitHubWriteApproval({ payload, policyInput });
  const issueContext =
    payload.issueContext && typeof payload.issueContext === "object" ? payload.issueContext : {};

  const executed = await executeGitHubWritePlane({
    operation: payload.operation,
    repository: payload.repository,
    issueNumber: payload.issueNumber ?? issueContext.issueNumber,
    pullNumber: payload.pullNumber,
    commentId: payload.commentId,
    branch: payload.branch,
    baseRef: payload.baseRef,
    head: payload.head,
    title: payload.title,
    body: payload.body,
    approvalPhrase: boundPolicyInput.approvalPhrase,
    targetConfirmed: boundPolicyInput.targetConfirmed,
    approvalScopeMatched: boundPolicyInput.approvalScopeMatched,
    env
  });

  if (!executed.ok) {
    const httpStatus = executed.status ?? 503;
    if (wantsActionVisibleGitHubWriteErrors(payload)) {
      return json(200, {
        ok: false,
        httpStatus,
        error: executed.error ?? "github_write_failed",
        reason: executed.reason,
        issues: executed.issues ?? [],
        diagnostics: executed.diagnostics ?? null
      });
    }
    return json(httpStatus, {
      ok: false,
      error: executed.error ?? "github_write_failed",
      reason: executed.reason,
      issues: executed.issues ?? [],
      diagnostics: executed.diagnostics ?? null
    });
  }

  return json(200, {
    ok: true,
    write: executed.write
  });
}

function wantsActionVisibleGitHubWriteErrors(payload) {
  const responseMode = normalizeText(payload?.responseMode);
  return responseMode === "action_visible";
}

function retrieveErrorJson(url, status, body = {}) {
  if (!wantsActionVisibleRetrieveErrors(url)) {
    return json(status, body);
  }

  return json(200, {
    ok: false,
    httpStatus: status,
    error: normalizeText(body.error) || "retrieve_failed",
    reason: normalizeText(body.reason) || null,
    issues: Array.isArray(body.issues) ? body.issues : [],
    diagnostics: {
      route: normalizeText(url?.pathname) || null,
      responseMode: "action_visible",
      rootCause:
        "Custom GPT Action test screen can surface non-2xx retrieve responses as ClientResponseError; this envelope preserves error/reason/issues for debugging."
    }
  });
}

function wantsActionVisibleRetrieveErrors(url) {
  const responseMode = normalizeText(url?.searchParams?.get("responseMode"));
  return responseMode === "action_visible";
}

function validateConsistentIssueScope({ payload, issueContext }) {
  const payloadIssueNumber = normalizePositiveInteger(payload?.issueNumber);
  const contextIssueNumber = normalizePositiveInteger(issueContext?.issueNumber);
  if (payloadIssueNumber && contextIssueNumber && payloadIssueNumber !== contextIssueNumber) {
    return {
      ok: false,
      issues: ["issueNumber conflicts with issueContext.issueNumber"]
    };
  }
  return { ok: true, issues: [] };
}

async function handleGitHubHighRiskPlaneRequest(request, env) {
  const payload = await readJson(request);
  if (!payload || typeof payload !== "object") {
    return json(422, {
      ok: false,
      error: "request_body_required",
      reason: "valid JSON request body is required"
    });
  }

  const policyInput =
    payload.policyInput && typeof payload.policyInput === "object" ? payload.policyInput : {};
  const issueContext =
    payload.issueContext && typeof payload.issueContext === "object" ? payload.issueContext : {};
  const issueScopeValidation = validateConsistentIssueScope({ payload, issueContext });
  if (!issueScopeValidation.ok) {
    return json(422, {
      ok: false,
      error: "github_authority_scope_invalid",
      reason: issueScopeValidation.issues.join(", "),
      issues: issueScopeValidation.issues
    });
  }
  const operation = normalizeText(payload.operation);
  const repository = normalizeText(payload.repository);
  const scopedIssueNumber = issueContext.issueNumber ?? payload.issueNumber ?? null;
  const phase = normalizeText(payload.phase) || "execution";
  const highRiskKind = operation;
  const actionType = mapGitHubHighRiskOperationToActionType(operation);
  const approvalScope = buildApprovalScopeSnapshot({
    payload: {
      phase,
      highRiskKind,
      repositoryInput: repository,
      issueNumber: scopedIssueNumber,
      pullNumber: payload.pullNumber,
      issueContext
    },
    policyInput: {
      ...policyInput,
      actionType,
      repositoryInput: repository,
      highRiskKind,
      issueTraceability: {
        relatedIssue: issueContext.issueNumber ?? payload.issueNumber ?? null
      }
    }
  });
  const resolvedApprovalGrant = await resolveApprovalGrant({
    payload: {
      phase,
      highRiskKind,
      repositoryInput: repository,
      issueNumber: scopedIssueNumber,
      pullNumber: payload.pullNumber,
      issueContext
    },
    policyInput: {
      ...policyInput,
      actionType,
      repositoryInput: repository,
      highRiskKind,
      issueTraceability: {
        relatedIssue: issueContext.issueNumber ?? payload.issueNumber ?? null
      }
    },
    env
  });

  const executed = await executeGitHubHighRiskPlane({
    operation,
    repository,
    issueNumber: scopedIssueNumber,
    pullNumber: payload.pullNumber,
    mergeMethod: payload.mergeMethod,
    commitTitle: payload.commitTitle,
    commitMessage: payload.commitMessage,
    approvalPhrase: policyInput.approvalPhrase,
    targetConfirmed: policyInput.targetConfirmed,
    approvalGrant: resolvedApprovalGrant.approvalGrant,
    approvalScope,
    env
  });

  if (!executed.ok) {
    return json(executed.status ?? 503, {
      ok: false,
      error: executed.error ?? "github_high_risk_failed",
      reason: executed.reason,
      issues: executed.issues ?? [],
      diagnostics: executed.diagnostics ?? null
    });
  }

  return json(200, {
    ok: true,
    authorityAction: executed.authorityAction
  });
}

async function handleDeployProductionRequest(request, env) {
  const payload = await readJson(request);
  if (!payload || typeof payload !== "object") {
    return json(422, {
      ok: false,
      error: "request_body_required",
      reason: "valid JSON request body is required"
    });
  }

  const policyInput =
    payload.policyInput && typeof payload.policyInput === "object" ? payload.policyInput : {};
  const resolvedApprovalGrant = await resolveApprovalGrant({
    payload: {
      phase: normalizeText(payload.phase) || "execution",
      highRiskKind: "deploy_production",
      repositoryInput: payload.repository
    },
    policyInput: {
      ...policyInput,
      actionType: "deploy_production",
      repositoryInput: payload.repository,
      highRiskKind: "deploy_production"
    },
    env
  });

  const executed = await executeDeployProductionPlane({
    repository: payload.repository,
    runtimeUrl: payload.runtimeUrl || new URL(request.url).origin,
    approvalPhrase: policyInput.approvalPhrase,
    approvalGrantId: policyInput.approvalGrantId,
    approvalGrant: payload.approvalGrant ?? policyInput.approvalGrant ?? resolvedApprovalGrant.approvalGrant,
    env
  });

  if (!executed.ok) {
    return json(executed.status ?? 503, {
      ok: false,
      error: executed.error ?? "deploy_failed",
      reason: executed.reason,
      issues: executed.issues ?? [],
      deploy: executed.deploy
    });
  }

  return json(202, {
    ok: true,
    warning: executed.warning ?? undefined,
    reason: executed.reason ?? undefined,
    deploy: executed.deploy
  });
}

async function handleGitHubActionsEventRequest(request, env) {
  const payload = await readJson(request);
  const event = normalizeGitHubActionsEvent(payload);
  if (!event.ok) {
    return json(422, {
      ok: false,
      error: event.error,
      reason: event.reason
    });
  }

  const store = resolveDashboardEventStore(env);
  if (!store) {
    return json(503, {
      ok: false,
      error: "dashboard_event_store_unavailable",
      reason: "dashboard event store is not configured"
    });
  }

  await store.put(event.event);
  const webPush = await dispatchDashboardWebPushForEvent(env, event.event);
  return json(202, {
    ok: true,
    event: event.event,
    webPush
  });
}

async function handleVpsRunnerEventRequest(request, env) {
  const payload = await readJson(request);
  const event = normalizeVpsRunnerDashboardEvent(payload);
  if (!event.ok) {
    return json(422, {
      ok: false,
      error: event.error,
      reason: event.reason
    });
  }

  const eventStore = resolveDashboardEventStore(env);
  if (!eventStore) {
    return json(503, {
      ok: false,
      error: "dashboard_event_store_unavailable",
      reason: "dashboard event store is not configured"
    });
  }

  const chatStore = resolveDashboardChatStore(env);
  if (!chatStore) {
    return json(503, {
      ok: false,
      error: "dashboard_chat_store_unavailable",
      reason: "dashboard Butler chat store is not configured"
    });
  }

  await eventStore.put(event.event);
  const webPush = await dispatchDashboardWebPushForEvent(env, event.event);
  let messages;
  try {
    messages = await chatStore.appendMany(event.threadId, [event.chatMessage]);
  } catch (error) {
    await eventStore.delete(event.event.id);
    return json(502, {
      ok: false,
      error: "dashboard_event_chat_append_failed",
      reason: "VPS runner event was not saved because Butler chat append failed",
      rollback: {
        eventId: event.event.id,
        notificationDeleted: true
      }
    });
  }
  const webSocketBroadcast = await notifyDashboardChatRoom({ env, threadId: event.threadId, messages });
  return json(202, {
    ok: true,
    event: event.event,
    threadId: event.threadId,
    messages,
    webSocketBroadcast,
    webPush
  });
}

async function handleDashboardChatMessageRequest(request, env) {
  const dashboardAuth = await authorizeDashboardRequest({
    request,
    env,
    apiSuffix: "/dashboard/chat/messages"
  });
  if (!dashboardAuth.ok) {
    return json(dashboardAuth.status, {
      ok: false,
      error: "dashboard_auth_required",
      reason: dashboardAuth.reason
    });
  }

  const payload = await readJson(request);
  const repositoryResolution = await resolveDashboardChatRepository({ payload, env });
  // HTTP chat writes are the non-live persistence fallback. Live Codex delivery
  // happens through DashboardChatRoom WebSocket owner_message events.
  const repository = repositoryResolution.ok ? repositoryResolution.repository : "";

  const prepared = await buildDashboardChatTurn(
    {
      ...payload,
      repository,
      relatedIssue:
        normalizePositiveInteger(payload?.relatedIssue || payload?.issueNumber) ||
        extractIssueNumberFromDashboardChatText(payload?.text || payload?.message || payload?.body)
    },
    { env }
  );
  if (!prepared.ok) {
    return json(422, {
      ok: false,
      error: prepared.error,
      reason: prepared.reason
    });
  }

  const store = resolveDashboardChatStore(env);
  if (!store) {
    return json(503, {
      ok: false,
      error: "dashboard_chat_store_unavailable",
      reason: "dashboard Butler chat store is not configured"
    });
  }

  const messages = await store.appendMany(prepared.threadId, prepared.messages);
  return json(202, {
    ok: true,
    threadId: prepared.threadId,
    messages,
    execution: null
  });
}

async function handleMediaUploadRequest(request, env) {
  const dashboardAuth = await authorizeDashboardRequest({
    request,
    env,
    apiSuffix: "/media/upload"
  });
  if (!dashboardAuth.ok) {
    return json(dashboardAuth.status, {
      ok: false,
      error: "dashboard_auth_required",
      reason: dashboardAuth.reason
    });
  }

  const r2 = env?.[MEDIA_R2_BINDING] ?? null;
  if (!r2 || typeof r2.put !== "function") {
    return json(503, {
      ok: false,
      error: "media_r2_unavailable",
      reason: "Cloudflare R2 binding VTDD_MEDIA_R2 is not configured"
    });
  }
  const store = resolveMediaObjectStore(env);
  if (!store) {
    return json(503, {
      ok: false,
      error: "media_metadata_store_unavailable",
      reason: "D1 media metadata store is not configured"
    });
  }

  let form = null;
  try {
    form = await request.formData();
  } catch {
    return json(400, {
      ok: false,
      error: "multipart_form_required",
      reason: "multipart/form-data with a file field is required"
    });
  }

  const file = form.get("file");
  if (!isUploadFileLike(file)) {
    return json(422, {
      ok: false,
      error: "media_file_required",
      reason: "file field is required"
    });
  }

  const byteSize = Number(file.size) || 0;
  if (byteSize <= 0) {
    return json(422, {
      ok: false,
      error: "media_file_empty",
      reason: "empty media files are not accepted"
    });
  }
  if (byteSize > MEDIA_UPLOAD_HARD_LIMIT_BYTES) {
    return json(413, {
      ok: false,
      error: "media_file_too_large",
      reason: "20MB を超える添付は first slice では保存しません。縮小してから送ってください。",
      limitBytes: MEDIA_UPLOAD_HARD_LIMIT_BYTES
    });
  }
  const allowLarge = normalizeText(form.get("allowLarge") || form.get("allow_large")).toLowerCase() === "true";
  if (byteSize > MEDIA_UPLOAD_SOFT_LIMIT_BYTES && !allowLarge) {
    return json(413, {
      ok: false,
      error: "media_large_confirmation_required",
      reason: "5MB を超える添付です。保存する場合は確認してから再送してください。",
      limitBytes: MEDIA_UPLOAD_SOFT_LIMIT_BYTES
    });
  }

  const filename = sanitizeMediaFilename(file.name || "attachment");
  const repository = normalizeCanonicalRepositoryInput(
    form.get("repository") || form.get("repositoryInput") || form.get("repository_input")
  );
  const relatedIssue = normalizePositiveInteger(form.get("relatedIssue") || form.get("issueNumber") || form.get("related_issue"));
  const relatedPr = normalizePositiveInteger(form.get("relatedPr") || form.get("pullRequestNumber") || form.get("related_pr"));
  const sourceSurface = normalizeMediaSourceSurface(form.get("sourceSurface") || form.get("source_surface")) || "dashboard_butler";
  const sourceEventId = sanitizeDashboardChatText(form.get("sourceEventId") || form.get("source_event_id"));
  const visibility = normalizeMediaVisibility(form.get("visibility")) || "private";
  if (!repository && (relatedIssue || relatedPr || visibility !== "private")) {
    return json(422, {
      ok: false,
      error: "repository_required",
      reason: "media upload without a resolved owner/repo is allowed only for private unscoped Dashboard conversation media"
    });
  }
  const now = new Date().toISOString();
  const mediaId = `med_${crypto.randomUUID()}`;
  const objectKey = buildMediaObjectKey({ repository, createdAt: now, mediaId, filename });
  const arrayBuffer = await file.arrayBuffer();
  const contentTypeValidation = detectMediaContentType({
    declaredType: file.type,
    filename,
    arrayBuffer
  });
  if (!contentTypeValidation.ok) {
    return json(415, {
      ok: false,
      error: contentTypeValidation.error,
      reason: contentTypeValidation.reason
    });
  }
  const contentType = contentTypeValidation.contentType;
  const sha256 = await sha256ArrayBufferHex(arrayBuffer);

  await r2.put(objectKey, arrayBuffer, {
    httpMetadata: { contentType },
    customMetadata: {
      mediaId,
      repository: repository || "unscoped",
      visibility,
      sha256
    }
  });

  let record = null;
  try {
    record = await store.put({
      id: mediaId,
      repository,
      relatedIssue,
      relatedPr,
      sourceSurface,
      sourceEventId,
      objectKey,
      filename,
      contentType,
      byteSize,
      sha256,
      visibility,
      summary: "",
      ocrText: "",
      createdBy: dashboardAuth.email || dashboardAuth.login || dashboardAuth.authType || "dashboard",
      createdAt: now,
      updatedAt: now
    });
  } catch (error) {
    await cleanupOrphanMediaObject(r2, objectKey);
    return json(500, {
      ok: false,
      error: "media_metadata_insert_failed",
      reason: `D1 media metadata insert failed after R2 put; orphan cleanup was attempted: ${sanitizeErrorMessage(error)}`
    });
  }
  if (!record) {
    await cleanupOrphanMediaObject(r2, objectKey);
    return json(500, {
      ok: false,
      error: "media_metadata_insert_failed",
      reason: "D1 media metadata insert returned no record after R2 put; orphan cleanup was attempted"
    });
  }

  return json(201, {
    ok: true,
    media: toMediaReference(record),
    stored: {
      r2: true,
      d1: true,
      rawBinaryReturned: false
    }
  });
}

async function handleMediaObjectRequest(request, env, mediaRoute) {
  const dashboardAuth = await authorizeDashboardRequest({
    request,
    env,
    apiSuffix: mediaRoute.download ? "/media/:id/download" : "/media/:id"
  });
  if (!dashboardAuth.ok) {
    return json(dashboardAuth.status, {
      ok: false,
      error: "dashboard_auth_required",
      reason: dashboardAuth.reason
    });
  }
  const store = resolveMediaObjectStore(env);
  if (!store) {
    return json(503, {
      ok: false,
      error: "media_metadata_store_unavailable",
      reason: "D1 media metadata store is not configured"
    });
  }
  const record = await store.get(mediaRoute.id);
  if (!record) {
    return json(404, {
      ok: false,
      error: "media_not_found",
      reason: "media object was not found"
    });
  }
  if (!mediaRoute.download) {
    return json(200, {
      ok: true,
      media: toMediaReference(record),
      rawBinaryReturned: false
    });
  }
  const r2 = env?.[MEDIA_R2_BINDING] ?? null;
  if (!r2 || typeof r2.get !== "function") {
    return json(503, {
      ok: false,
      error: "media_r2_unavailable",
      reason: "Cloudflare R2 binding VTDD_MEDIA_R2 is not configured"
    });
  }
  const object = await r2.get(record.objectKey);
  if (!object) {
    return json(404, {
      ok: false,
      error: "media_binary_not_found",
      reason: "R2 object was not found for this media record"
    });
  }
  return new Response(object.body ?? object, {
    status: 200,
    headers: {
      "content-type": record.contentType || "application/octet-stream",
      "content-disposition": `attachment; filename="${record.filename.replace(/["\\]/g, "_")}"`,
      "cache-control": "private, no-store"
    }
  });
}

async function handleMediaSearchRequest(request, url, env) {
  const dashboardAuth = await authorizeDashboardRequest({
    request,
    env,
    apiSuffix: "/media/search"
  });
  if (!dashboardAuth.ok) {
    return json(dashboardAuth.status, {
      ok: false,
      error: "dashboard_auth_required",
      reason: dashboardAuth.reason
    });
  }
  const store = resolveMediaObjectStore(env);
  if (!store || typeof store.search !== "function") {
    return json(503, {
      ok: false,
      error: "media_metadata_store_unavailable",
      reason: "D1 media metadata store is not configured"
    });
  }
  const repository = normalizeCanonicalRepositoryInput(url.searchParams.get("repository"));
  if (!repository) {
    return json(422, {
      ok: false,
      error: "repository_required",
      reason: "media search requires a resolved owner/repo repository filter"
    });
  }
  const records = await store.search({
    repository,
    relatedIssue: url.searchParams.get("relatedIssue") || url.searchParams.get("issueNumber"),
    relatedPr: url.searchParams.get("relatedPr") || url.searchParams.get("pullRequestNumber"),
    limit: url.searchParams.get("limit")
  });
  return json(200, {
    ok: true,
    media: records.map((record) => toMediaReference(record)).filter(Boolean),
    rawBinaryReturned: false
  });
}

async function handleMediaDeleteRequest(request, env, mediaRoute) {
  const dashboardAuth = await authorizeDashboardRequest({
    request,
    env,
    apiSuffix: "/media/:id"
  });
  if (!dashboardAuth.ok) {
    return json(dashboardAuth.status, {
      ok: false,
      error: "dashboard_auth_required",
      reason: dashboardAuth.reason
    });
  }
  const url = new URL(request.url);
  const cleanup = normalizeDashboardEventText(url.searchParams.get("cleanup"));
  if (cleanup === "abandoned_send") {
    return handleAbandonedMediaSendRollback({ env, mediaRoute, url });
  }
  return json(403, {
    ok: false,
    error: "scoped_approval_required",
    reason: "media delete requires scoped approval and is not part of Issue #498 first slice",
    mediaId: mediaRoute.id
  });
}

async function handleAbandonedMediaSendRollback({ env, mediaRoute, url }) {
  const store = resolveMediaObjectStore(env);
  if (!store || typeof store.get !== "function" || typeof store.delete !== "function") {
    return json(503, {
      ok: false,
      error: "media_metadata_store_unavailable",
      reason: "D1 media metadata store is not configured for abandoned send rollback"
    });
  }
  const r2 = env?.[MEDIA_R2_BINDING] ?? null;
  if (!r2 || typeof r2.delete !== "function") {
    return json(503, {
      ok: false,
      error: "media_r2_unavailable",
      reason: "Cloudflare R2 binding VTDD_MEDIA_R2 is not configured for abandoned send rollback"
    });
  }
  const record = await store.get(mediaRoute.id);
  if (!record) {
    return json(404, {
      ok: false,
      error: "media_not_found",
      reason: "media object was not found"
    });
  }
  const repository = normalizeCanonicalRepositoryInput(url.searchParams.get("repository"));
  const relatedIssue = normalizePositiveInteger(url.searchParams.get("relatedIssue") || url.searchParams.get("issueNumber"));
  const requestedSourceEventId = sanitizeDashboardChatText(url.searchParams.get("sourceEventId") || url.searchParams.get("source_event_id"));
  const sourceEventId = normalizeDashboardEventText(record.sourceEventId);
  const repositoryScopeMatches = record.repository
    ? Boolean(repository) && record.repository === repository
    : !repository;
  const isRollbackScoped =
    record.visibility === "private" &&
    record.sourceSurface === "dashboard_butler" &&
    sourceEventId.startsWith("dashboard_owner_message:") &&
    requestedSourceEventId === sourceEventId &&
    repositoryScopeMatches &&
    (!relatedIssue || record.relatedIssue === relatedIssue);
  if (!isRollbackScoped) {
    return json(403, {
      ok: false,
      error: "scoped_approval_required",
      reason: "media delete is only allowed here as rollback for private dashboard media from the abandoned owner message send",
      mediaId: mediaRoute.id
    });
  }
  await r2.delete(record.objectKey);
  await store.delete(record.id);
  return json(200, {
    ok: true,
    mediaId: record.id,
    deleted: {
      r2: true,
      d1: true
    },
    authority: "same_send_abandoned_private_media_rollback"
  });
}

async function handleDashboardPushSubscriptionRequest(request, env) {
  const dashboardAuth = await authorizeDashboardRequest({
    request,
    env,
    apiSuffix: "/dashboard/push/subscription"
  });
  if (!dashboardAuth.ok) {
    return json(dashboardAuth.status, {
      ok: false,
      error: "dashboard_auth_required",
      reason: dashboardAuth.reason
    });
  }

  const store = resolveDashboardPushSubscriptionStore(env);
  if (!store) {
    return json(503, {
      ok: false,
      error: "dashboard_push_subscription_store_unavailable",
      reason: "dashboard push subscription store is not configured"
    });
  }

  const payload = await readJson(request);
  const subscription = await normalizeDashboardPushSubscription(payload?.subscription || payload);
  if (!subscription.ok) {
    return json(422, {
      ok: false,
      error: "dashboard_push_subscription_invalid",
      reason: subscription.reason
    });
  }

  const saved = await store.put({
    ...subscription.record,
    userAgent: sanitizeDashboardChatText(payload?.userAgent || request.headers.get("user-agent") || ""),
    ownerIdentity: normalizeDashboardEventText(dashboardAuth.subject) || normalizeDashboardEventText(dashboardAuth.authType) || "dashboard_owner",
    updatedAt: new Date().toISOString()
  });

  return json(202, {
    ok: true,
    subscription: {
      endpointHash: saved.endpointHash,
      updatedAt: saved.updatedAt,
      status: "saved"
    }
  });
}

async function handleDashboardPushStatusRequest(request, env) {
  const dashboardAuth = await authorizeDashboardRequest({
    request,
    env,
    apiSuffix: "/dashboard/push/status"
  });
  if (!dashboardAuth.ok) {
    return json(dashboardAuth.status, {
      ok: false,
      error: "dashboard_auth_required",
      reason: dashboardAuth.reason
    });
  }

  const store = resolveDashboardPushSubscriptionStore(env);
  if (!store) {
    return json(503, {
      ok: false,
      error: "dashboard_push_subscription_store_unavailable",
      reason: "dashboard push subscription store is not configured"
    });
  }

  const payload = await readJson(request);
  const endpoint = normalizeDashboardUrl(payload?.endpoint);
  if (!endpoint) {
    return json(422, {
      ok: false,
      error: "dashboard_push_subscription_invalid",
      reason: "push subscription endpoint is required"
    });
  }

  const endpointHash = await sha256Hex(endpoint);
  if (typeof store.get !== "function") {
    return json(503, {
      ok: false,
      error: "dashboard_push_subscription_status_unavailable",
      reason: "dashboard push subscription store cannot verify a single subscription"
    });
  }

  const subscription = await store.get(endpointHash);
  return json(200, {
    ok: true,
    subscription: {
      status: subscription ? "saved" : "not_saved",
      updatedAt: subscription?.updatedAt || null
    }
  });
}

async function handleDashboardPushTestRequest(request, env) {
  const dashboardAuth = await authorizeDashboardRequest({
    request,
    env,
    apiSuffix: "/dashboard/push/test"
  });
  if (!dashboardAuth.ok) {
    return json(dashboardAuth.status, {
      ok: false,
      error: "dashboard_auth_required",
      reason: dashboardAuth.reason
    });
  }

  const payload = await readJson(request);
  const event = normalizeDashboardEventRecord({
    id: `dashboard-push-test:${crypto.randomUUID()}`,
    kind: "dashboard_push_test",
    repository: normalizeCanonicalRepositoryInput(payload?.repository) || "marushu/vtdd-v2-p",
    workflowName: "dashboard-push-test",
    runId: crypto.randomUUID(),
    status: "completed",
    conclusion: "success",
    title: sanitizeDashboardChatText(payload?.title || "Dashboard Butler server push test"),
    runUrl: "/dashboard/notifications",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const webPush = await dispatchDashboardWebPushForEvent(env, event);
  return json(webPush.ok ? 202 : webPush.status || 503, {
    ok: webPush.ok,
    event,
    webPush
  });
}

async function handleDashboardChatSocketRequest(request, url, env) {
  const auth = await authorizeDashboardRequest({
    request,
    env,
    apiSuffix: "/dashboard/chat/:threadId/ws"
  });
  if (!auth.ok) {
    return json(auth.status, {
      ok: false,
      error: "dashboard_auth_required",
      reason: auth.reason
    });
  }

  const threadId = extractDashboardChatSocketThreadId(url.pathname);
  if (!threadId) {
    return json(422, {
      ok: false,
      error: "thread_id_required",
      reason: "threadId is required"
    });
  }
  const room = resolveDashboardChatRoomStub(env, threadId);
  if (!room) {
    return json(503, {
      ok: false,
      error: "dashboard_chat_room_unavailable",
      reason: "DASHBOARD_CHAT_ROOMS Durable Object binding is not configured"
    });
  }

  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return json(426, {
      ok: false,
      error: "websocket_upgrade_required",
      reason: "dashboard chat updates require a WebSocket upgrade"
    });
  }
  return room.fetch(request);
}

async function handleDashboardAppServerBridgeSocketRequest(request, url, env) {
  const auth = authorizeDashboardAppServerBridgeRequest({
    request,
    env,
    apiSuffix: "/dashboard/app-server/ws"
  });
  if (!auth.ok) {
    return json(auth.status, {
      ok: false,
      error: "unauthorized",
      reason: auth.reason
    });
  }

  const threadId = normalizeDashboardThreadId(url.searchParams.get("threadId") || url.searchParams.get("thread_id"));
  const room = resolveDashboardChatRoomStub(env, threadId || "dashboard-app-server-bridge");
  if (!room) {
    return json(503, {
      ok: false,
      error: "dashboard_chat_room_unavailable",
      reason: "DASHBOARD_CHAT_ROOMS Durable Object binding is not configured"
    });
  }

  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return json(426, {
      ok: false,
      error: "websocket_upgrade_required",
      reason: "dashboard app-server bridge requires a WebSocket upgrade"
    });
  }
  return room.fetch(request);
}

function authorizeDashboardAppServerBridgeRequest({ request, env, apiSuffix }) {
  const direct = authorizeGatewayRequest({ request, env, apiSuffix });
  if (direct.ok || normalizeText(request.headers.get("authorization"))) {
    return direct;
  }
  const bearerToken = normalizeText(env?.VTDD_GATEWAY_BEARER_TOKEN ?? env?.MVP_GATEWAY_BEARER_TOKEN);
  const protocolToken = extractDashboardBridgeBearerProtocol(request.headers.get("sec-websocket-protocol"));
  if (bearerToken && protocolToken) {
    return protocolToken === bearerToken
      ? { ok: true }
      : {
          ok: false,
          status: 403,
          reason: `provided websocket bearer protocol token is invalid for /${CANONICAL_API_PREFIX.replace(/^\//, "")}${apiSuffix}`
        };
  }
  return direct;
}

async function handleDashboardChatThreadRequest(request, url, env) {
  const auth = await authorizeDashboardRequest({
    request,
    env,
    apiSuffix: "/dashboard/chat/:threadId"
  });
  if (!auth.ok) {
    return json(auth.status, {
      ok: false,
      error: "dashboard_auth_required",
      reason: auth.reason
    });
  }

  const threadId = extractDashboardChatThreadId(url.pathname);
  if (!threadId) {
    return json(422, {
      ok: false,
      error: "thread_id_required",
      reason: "threadId is required"
    });
  }
  const store = resolveDashboardChatStore(env);
  if (!store) {
    return json(503, {
      ok: false,
      error: "dashboard_chat_store_unavailable",
      reason: "dashboard Butler chat store is not configured"
    });
  }
  const messages = await store.listThread(threadId, {
    limit: normalizeLimit(url.searchParams.get("limit"), 80)
  });
  const summary =
    typeof store.getSummary === "function" ? await store.getSummary(threadId) : null;
  return json(200, {
    ok: true,
    threadId,
    messages,
    summary
  });
}

async function handleDashboardChatSearchRequest(request, url, env) {
  const auth = await authorizeDashboardRequest({
    request,
    env,
    apiSuffix: "/dashboard/chat/search"
  });
  if (!auth.ok) {
    return json(auth.status, {
      ok: false,
      error: "dashboard_auth_required",
      reason: auth.reason
    });
  }

  const store = resolveDashboardChatStore(env);
  if (!store || typeof store.search !== "function") {
    return json(503, {
      ok: false,
      error: "dashboard_chat_search_unavailable",
      reason: "dashboard Butler chat search store is not configured"
    });
  }
  const results = await store.search({
    text: url.searchParams.get("text") || url.searchParams.get("q"),
    repository: url.searchParams.get("repository"),
    relatedIssue: url.searchParams.get("relatedIssue") || url.searchParams.get("issueNumber"),
    limit: normalizeLimit(url.searchParams.get("limit"), 20)
  });
  return json(200, {
    ok: true,
    results
  });
}

async function handleDashboardChatSummaryRequest(request, url, env) {
  const auth = await authorizeDashboardRequest({
    request,
    env,
    apiSuffix: "/dashboard/chat/:threadId/summary"
  });
  if (!auth.ok) {
    return json(auth.status, {
      ok: false,
      error: "dashboard_auth_required",
      reason: auth.reason
    });
  }

  const threadId = extractDashboardChatSummaryThreadId(url.pathname);
  if (!threadId) {
    return json(422, {
      ok: false,
      error: "thread_id_required",
      reason: "threadId is required"
    });
  }
  const store = resolveDashboardChatStore(env);
  if (!store) {
    return json(503, {
      ok: false,
      error: "dashboard_chat_store_unavailable",
      reason: "dashboard Butler chat store is not configured"
    });
  }
  if (request.method === "GET") {
    const summary =
      typeof store.getSummary === "function" ? await store.getSummary(threadId) : null;
    return json(200, {
      ok: true,
      threadId,
      summary
    });
  }
  if (typeof store.putSummary !== "function") {
    return json(503, {
      ok: false,
      error: "dashboard_chat_summary_unavailable",
      reason: "dashboard Butler chat summary store is not configured"
    });
  }
  const payload = await readJson(request);
  const summary = await store.putSummary(threadId, payload);
  if (!summary) {
    return json(422, {
      ok: false,
      error: "summary_required",
      reason: "summary text is required"
    });
  }
  return json(200, {
    ok: true,
    threadId,
    summary
  });
}

async function handleGitHubActionsSecretSyncRequest(request, env) {
  const payload = await readJson(request);
  if (!payload || typeof payload !== "object") {
    return json(422, {
      ok: false,
      error: "request_body_required",
      reason: "valid JSON request body is required"
    });
  }

  const policyInput =
    payload.policyInput && typeof payload.policyInput === "object" ? payload.policyInput : {};
  const resolvedApprovalGrant = await resolveApprovalGrant({
    payload: {
      phase: normalizeText(payload.phase) || "execution",
      highRiskKind: "github_actions_secret_sync",
      repositoryInput: payload.repository
    },
    policyInput: {
      ...policyInput,
      actionType: "destructive",
      repositoryInput: payload.repository,
      highRiskKind: "github_actions_secret_sync"
    },
    env
  });

  const executed = await executeGitHubActionsSecretSync({
    repository: payload.repository,
    secretName: payload.secretName,
    secretValue: payload.secretValue,
    approvalGrant:
      payload.approvalGrant ?? policyInput.approvalGrant ?? resolvedApprovalGrant.approvalGrant,
    env
  }).catch((error) => ({
    ok: false,
    status: 503,
    error: "github_actions_secret_sync_exception",
    reason: sanitizeGitHubActionsSecretSyncErrorMessage(error)
  }));

  if (!executed.ok) {
    return json(executed.status ?? 503, {
      ok: false,
      error: executed.error ?? "github_actions_secret_sync_failed",
      reason: executed.reason,
      issues: executed.issues ?? []
    });
  }

  return json(200, {
    ok: true,
    secretSync: executed.secretSync
  });
}

async function handleCustomGptRecoveryPageRequest(url, env) {
  const channel =
    url.pathname === "/setup/known-good"
      ? CustomGptSetupChannel.KNOWN_GOOD
      : CustomGptSetupChannel.LATEST;
  const ref = normalizeText(url.searchParams.get("ref")) || "main";
  const issueNumber = normalizeIssue(url.searchParams.get("issueNumber"));

  const bundle = await buildCustomGptRecoveryBundle({
    channel,
    ref,
    issueNumber,
    runtimeOrigin: url.origin,
    env
  });

  return html(
    200,
    renderCustomGptRecoveryPage({
      runtimeOrigin: url.origin,
      channel,
      ref,
      issueNumber,
      recovery: bundle.ok ? bundle.recovery : null,
      error: bundle.ok
        ? null
        : {
            error: bundle.error,
            reason: bundle.reason,
            issues: bundle.issues ?? []
          }
    })
  );
}

function handlePasskeyOperatorPageRequest(request) {
  const url = new URL(request.url);
  const syncApiBase = normalizeOptionalHttpUrl(url.searchParams.get("syncApiBase"));
  const syncEnabled = Boolean(syncApiBase);
  const requestedActionType = url.searchParams.get("actionType");
  const requestedHighRiskKind = url.searchParams.get("highRiskKind");
  const html = renderPasskeyOperatorPage({
    origin: url.origin,
    syncApiBase,
    operatorMode: url.searchParams.get("mode") || (requestedActionType || requestedHighRiskKind ? "" : "full"),
    repositoryInput: url.searchParams.get("repositoryInput"),
    issueNumber: url.searchParams.get("issueNumber"),
    pullNumber: url.searchParams.get("pullNumber"),
    phase: url.searchParams.get("phase") || "execution",
    actionType: requestedActionType,
    highRiskKind: requestedHighRiskKind,
    mergeMethod: url.searchParams.get("mergeMethod") || "squash",
    returnUrl: normalizeOperatorReturnUrl(url.searchParams.get("returnUrl")),
    operatorId: url.searchParams.get("operatorId") || "vtdd-operator",
    operatorLabel: url.searchParams.get("operatorLabel") || "VTDD Operator",
    githubAppRole: url.searchParams.get("githubAppRole") || "legacy",
    syncEnabled,
    syncMessage: syncEnabled
      ? "approvalGrantId が取得済みなら実行できます。desktop helper bridge に接続します。"
      : "desktop maintenance required: local secret sync bridge が未接続です。"
  });

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}

function normalizeOptionalHttpUrl(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function normalizeOperatorReturnUrl(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    if (url.protocol !== "https:") {
      return "";
    }
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "chatgpt.com" && hostname !== "chat.openai.com") {
      return "";
    }
    return url.href;
  } catch {
    return "";
  }
}

async function prepareGatewayPayload({ payload, env, allowRemoteCodexHandoffNormalization = false }) {
  const basePayload = payload && typeof payload === "object" ? payload : {};
  const basePolicyInput =
    basePayload.policyInput && typeof basePayload.policyInput === "object"
      ? basePayload.policyInput
      : {};
  const normalizedPayload = normalizeButlerReadConsentPayload(
    allowRemoteCodexHandoffNormalization
      ? normalizeRemoteCodexHandoffPayload(basePayload)
      : basePayload
  );
  const normalizedPolicyInput =
    normalizedPayload.policyInput && typeof normalizedPayload.policyInput === "object"
      ? normalizedPayload.policyInput
      : {};
  const runtimeAutonomyMode = resolveRuntimeAutonomyMode(env);
  const requestedAutonomyMode = normalizeAutonomyMode(normalizedPolicyInput.autonomyMode);
  const effectiveAutonomyMode =
    runtimeAutonomyMode === AutonomyMode.GUARDED_ABSENCE
      ? AutonomyMode.GUARDED_ABSENCE
      : requestedAutonomyMode;

  const runtimeAliasResolution = await resolveRuntimeAliasRegistry({
    baseAliasRegistry: normalizedPolicyInput.aliasRegistry,
    env
  });
  const combinedAliasRegistry = runtimeAliasResolution.aliasRegistry;
  const resolvedAliasRegistry = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: {
      ...normalizedPolicyInput,
      aliasRegistry: combinedAliasRegistry
    },
    env
  });
  const warnings = [
    ...(runtimeAliasResolution.warnings ?? []),
    ...(resolvedAliasRegistry.warnings ?? [])
  ];
  if (
    runtimeAutonomyMode === AutonomyMode.GUARDED_ABSENCE &&
    requestedAutonomyMode !== AutonomyMode.GUARDED_ABSENCE
  ) {
    warnings.push("runtime forces guarded absence mode; payload autonomyMode override was ignored");
  }

  const runtimeTruthResolution = allowRemoteCodexHandoffNormalization
    ? await resolveRemoteCodexHandoffRuntimeTruth({
        payload: normalizedPayload,
        policyInput: normalizedPolicyInput,
        aliasRegistry: resolvedAliasRegistry.aliasRegistry,
        env
      })
    : { policyInput: normalizedPolicyInput, warnings: [] };
  warnings.push(...(runtimeTruthResolution.warnings ?? []));
  const policyInputWithRuntimeTruth = runtimeTruthResolution.policyInput;

  const resolvedApprovalGrant = await resolveApprovalGrant({
    payload: normalizedPayload,
    policyInput: policyInputWithRuntimeTruth,
    env
  });
  if (resolvedApprovalGrant.warning) {
    warnings.push(resolvedApprovalGrant.warning);
  }

  return {
    payload: {
      ...normalizedPayload,
      policyInput: {
        ...policyInputWithRuntimeTruth,
        aliasRegistry: resolvedAliasRegistry.aliasRegistry,
        autonomyMode: effectiveAutonomyMode,
        approvalGrant: resolvedApprovalGrant.approvalGrant,
        approvalScope: buildApprovalScopeSnapshot({
          payload: normalizedPayload,
          policyInput: policyInputWithRuntimeTruth
        })
      }
    },
    warnings
  };
}

async function resolveRemoteCodexHandoffRuntimeTruth({
  payload,
  policyInput,
  aliasRegistry,
  env
}) {
  const actionType = normalize(policyInput.actionType);
  const actorRole = normalize(payload?.actorRole);
  if (actorRole !== "butler" || actionType !== "build") {
    return { policyInput, warnings: [] };
  }

  const runtimeTruth =
    policyInput.runtimeTruth && typeof policyInput.runtimeTruth === "object"
      ? policyInput.runtimeTruth
      : {};
  const runtimeState =
    runtimeTruth.runtimeState && typeof runtimeTruth.runtimeState === "object"
      ? runtimeTruth.runtimeState
      : {};
  if (runtimeTruth.runtimeAvailable === true && Object.keys(runtimeState).length > 0) {
    return { policyInput, warnings: [] };
  }

  const repositoryResolution = resolveRepositoryTarget({
    input: policyInput.repositoryInput,
    mode: policyInput.mode,
    aliasRegistry
  });
  if (!repositoryResolution.resolved) {
    return { policyInput, warnings: [] };
  }

  const issueNumber = normalizeIssue(payload?.issueContext?.issueNumber);
  const continuationContext =
    payload?.continuationContext && typeof payload.continuationContext === "object"
      ? payload.continuationContext
      : {};
  const handoff =
    continuationContext.handoff && typeof continuationContext.handoff === "object"
      ? continuationContext.handoff
      : {};
  const handoffTarget =
    handoff.targetPullRequest && typeof handoff.targetPullRequest === "object"
      ? handoff.targetPullRequest
      : {};
  const activeBranch =
    normalizeText(runtimeState.activeBranch) ||
    normalizeText(handoff.headRef) ||
    normalizeText(handoffTarget.headRef) ||
    normalizeText(handoffTarget.head?.ref) ||
    normalizeText(payload?.executionTarget?.branch) ||
    (issueNumber ? `codex/issue-${issueNumber}` : "");
  const [repositoryOwner] = repositoryResolution.repository.split("/");
  const [pulls, branches, workflowRuns] = await Promise.all([
    retrieveGitHubReadPlane({
      resource: "pulls",
      repository: repositoryResolution.repository,
      state: "all",
      head: `${repositoryOwner}:${activeBranch}`,
      limit: 10,
      env
    }),
    retrieveGitHubReadPlane({
      resource: "branches",
      repository: repositoryResolution.repository,
      branch: activeBranch,
      limit: 1,
      env
    }),
    retrieveGitHubReadPlane({
      resource: "workflow_runs",
      repository: repositoryResolution.repository,
      branch: activeBranch,
      limit: 10,
      env
    })
  ]);

  if (!pulls.ok || !branches.ok || !workflowRuns.ok) {
    return {
      policyInput,
      warnings: ["remote Codex handoff runtime truth read was unavailable"]
    };
  }

  const pullRequest = selectPullRequestForBranch(pulls.read?.records, {
    branch: activeBranch,
    owner: repositoryOwner
  });
  const branchRecord = Array.isArray(branches.read?.records) ? branches.read.records[0] : null;
  return {
    policyInput: {
      ...policyInput,
      runtimeTruth: {
        ...runtimeTruth,
        runtimeAvailable: true,
        runtimeState: {
          ...runtimeState,
          activeBranch,
          branch: branchRecord ?? null,
          pullRequest: pullRequest.pullRequest ?? { exists: false },
          staleBranchAmbiguity: pullRequest.staleBranchAmbiguity ?? null,
          workflowRuns: workflowRuns.read?.records ?? []
        }
      }
    },
    warnings: []
  };
}

function selectPullRequestForBranch(records, target) {
  const items = Array.isArray(records) ? records : [];
  const branch = normalizeText(target?.branch);
  const owner = normalizeText(target?.owner);
  const selected = items.find(
    (item) =>
      normalizeText(item?.state) === "open" &&
      normalizeText(item?.headRef) === branch &&
      normalizeText(item?.headOwner) === owner
  );
  const staleItems = items.filter(
    (item) => normalizeText(item?.headRef) === branch && normalizeText(item?.headOwner) === owner
  );
  if (!selected) {
    return {
      pullRequest: { exists: false },
      staleBranchAmbiguity:
        staleItems.length > 0
          ? {
              error: "stale_branch_pr_ambiguity",
              reason:
                "target branch is associated only with non-open pull requests; revise_pr must not target this branch without a fresh open PR lock",
              pullRequests: staleItems.map((item) => ({
                number: item.number ?? null,
                url: item.htmlUrl ?? null,
                state: item.state ?? null,
                title: item.title ?? null,
                headRef: item.headRef ?? null,
                headSha: item.headSha ?? null,
                baseRef: item.baseRef ?? null
              }))
            }
          : null
    };
  }
  return {
    pullRequest: {
      exists: true,
      number: selected.number ?? null,
      url: selected.htmlUrl ?? null,
      state: selected.state ?? null,
      title: selected.title ?? null,
      headRef: selected.headRef ?? null,
      headSha: selected.headSha ?? null,
      baseRef: selected.baseRef ?? null
    },
    staleBranchAmbiguity: null
  };
}

function normalizeButlerReadConsentPayload(payload) {
  const policyInput =
    payload?.policyInput && typeof payload.policyInput === "object" ? payload.policyInput : {};
  const actionType = normalize(policyInput.actionType);
  const actorRole = normalize(payload?.actorRole);
  if (actorRole !== "butler" || (actionType !== "read" && actionType !== "summarize")) {
    return payload;
  }

  const consent =
    policyInput.consent && typeof policyInput.consent === "object" ? policyInput.consent : {};
  const consentWasProvided = policyInput.consent && typeof policyInput.consent === "object";
  const grantedCategories = Array.isArray(consent.grantedCategories)
    ? consent.grantedCategories
    : [];
  if (consentWasProvided && grantedCategories.length > 0) {
    return payload;
  }

  return {
    ...payload,
    policyInput: {
      ...policyInput,
      consent: {
        ...consent,
        grantedCategories: mergeGrantedConsentCategories(grantedCategories, ["read"])
      }
    }
  };
}

function normalizeRemoteCodexHandoffPayload(payload) {
  const policyInput =
    payload?.policyInput && typeof payload.policyInput === "object" ? payload.policyInput : {};
  const actionType = normalizeText(policyInput.actionType);
  const actorRole = normalizeText(payload?.actorRole);
  const issueNumber = normalizeIssue(payload?.issueContext?.issueNumber);
  if (actorRole !== "butler" || actionType !== "build" || !issueNumber) {
    return payload;
  }

  const continuationContext =
    payload?.continuationContext && typeof payload.continuationContext === "object"
      ? payload.continuationContext
      : {};
  const handoff =
    continuationContext.handoff && typeof continuationContext.handoff === "object"
      ? continuationContext.handoff
      : {};
  const issueTraceability =
    policyInput.issueTraceability && typeof policyInput.issueTraceability === "object"
      ? policyInput.issueTraceability
      : {};
  const consent =
    policyInput.consent && typeof policyInput.consent === "object" ? policyInput.consent : {};
  const grantedCategories = Array.isArray(consent.grantedCategories)
    ? consent.grantedCategories
    : [];
  const goGranted = policyInput.go === true;
  const normalizedGrantedCategories = goGranted
    ? mergeGrantedConsentCategories(grantedCategories, ["read", "propose", "execute"])
    : grantedCategories;
  const requestedExecutorTransport = normalizeText(
    payload?.executorTransport ?? continuationContext.executorTransport
  );
  const apiKeyRunnerAcknowledged =
    payload?.apiKeyRunnerAcknowledged === true ||
    continuationContext.apiKeyRunnerAcknowledged === true ||
    (goGranted && requestedExecutorTransport === "api_key_runner");

  return {
    ...payload,
    apiKeyRunnerAcknowledged,
    continuationContext: {
      ...continuationContext,
      requiresHandoff: true,
      apiKeyRunnerAcknowledged,
      handoff: {
        ...handoff,
        issueTraceable: handoff.issueTraceable === false ? false : true,
        approvalScopeMatched: handoff.approvalScopeMatched === false ? false : true,
        relatedIssue: normalizeIssue(handoff.relatedIssue) ?? issueNumber,
        summary:
          normalizeText(handoff.summary) ||
          `Issue #${issueNumber} bounded remote Codex handoff`
      }
    },
    policyInput: {
      ...policyInput,
      issueTraceable: policyInput.issueTraceable === false ? false : true,
      consent: {
        ...consent,
        grantedCategories: normalizedGrantedCategories
      },
      approvalPhrase: normalizeText(policyInput.approvalPhrase) || (goGranted ? "GO" : ""),
      issueTraceability: {
        ...issueTraceability,
        relatedIssue: normalizeIssue(issueTraceability.relatedIssue) ?? issueNumber,
        intentRefs: normalizeTraceRefs(issueTraceability.intentRefs, `#${issueNumber} Intent`),
        successCriteriaRefs: normalizeTraceRefs(
          issueTraceability.successCriteriaRefs,
          `#${issueNumber} Success Criteria`
        ),
        nonGoalRefs: normalizeTraceRefs(issueTraceability.nonGoalRefs, `#${issueNumber} Non-goals`)
      }
    }
  };
}

function mergeGrantedConsentCategories(current, required) {
  const seen = new Set();
  const merged = [];
  for (const category of [...current, ...required]) {
    const text = normalizeText(category);
    const key = normalize(text);
    if (!text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(text);
  }
  return merged;
}

function normalizeTraceRefs(value, fallback) {
  if (Array.isArray(value) && value.some((item) => Boolean(normalizeText(item)))) {
    return value;
  }
  return [fallback];
}

async function resolveRuntimeAliasRegistry({ baseAliasRegistry, env }) {
  const provider = resolveMemoryProvider(env);
  const stored = await safeRetrieveStoredAliasRegistry(provider);
  const aliasRegistry = mergeAliasRegistries(baseAliasRegistry, stored.ok ? stored.aliasRegistry : []);
  if (stored.ok) {
    return { aliasRegistry, warnings: [] };
  }

  return {
    aliasRegistry,
    warnings: [
      [
        "repository nickname registry read unverified",
        stored.error,
        stored.reason
      ]
        .map(normalizeText)
        .filter(Boolean)
        .join(": ")
    ]
  };
}

async function handleRepositoryNicknameUpsertRequest(request, env) {
  const provider = resolveMemoryProvider(env);
  const body = await readJson(request);
  const runtimeAliasResolution = await resolveRuntimeAliasRegistry({
    baseAliasRegistry: [],
    env
  });
  const resolvedAliasRegistry = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: {
      aliasRegistry: runtimeAliasResolution.aliasRegistry
    },
    env
  });
  const repositoryInput = body?.repository ?? body?.repositoryInput;
  const canonicalRepositoryInput = normalizeCanonicalRepositoryInput(repositoryInput);
  const resolution = canonicalRepositoryInput
    ? {
        resolved: true,
        repository: canonicalRepositoryInput,
        via: "canonical_owner_repo"
      }
    : resolveRepositoryTarget({
        input: repositoryInput,
        mode: TaskMode.EXECUTION,
        aliasRegistry: resolvedAliasRegistry.aliasRegistry
      });

  if (!resolution.resolved) {
    return json(422, {
      ok: false,
      error: "repository_nickname_request_invalid",
      reason: resolution.reason,
      candidates: resolution.candidates ?? []
    });
  }

  const result = await upsertRepositoryNickname({
    provider,
    repository: resolution.repository,
    nickname: body?.nickname,
    nicknames: body?.nicknames,
    mode: body?.mode || RepositoryNicknameMode.APPEND,
    aliasRegistry: resolvedAliasRegistry.aliasRegistry
  });

  if (!result.ok) {
    const status = result.status ?? 422;
    return json(status >= 500 ? 200 : status, {
      ok: false,
      httpStatus: status,
      error: result.error,
      reason: result.reason,
      issues: result.issues ?? []
    });
  }

  return json(200, {
    ok: true,
    repository: resolution.repository,
    aliasEntry: result.aliasEntry
  });
}

async function handleRepositoryNicknameDeleteRequest(request, env) {
  const provider = resolveMemoryProvider(env);
  const body = await readJson(request);
  const runtimeAliasResolution = await resolveRuntimeAliasRegistry({
    baseAliasRegistry: [],
    env
  });
  const resolvedAliasRegistry = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: {
      aliasRegistry: runtimeAliasResolution.aliasRegistry
    },
    env
  });
  const repositoryInput = body?.repository ?? body?.repositoryInput;
  const canonicalRepositoryInput = normalizeCanonicalRepositoryInput(repositoryInput);
  const resolution = canonicalRepositoryInput
    ? {
        resolved: true,
        repository: canonicalRepositoryInput,
        via: "canonical_owner_repo"
      }
    : resolveRepositoryTarget({
        input: repositoryInput,
        mode: TaskMode.EXECUTION,
        aliasRegistry: resolvedAliasRegistry.aliasRegistry
      });

  if (!resolution.resolved) {
    return json(422, {
      ok: false,
      error: "repository_nickname_delete_request_invalid",
      reason: resolution.reason,
      candidates: resolution.candidates ?? []
    });
  }

  const result = await deleteRepositoryNickname({
    provider,
    repository: resolution.repository,
    nickname: body?.nickname
  });

  if (!result.ok) {
    const status = result.status ?? 422;
    return json(status >= 500 ? 200 : status, {
      ok: false,
      httpStatus: status,
      error: result.error,
      reason: result.reason,
      issues: result.issues ?? []
    });
  }

  return json(200, {
    ok: true,
    repository: result.repository,
    nickname: result.nickname,
    deleted: result.deleted,
    deletedRecord: result.deletedRecord,
    aliasEntry: result.aliasEntry
  });
}

function normalizeCanonicalRepositoryInput(value) {
  const text = normalizeText(value).toLowerCase();
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(text)) {
    return "";
  }
  return text;
}

async function handlePasskeyRegistrationOptionsRequest(request, env) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for passkey registration"
    });
  }

  const body = await readJson(request);
  const created = await createPasskeyRegistrationOptions({
    adapter: env?.PASSKEY_ADAPTER,
    rpID: env?.VTDD_PASSKEY_RP_ID || new URL(request.url).hostname,
    rpName: env?.VTDD_PASSKEY_RP_NAME || "VTDD",
    origin: env?.VTDD_PASSKEY_ORIGIN || new URL(request.url).origin,
    operatorId: normalizeText(body?.operatorId) || "vtdd-operator",
    operatorLabel: normalizeText(body?.operatorLabel) || "VTDD Operator"
  });

  if (!created.ok) {
    return json(422, {
      ok: false,
      error: "passkey_registration_options_invalid",
      issues: created.issues ?? []
    });
  }

  const stored = await provider.store(created.sessionRecord);
  if (!stored?.ok) {
    return json(503, {
      ok: false,
      error: "memory_write_failed",
      reason: "failed to persist pending registration session"
    });
  }

  return json(200, {
    ok: true,
    sessionId: created.sessionRecord.id,
    optionsJSON: created.optionsJSON
  });
}

async function handlePasskeyRegistrationVerifyRequest(request, env) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for passkey registration verify"
    });
  }

  const body = await readJson(request);
  const sessionId = normalizeText(body?.sessionId);
  const sessionRecord = await findApprovalRecordById(provider, sessionId);
  if (!sessionRecord) {
    return json(404, {
      ok: false,
      error: "passkey_session_not_found",
      reason: "registration session not found"
    });
  }

  const verified = await verifyPasskeyRegistration({
    adapter: env?.PASSKEY_ADAPTER,
    sessionRecord,
    response: body?.response,
    rpID: env?.VTDD_PASSKEY_RP_ID || new URL(request.url).hostname,
    origin: env?.VTDD_PASSKEY_ORIGIN || new URL(request.url).origin
  });

  if (!verified.ok) {
    return json(422, {
      ok: false,
      error: "passkey_registration_verify_failed",
      issues: verified.issues ?? []
    });
  }

  await provider.store(verified.passkeyRecord);
  await provider.store(verified.completedSessionRecord);

  return json(200, {
    ok: true,
    credentialId: verified.passkeyRecord.content.credentialId
  });
}

async function handlePasskeyApprovalOptionsRequest(request, env) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for passkey approval"
    });
  }

  const body = await readJson(request);
  const passkeys = await retrieveRegisteredPasskeys(provider);
  const created = await createPasskeyApprovalOptions({
    adapter: env?.PASSKEY_ADAPTER,
    rpID: env?.VTDD_PASSKEY_RP_ID || new URL(request.url).hostname,
    origin: env?.VTDD_PASSKEY_ORIGIN || new URL(request.url).origin,
    passkeys,
    scope: buildApprovalScopeSnapshot({
      payload: body,
      policyInput: body?.policyInput
    })
  });

  if (!created.ok) {
    return json(422, {
      ok: false,
      error: "passkey_approval_options_invalid",
      issues: created.issues ?? []
    });
  }

  const stored = await provider.store(created.sessionRecord);
  if (!stored?.ok) {
    return json(503, {
      ok: false,
      error: "memory_write_failed",
      reason: "failed to persist pending passkey approval session"
    });
  }

  return json(200, {
    ok: true,
    sessionId: created.sessionRecord.id,
    optionsJSON: created.optionsJSON
  });
}

async function handlePasskeyApprovalVerifyRequest(request, env) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for passkey approval verify"
    });
  }

  const body = await readJson(request);
  const sessionId = normalizeText(body?.sessionId);
  const sessionRecord = await findApprovalRecordById(provider, sessionId);
  if (!sessionRecord) {
    return json(404, {
      ok: false,
      error: "passkey_session_not_found",
      reason: "approval session not found"
    });
  }

  const verified = await verifyPasskeyApproval({
    adapter: env?.PASSKEY_ADAPTER,
    sessionRecord,
    response: body?.response,
    passkeys: await retrieveRegisteredPasskeys(provider),
    rpID: env?.VTDD_PASSKEY_RP_ID || new URL(request.url).hostname,
    origin: env?.VTDD_PASSKEY_ORIGIN || new URL(request.url).origin
  });

  if (!verified.ok) {
    return json(422, {
      ok: false,
      error: "passkey_approval_verify_failed",
      issues: verified.issues ?? []
    });
  }

  await provider.store(verified.updatedPasskeyRecord);
  await provider.store(verified.grantRecord);

  const extraHeaders = {};
  if (isDashboardPasskeyScope(verified.approvalGrant?.scope)) {
    extraHeaders["set-cookie"] = buildDashboardPasskeySessionCookie(verified.approvalGrant);
  }

  return json(200, {
    ok: true,
    approvalGrant: verified.approvalGrant
  }, extraHeaders);
}

function appendWarnings(result, warnings) {
  if (!Array.isArray(warnings) || warnings.length === 0) {
    return result;
  }

  const currentWarnings = Array.isArray(result?.warnings) ? result.warnings : [];
  const merged = new Set([...currentWarnings, ...warnings].map(normalizeText).filter(Boolean));

  return {
    ...result,
    warnings: [...merged]
  };
}

async function resolveApprovalGrant({ payload, policyInput, env }) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return { approvalGrant: null };
  }

  const approvalId = normalizeText(policyInput?.approvalGrantId);
  if (!approvalId) {
    return { approvalGrant: null };
  }

  const record = await findApprovalRecordById(provider, approvalId);
  if (!record || record?.content?.kind !== "passkey_grant") {
    return {
      approvalGrant: null,
      warning: "approval grant id was provided but no matching passkey grant was found"
    };
  }

  return {
    approvalGrant: {
      approvalId,
      verified: record.content.status === "verified",
      expiresAt: record.content.expiresAt,
      scope: record.content.scope
    }
  };
}

function buildApprovalScopeSnapshot({ payload, policyInput }) {
  const issueContext = normalizeObject(payload?.issueContext);
  const traceability = normalizeObject(policyInput?.issueTraceability);
  const operationConfig = getGitHubAppOperation(payload?.highRiskKind ?? policyInput?.highRiskKind);
  const identityFields = new Set(operationConfig?.authorityScopeIdentityFields ?? [
    "repository",
    "issueNumber",
    "pullNumber",
    "relatedIssue",
    "phase"
  ]);
  return normalizeScopeSnapshot({
    actionType: policyInput?.actionType,
    highRiskKind: payload?.highRiskKind ?? policyInput?.highRiskKind,
    repositoryInput: identityFields.has("repository")
      ? policyInput?.repositoryInput ?? payload?.repositoryInput
      : undefined,
    issueNumber: identityFields.has("issueNumber")
      ? issueContext.issueNumber ?? payload?.issueNumber
      : undefined,
    pullNumber: identityFields.has("pullNumber") ? payload?.pullNumber : undefined,
    relatedIssue: identityFields.has("relatedIssue")
      ? traceability.relatedIssue ?? issueContext.issueNumber ?? payload?.relatedIssue
      : undefined,
    phase: identityFields.has("phase") ? payload?.phase : undefined
  });
}

function mapGitHubHighRiskOperationToActionType(operation) {
  if (operation === GitHubHighRiskOperation.PULL_READY_FOR_REVIEW) {
    return "pull_ready_for_review";
  }
  if (operation === GitHubHighRiskOperation.PULL_MERGE) {
    return "merge";
  }
  if (operation === GitHubHighRiskOperation.ISSUE_CLOSE) {
    return "issue_close";
  }
  return normalizeText(operation);
}

async function retrieveRegisteredPasskeys(provider) {
  const records = await provider.retrieve({
    type: MemoryRecordType.WORKING_MEMORY,
    tags: ["passkey_registry"]
  });
  return dedupePasskeys(records);
}

async function purgeExpiredPasskeyArtifacts(provider) {
  if (!provider || typeof provider.retrieve !== "function" || typeof provider.deleteRecords !== "function") {
    return { ok: true, deletedCount: 0 };
  }

  const records = await provider.retrieve({
    type: MemoryRecordType.APPROVAL_LOG,
    limit: MAX_MEMORY_LIMIT
  });
  const expiredIds = records
    .filter((record) => isExpiredPasskeyEphemeralRecord(record))
    .map((record) => normalizeText(record?.id))
    .filter(Boolean);

  if (expiredIds.length === 0) {
    return { ok: true, deletedCount: 0 };
  }

  return provider.deleteRecords({ ids: expiredIds });
}

async function findApprovalRecordById(provider, recordId) {
  if (!recordId) {
    return null;
  }
  const records = await provider.query({
    type: MemoryRecordType.APPROVAL_LOG,
    text: recordId,
    limit: 50
  });
  const matched =
    records.find((record) => normalizeText(record?.id) === recordId) ??
    records.find((record) => normalizeText(record?.content?.approvalId) === recordId) ??
    records.find((record) => normalizeText(record?.content?.sessionId) === recordId) ??
    null;
  if (matched) {
    return matched;
  }
  if (typeof provider.retrieve !== "function") {
    return null;
  }
  const fallbackRecords = await provider.retrieve({
    type: MemoryRecordType.APPROVAL_LOG,
    limit: MAX_MEMORY_LIMIT
  });
  return (
    fallbackRecords.find((record) => normalizeText(record?.id) === recordId) ??
    fallbackRecords.find((record) => normalizeText(record?.content?.approvalId) === recordId) ??
    fallbackRecords.find((record) => normalizeText(record?.content?.sessionId) === recordId) ??
    null
  );
}

async function appendGuardedAbsenceExecutionLog({ payload, gatewayOutcome, env }) {
  const policyInput = normalizeObject(payload?.policyInput);
  const autonomyMode = normalizeAutonomyMode(policyInput.autonomyMode);
  if (autonomyMode !== AutonomyMode.GUARDED_ABSENCE) {
    return gatewayOutcome;
  }

  const provider = resolveMemoryProvider(env);
  const providerValidation = validateMemoryProvider(provider);
  if (!providerValidation.ok) {
    return attachGatewayWarning(
      gatewayOutcome,
      "guarded absence execution log skipped: memory provider unavailable"
    );
  }

  const nowIso = new Date().toISOString();
  const body = normalizeObject(gatewayOutcome?.body);
  const blockedByRule = normalizeText(body.blockedByRule) || null;
  const recordInput = {
    id: buildGuardedAbsenceExecutionLogId({
      actionType: policyInput.actionType,
      timestamp: nowIso
    }),
    type: MemoryRecordType.EXECUTION_LOG,
    content: {
      mode: autonomyMode,
      phase: normalizeText(payload?.phase) || "execution",
      actorRole: normalizeText(payload?.actorRole) || null,
      actionType: normalizeText(policyInput.actionType) || null,
      allowed: body.allowed === true,
      blockedByRule,
      reason: normalizeText(body.reason) || null,
      repositoryInput: normalizeText(policyInput.repositoryInput) || null,
      repository: normalizeText(body.repository) || null,
      requiredApproval: normalizeText(body.requiredApproval) || null,
      stopCategory: classifyGuardedStopCategory(blockedByRule)
    },
    metadata: {
      source: "guarded_absence_gateway",
      statusCode: Number(gatewayOutcome?.status) || 200,
      blockedByRule,
      recordedAt: nowIso
    },
    priority: 88,
    tags: [
      "execution_log",
      "guarded_absence",
      body.allowed === true ? "result:allowed" : "result:blocked",
      blockedByRule ? `rule:${normalizeTag(blockedByRule)}` : null
    ].filter(Boolean),
    createdAt: nowIso
  };

  const created = createMemoryRecord(recordInput);
  if (!created.ok) {
    return attachGatewayWarning(
      gatewayOutcome,
      "guarded absence execution log skipped: execution_log schema invalid"
    );
  }

  try {
    const stored = await provider.store(created.record);
    if (!stored?.ok) {
      return attachGatewayWarning(
        gatewayOutcome,
        "guarded absence execution log skipped: memory provider rejected execution_log record"
      );
    }

    return {
      status: gatewayOutcome.status,
      body: {
        ...body,
        guardedAbsenceExecutionLog: {
          recordId: stored.record.id,
          recordType: stored.record.type,
          mode: autonomyMode
        }
      }
    };
  } catch {
    return attachGatewayWarning(
      gatewayOutcome,
      "guarded absence execution log skipped: memory provider store failed"
    );
  }
}

async function completeGatewayRuntime({ payload, gatewayResult, env }) {
  const provider = resolveMemoryProvider(env);
  const providerValidation = validateMemoryProvider(provider);
  const needsDecisionWrite = gatewayResult?.memoryWrite?.recordType === "decision_log";
  const needsProposalWrite = gatewayResult?.memoryWrite?.recordType === "proposal_log";
  const crossRetrievalRequest = normalizeCrossRetrievalRequest(
    gatewayResult?.conversationAssist?.crossRetrievalRequest
  );
  const operationalMemoryRequest = normalizeOperationalMemoryRequest(
    gatewayResult?.conversationAssist?.operationalMemoryRequest
  );
  const shouldAttachCrossReferences = crossRetrievalRequest.enabled;
  const shouldAttachOperationalMemory = operationalMemoryRequest.enabled && operationalMemoryRequest.mode === "recall";
  const shouldAttachMemoryInventory = operationalMemoryRequest.enabled && operationalMemoryRequest.mode === "inventory";
  const shouldAttachDecisionReferences = Array.isArray(gatewayResult?.retrievalPlan?.sources)
    ? gatewayResult.retrievalPlan.sources.includes("decision_log")
    : false;
  const shouldAttachProposalReferences = Array.isArray(gatewayResult?.retrievalPlan?.sources)
    ? gatewayResult.retrievalPlan.sources.includes("proposal_log")
    : false;

  if (
    !needsDecisionWrite &&
    !needsProposalWrite &&
    !shouldAttachCrossReferences &&
    !shouldAttachOperationalMemory &&
    !shouldAttachMemoryInventory &&
    !shouldAttachDecisionReferences &&
    !shouldAttachProposalReferences
  ) {
    return { status: 200, body: gatewayResult };
  }

  if (!providerValidation.ok) {
    if (needsDecisionWrite || needsProposalWrite) {
      const reason = needsProposalWrite
        ? "valid memory provider is required for proposal log persistence"
        : "valid memory provider is required for decision log persistence";
      return {
        status: 503,
        body: {
          allowed: false,
          error: "memory_provider_unavailable",
          reason
        }
      };
    }

    const retrievalReferences = {};
    const warnings = [];
    if (shouldAttachDecisionReferences) {
      retrievalReferences.decisionLogs = [];
      warnings.push("memory provider unavailable; decision references skipped");
    }
    if (shouldAttachProposalReferences) {
      retrievalReferences.proposalLogs = [];
      warnings.push("memory provider unavailable; proposal references skipped");
    }
    if (shouldAttachCrossReferences) {
      retrievalReferences.cross = null;
      warnings.push("memory provider unavailable; cross references skipped");
    }
    if (shouldAttachOperationalMemory) {
      retrievalReferences.operationalMemory = null;
      warnings.push("memory provider unavailable; operational memory recall skipped");
    }
    if (shouldAttachMemoryInventory) {
      retrievalReferences.operationalMemoryInventory = null;
      warnings.push("memory provider unavailable; operational memory inventory skipped");
    }

    return {
      status: 200,
      body: {
        ...gatewayResult,
        retrievalReferences,
        warnings
      }
    };
  }

  let responseBody = { ...gatewayResult };

  if (needsDecisionWrite) {
    const persisted = await appendDecisionLogFromGateway(provider, payload, gatewayResult);
    if (!persisted.ok) {
      if (persisted.status === 422) {
        return {
          status: 422,
          body: {
            allowed: false,
            blockedByRule: persisted.blockedByRule ?? "decision_log_schema_invalid",
            reason: persisted.reason,
            issues: Array.isArray(persisted.issues) ? persisted.issues : []
          }
        };
      }
      return {
        status: persisted.status ?? 503,
        body: {
          allowed: false,
          error: persisted.error ?? "memory_write_failed",
          reason: persisted.reason
        }
      };
    }

    responseBody = {
      ...responseBody,
      memoryWritePersisted: {
        recordId: persisted.record.id,
        recordType: persisted.record.type,
        relatedIssue: persisted.entry.relatedIssue,
        timestamp: persisted.entry.timestamp
      }
    };
  }

  if (needsProposalWrite) {
    const persisted = await appendProposalLogFromGateway(provider, payload, gatewayResult);
    if (!persisted.ok) {
      if (persisted.status === 422) {
        return {
          status: 422,
          body: {
            allowed: false,
            blockedByRule: persisted.blockedByRule ?? "proposal_log_schema_invalid",
            reason: persisted.reason,
            issues: Array.isArray(persisted.issues) ? persisted.issues : []
          }
        };
      }
      return {
        status: persisted.status ?? 503,
        body: {
          allowed: false,
          error: persisted.error ?? "memory_write_failed",
          reason: persisted.reason
        }
      };
    }

    responseBody = {
      ...responseBody,
      memoryWritePersisted: {
        recordId: persisted.record.id,
        recordType: persisted.record.type,
        relatedIssue: persisted.entry.relatedIssue ?? null,
        timestamp: persisted.entry.timestamp
      }
    };
  }

  if (shouldAttachDecisionReferences) {
    const relatedIssue =
      responseBody?.memoryWritePersisted?.relatedIssue ?? inferRelatedIssueFromGatewayInput(payload);
    const retrieved = await retrieveDecisionLogReferences(provider, {
      limit: 5,
      relatedIssue
    });

    if (!retrieved.ok) {
      return {
        status: retrieved.status ?? 503,
        body: {
          allowed: false,
          error: retrieved.error ?? "memory_read_failed",
          reason: retrieved.reason
        }
      };
    }

    responseBody = {
      ...responseBody,
      retrievalReferences: {
        ...(responseBody.retrievalReferences ?? {}),
        decisionLogs: retrieved.references
      }
    };
  }

  if (shouldAttachProposalReferences) {
    const relatedIssue =
      responseBody?.memoryWritePersisted?.recordType === "proposal_log"
        ? responseBody.memoryWritePersisted.relatedIssue
        : inferRelatedIssueFromProposalGatewayInput(payload);
    const retrieved = await retrieveProposalLogReferences(provider, {
      limit: 5,
      relatedIssue
    });

    if (!retrieved.ok) {
      return {
        status: retrieved.status ?? 503,
        body: {
          allowed: false,
          error: retrieved.error ?? "memory_read_failed",
          reason: retrieved.reason
        }
      };
    }

    responseBody = {
      ...responseBody,
      retrievalReferences: {
        ...(responseBody.retrievalReferences ?? {}),
        proposalLogs: retrieved.references
      }
    };
  }

  if (shouldAttachCrossReferences) {
    const crossInput = buildCrossRetrievalInput({
      payload,
      responseBody,
      crossRetrievalRequest
    });
    const retrieved = await retrieveCrossIssueMemoryIndex(provider, crossInput);
    if (!retrieved.ok) {
      responseBody = {
        ...responseBody,
        retrievalReferences: {
          ...(responseBody.retrievalReferences ?? {}),
          cross: null
        },
        warnings: [...(responseBody.warnings ?? []), retrieved.reason || "cross retrieval skipped"]
      };
    } else {
      responseBody = {
        ...responseBody,
        retrievalReferences: {
          ...(responseBody.retrievalReferences ?? {}),
          cross: formatCrossRetrievalOutput(retrieved, crossInput.displayMode)
        }
      };
    }
  }

  if (shouldAttachOperationalMemory) {
    const memoryInput = buildOperationalMemoryRetrievalInput({
      payload,
      operationalMemoryRequest
    });
    const retrieved = await retrieveOperationalMemory(provider, memoryInput);
    if (!retrieved.ok) {
      responseBody = {
        ...responseBody,
        retrievalReferences: {
          ...(responseBody.retrievalReferences ?? {}),
          operationalMemory: null
        },
        warnings: [...(responseBody.warnings ?? []), retrieved.reason || "operational memory recall skipped"]
      };
    } else {
      responseBody = {
        ...responseBody,
        retrievalReferences: {
          ...(responseBody.retrievalReferences ?? {}),
          operationalMemory: formatOperationalMemoryOutput(retrieved, operationalMemoryRequest.displayMode)
        }
      };
    }
  }

  if (shouldAttachMemoryInventory) {
    const inventory = await retrieveOperationalMemoryInventory(provider);
    responseBody = {
      ...responseBody,
      retrievalReferences: {
        ...(responseBody.retrievalReferences ?? {}),
        operationalMemoryInventory: inventory
      }
    };
  }

  return {
    status: 200,
    body: responseBody
  };
}

function buildOperationalMemoryRetrievalInput({ payload, operationalMemoryRequest }) {
  const repository =
    normalizeText(payload?.policyInput?.repository) ||
    normalizeText(payload?.policyInput?.repositoryInput) ||
    normalizeText(payload?.repository) ||
    null;
  return {
    text: operationalMemoryRequest.text || operationalMemoryRequest.queryHint,
    repository,
    limit: operationalMemoryRequest.limit,
    runtimeTruth: {
      currentState: "conversation-time operational memory recall",
      runtimeTruthSource: "conversation_assist",
      checkedAt: new Date().toISOString()
    }
  };
}

function formatOperationalMemoryOutput(retrieved, displayMode) {
  const compactContext = Array.isArray(retrieved.compactContext) ? retrieved.compactContext : [];
  return {
    queryText: retrieved.queryText,
    repository: retrieved.repository,
    memoryUseRule: retrieved.memoryUseRule,
    runtimeTruth: retrieved.runtimeTruth,
    compactContext: displayMode === "expanded" ? compactContext.slice(0, 8) : compactContext.slice(0, 5),
    layerCounts: Object.fromEntries(
      Object.entries(retrieved.referencesByLayer ?? {}).map(([layer, records]) => [
        layer,
        Array.isArray(records) ? records.length : 0
      ])
    ),
    retrievalSignals: retrieved.retrievalSignals
  };
}

async function retrieveOperationalMemoryInventory(provider) {
  const types = [
    MemoryRecordType.CONSTITUTION,
    MemoryRecordType.DECISION_LOG,
    MemoryRecordType.WORKING_MEMORY,
    MemoryRecordType.TEMPERATURE_NOTE,
    MemoryRecordType.REPAIR_CASE,
    MemoryRecordType.PROPOSAL_LOG,
    MemoryRecordType.APPROVAL_LOG,
    MemoryRecordType.EXECUTION_LOG,
    MemoryRecordType.ALIAS_REGISTRY
  ];
  const countsByType = {};
  const retrievedByType = await Promise.all(types.map((type) => provider.retrieve({ type, limit: 200 })));
  for (const [index, records] of retrievedByType.entries()) {
    const type = types[index];
    countsByType[type] = Array.isArray(records) ? records.length : 0;
  }
  return {
    mode: "bounded_inventory",
    note: "provider retrieve limit is 200 per type; count is a bounded visible count, not total storage, billing, or memory quality",
    countsByType,
    totalVisibleCount: Object.values(countsByType).reduce((total, count) => total + count, 0)
  };
}

function buildCrossRetrievalInput({ payload, responseBody, crossRetrievalRequest }) {
  const relatedIssue =
    crossRetrievalRequest.relatedIssue ??
    responseBody?.memoryWritePersisted?.relatedIssue ??
    inferRelatedIssueFromGatewayInput(payload) ??
    inferRelatedIssueFromProposalGatewayInput(payload);
  const issueContextInput = payload?.issueContext ?? {};
  const issueNumber = normalizeIssue(issueContextInput.issueNumber) ?? relatedIssue;
  const issueTitle = normalizeText(issueContextInput.issueTitle);
  const issueUrl = normalizeText(issueContextInput.issueUrl);

  return {
    phase: crossRetrievalRequest.phase,
    limit: crossRetrievalRequest.limit,
    relatedIssue,
    text: crossRetrievalRequest.text,
    semanticRetrieval: crossRetrievalRequest.semanticRetrieval,
    displayMode: crossRetrievalRequest.displayMode,
    issueContext:
      issueNumber || issueTitle || issueUrl
        ? {
            issueNumber,
            issueTitle: issueTitle || null,
            issueUrl: issueUrl || null
          }
        : null
  };
}

function formatCrossRetrievalOutput(retrieved, displayMode) {
  const ordered = Array.isArray(retrieved.orderedReferences) ? retrieved.orderedReferences : [];
  const limitedOrdered =
    displayMode === "expanded" ? ordered.slice(0, 12) : ordered.slice(0, 5);
  const sourceCounts = {};
  for (const [source, entries] of Object.entries(retrieved.referencesBySource ?? {})) {
    sourceCounts[source] = Array.isArray(entries) ? entries.length : 0;
  }

  return {
    displayMode,
    retrievalPlan: retrieved.retrievalPlan,
    relatedIssue: retrieved.relatedIssue,
    queryText: retrieved.queryText,
    primaryReference: retrieved.primaryReference,
    sourceCounts,
    orderedReferences: limitedOrdered
  };
}

function normalizeCrossRetrievalRequest(request) {
  const value = request && typeof request === "object" ? request : {};
  const enabled = value.enabled === true;
  return {
    enabled,
    phase: normalize(value.phase) === "exploration" ? "exploration" : "execution",
    limit: normalizeLimit(value.limit, 5),
    displayMode: normalize(value.displayMode) === "expanded" ? "expanded" : "short",
    relatedIssue: normalizeIssue(value.relatedIssue),
    text: normalizeText(value.text) || normalizeText(value.queryHint) || null,
    semanticRetrieval: normalizeSemanticRetrievalRequest(value.semanticRetrieval)
  };
}

function normalizeOperationalMemoryRequest(request) {
  const value = request && typeof request === "object" ? request : {};
  const mode = normalize(value.mode) === "inventory" ? "inventory" : "recall";
  return {
    enabled: value.enabled === true,
    mode,
    limit: normalizeLimit(value.limit, mode === "inventory" ? 1 : 5),
    displayMode: normalize(value.displayMode) === "expanded" ? "expanded" : "short",
    relatedIssue: normalizeIssue(value.relatedIssue),
    text: normalizeText(value.text) || null,
    queryHint: normalizeText(value.queryHint) || null,
    reasonTags: Array.isArray(value.reasonTags)
      ? value.reasonTags.map((item) => normalizeText(item)).filter(Boolean).slice(0, 8)
      : []
  };
}

function normalizeSemanticRetrievalRequest(value) {
  const input = value && typeof value === "object" ? value : {};
  const enabled = input.enabled === true;
  return {
    enabled,
    mode: enabled ? "assistive" : "disabled"
  };
}

function parseBooleanQueryParam(value) {
  const normalized = normalize(value);
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function buildRetrieveRuntimeTruth(url) {
  const currentState = normalizeText(url.searchParams.get("currentState"));
  const source = normalizeText(url.searchParams.get("runtimeTruthSource"));
  const checkedAt = normalizeText(url.searchParams.get("checkedAt"));
  if (!currentState && !source && !checkedAt) {
    return null;
  }
  return {
    currentState,
    source,
    checkedAt
  };
}

function resolveRuntimeAutonomyMode(env) {
  const runtimeEnv = env ?? {};
  const configured = runtimeEnv[AUTONOMY_MODE_ENV] ?? runtimeEnv[LEGACY_AUTONOMY_MODE_ENV];
  return normalizeAutonomyMode(configured);
}

function resolveMemoryProvider(env) {
  if (!env || typeof env !== "object") {
    return null;
  }

  const injectedProvider = env.MEMORY_PROVIDER ?? null;
  if (validateMemoryProvider(injectedProvider).ok) {
    return injectedProvider;
  }

  if (memoryProviderCache.has(env)) {
    return memoryProviderCache.get(env);
  }

  const d1Binding = env[MEMORY_D1_BINDING] ?? null;
  if (!d1Binding) {
    memoryProviderCache.set(env, null);
    return null;
  }

  const provider = createCloudflareMemoryProvider({
    d1: createD1MemoryIndexAdapter(d1Binding),
    r2: createR2TextAdapter(env[MEMORY_R2_BINDING] ?? null),
    blobThreshold: resolveMemoryBlobThreshold(env)
  });

  memoryProviderCache.set(env, provider);
  return provider;
}

function resolveDashboardEventStore(env) {
  if (!env || typeof env !== "object") {
    return null;
  }
  const injectedStore = env.DASHBOARD_EVENT_STORE ?? null;
  if (
    injectedStore &&
    typeof injectedStore.put === "function" &&
    typeof injectedStore.delete === "function" &&
    typeof injectedStore.latest === "function"
  ) {
    return injectedStore;
  }

  const d1Binding = env[MEMORY_D1_BINDING] ?? null;
  if (!d1Binding || typeof d1Binding.prepare !== "function") {
    return null;
  }
  if (dashboardEventStoreCache.has(d1Binding)) {
    return dashboardEventStoreCache.get(d1Binding);
  }
  const store = createD1DashboardEventStore(d1Binding);
  dashboardEventStoreCache.set(d1Binding, store);
  return store;
}

function resolveDashboardChatStore(env) {
  if (!env || typeof env !== "object") {
    return null;
  }
  const injectedStore = env.DASHBOARD_CHAT_STORE ?? null;
  if (
    injectedStore &&
    typeof injectedStore.appendMany === "function" &&
    typeof injectedStore.listThread === "function"
  ) {
    return injectedStore;
  }

  const d1Binding = env[MEMORY_D1_BINDING] ?? null;
  if (!d1Binding || typeof d1Binding.prepare !== "function") {
    return null;
  }
  if (dashboardChatStoreCache.has(d1Binding)) {
    return dashboardChatStoreCache.get(d1Binding);
  }
  const store = createD1DashboardChatStore(d1Binding);
  dashboardChatStoreCache.set(d1Binding, store);
  return store;
}

function resolveMediaObjectStore(env) {
  if (!env || typeof env !== "object") {
    return null;
  }
  const injectedStore = env.MEDIA_OBJECT_STORE ?? null;
  if (
    injectedStore &&
    typeof injectedStore.put === "function" &&
    typeof injectedStore.get === "function"
  ) {
    return injectedStore;
  }

  const d1Binding = env[MEMORY_D1_BINDING] ?? null;
  if (!d1Binding || typeof d1Binding.prepare !== "function") {
    return null;
  }
  if (mediaObjectStoreCache.has(d1Binding)) {
    return mediaObjectStoreCache.get(d1Binding);
  }
  const store = createD1MediaObjectStore(d1Binding);
  mediaObjectStoreCache.set(d1Binding, store);
  return store;
}

function resolveDashboardPushSubscriptionStore(env) {
  if (!env || typeof env !== "object") {
    return null;
  }
  const injectedStore = env.DASHBOARD_PUSH_SUBSCRIPTION_STORE ?? null;
  if (injectedStore && typeof injectedStore.put === "function" && typeof injectedStore.list === "function") {
    return injectedStore;
  }

  const d1Binding = env[MEMORY_D1_BINDING] ?? null;
  if (!d1Binding || typeof d1Binding.prepare !== "function") {
    return null;
  }
  if (dashboardPushSubscriptionStoreCache.has(d1Binding)) {
    return dashboardPushSubscriptionStoreCache.get(d1Binding);
  }
  const store = createD1DashboardPushSubscriptionStore(d1Binding);
  dashboardPushSubscriptionStoreCache.set(d1Binding, store);
  return store;
}

function resolveDashboardChatRoomStub(env, threadId) {
  const namespace = env?.DASHBOARD_CHAT_ROOMS ?? null;
  const roomName = normalizeDashboardThreadId(threadId);
  if (!namespace || !roomName) {
    return null;
  }
  if (typeof namespace.getByName === "function") {
    return namespace.getByName(roomName);
  }
  if (typeof namespace.idFromName === "function" && typeof namespace.get === "function") {
    return namespace.get(namespace.idFromName(roomName));
  }
  return null;
}

async function resolveDashboardChatRepository({ payload, env }) {
  const input = normalizeObject(payload);
  const text = input.text || input.message || input.body;
  const rawRepositoryInput =
    normalizeDashboardEventText(input.repository || input.repositoryInput || input.repository_input) ||
    extractRepositoryTokenFromDashboardChatText(text);
  const canonicalRepository = normalizeCanonicalRepositoryInput(rawRepositoryInput);
  if (canonicalRepository) {
    return {
      ok: true,
      repository: canonicalRepository,
      input: rawRepositoryInput,
      via: "canonical"
    };
  }
  if (!rawRepositoryInput) {
    if (shouldUseDashboardThreadRepositoryContext(text)) {
      const threadContextRepository = await resolveDashboardThreadContextRepository({
        threadId: input.threadId || input.thread_id,
        env
      });
      if (threadContextRepository) {
        return {
          ok: true,
          repository: threadContextRepository,
          input: threadContextRepository,
          via: "thread_context"
        };
      }
    }
    return {
      ok: false,
      status: 422,
      error: "repository_required",
      reason:
        "repository 文脈が必要な依頼では、owner/repo 形式か登録済み nickname を本文に含めてください。例: `ぶい #450 の残り Issue と PR を確認して`。",
      issues: ["dashboard top chat requires a repository target before VPS Codex CLI handoff"]
    };
  }

  const provider = resolveMemoryProvider(env);
  const registryResult = await safeRetrieveStoredAliasRegistry(provider);
  const aliasRegistry = registryResult.ok ? registryResult.aliasRegistry : [];
  const resolved = resolveRepositoryTarget({
    input: rawRepositoryInput,
    mode: TaskMode.EXECUTION,
    aliasRegistry
  });
  if (resolved.resolved) {
    return {
      ok: true,
      repository: resolved.repository,
      input: rawRepositoryInput,
      via: resolved.via || "alias"
    };
  }
  return {
    ok: false,
    status: resolved.ambiguous ? 409 : 422,
    error: resolved.ambiguous ? "repository_nickname_ambiguous" : "repository_unresolved",
    reason: resolved.ambiguous
      ? "対象 repository nickname が曖昧です。候補から 1 つを owner/repo 形式で指定してください。"
      : "対象 repository nickname を登録済み alias から解決できませんでした。repository 文脈が必要な依頼では owner/repo 形式で指定してください。",
    issues: registryResult.ok
      ? ["repository nickname could not be resolved"]
      : [registryResult.reason || "repository nickname registry could not be read"],
    candidates: resolved.candidates || []
  };
}

async function resolveDashboardThreadContextRepository({ threadId, env } = {}) {
  const normalizedThreadId = normalizeDashboardThreadId(threadId);
  if (!normalizedThreadId) {
    return "";
  }
  const store = resolveDashboardChatStore(env);
  if (!store || typeof store.listThread !== "function") {
    return "";
  }
  try {
    const messages = await store.listThread(normalizedThreadId, { limit: 20 });
    const latestWithRepository = [...(Array.isArray(messages) ? messages : [])]
      .reverse()
      .find((message) => normalizeCanonicalRepositoryInput(message?.repository));
    return normalizeCanonicalRepositoryInput(latestWithRepository?.repository);
  } catch {
    return "";
  }
}

function shouldUseDashboardThreadRepositoryContext(value) {
  const text = sanitizeDashboardChatText(value);
  if (!text) {
    return false;
  }
  if (/#\d+\b/.test(text)) {
    return true;
  }
  return /(\bissue\b|\bissues\b|\bpr\b|\bpull request\b|\bactions?\b|\bci\b|\brag\b|\bvps\b|\bcodex\b|\brunner\b|Issue|PR|残り|タスク|進捗|状況|確認|見て|調べて|レビュー|指摘|マージ|merge|デプロイ|deploy|実装|修正|直して|壊れ|バグ|エラー|失敗|ブロッカー|close|クローズ|返信|保存|検索|thread|スレッド)/i.test(
    text
  );
}

function createDashboardRequestId(prefix) {
  const normalizedPrefix = normalizeDashboardEventText(prefix) || "dashboard";
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${normalizedPrefix}:${globalThis.crypto.randomUUID()}`;
  }
  return `${normalizedPrefix}:${Date.now().toString(36)}`;
}

function buildDashboardAppServerAuthorityHint({ repository, relatedIssue, text }) {
  const needsRepositoryContext = Boolean(repository || relatedIssue || shouldUseDashboardThreadRepositoryContext(text));
  return {
    ordinaryConversationAllowed: true,
    repositoryRequired: false,
    repository: repository || null,
    relatedIssue: relatedIssue || null,
    escalation:
      needsRepositoryContext
        ? "Repository / Issue context may be used, but high-risk actions still require explicit GO or passkey approval."
        : "Treat as ordinary conversation unless the owner asks for repository, Issue, PR, deploy, credential, or permission work.",
    highRiskActionsRequire: ["GO", "passkey_approval"]
  };
}

function normalizeDashboardAppServerBridgeEvent(payload, { fallbackThreadId = "" } = {}) {
  const input = normalizeObject(payload);
  const threadId = normalizeDashboardThreadId(input.threadId || input.thread_id || fallbackThreadId);
  if (!threadId) {
    return {
      ok: false,
      reason: "threadId is required for app-server bridge events"
    };
  }
  const eventType = normalizeDashboardEventText(input.type).toLowerCase();
  const status = normalizeDashboardEventText(input.status).toLowerCase();
  const codexThreadId = normalizeDashboardEventText(input.codexThreadId || input.codex_thread_id);
  const text = sanitizeDashboardChatText(input.text || input.message || input.delta || input.finalText || input.final_text);
  const repository = normalizeCanonicalRepositoryInput(input.repository);
  const relatedIssue = normalizePositiveInteger(input.relatedIssue || input.issueNumber);
  const createdAt = normalizeIsoTimestamp(input.createdAt) || new Date().toISOString();
  const messages = [];
  let transientStatus = "";
  if (eventType === "app_server_reply_delta") {
    // Streaming deltas are transport progress, not durable chat messages.
  } else if (eventType === "app_server_reply") {
    if (text) {
      messages.push(
        normalizeDashboardChatMessage(
          {
            threadId,
            role: "butler",
            repository,
            relatedIssue,
            status: "replied",
            text,
            createdAt
          },
          { threadId }
        )
      );
    }
  } else if (eventType === "app_server_turn_failed" || status === "failed") {
    messages.push(
      normalizeDashboardChatMessage(
        {
          threadId,
          role: "system",
          repository,
          relatedIssue,
          status: "failed",
          text: text || "codex app-server bridge failed before returning a reply.",
          createdAt
        },
        { threadId }
      )
    );
  } else if (eventType === "app_server_status") {
    transientStatus = status === "replied" ? "replied" : "thinking";
  }
  return {
    ok: true,
    threadId,
    codexThreadId,
    createdAt,
    text,
    transientStatus,
    messages: messages.filter(Boolean)
  };
}

async function notifyDashboardChatRoom({ env, threadId, messages }) {
  const room = resolveDashboardChatRoomStub(env, threadId);
  if (!room || typeof room.fetch !== "function") {
    return false;
  }
  try {
    const response = await room.fetch("https://dashboard-chat-room.internal/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId,
        messages: Array.isArray(messages) ? messages : []
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

function extractRepositoryTokenFromDashboardChatText(value) {
  const text = sanitizeDashboardChatText(value);
  if (!text) {
    return "";
  }
  const canonicalMatch = text.match(/^[\s　]*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/);
  if (canonicalMatch) {
    return canonicalMatch[1];
  }
  const nicknameMatch = text.match(/^[\s　]*([^\s　#「『【\\/:]+?)(?:\s+|[　]*の|[　]*を|[　]*で|[　]*に)/u);
  return normalizeDashboardEventText(nicknameMatch?.[1]);
}

function extractIssueNumberFromDashboardChatText(value) {
  const text = sanitizeDashboardChatText(value);
  const match = text.match(/#([1-9][0-9]*)/);
  return normalizePositiveInteger(match?.[1]);
}

function normalizeDashboardRepositoryInput(value) {
  return normalizeDashboardEventText(value).toLowerCase();
}

function createD1DashboardEventStore(d1) {
  let schemaPromise = null;
  return {
    async put(event) {
      const normalized = normalizeDashboardEventRecord(event);
      await ensureSchema();
      await d1
        .prepare(
          `INSERT OR REPLACE INTO vtdd_dashboard_events (
             id, kind, repository, workflow_name, run_id, status, conclusion,
             head_sha, head_branch, run_url, title, created_at, updated_at, payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          normalized.id,
          normalized.kind,
          normalized.repository,
          normalized.workflowName,
          normalized.runId,
          normalized.status,
          normalized.conclusion,
          normalized.headSha,
          normalized.headBranch,
          normalized.runUrl,
          normalized.title,
          normalized.createdAt,
          normalized.updatedAt,
          JSON.stringify(normalized)
        )
        .run();
      return normalized;
    },

    async delete(eventId) {
      const id = normalizeDashboardEventText(eventId);
      if (!id) {
        return false;
      }
      await ensureSchema();
      await d1.prepare("DELETE FROM vtdd_dashboard_events WHERE id = ?").bind(id).run();
      return true;
    },

    async latest(filter = {}) {
      await ensureSchema();
      const kind = normalizeDashboardEventText(filter.kind);
      const repository = normalizeCanonicalRepositoryInput(filter.repository);
      const workflowName = normalizeDashboardEventText(filter.workflowName);
      const clauses = [];
      const params = [];
      if (kind) {
        clauses.push("kind = ?");
        params.push(kind);
      }
      if (repository) {
        clauses.push("repository = ?");
        params.push(repository);
      }
      if (workflowName) {
        clauses.push("workflow_name = ?");
        params.push(workflowName);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const result = await d1
        .prepare(
          `SELECT payload_json FROM vtdd_dashboard_events ${where} ORDER BY updated_at DESC, created_at DESC LIMIT 1`
        )
        .bind(...params)
        .all();
      const row = Array.isArray(result?.results) ? result.results[0] : null;
      if (!row?.payload_json) {
        return null;
      }
      try {
        return normalizeDashboardEventRecord(JSON.parse(row.payload_json));
      } catch {
        return null;
      }
    },

    async listRecent(filter = {}) {
      await ensureSchema();
      const kind = normalizeDashboardEventText(filter.kind);
      const repository = normalizeCanonicalRepositoryInput(filter.repository);
      const workflowName = normalizeDashboardEventText(filter.workflowName);
      const since = normalizeIsoTimestamp(filter.since);
      const limit = normalizeLimit(filter.limit, 20);
      const clauses = [];
      const params = [];
      if (kind) {
        clauses.push("kind = ?");
        params.push(kind);
      }
      if (repository) {
        clauses.push("repository = ?");
        params.push(repository);
      }
      if (workflowName) {
        clauses.push("workflow_name = ?");
        params.push(workflowName);
      }
      if (since) {
        clauses.push("updated_at >= ?");
        params.push(since);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const result = await d1
        .prepare(
          `SELECT payload_json FROM vtdd_dashboard_events ${where} ORDER BY updated_at DESC, created_at DESC LIMIT ?`
        )
        .bind(...params, limit)
        .all();
      return (Array.isArray(result?.results) ? result.results : [])
        .map((row) => {
          try {
            return row?.payload_json ? normalizeDashboardEventRecord(JSON.parse(row.payload_json)) : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }
  };

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await d1.exec(
          "CREATE TABLE IF NOT EXISTS vtdd_dashboard_events (id TEXT PRIMARY KEY, kind TEXT NOT NULL, repository TEXT NOT NULL, workflow_name TEXT NOT NULL, run_id TEXT NOT NULL, status TEXT NOT NULL, conclusion TEXT, head_sha TEXT, head_branch TEXT, run_url TEXT, title TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, payload_json TEXT NOT NULL);"
        );
        await d1.exec(
          "CREATE INDEX IF NOT EXISTS idx_vtdd_dashboard_events_lookup ON vtdd_dashboard_events (kind, repository, workflow_name, updated_at DESC);"
        );
        await d1.exec(
          "CREATE INDEX IF NOT EXISTS idx_vtdd_dashboard_events_recent ON vtdd_dashboard_events (updated_at DESC, created_at DESC);"
        );
      })();
    }
    return schemaPromise;
  }
}

function createD1DashboardChatStore(d1) {
  let schemaPromise = null;
  return {
    async appendMany(threadId, messages) {
      const resolvedThreadId = normalizeDashboardThreadId(threadId);
      if (!resolvedThreadId) {
        return [];
      }
      const normalizedMessages = (Array.isArray(messages) ? messages : [])
        .map((message) => normalizeDashboardChatMessage(message, { threadId: resolvedThreadId }))
        .filter(Boolean);
      if (normalizedMessages.length === 0) {
        return [];
      }

      await ensureSchema();
      for (const message of normalizedMessages) {
        await d1
          .prepare(
            `INSERT OR REPLACE INTO vtdd_dashboard_chat_messages (
               thread_id, message_id, role, repository, related_issue, status, text,
               created_at, payload_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            message.threadId,
            message.messageId,
            message.role,
            message.repository,
            message.relatedIssue,
            message.status,
            message.text,
            message.createdAt,
            JSON.stringify(message)
          )
          .run();
      }
      return normalizedMessages;
    },

    async listThread(threadId, filter = {}) {
      const resolvedThreadId = normalizeDashboardThreadId(threadId);
      if (!resolvedThreadId) {
        return [];
      }
      await ensureSchema();
      const limit = normalizeLimit(filter.limit, 80);
      const result = await d1
        .prepare(
          `SELECT payload_json FROM vtdd_dashboard_chat_messages
           WHERE thread_id = ?
           ORDER BY created_at DESC, message_id DESC
           LIMIT ?`
        )
        .bind(resolvedThreadId, limit)
        .all();
      return (Array.isArray(result?.results) ? result.results : [])
        .map((row) => {
          try {
            return row?.payload_json
              ? normalizeDashboardChatMessage(JSON.parse(row.payload_json), { threadId: resolvedThreadId })
              : null;
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .reverse();
    },

    async putSummary(threadId, summary) {
      const normalized = normalizeDashboardThreadSummary(summary, { threadId });
      if (!normalized) {
        return null;
      }
      await ensureSchema();
      await d1
        .prepare(
          `INSERT OR REPLACE INTO vtdd_dashboard_thread_summaries (
             thread_id, repository, related_issue, summary, decisions_json,
             open_items_json, archived_until_message_id, updated_at, payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          normalized.threadId,
          normalized.repository,
          normalized.relatedIssue,
          normalized.summary,
          JSON.stringify(normalized.decisions),
          JSON.stringify(normalized.openItems),
          normalized.archivedUntilMessageId,
          normalized.updatedAt,
          JSON.stringify(normalized)
        )
        .run();
      return normalized;
    },

    async getSummary(threadId) {
      const resolvedThreadId = normalizeDashboardThreadId(threadId);
      if (!resolvedThreadId) {
        return null;
      }
      await ensureSchema();
      const result = await d1
        .prepare("SELECT payload_json FROM vtdd_dashboard_thread_summaries WHERE thread_id = ? LIMIT 1")
        .bind(resolvedThreadId)
        .all();
      const row = Array.isArray(result?.results) ? result.results[0] : null;
      try {
        return row?.payload_json
          ? normalizeDashboardThreadSummary(JSON.parse(row.payload_json), { threadId: resolvedThreadId })
          : null;
      } catch {
        return null;
      }
    },

    async search(filter = {}) {
      await ensureSchema();
      const text = sanitizeDashboardChatText(filter.text || filter.q);
      const repository = normalizeCanonicalRepositoryInput(filter.repository);
      const relatedIssue = normalizePositiveInteger(filter.relatedIssue || filter.issueNumber);
      const limit = normalizeLimit(filter.limit, 20);
      const results = [];

      const messageClauses = [];
      const messageParams = [];
      if (text) {
        messageClauses.push("text LIKE ?");
        messageParams.push(`%${text}%`);
      }
      if (repository) {
        messageClauses.push("repository = ?");
        messageParams.push(repository);
      }
      if (relatedIssue) {
        messageClauses.push("related_issue = ?");
        messageParams.push(relatedIssue);
      }
      const messageWhere = messageClauses.length > 0 ? `WHERE ${messageClauses.join(" AND ")}` : "";
      const messageRows = await d1
        .prepare(
          `SELECT payload_json FROM vtdd_dashboard_chat_messages
           ${messageWhere}
           ORDER BY created_at DESC, message_id DESC
           LIMIT ?`
        )
        .bind(...messageParams, limit)
        .all();
      for (const row of Array.isArray(messageRows?.results) ? messageRows.results : []) {
        try {
          const message = row?.payload_json ? normalizeDashboardChatMessage(JSON.parse(row.payload_json)) : null;
          if (message) {
            results.push({ kind: "message", threadId: message.threadId, message });
          }
        } catch {
          // ignore malformed rows
        }
      }

      const summaryClauses = [];
      const summaryParams = [];
      if (text) {
        summaryClauses.push("(summary LIKE ? OR decisions_json LIKE ? OR open_items_json LIKE ?)");
        summaryParams.push(`%${text}%`, `%${text}%`, `%${text}%`);
      }
      if (repository) {
        summaryClauses.push("repository = ?");
        summaryParams.push(repository);
      }
      if (relatedIssue) {
        summaryClauses.push("related_issue = ?");
        summaryParams.push(relatedIssue);
      }
      const summaryWhere = summaryClauses.length > 0 ? `WHERE ${summaryClauses.join(" AND ")}` : "";
      const summaryRows = await d1
        .prepare(
          `SELECT payload_json FROM vtdd_dashboard_thread_summaries
           ${summaryWhere}
           ORDER BY updated_at DESC
           LIMIT ?`
        )
        .bind(...summaryParams, limit)
        .all();
      for (const row of Array.isArray(summaryRows?.results) ? summaryRows.results : []) {
        try {
          const summary = row?.payload_json ? normalizeDashboardThreadSummary(JSON.parse(row.payload_json)) : null;
          if (summary) {
            results.push({ kind: "summary", threadId: summary.threadId, summary });
          }
        } catch {
          // ignore malformed rows
        }
      }

      return results.slice(0, limit);
    }
  };

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await d1.exec(
          "CREATE TABLE IF NOT EXISTS vtdd_dashboard_chat_messages (thread_id TEXT NOT NULL, message_id TEXT NOT NULL, role TEXT NOT NULL, repository TEXT, related_issue INTEGER, status TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY (thread_id, message_id));"
        );
        await d1.exec(
          "CREATE INDEX IF NOT EXISTS idx_vtdd_dashboard_chat_messages_thread ON vtdd_dashboard_chat_messages (thread_id, created_at DESC);"
        );
        await d1.exec(
          "CREATE INDEX IF NOT EXISTS idx_vtdd_dashboard_chat_messages_lookup ON vtdd_dashboard_chat_messages (repository, related_issue, created_at DESC);"
        );
        await d1.exec(
          "CREATE TABLE IF NOT EXISTS vtdd_dashboard_thread_summaries (thread_id TEXT PRIMARY KEY, repository TEXT, related_issue INTEGER, summary TEXT NOT NULL, decisions_json TEXT NOT NULL, open_items_json TEXT NOT NULL, archived_until_message_id TEXT, updated_at TEXT NOT NULL, payload_json TEXT NOT NULL);"
        );
        await d1.exec(
          "CREATE INDEX IF NOT EXISTS idx_vtdd_dashboard_thread_summaries_lookup ON vtdd_dashboard_thread_summaries (repository, related_issue, updated_at DESC);"
        );
      })();
    }
    return schemaPromise;
  }
}

function createD1MediaObjectStore(d1) {
  let schemaPromise = null;
  return {
    async put(record) {
      const normalized = normalizeMediaObjectRecord(record);
      if (!normalized) {
        return null;
      }
      await ensureSchema();
      await d1
        .prepare(
          `INSERT OR REPLACE INTO vtdd_media_objects (
             id, repository, related_issue, related_pr, source_surface, source_event_id,
             object_key, filename, content_type, byte_size, sha256, visibility,
             summary, ocr_text, created_by, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          normalized.id,
          normalized.repository,
          normalized.relatedIssue,
          normalized.relatedPr,
          normalized.sourceSurface,
          normalized.sourceEventId,
          normalized.objectKey,
          normalized.filename,
          normalized.contentType,
          normalized.byteSize,
          normalized.sha256,
          normalized.visibility,
          normalized.summary,
          normalized.ocrText,
          normalized.createdBy,
          normalized.createdAt,
          normalized.updatedAt
        )
        .run();
      return normalized;
    },

    async get(id) {
      const mediaId = normalizeMediaId(id);
      if (!mediaId) {
        return null;
      }
      await ensureSchema();
      const result = await d1
        .prepare("SELECT * FROM vtdd_media_objects WHERE id = ? LIMIT 1")
        .bind(mediaId)
        .all();
      const row = Array.isArray(result?.results) ? result.results[0] : null;
      return row ? mediaObjectRecordFromRow(row) : null;
    },

    async delete(id) {
      const mediaId = normalizeMediaId(id);
      if (!mediaId) {
        return false;
      }
      await ensureSchema();
      await d1.prepare("DELETE FROM vtdd_media_objects WHERE id = ?").bind(mediaId).run();
      return true;
    },

    async search(filter = {}) {
      await ensureSchema();
      const repository = normalizeCanonicalRepositoryInput(filter.repository);
      const relatedIssue = normalizePositiveInteger(filter.relatedIssue || filter.issueNumber);
      const relatedPr = normalizePositiveInteger(filter.relatedPr || filter.pullRequestNumber);
      const limit = normalizeLimit(filter.limit, 20);
      const clauses = [];
      const params = [];
      if (repository) {
        clauses.push("repository = ?");
        params.push(repository);
      }
      if (relatedIssue) {
        clauses.push("related_issue = ?");
        params.push(relatedIssue);
      }
      if (relatedPr) {
        clauses.push("related_pr = ?");
        params.push(relatedPr);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      const result = await d1
        .prepare(
          `SELECT * FROM vtdd_media_objects
           ${where}
           ORDER BY created_at DESC
           LIMIT ?`
        )
        .bind(...params, limit)
        .all();
      return (Array.isArray(result?.results) ? result.results : []).map(mediaObjectRecordFromRow).filter(Boolean);
    }
  };

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await d1.exec("CREATE TABLE IF NOT EXISTS vtdd_media_objects (id TEXT PRIMARY KEY, repository TEXT, related_issue INTEGER, related_pr INTEGER, source_surface TEXT NOT NULL, source_event_id TEXT, object_key TEXT NOT NULL, filename TEXT NOT NULL, content_type TEXT NOT NULL, byte_size INTEGER NOT NULL, sha256 TEXT NOT NULL, visibility TEXT NOT NULL, summary TEXT, ocr_text TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);");
        await d1.exec("CREATE INDEX IF NOT EXISTS idx_vtdd_media_repo ON vtdd_media_objects(repository, created_at DESC);");
        await d1.exec("CREATE INDEX IF NOT EXISTS idx_vtdd_media_issue ON vtdd_media_objects(repository, related_issue, created_at DESC);");
        await d1.exec("CREATE INDEX IF NOT EXISTS idx_vtdd_media_pr ON vtdd_media_objects(repository, related_pr, created_at DESC);");
        await d1.exec("CREATE INDEX IF NOT EXISTS idx_vtdd_media_source ON vtdd_media_objects(source_surface, source_event_id);");
      })();
    }
    return schemaPromise;
  }
}

function createD1DashboardPushSubscriptionStore(d1) {
  let schemaPromise = null;
  return {
    async put(subscription) {
      const normalized = {
        endpointHash: normalizeDashboardEventText(subscription.endpointHash),
        endpoint: normalizeDashboardEventText(subscription.endpoint),
        expirationTime: subscription.expirationTime ?? null,
        p256dh: normalizeDashboardEventText(subscription.p256dh),
        auth: normalizeDashboardEventText(subscription.auth),
        userAgent: sanitizeDashboardChatText(subscription.userAgent),
        ownerIdentity: normalizeDashboardEventText(subscription.ownerIdentity) || "dashboard_owner",
        updatedAt: normalizeIsoTimestamp(subscription.updatedAt) || new Date().toISOString()
      };
      await ensureSchema();
      await d1
        .prepare(
          `INSERT OR REPLACE INTO vtdd_dashboard_push_subscriptions (
             endpoint_hash, endpoint, expiration_time, p256dh, auth, user_agent,
             owner_identity, updated_at, payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          normalized.endpointHash,
          normalized.endpoint,
          normalized.expirationTime,
          normalized.p256dh,
          normalized.auth,
          normalized.userAgent,
          normalized.ownerIdentity,
          normalized.updatedAt,
          JSON.stringify({
            endpointHash: normalized.endpointHash,
            expirationTime: normalized.expirationTime,
            rawMaterial: "stored_in_columns_for_server_side_web_push_send_only",
            userAgent: normalized.userAgent,
            ownerIdentity: normalized.ownerIdentity,
            updatedAt: normalized.updatedAt
          })
        )
        .run();
      return normalized;
    },

    async list(filter = {}) {
      await ensureSchema();
      const limit = normalizeLimit(filter.limit, 50);
      const result = await d1
        .prepare(
          `SELECT endpoint_hash, endpoint, expiration_time, p256dh, auth, user_agent,
                  owner_identity, updated_at
             FROM vtdd_dashboard_push_subscriptions
             ORDER BY updated_at DESC
             LIMIT ?`
        )
        .bind(limit)
        .all();
      return (Array.isArray(result?.results) ? result.results : [])
        .map((row) => ({
          endpointHash: normalizeDashboardEventText(row?.endpoint_hash),
          endpoint: normalizeDashboardEventText(row?.endpoint),
          expirationTime: row?.expiration_time ?? null,
          p256dh: normalizeDashboardEventText(row?.p256dh),
          auth: normalizeDashboardEventText(row?.auth),
          userAgent: sanitizeDashboardChatText(row?.user_agent),
          ownerIdentity: normalizeDashboardEventText(row?.owner_identity),
          updatedAt: normalizeIsoTimestamp(row?.updated_at) || null
        }))
        .filter((record) => record.endpoint && record.p256dh && record.auth);
    },

    async get(endpointHash) {
      const normalizedEndpointHash = normalizeDashboardEventText(endpointHash);
      if (!normalizedEndpointHash) {
        return null;
      }
      await ensureSchema();
      const result = await d1
        .prepare(
          `SELECT endpoint_hash, endpoint, expiration_time, p256dh, auth, user_agent,
                  owner_identity, updated_at
             FROM vtdd_dashboard_push_subscriptions
             WHERE endpoint_hash = ?
             LIMIT 1`
        )
        .bind(normalizedEndpointHash)
        .first();
      if (!result) {
        return null;
      }
      return {
        endpointHash: normalizeDashboardEventText(result.endpoint_hash),
        endpoint: normalizeDashboardEventText(result.endpoint),
        expirationTime: result.expiration_time ?? null,
        p256dh: normalizeDashboardEventText(result.p256dh),
        auth: normalizeDashboardEventText(result.auth),
        userAgent: sanitizeDashboardChatText(result.user_agent),
        ownerIdentity: normalizeDashboardEventText(result.owner_identity),
        updatedAt: normalizeIsoTimestamp(result.updated_at) || null
      };
    },

    async delete(endpointHash) {
      const normalizedEndpointHash = normalizeDashboardEventText(endpointHash);
      if (!normalizedEndpointHash) {
        return { deleted: false };
      }
      await ensureSchema();
      const result = await d1
        .prepare("DELETE FROM vtdd_dashboard_push_subscriptions WHERE endpoint_hash = ?")
        .bind(normalizedEndpointHash)
        .run();
      return { deleted: Number(result?.meta?.changes || 0) > 0 };
    }
  };

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await d1.exec(
          "CREATE TABLE IF NOT EXISTS vtdd_dashboard_push_subscriptions (endpoint_hash TEXT PRIMARY KEY, endpoint TEXT NOT NULL, expiration_time INTEGER, p256dh TEXT NOT NULL, auth TEXT NOT NULL, user_agent TEXT, owner_identity TEXT NOT NULL, updated_at TEXT NOT NULL, payload_json TEXT NOT NULL);"
        );
        await d1.exec(
          "CREATE INDEX IF NOT EXISTS idx_vtdd_dashboard_push_subscriptions_updated_at ON vtdd_dashboard_push_subscriptions (updated_at DESC);"
        );
      })();
    }
    return schemaPromise;
  }
}

async function dispatchDashboardWebPushForEvent(env, event) {
  const store = resolveDashboardPushSubscriptionStore(env);
  if (!store || typeof store.list !== "function") {
    return {
      ok: false,
      status: 503,
      error: "dashboard_push_subscription_store_unavailable",
      reason: "dashboard push subscription store cannot list subscriptions"
    };
  }
  const subscriptions = await store.list({ limit: 50 });
  if (subscriptions.length === 0) {
    return {
      ok: false,
      status: 404,
      error: "dashboard_push_subscription_not_found",
      reason: "no dashboard push subscriptions are stored"
    };
  }

  const payload = buildDashboardWebPushPayload(event);
  const results = [];
  let cleaned = 0;
  for (const subscription of subscriptions) {
    const result = await sendDashboardWebPush({ env, subscription, payload });
    if (result.stale && result.endpointHash && typeof store.delete === "function") {
      const cleanup = await store.delete(result.endpointHash);
      if (cleanup?.deleted) {
        cleaned += 1;
        result.cleaned = true;
      }
    }
    results.push(result);
  }
  const delivered = results.filter((result) => result.ok).length;
  const firstFailure = results.find((result) => !result.ok);
  return {
    ok: delivered > 0,
    status: delivered > 0 ? 202 : firstFailure?.status || 502,
    error: delivered > 0 ? undefined : firstFailure?.error,
    reason: delivered > 0 ? undefined : firstFailure?.reason,
    delivered,
    cleaned,
    attempted: results.length,
    results: results.map((result) => ({
      ok: result.ok,
      endpointHash: result.endpointHash,
      status: result.status,
      reason: result.reason,
      error: result.error,
      stale: result.stale || undefined,
      cleaned: result.cleaned || undefined
    }))
  };
}

export function buildDashboardWebPushPayload(event) {
  const record = normalizeDashboardEventRecord(event);
  const title = buildDashboardWebPushTitle(record);
  const body = buildDashboardWebPushBody(record);
  return {
    title,
    body: body || "Dashboard Butler の通知です。",
    tag: `vtdd-${record.kind || "dashboard"}-${record.runId || record.id || "event"}`.slice(0, 120),
    url: record.runUrl || "/dashboard/notifications"
  };
}

function buildDashboardWebPushTitle(record) {
  const repository = shortRepositoryName(record.repository);
  if (record.kind === "dashboard_push_test") {
    return "VTDD Butler テスト通知";
  }
  if (record.kind === "vps_runner_execution") {
    return `VPS ${dashboardPushStatusLabel(record)}${repository ? `: ${repository}` : ""}`.slice(0, 80);
  }
  if (record.kind === "github_actions_workflow_run") {
    const isDeploy = normalize(record.workflowName).includes("deploy");
    const label = dashboardPushStatusLabel(record);
    if (isDeploy) {
      return `デプロイ${label}${repository ? `: ${repository}` : ""}`.slice(0, 80);
    }
    const workflow = compactNotificationText(record.workflowName || "workflow", 24);
    return `Actions ${label}: ${workflow}${repository ? ` / ${repository}` : ""}`.slice(0, 80);
  }
  return `VTDD Butler ${dashboardPushStatusLabel(record)}${repository ? `: ${repository}` : ""}`.slice(0, 80);
}

function buildDashboardWebPushBody(record) {
  if (record.kind === "dashboard_push_test") {
    return "通知経路は正常です。iPhone PWA にサーバ送信できました。";
  }

  const details = [];
  const title = compactNotificationText(record.title, 58);
  if (title && title !== record.workflowName) {
    details.push(title);
  }
  if (record.workflowName) {
    details.push(`workflow: ${compactNotificationText(record.workflowName, 36)}`);
  }
  if (record.headBranch) {
    details.push(`branch: ${compactNotificationText(record.headBranch, 34)}`);
  }
  if (record.headSha) {
    details.push(`sha: ${record.headSha.slice(0, 7)}`);
  }
  if (record.runId) {
    details.push(`run: ${compactNotificationText(record.runId, 26)}`);
  }
  return details.join(" / ").slice(0, 180);
}

function dashboardPushStatusLabel(record) {
  const status = normalize(record.status);
  const conclusion = normalize(record.conclusion);
  if (status === "completed") {
    if (conclusion === "success") return "完了";
    if (conclusion === "failure" || conclusion === "timed_out") return "失敗";
    if (conclusion === "cancelled") return "キャンセル";
    if (conclusion === "skipped") return "スキップ";
    if (conclusion === "action_required") return "要対応";
    return "完了";
  }
  if (status === "in_progress" || status === "running") return "実行中";
  if (status === "queued" || status === "requested" || status === "waiting") return "待機中";
  if (status === "failed") return "失敗";
  if (status === "canceled" || status === "cancelled") return "キャンセル";
  return "更新";
}

function shortRepositoryName(repository) {
  const text = normalizeDashboardEventText(repository);
  const parts = text.split("/");
  return parts.length === 2 ? parts[1] : text;
}

function compactNotificationText(value, limit) {
  const text = normalizeDashboardEventText(value).replace(/\s+/g, " ");
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

async function encryptDashboardWebPushPayload({ subscription, payload }) {
  const userPublicBytes = base64UrlToBytes(subscription?.p256dh);
  const authSecretBytes = base64UrlToBytes(subscription?.auth);
  if (userPublicBytes.length !== 65 || userPublicBytes[0] !== 4 || authSecretBytes.length < 16) {
    return {
      ok: false,
      status: 422,
      error: "dashboard_web_push_subscription_keys_invalid",
      reason: "push subscription p256dh/auth keys are required for encrypted Web Push payloads"
    };
  }

  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const userPublicKey = await crypto.subtle.importKey(
    "raw",
    userPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: userPublicKey },
    serverKeyPair.privateKey,
    256
  ));
  const serverPublicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeyPair.publicKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyInfo = concatBytes(
    new TextEncoder().encode("WebPush: info"),
    new Uint8Array([0]),
    userPublicBytes,
    serverPublicBytes
  );
  const prkKey = await hmacSha256(authSecretBytes, sharedSecret);
  const ikm = (await hmacSha256(prkKey, concatBytes(keyInfo, new Uint8Array([1])))).slice(0, 32);
  const prk = await hmacSha256(salt, ikm);
  const contentEncryptionKey = (await hmacSha256(
    prk,
    concatBytes(new TextEncoder().encode("Content-Encoding: aes128gcm"), new Uint8Array([0, 1]))
  )).slice(0, 16);
  const nonce = (await hmacSha256(
    prk,
    concatBytes(new TextEncoder().encode("Content-Encoding: nonce"), new Uint8Array([0, 1]))
  )).slice(0, 12);
  const plaintext = concatBytes(
    new TextEncoder().encode(JSON.stringify(payload)),
    new Uint8Array([2])
  );
  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentEncryptionKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    aesKey,
    plaintext
  ));
  const recordSize = 4096;
  const header = new Uint8Array(21 + serverPublicBytes.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize);
  header[20] = serverPublicBytes.length;
  header.set(serverPublicBytes, 21);
  return {
    ok: true,
    body: concatBytes(header, ciphertext)
  };
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}

function concatBytes(...chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function sendDashboardWebPush({ env, subscription, payload }) {
  const endpoint = normalizeDashboardUrl(subscription?.endpoint);
  const endpointHash = normalizeDashboardEventText(subscription?.endpointHash) || (endpoint ? await sha256Hex(endpoint) : "");
  if (!endpoint) {
    return { ok: false, endpointHash, status: 422, error: "push_endpoint_required", reason: "subscription endpoint is missing" };
  }

  const vapid = await buildDashboardVapidAuthorization({ env, endpoint });
  if (!vapid.ok) {
    return { ...vapid, endpointHash };
  }

  const encryptedPayload = await encryptDashboardWebPushPayload({ subscription, payload });
  if (!encryptedPayload.ok) {
    return { ...encryptedPayload, endpointHash };
  }

  const fetcher = typeof env?.DASHBOARD_WEB_PUSH_FETCH === "function" ? env.DASHBOARD_WEB_PUSH_FETCH : fetch;
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: {
      authorization: vapid.authorization,
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "300",
      urgency: "normal"
    },
    body: encryptedPayload.body
  });
  const stale = response.status === 404 || response.status === 410;
  return {
    ok: response.status >= 200 && response.status < 300,
    endpointHash,
    status: response.status,
    reason: response.status >= 200 && response.status < 300
      ? "accepted"
      : stale
        ? "push subscription is stale and should be deleted"
        : "push service rejected the request",
    stale
  };
}

async function buildDashboardVapidAuthorization({ env, endpoint }) {
  const publicKey = normalizeDashboardEventText(env?.[WEB_PUSH_PUBLIC_KEY_ENV]);
  const privateKey = normalizeDashboardEventText(env?.[WEB_PUSH_PRIVATE_KEY_ENV]);
  const subject = normalizeDashboardEventText(env?.[WEB_PUSH_SUBJECT_ENV]);
  if (!publicKey || !privateKey || !subject) {
    return {
      ok: false,
      status: 503,
      error: "dashboard_web_push_vapid_unconfigured",
      reason: "VTDD_WEB_PUSH_PUBLIC_KEY, VTDD_WEB_PUSH_PRIVATE_KEY, and VTDD_WEB_PUSH_SUBJECT are required"
    };
  }
  const endpointUrl = new URL(endpoint);
  const jwt = await signDashboardVapidJwt({
    audience: endpointUrl.origin,
    subject,
    publicKey,
    privateKey
  });
  if (!jwt.ok) {
    return jwt;
  }
  return {
    ok: true,
    authorization: `vapid t=${jwt.token}, k=${publicKey}`
  };
}

async function signDashboardVapidJwt({ audience, subject, publicKey, privateKey }) {
  const publicBytes = base64UrlToBytes(publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) {
    return {
      ok: false,
      status: 503,
      error: "dashboard_web_push_public_key_invalid",
      reason: "VTDD_WEB_PUSH_PUBLIC_KEY must be an uncompressed P-256 public key encoded as base64url"
    };
  }
  const privateJwk = buildDashboardVapidPrivateJwk({ publicBytes, privateKey });
  if (!privateJwk.ok) {
    return privateJwk;
  }
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    privateJwk.jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const header = base64UrlEncodeJson({ typ: "JWT", alg: "ES256" });
  const body = base64UrlEncodeJson({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject
  });
  const signingInput = `${header}.${body}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  return {
    ok: true,
    token: `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`
  };
}

function buildDashboardVapidPrivateJwk({ publicBytes, privateKey }) {
  if (privateKey.trim().startsWith("{")) {
    try {
      const jwk = JSON.parse(privateKey);
      return { ok: true, jwk: { ...jwk, key_ops: ["sign"], ext: false } };
    } catch {
      return {
        ok: false,
        status: 503,
        error: "dashboard_web_push_private_key_invalid",
        reason: "VTDD_WEB_PUSH_PRIVATE_KEY JWK JSON is invalid"
      };
    }
  }
  const privateBytes = base64UrlToBytes(privateKey);
  if (privateBytes.length !== 32) {
    return {
      ok: false,
      status: 503,
      error: "dashboard_web_push_private_key_invalid",
      reason: "VTDD_WEB_PUSH_PRIVATE_KEY must be a P-256 private scalar encoded as base64url or a JWK JSON string"
    };
  }
  return {
    ok: true,
    jwk: {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncodeBytes(publicBytes.slice(1, 33)),
      y: base64UrlEncodeBytes(publicBytes.slice(33, 65)),
      d: base64UrlEncodeBytes(privateBytes),
      key_ops: ["sign"],
      ext: false
    }
  };
}

function base64UrlEncodeJson(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = normalizeDashboardEventText(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

function matchMediaObjectRoute(pathname) {
  for (const prefix of [CANONICAL_API_PREFIX, LEGACY_API_PREFIX]) {
    const base = `${prefix}/media/`;
    if (!pathname.startsWith(base)) {
      continue;
    }
    const tail = pathname.slice(base.length);
    const parts = tail.split("/").filter(Boolean);
    if (parts.length === 1) {
      const id = normalizeMediaId(parts[0]);
      return id ? { id, download: false } : null;
    }
    if (parts.length === 2 && parts[1] === "download") {
      const id = normalizeMediaId(parts[0]);
      return id ? { id, download: true } : null;
    }
  }
  return null;
}

function isUploadFileLike(value) {
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" && Number(value.size) >= 0;
}

function normalizeMediaId(value) {
  const text = normalizeDashboardEventText(value);
  return /^med_[A-Za-z0-9_-]{8,80}$/.test(text) ? text : "";
}

function normalizeMediaContentType(value) {
  const type = normalize(String(value || "application/octet-stream").split(";")[0]);
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type) ? type : "application/octet-stream";
}

function sanitizeMediaFilename(value) {
  const text = normalizeDashboardEventText(value).split(/[\\/]/).pop() || "attachment";
  const sanitized = text.replace(/[^A-Za-z0-9._ -]+/g, "_").replace(/\s+/g, " ").trim();
  return (sanitized || "attachment").slice(0, 120);
}

function normalizeMediaSourceSurface(value) {
  const text = normalizeDashboardEventText(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  return text.slice(0, 80);
}

function normalizeMediaVisibility(value) {
  const visibility = normalize(value);
  return ["private", "repo_internal", "public_evidence"].includes(visibility) ? visibility : "";
}

function detectMediaContentType({ declaredType, filename, arrayBuffer }) {
  const declared = normalizeMediaContentType(declaredType);
  if (isForbiddenUploadContentType(declared) || isForbiddenUploadFilename(filename)) {
    return {
      ok: false,
      error: "media_content_type_forbidden",
      reason: "HTML, SVG, script, and executable-looking attachments are not accepted in this first slice"
    };
  }
  const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
  const sniffed = sniffContentType(bytes);
  if (sniffed && isForbiddenUploadContentType(sniffed)) {
    return {
      ok: false,
      error: "media_content_type_forbidden",
      reason: "この添付の実体は安全に扱えない content type です"
    };
  }
  if (sniffed && declared !== "application/octet-stream" && declared !== sniffed && !isCompatibleDeclaredMediaType(declared, sniffed)) {
    return {
      ok: false,
      error: "media_content_type_mismatch",
      reason: `declared content type ${declared} does not match detected content type ${sniffed}`
    };
  }
  if (!sniffed && declared.startsWith("image/")) {
    return {
      ok: false,
      error: "media_content_type_mismatch",
      reason: `declared content type ${declared} does not match a supported image signature`
    };
  }
  if (!sniffed && declared.startsWith("video/")) {
    return {
      ok: false,
      error: "media_content_type_mismatch",
      reason: `declared content type ${declared} does not match a supported video signature`
    };
  }
  if (!sniffed && declared.startsWith("audio/")) {
    return {
      ok: false,
      error: "media_content_type_mismatch",
      reason: `declared content type ${declared} does not match a supported audio signature`
    };
  }
  const expectedByFilename = expectedMediaContentTypeFromFilename(filename);
  if (!sniffed && (requiresStrictMediaSignature(declared) || expectedByFilename)) {
    return {
      ok: false,
      error: "media_content_type_mismatch",
      reason: `declared content type ${declared} or filename ${sanitizeMediaFilename(filename)} does not match a supported binary signature`
    };
  }
  if (!sniffed && declared !== "text/plain") {
    return {
      ok: false,
      error: "media_content_type_unsupported",
      reason: `content type ${declared} is not supported in this first slice without a recognized safe signature`
    };
  }
  return {
    ok: true,
    contentType: sniffed || declared || "application/octet-stream"
  };
}

function sniffContentType(bytes) {
  const prefixText = asciiAt(bytes, 0, Math.min(bytes?.length || 0, 64)).trimStart().toLowerCase();
  if (prefixText.startsWith("<!doctype html") || prefixText.startsWith("<html") || prefixText.startsWith("<script")) {
    return "text/html";
  }
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWithAscii(bytes, "GIF87a") || startsWithAscii(bytes, "GIF89a")) return "image/gif";
  if (startsWithAscii(bytes, "RIFF") && asciiAt(bytes, 8, 4) === "WEBP") return "image/webp";
  if (startsWithAscii(bytes, "%PDF-")) return "application/pdf";
  if (startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06])) return "application/zip";
  if (startsWithAscii(bytes, "RIFF") && asciiAt(bytes, 8, 4) === "WAVE") return "audio/wav";
  if (startsWithAscii(bytes, "ID3") || startsWithBytes(bytes, [0xff, 0xfb]) || startsWithBytes(bytes, [0xff, 0xf3])) return "audio/mpeg";
  if (bytes.length >= 12 && asciiAt(bytes, 4, 4) === "ftyp") return "video/mp4";
  return "";
}

function startsWithBytes(bytes, prefix) {
  if (!bytes || bytes.length < prefix.length) {
    return false;
  }
  return prefix.every((byte, index) => bytes[index] === byte);
}

function startsWithAscii(bytes, prefix) {
  return asciiAt(bytes, 0, prefix.length) === prefix;
}

function asciiAt(bytes, offset, length) {
  if (!bytes || bytes.length < offset + length) {
    return "";
  }
  let text = "";
  for (let index = offset; index < offset + length; index += 1) {
    text += String.fromCharCode(bytes[index]);
  }
  return text;
}

function isCompatibleDeclaredMediaType(declared, sniffed) {
  if (declared === sniffed) {
    return true;
  }
  if (declared === "application/x-zip-compressed" && sniffed === "application/zip") {
    return true;
  }
  if (
    sniffed === "application/zip" &&
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ].includes(declared)
  ) {
    return true;
  }
  if ((declared === "audio/mp3" || declared === "audio/x-mpeg") && sniffed === "audio/mpeg") {
    return true;
  }
  if (declared === "audio/x-wav" && sniffed === "audio/wav") {
    return true;
  }
  return false;
}

function requiresStrictMediaSignature(type) {
  const normalized = normalizeMediaContentType(type);
  return [
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ].includes(normalized);
}

function expectedMediaContentTypeFromFilename(filename) {
  const sanitized = sanitizeMediaFilename(filename).toLowerCase();
  if (/\.(png)$/i.test(sanitized)) return "image/png";
  if (/\.(jpe?g)$/i.test(sanitized)) return "image/jpeg";
  if (/\.(gif)$/i.test(sanitized)) return "image/gif";
  if (/\.(webp)$/i.test(sanitized)) return "image/webp";
  if (/\.(pdf)$/i.test(sanitized)) return "application/pdf";
  if (/\.(zip|docx|xlsx|pptx)$/i.test(sanitized)) return "application/zip";
  if (/\.(mp4|m4v)$/i.test(sanitized)) return "video/mp4";
  if (/\.(mp3)$/i.test(sanitized)) return "audio/mpeg";
  if (/\.(wav)$/i.test(sanitized)) return "audio/wav";
  return "";
}

function isForbiddenUploadContentType(type) {
  const normalized = normalizeMediaContentType(type);
  return [
    "image/svg+xml",
    "text/html",
    "application/xhtml+xml",
    "application/javascript",
    "text/javascript",
    "application/x-msdownload",
    "application/x-sh"
  ].includes(normalized);
}

function isForbiddenUploadFilename(filename) {
  return /\.(html?|svg|mjs|cjs|js|jsx|ts|tsx|sh|bash|zsh|exe|dll|dmg|pkg)$/i.test(sanitizeMediaFilename(filename));
}

function buildMediaObjectKey({ repository, createdAt, mediaId, filename }) {
  const repo = normalizeCanonicalRepositoryInput(repository);
  const [owner, name] = repo ? repo.split("/") : ["_dashboard", "unscoped"];
  const date = new Date(createdAt);
  const yyyy = String(date.getUTCFullYear()).padStart(4, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `media/${owner}/${name}/${yyyy}/${mm}/${dd}/${mediaId}/${sanitizeMediaFilename(filename)}`;
}

async function sha256ArrayBufferHex(arrayBuffer) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", arrayBuffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("SHA-256 digest is not available in this runtime");
}

async function cleanupOrphanMediaObject(r2, objectKey) {
  if (!r2 || typeof r2.delete !== "function" || !objectKey) {
    return false;
  }
  try {
    await r2.delete(objectKey);
    return true;
  } catch {
    return false;
  }
}

function normalizeMediaObjectRecord(record) {
  const input = normalizeObject(record);
  const id = normalizeMediaId(input.id || input.mediaId || input.media_id);
  const objectKey = normalizeDashboardEventText(input.objectKey || input.object_key);
  const filename = sanitizeMediaFilename(input.filename);
  const contentType = normalizeMediaContentType(input.contentType || input.content_type);
  const byteSize = Number(input.byteSize || input.byte_size);
  const sha256 = normalizeDashboardEventText(input.sha256).toLowerCase();
  if (!id || !objectKey || !filename || !Number.isFinite(byteSize) || byteSize <= 0 || !sha256) {
    return null;
  }
  const createdAt = normalizeIsoTimestamp(input.createdAt || input.created_at) || new Date().toISOString();
  return {
    id,
    repository: normalizeCanonicalRepositoryInput(input.repository) || null,
    relatedIssue: normalizePositiveInteger(input.relatedIssue || input.related_issue || input.issueNumber),
    relatedPr: normalizePositiveInteger(input.relatedPr || input.related_pr || input.pullRequestNumber),
    sourceSurface: normalizeMediaSourceSurface(input.sourceSurface || input.source_surface) || "dashboard_butler",
    sourceEventId: sanitizeDashboardChatText(input.sourceEventId || input.source_event_id),
    objectKey,
    filename,
    contentType,
    byteSize: Math.floor(byteSize),
    sha256,
    visibility: normalizeMediaVisibility(input.visibility) || "private",
    summary: sanitizeDashboardChatText(input.summary),
    ocrText: sanitizeDashboardChatText(input.ocrText || input.ocr_text),
    createdBy: sanitizeDashboardChatText(input.createdBy || input.created_by),
    createdAt,
    updatedAt: normalizeIsoTimestamp(input.updatedAt || input.updated_at) || createdAt
  };
}

function mediaObjectRecordFromRow(row) {
  return normalizeMediaObjectRecord({
    id: row?.id,
    repository: row?.repository,
    relatedIssue: row?.related_issue,
    relatedPr: row?.related_pr,
    sourceSurface: row?.source_surface,
    sourceEventId: row?.source_event_id,
    objectKey: row?.object_key,
    filename: row?.filename,
    contentType: row?.content_type,
    byteSize: row?.byte_size,
    sha256: row?.sha256,
    visibility: row?.visibility,
    summary: row?.summary,
    ocrText: row?.ocr_text,
    createdBy: row?.created_by,
    createdAt: row?.created_at,
    updatedAt: row?.updated_at
  });
}

function toMediaReference(record) {
  const normalized = normalizeMediaObjectRecord(record);
  if (!normalized) {
    return null;
  }
  return {
    mediaId: normalized.id,
    repository: normalized.repository,
    relatedIssue: normalized.relatedIssue,
    relatedPr: normalized.relatedPr,
    sourceSurface: normalized.sourceSurface,
    filename: normalized.filename,
    contentType: normalized.contentType,
    byteSize: normalized.byteSize,
    sha256: normalized.sha256,
    visibility: normalized.visibility,
    summary: normalized.summary || "",
    ocrText: normalized.ocrText || "",
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    metadataUrl: `/v2/media/${normalized.id}`,
    downloadUrl: `/v2/media/${normalized.id}/download`
  };
}

function normalizeMediaReferences(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list
    .map((item) => {
      const input = normalizeObject(item);
      const mediaId = normalizeMediaId(input.mediaId || input.id || input.media_id);
      if (!mediaId) {
        return null;
      }
      return {
        mediaId,
        repository: normalizeCanonicalRepositoryInput(input.repository) || null,
        relatedIssue: normalizePositiveInteger(input.relatedIssue || input.related_issue || input.issueNumber),
        relatedPr: normalizePositiveInteger(input.relatedPr || input.related_pr || input.pullRequestNumber),
        filename: sanitizeMediaFilename(input.filename || "attachment"),
        contentType: normalizeMediaContentType(input.contentType || input.content_type),
        byteSize: normalizePositiveInteger(input.byteSize || input.byte_size),
        sha256: normalizeDashboardEventText(input.sha256).toLowerCase().slice(0, 64),
        visibility: normalizeMediaVisibility(input.visibility) || "private",
        summary: sanitizeDashboardChatText(input.summary),
        metadataUrl: `/v2/media/${mediaId}`,
        downloadUrl: `/v2/media/${mediaId}/download`
      };
    })
    .filter(Boolean)
    .slice(0, MEDIA_REFERENCE_LIMIT);
}

async function resolveDashboardChatMediaReferences({ env, mediaReferences, repository, relatedIssue }) {
  const requested = normalizeMediaReferences(mediaReferences);
  if (requested.length === 0) {
    return { ok: true, mediaReferences: [] };
  }
  const store = resolveMediaObjectStore(env);
  if (!store || typeof store.get !== "function") {
    return {
      ok: false,
      error: "media_metadata_store_unavailable",
      reason: "media reference validation requires D1 media metadata store"
    };
  }
  const resolvedRepository = normalizeCanonicalRepositoryInput(repository);
  const resolvedIssue = normalizePositiveInteger(relatedIssue);
  const resolved = [];
  for (const reference of requested) {
    const record = await store.get(reference.mediaId);
    if (!record) {
      return {
        ok: false,
        error: "media_reference_not_found",
        reason: `media reference ${reference.mediaId} was not found`
      };
    }
    const media = toMediaReference(record);
    if (!media) {
      return {
        ok: false,
        error: "media_reference_invalid",
        reason: `media reference ${reference.mediaId} is malformed`
      };
    }
    if (resolvedRepository && media.repository !== resolvedRepository) {
      return {
        ok: false,
        error: "media_reference_repository_mismatch",
        reason: `media reference ${reference.mediaId} does not belong to ${resolvedRepository}`
      };
    }
    if (resolvedIssue && media.relatedIssue !== resolvedIssue) {
      return {
        ok: false,
        error: "media_reference_issue_mismatch",
        reason: `media reference ${reference.mediaId} does not belong to Issue #${resolvedIssue}`
      };
    }
    resolved.push(media);
  }
  return { ok: true, mediaReferences: resolved };
}

async function buildDashboardChatTurn(payload, options = {}) {
  const input = normalizeObject(payload);
  const repository = normalizeCanonicalRepositoryInput(input.repository);
  const mediaReferences = normalizeMediaReferences(input.mediaReferences || input.media_references || input.media);
  const text =
    sanitizeDashboardChatText(input.text || input.message || input.body) ||
    (mediaReferences.length > 0 ? "添付を追加しました。" : "");
  if (!text) {
    return {
      ok: false,
      error: "message_required",
      reason: "message text is required"
    };
  }

  const threadId =
    normalizeDashboardThreadId(input.threadId || input.thread_id) ||
    (repository ? `dashboard-main-${repository.replace("/", "-")}` : "dashboard-main-unresolved");
  const relatedIssue = normalizePositiveInteger(input.relatedIssue || input.issueNumber);
  const mediaValidation = await resolveDashboardChatMediaReferences({
    env: options.env,
    mediaReferences: input.mediaReferences || input.media_references || input.media,
    repository,
    relatedIssue
  });
  if (!mediaValidation.ok) {
    return mediaValidation;
  }
  const now = new Date().toISOString();
  const ownerMessage = normalizeDashboardChatMessage(
    {
      threadId,
      role: "owner",
      repository,
        relatedIssue,
        status: "sent",
        text,
        mediaReferences: mediaValidation.mediaReferences,
        createdAt: now
      },
      { threadId }
  );
  const butlerMessage = normalizeDashboardChatMessage(
    {
      threadId,
      role: "butler",
      repository,
      relatedIssue,
      status: "blocked",
      text: buildDashboardAppServerNotConnectedReply({ repository, relatedIssue }),
      createdAt: new Date(Date.parse(now) + 1).toISOString()
    },
    { threadId }
  );

  return {
    ok: true,
    repository,
    relatedIssue,
    threadId,
    messages: [ownerMessage, butlerMessage].filter(Boolean)
  };
}

function buildDashboardAppServerNotConnectedReply({ repository, relatedIssue } = {}) {
  const repoPhrase = repository ? `対象 repo: ${repository}` : "対象 repo: 未指定";
  const issuePhrase = relatedIssue ? `関連 Issue: #${relatedIssue}` : "関連 Issue: 未指定";
  return [
    "Dashboard Butler の旧 `codex exec` 経路は削除済みです。",
    "",
    "この画面から開発実行・通常会話を続けるには、別経路の `codex app-server` ブリッジ実装が必要です。未接続の状態で VPS Codex CLI に送ったふりはしません。",
    "",
    `- ${repoPhrase}`,
    `- ${issuePhrase}`,
    "",
    "現時点の実行 fallback は Custom GPT Butler です。Dashboard Butler は app-server 接続 PR が入るまで未完成として扱います。"
  ].join("\n");
}

function normalizeDashboardChatMessage(message, defaults = {}) {
  const input = normalizeObject(message);
  const threadId = normalizeDashboardThreadId(input.threadId || input.thread_id || defaults.threadId);
  if (!threadId) {
    return null;
  }
  const role = normalizeDashboardChatRole(input.role);
  const createdAt = normalizeIsoTimestamp(input.createdAt || input.created_at) || new Date().toISOString();
  return {
    threadId,
    messageId: normalizeDashboardEventText(input.messageId || input.message_id) || crypto.randomUUID(),
    role,
    repository: normalizeCanonicalRepositoryInput(input.repository) || null,
    relatedIssue: normalizePositiveInteger(input.relatedIssue || input.issueNumber || input.related_issue),
    status: normalizeDashboardChatStatus(input.status),
    text: sanitizeDashboardChatText(input.text || input.message || input.body) || "（空のメッセージ）",
    mediaReferences: normalizeMediaReferences(input.mediaReferences || input.media_references || input.media),
    createdAt
  };
}

async function normalizeDashboardPushSubscription(value) {
  const input = normalizeObject(value);
  const endpoint = normalizeDashboardUrl(input.endpoint);
  const keys = normalizeObject(input.keys);
  const p256dh = normalizeDashboardEventText(keys.p256dh);
  const auth = normalizeDashboardEventText(keys.auth);
  if (!endpoint) {
    return {
      ok: false,
      reason: "push subscription endpoint is required"
    };
  }
  if (!p256dh || !auth) {
    return {
      ok: false,
      reason: "push subscription keys.p256dh and keys.auth are required"
    };
  }
  const endpointHash = await sha256Hex(endpoint);
  return {
    ok: true,
    record: {
      endpointHash,
      endpoint,
      expirationTime: Number.isFinite(Number(input.expirationTime)) ? Number(input.expirationTime) : null,
      p256dh,
      auth
    }
  };
}

async function sha256Hex(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }
  if (globalThis.crypto?.subtle && typeof TextEncoder !== "undefined") {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return btoa(text).replace(/[^A-Za-z0-9]/g, "").slice(0, 64);
}

function normalizeDashboardThreadSummary(summary, defaults = {}) {
  const input = normalizeObject(summary);
  const threadId = normalizeDashboardThreadId(input.threadId || input.thread_id || defaults.threadId);
  if (!threadId) {
    return null;
  }
  const summaryText = sanitizeDashboardChatText(input.summary || input.text || input.body);
  if (!summaryText) {
    return null;
  }
  const decisions = normalizeStringList(input.decisions || input.decisionLog || input.decision_log);
  const openItems = normalizeStringList(input.openItems || input.open_items || input.todo || input.todos);
  return {
    threadId,
    repository: normalizeCanonicalRepositoryInput(input.repository || defaults.repository) || null,
    relatedIssue: normalizePositiveInteger(
      input.relatedIssue || input.issueNumber || input.related_issue || defaults.relatedIssue
    ),
    summary: summaryText,
    decisions,
    openItems,
    archivedUntilMessageId:
      normalizeDashboardEventText(
        input.archivedUntilMessageId || input.archived_until_message_id || defaults.archivedUntilMessageId
      ) || null,
    updatedAt:
      normalizeIsoTimestamp(input.updatedAt || input.updated_at || defaults.updatedAt) || new Date().toISOString()
  };
}

function normalizeStringList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list
    .map((item) => sanitizeDashboardChatText(item))
    .filter(Boolean)
    .slice(0, 40);
}

function normalizeDashboardChatRole(value) {
  const role = normalizeDashboardEventText(value).toLowerCase();
  return ["owner", "butler", "runner", "system"].includes(role) ? role : "system";
}

function normalizeDashboardChatStatus(value) {
  const status = normalizeDashboardEventText(value).toLowerCase();
  return ["sent", "thinking", "replied", "blocked", "failed"].includes(status) ? status : "sent";
}

function normalizeDashboardThreadId(value) {
  const text = normalizeDashboardEventText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_.:/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return text.slice(0, 160);
}

function sanitizeDashboardChatText(value) {
  const text = normalizeText(value)
    .replace(/approval:[0-9a-f-]{20,}/gi, "[redacted-approval]")
    .replace(/\bgh[psuor]_[A-Za-z0-9_]{20,}\b/g, "[redacted-token]")
    .replace(/\bsk-proj-[A-Za-z0-9_-]{20,}\b/g, "[redacted-openai-key]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [redacted]")
    .replace(/\b(CLOUDFLARE_API_TOKEN|OPENAI_API_KEY|GITHUB_TOKEN)=\S+/gi, "$1=[redacted]")
    .replace(/([?&](?:token|approvalGrantId|approval_grant_id|key|secret)=)[^&\s]+/gi, "$1[redacted]");
  return text.slice(0, 4000);
}

function isDashboardChatThreadApiPath(pathname) {
  return (
    pathname.startsWith(`${CANONICAL_API_PREFIX}/dashboard/chat/`) ||
    pathname.startsWith(`${LEGACY_API_PREFIX}/dashboard/chat/`)
  ) && !pathname.endsWith("/summary");
}

function isDashboardChatSocketApiPath(pathname) {
  return (
    pathname.startsWith(`${CANONICAL_API_PREFIX}/dashboard/chat/`) ||
    pathname.startsWith(`${LEGACY_API_PREFIX}/dashboard/chat/`)
  ) && pathname.endsWith("/ws");
}

function isDashboardAppServerBridgeSocketPath(pathname) {
  return pathname === `${CANONICAL_API_PREFIX}/dashboard/app-server/ws` || pathname === `${LEGACY_API_PREFIX}/dashboard/app-server/ws`;
}

function extractDashboardBridgeBearerProtocol(value) {
  const protocols = normalizeText(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const encoded = protocols.find((item) => item.startsWith("vtdd-bearer."))?.slice("vtdd-bearer.".length);
  if (!encoded) {
    return "";
  }
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
    return normalizeText(atob(padded));
  } catch {
    return "";
  }
}

function isDashboardPagePath(pathname) {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/orchestrator" ||
    pathname.startsWith("/orchestrator/")
  );
}

function extractDashboardChatThreadId(pathname) {
  const prefix = pathname.startsWith(`${CANONICAL_API_PREFIX}/dashboard/chat/`)
    ? `${CANONICAL_API_PREFIX}/dashboard/chat/`
    : pathname.startsWith(`${LEGACY_API_PREFIX}/dashboard/chat/`)
      ? `${LEGACY_API_PREFIX}/dashboard/chat/`
      : "";
  if (!prefix) {
    return "";
  }
  try {
    return normalizeDashboardThreadId(decodeURIComponent(pathname.slice(prefix.length)));
  } catch {
    return normalizeDashboardThreadId(pathname.slice(prefix.length));
  }
}

function extractDashboardChatSocketThreadId(pathname) {
  return extractDashboardChatThreadId(pathname.replace(/\/ws$/, ""));
}

function isDashboardChatSummaryApiPath(pathname) {
  return (
    pathname.startsWith(`${CANONICAL_API_PREFIX}/dashboard/chat/`) ||
    pathname.startsWith(`${LEGACY_API_PREFIX}/dashboard/chat/`)
  ) && pathname.endsWith("/summary");
}

function extractDashboardChatSummaryThreadId(pathname) {
  return extractDashboardChatThreadId(pathname.replace(/\/summary$/, ""));
}

function normalizeDashboardEventRecord(event) {
  const input = normalizeObject(event);
  const updatedAt = normalizeIsoTimestamp(input.updatedAt) || new Date().toISOString();
  const createdAt = normalizeIsoTimestamp(input.createdAt) || updatedAt;
  return {
    id: normalizeDashboardEventText(input.id),
    kind: normalizeDashboardEventText(input.kind),
    repository: normalizeCanonicalRepositoryInput(input.repository),
    workflowName: normalizeDashboardEventText(input.workflowName),
    runId: normalizeDashboardEventText(input.runId),
    status: normalizeDashboardEventText(input.status),
    conclusion: normalizeDashboardEventText(input.conclusion) || null,
    headSha: normalizeDashboardEventText(input.headSha) || null,
    headBranch: normalizeDashboardEventText(input.headBranch) || null,
    runUrl: normalizeDashboardEventText(input.runUrl) || null,
    title: normalizeDashboardEventText(input.title) || normalizeDashboardEventText(input.workflowName),
    createdAt,
    updatedAt
  };
}

function normalizeDashboardEventText(value) {
  return String(value ?? "").trim();
}

function createD1MemoryIndexAdapter(d1) {
  if (!d1 || typeof d1.prepare !== "function") {
    return null;
  }
  if (d1AdapterCache.has(d1)) {
    return d1AdapterCache.get(d1);
  }

  let schemaPromise = null;
  const adapter = {
    async insertRecord(record) {
      await ensureSchema();
      await d1
        .prepare(
          `INSERT OR REPLACE INTO vtdd_memory_records (
             id, type, content_json, content_ref, metadata_json, priority, tags_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          record.id,
          record.type,
          record.content === null || record.content === undefined ? null : JSON.stringify(record.content),
          normalizeText(record.contentRef) || null,
          JSON.stringify(record.metadata ?? {}),
          Number(record.priority ?? 50),
          JSON.stringify(record.tags ?? []),
          record.createdAt
        )
        .run();
    },

    async queryRecords(filter = {}) {
      await ensureSchema();

      const ids = Array.isArray(filter.ids)
        ? filter.ids.map((item) => normalizeText(item)).filter(Boolean)
        : [];
      const type = normalizeText(filter.type);
      const limit = normalizeMemoryLimit(filter.limit);
      const statement = buildMemorySelectStatement({ ids, type });
      const result = await d1.prepare(statement.sql).bind(...statement.params).all();
      const rows = Array.isArray(result?.results) ? result.results : [];
      let records = rows.map(mapStoredMemoryRecord).filter(Boolean);

      if (Array.isArray(filter.tags) && filter.tags.length > 0) {
        const requiredTags = filter.tags.map((tag) => normalizeText(tag).toLowerCase()).filter(Boolean);
        records = records.filter((record) =>
          requiredTags.every((tag) =>
            Array.isArray(record.tags) &&
            record.tags.some((recordTag) => normalizeText(recordTag).toLowerCase() === tag)
          )
        );
      }

      const queryText = normalizeText(filter.text).toLowerCase();
      if (queryText) {
        records = records.filter((record) => JSON.stringify(record).toLowerCase().includes(queryText));
      }

      records.sort((left, right) => {
        return right.priority - left.priority || String(right.createdAt).localeCompare(String(left.createdAt));
      });

      if (ids.length > 0) {
        const order = new Map(ids.map((id, index) => [id, index]));
        records.sort((left, right) => {
          const leftIndex = order.has(left.id) ? order.get(left.id) : Number.MAX_SAFE_INTEGER;
          const rightIndex = order.has(right.id) ? order.get(right.id) : Number.MAX_SAFE_INTEGER;
          return leftIndex - rightIndex;
        });
      }

      return records.slice(0, limit);
    },

    async deleteRecords(input = {}) {
      await ensureSchema();

      const ids = Array.isArray(input?.ids)
        ? input.ids.map((item) => normalizeText(item)).filter(Boolean)
        : [];
      if (ids.length === 0) {
        return { ok: true, deletedCount: 0 };
      }

      const placeholders = ids.map(() => "?").join(", ");
      await d1
        .prepare(`DELETE FROM vtdd_memory_records WHERE id IN (${placeholders})`)
        .bind(...ids)
        .run();

      return { ok: true, deletedCount: ids.length };
    }
  };

  d1AdapterCache.set(d1, adapter);
  return adapter;

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await d1.exec(
          "CREATE TABLE IF NOT EXISTS vtdd_memory_records (id TEXT PRIMARY KEY, type TEXT NOT NULL, content_json TEXT, content_ref TEXT, metadata_json TEXT NOT NULL, priority INTEGER NOT NULL, tags_json TEXT NOT NULL, created_at TEXT NOT NULL);"
        );
        await d1.exec(
          "CREATE INDEX IF NOT EXISTS idx_vtdd_memory_records_type_priority_created_at ON vtdd_memory_records (type, priority DESC, created_at DESC);"
        );
      })();
    }
    return schemaPromise;
  }
}

function createR2TextAdapter(bucket) {
  if (!bucket || typeof bucket.put !== "function" || typeof bucket.get !== "function") {
    return null;
  }

  return {
    async put(key, value) {
      await bucket.put(key, value);
    },
    async get(key) {
      const object = await bucket.get(key);
      if (!object) {
        return null;
      }
      if (typeof object === "string") {
        return object;
      }
      if (typeof object.text === "function") {
        return object.text();
      }
      return null;
    }
  };
}

function buildMemorySelectStatement({ ids, type }) {
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(", ");
    if (type) {
      return {
        sql: `SELECT * FROM vtdd_memory_records WHERE id IN (${placeholders}) AND type = ?`,
        params: [...ids, type]
      };
    }
    return {
      sql: `SELECT * FROM vtdd_memory_records WHERE id IN (${placeholders})`,
      params: ids
    };
  }
  if (type) {
    return {
      sql: "SELECT * FROM vtdd_memory_records WHERE type = ? ORDER BY priority DESC, created_at DESC LIMIT ?",
      params: [type, MAX_MEMORY_LIMIT]
    };
  }
  return {
    sql: "SELECT * FROM vtdd_memory_records ORDER BY priority DESC, created_at DESC LIMIT ?",
    params: [MAX_MEMORY_LIMIT]
  };
}

function mapStoredMemoryRecord(row) {
  if (!row || typeof row !== "object") {
    return null;
  }
  return {
    id: normalizeText(row.id),
    type: normalizeText(row.type),
    content: row.content_json ? safeParseJson(row.content_json) : null,
    contentRef: normalizeText(row.content_ref) || undefined,
    metadata: safeParseJson(row.metadata_json, {}),
    priority: Number(row.priority ?? 50),
    tags: safeParseJson(row.tags_json, []),
    createdAt: normalizeText(row.created_at)
  };
}

function resolveMemoryBlobThreshold(env) {
  const numeric = Number(env?.[MEMORY_BLOB_THRESHOLD_ENV] ?? 1024);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 1024;
  }
  return Math.floor(numeric);
}

function normalizeMemoryLimit(value) {
  const numeric = Number(value ?? DEFAULT_MEMORY_LIMIT);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_MEMORY_LIMIT;
  }
  return Math.min(Math.floor(numeric), MAX_MEMORY_LIMIT);
}

function safeParseJson(value, fallback = null) {
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function attachGatewayWarning(gatewayOutcome, warning) {
  const body = normalizeObject(gatewayOutcome?.body);
  const warnings = Array.isArray(body.warnings) ? body.warnings : [];
  const merged = [...new Set([...warnings, normalizeText(warning)].filter(Boolean))];
  return {
    status: gatewayOutcome.status,
    body: {
      ...body,
      warnings: merged
    }
  };
}

function buildGuardedAbsenceExecutionLogId({ actionType, timestamp }) {
  const actionPart = normalizeTag(actionType || "unknown");
  const timestampPart = normalizeTag(
    String(timestamp || "")
      .replaceAll(":", "")
      .replaceAll("-", "")
      .replaceAll(".", "")
  );
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `guarded_absence_${actionPart}_${timestampPart}_${randomPart}`;
}

function classifyGuardedStopCategory(blockedByRule) {
  const rule = normalize(blockedByRule);
  if (!rule) {
    return "allowed_or_not_blocked";
  }
  if (rule.includes("guarded_absence")) {
    return "guarded_absence_boundary";
  }
  if (rule.includes("approval")) {
    return "approval_boundary";
  }
  if (rule.includes("consent")) {
    return "consent_boundary";
  }
  if (rule.includes("traceability")) {
    return "traceability_boundary";
  }
  if (rule.includes("runtime_truth") || rule.includes("reconcile")) {
    return "runtime_truth_boundary";
  }
  if (rule.includes("target") || rule.includes("repository")) {
    return "target_resolution_boundary";
  }
  return "other_boundary";
}

function authorizeGatewayRequest({ request, env, apiSuffix = "/gateway" }) {
  const runtimeEnv = env ?? {};
  const routeLabel = `/${CANONICAL_API_PREFIX.replace(/^\//, "")}${apiSuffix} (legacy ${LEGACY_API_PREFIX}${apiSuffix} is also accepted)`;

  const bearerToken = normalizeText(
    runtimeEnv.VTDD_GATEWAY_BEARER_TOKEN ?? runtimeEnv.MVP_GATEWAY_BEARER_TOKEN
  );
  if (bearerToken) {
    const authorizationHeader = normalizeText(request.headers.get("authorization"));
    const provided = parseBearerToken(request.headers.get("authorization"));
    if (!authorizationHeader) {
      return {
        ok: false,
        status: 401,
        reason: `machine auth credential is required for ${routeLabel}`
      };
    }
    if (!provided) {
      return {
        ok: false,
        status: 403,
        reason: `authorization header must use bearer token for ${routeLabel}`
      };
    }
    if (provided === bearerToken) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 403,
      reason: `provided bearer token is invalid for ${routeLabel}`
    };
  }

  const accessClientId = normalizeText(runtimeEnv.CF_ACCESS_CLIENT_ID);
  const accessClientSecret = normalizeText(runtimeEnv.CF_ACCESS_CLIENT_SECRET);
  if (accessClientId || accessClientSecret) {
    const providedId = normalizeText(request.headers.get("cf-access-client-id"));
    const providedSecret = normalizeText(request.headers.get("cf-access-client-secret"));
    if (!providedId && !providedSecret) {
      return {
        ok: false,
        status: 401,
        reason: `Cloudflare Access service token headers are required for ${routeLabel}`
      };
    }
    if (!accessClientId || !accessClientSecret) {
      return {
        ok: false,
        status: 403,
        reason:
          "Cloudflare Access service token configuration is incomplete on runtime (both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are required)"
      };
    }
    if (
      accessClientId &&
      accessClientSecret &&
      providedId === accessClientId &&
      providedSecret === accessClientSecret
    ) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 403,
      reason: `provided Cloudflare Access service token headers are invalid for ${routeLabel}`
    };
  }

  return {
    ok: false,
    status: 503,
    reason: `machine auth runtime is not configured for ${routeLabel}`
  };
}

async function authorizeDashboardRequest({ request, env, apiSuffix = "/dashboard" }) {
  const machineAuth = authorizeGatewayRequest({ request, env, apiSuffix });
  if (machineAuth.ok) {
    return { ok: true, authType: "machine" };
  }

  const runtimeEnv = env ?? {};
  const passkeyAuth = await authorizeDashboardPasskeySession({ request, env: runtimeEnv });
  if (passkeyAuth.ok) {
    return passkeyAuth;
  }
  if (passkeyAuth.blocking) {
    return passkeyAuth;
  }

  const routeLabel = `dashboard surface ${apiSuffix}`;
  const allowedEmails = parseAuthList(
    runtimeEnv.VTDD_DASHBOARD_ALLOWED_EMAILS ?? runtimeEnv.CF_ACCESS_ALLOWED_EMAILS
  );
  const allowedLogins = parseAuthList(
    runtimeEnv.VTDD_DASHBOARD_ALLOWED_GITHUB_LOGINS ?? runtimeEnv.CF_ACCESS_ALLOWED_GITHUB_LOGINS
  );
  const accessEmail = normalize(request.headers.get("cf-access-authenticated-user-email"));
  const accessLogin = normalize(
    request.headers.get("cf-access-authenticated-user-login") ||
      request.headers.get("x-github-login") ||
      request.headers.get("x-github-username")
  );
  const accessJwt = normalizeText(request.headers.get("cf-access-jwt-assertion"));

  if (!accessEmail && !accessLogin) {
    return {
      ok: false,
      status: 401,
      reason: `Cloudflare Access authenticated owner identity is required for ${routeLabel}`
    };
  }
  if (allowedEmails.length === 0 && allowedLogins.length === 0) {
    return {
      ok: false,
      status: 503,
      reason:
        "dashboard owner allowlist is not configured (set VTDD_DASHBOARD_ALLOWED_EMAILS or VTDD_DASHBOARD_ALLOWED_GITHUB_LOGINS)"
    };
  }
  if (!accessJwt) {
    return {
      ok: false,
      status: 401,
      reason: `Cloudflare Access JWT assertion is required for ${routeLabel}`
    };
  }
  const jwtVerification = await verifyCloudflareAccessJwt({ token: accessJwt, env: runtimeEnv });
  if (!jwtVerification.ok) {
    return {
      ok: false,
      status: jwtVerification.status ?? 403,
      reason: jwtVerification.reason
    };
  }
  const jwtIdentity = extractCloudflareAccessJwtIdentity(jwtVerification.payload);
  if (accessEmail && !jwtIdentity.email) {
    return {
      ok: false,
      status: 403,
      reason: "Cloudflare Access email header is present but the verified JWT has no email claim"
    };
  }
  if (accessEmail && accessEmail !== jwtIdentity.email) {
    return {
      ok: false,
      status: 403,
      reason: "Cloudflare Access email header does not match the verified JWT identity"
    };
  }
  if (accessLogin && !jwtIdentity.login) {
    return {
      ok: false,
      status: 403,
      reason: "Cloudflare Access login header is present but the verified JWT has no login claim"
    };
  }
  if (accessLogin && accessLogin !== jwtIdentity.login) {
    return {
      ok: false,
      status: 403,
      reason: "Cloudflare Access login header does not match the verified JWT identity"
    };
  }
  if (
    (jwtIdentity.email && allowedEmails.includes(jwtIdentity.email)) ||
    (jwtIdentity.login && allowedLogins.includes(jwtIdentity.login))
  ) {
    return {
      ok: true,
      authType: "cloudflare_access",
      subject: jwtIdentity.login || jwtIdentity.email
    };
  }
  return {
    ok: false,
    status: 403,
    reason: `Cloudflare Access identity is not allowed for ${routeLabel}`
  };
}

async function authorizeDashboardPasskeySession({ request, env }) {
  const approvalId = parseCookieHeader(request.headers.get("cookie"))[DASHBOARD_PASSKEY_SESSION_COOKIE];
  if (!approvalId) {
    return { ok: false, blocking: false };
  }

  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return {
      ok: false,
      blocking: true,
      status: 503,
      reason: "dashboard passkey session cannot be verified because memory provider is unavailable"
    };
  }

  const record = await findApprovalRecordById(provider, approvalId);
  if (!record || normalizeText(record?.content?.kind) !== "passkey_grant") {
    return {
      ok: false,
      blocking: true,
      status: 401,
      reason: "dashboard passkey session was not found; open the dashboard passkey sign-in link again"
    };
  }
  if (isExpiredPasskeyEphemeralRecord(record)) {
    return {
      ok: false,
      blocking: true,
      status: 401,
      reason: "dashboard passkey session expired; open the dashboard passkey sign-in link again"
    };
  }
  if (!isDashboardPasskeyScope(record?.content?.scope)) {
    return {
      ok: false,
      blocking: true,
      status: 403,
      reason: "passkey grant scope is not valid for dashboard access"
    };
  }
  return {
    ok: true,
    authType: "passkey_dashboard_session",
    subject: normalizeText(record?.content?.credentialId) || "passkey"
  };
}

function isDashboardPasskeyScope(scope = {}) {
  return normalizeText(scope?.actionType) === "read" && normalizeText(scope?.highRiskKind) === "dashboard_access";
}

function buildDashboardPasskeySessionCookie(approvalGrant = {}) {
  const approvalId = normalizeText(approvalGrant.approvalId);
  return [
    `${DASHBOARD_PASSKEY_SESSION_COOKIE}=${encodeURIComponent(approvalId)}`,
    "Path=/",
    `Max-Age=${DASHBOARD_PASSKEY_SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}

function parseCookieHeader(value) {
  const cookies = {};
  for (const part of normalizeText(value).split(";")) {
    const [rawName, ...rawValueParts] = part.split("=");
    const name = normalizeText(rawName);
    if (!name) {
      continue;
    }
    cookies[name] = decodeURIComponent(rawValueParts.join("=") || "");
  }
  return cookies;
}

function extractCloudflareAccessJwtIdentity(payload) {
  const custom = payload?.custom && typeof payload.custom === "object" ? payload.custom : {};
  return {
    email: normalize(payload?.email || payload?.identity?.email || custom.email),
    login: normalize(
      payload?.github_login ||
        payload?.login ||
        payload?.username ||
        payload?.identity?.github_login ||
        payload?.identity?.login ||
        payload?.identity?.username ||
        custom.github_login ||
        custom.login ||
        custom.username
    )
  };
}

function parseAuthList(value) {
  return normalizeText(value)
    .split(/[\s,]+/)
    .map((item) => normalize(item))
    .filter(Boolean);
}

async function verifyCloudflareAccessJwt({ token, env }) {
  if (typeof env?.CF_ACCESS_JWT_VERIFIER === "function") {
    return env.CF_ACCESS_JWT_VERIFIER(token);
  }

  const teamDomain = normalizeCloudflareAccessTeamDomain(env?.CF_ACCESS_TEAM_DOMAIN);
  const expectedAudience = normalizeText(env?.CF_ACCESS_AUD);
  if (!teamDomain || !expectedAudience) {
    return {
      ok: false,
      status: 503,
      reason: "Cloudflare Access JWT validation is not configured (set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD)"
    };
  }

  const parsed = parseJwt(token);
  if (!parsed.ok) {
    return parsed;
  }
  if (normalizeText(parsed.header.alg) !== "RS256") {
    return {
      ok: false,
      status: 403,
      reason: "Cloudflare Access JWT must use RS256"
    };
  }
  if (normalizeText(parsed.payload.iss).replace(/\/$/, "") !== `https://${teamDomain}`) {
    return {
      ok: false,
      status: 403,
      reason: "Cloudflare Access JWT issuer does not match configured team domain"
    };
  }
  const aud = Array.isArray(parsed.payload.aud) ? parsed.payload.aud : [parsed.payload.aud];
  if (!aud.map((item) => normalizeText(item)).includes(expectedAudience)) {
    return {
      ok: false,
      status: 403,
      reason: "Cloudflare Access JWT audience does not match configured application audience"
    };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(parsed.payload.exp)) {
    return {
      ok: false,
      status: 403,
      reason: "Cloudflare Access JWT expiration claim is required"
    };
  }
  if (parsed.payload.exp <= nowSeconds) {
    return {
      ok: false,
      status: 403,
      reason: "Cloudflare Access JWT is expired"
    };
  }
  if (parsed.payload.nbf !== undefined && !Number.isFinite(parsed.payload.nbf)) {
    return {
      ok: false,
      status: 403,
      reason: "Cloudflare Access JWT not-before claim must be numeric"
    };
  }
  if (Number.isFinite(parsed.payload.nbf) && parsed.payload.nbf > nowSeconds) {
    return {
      ok: false,
      status: 403,
      reason: "Cloudflare Access JWT is not valid yet"
    };
  }

  const jwks = await fetchCloudflareAccessJwks({ teamDomain, env });
  if (!jwks.ok) {
    return jwks;
  }
  const jwk = (jwks.keys || []).find((candidate) => normalizeText(candidate.kid) === normalizeText(parsed.header.kid));
  if (!jwk) {
    return {
      ok: false,
      status: 403,
      reason: "Cloudflare Access JWT key id is not trusted"
    };
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    parsed.signature,
    new TextEncoder().encode(parsed.signingInput)
  );
  if (!verified) {
    return {
      ok: false,
      status: 403,
      reason: "Cloudflare Access JWT signature is invalid"
    };
  }

  return { ok: true, payload: parsed.payload };
}

function normalizeCloudflareAccessTeamDomain(value) {
  const text = normalizeText(value).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return text || "";
}

async function fetchCloudflareAccessJwks({ teamDomain, env }) {
  const fetcher = env?.CF_ACCESS_JWKS_FETCH ?? fetch;
  const jwksUrl = normalizeText(env?.CF_ACCESS_JWKS_URL) || `https://${teamDomain}/cdn-cgi/access/certs`;
  const now = Date.now();
  const cached = cloudflareAccessJwksCache.get(jwksUrl);
  if (cached && cached.expiresAt > now) {
    return {
      ok: true,
      keys: cached.keys
    };
  }
  try {
    const response = await fetcher(jwksUrl);
    if (!response.ok) {
      return {
        ok: false,
        status: 503,
        reason: `Cloudflare Access JWKS fetch failed with HTTP ${response.status}`
      };
    }
    const body = await response.json();
    const keys = Array.isArray(body.keys) ? body.keys : [];
    cloudflareAccessJwksCache.set(jwksUrl, {
      keys,
      expiresAt: now + CLOUDFLARE_ACCESS_JWKS_CACHE_TTL_MS
    });
    return {
      ok: true,
      keys
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      reason: `Cloudflare Access JWKS fetch failed: ${sanitizeErrorMessage(error)}`
    };
  }
}

function parseJwt(token) {
  const parts = normalizeText(token).split(".");
  if (parts.length !== 3) {
    return {
      ok: false,
      status: 403,
      reason: "Cloudflare Access JWT is malformed"
    };
  }
  try {
    return {
      ok: true,
      header: JSON.parse(base64UrlDecodeText(parts[0])),
      payload: JSON.parse(base64UrlDecodeText(parts[1])),
      signature: base64UrlDecodeBytes(parts[2]),
      signingInput: `${parts[0]}.${parts[1]}`
    };
  } catch (error) {
    return {
      ok: false,
      status: 403,
      reason: `Cloudflare Access JWT could not be decoded: ${sanitizeErrorMessage(error)}`
    };
  }
}

function base64UrlDecodeText(value) {
  return new TextDecoder().decode(base64UrlDecodeBytes(value));
}

function base64UrlDecodeBytes(value) {
  const normalized = normalizeText(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  if (typeof atob === "function") {
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(padded, "base64"));
}

function sanitizeErrorMessage(error) {
  return normalizeText(error?.message || error).replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
}

async function authorizePasskeyRegistrationRequest({ request, env, apiSuffix }) {
  const machineAuth = authorizeGatewayRequest({ request, env, apiSuffix });
  if (machineAuth.ok) {
    return machineAuth;
  }

  const browserAuth = authorizePasskeyBrowserOrMachineRequest({ request, env, apiSuffix });
  if (!browserAuth.ok) {
    return browserAuth;
  }

  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return {
      ok: false,
      status: 503,
      reason: "valid memory provider is required before browser passkey registration can be authorized"
    };
  }

  const passkeys = await retrieveRegisteredPasskeys(provider);
  if (passkeys.length > 0) {
    return {
      ok: false,
      status: 403,
      reason: "browser passkey registration is blocked after the first passkey is registered"
    };
  }

  const bootstrapTokenAuth = authorizePasskeyBootstrapTokenRequest({ request, env });
  if (bootstrapTokenAuth.ok) {
    return browserAuth;
  }

  return {
    ok: false,
    status: bootstrapTokenAuth.status,
    reason: bootstrapTokenAuth.reason
  };
}

function authorizePasskeyBrowserOrMachineRequest({ request, env, apiSuffix }) {
  const machineAuth = authorizeGatewayRequest({ request, env, apiSuffix });
  if (machineAuth.ok) {
    return machineAuth;
  }
  if (isSameOriginBrowserRequest(request)) {
    return { ok: true };
  }
  return machineAuth;
}

function authorizePasskeyBootstrapTokenRequest({ request, env }) {
  const expectedToken = normalizeText(env?.VTDD_PASSKEY_BOOTSTRAP_TOKEN);
  if (!expectedToken) {
    return {
      ok: false,
      status: 403,
      reason: "browser passkey bootstrap token is not configured; use machine auth or configure VTDD_PASSKEY_BOOTSTRAP_TOKEN before first registration"
    };
  }

  const providedToken =
    normalizeText(request.headers.get("x-vtdd-passkey-bootstrap-token")) ||
    normalizeText(request.headers.get("x-passkey-bootstrap-token"));
  if (!providedToken) {
    return {
      ok: false,
      status: 401,
      reason: "browser passkey bootstrap token is required before first passkey registration"
    };
  }
  if (providedToken !== expectedToken) {
    return {
      ok: false,
      status: 403,
      reason: "browser passkey bootstrap token is invalid"
    };
  }
  return { ok: true };
}

function isSameOriginBrowserRequest(request) {
  const originHeader = normalizeText(request.headers.get("origin"));
  const fetchSite = normalize(request.headers.get("sec-fetch-site"));
  const contentType = normalize(request.headers.get("content-type"));
  if (!originHeader) {
    return false;
  }

  const requestUrl = new URL(request.url);
  const requestOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
  if (originHeader !== requestOrigin) {
    return false;
  }
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    return false;
  }
  if (request.method === "POST" && !contentType.includes("application/json")) {
    return false;
  }
  return true;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeLimit(value, fallback) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(numeric), 200);
}

function normalizeIssue(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function readObservedSetupFailureFromUrl(url) {
  return {
    actionName: normalizeText(url.searchParams.get("actionName")),
    httpStatus: normalizeIssue(url.searchParams.get("httpStatus")),
    error: normalizeText(url.searchParams.get("error")),
    reason: normalizeText(url.searchParams.get("reason")),
    visibleBodyFields: normalizeText(url.searchParams.get("visibleBodyFields")),
    missingBodyFields: normalizeText(url.searchParams.get("missingBodyFields"))
  };
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeGitHubActionsEvent(payload) {
  const input = normalizeObject(payload);
  const repository = normalizeCanonicalRepositoryInput(input.repository || input.githubRepository);
  const workflowName = normalizeDashboardEventText(input.workflowName || input.workflow || input.workflow_name);
  const runId = normalizeDashboardEventText(input.runId || input.run_id || input.databaseId || input.database_id);
  const runUrl = normalizeDashboardEventText(input.runUrl || input.run_url || input.url);
  const status = normalizeDashboardEventText(input.status || "completed").toLowerCase();
  const conclusion = normalizeDashboardEventText(input.conclusion || input.result).toLowerCase();
  const updatedAt = normalizeIsoTimestamp(input.updatedAt || input.updated_at) || new Date().toISOString();
  const createdAt = normalizeIsoTimestamp(input.createdAt || input.created_at) || updatedAt;
  const headSha = normalizeDashboardEventText(input.headSha || input.head_sha || input.sha);
  const headBranch = normalizeDashboardEventText(input.headBranch || input.head_branch || input.branch);
  const title = normalizeDashboardEventText(input.displayTitle || input.display_title || input.title);

  if (!repository) {
    return {
      ok: false,
      error: "repository_required",
      reason: "GitHub Actions event repository is required"
    };
  }
  if (!workflowName) {
    return {
      ok: false,
      error: "workflow_required",
      reason: "GitHub Actions event workflowName is required"
    };
  }
  if (!runId) {
    return {
      ok: false,
      error: "run_id_required",
      reason: "GitHub Actions event runId is required"
    };
  }
  if (!["queued", "in_progress", "completed", "requested", "waiting"].includes(status)) {
    return {
      ok: false,
      error: "status_unsupported",
      reason: "GitHub Actions event status must be queued, in_progress, completed, requested, or waiting"
    };
  }
  if (conclusion && !["success", "failure", "cancelled", "skipped", "timed_out", "action_required"].includes(conclusion)) {
    return {
      ok: false,
      error: "conclusion_unsupported",
      reason: "GitHub Actions event conclusion is not supported"
    };
  }

  const event = {
    id: `github-actions:${repository}:${workflowName}:${runId}`,
    kind: "github_actions_workflow_run",
    repository,
    workflowName,
    runId,
    status,
    conclusion: conclusion || null,
    headSha: headSha || null,
    headBranch: headBranch || null,
    runUrl: runUrl || null,
    title: title || workflowName,
    createdAt,
    updatedAt
  };

  return {
    ok: true,
    event
  };
}

function normalizeVpsRunnerDashboardEvent(payload) {
  const input = normalizeObject(payload);
  const repository = normalizeCanonicalRepositoryInput(input.repository || input.githubRepository);
  const executionId = normalizeDashboardEventText(
    input.executionId || input.execution_id || input.runId || input.run_id
  );
  const rawStatus = normalizeDashboardEventText(input.status || input.runnerStatus || "running").toLowerCase();
  const status = normalizeVpsRunnerDashboardStatus(rawStatus);
  const conclusion = normalizeVpsRunnerDashboardConclusion(input.conclusion || input.result || rawStatus);
  const currentStep = sanitizeDashboardChatText(input.currentStep || input.current_step);
  const lastEvent = sanitizeDashboardChatText(input.lastEvent || input.last_event || input.event);
  const message = sanitizeDashboardChatText(input.message || input.summary || input.text || input.reason);
  const updatedAt = normalizeIsoTimestamp(input.updatedAt || input.updated_at || input.heartbeatAt) || new Date().toISOString();
  const createdAt = normalizeIsoTimestamp(input.createdAt || input.created_at) || updatedAt;
  const issueNumber = normalizePositiveInteger(input.issueNumber || input.issue_number || input.relatedIssue);
  const branch = sanitizeDashboardChatText(input.branch || input.headBranch || input.head_branch);
  const progressUrl = normalizeDashboardUrl(input.progressUrl || input.progress_url || input.runUrl || input.run_url || input.url);
  const threadId =
    normalizeDashboardThreadId(input.threadId || input.thread_id) ||
    normalizeDashboardThreadId(`execution-${executionId}`);
  const title = buildVpsRunnerDashboardTitle({ status, currentStep, lastEvent, message });

  if (!repository) {
    return {
      ok: false,
      error: "repository_required",
      reason: "VPS runner event repository is required"
    };
  }
  if (!executionId) {
    return {
      ok: false,
      error: "execution_id_required",
      reason: "VPS runner event executionId is required"
    };
  }
  if (!status) {
    return {
      ok: false,
      error: "status_unsupported",
      reason: "VPS runner event status is not supported"
    };
  }

  const event = {
    id: `vps-runner:${repository}:${executionId}:${lastEvent || status}:${updatedAt}`,
    kind: "vps_runner_execution",
    repository,
    workflowName: "vps-runner",
    runId: executionId,
    status,
    conclusion,
    headSha: null,
    headBranch: branch || null,
    runUrl: progressUrl || null,
    title,
    createdAt,
    updatedAt
  };
  const chatMessage = normalizeDashboardChatMessage(
    {
      threadId,
      role: "runner",
      repository,
      relatedIssue: issueNumber,
      status: mapVpsRunnerStatusToChatStatus(status),
      text: buildVpsRunnerChatMessageText({
        repository,
        executionId,
        issueNumber,
        status,
        currentStep,
        lastEvent,
        message,
        branch,
        progressUrl
      }),
      createdAt: updatedAt
    },
    { threadId }
  );

  return {
    ok: true,
    event,
    threadId,
    chatMessage
  };
}

function normalizeVpsRunnerDashboardStatus(value) {
  const status = normalizeDashboardEventText(value).toLowerCase();
  if (["queued", "requested", "waiting"].includes(status)) {
    return "queued";
  }
  if (["running", "in_progress", "picked_up", "started", "codex_subprocess"].includes(status)) {
    return "running";
  }
  if (["completed", "success", "done", "merged", "pr_created"].includes(status)) {
    return "completed";
  }
  if (["blocked", "failed", "failure", "error"].includes(status)) {
    return "blocked";
  }
  if (["canceled", "cancelled"].includes(status)) {
    return "canceled";
  }
  return "";
}

function normalizeVpsRunnerDashboardConclusion(value) {
  const conclusion = normalizeDashboardEventText(value).toLowerCase();
  if (["success", "completed", "done", "merged", "pr_created"].includes(conclusion)) {
    return "success";
  }
  if (["failure", "failed", "blocked", "error"].includes(conclusion)) {
    return "failure";
  }
  if (["cancelled", "canceled"].includes(conclusion)) {
    return "cancelled";
  }
  return null;
}

function mapVpsRunnerStatusToChatStatus(status) {
  if (status === "queued" || status === "running") {
    return "thinking";
  }
  if (status === "completed") {
    return "replied";
  }
  if (status === "canceled") {
    return "blocked";
  }
  return "failed";
}

function buildVpsRunnerDashboardTitle({ status, currentStep, lastEvent, message }) {
  const prefix = currentStep || lastEvent || `VPS runner ${status}`;
  const title = message ? `${prefix}: ${message}` : prefix;
  return title.slice(0, 160);
}

function buildVpsRunnerChatMessageText({
  repository,
  executionId,
  issueNumber,
  status,
  currentStep,
  lastEvent,
  message,
  branch,
  progressUrl
}) {
  const parts = [
    "VPS Codex CLI から返信です。",
    "",
    "状態:",
    `- repo: ${repository}`,
    `- execution: ${executionId}`,
    `- status: ${formatVpsRunnerDashboardStatusForOwner(status)}`
  ];
  if (issueNumber) {
    parts.push(`- Issue: #${issueNumber}`);
  }
  if (currentStep) {
    parts.push(`- step: ${currentStep}`);
  }
  if (lastEvent) {
    parts.push(`- event: ${lastEvent}`);
  }
  if (branch) {
    parts.push(`- branch: ${branch}`);
  }
  if (message) {
    parts.push("", "本文:");
    parts.push(message);
  }
  if (progressUrl) {
    parts.push("", `進捗: ${progressUrl}`);
  }
  return parts.join("\n");
}

function formatVpsRunnerDashboardStatusForOwner(status) {
  if (status === "completed") {
    return "完了";
  }
  if (status === "running") {
    return "実行中";
  }
  if (status === "queued") {
    return "待機中";
  }
  if (status === "blocked") {
    return "停止";
  }
  if (status === "canceled") {
    return "キャンセル";
  }
  return status || "不明";
}

function normalizeDashboardUrl(value) {
  const text = sanitizeDashboardChatText(value);
  if (!text) {
    return "";
  }
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeIsoTimestamp(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }
  const timestamp = new Date(text);
  if (Number.isNaN(timestamp.getTime())) {
    return "";
  }
  return timestamp.toISOString();
}

async function retrieveLatestDashboardEvent({ store, kind, repository, workflowName } = {}) {
  if (!store || typeof store.latest !== "function") {
    return null;
  }
  try {
    return await store.latest({ kind, repository, workflowName });
  } catch {
    return null;
  }
}

async function retrieveRecentDashboardEvents({ store, kind, repository, workflowName, since, limit } = {}) {
  if (!store) {
    return [];
  }
  if (typeof store.listRecent === "function") {
    try {
      return await store.listRecent({ kind, repository, workflowName, since, limit });
    } catch {
      return [];
    }
  }
  if (typeof store.latest === "function") {
    const latest = await retrieveLatestDashboardEvent({ store, kind, repository, workflowName });
    if (!latest) {
      return [];
    }
    const sinceTimestamp = normalizeIsoTimestamp(since);
    if (!sinceTimestamp) {
      return [latest];
    }
    const latestTime = new Date(normalizeText(latest.updatedAt)).getTime();
    const sinceTime = new Date(sinceTimestamp).getTime();
    if (Number.isNaN(latestTime) || Number.isNaN(sinceTime) || latestTime < sinceTime) {
      return [];
    }
    return [latest];
  }
  return [];
}

function renderDashboardDeployEvent(event) {
  if (!event) {
    return `<div class="deploy-event muted">直近 deploy event: 未受信</div>`;
  }
  const conclusion = normalizeDashboardEventText(event.conclusion) || normalizeDashboardEventText(event.status) || "unknown";
  const badgeClass = conclusion === "success" ? "success" : conclusion === "failure" || conclusion === "cancelled" ? "danger" : "";
  const updatedAt = normalizeDashboardEventText(event.updatedAt);
  const relativeUpdatedAt = formatDashboardRelativeTime(updatedAt);
  const sha = normalizeDashboardEventText(event.headSha);
  const shortSha = sha ? sha.slice(0, 7) : "unknown";
  const runUrl = normalizeDashboardEventText(event.runUrl);
  const runLabel = runUrl ? `<a class="chat-link" href="${escapeDashboardHtml(runUrl)}">Actions run</a>` : "Actions run 未設定";
  return `<div class="deploy-event">
            <div class="lane-title"><strong>最新 deploy</strong><span class="pill ${badgeClass}">${escapeDashboardHtml(conclusion)}</span></div>
            <p>${escapeDashboardHtml(event.workflowName || "deploy-production")} / <code>${escapeDashboardHtml(shortSha)}</code></p>
            <p class="muted">${escapeDashboardHtml(relativeUpdatedAt || "時刻未受信")} ・ ${escapeDashboardHtml(updatedAt || "updatedAt 未受信")} ・ ${runLabel}</p>
          </div>`;
}

function renderDashboardNotificationEvent(event) {
  if (!event) {
    return "";
  }
  const conclusion = normalizeDashboardEventText(event.conclusion) || normalizeDashboardEventText(event.status) || "unknown";
  const badgeClass = conclusion === "success" ? "success" : conclusion === "failure" || conclusion === "cancelled" ? "danger" : "";
  const updatedAt = normalizeDashboardEventText(event.updatedAt);
  const relativeUpdatedAt = formatDashboardRelativeTime(updatedAt);
  const repository = normalizeCanonicalRepositoryInput(event.repository) || "repository 未受信";
  const workflowName = normalizeDashboardEventText(event.workflowName) || normalizeDashboardEventText(event.kind) || "event";
  const title = normalizeDashboardEventText(event.title) || workflowName;
  const runId = normalizeDashboardEventText(event.runId);
  const sha = normalizeDashboardEventText(event.headSha);
  const shortSha = sha ? sha.slice(0, 7) : "";
  const runUrl = normalizeDashboardEventText(event.runUrl);
  const runLabel = runUrl ? `<a class="chat-link" href="${escapeDashboardHtml(runUrl)}">詳細を開く</a>` : "詳細リンク未受信";
  const meta = [
    repository,
    workflowName,
    runId ? `run ${runId}` : "",
    shortSha ? `sha ${shortSha}` : ""
  ].filter(Boolean).join(" / ");
  return `<div class="deploy-event">
            <div class="lane-title"><strong>${escapeDashboardHtml(title)}</strong><span class="pill ${badgeClass}">${escapeDashboardHtml(conclusion)}</span></div>
            <p>${escapeDashboardHtml(meta)}</p>
            <p class="muted">${escapeDashboardHtml(relativeUpdatedAt || "時刻未受信")} ・ ${escapeDashboardHtml(updatedAt || "updatedAt 未受信")} ・ ${runLabel}</p>
          </div>`;
}

function formatDashboardRelativeTime(value, now = new Date()) {
  const timestamp = new Date(normalizeText(value));
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (Number.isNaN(timestamp.getTime()) || Number.isNaN(nowTime)) {
    return "";
  }
  const diffMs = Math.max(0, nowTime - timestamp.getTime());
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) {
    return "たった今";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}分前`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}時間前`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}日前`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}か月前`;
  }
  return `${Math.floor(months / 12)}年前`;
}

async function renderDashboardGitHubTruthPage({ url, env } = {}) {
  const origin = normalize(url?.origin);
  const repository = normalizeCanonicalRepositoryInput(url?.searchParams?.get("repository")) || "marushu/vtdd-v2-p";
  const [issues, pulls, workflowRuns] = await Promise.all([
    retrieveGitHubReadPlane({
      resource: "issues",
      repository,
      state: "open",
      limit: 12,
      env
    }),
    retrieveGitHubReadPlane({
      resource: "pulls",
      repository,
      state: "open",
      limit: 12,
      env
    }),
    retrieveGitHubReadPlane({
      resource: "workflow_runs",
      repository,
      limit: 8,
      env
    })
  ]);
  const failures = [issues, pulls, workflowRuns].filter((item) => !item.ok);
  return renderDashboardUtilityPage({
    title: "GitHub runtime truth",
    subtitle: repository,
    backHref: `${origin}/dashboard`,
    body: `
      <section class="hero">
        <p>Butler / Action 向け JSON ではなく、人間が読むための GitHub 現在地です。</p>
      </section>
      ${failures.length > 0 ? renderDashboardNotice("一部の GitHub runtime truth を読めませんでした。GitHub App / token 設定を確認してください。") : ""}
      <div class="grid">
        ${renderGitHubTruthLane("Open Issues", issues, renderIssueTruthCard)}
        ${renderGitHubTruthLane("Open PRs", pulls, renderPullTruthCard)}
        ${renderGitHubTruthLane("Workflow Runs", workflowRuns, renderWorkflowRunTruthCard)}
      </div>
    `
  });
}

async function renderDashboardPreflightPage({ url, env } = {}) {
  const origin = normalize(url?.origin);
  const repository = normalizeCanonicalRepositoryInput(url?.searchParams?.get("repository")) || "marushu/vtdd-v2-p";
  const issueNumber = normalizeIssue(url?.searchParams?.get("issueNumber"));
  const phase = normalizeText(url?.searchParams?.get("phase")) || "execution";
  const currentSurface = normalizeText(url?.searchParams?.get("currentSurface")) || "dashboard";
  const startupPreflight = await buildStartupPreflight({
    repository,
    ref: normalizeText(url?.searchParams?.get("ref")) || "main",
    issueNumber,
    phase,
    currentSurface,
    queryText: "VTDD dashboard startup preflight",
    runtimeOrigin: origin,
    env
  });
  return renderDashboardUtilityPage({
    title: "Startup preflight",
    subtitle: repository,
    backHref: `${origin}/dashboard`,
    body: `
      <section class="hero">
        <p>Butler が最初に読むべき AGENTS / Issue / runtime truth / RAG / self parity の現在地です。</p>
      </section>
      <div class="grid">
        <section class="lane">
          <div class="lane-title"><h2>Source truth</h2><span class="pill">${startupPreflight.sources.length}件</span></div>
          ${startupPreflight.sources.map((source) => renderTruthRow(source.path, source.status, source.reason || source.sha || "")).join("")}
        </section>
        <section class="lane">
          <div class="lane-title"><h2>Open Issues</h2><span class="pill">${startupPreflight.openIssues.length}件</span></div>
          ${startupPreflight.openIssues.length > 0 ? startupPreflight.openIssues.map((issue) => renderLinkedTruthRow(`#${issue.number} ${issue.title}`, issue.htmlUrl, issue.state)).join("") : `<p class="muted">該当なし</p>`}
        </section>
        <section class="lane">
          <div class="lane-title"><h2>Next safe action</h2><span class="pill">${escapeDashboardHtml(startupPreflight.butlerFirstPrinciple.status)}</span></div>
          ${renderObjectSummary(startupPreflight.nextSafeAction)}
        </section>
      </div>
    `
  });
}

async function renderDashboardProgressPage({ url, env } = {}) {
  const origin = normalize(url?.origin);
  const repository = normalizeCanonicalRepositoryInput(url?.searchParams?.get("repository")) || "marushu/vtdd-v2-p";
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: url.searchParams.get("executionId"),
    repository,
    issueNumber: url.searchParams.get("issueNumber"),
    branch: url.searchParams.get("branch"),
    executorTransport: url.searchParams.get("executorTransport"),
    env
  });
  return renderDashboardUtilityPage({
    title: "Execution progress",
    subtitle: repository,
    backHref: `${origin}/dashboard`,
    body: `
      <section class="hero">
        <p>VPS Codex CLI / remote Codex execution の進捗を人間向けに表示します。入力中に勝手な自動更新はしません。</p>
      </section>
      ${progress.ok ? renderProgressSummary(progress.progress) : renderDashboardNotice(progress.reason || progress.error || "progress unavailable")}
    `
  });
}

async function renderDashboardVpsRunnerPage({ url, env } = {}) {
  const origin = normalize(url?.origin);
  const repository = normalizeCanonicalRepositoryInput(url?.searchParams?.get("repository")) || "marushu/vtdd-v2-p";
  const status = await retrieveVpsRunnerHealthStatus({
    executionId: url.searchParams.get("executionId"),
    repository,
    issueNumber: url.searchParams.get("issueNumber"),
    branch: url.searchParams.get("branch"),
    env
  });
  return renderDashboardUtilityPage({
    title: "VPS runner status",
    subtitle: repository,
    backHref: `${origin}/dashboard`,
    body: `
      <section class="hero">
        <p>VPS runner の health / queue / progress を人間向けに表示します。</p>
      </section>
      ${status.ok ? `<div class="grid">${renderStatusLane("Health", status.health)}${renderStatusLane("Progress", status.progress)}</div>` : renderDashboardNotice(status.reason || status.error || "runner status unavailable")}
    `
  });
}

async function renderDashboardMemoryPage({ url, env } = {}) {
  const origin = normalize(url?.origin);
  const repository = normalizeCanonicalRepositoryInput(url?.searchParams?.get("repository")) || "marushu/vtdd-v2-p";
  const retrieved = await retrieveOperationalMemory(resolveMemoryProvider(env), {
    text: normalizeText(url.searchParams.get("text")) || normalizeText(url.searchParams.get("q")),
    recordId: normalizeText(url.searchParams.get("recordId")),
    repository,
    limit: normalizeLimit(url.searchParams.get("limit"), 8),
    runtimeTruth: buildRetrieveRuntimeTruth(url)
  });
  return renderDashboardUtilityPage({
    title: "Operational RAG",
    subtitle: repository,
    backHref: `${origin}/dashboard`,
    body: `
      <section class="hero">
        <p>decision / proposal / working memory の compact retrieval です。runtime truth の代替ではありません。</p>
      </section>
      ${retrieved.ok ? renderMemorySummary(retrieved) : renderDashboardNotice(retrieved.reason || retrieved.error || "memory unavailable")}
    `
  });
}

async function renderDashboardSelfParityPage({ url, env } = {}) {
  const origin = normalize(url?.origin);
  const repository = normalizeCanonicalRepositoryInput(url?.searchParams?.get("repository")) || "marushu/vtdd-v2-p";
  const parity = await evaluateButlerSelfParity({
    repository,
    ref: normalizeText(url.searchParams.get("ref")),
    issueNumber: normalizeIssue(url.searchParams.get("issueNumber")),
    pullNumber: normalizeIssue(url.searchParams.get("pullNumber")),
    runtimeOrigin: origin,
    env
  });
  return renderDashboardUtilityPage({
    title: "Self parity",
    subtitle: repository,
    backHref: `${origin}/dashboard`,
    body: `
      <section class="hero">
        <p>Action Schema / Instructions / Cloudflare deploy freshness / operator URL の自己診断です。</p>
      </section>
      ${parity.ok ? renderObjectSummary(parity.selfParity) : renderDashboardNotice(parity.reason || parity.error || "self parity unavailable")}
    `
  });
}

async function renderDashboardNotificationsPage({ runtimeOrigin, dashboardEventStore, env } = {}) {
  const origin = normalize(runtimeOrigin);
  const recentSince = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const recentEvents = await retrieveRecentDashboardEvents({
    store: dashboardEventStore,
    since: recentSince,
    limit: 20
  });
  const publicKey = normalizeDashboardEventText(env?.[WEB_PUSH_PUBLIC_KEY_ENV]);
  return renderDashboardUtilityPage({
    title: "通知センター",
    subtitle: "dashboard events",
    backHref: `${origin}/dashboard`,
    body: `
      <section class="hero">
        <p>Dashboard Butler の通知入口です。iOS PWA Web Push、OS の通知音、未読 badge はこの画面から許可・確認します。</p>
        <p class="muted">VTDD だけでなく、他 repo / 並行開発 / queue / workflow から届いたイベントを直近5分だけ表示します。</p>
      </section>
      <div class="grid single">
        <section class="lane">
          <div class="lane-title"><h2>最新通知</h2><span class="pill">直近5分</span></div>
          ${recentEvents.length > 0 ? recentEvents.map((event) => renderDashboardNotificationEvent(event)).join("") : `<p class="muted">直近5分の通知はありません。</p>`}
        </section>
      </div>
      <div class="grid">
        <section class="lane">
          <div class="lane-title"><h2>iOS PWA 通知</h2><span class="pill" id="push-support-pill">確認中</span></div>
          <p id="push-state" class="muted">通知状態を確認しています。</p>
          <p id="push-subscription-state" class="muted">購読保存状態を確認しています。</p>
          <p id="push-delivery-state" class="muted">deploy 完了/失敗通知はサーバ送信 Web Push と同じ経路で届きます。</p>
          <p id="push-server-result" class="muted">最後のサーバ送信結果: 未実行</p>
          <div class="actions">
            <button class="dashboard-action" id="push-permission-button" type="button">通知を許可</button>
            <button class="dashboard-action" id="push-subscribe-button" type="button">購読を保存</button>
            <button class="dashboard-action" id="push-test-button" type="button">テスト通知</button>
            <button class="dashboard-action" id="push-server-test-button" type="button">サーバ送信テスト</button>
          </div>
          <p class="muted">通知タップは通知センターへ戻ります。音は iOS 側の通知設定に従います。</p>
        </section>
        <section class="lane">
          <div class="lane-title"><h2>Badge</h2><span class="pill" id="badge-support-pill">確認中</span></div>
          <p id="badge-state" class="muted">Badging API の対応状況を確認しています。</p>
          <div class="actions">
            <button class="dashboard-action" id="badge-set-button" type="button">未読数を反映</button>
            <button class="dashboard-action" id="badge-clear-button" type="button">Badge を消す</button>
          </div>
        </section>
      </div>
      <div class="grid single">
        <details class="lane" data-debug-section="notification-authority-boundary">
          <summary>通知の詳細設定と安全境界</summary>
          <div class="lane-title"><h2>Authority boundary</h2><span class="pill">read/write</span></div>
          <p>push subscription は dashboard owner session から保存します。HTML には endpoint、auth key、p256dh key を埋め込みません。</p>
          <p class="muted">同一 origin の dashboard owner session cookie / Cloudflare Access identity を使うため、購読保存 fetch は credentials: same-origin で送ります。</p>
          <p class="muted">Web Push 送信には server-side VAPID secret と subscription raw material が必要です。D1 には送信用に保持し、response / HTML / payload_json には raw key を返しません。</p>
        </details>
      </div>
      <script>
        (() => {
          const vapidPublicKey = ${JSON.stringify(publicKey)};
          const pushState = document.getElementById("push-state");
          const pushSubscriptionState = document.getElementById("push-subscription-state");
          const pushDeliveryState = document.getElementById("push-delivery-state");
          const pushServerResult = document.getElementById("push-server-result");
          const pushSupportPill = document.getElementById("push-support-pill");
          const badgeState = document.getElementById("badge-state");
          const badgeSupportPill = document.getElementById("badge-support-pill");
          const permissionButton = document.getElementById("push-permission-button");
          const subscribeButton = document.getElementById("push-subscribe-button");
          const testButton = document.getElementById("push-test-button");
          const serverTestButton = document.getElementById("push-server-test-button");
          const badgeSetButton = document.getElementById("badge-set-button");
          const badgeClearButton = document.getElementById("badge-clear-button");
          const unreadCount = ${recentEvents.length};
          let lastServerPushResult = "最後のサーバ送信結果: 未実行";
          let serverPushDelivered = false;

          function setText(node, text) {
            if (node) node.textContent = text;
          }

          function setPill(node, text, ok) {
            if (!node) return;
            node.textContent = text;
            node.classList.toggle("success", ok === true);
            node.classList.toggle("danger", ok === false);
          }

          function base64UrlToUint8Array(value) {
            const padding = "=".repeat((4 - value.length % 4) % 4);
            const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
            const raw = atob(base64);
            const output = new Uint8Array(raw.length);
            for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
            return output;
          }

          function safePushResultDetail(value) {
            const normalized = String(value || "");
            if (!normalized) return "";
            if (normalized.includes("accepted")) return "accepted";
            if (normalized.includes("stale")) return "stale subscription";
            if (normalized.includes("not found")) return "subscription not found";
            if (normalized.includes("unconfigured")) return "server push unconfigured";
            if (normalized.includes("rejected")) return "push service rejected";
            if (normalized.includes("required")) return "required setting missing";
            return "details redacted";
          }

          async function registration() {
            if (!("serviceWorker" in navigator)) return null;
            return navigator.serviceWorker.register("/dashboard-sw.js", { scope: "/dashboard/" });
          }

          async function readServerSubscriptionStatus(subscription) {
            if (!subscription) return null;
            const response = await fetch("/v2/dashboard/push/status", {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ endpoint: subscription.endpoint })
            });
            if (!response.ok) return { status: "unknown" };
            const body = await response.json().catch(() => ({}));
            return body && body.subscription ? body.subscription : { status: "unknown" };
          }

          async function refreshState() {
            const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
            setPill(pushSupportPill, pushSupported ? "対応" : "未対応", pushSupported);
            setText(pushState, pushSupported
              ? "端末通知: " + Notification.permission + (vapidPublicKey ? " / サーバ送信設定: あり" : " / サーバ送信設定: 未設定")
              : "この環境は Web Push に未対応です。iOS はホーム画面に追加した PWA が必要です。");
            let hasSubscription = false;
            let serverSubscription = null;
            if (pushSupported && vapidPublicKey && Notification.permission === "granted") {
              const reg = await registration();
              const subscription = await reg?.pushManager?.getSubscription?.();
              hasSubscription = Boolean(subscription);
              serverSubscription = await readServerSubscriptionStatus(subscription);
            }
            const serverSaved = serverSubscription && serverSubscription.status === "saved";
            setText(pushSubscriptionState, hasSubscription && serverSaved
              ? serverPushDelivered
                ? "購読保存: あり。サーバ送信テストも成功済みです。deploy 完了/失敗通知は同じ経路で届きます。"
                : "購読保存: あり。サーバ送信テストはまだ未確認です。"
              : hasSubscription
                ? "購読保存: 端末に購読はありますが、サーバ保存は未確認です。「購読を保存」を押してください。"
              : pushSupported && vapidPublicKey
                ? "購読保存: 未保存。サーバ通知を受けるには「購読を保存」を押してください。"
                : "購読保存: サーバ送信設定が未完了のため保存できません。");
            setText(pushDeliveryState, vapidPublicKey
              ? serverPushDelivered
                ? "サーバ送信: テスト成功。deploy 完了/失敗通知とサーバ送信テストは同じ Web Push 経路です。"
                : "サーバ送信: 設定あり。deploy 通知到達性はサーバ送信テスト成功後に確認済みになります。"
              : "サーバ送信: 未設定。VAPID public key がないため deploy 通知はこの端末へ届きません。");
            setText(pushServerResult, lastServerPushResult);
            const badgeSupported = "setAppBadge" in navigator && "clearAppBadge" in navigator;
            setPill(badgeSupportPill, badgeSupported ? "対応" : "未対応", badgeSupported);
            setText(badgeState, badgeSupported ? "未読通知数をホーム画面 badge に反映できます。" : "この環境では Badging API が未対応です。");
            if (subscribeButton) subscribeButton.disabled = !pushSupported || !vapidPublicKey || Notification.permission !== "granted";
            if (permissionButton) permissionButton.disabled = !pushSupported || Notification.permission === "granted";
            if (testButton) testButton.disabled = !pushSupported || Notification.permission !== "granted";
            if (serverTestButton) serverTestButton.disabled = !pushSupported || !vapidPublicKey || Notification.permission !== "granted";
            if (badgeSetButton) badgeSetButton.disabled = !badgeSupported;
            if (badgeClearButton) badgeClearButton.disabled = !badgeSupported;
          }

          permissionButton?.addEventListener("click", async () => {
            if (!("Notification" in window)) return refreshState();
            await Notification.requestPermission();
            await registration();
            await refreshState();
          });

          subscribeButton?.addEventListener("click", async () => {
            const reg = await registration();
            if (!reg || !vapidPublicKey) return refreshState();
            const subscription = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: base64UrlToUint8Array(vapidPublicKey)
            });
            const response = await fetch("/v2/dashboard/push/subscription", {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ subscription: subscription.toJSON(), userAgent: navigator.userAgent })
            });
            setText(pushSubscriptionState, response.ok
              ? "購読保存: あり。サーバ送信テストはまだ未確認です。"
              : "購読保存: 失敗。owner session と Cloudflare Access を確認してください。");
            await refreshState();
          });

          testButton?.addEventListener("click", async () => {
            const reg = await registration();
            if (!reg) return refreshState();
            await reg.showNotification("VTDD Butler", {
              body: "Dashboard Butler の通知テストです。",
              tag: "vtdd-dashboard-test",
              renotify: true,
              silent: false,
              data: { url: "/dashboard/notifications" }
            });
          });

          serverTestButton?.addEventListener("click", async () => {
            const response = await fetch("/v2/dashboard/push/test", {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ title: "Dashboard Butler server push test" })
            });
            const body = await response.json().catch(() => ({}));
            const webPush = body && body.webPush ? body.webPush : {};
            const attempted = Number(webPush.attempted || 0);
            const delivered = Number(webPush.delivered || 0);
            const firstResult = Array.isArray(webPush.results) ? webPush.results[0] : null;
            const detail = safePushResultDetail(firstResult?.reason || firstResult?.error || webPush.reason || webPush.error || "");
            serverPushDelivered = delivered > 0 && delivered === attempted;
            lastServerPushResult = serverPushDelivered
              ? "最後のサーバ送信結果: accepted (" + delivered + "/" + attempted + ")"
              : "最後のサーバ送信結果: rejected (" + delivered + "/" + attempted + ")" + (detail ? " / " + detail : "");
            setText(pushServerResult, lastServerPushResult);
            await refreshState();
          });

          badgeSetButton?.addEventListener("click", async () => {
            if ("setAppBadge" in navigator) await navigator.setAppBadge(Math.max(1, unreadCount));
          });

          badgeClearButton?.addEventListener("click", async () => {
            if ("clearAppBadge" in navigator) await navigator.clearAppBadge();
          });

          refreshState();
        })();
      </script>
    `
  });
}

function buildDashboardWebManifest(url) {
  const origin = normalize(url?.origin);
  return {
    name: "VTDD Butler",
    short_name: "VTDD",
    start_url: "/dashboard",
    scope: "/dashboard/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#050505",
    icons: [
      {
        src: `${origin}/dashboard-icon.svg`,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable"
      }
    ]
  };
}

function renderDashboardServiceWorkerScript() {
  return `
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = String(payload.title || "VTDD Butler");
  const options = {
    body: String(payload.body || payload.message || "Dashboard Butler の通知です。"),
    tag: String(payload.tag || "vtdd-dashboard"),
    renotify: payload.renotify !== false,
    silent: payload.silent === true,
    data: {
      url: String(payload.url || "/dashboard/notifications")
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

function safeDashboardNotificationUrl(value) {
  let parsed;
  try {
    parsed = new URL(value || "/dashboard/notifications", self.location.origin);
  } catch {
    parsed = new URL("/dashboard/notifications", self.location.origin);
  }
  if (parsed.origin !== self.location.origin) {
    return new URL("/dashboard/notifications", self.location.origin).toString();
  }
  if (parsed.pathname !== "/dashboard" && !parsed.pathname.startsWith("/dashboard/")) {
    return new URL("/dashboard/notifications", self.location.origin).toString();
  }
  return parsed.toString();
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = safeDashboardNotificationUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if ("focus" in client) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});
`.trim();
}

function renderDashboardIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#050505"/><path d="M144 128h224v52H144zM144 230h224v52H144zM144 332h148v52H144z" fill="#f7f7f4"/></svg>`;
}

function renderGitHubTruthLane(title, result, renderCard) {
  if (!result.ok) {
    return `<section class="lane">
      <div class="lane-title"><h2>${escapeDashboardHtml(title)}</h2><span class="pill danger">unavailable</span></div>
      <p>${escapeDashboardHtml(result.reason || result.error || "GitHub read unavailable")}</p>
    </section>`;
  }
  const records = Array.isArray(result.read?.records) ? result.read.records : [];
  return `<section class="lane">
    <div class="lane-title"><h2>${escapeDashboardHtml(title)}</h2><span class="pill">${records.length}件</span></div>
    ${records.length > 0 ? records.map(renderCard).join("") : `<p class="muted">該当なし</p>`}
  </section>`;
}

function renderIssueTruthCard(issue) {
  return `<article class="truth-card">
    <div class="truth-card-title"><a href="${escapeDashboardHtml(issue.htmlUrl)}">#${escapeDashboardHtml(issue.number)} ${escapeDashboardHtml(issue.title)}</a></div>
    <p>${escapeDashboardHtml(issue.author || "unknown")} / ${escapeDashboardHtml(issue.state || "open")}</p>
  </article>`;
}

function renderPullTruthCard(pull) {
  const state = pull.draft ? "draft" : pull.state || "open";
  return `<article class="truth-card">
    <div class="truth-card-title"><a href="${escapeDashboardHtml(pull.htmlUrl)}">#${escapeDashboardHtml(pull.number)} ${escapeDashboardHtml(pull.title)}</a></div>
    <p>${escapeDashboardHtml(state)} / ${escapeDashboardHtml(pull.headRef || "head unknown")} -> ${escapeDashboardHtml(pull.baseRef || "base unknown")}</p>
  </article>`;
}

function renderWorkflowRunTruthCard(run) {
  const conclusion = run.conclusion || run.status || "unknown";
  const badgeClass = conclusion === "success" ? "success" : conclusion === "failure" ? "danger" : "";
  return `<article class="truth-card">
    <div class="truth-card-title"><a href="${escapeDashboardHtml(run.htmlUrl)}">${escapeDashboardHtml(run.name || `run ${run.id}`)}</a></div>
    <p><span class="pill ${badgeClass}">${escapeDashboardHtml(conclusion)}</span> ${escapeDashboardHtml(run.headBranch || "")}</p>
  </article>`;
}

function renderDashboardNotice(message) {
  return `<section class="notice">${escapeDashboardHtml(message)}</section>`;
}

function renderTruthRow(label, value, detail = "") {
  return `<article class="truth-card">
    <div class="truth-card-title"><strong>${escapeDashboardHtml(label)}</strong><span class="pill">${escapeDashboardHtml(value || "未確認")}</span></div>
    ${detail ? `<p>${escapeDashboardHtml(detail)}</p>` : ""}
  </article>`;
}

function renderLinkedTruthRow(label, href, detail = "") {
  return `<article class="truth-card">
    <div class="truth-card-title"><a href="${escapeDashboardHtml(href || "#")}">${escapeDashboardHtml(label)}</a></div>
    ${detail ? `<p>${escapeDashboardHtml(detail)}</p>` : ""}
  </article>`;
}

function renderProgressSummary(progress) {
  return `<div class="grid single">
    <section class="lane">
      <div class="lane-title"><h2>Progress</h2><span class="pill">${escapeDashboardHtml(progress?.status || "未確認")}</span></div>
      ${renderObjectSummary(progress)}
    </section>
  </div>`;
}

function renderStatusLane(title, value) {
  return `<section class="lane">
    <div class="lane-title"><h2>${escapeDashboardHtml(title)}</h2><span class="pill">summary</span></div>
    ${renderObjectSummary(value)}
  </section>`;
}

function renderMemorySummary(retrieved) {
  const references = retrieved.referencesByLayer && typeof retrieved.referencesByLayer === "object"
    ? Object.entries(retrieved.referencesByLayer)
    : [];
  return `<div class="grid">
    <section class="lane">
      <div class="lane-title"><h2>Compact context</h2><span class="pill">${escapeDashboardHtml(retrieved.architecture || "memory")}</span></div>
      <p>${escapeDashboardHtml(retrieved.compactContext || "該当なし")}</p>
    </section>
    <section class="lane">
      <div class="lane-title"><h2>References</h2><span class="pill">${references.length} layers</span></div>
      ${references.length > 0 ? references.map(([layer, records]) => renderTruthRow(layer, Array.isArray(records) ? `${records.length}件` : "未確認")).join("") : `<p class="muted">該当なし</p>`}
    </section>
    <section class="lane">
      <div class="lane-title"><h2>Signals</h2><span class="pill">retrieval</span></div>
      ${renderObjectSummary(retrieved.retrievalSignals)}
    </section>
  </div>`;
}

function renderObjectSummary(value, depth = 0) {
  if (value === null || value === undefined || value === "") {
    return `<p class="muted">未確認</p>`;
  }
  if (typeof value !== "object") {
    return `<p>${escapeDashboardHtml(String(value))}</p>`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `<p class="muted">該当なし</p>`;
    }
    return value.slice(0, 8).map((item, index) => renderTruthRow(`#${index + 1}`, summarizeObjectValue(item))).join("");
  }
  const entries = Object.entries(value).filter(([, item]) => item !== undefined && typeof item !== "function");
  if (entries.length === 0) {
    return `<p class="muted">該当なし</p>`;
  }
  return `<dl class="summary-list">
    ${entries.slice(0, 16).map(([key, item]) => `
      <div>
        <dt>${escapeDashboardHtml(key)}</dt>
        <dd>${depth < 1 && item && typeof item === "object" ? renderObjectSummary(item, depth + 1) : escapeDashboardHtml(summarizeObjectValue(item))}</dd>
      </div>
    `).join("")}
  </dl>`;
}

function summarizeObjectValue(value) {
  if (value === null || value === undefined || value === "") {
    return "未確認";
  }
  if (Array.isArray(value)) {
    return `${value.length}件`;
  }
  if (typeof value === "object") {
    const title = value.title || value.name || value.status || value.state || value.id || value.number;
    return title ? String(title) : `${Object.keys(value).length} fields`;
  }
  return String(value);
}

function renderDashboardUtilityPage({ title, subtitle, backHref, body }) {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="manifest" href="/dashboard.webmanifest">
  <meta name="theme-color" content="#050505">
  <title>${escapeDashboardHtml(title)} - VTDD Butler</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --bg: #f7f7f4; --panel: #fff; --text: #151515; --muted: #62625d; --border: #deded6; --soft: #f0f0eb; }
    @media (prefers-color-scheme: dark) { :root { --bg: #050505; --panel: #101010; --text: #f7f7f4; --muted: #a0a09a; --border: #2b2b2b; --soft: #1b1b1b; } }
    * { box-sizing: border-box; }
    html, body { max-width: 100%; overflow-x: hidden; }
    body { margin: 0; background: var(--bg); color: var(--text); }
    main { width: min(1120px, 100%); margin: 0 auto; padding: 16px; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; }
    h1 { font-size: 24px; margin: 0 0 4px; }
    h2 { font-size: 18px; margin: 0; }
    p { line-height: 1.6; margin: 0 0 10px; }
    a { color: inherit; text-underline-offset: 4px; }
    .back, .actions a, .dashboard-action { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; border: 1px solid var(--border); border-radius: 999px; padding: 6px 12px; background: var(--soft); color: var(--text); text-decoration: none; font: inherit; font-weight: 750; }
    .dashboard-action:disabled { opacity: .45; }
    .hero, .lane, .notice { border: 1px solid var(--border); border-radius: 16px; background: var(--panel); padding: 14px; margin-bottom: 14px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
    .grid.single { grid-template-columns: minmax(0, 1fr); }
    .lane-title, .truth-card-title { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .truth-card { border-top: 1px solid var(--border); padding: 11px 0; }
    .truth-card:first-of-type { border-top: 0; }
    .truth-card p, .muted { color: var(--muted); }
    .summary-list { margin: 0; display: grid; gap: 8px; }
    .summary-list div { display: grid; grid-template-columns: minmax(96px, 0.4fr) minmax(0, 1fr); gap: 10px; padding: 8px 0; border-top: 1px solid var(--border); }
    .summary-list div:first-child { border-top: 0; }
    .summary-list dt { color: var(--muted); font-size: 13px; }
    .summary-list dd { margin: 0; overflow-wrap: anywhere; }
    .pill { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; padding: 3px 8px; background: var(--soft); font-size: 12px; white-space: nowrap; }
    .pill.success { border-color: #7fb797; background: #e7f5ec; color: #145c34; }
    .pill.danger { border-color: #d69b9b; background: #fff0f0; color: #8a1f1f; }
    .deploy-event { border: 1px solid var(--border); border-radius: 12px; padding: 10px; margin: 10px 0; background: var(--soft); }
    .deploy-event p { margin-bottom: 6px; font-size: 13px; }
    code { overflow-wrap: anywhere; }
    @media (max-width: 760px) {
      main { padding: 12px; }
      header { align-items: flex-start; }
      .grid { grid-template-columns: minmax(0, 1fr); }
      .summary-list div { grid-template-columns: minmax(0, 1fr); }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>${escapeDashboardHtml(title)}</h1>
        <p class="muted">${escapeDashboardHtml(subtitle || "")}</p>
      </div>
      <a class="back" href="${escapeDashboardHtml(backHref || "/dashboard")}">Dashboard</a>
    </header>
    ${body}
  </main>
</body>
</html>`;
}

function normalizeTextList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean);
  }
  const text = normalizeText(value);
  return text ? [text] : [];
}

function uniqueTextList(value) {
  return [...new Set(normalizeTextList(value))];
}

async function renderV2DashboardPage({ runtimeOrigin, url, dashboardEventStore } = {}) {
  const origin = normalize(runtimeOrigin);
  const repositoryInput = normalizeDashboardRepositoryInput(
    url?.searchParams?.get("repositoryInput") || url?.searchParams?.get("repository")
  );
  const dashboardIssueNumber = normalizePositiveInteger(url?.searchParams?.get("issueNumber"));
  const dashboardTargetLabel = repositoryInput || "対象 repo 未指定";
  const targetStatusMarkup = repositoryInput
    ? `<p><strong>${escapeDashboardHtml(repositoryInput)}</strong></p>
          <p class="muted">この repo を対象に runtime truth、progress、RAG、operator を開きます。</p>`
    : `<p><strong>対象 repo 未指定</strong></p>
          <p class="muted">通常会話は続けられます。repo 作業に入る時は URL に <code>?repository=owner/repo</code> または <code>?repositoryInput=owner/repo</code> を付けて開いてください。</p>`;
  const encodedRepository = encodeURIComponent(repositoryInput);
  const chatThreadId = `dashboard-main-${(repositoryInput || "unresolved").replace(/[^a-z0-9_.-]+/gi, "-")}`;
  const socketOrigin = origin.replace(/^http/i, "ws");
  const latestDeployEvent = await retrieveLatestDashboardEvent({
    store: dashboardEventStore,
    kind: "github_actions_workflow_run",
    repository: normalizeCanonicalRepositoryInput(repositoryInput),
    workflowName: "deploy-production"
  });
  const surfaces = [
    {
      title: "Status page",
      body: "人間向けの runtime status。まずここを見る。",
      href: `${origin}/status`
    },
    {
      title: "Startup preflight",
      body: "AGENTS.md、thread-independent startup、runtime truth、RAG、self parity を最初に読む入口。",
      href: `${origin}/dashboard/preflight?repository=${encodedRepository}`
    },
    {
      title: "Execution progress",
      body: "VPS Codex CLI / remote Codex execution の進捗確認。",
      href: `${origin}/dashboard/progress?repository=${encodedRepository}`
    },
    {
      title: "VPS runner status",
      body: "runner health、queue、対象 execution の状態確認。",
      href: `${origin}/dashboard/vps-runner?repository=${encodedRepository}`
    },
    {
      title: "GitHub runtime truth",
      body: "Issues、PRs、checks、workflow runs、reviewer comments を読む入口。",
      href: `${origin}/dashboard/github?repository=${encodedRepository}`
    },
    {
      title: "通知センター",
      body: "GitHub Actions / deploy から Worker に届いた dashboard event を人間向けに見る入口。",
      href: `${origin}/dashboard/notifications`
    },
    {
      title: "Operational RAG",
      body: "decision / proposal / working memory の compact retrieval。runtime truth の代替ではない。",
      href: `${origin}/dashboard/memory?repository=${encodedRepository}`
    },
    {
      title: "Self parity",
      body: "Action Schema、Instructions、Cloudflare deploy freshness、operator URL を確認。",
      href: `${origin}/dashboard/self-parity?repository=${encodedRepository}`
    },
    {
      title: "Setup diagnostics",
      body: "Butler / Custom GPT / deploy drift の診断ページ。",
      href: `${origin}/setup/diagnostics?repository=${encodedRepository}`
    },
    {
      title: "Deploy operator",
      body: "production deploy は scope 明示済み passkey approval の後ろ。approval grant や secret は dashboard に保存しない。",
      href: `${origin}/v2/approval/passkey/operator?repositoryInput=${encodedRepository}&phase=execution&actionType=deploy_production&highRiskKind=deploy_production`
    }
  ];
  const workflows = [
    ["remote-codex-executor", "https://github.com/marushu/vtdd-v2-p/actions/workflows/remote-codex-executor.yml"],
    ["gemini-pr-review", "https://github.com/marushu/vtdd-v2-p/actions/workflows/gemini-pr-review.yml"],
    ["codex-pr-review-fallback", "https://github.com/marushu/vtdd-v2-p/actions/workflows/codex-pr-review-fallback.yml"],
    ["deploy-production", "https://github.com/marushu/vtdd-v2-p/actions/workflows/deploy-production.yml"]
  ];
  const cockpitActions = [
    {
      label: "状態確認",
      href: `${origin}/dashboard/github?repository=${encodedRepository}`
    },
    {
      label: "進捗を見る",
      href: `${origin}/dashboard/progress?repository=${encodedRepository}`
    },
    {
      label: "RAG を読む",
      href: `${origin}/dashboard/memory?repository=${encodedRepository}`
    },
    {
      label: "通知",
      href: `${origin}/dashboard/notifications`
    },
    {
      label: "Passkey",
      href: `${origin}/v2/approval/passkey/operator?repositoryInput=${encodedRepository}`
    }
  ];

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="manifest" href="/dashboard.webmanifest">
  <meta name="theme-color" content="#050505">
  <title>VTDD v2 Dashboard</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --page-bg: #f7f7f4;
      --text: #151515;
      --muted: #64645f;
      --soft: #f0f0eb;
      --panel: #ffffff;
      --panel-strong: #fbfbf7;
      --border: #ddddd5;
      --button: #f4f4ef;
      --owner-bubble: #171717;
      --owner-text: #f7f7f4;
      --shadow: rgba(20, 20, 20, .12);
      color: var(--text);
      background: var(--page-bg);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --page-bg: #050505;
        --text: #f7f7f4;
        --muted: #9d9d98;
        --soft: #202020;
        --panel: #101010;
        --panel-strong: #171717;
        --border: #2a2a2a;
        --button: #171717;
        --owner-bubble: #f2f2ee;
        --owner-text: #111;
        --shadow: rgba(0, 0, 0, .42);
      }
    }
    * { box-sizing: border-box; }
    html, body { max-width: 100%; height: 100%; overflow: hidden; }
    body { margin: 0; background: var(--page-bg); }
    main { width: 100%; height: 100dvh; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 320px); gap: 18px; padding: 16px; overflow: hidden; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { font-size: 22px; line-height: 1.1; margin-bottom: 4px; }
    h2 { font-size: 19px; margin-bottom: 12px; }
    h3 { font-size: 15px; margin-bottom: 8px; }
    p { line-height: 1.65; color: var(--text); }
    a { color: inherit; }
    .app-shell { height: calc(100dvh - 32px); min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; overflow: hidden; }
    .topbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 4px 2px 20px; }
    .top-left, .top-right { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .round-button, .tool-button, .send-button { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border); background: var(--button); color: var(--text); text-decoration: none; font: inherit; font-weight: 750; }
    .menu-open { cursor: pointer; }
    .round-button { width: 44px; height: 44px; border-radius: 999px; font-size: 24px; flex: 0 0 auto; }
    .tool-button { min-height: 40px; border-radius: 999px; padding: 0 14px; white-space: nowrap; }
    .top-action { min-width: 74px; }
    .thread-title { min-width: 0; }
    .thread-title h1 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .thread-title span { display: block; color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chat-scroll { min-height: 0; overflow: auto; padding: 8px 4px 28px; scroll-padding-bottom: 28px; display: flex; flex-direction: column; gap: 22px; scrollbar-width: thin; }
    .bubble { max-width: min(760px, 88%); color: var(--text); font-size: 17px; line-height: 1.72; }
    .bubble, .bubble p, .bubble li { overflow-wrap: anywhere; }
    .bubble-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .bubble strong { display: block; color: var(--muted); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 8px; }
    .bubble-header strong { margin-bottom: 0; }
    .bubble p { color: var(--text); margin-bottom: 12px; }
    .bubble .message-body { display: grid; gap: 12px; }
    .bubble .message-body p { margin: 0; white-space: pre-wrap; }
    .bubble .message-body ul { margin: 0; }
    .bubble .message-body li + li { margin-top: 4px; }
    .bubble .message-body code { font-size: .94em; }
    .bubble .message-body pre { position: relative; margin: 0; padding: 42px 14px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel-strong); overflow-x: auto; white-space: pre; max-width: 100%; }
    .bubble .message-body pre.wrap-code { overflow-x: visible; white-space: pre-wrap; }
    .bubble .message-body pre code { display: block; font-size: 14px; line-height: 1.55; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
    .bubble .message-body pre.wrap-code code { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
    .bubble .message-body strong { display: inline; color: inherit; font-size: inherit; letter-spacing: 0; text-transform: none; margin: 0; font-weight: 800; }
    .copy-message, .copy-code { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 1px solid var(--border); border-radius: 999px; background: var(--button); color: var(--text); font-size: 15px; line-height: 1; cursor: pointer; }
    .copy-message:focus-visible, .copy-code:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
    .copy-code { position: absolute; top: 8px; right: 8px; z-index: 1; opacity: .88; }
    .copy-code:hover, .copy-code:focus-visible { opacity: 1; }
    .bubble ul { margin: 0; padding-left: 22px; color: var(--text); line-height: 1.85; }
    .bubble.owner { position: relative; align-self: flex-end; background: var(--owner-bubble); color: var(--owner-text); border-radius: 24px; padding: 12px 16px; }
    .bubble.owner p { color: var(--owner-text); margin: 0; }
    .bubble.owner .copy-message { position: absolute; top: -12px; left: -12px; width: 28px; height: 28px; background: var(--panel-strong); color: var(--text); opacity: .86; }
    .bubble.owner .copy-message:hover, .bubble.owner .copy-message:focus-visible { opacity: 1; }
    .bubble.thinking { color: var(--muted); }
    .thinking-dots::after { content: ""; display: inline-block; width: 1.4em; text-align: left; animation: thinkingDots 1.2s steps(4, end) infinite; }
    @keyframes thinkingDots { 0% { content: ""; } 25% { content: "."; } 50% { content: ".."; } 75%, 100% { content: "..."; } }
    .connection-note { display: inline-flex; align-items: center; width: fit-content; border: 1px solid var(--border); border-radius: 999px; padding: 5px 10px; color: var(--muted); font-size: 13px; }
    .chat-link { color: var(--text); text-decoration-thickness: 1px; text-underline-offset: 4px; font-weight: 750; overflow-wrap: anywhere; word-break: break-word; }
    .composer { min-width: 0; display: grid; gap: 8px; z-index: 4; padding: 14px 0 max(16px, env(safe-area-inset-bottom)); background: var(--page-bg); }
    .composer-box { display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; align-items: end; gap: 8px; min-height: 62px; padding: 8px; border: 1px solid var(--border); border-radius: 28px; background: var(--panel-strong); box-shadow: 0 16px 60px var(--shadow); }
    textarea { width: 100%; min-height: 44px; max-height: max(88px, min(160px, 24dvh)); border: 0; outline: 0; resize: none; overflow-y: hidden; padding: 10px 2px; color: var(--text); background: transparent; font: inherit; line-height: 1.45; }
    textarea::placeholder { color: var(--muted); }
    .media-button { width: 44px; height: 44px; border-radius: 999px; border: 1px solid var(--border); background: var(--button); color: var(--text); font: inherit; font-size: 24px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
    .send-button { width: 44px; height: 44px; border-radius: 999px; background: var(--text); color: var(--page-bg); font-size: 22px; }
    .pending-media, .message-media { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 8px; }
    .pending-media:empty, .message-media:empty { display: none; }
    .media-chip { display: inline-flex; align-items: center; max-width: 100%; min-height: 34px; border: 1px solid var(--border); border-radius: 14px; padding: 5px 10px; gap: 8px; color: var(--text); background: var(--soft); font-size: 12px; text-decoration: none; }
    .media-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: min(48vw, 320px); }
    .media-thumb { width: 48px; height: 48px; flex: 0 0 auto; border-radius: 10px; object-fit: cover; background: var(--border); }
    .media-chip.pending-preview { padding: 5px 8px 5px 5px; }
    .media-remove { border: 0; background: transparent; color: var(--muted); font: inherit; font-weight: 900; padding: 0 2px; cursor: pointer; }
    .composer-status { min-height: 18px; padding-left: 16px; color: var(--muted); font-size: 12px; }
    .composer-status.thinking::after { content: ""; display: inline-block; width: 1.4em; text-align: left; animation: thinkingDots 1.2s steps(4, end) infinite; }
    .sidebar { position: sticky; top: 16px; align-self: start; max-height: calc(100dvh - 32px); overflow: auto; border: 1px solid var(--border); border-radius: 18px; background: var(--panel); }
    .sidebar > summary { display: flex; justify-content: space-between; align-items: center; gap: 10px; min-height: 58px; padding: 14px; list-style: none; }
    .sidebar > summary::-webkit-details-marker { display: none; }
    .sidebar-content { display: grid; gap: 12px; padding: 0 14px 14px; }
    .sidebar-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .eyebrow { color: var(--muted); font-size: 11px; font-weight: 850; letter-spacing: .1em; text-transform: uppercase; }
    .lane, details { border: 1px solid var(--border); border-radius: 14px; padding: 12px; background: var(--panel-strong); }
    .lane-title { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
    .pill { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 999px; padding: 3px 8px; color: var(--text); background: var(--soft); font-size: 12px; white-space: nowrap; }
    .pill.success { border-color: #7fb797; background: #e7f5ec; color: #145c34; }
    .pill.danger { border-color: #d69b9b; background: #fff0f0; color: #8a1f1f; }
    .deploy-event { border: 1px solid var(--border); border-radius: 12px; padding: 10px; margin: 10px 0; background: var(--soft); }
    .deploy-event p { margin-bottom: 6px; font-size: 13px; line-height: 1.45; }
    .quick-actions, .surface-list { display: grid; gap: 8px; }
    .quick-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .quick-actions a, .surface-list a { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; border: 1px solid var(--border); border-radius: 10px; padding: 7px 9px; color: var(--text); text-decoration: none; background: var(--soft); font-weight: 750; font-size: 13px; text-align: center; }
    summary { cursor: pointer; color: var(--text); font-weight: 800; }
    .muted { color: var(--muted); }
    code { color: var(--text); overflow-wrap: anywhere; }
    .menu-toggle { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    .mobile-backdrop, .mobile-drawer { display: none; }
    .menu-callout { color: var(--muted); font-size: 12px; line-height: 1.55; }
    @media (min-width: 1180px) {
      .chat-scroll { align-items: center; }
      .bubble.owner { margin-right: calc((100% - 760px) / 2); }
    }
    @media (max-width: 900px) {
      main { display: block; padding: 14px 14px 0; }
      .app-shell { height: calc(100dvh - 14px); }
      .topbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
      .sidebar { display: none; }
      .mobile-backdrop { position: fixed; inset: 0; z-index: 10; background: rgba(0, 0, 0, .38); backdrop-filter: blur(2px); }
      .mobile-drawer { position: fixed; top: 0; bottom: 0; left: 0; z-index: 11; width: min(86vw, 360px); overflow: auto; padding: max(16px, env(safe-area-inset-top)) 14px max(18px, env(safe-area-inset-bottom)); border-right: 1px solid var(--border); background: var(--panel); box-shadow: 18px 0 60px var(--shadow); }
      .menu-toggle:checked ~ .mobile-backdrop, .menu-toggle:checked ~ .mobile-drawer { display: block; }
      .mobile-drawer-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
      .mobile-drawer-content { display: grid; gap: 12px; }
      .chat-scroll { padding-bottom: 28px; }
      .bubble { max-width: 100%; font-size: 16px; }
      .bubble.owner { max-width: 82%; }
      .topbar { padding-bottom: 18px; }
    }
    @media (max-width: 460px) {
      main { padding: 12px 10px 0; }
      .app-shell { height: calc(100dvh - 12px); }
      .composer-box { grid-template-columns: 40px minmax(0, 1fr) 40px; border-radius: 24px; }
      .round-button { width: 40px; height: 40px; }
      .tool-button { min-height: 38px; padding: 0 10px; font-size: 13px; }
      .top-action { min-width: 64px; }
      .media-button, .send-button { width: 40px; height: 40px; }
    }
  </style>
</head>
<body>
  <main>
    <section class="app-shell" aria-label="Butler chat shell">
      <input class="menu-toggle" type="checkbox" id="mobile-menu-toggle" aria-hidden="true">
      <header class="topbar">
        <div class="top-left">
          <label class="round-button menu-open" for="mobile-menu-toggle" aria-label="管理メニューを開く">≡</label>
          <div class="thread-title">
            <h1>VTDD Butler</h1>
            <span>${escapeDashboardHtml(dashboardTargetLabel)} ・ dashboard main chat</span>
          </div>
        </div>
        <div class="top-right">
          <a class="tool-button top-action" href="${escapeDashboardHtml(origin)}/dashboard/notifications" aria-label="通知センター">通知</a>
          <a class="tool-button top-action" href="${escapeDashboardHtml(origin)}/dashboard/progress?repository=${encodedRepository}" aria-label="進捗を見る">進捗</a>
        </div>
      </header>

      <label class="mobile-backdrop" for="mobile-menu-toggle" aria-label="管理メニューを閉じる"></label>
      <aside class="mobile-drawer" aria-label="モバイル管理メニュー">
        <div class="mobile-drawer-header">
          <span>
            <span class="eyebrow">管理メニュー</span>
            <strong>必要な時だけ開く</strong>
          </span>
          <label class="round-button menu-open" for="mobile-menu-toggle" aria-label="管理メニューを閉じる">×</label>
        </div>
        <div class="mobile-drawer-content">
          <p class="menu-callout">状態確認、進捗、RAG、workflow はここから開きます。通知ではなく、現在は dashboard 内の状態表示です。</p>
          <div class="lane">
            <div class="lane-title"><h3>対象 repo</h3><span class="pill">${repositoryInput ? "resolved" : "未指定"}</span></div>
            ${targetStatusMarkup}
          </div>
          <div class="lane">
            <div class="lane-title"><h3>進行中 execution</h3><span class="pill">runtime truth</span></div>
            <p>GitHub Actions / VPS runner status / execution progress route から読みます。</p>
            ${renderDashboardDeployEvent(latestDeployEvent)}
          </div>
          <div class="quick-actions">
            ${cockpitActions.map((action) => `<a href="${escapeDashboardHtml(action.href)}">${escapeDashboardHtml(action.label)}</a>`).join("")}
          </div>
          <details open>
            <summary>Runtime surfaces</summary>
            <div class="surface-list">
              ${surfaces.map((surface) => `<a href="${escapeDashboardHtml(surface.href)}">${escapeDashboardHtml(surface.title)}</a>`).join("")}
            </div>
          </details>
          <details>
            <summary>GitHub workflows</summary>
            <div class="surface-list">
              ${workflows.map(([title, href]) => `<a href="${escapeDashboardHtml(href)}">${escapeDashboardHtml(title)}</a>`).join("")}
            </div>
          </details>
        </div>
      </aside>

      <div class="chat-scroll" id="butler-chat-log" data-thread-id="${escapeDashboardHtml(chatThreadId)}">
        <article class="bubble owner">
          <p>ここはカスタム GPT の Butler。</p>
        </article>
        <article class="bubble">
          <strong>Butler</strong>
          <p>はい。私は v2 の Butler として、Issue 駆動・GitHub runtime truth・VPS runner・Gemini reviewer・RAG・passkey 境界を扱います。</p>
          <p>この画面は会話を主役にするための chat-first runtime です。管理画面は右のサイドバーへ退避しました。</p>
          <ul>
            <li>関連 repo/nickname: <code>${escapeDashboardHtml(dashboardTargetLabel)}</code></li>
            <li>会話: Dashboard Butler は app-server bridge 経路を使います。旧 VPS runner 直送経路は使いません</li>
          </ul>
        </article>
        <article class="bubble owner">
          <p>管理画面的なヤツはサイドバーに置けば良くない？</p>
        </article>
        <article class="bubble">
          <strong>Butler</strong>
          <p>その方針で進めます。中央はチャットだけ、状態確認・進捗・RAG・workflow・prototype cleanup の扱いはサイドバーのメニューから必要な時だけ開きます。</p>
          <p>この dashboard から VPS Codex CLI を <code>codex exec</code> で毎回起動する旧経路は削除しました。Dashboard Butler は <code>codex app-server</code> bridge が常駐している時だけ live Codex thread に渡します。</p>
          <span class="connection-note">Dashboard thread 接続準備中: bridge が未接続なら Custom GPT Butler が fallback です</span>
        </article>

      </div>

      <form class="composer" id="butler-chat-form" aria-label="Butler composer" autocomplete="off" data-socket-endpoint="${escapeDashboardHtml(socketOrigin)}/v2/dashboard/chat/${escapeDashboardHtml(chatThreadId)}/ws" data-thread-endpoint="${escapeDashboardHtml(origin)}/v2/dashboard/chat/${escapeDashboardHtml(chatThreadId)}" data-message-endpoint="${escapeDashboardHtml(origin)}/v2/dashboard/chat/messages" data-thread-id="${escapeDashboardHtml(chatThreadId)}" data-repository-input="${escapeDashboardHtml(repositoryInput)}" data-issue-number="${dashboardIssueNumber || ""}">
        <div class="pending-media" id="butler-pending-media" aria-live="polite"></div>
        <div class="composer-box">
          <button class="media-button" id="butler-media-button" type="button" aria-label="画像やファイルを追加" title="画像やファイルを追加">+</button>
          <input id="butler-media-input" type="file" hidden>
          <textarea id="butler-message" name="text" placeholder="Butler V2 にメッセージ..." aria-label="Butler V2 にメッセージ" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send"></textarea>
          <button class="send-button" type="submit" aria-label="Butler に送信">↑</button>
        </div>
        <div class="composer-status" id="butler-chat-status">接続準備中です。WebSocket 接続後に送信できます。</div>
      </form>
    </section>

    <details id="tools" class="sidebar" aria-label="管理サイドバーメニュー">
      <summary>
        <span>
          <span class="eyebrow">管理メニュー</span>
          <strong>必要な時だけ開く</strong>
        </span>
        <span class="pill">WebSocket</span>
      </summary>
      <div class="sidebar-content">
        <p class="menu-callout">状態確認、進捗、RAG、workflow はここから遷移します。普段の画面はチャットを主役にします。</p>

        <div class="lane">
          <div class="lane-title"><h3>関連 repo</h3><span class="pill">resolved</span></div>
          ${targetStatusMarkup}
        </div>

        <div class="lane">
          <div class="lane-title"><h3>Issue 候補</h3><span class="pill">draft</span></div>
          <p>Dashboard Butler の自然文入口は <code>codex app-server</code> 用に作り直します。旧 VPS runner 直送では通常会話を処理しません。</p>
        </div>

        <div class="lane">
          <div class="lane-title"><h3>進行中 execution</h3><span class="pill">runtime truth</span></div>
          <p>進捗は GitHub Actions / VPS runner status / execution progress route から読みます。</p>
          ${renderDashboardDeployEvent(latestDeployEvent)}
          <div class="quick-actions">
            ${cockpitActions.map((action) => `<a href="${escapeDashboardHtml(action.href)}">${escapeDashboardHtml(action.label)}</a>`).join("")}
          </div>
        </div>

        <details>
          <summary>Runtime surfaces</summary>
          <div class="surface-list">
            ${surfaces.map((surface) => `<a href="${escapeDashboardHtml(surface.href)}">${escapeDashboardHtml(surface.title)}</a>`).join("")}
          </div>
        </details>

        <details>
          <summary>GitHub workflows</summary>
          <div class="surface-list">
            ${workflows.map(([title, href]) => `<a href="${escapeDashboardHtml(href)}">${escapeDashboardHtml(title)}</a>`).join("")}
          </div>
        </details>

        <details>
          <summary>Prototype cleanup</summary>
          <p>v3 Worker prototype の削除や移行は destructive operation 扱いです。必要になった時だけ、対象 runtime と scope を明示した passkey approval で扱います。</p>
        </details>
      </div>
    </details>
  </main>
  <script>
    (() => {
      const form = document.getElementById("butler-chat-form");
      const log = document.getElementById("butler-chat-log");
      const textarea = document.getElementById("butler-message");
      const status = document.getElementById("butler-chat-status");
      const mediaButton = document.getElementById("butler-media-button");
      const mediaInput = document.getElementById("butler-media-input");
      const pendingMedia = document.getElementById("butler-pending-media");
      if (!form || !log || !textarea || !status) return;

      const socketEndpoint = form.dataset.socketEndpoint;
      const threadEndpoint = form.dataset.threadEndpoint;
      const messageEndpoint = form.dataset.messageEndpoint;
      const mediaUploadEndpoint = "/v2/media/upload";
      const threadId = form.dataset.threadId;
      const repositoryInput = form.dataset.repositoryInput;
      const issueNumber = Number.parseInt(form.dataset.issueNumber || "", 10);
      const initialMarkup = log.innerHTML;
      let chatSocket = null;
      let reconnectTimer = null;
      let reconnectAttempt = 0;
      let refreshingThread = false;
      let pendingMediaItems = [];
      const pendingSendRollbacks = new Map();
      const messagesById = new Map();
      let pendingOwnerSend = null;
      let retryClientMessageId = "";

      function updateComposerReserve() {
        log.style.setProperty("--composer-reserve", Math.ceil(form.getBoundingClientRect().height) + "px");
      }

      function resizeComposerInput() {
        const maxHeight = Math.max(88, Math.min(160, Math.floor(window.innerHeight * 0.24)));
        textarea.style.height = "auto";
        const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
        textarea.style.height = nextHeight + "px";
        textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
        updateComposerReserve();
      }

      function scrollToLatest() {
        updateComposerReserve();
        log.scrollTop = log.scrollHeight;
        requestAnimationFrame(() => {
          log.scrollTop = log.scrollHeight;
        });
      }

      function setStatus(text, options = {}) {
        status.textContent = text;
        status.classList.toggle("thinking", options.thinking === true);
        if (options.temporary === true) {
          const expected = text;
          window.setTimeout(() => {
            if (status.textContent === expected) {
              setStatus("Dashboard thread 接続済み。");
            }
          }, 2400);
        }
      }

      function setComposerLocked(locked) {
        textarea.readOnly = locked === true;
        if (mediaButton) mediaButton.disabled = locked === true;
      }

      function isChatSocketOpen() {
        return Boolean(chatSocket && chatSocket.readyState === WebSocket.OPEN);
      }

      function isAuthExpiredResponse(response, body = {}) {
        return (
          response &&
          (response.status === 401 || response.status === 403) &&
          (body.error === "dashboard_auth_required" || String(body.reason || "").includes("passkey session"))
        );
      }

      function setDashboardSessionExpiredStatus() {
        setStatus("Dashboard のログインが切れています。入力は残したまま、右上の Passkey から再ログインしてください。");
      }

      function releasePendingOwnerSend(clientMessageId, options = {}) {
        if (!pendingOwnerSend || pendingOwnerSend.clientMessageId !== clientMessageId) return false;
        const pending = pendingOwnerSend;
        pendingOwnerSend = null;
        if (pending.timeoutId && options.keepRollbackTimer !== true) {
          window.clearTimeout(pending.timeoutId);
        }
        setComposerLocked(false);
        if (pending.submitButton) {
          pending.submitButton.disabled = false;
        }
        if (options.clearComposer === true) {
          retryClientMessageId = "";
          if (textarea.value.trim() === pending.text) {
            textarea.value = "";
          }
          revokePendingMediaPreviews();
          pendingMediaItems = [];
          renderPendingMedia();
          resizeComposerInput();
        } else {
          retryClientMessageId = pending.clientMessageId;
        }
        updateComposerReserve();
        return true;
      }

      function appendMessage(message) {
        const article = document.createElement("article");
        article.className = message.role === "owner" ? "bubble owner" : "bubble";
        if (message.role === "owner") {
          const copyButton = document.createElement("button");
          copyButton.className = "copy-message";
          copyButton.type = "button";
          copyButton.textContent = "⧉";
          copyButton.setAttribute("aria-label", "自分の発言をコピー");
          copyButton.title = "自分の発言をコピー";
          copyButton.addEventListener("click", () => copyMessageText(copyButton, normalizeMessageCopyText(message.text || "")));
          article.appendChild(copyButton);
        } else if (message.role === "butler") {
          const header = document.createElement("div");
          header.className = "bubble-header";
          const strong = document.createElement("strong");
          strong.textContent = "Butler";
          header.appendChild(strong);
          const copyButton = document.createElement("button");
          copyButton.className = "copy-message";
          copyButton.type = "button";
          copyButton.textContent = "⧉";
          copyButton.setAttribute("aria-label", "返信をコピー");
          copyButton.title = "返信をコピー";
          copyButton.addEventListener("click", () => copyMessageText(copyButton, normalizeMessageCopyText(message.text || "")));
          header.appendChild(copyButton);
          article.appendChild(header);
        } else if (message.role === "system") {
          const header = document.createElement("div");
          header.className = "bubble-header";
          const strong = document.createElement("strong");
          strong.textContent = "SYSTEM";
          header.appendChild(strong);
          article.appendChild(header);
        }
        const body = document.createElement("div");
        body.className = "message-body";
        renderMessageText(body, normalizeMessageDisplayText(message.text || "（空のメッセージ）"));
        article.appendChild(body);
        const media = renderMediaReferences(message.mediaReferences || message.media_references || []);
        if (media) {
          article.appendChild(media);
        }
        log.appendChild(article);
        scrollToLatest();
      }

      function renderMediaReferences(references) {
        const list = Array.isArray(references) ? references : [];
        if (list.length === 0) return null;
        const wrapper = document.createElement("div");
        wrapper.className = "message-media";
        for (const reference of list) {
          const link = document.createElement("a");
          link.className = "media-chip";
          const mediaRouteHref = reference.mediaId ? "/v2/media/" + reference.mediaId + "/download" : "";
          const referenceDownloadUrl = typeof reference.downloadUrl === "string" ? reference.downloadUrl : "";
          const safeDownloadHref = referenceDownloadUrl.startsWith("/v2/media/") ? referenceDownloadUrl : "";
          const downloadHref = mediaRouteHref || safeDownloadHref || "#";
          link.href = downloadHref;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.textContent = "";
          const isImage = String(reference.contentType || "").startsWith("image/");
          if (isImage && downloadHref !== "#") {
            const image = document.createElement("img");
            image.className = "media-thumb";
            image.src = downloadHref;
            image.alt = reference.filename || "添付画像";
            image.loading = "lazy";
            link.appendChild(image);
          } else {
            const icon = document.createElement("span");
            icon.textContent = "添付";
            link.appendChild(icon);
          }
          const label = document.createElement("span");
          label.textContent = reference.filename || reference.mediaId || "media";
          link.appendChild(label);
          wrapper.appendChild(link);
        }
        return wrapper;
      }

      function revokePendingMediaPreview(item) {
        if (item && item.previewUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(item.previewUrl);
        }
      }

      function revokePendingMediaPreviews(items = pendingMediaItems) {
        for (const item of Array.isArray(items) ? items : []) {
          revokePendingMediaPreview(item);
        }
      }

      function renderPendingMedia() {
        if (!pendingMedia) return;
        pendingMedia.replaceChildren();
        for (const item of pendingMediaItems) {
          const chip = document.createElement("span");
          chip.className = "media-chip";
          if (item.previewUrl) {
            chip.classList.add("pending-preview");
            const image = document.createElement("img");
            image.className = "media-thumb";
            image.src = item.previewUrl;
            image.alt = item.filename || "送信待ち画像";
            chip.appendChild(image);
          }
          const label = document.createElement("span");
          label.textContent = item.filename || "attachment";
          const remove = document.createElement("button");
          remove.className = "media-remove";
          remove.type = "button";
          remove.textContent = "×";
          remove.setAttribute("aria-label", "添付を外す");
          remove.addEventListener("click", () => {
            revokePendingMediaPreview(item);
            pendingMediaItems = pendingMediaItems.filter((candidate) => candidate.clientId !== item.clientId);
            renderPendingMedia();
            updateComposerReserve();
          });
          chip.appendChild(label);
          chip.appendChild(remove);
          pendingMedia.appendChild(chip);
        }
        updateComposerReserve();
      }

      function normalizeMessageDisplayText(text) {
        return decodeSafeChatCommandText(String(text || ""));
      }

      function normalizeMessageCopyText(text) {
        return decodeSafeChatCommandText(String(text || ""));
      }

      function decodeSafeChatCommandText(text) {
        const source = String(text || "");
        return source
          .split("\\n")
          .map((line) => {
            if (!/^[a-z][a-z0-9+.-]*:%[0-9a-f]{2}/i.test(line)) {
              return line;
            }
            if (/^https?:/i.test(line)) {
              return line;
            }
            try {
              return decodeURIComponent(line);
            } catch {
              return line;
            }
          })
          .join("\\n");
      }

      function shouldWrapCodeBlock(text) {
        const source = String(text || "").trim();
        if (!source) return false;
        if (/^https?:\\/\\//i.test(source)) return true;
        if (/^[a-z][a-z0-9+.-]*:%[0-9a-f]{2}/i.test(source)) return true;
        return source.length > 80 && !/\\s/.test(source);
      }

      function renderMessageText(container, text) {
        const source = String(text || "");
        const lines = source.replace(/\\r\\n/g, "\\n").split("\\n");
        const fence = String.fromCharCode(96, 96, 96);
        let index = 0;
        while (index < lines.length) {
          if (!lines[index].trim()) {
            index += 1;
            continue;
          }
          if (lines[index].trim().startsWith(fence)) {
            const language = lines[index].trim().slice(fence.length).trim();
            const codeLines = [];
            index += 1;
            while (index < lines.length && !lines[index].trim().startsWith(fence)) {
              codeLines.push(lines[index]);
              index += 1;
            }
            if (index < lines.length && lines[index].trim().startsWith(fence)) {
              index += 1;
            }
            const pre = document.createElement("pre");
            const codeText = codeLines.join("\\n");
            if (shouldWrapCodeBlock(codeText)) {
              pre.className = "wrap-code";
            }
            const copyButton = document.createElement("button");
            copyButton.className = "copy-code";
            copyButton.type = "button";
            copyButton.textContent = "⧉";
            copyButton.setAttribute("aria-label", "コードをコピー");
            copyButton.title = "コードをコピー";
            copyButton.addEventListener("click", () => copyMessageText(copyButton, codeText));
            const code = document.createElement("code");
            if (language) {
              code.dataset.language = language;
            }
            code.textContent = codeText;
            pre.appendChild(copyButton);
            pre.appendChild(code);
            container.appendChild(pre);
            continue;
          }
          if (/^\\s*-\\s+/.test(lines[index])) {
            const list = document.createElement("ul");
            while (index < lines.length && /^\\s*-\\s+/.test(lines[index])) {
              const item = document.createElement("li");
              renderInlineMarkdown(item, lines[index].replace(/^\\s*-\\s+/, ""));
              list.appendChild(item);
              index += 1;
            }
            container.appendChild(list);
            continue;
          }
          const paragraph = document.createElement("p");
          const paragraphLines = [];
          while (index < lines.length && lines[index].trim() && !/^\\s*-\\s+/.test(lines[index])) {
            paragraphLines.push(lines[index]);
            index += 1;
          }
          paragraphLines.forEach((line, lineIndex) => {
            if (lineIndex > 0) paragraph.appendChild(document.createTextNode("\\n"));
            renderInlineMarkdown(paragraph, line);
          });
          container.appendChild(paragraph);
        }
      }

      function renderInlineMarkdown(container, text) {
        const source = String(text || "");
        const backtick = String.fromCharCode(96);
        const tokenPattern = new RegExp(
          "(https?:\\\\/\\\\/[^\\\\s<>\\\"']+)|\\\\*\\\\*([\\\\s\\\\S]+?)\\\\*\\\\*|" + backtick + "([^" + backtick + "]+)" + backtick,
          "g"
        );
        let cursor = 0;
        for (const match of source.matchAll(tokenPattern)) {
          if (match.index > cursor) {
            container.appendChild(document.createTextNode(source.slice(cursor, match.index)));
          }
          if (match[1]) {
            const href = match[1];
            const link = document.createElement("a");
            link.className = "chat-link";
            link.href = href;
            link.textContent = href;
            link.target = "_blank";
            link.rel = "noreferrer";
            container.appendChild(link);
          } else if (match[2]) {
            const strong = document.createElement("strong");
            renderInlineMarkdown(strong, match[2]);
            container.appendChild(strong);
          } else if (match[3]) {
            const code = document.createElement("code");
            code.textContent = match[3];
            container.appendChild(code);
          }
          cursor = match.index + match[0].length;
        }
        if (cursor < source.length) {
          container.appendChild(document.createTextNode(source.slice(cursor)));
        }
      }

      async function copyMessageText(button, text) {
        const source = String(text || "");
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(source);
          } else {
            const copySource = document.createElement("textarea");
            copySource.value = source;
            copySource.setAttribute("readonly", "");
            copySource.style.position = "fixed";
            copySource.style.left = "-9999px";
            document.body.appendChild(copySource);
            copySource.select();
            document.execCommand("copy");
            copySource.remove();
          }
          const previous = button.textContent;
          button.textContent = "✓";
          window.setTimeout(() => {
            button.textContent = previous;
          }, 1200);
        } catch {
          setStatus("コピーに失敗しました。長押しで本文を選択してください。");
        }
      }

      async function prepareUploadFile(file) {
        if (!file || !file.type || !file.type.startsWith("image/")) {
          return file;
        }
        if (file.size <= 5 * 1024 * 1024 || typeof createImageBitmap !== "function") {
          return file;
        }
        try {
          const bitmap = await createImageBitmap(file);
          const maxSide = 1600;
          const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
          const width = Math.max(1, Math.round(bitmap.width * scale));
          const height = Math.max(1, Math.round(bitmap.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          context.drawImage(bitmap, 0, 0, width, height);
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
          if (!blob || blob.size >= file.size) {
            return file;
          }
          return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
        } catch {
          return file;
        }
      }

      function createClientMessageId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
          return "dashboard_owner_message:" + window.crypto.randomUUID();
        }
        return "dashboard_owner_message:" + Date.now().toString(36);
      }

      async function uploadSelectedMedia(file, options = {}) {
        const preparedFile = await prepareUploadFile(file);
        const formData = new FormData();
        formData.append("file", preparedFile, preparedFile.name || file.name || "attachment");
        formData.append("repositoryInput", repositoryInput || "");
        formData.append("threadId", threadId || "");
        formData.append("sourceSurface", "dashboard_butler");
        if (options.sourceEventId) {
          formData.append("sourceEventId", options.sourceEventId);
        }
        formData.append("visibility", "private");
        if (Number.isFinite(issueNumber)) {
          formData.append("relatedIssue", String(issueNumber));
        }
        if (options.allowLarge === true) {
          formData.append("allowLarge", "true");
        }
        const response = await fetch(mediaUploadEndpoint, {
          method: "POST",
          body: formData,
          credentials: "same-origin",
          headers: { "accept": "application/json" }
        });
        const body = await response.json().catch(() => ({}));
        if (response.status === 413 && body.error === "media_large_confirmation_required") {
          if (window.confirm("5MB を超える添付です。private として保存しますか？")) {
            return uploadSelectedMedia(preparedFile, { ...options, allowLarge: true });
          }
        }
        if (!response.ok || !body.ok || !body.media) {
          throw new Error(body.reason || "media upload failed");
        }
        return body.media;
      }

      async function uploadPendingMedia(sourceEventId) {
        const uploaded = [];
        try {
          for (const item of pendingMediaItems) {
            uploaded.push(await uploadSelectedMedia(item.file, { sourceEventId }));
          }
        } catch (error) {
          await rollbackAbandonedMedia(uploaded, sourceEventId);
          throw error;
        }
        return uploaded;
      }

      async function rollbackAbandonedMedia(mediaReferences, sourceEventId) {
        const references = Array.isArray(mediaReferences) ? mediaReferences : [];
        await Promise.allSettled(references.map(async (media) => {
          if (!media || !media.mediaId) return;
          const params = new URLSearchParams({ cleanup: "abandoned_send" });
          if (repositoryInput) params.set("repository", repositoryInput);
          if (Number.isFinite(issueNumber)) params.set("relatedIssue", String(issueNumber));
          if (sourceEventId) params.set("sourceEventId", sourceEventId);
          await fetch("/v2/media/" + encodeURIComponent(media.mediaId) + "?" + params.toString(), {
            method: "DELETE",
            credentials: "same-origin",
            headers: { "accept": "application/json" }
          });
        }));
      }

      function appendError(text) {
        appendMessage({ role: "butler", text });
      }

      function messageKey(message) {
        if (message && message.messageId) return String(message.messageId);
        return [
          message?.role || "system",
          message?.status || "sent",
          message?.createdAt || "",
          message?.repository || "",
          message?.relatedIssue || "",
          message?.text || ""
        ].join("\\u001f");
      }

      function renderThread(messages, options = {}) {
        const replace = options.replace === true;
        if (replace) {
          messagesById.clear();
        }
        if (!Array.isArray(messages) || messages.length === 0) {
          if (replace || messagesById.size === 0) {
            log.innerHTML = initialMarkup;
          }
          scrollToLatest();
          return;
        }
        for (const message of messages) {
          messagesById.set(messageKey(message), message);
        }
        log.replaceChildren();
        for (const message of messagesById.values()) {
          appendMessage(message);
        }
        scrollToLatest();
      }

      async function refreshThread() {
        if (!threadEndpoint || refreshingThread) return { ok: false, skipped: true };
        refreshingThread = true;
        try {
          const response = await fetch(threadEndpoint, {
            headers: { "accept": "application/json" },
            credentials: "same-origin"
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            if (isAuthExpiredResponse(response, body)) {
              setDashboardSessionExpiredStatus();
              return { ok: false, authExpired: true };
            }
            setStatus("履歴の再取得に失敗しました。入力は保持しています。WebSocket を再接続しています。");
            return { ok: false, status: response.status };
          }
          if (body && body.ok) {
            renderThread(body.messages || [], { replace: true });
            return { ok: true };
          }
        } catch {
          setStatus("履歴の再取得に失敗しました。入力は保持しています。WebSocket を再接続しています。");
          return { ok: false, network: true };
        } finally {
          refreshingThread = false;
        }
        return { ok: false };
      }

      function scheduleReconnect() {
        if (reconnectTimer || !socketEndpoint || typeof WebSocket !== "function") return;
        const delay = Math.min(10000, 1000 * Math.pow(2, reconnectAttempt));
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connectThreadSocket();
        }, delay);
      }

      function connectThreadSocket() {
        if (!socketEndpoint || typeof WebSocket !== "function") {
          setStatus("WebSocket を開始できません。dashboard Butler は送信できません。");
          return;
        }
        if (chatSocket && (chatSocket.readyState === WebSocket.OPEN || chatSocket.readyState === WebSocket.CONNECTING)) {
          return;
        }
        chatSocket = new WebSocket(socketEndpoint);
        chatSocket.addEventListener("open", () => {
          reconnectAttempt = 0;
          if (reconnectTimer) {
            window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          setStatus("Dashboard thread 接続済み。app-server bridge が接続中なら live Codex thread に送ります。");
          refreshThread();
        });
        chatSocket.addEventListener("message", (event) => {
          try {
            const body = JSON.parse(event.data || "{}");
            if (body.type === "thread" && body.ok) {
              renderThread(body.messages || [], { replace: false });
              const lastMessage = Array.isArray(body.messages) ? body.messages[body.messages.length - 1] : null;
              if (lastMessage?.role === "butler" && lastMessage?.status === "replied") {
                setStatus("返信を受信しました。", { temporary: true });
              }
            } else if (body.type === "transient_status" && body.ok) {
              const isThinking = body.status === "thinking";
              setStatus(body.text || (isThinking ? "codex app-server が応答を生成しています" : "codex app-server の応答が完了しました。"), {
                thinking: isThinking,
                temporary: !isThinking
              });
            } else if (body.type === "owner_message_accepted" && body.ok) {
              const clientMessageId = body.clientMessageId || body.client_message_id || "";
              if (clientMessageId) {
                pendingSendRollbacks.delete(clientMessageId);
                releasePendingOwnerSend(clientMessageId, { clearComposer: true });
                setStatus("送信を保存しました。app-server bridge の返信を待っています", { thinking: true });
              }
            } else if (body.type === "error") {
              const clientMessageId = body.clientMessageId || body.client_message_id || "";
              if (clientMessageId && pendingSendRollbacks.has(clientMessageId)) {
                const mediaReferences = pendingSendRollbacks.get(clientMessageId) || [];
                pendingSendRollbacks.delete(clientMessageId);
                releasePendingOwnerSend(clientMessageId, { clearComposer: false });
                rollbackAbandonedMedia(mediaReferences, clientMessageId).catch(() => {});
              }
              appendError(body.reason || "WebSocket message error");
            }
          } catch {
            appendError("WebSocket message を読み取れませんでした。");
          }
        });
        chatSocket.addEventListener("close", () => {
          if (pendingOwnerSend) {
            releasePendingOwnerSend(pendingOwnerSend.clientMessageId, { clearComposer: false, keepRollbackTimer: true });
            setStatus("送信確認前に WebSocket が切れました。入力は残しています。履歴再取得後にもう一度送信できます。");
          } else {
            setStatus("WebSocket が切れました。履歴を再取得して再接続します。");
          }
          refreshThread();
          scheduleReconnect();
        });
        chatSocket.addEventListener("error", () => {
          if (pendingOwnerSend) {
            releasePendingOwnerSend(pendingOwnerSend.clientMessageId, { clearComposer: false, keepRollbackTimer: true });
            setStatus("送信確認前に WebSocket 接続が失敗しました。入力は残しています。再接続後にもう一度送信できます。");
          } else {
            setStatus("WebSocket 接続に失敗しました。履歴を再取得して再接続します。");
          }
          refreshThread();
          scheduleReconnect();
        });
      }

      async function sendOwnerMessageByHttp(payload, clientMessageId) {
        if (!messageEndpoint) {
          throw new Error("HTTP fallback endpoint is not configured");
        }
        const response = await fetch(messageEndpoint, {
          method: "POST",
          headers: {
            "accept": "application/json",
            "content-type": "application/json"
          },
          credentials: "same-origin",
          body: JSON.stringify(payload)
        });
        const body = await response.json().catch(() => ({}));
        if (isAuthExpiredResponse(response, body)) {
          const error = new Error("dashboard session expired");
          error.authExpired = true;
          throw error;
        }
        if (!response.ok || !body.ok) {
          throw new Error(body.reason || "dashboard chat fallback failed");
        }
        pendingSendRollbacks.delete(clientMessageId);
        releasePendingOwnerSend(clientMessageId, { clearComposer: true });
        renderThread(body.messages || [], { replace: false });
        setStatus("WebSocket 未接続のため HTTP fallback で保存しました。再接続を続けています。", { temporary: true });
        scheduleReconnect();
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const text = textarea.value.trim() || (pendingMediaItems.length > 0 ? "添付を追加しました。" : "");
        if (!text) {
          textarea.focus();
          return;
        }
        const submitButton = form.querySelector("button[type='submit']");
        if (submitButton) submitButton.disabled = true;
        setComposerLocked(true);
        const willUseHttpFallback = !isChatSocketOpen();
        if (willUseHttpFallback) {
          setStatus("WebSocket 再接続中です。入力は保持したまま HTTP fallback で保存します。", { thinking: true });
          scheduleReconnect();
        } else {
          setStatus(pendingMediaItems.length > 0 ? "添付を保存してから送信しています" : "送信中です", { thinking: true });
        }
        let mediaReferences = [];
        const clientMessageId = retryClientMessageId || createClientMessageId();
        try {
          mediaReferences = await uploadPendingMedia(clientMessageId);
        } catch (error) {
          setStatus((error && error.message) || "添付の保存に失敗しました。");
          setComposerLocked(false);
          if (submitButton) submitButton.disabled = false;
          textarea.focus({ preventScroll: true });
          return;
        }
        pendingSendRollbacks.set(clientMessageId, mediaReferences);
        pendingOwnerSend = {
          clientMessageId,
          text,
          mediaReferences,
          submitButton,
          timeoutId: window.setTimeout(() => {
            if (!pendingSendRollbacks.has(clientMessageId)) return;
            const rollbackMediaReferences = pendingSendRollbacks.get(clientMessageId) || [];
            pendingSendRollbacks.delete(clientMessageId);
            releasePendingOwnerSend(clientMessageId, { clearComposer: false });
            rollbackAbandonedMedia(rollbackMediaReferences, clientMessageId).catch(() => {});
            setStatus("送信確認が返りませんでした。入力は残しています。再接続後にもう一度送信してください。");
          }, 30000)
        };
        const ownerPayload = {
          type: "owner_message",
          threadId,
          clientMessageId,
          repositoryInput,
          text,
          issueNumber,
          relatedIssue: issueNumber,
          mediaReferences
        };
        if (!isChatSocketOpen()) {
          try {
            await sendOwnerMessageByHttp(ownerPayload, clientMessageId);
          } catch (error) {
            pendingSendRollbacks.delete(clientMessageId);
            releasePendingOwnerSend(clientMessageId, { clearComposer: false });
            if (error && error.authExpired) {
              setDashboardSessionExpiredStatus();
            } else {
              setStatus((error && error.message) || "WebSocket と HTTP fallback の両方で送信できませんでした。入力は残しています。");
            }
            textarea.focus({ preventScroll: true });
          }
          updateComposerReserve();
          return;
        }
        try {
          chatSocket.send(JSON.stringify(ownerPayload));
        } catch (error) {
          pendingSendRollbacks.delete(clientMessageId);
          releasePendingOwnerSend(clientMessageId, { clearComposer: false });
          await rollbackAbandonedMedia(mediaReferences, clientMessageId);
          setStatus((error && error.message) || "送信に失敗したため、保存済み添付を破棄しました。");
          textarea.focus({ preventScroll: true });
          return;
        }
        setStatus("送信確認を待っています。入力は保存確認まで残します。", { thinking: true });
        textarea.focus({ preventScroll: true });
        updateComposerReserve();
      });

      if (mediaButton && mediaInput) {
        mediaButton.addEventListener("click", () => mediaInput.click());
        mediaInput.addEventListener("change", async () => {
          const file = mediaInput.files && mediaInput.files[0];
          mediaInput.value = "";
          if (!file) return;
          try {
            mediaButton.disabled = true;
            const preparedFile = await prepareUploadFile(file);
            const previewUrl =
              preparedFile && preparedFile.type && preparedFile.type.startsWith("image/") && typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
                ? URL.createObjectURL(preparedFile)
                : "";
            const nextPendingMediaItems = [
              ...pendingMediaItems,
              {
                clientId: Date.now() + "_" + Math.random().toString(36).slice(2),
                filename: preparedFile.name || file.name || "attachment",
                previewUrl,
                file: preparedFile
              }
            ];
            const retainedPendingMediaItems = nextPendingMediaItems.slice(-12);
            for (const dropped of nextPendingMediaItems.slice(0, Math.max(0, nextPendingMediaItems.length - 12))) {
              revokePendingMediaPreview(dropped);
            }
            pendingMediaItems = retainedPendingMediaItems;
            renderPendingMedia();
            setStatus("添付を送信待ちに追加しました。repo 未指定の通常会話では private media として保存します。", { temporary: true });
            textarea.focus({ preventScroll: true });
          } catch (error) {
            setStatus((error && error.message) || "添付の保存に失敗しました。");
          } finally {
            mediaButton.disabled = false;
            updateComposerReserve();
          }
        });
      }

      resizeComposerInput();
      textarea.addEventListener("input", resizeComposerInput);
      window.addEventListener("resize", resizeComposerInput);
      window.addEventListener("online", () => {
        setStatus("ネットワーク復帰を検知しました。履歴を再取得して再接続します。");
        refreshThread();
        scheduleReconnect();
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && (!chatSocket || chatSocket.readyState !== WebSocket.OPEN)) {
          setStatus("画面復帰を検知しました。履歴を再取得して再接続します。");
          refreshThread();
          scheduleReconnect();
        }
      });
      connectThreadSocket();
    })();
  </script>
</body>
</html>`;
}

function renderDashboardAuthRequiredPage({ runtimeOrigin, reason } = {}) {
  const origin = normalizeText(runtimeOrigin);
  const dashboardSignInUrl = `${origin || ""}/v2/approval/passkey/operator?mode=dashboard&repositoryInput=marushu%2Fvtdd-v2-p&phase=execution&actionType=read&highRiskKind=dashboard_access`;
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard auth required</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17211d; background: #f8faf8; }
    body { margin: 0; }
    main { width: min(720px, calc(100% - 32px)); margin: 0 auto; padding: 56px 0; }
    .panel { background: #fff; border: 1px solid #d8e2dc; border-radius: 8px; padding: 24px; box-shadow: 0 12px 32px rgba(24, 37, 31, .08); }
    h1 { margin: 0 0 12px; font-size: 30px; }
    p { line-height: 1.7; color: #4d5c56; }
    a { color: #176b4d; font-weight: 750; }
    code { color: #5f6c66; }
  </style>
</head>
<body>
  <main>
    <section class="panel">
      <h1>Dashboard auth required</h1>
      <p>この dashboard は owner-facing surface です。対象の GitHub / Cloudflare Access identity で認証されたユーザー、または machine-authenticated service だけが利用できます。</p>
      <p><code>${escapeDashboardHtml(reason || "dashboard authentication required")}</code></p>
      <p><a href="${escapeDashboardHtml(dashboardSignInUrl)}">Passkey で dashboard に入る</a></p>
      <p><a href="${escapeDashboardHtml(origin || "/status")}/status">Status</a></p>
    </section>
  </main>
</body>
</html>`;
}

function renderV2StatusPage({ runtimeOrigin, autonomyMode }) {
  const origin = normalize(runtimeOrigin);
  const mode = "v2";
  const resolvedAutonomyMode = normalizeText(autonomyMode) || "normal";
  const cards = [
    ["Worker", "正常", "Cloudflare Worker は応答しています。"],
    ["Mode", mode, "現在の runtime mode です。"],
    ["Autonomy", resolvedAutonomyMode, "guarded absence などの実行抑制状態を示します。"],
    ["Dashboard", "利用可能", "/dashboard と /orchestrator は人間向け入口です。"],
    ["Passkey", "same-origin", "高リスク操作は scope 明示済み passkey approval の後ろです。"]
  ];

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VTDD v2 Status</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #182125; background: #f7faf7; }
    body { margin: 0; }
    main { width: min(1040px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 48px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 20px; }
    h1 { font-size: clamp(32px, 6vw, 52px); line-height: 1; margin: 8px 0; }
    h2 { font-size: 24px; margin: 0 0 14px; }
    h3 { margin: 0 0 8px; font-size: 19px; }
    p { line-height: 1.7; color: #4d5c56; }
    .eyebrow { color: #2c7658; font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .panel { background: #fff; border: 1px solid #dce5dd; border-radius: 8px; padding: 22px; box-shadow: 0 10px 30px rgba(28, 44, 35, .06); margin: 16px 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
    .card { border: 1px solid #dce5dd; border-radius: 8px; padding: 16px; background: #fbfdfb; }
    .badge { display: inline-flex; align-items: center; border: 1px solid #c8d8cc; border-radius: 999px; padding: 4px 9px; color: #315245; background: #f7faf7; font-size: 13px; font-weight: 750; }
    a.button, .card a { display: inline-flex; align-items: center; justify-content: center; border: 1px solid #b9cabe; border-radius: 7px; padding: 9px 12px; color: #0f513b; font-weight: 750; text-decoration: none; background: #f8fbf8; }
    a.primary { background: #247a5b; color: #fff; border-color: #247a5b; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    .notice { border-color: #d8e6d5; background: #f7fcf8; }
    code { color: #596860; }
    @media (max-width: 640px) { header { display: block; } main { width: min(100% - 20px, 1040px); padding-top: 16px; } .actions a { width: 100%; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <p class="eyebrow">VTDD v2 status</p>
        <h1>Runtime Status</h1>
        <p>ブラウザで見るための health summary です。</p>
      </div>
      <a class="button" href="${escapeDashboardHtml(origin)}/dashboard">Dashboard</a>
    </header>

    <section class="panel notice">
      <h2>現在の状態</h2>
      <p><span class="badge">正常</span></p>
      <p>Worker は応答しています。ここでは secret、token、approval grant は表示しません。</p>
      <div class="actions">
        <a class="primary" href="${escapeDashboardHtml(origin)}/dashboard">Butler dashboard</a>
        <a href="${escapeDashboardHtml(origin)}/v2/approval/passkey/operator?repositoryInput=marushu%2Fvtdd-v2-p">Passkey operator</a>
      </div>
    </section>

    <section class="panel">
      <h2>Summary</h2>
      <div class="grid">
        ${cards.map(([title, status, body]) => `<article class="card">
          <h3>${escapeDashboardHtml(title)}</h3>
          <p><span class="badge">${escapeDashboardHtml(status)}</span></p>
          <p>${escapeDashboardHtml(body)}</p>
        </article>`).join("")}
      </div>
    </section>
  </main>
</body>
</html>`;
}

function escapeDashboardHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...extraHeaders
    }
  });
}

function html(status, body) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache"
    }
  });
}

function javascript(status, body) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache"
    }
  });
}

function svg(status, body) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600"
    }
  });
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function isSocketOpen(socket) {
  return socket?.readyState === 1 || (typeof WebSocket !== "undefined" && socket?.readyState === WebSocket.OPEN);
}

function normalizeBody(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function normalizeTag(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "_");
}

function parseBearerToken(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  const [scheme, token] = text.split(/\s+/, 2);
  if (normalize(scheme) !== "bearer") {
    return "";
  }
  return normalizeText(token);
}

function isApiPath(pathname, suffix) {
  return (
    pathname === `${CANONICAL_API_PREFIX}${suffix}` || pathname === `${LEGACY_API_PREFIX}${suffix}`
  );
}
