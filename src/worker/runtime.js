import {
  AutonomyMode,
  ActorRole,
  buildCustomGptRecoveryBundle,
  CustomGptSetupChannel,
  MemoryRecordType,
  appendDecisionLogFromGateway,
  appendProposalLogFromGateway,
  buildVpsCapabilityProposal,
  buildVpsPrivilegedMaintenanceInstallInventory,
  buildVpsMaintenanceApprovalScope,
  listVpsPrivilegedMaintenanceCommandRegistry,
  planVpsPrivilegedMaintenanceHelperExecution,
  createCloudflareMemoryProvider,
  createPasskeyApprovalOptions,
  createPasskeyRegistrationOptions,
  createMemoryRecord,
  createRemoteCodexExecutionRequest,
  deleteRepositoryNickname,
  dedupePasskeys,
  dispatchRemoteCodexExecution,
  executeDeployProductionPlane,
  executeGitHubActionsVariableSync,
  executeGitHubActionsSecretSync,
  evaluateApprovalGrant,
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
  sanitizeGitHubActionsVariableSyncErrorMessage,
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
import dashboardButlerIconPngDataUrl from "./assets/dashboard-butler-icon-512.js";

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
const DASHBOARD_ICON_VERSION = "20260529-butler-v2";
const DASHBOARD_ICON_PNG_PATH = `/dashboard-icon-${DASHBOARD_ICON_VERSION}.png`;
const DASHBOARD_ICON_LINKS = `<link rel="icon" type="image/png" sizes="512x512" href="${DASHBOARD_ICON_PNG_PATH}">
  <link rel="shortcut icon" href="${DASHBOARD_ICON_PNG_PATH}">
  <link rel="apple-touch-icon" sizes="512x512" href="${DASHBOARD_ICON_PNG_PATH}">`;

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
      await this.drainPendingAppServerOwnerMessages({ threadId, bridgeSocket: server });
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
      const messages = store ? await store.appendMany(threadId, [ownerMessage]) : [ownerMessage].filter(Boolean);
      await this.writeAcceptedOwnerMessage({ threadId, clientMessageId, messageId: ownerMessage.messageId, acceptedAt: now });
      await this.writePendingAppServerOwnerMessage({
        threadId,
        ownerMessage,
        queuedAt: now
      });
      await this.broadcastThread({ threadId, messages });
      this.sendSocket(socket, {
        type: "owner_message_accepted",
        ok: true,
        clientMessageId,
        messageId: ownerMessage.messageId
      });
      await this.broadcastTransientStatus({
        threadId,
        text: "送信は保存済みです。app-server bridge の再接続後に同じ thread で続けられます。",
        status: "pending_app_server_bridge"
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
    const vpsMaintenanceMessages = await this.buildVpsMaintenanceIntentMessages({
      payload,
      threadId,
      repository,
      relatedIssue,
      text,
      now
    });
    if (vpsMaintenanceMessages) {
      const butlerMessages = store ? await store.appendMany(threadId, vpsMaintenanceMessages) : vpsMaintenanceMessages;
      await this.broadcastThread({ threadId, messages: [...messages, ...butlerMessages] });
      return;
    }
    await this.broadcastTransientStatus({
      threadId,
      status: "thinking",
      text: "app-server bridge の返信を待っています"
    });
    await this.dispatchOwnerMessageToAppServerBridge({
      threadId,
      bridgeSocket: bridgeSockets[0],
      ownerMessage
    });
  }

  async dispatchOwnerMessageToAppServerBridge({ threadId, bridgeSocket, ownerMessage }) {
    const message = normalizeDashboardChatMessage(ownerMessage, { threadId });
    const text = sanitizeDashboardChatText(message.text || "");
    if (!threadId || !text || !bridgeSocket) {
      return false;
    }
    const repository = normalizeCanonicalRepositoryInput(message.repository);
    const relatedIssue = normalizePositiveInteger(message.relatedIssue || message.issueNumber);
    const mediaReferences = normalizeMediaReferences(message.mediaReferences || message.media_references || []);
    const trafficControl = await buildDashboardChatTrafficControlContext({
      env: this.env,
      repository,
      relatedIssue,
      text
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
      mediaReferences,
      messageId: message.messageId,
      createdAt: normalizeIsoTimestamp(message.createdAt || message.created_at) || new Date().toISOString(),
      appServer: {
        startThreadMethod: mapping.codexThreadId ? "thread/resume" : "thread/start",
        turnMethod: "turn/start"
      },
      authority: buildDashboardAppServerAuthorityHint({ repository, relatedIssue, text }),
      trafficControl
    };
    return this.sendSocket(bridgeSocket, turnRequest);
  }

  async buildVpsMaintenanceIntentMessages({ payload, threadId, repository, relatedIssue, text, now }) {
    if (!detectDashboardVpsPrivilegedMaintenanceIntent({ text })) {
      return null;
    }
    const flow = await buildDashboardVpsPrivilegedMaintenanceNaturalLanguageFlow({
      payload: {
        ...normalizeObject(payload),
        threadId,
        repository,
        relatedIssue,
        issueNumber: relatedIssue,
        text
      },
      repository,
      relatedIssue,
      origin: normalizeText(this.env?.VTDD_RUNTIME_URL || this.env?.VTDD_PASSKEY_ORIGIN) || "https://dashboard-butler.local",
      env: this.env
    });
    return [
      normalizeDashboardChatMessage(
        {
          threadId,
          role: "butler",
          repository,
          relatedIssue,
          status: normalizeDashboardChatStatus(flow?.messageStatus || "blocked"),
          text: flow?.reply || buildDashboardVpsPrivilegedMaintenanceReply({ repository, relatedIssue }),
          createdAt: new Date(Date.parse(now) + 1).toISOString()
        },
        { threadId }
      )
    ].filter(Boolean);
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
        text: normalized.transientText || normalized.text
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

  pendingAppServerOwnerMessagesKey(threadId) {
    const normalizedThreadId = normalizeDashboardThreadId(threadId);
    return normalizedThreadId ? `pending_app_server_owner_messages:${normalizedThreadId}` : "";
  }

  async readPendingAppServerOwnerMessages(threadId) {
    const key = this.pendingAppServerOwnerMessagesKey(threadId);
    if (!key || typeof this.ctx?.storage?.get !== "function") {
      return [];
    }
    try {
      const records = await this.ctx.storage.get(key);
      return Array.isArray(records) ? records.map((record) => normalizeObject(record)).filter((record) => record.messageId || record.ownerMessage) : [];
    } catch {
      return [];
    }
  }

  async writePendingAppServerOwnerMessages(threadId, records) {
    const key = this.pendingAppServerOwnerMessagesKey(threadId);
    if (!key || typeof this.ctx?.storage?.put !== "function") {
      return false;
    }
    await this.ctx.storage.put(key, Array.isArray(records) ? records : []);
    return true;
  }

  async writePendingAppServerOwnerMessage({ threadId, ownerMessage, queuedAt }) {
    const normalizedThreadId = normalizeDashboardThreadId(threadId);
    const message = normalizeDashboardChatMessage(ownerMessage, { threadId: normalizedThreadId });
    if (!normalizedThreadId || !message.messageId) {
      return false;
    }
    const records = await this.readPendingAppServerOwnerMessages(normalizedThreadId);
    const nextRecord = {
      messageId: message.messageId,
      ownerMessage: message,
      queuedAt: normalizeIsoTimestamp(queuedAt) || new Date().toISOString()
    };
    const nextRecords = [
      ...records.filter((record) => normalizeDashboardEventText(record.messageId || record.ownerMessage?.messageId) !== message.messageId),
      nextRecord
    ].slice(-20);
    return this.writePendingAppServerOwnerMessages(normalizedThreadId, nextRecords);
  }

  async drainPendingAppServerOwnerMessages({ threadId, bridgeSocket }) {
    const normalizedThreadId = normalizeDashboardThreadId(threadId);
    if (!normalizedThreadId || !bridgeSocket) {
      return { ok: false, drained: 0 };
    }
    const records = await this.readPendingAppServerOwnerMessages(normalizedThreadId);
    if (records.length === 0) {
      return { ok: true, drained: 0 };
    }
    const remaining = [];
    let drained = 0;
    for (const record of records) {
      const ownerMessage = normalizeDashboardChatMessage(record.ownerMessage || record, { threadId: normalizedThreadId });
      const sent = await this.dispatchOwnerMessageToAppServerBridge({
        threadId: normalizedThreadId,
        bridgeSocket,
        ownerMessage
      });
      if (sent) {
        drained += 1;
      } else {
        remaining.push(record);
      }
    }
    await this.writePendingAppServerOwnerMessages(normalizedThreadId, remaining);
    if (drained > 0) {
      await this.broadcastTransientStatus({
        threadId: normalizedThreadId,
        status: "thinking",
        text: "接続しました。保存済みの送信を app-server bridge に渡しました。"
      });
    }
    return { ok: true, drained, remaining: remaining.length };
  }
}
const CLOUDFLARE_ACCESS_JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const DASHBOARD_PASSKEY_SESSION_COOKIE = "vtdd_dashboard_session";
const DASHBOARD_READ_SESSION_KIND = "dashboard_read_session";
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

    if (
      request.method === "GET" &&
      (url.pathname === "/dashboard-icon.png" ||
        url.pathname === DASHBOARD_ICON_PNG_PATH ||
        url.pathname === "/apple-touch-icon.png" ||
        url.pathname === "/apple-touch-icon-precomposed.png")
    ) {
      return png(200, dashboardButlerIconPngDataUrl);
    }

    if (request.method === "GET" && isDashboardPagePath(url.pathname)) {
      const auth = await authorizeDashboardRequest({ request, env, apiSuffix: url.pathname });
      if (!auth.ok) {
        return html(
          auth.status,
          renderDashboardAuthRequiredPage({
            runtimeOrigin: url.origin,
            returnPath: `${url.pathname}${url.search}`,
            reason: auth.reason,
            passkeyFallbackReason: auth.passkeyFallbackReason
          })
        );
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

    if (request.method === "GET" && url.pathname === "/dashboard/news") {
      return html(200, renderDashboardNewsPage({ runtimeOrigin: url.origin, env }));
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

    if (request.method === "POST" && isApiPath(url.pathname, "/dashboard/push/ack")) {
      return handleDashboardPushAckRequest(request, env);
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
      return handlePasskeyOperatorPageRequest(request, env);
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

    if (request.method === "POST" && isApiPath(url.pathname, "/events/owner-action-required")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/events/owner-action-required"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleOwnerActionRequiredEventRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/vps/privileged-maintenance/proposals")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/vps/privileged-maintenance/proposals"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleVpsPrivilegedMaintenanceProposalRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/vps/privileged-maintenance/helper-requests")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/vps/privileged-maintenance/helper-requests"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleVpsPrivilegedMaintenanceHelperRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/vps/privileged-maintenance/helper-dry-runs")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/vps/privileged-maintenance/helper-dry-runs"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleVpsPrivilegedMaintenanceHelperDryRunRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/vps/privileged-maintenance/helper-executions")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/vps/privileged-maintenance/helper-executions"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleVpsPrivilegedMaintenanceHelperExecutionRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/vps/privileged-maintenance/helper-execution-queues")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/vps/privileged-maintenance/helper-execution-queues"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleVpsPrivilegedMaintenanceHelperExecutionQueueRequest(request, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/vps-maintenance-install-inventory")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/retrieve/vps-maintenance-install-inventory"
      });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleRetrieveVpsMaintenanceInstallInventoryRequest(url);
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

    if (request.method === "POST" && isApiPath(url.pathname, "/action/github-actions-variable")) {
      const auth = authorizePasskeyBrowserOrMachineRequest({
        request,
        env,
        apiSuffix: "/action/github-actions-variable"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleGitHubActionsVariableSyncRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/github-actions-variable/proposals")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/action/github-actions-variable/proposals"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleGitHubActionsVariableSyncProposalRequest(request, url, env);
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
    ".agents/skills/vtdd-chief-butler/SKILL.md",
    ".agents/skills/vtdd-status-advisor/SKILL.md",
    "docs/butler/thread-independent-startup-contract.md",
    "docs/butler/execution-queue-contract.md",
    "docs/mvp/active-issue-execution-queue.md",
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
  const executionQueue = buildStartupExecutionQueue({ sourceResults });
  const repoBackedSkills = buildStartupRepoBackedSkills({ sourceResults });
  const toolParityInventory = buildStartupToolParityInventory();

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
      "repo_backed_skills",
      "tool_parity_inventory",
      "thread_independent_startup_contract",
      "execution_queue_contract",
      "active_issue_execution_queue",
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
    repoBackedSkills,
    toolParityInventory,
    executionQueue,
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
    gapClassification: buildStartupGapClassification({
      currentSurface,
      missingSources,
      memoryResult,
      repoBackedSkills,
      toolParityInventory
    }),
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

function buildStartupToolParityInventory() {
  const tools = [
    {
      id: "git",
      label: "git branch/diff/main truth",
      category: "cli",
      macCodexUsage: "branch, commit, diff, log, main sync",
      repoBacked: false,
      butlerReachable: "runtime_truth_indirect",
      vpsExecutable: "expected",
      runtimeTruth: "unverified",
      gap: null
    },
    {
      id: "gh",
      label: "GitHub Issue/PR/Actions truth",
      category: "cli",
      macCodexUsage: "issue/pr/actions/review/comment operations",
      repoBacked: false,
      butlerReachable: "partially_via_github_actions",
      vpsExecutable: "expected_with_github_app_or_token",
      runtimeTruth: "partial",
      gap: "vps_auth_inventory_unverified"
    },
    {
      id: "node-npm",
      label: "Node/npm validation",
      category: "cli",
      macCodexUsage: "npm test, build:worker, validation scripts",
      repoBacked: false,
      butlerReachable: "via_vps_runner_when_handoff_connected",
      vpsExecutable: "expected",
      runtimeTruth: "unverified",
      gap: "vps_version_inventory_unverified"
    },
    {
      id: "repo-validation-scripts",
      label: "repo validation scripts",
      category: "repo_script",
      macCodexUsage: "prepare/validate Issue and PR bodies, self-parity, generated-worker",
      repoBacked: true,
      butlerReachable: "via_vps_runner_when_handoff_connected",
      vpsExecutable: "expected",
      runtimeTruth: "partial",
      gap: "runner_execution_truth_required"
    },
    {
      id: "repo-backed-skills",
      label: "VTDD repo-backed Skills",
      category: "skill",
      macCodexUsage: "traffic control and status advice",
      repoBacked: true,
      butlerReachable: "via_startup_preflight",
      vpsExecutable: "readable_from_repo",
      runtimeTruth: "read",
      gap: null
    },
    {
      id: "openai-developers-skills",
      label: "OpenAI Developers Skills",
      category: "skill_plugin",
      macCodexUsage: "OpenAI docs, API troubleshooting, Agents SDK, ChatGPT app work",
      repoBacked: false,
      butlerReachable: "not_yet_connected",
      vpsExecutable: "unknown",
      runtimeTruth: "missing",
      gap: "plugin_skill_parity_unimplemented"
    },
    {
      id: "browser-playwright",
      label: "browser / Playwright verification",
      category: "browser_e2e",
      macCodexUsage: "local browser checks and screenshot E2E",
      repoBacked: "tests_and_scripts_only",
      butlerReachable: "not_yet_connected",
      vpsExecutable: "blocked_until_host_inventory_verified",
      runtimeTruth: "partial",
      gap: "vps_browser_e2e_inventory_unverified"
    }
  ];
  const macOnlyGaps = tools.filter((tool) => tool.gap).map((tool) => ({
    id: tool.id,
    gap: tool.gap,
    next: "make this Butler-readable and VPS-verifiable before treating it as VTDD completion"
  }));
  return {
    status: macOnlyGaps.length === 0 ? "ready" : "partial",
    purpose:
      "Inventory mac Codex tools used for VTDD and classify whether Butler/VPS can reach the same capability.",
    tools,
    buckets: {
      butlerReachable: tools
        .filter((tool) => tool.butlerReachable !== "not_yet_connected")
        .map((tool) => tool.id),
      vpsExecutableCandidates: tools.filter((tool) => ["expected", "expected_with_github_app_or_token", "readable_from_repo"].includes(tool.vpsExecutable)).map((tool) => tool.id),
      repoBacked: tools.filter((tool) => tool.repoBacked === true || tool.repoBacked === "tests_and_scripts_only").map((tool) => tool.id),
      macOnlyGaps: macOnlyGaps.map((gap) => gap.id)
    },
    macOnlyGaps,
    ownerFacingSummary:
      macOnlyGaps.length === 0
        ? "No mac-only VTDD tool gap is currently reported by startup preflight."
        : "Some mac Codex tools are not yet Butler/VPS equivalent; treat them as #495 parity gaps, not VTDD completion."
  };
}

function buildStartupRepoBackedSkills({ sourceResults }) {
  const requiredSkills = [
    {
      name: "vtdd-chief-butler",
      path: ".agents/skills/vtdd-chief-butler/SKILL.md",
      role: "central_traffic_control",
      requiredFor: ["Dashboard Butler traffic control", "VPS Codex CLI handoff"]
    },
    {
      name: "vtdd-status-advisor",
      path: ".agents/skills/vtdd-status-advisor/SKILL.md",
      role: "readonly_status_advice",
      requiredFor: ["status readiness", "close/merge readiness"]
    }
  ];
  const skills = requiredSkills.map((skill) => {
    const result = sourceResults.find((sourceResult) => sourceResult.path === skill.path);
    const content = result?.ok ? String(result.record?.content || "") : "";
    const frontMatterName = content.match(/^name:\s*(.+?)\s*$/m)?.[1]?.trim() || null;
    return {
      ...skill,
      status: result?.ok ? "read" : "missing",
      sha: result?.record?.sha || null,
      htmlUrl: result?.record?.htmlUrl || null,
      frontMatterName,
      frontMatterNameMatches: frontMatterName === skill.name,
      repositoryBacked: result?.ok === true,
      reason: result?.ok ? null : result?.reason || "skill source is unavailable"
    };
  });
  const missing = skills.filter((skill) => skill.status !== "read");
  const mismatched = skills.filter(
    (skill) => skill.status === "read" && skill.frontMatterNameMatches !== true
  );
  return {
    status: missing.length === 0 && mismatched.length === 0 ? "read" : "未確認",
    requiredSkills: skills,
    missingSkills: missing.map((skill) => skill.name),
    mismatchedSkills: mismatched.map((skill) => skill.name),
    ownerFacingSummary:
      missing.length === 0 && mismatched.length === 0
        ? "repo-backed VTDD Skills are readable from repository truth."
        : "repo-backed VTDD Skill inventory is incomplete; do not claim cross-surface traffic-control parity."
  };
}

function buildStartupExecutionQueue({ sourceResults }) {
  const contractResult = sourceResults.find(
    (result) => result.path === "docs/butler/execution-queue-contract.md"
  );
  const queueResult = sourceResults.find(
    (result) => result.path === "docs/mvp/active-issue-execution-queue.md"
  );
  const contractContent = contractResult?.ok ? String(contractResult.record?.content || "") : "";
  const queueContent = queueResult?.ok ? String(queueResult.record?.content || "") : "";
  const queueSections = parseMarkdownH2Sections(queueContent);
  const requiredSections = [
    "Now",
    "Next",
    "Root Blockers",
    "Evidence Gaps",
    "Blocked",
    "Queue",
    "Questions"
  ];
  const sectionSummaries = {};
  for (const sectionName of requiredSections) {
    sectionSummaries[sectionName] = summarizeQueueSection(queueSections[sectionName]);
  }

  const missingSections = requiredSections.filter(
    (sectionName) => !normalizeText(queueSections[sectionName])
  );
  const classificationNames = ["EMERGENCY", "ROOT", "NEXT", "QUEUE", "EVIDENCE", "QUESTION"];
  const contractHasClassifications = classificationNames.every((classification) =>
    contractContent.includes(`\`${classification}\``)
  );

  return {
    status:
      contractResult?.ok && queueResult?.ok && missingSections.length === 0
        ? "read"
        : "未確認",
    sourcePaths: {
      contract: "docs/butler/execution-queue-contract.md",
      activeQueue: "docs/mvp/active-issue-execution-queue.md"
    },
    contract: {
      status: contractResult?.ok ? "read" : "未確認",
      sha: contractResult?.record?.sha || null,
      htmlUrl: contractResult?.record?.htmlUrl || null,
      classifications: classificationNames,
      classificationContractPresent: contractHasClassifications,
      reason: contractResult?.ok ? null : contractResult?.reason || "unverified"
    },
    activeQueue: {
      status: queueResult?.ok ? "read" : "未確認",
      sha: queueResult?.record?.sha || null,
      htmlUrl: queueResult?.record?.htmlUrl || null,
      reason: queueResult?.ok ? null : queueResult?.reason || "unverified"
    },
    currentNow: firstMarkdownBullet(queueSections.Now),
    next: markdownBullets(queueSections.Next).slice(0, 5),
    sectionSummaries,
    missingSections,
    trafficControlRule:
      "Owner input is a queue update event before it is an implementation instruction.",
    ownerFacingSummary: buildExecutionQueueOwnerFacingSummary({
      currentNow: firstMarkdownBullet(queueSections.Now),
      missingSections
    })
  };
}

function parseMarkdownH2Sections(markdown) {
  const sections = {};
  const value = String(markdown || "");
  const matches = [...value.matchAll(/^##\s+(.+?)\s*$/gm)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const sectionName = normalizeText(match[1]);
    sections[sectionName] = value.slice(match.index + match[0].length, next?.index).trim();
  }
  return sections;
}

function markdownBullets(sectionText) {
  return String(sectionText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function firstMarkdownBullet(sectionText) {
  return markdownBullets(sectionText)[0] || null;
}

function summarizeQueueSection(sectionText) {
  const bullets = markdownBullets(sectionText);
  return {
    status: normalizeText(sectionText) ? "present" : "missing",
    bulletCount: bullets.length,
    firstBullet: bullets[0] || null,
    excerpt: compactExcerpt(sectionText, 360)
  };
}

function buildExecutionQueueOwnerFacingSummary({ currentNow, missingSections }) {
  if (missingSections.length > 0) {
    return `交通整理 source が未確認です: ${missingSections.join(", ")}`;
  }
  if (currentNow) {
    return `現在の Now は ${currentNow}`;
  }
  return "現在の Now は未確認です。";
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

function buildStartupGapClassification({
  currentSurface,
  missingSources,
  memoryResult,
  repoBackedSkills,
  toolParityInventory
}) {
  const gaps = [];
  if (normalizeText(currentSurface) === "mac_codex") {
    gaps.push("mac_codex_only_probe");
  }
  if (missingSources.length > 0) {
    gaps.push("butler_gap_found");
  }
  if (repoBackedSkills?.status !== "read") {
    gaps.push("vps_handoff_gap_found");
  }
  if ((toolParityInventory?.macOnlyGaps ?? []).length > 0) {
    gaps.push("vps_handoff_gap_found");
  }
  if (memoryResult.status !== "read") {
    gaps.push("recovery_gap_found");
  }
  const uniqueGaps = [...new Set(gaps)];
  return uniqueGaps.length > 0 ? uniqueGaps : ["none"];
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

  const recorded = await recordDashboardNotificationEvent({
    env,
    eventStore: store,
    event: event.event
  });
  return json(202, {
    ok: true,
    event: recorded.event,
    webPush: recorded.webPush
  });
}

async function recordDashboardNotificationEvent({ env, eventStore, event, overrides = {}, dispatch = true } = {}) {
  const baseEvent = normalizeDashboardEventRecord({
    ...event,
    ...overrides
  });
  if (!eventStore || typeof eventStore.put !== "function") {
    return {
      ok: false,
      event: baseEvent,
      webPush: {
        ok: false,
        status: 503,
        error: "dashboard_event_store_unavailable",
        reason: "dashboard event store is not configured",
        attempted: 0,
        delivered: 0,
        cleaned: 0
      }
    };
  }
  if (!dispatch) {
    await eventStore.put(baseEvent);
    return {
      ok: true,
      event: baseEvent,
      webPush: {
        ok: false,
        status: 204,
        reason: "dashboard notification dispatch skipped",
        attempted: 0,
        delivered: 0,
        cleaned: 0
      }
    };
  }
  const webPush = await dispatchDashboardWebPushForEvent(env, baseEvent).catch((error) => ({
    ok: false,
    status: 502,
    error: "dashboard_web_push_dispatch_failed",
    reason: error instanceof Error ? error.message : "dashboard web push dispatch failed",
    attempted: 0,
    delivered: 0,
    cleaned: 0
  }));
  const eventWithNotificationTruth = normalizeDashboardEventRecord({
    ...baseEvent,
    pwaNotificationStatus: webPush.ok ? "sent" : "pwa_notification_unavailable",
    pwaNotificationError: webPush.ok ? null : webPush.error || "dashboard_web_push_unavailable",
    pwaNotificationReason: webPush.ok ? null : webPush.reason || null,
    pwaNotificationAttempted: webPush.attempted ?? 0,
    pwaNotificationDelivered: webPush.delivered ?? 0,
    pwaNotificationCleaned: webPush.cleaned ?? 0,
    updatedAt: new Date().toISOString()
  });
  await eventStore.put(eventWithNotificationTruth);
  return {
    ok: webPush.ok,
    event: eventWithNotificationTruth,
    webPush
  };
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

  const recorded = await recordDashboardNotificationEvent({
    env,
    eventStore,
    event: event.event
  });
  const eventWithNotificationTruth = recorded.event;
  let messages;
  try {
    messages = await chatStore.appendMany(event.threadId, [event.chatMessage]);
  } catch (error) {
    await eventStore.delete(eventWithNotificationTruth.id);
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
    event: eventWithNotificationTruth,
    threadId: event.threadId,
    messages,
    webSocketBroadcast,
    webPush: recorded.webPush
  });
}

async function handleOwnerActionRequiredEventRequest(request, env) {
  const payload = await readJson(request);
  const event = normalizeOwnerActionRequiredDashboardEvent(payload);
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

  const recorded = await recordDashboardNotificationEvent({
    env,
    eventStore,
    event: event.event
  });
  return json(recorded.webPush.ok ? 202 : recorded.webPush.status || 503, {
    ok: recorded.webPush.ok,
    event: recorded.event,
    webPush: recorded.webPush
  });
}

async function handleVpsPrivilegedMaintenanceProposalRequest(request, env) {
  const provider = resolveMemoryProvider(env);
  const memoryValidation = validateMemoryProvider(provider);
  if (!memoryValidation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for VPS maintenance approval proposals"
    });
  }

  const url = new URL(request.url);
  const payload = await readJson(request);
  const result = await createVpsPrivilegedMaintenanceProposal({
    payload,
    provider,
    origin: url.origin
  });
  return json(result.status, result.body);
}

async function createVpsPrivilegedMaintenanceProposal({ payload, provider, origin }) {
  const proposalResult = buildVpsCapabilityProposal(payload);
  if (!proposalResult.ok) {
    return {
      ok: false,
      status: 422,
      error: "vps_privileged_maintenance_proposal_invalid",
      issues: proposalResult.issues ?? [],
      body: {
      ok: false,
      error: "vps_privileged_maintenance_proposal_invalid",
      issues: proposalResult.issues ?? []
      }
    };
  }

  const proposal = proposalResult.proposal;
  const operation = normalizeText(payload?.operation) || "add";
  const relatedIssue = normalizePositiveInteger(payload?.relatedIssue || payload?.related_issue || payload?.issueNumber);
  const expiresAtResult = normalizeVpsMaintenanceProposalExpiresAt(payload?.expiresAt || payload?.expires_at);
  const proposalIssues = [];
  if (!["add", "enable", "disable", "remove", "rollback", "review"].includes(operation)) {
    proposalIssues.push("operation must be add, enable, disable, remove, rollback, or review");
  }
  if (!relatedIssue) {
    proposalIssues.push("relatedIssue or issueNumber is required");
  }
  if (!expiresAtResult.ok) {
    proposalIssues.push(...expiresAtResult.issues);
  }
  if (proposalIssues.length > 0) {
    return {
      ok: false,
      status: 422,
      error: "vps_privileged_maintenance_proposal_invalid",
      issues: proposalIssues,
      body: {
      ok: false,
      error: "vps_privileged_maintenance_proposal_invalid",
      issues: proposalIssues
      }
    };
  }
  const expiresAt = expiresAtResult.expiresAt;
  const impactScope =
    normalizeText(payload?.impactScope || payload?.impact_scope) ||
    proposal.capability.affectedPaths.join(", ") ||
    proposal.capability.commandClass;
  let approvalScope = buildVpsMaintenanceApprovalScope({
    repository: proposal.repository,
    host: proposal.host,
    operation,
    capabilityId: proposal.capability.id,
    impactScope,
    expiresAt,
    relatedIssue
  });
  const vpsProposalId = createDashboardRequestId("vps-maintenance-proposal");
  approvalScope = {
    ...approvalScope,
    vpsProposalId
  };
  const approvalProposalRecord = createVpsMaintenanceApprovalProposalRecord({
    vpsProposalId,
    proposal,
    approvalScope,
    expiresAt,
    relatedIssue
  });
  if (!approvalProposalRecord.ok) {
    return {
      ok: false,
      status: 422,
      error: "vps_privileged_maintenance_proposal_invalid",
      issues: approvalProposalRecord.issues ?? [],
      body: {
      ok: false,
      error: "vps_privileged_maintenance_proposal_invalid",
      issues: approvalProposalRecord.issues ?? []
      }
    };
  }
  const stored = await provider.store(approvalProposalRecord.record);
  if (!stored?.ok) {
    return {
      ok: false,
      status: 503,
      error: "memory_write_failed",
      reason: "failed to persist VPS maintenance approval proposal",
      body: {
      ok: false,
      error: "memory_write_failed",
      reason: "failed to persist VPS maintenance approval proposal"
      }
    };
  }
  const approvalOperatorUrl = buildVpsMaintenanceApprovalOperatorUrl({
    origin,
    approvalScope,
    vpsProposalId
  });
  const ownerAction = {
    repository: proposal.repository,
    actionId: `vps-maintenance-proposal:${proposal.capability.id}:${operation}`,
    title: `VPS maintenance approval: ${proposal.capability.title}`,
    summary: `${proposal.host} / ${operation} / ${proposal.capability.id} / ${impactScope}`,
    issueNumber: relatedIssue,
    workflowName: "vps-privileged-maintenance",
    url: `/dashboard/notifications?focus=owner-action`,
    source: {
      kind: proposal.kind,
      approvalOperatorUrl,
      vpsProposalId,
      capabilityId: proposal.capability.id,
      operation,
      host: proposal.host
    }
  };

  const body = {
    ok: true,
    proposal,
    vpsProposalId,
    approvalScope,
    approvalOperatorUrl,
    ownerAction,
    runtimeTruth: {
      kind: "vps_privileged_maintenance_proposal",
      status: "approval_required",
      host: proposal.host,
      repository: proposal.repository,
      capabilityId: proposal.capability.id,
      vpsProposalId,
      operation,
      impactScope,
      expiresAt,
      pwaNotificationRequired: true,
      rootExecutionStarted: false,
      redacted: true
    }
  };
  return {
    ok: true,
    status: 200,
    body
  };
}

function createVpsMaintenanceApprovalProposalRecord({ vpsProposalId, proposal, approvalScope, expiresAt, relatedIssue }) {
  return createMemoryRecord({
    id: vpsProposalId,
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "vps_privileged_maintenance_approval_proposal",
      status: "pending_approval",
      proposal,
      approvalScope,
      relatedIssue,
      expiresAt
    },
    metadata: {
      source: "vps_privileged_maintenance_proposal",
      scopeKey: JSON.stringify(approvalScope)
    },
    priority: 94,
    tags: ["vps_privileged_maintenance", "passkey_approval", "pending"],
    createdAt: new Date().toISOString()
  });
}

function buildVpsMaintenanceApprovalOperatorUrl({ origin, approvalScope, vpsProposalId }) {
  const url = new URL("/v2/approval/passkey/operator", `${origin}/`);
  url.searchParams.set("mode", "vps");
  url.searchParams.set("vpsProposalId", vpsProposalId);
  url.searchParams.set("repositoryInput", approvalScope.repositoryInput);
  url.searchParams.set("issueNumber", approvalScope.relatedIssue);
  url.searchParams.set("phase", approvalScope.phase || "execution");
  url.searchParams.set("actionType", approvalScope.actionType);
  url.searchParams.set("highRiskKind", approvalScope.highRiskKind);
  return url.href;
}

function normalizeVpsMaintenanceProposalExpiresAt(value, now = new Date()) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return {
      ok: true,
      expiresAt: new Date(now.valueOf() + 5 * 60 * 1000).toISOString()
    };
  }
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return {
      ok: false,
      issues: ["expiresAt must be an ISO date-time"]
    };
  }
  if (parsed <= now.valueOf()) {
    return {
      ok: false,
      issues: ["expiresAt must be in the future"]
    };
  }
  if (parsed > now.valueOf() + 15 * 60 * 1000) {
    return {
      ok: false,
      issues: ["expiresAt must be within 15 minutes"]
    };
  }
  return {
    ok: true,
    expiresAt: new Date(parsed).toISOString()
  };
}

async function handleVpsPrivilegedMaintenanceHelperRequest(request, env) {
  const provider = resolveMemoryProvider(env);
  const memoryValidation = validateMemoryProvider(provider);
  if (!memoryValidation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for VPS maintenance helper requests"
    });
  }

  const payload = await readJson(request);
  const result = await createVpsPrivilegedMaintenanceHelperRequest({ payload, provider });
  return json(result.status, result.body);
}

async function createVpsPrivilegedMaintenanceHelperRequest({ payload, provider }) {
  const vpsProposalId = normalizeText(payload?.vpsProposalId || payload?.vps_proposal_id);
  const approvalGrantId = normalizeText(payload?.approvalGrantId || payload?.approval_grant_id);
  const issues = [];
  if (!vpsProposalId) issues.push("vpsProposalId is required");
  if (!approvalGrantId) issues.push("approvalGrantId is required");
  if (issues.length > 0) {
    return {
      ok: false,
      status: 422,
      error: "vps_privileged_maintenance_helper_request_invalid",
      issues,
      body: {
      ok: false,
      error: "vps_privileged_maintenance_helper_request_invalid",
      issues
      }
    };
  }

  const proposalRecord = await findApprovalRecordById(provider, vpsProposalId);
  if (!proposalRecord || normalizeText(proposalRecord?.content?.kind) !== "vps_privileged_maintenance_approval_proposal") {
    return {
      ok: false,
      status: 404,
      error: "vps_privileged_maintenance_proposal_not_found",
      reason: "matching VPS maintenance approval proposal was not found",
      body: {
      ok: false,
      error: "vps_privileged_maintenance_proposal_not_found",
      reason: "matching VPS maintenance approval proposal was not found"
      }
    };
  }
  if (Date.parse(normalizeText(proposalRecord.content.expiresAt)) <= Date.now()) {
    return {
      ok: false,
      status: 422,
      error: "vps_privileged_maintenance_proposal_expired",
      issues: ["VPS maintenance approval proposal is expired"],
      body: {
      ok: false,
      error: "vps_privileged_maintenance_proposal_expired",
      issues: ["VPS maintenance approval proposal is expired"]
      }
    };
  }

  const grantRecord = await findApprovalRecordById(provider, approvalGrantId);
  if (!grantRecord || normalizeText(grantRecord?.content?.kind) !== "passkey_grant") {
    return {
      ok: false,
      status: 404,
      error: "approval_grant_not_found",
      reason: "matching passkey approval grant was not found",
      body: {
      ok: false,
      error: "approval_grant_not_found",
      reason: "matching passkey approval grant was not found"
      }
    };
  }
  const approvalGrant = {
    approvalId: normalizeText(grantRecord.content.approvalId || grantRecord.id),
    verified: normalizeText(grantRecord.content.status) === "verified",
    expiresAt: normalizeText(grantRecord.content.expiresAt),
    scope: grantRecord.content.scope
  };
  const expectedScope = normalizeScopeSnapshot(proposalRecord.content.approvalScope);
  const grantResult = evaluateApprovalGrant({
    approvalGrant,
    scope: expectedScope
  });
  if (!grantResult.ok) {
    return {
      ok: false,
      status: 403,
      error: "approval_grant_scope_mismatch",
      reason: grantResult.reason,
      body: {
      ok: false,
      error: "approval_grant_scope_mismatch",
      reason: grantResult.reason
      }
    };
  }

  const proposal = proposalRecord.content.proposal;
  const capability = proposal.capability ?? {};
  const helperRequest = {
    kind: "vps_privileged_maintenance_helper_request",
    status: "ready_for_vps_helper",
    requestId: createDashboardRequestId("vps-maintenance-helper-request"),
    vpsProposalId,
    approvalGrantId,
    host: proposal.host,
    repository: proposal.repository,
    relatedIssue: normalizePositiveInteger(proposalRecord.content.relatedIssue),
    operation: expectedScope.vpsOperation,
    capability: {
      id: capability.id,
      title: capability.title,
      commandClass: capability.commandClass,
      riskLevel: capability.riskLevel,
      workingDirectories: capability.workingDirectories ?? [],
      allowedArgs: capability.allowedArgs ?? [],
      affectedPaths: capability.affectedPaths ?? [],
      redactionRules: capability.redactionRules ?? [],
      rollbackPlan: capability.rollbackPlan,
      expectedRuntimeTruth: capability.expectedRuntimeTruth ?? []
    },
    approvalScope: expectedScope,
    rootExecutionStarted: false,
    helperExecutionStarted: false,
    redacted: true
  };

  const body = {
    ok: true,
    helperRequest,
    runtimeTruth: {
      kind: "vps_privileged_maintenance_helper_request",
      status: "ready_for_vps_helper",
      host: helperRequest.host,
      repository: helperRequest.repository,
      relatedIssue: helperRequest.relatedIssue,
      operation: helperRequest.operation,
      capabilityId: helperRequest.capability.id,
      rootExecutionStarted: false,
      helperExecutionStarted: false,
      redacted: true,
      nextAction: "send this bounded helperRequest to the VPS root-owned helper in the next approved slice"
    }
  };
  return {
    ok: true,
    status: 200,
    body
  };
}

async function handleVpsPrivilegedMaintenanceHelperDryRunRequest(request, env) {
  const payload = await readJson(request);
  const result = planVpsPrivilegedMaintenanceHelperExecution({
    manifest: payload?.manifest,
    helperRequest: payload?.helperRequest || payload?.helper_request,
    mode: payload?.mode || payload?.executionMode || payload?.execution_mode || "dry_run",
    now: payload?.now
  });
  if (!result.ok) {
    return json(422, {
      ok: false,
      error: result.error,
      issues: result.issues ?? [],
      runtimeTruth: {
        kind: "vps_privileged_maintenance_helper_dry_run",
        status: "blocked",
        rootExecutionStarted: false,
        helperExecutionStarted: false,
        redacted: true
      }
    });
  }

  return json(200, {
    ok: true,
    helperPlan: result.helperPlan,
    runtimeTruth: result.runtimeTruth
  });
}

async function handleVpsPrivilegedMaintenanceHelperExecutionRequest(request, env) {
  const payload = await readJson(request);
  const result = createVpsPrivilegedMaintenanceHelperExecution({ payload });
  return json(result.status, result.body);
}

function createVpsPrivilegedMaintenanceHelperExecution({ payload }) {
  const result = planVpsPrivilegedMaintenanceHelperExecution({
    manifest: payload?.manifest,
    helperRequest: payload?.helperRequest || payload?.helper_request,
    mode: "execute",
    now: payload?.now
  });
  if (!result.ok) {
    return {
      ok: false,
      status: 422,
      error: result.error,
      issues: result.issues ?? [],
      body: {
      ok: false,
      error: result.error,
      issues: result.issues ?? [],
      runtimeTruth: {
        kind: "vps_privileged_maintenance_helper_execution_handoff",
        status: "blocked",
        rootExecutionStarted: false,
        helperExecutionStarted: false,
        redacted: true
      }
      }
    };
  }

  const body = {
    ok: true,
    helperPlan: result.helperPlan,
    executionEnvelope: {
      kind: "vps_privileged_maintenance_helper_execution_envelope",
      status: "ready_for_vps_helper_execution",
      host: result.helperPlan.host,
      repository: result.helperPlan.repository,
      requestId: result.helperPlan.requestId,
      capabilityId: result.helperPlan.capability.id,
      mode: "execute",
      helperInvocation: {
        executable: "sudo",
        args: ["-n", "/usr/local/sbin/vtdd-vps-maintenance-helper", "--execute", "--input", "<helper-execution-input-json>"],
        shell: false,
        stdin: "none",
        inputFile: "helperExecutionInput",
        note: "VPS runner must materialize helperExecutionInput as a local file and invoke the root-owned helper; Worker does not execute root work."
      },
      helperExecutionInput: {
        manifest: payload?.manifest,
        helperRequest: payload?.helperRequest || payload?.helper_request,
        mode: "execute",
        now: payload?.now || result.runtimeTruth.updatedAt
      },
      rootExecutionStarted: false,
      helperExecutionStarted: false,
      redacted: true
    },
    runtimeTruth: {
      ...result.runtimeTruth,
      kind: "vps_privileged_maintenance_helper_execution_handoff",
      status: "ready_for_vps_helper_execution",
      rootExecutionStarted: false,
      helperExecutionStarted: false,
      nextAction: "send executionEnvelope.helperExecutionInput to the VPS root-owned helper through a declared VPS runner pickup path"
    }
  };
  return {
    ok: true,
    status: 200,
    body
  };
}

async function handleVpsPrivilegedMaintenanceHelperExecutionQueueRequest(request, env) {
  const payload = await readJson(request);
  const result = await createVpsPrivilegedMaintenanceHelperExecutionQueue({ payload, env });
  return json(result.status, result.body);
}

async function createVpsPrivilegedMaintenanceHelperExecutionQueue({ payload, env }) {
  const envelope = payload?.executionEnvelope || payload?.execution_envelope;
  const helperExecutionInput = envelope?.helperExecutionInput;
  const result = planVpsPrivilegedMaintenanceHelperExecution({
    manifest: helperExecutionInput?.manifest,
    helperRequest: helperExecutionInput?.helperRequest || helperExecutionInput?.helper_request,
    mode: "execute",
    now: helperExecutionInput?.now || payload?.now
  });
  const envelopeIssues = validateVpsPrivilegedMaintenanceExecutionEnvelopeForQueue(envelope);
  if (!result.ok || envelopeIssues.length > 0) {
    const body = {
      ok: false,
      error: result.error || "vps_privileged_maintenance_execution_envelope_invalid",
      issues: [...(result.issues ?? []), ...envelopeIssues],
      runtimeTruth: {
        kind: "vps_privileged_maintenance_helper_execution_queue",
        status: "blocked",
        rootExecutionStarted: false,
        helperExecutionStarted: false,
        queueCommentPosted: false,
        redacted: true
      }
    };
    return {
      ok: false,
      status: 422,
      error: body.error,
      issues: body.issues,
      body
    };
  }

  const repository = normalizeCanonicalRepositoryInput(payload?.repository) || result.helperPlan.repository;
  const issueNumber = normalizeIssue(payload?.issueNumber ?? result.helperPlan.relatedIssue);
  if (!repository || !issueNumber) {
    const body = {
      ok: false,
      error: "vps_privileged_maintenance_queue_target_required",
      issues: ["repository and issueNumber are required"],
      runtimeTruth: {
        kind: "vps_privileged_maintenance_helper_execution_queue",
        status: "blocked",
        rootExecutionStarted: false,
        helperExecutionStarted: false,
        queueCommentPosted: false,
        redacted: true
      }
    };
    return {
      ok: false,
      status: 422,
      error: body.error,
      issues: body.issues,
      body
    };
  }

  const executionId =
    normalizeText(payload?.executionId) ||
    `vps-maint-${issueNumber}-${safeIdentifier(result.helperPlan.requestId || Date.now())}`;
  const dashboardThreadId = normalizeText(
    payload?.handoff?.dashboardThreadId ||
      payload?.dashboardThreadId ||
      payload?.dashboard_thread_id ||
      payload?.threadId ||
      payload?.thread_id
  );
  const queueCommentBody = buildVpsPrivilegedMaintenanceQueueComment({
    executionId,
    repository,
    issueNumber,
    dashboardThreadId,
    approvalActor: payload?.approvalActor,
    executionEnvelope: envelope
  });
  const writeResult = await executeGitHubWritePlane({
    operation: "issue_comment_create",
    repository,
    issueNumber,
    body: queueCommentBody,
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalScopeMatched: true,
    env
  });
  if (!writeResult.ok) {
    const body = {
      ok: false,
      error: writeResult.error || "vps_privileged_maintenance_queue_post_failed",
      reason: writeResult.reason,
      issues: writeResult.issues ?? [],
      runtimeTruth: {
        kind: "vps_privileged_maintenance_helper_execution_queue",
        status: "failed",
        rootExecutionStarted: false,
        helperExecutionStarted: false,
        queueCommentPosted: false,
        redacted: true
      }
    };
    return {
      ok: false,
      status: writeResult.status ?? 503,
      error: body.error,
      reason: body.reason,
      issues: body.issues,
      body
    };
  }

  const body = {
    ok: true,
    execution: {
      executionId,
      transport: "vps_privileged_maintenance_helper",
      repository,
      issueNumber,
      dashboardThreadId: dashboardThreadId || null,
      queueCommentId: writeResult.write?.commentId || null,
      queueCommentUrl: writeResult.write?.url || null,
      status: "queued"
    },
    runtimeTruth: {
      kind: "vps_privileged_maintenance_helper_execution_queue",
      status: "queued_for_vps_helper_execution",
      rootExecutionStarted: false,
      helperExecutionStarted: false,
      queueCommentPosted: true,
      dashboardThreadIdIncluded: Boolean(dashboardThreadId),
      nextAction: "VPS runner must pick up the vtdd:vps-privileged-maintenance-execution queue comment and invoke the root-owned helper"
    }
  };
  return {
    ok: true,
    status: 200,
    body
  };
}

function buildVpsPrivilegedMaintenanceQueueComment({
  executionId,
  repository,
  issueNumber,
  dashboardThreadId,
  approvalActor,
  executionEnvelope
} = {}) {
  const payload = {
    executionId,
    transport: "vps_privileged_maintenance_helper",
    repository,
    issueNumber,
    dashboardThreadId: dashboardThreadId || null,
    handoff: {
      dashboardThreadId: dashboardThreadId || null
    },
    approvalScopeMatched: true,
    approvalActor: normalizeGitHubLogin(approvalActor) || null,
    issueTraceability: {
      canonicalSpec: "github_issue",
      issueNumber,
      relatedIssue: issueNumber,
      issueTraceable: true
    },
    executionEnvelope
  };
  return [
    `<!-- vtdd:vps-privileged-maintenance-execution:${executionId} -->`,
    "VTDD VPS privileged maintenance helper 実行キューです。",
    "",
    "このコメントは通常の Codex branch/PR queue ではありません。scoped passkey approval 済み helper execution envelope を user-owned VPS runner が root-owned helper へ渡すための bounded handoff です。",
    "",
    fencedJson(payload)
  ].join("\n");
}

function validateVpsPrivilegedMaintenanceExecutionEnvelopeForQueue(envelope) {
  const issues = [];
  if (!envelope || typeof envelope !== "object") {
    return ["executionEnvelope is required"];
  }
  if (normalizeText(envelope.kind) !== "vps_privileged_maintenance_helper_execution_envelope") {
    issues.push("executionEnvelope.kind must be vps_privileged_maintenance_helper_execution_envelope");
  }
  if (normalizeText(envelope.status) !== "ready_for_vps_helper_execution") {
    issues.push("executionEnvelope.status must be ready_for_vps_helper_execution");
  }
  if (normalizeText(envelope.mode) !== "execute") {
    issues.push("executionEnvelope.mode must be execute");
  }
  const invocation = envelope.helperInvocation && typeof envelope.helperInvocation === "object" ? envelope.helperInvocation : {};
  const args = Array.isArray(invocation.args) ? invocation.args.map(normalizeText) : [];
  if (normalizeText(invocation.executable) !== "sudo") {
    issues.push("executionEnvelope.helperInvocation.executable must be sudo");
  }
  if (
    args.length !== 5 ||
    args[0] !== "-n" ||
    args[1] !== "/usr/local/sbin/vtdd-vps-maintenance-helper" ||
    args[2] !== "--execute" ||
    args[3] !== "--input" ||
    args[4] !== "<helper-execution-input-json>"
  ) {
    issues.push("executionEnvelope.helperInvocation.args must match the bounded root helper invocation");
  }
  if (invocation.shell !== false) {
    issues.push("executionEnvelope.helperInvocation.shell must be false");
  }
  if (normalizeText(invocation.inputFile) !== "helperExecutionInput") {
    issues.push("executionEnvelope.helperInvocation.inputFile must be helperExecutionInput");
  }
  if (!envelope.helperExecutionInput || typeof envelope.helperExecutionInput !== "object") {
    issues.push("executionEnvelope.helperExecutionInput is required");
  }
  if (envelope.rootExecutionStarted === true || envelope.helperExecutionStarted === true) {
    issues.push("executionEnvelope must not claim root/helper execution has already started");
  }
  return issues;
}

function fencedJson(value) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function safeIdentifier(value) {
  return String(value || "").replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 80) || "execution";
}

function normalizeGitHubLogin(value) {
  const login = normalizeText(value);
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(login) ? login : "";
}

async function handleRetrieveVpsMaintenanceInstallInventoryRequest(url) {
  const inventory = buildVpsPrivilegedMaintenanceInstallInventory({
    host: url.searchParams.get("host"),
    repository: url.searchParams.get("repository"),
    helperPath: url.searchParams.get("helperPath"),
    manifestPath: url.searchParams.get("manifestPath"),
    sudoersPath: url.searchParams.get("sudoersPath"),
    runnerUser: url.searchParams.get("runnerUser"),
    helperInstalled: url.searchParams.get("helperInstalled"),
    manifestInstalled: url.searchParams.get("manifestInstalled"),
    sudoersInstalled: url.searchParams.get("sudoersInstalled"),
    helperOwner: url.searchParams.get("helperOwner"),
    manifestOwner: url.searchParams.get("manifestOwner"),
    sudoersOwner: url.searchParams.get("sudoersOwner"),
    sudoersAllowsAll: url.searchParams.get("sudoersAllowsAll"),
    sudoersScopedHelperEntry: url.searchParams.get("sudoersScopedHelperEntry")
  });
  if (!inventory.ok) {
    return retrieveErrorJson(url, 422, {
      error: "vps_maintenance_install_inventory_invalid",
      reason: "VPS maintenance install inventory query is invalid",
      issues: inventory.issues
    });
  }
  return json(200, {
    ok: true,
    installInventory: inventory,
    runtimeTruth: inventory.runtimeTruth
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
    { env, origin: new URL(request.url).origin }
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
    execution: prepared.execution || null
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
  const targetEndpointHash = await resolveDashboardPushTargetEndpointHash(payload, env);
  if (!targetEndpointHash.ok) {
    return json(targetEndpointHash.status, {
      ok: false,
      event,
      webPush: {
        ok: false,
        status: targetEndpointHash.status,
        error: targetEndpointHash.error,
        reason: targetEndpointHash.reason,
        attempted: 0,
        delivered: 0,
        cleaned: 0,
        currentDevice: {
          status: targetEndpointHash.currentDeviceStatus || "not_saved"
        }
      }
    });
  }
  const webPush = await dispatchDashboardWebPushForEvent(env, event, {
    endpointHash: targetEndpointHash.endpointHash
  });
  return json(webPush.ok ? 202 : webPush.status || 503, {
    ok: webPush.ok,
    event,
    webPush
  });
}

async function resolveDashboardPushTargetEndpointHash(payload, env) {
  const endpoint = normalizeDashboardUrl(payload?.endpoint);
  if (!endpoint) {
    return {
      ok: false,
      status: 422,
      error: "dashboard_push_current_endpoint_required",
      reason: "server push test requires the current device subscription endpoint",
      currentDeviceStatus: "unknown"
    };
  }
  const endpointHash = await sha256Hex(endpoint);
  const store = resolveDashboardPushSubscriptionStore(env);
  if (!store || typeof store.get !== "function") {
    return {
      ok: false,
      status: 503,
      error: "dashboard_push_subscription_status_unavailable",
      reason: "dashboard push subscription store cannot verify the current device subscription",
      currentDeviceStatus: "unknown"
    };
  }
  const subscription = await store.get(endpointHash);
  if (!subscription) {
    return {
      ok: false,
      status: 404,
      error: "dashboard_push_current_subscription_not_saved",
      reason: "current device push subscription is not saved on the server",
      currentDeviceStatus: "not_saved"
    };
  }
  return {
    ok: true,
    endpointHash,
    currentDeviceStatus: "saved"
  };
}

async function handleDashboardPushAckRequest(request, env) {
  if (normalizeText(request.headers.get("content-type")).split(";")[0].toLowerCase() !== "application/json") {
    return json(415, {
      ok: false,
      error: "dashboard_push_ack_content_type_required",
      reason: "dashboard push ack requires application/json"
    });
  }
  if (request.headers.get("x-vtdd-dashboard-push-ack") !== "service-worker") {
    return json(403, {
      ok: false,
      error: "dashboard_push_ack_boundary_required",
      reason: "dashboard push ack requires the service worker boundary header"
    });
  }

  const dashboardAuth = await authorizeDashboardRequest({
    request,
    env,
    apiSuffix: "/dashboard/push/ack"
  });
  if (!dashboardAuth.ok) {
    return json(dashboardAuth.status, {
      ok: false,
      error: "dashboard_auth_required",
      reason: dashboardAuth.reason
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

  const payload = await readJson(request);
  const tag = sanitizeDashboardChatText(payload?.tag || "vtdd-dashboard");
  const sourceEventId = sanitizeDashboardChatText(payload?.sourceEventId || payload?.source_event_id || "");
  if (!isSupportedDashboardPushAckSourceEventId(sourceEventId)) {
    return json(422, {
      ok: false,
      error: "dashboard_push_ack_source_invalid",
      reason: "dashboard push ack requires a supported sourceEventId"
    });
  }
  const sourceRunId = sanitizeDashboardChatText(payload?.runId || payload?.run_id || "");
  const title = sanitizeDashboardChatText(payload?.title || "Dashboard PWA push received");
  const ackEvent = normalizeDashboardEventRecord({
    id: `dashboard-push-ack:${tag || sourceEventId || crypto.randomUUID()}`,
    kind: "dashboard_push_received",
    repository: normalizeCanonicalRepositoryInput(payload?.repository) || null,
    workflowName: sanitizeDashboardChatText(payload?.workflowName || payload?.workflow_name || "dashboard-push-ack"),
    runId: sourceRunId || sourceEventId || tag || crypto.randomUUID(),
    status: "completed",
    conclusion: "success",
    title,
    changeSummary: sanitizeDashboardChatText(payload?.body || payload?.message || "PWA Service Worker が push event を受信しました。"),
    pullNumber: normalizeIssue(payload?.pullNumber || payload?.pull_number),
    issueNumber: normalizeIssue(payload?.issueNumber || payload?.issue_number),
    runUrl: "/dashboard/notifications",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  await eventStore.put(ackEvent);
  return json(202, {
    ok: true,
    ack: {
      id: ackEvent.id,
      status: "received",
      receivedAt: ackEvent.updatedAt
    }
  });
}

function isSupportedDashboardPushAckSourceEventId(value) {
  const text = normalizeText(value);
  return (
    text.startsWith("github-actions:") ||
    text.startsWith("vps-runner:") ||
    text.startsWith("ai-news:") ||
    text.startsWith("owner-action-required:") ||
    text.startsWith("dashboard-push-test:")
  );
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

async function handleGitHubActionsVariableSyncRequest(request, env) {
  const payload = await readJson(request);
  if (!payload || typeof payload !== "object") {
    return json(422, {
      ok: false,
      error: "request_body_required",
      reason: "valid JSON request body is required"
    });
  }

  const provider = resolveMemoryProvider(env);
  const policyInput =
    payload.policyInput && typeof payload.policyInput === "object" ? payload.policyInput : {};
  const proposalResolution = await resolveGitHubActionsVariableSyncProposal({
    provider,
    proposalId: payload.variableProposalId || payload.variable_proposal_id || policyInput.variableProposalId
  });
  if (!proposalResolution.ok) {
    return json(proposalResolution.status, {
      ok: false,
      error: proposalResolution.error,
      reason: proposalResolution.reason,
      issues: proposalResolution.issues ?? []
    });
  }
  const variableProposal = proposalResolution.proposal;
  const repository = variableProposal?.repository || payload.repository;
  const variableName = variableProposal?.variableName || payload.variableName;
  const variableValue = variableProposal?.variableValue || payload.variableValue;
  const resolvedApprovalGrant = await resolveApprovalGrant({
    payload: {
      phase: normalizeText(payload.phase) || "execution",
      highRiskKind: "github_actions_variable_sync",
      repositoryInput: repository,
      variableName
    },
    policyInput: {
      ...policyInput,
      actionType: "destructive",
      repositoryInput: repository,
      highRiskKind: "github_actions_variable_sync",
      variableName
    },
    env
  });

  const executed = await executeGitHubActionsVariableSync({
    repository,
    variableName,
    variableValue,
    approvalGrant:
      payload.approvalGrant ?? policyInput.approvalGrant ?? resolvedApprovalGrant.approvalGrant,
    env
  }).catch((error) => ({
    ok: false,
    status: 503,
    error: "github_actions_variable_sync_exception",
    reason: sanitizeGitHubActionsVariableSyncErrorMessage(error)
  }));

  if (!executed.ok) {
    return json(executed.status ?? 503, {
      ok: false,
      error: executed.error ?? "github_actions_variable_sync_failed",
      reason: executed.reason,
      issues: executed.issues ?? []
    });
  }

  const ownerAction = buildGitHubActionsVariableSyncOwnerAction({
    repository,
    variableName,
    proposalId: variableProposal?.proposalId,
    issueNumber: variableProposal?.issueNumber
  });
  const notification = await recordGitHubActionsVariableSyncNotification({
    ownerAction,
    env
  });

  return json(200, {
    ok: true,
    variableSync: executed.variableSync,
    ownerAction,
    notification,
    runtimeTruth: {
      kind: "github_actions_variable_sync",
      status: executed.variableSync?.status || "synced",
      repository,
      variableName,
      variableProposalId: variableProposal?.proposalId || null,
      valueRedacted: true,
      nextAction: "production_deploy_required",
      pwaNotificationRequired: true,
      pwaNotificationStatus: notification.pwaNotificationStatus
    }
  });
}

async function handleGitHubActionsVariableSyncProposalRequest(request, url, env) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for GitHub Actions variable sync proposals"
    });
  }

  const payload = await readJson(request);
  const proposal = buildGitHubActionsVariableSyncProposal({
    payload,
    origin: url.origin
  });
  if (!proposal.ok) {
    return json(422, {
      ok: false,
      error: "github_actions_variable_sync_proposal_invalid",
      issues: proposal.issues
    });
  }

  const record = createGitHubActionsVariableSyncProposalRecord(proposal.body);
  const stored = await provider.store(record);
  if (!stored?.ok) {
    return json(503, {
      ok: false,
      error: "github_actions_variable_sync_proposal_write_failed",
      reason: "failed to persist GitHub Actions variable sync proposal"
    });
  }

  return json(200, {
    ok: true,
    variableProposalId: proposal.body.proposalId,
    approvalScope: proposal.body.approvalScope,
    approvalOperatorUrl: proposal.body.approvalOperatorUrl,
    ownerAction: buildGitHubActionsVariableSyncOwnerAction(proposal.body),
    runtimeTruth: {
      kind: "github_actions_variable_sync_proposal",
      status: "approval_required",
      repository: proposal.body.repository,
      variableName: proposal.body.variableName,
      variableProposalId: proposal.body.proposalId,
      valueRedacted: true,
      pwaNotificationRequired: true
    }
  });
}

function buildGitHubActionsVariableSyncProposal({ payload, origin }) {
  const input = normalizeObject(payload);
  const repository = normalizeCanonicalRepositoryInput(input.repository || input.repositoryInput);
  const variableName = normalizeText(input.variableName || input.variable_name);
  const variableValue = normalizeText(input.variableValue || input.variable_value);
  const issueNumber = normalizeIssue(input.issueNumber || input.issue_number || input.relatedIssue);
  const issues = [];
  if (!repository) issues.push("repository is required");
  if (
    variableName !== "VTDD_DASHBOARD_VPS_MAINTENANCE_HOST" &&
    variableName !== "VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR"
  ) {
    issues.push("variableName must be VTDD_DASHBOARD_VPS_MAINTENANCE_HOST or VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR");
  }
  if (!variableValue) issues.push("variableValue is required");
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const proposalId =
    normalizeText(input.variableProposalId || input.proposalId) ||
    `github-actions-variable-sync-${safeIdentifier(repository)}-${safeIdentifier(variableName)}-${Date.now()}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const approvalScope = normalizeScopeSnapshot({
    actionType: "destructive",
    highRiskKind: "github_actions_variable_sync",
    repositoryInput: repository,
    relatedIssue: issueNumber || undefined,
    phase: "execution",
    variableName
  });
  const approvalOperatorUrl = buildGitHubActionsVariableSyncApprovalOperatorUrl({
    origin,
    approvalScope,
    variableProposalId: proposalId
  });

  return {
    ok: true,
    body: {
      proposalId,
      repository,
      issueNumber,
      variableName,
      variableValue,
      approvalScope,
      approvalOperatorUrl,
      expiresAt
    }
  };
}

function createGitHubActionsVariableSyncProposalRecord(proposal) {
  return createMemoryRecord({
    id: proposal.proposalId,
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "github_actions_variable_sync_approval_proposal",
      status: "pending_approval",
      proposalId: proposal.proposalId,
      repository: proposal.repository,
      issueNumber: proposal.issueNumber || null,
      variableName: proposal.variableName,
      variableValue: proposal.variableValue,
      approvalScope: proposal.approvalScope,
      expiresAt: proposal.expiresAt
    },
    metadata: {
      source: "github_actions_variable_sync_proposal",
      repository: proposal.repository,
      variableName: proposal.variableName,
      valueRedacted: true
    },
    priority: 94,
    tags: ["github_actions_variable_sync", "passkey_approval", "pending"],
    createdAt: new Date().toISOString()
  }).record;
}

function buildGitHubActionsVariableSyncApprovalOperatorUrl({ origin, approvalScope, variableProposalId }) {
  const url = new URL("/v2/approval/passkey/operator", `${origin || "https://example.com"}/`);
  url.searchParams.set("mode", "github_actions_variable_sync");
  url.searchParams.set("variableProposalId", variableProposalId);
  url.searchParams.set("repositoryInput", approvalScope.repositoryInput);
  if (approvalScope.relatedIssue) {
    url.searchParams.set("issueNumber", approvalScope.relatedIssue);
  }
  url.searchParams.set("phase", approvalScope.phase || "execution");
  url.searchParams.set("actionType", approvalScope.actionType);
  url.searchParams.set("highRiskKind", approvalScope.highRiskKind);
  return url.href;
}

async function resolveGitHubActionsVariableSyncProposal({ provider, proposalId }) {
  const id = normalizeText(proposalId);
  if (!id) {
    return { ok: true, proposal: null };
  }
  if (!provider || typeof provider.query !== "function") {
    return {
      ok: false,
      status: 503,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for GitHub Actions variable sync proposal"
    };
  }
  const record = await findApprovalRecordById(provider, id);
  if (!record || normalizeText(record?.content?.kind) !== "github_actions_variable_sync_approval_proposal") {
    return {
      ok: false,
      status: 404,
      error: "github_actions_variable_sync_proposal_not_found",
      reason: "matching GitHub Actions variable sync proposal was not found"
    };
  }
  if (Date.parse(normalizeText(record.content.expiresAt)) <= Date.now()) {
    return {
      ok: false,
      status: 422,
      error: "github_actions_variable_sync_proposal_expired",
      issues: ["GitHub Actions variable sync proposal is expired"]
    };
  }
  return {
    ok: true,
    proposal: {
      proposalId: normalizeText(record.content.proposalId || record.id),
      repository: normalizeCanonicalRepositoryInput(record.content.repository),
      issueNumber: normalizeIssue(record.content.issueNumber),
      variableName: normalizeText(record.content.variableName),
      variableValue: normalizeText(record.content.variableValue),
      approvalScope: normalizeScopeSnapshot(record.content.approvalScope),
      expiresAt: normalizeText(record.content.expiresAt)
    }
  };
}

function buildGitHubActionsVariableSyncOwnerAction({ repository, variableName, proposalId, issueNumber } = {}) {
  return {
    actionId: proposalId || `github-actions-variable-sync-${safeIdentifier(repository)}-${safeIdentifier(variableName)}`,
    repository,
    issueNumber: issueNumber || null,
    title: "GitHub Actions variable sync",
    summary: `${variableName} を同期しました。値は表示していません。次に production deploy が必要です。`,
    workflowName: "github-actions-variable-sync",
    url: "/dashboard/notifications?focus=owner-action"
  };
}

async function recordGitHubActionsVariableSyncNotification({ ownerAction, env } = {}) {
  const event = normalizeOwnerActionRequiredDashboardEvent(ownerAction);
  if (!event.ok) {
    return {
      ok: false,
      pwaNotificationStatus: "event_invalid",
      error: event.error,
      reason: event.reason
    };
  }
  const eventStore = resolveDashboardEventStore(env);
  if (!eventStore) {
    return {
      ok: false,
      pwaNotificationStatus: "dashboard_event_store_unavailable",
      reason: "dashboard event store is not configured"
    };
  }
  const recorded = await recordDashboardNotificationEvent({
    env,
    eventStore,
    event: event.event,
    overrides: {
      status: "completed",
      conclusion: "success"
    }
  });
  const eventWithNotificationTruth = recorded.event;
  return {
    ok: true,
    event: eventWithNotificationTruth,
    pwaNotificationStatus: eventWithNotificationTruth.pwaNotificationStatus,
    pwaNotificationAttempted: eventWithNotificationTruth.pwaNotificationAttempted,
    pwaNotificationDelivered: eventWithNotificationTruth.pwaNotificationDelivered
  };
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

async function handlePasskeyOperatorPageRequest(request, env) {
  const url = new URL(request.url);
  const syncApiBase = normalizeOptionalHttpUrl(url.searchParams.get("syncApiBase"));
  const syncEnabled = Boolean(syncApiBase);
  const requestedActionType = url.searchParams.get("actionType");
  const requestedHighRiskKind = url.searchParams.get("highRiskKind");
  const requestedOperatorMode = url.searchParams.get("mode") || (requestedActionType || requestedHighRiskKind ? "" : "full");
  const dashboardSessionMode = normalizeText(requestedOperatorMode) === "dashboard";
  const vpsProposal = await retrieveVpsMaintenanceApprovalProposalForOperator({
    provider: resolveMemoryProvider(env),
    proposalId: url.searchParams.get("vpsProposalId")
  });
  const githubActionsVariableProposal = await retrieveGitHubActionsVariableSyncProposalForOperator({
    provider: resolveMemoryProvider(env),
    proposalId: url.searchParams.get("variableProposalId")
  });
  const vpsScope = vpsProposal?.content?.approvalScope ?? {};
  const githubActionsVariableScope = githubActionsVariableProposal?.content?.approvalScope ?? {};
  const html = renderPasskeyOperatorPage({
    origin: url.origin,
    syncApiBase,
    operatorMode: requestedOperatorMode,
    repositoryInput: dashboardSessionMode ? "" : url.searchParams.get("repositoryInput"),
    issueNumber: dashboardSessionMode ? "" : url.searchParams.get("issueNumber"),
    pullNumber: dashboardSessionMode ? "" : url.searchParams.get("pullNumber"),
    phase: url.searchParams.get("phase") || "execution",
    actionType: requestedActionType,
    highRiskKind: requestedHighRiskKind,
    mergeMethod: url.searchParams.get("mergeMethod") || "squash",
    vpsProposalId: url.searchParams.get("vpsProposalId"),
    vpsHost: vpsScope.vpsHost || vpsScope.display?.host || "",
    vpsOperation: vpsScope.vpsOperation || vpsScope.display?.operation || "",
    vpsCapabilityId: vpsScope.vpsCapabilityId || vpsScope.display?.capabilityId || "",
    vpsImpactScope: vpsScope.vpsImpactScope || vpsScope.display?.impactScope || "",
    vpsExpiresAt: vpsScope.vpsExpiresAt || vpsScope.display?.expiresAt || "",
    githubActionsVariableProposalId: url.searchParams.get("variableProposalId"),
    githubActionsVariableProposalName:
      githubActionsVariableScope.variableName || githubActionsVariableProposal?.content?.variableName || "",
    returnUrl: normalizeOperatorReturnUrl(url.searchParams.get("returnUrl")),
    dashboardReturnPath: sanitizeDashboardPreAuthReturnPath(url.searchParams.get("dashboardReturnPath")),
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
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      pragma: "no-cache"
    }
  });
}

async function retrieveVpsMaintenanceApprovalProposalForOperator({ provider, proposalId }) {
  if (!proposalId || !provider || typeof provider.query !== "function") {
    return null;
  }
  const record = await findApprovalRecordById(provider, normalizeText(proposalId));
  return normalizeText(record?.content?.kind) === "vps_privileged_maintenance_approval_proposal" ? record : null;
}

async function retrieveGitHubActionsVariableSyncProposalForOperator({ provider, proposalId }) {
  if (!proposalId || !provider || typeof provider.query !== "function") {
    return null;
  }
  const record = await findApprovalRecordById(provider, normalizeText(proposalId));
  return normalizeText(record?.content?.kind) === "github_actions_variable_sync_approval_proposal" ? record : null;
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
  const scopeResult = await buildPasskeyApprovalScopeForRequest({ provider, payload: body });
  if (!scopeResult.ok) {
    return json(422, {
      ok: false,
      error: "passkey_approval_scope_invalid",
      issues: scopeResult.issues ?? []
    });
  }
  const passkeys = await retrieveRegisteredPasskeys(provider);
  const created = await createPasskeyApprovalOptions({
    adapter: env?.PASSKEY_ADAPTER,
    rpID: env?.VTDD_PASSKEY_RP_ID || new URL(request.url).hostname,
    origin: env?.VTDD_PASSKEY_ORIGIN || new URL(request.url).origin,
    passkeys,
    scope: scopeResult.scope
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
    const dashboardSession = createDashboardReadSessionRecord({
      approvalGrant: verified.approvalGrant,
      credentialId: verified.grantRecord?.content?.credentialId,
      userAgent: request.headers.get("user-agent")
    });
    if (!dashboardSession.ok) {
      return json(422, {
        ok: false,
        error: "dashboard_session_invalid",
        issues: dashboardSession.issues ?? []
      });
    }
    const storedDashboardSession = await provider.store(dashboardSession.record);
    if (!storedDashboardSession?.ok) {
      return json(503, {
        ok: false,
        error: "dashboard_session_write_failed",
        reason: "failed to persist dashboard read session"
      });
    }
    extraHeaders["set-cookie"] = buildDashboardPasskeySessionCookie(dashboardSession.record);
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
    phase: identityFields.has("phase") ? payload?.phase : undefined,
    secretName: identityFields.has("secretName") ? policyInput?.secretName ?? payload?.secretName : undefined,
    variableName: identityFields.has("variableName") ? policyInput?.variableName ?? payload?.variableName : undefined,
    vpsHost: policyInput?.vpsHost ?? payload?.vpsHost,
    vpsOperation: policyInput?.vpsOperation ?? payload?.vpsOperation,
    vpsCapabilityId: policyInput?.vpsCapabilityId ?? payload?.vpsCapabilityId,
    vpsImpactScope: policyInput?.vpsImpactScope ?? payload?.vpsImpactScope,
    vpsExpiresAt: policyInput?.vpsExpiresAt ?? payload?.vpsExpiresAt
  });
}

async function buildPasskeyApprovalScopeForRequest({ provider, payload }) {
  const highRiskKind = normalizeText(payload?.highRiskKind || payload?.policyInput?.highRiskKind);
  if (highRiskKind === "vps_runner_admin" || highRiskKind === "vps_admin") {
    return resolveVpsMaintenanceApprovalScopeForChallenge({ provider, payload });
  }
  if (highRiskKind === "github_actions_variable_sync") {
    const proposalId = normalizeText(payload?.variableProposalId || payload?.policyInput?.variableProposalId);
    if (proposalId) {
      return resolveGitHubActionsVariableSyncApprovalScopeForChallenge({ provider, proposalId });
    }
  }
  return {
    ok: true,
    scope: buildApprovalScopeSnapshot({
      payload,
      policyInput: payload?.policyInput
    })
  };
}

async function resolveGitHubActionsVariableSyncApprovalScopeForChallenge({ provider, proposalId }) {
  const resolution = await resolveGitHubActionsVariableSyncProposal({ provider, proposalId });
  if (!resolution.ok) {
    return {
      ok: false,
      issues: [resolution.reason || resolution.error || "GitHub Actions variable sync approval proposal was not found"]
    };
  }
  return {
    ok: true,
    scope: normalizeScopeSnapshot(resolution.proposal.approvalScope)
  };
}

async function resolveVpsMaintenanceApprovalScopeForChallenge({ provider, payload }) {
  const proposalId = normalizeText(payload?.vpsProposalId || payload?.policyInput?.vpsProposalId);
  if (!proposalId) {
    return {
      ok: false,
      issues: ["vpsProposalId is required for vps_runner_admin approval"]
    };
  }
  const record = await findApprovalRecordById(provider, proposalId);
  if (!record || normalizeText(record?.content?.kind) !== "vps_privileged_maintenance_approval_proposal") {
    return {
      ok: false,
      issues: ["matching VPS maintenance approval proposal was not found"]
    };
  }
  const expiresAt = normalizeText(record?.content?.expiresAt || record?.content?.approvalScope?.vpsExpiresAt);
  if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
    return {
      ok: false,
      issues: ["VPS maintenance approval proposal is expired"]
    };
  }
  return {
    ok: true,
    scope: normalizeScopeSnapshot(record.content.approvalScope)
  };
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

async function buildDashboardChatTrafficControlContext({ env, repository, relatedIssue, text }) {
  const normalizedRepository = normalizeCanonicalRepositoryInput(repository);
  if (!normalizedRepository) {
    return {
      status: "未確認",
      reason: "repository is required before Dashboard Butler can read execution queue truth",
      currentSurface: "dashboard_butler",
      authorityBoundary: "read_only_preflight",
      nextSafeAction: "対象 repository を解決してから execution queue preflight を読む。"
    };
  }
  try {
    const startupPreflight = await buildStartupPreflight({
      repository: normalizedRepository,
      ref: "main",
      issueNumber: normalizePositiveInteger(relatedIssue),
      phase: "execution",
      currentSurface: "dashboard_butler",
      queryText:
        normalizeText(text) ||
        `Dashboard Butler traffic control ${relatedIssue ? `Issue #${relatedIssue}` : ""}`,
      runtimeOrigin: normalizeText(env?.VTDD_RUNTIME_URL) || "https://dashboard-butler.local",
      env
    });
    return {
      status: startupPreflight.executionQueue?.status || "未確認",
      repository: normalizedRepository,
      relatedIssue: normalizePositiveInteger(relatedIssue) || null,
      currentSurface: startupPreflight.currentSurface,
      threadLocalAssumptionsPromoted: startupPreflight.threadLocalAssumptionsPromoted,
      currentNow: startupPreflight.executionQueue?.currentNow || null,
      next: startupPreflight.executionQueue?.next || [],
      sectionSummaries: startupPreflight.executionQueue?.sectionSummaries || {},
      missingSources: startupPreflight.missingSources || [],
      missingSections: startupPreflight.executionQueue?.missingSections || [],
      ownerFacingSummary: startupPreflight.executionQueue?.ownerFacingSummary || "現在の Now は未確認です。",
      trafficControlRule: startupPreflight.executionQueue?.trafficControlRule || null,
      authorityBoundary: "read_only_preflight",
      nextSafeAction: startupPreflight.nextSafeAction
    };
  } catch (error) {
    return {
      status: "未確認",
      repository: normalizedRepository,
      relatedIssue: normalizePositiveInteger(relatedIssue) || null,
      reason: normalizeText(error?.message) || "startup preflight failed",
      currentSurface: "dashboard_butler",
      authorityBoundary: "read_only_preflight",
      nextSafeAction: "preflight failure を owner-facing blocker として報告する。"
    };
  }
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
  let transientText = "";
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
    transientStatus = "replied";
    transientText = "Dashboard thread 接続済み。";
  } else if (eventType === "app_server_turn_failed" || status === "failed") {
    const failureText = buildDashboardAppServerFailureThreadText({ text, status });
    messages.push(
      normalizeDashboardChatMessage(
        {
          threadId,
          role: "system",
          repository,
          relatedIssue,
          status: "failed",
          text: failureText,
          createdAt
        },
        { threadId }
      )
    );
    transientStatus = "failed";
    transientText = failureText;
  } else if (eventType === "app_server_status") {
    transientStatus = status === "replied" ? "replied" : "thinking";
    transientText = buildDashboardOwnerFacingTransientStatusText(input, {
      status,
      text,
      transientStatus
    });
  }
  return {
    ok: true,
    threadId,
    codexThreadId,
    createdAt,
    text,
    transientText,
    transientStatus,
    messages: messages.filter(Boolean)
  };
}

function buildDashboardAppServerFailureThreadText({ text = "", status = "" } = {}) {
  const normalizedText = sanitizeDashboardChatText(text);
  const normalizedStatus = normalizeDashboardEventText(status).toLowerCase();
  if (
    normalizedStatus === "timeout" ||
    /timed out before completion/i.test(normalizedText)
  ) {
    return "codex app-server の応答生成が時間切れになりました。入力は Dashboard thread に保存済みです。同じ thread で続けるか、内容を短くしてもう一度送れます。";
  }
  return normalizedText || "codex app-server が返信前に失敗しました。同じ thread で続けるか、内容を短くしてもう一度送れます。";
}

const DASHBOARD_APP_SERVER_STAGE_TEXT = {
  read_context: "既存 Issue / PR / docs を確認しています。",
  inspect_context: "既存 Issue / PR / docs を確認しています。",
  issue_body: "新しい Issue 本文を作成しています。",
  draft_issue: "新しい Issue 本文を作成しています。",
  github_issue_create: "GitHub に Issue を作成しています。",
  issue_create: "GitHub に Issue を作成しています。",
  bounded_change_contract: "bounded change contract を確認しています。",
  change_contract: "bounded change contract を確認しています。",
  topic_branch: "topic branch を作成しています。",
  branch_create: "topic branch を作成しています。",
  implementation: "実装に入っています。",
  implement: "実装に入っています。",
  test: "テストを実行しています。",
  tests: "テストを実行しています。",
  pr_body: "PR本文を作成しています。",
  pull_request_body: "PR本文を作成しています。",
  pr_create: "PRを作成しています。",
  pull_request_create: "PRを作成しています。",
  reviewer_wait: "CI / reviewer を待っています。",
  ci_wait: "CI / reviewer を待っています。",
  reviewer_revision: "reviewer 指摘を反映しています。",
  review_fix: "reviewer 指摘を反映しています。"
};

function buildDashboardOwnerFacingTransientStatusText(input, { status = "", text = "", transientStatus = "" } = {}) {
  if (transientStatus === "replied" || status === "replied") {
    return "Dashboard thread 接続済み。";
  }
  const stage = normalizeDashboardEventText(
    input.stage ||
      input.phase ||
      input.step ||
      input.activity ||
      input.progressStage ||
      input.progress_stage
  ).toLowerCase();
  const normalizedStage = stage.replaceAll("-", "_");
  if (DASHBOARD_APP_SERVER_STAGE_TEXT[normalizedStage]) {
    return DASHBOARD_APP_SERVER_STAGE_TEXT[normalizedStage];
  }
  const eventType = normalizeDashboardEventText(input.type || input.eventType || input.event_type).toLowerCase();
  const source = [stage, status, eventType, text].filter(Boolean).join(" ").toLowerCase();
  const matches = (patterns) => patterns.some((pattern) => source.includes(pattern));
  if (matches(["reviewer_revision", "reviewer-revision", "review_fix", "review-fix", "address_review", "指摘", "反映"])) {
    return "reviewer 指摘を反映しています。";
  }
  if (matches(["ci", "checks", "check_run", "workflow", "actions", "reviewer_wait", "reviewer-wait", "review_wait"])) {
    return "CI / reviewer を待っています。";
  }
  if (matches(["reviewer", "review", "gemini"])) {
    return "reviewer を待っています。";
  }
  if (matches(["pr_body", "pr-body", "pull_request_body", "pull-request-body", "body_file", "body-file", "pr本文"])) {
    return "PR本文を作成しています。";
  }
  if (matches(["pr_create", "pr-create", "pull_request_create", "pull-request-create", "open_pr", "open-pr", "prを作成"])) {
    return "PRを作成しています。";
  }
  if (matches(["test", "tests", "unit", "integration", "e2e", "テスト"])) {
    return "テストを実行しています。";
  }
  if (matches(["implementation", "implement", "coding", "patch", "edit", "apply_patch", "実装"])) {
    return "実装に入っています。";
  }
  if (matches(["topic_branch", "topic-branch", "branch_create", "branch-create", "checkout_branch", "checkout-branch"])) {
    return "topic branch を作成しています。";
  }
  if (matches(["bounded_change_contract", "bounded-change-contract", "change_contract", "change-contract", "contract"])) {
    return "bounded change contract を確認しています。";
  }
  if (matches(["github_issue_create", "github-issue-create", "issue_create", "issue-create", "create_issue", "create-issue"])) {
    return "GitHub に Issue を作成しています。";
  }
  if (matches(["issue_body", "issue-body", "draft_issue", "draft-issue", "issue_draft", "issue-draft"])) {
    return "新しい Issue 本文を作成しています。";
  }
  if (matches(["read_context", "read-context", "inspect", "investigate", "context", "docs", "document", "issue", "issues", "pr", "pull_request", "pull-request"])) {
    return "既存 Issue / PR / docs を確認しています。";
  }
  return text || "app-server bridge の返信を待っています";
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

async function dispatchDashboardWebPushForEvent(env, event, options = {}) {
  const store = resolveDashboardPushSubscriptionStore(env);
  if (!store || typeof store.list !== "function") {
    return {
      ok: false,
      status: 503,
      error: "dashboard_push_subscription_store_unavailable",
      reason: "dashboard push subscription store cannot list subscriptions"
    };
  }
  const targetEndpointHash = normalizeDashboardEventText(options.endpointHash);
  const subscriptions = targetEndpointHash && typeof store.get === "function"
    ? [await store.get(targetEndpointHash)].filter(Boolean)
    : await store.list({ limit: 50 });
  if (subscriptions.length === 0) {
    return {
      ok: false,
      status: 404,
      error: targetEndpointHash ? "dashboard_push_target_subscription_not_found" : "dashboard_push_subscription_not_found",
      reason: targetEndpointHash ? "target dashboard push subscription is not stored" : "no dashboard push subscriptions are stored"
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
    url: buildDashboardEventOwnerTargetUrl(record),
    sourceEventId: record.id || null,
    kind: record.kind || null,
    repository: record.repository || null,
    workflowName: record.workflowName || null,
    runId: record.runId || null,
    status: record.status || null,
    conclusion: record.conclusion || null,
    pullNumber: record.pullNumber || null,
    issueNumber: record.issueNumber || null
  };
}

function buildDashboardWebPushTitle(record) {
  const repository = shortRepositoryName(record.repository);
  if (record.kind === "dashboard_push_test") {
    return "VTDD Butler テスト通知";
  }
  if (record.kind === "owner_action_required") {
    const subject = compactNotificationText(record.changeSummary || record.title || "確認が必要です", 52);
    return `要対応: ${subject}`.slice(0, 80);
  }
  if (record.kind === "ai_news_radar") {
    const edition = dashboardAiNewsEditionLabel(record);
    const subject = compactNotificationText(record.changeSummary || record.title || "AI 開発運用ニュース", 44);
    return `AI news ${edition}: ${subject}`.slice(0, 80);
  }
  if (record.kind === "vps_runner_execution") {
    return `VPS ${dashboardPushStatusLabel(record)}${repository ? `: ${repository}` : ""}`.slice(0, 80);
  }
  if (record.kind === "github_actions_workflow_run") {
    const isDeploy = normalize(record.workflowName).includes("deploy");
    const label = dashboardPushStatusLabel(record);
    if (isDeploy) {
      const subject = buildDashboardEventSubject(record, { limit: 58 });
      return `デプロイ${label}: ${subject || repository || "repository"}`.slice(0, 80);
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
  if (record.kind === "owner_action_required") {
    const details = [];
    const title = compactNotificationText(record.title || record.changeSummary || "VTDD Butler が確認を待っています", 74);
    if (title) details.push(title);
    if (record.issueNumber) details.push(`Issue #${record.issueNumber}`);
    if (record.pullNumber) details.push(`PR #${record.pullNumber}`);
    if (record.workflowName) details.push(`source: ${compactNotificationText(record.workflowName, 32)}`);
    return details.join(" / ").slice(0, 180);
  }
  if (record.kind === "ai_news_radar") {
    const title = compactNotificationText(record.changeSummary || record.title || "VTDD に関係する更新があります", 96);
    const source = compactNotificationText(record.workflowName || "朝刊・昼刊・夕刊", 40);
    return `${title} / ${source} / 詳細は AI news`.slice(0, 180);
  }
  const details = [];
  const title = compactNotificationText(record.changeSummary || record.title, 58);
  if (title && title !== record.workflowName) {
    details.push(title);
  }
  if (record.pullNumber) {
    details.push(`PR #${record.pullNumber}`);
  }
  if (record.issueNumber) {
    details.push(`Issue #${record.issueNumber}`);
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

function dashboardAiNewsEditionLabel(record) {
  const text = normalize(`${record.workflowName || ""} ${record.title || ""} ${record.changeSummary || ""}`);
  if (text.includes("morning") || text.includes("朝刊")) return "朝刊";
  if (text.includes("noon") || text.includes("昼刊")) return "昼刊";
  if (text.includes("evening") || text.includes("夕刊")) return "夕刊";
  return "更新";
}

function shortRepositoryName(repository) {
  const text = normalizeDashboardEventText(repository);
  const parts = text.split("/");
  return parts.length === 2 ? parts[1] : text;
}

function buildDashboardEventOwnerTargetUrl(event) {
  const record = normalizeDashboardEventRecord(event);
  if (record.kind === "ai_news_radar") {
    return "/dashboard/news";
  }
  if (record.kind === "owner_action_required" && record.runUrl) {
    return record.runUrl;
  }
  return buildDashboardPullRequestUrl(event) || "/dashboard/notifications";
}

function buildDashboardPullRequestUrl(event) {
  const record = normalizeDashboardEventRecord(event);
  const repository = normalizeCanonicalRepositoryInput(record.repository);
  const pullNumber = normalizeIssue(record.pullNumber);
  if (!repository || !pullNumber) {
    return "";
  }
  return `https://github.com/${repository}/pull/${pullNumber}`;
}

function buildDashboardEventLinkHtml(event, fallbackText = "詳細を開く") {
  const pullRequestUrl = buildDashboardPullRequestUrl(event);
  if (pullRequestUrl) {
    return `<a class="chat-link" href="${escapeDashboardHtml(pullRequestUrl)}">PRを開く</a>`;
  }
  const runUrl = normalizeDashboardEventText(event?.runUrl);
  if (runUrl && !/github\.com\/[^/]+\/[^/]+\/actions\/runs\//i.test(runUrl)) {
    return `<a class="chat-link" href="${escapeDashboardHtml(runUrl)}">${escapeDashboardHtml(fallbackText)}</a>`;
  }
  return "詳細リンク未受信";
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
  const clientMessageId = sanitizeDashboardChatText(input.clientMessageId || input.client_message_id);
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
  const relatedIssue =
    normalizePositiveInteger(input.relatedIssue || input.issueNumber) || extractIssueNumberFromDashboardChatText(text);
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
      messageId: clientMessageId || undefined,
      mediaReferences: mediaValidation.mediaReferences,
      createdAt: now
    },
    { threadId }
  );
  const hasVpsPrivilegedMaintenanceIntent = detectDashboardVpsPrivilegedMaintenanceIntent({ text });
  const vpsMaintenanceFlow = hasVpsPrivilegedMaintenanceIntent
    ? await buildDashboardVpsPrivilegedMaintenanceNaturalLanguageFlow({
        payload: { ...input, relatedIssue, issueNumber: relatedIssue },
        repository,
        relatedIssue,
        origin: options.origin,
        env: options.env
      })
    : null;
  const butlerMessage = hasVpsPrivilegedMaintenanceIntent
    ? normalizeDashboardChatMessage(
        {
          threadId,
          role: "butler",
          repository,
          relatedIssue,
          status: normalizeDashboardChatStatus(vpsMaintenanceFlow?.messageStatus || "blocked"),
          text: vpsMaintenanceFlow?.reply || buildDashboardVpsPrivilegedMaintenanceReply({ repository, relatedIssue }),
          createdAt: new Date(Date.parse(now) + 1).toISOString()
        },
        { threadId }
      )
    : null;

  return {
    ok: true,
    repository,
    relatedIssue,
    threadId,
    messages: [ownerMessage, butlerMessage].filter(Boolean),
    execution: vpsMaintenanceFlow?.execution || null
  };
}

async function buildDashboardVpsPrivilegedMaintenanceNaturalLanguageFlow({
  payload,
  repository,
  relatedIssue,
  origin,
  env
} = {}) {
  const provider = resolveMemoryProvider(env);
  const memoryValidation = validateMemoryProvider(provider);
  if (!memoryValidation.ok) {
    return {
      messageStatus: "blocked",
      reply: [
        "Dashboard Butler の自然文から VPS helper queue へ進めようとしましたが、memory provider が未接続です。",
        "",
        `- 対象 repo: ${repository || "未指定"}`,
        `- 関連 Issue: ${relatedIssue ? `#${relatedIssue}` : "未指定"}`,
        "- runtime truth: memory_provider_unavailable",
        "- rootExecutionStarted=false",
        "- helperExecutionStarted=false"
      ].join("\n"),
      execution: {
        kind: "dashboard_vps_privileged_maintenance_natural_language",
        status: "blocked",
        runtimeTruth: {
          kind: "vps_privileged_maintenance_dashboard_natural_language",
          status: "memory_provider_unavailable",
          rootExecutionStarted: false,
          helperExecutionStarted: false
        }
      }
    };
  }

  const approvalGrantId = normalizeText(payload?.approvalGrantId || payload?.approval_grant_id);
  const vpsProposalIdInput = normalizeText(payload?.vpsProposalId || payload?.vps_proposal_id);
  if (!approvalGrantId) {
    const proposalPayload = buildDashboardVpsMaintenanceProposalPayload({
      payload,
      repository,
      relatedIssue,
      env
    });
    const preflight = buildDashboardVpsMaintenanceProposalPreflight({
      proposalPayload,
      repository,
      relatedIssue
    });
    if (!preflight.ok) {
      return {
        messageStatus: "blocked",
        reply: buildDashboardVpsPrivilegedMaintenanceBlockedReply({
          repository,
          relatedIssue,
          error: preflight.error,
          reason: preflight.reason,
          issues: preflight.issues,
          nextAction: preflight.nextAction
        }),
        execution: {
          kind: "dashboard_vps_privileged_maintenance_natural_language",
          status: "blocked",
          runtimeTruth: {
            kind: "vps_privileged_maintenance_dashboard_natural_language",
            status: preflight.status,
            dashboardNaturalLanguagePathReached: true,
            proposalCreated: false,
            helperQueueReached: false,
            missingContext: preflight.missingContext,
            missingConfiguration: preflight.missingConfiguration,
            rootExecutionStarted: false,
            helperExecutionStarted: false
          }
        }
      };
    }
    const proposal = await createVpsPrivilegedMaintenanceProposal({
      payload: proposalPayload,
      provider,
      origin: origin || "https://example.com"
    });
    if (!proposal.ok) {
      return {
        messageStatus: "blocked",
        reply: buildDashboardVpsPrivilegedMaintenanceBlockedReply({
          repository,
          relatedIssue,
          error: proposal.error,
          issues: proposal.issues
        }),
        execution: {
          kind: "dashboard_vps_privileged_maintenance_natural_language",
          status: "blocked",
          runtimeTruth: proposal.body?.runtimeTruth || {
            kind: "vps_privileged_maintenance_dashboard_natural_language",
            status: "blocked",
            rootExecutionStarted: false,
            helperExecutionStarted: false
          }
        }
      };
    }
    return {
      messageStatus: "blocked",
      reply: buildDashboardVpsPrivilegedMaintenanceApprovalRequiredReply({
        repository,
        relatedIssue,
        proposal: proposal.body
      }),
      execution: {
        kind: "dashboard_vps_privileged_maintenance_natural_language",
        status: "approval_required",
        vpsProposalId: proposal.body.vpsProposalId,
        approvalScope: proposal.body.approvalScope,
        approvalOperatorUrl: proposal.body.approvalOperatorUrl,
        runtimeTruth: {
          ...proposal.body.runtimeTruth,
          dashboardNaturalLanguagePathReached: true,
          helperQueueReached: false
        }
      }
    };
  }
  const vpsProposalId = vpsProposalIdInput;

  const helper = await createVpsPrivilegedMaintenanceHelperRequest({
    payload: { vpsProposalId, approvalGrantId },
    provider
  });
  if (!helper.ok) {
    return {
      messageStatus: "blocked",
      reply: buildDashboardVpsPrivilegedMaintenanceBlockedReply({
        repository,
        relatedIssue,
        error: helper.error,
        reason: helper.reason,
        issues: helper.issues
      }),
      execution: {
        kind: "dashboard_vps_privileged_maintenance_natural_language",
        status: "blocked",
        vpsProposalId,
        runtimeTruth: helper.body?.runtimeTruth || {
          kind: "vps_privileged_maintenance_dashboard_natural_language",
          status: "helper_request_blocked",
          rootExecutionStarted: false,
          helperExecutionStarted: false
        }
      }
    };
  }

  const manifest = buildDashboardVpsMaintenanceManifest({
    helperRequest: helper.body.helperRequest,
    now: payload?.now
  });
  const execution = createVpsPrivilegedMaintenanceHelperExecution({
    payload: {
      manifest,
      helperRequest: helper.body.helperRequest,
      now: payload?.now
    }
  });
  if (!execution.ok) {
    return {
      messageStatus: "blocked",
      reply: buildDashboardVpsPrivilegedMaintenanceBlockedReply({
        repository,
        relatedIssue,
        error: execution.error,
        issues: execution.issues
      }),
      execution: {
        kind: "dashboard_vps_privileged_maintenance_natural_language",
        status: "blocked",
        vpsProposalId,
        runtimeTruth: execution.body?.runtimeTruth || {
          kind: "vps_privileged_maintenance_dashboard_natural_language",
          status: "execution_handoff_blocked",
          rootExecutionStarted: false,
          helperExecutionStarted: false
        }
      }
    };
  }

  const queue = await createVpsPrivilegedMaintenanceHelperExecutionQueue({
    payload: {
      repository,
      issueNumber: relatedIssue,
      executionId:
        normalizeText(payload?.executionId || payload?.execution_id) ||
        `dashboard-butler-issue${relatedIssue || "unknown"}-${safeIdentifier(helper.body.helperRequest.requestId)}`,
      dashboardThreadId: normalizeText(payload?.threadId || payload?.thread_id),
      approvalActor: "Dashboard Butler",
      executionEnvelope: execution.body.executionEnvelope
    },
    env
  });
  const reply = queue.ok
    ? buildDashboardVpsPrivilegedMaintenanceQueuedReply({
        repository,
        relatedIssue,
        queue: queue.body
      })
    : buildDashboardVpsPrivilegedMaintenanceBlockedReply({
        repository,
        relatedIssue,
        error: queue.error,
        reason: queue.reason,
        issues: queue.issues
      });

  return {
    messageStatus: queue.ok ? "sent" : "blocked",
    reply,
    execution: {
      kind: "dashboard_vps_privileged_maintenance_natural_language",
      status: queue.ok ? "queued_for_vps_helper_execution" : "blocked",
      vpsProposalId,
      helperRequest: helper.body.helperRequest,
      executionEnvelope: execution.body.executionEnvelope,
      queue: queue.body?.execution || null,
      runtimeTruth: {
        ...(queue.body?.runtimeTruth || {}),
        dashboardNaturalLanguagePathReached: true,
        helperQueueReached: queue.ok === true,
        rootExecutionStarted: false,
        helperExecutionStarted: false
      }
    }
  };
}

function buildDashboardVpsMaintenanceProposalPreflight({ proposalPayload, repository, relatedIssue } = {}) {
  const payload = normalizeObject(proposalPayload);
  const issues = [];
  const missingContext = [];
  const missingConfiguration = [];
  const capabilityId = normalizeText(payload.id || payload.capabilityId) || "unknown capability";
  if (!normalizeCanonicalRepositoryInput(repository || payload.repository)) {
    missingContext.push("repository");
    issues.push("proposal repository is required");
  }
  if (!normalizePositiveInteger(relatedIssue || payload.relatedIssue || payload.issueNumber)) {
    missingContext.push("relatedIssue");
    issues.push("relatedIssue or issueNumber is required");
  }
  if (!normalizeText(payload.host)) {
    missingConfiguration.push("host");
    issues.push("proposal host is required");
  }
  if (!Array.isArray(payload.workingDirectories) || payload.workingDirectories.length === 0) {
    missingConfiguration.push("workingDirectories");
    issues.push(`capability ${capabilityId} requires at least one working directory`);
  }
  if (issues.length === 0) {
    return { ok: true };
  }
  const status =
    missingContext.length > 0
      ? "vps_privileged_maintenance_context_required"
      : "vps_privileged_maintenance_configuration_required";
  const nextAction = [
    missingContext.includes("repository") ? "対象 repository を owner/repo 形式で指定してください。" : "",
    missingContext.includes("relatedIssue") ? "関連 Issue を #番号で指定してください。" : "",
    missingConfiguration.includes("host")
      ? "runtime config に VTDD_DASHBOARD_VPS_MAINTENANCE_HOST を設定してください。"
      : "",
    missingConfiguration.includes("workingDirectories")
      ? "runtime config に VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR を設定してください。"
      : ""
  ]
    .filter(Boolean)
    .join(" ");
  return {
    ok: false,
    status,
    error: status,
    reason: issues.join("; "),
    issues,
    missingContext,
    missingConfiguration,
    nextAction
  };
}

function detectDashboardVpsPrivilegedMaintenanceIntent({ text } = {}) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  const lower = normalized.toLowerCase();
  const hasVpsMaintenance =
    lower.includes("vps") &&
    (lower.includes("privileged") ||
      lower.includes("maintenance") ||
      lower.includes("root") ||
      lower.includes("sudo") ||
      lower.includes("helper") ||
      lower.includes("passkey"));
  const hasJapaneseMaintenance =
    (lower.includes("root") || lower.includes("sudo") || lower.includes("helper")) &&
    (normalized.includes("保守") || normalized.includes("復旧") || normalized.includes("承認"));
  return hasVpsMaintenance || hasJapaneseMaintenance;
}

function buildDashboardVpsMaintenanceProposalPayload({ payload, repository, relatedIssue, env } = {}) {
  const workingDirectory = normalizeText(env?.VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR);
  const preset = resolveDashboardVpsMaintenanceNaturalLanguagePreset({ payload, workingDirectory });
  if (preset) {
    return {
      host: normalizeDashboardVpsMaintenanceHost({ payload, env }),
      repository,
      relatedIssue,
      operation: preset.operation,
      id: preset.id,
      title: preset.title,
      commandClass: preset.commandClass,
      riskLevel: preset.riskLevel,
      workingDirectories: workingDirectory ? [workingDirectory] : [],
      allowedArgs: preset.allowedArgs,
      affectedPaths: preset.affectedPaths,
      redactionRules: ["no secrets", "summarize stdout/stderr", "redact tokens and credentials"],
      rollbackPlan: "disable capability in the root-owned manifest and keep audit history",
      expectedRuntimeTruth: ["before state", "exit code", "redacted log summary", "after state", "next action"],
      reason: `Issue #637 Dashboard Butler natural-language flow: ${preset.id} queue handoff only`
    };
  }
  return {
    host: normalizeDashboardVpsMaintenanceHost({ payload, env }),
    repository,
    relatedIssue,
    operation: "add",
    id: "playwright.chromium.deps",
    title: "Playwright Chromium dependency install",
    commandClass: "playwright_install_deps_chromium",
    riskLevel: "high",
    workingDirectories: workingDirectory ? [workingDirectory] : [],
    allowedArgs: ["npx playwright install-deps chromium"],
    affectedPaths: ["/usr/lib", "/usr/share/fonts"],
    redactionRules: ["no secrets", "summarize package list"],
    rollbackPlan: "disable capability and keep audit history",
    expectedRuntimeTruth: ["before package check", "exit code", "after Chromium launch check"],
    reason: "Issue #637 Dashboard Butler natural-language flow: queue handoff only, no root execution"
  };
}

function normalizeDashboardVpsMaintenanceHost({ payload, env } = {}) {
  return normalizeText(env?.VTDD_DASHBOARD_VPS_MAINTENANCE_HOST);
}

function resolveDashboardVpsMaintenanceNaturalLanguagePreset({ payload, workingDirectory } = {}) {
  const text = normalizeText(payload?.text || payload?.message || payload?.ownerMessage || payload?.owner_message);
  if (!text) return null;
  const lower = text.toLowerCase();
  const wantsLogs = lower.includes("logs") || lower.includes("log") || text.includes("ログ");
  const wantsRestart = lower.includes("restart") || lower.includes("再起動") || text.includes("再起動");
  const wantsStatus =
    lower.includes("status") ||
    lower.includes("health") ||
    lower.includes("state") ||
    text.includes("状態") ||
    text.includes("確認") ||
    text.includes("生存") ||
    text.includes("稼働");
  const mentionsBridge =
    lower.includes("app-server") ||
    lower.includes("app server") ||
    lower.includes("bridge") ||
    text.includes("ブリッジ");
  const mentionsRunner = lower.includes("runner") || text.includes("ランナー") || text.includes("実行器");
  if (!mentionsBridge && !mentionsRunner) return null;

  let commandClass = "";
  if (mentionsBridge && wantsLogs) commandClass = "systemd_user_app_server_bridge_logs";
  else if (mentionsBridge && wantsRestart) commandClass = "systemd_user_app_server_bridge_restart";
  else if (mentionsBridge && wantsStatus) commandClass = "systemd_user_app_server_bridge_status";
  else if (mentionsRunner && wantsLogs) commandClass = "systemd_user_runner_logs";
  else if (mentionsRunner && wantsRestart) commandClass = "systemd_user_runner_restart";
  else if (mentionsRunner && wantsStatus) commandClass = "systemd_user_runner_status";
  if (!commandClass) return null;

  const registryEntry = listVpsPrivilegedMaintenanceCommandRegistry().find((entry) => entry.commandClass === commandClass);
  if (!registryEntry) return null;
  return {
    id: commandClass.replaceAll("_", "."),
    title: registryEntry.title,
    commandClass: registryEntry.commandClass,
    riskLevel: registryEntry.requiredRiskLevel,
    allowedArgs: registryEntry.allowedArgs,
    affectedPaths: [workingDirectory, "/home/vtdd-runner/.config/systemd/user", "/run/user"].filter(Boolean),
    operation: wantsRestart ? "enable" : "review"
  };
}

function buildDashboardVpsMaintenanceManifest({ helperRequest, now } = {}) {
  const updatedAt = normalizeIsoTimestamp(now) || new Date().toISOString();
  return {
    version: 1,
    host: helperRequest.host,
    repository: helperRequest.repository,
    updatedAt,
    capabilities: [
      {
        ...helperRequest.capability,
        status: "enabled",
        createdAt: updatedAt,
        updatedAt
      }
    ]
  };
}

function buildDashboardVpsPrivilegedMaintenanceApprovalRequiredReply({ repository, relatedIssue, proposal } = {}) {
  return [
    "Dashboard Butler の自然文 intent から VPS privileged maintenance proposal まで到達しました。",
    "",
    `- 対象 repo: ${repository || "未指定"}`,
    `- 関連 Issue: ${relatedIssue ? `#${relatedIssue}` : "未指定"}`,
    `- vpsProposalId: ${proposal?.vpsProposalId || "未作成"}`,
    "- authority: passkey approval が必要です。承認なしに root / sudo 実行は開始しません。",
    "- runtime truth: status=approval_required, rootExecutionStarted=false",
    proposal?.approvalOperatorUrl ? `- approval URL: ${proposal.approvalOperatorUrl}` : "- approval URL: 未生成",
    "",
    "承認後、Dashboard Butler はこの同じ自然文フローから helper request / execution handoff / VPS runner queue へ進めます。"
  ].join("\n");
}

function buildDashboardVpsPrivilegedMaintenanceQueuedReply({ repository, relatedIssue, queue } = {}) {
  const execution = queue?.execution || {};
  return [
    "Dashboard Butler の自然文 intent から VPS helper execution queue まで到達しました。",
    "",
    `- 対象 repo: ${repository || execution.repository || "未指定"}`,
    `- 関連 Issue: ${relatedIssue ? `#${relatedIssue}` : execution.issueNumber ? `#${execution.issueNumber}` : "未指定"}`,
    `- executionId: ${execution.executionId || "未生成"}`,
    `- queueCommentUrl: ${execution.queueCommentUrl || "未取得"}`,
    "- authority: passkey approval 済みの helper handoff だけを queue 化しました。",
    "- runtime truth: status=queued_for_vps_helper_execution, rootExecutionStarted=false, helperExecutionStarted=false",
    "",
    "VPS runner pickup の完了 truth が戻るまで、live root 実行完了とは扱いません。"
  ].join("\n");
}

function buildDashboardVpsPrivilegedMaintenanceBlockedReply({ repository, relatedIssue, error, reason, issues, nextAction } = {}) {
  const issueText = Array.isArray(issues) && issues.length > 0 ? issues.join("; ") : reason || "blocked";
  const lines = [
    "Dashboard Butler の自然文 intent から VPS helper queue へ進めようとしましたが、途中で止まりました。",
    "",
    `- 対象 repo: ${repository || "未指定"}`,
    `- 関連 Issue: ${relatedIssue ? `#${relatedIssue}` : "未指定"}`,
    `- error: ${error || "unknown"}`,
    `- reason: ${issueText}`,
    "- runtime truth: rootExecutionStarted=false, helperExecutionStarted=false"
  ];
  if (nextAction) {
    lines.push(`- next action: ${nextAction}`);
  }
  return lines.join("\n");
}

function buildDashboardVpsPrivilegedMaintenanceReply({ repository, relatedIssue } = {}) {
  const repoPhrase = repository ? `対象 repo: ${repository}` : "対象 repo: 未指定";
  const issuePhrase = relatedIssue ? `関連 Issue: #${relatedIssue}` : "関連 Issue: 未指定";
  return [
    "VPS privileged maintenance intent として受け取りました。",
    "",
    "Dashboard Butler 側で owner-facing に扱う境界は、proposal → scoped passkey approval → helper request → dry-run / execution handoff → VPS runner queue です。",
    "",
    `- ${repoPhrase}`,
    `- ${issuePhrase}`,
    "- authority: root / sudo 実行は passkey approval なしでは開始しません。",
    "- runtime truth: helper handoff / queue は rootExecutionStarted=false, helperExecutionStarted=false を返す必要があります。",
    "- next action: passkey scope に host / repository / capability / impact / expiry を表示してから、VPS runner が root-owned helper へ渡します。",
    "",
    "現状: Dashboard Butler はこの intent を VPS privileged maintenance flow として説明できます。ただし live root 実行の完了 claim は、passkey approval と VPS runner pickup の E2E evidence が揃うまで禁止です。"
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
  const title = normalizeDashboardEventText(input.title) || normalizeDashboardEventText(input.workflowName);
  const changeSummary = normalizeDashboardEventText(input.changeSummary);
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
    title,
    changeSummary: changeSummary || null,
    pullNumber: normalizeIssue(input.pullNumber) || inferPullNumberFromText(`${title} ${changeSummary}`),
    issueNumber: normalizeIssue(input.issueNumber),
    pwaNotificationStatus: normalizeDashboardEventText(input.pwaNotificationStatus) || null,
    pwaNotificationError: normalizeDashboardEventText(input.pwaNotificationError) || null,
    pwaNotificationReason: normalizeDashboardEventText(input.pwaNotificationReason) || null,
    pwaNotificationAttempted: normalizeNonNegativeInteger(input.pwaNotificationAttempted),
    pwaNotificationDelivered: normalizeNonNegativeInteger(input.pwaNotificationDelivered),
    pwaNotificationCleaned: normalizeNonNegativeInteger(input.pwaNotificationCleaned),
    pwaReceiveStatus: normalizeDashboardEventText(input.pwaReceiveStatus) || null,
    pwaReceivedAt: normalizeIsoTimestamp(input.pwaReceivedAt) || null,
    createdAt,
    updatedAt
  };
}

function normalizeDashboardEventText(value) {
  return String(value ?? "").trim();
}

function inferPullNumberFromText(value) {
  const text = normalizeDashboardEventText(value);
  if (!text) {
    return null;
  }
  const explicit = text.match(/\b(?:PR|pull request)\s*#?(\d+)\b/i);
  return explicit ? normalizeIssue(explicit[1]) : null;
}

function inferIssueNumberFromText(value) {
  const text = normalizeDashboardEventText(value);
  if (!text) {
    return null;
  }
  const explicit = text.match(/\bIssue\s*#?(\d+)\b/i);
  return explicit ? normalizeIssue(explicit[1]) : null;
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
    if (passkeyAuth.blocking) {
      return {
        ok: false,
        status: 401,
        reason: `Cloudflare Access authenticated owner identity is required for ${routeLabel}`,
        passkeyFallbackReason: passkeyAuth.reason
      };
    }
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
  const sessionId = parseCookieHeader(request.headers.get("cookie"))[DASHBOARD_PASSKEY_SESSION_COOKIE];
  if (!sessionId) {
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

  const record = await findApprovalRecordById(provider, sessionId);
  if (!record) {
    return {
      ok: false,
      blocking: true,
      status: 401,
      reason: "dashboard session was not found; open the dashboard passkey sign-in link again"
    };
  }

  if (normalizeText(record?.content?.kind) === DASHBOARD_READ_SESSION_KIND) {
    if (isExpiredDashboardReadSessionRecord(record)) {
      return {
        ok: false,
        blocking: true,
        status: 401,
        reason: "dashboard session expired; open the dashboard passkey sign-in link again"
      };
    }
    return {
      ok: true,
      authType: "dashboard_read_session",
      subject: normalizeText(record?.content?.deviceLabel) || "dashboard session"
    };
  }

  if (normalizeText(record?.content?.kind) !== "passkey_grant") {
    return {
      ok: false,
      blocking: true,
      status: 401,
      reason: "dashboard session record is not valid; open the dashboard passkey sign-in link again"
    };
  }
  if (isExpiredPasskeyEphemeralRecord(record)) {
    return {
      ok: false,
      blocking: true,
      status: 401,
      reason:
        "legacy dashboard passkey grant expired; open the dashboard passkey sign-in link again"
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

function createDashboardReadSessionRecord({ approvalGrant = {}, credentialId, userAgent } = {}) {
  const sessionId = createDashboardRequestId("dashboard-session");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + DASHBOARD_PASSKEY_SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const record = createMemoryRecord({
    id: sessionId,
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: DASHBOARD_READ_SESSION_KIND,
      status: "active",
      sessionId,
      sourceApprovalId: normalizeText(approvalGrant.approvalId),
      credentialId: normalizeText(credentialId),
      deviceLabel: normalizeDashboardDeviceLabel(userAgent),
      createdAt,
      lastSeenAt: createdAt,
      expiresAt,
      scope: {
        actionType: "read",
        highRiskKind: "dashboard_access"
      }
    },
    metadata: {
      source: "dashboard_passkey_session_verify",
      sourceApprovalId: normalizeText(approvalGrant.approvalId)
    },
    priority: 95,
    tags: [DASHBOARD_READ_SESSION_KIND, "dashboard_session"],
    createdAt
  });
  return record;
}

function isExpiredDashboardReadSessionRecord(record) {
  const expiresAt = normalizeText(record?.content?.expiresAt);
  return !expiresAt || Date.parse(expiresAt) <= Date.now();
}

function normalizeDashboardDeviceLabel(userAgent) {
  const value = normalizeText(userAgent);
  if (!value) {
    return "dashboard device";
  }
  if (/iPhone/i.test(value)) {
    return "iPhone";
  }
  if (/iPad/i.test(value)) {
    return "iPad";
  }
  if (/Macintosh|Mac OS X/i.test(value)) {
    return "Mac";
  }
  if (/Android/i.test(value)) {
    return "Android";
  }
  return "dashboard device";
}

function buildDashboardPasskeySessionCookie(sessionRecord = {}) {
  const sessionId = normalizeText(sessionRecord.id || sessionRecord.sessionId || sessionRecord.approvalId);
  return [
    `${DASHBOARD_PASSKEY_SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
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
  const changeSummary = normalizeDashboardEventText(
    input.changeSummary ||
      input.change_summary ||
      input.mergeSummary ||
      input.merge_summary ||
      input.pullRequestTitle ||
      input.pull_request_title
  );
  const pullNumber =
    normalizeIssue(input.pullNumber || input.pull_number || input.prNumber || input.pr_number) ||
    inferPullNumberFromText(`${title} ${changeSummary}`);
  const issueNumber = normalizeIssue(input.issueNumber || input.issue_number);

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
    changeSummary: changeSummary || null,
    pullNumber,
    issueNumber,
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

function normalizeOwnerActionRequiredDashboardEvent(payload) {
  const input = normalizeObject(payload);
  const repository = normalizeCanonicalRepositoryInput(input.repository || input.repositoryInput);
  const actionId = normalizeDashboardEventText(input.actionId || input.action_id || input.runId || input.run_id);
  const title = sanitizeDashboardChatText(input.title);
  const changeSummary = sanitizeDashboardChatText(input.summary || input.message || input.reason || input.changeSummary);
  const issueNumber = normalizeIssue(input.issueNumber || input.issue_number || input.relatedIssue);
  const pullNumber = normalizeIssue(input.pullNumber || input.pull_number);
  const rawRunUrl = normalizeDashboardEventText(input.url || input.runUrl || input.run_url);
  const runUrl = normalizeOwnerActionRequiredRunUrl(rawRunUrl);
  const workflowName = sanitizeDashboardChatText(input.workflowName || input.workflow_name || "owner-action-required");
  const updatedAt = normalizeIsoTimestamp(input.updatedAt || input.updated_at) || new Date().toISOString();
  const createdAt = normalizeIsoTimestamp(input.createdAt || input.created_at) || updatedAt;

  if (!repository) {
    return {
      ok: false,
      error: "repository_required",
      reason: "owner action notification repository is required"
    };
  }
  if (!actionId) {
    return {
      ok: false,
      error: "owner_action_required_action_id_required",
      reason: "owner action notification requires a stable actionId or runId"
    };
  }
  if (!title && !changeSummary) {
    return {
      ok: false,
      error: "owner_action_required_title_required",
      reason: "owner action notification requires a title or summary"
    };
  }
  if (!runUrl) {
    return {
      ok: false,
      error: "owner_action_required_recovery_url_required",
      reason: "owner action notification requires a same-origin /dashboard recovery url"
    };
  }

  return {
    ok: true,
    event: normalizeDashboardEventRecord({
      id: `owner-action-required:${repository}:${actionId}`,
      kind: "owner_action_required",
      repository,
      workflowName,
      runId: actionId,
      status: "waiting",
      conclusion: "action_required",
      title,
      changeSummary,
      pullNumber,
      issueNumber,
      runUrl,
      createdAt,
      updatedAt
    })
  };
}

function normalizeOwnerActionRequiredRunUrl(value) {
  const text = normalizeDashboardEventText(value);
  if (!text || text.startsWith("//")) {
    return "";
  }
  if (text === "/dashboard" || text.startsWith("/dashboard/") || text.startsWith("/dashboard?")) {
    return text;
  }
  return "";
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

function attachDashboardPushReceiveTruth(events = []) {
  const ackByKey = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const record = normalizeDashboardEventRecord(event);
    if (record.kind !== "dashboard_push_received") {
      continue;
    }
    const key = dashboardNotificationReceiveKey(record);
    if (!key) {
      continue;
    }
    const existing = ackByKey.get(key);
    if (!existing || compareDashboardEventRecency(record, existing) > 0) {
      ackByKey.set(key, record);
    }
  }
  const annotated = [];
  for (const event of Array.isArray(events) ? events : []) {
    const record = normalizeDashboardEventRecord(event);
    if (record.kind === "dashboard_push_received") {
      const matchingWorkflowEvent = events.some((candidate) => {
        const candidateRecord = normalizeDashboardEventRecord(candidate);
        return candidateRecord.kind !== "dashboard_push_received" &&
          dashboardNotificationReceiveKey(candidateRecord) === dashboardNotificationReceiveKey(record);
      });
      if (matchingWorkflowEvent) {
        continue;
      }
      annotated.push({
        ...record,
        pwaReceiveStatus: "confirmed",
        pwaReceivedAt: record.updatedAt
      });
      continue;
    }
    const ack = ackByKey.get(dashboardNotificationReceiveKey(record));
    annotated.push({
      ...record,
      pwaReceiveStatus: ack ? "confirmed" : record.pwaNotificationDelivered > 0 ? "unconfirmed" : null,
      pwaReceivedAt: ack?.updatedAt || null
    });
  }
  return annotated;
}

function dashboardNotificationReceiveKey(event) {
  const record = normalizeDashboardEventRecord(event);
  const repository = normalizeCanonicalRepositoryInput(record.repository);
  const workflowName = normalizeDashboardEventText(record.workflowName);
  const runId = normalizeDashboardEventText(record.runId);
  if (!repository || !workflowName || !runId) {
    return "";
  }
  return `${repository}:${workflowName}:${runId}`;
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
  const runLabel = buildDashboardEventLinkHtml(event);
  const title = buildDashboardEventDisplayTitle(event, {
    workflowName: normalizeDashboardEventText(event.workflowName) || "deploy-production",
    conclusion
  });
  const meta = [
    event.workflowName || "deploy-production",
    event.pullNumber ? `PR #${event.pullNumber}` : "",
    event.issueNumber ? `Issue #${event.issueNumber}` : "",
    shortSha ? `sha ${shortSha}` : ""
  ].filter(Boolean).join(" / ");
  return `<div class="deploy-event">
            <div class="lane-title"><strong>最新 deploy</strong><span class="pill ${badgeClass}">${escapeDashboardHtml(conclusion)}</span></div>
            <p><strong>${escapeDashboardHtml(title)}</strong></p>
            <p>${escapeDashboardHtml(meta)}</p>
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
  const title = buildDashboardEventDisplayTitle(event, { workflowName, conclusion, shortStatus: conclusion });
  const runId = normalizeDashboardEventText(event.runId);
  const sha = normalizeDashboardEventText(event.headSha);
  const shortSha = sha ? sha.slice(0, 7) : "";
  const runLabel = buildDashboardEventLinkHtml(event);
  const notificationTruth = renderDashboardNotificationTruth(event);
  const meta = [
    repository,
    event.pullNumber ? `PR #${event.pullNumber}` : "",
    event.issueNumber ? `Issue #${event.issueNumber}` : "",
    workflowName,
    runId ? `run ${runId}` : "",
    shortSha ? `sha ${shortSha}` : ""
  ].filter(Boolean).join(" / ");
  return `<div class="deploy-event">
            <div class="lane-title"><strong>${escapeDashboardHtml(title)}</strong><span class="pill ${badgeClass}">${escapeDashboardHtml(conclusion)}</span></div>
            <p>${escapeDashboardHtml(meta)}</p>
            ${notificationTruth}
            <p class="muted">${escapeDashboardHtml(relativeUpdatedAt || "時刻未受信")} ・ ${escapeDashboardHtml(updatedAt || "updatedAt 未受信")} ・ ${runLabel}</p>
          </div>`;
}

function renderDashboardNotificationTruth(event) {
  const record = normalizeDashboardEventRecord(event);
  const attempted = record.pwaNotificationAttempted;
  const delivered = record.pwaNotificationDelivered;
  const cleaned = normalizeNonNegativeInteger(event?.pwaNotificationCleaned);
  const receiveStatus = normalizeDashboardEventText(event?.pwaReceiveStatus);
  const receivedAt = normalizeDashboardEventText(event?.pwaReceivedAt);
  if (attempted === 0 && delivered === 0 && receiveStatus !== "confirmed") {
    return "";
  }
  const details = [];
  if (attempted > 0 || delivered > 0) {
    details.push(`Web Push: push service accepted ${delivered}/${attempted}`);
  }
  if (cleaned > 0) {
    details.push(`stale cleanup ${cleaned}`);
  }
  if (record.pwaNotificationError || record.pwaNotificationReason) {
    details.push(record.pwaNotificationError || record.pwaNotificationReason);
  }
  if (receiveStatus === "confirmed") {
    details.push(`PWA受信確認: あり${receivedAt ? ` ${formatDashboardRelativeTime(receivedAt)}` : ""}`);
  } else if (delivered > 0) {
    details.push("PWA受信確認: 未確認");
  }
  if (details.length === 0) {
    return "";
  }
  return `<p class="muted">${escapeDashboardHtml(details.join(" / "))}</p>`;
}

function collapseDashboardNotificationEvents(events = []) {
  const latestByKey = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const record = normalizeDashboardEventRecord(event);
    const key = dashboardNotificationCollapseKey(record);
    const existing = latestByKey.get(key);
    if (!existing || compareDashboardEventRecency(record, existing) > 0) {
      latestByKey.set(key, record);
    }
  }
  return [...latestByKey.values()].sort((a, b) => compareDashboardEventRecency(b, a));
}

function dashboardNotificationCollapseKey(event) {
  const record = normalizeDashboardEventRecord(event);
  const repository = normalizeCanonicalRepositoryInput(record.repository) || "repo-unknown";
  const workflowName = normalizeDashboardEventText(record.workflowName || record.kind) || "workflow-unknown";
  if (record.pullNumber) {
    return `${repository}:pr:${record.pullNumber}:${workflowName}`;
  }
  const branch = normalizeDashboardEventText(record.headBranch);
  const sha = normalizeDashboardEventText(record.headSha).slice(0, 12);
  return `${repository}:workflow:${workflowName}:${branch || sha || record.runId || "unknown"}`;
}

function compareDashboardEventRecency(left, right) {
  const leftTime = new Date(normalizeDashboardEventText(left?.updatedAt || left?.createdAt)).getTime();
  const rightTime = new Date(normalizeDashboardEventText(right?.updatedAt || right?.createdAt)).getTime();
  const normalizedLeft = Number.isNaN(leftTime) ? 0 : leftTime;
  const normalizedRight = Number.isNaN(rightTime) ? 0 : rightTime;
  if (normalizedLeft !== normalizedRight) {
    return normalizedLeft - normalizedRight;
  }
  return String(left?.runId || left?.id || "").localeCompare(String(right?.runId || right?.id || ""));
}

function buildDashboardEventDisplayTitle(event, { workflowName, conclusion } = {}) {
  const record = normalizeDashboardEventRecord(event);
  const statusLabel = dashboardPushStatusLabel(record);
  const isDeploy = record.kind === "github_actions_workflow_run" && normalize(workflowName || record.workflowName).includes("deploy");
  const baseSummary = buildDashboardEventSubject(record, { limit: 96 });
  const pullPrefix = record.pullNumber ? `PR #${record.pullNumber}` : "";
  if (isDeploy) {
    return baseSummary ? `デプロイ${statusLabel}: ${baseSummary}` : `デプロイ${statusLabel}: ${record.repository || "repository"} ${record.headSha ? record.headSha.slice(0, 7) : ""}`.trim();
  }
  if (pullPrefix && baseSummary) {
    return baseSummary.startsWith(pullPrefix) ? baseSummary : `${pullPrefix}: ${baseSummary}`;
  }
  if (pullPrefix) {
    return `${workflowName || record.workflowName || "Actions"} ${dashboardPushStatusLabel(record)}: ${pullPrefix}`;
  }
  return baseSummary || workflowName || record.kind || conclusion || "dashboard event";
}

function buildDashboardEventSubject(event, { limit = 80 } = {}) {
  const record = normalizeDashboardEventRecord(event);
  const rawSummary = normalizeDashboardEventText(record.changeSummary || record.title);
  const summary = rawSummary && rawSummary !== record.workflowName ? rawSummary : "";
  const pullPrefix = record.pullNumber ? `PR #${record.pullNumber}` : "";
  const issueNumber = record.issueNumber || inferIssueNumberFromText(summary);
  const issuePrefix = issueNumber ? `Issue #${issueNumber}` : "";
  const withoutDuplicatedPull = pullPrefix
    ? summary.replace(new RegExp(`\\bPR\\s*#?${record.pullNumber}\\b\\s*[:：-]?\\s*`, "i"), "").trim()
    : summary;
  const withoutDuplicatedIssue = issueNumber
    ? withoutDuplicatedPull
        .replace(new RegExp(`\\bIssue\\s*#?${issueNumber}\\b\\s*[:：-]?\\s*`, "i"), "")
        .replace(new RegExp(`#${issueNumber}\\b\\s*[:：-]?\\s*`, "i"), "")
        .trim()
    : withoutDuplicatedPull;
  return compactNotificationText(
    [pullPrefix, issuePrefix, withoutDuplicatedIssue].filter(Boolean).join(" "),
    limit
  );
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
  const recentEvents = await retrieveRecentDashboardEvents({
    store: dashboardEventStore,
    limit: 30
  });
  const visibleRecentEvents = collapseDashboardNotificationEvents(attachDashboardPushReceiveTruth(recentEvents));
  const publicKey = normalizeDashboardEventText(env?.[WEB_PUSH_PUBLIC_KEY_ENV]);
  return renderDashboardUtilityPage({
    title: "通知センター",
    subtitle: "dashboard events",
    backHref: `${origin}/dashboard`,
    body: `
      <div class="grid single">
        <section class="lane">
          <div class="lane-title"><h2>最新通知</h2><span class="pill">直近30件</span></div>
          ${visibleRecentEvents.length > 0 ? visibleRecentEvents.map((event) => renderDashboardNotificationEvent(event)).join("") : `<p class="muted">通知はありません。</p>`}
        </section>
      </div>
      <div class="grid single">
        <details class="lane" data-debug-section="notification-center-context">
          <summary>通知センターについて</summary>
          <p>Dashboard Butler の通知入口です。iOS PWA Web Push、OS の通知音、未読 badge はこの画面から許可・確認します。</p>
          <p class="muted">VTDD だけでなく、他 repo / 並行開発 / queue / workflow から届いたイベントを直近30件まで表示します。Web Push は push service accepted と PWA受信確認を分けて表示します。</p>
        </details>
      </div>
      <div class="grid single">
        <details class="lane" data-settings-section="notification-pwa-settings">
          <summary>通知設定</summary>
          <div class="settings-stack">
            <section class="setting-block">
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
            <section class="setting-block">
              <div class="lane-title"><h2>Badge</h2><span class="pill" id="badge-support-pill">確認中</span></div>
              <p id="badge-state" class="muted">Badging API の対応状況を確認しています。</p>
              <div class="actions">
                <button class="dashboard-action" id="badge-set-button" type="button">未読数を反映</button>
                <button class="dashboard-action" id="badge-clear-button" type="button">Badge を消す</button>
              </div>
            </section>
          </div>
        </details>
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
            if (normalized.includes("exception")) return "browser exception";
            if (normalized.includes("accepted")) return "accepted";
            if (normalized.includes("stale")) return "stale subscription";
            if (normalized.includes("not found")) return "subscription not found";
            if (normalized.includes("unconfigured")) return "server push unconfigured";
            if (normalized.includes("rejected")) return "push service rejected";
            if (normalized.includes("required")) return "required setting missing";
            if (normalized.includes("unauthorized") || normalized.includes("forbidden")) return "session/auth required";
            return "details redacted";
          }

          function setButtonBusy(button, busy) {
            if (!button) return;
            button.disabled = Boolean(busy);
            button.setAttribute("aria-busy", busy ? "true" : "false");
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
            setButtonBusy(serverTestButton, true);
            serverPushDelivered = false;
            lastServerPushResult = "最後のサーバ送信結果: 送信中...";
            setText(pushServerResult, lastServerPushResult);
            try {
              const reg = await registration();
              const subscription = await reg?.pushManager?.getSubscription?.();
              if (!subscription) {
                lastServerPushResult = "最後のサーバ送信結果: rejected (0/0) / current device subscription missing";
                setText(pushServerResult, lastServerPushResult);
                await refreshState();
                return;
              }
              const response = await fetch("/v2/dashboard/push/test", {
                method: "POST",
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ title: "Dashboard Butler server push test", endpoint: subscription.endpoint })
              });
              const body = await response.json().catch(() => ({}));
              const webPush = body && body.webPush ? body.webPush : {};
              const attempted = Number(webPush.attempted || 0);
              const delivered = Number(webPush.delivered || 0);
              const firstResult = Array.isArray(webPush.results) ? webPush.results[0] : null;
              const detail = safePushResultDetail(
                firstResult?.reason ||
                  firstResult?.error ||
                  webPush.reason ||
                  webPush.error ||
                  (response.ok ? "" : response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden" : "rejected")
              );
              serverPushDelivered = response.ok && delivered > 0 && delivered === attempted;
              lastServerPushResult = serverPushDelivered
                ? "最後のサーバ送信結果: accepted (" + delivered + "/" + attempted + ")"
                : "最後のサーバ送信結果: rejected (" + delivered + "/" + attempted + ")" + (detail ? " / " + detail : "");
              setText(pushServerResult, lastServerPushResult);
              await refreshState();
            } catch (error) {
              serverPushDelivered = false;
              const detail = safePushResultDetail("exception " + (error && error.name ? error.name : ""));
              lastServerPushResult = "最後のサーバ送信結果: rejected (0/0)" + (detail ? " / " + detail : "");
              setText(pushServerResult, lastServerPushResult);
              await refreshState();
            } finally {
              setButtonBusy(serverTestButton, false);
            }
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
        src: `${origin}${DASHBOARD_ICON_PNG_PATH}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      },
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
  const shown = self.registration.showNotification(title, options);
  const ack = fetch("/v2/dashboard/push/ack", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "x-vtdd-dashboard-push-ack": "service-worker"
    },
    body: JSON.stringify({
      sourceEventId: payload.sourceEventId || "",
      kind: payload.kind || "",
      repository: payload.repository || "",
      workflowName: payload.workflowName || "",
      runId: payload.runId || "",
      status: payload.status || "",
      conclusion: payload.conclusion || "",
      pullNumber: payload.pullNumber || null,
      issueNumber: payload.issueNumber || null,
      tag: options.tag,
      title,
      body: options.body
    })
  }).catch(() => null);
  event.waitUntil(shown);
  event.waitUntil(ack);
});

function safeDashboardNotificationUrl(value) {
  let parsed;
  try {
    parsed = new URL(value || "/dashboard/notifications", self.location.origin);
  } catch {
    parsed = new URL("/dashboard/notifications", self.location.origin);
  }
  if (parsed.origin === "https://github.com" && /^\\/[^/]+\\/[^/]+\\/pull\\/\\d+\\/?$/.test(parsed.pathname)) {
    return parsed.toString();
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

function renderDashboardUtilityNavLinks() {
  const items = [
    ["Dashboard", "/dashboard"],
    ["通知センター", "/dashboard/notifications"],
    ["AI news", "/dashboard/news"],
    ["GitHub truth", "/dashboard/github-truth"],
    ["Startup preflight", "/dashboard/preflight"],
    ["Execution progress", "/dashboard/progress"],
    ["VPS runner", "/dashboard/vps-runner"],
    ["Operational RAG", "/dashboard/memory"],
    ["Self parity", "/dashboard/self-parity"]
  ];
  return items
    .map(([label, href]) => `<a class="dashboard-nav-link" href="${escapeDashboardHtml(href)}">${escapeDashboardHtml(label)}</a>`)
    .join("");
}

function renderDashboardDrawerResizeScript({ drawerSelector, handleSelector, storageKey, cssVariable }) {
  return `<script>
    (() => {
      const drawer = document.querySelector(${JSON.stringify(drawerSelector)});
      const handle = document.querySelector(${JSON.stringify(handleSelector)});
      const storageKey = ${JSON.stringify(storageKey)};
      const cssVariable = ${JSON.stringify(cssVariable)};
      const desktopQuery = window.matchMedia("(min-width: 761px)");
      if (!drawer || !handle || !desktopQuery.matches) return;

      const clampWidth = (value) => {
        const viewportMax = Math.max(300, Math.floor(window.innerWidth * 0.92));
        return Math.max(300, Math.min(viewportMax, Math.min(720, value)));
      };
      const applyWidth = (value) => {
        const width = clampWidth(value);
        document.documentElement.style.setProperty(cssVariable, width + "px");
        return width;
      };

      try {
        const storedWidth = Number.parseInt(globalThis.localStorage.getItem(storageKey) || "", 10);
        if (Number.isFinite(storedWidth) && storedWidth > 0) applyWidth(storedWidth);
      } catch (_) {
        // localStorage can be unavailable in restricted webviews.
      }

      let dragPointerId = null;
      handle.addEventListener("pointerdown", (event) => {
        if (!desktopQuery.matches) return;
        dragPointerId = event.pointerId;
        handle.setPointerCapture?.(event.pointerId);
        document.documentElement.classList.add("dashboard-drawer-resizing");
        event.preventDefault();
      });
      handle.addEventListener("pointermove", (event) => {
        if (dragPointerId !== event.pointerId) return;
        const nextWidth = applyWidth(event.clientX - drawer.getBoundingClientRect().left);
        try {
          globalThis.localStorage.setItem(storageKey, String(nextWidth));
        } catch (_) {
          // Persisting the width is best-effort only.
        }
      });
      const stopResize = (event) => {
        if (dragPointerId !== event.pointerId) return;
        dragPointerId = null;
        document.documentElement.classList.remove("dashboard-drawer-resizing");
        handle.releasePointerCapture?.(event.pointerId);
      };
      handle.addEventListener("pointerup", stopResize);
      handle.addEventListener("pointercancel", stopResize);
    })();
  </script>`;
}

function renderDashboardUtilityPage({ title, subtitle, backHref, body }) {
  const navLinks = renderDashboardUtilityNavLinks();
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="manifest" href="/dashboard.webmanifest">
  ${DASHBOARD_ICON_LINKS}
  <meta name="theme-color" content="#050505">
  <title>${escapeDashboardHtml(title)} - VTDD Butler</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --bg: #f7f7f4; --panel: #fff; --text: #151515; --muted: #62625d; --border: #deded6; --soft: #f0f0eb; --dashboard-utility-drawer-width: min(86vw, 360px); }
    @media (prefers-color-scheme: dark) { :root { --bg: #050505; --panel: #101010; --text: #f7f7f4; --muted: #a0a09a; --border: #2b2b2b; --soft: #1b1b1b; } }
    * { box-sizing: border-box; }
    html, body { max-width: 100%; overflow-x: hidden; }
    body { margin: 0; background: var(--bg); color: var(--text); }
    body:has(.dashboard-nav-toggle:checked) { overflow: hidden; }
    main { width: min(1280px, 100vw); margin: 0 auto; padding: 16px; overflow-x: hidden; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; }
    h1 { font-size: 24px; margin: 0 0 4px; }
    h2 { font-size: 18px; margin: 0; }
    p { line-height: 1.6; margin: 0 0 10px; }
    a { color: inherit; text-underline-offset: 4px; }
    .back, .actions a, .dashboard-action, .menu-button { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; border: 1px solid var(--border); border-radius: 999px; padding: 6px 12px; background: var(--soft); color: var(--text); text-decoration: none; font: inherit; font-weight: 750; }
    .menu-button { width: 42px; height: 42px; padding: 0; font-size: 22px; cursor: pointer; flex: 0 0 auto; }
    .utility-shell { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 24px; align-items: start; }
    .utility-content { min-width: 0; }
    .utility-title-row { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .desktop-nav { position: sticky; top: 16px; display: grid; gap: 8px; border: 1px solid var(--border); border-radius: 18px; background: var(--panel); padding: 12px; }
    .desktop-nav-title { color: var(--muted); font-size: 12px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; padding: 4px 8px 8px; }
    .dashboard-nav-link { display: flex; align-items: center; min-height: 38px; border-radius: 10px; padding: 8px 10px; color: var(--text); text-decoration: none; font-weight: 750; }
    .dashboard-nav-link:hover, .dashboard-nav-link:focus-visible { background: var(--soft); outline: none; }
    .dashboard-nav-toggle { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    .dashboard-nav-backdrop, .dashboard-nav-drawer { display: none; }
    .dashboard-nav-backdrop { position: fixed; inset: 0; z-index: 20; max-width: 100vw; overflow: hidden; background: rgba(0, 0, 0, .36); backdrop-filter: blur(2px); }
    .dashboard-nav-drawer { position: fixed; inset: 0 auto 0 0; z-index: 21; width: min(var(--dashboard-utility-drawer-width), 92vw); max-width: 92vw; overflow: auto; overflow-x: hidden; padding: max(16px, env(safe-area-inset-top)) 14px max(18px, env(safe-area-inset-bottom)); border-right: 1px solid var(--border); background: var(--panel); box-shadow: 18px 0 60px rgba(0, 0, 0, .22); }
    .dashboard-nav-toggle:checked ~ .dashboard-nav-backdrop, .dashboard-nav-toggle:checked ~ .dashboard-nav-drawer { display: block; }
    .drawer-resize-handle { display: none; }
    .drawer-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
    .drawer-header strong { display: block; }
    .drawer-nav { display: grid; gap: 8px; }
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
    .settings-stack { display: grid; gap: 14px; margin-top: 12px; }
    .setting-block { border-top: 1px solid var(--border); padding-top: 12px; }
    .setting-block:first-child { border-top: 0; padding-top: 0; }
    .pill { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; padding: 3px 8px; background: var(--soft); font-size: 12px; white-space: nowrap; }
    .pill.success { border-color: #7fb797; background: #e7f5ec; color: #145c34; }
    .pill.danger { border-color: #d69b9b; background: #fff0f0; color: #8a1f1f; }
    .deploy-event { border: 1px solid var(--border); border-radius: 12px; padding: 10px; margin: 10px 0; background: var(--soft); }
    .deploy-event p { margin-bottom: 6px; font-size: 13px; }
    code { overflow-wrap: anywhere; }
    @media (max-width: 760px) {
      main { padding: 12px; }
      header { align-items: flex-start; }
      .utility-shell { display: block; }
      .desktop-nav { display: none; }
      .back { display: none; }
      .grid { grid-template-columns: minmax(0, 1fr); }
      .summary-list div { grid-template-columns: minmax(0, 1fr); }
    }
    @media (min-width: 761px) {
      .utility-title-row .menu-button { display: none; }
      .drawer-resize-handle { display: block; position: absolute; top: 0; right: -6px; bottom: 0; width: 12px; cursor: ew-resize; touch-action: none; }
      .drawer-resize-handle::after { content: ""; position: absolute; top: 18px; bottom: 18px; left: 5px; width: 2px; border-radius: 999px; background: transparent; }
      .drawer-resize-handle:hover::after, .drawer-resize-handle:focus-visible::after, .dashboard-drawer-resizing .drawer-resize-handle::after { background: var(--border); }
      .dashboard-drawer-resizing, .dashboard-drawer-resizing * { cursor: ew-resize !important; user-select: none; }
    }
  </style>
</head>
<body>
  <main>
    <input class="dashboard-nav-toggle" type="checkbox" id="dashboard-nav-toggle" aria-hidden="true">
    <label class="dashboard-nav-backdrop" for="dashboard-nav-toggle" aria-label="メニューを閉じる"></label>
    <aside class="dashboard-nav-drawer" aria-label="Dashboard メニュー">
      <div class="drawer-header">
        <span>
          <span class="desktop-nav-title">Dashboard</span>
          <strong>メニュー</strong>
        </span>
        <label class="menu-button" for="dashboard-nav-toggle" aria-label="メニューを閉じる">×</label>
      </div>
      <nav class="drawer-nav" aria-label="Dashboard メニュー項目">${navLinks}</nav>
      <div class="drawer-resize-handle" data-drawer-resize-handle="dashboard-utility" role="separator" aria-orientation="vertical" aria-label="メニュー幅を変更"></div>
    </aside>
    <div class="utility-shell">
      <nav class="desktop-nav" aria-label="Dashboard メニュー">
        <span class="desktop-nav-title">Dashboard</span>
        ${navLinks}
      </nav>
      <section class="utility-content" aria-label="${escapeDashboardHtml(title)}">
        <header>
          <div class="utility-title-row">
            <label class="menu-button" for="dashboard-nav-toggle" aria-label="メニューを開く">≡</label>
            <div>
              <h1>${escapeDashboardHtml(title)}</h1>
              <p class="muted">${escapeDashboardHtml(subtitle || "")}</p>
            </div>
          </div>
          <a class="back" href="${escapeDashboardHtml(backHref || "/dashboard")}">Dashboard</a>
        </header>
        ${body}
      </section>
    </div>
  </main>
  ${renderDashboardDrawerResizeScript({
    drawerSelector: ".dashboard-nav-drawer",
    handleSelector: '[data-drawer-resize-handle="dashboard-utility"]',
    storageKey: "vtdd.dashboard.utilityDrawer.width",
    cssVariable: "--dashboard-utility-drawer-width"
  })}
</body>
</html>`;
}

function renderDashboardNewsPage({ runtimeOrigin, env } = {}) {
  const origin = normalize(runtimeOrigin);
  const pagesUrl = normalizeDashboardExternalUrl(env?.AI_NEWS_MAGAZINE_URL);
  const magazineHref = pagesUrl || "#pages-url-unset";
  const magazineStatus = pagesUrl
    ? "Cloudflare Pages の公開 URL が runtime 設定済みです。"
    : "Cloudflare Pages の公開 URL は未設定です。deploy 後に AI_NEWS_MAGAZINE_URL を設定します。";
  const cards = [
    {
      edition: "朝刊",
      title: "Agent runtime / Skills / Codex の新情報",
      summary: "前日から朝までの更新を短く拾い、VTDD の運用統制・handoff・RAG に関係するものだけを上に出します。",
      terminology: "Skill: agent に特定責務と手順を渡し、脱線を減らすための小さな運用単位。"
    },
    {
      edition: "昼刊",
      title: "実装に影響する差分",
      summary: "API、SDK、Cloudflare、GitHub Actions、PWA 通知など、今日の実装判断に影響しそうな差分を拾います。",
      terminology: "Runtime truth: 画面や記憶ではなく、現在の実行基盤が返す状態そのもの。"
    },
    {
      edition: "夕刊",
      title: "VTDD に残すべき判断",
      summary: "ニュースから Issue 化すべきもの、RAG に残すべき決定、今は捨てるべき流行を分けます。",
      terminology: "Operator visibility: owner が iPhone PWA だけで進捗、失敗、次の操作を見られること。"
    }
  ];
  const cardMarkup = cards
    .map((card) => `<article class="truth-card">
      <div class="lane-title"><h2>${escapeDashboardHtml(card.edition)}</h2><span class="pill">AI news</span></div>
      <p><strong>${escapeDashboardHtml(card.title)}</strong></p>
      <p>${escapeDashboardHtml(card.summary)}</p>
      <p class="muted">${escapeDashboardHtml(card.terminology)}</p>
    </article>`)
    .join("");
  return renderDashboardUtilityPage({
    title: "AI news",
    subtitle: "OpenAI / Codex / Skills / Claude Code / Cloudflare などを VTDD 目線で読む入口",
    backHref: `${origin}/dashboard`,
    body: `<section class="hero">
      <div class="lane-title"><h2>朝刊・昼刊・夕刊</h2><span class="pill">Issue #620</span></div>
      <p>Dashboard Butler の通常チャットとは分けて、AI 開発運用ニュースを読む面です。専門用語、VTDD への影響、出典リンクを一緒に出します。</p>
      <p class="muted">${escapeDashboardHtml(magazineStatus)}</p>
      <div class="actions">
        <a href="${escapeDashboardHtml(magazineHref)}">Cloudflare Pages magazine を開く</a>
        <a href="${escapeDashboardHtml(origin)}/dashboard/notifications">通知センター</a>
      </div>
    </section>
    <section class="lane">
      <div class="lane-title"><h2>最新号の構成</h2><span class="pill">日本語-first</span></div>
      ${cardMarkup}
    </section>
    <section class="lane">
      <div class="lane-title"><h2>初期ソース</h2><span class="pill">sources</span></div>
      <p><a href="https://github.com/openai/skills">openai/skills</a></p>
      <p><a href="https://developers.openai.com/">OpenAI Developers</a></p>
      <p><a href="https://developers.cloudflare.com/pages/">Cloudflare Pages docs</a></p>
      <p class="muted">ここはニュース本文の保存先ではなく入口です。記事一覧と詳細は Cloudflare Pages 側に置き、Dashboard PWA 通知はこのページへ戻します。</p>
    </section>`
  });
}

function normalizeDashboardExternalUrl(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
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

export function normalizeDashboardChatMessageText(text) {
  return decodeSafeDashboardChatCommandText(String(text || ""));
}

export function shouldWrapDashboardChatCodeBlock(text) {
  const source = String(text || "").trim();
  if (!source) return false;
  if (/^https?:\/\//i.test(source)) return true;
  if (/^go:%[0-9a-f]{2}/i.test(source)) return true;
  return source.length > 80 && !/\s/.test(source);
}

export function shouldSubmitDashboardComposerShortcut(event) {
  return (
    event &&
    event.key === "Enter" &&
    event.shiftKey !== true &&
    event.isComposing !== true &&
    (event.metaKey === true || event.ctrlKey === true)
  );
}

function decodeSafeDashboardChatCommandText(text) {
  const source = String(text || "");
  return source
    .split("\n")
    .map((line) => {
      if (!/^go:%[0-9a-f]{2}/i.test(line)) {
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
    .join("\n");
}

async function renderV2DashboardPage({ runtimeOrigin, url, dashboardEventStore } = {}) {
  const origin = normalize(runtimeOrigin);
  const repositoryInput = normalizeDashboardRepositoryInput(
    url?.searchParams?.get("repositoryInput") || url?.searchParams?.get("repository")
  );
  const dashboardIssueNumber = normalizePositiveInteger(url?.searchParams?.get("issueNumber"));
  const requestedChatThreadId = normalizeDashboardThreadId(url?.searchParams?.get("threadId") || url?.searchParams?.get("thread_id"));
  const dashboardTargetLabel = repositoryInput ? `この作業: ${repositoryInput}` : "作業対象 repo 未指定";
  const targetStatusMarkup = repositoryInput
    ? `<p><strong>${escapeDashboardHtml(repositoryInput)}</strong></p>
          <p class="muted">固定ではありません。この会話で Issue / PR / deploy など repo が必要な作業をする間だけ対象にします。deploy 先と承認境界は repo ごとに確認します。</p>`
    : `<p><strong>作業対象 repo 未指定</strong></p>
          <p class="muted">通常会話は続けられます。Issue / PR / deploy など repo が必要な作業を始める時だけ、この作業の対象 repo を指定します。VTDD と TOMIO では deploy 先も承認境界も別物として扱います。</p>
          <form class="target-form" method="get" action="${escapeDashboardHtml(origin)}/dashboard">
            <label for="dashboard-repository-input">この作業の対象 repo</label>
            <div class="target-form-row">
              <input id="dashboard-repository-input" name="repository" placeholder="owner/repo" autocomplete="off" autocapitalize="off" spellcheck="false">
              ${dashboardIssueNumber ? `<input type="hidden" name="issueNumber" value="${dashboardIssueNumber}">` : ""}
              <button type="submit">設定</button>
            </div>
          </form>`;
  const encodedRepository = encodeURIComponent(repositoryInput);
  const chatThreadId = requestedChatThreadId || `dashboard-main-${(repositoryInput || "unresolved").replace(/[^a-z0-9_.-]+/gi, "-")}`;
  const socketOrigin = origin.replace(/^http/i, "ws");
  const currentDashboardReturnPath = withDashboardReturnThreadId(
    sanitizeDashboardPreAuthReturnPath(`${url?.pathname || "/dashboard"}${url?.search || ""}`),
    chatThreadId
  );
  const dashboardSignInUrl = `${origin}/v2/approval/passkey/operator?mode=dashboard&phase=execution&actionType=read&highRiskKind=dashboard_access&dashboardReturnPath=${encodeURIComponent(currentDashboardReturnPath)}`;
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
      href: repositoryInput ? `${origin}/dashboard/preflight?repository=${encodedRepository}` : "",
      disabledReason: "repo 設定後に開けます"
    },
    {
      title: "Execution progress",
      body: "VPS Codex CLI / remote Codex execution の進捗確認。",
      href: repositoryInput ? `${origin}/dashboard/progress?repository=${encodedRepository}` : "",
      disabledReason: "repo 設定後に開けます"
    },
    {
      title: "VPS runner status",
      body: "runner health、queue、対象 execution の状態確認。",
      href: repositoryInput ? `${origin}/dashboard/vps-runner?repository=${encodedRepository}` : "",
      disabledReason: "repo 設定後に開けます"
    },
    {
      title: "GitHub runtime truth",
      body: "Issues、PRs、checks、workflow runs、reviewer comments を読む入口。",
      href: repositoryInput ? `${origin}/dashboard/github?repository=${encodedRepository}` : "",
      disabledReason: "repo 設定後に開けます"
    },
    {
      title: "通知センター",
      body: "GitHub Actions / deploy から Worker に届いた dashboard event を人間向けに見る入口。",
      href: `${origin}/dashboard/notifications`
    },
    {
      title: "AI news",
      body: "OpenAI / Codex / Skills / Claude Code など、VTDD に影響する更新を朝刊・昼刊・夕刊として読む入口。",
      href: `${origin}/dashboard/news`
    },
    {
      title: "Operational RAG",
      body: "decision / proposal / working memory の compact retrieval。runtime truth の代替ではない。",
      href: repositoryInput ? `${origin}/dashboard/memory?repository=${encodedRepository}` : "",
      disabledReason: "repo 設定後に開けます"
    },
    {
      title: "Self parity",
      body: "Action Schema、Instructions、Cloudflare deploy freshness、operator URL を確認。",
      href: repositoryInput ? `${origin}/dashboard/self-parity?repository=${encodedRepository}` : "",
      disabledReason: "repo 設定後に開けます"
    },
    {
      title: "Setup diagnostics",
      body: "Butler / Custom GPT / deploy drift の診断ページ。",
      href: repositoryInput ? `${origin}/setup/diagnostics?repository=${encodedRepository}` : "",
      disabledReason: "repo 設定後に開けます"
    },
    {
      title: "本番反映 / Passkey 承認",
      body: "production deploy はこの作業の対象 repo と deploy 先を確認してから、scope 明示済み passkey approval の後ろで開きます。",
      href: repositoryInput
        ? `${origin}/v2/approval/passkey/operator?repositoryInput=${encodedRepository}&phase=execution&actionType=deploy_production&highRiskKind=deploy_production`
        : "",
      disabledReason: "repo 設定後に開けます"
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
      label: "通知",
      href: `${origin}/dashboard/notifications`
    },
    {
      label: "AI news",
      href: `${origin}/dashboard/news`
    },
    {
      label: "進捗を見る",
      href: repositoryInput ? `${origin}/dashboard/progress?repository=${encodedRepository}` : "",
      disabledReason: "repo 設定後"
    },
    {
      label: "GitHub状況",
      href: repositoryInput ? `${origin}/dashboard/github?repository=${encodedRepository}` : "",
      disabledReason: "repo 設定後"
    }
  ];
  const renderDashboardActionList = (actions) =>
    actions
      .map((action) =>
        action.href
          ? `<a href="${escapeDashboardHtml(action.href)}">${escapeDashboardHtml(action.label || action.title)}</a>`
          : `<span class="disabled-action" aria-disabled="true"><strong>${escapeDashboardHtml(action.label || action.title)}</strong><small>${escapeDashboardHtml(action.disabledReason || "利用できません")}</small></span>`
      )
      .join("");
  const renderDashboardSurfaceList = (items) =>
    items
      .map((surface) =>
        surface.href
          ? `<a href="${escapeDashboardHtml(surface.href)}">${escapeDashboardHtml(surface.title)}</a>`
          : `<span class="disabled-action" aria-disabled="true"><strong>${escapeDashboardHtml(surface.title)}</strong><small>${escapeDashboardHtml(surface.disabledReason || "利用できません")}</small></span>`
      )
      .join("");

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="manifest" href="/dashboard.webmanifest">
  ${DASHBOARD_ICON_LINKS}
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
      --link: #0b6b65;
      --owner-link: #9ee7ff;
      --code-bg: #fbfbf7;
      --code-text: #151515;
      --owner-code-bg: #2a2a2a;
      --owner-code-text: #f7f7f4;
      --owner-code-border: #4a4a4a;
      --shadow: rgba(20, 20, 20, .12);
      --dashboard-drawer-width: min(86vw, 380px);
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
        --link: #90cdf4;
        --owner-link: #075985;
        --code-bg: #171717;
        --code-text: #f7f7f4;
        --owner-code-bg: #ffffff;
        --owner-code-text: #111111;
        --owner-code-border: #cfcfc8;
        --shadow: rgba(0, 0, 0, .42);
      }
    }
    * { box-sizing: border-box; min-width: 0; }
    html, body { width: 100%; max-width: 100%; height: 100%; overflow: hidden; overscroll-behavior-x: none; }
    body { margin: 0; background: var(--page-bg); position: fixed; inset: 0; touch-action: pan-y; }
    main { width: 100%; max-width: 100vw; height: 100dvh; min-height: 0; display: block; padding: 16px; overflow: hidden; overscroll-behavior-x: none; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { font-size: 22px; line-height: 1.1; margin-bottom: 4px; }
    h2 { font-size: 19px; margin-bottom: 12px; }
    h3 { font-size: 15px; margin-bottom: 8px; }
    p { line-height: 1.65; color: var(--text); }
    a { color: inherit; }
    .app-shell { width: 100%; max-width: 100%; height: calc(100dvh - 32px); min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; overflow: hidden; overscroll-behavior-x: none; }
    .topbar { width: 100%; max-width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 4px 2px 20px; overflow: hidden; overscroll-behavior-x: none; touch-action: pan-y; }
    .top-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .round-button, .tool-button, .send-button { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border); background: var(--button); color: var(--text); text-decoration: none; font: inherit; font-weight: 750; }
    .menu-open { cursor: pointer; }
    .round-button { width: 44px; height: 44px; border-radius: 999px; font-size: 24px; flex: 0 0 auto; }
    .tool-button { min-height: 40px; border-radius: 999px; padding: 0 14px; white-space: nowrap; }
    .thread-title { min-width: 0; max-width: 100%; }
    .thread-title h1 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .thread-title span { display: block; color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chat-scroll { width: 100%; max-width: 100%; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior-x: none; overscroll-behavior-y: contain; touch-action: pan-y; padding: 8px 18px 28px 4px; scroll-padding-bottom: 28px; scrollbar-gutter: stable; display: flex; flex-direction: column; gap: 22px; scrollbar-width: thin; }
    .bubble { max-width: min(760px, 88%); min-width: 0; color: var(--text); font-size: 17px; line-height: 1.72; }
    .bubble, .bubble p, .bubble li { overflow-wrap: anywhere; }
    .bubble-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .bubble strong { display: block; color: var(--muted); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 8px; }
    .bubble-header strong { margin-bottom: 0; }
    .bubble p { color: var(--text); margin-bottom: 12px; }
    .bubble .message-body { display: grid; gap: 12px; min-width: 0; max-width: 100%; overflow: hidden; }
    .bubble .message-body p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
    .bubble .message-body ul { margin: 0; }
    .bubble .message-body li + li { margin-top: 4px; }
    .bubble .message-body a, .bubble .message-body code { overflow-wrap: anywhere; word-break: break-word; }
    .bubble .message-body code { color: var(--code-text); font-size: .94em; }
    .bubble .message-body pre { position: relative; margin: 0; padding: 42px 14px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--code-bg); color: var(--code-text); overflow-x: hidden; white-space: pre-wrap; max-width: 100%; }
    .bubble .message-body pre.wrap-code { overflow-x: hidden; white-space: pre-wrap; }
    .bubble .message-body pre code { display: block; max-width: 100%; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; font-size: 14px; line-height: 1.55; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
    .bubble .message-body pre.wrap-code code { white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
    .bubble .message-body strong { display: inline; color: inherit; font-size: inherit; letter-spacing: 0; text-transform: none; margin: 0; font-weight: 800; }
    .message-meta { margin-top: 6px; color: var(--muted); font-size: 11px; line-height: 1.2; opacity: .86; }
    .bubble.owner .message-meta { color: var(--owner-text); opacity: .76; text-align: right; }
    .bubble.has-copy-action { position: relative; }
    .copy-message, .copy-code { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 1px solid var(--border); border-radius: 999px; background: var(--button); color: var(--text); font-size: 15px; line-height: 1; cursor: pointer; }
    .copy-message { position: absolute; top: -8px; right: -8px; z-index: 2; opacity: 0; pointer-events: none; transform: translateY(-2px) scale(.96); transition: opacity .16s ease, transform .16s ease; }
    .bubble.has-copy-action:hover .copy-message, .bubble.has-copy-action:focus-within .copy-message, .bubble.actions-visible .copy-message, .copy-message:focus-visible { opacity: .92; pointer-events: auto; transform: translateY(0) scale(1); }
    .copy-message:focus-visible, .copy-code:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
    .copy-code { position: absolute; top: 8px; right: 8px; z-index: 1; opacity: .88; }
    .copy-code:hover, .copy-code:focus-visible { opacity: 1; }
    .bubble ul { margin: 0; padding-left: 22px; color: var(--text); line-height: 1.85; }
    .bubble.owner { position: relative; align-self: flex-end; background: var(--owner-bubble); color: var(--owner-text); border-radius: 24px; padding: 12px 16px; }
    .bubble.owner p { color: var(--owner-text); margin: 0; }
    .bubble.owner ul, .bubble.owner li, .bubble.owner li::marker { color: var(--owner-text); }
    .bubble.owner .message-body code { color: var(--owner-code-text); }
    .bubble.owner .message-body pre { background: var(--owner-code-bg); border-color: var(--owner-code-border); color: var(--owner-code-text); }
    .bubble.owner .message-body pre code { color: var(--owner-code-text); }
    .bubble.owner .copy-message { top: -10px; left: -10px; right: auto; width: 28px; height: 28px; background: var(--panel-strong); color: var(--text); }
    .bubble.thinking { color: var(--muted); }
    .thinking-dots::after { content: ""; display: inline-block; width: 1.4em; text-align: left; animation: thinkingDots 1.2s steps(4, end) infinite; }
    @keyframes thinkingDots { 0% { content: ""; } 25% { content: "."; } 50% { content: ".."; } 75%, 100% { content: "..."; } }
    .chat-link { color: var(--link); text-decoration-thickness: 1px; text-underline-offset: 4px; font-weight: 750; overflow-wrap: anywhere; word-break: break-word; }
    .bubble.owner .chat-link { color: var(--owner-link); }
    .composer { width: 100%; max-width: 100%; min-width: 0; display: grid; gap: 8px; z-index: 4; padding: 14px 0 max(16px, env(safe-area-inset-bottom)); background: var(--page-bg); overflow: hidden; overscroll-behavior-x: none; }
    .composer-box { width: 100%; max-width: 100%; display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; align-items: end; gap: 8px; min-height: 62px; padding: 8px; border: 1px solid var(--border); border-radius: 28px; background: var(--panel-strong); box-shadow: 0 16px 60px var(--shadow); overflow: hidden; overscroll-behavior-x: none; }
    textarea { width: 100%; max-width: 100%; min-height: 44px; max-height: max(88px, min(160px, 24dvh)); border: 0; outline: 0; resize: none; overflow-y: hidden; overflow-x: hidden; padding: 10px 2px; color: var(--text); background: transparent; font: inherit; line-height: 1.45; }
    textarea::placeholder { color: var(--muted); }
    .media-button { width: 44px; height: 44px; border-radius: 999px; border: 1px solid var(--border); background: var(--button); color: var(--text); font: inherit; font-size: 24px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
    .send-button { width: 44px; height: 44px; border-radius: 999px; background: var(--text); color: var(--page-bg); font-size: 22px; }
    .pending-media, .message-media { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 8px; max-width: 100%; overflow: hidden; }
    .pending-media:empty, .message-media:empty { display: none; }
    .media-chip { display: inline-flex; align-items: center; max-width: 100%; min-width: 0; min-height: 34px; border: 1px solid var(--border); border-radius: 14px; padding: 5px 10px; gap: 8px; color: var(--text); background: var(--soft); font-size: 12px; text-decoration: none; overflow: hidden; }
    .media-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: min(48vw, 320px); }
    .media-thumb { width: 48px; height: 48px; flex: 0 0 auto; border-radius: 10px; object-fit: cover; background: var(--border); }
    .media-chip.pending-preview { padding: 5px 8px 5px 5px; }
    .media-remove { border: 0; background: transparent; color: var(--muted); font: inherit; font-weight: 900; padding: 0 2px; cursor: pointer; }
    .composer-status { min-height: 18px; padding-left: 16px; color: var(--muted); font-size: 12px; max-width: 100%; overflow-wrap: anywhere; }
    .composer-status:empty { min-height: 0; padding-left: 0; }
    .composer-status a { color: var(--text); font-weight: 800; text-underline-offset: 3px; }
    .composer-status.thinking::after { content: ""; display: inline-block; width: 1.4em; text-align: left; animation: thinkingDots 1.2s steps(4, end) infinite; }
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
    .quick-actions a, .surface-list a, .disabled-action { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; border: 1px solid var(--border); border-radius: 10px; padding: 7px 9px; color: var(--text); text-decoration: none; background: var(--soft); font-weight: 750; font-size: 13px; text-align: center; }
    .disabled-action { flex-direction: column; gap: 2px; color: var(--muted); background: transparent; cursor: not-allowed; }
    .disabled-action strong { font-size: 13px; }
    .disabled-action small { font-size: 11px; font-weight: 650; line-height: 1.2; }
    .target-form { display: grid; gap: 6px; margin-top: 10px; }
    .target-form label { color: var(--muted); font-size: 12px; font-weight: 800; }
    .target-form-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
    .target-form input { min-width: 0; min-height: 38px; border: 1px solid var(--border); border-radius: 10px; padding: 7px 9px; color: var(--text); background: var(--panel); font: inherit; }
    .target-form button { min-height: 38px; border: 1px solid var(--border); border-radius: 10px; padding: 7px 10px; color: var(--text); background: var(--button); font: inherit; font-weight: 800; }
    summary { cursor: pointer; color: var(--text); font-weight: 800; }
    .muted { color: var(--muted); }
    code { color: var(--text); overflow-wrap: anywhere; }
    .menu-toggle { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    .mobile-backdrop, .mobile-drawer { display: none; }
    .mobile-backdrop { position: fixed; inset: 0; z-index: 10; width: 100vw; max-width: 100vw; overflow: hidden; overscroll-behavior-x: none; touch-action: none; background: rgba(0, 0, 0, .38); backdrop-filter: blur(2px); }
    .mobile-drawer { position: fixed; top: 0; bottom: 0; left: 0; z-index: 11; width: min(var(--dashboard-drawer-width), 92vw); max-width: 92vw; overflow-y: auto; overflow-x: hidden; overscroll-behavior-x: none; touch-action: pan-y; padding: max(16px, env(safe-area-inset-top)) 14px max(18px, env(safe-area-inset-bottom)); border-right: 1px solid var(--border); background: var(--panel); box-shadow: 18px 0 60px var(--shadow); }
    .menu-toggle:checked ~ .mobile-backdrop, .menu-toggle:checked ~ .mobile-drawer { display: block; }
    .drawer-resize-handle { display: none; }
    .mobile-drawer-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
    .mobile-drawer-content { display: grid; gap: 12px; }
    .menu-callout { color: var(--muted); font-size: 12px; line-height: 1.55; }
    @media (min-width: 1180px) {
      .chat-scroll { align-items: center; }
      .bubble.owner { margin-right: calc((100% - 760px) / 2); }
    }
    @media (max-width: 900px) {
      main { padding: 14px 14px 0; }
      .app-shell { height: calc(100dvh - 14px); }
      .chat-scroll { padding-bottom: 28px; }
      .bubble { max-width: 100%; font-size: 16px; }
      .bubble.owner { max-width: min(82%, calc(100vw - 56px)); }
      .topbar { padding-bottom: 18px; }
    }
    @media (max-width: 460px) {
      main { padding: 12px 10px 0; }
      .app-shell { height: calc(100dvh - 12px); }
      .composer-box { grid-template-columns: 40px minmax(0, 1fr) 40px; border-radius: 24px; }
      .round-button { width: 40px; height: 40px; }
      .tool-button { min-height: 38px; padding: 0 10px; font-size: 13px; }
      .media-button, .send-button { width: 40px; height: 40px; }
    }
    @media (min-width: 761px) {
      .drawer-resize-handle { display: block; position: absolute; top: 0; right: -6px; bottom: 0; width: 12px; cursor: ew-resize; touch-action: none; }
      .drawer-resize-handle::after { content: ""; position: absolute; top: 18px; bottom: 18px; left: 5px; width: 2px; border-radius: 999px; background: transparent; }
      .drawer-resize-handle:hover::after, .drawer-resize-handle:focus-visible::after, .dashboard-drawer-resizing .drawer-resize-handle::after { background: var(--border); }
      .dashboard-drawer-resizing, .dashboard-drawer-resizing * { cursor: ew-resize !important; user-select: none; }
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
          <p class="menu-callout">通知、進捗、この作業の対象 repo の確認はここから開きます。開発/運用の詳細は下に隔離しています。</p>
          <div class="lane">
            <div class="lane-title"><h3>この作業の対象 repo</h3><span class="pill">${repositoryInput ? "active" : "未指定"}</span></div>
            ${targetStatusMarkup}
          </div>
          <div class="lane">
            <div class="lane-title"><h3>Issue 候補</h3><span class="pill">draft</span></div>
            <p>Issue / PR 操作が必要になった時だけ、会話の中で対象と範囲を確認します。</p>
          </div>
          <div class="lane">
            <div class="lane-title"><h3>進行中</h3><span class="pill">状態</span></div>
            <p>直近の反映、失敗、進行中の作業があればここに出します。</p>
            ${renderDashboardDeployEvent(latestDeployEvent)}
            <div class="quick-actions">
              ${renderDashboardActionList(cockpitActions)}
            </div>
          </div>
          <details data-debug-section="dashboard-development-operations">
            <summary>開発/運用</summary>
            <div class="surface-list">
              ${renderDashboardSurfaceList(surfaces)}
            </div>
          </details>
          <details data-debug-section="dashboard-workflows">
            <summary>GitHub workflows</summary>
            <div class="surface-list">
              ${workflows.map(([title, href]) => `<a href="${escapeDashboardHtml(href)}">${escapeDashboardHtml(title)}</a>`).join("")}
            </div>
          </details>
          <details data-debug-section="dashboard-prototype-cleanup">
            <summary>Prototype cleanup</summary>
            <p>v3 Worker prototype の削除や移行は destructive operation 扱いです。必要になった時だけ、対象 runtime と scope を明示した passkey approval で扱います。</p>
          </details>
        </div>
        <div class="drawer-resize-handle" data-drawer-resize-handle="dashboard-main" role="separator" aria-orientation="vertical" aria-label="管理メニュー幅を変更"></div>
      </aside>

      <div class="chat-scroll" id="butler-chat-log" data-thread-id="${escapeDashboardHtml(chatThreadId)}">
        <article class="bubble owner">
          <p>ここはカスタム GPT の Butler。</p>
        </article>
        <article class="bubble">
          <strong>Butler</strong>
          <p>はい。ここではまず普通に会話できます。通知、進捗、この作業の対象 repo の確認は必要な時だけ開けます。</p>
          <p>作業を進める時は、対象 repo、Issue、deploy 先を会話の中で確認してから進めます。</p>
          <ul>
            <li>対象: <code>${escapeDashboardHtml(dashboardTargetLabel)}</code></li>
            <li>通知と進捗はこの画面から戻って確認できます。</li>
          </ul>
        </article>
        <article class="bubble owner">
          <p>管理画面的なヤツはサイドバーに置けば良くない？</p>
        </article>
        <article class="bubble">
          <strong>Butler</strong>
          <p>その方針で進めます。中央はチャットを主役にして、細かい設定や開発/運用の確認はメニューの中に分けます。</p>
          <p>接続できない時も、入力内容を失わないように必要な状態だけ短く表示します。</p>
        </article>

      </div>

      <form class="composer" id="butler-chat-form" aria-label="Butler composer" autocomplete="off" data-socket-endpoint="${escapeDashboardHtml(socketOrigin)}/v2/dashboard/chat/${escapeDashboardHtml(chatThreadId)}/ws" data-thread-endpoint="${escapeDashboardHtml(origin)}/v2/dashboard/chat/${escapeDashboardHtml(chatThreadId)}" data-message-endpoint="${escapeDashboardHtml(origin)}/v2/dashboard/chat/messages" data-thread-id="${escapeDashboardHtml(chatThreadId)}" data-repository-input="${escapeDashboardHtml(repositoryInput)}" data-issue-number="${dashboardIssueNumber || ""}">
        <div class="pending-media" id="butler-pending-media" aria-live="polite"></div>
        <div class="composer-box">
          <button class="media-button" id="butler-media-button" type="button" aria-label="画像・動画・ファイルを追加" title="画像・動画・ファイルを追加">+</button>
          <input id="butler-media-input" type="file" multiple hidden>
          <textarea id="butler-message" name="text" placeholder="Butler V2 にメッセージ..." aria-label="Butler V2 にメッセージ" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send"></textarea>
          <button class="send-button" type="submit" aria-label="Butler に送信">↑</button>
        </div>
        <div class="composer-status" id="butler-chat-status">接続準備中です。送信できる状態になったら知らせます。</div>
      </form>
    </section>
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
      const dashboardSignInUrl = ${JSON.stringify(dashboardSignInUrl)};
      const threadId = form.dataset.threadId;
      const repositoryInput = form.dataset.repositoryInput;
      const issueNumber = Number.parseInt(form.dataset.issueNumber || "", 10);
      const initialMarkup = log.innerHTML;
      let chatSocket = null;
      let reconnectTimer = null;
      let reconnectAttempt = 0;
      let refreshingThread = false;
      let lastRefreshFailure = "";
      let pendingMediaItems = [];
      const pendingSendRollbacks = new Map();
      const messagesById = new Map();
      let pendingOwnerSend = null;
      let retryClientMessageId = "";
      let dashboardSessionExpired = false;
      let authReturnResumePromise = null;
      const dashboardDraftKey = "vtdd.dashboard.draft:" + (threadId || "unknown");
      const dashboardDraftMetaKey = dashboardDraftKey + ":meta";

      function getDashboardDraftStorage() {
        return window.sessionStorage;
      }

      function persistDashboardDraft() {
        try {
          const draftStorage = getDashboardDraftStorage();
          draftStorage.setItem(dashboardDraftKey, textarea.value || "");
          draftStorage.setItem(
            dashboardDraftMetaKey,
            JSON.stringify({
              pendingMediaCount: pendingMediaItems.length,
              updatedAt: new Date().toISOString()
            })
          );
        } catch {}
      }

      function clearDashboardDraft() {
        try {
          const draftStorage = getDashboardDraftStorage();
          draftStorage.removeItem(dashboardDraftKey);
          draftStorage.removeItem(dashboardDraftMetaKey);
        } catch {}
      }

      function restoreDashboardDraft() {
        try {
          const draftStorage = getDashboardDraftStorage();
          const draft = draftStorage.getItem(dashboardDraftKey) || "";
          const rawMeta = draftStorage.getItem(dashboardDraftMetaKey) || "";
          const meta = rawMeta ? JSON.parse(rawMeta) : {};
          if (draft && !textarea.value) {
            textarea.value = draft;
            normalizeComposerInput();
            setStatus(
              Number(meta.pendingMediaCount || 0) > 0
                ? "前回の入力を復元しました。添付は再選択してください。"
                : "前回の入力を復元しました。",
              { temporary: true }
            );
          }
        } catch {}
      }

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

      function normalizeComposerInputText(text) {
        return decodeSafeChatCommandText(String(text || ""));
      }

      function normalizeComposerInput() {
        const normalized = normalizeComposerInputText(textarea.value);
        if (normalized !== textarea.value) {
          textarea.value = normalized;
        }
        resizeComposerInput();
      }

      function scrollToLatest() {
        updateComposerReserve();
        log.scrollTop = log.scrollHeight;
        requestAnimationFrame(() => {
          log.scrollTop = log.scrollHeight;
        });
      }

      function setStatus(text, options = {}) {
        status.replaceChildren(document.createTextNode(text));
        if (options.actionHref && options.actionLabel) {
          status.appendChild(document.createTextNode(" "));
          const action = document.createElement("a");
          action.href = options.actionHref;
          action.textContent = options.actionLabel;
          action.rel = "noreferrer";
          status.appendChild(action);
        }
        status.classList.toggle("thinking", options.thinking === true);
        if (options.temporary === true) {
          const expected = text;
          window.setTimeout(() => {
            if (status.textContent.trim() === expected) {
              setStatus("");
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

      function describeChatSocketState() {
        if (!chatSocket) return "未接続";
        if (chatSocket.readyState === WebSocket.CONNECTING) return "接続中";
        if (chatSocket.readyState === WebSocket.OPEN) return "接続済み";
        if (chatSocket.readyState === WebSocket.CLOSING) return "切断処理中";
        if (chatSocket.readyState === WebSocket.CLOSED) return "切断済み";
        return "不明";
      }

      function setConnectionRecoveryStatus(message, options = {}) {
        if (dashboardSessionExpired) return;
        const attempt = Math.max(1, reconnectAttempt + 1);
        status.dataset.reconnectAttempt = String(attempt);
        status.dataset.websocketState = describeChatSocketState();
        status.dataset.lastRefreshFailure = lastRefreshFailure || "";
        setStatus(message, { temporary: options.temporary !== false });
      }

      function buildReconnectStatus(prefix) {
        return prefix + " 入力は保持しています。";
      }

      function dropStaleSocketIfNeeded() {
        if (!chatSocket) return;
        if (chatSocket.readyState === WebSocket.CLOSING || chatSocket.readyState === WebSocket.CLOSED) {
          try {
            chatSocket.close();
          } catch {}
          chatSocket = null;
        }
      }

      function isAuthExpiredResponse(response, body = {}) {
        return (
          response &&
          (response.status === 401 || response.status === 403) &&
          (body.error === "dashboard_auth_required" || String(body.reason || "").includes("passkey session"))
        );
      }

      function setDashboardSessionExpiredStatus() {
        dashboardSessionExpired = true;
        persistDashboardDraft();
        setComposerLocked(false);
        const submitButton = form.querySelector("button[type='submit']");
        if (submitButton) submitButton.disabled = false;
        if (reconnectTimer) {
          window.clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        setStatus("Dashboard のログインが切れています。入力は残したまま再ログインしてください。", {
          actionHref: dashboardSignInUrl,
          actionLabel: "Passkey で再ログイン"
        });
      }

      async function resumeDashboardSessionAfterAuthReturn(reason) {
        if (!dashboardSessionExpired) return false;
        if (authReturnResumePromise) {
          await authReturnResumePromise;
          return true;
        }
        authReturnResumePromise = (async () => {
          dashboardSessionExpired = false;
          setConnectionRecoveryStatus(reason || "再ログイン後の接続を復帰しています。入力は保持しています。", { temporary: false });
          dropStaleSocketIfNeeded();
          const refreshResult = await refreshThread();
          if (refreshResult && refreshResult.authExpired) {
            return true;
          }
          if (!dashboardSessionExpired) {
            connectThreadSocket();
            scheduleReconnect();
          }
        })();
        try {
          await authReturnResumePromise;
        } finally {
          authReturnResumePromise = null;
        }
        return true;
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
          clearDashboardDraft();
        } else {
          retryClientMessageId = pending.clientMessageId;
          persistDashboardDraft();
        }
        updateComposerReserve();
        return true;
      }

      function releasePendingOwnerSendFromThread(messages) {
        if (!pendingOwnerSend || !Array.isArray(messages)) return false;
        const pendingClientMessageId = pendingOwnerSend.clientMessageId;
        const acceptedMessage = messages.find((message) =>
          message &&
          message.role === "owner" &&
          (message.messageId === pendingClientMessageId || message.message_id === pendingClientMessageId)
        );
        if (!acceptedMessage) return false;
        pendingSendRollbacks.delete(pendingClientMessageId);
        return releasePendingOwnerSend(pendingClientMessageId, { clearComposer: true });
      }

      function appendMessage(message) {
        const article = document.createElement("article");
        article.className = message.role === "owner" ? "bubble owner" : "bubble";
        if (message.role === "owner") {
          attachMessageActionReveal(article);
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
          attachMessageActionReveal(article);
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
        const timestamp = formatMessageTimestamp(message.createdAt || message.created_at);
        if (timestamp) {
          const meta = document.createElement("time");
          meta.className = "message-meta";
          meta.dateTime = normalizeDateTimeAttribute(message.createdAt || message.created_at);
          meta.textContent = timestamp;
          article.appendChild(meta);
        }
        log.appendChild(article);
        scrollToLatest();
      }

      function attachMessageActionReveal(article) {
        article.classList.add("has-copy-action");
        article.addEventListener("click", (event) => {
          if (event.target.closest("a, button, input, textarea, select, summary")) return;
          article.classList.toggle("actions-visible");
        });
      }

      function formatMessageTimestamp(value) {
        const date = new Date(value || "");
        if (Number.isNaN(date.getTime())) return "";
        const now = new Date();
        const sameDay =
          date.getFullYear() === now.getFullYear() &&
          date.getMonth() === now.getMonth() &&
          date.getDate() === now.getDate();
        const locale = navigator.language || "ja-JP";
        const time = new Intl.DateTimeFormat(locale, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        }).format(date);
        if (sameDay) return time;
        const day = new Intl.DateTimeFormat(locale, {
          month: "numeric",
          day: "numeric"
        }).format(date);
        return day + " " + time;
      }

      function normalizeDateTimeAttribute(value) {
        const date = new Date(value || "");
        return Number.isNaN(date.getTime()) ? "" : date.toISOString();
      }

      function getMediaContentKind(item) {
        const contentType = String(item && item.contentType || item && item.type || "");
        const filename = String(item && item.filename || item && item.name || "").toLowerCase();
        if (contentType.startsWith("video/") || /\\.(mp4|mov|m4v|webm)$/.test(filename)) return "video";
        if (contentType.startsWith("image/") || /\\.(png|jpe?g|gif|webp|heic|heif)$/.test(filename)) return "image";
        return "";
      }

      function renderMediaReferences(references) {
        const list = Array.isArray(references) ? references : [];
        if (list.length === 0) return null;
        const wrapper = document.createElement("div");
        wrapper.className = "message-media";
        for (const reference of list) {
          const mediaRouteHref = reference.mediaId ? "/v2/media/" + reference.mediaId + "/download" : "";
          const referenceDownloadUrl = typeof reference.downloadUrl === "string" ? reference.downloadUrl : "";
          const safeDownloadHref = referenceDownloadUrl.startsWith("/v2/media/") ? referenceDownloadUrl : "";
          const downloadHref = mediaRouteHref || safeDownloadHref || "#";
          const mediaKind = getMediaContentKind(reference);
          const isImage = mediaKind === "image";
          const isVideo = mediaKind === "video";
          const chip = document.createElement(isVideo && downloadHref !== "#" ? "span" : "a");
          chip.className = "media-chip";
          if (chip.tagName === "A") {
            chip.href = downloadHref;
            chip.target = "_blank";
            chip.rel = "noreferrer";
          }
          chip.textContent = "";
          if (isImage && downloadHref !== "#") {
            const image = document.createElement("img");
            image.className = "media-thumb";
            image.src = downloadHref;
            image.alt = reference.filename || "添付画像";
            image.loading = "lazy";
            chip.appendChild(image);
          } else if (isVideo && downloadHref !== "#") {
            const video = document.createElement("video");
            video.className = "media-thumb";
            video.src = downloadHref;
            video.muted = true;
            video.controls = true;
            video.playsInline = true;
            video.preload = "metadata";
            video.setAttribute("aria-label", reference.filename || "添付動画");
            chip.appendChild(video);
            const icon = document.createElement("span");
            icon.textContent = "動画";
            chip.appendChild(icon);
          } else {
            const icon = document.createElement("span");
            icon.textContent = "添付";
            chip.appendChild(icon);
          }
          const label = document.createElement(isVideo && downloadHref !== "#" ? "a" : "span");
          label.textContent = reference.filename || reference.mediaId || "media";
          if (label.tagName === "A") {
            label.href = downloadHref;
            label.target = "_blank";
            label.rel = "noreferrer";
          }
          chip.appendChild(label);
          wrapper.appendChild(chip);
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

      function isPreviewableMediaFile(file) {
        return getMediaContentKind({
          contentType: file && file.type,
          filename: file && file.name
        }) !== "";
      }

      function renderPendingMedia() {
        if (!pendingMedia) return;
        pendingMedia.replaceChildren();
        for (const item of pendingMediaItems) {
          const chip = document.createElement("span");
          chip.className = "media-chip";
          if (item.previewUrl) {
            chip.classList.add("pending-preview");
            const isVideo = getMediaContentKind(item) === "video";
            if (isVideo) {
              const video = document.createElement("video");
              video.className = "media-thumb";
              video.src = item.previewUrl;
              video.muted = true;
              video.controls = true;
              video.playsInline = true;
              video.preload = "metadata";
              video.setAttribute("aria-label", item.filename || "送信待ち動画");
              chip.appendChild(video);
            } else {
              const image = document.createElement("img");
              image.className = "media-thumb";
              image.src = item.previewUrl;
              image.alt = item.filename || "送信待ち画像";
              chip.appendChild(image);
            }
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
            if (!/^go:%[0-9a-f]{2}/i.test(line)) {
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
        if (/^go:%[0-9a-f]{2}/i.test(source)) return true;
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
          while (
            index < lines.length &&
            lines[index].trim() &&
            !lines[index].trim().startsWith(fence) &&
            !/^\\s*-\\s+/.test(lines[index])
          ) {
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
          "\\\\[([^\\\\]\\\\n]+)\\\\]\\\\((https?:\\\\/\\\\/[^\\\\s<>\\\"']+)\\\\)|(https?:\\\\/\\\\/[^\\\\s<>\\\"'\\\\)\\\\]）】』」〉》、。，．,！？]+)|\\\\*\\\\*([\\\\s\\\\S]+?)\\\\*\\\\*|" + backtick + "([^" + backtick + "]+)" + backtick,
          "g"
        );
        let cursor = 0;
        for (const match of source.matchAll(tokenPattern)) {
          if (match.index > cursor) {
            container.appendChild(document.createTextNode(source.slice(cursor, match.index)));
          }
          if (match[1] && match[2]) {
            const linkToken = splitTrailingLinkPunctuation(match[2]);
            const href = linkToken.href;
            const link = document.createElement("a");
            link.className = "chat-link";
            link.href = href;
            link.textContent = match[1];
            link.target = "_blank";
            link.rel = "noreferrer";
            container.appendChild(link);
            if (linkToken.trailing) {
              container.appendChild(document.createTextNode(linkToken.trailing));
            }
          } else if (match[3]) {
            const linkToken = splitTrailingLinkPunctuation(match[3]);
            const href = linkToken.href;
            const link = document.createElement("a");
            link.className = "chat-link";
            link.href = href;
            link.textContent = href;
            link.target = "_blank";
            link.rel = "noreferrer";
            container.appendChild(link);
            if (linkToken.trailing) {
              container.appendChild(document.createTextNode(linkToken.trailing));
            }
          } else if (match[4]) {
            const strong = document.createElement("strong");
            renderInlineMarkdown(strong, match[4]);
            container.appendChild(strong);
          } else if (match[5]) {
            const code = document.createElement("code");
            code.textContent = match[5];
            container.appendChild(code);
          }
          cursor = match.index + match[0].length;
        }
        if (cursor < source.length) {
          container.appendChild(document.createTextNode(source.slice(cursor)));
        }
      }

      function splitTrailingLinkPunctuation(value) {
        const source = String(value || "");
        const trailingPunctuation = ")]）】』」〉》、。，．,.;:!?！？";
        const rawSplit = splitRawTrailingLinkPunctuation(source, trailingPunctuation);
        const encodedSplit = splitEncodedTrailingLinkPunctuation(rawSplit.href, trailingPunctuation);
        if (!rawSplit.trailing && !encodedSplit.trailing) {
          return { href: source, trailing: "" };
        }
        return {
          href: encodedSplit.href,
          trailing: encodedSplit.trailing + rawSplit.trailing
        };
      }

      function splitRawTrailingLinkPunctuation(source, trailingPunctuation) {
        let hrefEnd = source.length;
        while (hrefEnd > 0 && trailingPunctuation.includes(source[hrefEnd - 1])) {
          hrefEnd -= 1;
        }
        if (hrefEnd === source.length || hrefEnd === 0) {
          return { href: source, trailing: "" };
        }
        return {
          href: source.slice(0, hrefEnd),
          trailing: source.slice(hrefEnd)
        };
      }

      function splitEncodedTrailingLinkPunctuation(source, trailingPunctuation) {
        let hrefEnd = source.length;
        let trailing = "";
        while (hrefEnd >= 3) {
          let encodedStart = hrefEnd;
          while (encodedStart >= 3 && source[encodedStart - 3] === "%" && isHexPair(source[encodedStart - 2], source[encodedStart - 1])) {
            encodedStart -= 3;
          }
          if (encodedStart === hrefEnd) {
            break;
          }
          const encodedTrailing = source.slice(encodedStart, hrefEnd);
          let decodedTrailing = "";
          try {
            decodedTrailing = decodeURIComponent(encodedTrailing);
          } catch {
            break;
          }
          if (!decodedTrailing || !Array.from(decodedTrailing).every((char) => trailingPunctuation.includes(char))) {
            break;
          }
          trailing = decodedTrailing + trailing;
          hrefEnd = encodedStart;
        }
        if (!trailing) {
          return { href: source, trailing: "" };
        }
        return {
          href: source.slice(0, hrefEnd),
          trailing
        };
      }

      function isHexPair(first, second) {
        return isHexDigit(first) && isHexDigit(second);
      }

      function isHexDigit(value) {
        return "0123456789abcdefABCDEF".includes(String(value || ""));
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
        if (!threadEndpoint || refreshingThread || dashboardSessionExpired) return { ok: false, skipped: true };
        refreshingThread = true;
        try {
          const response = await fetch(threadEndpoint, {
            headers: { "accept": "application/json" },
            credentials: "same-origin"
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            if (isAuthExpiredResponse(response, body)) {
              lastRefreshFailure = "再ログインが必要";
              setDashboardSessionExpiredStatus();
              return { ok: false, authExpired: true };
            }
            lastRefreshFailure = "HTTP " + response.status;
            setConnectionRecoveryStatus("履歴の再取得に失敗しました。入力は保持しています。");
            return { ok: false, status: response.status };
          }
          if (body && body.ok) {
            dashboardSessionExpired = false;
            lastRefreshFailure = "";
            renderThread(body.messages || [], { replace: true });
            releasePendingOwnerSendFromThread(body.messages || []);
            return { ok: true };
          }
        } catch {
          lastRefreshFailure = "ネットワーク";
          setConnectionRecoveryStatus("履歴の再取得に失敗しました。入力は保持しています。");
          return { ok: false, network: true };
        } finally {
          refreshingThread = false;
        }
        return { ok: false };
      }

      function scheduleReconnect() {
        if (dashboardSessionExpired || reconnectTimer || !socketEndpoint || typeof WebSocket !== "function") return;
        const delay = Math.min(10000, 1000 * Math.pow(2, reconnectAttempt));
        setConnectionRecoveryStatus("接続を復帰しています。入力は保持しています。");
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connectThreadSocket();
        }, delay);
      }

      function connectThreadSocket() {
        if (dashboardSessionExpired) return;
        if (!socketEndpoint || typeof WebSocket !== "function") {
          setStatus("接続を開始できません。dashboard Butler は送信できません。");
          return;
        }
        dropStaleSocketIfNeeded();
        if (chatSocket && (chatSocket.readyState === WebSocket.OPEN || chatSocket.readyState === WebSocket.CONNECTING)) {
          return;
        }
        chatSocket = new WebSocket(socketEndpoint);
        chatSocket.addEventListener("open", () => {
          dashboardSessionExpired = false;
          reconnectAttempt = 0;
          lastRefreshFailure = "";
          if (reconnectTimer) {
            window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          setStatus("Dashboard thread 接続済み。", { temporary: true });
          refreshThread();
        });
        chatSocket.addEventListener("message", (event) => {
          try {
            const body = JSON.parse(event.data || "{}");
            if (body.type === "thread" && body.ok) {
              renderThread(body.messages || [], { replace: false });
              const releasedFromThread = releasePendingOwnerSendFromThread(body.messages || []);
              const lastMessage = Array.isArray(body.messages) ? body.messages[body.messages.length - 1] : null;
              if (lastMessage?.role === "butler" && lastMessage?.status === "replied") {
                setStatus("返信を受信しました。", { temporary: true });
              } else if (lastMessage?.status === "failed") {
                setStatus(lastMessage.text || "応答生成が時間切れになりました。同じ thread で続けられます。");
              } else if (releasedFromThread) {
                setStatus("送信を保存しました。app-server bridge の返信を待っています", { thinking: true });
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
          } else if (!dashboardSessionExpired) {
            setConnectionRecoveryStatus("接続が切れました。履歴を確認しながら復帰しています。");
          }
          dropStaleSocketIfNeeded();
          if (!dashboardSessionExpired) {
            refreshThread();
            scheduleReconnect();
          }
        });
        chatSocket.addEventListener("error", () => {
          if (pendingOwnerSend) {
            releasePendingOwnerSend(pendingOwnerSend.clientMessageId, { clearComposer: false, keepRollbackTimer: true });
            setStatus("送信確認前に WebSocket 接続が失敗しました。入力は残しています。再接続後にもう一度送信できます。");
          } else if (!dashboardSessionExpired) {
            setConnectionRecoveryStatus("接続できませんでした。履歴を確認しながら復帰しています。");
          }
          dropStaleSocketIfNeeded();
          if (!dashboardSessionExpired) {
            refreshThread();
            scheduleReconnect();
          }
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
        lastRefreshFailure = "";
        setStatus("接続が不安定なため保存しました。再接続を続けています。", { temporary: true });
        scheduleReconnect();
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const text = textarea.value.trim() || (pendingMediaItems.length > 0 ? "添付を追加しました。" : "");
        if (!text) {
          textarea.focus();
          return;
        }
        if (dashboardSessionExpired) {
          persistDashboardDraft();
          setDashboardSessionExpiredStatus();
          textarea.focus({ preventScroll: true });
          return;
        }
        const submitButton = form.querySelector("button[type='submit']");
        persistDashboardDraft();
        if (submitButton) submitButton.disabled = true;
        setComposerLocked(true);
        const willUseHttpFallback = !isChatSocketOpen();
        if (willUseHttpFallback) {
          setStatus("接続が不安定です。入力は保持したまま保存します。", { thinking: true });
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
          const files = Array.from(mediaInput.files || []);
          mediaInput.value = "";
          if (files.length === 0) return;
          const selectedItems = [];
          try {
            mediaButton.disabled = true;
            for (const file of files) {
              const preparedFile = await prepareUploadFile(file);
              const previewUrl =
                preparedFile && isPreviewableMediaFile(preparedFile) && typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
                  ? URL.createObjectURL(preparedFile)
                  : "";
              selectedItems.push({
                clientId: Date.now() + "_" + Math.random().toString(36).slice(2),
                filename: preparedFile.name || file.name || "attachment",
                contentType: preparedFile.type || file.type || "",
                previewUrl,
                file: preparedFile
              });
            }
            const nextPendingMediaItems = [...pendingMediaItems, ...selectedItems];
            const retainedPendingMediaItems = nextPendingMediaItems.slice(-12);
            for (const dropped of nextPendingMediaItems.slice(0, Math.max(0, nextPendingMediaItems.length - 12))) {
              revokePendingMediaPreview(dropped);
            }
            pendingMediaItems = retainedPendingMediaItems;
            renderPendingMedia();
            const addedCount = Math.min(selectedItems.length, 12);
            persistDashboardDraft();
            setStatus(String(addedCount) + "件の添付を送信待ちに追加しました。repo 未指定の通常会話では private media として保存します。", { temporary: true });
            textarea.focus({ preventScroll: true });
          } catch (error) {
            revokePendingMediaPreviews(selectedItems);
            setStatus((error && error.message) || "添付の保存に失敗しました。");
          } finally {
            mediaButton.disabled = false;
            updateComposerReserve();
          }
        });
      }

      resizeComposerInput();
      restoreDashboardDraft();
      textarea.addEventListener("input", () => {
        normalizeComposerInput();
        persistDashboardDraft();
      });
      textarea.addEventListener("paste", () => {
        window.setTimeout(() => {
          normalizeComposerInput();
          persistDashboardDraft();
        }, 0);
      });
      ${shouldSubmitDashboardComposerShortcut.toString()}
      textarea.addEventListener("keydown", (event) => {
        if (!shouldSubmitDashboardComposerShortcut(event)) return;
        event.preventDefault();
        if (typeof form.requestSubmit === "function") {
          form.requestSubmit();
          return;
        }
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      window.addEventListener("resize", resizeComposerInput);
      window.addEventListener("online", async () => {
        if (await resumeDashboardSessionAfterAuthReturn("ネットワーク復帰後、再ログイン状態を確認しています。入力は保持しています。")) return;
        setConnectionRecoveryStatus("ネットワーク復帰を検知しました。接続を復帰しています。");
        dropStaleSocketIfNeeded();
        refreshThread();
        scheduleReconnect();
      });
      window.addEventListener("offline", () => {
        persistDashboardDraft();
        setComposerLocked(false);
        const submitButton = form.querySelector("button[type='submit']");
        if (submitButton) submitButton.disabled = false;
        setStatus("オフラインです。入力は保持しています。");
      });
      window.addEventListener("pagehide", persistDashboardDraft);
      window.addEventListener("pageshow", async () => {
        if (await resumeDashboardSessionAfterAuthReturn("画面復帰後、再ログイン状態を確認しています。入力は保持しています。")) return;
        dropStaleSocketIfNeeded();
        refreshThread();
        scheduleReconnect();
      });
      document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState !== "visible") {
          persistDashboardDraft();
          return;
        }
        if (await resumeDashboardSessionAfterAuthReturn("画面復帰後、再ログイン状態を確認しています。入力は保持しています。")) return;
        if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
          setConnectionRecoveryStatus("画面復帰を検知しました。接続を復帰しています。");
          dropStaleSocketIfNeeded();
          refreshThread();
          scheduleReconnect();
        }
      });
      connectThreadSocket();
    })();
  </script>
  ${renderDashboardDrawerResizeScript({
    drawerSelector: ".mobile-drawer",
    handleSelector: '[data-drawer-resize-handle="dashboard-main"]',
    storageKey: "vtdd.dashboard.drawer.width",
    cssVariable: "--dashboard-drawer-width"
  })}
</body>
</html>`;
}

function renderDashboardAuthRequiredPage({ runtimeOrigin, returnPath = "/dashboard", reason, passkeyFallbackReason } = {}) {
  const origin = normalizeText(runtimeOrigin);
  const dashboardAccessReturnPath = sanitizeDashboardPreAuthReturnPath(returnPath);
  const dashboardAccessHref = buildCloudflareAccessLoginHref({ origin, returnPath: dashboardAccessReturnPath });
  const dashboardSignInUrl = `${origin || ""}/v2/approval/passkey/operator?mode=dashboard&phase=execution&actionType=read&highRiskKind=dashboard_access&dashboardReturnPath=${encodeURIComponent(dashboardAccessReturnPath)}`;
  const passkeyButtonLabel = "Passkey で開く";
  const passkeyReturnNote =
    dashboardAccessReturnPath === "/dashboard/notifications" ? "認証後は通知センターへ戻ります。" : "";
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${DASHBOARD_ICON_LINKS}
  <title>Dashboard auth required</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17211d; background: #f8faf8; }
    body { margin: 0; }
    main { width: min(720px, calc(100% - 32px)); margin: 0 auto; padding: 56px 0; }
    .panel { background: #fff; border: 1px solid #d8e2dc; border-radius: 8px; padding: 24px; box-shadow: 0 12px 32px rgba(24, 37, 31, .08); }
    h1 { margin: 0 0 12px; font-size: 30px; }
    p { line-height: 1.7; color: #4d5c56; }
    a { color: #176b4d; font-weight: 750; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 10px; }
    .button { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; border: 1px solid #b9cabe; border-radius: 7px; padding: 9px 12px; color: #0f513b; text-decoration: none; background: #f8fbf8; }
    .primary { background: #247a5b; color: #fff; border-color: #247a5b; }
    .entry-note { margin: 0 0 14px; font-size: 15px; color: #5f6c66; }
    details { margin-top: 16px; border-top: 1px solid #e2e9e4; padding-top: 14px; }
    summary { cursor: pointer; font-weight: 800; color: #24342e; }
    code { color: #5f6c66; }
  </style>
</head>
<body>
  <main>
    <section class="panel">
      <h1>Dashboard auth required</h1>
      <p>この dashboard は owner-facing surface です。通常閲覧、通知確認、通常チャットは owner identity で開きます。通知をタップしただけでは、未認証の相手に通知詳細や Dashboard 内容は返しません。</p>
      <p><code>${escapeDashboardHtml(reason || "dashboard authentication required")}</code></p>
      <div class="actions">
        <a class="button primary" href="${escapeDashboardHtml(dashboardSignInUrl)}">${escapeDashboardHtml(passkeyButtonLabel)}</a>
        <a class="button" href="${escapeDashboardHtml(`${origin || ""}/status`)}">Status</a>
      </div>
      <p class="entry-note">iPhone / PWA では Passkey が安定した dashboard 入口です。Cloudflare Access は通常ブラウザ向けの補助導線です。</p>
      <details>
        <summary>Cloudflare Access / fallback</summary>
        <p>Cloudflare Access は owner identity の通常認証です。ただし iPhone / PWA / in-app browser では白画面や認証ループになることがあります。${escapeDashboardHtml(passkeyReturnNote)} deploy、merge、secret sync などの高リスク操作は引き続き scope 明示済み real passkey approval が必要です。</p>
        ${passkeyFallbackReason ? `<p><code>${escapeDashboardHtml(passkeyFallbackReason)}</code></p>` : ""}
        <p><a class="button" href="${escapeDashboardHtml(dashboardAccessHref)}">Cloudflare Access で開く</a></p>
      </details>
    </section>
  </main>
</body>
</html>`;
}

function buildCloudflareAccessLoginHref({ origin, returnPath = "/dashboard" } = {}) {
  const normalizedOrigin = normalizeText(origin);
  const sanitizedReturnPath = sanitizeDashboardPreAuthReturnPath(returnPath);
  const redirectUrl = normalizedOrigin ? `${normalizedOrigin}${sanitizedReturnPath}` : sanitizedReturnPath;
  return `${normalizedOrigin || ""}/cdn-cgi/access/login?redirect_url=${encodeURIComponent(redirectUrl)}`;
}

function sanitizeDashboardPreAuthReturnPath(value) {
  const normalized = String(value ?? "").trim() || "/dashboard";
  let parsed;
  try {
    parsed = new URL(normalized, "https://dashboard.local");
  } catch {
    return "/dashboard";
  }
  if (parsed.origin !== "https://dashboard.local") {
    return "/dashboard";
  }
  if (parsed.pathname !== "/dashboard" && !parsed.pathname.startsWith("/dashboard/")) {
    return "/dashboard";
  }
  const allowedSearchParams = new URLSearchParams();
  for (const key of ["repository", "repositoryInput", "issueNumber", "threadId"]) {
    const rawValue = key === "threadId"
      ? normalizeDashboardThreadId(parsed.searchParams.get(key))
      : normalizeDashboardReturnQueryValue(parsed.searchParams.get(key));
    if (rawValue) {
      allowedSearchParams.set(key, rawValue);
    }
  }
  const query = allowedSearchParams.toString();
  return query ? `${parsed.pathname}?${query}` : parsed.pathname;
}

function withDashboardReturnThreadId(returnPath, threadId) {
  const sanitizedReturnPath = sanitizeDashboardPreAuthReturnPath(returnPath);
  const normalizedThreadId = normalizeDashboardThreadId(threadId);
  if (!normalizedThreadId) {
    return sanitizedReturnPath;
  }
  let parsed;
  try {
    parsed = new URL(sanitizedReturnPath, "https://dashboard.local");
  } catch {
    return sanitizedReturnPath;
  }
  if (!parsed.searchParams.get("threadId")) {
    parsed.searchParams.set("threadId", normalizedThreadId);
  }
  return `${parsed.pathname}${parsed.search}`;
}

function normalizeDashboardReturnQueryValue(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > 256) {
    return "";
  }
  return normalized;
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
        <a href="${escapeDashboardHtml(origin)}/v2/approval/passkey/operator">Passkey operator</a>
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

function png(status, dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  const body = match ? Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0)) : new Uint8Array();
  return new Response(body, {
    status: match ? status : 500,
    headers: {
      "content-type": "image/png",
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

function normalizeNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
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
