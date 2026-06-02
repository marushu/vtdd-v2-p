import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { DashboardChatRoom } from "../src/worker.js";
import {
  buildDashboardWebPushPayload,
  normalizeDashboardChatMessageText,
  shouldSubmitDashboardComposerShortcut,
  shouldWrapDashboardChatCodeBlock
} from "../src/worker/runtime.js";
import {
  ActionType,
  ActorRole,
  AutonomyMode,
  ConsentCategory,
  CredentialTier,
  JudgmentStep,
  MemoryRecordType,
  TaskMode,
  createInMemoryMemoryProvider
} from "../src/core/index.js";

const aliasRegistry = [
  {
    canonicalRepo: "sample-org/vtdd-v2",
    aliases: ["vtdd"]
  }
];

const validButlerJudgmentTrace = [
  JudgmentStep.CONSTITUTION,
  JudgmentStep.RUNTIME_TRUTH,
  JudgmentStep.ISSUE_CONTEXT,
  JudgmentStep.CURRENT_QUERY
];

const gatewayAuthHeaders = {
  "content-type": "application/json",
  authorization: "Bearer test-token"
};

const gatewayAuthEnv = {
  VTDD_GATEWAY_BEARER_TOKEN: "test-token"
};

const dashboardAccessHeaders = {
  "cf-access-authenticated-user-email": "owner@example.com",
  "cf-access-jwt-assertion": "test-access-jwt"
};

const dashboardAccessEnv = {
  VTDD_DASHBOARD_ALLOWED_EMAILS: "owner@example.com",
  CF_ACCESS_JWT_VERIFIER: async (token) => ({
    ok: token === "test-access-jwt",
    status: token === "test-access-jwt" ? 200 : 403,
    reason: token === "test-access-jwt" ? undefined : "test access jwt invalid",
    payload: token === "test-access-jwt" ? { email: "owner@example.com", exp: 4102444800 } : null
  })
};

function extractDashboardInlineFunction(html, name) {
  const script = String(html || "").match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
  const asyncStart = script.indexOf(`async function ${name}(`);
  const start = asyncStart === -1 ? script.indexOf(`function ${name}(`) : asyncStart;
  assert.notEqual(start, -1, `dashboard inline function ${name} is missing`);
  const braceStart = script.indexOf("{", start);
  assert.notEqual(braceStart, -1, `dashboard inline function ${name} has no body`);
  let depth = 0;
  for (let index = braceStart; index < script.length; index += 1) {
    const char = script[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      return script.slice(start, index + 1);
    }
  }
  assert.fail(`dashboard inline function ${name} body is incomplete`);
}

function createMinimalDashboardDocument() {
  class TextNode {
    constructor(text) {
      this.nodeType = 3;
      this.textContent = String(text || "");
      this.parentNode = null;
    }
  }

  class ElementNode {
    constructor(tagName) {
      this.nodeType = 1;
      this.tagName = String(tagName || "").toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.attributes = new Map();
      this.dataset = {};
      this.style = {};
      this._textContent = "";
      this.className = "";
      this.type = "";
      this.href = "";
      this.target = "";
      this.rel = "";
      this.title = "";
      this.value = "";
      this.listeners = new Map();
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    replaceChildren(...children) {
      this.children = [];
      for (const child of children) {
        this.appendChild(child);
      }
    }

    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    }

    select() {
      this.selected = true;
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }

    getAttribute(name) {
      return this.attributes.get(name) || null;
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    async click() {
      const listener = this.listeners.get("click");
      if (listener) {
        await listener({ target: this });
      }
    }

    get textContent() {
      if (this.children.length === 0) return this._textContent;
      return this.children.map((child) => child.textContent).join("");
    }

    set textContent(value) {
      this.children = [];
      this._textContent = String(value || "");
    }

    querySelectorAll(tagName) {
      const matches = [];
      const expected = String(tagName || "").toUpperCase();
      const visit = (node) => {
        if (node.nodeType === 1 && node.tagName === expected) {
          matches.push(node);
        }
        for (const child of node.children || []) {
          visit(child);
        }
      };
      visit(this);
      return matches;
    }
  }

  const document = {
    body: new ElementNode("body"),
    createElement: (tagName) => new ElementNode(tagName),
    createTextNode: (text) => new TextNode(text),
    execCommand(command) {
      document.lastExecCommand = command;
      return true;
    }
  };
  return document;
}

function loadDashboardInlineChatHelpers(html) {
  const names = [
    "normalizeMessageDisplayText",
    "normalizeMessageCopyText",
    "normalizeComposerInputText",
    "decodeSafeChatCommandText",
    "shouldWrapCodeBlock",
    "renderMessageText",
    "renderInlineMarkdown",
    "splitTrailingLinkPunctuation",
    "splitRawTrailingLinkPunctuation",
    "splitEncodedTrailingLinkPunctuation",
    "isHexPair",
    "isHexDigit",
    "copyMessageText"
  ];
  const sources = names.map((name) => extractDashboardInlineFunction(html, name)).join("\n");
  return Function(
    "document",
    "navigator",
    "window",
    "setStatus",
    `${sources}\nreturn { ${names.join(", ")} };`
  );
}

function loadDashboardComposerRecoveryHelpers(html) {
  const names = [
    "setComposerLocked",
    "withFollowUpInstruction",
    "withPendingSendRecoveryInstruction",
    "releaseComposerForFollowUp"
  ];
  const sources = names.map((name) => extractDashboardInlineFunction(html, name)).join("\n");
  return Function(
    `${sources}
    const statusLog = [];
    const textarea = { readOnly: true };
    const mediaButton = { disabled: true };
    const submitButton = { disabled: true };
    const form = { querySelector(selector) { return selector === "button[type='submit']" ? submitButton : null; } };
    let pendingOwnerSend = null;
    function setStatus(text, options = {}) { statusLog.push({ text, options }); }
    function updateComposerReserve() { statusLog.push({ reserveUpdated: true }); }
    return {
      releaseComposerForFollowUp,
      setPendingOwnerSend(value) { pendingOwnerSend = value; },
      getState() { return { textarea, mediaButton, submitButton, statusLog }; }
    };`
  )();
}

test("dashboard chat message text safely decodes command-like percent encoded lines", () => {
  assert.equal(
    normalizeDashboardChatMessageText("go:%0Adeploy%20production%0Aissue%20%23524"),
    "go:\ndeploy production\nissue #524"
  );
  assert.equal(
    normalizeDashboardChatMessageText("https://example.com/path%20with%20encoded?x=1"),
    "https://example.com/path%20with%20encoded?x=1"
  );
  assert.equal(normalizeDashboardChatMessageText("go:%E0%A4%A"), "go:%E0%A4%A");
  assert.equal(normalizeDashboardChatMessageText("slack:%20do-not-decode"), "slack:%20do-not-decode");
  assert.equal(
    normalizeDashboardChatMessageText("before\ngo:%0Aone%20two\nafter"),
    "before\ngo:\none two\nafter"
  );
});

test("dashboard chat code block wrap policy keeps URL and command text readable", () => {
  assert.equal(shouldWrapDashboardChatCodeBlock("https://example.com/" + "a".repeat(96)), true);
  assert.equal(shouldWrapDashboardChatCodeBlock("go:%0A" + "deploy%20".repeat(20)), true);
  assert.equal(shouldWrapDashboardChatCodeBlock("slack:%20" + "x".repeat(96)), true);
  assert.equal(shouldWrapDashboardChatCodeBlock("x".repeat(96)), true);
  assert.equal(shouldWrapDashboardChatCodeBlock("const value = 1;\nconsole.log(value);"), false);
});

test("dashboard composer shortcut submits only modified Enter", () => {
  assert.equal(shouldSubmitDashboardComposerShortcut({ key: "Enter", metaKey: true, ctrlKey: false }), true);
  assert.equal(shouldSubmitDashboardComposerShortcut({ key: "Enter", metaKey: false, ctrlKey: true }), true);
  assert.equal(shouldSubmitDashboardComposerShortcut({ key: "Enter", metaKey: false, ctrlKey: false, shiftKey: true }), false);
  assert.equal(shouldSubmitDashboardComposerShortcut({ key: "Enter", metaKey: true, ctrlKey: false, shiftKey: true }), false);
  assert.equal(shouldSubmitDashboardComposerShortcut({ key: "Enter", metaKey: true, ctrlKey: false, isComposing: true }), false);
  assert.equal(shouldSubmitDashboardComposerShortcut({ key: "Enter", metaKey: false, ctrlKey: false }), false);
  assert.equal(shouldSubmitDashboardComposerShortcut({ key: "a", metaKey: true, ctrlKey: false }), false);
  assert.equal(
    shouldSubmitDashboardComposerShortcut({ key: "Enter", metaKey: true, ctrlKey: false, isComposing: false }),
    true
  );
});

function createInMemoryDashboardEventStore() {
  const events = new Map();
  return {
    async put(event) {
      events.set(event.id, event);
      return event;
    },
    async delete(eventId) {
      return events.delete(eventId);
    },
    async latest(filter = {}) {
      const matches = [...events.values()].filter((event) => {
        if (filter.kind && event.kind !== filter.kind) {
          return false;
        }
        if (filter.repository && event.repository !== filter.repository) {
          return false;
        }
        if (filter.workflowName && event.workflowName !== filter.workflowName) {
          return false;
        }
        return true;
      });
      matches.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
      return matches[0] ?? null;
    },
    async listRecent(filter = {}) {
      const sinceTime = filter.since ? new Date(filter.since).getTime() : null;
      const matches = [...events.values()].filter((event) => {
        if (filter.kind && event.kind !== filter.kind) {
          return false;
        }
        if (filter.repository && event.repository !== filter.repository) {
          return false;
        }
        if (filter.workflowName && event.workflowName !== filter.workflowName) {
          return false;
        }
        if (sinceTime && new Date(event.updatedAt).getTime() < sinceTime) {
          return false;
        }
        return true;
      });
      matches.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
      return matches.slice(0, Number(filter.limit) || 20);
    }
  };
}

function createInMemoryDashboardChatStore() {
  const messagesByThread = new Map();
  const summariesByThread = new Map();
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
    async putSummary(threadId, summary) {
      const record = {
        threadId,
        repository: summary.repository || null,
        relatedIssue: summary.relatedIssue || summary.issueNumber || null,
        summary: summary.summary || summary.text || "",
        decisions: Array.isArray(summary.decisions) ? summary.decisions : [],
        openItems: Array.isArray(summary.openItems) ? summary.openItems : [],
        archivedUntilMessageId: summary.archivedUntilMessageId || null,
        updatedAt: summary.updatedAt || new Date().toISOString()
      };
      summariesByThread.set(threadId, record);
      return record.summary ? record : null;
    },
    async getSummary(threadId) {
      return summariesByThread.get(threadId) || null;
    },
    async search(filter = {}) {
      const text = String(filter.text || filter.q || "");
      const repository = filter.repository || "";
      const relatedIssue = Number(filter.relatedIssue || filter.issueNumber) || null;
      const limit = Number(filter.limit) || 20;
      const results = [];
      for (const [threadId, messages] of messagesByThread.entries()) {
        for (const message of messages) {
          if (text && !String(message.text || "").includes(text)) continue;
          if (repository && message.repository !== repository) continue;
          if (relatedIssue && message.relatedIssue !== relatedIssue) continue;
          results.push({ kind: "message", threadId, message });
        }
      }
      for (const [threadId, summary] of summariesByThread.entries()) {
        const haystack = [summary.summary, ...summary.decisions, ...summary.openItems].join("\n");
        if (text && !haystack.includes(text)) continue;
        if (repository && summary.repository !== repository) continue;
        if (relatedIssue && summary.relatedIssue !== relatedIssue) continue;
        results.push({ kind: "summary", threadId, summary });
      }
      return results.slice(0, limit);
    }
  };
}

function createInMemoryMediaObjectStore() {
  const records = new Map();
  return {
    async put(record) {
      records.set(record.id, record);
      return record;
    },
    async get(id) {
      return records.get(id) ?? null;
    },
    async delete(id) {
      return records.delete(id);
    },
    async search(filter = {}) {
      const matches = [...records.values()].filter((record) => {
        if (filter.repository && record.repository !== filter.repository) {
          return false;
        }
        if (filter.relatedIssue && record.relatedIssue !== Number(filter.relatedIssue)) {
          return false;
        }
        if (filter.relatedPr && record.relatedPr !== Number(filter.relatedPr)) {
          return false;
        }
        return true;
      });
      return matches.slice(0, Number(filter.limit) || 20);
    }
  };
}

function createInMemoryR2Binding() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, options = {}) {
      objects.set(key, { value, options, body: value });
      return null;
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
    async delete(key) {
      objects.delete(key);
    }
  };
}

function createStrictMediaD1Binding() {
  const execStatements = [];
  const rows = new Map();
  return {
    execStatements,
    rows,
    async exec(statement) {
      execStatements.push(statement);
      if (/CREATE TABLE IF NOT EXISTS vtdd_media_objects \(\s*\n/.test(String(statement))) {
        throw new Error("D1_EXEC_ERROR: Error in line 1: CREATE TABLE IF NOT EXISTS vtdd_media_objects (: incomplete input: SQLITE_ERROR");
      }
      return { success: true };
    },
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async run() {
              if (String(sql).includes("INSERT OR REPLACE INTO vtdd_media_objects")) {
                const [
                  id,
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
                  summary,
                  ocrText,
                  createdBy,
                  createdAt,
                  updatedAt,
                  expiresAt
                ] = params;
                rows.set(id, {
                  id,
                  repository,
                  related_issue: relatedIssue,
                  related_pr: relatedPr,
                  source_surface: sourceSurface,
                  source_event_id: sourceEventId,
                  object_key: objectKey,
                  filename,
                  content_type: contentType,
                  byte_size: byteSize,
                  sha256,
                  visibility,
                  summary,
                  ocr_text: ocrText,
                  created_by: createdBy,
                  created_at: createdAt,
                  updated_at: updatedAt,
                  expires_at: expiresAt
                });
              }
              return { success: true };
            },
            async all() {
              return { results: [] };
            }
          };
        }
      };
    }
  };
}

function createPngBlob() {
  return new Blob([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
  ], { type: "image/png" });
}

function createMp4Blob() {
  return new Blob([
    new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])
  ], { type: "video/mp4" });
}

function createInMemoryDashboardPushSubscriptionStore() {
  const subscriptions = new Map();
  return {
    subscriptions,
    async put(subscription) {
      subscriptions.set(subscription.endpointHash, subscription);
      return subscription;
    },
    async get(endpointHash) {
      return subscriptions.get(endpointHash) || null;
    },
    async list(filter = {}) {
      const limit = Number(filter.limit) || 50;
      return [...subscriptions.values()].slice(0, limit);
    },
    async delete(endpointHash) {
      const deleted = subscriptions.delete(endpointHash);
      return { deleted };
    }
  };
}

function base64UrlEncodeTestBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToTestBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function concatTestBytes(...chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function hmacSha256Test(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}

async function createTestPushSubscription(fields = {}) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const publicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const authBytes = crypto.getRandomValues(new Uint8Array(16));
  return {
    subscription: {
      endpointHash: fields.endpointHash || "endpoint-hash",
      endpoint: fields.endpoint || "https://push.example/send/endpoint-hash",
      p256dh: base64UrlEncodeTestBytes(publicBytes),
      auth: base64UrlEncodeTestBytes(authBytes),
      ownerIdentity: "owner@example.com",
      updatedAt: new Date().toISOString()
    },
    privateKey: keyPair.privateKey,
    publicBytes,
    authBytes
  };
}

async function decryptTestWebPushPayload(body, pushKeys) {
  const encrypted = new Uint8Array(await new Response(body).arrayBuffer());
  const salt = encrypted.slice(0, 16);
  const recordSize = new DataView(encrypted.buffer, encrypted.byteOffset + 16, 4).getUint32(0);
  const keyIdLength = encrypted[20];
  const serverPublicBytes = encrypted.slice(21, 21 + keyIdLength);
  const ciphertext = encrypted.slice(21 + keyIdLength);

  assert.equal(recordSize, 4096);
  assert.equal(keyIdLength, 65);
  assert.equal(serverPublicBytes[0], 4);

  const serverPublicKey = await crypto.subtle.importKey(
    "raw",
    serverPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: serverPublicKey },
    pushKeys.privateKey,
    256
  ));
  const prkKey = await hmacSha256Test(pushKeys.authBytes, sharedSecret);
  const keyInfo = concatTestBytes(
    new TextEncoder().encode("WebPush: info"),
    new Uint8Array([0]),
    pushKeys.publicBytes,
    serverPublicBytes
  );
  const ikm = (await hmacSha256Test(prkKey, concatTestBytes(keyInfo, new Uint8Array([1])))).slice(0, 32);
  const prk = await hmacSha256Test(salt, ikm);
  const cek = (await hmacSha256Test(prk, concatTestBytes(new TextEncoder().encode("Content-Encoding: aes128gcm"), new Uint8Array([0, 1])))).slice(0, 16);
  const nonce = (await hmacSha256Test(prk, concatTestBytes(new TextEncoder().encode("Content-Encoding: nonce"), new Uint8Array([0, 1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    key,
    ciphertext
  ));
  assert.equal(plaintext[plaintext.length - 1], 2);
  return new TextDecoder().decode(plaintext.slice(0, -1));
}

async function sha256HexTest(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createTestVapidEnv(extra = {}) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicKey = base64UrlEncodeTestBytes(new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey)));
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  return {
    VTDD_WEB_PUSH_PUBLIC_KEY: publicKey,
    VTDD_WEB_PUSH_PRIVATE_KEY: JSON.stringify(privateJwk),
    VTDD_WEB_PUSH_SUBJECT: "mailto:owner@example.com",
    ...extra
  };
}

function createMockDashboardChatRoomNamespace() {
  const calls = [];
  return {
    calls,
    namespace: {
      getByName(name) {
        return {
          async fetch(input, init) {
            calls.push({ name, input, init });
            return new Response(JSON.stringify({ ok: true, name }), {
              status: 202,
              headers: { "content-type": "application/json" }
            });
          }
        };
      }
    }
  };
}

function createMockDurableObjectStorage() {
  const values = new Map();
  return {
    values,
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      values.set(key, value);
    }
  };
}

function createMockSocket(role, threadId) {
  const sent = [];
  return {
    readyState: 1,
    sent,
    send(message) {
      sent.push(String(message));
    },
    deserializeAttachment() {
      return { role, threadId };
    }
  };
}

const passkeyAdapter = {
  async generateRegistrationOptions(input) {
    return { challenge: input.challenge };
  },
  async verifyRegistrationResponse() {
    return {
      verified: true,
      registrationInfo: {
        credential: {
          id: new Uint8Array([1, 2, 3, 4]),
          publicKey: new Uint8Array([5, 6, 7, 8]),
          counter: 1
        },
        credentialDeviceType: "singleDevice",
        credentialBackedUp: true,
        aaguid: "test-aaguid"
      }
    };
  },
  async generateAuthenticationOptions(input) {
    return {
      challenge: input.challenge,
      allowCredentials: input.allowCredentials
    };
  },
  async verifyAuthenticationResponse() {
    return {
      verified: true,
      authenticationInfo: {
        newCounter: 2
      }
    };
  }
};

function createFakeMemoryD1Binding() {
  const rows = new Map();

  return {
    async exec() {},
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async run() {
              if (String(sql).includes("INSERT OR REPLACE INTO vtdd_memory_records")) {
                const [id, type, contentJson, contentRef, metadataJson, priority, tagsJson, createdAt] =
                  params;
                rows.set(id, {
                  id,
                  type,
                  content_json: contentJson,
                  content_ref: contentRef,
                  metadata_json: metadataJson,
                  priority,
                  tags_json: tagsJson,
                  created_at: createdAt
                });
              }
              return { success: true };
            },
            async all() {
              const text = String(sql);
              let results = [...rows.values()];
              if (text.includes("WHERE id IN")) {
                const typeParam = text.includes("AND type = ?") ? params[params.length - 1] : null;
                const idParams = typeParam ? params.slice(0, -1) : params;
                const idSet = new Set(idParams);
                results = results.filter((row) => idSet.has(row.id));
                if (typeParam) {
                  results = results.filter((row) => row.type === typeParam);
                }
              } else if (text.includes("WHERE type = ?")) {
                results = results.filter((row) => row.type === params[0]);
              }
              return { results };
            }
          };
        }
      };
    }
  };
}

test("worker returns health", async () => {
  const response = await worker.fetch(new Request("https://example.com/health"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mode, "v2");
  assert.equal(body.autonomyMode, AutonomyMode.NORMAL);
});

test("worker serves human-facing status page without raw JSON links", async () => {
  const response = await worker.fetch(new Request("https://example.com/status"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const body = await response.text();
  assert.equal(body.includes("VTDD v2 status"), true);
  assert.equal(body.includes("Runtime Status"), true);
  assert.equal(body.includes("raw /health JSON"), false);
  assert.equal(body.includes("/dashboard"), true);
  assert.equal(body.includes("/v2/approval/passkey/operator"), true);
  assert.equal(body.includes("repositoryInput=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes("approvalGrantId"), false);
  assert.equal(body.includes("CLOUDFLARE_API_TOKEN"), false);
});

test("worker rejects dashboard access without owner identity", async () => {
  const response = await worker.fetch(new Request("https://example.com/dashboard"));
  assert.equal(response.status, 401);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const body = await response.text();
  assert.equal(body.includes("Dashboard auth required"), true);
  assert.equal(body.includes("owner-facing surface"), true);
  assert.equal(body.includes("Cloudflare Access で開く"), true);
  assert.equal(
    body.includes(
      'href="https://example.com/cdn-cgi/access/login?redirect_url=https%3A%2F%2Fexample.com%2Fdashboard"'
    ),
    true
  );
  assert.equal(
    body.includes(
      'class="button primary" href="https://example.com/v2/approval/passkey/operator?mode=dashboard&amp;phase=execution&amp;actionType=read&amp;highRiskKind=dashboard_access&amp;dashboardReturnPath=%2Fdashboard"'
    ),
    true
  );
  assert.equal(body.includes("iPhone / PWA では Passkey が安定した dashboard 入口です"), true);
  assert.equal(body.includes("Cloudflare Access / fallback"), true);
  assert.equal(body.includes("Passkey で開く"), true);
  assert.equal(body.includes("Passkey で dashboard に入る"), false);
  assert.equal(
    body.includes(
      'href="https://example.com/v2/approval/passkey/operator?mode=dashboard&amp;phase=execution&amp;actionType=read&amp;highRiskKind=dashboard_access&amp;dashboardReturnPath=%2Fdashboard"'
    ),
    true
  );
  assert.equal(
    body.indexOf("Passkey で開く") < body.indexOf("Cloudflare Access で開く"),
    true
  );
  assert.equal(body.includes("repositoryInput=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes("未認証の相手に通知詳細や Dashboard 内容は返しません"), true);
});

test("worker preserves dashboard repository context across auth fallback links", async () => {
  const tooLongRepository = `${"a".repeat(257)}/repo`;
  const response = await worker.fetch(
    new Request(
      `https://example.com/dashboard?repository=marushu%2Fvtdd-v2-p&repositoryInput=${tooLongRepository}&runId=private-run&title=private`
    )
  );
  assert.equal(response.status, 401);
  const body = await response.text();
  assert.equal(
    body.includes(
      'href="https://example.com/cdn-cgi/access/login?redirect_url=https%3A%2F%2Fexample.com%2Fdashboard%3Frepository%3Dmarushu%252Fvtdd-v2-p"'
    ),
    true
  );
  assert.equal(
    body.includes(
      'href="https://example.com/v2/approval/passkey/operator?mode=dashboard&amp;phase=execution&amp;actionType=read&amp;highRiskKind=dashboard_access&amp;dashboardReturnPath=%2Fdashboard%3Frepository%3Dmarushu%252Fvtdd-v2-p"'
    ),
    true
  );
  assert.equal(
    body.includes(
      'class="button primary" href="https://example.com/v2/approval/passkey/operator?mode=dashboard&amp;phase=execution&amp;actionType=read&amp;highRiskKind=dashboard_access&amp;dashboardReturnPath=%2Fdashboard%3Frepository%3Dmarushu%252Fvtdd-v2-p"'
    ),
    true
  );
  assert.equal(body.includes("runId=private-run"), false);
  assert.equal(body.includes("title=private"), false);
  assert.equal(body.includes("repositoryInput="), false);
});

test("worker preserves dashboard thread context across auth fallback links", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/dashboard?threadId=dashboard-main-unresolved&runId=private-run")
  );
  assert.equal(response.status, 401);
  const body = await response.text();
  assert.equal(
    body.includes(
      'href="https://example.com/cdn-cgi/access/login?redirect_url=https%3A%2F%2Fexample.com%2Fdashboard%3FthreadId%3Ddashboard-main-unresolved"'
    ),
    true
  );
  assert.equal(
    body.includes(
      'class="button primary" href="https://example.com/v2/approval/passkey/operator?mode=dashboard&amp;phase=execution&amp;actionType=read&amp;highRiskKind=dashboard_access&amp;dashboardReturnPath=%2Fdashboard%3FthreadId%3Ddashboard-main-unresolved"'
    ),
    true
  );
  assert.equal(body.includes("runId=private-run"), false);
});

test("worker rejects unlisted dashboard subpaths before they can become public pages", async () => {
  const response = await worker.fetch(new Request("https://example.com/dashboard/future-page"));
  assert.equal(response.status, 401);
  const body = await response.text();
  assert.equal(body.includes("Dashboard auth required"), true);
});

test("worker rejects dashboard access when owner identity lacks a verified Access JWT", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/dashboard", {
      headers: {
        "cf-access-authenticated-user-email": "owner@example.com"
      }
    }),
    dashboardAccessEnv
  );
  assert.equal(response.status, 401);
  const body = await response.text();
  assert.equal(body.includes("Cloudflare Access JWT assertion is required"), true);
});

test("worker serves v2 dashboard for valid dashboard passkey session", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval:dashboard-session",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval:dashboard-session",
      credentialId: "AQIDBA",
      verifiedAt: "2026-05-20T00:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
      scope: {
        actionType: "read",
        highRiskKind: "dashboard_access",
        repositoryInput: "marushu/vtdd-v2-p",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 96,
    tags: ["passkey_grant", "passkey_approval", "verified"],
    createdAt: "2026-05-20T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/dashboard", {
      headers: {
        cookie: "vtdd_dashboard_session=approval%3Adashboard-session"
      }
    }),
    {
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal(body.includes("VTDD v2 Dashboard"), true);
});

test("worker serves v2 dashboard from dashboard read session after source passkey grant expires", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval:expired-dashboard-grant",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval:expired-dashboard-grant",
      credentialId: "AQIDBA",
      verifiedAt: "2026-05-20T00:00:00.000Z",
      expiresAt: "2026-05-20T00:02:00.000Z",
      scope: {
        actionType: "read",
        highRiskKind: "dashboard_access",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 96,
    tags: ["passkey_grant", "passkey_approval", "verified"],
    createdAt: "2026-05-20T00:00:00.000Z"
  });
  await provider.store({
    id: "dashboard-session:still-valid",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "dashboard_read_session",
      status: "active",
      sessionId: "dashboard-session:still-valid",
      sourceApprovalId: "approval:expired-dashboard-grant",
      credentialId: "AQIDBA",
      deviceLabel: "iPhone",
      createdAt: "2026-05-20T00:00:00.000Z",
      lastSeenAt: "2026-05-20T00:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
      scope: {
        actionType: "read",
        highRiskKind: "dashboard_access"
      }
    },
    metadata: { source: "test", sourceApprovalId: "approval:expired-dashboard-grant" },
    priority: 95,
    tags: ["dashboard_read_session", "dashboard_session"],
    createdAt: "2026-05-20T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/dashboard", {
      headers: {
        cookie: "vtdd_dashboard_session=dashboard-session%3Astill-valid"
      }
    }),
    {
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal(body.includes("VTDD v2 Dashboard"), true);
});

test("worker rejects stale dashboard passkey session cookies", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/dashboard", {
      headers: {
        cookie: "vtdd_dashboard_session=approval%3Amissing"
      }
    }),
    {
      MEMORY_PROVIDER: createInMemoryMemoryProvider()
    }
  );

  assert.equal(response.status, 401);
  const body = await response.text();
  assert.equal(body.includes("Cloudflare Access authenticated owner identity is required"), true);
  assert.equal(body.includes("Cloudflare Access で開く"), true);
  assert.equal(
    body.includes(
      'href="https://example.com/cdn-cgi/access/login?redirect_url=https%3A%2F%2Fexample.com%2Fdashboard"'
    ),
    true
  );
  assert.equal(body.includes("Cloudflare Access / fallback"), true);
  assert.equal(body.includes("dashboard session was not found"), true);
  assert.equal(body.includes("Passkey で開く"), true);
  assert.equal(body.includes("Passkey で dashboard に入る"), false);
  assert.equal(
    body.includes(
      'class="button primary" href="https://example.com/v2/approval/passkey/operator?mode=dashboard&amp;phase=execution&amp;actionType=read&amp;highRiskKind=dashboard_access&amp;dashboardReturnPath=%2Fdashboard"'
    ),
    true
  );
  assert.equal(body.includes("repositoryInput=marushu%2Fvtdd-v2-p"), false);
});

test("worker does not expose dashboard notification details before Access auth", async () => {
  const store = createInMemoryDashboardEventStore();
  await store.put({
    id: "github_actions_workflow_run:marushu/vtdd-v2-p:deploy-production:private-run",
    kind: "github_actions_workflow_run",
    repository: "marushu/vtdd-v2-p",
    workflowName: "deploy-production",
    runId: "private-run",
    runUrl: "https://github.com/marushu/vtdd-v2-p/actions/runs/private-run",
    status: "completed",
    conclusion: "success",
    headSha: "privateabcdef1234567890",
    headBranch: "main",
    title: "private deploy notification",
    updatedAt: new Date().toISOString()
  });

  const response = await worker.fetch(
    new Request(
      "https://example.com/dashboard/notifications?runId=private-run&title=private%20deploy%20notification&sha=privateabcdef1234567890"
    ),
    { DASHBOARD_EVENT_STORE: store }
  );

  assert.equal(response.status, 401);
  const body = await response.text();
  assert.equal(body.includes("Dashboard auth required"), true);
  assert.equal(body.includes("Cloudflare Access で開く"), true);
  assert.equal(body.includes("Passkey で開く"), true);
  assert.equal(body.includes("Passkey で通知を見る"), false);
  assert.equal(body.includes("認証後は通知センターへ戻ります。"), true);
  assert.equal(
    body.includes(
      'href="https://example.com/cdn-cgi/access/login?redirect_url=https%3A%2F%2Fexample.com%2Fdashboard%2Fnotifications"'
    ),
    true
  );
  assert.equal(
    body.includes(
      'href="https://example.com/v2/approval/passkey/operator?mode=dashboard&amp;phase=execution&amp;actionType=read&amp;highRiskKind=dashboard_access&amp;dashboardReturnPath=%2Fdashboard%2Fnotifications"'
    ),
    true
  );
  assert.equal(
    body.includes(
      'class="button primary" href="https://example.com/v2/approval/passkey/operator?mode=dashboard&amp;phase=execution&amp;actionType=read&amp;highRiskKind=dashboard_access&amp;dashboardReturnPath=%2Fdashboard%2Fnotifications"'
    ),
    true
  );
  assert.equal(
    body.indexOf("Passkey で開く") < body.indexOf("Cloudflare Access で開く"),
    true
  );
  assert.equal(body.includes("repositoryInput=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes('href="https://example.com/dashboard/notifications"'), false);
  assert.equal(body.includes("?runId="), false);
  assert.equal(body.includes("title="), false);
  assert.equal(body.includes("sha="), false);
  assert.equal(body.includes("private deploy notification"), false);
  assert.equal(body.includes("private-run"), false);
  assert.equal(body.includes("privateabcdef"), false);
});

test("worker ignores stale dashboard passkey cookie when Cloudflare Access owner identity is valid", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/dashboard", {
      headers: {
        cookie: "vtdd_dashboard_session=approval%3Amissing",
        ...dashboardAccessHeaders
      }
    }),
    {
      ...dashboardAccessEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /vtdd_dashboard_session=dashboard-session%3A/);
  assert.match(response.headers.get("set-cookie"), /Max-Age=28800/);
  const body = await response.text();
  assert.equal(body.includes("VTDD v2 Dashboard"), true);
  assert.equal(body.includes("dashboard session was not found"), false);
});

test("worker rejects dashboard access when Access email header has no matching JWT email claim", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/dashboard", {
      headers: {
        "cf-access-authenticated-user-email": "owner@example.com",
        "cf-access-jwt-assertion": "login-only-access-jwt"
      }
    }),
    {
      VTDD_DASHBOARD_ALLOWED_EMAILS: "owner@example.com",
      CF_ACCESS_JWT_VERIFIER: async () => ({
        ok: true,
        payload: { login: "owner-login", exp: 4102444800 }
      })
    }
  );
  assert.equal(response.status, 403);
  const body = await response.text();
  assert.equal(body.includes("verified JWT has no email claim"), true);
});

test("worker rejects dashboard access when identity header does not match verified Access JWT", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/dashboard", {
      headers: {
        "cf-access-authenticated-user-email": "owner@example.com",
        "cf-access-jwt-assertion": "non-owner-access-jwt"
      }
    }),
    {
      VTDD_DASHBOARD_ALLOWED_EMAILS: "owner@example.com",
      CF_ACCESS_JWT_VERIFIER: async () => ({
        ok: true,
        payload: { email: "other@example.com", exp: 4102444800 }
      })
    }
  );
  assert.equal(response.status, 403);
  const body = await response.text();
  assert.equal(body.includes("does not match the verified JWT identity"), true);
});

test("worker serves v2 dashboard for allowed owner identity without exposing secrets", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/dashboard", {
      headers: dashboardAccessHeaders
    }),
    dashboardAccessEnv
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const body = await response.text();
  assert.equal(body.includes("Butler chat shell"), true);
  assert.equal(body.includes("dashboard main chat"), true);
  assert.equal(body.includes("管理メニュー"), true);
  assert.equal(body.includes("必要な時だけ開く"), true);
  assert.equal(body.includes("color-scheme: light dark"), true);
  assert.equal(body.includes("prefers-color-scheme: dark"), true);
  assert.equal(body.includes("--link: #0b6b65;"), true);
  assert.equal(body.includes("--owner-link: #9ee7ff;"), true);
  assert.equal(body.includes("--code-bg: #fbfbf7;"), true);
  assert.equal(body.includes("--code-text: #151515;"), true);
  assert.equal(body.includes("--owner-code-bg: #2a2a2a;"), true);
  assert.equal(body.includes("--owner-code-text: #f7f7f4;"), true);
  assert.equal(body.includes("--link: #90cdf4;"), true);
  assert.equal(body.includes("--owner-link: #075985;"), true);
  assert.equal(body.includes("--code-bg: #171717;"), true);
  assert.equal(body.includes("--code-text: #f7f7f4;"), true);
  assert.equal(body.includes("--owner-code-bg: #ffffff;"), true);
  assert.equal(body.includes("--owner-code-text: #111111;"), true);
  assert.equal(body.includes("overflow: hidden"), true);
  assert.equal(body.includes("max-width: 100vw"), true);
  assert.equal(body.includes("minmax(220px, 320px)"), false);
  assert.equal(body.includes('id="tools" class="sidebar"'), false);
  assert.equal(body.includes(".mobile-drawer { position: fixed;"), true);
  assert.equal(body.includes(".menu-toggle:checked ~ .mobile-backdrop, .menu-toggle:checked ~ .mobile-drawer { display: block; }"), true);
  assert.equal(body.includes(".composer-status:empty"), true);
  assert.equal(body.includes(".transient-progress-card"), false);
  assert.equal(body.includes(".composer-progress"), true);
  assert.equal(body.includes('id="butler-transient-progress"'), true);
  assert.equal(body.includes("data-transient-progress"), true);
  assert.equal(body.includes("function updateTransientProgress(text, options = {})"), true);
  assert.equal(body.includes("function clearTransientProgress()"), true);
  assert.equal(body.includes("function renderTransientProgress()"), true);
  const renderTransientProgressSource = body.match(/function renderTransientProgress\(\) \{[\s\S]*?\n      \}/)?.[0] || "";
  assert.equal(renderTransientProgressSource.includes("scrollToLatest()"), false);
  assert.equal(renderTransientProgressSource.includes("updateComposerReserve()"), true);
  assert.equal(body.includes("isLongRunningTransientStatus(options.status)"), true);
  assert.equal(body.includes("function appendMessage(message, target = log, options = {})"), true);
  assert.equal(body.includes("const fragment = document.createDocumentFragment()"), true);
  assert.equal(body.includes("appendMessage(message, fragment, { scroll: false })"), true);
  assert.equal(body.includes("WebSocket"), true);
  assert.equal(body.includes("接続準備中: 送信できる状態になったらここで知らせます"), false);
  assert.equal(body.includes("class=\"connection-note\""), false);
  assert.equal(body.includes("必要な状態だけ短く表示します"), true);
  assert.equal(body.includes("接続準備中です。送信できる状態になったら知らせます。"), true);
  assert.equal(body.includes("接続準備中です。WebSocket 接続後に送信できます。"), false);
  assert.equal(body.includes("repo/nickname 未指定"), false);
  assert.equal(body.includes("作業対象 repo 未指定"), false);
  assert.equal(body.includes("repo-less main chat"), true);
  assert.equal(body.includes("通常チャットは repo 未指定のまま始められます"), true);
  assert.equal(body.includes("この作業の対象 repo"), false);
  assert.equal(body.includes("固定ではありません"), false);
  assert.equal(body.includes("repo 境界が必要になった時だけ Butler が会話の中で確認します"), true);
  assert.equal(body.includes("?repository=owner/repo"), false);
  assert.equal(body.includes("旧 VPS runner 直送経路は使いません"), false);
  assert.equal(body.includes("codex app-server"), true);
  assert.equal(body.includes("deploy 用 passkey URL"), false);
  assert.equal(body.includes("vtdd-v3-orchestrator.polished-tree-da7c.workers.dev"), false);
  assert.equal(body.includes('id="mobile-menu-toggle"'), true);
  assert.equal(body.includes('for="mobile-menu-toggle"'), true);
  assert.equal(body.includes('data-drawer-resize-handle="dashboard-main"'), true);
  assert.equal(body.includes("vtdd.dashboard.drawer.width"), true);
  assert.equal(body.includes("--dashboard-drawer-width"), true);
  assert.equal(body.includes('aria-label="管理メニュー幅を変更"'), true);
  assert.equal(body.includes('aria-label="Passkey operator">Passkey</a>'), false);
  assert.equal(body.includes('aria-label="Deploy operator">Deploy</a>'), false);
  assert.equal(body.includes('aria-label="通知センター">通知</a>'), false);
  assert.equal(body.includes('aria-label="進捗を見る">進捗</a>'), false);
  assert.equal(body.includes('aria-label="Passkey で dashboard session を更新">Passkey</a>'), false);
  assert.equal(
    body.includes(
      '/v2/approval/passkey/operator?mode=dashboard&amp;phase=execution&amp;actionType=read&amp;highRiskKind=dashboard_access&amp;dashboardReturnPath=%2Fdashboard"'
    ),
    false
  );
  assert.equal(body.includes("mode=dashboard&amp;repositoryInput="), false);
  assert.equal(body.includes('aria-label="Passkey">◇</a>'), false);
  assert.equal(body.includes('<label class="tool-button menu-open" for="mobile-menu-toggle">管理</label>'), false);
  assert.equal(body.includes('class="tool-button top-action"'), false);
  assert.equal(body.includes('id="dashboard-repository-input"'), false);
  assert.equal(body.includes('placeholder="owner/repo"'), false);
  assert.equal(body.includes('aria-disabled="true"'), true);
  assert.equal(body.includes("repo 設定後に開けます"), true);
  assert.equal(body.includes('id="butler-chat-form"'), true);
  assert.equal(body.includes('id="butler-chat-log"'), true);
  assert.equal(body.includes('class="icon-button"'), false);
  assert.equal(body.includes('aria-hidden="true">＋</span>'), false);
  assert.equal(body.includes('aria-hidden="true">♪</span>'), false);
  assert.equal(body.includes('data-message-endpoint="https://example.com/v2/dashboard/chat/messages"'), false);
  assert.equal(body.includes('data-thread-endpoint="https://example.com/v2/dashboard/chat/dashboard-main-unresolved"'), true);
  assert.equal(body.includes('data-socket-endpoint="wss://example.com/v2/dashboard/chat/dashboard-main-unresolved/ws"'), true);
  assert.equal(body.includes('data-dispatch-to-vps-runner="true"'), false);
  assert.equal(body.includes('data-issue-number=""'), true);
  assert.equal(body.includes('data-codex-goal="dashboard_chat_triage"'), false);
  assert.equal(body.includes('executorTransport: dispatchToVpsRunner ? "vps_runner" : undefined'), false);
  assert.equal(body.includes("new WebSocket(socketEndpoint)"), true);
  assert.equal(body.includes("let socketHeartbeatTimer = null"), true);
  assert.equal(body.includes("function scheduleSocketHeartbeat()"), true);
  assert.equal(body.includes('chatSocket.send("ping")'), true);
  assert.equal(body.includes("stopSocketHeartbeat();"), true);
  assert.equal(body.includes("function refreshThread()"), true);
  assert.equal(body.includes("function scheduleReconnect()"), true);
  assert.equal(body.includes("function sendOwnerMessageByHttp("), false);
  assert.equal(body.includes("function isChatSocketOpen()"), true);
  assert.equal(body.includes("function setHttpFallbackReadyStatus()"), false);
  assert.equal(body.includes("function sendPendingOwnerMessage("), true);
  assert.equal(body.includes("function describeChatSocketState()"), true);
  assert.equal(body.includes("function setConnectionRecoveryStatus("), true);
  assert.equal(body.includes("function buildReconnectStatus("), true);
  assert.equal(body.includes("function dropStaleSocketIfNeeded()"), true);
  assert.equal(body.includes('let lastRefreshFailure = ""'), true);
  assert.equal(body.includes("function isAuthExpiredResponse("), true);
  assert.equal(body.includes("let dashboardSessionExpired = false"), true);
  assert.equal(body.includes("async function resumeDashboardSessionAfterAuthReturn("), true);
  assert.equal(body.includes('const dashboardDraftKey = "vtdd.dashboard.draft:"'), true);
  assert.equal(body.includes("function getDashboardDraftStorage()"), true);
  assert.equal(body.includes("return window.sessionStorage"), true);
  assert.equal(body.includes("window.localStorage"), false);
  assert.equal(body.includes("function persistDashboardDraft()"), true);
  assert.equal(body.includes("function restoreDashboardDraft()"), true);
  assert.equal(body.includes("function clearDashboardDraft()"), true);
  assert.equal(body.includes("if (dashboardSessionExpired || reconnectTimer"), true);
  assert.equal(body.includes("if (!threadEndpoint || refreshingThread || dashboardSessionExpired)"), true);
  assert.equal(body.includes("if (dashboardSessionExpired) return;"), true);
  assert.equal(body.includes("dashboardSessionExpired = false;"), true);
  assert.equal(body.includes("const refreshResult = await refreshThread();"), true);
  assert.equal(body.includes("if (refreshResult && refreshResult.authExpired)"), true);
  assert.equal(body.includes("connectThreadSocket();"), true);
  assert.equal(body.includes("window.clearTimeout(reconnectTimer)"), true);
  assert.equal(body.includes("HTTP fallback"), false);
  assert.equal(body.includes("Dashboard のログインが切れています。入力は残したまま再ログインしてください。"), true);
  assert.equal(body.includes("Passkey で再ログイン"), true);
  assert.equal(body.includes("dashboard_access"), true);
  assert.equal(body.includes("WebSocket 再接続中です。入力は保持したまま HTTP fallback で保存します。"), false);
  assert.equal(body.includes("WebSocket 未接続のため HTTP fallback で保存しました。再接続を続けています。"), false);
  assert.equal(body.includes("接続が不安定です。入力は保持したまま保存します。"), false);
  assert.equal(body.includes("接続が不安定なため保存しました。再接続を続けています。"), false);
  assert.equal(body.includes("WebSocket は未接続ですが、送信できます。再接続を続けています。"), false);
  assert.equal(body.includes('status.dataset.httpFallbackReady = "true"'), false);
  assert.equal(body.includes('status.dataset.httpFallbackReady = "false"'), false);
  assert.equal(body.includes("setHttpFallbackReadyStatus();"), false);
  assert.equal(body.includes("sendOwnerMessageByHttp(ownerPayload, clientMessageId)"), false);
  assert.equal(body.includes("WebSocket 再接続中です。入力は保持し、接続後に送信します。"), false);
  assert.equal(body.includes("WebSocket 再接続中です。入力は保持しています。接続後に自動送信します。"), true);
  assert.equal(body.includes("queuedWhileDisconnected: true"), true);
  assert.equal(body.includes("setComposerLocked(false);"), true);
  assert.equal(body.includes("function releaseComposerForFollowUp("), true);
  assert.equal(body.includes("このまま同じ thread に追加メッセージを送れます。"), true);
  assert.equal(body.includes("function withPendingSendRecoveryInstruction("), true);
  assert.equal(body.includes("送信保存を確認中のため入力欄は保持しています。確認後に同じ thread へ追加できます。"), true);
  assert.equal(body.includes('body.status === "stalled"'), true);
  assert.equal(body.includes('lastMessage?.status === "failed" || lastMessage?.status === "stalled"'), true);
  assert.equal(body.includes("接続しました。未送信の入力を送信しています。"), true);
  assert.equal(body.includes("sendPendingOwnerMessage(\"接続しました。未送信の入力を送信しています。\")"), true);
  assert.equal(body.includes("refreshThread().then"), true);
  assert.equal(body.includes("履歴の再取得に失敗しました。入力は保持しています。"), true);
  assert.equal(body.includes("再接続 \" + attempt + \"回目"), false);
  assert.equal(body.includes("最後の履歴取得"), false);
  assert.equal(body.includes("WebSocket: "), false);
  assert.equal(body.includes("status.dataset.reconnectAttempt"), true);
  assert.equal(body.includes("status.dataset.websocketState"), true);
  assert.equal(body.includes("status.dataset.recoveryMessage"), true);
  assert.equal(body.includes('if (options.visible !== true)'), true);
  assert.equal(body.includes('status.dataset.passiveRecoveryVisible = "false"'), true);
  assert.equal(body.includes("接続を復帰しています。入力は保持しています。"), true);
  assert.equal(body.includes("setConnectionRecoveryStatus(message, options = {})"), true);
  assert.equal(body.includes("setStatus(message, { temporary: options.temporary !== false })"), true);
  assert.equal(body.includes('setConnectionRecoveryStatus("接続が切れました。履歴を確認しながら復帰しています。");'), true);
  assert.equal(body.includes('setConnectionRecoveryStatus("接続できませんでした。履歴を確認しながら復帰しています。");'), true);
  assert.equal(body.includes('setConnectionRecoveryStatus("接続が切れました。履歴を確認しながら復帰しています。", { visible: true'), false);
  assert.equal(body.includes('setConnectionRecoveryStatus("接続できませんでした。履歴を確認しながら復帰しています。", { visible: true'), false);
  assert.equal(body.includes('setStatus("Dashboard thread 接続済み。", { temporary: true })'), true);
  assert.equal(body.includes('setStatus("");'), true);
  assert.equal(body.includes('document.addEventListener("visibilitychange", async () => {'), true);
  assert.equal(body.includes('window.addEventListener("online", async () => {'), true);
  assert.equal(body.includes("window.addEventListener(\"offline\""), true);
  assert.equal(body.includes("window.addEventListener(\"pagehide\", persistDashboardDraft)"), true);
  assert.equal(body.includes('window.addEventListener("pageshow", async () => {'), true);
  assert.equal(body.includes('await resumeDashboardSessionAfterAuthReturn("画面復帰後、再ログイン状態を確認しています。入力は保持しています。")'), true);
  assert.equal(body.includes('await resumeDashboardSessionAfterAuthReturn("ネットワーク復帰後、再ログイン状態を確認しています。入力は保持しています。")'), true);
  assert.equal(body.includes("オフラインです。入力は保持しています。"), true);
  assert.equal(body.includes("VPS Codex CLI に push します"), false);
  assert.equal(body.includes("function updateComposerReserve()"), true);
  assert.equal(body.includes("function resizeComposerInput()"), true);
  assert.equal(body.includes("max-height: max(88px, min(160px, 24dvh))"), true);
  assert.equal(body.includes("Math.min(160, Math.floor(window.innerHeight * 0.24))"), true);
  assert.equal(body.includes('textarea.style.height = "auto"'), true);
  assert.equal(body.includes('textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden"'), true);
  assert.equal(body.includes("function normalizeComposerInputText("), true);
  assert.equal(body.includes("function normalizeComposerInput()"), true);
  assert.equal(body.includes("restoreDashboardDraft();"), true);
  assert.equal(body.includes('textarea.addEventListener("input", () => {'), true);
  assert.equal(body.includes("persistDashboardDraft();"), true);
  assert.equal(body.includes('textarea.addEventListener("paste"'), true);
  assert.equal(body.includes(shouldSubmitDashboardComposerShortcut.toString()), true);
  assert.equal(body.includes('textarea.addEventListener("keydown", (event) => {'), true);
  assert.equal(body.includes("if (!shouldSubmitDashboardComposerShortcut(event)) return;"), true);
  assert.equal(body.includes("form.requestSubmit();"), true);
  assert.equal(body.includes('form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))'), true);
  assert.equal(body.includes("function scrollToLatest()"), true);
  assert.equal(body.includes("function showThinking()"), false);
  assert.equal(body.includes("function removeThinking("), false);
  assert.equal(body.includes('id="butler-interrupt-panel"'), false);
  assert.equal(body.includes("butler-interrupt-panel"), false);
  assert.equal(body.includes("実行中の割り込み指示"), false);
  assert.equal(body.includes("sendInterruptMessage"), false);
  assert.equal(body.includes("interrupt: true"), false);
  assert.equal(body.includes("割り込み指示: "), false);
  assert.equal(body.includes("executionRunning"), false);
  assert.equal(body.includes("stop-state"), false);
  assert.equal(body.includes('sendButton.textContent = "■"'), false);
  assert.equal(body.includes("function renderMessageText("), true);
  assert.equal(body.includes("function renderInlineMarkdown("), true);
  assert.equal(body.includes('body.className = "message-body"'), true);
  assert.equal(body.includes('meta.className = "message-meta"'), true);
  assert.equal(body.includes("function formatMessageTimestamp("), true);
  assert.equal(body.includes("hour: \"2-digit\""), true);
  assert.equal(body.includes("minute: \"2-digit\""), true);
  assert.equal(body.includes("sameDay"), true);
  assert.equal(body.includes("const locale = navigator.language || \"ja-JP\""), true);
  assert.equal(body.includes("new Intl.DateTimeFormat(locale"), true);
  assert.equal(body.includes(".message-meta { margin-top: 6px; color: var(--muted); font-size: 11px; line-height: 1.2; opacity: .86; }"), true);
  assert.equal(body.includes(".bubble.owner .message-meta { color: var(--owner-text); opacity: .76; text-align: right; }"), true);
  assert.equal(body.includes(".bubble.has-copy-action { position: relative; }"), true);
  assert.equal(body.includes(".copy-message { position: absolute; top: -8px; right: -8px;"), true);
  assert.equal(body.includes("opacity: 0; pointer-events: none;"), true);
  assert.equal(body.includes(".bubble.has-copy-action:hover .copy-message"), true);
  assert.equal(body.includes(".bubble.actions-visible .copy-message"), true);
  assert.equal(body.includes(".copy-message:focus-visible { opacity: .92; pointer-events: auto;"), true);
  assert.equal(body.includes('document.createElement("ul")'), true);
  assert.equal(body.includes('document.createElement("li")'), true);
  assert.equal(body.includes('document.createElement("pre")'), true);
  assert.equal(body.includes('document.createElement("strong")'), true);
  assert.equal(body.includes('document.createElement("code")'), true);
  assert.equal(body.includes("String.fromCharCode(96, 96, 96)"), true);
  assert.equal(body.includes("code.dataset.language = language"), true);
  assert.equal(body.includes("renderInlineMarkdown(strong"), true);
  assert.equal(body.includes("function normalizeMessageDisplayText("), true);
  assert.equal(body.includes("function normalizeMessageCopyText("), true);
  assert.equal(body.includes("function decodeSafeChatCommandText("), true);
  assert.equal(body.includes("decodeURIComponent(line)"), true);
  assert.equal(body.includes('if (/^https?:/i.test(line))'), true);
  assert.equal(body.includes("function shouldWrapCodeBlock("), true);
  assert.equal(body.includes('if (/^https?:\\/\\//i.test(source)) return true;'), true);
  assert.equal(body.includes('if (/^go:%[0-9a-f]{2}/i.test(source)) return true;'), true);
  assert.equal(body.includes("return source.length > 80 && !/\\s/.test(source);"), true);
  assert.equal(body.includes(".chat-link { color: var(--link);"), true);
  assert.equal(body.includes(".bubble.owner .chat-link { color: var(--owner-link); }"), true);
  assert.equal(body.includes(".bubble.owner ul, .bubble.owner li, .bubble.owner li::marker { color: var(--owner-text); }"), true);
  assert.equal(body.includes('renderMessageText(body, normalizeMessageDisplayText(message.text || "（空のメッセージ）"))'), true);
  assert.equal(body.includes('copyMessageText(copyButton, normalizeMessageCopyText(message.text || ""))'), true);
  assert.equal(body.includes('pre.className = "wrap-code"'), true);
  assert.equal(body.includes("function copyMessageText("), true);
  assert.equal(body.includes("navigator.clipboard.writeText"), true);
  assert.equal(body.includes("返信をコピー"), true);
  assert.equal(body.includes("自分の発言をコピー"), true);
  assert.equal(body.includes('className = "copy-code"'), true);
  assert.equal(body.includes("コードをコピー"), true);
  assert.equal(body.includes("copyButton.addEventListener(\"click\", () => copyMessageText(copyButton, codeText))"), true);
  assert.equal(body.includes(".copy-code { position: absolute; top: 8px; right: 8px;"), true);
  assert.equal(body.includes("function attachMessageActionReveal("), true);
  assert.equal(body.includes('article.classList.add("has-copy-action")'), true);
  assert.equal(body.includes('article.classList.toggle("actions-visible")'), true);
  assert.equal(body.includes('event.target.closest("a, button, input, textarea, select, summary")'), true);
  assert.equal(body.includes("article.tabIndex = 0"), false);
  assert.equal(body.includes('article.addEventListener("keydown"'), false);
  assert.equal(body.includes('if (message.role === "owner")'), true);
  assert.equal(body.includes('} else if (message.role === "butler") {'), true);
  assert.equal(body.includes('} else if (message.role === "system") {'), true);
  assert.equal(body.includes('className = "copy-message"'), true);
  assert.equal(body.includes('autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send"'), true);
  assert.equal(body.includes("const messagesById = new Map()"), true);
  assert.equal(body.includes("let pendingOwnerSend = null"), true);
  assert.equal(body.includes("let retryClientMessageId = \"\""), true);
  assert.equal(body.includes("function releasePendingOwnerSend("), true);
  assert.equal(body.includes("function releasePendingOwnerSendFromThread("), true);
  assert.equal(body.includes("releasePendingOwnerSendFromThread(body.messages || [])"), true);
  assert.equal(body.includes("let authReturnResumePromise = null"), true);
  assert.equal(body.includes("if (authReturnResumePromise)"), true);
  assert.equal(body.includes("await authReturnResumePromise;"), true);
  assert.equal(body.includes("authReturnResumePromise = null;"), true);
  assert.equal(body.includes("送信確認を待っています。入力は保存確認まで残します。"), true);
  assert.equal(body.includes("送信確認前に WebSocket が切れました。入力は残しています。履歴再取得後にもう一度送信できます。"), false);
  assert.equal(body.includes("送信確認が返りませんでした。入力は残しています。再接続後にもう一度送信してください。"), false);
  assert.equal(body.includes("WebSocket が切れました。入力は保持し、再接続後に自動送信します。"), true);
  assert.equal(body.includes("送信確認が返りません。入力は保持し、再接続後に同じ内容を再送します。"), true);
  assert.equal(body.includes("messagesById.set(messageKey(message), message)"), true);
  assert.equal(body.includes("messagesById.clear()"), true);
  assert.equal(body.includes("message?.createdAt"), true);
  assert.equal(body.includes('renderThread(body.messages || [], { replace: true })'), true);
  assert.equal(body.includes('renderThread(body.messages || [], { replace: false })'), true);
  assert.equal(body.includes('body.type === "transient_status"'), true);
  assert.equal(body.includes("updateTransientProgress(transientText"), true);
  assert.equal(body.includes("setStatus(transientText, {\n                  thinking: isThinking"), false);
  assert.equal(body.includes("clearTransientProgress();\n                setStatus(\"返信を受信しました。\""), true);
  assert.equal(body.includes("clearTransientProgress();\n                releaseComposerForFollowUp"), true);
  assert.equal(body.includes('lastMessage?.status === "failed"'), true);
  assert.equal(body.includes("応答生成が時間切れになりました。同じ thread で続けられます。"), true);
  assert.equal(body.includes("appendMessage(body"), false);
  assert.equal(body.includes("white-space: pre-wrap"), true);
  assert.equal(body.includes(".bubble .message-body pre.wrap-code"), true);
  assert.equal(body.includes("overflow-wrap: anywhere; word-break: break-word;"), true);
  assert.equal(body.includes(".bubble .message-body { display: grid; gap: 12px; min-width: 0; max-width: 100%; overflow: hidden; }"), true);
  assert.equal(body.includes(".bubble .message-body p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }"), true);
  assert.equal(body.includes(".chat-scroll { width: 100%; max-width: 100%; min-height: 0; overflow-y: auto; overflow-x: hidden;"), true);
  assert.equal(body.includes("overscroll-behavior-x: none"), true);
  assert.equal(body.includes("touch-action: pan-y"), true);
  assert.equal(body.includes(".bubble .message-body pre { position: relative; margin: 0; padding: 42px 14px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--code-bg); color: var(--code-text); overflow-x: hidden; white-space: pre-wrap; max-width: 100%; }"), true);
  assert.equal(body.includes(".bubble.owner .message-body pre { background: var(--owner-code-bg); border-color: var(--owner-code-border); color: var(--owner-code-text); }"), true);
  assert.equal(body.includes(".bubble.owner .message-body pre code { color: var(--owner-code-text); }"), true);
  assert.equal(body.includes("tokenPattern"), true);
  assert.equal(body.includes('link.className = "chat-link"'), true);
  assert.equal(body.includes("考えています"), false);
  assert.equal(body.includes("thinking-dots"), true);
  assert.equal(body.includes("grid-template-rows: auto minmax(0, 1fr) auto"), true);
  assert.equal(body.includes("height: 100dvh"), true);
  assert.equal(body.includes("overflow: hidden"), true);
  assert.equal(body.includes("requestAnimationFrame"), true);
  assert.equal(body.includes("preventScroll: true"), true);
  assert.equal(body.includes("--composer-reserve"), true);
  assert.equal(body.includes("background: var(--page-bg)"), true);
  assert.equal(body.includes('credentials: "same-origin"'), true);
  assert.equal(body.includes("会話履歴を読み込み中です"), false);
  assert.equal(body.includes("モバイル管理メニュー"), true);
  assert.equal(body.includes("直近 deploy event"), true);
  assert.equal(body.includes("Butler V2 にメッセージ"), true);
  assert.equal(body.includes("GitHub状況"), true);
  assert.equal(body.includes(">通知</a>"), true);
  assert.equal(body.includes(">Passkey</a>"), false);
  assert.equal(body.includes("/dashboard/github?repository=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes("/dashboard/notifications"), true);
  assert.equal(body.includes(">通知センター</a>"), true);
  assert.equal(body.includes(">本番反映 / Passkey 承認</a>"), false);
  assert.equal(body.includes("<strong>本番反映 / Passkey 承認</strong>"), true);
  assert.equal(body.includes("include=open_prs"), false);
  assert.equal(body.includes('name="text"'), true);
  assert.equal(/<meta[^>]+http-equiv=["']?refresh/i.test(body), false);
  assert.equal(body.includes("setInterval("), false);
  assert.equal(body.includes("setTimeout("), true);
  assert.equal(body.includes("fetch(threadEndpoint"), true);
  assert.equal(body.includes("repositoryInput=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes("/status"), true);
  assert.equal(body.includes("/dashboard/preflight?repository=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes("/dashboard/progress?repository=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes("/dashboard/vps-runner?repository=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes("/dashboard/memory?repository=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes("/dashboard/self-parity?repository=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes("/v2/retrieve/startup-preflight?repository=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes("/v2/action/progress?repository=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes("/v2/action/vps-runner-status?repository=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes("/v2/retrieve/operational-memory?repository=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes("/v2/retrieve/self-parity?repository=marushu%2Fvtdd-v2-p"), false);
  assert.equal(body.includes("gemini-pr-review"), true);
  assert.equal(body.includes("passkey approval"), true);
  assert.equal(body.includes("approvalGrantId"), false);
  assert.equal(body.includes("CLOUDFLARE_API_TOKEN"), false);

  const alias = await worker.fetch(
    new Request("https://example.com/orchestrator", {
      headers: dashboardAccessHeaders
    }),
    dashboardAccessEnv
  );
  assert.equal(alias.status, 200);
  assert.match(alias.headers.get("cache-control"), /no-store/);
  const aliasBody = await alias.text();
  assert.equal(aliasBody.includes("VTDD Butler"), true);
  assert.equal(aliasBody.includes("dashboard main chat"), true);
  assert.equal(aliasBody.includes("管理メニュー"), true);
  assert.equal(aliasBody.includes("WebSocket"), true);
});

test("worker issues dashboard read session cookie for Access-authenticated dashboard HTML", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/dashboard", {
      headers: dashboardAccessHeaders
    }),
    {
      ...dashboardAccessEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /vtdd_dashboard_session=dashboard-session%3A/);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(response.headers.get("set-cookie"), /Max-Age=28800/);
});

test("worker accepts Access-backed dashboard read session cookie for dashboard chat WebSocket auth", async () => {
  const provider = createInMemoryMemoryProvider();
  const dashboardResponse = await worker.fetch(
    new Request("https://example.com/dashboard", {
      headers: dashboardAccessHeaders
    }),
    {
      ...dashboardAccessEnv,
      MEMORY_PROVIDER: provider
    }
  );
  const cookie = dashboardResponse.headers.get("set-cookie")?.match(/vtdd_dashboard_session=[^;]+/)?.[0] || "";
  assert.notEqual(cookie, "");

  const rooms = createMockDashboardChatRoomNamespace();
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/dashboard-main-marushu-vtdd-v2-p/ws", {
      headers: { cookie }
    }),
    {
      MEMORY_PROVIDER: provider,
      DASHBOARD_CHAT_ROOMS: rooms.namespace
    }
  );

  assert.equal(response.status, 426);
  const body = await response.json();
  assert.equal(body.error, "websocket_upgrade_required");
});

test("served dashboard inline chat renderer executes decode, link, wrap, and copy behavior", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/dashboard", {
      headers: dashboardAccessHeaders
    }),
    dashboardAccessEnv
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  const document = createMinimalDashboardDocument();
  const copied = [];
  const helpers = loadDashboardInlineChatHelpers(html)(
    document,
    {
      clipboard: {
        async writeText(text) {
          copied.push(String(text));
        }
      }
    },
    {
      isSecureContext: true,
      setTimeout(callback) {
        callback();
      }
    },
    (text) => {
      document.lastStatus = text;
    }
  );

  assert.equal(
    helpers.normalizeMessageDisplayText("go:%0Adeploy%20production%0Aissue%20%23524"),
    "go:\ndeploy production\nissue #524"
  );
  assert.equal(
    helpers.normalizeMessageCopyText("https://example.com/path%20with%20encoded?x=1"),
    "https://example.com/path%20with%20encoded?x=1"
  );
  assert.equal(
    helpers.normalizeComposerInputText("go:%20Issue%20%23575%20close%20and%20delete"),
    "go: Issue #575 close and delete"
  );
  assert.equal(
    helpers.normalizeComposerInputText("go:%0AIssue%20%23575%20close"),
    "go:\nIssue #575 close"
  );
  assert.equal(
    helpers.normalizeComposerInputText("https://example.com/path%20with%20encoded?x=1"),
    "https://example.com/path%20with%20encoded?x=1"
  );
  assert.equal(helpers.normalizeMessageCopyText("go:%E0%A4%A"), "go:%E0%A4%A");
  assert.equal(helpers.normalizeMessageCopyText("slack:%20do-not-decode"), "slack:%20do-not-decode");

  const textContainer = document.createElement("div");
  helpers.renderMessageText(
    textContainer,
    helpers.normalizeMessageDisplayText("go:%0Adeploy%20production%0Ahttps://example.com/" + "a".repeat(96))
  );
  assert.equal(textContainer.textContent.includes("go:\ndeploy production"), true);
  const links = textContainer.querySelectorAll("a");
  assert.equal(links.length, 1);
  assert.equal(links[0].className, "chat-link");
  assert.equal(links[0].href.startsWith("https://example.com/"), true);

  const markdownLinkContainer = document.createElement("div");
  helpers.renderMessageText(
    markdownLinkContainer,
    "[GitHub Actions を開く](https://github.com/example/repo/actions/runs/1234567890)"
  );
  const markdownLinks = markdownLinkContainer.querySelectorAll("a");
  assert.equal(markdownLinks.length, 1);
  assert.equal(markdownLinks[0].className, "chat-link");
  assert.equal(markdownLinks[0].textContent, "GitHub Actions を開く");
  assert.equal(
    markdownLinks[0].href,
    "https://github.com/example/repo/actions/runs/1234567890"
  );
  assert.equal(markdownLinkContainer.textContent, "GitHub Actions を開く");

  const parenthesizedLinkContainer = document.createElement("div");
  helpers.renderMessageText(parenthesizedLinkContainer, "開いて（https://example.com/path?x=1）");
  const parenthesizedLinks = parenthesizedLinkContainer.querySelectorAll("a");
  assert.equal(parenthesizedLinks.length, 1);
  assert.equal(parenthesizedLinks[0].href, "https://example.com/path?x=1");
  assert.equal(parenthesizedLinks[0].textContent, "https://example.com/path?x=1");
  assert.equal(parenthesizedLinkContainer.textContent, "開いて（https://example.com/path?x=1）");

  const commaLinkContainer = document.createElement("div");
  helpers.renderMessageText(commaLinkContainer, "次: https://example.com/path、確認");
  const commaLinks = commaLinkContainer.querySelectorAll("a");
  assert.equal(commaLinks.length, 1);
  assert.equal(commaLinks[0].href, "https://example.com/path");
  assert.equal(commaLinkContainer.textContent, "次: https://example.com/path、確認");

  const encodedFullWidthParenContainer = document.createElement("div");
  helpers.renderMessageText(encodedFullWidthParenContainer, "開いて https://example.com/path%EF%BC%89");
  const encodedFullWidthParenLinks = encodedFullWidthParenContainer.querySelectorAll("a");
  assert.equal(encodedFullWidthParenLinks.length, 1);
  assert.equal(encodedFullWidthParenLinks[0].href, "https://example.com/path");
  assert.equal(encodedFullWidthParenContainer.textContent, "開いて https://example.com/path）");

  const encodedAsciiParenContainer = document.createElement("div");
  helpers.renderMessageText(encodedAsciiParenContainer, "open https://example.com/path%29");
  const encodedAsciiParenLinks = encodedAsciiParenContainer.querySelectorAll("a");
  assert.equal(encodedAsciiParenLinks.length, 1);
  assert.equal(encodedAsciiParenLinks[0].href, "https://example.com/path");
  assert.equal(encodedAsciiParenContainer.textContent, "open https://example.com/path)");

  const encodedSpaceContainer = document.createElement("div");
  helpers.renderMessageText(encodedSpaceContainer, "open https://example.com/path%20with%20encoded?x=1");
  const encodedSpaceLinks = encodedSpaceContainer.querySelectorAll("a");
  assert.equal(encodedSpaceLinks.length, 1);
  assert.equal(encodedSpaceLinks[0].href, "https://example.com/path%20with%20encoded?x=1");

  const codeContainer = document.createElement("div");
  helpers.renderMessageText(codeContainer, "```\nhttps://example.com/" + "b".repeat(96) + "\n```");
  const codeBlocks = codeContainer.querySelectorAll("pre");
  assert.equal(codeBlocks.length, 1);
  assert.equal(codeBlocks[0].className, "wrap-code");
  const codeCopyButtons = codeContainer.querySelectorAll("button");
  assert.equal(codeCopyButtons.length, 1);
  await codeCopyButtons[0].click();
  assert.equal(copied.at(-1), "https://example.com/" + "b".repeat(96));

  const mixedCodeContainer = document.createElement("div");
  helpers.renderMessageText(mixedCodeContainer, "黒潰れ確認。\n```\nhttps://example.com/" + "c".repeat(96) + "\n```");
  const mixedParagraphs = mixedCodeContainer.querySelectorAll("p");
  const mixedCodeBlocks = mixedCodeContainer.querySelectorAll("pre");
  assert.equal(mixedParagraphs.length, 1);
  assert.equal(mixedParagraphs[0].textContent, "黒潰れ確認。");
  assert.equal(mixedCodeBlocks.length, 1);
  assert.equal(mixedCodeBlocks[0].className, "wrap-code");

  const messageCopyButton = document.createElement("button");
  await helpers.copyMessageText(
    messageCopyButton,
    helpers.normalizeMessageCopyText("go:%0Adeploy%20production%0Aissue%20%23524")
  );
  assert.equal(copied.at(-1), "go:\ndeploy production\nissue #524");
  assert.equal(document.lastStatus, undefined);
});

test("worker appends dashboard Butler chat turn and retrieves the same thread", async () => {
  const store = createInMemoryDashboardChatStore();
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: { ...dashboardAccessHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        clientMessageId: "dashboard_owner_message:http-fallback-1",
        repository: "marushu/vtdd-v2-p",
        text: "VPS Codex CLI とリアルタイムに会話したい"
      })
    }),
    { ...dashboardAccessEnv, DASHBOARD_CHAT_STORE: store }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.threadId, "dashboard-main-marushu-vtdd-v2-p");
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, "owner");
  assert.equal(body.messages[0].messageId, "dashboard_owner_message:http-fallback-1");
  assert.equal(JSON.stringify(body.messages).includes("旧 `codex exec` 経路は削除済み"), false);
  assert.equal(JSON.stringify(body.messages).includes("Custom GPT Butler"), false);

  const retrieveResponse = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/dashboard-main-marushu-vtdd-v2-p", {
      headers: dashboardAccessHeaders
    }),
    { ...dashboardAccessEnv, DASHBOARD_CHAT_STORE: store }
  );
  assert.equal(retrieveResponse.status, 200);
  const retrieveBody = await retrieveResponse.json();
  assert.equal(retrieveBody.ok, true);
  assert.equal(retrieveBody.messages.length, 1);
  assert.equal(retrieveBody.messages[0].messageId, "dashboard_owner_message:http-fallback-1");
  assert.equal(retrieveBody.messages[0].text, "VPS Codex CLI とリアルタイムに会話したい");
  assert.equal(retrieveBody.summary, null);
});

test("worker serves dashboard media add controls for iPhone-first upload", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/dashboard", {
      headers: dashboardAccessHeaders
    }),
    dashboardAccessEnv
  );
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal(body.includes("id=\"butler-media-button\""), true);
  assert.equal(body.includes("id=\"butler-media-input\""), true);
  assert.equal(body.includes('id="butler-media-input" type="file" multiple hidden'), true);
  assert.equal(body.includes("画像・動画・ファイルを追加"), true);
  assert.equal(body.includes("accept=\"image/*\""), false);
  assert.equal(body.includes("/v2/media/upload"), true);
  assert.equal(body.includes("createImageBitmap"), true);
  assert.equal(body.includes("className = \"media-thumb\""), true);
  assert.equal(body.includes("function getMediaContentKind("), true);
  assert.equal(body.includes("function formatMediaRetentionLabel("), true);
  assert.equal(body.includes("id=\"butler-media-lightbox\""), true);
  assert.equal(body.includes("id=\"butler-media-lightbox-close\""), true);
  assert.equal(body.includes(".media-lightbox-body { min-width: 0; min-height: 0; width: 100%; height: 100%;"), true);
  assert.equal(body.includes(".media-lightbox-body img, .media-lightbox-body video { display: block; width: 100%; height: 100%;"), true);
  assert.equal(body.includes("object-fit: contain;"), true);
  assert.equal(body.includes("function openMediaLightbox("), true);
  assert.equal(body.includes("function closeMediaLightbox("), true);
  assert.equal(body.includes("if (target.closest(\"button\")) return;"), true);
  assert.equal(body.includes("if (target.closest(\"video\")) return;"), true);
  assert.equal(body.includes("closeMediaLightbox();"), true);
  assert.equal(body.includes("mediaLightboxTitle.textContent = item && item.filename ? item.filename : getMediaKindLabel(item)"), true);
  assert.equal(body.includes("mediaLightboxMeta.textContent = formatMediaRetentionLabel(item)"), true);
  assert.equal(body.includes("保存期間が切れたか、取得できません。必要なら再添付してください。"), true);
  assert.equal(body.includes("function isPreviewableMediaFile("), true);
  assert.equal(body.includes("const mediaKind = getMediaContentKind(reference)"), true);
  assert.equal(body.includes("getMediaContentKind(item) === \"video\""), true);
  assert.equal(body.includes("document.createElement(\"video\")"), true);
  assert.equal(body.includes("video.playsInline = true"), true);
  assert.equal(body.includes("video.controls = true"), true);
  assert.equal(body.includes("mp4|mov|m4v|webm"), true);
  assert.equal(body.includes("/\\.(mp4|mov|m4v|webm)$/.test(filename)"), true);
  assert.equal(body.includes("icon.textContent = \"動画\""), true);
  assert.equal(body.includes("const mediaRouteHref = reference.mediaId ? \"/v2/media/\" + reference.mediaId + \"/download\" : \"\""), true);
  assert.equal(body.includes("const safeDownloadHref = referenceDownloadUrl.startsWith(\"/v2/media/\") ? referenceDownloadUrl : \"\""), true);
  assert.equal(body.includes("const downloadHref = mediaRouteHref || safeDownloadHref || \"#\""), true);
  assert.equal(body.includes("chip.href = downloadHref"), true);
  assert.equal(body.includes("appendMediaLabel(chip, reference)"), false);
  assert.equal(body.includes("const canPreview = (isImage || isVideo) && downloadHref !== \"#\""), true);
  assert.equal(body.includes("const chip = document.createElement(canPreview ? \"button\" : \"a\")"), true);
  assert.equal(body.includes("chip.addEventListener(\"click\", () => openMediaLightbox(reference, downloadHref, chip))"), true);
  assert.equal(body.includes("chip.setAttribute(\"role\", \"button\")"), true);
  assert.equal(body.includes("chip.setAttribute(\"aria-label\", (item.filename || \"添付\") + \"を拡大表示\")"), true);
  assert.equal(body.includes("isImage && downloadHref !== \"#\""), true);
  assert.equal(body.includes("image.src = downloadHref"), true);
  assert.equal(body.includes("URL.createObjectURL"), true);
  assert.equal(body.includes("URL.revokeObjectURL"), true);
  assert.equal(body.includes("const files = Array.from(mediaInput.files || [])"), true);
  assert.equal(body.includes("for (const file of files)"), true);
  assert.equal(body.includes("const selectedItems = []"), true);
  assert.equal(body.includes("revokePendingMediaPreviews(selectedItems)"), true);
  assert.equal(body.includes("const nextPendingMediaItems = [...pendingMediaItems, ...selectedItems]"), true);
  assert.equal(body.includes("Math.min(selectedItems.length, 12)"), true);
  assert.equal(body.includes("repo 未指定の通常会話では private media として保存します"), true);
  assert.equal(body.includes("mediaReferences"), true);
  assert.equal(body.includes("pendingSendRollbacks"), true);
  assert.equal(body.includes("pendingOwnerSend"), true);
  assert.equal(body.includes("const clientMessageId = retryClientMessageId || createClientMessageId()"), true);
  assert.equal(body.includes("retryClientMessageId = pending.clientMessageId"), true);
  assert.equal(body.includes("setComposerLocked(true)"), true);
  assert.equal(body.includes("releasePendingOwnerSend(clientMessageId, { clearComposer: true })"), true);
  assert.equal(body.includes("owner_message_accepted"), true);
});

test("dashboard stalled recovery unlocks follow-up composer after saved sends only", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/dashboard", {
      headers: dashboardAccessHeaders
    }),
    dashboardAccessEnv
  );
  assert.equal(response.status, 200);
  const helpers = loadDashboardComposerRecoveryHelpers(await response.text());

  assert.equal(helpers.releaseComposerForFollowUp("進行イベントがしばらく届いていません。"), true);
  let state = helpers.getState();
  assert.equal(state.textarea.readOnly, false);
  assert.equal(state.mediaButton.disabled, false);
  assert.equal(state.submitButton.disabled, false);
  assert.equal(
    state.statusLog.some((entry) => String(entry.text || "").includes("このまま同じ thread に追加メッセージを送れます。")),
    true
  );
  assert.equal(state.statusLog.some((entry) => entry.reserveUpdated === true), true);

  state.textarea.readOnly = true;
  state.mediaButton.disabled = true;
  state.submitButton.disabled = true;
  helpers.setPendingOwnerSend({ clientMessageId: "pending-owner-send" });
  assert.equal(helpers.releaseComposerForFollowUp("進行イベントがしばらく届いていません。"), false);
  state = helpers.getState();
  assert.equal(state.textarea.readOnly, true);
  assert.equal(state.mediaButton.disabled, true);
  assert.equal(state.submitButton.disabled, true);
  const latestStatus = state.statusLog.at(-1);
  assert.equal(String(latestStatus.text || "").includes("進行イベントがしばらく届いていません。"), true);
  assert.equal(String(latestStatus.text || "").includes("送信保存を確認中のため入力欄は保持しています。"), true);
  assert.equal(latestStatus.options.thinking, true);
});

test("worker uploads dashboard media to R2 and stores D1 metadata reference only", async () => {
  const mediaStore = createInMemoryMediaObjectStore();
  const r2 = createInMemoryR2Binding();
  const form = new FormData();
  form.append("repositoryInput", "marushu/vtdd-v2-p");
  form.append("relatedIssue", "498");
  form.append("sourceSurface", "dashboard_butler");
  form.append("file", createPngBlob(), "dashboard.png");

  const response = await worker.fetch(
    new Request("https://example.com/v2/media/upload", {
      method: "POST",
      headers: dashboardAccessHeaders,
      body: form
    }),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: mediaStore,
      VTDD_MEDIA_R2: r2
    }
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.match(body.media.mediaId, /^med_/);
  assert.equal(body.media.repository, "marushu/vtdd-v2-p");
  assert.equal(body.media.relatedIssue, 498);
  assert.equal(body.media.filename, "dashboard.png");
  assert.equal(body.media.contentType, "image/png");
  assert.equal(body.media.visibility, "private");
  assert.equal(typeof body.media.expiresAt, "string");
  assert.equal(body.media.retentionLabel, "7日後に削除");
  assert.equal(Math.round((Date.parse(body.media.expiresAt) - Date.parse(body.media.createdAt)) / (24 * 60 * 60 * 1000)), 7);
  assert.equal(body.stored.rawBinaryReturned, false);
  assert.equal(JSON.stringify(body).includes("fake image bytes"), false);
  assert.equal(r2.objects.size, 1);
  const storedObject = [...r2.objects.values()][0];
  assert.equal(storedObject.options.customMetadata.expiresAt, body.media.expiresAt);

  const metadataResponse = await worker.fetch(
    new Request(`https://example.com${body.media.metadataUrl}`, {
      headers: dashboardAccessHeaders
    }),
    { ...dashboardAccessEnv, MEDIA_OBJECT_STORE: mediaStore, VTDD_MEDIA_R2: r2 }
  );
  assert.equal(metadataResponse.status, 200);
  const metadataBody = await metadataResponse.json();
  assert.equal(metadataBody.media.mediaId, body.media.mediaId);
  assert.equal(metadataBody.media.expiresAt, body.media.expiresAt);
  assert.equal(metadataBody.media.objectKey, undefined);
  assert.equal(metadataBody.media.sourceEventId, undefined);
  assert.equal(JSON.stringify(metadataBody).includes("fake image bytes"), false);

  const downloadResponse = await worker.fetch(
    new Request(`https://example.com${body.media.downloadUrl}`, {
      headers: dashboardAccessHeaders
    }),
    { ...dashboardAccessEnv, MEDIA_OBJECT_STORE: mediaStore, VTDD_MEDIA_R2: r2 }
  );
  assert.equal(downloadResponse.status, 200);
  assert.equal(new Uint8Array(await downloadResponse.arrayBuffer())[0], 0x89);
});

test("worker uploads dashboard mp4 media to R2 and stores metadata reference only", async () => {
  const mediaStore = createInMemoryMediaObjectStore();
  const r2 = createInMemoryR2Binding();
  const form = new FormData();
  form.append("repositoryInput", "marushu/vtdd-v2-p");
  form.append("relatedIssue", "587");
  form.append("sourceSurface", "dashboard_butler");
  form.append("file", createMp4Blob(), "broken-scroll.mp4");

  const response = await worker.fetch(
    new Request("https://example.com/v2/media/upload", {
      method: "POST",
      headers: dashboardAccessHeaders,
      body: form
    }),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: mediaStore,
      VTDD_MEDIA_R2: r2
    }
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.match(body.media.mediaId, /^med_/);
  assert.equal(body.media.repository, "marushu/vtdd-v2-p");
  assert.equal(body.media.relatedIssue, 587);
  assert.equal(body.media.filename, "broken-scroll.mp4");
  assert.equal(body.media.contentType, "video/mp4");
  assert.equal(body.media.visibility, "private");
  assert.equal(typeof body.media.expiresAt, "string");
  assert.equal(body.media.retentionLabel, "7日後に削除");
  assert.equal(body.stored.rawBinaryReturned, false);
  assert.equal(JSON.stringify(body).includes("ftypisom"), false);
  assert.equal(r2.objects.size, 1);
  const storedObject = [...r2.objects.values()][0];
  assert.equal(storedObject.options.httpMetadata.contentType, "video/mp4");
  assert.equal(storedObject.options.customMetadata.expiresAt, body.media.expiresAt);

  const downloadResponse = await worker.fetch(
    new Request(`https://example.com${body.media.downloadUrl}`, {
      headers: dashboardAccessHeaders
    }),
    { ...dashboardAccessEnv, MEDIA_OBJECT_STORE: mediaStore, VTDD_MEDIA_R2: r2 }
  );
  assert.equal(downloadResponse.status, 200);
  assert.equal(downloadResponse.headers.get("content-type"), "video/mp4");
});

test("worker returns owner-facing expiration for expired dashboard media", async () => {
  const mediaStore = createInMemoryMediaObjectStore();
  const r2 = createInMemoryR2Binding();
  await mediaStore.put({
    id: "med_expiredmedia",
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 498,
    sourceSurface: "dashboard_butler",
    sourceEventId: "dashboard_owner_message:expired",
    objectKey: "media/marushu/vtdd-v2-p/2026/05/23/med_expiredmedia/dashboard.png",
    filename: "dashboard.png",
    contentType: "image/png",
    byteSize: 16,
    sha256: "0123456789abcdef",
    visibility: "private",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    expiresAt: "2026-05-30T00:00:00.000Z"
  });
  await r2.put("media/marushu/vtdd-v2-p/2026/05/23/med_expiredmedia/dashboard.png", new Uint8Array([1, 2, 3]));

  const metadataResponse = await worker.fetch(
    new Request("https://example.com/v2/media/med_expiredmedia", {
      headers: dashboardAccessHeaders
    }),
    { ...dashboardAccessEnv, MEDIA_OBJECT_STORE: mediaStore, VTDD_MEDIA_R2: r2 }
  );
  assert.equal(metadataResponse.status, 410);
  const metadataBody = await metadataResponse.json();
  assert.equal(metadataBody.error, "media_expired");
  assert.equal(metadataBody.rawBinaryReturned, false);
  assert.match(metadataBody.ownerMessage, /保存期間が切れました/);

  const downloadResponse = await worker.fetch(
    new Request("https://example.com/v2/media/med_expiredmedia/download", {
      headers: dashboardAccessHeaders
    }),
    { ...dashboardAccessEnv, MEDIA_OBJECT_STORE: mediaStore, VTDD_MEDIA_R2: r2 }
  );
  assert.equal(downloadResponse.status, 410);
  const downloadBody = await downloadResponse.json();
  assert.equal(downloadBody.error, "media_expired");
  assert.equal(r2.objects.size, 1);
});

test("worker filters expired dashboard media from search and rejects expired chat references", async () => {
  const mediaStore = createInMemoryMediaObjectStore();
  const r2 = createInMemoryR2Binding();
  await mediaStore.put({
    id: "med_expiredref",
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 498,
    sourceSurface: "dashboard_butler",
    sourceEventId: "dashboard_owner_message:expired-ref",
    objectKey: "media/marushu/vtdd-v2-p/2026/05/23/med_expiredref/dashboard.png",
    filename: "dashboard.png",
    contentType: "image/png",
    byteSize: 16,
    sha256: "0123456789abcdef",
    visibility: "private",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    expiresAt: "2026-05-30T00:00:00.000Z"
  });

  const searchResponse = await worker.fetch(
    new Request("https://example.com/v2/media/search?repository=marushu%2Fvtdd-v2-p&relatedIssue=498", {
      headers: dashboardAccessHeaders
    }),
    { ...dashboardAccessEnv, MEDIA_OBJECT_STORE: mediaStore, VTDD_MEDIA_R2: r2 }
  );
  assert.equal(searchResponse.status, 200);
  const searchBody = await searchResponse.json();
  assert.equal(searchBody.media.length, 0);

  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: {
        ...dashboardAccessHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "marushu/vtdd-v2-p",
        relatedIssue: 498,
        text: "期限切れ添付を使う",
        mediaReferences: [{ mediaId: "med_expiredref", filename: "dashboard.png", contentType: "image/png" }]
      })
    }),
    { ...dashboardAccessEnv, MEDIA_OBJECT_STORE: mediaStore, VTDD_MEDIA_R2: r2 }
  );
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error, "media_reference_expired");
  assert.match(body.reason, /保存期間が切れました/);
});

test("worker rejects media upload without R2 binding before metadata drift", async () => {
  const form = new FormData();
  form.append("file", createPngBlob(), "dashboard.png");

  const response = await worker.fetch(
    new Request("https://example.com/v2/media/upload", {
      method: "POST",
      headers: dashboardAccessHeaders,
      body: form
    }),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: createInMemoryMediaObjectStore()
    }
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, "media_r2_unavailable");
});

test("worker uploads private dashboard media without repository for ordinary chat", async () => {
  const mediaStore = createInMemoryMediaObjectStore();
  const r2 = createInMemoryR2Binding();
  const form = new FormData();
  form.append("repositoryInput", "未指定");
  form.append("sourceSurface", "dashboard_butler");
  form.append("file", createPngBlob(), "dashboard.png");

  const response = await worker.fetch(
    new Request("https://example.com/v2/media/upload", {
      method: "POST",
      headers: dashboardAccessHeaders,
      body: form
    }),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: mediaStore,
      VTDD_MEDIA_R2: r2
    }
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.media.repository, null);
  assert.equal(body.media.visibility, "private");
  assert.equal(body.media.retentionLabel, "7日後に削除");
  assert.match(body.media.downloadUrl, /^\/v2\/media\/med_/);
  assert.equal(r2.objects.size, 1);
  const [objectKey, stored] = [...r2.objects.entries()][0];
  assert.match(objectKey, /^media\/_dashboard\/unscoped\//);
  assert.equal(stored.options.customMetadata.repository, "unscoped");
});

test("worker creates media D1 schema without multiline exec truncation", async () => {
  const d1 = createStrictMediaD1Binding();
  const r2 = createInMemoryR2Binding();
  const form = new FormData();
  form.append("repositoryInput", "");
  form.append("sourceSurface", "dashboard_butler");
  form.append("file", createPngBlob(), "dashboard.png");

  const response = await worker.fetch(
    new Request("https://example.com/v2/media/upload", {
      method: "POST",
      headers: dashboardAccessHeaders,
      body: form
    }),
    {
      ...dashboardAccessEnv,
      VTDD_MEMORY_D1: d1,
      VTDD_MEDIA_R2: r2
    }
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(d1.rows.size, 1);
  assert.equal(r2.objects.size, 1);
  const createTableStatement = d1.execStatements.find((statement) =>
    String(statement).startsWith("CREATE TABLE IF NOT EXISTS vtdd_media_objects")
  );
  assert.ok(createTableStatement);
  assert.equal(createTableStatement.includes("\n"), false);
  assert.equal(createTableStatement.includes("expires_at TEXT"), true);
  assert.equal(d1.rows.values().next().value.expires_at, body.media.expiresAt);
});

test("worker rejects public or evidence media without resolved repository before R2 put", async () => {
  const mediaStore = createInMemoryMediaObjectStore();
  const r2 = createInMemoryR2Binding();
  const form = new FormData();
  form.append("repositoryInput", "");
  form.append("relatedIssue", "498");
  form.append("visibility", "public_evidence");
  form.append("file", createPngBlob(), "dashboard.png");

  const response = await worker.fetch(
    new Request("https://example.com/v2/media/upload", {
      method: "POST",
      headers: dashboardAccessHeaders,
      body: form
    }),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: mediaStore,
      VTDD_MEDIA_R2: r2
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error, "repository_required");
  assert.equal(r2.objects.size, 0);
});

test("worker rejects spoofed dashboard media content type before R2 put", async () => {
  const mediaStore = createInMemoryMediaObjectStore();
  const r2 = createInMemoryR2Binding();
  const form = new FormData();
  form.append("repositoryInput", "marushu/vtdd-v2-p");
  form.append("relatedIssue", "498");
  form.append("file", new Blob(["not actually a png"], { type: "image/png" }), "dashboard.png");

  const response = await worker.fetch(
    new Request("https://example.com/v2/media/upload", {
      method: "POST",
      headers: dashboardAccessHeaders,
      body: form
    }),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: mediaStore,
      VTDD_MEDIA_R2: r2
    }
  );

  assert.equal(response.status, 415);
  const body = await response.json();
  assert.equal(body.error, "media_content_type_mismatch");
  assert.equal(r2.objects.size, 0);
});

test("worker rejects HTML/script-looking media even when uploaded as octet stream", async () => {
  const mediaStore = createInMemoryMediaObjectStore();
  const r2 = createInMemoryR2Binding();
  const form = new FormData();
  form.append("repositoryInput", "marushu/vtdd-v2-p");
  form.append("relatedIssue", "498");
  form.append("file", new Blob(["<script>alert(1)</script>"], { type: "application/octet-stream" }), "evidence.bin");

  const response = await worker.fetch(
    new Request("https://example.com/v2/media/upload", {
      method: "POST",
      headers: dashboardAccessHeaders,
      body: form
    }),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: mediaStore,
      VTDD_MEDIA_R2: r2
    }
  );

  assert.equal(response.status, 415);
  const body = await response.json();
  assert.equal(body.error, "media_content_type_forbidden");
  assert.equal(r2.objects.size, 0);
});

test("worker rejects unknown octet-stream binary in the first media slice", async () => {
  const mediaStore = createInMemoryMediaObjectStore();
  const r2 = createInMemoryR2Binding();
  const form = new FormData();
  form.append("repositoryInput", "marushu/vtdd-v2-p");
  form.append("relatedIssue", "498");
  form.append("file", new Blob([new Uint8Array([0, 1, 2, 3, 4, 5])], { type: "application/octet-stream" }), "evidence.bin");

  const response = await worker.fetch(
    new Request("https://example.com/v2/media/upload", {
      method: "POST",
      headers: dashboardAccessHeaders,
      body: form
    }),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: mediaStore,
      VTDD_MEDIA_R2: r2
    }
  );

  assert.equal(response.status, 415);
  const body = await response.json();
  assert.equal(body.error, "media_content_type_unsupported");
  assert.equal(r2.objects.size, 0);
});

test("worker rejects strict document media when declared type and filename have no matching signature", async () => {
  const mediaStore = createInMemoryMediaObjectStore();
  const r2 = createInMemoryR2Binding();
  const form = new FormData();
  form.append("repositoryInput", "marushu/vtdd-v2-p");
  form.append("relatedIssue", "498");
  form.append("file", new Blob(["<script>alert(1)</script>"], { type: "application/pdf" }), "evidence.pdf");

  const response = await worker.fetch(
    new Request("https://example.com/v2/media/upload", {
      method: "POST",
      headers: dashboardAccessHeaders,
      body: form
    }),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: mediaStore,
      VTDD_MEDIA_R2: r2
    }
  );

  assert.equal(response.status, 415);
  const body = await response.json();
  assert.equal(body.error, "media_content_type_forbidden");
  assert.equal(r2.objects.size, 0);
});

test("worker cleans up R2 object when media metadata insert fails", async () => {
  const r2 = createInMemoryR2Binding();
  const form = new FormData();
  form.append("repositoryInput", "marushu/vtdd-v2-p");
  form.append("relatedIssue", "498");
  form.append("file", createPngBlob(), "dashboard.png");

  const response = await worker.fetch(
    new Request("https://example.com/v2/media/upload", {
      method: "POST",
      headers: dashboardAccessHeaders,
      body: form
    }),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: {
        async put() {
          throw new Error("d1 unavailable");
        },
        async get() {
          return null;
        }
      },
      VTDD_MEDIA_R2: r2
    }
  );

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error, "media_metadata_insert_failed");
  assert.equal(r2.objects.size, 0);
});

test("worker allows rollback delete only for private dashboard media from an abandoned owner message send", async () => {
  const mediaStore = createInMemoryMediaObjectStore();
  const r2 = createInMemoryR2Binding();
  const form = new FormData();
  form.append("repositoryInput", "marushu/vtdd-v2-p");
  form.append("relatedIssue", "498");
  form.append("sourceSurface", "dashboard_butler");
  form.append("sourceEventId", "dashboard_owner_message:test-rollback");
  form.append("file", createPngBlob(), "dashboard.png");

  const uploadResponse = await worker.fetch(
    new Request("https://example.com/v2/media/upload", {
      method: "POST",
      headers: dashboardAccessHeaders,
      body: form
    }),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: mediaStore,
      VTDD_MEDIA_R2: r2
    }
  );
  assert.equal(uploadResponse.status, 201);
  const uploadBody = await uploadResponse.json();
  assert.equal(r2.objects.size, 1);

  const deleteResponse = await worker.fetch(
    new Request(`https://example.com/v2/media/${uploadBody.media.mediaId}?cleanup=abandoned_send&repository=marushu/vtdd-v2-p&relatedIssue=498&sourceEventId=dashboard_owner_message%3Atest-rollback`, {
      method: "DELETE",
      headers: dashboardAccessHeaders
    }),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: mediaStore,
      VTDD_MEDIA_R2: r2
    }
  );

  assert.equal(deleteResponse.status, 200);
  const deleteBody = await deleteResponse.json();
  assert.equal(deleteBody.authority, "same_send_abandoned_private_media_rollback");
  assert.equal(r2.objects.size, 0);
  assert.equal(await mediaStore.get(uploadBody.media.mediaId), null);
});

test("worker rejects abandoned media rollback without exact source event scope", async () => {
  const mediaStore = createInMemoryMediaObjectStore();
  const r2 = createInMemoryR2Binding();
  await mediaStore.put({
    id: "med_rollbackscope",
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 498,
    sourceSurface: "dashboard_butler",
    sourceEventId: "dashboard_owner_message:test-rollback",
    objectKey: "media/marushu/vtdd-v2-p/2026/05/23/med_rollbackscope/dashboard.png",
    filename: "dashboard.png",
    contentType: "image/png",
    byteSize: 16,
    sha256: "0123456789abcdef",
    visibility: "private",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    expiresAt: "2999-01-01T00:00:00.000Z"
  });
  await r2.put("media/marushu/vtdd-v2-p/2026/05/23/med_rollbackscope/dashboard.png", new Uint8Array([1, 2, 3]));

  const response = await worker.fetch(
    new Request("https://example.com/v2/media/med_rollbackscope?cleanup=abandoned_send&repository=marushu/vtdd-v2-p&relatedIssue=498", {
      method: "DELETE",
      headers: dashboardAccessHeaders
    }),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: mediaStore,
      VTDD_MEDIA_R2: r2
    }
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, "scoped_approval_required");
  assert.equal(r2.objects.size, 1);
  assert.notEqual(await mediaStore.get("med_rollbackscope"), null);
});

test("worker allows rollback delete for private unscoped dashboard media from an abandoned owner message send", async () => {
  const mediaStore = createInMemoryMediaObjectStore();
  const r2 = createInMemoryR2Binding();
  await mediaStore.put({
    id: "med_unscopedrollback",
    repository: null,
    relatedIssue: null,
    sourceSurface: "dashboard_butler",
    sourceEventId: "dashboard_owner_message:unscoped",
    objectKey: "media/_dashboard/unscoped/2026/05/23/med_unscopedrollback/dashboard.png",
    filename: "dashboard.png",
    contentType: "image/png",
    byteSize: 16,
    sha256: "0123456789abcdef",
    visibility: "private",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    expiresAt: "2999-01-01T00:00:00.000Z"
  });
  await r2.put("media/_dashboard/unscoped/2026/05/23/med_unscopedrollback/dashboard.png", new Uint8Array([1, 2, 3]));

  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/media/med_unscopedrollback?cleanup=abandoned_send&sourceEventId=dashboard_owner_message%3Aunscoped",
      {
        method: "DELETE",
        headers: dashboardAccessHeaders
      }
    ),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: mediaStore,
      VTDD_MEDIA_R2: r2
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.authority, "same_send_abandoned_private_media_rollback");
  assert.equal(r2.objects.size, 0);
  assert.equal(await mediaStore.get("med_unscopedrollback"), null);
});

test("worker requires repository filter before media metadata search", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/media/search", {
      headers: dashboardAccessHeaders
    }),
    {
      ...dashboardAccessEnv,
      MEDIA_OBJECT_STORE: createInMemoryMediaObjectStore()
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error, "repository_required");
});

test("worker stores dashboard media references in chat without raw binary", async () => {
  const store = createInMemoryDashboardChatStore();
  const mediaStore = createInMemoryMediaObjectStore();
  await mediaStore.put({
    id: "med_testmedia1234",
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 498,
    sourceSurface: "dashboard_butler",
    objectKey: "media/marushu/vtdd-v2-p/2026/05/23/med_testmedia1234/dashboard.png",
    filename: "dashboard.png",
    contentType: "image/png",
    byteSize: 16,
    sha256: "0123456789abcdef",
    visibility: "private",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    expiresAt: "2999-01-01T00:00:00.000Z"
  });
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: { ...dashboardAccessHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        repository: "marushu/vtdd-v2-p",
        text: "",
        mediaReferences: [
          {
            mediaId: "med_testmedia1234",
            repository: "marushu/vtdd-v2-p",
            relatedIssue: 498,
            filename: "dashboard.png",
            contentType: "image/png",
            byteSize: 16,
            sha256: "0123456789abcdef",
            visibility: "private",
            rawBinary: "fake image bytes"
          }
        ]
      })
    }),
    { ...dashboardAccessEnv, DASHBOARD_CHAT_STORE: store, MEDIA_OBJECT_STORE: mediaStore }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.messages[0].text, "添付を追加しました。");
  assert.equal(body.messages[0].mediaReferences.length, 1);
  assert.equal(body.messages[0].mediaReferences[0].mediaId, "med_testmedia1234");
  assert.equal(body.messages[0].mediaReferences[0].contentType, "image/png");
  assert.equal(body.messages[0].mediaReferences[0].downloadUrl, "/v2/media/med_testmedia1234/download");
  assert.equal(JSON.stringify(body).includes("fake image bytes"), false);
});

test("worker rejects chat media references outside the repository or issue context", async () => {
  const store = createInMemoryDashboardChatStore();
  const mediaStore = createInMemoryMediaObjectStore();
  await mediaStore.put({
    id: "med_wrongissue123",
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 999,
    sourceSurface: "dashboard_butler",
    objectKey: "media/marushu/vtdd-v2-p/2026/05/23/med_wrongissue123/dashboard.png",
    filename: "dashboard.png",
    contentType: "image/png",
    byteSize: 16,
    sha256: "0123456789abcdef",
    visibility: "private",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    expiresAt: "2999-01-01T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: { ...dashboardAccessHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        repository: "marushu/vtdd-v2-p",
        relatedIssue: 498,
        mediaReferences: [{ mediaId: "med_wrongissue123" }]
      })
    }),
    { ...dashboardAccessEnv, DASHBOARD_CHAT_STORE: store, MEDIA_OBJECT_STORE: mediaStore }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error, "media_reference_issue_mismatch");
});

test("worker stores dashboard Butler thread summaries and searches archived context", async () => {
  const store = createInMemoryDashboardChatStore();
  await store.appendMany("dashboard-main-marushu-vtdd-v2-p", [
    {
      role: "owner",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 450,
      status: "sent",
      text: "長いスレッドを分割して検索できるようにして",
      createdAt: "2026-05-20T00:00:00.000Z"
    }
  ]);
  await store.appendMany("dashboard-main-other", [
    {
      role: "owner",
      repository: "marushu/other",
      relatedIssue: 1,
      status: "sent",
      text: "別リポジトリの話",
      createdAt: "2026-05-20T00:00:01.000Z"
    }
  ]);

  const summaryResponse = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/dashboard-main-marushu-vtdd-v2-p/summary", {
      method: "POST",
      headers: { ...dashboardAccessHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        repository: "marushu/vtdd-v2-p",
        relatedIssue: 450,
        summary: "Butler chat は長期スレッドを要約し、古い文脈をアーカイブ検索へ寄せる。",
        decisions: ["直近表示は短く保ち、過去文脈は検索する"],
        openItems: ["LLM 自動仕分けは次スライス"]
      })
    }),
    { ...dashboardAccessEnv, DASHBOARD_CHAT_STORE: store }
  );
  assert.equal(summaryResponse.status, 200);
  const summaryBody = await summaryResponse.json();
  assert.equal(summaryBody.ok, true);
  assert.equal(summaryBody.summary.relatedIssue, 450);

  const threadResponse = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/dashboard-main-marushu-vtdd-v2-p", {
      headers: dashboardAccessHeaders
    }),
    { ...dashboardAccessEnv, DASHBOARD_CHAT_STORE: store }
  );
  assert.equal(threadResponse.status, 200);
  const threadBody = await threadResponse.json();
  assert.equal(threadBody.summary.summary.includes("アーカイブ検索"), true);

  const searchResponse = await worker.fetch(
    new Request(
      "https://example.com/v2/dashboard/chat/search?text=%E3%82%A2%E3%83%BC%E3%82%AB%E3%82%A4%E3%83%96&repository=marushu%2Fvtdd-v2-p&relatedIssue=450",
      { headers: dashboardAccessHeaders }
    ),
    { ...dashboardAccessEnv, DASHBOARD_CHAT_STORE: store }
  );
  assert.equal(searchResponse.status, 200);
  const searchBody = await searchResponse.json();
  assert.equal(searchBody.ok, true);
  assert.equal(searchBody.results.some((result) => result.kind === "summary"), true);
  assert.equal(searchBody.results.every((result) => result.threadId === "dashboard-main-marushu-vtdd-v2-p"), true);
});

test("worker appends dashboard Butler chat turn with dashboard passkey session cookie", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval:dashboard-chat-session",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval:dashboard-chat-session",
      credentialId: "AQIDBA",
      verifiedAt: "2026-05-20T00:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
      scope: {
        actionType: "read",
        highRiskKind: "dashboard_access",
        repositoryInput: "marushu/vtdd-v2-p",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 96,
    tags: ["passkey_grant", "passkey_approval", "verified"],
    createdAt: "2026-05-20T00:00:00.000Z"
  });

  const store = createInMemoryDashboardChatStore();
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: {
        cookie: "vtdd_dashboard_session=approval%3Adashboard-chat-session",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        repository: "marushu/vtdd-v2-p",
        text: "dashboard passkey session から Butler に送る"
      })
    }),
    {
      MEMORY_PROVIDER: provider,
      DASHBOARD_CHAT_STORE: store
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, "owner");
  assert.equal(JSON.stringify(body.messages).includes("旧 `codex exec` 経路は削除済み"), false);
  assert.equal(JSON.stringify(body.messages).includes("Custom GPT Butler"), false);
});

test("worker does not dispatch dashboard chat to the VPS runner queue", async () => {
  const store = createInMemoryDashboardChatStore();
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        repository: "marushu/vtdd-v2-p",
        issueNumber: 450,
        dispatchToVpsRunner: true,
        branch: "codex/issue-450-dashboard-vps-chat",
        text: "VPS Codex CLI とこの dashboard thread で会話したい"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_CHAT_STORE: store,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dashboard_vps",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/issues/450/comments")) {
          return new Response(
            JSON.stringify({
              id: 45001,
              html_url: "https://github.com/marushu/vtdd-v2-p/issues/450#issuecomment-45001"
            }),
            { status: 201, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`unexpected url ${url}`);
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution, null);
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, "owner");
  assert.equal(JSON.stringify(body.messages).includes("旧 `codex exec` 経路は削除済み"), false);
  assert.equal(JSON.stringify(body.messages).includes("Custom GPT Butler"), false);
  assert.equal(calls.length, 0);

  const retrieveResponse = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/dashboard-main-marushu-vtdd-v2-p", {
      headers: dashboardAccessHeaders
    }),
    { ...dashboardAccessEnv, DASHBOARD_CHAT_STORE: store }
  );
  const retrieveBody = await retrieveResponse.json();
  assert.equal(retrieveBody.messages.length, 1);
  assert.equal(JSON.stringify(retrieveBody.messages).includes("旧 `codex exec` 経路は削除済み"), false);
});

test("worker connects VPS privileged maintenance intent from Dashboard Butler chat to helper queue", async () => {
  const store = createInMemoryDashboardChatStore();
  const provider = createInMemoryMemoryProvider();
  const githubCalls = [];
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        repository: "marushu/vtdd-v2-p",
        issueNumber: 637,
        text: "Dashboard Butler から VPS helper queue まで到達できるか確認。root 実行は passkey 境界で止める。"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_CHAT_STORE: store,
      MEMORY_PROVIDER: provider,
      VTDD_DASHBOARD_VPS_MAINTENANCE_HOST: "x85-131-245-163",
      VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR: "/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.status, "approval_required");
  assert.equal(body.execution.runtimeTruth.status, "approval_required");
  assert.equal(body.execution.runtimeTruth.rootExecutionStarted, false);
  assert.equal(body.execution.runtimeTruth.helperQueueReached, false);
  assert.equal(body.messages[1].role, "butler");
  assert.equal(body.messages[1].status, "blocked");
  assert.match(body.messages[1].text, /自然文 intent/);
  assert.match(body.messages[1].text, /approval_required/);
  assert.match(body.messages[1].text, /rootExecutionStarted=false/);
  assert.match(body.messages[1].text, /approval URL/);
  const approvalUrl = new URL(body.execution.approvalOperatorUrl);
  assert.equal(approvalUrl.searchParams.get("dashboardThreadId"), "dashboard-main-marushu-vtdd-v2-p");
  assert.equal(approvalUrl.searchParams.get("vpsProposalId"), body.execution.vpsProposalId);
  assert.doesNotMatch(body.messages[1].text, /app-server 接続 PR/);

  await provider.store({
    id: "approval:dashboard-vps-maintenance-natural",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval:dashboard-vps-maintenance-natural",
      credentialId: "AQIDBA",
      verifiedAt: "2026-05-30T00:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
      scope: body.execution.approvalScope
    },
    metadata: { source: "dashboard-vps-maintenance-natural-test" },
    priority: 96,
    tags: ["passkey_grant", "passkey_approval", "verified"],
    createdAt: "2026-05-30T00:00:00.000Z"
  });

  const approvedResponse = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        repository: "marushu/vtdd-v2-p",
        issueNumber: 637,
        text: "承認済みなので Dashboard Butler から VPS helper queue へ進めて。",
        vpsProposalId: body.execution.vpsProposalId,
        approvalGrantId: "approval:dashboard-vps-maintenance-natural",
        executionId: "issue637-dashboard-natural-chat"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_CHAT_STORE: store,
      MEMORY_PROVIDER: provider,
      VTDD_DASHBOARD_VPS_MAINTENANCE_HOST: "x85-131-245-163",
      VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR: "/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dashboard_vps",
      GITHUB_API_FETCH: async (url, init) => {
        githubCalls.push({ url, init });
        return new Response(
          JSON.stringify({
            id: 63702,
            html_url: "https://github.com/marushu/vtdd-v2-p/issues/637#issuecomment-63702"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(approvedResponse.status, 202);
  const approvedBody = await approvedResponse.json();
  assert.equal(approvedBody.ok, true);
  assert.equal(approvedBody.execution.status, "queued_for_vps_helper_execution");
  assert.equal(approvedBody.execution.queue.dashboardThreadId, "dashboard-main-marushu-vtdd-v2-p");
  assert.equal(approvedBody.execution.runtimeTruth.helperQueueReached, true);
  assert.equal(approvedBody.execution.runtimeTruth.dashboardThreadIdIncluded, true);
  assert.equal(approvedBody.execution.runtimeTruth.rootExecutionStarted, false);
  assert.equal(approvedBody.execution.runtimeTruth.helperExecutionStarted, false);
  assert.equal(approvedBody.messages[1].role, "butler");
  assert.equal(approvedBody.messages[1].status, "sent");
  assert.match(approvedBody.messages[1].text, /自然文 intent/);
  assert.match(approvedBody.messages[1].text, /helper execution queue/);
  assert.match(approvedBody.messages[1].text, /rootExecutionStarted=false/);
  assert.equal(githubCalls.length, 1);
  const queueCommentBody = JSON.parse(githubCalls[0].init.body).body;
  assert.equal(queueCommentBody.includes("vtdd:vps-privileged-maintenance-execution:issue637-dashboard-natural-chat"), true);
  assert.equal(queueCommentBody.includes('"transport": "vps_privileged_maintenance_helper"'), true);
  assert.equal(queueCommentBody.includes('"dashboardThreadId": "dashboard-main-marushu-vtdd-v2-p"'), true);
  assert.equal(queueCommentBody.includes('"handoff"'), true);
});

test("worker maps Dashboard Butler VPS runner status text to the low-risk preset", async () => {
  const store = createInMemoryDashboardChatStore();
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        repository: "marushu/vtdd-v2-p",
        issueNumber: 637,
        vpsOperation: "add",
        capabilityId: "playwright.chromium.deps",
        commandClass: "playwright_install_deps_chromium",
        riskLevel: "high",
        workingDirectories: ["/tmp/owner-chat-workdir"],
        allowedArgs: ["npx playwright install-deps chromium"],
        text: "Dashboard Butler から VPS runner status を確認して。root 実行は passkey 境界で止める。"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_CHAT_STORE: store,
      MEMORY_PROVIDER: provider,
      VTDD_DASHBOARD_VPS_MAINTENANCE_HOST: "x85-131-245-163",
      VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR: "/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.status, "approval_required");
  assert.equal(body.execution.approvalScope.vpsCapabilityId, "systemd.user.runner.status");
  assert.equal(body.execution.approvalScope.vpsOperation, "review");
  assert.equal(body.execution.runtimeTruth.capabilityId, "systemd.user.runner.status");
  assert.equal(body.execution.runtimeTruth.rootExecutionStarted, false);

  const records = await provider.retrieve({ ids: [body.execution.vpsProposalId] });
  const proposalRecord = records[0];
  assert.equal(proposalRecord.content.proposal.capability.commandClass, "systemd_user_runner_status");
  assert.equal(proposalRecord.content.proposal.capability.riskLevel, "low");
  assert.deepEqual(proposalRecord.content.proposal.capability.allowedArgs, [
    "systemctl --user is-active vtdd-vps-runner.timer vtdd-vps-runner.service"
  ]);
});

test("worker reports Dashboard VPS maintenance config blockers before creating a proposal", async () => {
  const store = createInMemoryDashboardChatStore();
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        repository: "marushu/vtdd-v2-p",
        text: "Dashboard Butler から VPS runner status を確認して。root 実行は passkey 境界で止める。"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_CHAT_STORE: store,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.status, "blocked");
  assert.equal(body.execution.runtimeTruth.status, "vps_privileged_maintenance_context_required");
  assert.equal(body.execution.runtimeTruth.dashboardNaturalLanguagePathReached, true);
  assert.equal(body.execution.runtimeTruth.proposalCreated, false);
  assert.deepEqual(body.execution.runtimeTruth.missingContext, ["relatedIssue"]);
  assert.deepEqual(body.execution.runtimeTruth.missingConfiguration, ["host", "workingDirectories"]);
  assert.match(body.messages[1].text, /関連 Issue: 未指定/);
  assert.match(body.messages[1].text, /relatedIssue or issueNumber is required/);
  assert.match(body.messages[1].text, /VTDD_DASHBOARD_VPS_MAINTENANCE_HOST/);
  assert.match(body.messages[1].text, /rootExecutionStarted=false/);

  const records = await provider.retrieve({ type: MemoryRecordType.APPROVAL_LOG, limit: 10 });
  assert.equal(records.length, 0);
});

test("worker uses only Dashboard maintenance runtime config for privileged maintenance proposals", async () => {
  const store = createInMemoryDashboardChatStore();
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        repository: "marushu/vtdd-v2-p",
        issueNumber: 637,
        vpsHost: "owner-chat-host",
        workingDirectory: "/tmp/owner-chat-workdir",
        text: "Dashboard Butler から VPS runner status を確認して。root 実行は passkey 境界で止める。"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_CHAT_STORE: store,
      MEMORY_PROVIDER: provider,
      VTDD_VPS_RUNNER_HOST: "generic-runner-host",
      VTDD_VPS_RUNNER_WORKDIR: "/home/vtdd-runner/generic-runner-workdir",
      VTDD_VPS_MAINTENANCE_HOST: "generic-maintenance-host",
      VTDD_VPS_MAINTENANCE_WORKDIR: "/home/vtdd-runner/generic-maintenance-workdir"
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.execution.status, "blocked");
  assert.equal(body.execution.runtimeTruth.status, "vps_privileged_maintenance_configuration_required");
  assert.deepEqual(body.execution.runtimeTruth.missingConfiguration, ["host", "workingDirectories"]);
  assert.match(body.messages[1].text, /VTDD_DASHBOARD_VPS_MAINTENANCE_HOST/);
  assert.doesNotMatch(
    body.messages[1].text,
    /VTDD_VPS_RUNNER_HOST|VTDD_VPS_RUNNER_WORKDIR|VTDD_VPS_MAINTENANCE_HOST|VTDD_VPS_MAINTENANCE_WORKDIR|owner-chat-host|owner-chat-workdir/
  );

  const records = await provider.retrieve({ type: MemoryRecordType.APPROVAL_LOG, limit: 10 });
  assert.equal(records.length, 0);
});

test("DashboardChatRoom keeps VPS maintenance intent in Worker path when repo and config are missing", async () => {
  const provider = createInMemoryMemoryProvider();
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const room = new DashboardChatRoom(
    {
      storage: createMockDurableObjectStorage(),
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    {
      DASHBOARD_CHAT_STORE: store,
      MEMORY_PROVIDER: provider,
      VTDD_RUNTIME_URL: "https://example.com"
    }
  );

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      threadId: "dashboard-main-unresolved",
      text: "Dashboard Butler から VPS runner status を確認して。root 実行は passkey 境界で止める。"
    })
  );

  assert.equal(bridgeSocket.sent.length, 0);
  const finalBroadcast = JSON.parse(dashboardSocket.sent.at(-1));
  assert.equal(finalBroadcast.type, "thread");
  assert.equal(finalBroadcast.messages.length, 2);
  assert.equal(finalBroadcast.messages[1].role, "butler");
  assert.equal(finalBroadcast.messages[1].status, "blocked");
  assert.match(finalBroadcast.messages[1].text, /対象 repo: 未指定/);
  assert.match(finalBroadcast.messages[1].text, /関連 Issue: 未指定/);
  assert.match(finalBroadcast.messages[1].text, /proposal repository is required/);
  assert.match(finalBroadcast.messages[1].text, /relatedIssue or issueNumber is required/);
  assert.match(finalBroadcast.messages[1].text, /VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR/);

  const records = await provider.retrieve({ type: MemoryRecordType.APPROVAL_LOG, limit: 10 });
  assert.equal(records.length, 0);
});

test("worker allows dashboard passkey session chat without VPS runner handoff", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval:dashboard-vps-session",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval:dashboard-vps-session",
      credentialId: "AQIDBA",
      verifiedAt: "2026-05-20T00:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
      scope: {
        actionType: "read",
        highRiskKind: "dashboard_access",
        repositoryInput: "marushu/vtdd-v2-p",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 96,
    tags: ["passkey_grant", "passkey_approval", "verified"],
    createdAt: "2026-05-20T00:00:00.000Z"
  });
  await provider.store({
    id: "alias_registry:marushu/vtdd-v2-p",
    type: MemoryRecordType.ALIAS_REGISTRY,
    content: {
      canonicalRepo: "marushu/vtdd-v2-p",
      aliases: ["ぶい", "vtdd"]
    },
    metadata: { source: "test" },
    priority: 60,
    tags: ["alias_registry", "marushu/vtdd-v2-p"],
    createdAt: "2026-05-20T00:00:00.000Z"
  });

  const store = createInMemoryDashboardChatStore();
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: {
        cookie: "vtdd_dashboard_session=approval%3Adashboard-vps-session",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        repositoryInput: "ぶい",
        dispatchToVpsRunner: true,
        executorTransport: "vps_runner",
        text: "ぶい #450 の残り Issue と PR を確認して交通整理して"
      })
    }),
    {
      MEMORY_PROVIDER: provider,
      DASHBOARD_CHAT_STORE: store,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dashboard_passkey_vps",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({
            id: 45002,
            html_url: "https://github.com/marushu/vtdd-v2-p/issues/450#issuecomment-45002"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution, null);
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, "owner");
  assert.equal(JSON.stringify(body.messages).includes("app-server 接続 PR"), false);
  assert.equal(JSON.stringify(body.messages).includes("Custom GPT Butler"), false);
  assert.equal(calls.length, 0);
});

test("worker HTTP dashboard nickname requests use non-live fallback instead of alias registry shortcut", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "alias_registry:marushu/vtdd-v2-p",
    type: MemoryRecordType.ALIAS_REGISTRY,
    content: {
      canonicalRepo: "marushu/vtdd-v2-p",
      aliases: ["ぶい", "vtdd"]
    },
    metadata: { source: "test" },
    priority: 60,
    tags: ["alias_registry", "marushu/vtdd-v2-p"],
    createdAt: "2026-05-20T00:00:00.000Z"
  });
  const store = createInMemoryDashboardChatStore();

  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        threadId: "dashboard-main-unresolved",
        dispatchToVpsRunner: true,
        text: "登録済みのニックネーム出して"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      DASHBOARD_CHAT_STORE: store
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution, null);
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, "owner");
  assert.equal(body.messages[0].text, "登録済みのニックネーム出して");
  assert.equal(JSON.stringify(body.messages).includes("登録済みニックネームです。"), false);
  assert.equal(JSON.stringify(body.messages).includes("- marushu/vtdd-v2-p: ぶい, vtdd"), false);
  assert.equal(JSON.stringify(body.messages).includes("未接続の状態で VPS Codex CLI に送ったふりはしません"), false);
});

test("worker stores dashboard chat without repository instead of dispatching handoff", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        threadId: "dashboard-main-unresolved",
        dispatchToVpsRunner: true,
        text: "VPS Codex CLI の返事を確認するテスト。"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_CHAT_STORE: createInMemoryDashboardChatStore()
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution, null);
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, "owner");
  assert.equal(JSON.stringify(body.messages).includes("対象 repo: 未指定"), false);
  assert.equal(JSON.stringify(body.messages).includes("Custom GPT Butler"), false);
});

test("worker rejects unauthenticated dashboard chat VPS runner dispatch", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        repository: "marushu/vtdd-v2-p",
        issueNumber: 450,
        dispatchToVpsRunner: true,
        text: "VPS に渡して"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_CHAT_STORE: createInMemoryDashboardChatStore()
    }
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "dashboard_auth_required");
});

test("worker rejects unauthenticated dashboard chat writes even without VPS dispatch", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        repository: "marushu/vtdd-v2-p",
        text: "public post should not land in dashboard"
      })
    }),
    {
      ...dashboardAccessEnv,
      DASHBOARD_CHAT_STORE: createInMemoryDashboardChatStore()
    }
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "dashboard_auth_required");
});

test("worker requires WebSocket upgrade for dashboard chat live updates", async () => {
  const store = createInMemoryDashboardChatStore();
  const rooms = createMockDashboardChatRoomNamespace();
  await store.appendMany("dashboard-main-marushu-vtdd-v2-p", [
    {
      threadId: "dashboard-main-marushu-vtdd-v2-p",
      role: "runner",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 450,
      status: "replied",
      text: "VPS Codex CLI から dashboard に戻した返信",
      createdAt: "2026-05-20T00:00:00.000Z"
    }
  ]);

  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/dashboard-main-marushu-vtdd-v2-p/ws", {
      headers: dashboardAccessHeaders
    }),
    { ...dashboardAccessEnv, DASHBOARD_CHAT_STORE: store, DASHBOARD_CHAT_ROOMS: rooms.namespace }
  );

  assert.equal(response.status, 426);
  const body = await response.json();
  assert.equal(body.error, "websocket_upgrade_required");
  assert.equal(rooms.calls.length, 0);
});

test("DashboardChatRoom accepts dashboard WebSocket upgrade with request origin attachment", async () => {
  const originalWebSocketPair = globalThis.WebSocketPair;
  const OriginalResponse = globalThis.Response;
  const acceptedSockets = [];
  class MockAcceptedSocket {
    constructor() {
      this.readyState = 1;
      this.sent = [];
      this.attachment = null;
    }
    serializeAttachment(value) {
      this.attachment = value;
    }
    send(message) {
      this.sent.push(String(message));
    }
  }

  globalThis.WebSocketPair = function MockWebSocketPair() {
    return {
      client: new MockAcceptedSocket(),
      server: new MockAcceptedSocket()
    };
  };
  globalThis.Response = class MockUpgradeResponse {
    constructor(body = null, init = {}) {
      this.body = body;
      this.status = init.status ?? 200;
      this.headers = new Headers(init.headers || {});
      this.webSocket = init.webSocket || null;
    }
  };

  try {
    const store = createInMemoryDashboardChatStore();
    const room = new DashboardChatRoom(
      {
        acceptWebSocket(socket) {
          acceptedSockets.push(socket);
        }
      },
      { DASHBOARD_CHAT_STORE: store }
    );

    const response = await room.fetch(
      new Request("https://dashboard.example.test/v2/dashboard/chat/dashboard-main-unresolved/ws", {
        headers: { upgrade: "websocket" }
      })
    );

    assert.equal(response.status, 101);
    assert.equal(acceptedSockets.length, 1);
    assert.deepEqual(acceptedSockets[0].attachment, {
      role: "dashboard",
      threadId: "dashboard-main-unresolved",
      origin: "https://dashboard.example.test"
    });
    const initialThread = JSON.parse(acceptedSockets[0].sent[0]);
    assert.equal(initialThread.type, "thread");
    assert.equal(initialThread.ok, true);
  } finally {
    if (originalWebSocketPair === undefined) {
      delete globalThis.WebSocketPair;
    } else {
      globalThis.WebSocketPair = originalWebSocketPair;
    }
    globalThis.Response = OriginalResponse;
  }
});

test("worker no longer exposes the dashboard VPS runner WebSocket push channel", async () => {
  const rooms = createMockDashboardChatRoomNamespace();
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/vps-runner/ws?threadId=dashboard-main-marushu-vtdd-v2-p", {
      headers: gatewayAuthHeaders
    }),
    { ...gatewayAuthEnv, DASHBOARD_CHAT_ROOMS: rooms.namespace }
  );

  assert.equal(response.status, 404);
  assert.equal(rooms.calls.length, 0);
});

test("worker requires WebSocket upgrade for dashboard app-server bridge", async () => {
  const rooms = createMockDashboardChatRoomNamespace();
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/app-server/ws?threadId=dashboard-main-marushu-vtdd-v2-p", {
      headers: gatewayAuthHeaders
    }),
    { ...gatewayAuthEnv, DASHBOARD_CHAT_ROOMS: rooms.namespace }
  );

  assert.equal(response.status, 426);
  const body = await response.json();
  assert.equal(body.error, "websocket_upgrade_required");
  assert.equal(rooms.calls.length, 0);
});

test("worker accepts dashboard app-server bridge bearer token through WebSocket subprotocol", async () => {
  const rooms = createMockDashboardChatRoomNamespace();
  const tokenProtocol = `vtdd-bearer.${Buffer.from("test-token", "utf8").toString("base64url")}`;
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/app-server/ws?threadId=dashboard-main-marushu-vtdd-v2-p", {
      headers: {
        "sec-websocket-protocol": `vtdd-dashboard-bridge, ${tokenProtocol}`
      }
    }),
    { ...gatewayAuthEnv, DASHBOARD_CHAT_ROOMS: rooms.namespace }
  );

  assert.equal(response.status, 426);
  const body = await response.json();
  assert.equal(body.error, "websocket_upgrade_required");
});

test("DashboardChatRoom stores owner messages without pushing a VPS runner job", async () => {
  const provider = createInMemoryMemoryProvider();
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const runnerSocket = createMockSocket("vps_runner", "dashboard-main-unresolved");
  const room = new DashboardChatRoom(
    {
      getWebSockets() {
        return [dashboardSocket, runnerSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store, MEMORY_PROVIDER: provider }
  );

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      threadId: "dashboard-main-unresolved",
      text: "今日は何月何日？日本時間を答えて"
    })
  );

  assert.equal(runnerSocket.sent.length, 0);
  assert.equal(dashboardSocket.sent.length, 3);
  const broadcast = JSON.parse(dashboardSocket.sent[0]);
  assert.equal(broadcast.messages.length, 1);
  assert.equal(broadcast.messages[0].role, "owner");
  assert.equal(broadcast.messages[0].text, "今日は何月何日？日本時間を答えて");
  assert.equal(JSON.stringify(broadcast.messages).includes("旧 `codex exec` 経路は削除済み"), false);
  const ack = JSON.parse(dashboardSocket.sent[1]);
  assert.equal(ack.type, "owner_message_accepted");
  assert.equal(ack.ok, true);
  const reconnectStatus = JSON.parse(dashboardSocket.sent[2]);
  assert.equal(reconnectStatus.type, "transient_status");
  assert.equal(reconnectStatus.status, "pending_app_server_bridge");
  assert.match(reconnectStatus.text, /送信は保存済みです/);
});

test("DashboardChatRoom replays pending WebSocket owner messages when app-server bridge reconnects", async () => {
  const provider = createInMemoryMemoryProvider();
  const store = createInMemoryDashboardChatStore();
  const storage = createMockDurableObjectStorage();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const room = new DashboardChatRoom(
    {
      storage,
      getWebSockets() {
        return [dashboardSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store, MEMORY_PROVIDER: provider }
  );

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      threadId: "dashboard-main-unresolved",
      clientMessageId: "dashboard_owner_message:http-resume-1",
      text: "WebSocket で保持した後、bridge 復帰で同じ thread に流す"
    })
  );

  const pendingKey = "pending_app_server_owner_messages:dashboard-main-unresolved";
  assert.equal(storage.values.get(pendingKey).length, 1);
  assert.equal(bridgeSocket.sent.length, 0);

  const drainResult = await room.drainPendingAppServerOwnerMessages({
    threadId: "dashboard-main-unresolved",
    bridgeSocket
  });

  assert.equal(drainResult.ok, true);
  assert.equal(drainResult.drained, 1);
  assert.deepEqual(storage.values.get(pendingKey), []);
  assert.equal(bridgeSocket.sent.length, 1);
  const turnRequest = JSON.parse(bridgeSocket.sent[0]);
  assert.equal(turnRequest.type, "app_server_turn_requested");
  assert.equal(turnRequest.threadId, "dashboard-main-unresolved");
  assert.equal(turnRequest.messageId, "dashboard_owner_message:http-resume-1");
  assert.equal(turnRequest.text, "WebSocket で保持した後、bridge 復帰で同じ thread に流す");
  assert.equal(turnRequest.appServer.startThreadMethod, "thread/start");
  const reconnectStatus = dashboardSocket.sent.map((message) => JSON.parse(message)).at(-1);
  assert.equal(reconnectStatus.type, "transient_status");
  assert.equal(reconnectStatus.status, "thinking");
  assert.match(reconnectStatus.text, /接続しました/);
});

test("DashboardChatRoom sends ordinary owner turns to connected app-server bridge without repository resolution", async () => {
  const provider = createInMemoryMemoryProvider();
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const storage = createMockDurableObjectStorage();
  const room = new DashboardChatRoom(
    {
      storage,
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store, MEMORY_PROVIDER: provider }
  );

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      threadId: "dashboard-main-unresolved",
      text: "今日は何月何日？日本時間を答えて"
    })
  );

  assert.equal(bridgeSocket.sent.length, 1);
  const turnRequest = JSON.parse(bridgeSocket.sent[0]);
  assert.equal(turnRequest.type, "app_server_turn_requested");
  assert.equal(turnRequest.threadId, "dashboard-main-unresolved");
  assert.equal(turnRequest.repository, null);
  assert.equal(turnRequest.codexThreadId, null);
  assert.equal(turnRequest.appServer.startThreadMethod, "thread/start");
  assert.equal(turnRequest.appServer.turnMethod, "turn/start");
  assert.equal(turnRequest.authority.ordinaryConversationAllowed, true);
  assert.equal(turnRequest.trafficControl.status, "未確認");
  assert.equal(turnRequest.trafficControl.currentSurface, "dashboard_butler");
  assert.match(turnRequest.trafficControl.reason, /repository is required/);

  assert.equal(dashboardSocket.sent.length, 3);
  const broadcast = JSON.parse(dashboardSocket.sent[0]);
  assert.equal(broadcast.messages.length, 1);
  assert.equal(broadcast.messages[0].role, "owner");
  assert.equal(broadcast.messages[0].text, "今日は何月何日？日本時間を答えて");
  const ack = JSON.parse(dashboardSocket.sent[1]);
  assert.equal(ack.type, "owner_message_accepted");
  assert.equal(ack.ok, true);
  const status = JSON.parse(dashboardSocket.sent[2]);
  assert.equal(status.type, "transient_status");
  assert.equal(status.status, "thinking");
  assert.equal(status.text, "app-server bridge の返信を待っています");
});

test("DashboardChatRoom routes VPS maintenance owner turns to Worker proposal before app-server bridge", async () => {
  const provider = createInMemoryMemoryProvider();
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-marushu-vtdd-v2-p");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-marushu-vtdd-v2-p");
  const room = new DashboardChatRoom(
    {
      storage: createMockDurableObjectStorage(),
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    {
      DASHBOARD_CHAT_STORE: store,
      MEMORY_PROVIDER: provider,
      VTDD_RUNTIME_URL: "https://example.com",
      VTDD_DASHBOARD_VPS_MAINTENANCE_HOST: "x85-131-245-163",
      VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR: "/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"
    }
  );

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      threadId: "dashboard-main-marushu-vtdd-v2-p",
      repository: "marushu/vtdd-v2-p",
      issueNumber: 637,
      text: "Dashboard Butler から VPS runner status を確認して。root 実行は passkey 境界で止める。"
    })
  );

  assert.equal(bridgeSocket.sent.length, 0);
  const ack = JSON.parse(dashboardSocket.sent[1]);
  assert.equal(ack.type, "owner_message_accepted");
  assert.equal(ack.ok, true);
  const finalBroadcast = JSON.parse(dashboardSocket.sent.at(-1));
  assert.equal(finalBroadcast.type, "thread");
  assert.equal(finalBroadcast.messages.length, 2);
  assert.equal(finalBroadcast.messages[0].role, "owner");
  assert.equal(finalBroadcast.messages[1].role, "butler");
  assert.equal(finalBroadcast.messages[1].status, "blocked");
  assert.match(finalBroadcast.messages[1].text, /approval_required/);
  assert.match(finalBroadcast.messages[1].text, /systemd\.user\.runner\.status|approval URL/);

  const records = await provider.retrieve({ type: MemoryRecordType.APPROVAL_LOG, limit: 10 });
  const proposalRecord = records.find((record) => record.content?.kind === "vps_privileged_maintenance_approval_proposal");
  assert.equal(proposalRecord.content.proposal.capability.id, "systemd.user.runner.status");
  assert.equal(proposalRecord.content.proposal.capability.riskLevel, "low");
});

test("DashboardChatRoom uses WebSocket request origin for VPS approval URLs", async () => {
  const provider = createInMemoryMemoryProvider();
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-e2e-637-origin");
  const room = new DashboardChatRoom(
    {
      storage: createMockDurableObjectStorage(),
      getWebSockets() {
        return [dashboardSocket];
      }
    },
    {
      DASHBOARD_CHAT_STORE: store,
      MEMORY_PROVIDER: provider,
      VTDD_DASHBOARD_VPS_MAINTENANCE_HOST: "x85-131-245-163",
      VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR: "/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"
    }
  );

  await room.handleSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      repository: "marushu/vtdd-v2-p",
      issueNumber: 637,
      text: "Dashboard Butler から VPS runner status を確認して。root 実行は passkey 境界で止める。"
    }),
    {
      role: "dashboard",
      threadId: "dashboard-e2e-637-origin",
      origin: "https://vtdd-v2-mvp.polished-tree-da7c.workers.dev"
    }
  );

  const finalBroadcast = dashboardSocket.sent
    .map((message) => JSON.parse(message))
    .findLast((message) => message.type === "thread");
  const butlerMessage = finalBroadcast.messages.find((message) => message.role === "butler");
  assert.match(
    butlerMessage.text,
    /https:\/\/vtdd-v2-mvp\.polished-tree-da7c\.workers\.dev\/v2\/approval\/passkey\/operator/
  );
  assert.doesNotMatch(butlerMessage.text, /dashboard-butler\.local/);
  assert.match(butlerMessage.text, /dashboardThreadId=dashboard-e2e-637-origin/);
});

test("DashboardChatRoom routes VPS maintenance owner turns without an app-server bridge socket", async () => {
  const provider = createInMemoryMemoryProvider();
  const store = createInMemoryDashboardChatStore();
  const storage = createMockDurableObjectStorage();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-e2e-637-post697");
  const room = new DashboardChatRoom(
    {
      storage,
      getWebSockets() {
        return [dashboardSocket];
      }
    },
    {
      DASHBOARD_CHAT_STORE: store,
      MEMORY_PROVIDER: provider,
      VTDD_RUNTIME_URL: "https://example.com",
      VTDD_DASHBOARD_VPS_MAINTENANCE_HOST: "x85-131-245-163",
      VTDD_DASHBOARD_VPS_MAINTENANCE_WORKDIR: "/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"
    }
  );

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      threadId: "dashboard-e2e-637-post697",
      repository: "marushu/vtdd-v2-p",
      issueNumber: 637,
      text: "Dashboard Butler から VPS runner status を確認して。root 実行は passkey 境界で止める。"
    })
  );

  assert.equal(storage.values.has("pending_app_server_owner_messages:dashboard-e2e-637-post697"), false);
  const ack = JSON.parse(dashboardSocket.sent.at(-1));
  assert.equal(ack.type, "owner_message_accepted");
  assert.equal(ack.ok, true);
  const finalBroadcast = dashboardSocket.sent.map((message) => JSON.parse(message)).findLast((message) => message.type === "thread");
  assert.equal(finalBroadcast.messages.length, 2);
  assert.equal(finalBroadcast.messages[0].role, "owner");
  assert.equal(finalBroadcast.messages[1].role, "butler");
  assert.equal(finalBroadcast.messages[1].status, "blocked");
  assert.match(finalBroadcast.messages[1].text, /approval_required/);
  assert.match(finalBroadcast.messages[1].text, /systemd\.user\.runner\.status|approval URL/);

  const records = await provider.retrieve({ type: MemoryRecordType.APPROVAL_LOG, limit: 10 });
  const proposalRecord = records.find((record) => record.content?.kind === "vps_privileged_maintenance_approval_proposal");
  assert.equal(proposalRecord.content.proposal.capability.id, "systemd.user.runner.status");
});

test("DashboardChatRoom sends runner wakeup requests only to connected app-server bridge", async () => {
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-marushu-vtdd-v2-p");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-marushu-vtdd-v2-p");
  const room = new DashboardChatRoom(
    {
      storage: createMockDurableObjectStorage(),
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: createInMemoryDashboardChatStore() }
  );

  const response = await room.fetch(
    new Request("https://dashboard-room.local/runner-wakeup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        executionId: "remote-codex-issue717",
        repository: "marushu/vtdd-v2-p",
        issueNumber: 717,
        queueCommentUrl: "https://github.com/marushu/vtdd-v2-p/issues/717#issuecomment-1"
      })
    })
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.wakeup.status, "requested");
  assert.equal(body.wakeup.attempted, true);
  assert.equal(body.wakeup.fallback, "vtdd-vps-runner.timer");
  assert.equal(dashboardSocket.sent.length, 0);
  assert.equal(bridgeSocket.sent.length, 1);
  const wakeup = JSON.parse(bridgeSocket.sent[0]);
  assert.equal(wakeup.type, "runner_wakeup_requested");
  assert.equal(wakeup.threadId, "dashboard-main-marushu-vtdd-v2-p");
  assert.equal(wakeup.executionId, "remote-codex-issue717");
  assert.equal(wakeup.repository, "marushu/vtdd-v2-p");
  assert.equal(wakeup.issueNumber, 717);
  assert.equal(wakeup.queueCommentUrl, "https://github.com/marushu/vtdd-v2-p/issues/717#issuecomment-1");
});

test("DashboardChatRoom attaches execution queue preflight to repository app-server turns", async () => {
  const provider = createInMemoryMemoryProvider();
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-marushu-vtdd-v2-p");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-marushu-vtdd-v2-p");
  const room = new DashboardChatRoom(
    {
      storage: createMockDurableObjectStorage(),
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    {
      DASHBOARD_CHAT_STORE: store,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dashboard_preflight",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/docs/setup/known-good.json")) {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }
        if (parsed.pathname.endsWith("/issues/609")) {
          return new Response(
            JSON.stringify({
              number: 609,
              title: "Dashboard Butler traffic-control preflight",
              body: "Intent: expose execution queue truth to Dashboard Butler.",
              state: "open",
              html_url: "https://github.com/marushu/vtdd-v2-p/issues/609",
              user: { login: "marushu" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (parsed.pathname.endsWith("/issues")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        if (parsed.pathname.includes("/contents/")) {
          const decodedPath = decodeURIComponent(
            parsed.pathname.split("/contents/")[1] || ""
          );
          const sourceContent = {
            "AGENTS.md": "## Butler-First Operating Principle\nVTDD is iPhone/iPad-first.",
            "docs/butler/thread-independent-startup-contract.md":
              "threadLocalAssumptionsPromoted=false",
            "docs/butler/execution-queue-contract.md":
              "Owner input is a queue update event before implementation.\n`EMERGENCY` `ROOT` `NEXT` `QUEUE` `EVIDENCE` `QUESTION`",
            "docs/mvp/active-issue-execution-queue.md": [
              "# Active Issue Execution Queue",
              "## Now",
              "- Issue #590: app-server turn timeout must become recoverable.",
              "## Next",
              "- Issue #579: reconnect/auth recovery follows timeout recovery.",
              "## Root Blockers",
              "- Issue #450: Dashboard Butler live runtime remains central.",
              "## Evidence Gaps",
              "- Issue #609: live Dashboard Butler chat preflight evidence is pending.",
              "## Blocked",
              "- Issue #355: deploy requires passkey approval.",
              "## Queue",
              "- Issue #599: Japanese-first titles remain active.",
              "## Questions",
              "- Issue #595: runtime auto-classification remains incomplete."
            ].join("\n"),
            "docs/butler/capability-matrix.md": "Startup Surface Dependency Reading",
            "docs/setup/custom-gpt-instructions.md": "vtddStartupPreflight",
            "docs/setup/custom-gpt-actions-openapi.yaml":
              "paths:\n  /v2/retrieve/startup-preflight:\n    get:\n      operationId: vtddStartupPreflight"
          };
          const content = sourceContent[decodedPath];
          if (!content) {
            return new Response(JSON.stringify({ message: "Not Found" }), {
              status: 404,
              headers: { "content-type": "application/json" }
            });
          }
          return new Response(
            JSON.stringify({
              path: decodedPath,
              type: "file",
              sha: `${decodedPath.replace(/[^a-z0-9]/gi, "-")}-sha`,
              html_url: `https://github.com/marushu/vtdd-v2-p/blob/main/${decodedPath}`,
              encoding: "base64",
              content: Buffer.from(content, "utf8").toString("base64")
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`unexpected GitHub API url: ${parsed.pathname}`);
      }
    }
  );

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      threadId: "dashboard-main-marushu-vtdd-v2-p",
      repository: "marushu/vtdd-v2-p",
      issueNumber: 609,
      text: "Dashboard Butler の交通整理をして"
    })
  );

  const turnRequest = JSON.parse(bridgeSocket.sent[0]);
  assert.equal(turnRequest.type, "app_server_turn_requested");
  assert.equal(turnRequest.repository, "marushu/vtdd-v2-p");
  assert.equal(turnRequest.relatedIssue, 609);
  assert.equal(turnRequest.trafficControl.status, "read");
  assert.equal(turnRequest.trafficControl.currentSurface, "dashboard_butler");
  assert.equal(
    turnRequest.trafficControl.currentNow,
    "Issue #590: app-server turn timeout must become recoverable."
  );
  assert.equal(
    turnRequest.trafficControl.sectionSummaries["Root Blockers"].firstBullet,
    "Issue #450: Dashboard Butler live runtime remains central."
  );
  assert.match(turnRequest.trafficControl.ownerFacingSummary, /Issue #590/);
  assert.equal(turnRequest.trafficControl.authorityBoundary, "read_only_preflight");
});

test("DashboardChatRoom broadcasts thread truth before owner ack for ack-drop recovery", async () => {
  const provider = createInMemoryMemoryProvider();
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const room = new DashboardChatRoom(
    {
      storage: createMockDurableObjectStorage(),
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store, MEMORY_PROVIDER: provider }
  );

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      threadId: "dashboard-main-unresolved",
      clientMessageId: "dashboard_owner_message:ack-drop-1",
      text: "ACK が落ちても thread truth で解除できる"
    })
  );

  const sentTypes = dashboardSocket.sent.map((message) => JSON.parse(message).type);
  assert.deepEqual(sentTypes, ["thread", "owner_message_accepted", "transient_status"]);
  const threadBroadcast = JSON.parse(dashboardSocket.sent[0]);
  assert.equal(threadBroadcast.ok, true);
  assert.equal(threadBroadcast.messages.length, 1);
  assert.equal(threadBroadcast.messages[0].role, "owner");
  assert.equal(threadBroadcast.messages[0].messageId, "dashboard_owner_message:ack-drop-1");
  assert.equal(threadBroadcast.messages[0].text, "ACK が落ちても thread truth で解除できる");
  const ack = JSON.parse(dashboardSocket.sent[1]);
  assert.equal(ack.type, "owner_message_accepted");
  assert.equal(ack.clientMessageId, "dashboard_owner_message:ack-drop-1");
});

test("DashboardChatRoom accepts ten consecutive owner turns without dropping ack or bridge dispatch", async () => {
  const provider = createInMemoryMemoryProvider();
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const storage = createMockDurableObjectStorage();
  const room = new DashboardChatRoom(
    {
      storage,
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store, MEMORY_PROVIDER: provider }
  );

  for (let index = 1; index <= 10; index += 1) {
    await room.webSocketMessage(
      dashboardSocket,
      JSON.stringify({
        type: "owner_message",
        threadId: "dashboard-main-unresolved",
        clientMessageId: `dashboard_owner_message:ten-${index}`,
        text: `連続投稿 ${index}`
      })
    );
  }

  const stored = await store.listThread("dashboard-main-unresolved");
  assert.equal(stored.filter((message) => message.role === "owner").length, 10);
  assert.deepEqual(
    stored.filter((message) => message.role === "owner").map((message) => message.text),
    Array.from({ length: 10 }, (_, index) => `連続投稿 ${index + 1}`)
  );
  assert.equal(bridgeSocket.sent.length, 10);
  assert.deepEqual(
    bridgeSocket.sent.map((message) => JSON.parse(message).messageId),
    Array.from({ length: 10 }, (_, index) => `dashboard_owner_message:ten-${index + 1}`)
  );
  const acknowledgements = dashboardSocket.sent
    .map((message) => JSON.parse(message))
    .filter((message) => message.type === "owner_message_accepted");
  assert.equal(acknowledgements.length, 10);
  assert.equal(acknowledgements.every((message) => message.ok === true), true);
  assert.equal(dashboardSocket.sent.some((message) => JSON.parse(message).type === "error"), false);
});

test("DashboardChatRoom sends each owner turn to only one app-server bridge for a thread", async () => {
  const provider = createInMemoryMemoryProvider();
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const primaryBridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const duplicateBridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const room = new DashboardChatRoom(
    {
      getWebSockets() {
        return [dashboardSocket, primaryBridgeSocket, duplicateBridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store, MEMORY_PROVIDER: provider }
  );

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      threadId: "dashboard-main-unresolved",
      text: "重複実行しない？"
    })
  );

  assert.equal(primaryBridgeSocket.sent.length, 1);
  assert.equal(duplicateBridgeSocket.sent.length, 0);
  assert.equal(JSON.parse(primaryBridgeSocket.sent[0]).type, "app_server_turn_requested");
});

test("DashboardChatRoom dedupes retried owner sends by client message id", async () => {
  const provider = createInMemoryMemoryProvider();
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const storage = createMockDurableObjectStorage();
  const room = new DashboardChatRoom(
    {
      storage,
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store, MEMORY_PROVIDER: provider }
  );
  const payload = JSON.stringify({
    type: "owner_message",
    threadId: "dashboard-main-unresolved",
    clientMessageId: "dashboard_owner_message:retry-1",
    text: "再送しても二重実行しない？"
  });

  await room.webSocketMessage(dashboardSocket, payload);
  await room.webSocketMessage(dashboardSocket, payload);

  assert.equal(bridgeSocket.sent.length, 1);
  const stored = await store.listThread("dashboard-main-unresolved");
  assert.equal(stored.filter((message) => message.role === "owner").length, 1);
  assert.equal(stored[0].messageId, "dashboard_owner_message:retry-1");
  const acknowledgements = dashboardSocket.sent
    .map((message) => JSON.parse(message))
    .filter((message) => message.type === "owner_message_accepted");
  assert.equal(acknowledgements.length, 2);
  assert.equal(acknowledgements[1].duplicate, true);
});

test("DashboardChatRoom maps app-server replies back into the dashboard thread", async () => {
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const storage = createMockDurableObjectStorage();
  const room = new DashboardChatRoom(
    {
      storage,
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store }
  );

  await room.webSocketMessage(
    bridgeSocket,
    JSON.stringify({
      type: "app_server_reply",
      threadId: "dashboard-main-unresolved",
      codexThreadId: "codex-thread-450",
      text: "今日は日本時間で 2026年5月22日です。"
    })
  );

  assert.equal(storage.values.get("app_server_thread:dashboard-main-unresolved").codexThreadId, "codex-thread-450");
  assert.equal(bridgeSocket.sent.length, 0);
  assert.equal(dashboardSocket.sent.length, 2);
  const status = JSON.parse(dashboardSocket.sent[0]);
  assert.equal(status.type, "transient_status");
  assert.equal(status.status, "replied");
  assert.equal(status.text, "Dashboard thread 接続済み。");
  const broadcast = JSON.parse(dashboardSocket.sent[1]);
  assert.equal(broadcast.type, "thread");
  assert.equal(broadcast.messages.length, 1);
  assert.equal(broadcast.messages[0].role, "butler");
  assert.equal(broadcast.messages[0].status, "replied");
  assert.equal(broadcast.messages[0].text, "今日は日本時間で 2026年5月22日です。");
});

test("DashboardChatRoom does not persist app-server reply deltas as chat messages", async () => {
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const storage = createMockDurableObjectStorage();
  const room = new DashboardChatRoom(
    {
      storage,
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store }
  );

  await room.webSocketMessage(
    bridgeSocket,
    JSON.stringify({
      type: "app_server_reply_delta",
      threadId: "dashboard-main-unresolved",
      codexThreadId: "codex-thread-450",
      delta: "日本"
    })
  );

  assert.equal(storage.values.get("app_server_thread:dashboard-main-unresolved").codexThreadId, "codex-thread-450");
  assert.equal((await store.listThread("dashboard-main-unresolved")).length, 0);
  assert.equal(dashboardSocket.sent.length, 1);
  const transientDelta = JSON.parse(dashboardSocket.sent[0]);
  assert.equal(transientDelta.type, "transient_status");
  assert.equal(transientDelta.status, "thinking");
  assert.equal(transientDelta.text, "日本");

  await room.webSocketMessage(
    bridgeSocket,
    JSON.stringify({
      type: "app_server_reply",
      threadId: "dashboard-main-unresolved",
      codexThreadId: "codex-thread-450",
      text: "日本時間では、今日は 05月22日 20時09分です。"
    })
  );

  const stored = await store.listThread("dashboard-main-unresolved");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].role, "butler");
  assert.equal(stored[0].status, "replied");
  assert.equal(stored[0].text, "日本時間では、今日は 05月22日 20時09分です。");
});

test("DashboardChatRoom persists app-server timeout as recoverable Japanese thread message", async () => {
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const room = new DashboardChatRoom(
    {
      storage: createMockDurableObjectStorage(),
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store }
  );

  await room.webSocketMessage(
    bridgeSocket,
    JSON.stringify({
      type: "app_server_turn_failed",
      status: "timeout",
      threadId: "dashboard-main-unresolved",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 590,
      text: "codex app-server turn timed out before completion"
    })
  );

  const stored = await store.listThread("dashboard-main-unresolved");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].role, "system");
  assert.equal(stored[0].status, "stalled");
  assert.equal(stored[0].repository, "marushu/vtdd-v2-p");
  assert.equal(stored[0].relatedIssue, 590);
  assert.match(stored[0].text, /応答確認が長引いています/);
  assert.match(stored[0].text, /入力と文脈は Dashboard thread に保存済み/);
  assert.match(stored[0].text, /補足やキャンセル指示/);
  assert.match(stored[0].text, /遅れて返信が届いた場合/);
  assert.doesNotMatch(stored[0].text, /timed out before completion/);

  const broadcast = dashboardSocket.sent.map((message) => JSON.parse(message)).find((message) => message.type === "thread");
  assert.ok(broadcast);
  assert.equal(broadcast.messages[0].text, stored[0].text);

  const failedStatus = dashboardSocket.sent.map((message) => JSON.parse(message)).find((message) => message.type === "transient_status");
  assert.ok(failedStatus);
  assert.equal(failedStatus.status, "stalled");
  assert.equal(failedStatus.text, "再接続と状態確認を続けています。入力と文脈は保持しています。");
});

test("DashboardChatRoom dedupes repeated app-server stalled recovery messages", async () => {
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const room = new DashboardChatRoom(
    {
      storage: createMockDurableObjectStorage(),
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store }
  );
  const stalledEvent = {
    type: "app_server_turn_failed",
    status: "timeout",
    threadId: "dashboard-main-unresolved",
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 590,
    text: "codex app-server turn timed out before completion"
  };

  await room.webSocketMessage(bridgeSocket, JSON.stringify(stalledEvent));
  await room.webSocketMessage(bridgeSocket, JSON.stringify(stalledEvent));

  const stored = await store.listThread("dashboard-main-unresolved");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].role, "system");
  assert.equal(stored[0].status, "stalled");
  assert.match(stored[0].text, /応答確認が長引いています/);

  const sentPayloads = dashboardSocket.sent.map((message) => JSON.parse(message));
  const threadBroadcasts = sentPayloads.filter((message) => message.type === "thread");
  assert.equal(threadBroadcasts.length, 1);
  assert.equal(threadBroadcasts[0].messages.length, 1);
  const transientStatuses = sentPayloads.filter((message) => message.type === "transient_status");
  assert.equal(transientStatuses.length, 2);
  assert.deepEqual(
    transientStatuses.map((message) => message.text),
    [
      "再接続と状態確認を続けています。入力と文脈は保持しています。",
      "再接続と状態確認を続けています。入力と文脈は保持しています。"
    ]
  );
});

test("DashboardChatRoom sends app-server thinking status as transient UI state", async () => {
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const storage = createMockDurableObjectStorage();
  const room = new DashboardChatRoom(
    {
      storage,
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store }
  );

  await room.webSocketMessage(
    bridgeSocket,
    JSON.stringify({
      type: "app_server_status",
      status: "thinking",
      threadId: "dashboard-main-unresolved",
      codexThreadId: "codex-thread-450",
      text: "codex app-server が応答を生成しています。"
    })
  );

  assert.equal(storage.values.get("app_server_thread:dashboard-main-unresolved").codexThreadId, "codex-thread-450");
  assert.equal((await store.listThread("dashboard-main-unresolved")).length, 0);
  assert.equal(dashboardSocket.sent.length, 1);
  const status = JSON.parse(dashboardSocket.sent[0]);
  assert.equal(status.type, "transient_status");
  assert.equal(status.status, "thinking");
  assert.equal(status.text, "codex app-server が応答を生成しています。");
});

test("DashboardChatRoom keeps generic opt-in app-server progress transient-only", async () => {
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const room = new DashboardChatRoom(
    {
      storage: createMockDurableObjectStorage(),
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store }
  );

  await room.webSocketMessage(
    bridgeSocket,
    JSON.stringify({
      type: "app_server_status",
      status: "thinking",
      stage: "planning",
      persistProgress: true,
      threadId: "dashboard-main-unresolved",
      codexThreadId: "codex-thread-450",
      repository: "marushu/vtdd-v2-p",
      relatedIssue: 590,
      text: "raw plan event"
    })
  );

  const stored = await store.listThread("dashboard-main-unresolved");
  assert.equal(stored.length, 0);
  const sentPayloads = dashboardSocket.sent.map((message) => JSON.parse(message));
  assert.equal(sentPayloads[0].type, "transient_status");
  assert.equal(sentPayloads[0].text, "方針を整理しています。");
  assert.equal(sentPayloads.some((message) => message.type === "thread"), false);
});

test("DashboardChatRoom keeps generic app-server progress stages transient-only without bridge opt-in flag", async () => {
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const room = new DashboardChatRoom(
    {
      storage: createMockDurableObjectStorage(),
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store }
  );

  await room.webSocketMessage(
    bridgeSocket,
    JSON.stringify({
      type: "app_server_status",
      status: "thinking",
      stage: "file_change",
      threadId: "dashboard-main-unresolved",
      codexThreadId: "codex-thread-450",
      text: "raw diff detail that must not be persisted"
    })
  );

  const stored = await store.listThread("dashboard-main-unresolved");
  assert.equal(stored.length, 0);
  const sentPayloads = dashboardSocket.sent.map((message) => JSON.parse(message));
  assert.equal(sentPayloads[0].type, "transient_status");
  assert.equal(sentPayloads[0].text, "ファイル変更を確認しています。");
  assert.equal(sentPayloads.some((message) => message.type === "thread"), false);
});

test("DashboardChatRoom does not append repeated generic app-server progress checkpoints", async () => {
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const room = new DashboardChatRoom(
    {
      storage: createMockDurableObjectStorage(),
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store }
  );
  const progressEvent = {
    type: "app_server_status",
    status: "thinking",
    stage: "command",
    persistProgress: true,
    threadId: "dashboard-main-unresolved",
    codexThreadId: "codex-thread-450",
    text: "raw command output"
  };

  await room.webSocketMessage(bridgeSocket, JSON.stringify(progressEvent));
  await room.webSocketMessage(bridgeSocket, JSON.stringify(progressEvent));

  const stored = await store.listThread("dashboard-main-unresolved");
  assert.equal(stored.length, 0);
  const sentPayloads = dashboardSocket.sent.map((message) => JSON.parse(message));
  assert.equal(sentPayloads.filter((message) => message.type === "thread").length, 0);
  assert.equal(sentPayloads.filter((message) => message.type === "transient_status").length, 2);
});

test("DashboardChatRoom maps app-server progress stages to owner-facing transient status", async () => {
  const stageCases = [
    ["read_context", "既存 Issue / PR / docs を確認しています。"],
    ["issue_body", "新しい Issue 本文を作成しています。"],
    ["github_issue_create", "GitHub に Issue を作成しています。"],
    ["bounded_change_contract", "bounded change contract を確認しています。"],
    ["topic_branch", "topic branch を作成しています。"],
    ["planning", "方針を整理しています。"],
    ["hypothesis", "仮説を整理しています。"],
    ["target", "確認する箇所にあたりをつけています。"],
    ["verify", "検証方法を確認しています。"],
    ["command", "コマンドを実行しています。"],
    ["file_change", "ファイル変更を確認しています。"],
    ["tool_call", "外部ツールの結果を待っています。"],
    ["web_search", "必要な情報を確認しています。"],
    ["waiting_approval", "承認待ちです。"],
    ["waiting_user_input", "確認が必要です。"],
    ["quiet", "接続と実行状態を確認中です。入力と文脈は保持しています。"],
    ["implementation", "実装に入っています。"],
    ["test", "テストを実行しています。"],
    ["pr_body", "PR本文を作成しています。"],
    ["pr_create", "PRを作成しています。"],
    ["reviewer_wait", "CI / reviewer を待っています。"],
    ["reviewer_revision", "reviewer 指摘を反映しています。"]
  ];
  const durableStages = new Set(["waiting_approval", "waiting_user_input"]);
  for (const [stage, expectedText] of stageCases) {
    const store = createInMemoryDashboardChatStore();
    const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
    const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
    const storage = createMockDurableObjectStorage();
    const room = new DashboardChatRoom(
      {
        storage,
        getWebSockets() {
          return [dashboardSocket, bridgeSocket];
        }
      },
      { DASHBOARD_CHAT_STORE: store }
    );

    await room.webSocketMessage(
      bridgeSocket,
      JSON.stringify({
        type: "app_server_status",
        status: "thinking",
        stage,
        threadId: "dashboard-main-unresolved",
        codexThreadId: "codex-thread-450",
        text: "raw runner event text"
      })
    );

    const stored = await store.listThread("dashboard-main-unresolved");
    assert.equal(stored.length, durableStages.has(stage) ? 1 : 0);
    if (durableStages.has(stage)) {
      assert.equal(stored[0].text, expectedText);
    }
    assert.equal(dashboardSocket.sent.filter((message) => JSON.parse(message).type === "transient_status").length, 1);
    const status = JSON.parse(dashboardSocket.sent[0]);
    assert.equal(status.type, "transient_status");
    assert.equal(status.status, "thinking");
    assert.equal(status.text, expectedText);
  }
});

test("DashboardChatRoom rejects app-server bridge events for a different dashboard thread", async () => {
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const storage = createMockDurableObjectStorage();
  const room = new DashboardChatRoom(
    {
      storage,
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store }
  );

  await room.webSocketMessage(
    bridgeSocket,
    JSON.stringify({
      type: "app_server_reply",
      threadId: "dashboard-other",
      codexThreadId: "codex-thread-other",
      text: "別 thread への返信"
    })
  );

  assert.equal(storage.values.has("app_server_thread:dashboard-other"), false);
  assert.equal(dashboardSocket.sent.length, 0);
  assert.equal(bridgeSocket.sent.length, 1);
  const error = JSON.parse(bridgeSocket.sent[0]);
  assert.equal(error.type, "error");
  assert.equal(error.ok, false);
  assert.match(error.reason, /threadId/);
});

test("DashboardChatRoom rejects spoofed app-server events from dashboard sockets", async () => {
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const storage = createMockDurableObjectStorage();
  const room = new DashboardChatRoom(
    {
      storage,
      getWebSockets() {
        return [dashboardSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store }
  );

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "app_server_reply",
      threadId: "dashboard-main-unresolved",
      codexThreadId: "spoofed-thread",
      text: "偽装返信"
    })
  );

  assert.equal(storage.values.has("app_server_thread:dashboard-main-unresolved"), false);
  assert.equal(dashboardSocket.sent.length, 0);
  assert.deepEqual(await store.listThread("dashboard-main-unresolved"), []);
});

test("DashboardChatRoom sends nickname requests to connected app-server bridge", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "alias_registry:marushu/vtdd-v2-p",
    type: MemoryRecordType.ALIAS_REGISTRY,
    content: {
      canonicalRepo: "marushu/vtdd-v2-p",
      aliases: ["ぶい", "vtdd"]
    },
    metadata: { source: "test" },
    priority: 60,
    tags: ["alias_registry", "marushu/vtdd-v2-p"],
    createdAt: "2026-05-20T00:00:00.000Z"
  });
  const store = createInMemoryDashboardChatStore();
  const dashboardSocket = createMockSocket("dashboard", "dashboard-main-unresolved");
  const bridgeSocket = createMockSocket("app_server_bridge", "dashboard-main-unresolved");
  const room = new DashboardChatRoom(
    {
      getWebSockets() {
        return [dashboardSocket, bridgeSocket];
      }
    },
    { DASHBOARD_CHAT_STORE: store, MEMORY_PROVIDER: provider }
  );

  await room.webSocketMessage(
    dashboardSocket,
    JSON.stringify({
      type: "owner_message",
      threadId: "dashboard-main-unresolved",
      text: "登録済みのニックネーム出して"
    })
  );

  assert.equal(bridgeSocket.sent.length, 1);
  const turnRequest = JSON.parse(bridgeSocket.sent[0]);
  assert.equal(turnRequest.type, "app_server_turn_requested");
  assert.equal(turnRequest.text, "登録済みのニックネーム出して");
  assert.equal(turnRequest.repository, null);
  assert.equal(turnRequest.authority.ordinaryConversationAllowed, true);

  const broadcast = JSON.parse(dashboardSocket.sent[0]);
  assert.equal(broadcast.messages.length, 1);
  assert.equal(broadcast.messages[0].role, "owner");
  assert.equal(broadcast.messages[0].text, "登録済みのニックネーム出して");
  const ack = JSON.parse(dashboardSocket.sent[1]);
  assert.equal(ack.type, "owner_message_accepted");
  assert.equal(ack.ok, true);
  const status = JSON.parse(dashboardSocket.sent[2]);
  assert.equal(status.type, "transient_status");
  assert.equal(status.status, "thinking");
});

test("worker redacts dashboard Butler chat sensitive material before returning and storing", async () => {
  const store = createInMemoryDashboardChatStore();
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/messages", {
      method: "POST",
      headers: { ...dashboardAccessHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        repository: "marushu/vtdd-v2-p",
        text: "approval:15b6f20d-11b6-4f8b-8008-99e7d7397452 と Bearer supersecrettoken123 を貼った"
      })
    }),
    { ...dashboardAccessEnv, DASHBOARD_CHAT_STORE: store }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.messages[0].text.includes("approval:15b6f20d"), false);
  assert.equal(body.messages[0].text.includes("supersecrettoken123"), false);
  assert.equal(body.messages[0].text.includes("[redacted-approval]"), true);
  assert.equal(body.messages[0].text.includes("Bearer [redacted]"), true);

  const retrieveResponse = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/dashboard-main-marushu-vtdd-v2-p", {
      headers: dashboardAccessHeaders
    }),
    { ...dashboardAccessEnv, DASHBOARD_CHAT_STORE: store }
  );
  const retrieveBody = await retrieveResponse.json();
  assert.equal(JSON.stringify(retrieveBody).includes("approval:15b6f20d"), false);
  assert.equal(JSON.stringify(retrieveBody).includes("supersecrettoken123"), false);
});

test("worker serves human-facing GitHub truth dashboard instead of raw action JSON", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/dashboard/github?repository=sample-org/vtdd-v2-p", {
      headers: dashboardAccessHeaders
    }),
    {
      ...dashboardAccessEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/issues")) {
          return new Response(
            JSON.stringify([
              {
                number: 46,
                title: "GitHub read plane",
                state: "open",
                html_url: "https://github.com/sample-org/vtdd-v2-p/issues/46",
                user: { login: "marushu" }
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (parsed.pathname.endsWith("/pulls")) {
          return new Response(
            JSON.stringify([
              {
                number: 47,
                title: "Dashboard HTML",
                state: "open",
                draft: false,
                html_url: "https://github.com/sample-org/vtdd-v2-p/pull/47",
                head: { ref: "codex/dashboard", sha: "abc", repo: { owner: { login: "sample-org" } } },
                base: { ref: "main", sha: "def" }
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (parsed.pathname.endsWith("/actions/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 4800,
                  name: "deploy-production",
                  status: "completed",
                  conclusion: "success",
                  head_branch: "main",
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/4800"
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ message: `unexpected ${parsed.pathname}` }), {
          status: 404,
          headers: { "content-type": "application/json" }
        });
      }
    }
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const body = await response.text();
  assert.equal(body.includes("GitHub runtime truth"), true);
  assert.equal(body.includes("Open Issues"), true);
  assert.equal(body.includes("#46 GitHub read plane"), true);
  assert.equal(body.includes("Open PRs"), true);
  assert.equal(body.includes("#47 Dashboard HTML"), true);
  assert.equal(body.includes("Workflow Runs"), true);
  assert.equal(body.includes("deploy-production"), true);
  assert.equal(body.includes("raw issues JSON"), false);
  assert.equal(body.includes("{\"ok\""), false);
});

test("worker serves human-facing dashboard pages for every management menu", async () => {
  const routes = [
    ["/dashboard/preflight?repository=sample-org/vtdd-v2-p", "Startup preflight", "raw preflight JSON"],
    ["/dashboard/progress?repository=sample-org/vtdd-v2-p", "Execution progress", "raw progress JSON"],
    ["/dashboard/vps-runner?repository=sample-org/vtdd-v2-p", "VPS runner status", "raw runner JSON"],
    ["/dashboard/news", "AI news", "raw news JSON"],
    ["/dashboard/memory?repository=sample-org/vtdd-v2-p", "Operational RAG", "raw memory JSON"],
    ["/dashboard/self-parity?repository=sample-org/vtdd-v2-p", "Self parity", "raw self parity JSON"]
  ];

  for (const [route, title, rawLabel] of routes) {
    const response = await worker.fetch(
      new Request(`https://example.com${route}`, {
        headers: dashboardAccessHeaders
      }),
      dashboardAccessEnv
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const body = await response.text();
    assert.equal(body.includes(title), true);
    assert.equal(body.includes(rawLabel), false);
    assert.equal(body.includes("{\"ok\""), false);
    assert.equal(body.includes('class="desktop-nav" aria-label="Dashboard メニュー"'), true);
    assert.equal(body.includes('class="dashboard-nav-drawer" aria-label="Dashboard メニュー"'), true);
    assert.equal(body.includes('for="dashboard-nav-toggle" aria-label="メニューを開く"'), true);
    assert.equal(body.includes('data-drawer-resize-handle="dashboard-utility"'), true);
    assert.equal(body.includes("vtdd.dashboard.utilityDrawer.width"), true);
    assert.equal(body.includes("--dashboard-utility-drawer-width"), true);
    assert.equal(body.includes('href="/dashboard/notifications"'), true);
    assert.equal(body.includes('href="/dashboard/news"'), true);
    assert.equal(body.includes('href="/dashboard"'), true);
  }
});

test("worker serves dashboard chat-first shell with debug and ops surfaces isolated", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/dashboard?repository=sample-org/vtdd-v2-p", {
      headers: dashboardAccessHeaders
    }),
    dashboardAccessEnv
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const body = await response.text();

  assert.equal(body.includes("VTDD Butler"), true);
  assert.equal(body.includes("ここではまず普通に会話できます"), true);
  assert.equal(body.includes("通知と進捗はこの画面から戻って確認できます"), true);
  assert.equal(body.includes("AI news"), true);
  assert.equal(body.includes('rel="apple-touch-icon"'), true);
  assert.equal(body.includes('rel="icon" type="image/png"'), true);
  assert.equal(body.includes('rel="shortcut icon"'), true);
  assert.equal(body.includes("/dashboard-icon-20260529-butler-v2.png"), true);
  assert.equal(body.includes("この作業の対象 repo"), true);
  assert.equal(body.includes("固定ではありません"), true);
  assert.equal(body.includes("deploy 先と承認境界は repo ごとに確認します"), true);
  assert.equal(body.includes("Issue / PR 操作が必要になった時だけ"), true);
  assert.equal(
    body.includes(
      '/v2/approval/passkey/operator?mode=dashboard&amp;phase=execution&amp;actionType=read&amp;highRiskKind=dashboard_access&amp;dashboardReturnPath=%2Fdashboard%3Frepository%3Dsample-org%252Fvtdd-v2-p'
    ),
    false
  );
  const initialChat = body.slice(
    body.indexOf('<div class="chat-scroll"'),
    body.indexOf('<form class="composer"')
  );
  assert.equal(initialChat.includes("Issue 駆動・GitHub runtime truth・VPS runner・Gemini reviewer・RAG・passkey 境界"), false);
  assert.equal(initialChat.includes("旧 VPS runner 直送経路"), false);
  assert.equal(initialChat.includes("codex app-server"), false);
  assert.equal(initialChat.includes("Dashboard thread 接続準備中"), false);

  const debugSectionIndex = body.indexOf('data-debug-section="dashboard-development-operations"');
  assert.notEqual(debugSectionIndex, -1);
  assert.equal(body.indexOf("Operational RAG") > debugSectionIndex, true);
  assert.equal(body.indexOf("本番反映 / Passkey 承認") > debugSectionIndex, true);
  assert.equal(body.includes(">本番反映 / Passkey 承認</a>"), true);
  assert.equal(body.indexOf("GitHub workflows") > debugSectionIndex, true);
  assert.equal(body.includes("<summary>開発/運用</summary>"), true);
  assert.equal(body.includes("<summary>Runtime surfaces</summary>"), false);
  assert.equal(body.includes("RAG を読む"), false);
  assert.equal(body.includes("最新状態"), true);
  assert.equal(body.includes("dashboard-refresh-check-button"), true);
  assert.equal(body.includes("dashboard-force-refresh-button"), true);
  assert.equal(body.includes("強制キャッシュ削除リロード"), true);
  assert.equal(body.includes("20260601-issue-723-self-refresh"), true);
  assert.equal(body.includes("VTDD_DASHBOARD_CLEAR_CACHES"), true);
  assert.equal(body.includes("serviceWorker.getRegistration(\"/dashboard/\""), true);
  assert.equal(body.includes("registration.update()"), true);
  assert.equal(body.includes("window.location.reload()"), true);
  assert.equal(body.includes("入力は保存します。添付は再選択が必要な場合があります。"), true);
});

test("worker uses explicit dashboard thread id for chat shell and passkey return", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/dashboard?repository=marushu%2Fvtdd-v2-p&threadId=dashboard-main-unresolved", {
      headers: dashboardAccessHeaders
    }),
    dashboardAccessEnv
  );
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal(body.includes('data-thread-id="dashboard-main-unresolved"'), true);
  assert.equal(body.includes('data-thread-endpoint="https://example.com/v2/dashboard/chat/dashboard-main-unresolved"'), true);
  assert.equal(body.includes('data-socket-endpoint="wss://example.com/v2/dashboard/chat/dashboard-main-unresolved/ws"'), true);
  assert.equal(body.includes('data-thread-id="dashboard-main-marushu-vtdd-v2-p"'), false);
  assert.equal(
    body.includes(
      'dashboardReturnPath=%2Fdashboard%3Frepository%3Dmarushu%252Fvtdd-v2-p%26threadId%3Ddashboard-main-unresolved'
    ),
    true
  );
});

test("worker serves dashboard notification center for recent events across repositories", async () => {
  const store = createInMemoryDashboardEventStore();
  const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  await store.put({
    id: "github_actions_workflow_run:marushu/vtdd-v2-p:deploy-production:26134526815",
    kind: "github_actions_workflow_run",
    repository: "marushu/vtdd-v2-p",
    workflowName: "deploy-production",
    runId: "26134526815",
    runUrl: "https://github.com/marushu/vtdd-v2-p/actions/runs/26134526815",
    status: "completed",
    conclusion: "success",
    headSha: "daad4fb023cf699b3ad531e0394e064fde2b5515",
    headBranch: "main",
    title: "dashboard: 通知設定を折り畳む (#534)",
    changeSummary: "dashboard: 通知設定を折り畳む (#534)",
    pullNumber: 552,
    updatedAt: fourMinutesAgo
  });
  await store.put({
    id: "github_actions_workflow_run:marushu/vtdd-v2-p:deploy-production:26134526816",
    kind: "github_actions_workflow_run",
    repository: "marushu/vtdd-v2-p",
    workflowName: "deploy-production",
    runId: "26134526816",
    runUrl: "https://github.com/marushu/vtdd-v2-p/actions/runs/26134526816",
    status: "in_progress",
    conclusion: "",
    headSha: "daad4fb023cf699b3ad531e0394e064fde2b5515",
    headBranch: "main",
    title: "dashboard: 通知設定を折り畳む (#534)",
    changeSummary: "dashboard: 通知設定を折り畳む (#534)",
    pullNumber: 552,
    updatedAt: twoMinutesAgo
  });
  await store.put({
    id: "github_actions_workflow_run:marushu/vtdd-v2-p:deploy-production:26134526817",
    kind: "github_actions_workflow_run",
    repository: "marushu/vtdd-v2-p",
    workflowName: "deploy-production",
    runId: "26134526817",
    runUrl: "https://github.com/marushu/vtdd-v2-p/actions/runs/26134526817",
    status: "completed",
    conclusion: "success",
    headSha: "daad4fb023cf699b3ad531e0394e064fde2b5515",
    headBranch: "main",
    title: "dashboard: 通知設定を折り畳む (#534)",
    changeSummary: "dashboard: 通知設定を折り畳む (#534)",
    pullNumber: 552,
    updatedAt: new Date(Date.now() - 60 * 1000).toISOString()
  });
  await store.put({
    id: "vps_runner_execution:marushu/sunabaeye:remote-codex-issue9",
    kind: "vps_runner_execution",
    repository: "marushu/sunabaeye",
    workflowName: "remote-codex",
    runId: "remote-codex-issue9",
    runUrl: "https://example.com/progress/remote-codex-issue9?repository=marushu%2Fsunabaeye&source=dashboard-notification-center",
    status: "running",
    conclusion: "",
    headSha: "abc1234567890",
    headBranch: "codex/issue-9",
    title: "SunabaEye queue pickup with long notification title",
    updatedAt: twoMinutesAgo
  });
  await store.put({
    id: "github_actions_workflow_run:marushu/old:deploy-production:old",
    kind: "github_actions_workflow_run",
    repository: "marushu/old",
    workflowName: "deploy-production",
    runId: "old",
    runUrl: "https://example.com/old",
    status: "completed",
    conclusion: "failure",
    headSha: "old1234567890",
    headBranch: "main",
    title: "old notification",
    updatedAt: sixMinutesAgo
  });

  const response = await worker.fetch(
    new Request("https://example.com/dashboard/notifications", {
      headers: dashboardAccessHeaders
    }),
    {
      ...dashboardAccessEnv,
      DASHBOARD_EVENT_STORE: store
    }
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const body = await response.text();
  assert.equal(body.includes("通知センター"), true);
  assert.equal(body.includes('class="desktop-nav" aria-label="Dashboard メニュー"'), true);
  assert.equal(body.includes('class="dashboard-nav-drawer" aria-label="Dashboard メニュー"'), true);
  assert.equal(body.includes('for="dashboard-nav-toggle" aria-label="メニューを開く"'), true);
  assert.equal(body.includes('data-drawer-resize-handle="dashboard-utility"'), true);
  assert.equal(body.includes("vtdd.dashboard.utilityDrawer.width"), true);
  assert.equal(body.includes('href="/dashboard"'), true);
  assert.equal(body.includes('href="/dashboard/preflight"'), true);
  assert.equal(body.includes('href="/dashboard/self-parity"'), true);
  assert.equal(body.includes("run 26134526817"), true);
  assert.equal(body.includes("run 26134526816"), false);
  assert.equal(body.includes("run 26134526815"), false);
  assert.equal(body.includes("Dashboard Butler の通知入口です"), true);
  assert.equal(body.includes("iOS PWA Web Push"), true);
  assert.equal(body.includes('data-debug-section="notification-center-context"'), true);
  assert.equal(body.includes("<summary>通知センターについて</summary>"), true);
  assert.equal(body.includes('data-settings-section="notification-pwa-settings"'), true);
  assert.equal(body.includes("<summary>通知設定</summary>"), true);
  assert.equal(body.indexOf("最新通知") < body.indexOf("iOS PWA 通知"), true);
  assert.equal(body.indexOf("最新通知") < body.indexOf("通知センターについて"), true);
  assert.equal(body.indexOf("最新通知") < body.indexOf("通知設定"), true);
  assert.equal(body.indexOf("通知設定") < body.indexOf("iOS PWA 通知"), true);
  assert.equal(body.indexOf("通知設定") < body.indexOf("Badge"), true);
  assert.equal(body.indexOf("最新通知") < body.indexOf("Badge"), true);
  assert.equal(body.indexOf("最新通知") < body.indexOf("Authority boundary"), true);
  assert.equal(body.includes('data-debug-section="notification-authority-boundary"'), true);
  assert.equal(body.includes("<summary>通知の詳細設定と安全境界</summary>"), true);
  assert.equal(body.indexOf("通知設定") < body.indexOf("通知の詳細設定と安全境界"), true);
  assert.equal(body.indexOf("通知の詳細設定と安全境界") < body.indexOf("Authority boundary"), true);
  assert.equal(body.includes("id=\"push-permission-button\""), true);
  assert.equal(body.includes("id=\"push-subscribe-button\""), true);
  assert.equal(body.includes("id=\"push-server-test-button\""), true);
  assert.equal(body.includes("id=\"push-subscription-state\""), true);
  assert.equal(body.includes("id=\"push-delivery-state\""), true);
  assert.equal(body.includes("id=\"push-server-result\""), true);
  assert.equal(body.includes("id=\"badge-set-button\""), true);
  assert.equal(body.includes("/v2/dashboard/push/subscription"), true);
  assert.equal(body.includes("/v2/dashboard/push/status"), true);
  assert.equal(body.includes("/v2/dashboard/push/test"), true);
  assert.equal(body.includes("credentials: \"same-origin\""), true);
  assert.equal(body.includes("endpoint: subscription.endpoint"), true);
  assert.equal(body.includes("current device subscription missing"), true);
  assert.equal(body.includes("サーバ送信設定: あり"), true);
  assert.equal(body.includes("サーバ送信: 設定あり。deploy 通知到達性はサーバ送信テスト成功後に確認済みになります。"), true);
  assert.equal(body.includes("購読保存: あり。サーバ送信テストはまだ未確認です。"), true);
  assert.equal(body.includes("購読保存: あり。サーバ送信テストも成功済みです。deploy 完了/失敗通知は同じ経路で届きます。"), true);
  assert.equal(body.includes("端末に購読はありますが、サーバ保存は未確認です"), true);
  assert.equal(body.includes("safePushResultDetail"), true);
  assert.equal(body.includes("setButtonBusy(serverTestButton, true)"), true);
  assert.equal(body.includes("最後のサーバ送信結果: 送信中..."), true);
  assert.equal(body.includes("browser exception"), true);
  assert.equal(body.includes("session/auth required"), true);
  assert.equal(body.includes("最後のサーバ送信結果: accepted"), true);
  assert.equal(body.includes("最後のサーバ送信結果: rejected"), true);
  assert.equal(body.includes("D1 には送信用に保持し、response / HTML / payload_json には raw key を返しません"), true);
  assert.equal(body.includes("navigator.setAppBadge"), true);
  assert.equal(body.includes("Notification.requestPermission"), true);
  assert.equal(body.includes("serviceWorker.register(\"/dashboard-sw.js\""), true);
  assert.equal(body.includes("scope: \"/dashboard/\""), true);
  assert.equal(body.includes("secret-must-not-persist"), false);
  assert.equal(body.includes("他 repo / 並行開発 / queue / workflow"), true);
  assert.equal(body.includes("deploy-production / run 26134526817 / sha daad4fb"), true);
  assert.equal(body.includes('href="https://github.com/marushu/vtdd-v2-p/pull/552"'), true);
  assert.equal(body.includes('href="https://github.com/marushu/vtdd-v2-p/actions/runs/26134526817"'), false);
  assert.equal(body.includes("PRを開く"), true);
  assert.equal(body.includes("最新通知"), true);
  assert.equal(body.includes("success"), true);
  assert.equal(body.includes("デプロイ完了: PR #552 dashboard: 通知設定を折り畳む (#534)"), true);
  assert.equal(body.includes("26134526817"), true);
  assert.equal(body.includes("26134526816"), false);
  assert.equal(body.includes("26134526815"), false);
  assert.equal(body.includes(fourMinutesAgo), false);
  assert.equal(body.includes("SunabaEye queue pickup with long notification title"), true);
  assert.equal(body.includes("marushu/sunabaeye"), true);
  assert.equal(body.includes("dashboard-notification-center"), true);
  assert.equal(body.includes("2分前"), true);
  assert.equal(body.includes("直近30件"), true);
  assert.equal(body.includes("old notification"), true);
});

test("worker serves dashboard PWA manifest and service worker notification handlers", async () => {
  const manifestResponse = await worker.fetch(new Request("https://example.com/dashboard.webmanifest"));
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers.get("content-type"), /application\/manifest\+json/);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, "VTDD Butler");
  assert.equal(manifest.start_url, "/dashboard");
  assert.equal(manifest.scope, "/dashboard/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.icons[0].src, "https://example.com/dashboard-icon-20260529-butler-v2.png");
  assert.equal(manifest.icons[0].sizes, "512x512");
  assert.equal(manifest.icons[0].type, "image/png");
  assert.equal(manifest.icons[1].src, "https://example.com/dashboard-icon.svg");

  const serviceWorkerResponse = await worker.fetch(new Request("https://example.com/dashboard-sw.js"));
  assert.equal(serviceWorkerResponse.status, 200);
  assert.match(serviceWorkerResponse.headers.get("content-type"), /application\/javascript/);
  const serviceWorker = await serviceWorkerResponse.text();
  assert.equal(serviceWorker.includes('self.addEventListener("push"'), true);
  assert.equal(serviceWorker.includes("showNotification"), true);
  assert.equal(serviceWorker.includes("/v2/dashboard/push/ack"), true);
  assert.equal(serviceWorker.includes("event.waitUntil(shown);"), true);
  assert.equal(serviceWorker.includes("event.waitUntil(ack);"), true);
  assert.equal(serviceWorker.includes("Promise.allSettled([ack, self.registration.showNotification"), false);
  assert.equal(serviceWorker.includes('credentials: "same-origin"'), true);
  assert.equal(serviceWorker.includes('"x-vtdd-dashboard-push-ack": "service-worker"'), true);
  assert.equal(serviceWorker.includes('self.addEventListener("notificationclick"'), true);
  assert.equal(serviceWorker.includes("/dashboard/notifications"), true);
  assert.equal(serviceWorker.includes("safeDashboardNotificationUrl"), true);
  assert.equal(serviceWorker.includes('parsed.origin === "https://github.com"'), true);
  assert.equal(serviceWorker.includes('pull\\/\\d+'), true);
  assert.equal(serviceWorker.includes("parsed.origin !== self.location.origin"), true);
  assert.equal(serviceWorker.includes('!parsed.pathname.startsWith("/dashboard/")'), true);
  assert.equal(serviceWorker.includes("DASHBOARD_SERVICE_WORKER_VERSION"), true);
  assert.equal(serviceWorker.includes("20260601-issue-723-self-refresh"), true);
  assert.equal(serviceWorker.includes('self.addEventListener("message"'), true);
  assert.equal(serviceWorker.includes("VTDD_DASHBOARD_CLEAR_CACHES"), true);
  assert.equal(serviceWorker.includes("caches.keys()"), true);
  assert.equal(serviceWorker.includes("isDashboardCacheName"), true);
  assert.equal(serviceWorker.includes("Promise.allSettled"), true);

  const iconResponse = await worker.fetch(new Request("https://example.com/dashboard-icon.svg"));
  assert.equal(iconResponse.status, 200);
  assert.match(iconResponse.headers.get("content-type"), /image\/svg\+xml/);

  const pngIconResponse = await worker.fetch(new Request("https://example.com/dashboard-icon-20260529-butler-v2.png"));
  assert.equal(pngIconResponse.status, 200);
  assert.match(pngIconResponse.headers.get("content-type"), /image\/png/);
  const pngIcon = new Uint8Array(await pngIconResponse.arrayBuffer());
  assert.equal(pngIcon[0], 0x89);
  assert.equal(pngIcon[1], 0x50);
  assert.equal(pngIcon[2], 0x4e);
  assert.equal(pngIcon[3], 0x47);

  const appleTouchIconResponse = await worker.fetch(new Request("https://example.com/apple-touch-icon.png"));
  assert.equal(appleTouchIconResponse.status, 200);
  assert.match(appleTouchIconResponse.headers.get("content-type"), /image\/png/);
});

test("worker stores dashboard push subscription only for an authenticated owner session", async () => {
  const store = createInMemoryDashboardPushSubscriptionStore();
  const unauthenticated = await worker.fetch(
    new Request("https://example.com/v2/dashboard/push/subscription", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subscription: {
          endpoint: "https://push.example/subscription/secret-endpoint",
          keys: { p256dh: "p256dh-key", auth: "auth-key" }
        }
      })
    }),
    {
      ...dashboardAccessEnv,
      DASHBOARD_PUSH_SUBSCRIPTION_STORE: store
    }
  );
  assert.equal(unauthenticated.status, 401);
  assert.equal(store.subscriptions.size, 0);

  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/push/subscription", {
      method: "POST",
      headers: {
        ...dashboardAccessHeaders,
        "content-type": "application/json",
        "user-agent": "iPhone PWA test"
      },
      body: JSON.stringify({
        subscription: {
          endpoint: "https://push.example/subscription/secret-endpoint",
          expirationTime: null,
          keys: { p256dh: "p256dh-key", auth: "auth-key" }
        },
        userAgent: "iPhone PWA test"
      })
    }),
    {
      ...dashboardAccessEnv,
      DASHBOARD_PUSH_SUBSCRIPTION_STORE: store
    }
  );
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.subscription.status, "saved");
  assert.equal(typeof body.subscription.endpointHash, "string");
  assert.equal(body.subscription.endpointHash.length > 12, true);
  assert.equal(JSON.stringify(body).includes("secret-endpoint"), false);
  assert.equal(JSON.stringify(body).includes("p256dh-key"), false);
  assert.equal(JSON.stringify(body).includes("auth-key"), false);
  assert.equal(store.subscriptions.size, 1);
  const [saved] = [...store.subscriptions.values()];
  assert.equal(saved.endpoint, "https://push.example/subscription/secret-endpoint");
  assert.equal(saved.p256dh, "p256dh-key");
  assert.equal(saved.auth, "auth-key");
  assert.equal(saved.ownerIdentity, "owner@example.com");
});

test("worker reports dashboard push subscription server save status without raw material", async () => {
  const store = createInMemoryDashboardPushSubscriptionStore();
  const endpoint = "https://push.example/subscription/status-endpoint";
  const endpointHash = await sha256HexTest(endpoint);
  const missing = await worker.fetch(
    new Request("https://example.com/v2/dashboard/push/status", {
      method: "POST",
      headers: { ...dashboardAccessHeaders, "content-type": "application/json" },
      body: JSON.stringify({ endpoint })
    }),
    {
      ...dashboardAccessEnv,
      DASHBOARD_PUSH_SUBSCRIPTION_STORE: store
    }
  );
  assert.equal(missing.status, 200);
  const missingBody = await missing.json();
  assert.equal(missingBody.subscription.status, "not_saved");
  assert.equal(JSON.stringify(missingBody).includes(endpointHash), false);
  assert.equal(JSON.stringify(missingBody).includes("status-endpoint"), false);

  await store.put({
    endpointHash,
    endpoint,
    p256dh: "p256dh-key",
    auth: "auth-key",
    ownerIdentity: "owner@example.com",
    updatedAt: "2026-05-23T00:00:00.000Z"
  });
  const saved = await worker.fetch(
    new Request("https://example.com/v2/dashboard/push/status", {
      method: "POST",
      headers: { ...dashboardAccessHeaders, "content-type": "application/json" },
      body: JSON.stringify({ endpoint })
    }),
    {
      ...dashboardAccessEnv,
      DASHBOARD_PUSH_SUBSCRIPTION_STORE: store
    }
  );
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.subscription.status, "saved");
  assert.equal(savedBody.subscription.updatedAt, "2026-05-23T00:00:00.000Z");
  assert.equal(JSON.stringify(savedBody).includes(endpointHash), false);
  assert.equal(JSON.stringify(savedBody).includes("status-endpoint"), false);
  assert.equal(JSON.stringify(savedBody).includes("p256dh-key"), false);
  assert.equal(JSON.stringify(savedBody).includes("auth-key"), false);
});

test("worker sends server-side dashboard Web Push test only for authenticated owner session", async () => {
  const store = createInMemoryDashboardPushSubscriptionStore();
  const pushKeys = await createTestPushSubscription();
  const currentEndpointHash = await sha256HexTest(pushKeys.subscription.endpoint);
  await store.put({
    ...pushKeys.subscription,
    endpointHash: currentEndpointHash
  });
  const calls = [];
  const vapidEnv = await createTestVapidEnv({
    DASHBOARD_WEB_PUSH_FETCH: async (input, init) => {
      calls.push({ input, init });
      return new Response(null, { status: 201 });
    }
  });

  const unauthenticated = await worker.fetch(
    new Request("https://example.com/v2/dashboard/push/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "must not send" })
    }),
    {
      ...dashboardAccessEnv,
      ...vapidEnv,
      DASHBOARD_PUSH_SUBSCRIPTION_STORE: store
    }
  );
  assert.equal(unauthenticated.status, 401);
  assert.equal(calls.length, 0);

  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/push/test", {
      method: "POST",
      headers: { ...dashboardAccessHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "server push test", endpoint: pushKeys.subscription.endpoint })
    }),
    {
      ...dashboardAccessEnv,
      ...vapidEnv,
      DASHBOARD_PUSH_SUBSCRIPTION_STORE: store
    }
  );
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.webPush.delivered, 1);
  assert.equal(body.webPush.results[0].endpointHash, currentEndpointHash);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, pushKeys.subscription.endpoint);
  assert.equal(calls[0].init.method, "POST");
  assert.match(calls[0].init.headers.authorization, /^vapid t=.+, k=.+/);
  assert.equal(calls[0].init.headers.ttl, "300");
  assert.equal(calls[0].init.headers.urgency, "normal");
  assert.equal(calls[0].init.headers["content-encoding"], "aes128gcm");
  assert.equal(calls[0].init.headers["content-type"], "application/octet-stream");
  assert.equal("body" in calls[0].init, true);
  const decrypted = JSON.parse(await decryptTestWebPushPayload(calls[0].init.body, pushKeys));
  assert.equal(decrypted.title, "VTDD Butler テスト通知");
  assert.equal(decrypted.body, "通知経路は正常です。iPhone PWA にサーバ送信できました。");
  assert.equal(decrypted.url, "/dashboard/notifications");
  assert.equal(JSON.stringify(body).includes("p256dh-key"), false);
  assert.equal(JSON.stringify(body).includes("auth-key"), false);
});

test("worker refuses server-side dashboard Web Push test when current device subscription is not saved", async () => {
  const store = createInMemoryDashboardPushSubscriptionStore();
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/push/test", {
      method: "POST",
      headers: { ...dashboardAccessHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        title: "server push test",
        endpoint: "https://push.example/send/current-device"
      })
    }),
    {
      ...dashboardAccessEnv,
      DASHBOARD_PUSH_SUBSCRIPTION_STORE: store
    }
  );
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.webPush.error, "dashboard_push_current_subscription_not_saved");
  assert.equal(body.webPush.currentDevice.status, "not_saved");
  assert.equal(body.webPush.attempted, 0);
  assert.equal(JSON.stringify(body).includes("current-device"), false);
});

test("worker sends owner-action-required PWA notification through machine event route", async () => {
  const store = createInMemoryDashboardPushSubscriptionStore();
  const pushKeys = await createTestPushSubscription();
  const currentEndpointHash = await sha256HexTest(pushKeys.subscription.endpoint);
  await store.put({
    ...pushKeys.subscription,
    endpointHash: currentEndpointHash
  });
  const eventStore = createInMemoryDashboardEventStore();
  const calls = [];
  const vapidEnv = await createTestVapidEnv({
    DASHBOARD_WEB_PUSH_FETCH: async (input, init) => {
      calls.push({ input, init });
      return new Response(null, { status: 201 });
    }
  });

  const unauthenticated = await worker.fetch(
    new Request("https://example.com/v2/events/owner-action-required", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repository: "marushu/vtdd-v2-p", title: "must not send" })
    }),
    {
      ...gatewayAuthEnv,
      ...vapidEnv,
      DASHBOARD_EVENT_STORE: eventStore,
      DASHBOARD_PUSH_SUBSCRIPTION_STORE: store
    }
  );
  assert.equal(unauthenticated.status, 401);
  assert.equal(calls.length, 0);

  const response = await worker.fetch(
    new Request("https://example.com/v2/events/owner-action-required", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "marushu/vtdd-v2-p",
        actionId: "issue-637-passkey-needed",
        title: "Passkey approval needed",
        summary: "VPS capability proposal requires owner approval",
        issueNumber: 637,
        url: "/dashboard/notifications?focus=owner-action"
      })
    }),
    {
      ...gatewayAuthEnv,
      ...vapidEnv,
      DASHBOARD_EVENT_STORE: eventStore,
      DASHBOARD_PUSH_SUBSCRIPTION_STORE: store
    }
  );
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.event.kind, "owner_action_required");
  assert.equal(body.webPush.delivered, 1);
  assert.equal(calls.length, 1);
  const decrypted = JSON.parse(await decryptTestWebPushPayload(calls[0].init.body, pushKeys));
  assert.equal(decrypted.title, "要対応: VPS capability proposal requires owner approval");
  assert.equal(decrypted.body.includes("Issue #637"), true);
  assert.equal(decrypted.url, "/dashboard/notifications?focus=owner-action");
  const stored = await eventStore.latest({ kind: "owner_action_required", repository: "marushu/vtdd-v2-p" });
  assert.equal(stored.id, "owner-action-required:marushu/vtdd-v2-p:issue-637-passkey-needed");
  assert.equal(stored.pwaNotificationStatus, "sent");
  assert.equal(stored.pwaNotificationDelivered, 1);
  assert.equal(stored.pwaNotificationAttempted, 1);
});

test("worker rejects unsafe or underspecified owner-action-required notifications", async () => {
  const eventStore = createInMemoryDashboardEventStore();

  const missingAction = await worker.fetch(
    new Request("https://example.com/v2/events/owner-action-required", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "marushu/vtdd-v2-p",
        title: "Passkey approval needed",
        url: "/dashboard/notifications?focus=owner-action"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_EVENT_STORE: eventStore
    }
  );
  assert.equal(missingAction.status, 422);
  assert.equal((await missingAction.json()).error, "owner_action_required_action_id_required");

  const unsafeExternalUrl = await worker.fetch(
    new Request("https://example.com/v2/events/owner-action-required", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "marushu/vtdd-v2-p",
        actionId: "unsafe-url",
        title: "Passkey approval needed",
        url: "https://evil.example/phish"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_EVENT_STORE: eventStore
    }
  );
  assert.equal(unsafeExternalUrl.status, 422);
  assert.equal((await unsafeExternalUrl.json()).error, "owner_action_required_recovery_url_required");

  const protocolRelativeUrl = await worker.fetch(
    new Request("https://example.com/v2/events/owner-action-required", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "marushu/vtdd-v2-p",
        actionId: "protocol-relative-url",
        title: "Passkey approval needed",
        url: "//evil.example/phish"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_EVENT_STORE: eventStore
    }
  );
  assert.equal(protocolRelativeUrl.status, 422);
  assert.equal((await protocolRelativeUrl.json()).error, "owner_action_required_recovery_url_required");
});

test("worker records owner-action-required PWA unavailable truth when push delivery fails", async () => {
  const store = createInMemoryDashboardPushSubscriptionStore();
  const pushKeys = await createTestPushSubscription();
  const currentEndpointHash = await sha256HexTest(pushKeys.subscription.endpoint);
  await store.put({
    ...pushKeys.subscription,
    endpointHash: currentEndpointHash
  });
  const eventStore = createInMemoryDashboardEventStore();
  const vapidEnv = await createTestVapidEnv({
    DASHBOARD_WEB_PUSH_FETCH: async () => new Response(null, { status: 500 })
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/events/owner-action-required", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "marushu/vtdd-v2-p",
        actionId: "push-unavailable",
        title: "Passkey approval needed",
        summary: "VPS helper proposal still needs owner approval",
        issueNumber: 637,
        url: "/dashboard/notifications?focus=push-unavailable"
      })
    }),
    {
      ...gatewayAuthEnv,
      ...vapidEnv,
      DASHBOARD_EVENT_STORE: eventStore,
      DASHBOARD_PUSH_SUBSCRIPTION_STORE: store
    }
  );
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.event.pwaNotificationStatus, "pwa_notification_unavailable");
  assert.equal(body.event.pwaNotificationReason, "push service rejected the request");
  assert.equal(body.event.pwaNotificationAttempted, 1);
  assert.equal(body.event.pwaNotificationDelivered, 0);
  assert.equal(body.event.runUrl, "/dashboard/notifications?focus=push-unavailable");
  const stored = await eventStore.latest({ kind: "owner_action_required", repository: "marushu/vtdd-v2-p" });
  assert.equal(stored.id, "owner-action-required:marushu/vtdd-v2-p:push-unavailable");
  assert.equal(stored.pwaNotificationStatus, "pwa_notification_unavailable");
  assert.equal(stored.runUrl, "/dashboard/notifications?focus=push-unavailable");
});

test("worker builds distinct dashboard Web Push copy by event type", () => {
  const deploySuccess = buildDashboardWebPushPayload({
    kind: "github_actions_workflow_run",
    repository: "marushu/vtdd-v2-p",
    workflowName: "deploy-production",
    runId: "26323724369",
    status: "completed",
    conclusion: "success",
    headSha: "0a9e0b8587aa684de3dbd08b57909fe271192662",
    headBranch: "main",
    title: "Issue #514 owner-facing deploy notification title",
    changeSummary: "Issue #514 owner-facing deploy notification title",
    pullNumber: 571,
    runUrl: "https://github.com/marushu/vtdd-v2-p/actions/runs/26323724369"
  });
  assert.equal(deploySuccess.title, "デプロイ完了: PR #571 Issue #514 owner-facing deploy notification title");
  assert.equal(deploySuccess.body.includes("workflow: deploy-production"), true);
  assert.equal(deploySuccess.body.includes("branch: main"), true);
  assert.equal(deploySuccess.body.includes("sha: 0a9e0b8"), true);
  assert.equal(deploySuccess.body.includes("run: 26323724369"), true);
  assert.equal(deploySuccess.body.includes("PR #571"), true);
  assert.equal(deploySuccess.body.includes("Issue #514"), true);
  assert.equal(deploySuccess.url, "https://github.com/marushu/vtdd-v2-p/pull/571");

  const deployFailure = buildDashboardWebPushPayload({
    kind: "github_actions_workflow_run",
    repository: "marushu/vtdd-v2-p",
    workflowName: "deploy-production",
    runId: "26323724370",
    status: "completed",
    conclusion: "failure",
    headBranch: "main",
    title: "deploy-production"
  });
  assert.equal(deployFailure.title, "デプロイ失敗: vtdd-v2-p");
  assert.equal(deployFailure.url, "/dashboard/notifications");

  const testPush = buildDashboardWebPushPayload({
    kind: "dashboard_push_test",
    repository: "marushu/vtdd-v2-p",
    workflowName: "dashboard-push-test",
    runId: "test-run",
    status: "completed",
    conclusion: "success",
    title: "server push test"
  });
  assert.equal(testPush.title, "VTDD Butler テスト通知");
  assert.equal(testPush.body, "通知経路は正常です。iPhone PWA にサーバ送信できました。");

  const ownerAction = buildDashboardWebPushPayload({
    id: "owner-action-required:marushu/vtdd-v2-p:issue-637-passkey-needed",
    kind: "owner_action_required",
    repository: "marushu/vtdd-v2-p",
    workflowName: "vps-maintenance",
    runId: "issue-637-passkey-needed",
    status: "waiting",
    conclusion: "action_required",
    title: "Passkey approval needed",
    changeSummary: "VPS capability proposal requires owner approval",
    issueNumber: 637,
    runUrl: "/dashboard/notifications?focus=owner-action"
  });
  assert.equal(ownerAction.title, "要対応: VPS capability proposal requires owner approval");
  assert.equal(ownerAction.body.includes("Issue #637"), true);
  assert.equal(ownerAction.url, "/dashboard/notifications?focus=owner-action");
  assert.equal(ownerAction.sourceEventId, "owner-action-required:marushu/vtdd-v2-p:issue-637-passkey-needed");

  const aiNews = buildDashboardWebPushPayload({
    id: "ai-news:morning:2026-05-28",
    kind: "ai_news_radar",
    repository: "marushu/vtdd-v2-p",
    workflowName: "ai-news-morning",
    status: "completed",
    conclusion: "success",
    title: "OpenAI Skills が Codex 運用に入った",
    changeSummary: "Skills を VTDD のドリフト防止に使う"
  });
  assert.equal(aiNews.title, "AI news 朝刊: Skills を VTDD のドリフト防止に使う");
  assert.equal(aiNews.body.includes("詳細は AI news"), true);
  assert.equal(aiNews.url, "/dashboard/news");
  assert.equal(aiNews.sourceEventId, "ai-news:morning:2026-05-28");

  const runner = buildDashboardWebPushPayload({
    kind: "vps_runner_execution",
    repository: "marushu/vtdd-v2-p",
    workflowName: "vps-runner",
    runId: "remote-codex-issue514",
    status: "running",
    conclusion: "",
    headBranch: "codex/514-push-notification-copy",
    title: "VPS Codex CLI が作業を開始しました"
  });
  assert.equal(runner.title, "VPS 実行中: vtdd-v2-p");
  assert.equal(runner.body.includes("VPS Codex CLI が作業を開始しました"), true);
  assert.equal(runner.body.includes("workflow: vps-runner"), true);
  assert.equal(runner.body.includes("branch: codex/514-push-notification-copy"), true);
});

test("worker reports server-side dashboard Web Push configuration blockers", async () => {
  const store = createInMemoryDashboardPushSubscriptionStore();
  const endpoint = "https://push.example/send/endpoint-hash";
  await store.put({
    endpointHash: await sha256HexTest(endpoint),
    endpoint,
    p256dh: "p256dh-key",
    auth: "auth-key",
    ownerIdentity: "owner@example.com",
    updatedAt: new Date().toISOString()
  });
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/push/test", {
      method: "POST",
      headers: { ...dashboardAccessHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "server push test", endpoint })
    }),
    {
      ...dashboardAccessEnv,
      DASHBOARD_PUSH_SUBSCRIPTION_STORE: store
    }
  );
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.webPush.error, "dashboard_web_push_vapid_unconfigured");
});

test("worker cleans up stale dashboard Web Push subscriptions rejected by push service", async () => {
  const store = createInMemoryDashboardPushSubscriptionStore();
  const endpoint = "https://push.example/send/stale-endpoint-hash";
  const pushKeys = await createTestPushSubscription({
    endpointHash: await sha256HexTest(endpoint),
    endpoint
  });
  await store.put(pushKeys.subscription);
  const vapidEnv = await createTestVapidEnv({
    DASHBOARD_WEB_PUSH_FETCH: async () => new Response(null, { status: 410 })
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/push/test", {
      method: "POST",
      headers: { ...dashboardAccessHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "server push test", endpoint })
    }),
    {
      ...dashboardAccessEnv,
      ...vapidEnv,
      DASHBOARD_PUSH_SUBSCRIPTION_STORE: store
    }
  );

  assert.equal(response.status, 410);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.webPush.delivered, 0);
  assert.equal(body.webPush.cleaned, 1);
  assert.equal(body.webPush.results[0].stale, true);
  assert.equal(body.webPush.results[0].cleaned, true);
  assert.equal(store.subscriptions.has(pushKeys.subscription.endpointHash), false);
});

test("worker redacts dashboard push subscription raw material from D1 payload_json", async () => {
  const prepared = [];
  const d1 = {
    async exec(statement) {
      prepared.push({ type: "exec", statement });
      return {};
    },
    prepare(statement) {
      const call = { type: "prepare", statement, values: [] };
      prepared.push(call);
      return {
        bind(...values) {
          call.values = values;
          return {
            async run() {
              return {};
            }
          };
        }
      };
    }
  };

  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/push/subscription", {
      method: "POST",
      headers: {
        ...dashboardAccessHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        subscription: {
          endpoint: "https://push.example/subscription/raw-endpoint",
          keys: { p256dh: "raw-p256dh-key", auth: "raw-auth-key" }
        }
      })
    }),
    {
      ...dashboardAccessEnv,
      VTDD_MEMORY_D1: d1
    }
  );

  assert.equal(response.status, 202);
  const insert = prepared.find((call) =>
    String(call.statement || "").includes("INSERT OR REPLACE INTO vtdd_dashboard_push_subscriptions")
  );
  assert.ok(insert);
  const payloadJson = insert.values[8];
  assert.equal(payloadJson.includes("raw-endpoint"), false);
  assert.equal(payloadJson.includes("raw-p256dh-key"), false);
  assert.equal(payloadJson.includes("raw-auth-key"), false);
  assert.equal(payloadJson.includes("stored_in_columns_for_server_side_web_push_send_only"), true);
});

test("worker ingests GitHub Actions deploy completion event and shows it on dashboard", async () => {
  const store = createInMemoryDashboardEventStore();
  const pushStore = createInMemoryDashboardPushSubscriptionStore();
  const pushKeys = await createTestPushSubscription({
    endpointHash: "deploy-push-endpoint",
    endpoint: "https://push.example/send/deploy"
  });
  await pushStore.put(pushKeys.subscription);
  const pushCalls = [];
  const vapidEnv = await createTestVapidEnv({
    DASHBOARD_WEB_PUSH_FETCH: async (input, init) => {
      pushCalls.push({ input, init });
      return new Response(null, { status: 201 });
    }
  });
  const eventResponse = await worker.fetch(
    new Request("https://example.com/v2/events/github-actions", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "marushu/vtdd-v2-p",
        workflowName: "deploy-production",
        runId: "26133044458",
        runUrl: "https://github.com/marushu/vtdd-v2-p/actions/runs/26133044458",
        status: "completed",
        conclusion: "success",
        headSha: "ef55709c4f52b54f436417acc239ec03a0c999fd",
        headBranch: "main",
        displayTitle: "dashboard: 通知カードにPR概要を出す (#534)",
        changeSummary: "dashboard: 通知カードにPR概要を出す (#534)",
        pullNumber: 552,
        updatedAt: "2026-05-20T00:10:01Z",
        approvalGrantId: "approval:must-not-persist",
        token: "secret-must-not-persist"
      })
    }),
    {
      ...gatewayAuthEnv,
      ...vapidEnv,
      DASHBOARD_EVENT_STORE: store,
      DASHBOARD_PUSH_SUBSCRIPTION_STORE: pushStore
    }
  );

  assert.equal(eventResponse.status, 202);
  const eventBody = await eventResponse.json();
  assert.equal(eventBody.ok, true);
  assert.equal(eventBody.event.runId, "26133044458");
  assert.equal(eventBody.event.pullNumber, 552);
  assert.equal(eventBody.event.changeSummary, "dashboard: 通知カードにPR概要を出す (#534)");
  assert.equal(eventBody.webPush.delivered, 1);
  assert.equal(eventBody.event.pwaNotificationStatus, "sent");
  assert.equal(eventBody.event.pwaNotificationAttempted, 1);
  assert.equal(eventBody.event.pwaNotificationDelivered, 1);
  assert.equal(pushCalls.length, 1);
  assert.equal(pushCalls[0].input, "https://push.example/send/deploy");
  assert.match(pushCalls[0].init.headers.authorization, /^vapid t=.+, k=.+/);
  assert.equal(pushCalls[0].init.headers["content-encoding"], "aes128gcm");
  const decryptedPush = JSON.parse(await decryptTestWebPushPayload(pushCalls[0].init.body, pushKeys));
  assert.equal(decryptedPush.title, "デプロイ完了: PR #552 dashboard: 通知カードにPR概要を出す (#534)");
  assert.equal(decryptedPush.body.includes("dashboard: 通知カードにPR概要を出す"), true);
  assert.equal(decryptedPush.body.includes("PR #552"), true);
  assert.equal(decryptedPush.body.includes("workflow: deploy-production"), true);
  assert.equal(decryptedPush.url, "https://github.com/marushu/vtdd-v2-p/pull/552");
  assert.equal(decryptedPush.sourceEventId, "github-actions:marushu/vtdd-v2-p:deploy-production:26133044458");
  assert.equal(decryptedPush.kind, "github_actions_workflow_run");
  assert.equal(decryptedPush.repository, "marushu/vtdd-v2-p");
  assert.equal(decryptedPush.workflowName, "deploy-production");
  assert.equal(decryptedPush.runId, "26133044458");
  assert.equal(decryptedPush.status, "completed");
  assert.equal(decryptedPush.conclusion, "success");
  assert.equal(decryptedPush.pullNumber, 552);
  assert.equal("approvalGrantId" in eventBody.event, false);
  assert.equal("token" in eventBody.event, false);
  const storedDeployEvent = await store.latest({
    kind: "github_actions_workflow_run",
    repository: "marushu/vtdd-v2-p",
    workflowName: "deploy-production"
  });
  assert.equal(storedDeployEvent.pwaNotificationStatus, "sent");
  assert.equal(storedDeployEvent.pwaNotificationAttempted, 1);
  assert.equal(storedDeployEvent.pwaNotificationDelivered, 1);

  const dashboardResponse = await worker.fetch(
    new Request("https://example.com/dashboard", {
      headers: dashboardAccessHeaders
    }),
    {
      ...dashboardAccessEnv,
      DASHBOARD_EVENT_STORE: store
    }
  );
  assert.equal(dashboardResponse.status, 200);
  const dashboardBody = await dashboardResponse.text();
  assert.equal(dashboardBody.includes("最新 deploy"), true);
  assert.equal(dashboardBody.includes("success"), true);
  assert.equal(dashboardBody.includes("ef55709"), true);
  assert.equal(dashboardBody.includes("デプロイ完了: PR #552 dashboard: 通知カードにPR概要を出す (#534)"), true);
  assert.equal(dashboardBody.includes("dashboard: 通知カードにPR概要を出す"), true);
  assert.equal(dashboardBody.includes("PR #552"), true);
  assert.equal(dashboardBody.includes("https://github.com/marushu/vtdd-v2-p/pull/552"), true);
  assert.equal(dashboardBody.includes("https://github.com/marushu/vtdd-v2-p/actions/runs/26133044458"), false);
  assert.equal(dashboardBody.includes("approval:must-not-persist"), false);
  assert.equal(dashboardBody.includes("secret-must-not-persist"), false);
  assert.equal(dashboardBody.includes("setInterval("), false);
  assert.equal(dashboardBody.includes("fetch(threadEndpoint"), true);

  const notificationsResponse = await worker.fetch(
    new Request("https://example.com/dashboard/notifications", {
      headers: dashboardAccessHeaders
    }),
    {
      ...dashboardAccessEnv,
      DASHBOARD_EVENT_STORE: store
    }
  );
  assert.equal(notificationsResponse.status, 200);
  const notificationsBody = await notificationsResponse.text();
  assert.equal(notificationsBody.includes("直近30件"), true);
  assert.equal(notificationsBody.includes("直近5分"), false);
  assert.equal(notificationsBody.includes("Web Push: push service accepted 1/1"), true);
  assert.equal(notificationsBody.includes("PWA受信確認: 未確認"), true);
});

test("worker records dashboard PWA push receive ack only for authenticated owner session", async () => {
  const store = createInMemoryDashboardEventStore();
  const unauthenticated = await worker.fetch(
    new Request("https://example.com/v2/dashboard/push/ack", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vtdd-dashboard-push-ack": "service-worker"
      },
      body: JSON.stringify({
        sourceEventId: "github-actions:marushu/vtdd-v2-p:deploy-production:26133044458",
        repository: "marushu/vtdd-v2-p",
        workflowName: "deploy-production",
        runId: "26133044458",
        title: "must not store"
      })
    }),
    {
      ...dashboardAccessEnv,
      DASHBOARD_EVENT_STORE: store
    }
  );
  assert.equal(unauthenticated.status, 401);
  assert.equal((await store.listRecent()).length, 0);

  const missingBoundary = await worker.fetch(
    new Request("https://example.com/v2/dashboard/push/ack", {
      method: "POST",
      headers: { ...dashboardAccessHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        sourceEventId: "github-actions:marushu/vtdd-v2-p:deploy-production:26133044458"
      })
    }),
    {
      ...dashboardAccessEnv,
      DASHBOARD_EVENT_STORE: store
    }
  );
  assert.equal(missingBoundary.status, 403);

  const invalidSource = await worker.fetch(
    new Request("https://example.com/v2/dashboard/push/ack", {
      method: "POST",
      headers: {
        ...dashboardAccessHeaders,
        "content-type": "application/json",
        "x-vtdd-dashboard-push-ack": "service-worker"
      },
      body: JSON.stringify({
        sourceEventId: "unknown-source",
        repository: "marushu/vtdd-v2-p"
      })
    }),
    {
      ...dashboardAccessEnv,
      DASHBOARD_EVENT_STORE: store
    }
  );
  assert.equal(invalidSource.status, 422);
  assert.equal((await store.listRecent()).length, 0);

  const pushCalls = [];
  const pushStore = createInMemoryDashboardPushSubscriptionStore();
  const pushKeys = await createTestPushSubscription({
    endpointHash: "ack-loop-endpoint",
    endpoint: "https://push.example/send/ack-loop"
  });
  await pushStore.put(pushKeys.subscription);
  const vapidEnv = await createTestVapidEnv({
    DASHBOARD_WEB_PUSH_FETCH: async (input, init) => {
      pushCalls.push({ input, init });
      return new Response(null, { status: 201 });
    }
  });
  const response = await worker.fetch(
    new Request("https://example.com/v2/dashboard/push/ack", {
      method: "POST",
      headers: {
        ...dashboardAccessHeaders,
        "content-type": "application/json",
        "x-vtdd-dashboard-push-ack": "service-worker"
      },
      body: JSON.stringify({
        sourceEventId: "github-actions:marushu/vtdd-v2-p:deploy-production:26133044458",
        repository: "marushu/vtdd-v2-p",
        workflowName: "deploy-production",
        runId: "26133044458",
        status: "completed",
        conclusion: "success",
        pullNumber: 552,
        tag: "vtdd-github-actions-workflow-run-26133044458",
        title: "デプロイ完了: PR #552 dashboard: 通知カードにPR概要を出す (#534)",
        body: "PWA Service Worker ack"
      })
    }),
    {
      ...dashboardAccessEnv,
      ...vapidEnv,
      DASHBOARD_EVENT_STORE: store,
      DASHBOARD_PUSH_SUBSCRIPTION_STORE: pushStore
    }
  );
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.ack.status, "received");
  const events = await store.listRecent();
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "dashboard_push_received");
  assert.equal(events[0].repository, "marushu/vtdd-v2-p");
  assert.equal(events[0].workflowName, "deploy-production");
  assert.equal(events[0].runId, "26133044458");
  assert.equal(events[0].pullNumber, 552);
  assert.equal(JSON.stringify(events[0]).includes("secret"), false);
  assert.equal(pushCalls.length, 0);

  const notificationsResponse = await worker.fetch(
    new Request("https://example.com/dashboard/notifications", {
      headers: dashboardAccessHeaders
    }),
    {
      ...dashboardAccessEnv,
      DASHBOARD_EVENT_STORE: store
    }
  );
  assert.equal(notificationsResponse.status, 200);
  const notificationsBody = await notificationsResponse.text();
  assert.equal(notificationsBody.includes("PWA受信確認: あり"), true);
  assert.equal(notificationsBody.includes("直近30件"), true);
});

test("worker rejects GitHub Actions deploy completion event without machine auth", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/events/github-actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repository: "marushu/vtdd-v2-p",
        workflowName: "deploy-production",
        runId: "26133044458",
        status: "completed",
        conclusion: "success"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_EVENT_STORE: createInMemoryDashboardEventStore()
    }
  );

  assert.equal(response.status, 401);
});

test("worker does not infer PR number from issue-style parenthetical summary", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/events/github-actions", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "marushu/vtdd-v2-p",
        workflowName: "deploy-production",
        runId: "26133049999",
        status: "completed",
        conclusion: "success",
        displayTitle: "dashboard: 通知カードにPR概要を出す (#534)",
        changeSummary: "dashboard: 通知カードにPR概要を出す (#534)",
        updatedAt: "2026-05-20T00:11:01Z"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_EVENT_STORE: createInMemoryDashboardEventStore()
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.event.pullNumber, null);
  assert.equal(body.event.issueNumber, null);
});

test("worker ingests VPS runner event into notifications and Butler chat thread", async () => {
  const eventStore = createInMemoryDashboardEventStore();
  const chatStore = createInMemoryDashboardChatStore();
  const rooms = createMockDashboardChatRoomNamespace();
  const eventResponse = await worker.fetch(
    new Request("https://example.com/v2/events/vps-runner", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "marushu/vtdd-v2-p",
        executionId: "remote-codex-issue452-chat",
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        issueNumber: 452,
        status: "running",
        currentStep: "codex_subprocess",
        lastEvent: "codex_started",
        branch: "codex/issue-452-vps-runner-chat-events",
        progressUrl:
          "https://vtdd-v2-mvp.example/progress/remote-codex-issue452-chat?token=secret-must-not-persist",
        message:
          "VPS Codex CLI が作業を開始しました。approval:15b6f20d-11b6-4f8b-8008-99e7d7397452",
        updatedAt: new Date(Date.now() - 60 * 1000).toISOString()
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_EVENT_STORE: eventStore,
      DASHBOARD_CHAT_STORE: chatStore,
      DASHBOARD_CHAT_ROOMS: rooms.namespace
    }
  );

  assert.equal(eventResponse.status, 202);
  const eventBody = await eventResponse.json();
  assert.equal(eventBody.ok, true);
  assert.equal(eventBody.event.kind, "vps_runner_execution");
  assert.equal(eventBody.event.repository, "marushu/vtdd-v2-p");
  assert.equal(eventBody.event.runId, "remote-codex-issue452-chat");
  assert.equal(eventBody.event.status, "running");
  assert.equal(eventBody.event.pwaNotificationStatus, "pwa_notification_unavailable");
  assert.equal(eventBody.event.pwaNotificationError, "dashboard_push_subscription_store_unavailable");
  assert.equal(eventBody.event.pwaNotificationAttempted, 0);
  assert.equal(eventBody.event.pwaNotificationDelivered, 0);
  assert.equal(eventBody.event.runUrl.includes("secret-must-not-persist"), false);
  assert.equal(JSON.stringify(eventBody).includes("approval:15b6f20d"), false);
  assert.equal(JSON.stringify(eventBody).includes("secret-must-not-persist"), false);
  assert.equal(eventBody.threadId, "dashboard-main-marushu-vtdd-v2-p");
  assert.equal(eventBody.webSocketBroadcast, true);
  assert.equal(eventBody.webPush.ok, false);
  assert.equal(eventBody.webPush.error, "dashboard_push_subscription_store_unavailable");
  const storedRunnerEvent = await eventStore.latest({
    kind: "vps_runner_execution",
    repository: "marushu/vtdd-v2-p"
  });
  assert.equal(storedRunnerEvent.pwaNotificationStatus, "pwa_notification_unavailable");
  assert.equal(storedRunnerEvent.pwaNotificationError, "dashboard_push_subscription_store_unavailable");
  assert.equal(eventBody.messages[0].role, "runner");
  assert.equal(eventBody.messages[0].status, "thinking");
  assert.equal(eventBody.messages[0].relatedIssue, 452);
  assert.equal(eventBody.messages[0].text.includes("VPS Codex CLI"), true);
  assert.equal(eventBody.messages[0].text.includes("\n状態:\n- repo: marushu/vtdd-v2-p"), true);
  assert.equal(eventBody.messages[0].text.includes("- status: 実行中"), true);
  assert.equal(eventBody.messages[0].text.includes("\n本文:\nVPS Codex CLI が作業を開始しました。"), true);
  assert.equal(eventBody.messages[0].text.includes("codex_subprocess"), true);
  assert.equal(rooms.calls.length, 1);
  assert.equal(rooms.calls[0].name, "dashboard-main-marushu-vtdd-v2-p");
  assert.equal(String(rooms.calls[0].input), "https://dashboard-chat-room.internal/broadcast");
  const broadcastBody = JSON.parse(rooms.calls[0].init.body);
  assert.equal(broadcastBody.threadId, "dashboard-main-marushu-vtdd-v2-p");
  assert.equal(broadcastBody.messages[0].role, "runner");

  const chatResponse = await worker.fetch(
    new Request("https://example.com/v2/dashboard/chat/dashboard-main-marushu-vtdd-v2-p", {
      headers: dashboardAccessHeaders
    }),
    { ...dashboardAccessEnv, DASHBOARD_CHAT_STORE: chatStore }
  );
  assert.equal(chatResponse.status, 200);
  const chatBody = await chatResponse.json();
  assert.equal(chatBody.messages.length, 1);
  assert.equal(chatBody.messages[0].role, "runner");
  assert.equal(JSON.stringify(chatBody).includes("approval:15b6f20d"), false);
  assert.equal(JSON.stringify(chatBody).includes("secret-must-not-persist"), false);

  const notificationsResponse = await worker.fetch(
    new Request("https://example.com/dashboard/notifications", {
      headers: dashboardAccessHeaders
    }),
    { ...dashboardAccessEnv, DASHBOARD_EVENT_STORE: eventStore }
  );
  assert.equal(notificationsResponse.status, 200);
  const notificationsBody = await notificationsResponse.text();
  assert.equal(notificationsBody.includes("通知センター"), true);
  assert.equal(notificationsBody.includes("remote-codex-issue452-chat"), true);
  assert.equal(notificationsBody.includes("marushu/vtdd-v2-p"), true);
  assert.equal(notificationsBody.includes("codex_subprocess"), true);
  assert.equal(notificationsBody.includes("secret-must-not-persist"), false);
});

test("worker rejects VPS runner event without machine auth", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/events/vps-runner", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repository: "marushu/vtdd-v2-p",
        executionId: "remote-codex-issue452-chat",
        status: "running"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_EVENT_STORE: createInMemoryDashboardEventStore(),
      DASHBOARD_CHAT_STORE: createInMemoryDashboardChatStore()
    }
  );

  assert.equal(response.status, 401);
});

test("worker rolls back VPS runner notification when Butler chat append fails", async () => {
  const eventStore = createInMemoryDashboardEventStore();
  const chatStore = {
    async appendMany() {
      throw new Error("chat append failed");
    },
    async listThread() {
      return [];
    }
  };

  const response = await worker.fetch(
    new Request("https://example.com/v2/events/vps-runner", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "marushu/vtdd-v2-p",
        executionId: "remote-codex-issue452-partial-write",
        threadId: "dashboard-main-marushu-vtdd-v2-p",
        issueNumber: 452,
        status: "running",
        currentStep: "codex_subprocess"
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_EVENT_STORE: eventStore,
      DASHBOARD_CHAT_STORE: chatStore
    }
  );

  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "dashboard_event_chat_append_failed");
  assert.equal(body.rollback.notificationDeleted, true);

  const latest = await eventStore.latest({
    kind: "vps_runner_execution",
    repository: "marushu/vtdd-v2-p",
    workflowName: "vps-runner"
  });
  assert.equal(latest, null);
});

test("worker setup recovery page opens without Action auth and defaults to VTDD repo", async () => {
  const response = await worker.fetch(new Request("https://example.com/setup/recovery"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const html = await response.text();
  assert.equal(html.includes("VTDD Butler setup recovery"), true);
  assert.equal(html.includes("Recovery repo: marushu/vtdd-v2-p"), true);
  assert.equal(html.includes("setup/latest"), true);
  assert.equal(html.includes("setup/known-good"), true);
  assert.equal(html.includes("name=\"repository\""), false);
  assert.equal(html.includes("Bearer test-token"), false);
});

test("worker help guide opens without Action auth and documents safe operation boundaries", async () => {
  const response = await worker.fetch(new Request("https://example.com/help"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const html = await response.text();
  assert.equal(html.includes("VTDD help guide"), true);
  assert.equal(html.includes("Butler -> Worker"), true);
  assert.equal(html.includes("passkey approval required"), true);
  assert.equal(html.includes("setup/latest"), true);
  assert.equal(html.includes("setup/known-good"), true);
  assert.equal(html.includes("Cloudflare 上のページ一覧"), true);
  assert.equal(html.includes("vtddRetrieveCloudflarePages"), true);
  assert.equal(html.includes("fork / clone して使う場合"), true);
  assert.equal(html.includes("shared hosted runtime ではありません"), true);
  assert.equal(html.includes("No secret values, tokens, approval grants"), true);
  assert.equal(html.includes("vtdd.hibou-web.com"), false);
  assert.equal(html.includes("Bearer test-token"), false);
});

test("worker returns Butler-facing Cloudflare page directory", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/cloudflare-pages", {
      headers: gatewayAuthHeaders
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.runtimeOrigin, "https://example.com");
  assert.equal(body.naturalLanguageIntent, "今 Cloudflare にあるページを一覧して");
  assert.equal(body.listMeaning, "worker_hosted_human_pages");
  assert.equal(body.notIncluded.includes("secrets"), true);
  assert.equal(body.notIncluded.includes("owner-specific runtime defaults"), true);
  assert.equal(body.pages.some((page) => page.path === "/help"), true);
  assert.equal(body.pages.some((page) => page.path === "/setup/latest"), true);
  assert.equal(body.pages.some((page) => page.path === "/setup/known-good"), true);
  assert.equal(body.pages.some((page) => page.path === "/setup/diagnostics"), true);
  assert.equal(body.pages.some((page) => page.id === "deploy_operator"), true);
  assert.equal(
    body.pages.some(
      (page) =>
        page.id === "deploy_operator" &&
        page.path.includes("repositoryInput=marushu%2Fvtdd-v2-p")
    ),
    true
  );
  assert.equal(JSON.stringify(body).includes("vtdd.hibou-web.com"), false);
  assert.equal(JSON.stringify(body).includes("Bearer test-token"), false);
});

test("worker MCP initialize returns tools capability and server info", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/mcp", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "codex", version: "test" }
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("mcp-protocol-version"), "2025-03-26");
  const body = await response.json();
  assert.equal(body.result.serverInfo.name, "vtdd-mcp");
  assert.equal(body.result.capabilities.tools.listChanged, true);
});

test("worker MCP GET returns machine-endpoint guidance instead of plain text 405", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/mcp", {
      method: "GET",
      headers: gatewayAuthHeaders
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
  const body = await response.json();
  assert.equal(body.error, "mcp_post_required");
  assert.equal(body.protectedResourceMetadataUrl, "https://example.com/.well-known/oauth-protected-resource/mcp");
});

test("worker MCP GET with SSE accept still returns 405 for stateless JSON mode", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/mcp", {
      method: "GET",
      headers: {
        ...gatewayAuthHeaders,
        accept: "text/event-stream"
      }
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 405);
  const body = await response.json();
  assert.equal(body.error, "mcp_post_required");
});

test("worker MCP protected resource metadata endpoint is available", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/.well-known/oauth-protected-resource/mcp", {
      method: "GET"
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.resource, "https://example.com/mcp");
  assert.equal(body.resource_name, "VTDD MCP");
  assert.equal(body.resource_documentation, "https://example.com/help#paths");
  assert.deepEqual(body.bearer_methods_supported, ["header"]);
  assert.equal("authorization_servers" in body, false);
});

test("worker MCP unauthorized response advertises protected resource metadata", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 99,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "codex", version: "test" }
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get("www-authenticate"),
    'Bearer realm="vtdd-mcp", resource_metadata="https://example.com/.well-known/oauth-protected-resource/mcp"'
  );
});

test("worker MCP tools/list exposes shared VTDD retrieval catalog", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/mcp", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  const names = body.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, [
    "vtdd_runtime_truth",
    "vtdd_review_truth",
    "vtdd_search_operational_memory",
    "vtdd_recall_implementation",
    "vtdd_pr_status",
    "vtdd_issue_status"
  ]);
});

test("worker MCP search_operational_memory tool reuses operational memory retrieval", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "operational-memory-mcp-1",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "MCP clients should read the same runtime truth as Butler.",
      rationale: "Shared memory parity is the point of vtdd-mcp-ver."
    },
    metadata: { repository: "sample-org/vtdd-v2-p" },
    priority: 95,
    tags: ["decision_log", "mcp", "parity"],
    createdAt: "2026-05-12T00:00:00Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/mcp", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "vtdd_search_operational_memory",
          arguments: {
            text: "runtime truth parity",
            repository: "sample-org/vtdd-v2-p",
            currentState: "MCP route under implementation",
            runtimeTruthSource: "github_app"
          }
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  const payload = JSON.parse(body.result.content[0].text);
  assert.equal(body.result.isError, false);
  assert.deepEqual(body.result.structuredContent, payload);
  assert.equal(payload.ok, true);
  assert.equal(payload.memoryUseRule, "runtime_truth_current_state_overrides_memory_background_reference");
  assert.equal(payload.compactContext[0].id, "operational-memory-mcp-1");
});

test("worker MCP review_truth tool returns review synthesis from GitHub runtime truth", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/mcp", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "vtdd_review_truth",
          arguments: {
            repository: "sample-org/vtdd-v2-p",
            pullNumber: 46
          }
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_pull_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/repos/sample-org/vtdd-v2-p/pulls/46")) {
          return new Response(
            JSON.stringify({
              number: 46,
              title: "Issue #318: Add VTDD MCP gateway",
              state: "open",
              draft: false,
              head: { ref: "codex/issue-318-vtdd-mcp-gateway", sha: "abc123" },
              base: { ref: "main", sha: "def456" },
              mergeable: true,
              mergeable_state: "clean",
              html_url: "https://github.com/sample-org/vtdd-v2-p/pull/46"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (parsed.pathname.endsWith("/repos/sample-org/vtdd-v2-p/pulls/46/reviews")) {
          return new Response(
            JSON.stringify([
              {
                id: 1,
                state: "APPROVED",
                body: "looks good",
                user: { login: "reviewer" },
                submitted_at: "2026-05-12T01:00:00Z",
                html_url: "https://github.com/sample-org/vtdd-v2-p/pull/46#pullrequestreview-1"
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (parsed.pathname.endsWith("/repos/sample-org/vtdd-v2-p/issues/46/comments")) {
          return new Response(
            JSON.stringify([
              {
                id: 10,
                body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini Critical Review\n\n- Head SHA: `abc123`\n- Recommended action: `approve`",
                user: { login: "vtdd-codex[bot]" },
                created_at: "2026-05-12T01:10:00Z",
                updated_at: "2026-05-12T01:10:00Z",
                html_url: "https://github.com/sample-org/vtdd-v2-p/pull/46#issuecomment-1"
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (parsed.pathname.endsWith("/repos/sample-org/vtdd-v2-p/pulls/46/comments")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        throw new Error(`unexpected GitHub API url: ${parsed.pathname}`);
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  const payload = JSON.parse(body.result.content[0].text);
  assert.equal(body.result.isError, false);
  assert.equal(payload.reviewTruth.reviewerStatus, "gemini_review_available");
  assert.equal(payload.reviewTruth.reviewerSignalTruth.mergeReviewTruth.blocked, false);
  assert.equal(payload.butlerReviewSynthesis.available, true);
});

test("worker MCP recall_implementation combines structured memory with GitHub runtime truth", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "decision-318-recall",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "MCP implementation recall must be sourced from structured memory and runtime truth.",
      rationale: "Butler, Mac Codex, and VPS Codex CLI need the same answer without chat history.",
      relatedIssue: 318,
      decidedBy: "owner",
      timestamp: "2026-05-13T02:00:00Z",
      supersededBy: null
    },
    metadata: { repository: "sample-org/vtdd-v2-p" },
    priority: 95,
    tags: ["decision_log", "issue:318"],
    createdAt: "2026-05-13T02:00:00Z"
  });
  await provider.store({
    id: "proposal-318-recall",
    type: MemoryRecordType.PROPOSAL_LOG,
    content: {
      hypothesis: "Reviewer objections are resolved by proving the MCP recall path with an E2E-shaped worker test.",
      options: ["memory-only", "memory-plus-runtime"],
      rejectedReasons: [{ option: "memory-only", reason: "runtime status would be stale" }],
      concerns: ["recall drift"],
      unresolvedQuestions: [],
      relatedIssue: 318,
      proposedBy: "owner",
      timestamp: "2026-05-13T02:05:00Z"
    },
    metadata: { repository: "sample-org/vtdd-v2-p" },
    priority: 90,
    tags: ["proposal_log", "issue:318"],
    createdAt: "2026-05-13T02:05:00Z"
  });
  await provider.store({
    id: "execution-318-pr331",
    type: MemoryRecordType.EXECUTION_LOG,
    content: {
      summary: "PR #331 fixed the canonical live parity verification prompt.",
      relatedIssue: 318,
      prNumber: 331,
      commits: ["ba9ea30"],
      files: ["docs/architecture/vtdd-mcp-ver.md", "test/vtdd-mcp-ver-architecture.test.js"],
      tests: ["node --test test/vtdd-mcp-ver-architecture.test.js"],
      evidence: ["https://github.com/sample-org/vtdd-v2-p/pull/331"]
    },
    metadata: {
      kind: "pr_context",
      repository: "sample-org/vtdd-v2-p",
      relatedIssue: 318,
      prNumber: 331
    },
    priority: 88,
    tags: ["pr_context", "issue:318", "pr:331"],
    createdAt: "2026-05-13T02:10:00Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/mcp", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "vtdd_recall_implementation",
          arguments: {
            repository: "sample-org/vtdd-v2-p",
            issueNumber: 318,
            pullNumber: 331,
            text: "live parity verification prompt",
            limit: 8
          }
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_recall_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/repos/sample-org/vtdd-v2-p/issues/318")) {
          return new Response(
            JSON.stringify({
              number: 318,
              title: "epic: vtdd-mcp-ver",
              body: "Implementation recall must not depend on chat history.",
              state: "open",
              html_url: "https://github.com/sample-org/vtdd-v2-p/issues/318",
              user: { login: "owner" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (parsed.pathname.endsWith("/repos/sample-org/vtdd-v2-p/pulls/331")) {
          return new Response(
            JSON.stringify({
              number: 331,
              title: "Issue #318: define MCP live parity verification",
              state: "closed",
              draft: false,
              merged: true,
              merged_at: "2026-05-13T01:35:00Z",
              merge_commit_sha: "merge331",
              head: { ref: "codex/issue-318-mcp-live-parity", sha: "head331" },
              base: { ref: "main", sha: "base331" },
              html_url: "https://github.com/sample-org/vtdd-v2-p/pull/331"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`unexpected GitHub API url: ${parsed.pathname}`);
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  const payload = JSON.parse(body.result.content[0].text);
  assert.equal(body.result.isError, false);
  assert.deepEqual(body.result.structuredContent, payload);
  assert.equal(payload.repository, "sample-org/vtdd-v2-p");
  assert.equal(payload.issueNumber, 318);
  assert.equal(payload.pullNumber, 331);
  assert.equal(payload.runtimeStatus, "merged");
  assert.deepEqual(payload.commits, ["head331", "merge331", "ba9ea30"]);
  assert.deepEqual(payload.files, [
    "docs/architecture/vtdd-mcp-ver.md",
    "test/vtdd-mcp-ver-architecture.test.js"
  ]);
  assert.deepEqual(payload.tests, ["node --test test/vtdd-mcp-ver-architecture.test.js"]);
  assert.equal(
    payload.decisions.includes(
      "MCP implementation recall must be sourced from structured memory and runtime truth."
    ),
    true
  );
  assert.equal(
    payload.reviewerResolutions.includes(
      "Reviewer objections are resolved by proving the MCP recall path with an E2E-shaped worker test."
    ),
    true
  );
  assert.equal(
    payload.evidence.includes("https://github.com/sample-org/vtdd-v2-p/pull/331"),
    true
  );
  assert.equal(payload.relatedIssue.title, "epic: vtdd-mcp-ver");
  assert.equal(payload.relatedPullRequest.merged, true);
});

test("worker guide alias opens the same help guide surface", async () => {
  const response = await worker.fetch(new Request("https://example.com/guide"));

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("VTDD help guide"), true);
  assert.equal(html.includes("Runtime: https://example.com"), true);
});

test("worker setup latest page renders copy-ready schema and short-min bundle for VTDD repo", async () => {
  const canonicalOpenApi = [
    "openapi: 3.1.1",
    "servers:",
    "  - url: https://your-runtime-host.example.workers.dev",
    "paths:",
    "  /health:",
    "    get:",
    "      operationId: getHealth",
    "  /v2/retrieve/cloudflare-pages:",
    "    get:",
    "      operationId: vtddRetrieveCloudflarePages",
    "  /v2/retrieve/setup-artifact:",
    "    get:",
    "      operationId: vtddRetrieveSetupArtifact",
    "  /v2/retrieve/self-parity:",
    "    get:",
    "      operationId: vtddRetrieveSelfParity"
  ].join("\n");
  const canonicalInstructions = [
    "vtddRetrieveCloudflarePages",
    "vtddRetrieveSetupArtifact",
    "vtddRetrieveSelfParity",
    "Action Schema update required",
    "Instructions update required",
    "Cloudflare deploy update required"
  ].join("\n");
  const shortMin = "VTDD Butler short-min instructions";

  const response = await worker.fetch(
    new Request("https://example.com/setup/latest?ref=main"),
    {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        assert.equal(parsed.pathname.startsWith("/repos/marushu/vtdd-v2-p/"), true);
        if (parsed.pathname.endsWith("/docs/setup/known-good.json")) {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }
        if (parsed.pathname.endsWith("/commits/main")) {
          return new Response(JSON.stringify({ sha: "b".repeat(40) }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        const isShortMin = parsed.pathname.endsWith(
          "/docs/setup/custom-gpt-instructions-short-min.md"
        );
        const isInstructions = parsed.pathname.endsWith("/docs/setup/custom-gpt-instructions.md");
        return new Response(
          JSON.stringify({
            sha: isShortMin ? "short-min-sha" : isInstructions ? "instructions-sha" : "openapi-sha",
            encoding: "base64",
            content: Buffer.from(
              isShortMin ? shortMin : isInstructions ? canonicalInstructions : canonicalOpenApi,
              "utf8"
            ).toString("base64")
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("latest setup bundle"), true);
  assert.equal(html.includes("Recovery repo: marushu/vtdd-v2-p"), true);
  assert.equal(html.includes("Copy-ready Action Schema"), true);
  assert.equal(html.includes("Copy-ready custom-gpt-instructions-short-min.md"), true);
  assert.equal(html.includes("  - url: https://example.com"), true);
  assert.equal(html.includes("VTDD Butler short-min instructions"), true);
  const actionSchemaTextarea = html.match(
    /<textarea id="action-schema" spellcheck="false">([\s\S]*?)<\/textarea>/
  )?.[1];
  const instructionsTextarea = html.match(
    /<textarea id="instructions-short-min" spellcheck="false">([\s\S]*?)<\/textarea>/
  )?.[1];
  assert.equal(actionSchemaTextarea?.includes("openapi: 3.1.1"), true);
  assert.equal(actionSchemaTextarea?.includes("  - url: https://example.com"), true);
  assert.equal(actionSchemaTextarea?.includes("openapi%3A"), false);
  assert.equal(actionSchemaTextarea?.includes("%20-%20url"), false);
  assert.equal(actionSchemaTextarea?.includes("[Open deploy operator]"), false);
  assert.equal(instructionsTextarea?.includes(shortMin), true);
  assert.equal(instructionsTextarea?.includes("VTDD%20Butler"), false);
  assert.equal(html.includes("URL separation"), true);
  assert.equal(html.includes("Action Schema server URL"), true);
  assert.equal(html.includes("Custom GPT Action Authentication"), true);
  assert.equal(html.includes("Authentication type"), true);
  assert.equal(html.includes("Auth type"), true);
  assert.equal(html.includes("Authorization: Bearer &lt;VTDD_GATEWAY_BEARER_TOKEN&gt;"), true);
  assert.equal(html.includes("Unauthenticated route"), true);
  assert.equal(html.includes("copy payload: raw YAML, not URL encoded"), true);
  assert.equal(html.includes("copy payload: raw Markdown, not URL encoded"), true);
  assert.equal(html.includes("Bundle commit"), true);
  assert.equal(html.includes("bundleCommitSha: " + "b".repeat(40)), true);
  assert.equal(html.includes("knownGoodCommitSha: 未確認"), true);
  assert.equal(html.includes("Latest setup bundle metadata"), true);
  assert.equal(html.includes("Rollback copy-ready bundle は /setup/known-good でのみ表示します。"), true);
  assert.equal(html.includes("Known-good rollback bundle"), false);
  assert.equal(html.includes("Action Schema length"), true);
  assert.equal(html.includes("instructionsShortMinLength:"), true);
  assert.equal(html.includes("Surface update checklist"), true);
  assert.equal(html.includes("Latest / known-good comparison"), true);
  assert.equal(html.includes("known_good_unavailable"), true);
  assert.equal(html.includes("Cloudflare deploy"), true);
  assert.equal(html.includes("not_required"), true);
  assert.equal(html.includes("Custom GPT editor の現在値は runtime から読めない"), true);
  assert.equal(html.includes("unverified_editor_state"), true);
  assert.equal(html.includes("No secret values, tokens, or approval grants are displayed."), true);
  assert.equal(html.includes("ghs_setup_read"), false);
});

test("worker setup diagnostics page surfaces Action Schema and auth root-cause checks without Action auth", async () => {
  const canonicalOpenApi = [
    "openapi: 3.1.1",
    "servers:",
    "  - url: https://your-runtime-host.example.workers.dev",
    "components:",
    "  securitySchemes:",
    "    GatewayBearerAuth:",
    "      type: http",
    "      scheme: bearer",
    "paths:",
    "  /v2/retrieve/setup-artifact:",
    "    get:",
    "      operationId: vtddRetrieveSetupArtifact",
    "      parameters:",
    "        - name: responseMode",
    "          schema:",
    "            enum:",
    "              - action_visible",
    "  /v2/retrieve/self-parity:",
    "    get:",
    "      operationId: vtddRetrieveSelfParity",
    "  /v2/retrieve/setup-diagnostics:",
    "    get:",
    "      operationId: vtddRetrieveSetupDiagnostics",
    "  /v2/action/execute:",
    "    post:",
    "      operationId: vtddExecute",
    "      enum:",
    "        - build"
  ].join("\n");
  const canonicalInstructions = [
    "vtddRetrieveSelfParity",
    "vtddRetrieveSetupArtifact",
    "vtddRetrieveSetupDiagnostics",
    "Action Schema update required",
    "Instructions update required",
    "Cloudflare deploy update required",
    "ClientResponseError",
    "GatewayBearerAuth"
  ].join("\n");

  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/diagnostics?repository=marushu/vtdd-v2-p&error=ClientResponseError&httpStatus=401&reason=unauthorized"
    ),
    {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/docs/setup/known-good.json")) {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }
        const isInstructions = parsed.pathname.endsWith("/docs/setup/custom-gpt-instructions.md");
        return new Response(
          JSON.stringify({
            sha: isInstructions ? "instructions-sha" : "openapi-sha",
            encoding: "base64",
            content: Buffer.from(isInstructions ? canonicalInstructions : canonicalOpenApi, "utf8").toString(
              "base64"
            )
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("VTDD setup diagnostics"), true);
  assert.equal(html.includes("action_auth_bearer_missing_or_unverified"), true);
  assert.equal(html.includes("custom_gpt_action_transport_unverified"), true);
  assert.equal(html.includes("editor_state_unreadable"), true);
  assert.equal(html.includes("Action Schema checks"), true);
  assert.equal(html.includes("hasSetupDiagnostics"), true);
  assert.equal(html.includes("ghs_setup_read"), false);
});

test("worker setup known-good page renders rollback copy-ready bundle from known-good commit", async () => {
  const canonicalOpenApi = [
    "openapi: 3.1.1",
    "servers:",
    "  - url: https://your-runtime-host.example.workers.dev",
    "paths:",
    "  /health:",
    "    get:",
    "      operationId: getHealth",
    "  /v2/retrieve/cloudflare-pages:",
    "    get:",
    "      operationId: vtddRetrieveCloudflarePages",
    "  /v2/retrieve/setup-artifact:",
    "    get:",
    "      operationId: vtddRetrieveSetupArtifact",
    "  /v2/retrieve/self-parity:",
    "    get:",
    "      operationId: vtddRetrieveSelfParity"
  ].join("\n");
  const canonicalInstructions = [
    "vtddRetrieveCloudflarePages",
    "vtddRetrieveSetupArtifact",
    "vtddRetrieveSelfParity",
    "Action Schema update required",
    "Instructions update required",
    "Cloudflare deploy update required"
  ].join("\n");
  const shortMin = "VTDD Butler known-good short-min instructions";
  const knownGoodSha = "c".repeat(40);

  const response = await worker.fetch(new Request("https://example.com/setup/known-good"), {
    GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
    VTDD_KNOWN_GOOD_COMMIT_SHA: knownGoodSha,
    GITHUB_API_FETCH: async (url) => {
      const parsed = new URL(url);
      assert.equal(parsed.pathname.startsWith("/repos/marushu/vtdd-v2-p/"), true);
      assert.equal(parsed.searchParams.get("ref"), knownGoodSha);
      const isShortMin = parsed.pathname.endsWith(
        "/docs/setup/custom-gpt-instructions-short-min.md"
      );
      const isInstructions = parsed.pathname.endsWith("/docs/setup/custom-gpt-instructions.md");
      return new Response(
        JSON.stringify({
          sha: isShortMin ? "known-short-min-sha" : isInstructions ? "known-instructions-sha" : "known-openapi-sha",
          encoding: "base64",
          content: Buffer.from(
            isShortMin ? shortMin : isInstructions ? canonicalInstructions : canonicalOpenApi,
            "utf8"
          ).toString("base64")
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  });

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("known-good setup bundle"), true);
  assert.equal(html.includes("Known-good rollback bundle"), true);
  assert.equal(html.includes("Copy Rollback Bundle"), true);
  assert.equal(html.includes(`channel: known_good`), true);
  assert.equal(html.includes(`ref: ${knownGoodSha}`), true);
  assert.equal(html.includes(`bundleCommitSha: ${knownGoodSha}`), true);
  assert.equal(html.includes(`knownGoodCommitSha: ${knownGoodSha}`), true);
  assert.equal(html.includes("actionSchemaSourceSha: known-openapi-sha"), true);
  assert.equal(html.includes("instructionsShortMinSourceSha: known-short-min-sha"), true);
  assert.equal(html.includes(shortMin), true);
  assert.equal(html.includes("ghs_setup_read"), false);
});

test("worker setup known-good page does not silently treat main as known-good", async () => {
  const response = await worker.fetch(new Request("https://example.com/setup/known-good"), {
    GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
    GITHUB_API_FETCH: async (url) => {
      const parsed = new URL(url);
      assert.equal(parsed.pathname.endsWith("/docs/setup/known-good.json"), true);
      return new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }
  });

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("Known-good bundle is not configured yet."), true);
  assert.equal(html.includes("このページ自体は復旧導線として開けています。"), true);
  assert.equal(html.includes("known-good setup requires docs/setup/known-good.json"), true);
  assert.equal(html.includes("Open setup/latest instead"), true);
  assert.equal(html.includes("latestFallbackUrl: /setup/latest"), true);
  assert.equal(html.includes("Do not treat main/latest as known-good automatically."), true);
  assert.equal(html.includes("Copy-ready Action Schema"), false);
  assert.equal(html.includes("Copy-ready custom-gpt-instructions-short-min.md"), false);
  assert.equal(html.includes("Known-good rollback bundle"), false);
  assert.equal(html.includes("Latest setup bundle metadata"), false);
});

test("worker setup known-good page rejects malformed configured known-good refs", async () => {
  const response = await worker.fetch(new Request("https://example.com/setup/known-good"), {
    GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
    VTDD_KNOWN_GOOD_COMMIT_SHA: "main",
    GITHUB_API_FETCH: async () => {
      throw new Error("malformed known-good config must not fetch artifacts");
    }
  });

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("Known-good bundle is not configured yet."), true);
  assert.equal(html.includes("Open setup/latest instead"), true);
  assert.equal(html.includes("VTDD_KNOWN_GOOD_COMMIT_SHA must be a 40-character commit SHA"), true);
  assert.equal(html.includes("Copy Rollback Bundle"), false);
});

test("worker health reflects guarded absence mode when runtime env sets it", async () => {
  const response = await worker.fetch(new Request("https://example.com/health"), {
    VTDD_AUTONOMY_MODE: "guarded_absence"
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.autonomyMode, AutonomyMode.GUARDED_ABSENCE);
});

test("worker runs gateway route", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.EXECUTE] },
          approvalPhrase: "GO deploy request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "sample-org/vtdd-v2");
});

test("worker gateway attaches operational memory for conversation-time recall", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "working-memory-drift-450",
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      summary: "Dashboard Butler は app-server 本命で、codex exec fallback に戻すとドリフトする。",
      failureReasoning: {
        whatFailed: "Dashboard Butler を codex exec job runner wrapper として扱った。",
        whyFailed: "live app-server session の要求を見落とした。",
        inspectNextTime: "Issue #450 と app-server live path コメントを先に読む。"
      },
      relatedIssue: 450,
      repository: "sample-org/vtdd-v2"
    },
    metadata: {
      repository: "sample-org/vtdd-v2",
      relatedIssue: 450
    },
    priority: 92,
    tags: ["working_memory", "issue:450", "failure_map", "drift_guard"],
    createdAt: "2026-05-22T14:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "exploration",
        actorRole: ActorRole.EXECUTOR,
        conversation: {
          userText: "前回の開発コンテキストドリフトと失敗記憶を思い出して"
        },
        policyInput: {
          actionType: ActionType.READ,
          mode: "read_only",
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          runtimeTruth: { runtimeAvailable: false, safeFallbackChosen: true },
          consent: { grantedCategories: [ConsentCategory.READ] },
          issueTraceable: false
        }
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.conversationAssist.operationalMemoryRequest.enabled, true);
  assert.equal(body.retrievalReferences.operationalMemory.compactContext[0].id, "working-memory-drift-450");
  assert.equal(
    body.retrievalReferences.operationalMemory.memoryUseRule,
    "runtime_truth_current_state_overrides_memory_background_reference"
  );
});

test("worker gateway returns bounded operational memory inventory for memory amount questions", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "working-memory-count-1",
    type: MemoryRecordType.WORKING_MEMORY,
    content: { summary: "RAG checkpoint count sample." },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 60,
    tags: ["working_memory"],
    createdAt: "2026-05-22T14:10:00.000Z"
  });
  await provider.store({
    id: "repair-case-count-1",
    type: MemoryRecordType.REPAIR_CASE,
    content: { summary: "Failure repair memory count sample." },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 70,
    tags: ["repair_case", "failure_map"],
    createdAt: "2026-05-22T14:11:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "exploration",
        actorRole: ActorRole.EXECUTOR,
        conversation: {
          userText: "RAG の記憶は今どのくらいある？何件くらい？"
        },
        policyInput: {
          actionType: ActionType.READ,
          mode: "read_only",
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          runtimeTruth: { runtimeAvailable: false, safeFallbackChosen: true },
          consent: { grantedCategories: [ConsentCategory.READ] },
          issueTraceable: false
        }
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.conversationAssist.detectedIntent, "memory_status");
  assert.match(body.conversationAssist.responseGuide.caveat, /bounded visible count/);
  assert.equal(body.retrievalReferences.operationalMemoryInventory.countsByType.working_memory, 1);
  assert.equal(body.retrievalReferences.operationalMemoryInventory.countsByType.repair_case, 1);
  assert.equal(body.retrievalReferences.operationalMemoryInventory.totalVisibleCount, 2);
  assert.match(body.retrievalReferences.operationalMemoryInventory.note, /not total storage/);
});

test("worker gateway allows butler path when deterministic judgment order is satisfied", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE] },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "sample-org/vtdd-v2");
});

test("worker gateway still blocks Custom GPT payloads with noncanonical judgment model ids", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "gpt-5.5 thinking"
        },
        judgmentTrace: validButlerJudgmentTrace,
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE] },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "surface_must_not_override_judgment_model");
});

test("worker gateway returns PR revision loop guidance for Butler summaries", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true,
            runtimeState: {
              activeBranch: "codex/issue-4",
              pullRequest: {
                number: 42,
                url: "https://github.com/example/repo/pull/42",
                state: "open",
                title: "Connect reviewer loop",
                reviewCommentsCount: 3,
                unresolvedReviewCommentsCount: 2,
                updatedSinceReview: true,
                reviewer: "gemini",
                reviewComments: [
                  { user: { login: "gemini" }, body: "The reviewer loop still has unresolved objections." }
                ]
              }
            }
          },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE] },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.executionContinuity.codexGoal, "revise_pr");
  assert.equal(body.executionContinuity.reviewLoop.unresolvedReviewCommentsCount, 2);
  assert.equal(body.executionContinuity.butlerReviewSynthesis.available, true);
  assert.equal(
    body.executionContinuity.butlerReviewSynthesis.reviewerSignal.recentReviewComments[0].includes(
      "gemini:"
    ),
    true
  );
  assert.equal(body.executionContinuity.nextSuggestedActions.includes("rerun_gemini_review"), true);
});

test("worker accepts natural Butler read without internal read consent field", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "exploration",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          aliasRegistry
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "sample-org/vtdd-v2");
});

test("worker writes confirmed operational memory and retrieves it back", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/memory-write", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        recordType: "decision_log",
        confirmed: true,
        repository: "sample-org/vtdd-v2",
        relatedIssue: 251,
        decision: "Use shared RAG as the Butler, VPS Codex CLI, and Mac Codex handoff memory.",
        rationale: "All surfaces need the same operational context to avoid drift.",
        decidedBy: "owner_and_butler",
        responseMode: "action_visible"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.memoryWritePersisted.recordType, "decision_log");
  assert.equal(body.memoryWritePersisted.relatedIssue, 251);
  assert.equal(body.postWriteRetrieval.sourceCounts.decision_log, 1);
});

test("worker blocks operational memory write until Butler gets GO", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/memory-write", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        recordType: "working_memory",
        repository: "sample-org/vtdd-v2",
        relatedIssue: 251,
        summary: "This should not persist without explicit GO."
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: createInMemoryMemoryProvider()
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error, "memory_write_confirmation_required");
});

test("worker blocks operational memory writes containing secrets", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/memory-write", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        recordType: "working_memory",
        confirmed: true,
        repository: "sample-org/vtdd-v2",
        relatedIssue: 251,
        summary: "token: should-not-be-stored"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: createInMemoryMemoryProvider()
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error, "memory_write_blocked");
  assert.equal(body.blockedByRule, "memory_must_exclude_secrets");
});

test("worker blocks operational memory writes containing secrets in tags", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/memory-write", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        recordType: "working_memory",
        confirmed: true,
        repository: "sample-org/vtdd-v2",
        relatedIssue: 251,
        summary: "Safe summary text.",
        tags: ["token: should-not-be-stored"]
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: createInMemoryMemoryProvider()
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error, "memory_write_blocked");
  assert.equal(body.blockedByRule, "memory_must_exclude_secrets");
});

test("worker includes post-write retrieval for working memory writes", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/memory-write", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        recordType: "working_memory",
        confirmed: true,
        repository: "sample-org/vtdd-v2",
        relatedIssue: 251,
        summary: "Butler should verify the memory surface immediately after persistence."
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: createInMemoryMemoryProvider()
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.memoryWritePersisted.recordType, "working_memory");
  assert.equal(body.memoryWritePersisted.relatedIssue, 251);
  assert.match(body.memoryWritePersisted.recordId, /^mem_[0-9a-f-]{36}$/);
  assert.equal(body.memoryWritePersisted.recordId.includes("working_memory"), false);
  assert.equal(body.memoryWritePersisted.recordId.includes("working_memory_251"), false);
  assert.equal(body.memoryWritePersisted.recordId.includes("issue_251"), false);
  assert.equal(body.memoryWritePersisted.recordId.includes("Butler"), false);
  assert.equal(body.postWriteRetrieval.relatedIssue, 251);
});

test("worker persists RAG checkpoint fields as working memory", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/memory-write", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        recordType: "working_memory",
        confirmed: true,
        repository: "sample-org/vtdd-v2",
        relatedIssue: 361,
        summary: "Save the current RAG checkpoint before context compression.",
        checkpointReason: "Context compression risk before implementation.",
        thoughtLocation: "Owner and Codex discussion before touching code.",
        userTension: "Concerned that compressed context may create partial RAG.",
        origin: {
          surface: "mac_codex",
          moment: "Issue #343 bounded change contract",
          trigger: "Owner chose to move from Issue #344 to Issue #343."
        },
        user_words: ["それでいこう"],
        tension_note: {
          summary: "Owner wants the RAG recall hook without overclaiming #344.",
          intensity: "medium",
          mode: "steady",
          why_it_matters: "Future startup preflight should recover the decision boundary."
        },
        contextSourceQuality: "full_thread_context",
        hypothesis: "Checkpoint schema should ride existing working_memory.",
        explorationHypothesis: {
          summary: "Checkpoint schema should ride existing working_memory.",
          whySuspected: "The runtime route already persists compact working memory.",
          status: "open",
          suspectedFiles: ["src/worker/runtime.js"],
          suspectedLines: [
            {
              file: "src/worker/runtime.js",
              lineStart: 1445,
              lineEnd: 1545,
              reason: "memory write record content is assembled in this range"
            }
          ]
        },
        suspectedFiles: ["src/worker/runtime.js"],
        suspectedLines: [
          {
            file: "src/worker/runtime.js",
            lineStart: 1445,
            lineEnd: 1545,
            reason: "memory write record content is assembled in this range"
          }
        ],
        rejectedHypotheses: [
          {
            summary: "Use decision_log for tentative checkpoints.",
            whyRejected: "Tentative checkpoint state is not a decided rationale.",
            evidence: "thread-independent startup contract"
          }
        ],
        stopReason: {
          summary: "Stop if runtime and Action Schema diverge."
        },
        uncertainty: {
          summary: "Need parity across Butler, mac Codex, and VPS Codex CLI."
        },
        failureReasoning: {
          whatFailed: "Rejected hypotheses were previously lost.",
          inspectNextTime: "Retrieve failureMap before repeating the investigation."
        },
        successPattern: {
          whatWorked: "Persisting file/line hypotheses before implementation.",
          reuseConditions: ["bounded Issue implementation"]
        },
        handoffMemory: {
          nextActorMustKnow: "Checkpoint semantics are shared across surfaces."
        },
        expectedFiles: ["docs/memory-schema.md", "scripts/vtdd-memory.mjs"],
        evidenceLinks: ["https://github.com/marushu/vtdd-v2-p/issues/361"],
        previousRecordIds: ["decision_360_example"],
        tags: ["rag-checkpoint"],
        responseMode: "action_visible"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.memoryWritePersisted.recordType, "working_memory");

  const records = await provider.retrieve({ type: "working_memory", limit: 1 });
  assert.equal(records[0].content.contextSourceQuality, "full_thread_context");
  assert.deepEqual(records[0].content.origin, {
    surface: "mac_codex",
    moment: "Issue #343 bounded change contract",
    trigger: "Owner chose to move from Issue #344 to Issue #343."
  });
  assert.deepEqual(records[0].content.user_words, ["それでいこう"]);
  assert.deepEqual(records[0].content.tension_note, {
    summary: "Owner wants the RAG recall hook without overclaiming #344.",
    intensity: "medium",
    mode: "steady",
    why_it_matters: "Future startup preflight should recover the decision boundary."
  });
  assert.equal(records[0].content.origin.trigger.length > 30, true);
  assert.equal(records[0].content.tension_note.summary.length > 30, true);
  assert.equal(records[0].content.tension_note.why_it_matters.length > 30, true);
  assert.deepEqual(records[0].content.expectedFiles, [
    "docs/memory-schema.md",
    "scripts/vtdd-memory.mjs"
  ]);
  assert.equal(records[0].content.explorationHypothesis.suspectedLines[0].file, "src/worker/runtime.js");
  assert.equal(records[0].content.rejectedHypotheses[0].whyRejected.includes("Tentative checkpoint"), true);
  assert.equal(records[0].content.stopReason.summary, "Stop if runtime and Action Schema diverge.");
  assert.equal(records[0].content.uncertainty.summary.includes("parity"), true);
  assert.equal(records[0].content.failureReasoning.inspectNextTime.includes("failureMap"), true);
  assert.equal(records[0].content.successPattern.reuseConditions[0], "bounded Issue implementation");
  assert.equal(records[0].content.handoffMemory.nextActorMustKnow.includes("shared"), true);
  assert.equal(records[0].content.captureBoundary, "judgment_log_not_chain_of_thought");
  assert.equal(records[0].tags.includes("rag-checkpoint"), true);
});

test("worker retrieves repo-null working memory by explicit recordId recovery path", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "working_memory_343_repo_null_example",
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      summary: "Issue #343 live E2E working memory checkpoint.",
      repository: null,
      origin: {
        surface: "custom_gpt",
        moment: "Issue #343 live E2E",
        trigger: "Owner asked for the save candidate before GO."
      },
      user_words: ["まだ保存しないで。"],
      tension_note: {
        summary: "Save candidate should stay visible before GO.",
        intensity: "low",
        mode: "controlled_verification",
        why_it_matters: "Future recovery should find the checkpoint even when repo was unknown."
      },
      relatedIssue: 343
    },
    metadata: {
      repository: null,
      relatedIssue: 343
    },
    priority: 60,
    tags: ["working_memory", "issue:343", "rag-checkpoint"],
    createdAt: "2026-05-16T00:42:45Z"
  });

  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/operational-memory?repository=marushu/vtdd-v2-p&recordId=working_memory_343_repo_null_example&limit=1",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.compactContext.length, 1);
  assert.equal(body.compactContext[0].id, "working_memory_343_repo_null_example");
  assert.equal(body.compactContext[0].repository, null);
  assert.equal(body.recordIdLookup.found, true);
  assert.equal(body.recordIdLookup.requestedRepository, "marushu/vtdd-v2-p");
  assert.equal(body.recordIdLookup.recordRepository, null);
  assert.equal(body.recordIdLookup.repositoryBoundary, "repo_null_record_returned_by_explicit_record_id");
  assert.equal(body.retrievalSignals.explicitRecordIdLookup, true);
});

test("worker does not overclaim missing explicit operational memory recordId", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/operational-memory?repository=marushu/vtdd-v2-p&recordId=missing_memory_record&limit=1",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: createInMemoryMemoryProvider()
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.compactContext, []);
  assert.equal(body.recordIdLookup.found, false);
  assert.equal(body.recordIdLookup.repositoryBoundary, "record_id_not_found");
  assert.match(body.recordIdLookup.recoveryGuidance, /Do not claim retrieval success/);
});

test("worker blocks cross-repository working memory explicit recordId disclosure", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "working_memory_405_cross_repo_example",
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      summary: "Checkpoint saved for another repository."
    },
    metadata: {
      repository: "other/repo"
    },
    priority: 70,
    tags: ["working_memory", "issue:405"],
    createdAt: "2026-05-16T01:30:00.000Z"
  });

  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/operational-memory?repository=marushu/vtdd-v2-p&recordId=working_memory_405_cross_repo_example&limit=1",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.recordIdLookup.found, false);
  assert.equal(body.recordIdLookup.requestedRepository, "marushu/vtdd-v2-p");
  assert.equal(body.recordIdLookup.recordRepository, null);
  assert.equal(body.recordIdLookup.repositoryBoundary, "record_id_repository_boundary_blocked");
  assert.equal(body.recordIdLookup.blockedByRepositoryBoundary, true);
  assert.deepEqual(body.compactContext, []);
});

test("worker D1 memory provider applies ids and type filters for explicit recordId lookup", async () => {
  const d1 = createFakeMemoryD1Binding();
  const writeResponse = await worker.fetch(
    new Request("https://example.com/v2/action/memory-write", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        recordType: "decision_log",
        confirmed: true,
        repository: "marushu/vtdd-v2-p",
        relatedIssue: 405,
        decision: "Do not let explicit working_memory recovery return decision logs.",
        rationale: "The runtime recordId path is scoped to working_memory recovery.",
        decidedBy: "test",
        responseMode: "action_visible"
      })
    }),
    {
      ...gatewayAuthEnv,
      VTDD_MEMORY_D1: d1
    }
  );
  const writeBody = await writeResponse.json();
  assert.equal(writeResponse.status, 200);
  assert.equal(writeBody.ok, true);
  assert.equal(Boolean(writeBody.memoryWritePersisted.recordId), true);

  const retrieveResponse = await worker.fetch(
    new Request(
      `https://example.com/v2/retrieve/operational-memory?repository=marushu/vtdd-v2-p&recordId=${writeBody.memoryWritePersisted.recordId}&limit=1`,
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      VTDD_MEMORY_D1: d1
    }
  );
  const retrieveBody = await retrieveResponse.json();

  assert.equal(retrieveResponse.status, 200);
  assert.equal(retrieveBody.recordIdLookup.found, false);
  assert.equal(retrieveBody.recordIdLookup.repositoryBoundary, "record_id_not_found");
  assert.deepEqual(retrieveBody.compactContext, []);
});

test("worker does not override explicit Butler read consent categories", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "exploration",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          aliasRegistry,
          consent: { grantedCategories: [ConsentCategory.PROPOSE] }
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "consent_boundary");
});

test("worker dispatches remote Codex execution", async () => {
  const calls = [];
  let executionId = "";
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/execute", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: {
          issueNumber: 6
        },
        continuationContext: {
          requiresHandoff: true,
          handoff: {
            issueTraceable: true,
            approvalScopeMatched: true,
            relatedIssue: 6,
            summary: "Issue #6 bounded remote Codex handoff"
          }
        },
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true,
            runtimeState: {
              activeBranch: "codex/issue-6"
            }
          },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE, ConsentCategory.EXECUTE] },
          approvalPhrase: "GO",
          approvalScopeMatched: true,
          issueTraceable: true,
          issueTraceability: {
            relatedIssue: 6,
            intentRefs: ["#6 Intent"],
            successCriteriaRefs: ["#6 Success Criteria"],
            nonGoalRefs: ["#6 Non-goals"]
          },
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/installation/repositories")) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  full_name: "sample-org/vtdd-v2",
                  name: "vtdd-v2",
                  private: true
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/dispatches")) {
          executionId = JSON.parse(init.body).inputs.execution_id;
          return new Response(null, { status: 204 });
        }
        if (String(url).includes("/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 1531,
                  name: "remote-codex-executor",
                  display_title: executionId,
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/1531",
                  status: "queued",
                  conclusion: null,
                  head_branch: "main"
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            id: 123,
            html_url: "https://github.com/sample-org/vtdd-v2/issues/6#issuecomment-123"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.issueNumber, 6);
  assert.equal(body.execution.transport, "codex_cloud_cli_control_runner");
  assert.equal(body.execution.workflowRunId, 1531);
  assert.equal(calls.length, 3);
});

test("worker dispatches remote Codex execution without user-authored constitutionConsulted", async () => {
  const calls = [];
  let executionId = "";
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/execute", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: {
          issueNumber: 125
        },
        continuationContext: {
          requiresHandoff: true,
          handoff: {
            issueTraceable: true,
            approvalScopeMatched: true,
            relatedIssue: 125,
            summary: "Issue #125 bounded remote Codex handoff"
          }
        },
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          runtimeTruth: {
            runtimeAvailable: true,
            runtimeState: {
              activeBranch: "codex/issue-125"
            }
          },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE, ConsentCategory.EXECUTE] },
          approvalPhrase: "GO",
          approvalScopeMatched: true,
          issueTraceable: true,
          issueTraceability: {
            relatedIssue: 125,
            intentRefs: ["#125 Intent"],
            successCriteriaRefs: ["#125 Success Criteria"],
            nonGoalRefs: ["#125 Non-goals"]
          },
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/installation/repositories")) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  full_name: "sample-org/vtdd-v2",
                  name: "vtdd-v2",
                  private: true
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/dispatches")) {
          executionId = JSON.parse(init.body).inputs.execution_id;
          return new Response(null, { status: 204 });
        }
        if (String(url).includes("/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 1532,
                  name: "remote-codex-executor",
                  display_title: executionId,
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/1532",
                  status: "queued",
                  conclusion: null,
                  head_branch: "main"
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            id: 125,
            html_url: "https://github.com/sample-org/vtdd-v2/issues/125#issuecomment-125"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.issueNumber, 125);
  assert.equal(body.execution.transport, "codex_cloud_cli_control_runner");
  assert.equal(body.execution.workflowRunId, 1532);
  assert.equal(calls.length, 3);
});

test("worker dispatches remote Codex execution with approval scope matched only on handoff", async () => {
  const calls = [];
  let executionId = "";
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/execute", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: {
          issueNumber: 125
        },
        continuationContext: {
          requiresHandoff: true,
          handoff: {
            issueTraceable: true,
            approvalScopeMatched: true,
            relatedIssue: 125,
            summary: "Issue #125 bounded remote Codex handoff"
          }
        },
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          runtimeTruth: {
            runtimeAvailable: true,
            runtimeState: {
              activeBranch: "codex/issue-125"
            }
          },
          consent: { grantedCategories: [ConsentCategory.PROPOSE, ConsentCategory.EXECUTE] },
          approvalPhrase: "GO Issue #125 Codex handoff",
          issueTraceable: true,
          issueTraceability: {
            relatedIssue: 125,
            intentRefs: ["#125 Intent"],
            successCriteriaRefs: ["#125 Success Criteria"],
            nonGoalRefs: ["#125 Non-goals"]
          },
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/installation/repositories")) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  full_name: "sample-org/vtdd-v2",
                  name: "vtdd-v2",
                  private: true
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/dispatches")) {
          executionId = JSON.parse(init.body).inputs.execution_id;
          return new Response(null, { status: 204 });
        }
        if (String(url).includes("/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 1533,
                  name: "remote-codex-executor",
                  display_title: executionId,
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/1533",
                  status: "queued",
                  conclusion: null,
                  head_branch: "main"
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            id: 126,
            html_url: "https://github.com/sample-org/vtdd-v2/issues/125#issuecomment-126"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.issueNumber, 125);
  assert.equal(body.execution.approvalScopeMatched, true);
  assert.equal(body.execution.transport, "codex_cloud_cli_control_runner");
  assert.equal(body.execution.workflowRunId, 1533);
  assert.equal(calls.length, 3);
});

test("worker dispatches API-backed remote Codex execution when explicitly selected", async () => {
  const calls = [];
  let executionId = "";
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/execute", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        executorTransport: "api_key_runner",
        apiKeyRunnerAcknowledged: true,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: {
          issueNumber: 135
        },
        continuationContext: {
          requiresHandoff: true,
          handoff: {
            issueTraceable: true,
            approvalScopeMatched: true,
            relatedIssue: 135,
            summary: "Issue #135 bounded remote Codex handoff"
          }
        },
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          runtimeTruth: {
            runtimeAvailable: true,
            runtimeState: {
              activeBranch: "codex/issue-135"
            }
          },
          consent: { grantedCategories: [ConsentCategory.PROPOSE, ConsentCategory.EXECUTE] },
          approvalPhrase: "GO",
          issueTraceable: true,
          issueTraceability: {
            relatedIssue: 135,
            intentRefs: ["#135 Intent"],
            successCriteriaRefs: ["#135 Success Criteria"],
            nonGoalRefs: ["#135 Non-goals"]
          },
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/installation/repositories")) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  full_name: "sample-org/vtdd-v2",
                  name: "vtdd-v2",
                  private: true
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/dispatches")) {
          executionId = JSON.parse(init.body).inputs.execution_id;
          return new Response(null, { status: 204 });
        }
        if (String(url).includes("/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 135101,
                  name: "remote-codex-executor",
                  display_title: executionId,
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/135101",
                  status: "queued",
                  conclusion: null,
                  head_branch: "main",
                  run_started_at: "2026-04-29T10:00:00Z",
                  updated_at: "2026-04-29T10:00:01Z"
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`unexpected url ${url}`);
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.issueNumber, 135);
  assert.equal(body.execution.transport, "api_key_runner");
  assert.equal(body.execution.workflowRunId, 135101);
  assert.equal(body.execution.workflowUrl, "https://github.com/sample-org/vtdd-v2-p/actions/runs/135101");
  assert.equal(calls.length, 3);
});

test("worker dispatches VPS runner execution by posting a bounded queue comment", async () => {
  const calls = [];
  const roomCalls = [];
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/execute", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        executorTransport: "vps_runner",
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: {
          issueNumber: 157
        },
        continuationContext: {
          requiresHandoff: true,
          codexGoal: "open_pr",
          handoff: {
            issueTraceable: true,
            approvalScopeMatched: true,
            relatedIssue: 157,
            dashboardThreadId: "dashboard-main-marushu-vtdd-v2-p",
            summary: "Issue #157 bounded VPS runner handoff"
          }
        },
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          runtimeTruth: {
            runtimeAvailable: true,
            runtimeState: {
              activeBranch: "codex/issue-157-vps-worker-dispatch"
            }
          },
          consent: { grantedCategories: [ConsentCategory.PROPOSE, ConsentCategory.EXECUTE] },
          approvalPhrase: "GO",
          issueTraceable: true,
          issueTraceability: {
            relatedIssue: 157,
            intentRefs: ["#157 Intent"],
            successCriteriaRefs: ["#157 Success Criteria"],
            nonGoalRefs: ["#157 Non-goals"]
          },
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      DASHBOARD_CHAT_ROOMS: {
        getByName(name) {
          return {
            async fetch(input) {
              roomCalls.push({ name, input });
              return new Response(
                JSON.stringify({
                  ok: true,
                  wakeup: {
                    status: "requested",
                    attempted: true,
                    fallback: "vtdd-vps-runner.timer",
                    reason: "runner wakeup request sent to app-server bridge"
                  }
                }),
                { status: 202, headers: { "content-type": "application/json" } }
              );
            }
          };
        }
      },
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/installation/repositories")) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  full_name: "sample-org/vtdd-v2",
                  name: "vtdd-v2",
                  private: true
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/issues/157/comments")) {
          return new Response(
            JSON.stringify({
              id: 15701,
              html_url: "https://github.com/sample-org/vtdd-v2/issues/157#issuecomment-15701"
            }),
            { status: 201, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`unexpected url ${url}`);
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.transport, "vps_runner");
  assert.equal(body.execution.status, "queued");
  assert.equal(body.execution.issueNumber, 157);
  assert.equal(body.execution.branch, "codex/issue-157-vps-worker-dispatch");
  assert.equal(body.execution.queueCommentId, 15701);
  assert.equal(body.execution.queueCommentUrl, "https://github.com/sample-org/vtdd-v2/issues/157#issuecomment-15701");
  assert.deepEqual(body.execution.wakeup, {
    status: "requested",
    attempted: true,
    fallback: "vtdd-vps-runner.timer",
    reason: "runner wakeup request sent to app-server bridge"
  });
  assert.equal(calls.length, 2);
  assert.equal(roomCalls.length, 1);
  assert.equal(roomCalls[0].name, "dashboard-main-marushu-vtdd-v2-p");
  const wakeupPayload = await roomCalls[0].input.json();
  assert.equal(wakeupPayload.threadId, "dashboard-main-marushu-vtdd-v2-p");
  assert.equal(wakeupPayload.executionId, body.execution.executionId);
  assert.equal(wakeupPayload.repository, "sample-org/vtdd-v2");
  assert.equal(wakeupPayload.issueNumber, 157);
  assert.equal(wakeupPayload.queueCommentUrl, "https://github.com/sample-org/vtdd-v2/issues/157#issuecomment-15701");
  const queueCall = calls.find((call) => String(call.url).includes("/issues/157/comments"));
  assert.equal(queueCall.init.method, "POST");
  const queueBody = JSON.parse(queueCall.init.body).body;
  assert.equal(queueBody.includes("vtdd:vps-runner-execution:"), true);
  assert.equal(queueBody.includes('"transport": "vps_runner"'), true);
  assert.equal(queueBody.includes('"repository": "sample-org/vtdd-v2"'), true);
  assert.equal(queueBody.includes('"branch": "codex/issue-157-vps-worker-dispatch"'), true);
  assert.equal(queueBody.includes("- merge しない。"), true);
});

test("worker normalizes minimal Butler API-backed handoff into bounded remote Codex execution", async () => {
  const calls = [];
  let executionId = "";
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/execute", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        executorTransport: "api_key_runner",
        apiKeyRunnerAcknowledged: true,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: {
          issueNumber: 135
        },
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          runtimeTruth: {
            runtimeAvailable: true,
            runtimeState: {
              activeBranch: "codex/issue-135"
            }
          },
          consent: { grantedCategories: [ConsentCategory.PROPOSE, ConsentCategory.EXECUTE] },
          approvalPhrase: "GO (build)",
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/installation/repositories")) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  full_name: "sample-org/vtdd-v2",
                  name: "vtdd-v2",
                  private: true
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/dispatches")) {
          executionId = JSON.parse(init.body).inputs.execution_id;
          return new Response(null, { status: 204 });
        }
        if (String(url).includes("/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 135202,
                  name: "remote-codex-executor",
                  display_title: executionId,
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/135202",
                  status: "queued",
                  conclusion: null,
                  head_branch: "main",
                  run_started_at: "2026-04-29T10:05:00Z",
                  updated_at: "2026-04-29T10:05:01Z"
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`unexpected url ${url}`);
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.issueNumber, 135);
  assert.equal(body.execution.approvalScopeMatched, true);
  assert.equal(body.execution.transport, "api_key_runner");
  assert.equal(body.execution.workflowRunId, 135202);
  assert.equal(calls.length, 3);
});

test("worker accepts natural Butler build GO without internal consent or approval phrase fields", async () => {
  const calls = [];
  let dispatchInputs = null;
  let executionId = "";
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/execute", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        executorTransport: "api_key_runner",
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: {
          issueNumber: 135
        },
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          runtimeTruth: {
            runtimeAvailable: true,
            runtimeState: {
              activeBranch: "codex/issue-135"
            }
          },
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/installation/repositories")) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  full_name: "sample-org/vtdd-v2",
                  name: "vtdd-v2",
                  private: true
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/dispatches")) {
          dispatchInputs = JSON.parse(init.body).inputs;
          executionId = dispatchInputs.execution_id;
          return new Response(null, { status: 204 });
        }
        if (String(url).includes("/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 135303,
                  name: "remote-codex-executor",
                  display_title: executionId,
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/135303",
                  status: "queued",
                  conclusion: null,
                  head_branch: "main",
                  run_started_at: "2026-04-29T10:10:00Z",
                  updated_at: "2026-04-29T10:10:01Z"
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`unexpected url ${url}`);
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.issueNumber, 135);
  assert.equal(body.execution.transport, "api_key_runner");
  assert.equal(body.execution.workflowRunId, 135303);
  assert.equal(dispatchInputs.target_issue_number, "135");
  assert.equal(dispatchInputs.codex_goal, "open_pr");
  assert.equal(dispatchInputs.approval_phrase, "GO");
  const handoff = JSON.parse(dispatchInputs.handoff_json);
  assert.equal(handoff.relatedIssue, 135);
  assert.equal(
    handoff.developmentStrategy.evidencePath,
    "docs/development-strategy/issue-135-butler-handoff.md"
  );
  assert.match(handoff.developmentStrategy.hypothesis, /Butler build handoff/);
  assert.equal(calls.length, 3);
});

test("worker fills runtime truth for natural Butler build handoff before workflow dispatch", async () => {
  const calls = [];
  let dispatchInputs = null;
  let executionId = "";
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/execute", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        executorTransport: "api_key_runner",
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: {
          issueNumber: 135
        },
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/installation/repositories")) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  full_name: "sample-org/vtdd-v2",
                  name: "vtdd-v2",
                  private: true
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/pulls?")) {
          assert.equal(String(url).includes("state=all"), true);
          assert.equal(String(url).includes("head=sample-org%3Acodex%2Fissue-135"), true);
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        if (String(url).includes("/branches/codex%2Fissue-135")) {
          return new Response(
            JSON.stringify({
              name: "codex/issue-135",
              protected: false,
              commit: { sha: "branch-sha", url: "https://api.github.test/branch-sha" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (
          String(url).includes("/actions/runs") &&
          String(url).includes("branch=codex%2Fissue-135") &&
          !String(url).includes("/actions/workflows/")
        ) {
          return new Response(JSON.stringify({ workflow_runs: [] }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        if (String(url).includes("/dispatches")) {
          dispatchInputs = JSON.parse(init.body).inputs;
          executionId = dispatchInputs.execution_id;
          return new Response(null, { status: 204 });
        }
        if (String(url).includes("/actions/workflows/")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 135404,
                  name: "remote-codex-executor",
                  display_title: executionId,
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/135404",
                  status: "queued",
                  conclusion: null,
                  head_branch: "main",
                  run_started_at: "2026-04-29T10:15:00Z",
                  updated_at: "2026-04-29T10:15:01Z"
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`unexpected url ${url}`);
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.execution.transport, "api_key_runner");
  assert.equal(body.execution.workflowRunId, 135404);
  assert.equal(dispatchInputs.target_issue_number, "135");
  assert.equal(dispatchInputs.approval_phrase, "GO");
  assert.equal(calls.some((call) => String(call.url).includes("/pulls?")), true);
  assert.equal(calls.some((call) => String(call.url).includes("/branches/codex%2Fissue-135")), true);
});

test("worker gateway rejects self-asserted Butler build handoff", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: {
          issueNumber: 6
        },
        continuationContext: {
          requiresHandoff: true,
          handoff: {
            issueTraceable: true,
            approvalScopeMatched: true,
            relatedIssue: 6,
            summary: "Self-asserted gateway handoff"
          }
        },
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE, ConsentCategory.EXECUTE] },
          approvalPhrase: "GO",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url) => {
        if (String(url).includes("/installation/repositories")) {
          return new Response(
            JSON.stringify({
              total_count: 1,
              repositories: [
                {
                  full_name: "sample-org/vtdd-v2",
                  name: "vtdd-v2",
                  private: true
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response("{}", { status: 404 });
      }
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.blockedByRule, "role_action_boundary");
});

test("worker serves passkey registration and approval flow routes", async () => {
  const provider = createInMemoryMemoryProvider();

  const registerOptions = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/register/options", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        operatorId: "owner",
        operatorLabel: "Owner"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );
  assert.equal(registerOptions.status, 200);
  const registrationBody = await registerOptions.json();
  assert.equal(registrationBody.ok, true);

  const registerVerify = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/register/verify", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        sessionId: registrationBody.sessionId,
        response: {
          id: "ignored",
          response: { transports: ["internal"] }
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );
  assert.equal(registerVerify.status, 200);

  const approvalOptions = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/challenge", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        issueContext: { issueNumber: 14 },
        policyInput: {
          actionType: ActionType.DEPLOY_PRODUCTION,
          repositoryInput: "vtdd"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );
  assert.equal(approvalOptions.status, 200);
  const approvalOptionsBody = await approvalOptions.json();
  assert.equal(approvalOptionsBody.ok, true);

  const approvalVerify = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/verify", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        sessionId: approvalOptionsBody.sessionId,
        response: {
          id: "AQIDBA",
          response: {}
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );
  assert.equal(approvalVerify.status, 200);
  const approvalVerifyBody = await approvalVerify.json();
  assert.equal(approvalVerifyBody.ok, true);
  assert.equal(Boolean(approvalVerifyBody.approvalGrant.approvalId), true);
});

test("worker can resolve passkey memory provider from Cloudflare D1 binding fallback", async () => {
  const registerOptions = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/register/options", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        operatorId: "owner",
        operatorLabel: "Owner"
      })
    }),
    {
      ...gatewayAuthEnv,
      VTDD_MEMORY_D1: createFakeMemoryD1Binding(),
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );

  assert.equal(registerOptions.status, 200);
  const registrationBody = await registerOptions.json();
  assert.equal(registrationBody.ok, true);
  assert.equal(Boolean(registrationBody.sessionId), true);
});

test("worker serves passkey operator page", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/approval/passkey/operator?repositoryInput=marushu%2Fvtdd-v2-p&issueNumber=15&pullNumber=148&phase=execution&actionType=merge&highRiskKind=pull_merge&mergeMethod=squash&returnUrl=https%3A%2F%2Fchatgpt.com%2Fg%2Fexample-butler"
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("pragma"), "no-cache");
  const html = await response.text();
  assert.equal(html.includes("VTDD Passkey Operator"), true);
  assert.equal(html.includes("/v2/approval/passkey/challenge"), true);
  assert.equal(html.includes('id="bootstrap-token-input" type="password"'), true);
  assert.equal(html.includes("初回登録は公開 URL の先着順にしません"), true);
  assert.equal(html.includes('id="repo-input" value="marushu/vtdd-v2-p"'), true);
  assert.equal(html.includes('id="issue-input" value="15"'), true);
  assert.equal(html.includes('id="pull-number-input" value="148"'), true);
  assert.equal(html.includes('id="phase-input" value="execution"'), true);
  assert.equal(html.includes('id="action-type-input" value="merge"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="pull_merge"'), true);
  assert.equal(html.includes('id="merge-method-input" value="squash"'), true);
  assert.equal(html.includes("Dispatch PR merge"), true);
  assert.equal(html.includes('href="https://chatgpt.com/g/example-butler"'), true);
  assert.equal(html.includes('href="https://evil.example/phish"'), false);
});

test("worker serves dashboard passkey operator mode", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/approval/passkey/operator?mode=dashboard&repositoryInput=marushu%2Fvtdd-v2-p&issueNumber=15&pullNumber=148&dashboardReturnPath=%2Fdashboard%2Fnotifications"
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("pragma"), "no-cache");
  const html = await response.text();
  assert.equal(html.includes('id="repo-input" value=""'), true);
  assert.equal(html.includes('id="issue-input" value=""'), true);
  assert.equal(html.includes('id="pull-number-input" value="148"'), false);
  assert.equal(html.includes('id="action-type-input" value="read"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="dashboard_access"'), true);
  assert.equal(html.includes('const operatorMode = "dashboard"'), true);
  assert.equal(html.includes('window.location.assign("/dashboard/notifications")'), true);
  assert.equal(html.includes("repo / Issue / PR scope は使いません"), true);
  assert.equal(html.includes('value="marushu/vtdd-v2-p"'), false);
  assert.equal(html.includes("repositoryInput is required before approval/deploy"), true);
  assert.equal(html.includes("const repositoryInput = readApprovalRepositoryInput();"), true);
});

test("worker serves dashboard passkey operator mode with safe query return path", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/approval/passkey/operator?mode=dashboard&dashboardReturnPath=%2Fdashboard%3Frepository%3Dmarushu%252Fvtdd-v2-p%26runId%3Dprivate-run"
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes('window.location.assign("/dashboard?repository=marushu%2Fvtdd-v2-p")'), true);
  assert.equal(html.includes("runId=private-run"), false);
  assert.equal(html.includes("repo / Issue / PR scope は使いません"), true);
});

test("worker strips overlong dashboard passkey return query values", async () => {
  const tooLongRepository = encodeURIComponent(`${"a".repeat(257)}/repo`);
  const response = await worker.fetch(
    new Request(
      `https://example.com/v2/approval/passkey/operator?mode=dashboard&dashboardReturnPath=%2Fdashboard%3Frepository%3D${tooLongRepository}`
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes('window.location.assign("/dashboard")'), true);
  assert.equal(html.includes("repository="), false);
});

test("worker keeps explicit non-dashboard operator modes repo-scoped even with dashboard_access conflict", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/approval/passkey/operator?mode=deploy&repositoryInput=marushu%2Fvtdd-v2-p&issueNumber=15&phase=execution&highRiskKind=dashboard_access"
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes('const operatorMode = "deploy"'), true);
  assert.equal(html.includes('id="repo-input" value="marushu/vtdd-v2-p"'), true);
  assert.equal(html.includes('id="issue-input" value="15"'), true);
  assert.equal(html.includes('id="action-type-input" value="deploy_production"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="deploy_production"'), true);
  assert.equal(html.includes("repo / Issue / PR scope は使いません"), false);
});

test("worker serves legacy deploy operator links as deploy-only scope", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/approval/passkey/operator?repositoryInput=marushu%2Fvtdd-v2-p&issueNumber=528&phase=execution&actionType=deploy&highRiskKind=production_deploy"
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes('const operatorMode = "deploy"'), true);
  assert.equal(html.includes('id="action-type-input" value="deploy_production"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="deploy_production"'), true);
  assert.equal(
    html.includes('<section data-operator-section="approval" data-owner-flow="one-tap-deploy">'),
    true
  );
  assert.equal(html.includes('<section data-operator-section="production-deploy">'), true);
  assert.equal(html.includes('<section data-operator-section="registration" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="github-app-secret-sync" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="pr-merge" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="issue-close" hidden>'), true);
});

test("worker serves issue close operator mode without falling back to PR merge UI", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/approval/passkey/operator?repositoryInput=marushu%2Fvtdd-v2-p&issueNumber=349&pullNumber=407&phase=execution&actionType=issue_close&highRiskKind=issue_close"
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("GitHub Issue Close"), true);
  assert.equal(html.includes("Dispatch Issue close"), true);
  assert.equal(html.includes('<section data-operator-section="issue-close">'), true);
  assert.equal(html.includes('<section data-operator-section="pr-merge" hidden>'), true);
  assert.equal(html.includes('id="issue-input" value="349"'), true);
  assert.equal(html.includes('id="issue-close-pull-number-input" value="407"'), true);
  assert.equal(html.includes('id="action-type-input" value="issue_close"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="issue_close"'), true);
  assert.equal(html.includes('operation: "issue_close"'), true);
});

test("worker strips non-ChatGPT operator return urls", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/approval/passkey/operator?repositoryInput=marushu%2Fvtdd-v2-p&returnUrl=https%3A%2F%2Fevil.example%2Fphish"
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes('href="https://evil.example/phish"'), false);
  assert.equal(html.includes('id="return-to-butler-link" href=""'), true);
});

test("worker passkey operator page enables desktop secret sync bridge when syncApiBase is provided", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/approval/passkey/operator?repositoryInput=marushu%2Fvtdd-v2-p&issueNumber=15&highRiskKind=github_app_secret_sync&syncApiBase=http%3A%2F%2F127.0.0.1%3A8789%2Fapi"
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes('fetch("http://127.0.0.1:8789/api/github-app-secret-sync/execute"'), true);
  assert.equal(html.includes('fetch("http://127.0.0.1:8789/api/gateway-bearer-vault/bootstrap"'), true);
  assert.equal(html.includes('<section data-operator-section="github-app-secret-sync">'), true);
  assert.equal(html.includes('<section data-operator-section="production-deploy" hidden>'), true);
  assert.equal(html.includes('id="action-type-input" value="destructive"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="github_app_secret_sync"'), true);
  assert.equal(html.includes("desktop helper bridge に接続します"), true);
});

test("worker serves gateway bearer vault operator mode", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/approval/passkey/operator?repositoryInput=marushu%2Fvtdd-v2-p&issueNumber=380&highRiskKind=gateway_bearer_vault_bootstrap&syncApiBase=http%3A%2F%2F127.0.0.1%3A8789%2Fapi"
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("Gateway Bearer Vault"), true);
  assert.equal(html.includes('id="issue-input" value="380"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="gateway_bearer_vault_bootstrap"'), true);
  assert.equal(html.includes('id="gateway-bearer-token-input" type="password"'), true);
  assert.equal(html.includes('fetch("http://127.0.0.1:8789/api/gateway-bearer-vault/bootstrap"'), true);
});

test("worker serves VPS runner admin passkey operator mode", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/approval/passkey/operator?mode=vps&repositoryInput=sample-org%2Fprivate-repo&issueNumber=157&phase=execution"
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("VPS Runner Admin"), true);
  assert.equal(html.includes('id="repo-input" value="sample-org/private-repo"'), true);
  assert.equal(html.includes('id="issue-input" value="157"'), true);
  assert.equal(html.includes('id="action-type-input" value="destructive"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="vps_runner_admin"'), true);
  assert.equal(html.includes("文字列としての passkey は承認ではありません"), true);
});

test("worker serves VPS privileged maintenance proposal with scoped passkey operator URL", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/proposals", {
      method: "POST",
      headers: gatewayAuthHeaders,
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
        reason: "PR #632 Playwright E2E blocker requires Chromium host dependencies",
        impactScope: "apt packages for Chromium runtime",
        dashboardThreadId: "dashboard-main-marushu-vtdd-v2-p",
        executionId: "issue637-vps-auto-continue"
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.proposal.kind, "vps_privileged_maintenance_capability_proposal");
  assert.equal(body.proposal.pwaNotificationRequired, true);
  assert.equal(body.approvalScope.actionType, "destructive");
  assert.equal(body.approvalScope.highRiskKind, "vps_runner_admin");
  assert.equal(body.approvalScope.relatedIssue, "637");
  assert.equal(body.approvalScope.issueNumber, "637");
  assert.equal(body.approvalScope.vpsHost, "x85-131-245-163");
  assert.equal(body.approvalScope.vpsCapabilityId, "playwright.chromium.deps");
  assert.equal(body.approvalScope.vpsImpactScope, "apt packages for Chromium runtime");
  assert.match(body.approvalScope.vpsExpiresAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(body.approvalScope.display.host, "x85-131-245-163");
  assert.equal(body.approvalScope.display.capabilityId, "playwright.chromium.deps");
  assert.equal(body.runtimeTruth.rootExecutionStarted, false);
  assert.equal(body.runtimeTruth.pwaNotificationRequired, true);
  assert.match(body.approvalOperatorUrl, /^https:\/\/example\.com\/v2\/approval\/passkey\/operator\?/);
  const operatorUrl = new URL(body.approvalOperatorUrl);
  assert.equal(operatorUrl.searchParams.get("mode"), "vps");
  assert.equal(operatorUrl.searchParams.get("repositoryInput"), "marushu/vtdd-v2-p");
  assert.equal(operatorUrl.searchParams.get("actionType"), "destructive");
  assert.equal(operatorUrl.searchParams.get("highRiskKind"), "vps_runner_admin");
  assert.equal(operatorUrl.searchParams.get("vpsProposalId"), body.vpsProposalId);
  assert.equal(operatorUrl.searchParams.get("dashboardThreadId"), "dashboard-main-marushu-vtdd-v2-p");
  assert.equal(operatorUrl.searchParams.get("executionId"), "issue637-vps-auto-continue");
  assert.equal(operatorUrl.searchParams.get("vpsHost"), null);
  assert.equal(operatorUrl.searchParams.get("vpsCapabilityId"), null);
  assert.equal(body.ownerAction.source.approvalOperatorUrl, body.approvalOperatorUrl);
  assert.equal(body.ownerAction.source.vpsProposalId, body.vpsProposalId);

  const records = await provider.retrieve({ type: MemoryRecordType.APPROVAL_LOG, limit: 10 });
  const storedProposal = records.find((record) => record.id === body.vpsProposalId);
  assert.equal(storedProposal.content.kind, "vps_privileged_maintenance_approval_proposal");
  assert.equal(storedProposal.content.approvalScope.vpsProposalId, body.vpsProposalId);
  assert.equal(storedProposal.content.approvalScope.vpsCapabilityId, "playwright.chromium.deps");
});

test("worker rejects invalid VPS privileged maintenance proposals before passkey approval", async () => {
  const provider = createInMemoryMemoryProvider();
  const unauthenticated = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repository: "marushu/vtdd-v2-p" })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );
  assert.equal(unauthenticated.status, 401);

  const response = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/proposals", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        host: "x85-131-245-163",
        repository: "marushu/vtdd-v2-p",
        relatedIssue: 637,
        id: "unsafe.root.shell",
        title: "Unsafe root shell",
        commandClass: "root shell",
        workingDirectories: ["/"],
        allowedArgs: ["vtdd-runner ALL=(ALL) NOPASSWD:ALL"],
        rollbackPlan: "disable",
        reason: "unsafe"
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "vps_privileged_maintenance_proposal_invalid");
  assert.equal(body.issues.some((issue) => issue.includes("forbidden broad privileged pattern")), true);

  const unscoped = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/proposals", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        host: "x85-131-245-163",
        repository: "marushu/vtdd-v2-p",
        id: "playwright.chromium.deps",
        title: "Playwright Chromium dependency install",
        commandClass: "playwright_install_deps_chromium",
        riskLevel: "high",
        workingDirectories: ["/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"],
        allowedArgs: ["npx playwright install-deps chromium"],
        rollbackPlan: "disable capability and keep audit history",
        reason: "missing related Issue should be rejected"
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );
  assert.equal(unscoped.status, 422);
  const unscopedBody = await unscoped.json();
  assert.equal(unscopedBody.issues.includes("relatedIssue or issueNumber is required"), true);

  const expired = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/proposals", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        host: "x85-131-245-163",
        repository: "marushu/vtdd-v2-p",
        relatedIssue: 637,
        id: "playwright.chromium.deps",
        title: "Playwright Chromium dependency install",
        commandClass: "playwright_install_deps_chromium",
        riskLevel: "high",
        workingDirectories: ["/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"],
        allowedArgs: ["npx playwright install-deps chromium"],
        rollbackPlan: "disable capability and keep audit history",
        reason: "expired approval scope should be rejected",
        expiresAt: "2000-01-01T00:00:00.000Z"
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );
  assert.equal(expired.status, 422);
  const expiredBody = await expired.json();
  assert.equal(expiredBody.issues.includes("expiresAt must be in the future"), true);

  const unsupportedOperation = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/proposals", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        host: "x85-131-245-163",
        repository: "marushu/vtdd-v2-p",
        relatedIssue: 637,
        operation: "root-anything",
        id: "playwright.chromium.deps",
        title: "Playwright Chromium dependency install",
        commandClass: "playwright_install_deps_chromium",
        workingDirectories: ["/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"],
        allowedArgs: ["npx playwright install-deps chromium"],
        rollbackPlan: "disable capability and keep audit history",
        reason: "unsupported operation should be rejected"
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );
  assert.equal(unsupportedOperation.status, 422);
  const unsupportedOperationBody = await unsupportedOperation.json();
  assert.equal(
    unsupportedOperationBody.issues.includes("operation must be add, enable, disable, remove, rollback, or review"),
    true
  );
});

test("worker passkey operator displays VPS maintenance approval scope details from stored proposal", async () => {
  const provider = createInMemoryMemoryProvider();
  const proposalResponse = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/proposals", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        host: "x85-131-245-163",
        repository: "marushu/vtdd-v2-p",
        relatedIssue: 637,
        operation: "add",
        id: "playwright.chromium.deps",
        title: "Playwright Chromium dependency install",
        commandClass: "playwright_install_deps_chromium",
        workingDirectories: ["/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"],
        allowedArgs: ["npx playwright install-deps chromium"],
        rollbackPlan: "disable capability and keep audit history",
        reason: "PR #632 Playwright E2E blocker requires Chromium host dependencies",
        impactScope: "apt packages",
        dashboardThreadId: "dashboard-main-marushu-vtdd-v2-p",
        executionId: "issue637-vps-auto-continue"
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );
  assert.equal(proposalResponse.status, 200);
  const proposalBody = await proposalResponse.json();
  const response = await worker.fetch(
    new Request(proposalBody.approvalOperatorUrl),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("承認対象: Host: x85-131-245-163"), true);
  assert.equal(html.includes("Operation: add"), true);
  assert.equal(html.includes("Capability: playwright.chromium.deps"), true);
  assert.equal(html.includes("Impact: apt packages"), true);
  assert.equal(html.includes("Expires:"), true);
  assert.equal(html.includes(`"vpsProposalId":"${proposalBody.vpsProposalId}"`), true);
  assert.equal(html.includes('"vpsHost":"x85-131-245-163"'), true);
  assert.equal(html.includes('"vpsCapabilityId":"playwright.chromium.deps"'), true);
  assert.equal(html.includes('"dashboardThreadId":"dashboard-main-marushu-vtdd-v2-p"'), true);
  assert.equal(html.includes('"executionId":"issue637-vps-auto-continue"'), true);
  assert.equal(html.includes("continueVpsMaintenanceFromApproval"), true);
  assert.equal(html.includes("/v2/dashboard/chat/messages"), true);
  assert.equal(html.includes("Copy approvalGrantId"), false);
  assert.equal(html.includes("同じ chat thread に戻して helper queue へ自動継続します"), true);
});

test("worker rejects hand-authored VPS passkey scope without stored proposal", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/challenge", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        highRiskKind: "vps_runner_admin",
        repositoryInput: "marushu/vtdd-v2-p",
        issueNumber: 637,
        policyInput: {
          actionType: "destructive",
          repositoryInput: "marushu/vtdd-v2-p",
          highRiskKind: "vps_runner_admin",
          vpsHost: "x85-131-245-163",
          vpsCapabilityId: "unsafe.root.shell"
        }
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: createInMemoryMemoryProvider() }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error, "passkey_approval_scope_invalid");
  assert.equal(body.issues.includes("vpsProposalId is required for vps_runner_admin approval"), true);
});

test("worker creates VPS maintenance helper request only with matching approval grant", async () => {
  const provider = createInMemoryMemoryProvider();
  const proposalResponse = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/proposals", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        host: "x85-131-245-163",
        repository: "marushu/vtdd-v2-p",
        relatedIssue: 637,
        operation: "add",
        id: "playwright.chromium.deps",
        title: "Playwright Chromium dependency install",
        commandClass: "playwright_install_deps_chromium",
        workingDirectories: ["/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"],
        allowedArgs: ["npx playwright install-deps chromium"],
        affectedPaths: ["/usr/lib", "/usr/share/fonts"],
        redactionRules: ["no secrets", "summarize package list"],
        rollbackPlan: "disable capability and keep audit history",
        expectedRuntimeTruth: ["before package check", "exit code", "after Chromium launch check"],
        reason: "PR #632 Playwright E2E blocker requires Chromium host dependencies",
        impactScope: "apt packages for Chromium runtime"
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );
  assert.equal(proposalResponse.status, 200);
  const proposalBody = await proposalResponse.json();
  await provider.store({
    id: "approval:vps-maintenance",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval:vps-maintenance",
      credentialId: "AQIDBA",
      verifiedAt: "2026-05-29T00:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
      scope: proposalBody.approvalScope
    },
    metadata: { source: "test" },
    priority: 96,
    tags: ["passkey_grant", "passkey_approval", "verified"],
    createdAt: "2026-05-29T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/helper-requests", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        vpsProposalId: proposalBody.vpsProposalId,
        approvalGrantId: "approval:vps-maintenance"
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.helperRequest.status, "ready_for_vps_helper");
  assert.equal(body.helperRequest.rootExecutionStarted, false);
  assert.equal(body.helperRequest.helperExecutionStarted, false);
  assert.equal(body.helperRequest.host, "x85-131-245-163");
  assert.equal(body.helperRequest.repository, "marushu/vtdd-v2-p");
  assert.equal(body.helperRequest.relatedIssue, 637);
  assert.equal(body.helperRequest.operation, "add");
  assert.equal(body.helperRequest.capability.id, "playwright.chromium.deps");
  assert.equal(body.runtimeTruth.status, "ready_for_vps_helper");
  assert.equal(body.runtimeTruth.rootExecutionStarted, false);
  assert.equal(body.runtimeTruth.helperExecutionStarted, false);
});

test("worker dry-runs VPS maintenance helper request without root execution", async () => {
  const provider = createInMemoryMemoryProvider();
  const proposalResponse = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/proposals", {
      method: "POST",
      headers: gatewayAuthHeaders,
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
        reason: "PR #632 Playwright E2E blocker requires Chromium host dependencies"
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );
  assert.equal(proposalResponse.status, 200);
  const proposalBody = await proposalResponse.json();
  await provider.store({
    id: "approval:vps-maintenance-dry-run",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval:vps-maintenance-dry-run",
      credentialId: "AQIDBA",
      verifiedAt: "2026-05-29T00:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
      scope: proposalBody.approvalScope
    },
    metadata: { source: "test" },
    priority: 96,
    tags: ["passkey_grant", "passkey_approval", "verified"],
    createdAt: "2026-05-29T00:00:00.000Z"
  });
  const helperResponse = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/helper-requests", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        vpsProposalId: proposalBody.vpsProposalId,
        approvalGrantId: "approval:vps-maintenance-dry-run"
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );
  assert.equal(helperResponse.status, 200);
  const helperBody = await helperResponse.json();

  const response = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/helper-dry-runs", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        manifest: {
          version: 1,
          host: "x85-131-245-163",
          repository: "marushu/vtdd-v2-p",
          updatedAt: "2026-05-29T00:00:00.000Z",
          capabilities: [
            {
              ...helperBody.helperRequest.capability,
              status: "enabled",
              createdAt: "2026-05-29T00:00:00.000Z",
              updatedAt: "2026-05-29T00:00:00.000Z"
            }
          ]
        },
        helperRequest: helperBody.helperRequest,
        now: "2026-05-29T02:00:00.000Z"
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.helperPlan.status, "dry_run_ready");
  assert.equal(body.runtimeTruth.kind, "vps_privileged_maintenance_helper_dry_run");
  assert.equal(body.runtimeTruth.status, "dry_run_ready");
  assert.equal(body.runtimeTruth.rootExecutionStarted, false);
  assert.equal(body.runtimeTruth.helperExecutionStarted, false);
  assert.equal(body.runtimeTruth.exitCode, null);

  const executionResponse = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/helper-executions", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        manifest: {
          version: 1,
          host: "x85-131-245-163",
          repository: "marushu/vtdd-v2-p",
          updatedAt: "2026-05-29T00:00:00.000Z",
          capabilities: [
            {
              ...helperBody.helperRequest.capability,
              status: "enabled",
              createdAt: "2026-05-29T00:00:00.000Z",
              updatedAt: "2026-05-29T00:00:00.000Z"
            }
          ]
        },
        helperRequest: helperBody.helperRequest,
        now: "2026-05-29T02:00:00.000Z"
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(executionResponse.status, 200);
  const executionBody = await executionResponse.json();
  assert.equal(executionBody.ok, true);
  assert.equal(executionBody.helperPlan.status, "execute_ready");
  assert.equal(executionBody.executionEnvelope.status, "ready_for_vps_helper_execution");
  assert.equal(executionBody.executionEnvelope.helperInvocation.executable, "sudo");
  assert.equal(executionBody.executionEnvelope.helperInvocation.shell, false);
  assert.equal(executionBody.runtimeTruth.kind, "vps_privileged_maintenance_helper_execution_handoff");
  assert.equal(executionBody.runtimeTruth.status, "ready_for_vps_helper_execution");
  assert.equal(executionBody.runtimeTruth.rootExecutionStarted, false);
  assert.equal(executionBody.runtimeTruth.helperExecutionStarted, false);

  const githubCalls = [];
  const queueResponse = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/helper-execution-queues", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "marushu/vtdd-v2-p",
        issueNumber: 637,
        executionId: "vps-maint-test-637",
        dashboardThreadId: "dashboard-main-marushu-vtdd-v2-p",
        approvalActor: "requester",
        executionEnvelope: executionBody.executionEnvelope
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_test",
      GITHUB_API_FETCH: async (url, init) => {
        githubCalls.push({ url, init });
        return new Response(
          JSON.stringify({
            id: 63701,
            html_url: "https://github.com/marushu/vtdd-v2-p/issues/637#issuecomment-63701"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(queueResponse.status, 200);
  const queueBody = await queueResponse.json();
  assert.equal(queueBody.ok, true);
  assert.equal(queueBody.execution.executionId, "vps-maint-test-637");
  assert.equal(queueBody.execution.transport, "vps_privileged_maintenance_helper");
  assert.equal(queueBody.execution.dashboardThreadId, "dashboard-main-marushu-vtdd-v2-p");
  assert.equal(queueBody.execution.queueCommentId, 63701);
  assert.equal(queueBody.runtimeTruth.kind, "vps_privileged_maintenance_helper_execution_queue");
  assert.equal(queueBody.runtimeTruth.status, "queued_for_vps_helper_execution");
  assert.equal(queueBody.runtimeTruth.dashboardThreadIdIncluded, true);
  assert.equal(queueBody.runtimeTruth.rootExecutionStarted, false);
  assert.equal(queueBody.runtimeTruth.helperExecutionStarted, false);
  assert.equal(githubCalls.length, 1);
  assert.equal(githubCalls[0].url.includes("/repos/marushu/vtdd-v2-p/issues/637/comments"), true);
  const queueCommentBody = JSON.parse(githubCalls[0].init.body).body;
  assert.equal(queueCommentBody.includes("vtdd:vps-privileged-maintenance-execution:vps-maint-test-637"), true);
  assert.equal(queueCommentBody.includes('"transport": "vps_privileged_maintenance_helper"'), true);
  assert.equal(queueCommentBody.includes('"dashboardThreadId": "dashboard-main-marushu-vtdd-v2-p"'), true);
  assert.equal(queueCommentBody.includes('"helperExecutionInput"'), true);
});

test("worker retrieves VPS maintenance install inventory without root execution", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/vps-maintenance-install-inventory?repository=marushu%2Fvtdd-v2-p&host=x85-131-245-163&helperInstalled=true&manifestInstalled=true&sudoersInstalled=true&helperOwner=root&manifestOwner=root&sudoersOwner=root&sudoersAllowsAll=false&sudoersScopedHelperEntry=true",
      {
        headers: gatewayAuthHeaders
      }
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.installInventory.status, "ready");
  assert.equal(body.installInventory.kind, "vps_privileged_maintenance_install_inventory");
  assert.equal(body.installInventory.requiredSudoersShape.user, "vtdd-runner");
  assert.equal(
    body.installInventory.requiredSudoersShape.allowedCommand,
    "/usr/local/sbin/vtdd-vps-maintenance-helper"
  );
  assert.equal(body.runtimeTruth.rootExecutionStarted, false);
  assert.equal(body.runtimeTruth.helperExecutionStarted, false);

  const unsafe = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/vps-maintenance-install-inventory?repository=marushu%2Fvtdd-v2-p&host=x85-131-245-163&sudoersAllowsAll=true&responseMode=action_visible",
      {
        headers: gatewayAuthHeaders
      }
    ),
    gatewayAuthEnv
  );
  assert.equal(unsafe.status, 200);
  const unsafeBody = await unsafe.json();
  assert.equal(unsafeBody.ok, false);
  assert.equal(unsafeBody.httpStatus, 422);
  assert.equal(unsafeBody.error, "vps_maintenance_install_inventory_invalid");
  assert.equal(unsafeBody.issues.includes("sudoers must not allow NOPASSWD:ALL"), true);
});

test("worker rejects VPS helper request when approval grant scope does not match proposal", async () => {
  const provider = createInMemoryMemoryProvider();
  const proposalResponse = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/proposals", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        host: "x85-131-245-163",
        repository: "marushu/vtdd-v2-p",
        relatedIssue: 637,
        operation: "add",
        id: "playwright.chromium.deps",
        title: "Playwright Chromium dependency install",
        commandClass: "playwright_install_deps_chromium",
        workingDirectories: ["/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"],
        allowedArgs: ["npx playwright install-deps chromium"],
        rollbackPlan: "disable capability and keep audit history",
        reason: "PR #632 Playwright E2E blocker requires Chromium host dependencies"
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );
  assert.equal(proposalResponse.status, 200);
  const proposalBody = await proposalResponse.json();
  await provider.store({
    id: "approval:vps-maintenance-wrong",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval:vps-maintenance-wrong",
      credentialId: "AQIDBA",
      verifiedAt: "2026-05-29T00:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
      scope: {
        ...proposalBody.approvalScope,
        vpsCapabilityId: "other.capability"
      }
    },
    metadata: { source: "test" },
    priority: 96,
    tags: ["passkey_grant", "passkey_approval", "verified"],
    createdAt: "2026-05-29T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/vps/privileged-maintenance/helper-requests", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        vpsProposalId: proposalBody.vpsProposalId,
        approvalGrantId: "approval:vps-maintenance-wrong"
      })
    }),
    { ...gatewayAuthEnv, MEMORY_PROVIDER: provider }
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, "approval_grant_scope_mismatch");
});

test("worker blocks same-origin browser bootstrap registration without bootstrap token", async () => {
  const provider = createInMemoryMemoryProvider();

  const response = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/register/options", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operatorId: "owner",
        operatorLabel: "Owner"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(
    body.reason.includes("VTDD_PASSKEY_BOOTSTRAP_TOKEN before first registration"),
    true
  );
});

test("worker allows same-origin browser bootstrap registration before first passkey exists with bootstrap token", async () => {
  const provider = createInMemoryMemoryProvider();

  const response = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/register/options", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        "x-vtdd-passkey-bootstrap-token": "setup-token"
      },
      body: JSON.stringify({
        operatorId: "owner",
        operatorLabel: "Owner"
      })
    }),
    {
      ...gatewayAuthEnv,
      VTDD_PASSKEY_BOOTSTRAP_TOKEN: "setup-token",
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(Boolean(body.sessionId), true);
});

test("worker blocks browser registration after first passkey already exists", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "passkey:existing",
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      kind: "passkey_registry",
      credentialId: "existing",
      publicKey: "pub",
      counter: 1,
      transports: ["internal"]
    },
    metadata: { source: "test" },
    priority: 80,
    tags: ["passkey_registry"],
    createdAt: "2026-04-25T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/register/options", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operatorId: "owner",
        operatorLabel: "Owner"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );

  assert.equal(response.status, 403);
});

test("worker purges expired passkey session records before issuing challenge", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "passkey-auth:expired",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_approval",
      status: "pending",
      challenge: "challenge:old",
      rpID: "example.com",
      origin: "https://example.com",
      expiresAt: "2000-01-01T00:00:00.000Z",
      scope: {}
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_session", "passkey_approval"],
    createdAt: "2000-01-01T00:00:00.000Z"
  });
  await provider.store({
    id: "passkey:AQIDBA",
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      kind: "passkey_registry",
      credentialId: "AQIDBA",
      publicKey: "BQYHCA",
      counter: 1,
      transports: ["internal"]
    },
    metadata: { source: "test" },
    priority: 80,
    tags: ["passkey_registry"],
    createdAt: "2026-04-25T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/challenge", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        issueContext: { issueNumber: 14 },
        policyInput: {
          actionType: ActionType.DEPLOY_PRODUCTION,
          repositoryInput: "vtdd"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );

  assert.equal(response.status, 200);
  const remaining = await provider.query({
    type: MemoryRecordType.APPROVAL_LOG,
    text: "passkey-auth:expired",
    limit: 10
  });
  assert.equal(remaining.length, 0);
});

test("worker allows same-origin browser approval flow after passkey exists", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "passkey:AQIDBA",
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      kind: "passkey_registry",
      credentialId: "AQIDBA",
      publicKey: "BQYHCA",
      counter: 1,
      transports: ["internal"]
    },
    metadata: { source: "test" },
    priority: 80,
    tags: ["passkey_registry"],
    createdAt: "2026-04-25T00:00:00.000Z"
  });

  const challenge = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/challenge", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "execution",
        issueContext: { issueNumber: 15 },
        policyInput: {
          actionType: ActionType.DESTRUCTIVE,
          repositoryInput: "marushu/vtdd-v2-p",
          highRiskKind: "github_app_secret_sync"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );

  assert.equal(challenge.status, 200);
  const challengeBody = await challenge.json();
  assert.equal(challengeBody.ok, true);

  const verify = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/verify", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: challengeBody.sessionId,
        response: {
          id: "AQIDBA",
          response: {}
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );

  assert.equal(verify.status, 200);
  const verifyBody = await verify.json();
  assert.equal(verifyBody.ok, true);
  assert.equal(Boolean(verifyBody.approvalGrant.approvalId), true);
  assert.equal(verifyBody.approvalGrant.scope.repositoryInput, "marushu/vtdd-v2-p");
  assert.equal(verifyBody.approvalGrant.scope.issueNumber, "15");
  assert.equal(verifyBody.approvalGrant.scope.relatedIssue, "15");
});

test("worker sets dashboard session cookie after dashboard passkey approval", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "passkey:AQIDBA",
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      kind: "passkey_registry",
      credentialId: "AQIDBA",
      publicKey: "BQYHCA",
      counter: 1,
      transports: ["internal"]
    },
    metadata: { source: "test" },
    priority: 80,
    tags: ["passkey_registry"],
    createdAt: "2026-04-25T00:00:00.000Z"
  });

  const challenge = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/challenge", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "execution",
        highRiskKind: "dashboard_access",
        policyInput: {
          actionType: ActionType.READ,
          highRiskKind: "dashboard_access"
        }
      })
    }),
    {
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );
  assert.equal(challenge.status, 200);
  const challengeBody = await challenge.json();

  const verify = await worker.fetch(
    new Request("https://example.com/v2/approval/passkey/verify", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: challengeBody.sessionId,
        response: {
          id: "AQIDBA",
          response: {}
        }
      })
    }),
    {
      MEMORY_PROVIDER: provider,
      PASSKEY_ADAPTER: passkeyAdapter
    }
  );

  assert.equal(verify.status, 200);
  assert.match(verify.headers.get("set-cookie"), /vtdd_dashboard_session=dashboard-session%3A/);
  assert.match(verify.headers.get("set-cookie"), /HttpOnly/);
  assert.match(verify.headers.get("set-cookie"), /SameSite=Lax/);
  const verifyBody = await verify.json();
  assert.equal(verifyBody.approvalGrant.scope.highRiskKind, "dashboard_access");
  assert.equal(verifyBody.approvalGrant.scope.repositoryInput || "", "");
  assert.notEqual(verifyBody.approvalGrant.scope.repositoryInput, "marushu/vtdd-v2-p");
});

test("worker gateway accepts high-risk approval grant resolved from memory", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "deploy_production",
        repositoryInput: "vtdd",
        issueNumber: "14",
        relatedIssue: "14",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-25T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.EXECUTOR,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: { issueNumber: 14 },
        policyInput: {
          actionType: ActionType.DEPLOY_PRODUCTION,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: {
            model: "github_app",
            tier: CredentialTier.HIGH_RISK,
            shortLived: true,
            boundApprovalId: "approval-123"
          },
          consent: { grantedCategories: [ConsentCategory.EXECUTE] },
          approvalPhrase: "GO deploy request",
          approvalScopeMatched: true,
          approvalGrantId: "approval-123",
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
});

test("worker gateway does not accept dashboard read session as high-risk approval grant", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "dashboard-session:read-only",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "dashboard_read_session",
      status: "active",
      sessionId: "dashboard-session:read-only",
      sourceApprovalId: "approval:dashboard-read",
      credentialId: "AQIDBA",
      deviceLabel: "iPhone",
      createdAt: "2026-05-20T00:00:00.000Z",
      lastSeenAt: "2026-05-20T00:00:00.000Z",
      expiresAt: "2999-01-01T00:00:00.000Z",
      scope: {
        actionType: "read",
        highRiskKind: "dashboard_access"
      }
    },
    metadata: { source: "test" },
    priority: 95,
    tags: ["dashboard_read_session", "dashboard_session"],
    createdAt: "2026-05-20T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.EXECUTOR,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        issueContext: { issueNumber: 14 },
        policyInput: {
          actionType: ActionType.DEPLOY_PRODUCTION,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: {
            model: "github_app",
            tier: CredentialTier.HIGH_RISK,
            shortLived: true,
            boundApprovalId: "dashboard-session:read-only"
          },
          consent: { grantedCategories: [ConsentCategory.EXECUTE] },
          approvalPhrase: "GO deploy request",
          approvalScopeMatched: true,
          approvalGrantId: "dashboard-session:read-only",
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
});

test("worker returns approval grant through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-xyz",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-xyz",
      verifiedAt: "2026-04-25T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "15",
        relatedIssue: "15",
        phase: "execution",
        highRiskKind: "github_app_secret_sync"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-25T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/approval-grant?approvalId=approval-xyz", {
      headers: gatewayAuthHeaders
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.approvalGrant.approvalId, "approval-xyz");
  assert.equal(body.approvalGrant.scope.repositoryInput, "sample-org/vtdd-v2-p");
});

test("worker retrieves approval grant by id even when provider query misses", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-query-miss",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-query-miss",
      verifiedAt: "2026-04-25T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "15",
        relatedIssue: "15",
        phase: "execution",
        highRiskKind: "github_app_secret_sync"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-25T00:00:00.000Z"
  });
  const queryMissProvider = {
    ...provider,
    async query() {
      return [];
    }
  };

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/approval-grant?approvalId=approval-query-miss", {
      headers: gatewayAuthHeaders
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: queryMissProvider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.approvalGrant.approvalId, "approval-query-miss");
});

test("worker returns explicit expired approval grant error", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-expired",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-expired",
      verifiedAt: "2026-04-25T00:00:00.000Z",
      expiresAt: "2000-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "15",
        relatedIssue: "15",
        phase: "execution",
        highRiskKind: "github_app_secret_sync"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-25T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/approval-grant?approvalId=approval-expired", {
      headers: gatewayAuthHeaders
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 410);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "approval_grant_expired");
  assert.equal(body.reason.includes("再承認"), true);
});

test("worker passkey operator page preselects GitHub App role from query", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/approval/passkey/operator?actionType=destructive&highRiskKind=github_app_secret_sync&githubAppRole=gemini-reviewer",
      {
        headers: gatewayAuthHeaders
      }
    ),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes('<option value="gemini-reviewer" selected>VTDD Gemini Reviewer</option>'), true);
});

test("worker returns GitHub repositories through read plane route", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/github?resource=repositories&limit=5", {
      headers: gatewayAuthHeaders
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_repo_read",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            repositories: [
              {
                full_name: "sample-org/vtdd-v2-p",
                name: "vtdd-v2-p",
                private: false,
                default_branch: "main",
                html_url: "https://github.com/sample-org/vtdd-v2-p"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.read.resource, "repositories");
  assert.equal(body.read.records[0].fullName, "sample-org/vtdd-v2-p");
});

test("worker stores and retrieves repository nicknames", async () => {
  const provider = createInMemoryMemoryProvider();
  const env = {
    ...gatewayAuthEnv,
    MEMORY_PROVIDER: provider,
    GITHUB_APP_INSTALLATION_TOKEN: "ghs_repo_read",
    GITHUB_API_FETCH: async () =>
      new Response(
        JSON.stringify({
          total_count: 1,
          repositories: [
            {
              full_name: "sample-org/vtdd-v2-p",
              name: "vtdd-v2-p",
              private: false
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
  };

  const writeResponse = await worker.fetch(
    new Request("https://example.com/v2/action/repository-nickname", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "vtdd-v2-p",
        nickname: "公開VTDD"
      })
    }),
    env
  );

  assert.equal(writeResponse.status, 200);
  const writeBody = await writeResponse.json();
  assert.equal(writeBody.ok, true);
  assert.equal(writeBody.repository, "sample-org/vtdd-v2-p");
  assert.deepEqual(writeBody.aliasEntry.aliases, ["公開VTDD"]);

  const retrieveResponse = await worker.fetch(
    new Request("https://example.com/v2/retrieve/repository-nicknames", {
      headers: gatewayAuthHeaders
    }),
    env
  );

  assert.equal(retrieveResponse.status, 200);
  const retrieveBody = await retrieveResponse.json();
  assert.equal(retrieveBody.ok, true);
  assert.equal(retrieveBody.aliasRegistry.length, 1);
  assert.equal(retrieveBody.aliasRegistry[0].canonicalRepo, "sample-org/vtdd-v2-p");
  assert.deepEqual(retrieveBody.aliasRegistry[0].aliases, ["公開VTDD"]);
});

test("worker deletes explicit repository nickname aliases and retrieve confirms removal", async () => {
  const provider = createInMemoryMemoryProvider();
  const env = {
    ...gatewayAuthEnv,
    MEMORY_PROVIDER: provider,
    GITHUB_APP_INSTALLATION_TOKEN: "ghs_repo_read",
    GITHUB_API_FETCH: async () =>
      new Response(
        JSON.stringify({
          total_count: 4,
          repositories: [
            { full_name: "owner/repository", name: "repository", private: false },
            { full_name: "example/example", name: "example", private: false },
            { full_name: "marushu/vtdd-v2-p", name: "vtdd-v2-p", private: false },
            {
              full_name: "marushu/hibou-piccola-bookkeeping",
              name: "hibou-piccola-bookkeeping",
              private: true
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
  };

  for (const [repository, nickname] of [
    ["owner/repository", "default"],
    ["example/example", "example"],
    ["marushu/vtdd-v2-p", "ぶい"],
    ["marushu/hibou-piccola-bookkeeping", "TOMIO"]
  ]) {
    const response = await worker.fetch(
      new Request("https://example.com/v2/action/repository-nickname", {
        method: "POST",
        headers: gatewayAuthHeaders,
        body: JSON.stringify({ repository, nickname })
      }),
      env
    );
    assert.equal(response.status, 200);
  }

  for (const [repository, nickname] of [
    ["owner/repository", "default"],
    ["example/example", "example"]
  ]) {
    const response = await worker.fetch(
      new Request("https://example.com/v2/action/repository-nickname/delete", {
        method: "POST",
        headers: gatewayAuthHeaders,
        body: JSON.stringify({ repository, nickname })
      }),
      env
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.deleted, true);
  }

  const retrieveResponse = await worker.fetch(
    new Request("https://example.com/v2/retrieve/repository-nicknames", {
      headers: gatewayAuthHeaders
    }),
    env
  );

  assert.equal(retrieveResponse.status, 200);
  const retrieveBody = await retrieveResponse.json();
  assert.equal(retrieveBody.ok, true);
  assert.equal(
    retrieveBody.aliasRegistry.some((item) => item.aliases.includes("default")),
    false
  );
  assert.equal(
    retrieveBody.aliasRegistry.some((item) => item.aliases.includes("example")),
    false
  );
  assert.deepEqual(
    retrieveBody.aliasRegistry.find((item) => item.canonicalRepo === "marushu/vtdd-v2-p")
      .aliases,
    ["ぶい"]
  );
  assert.deepEqual(
    retrieveBody.aliasRegistry.find(
      (item) => item.canonicalRepo === "marushu/hibou-piccola-bookkeeping"
    ).aliases,
    ["TOMIO"]
  );
});

test("worker surfaces repository nickname delete not found errors", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/repository-nickname/delete", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "owner/repository",
        nickname: "default"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_API_FETCH: async () =>
        new Response(JSON.stringify({ total_count: 0, repositories: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    }
  );

  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, 404);
  assert.equal(body.error, "repository_nickname_not_found");
  assert.deepEqual(body.issues, ["repository nickname entry not found"]);
});

test("worker surfaces repository nickname retrieval failures as action-visible JSON", async () => {
  const failingProvider = {
    async store() {
      return { ok: true };
    },
    async retrieve(filter) {
      if (filter?.type === MemoryRecordType.ALIAS_REGISTRY) {
        throw new TypeError("Illegal invocation (incorrect this reference)");
      }
      return [];
    },
    async query() {
      return [];
    },
    async validateRecord() {
      return { ok: true };
    }
  };

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/repository-nicknames", {
      headers: gatewayAuthHeaders
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: failingProvider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, 503);
  assert.equal(body.error, "repository_nickname_retrieval_failed");
  assert.equal(body.reason, "Illegal invocation (incorrect this reference)");
  assert.deepEqual(body.issues, ["repository_nickname_retrieval_exception"]);
  assert.deepEqual(body.aliasRegistry, []);
});

test("worker can return action-visible unauthorized envelope for repository nickname retrieval", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/repository-nicknames?responseMode=action_visible"),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "required-token"
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, 401);
  assert.equal(body.error, "unauthorized");
});

test("worker can return action-visible unauthorized envelope for retrieve routes", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/decisions?responseMode=action_visible"),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "required-token"
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, 401);
  assert.equal(body.error, "unauthorized");
  assert.equal(Array.isArray(body.issues), true);
  assert.equal(body.diagnostics.route, "/v2/retrieve/decisions");
  assert.equal(body.diagnostics.responseMode, "action_visible");
  assert.match(body.diagnostics.rootCause, /ClientResponseError/);
});

test("worker gateway can resolve stored repository nickname against live repository index", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "alias_registry:sample-org/vtdd-v2-p",
    type: MemoryRecordType.ALIAS_REGISTRY,
    content: {
      canonicalRepo: "sample-org/vtdd-v2-p",
      productName: "vtdd-v2-p",
      visibility: "public",
      aliases: ["公開VTDD"]
    },
    metadata: { source: "test" },
    priority: 60,
    tags: ["alias_registry", "sample-org/vtdd-v2-p"],
    createdAt: "2026-04-27T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.EXECUTOR,
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "公開VTDD",
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.EXECUTE] },
          approvalPhrase: "GO build",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_repo_read",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            total_count: 1,
            repositories: [
              {
                full_name: "sample-org/vtdd-v2-p",
                name: "vtdd-v2-p",
                private: false
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "sample-org/vtdd-v2-p");
});

test("worker gateway warns when runtime nickname registry read is unverified", async () => {
  const failingProvider = {
    async store() {
      return { ok: true };
    },
    async retrieve(filter) {
      if (filter?.type === MemoryRecordType.ALIAS_REGISTRY) {
        throw new TypeError("Illegal invocation (incorrect this reference)");
      }
      return [];
    },
    async query() {
      return [];
    },
    async validateRecord() {
      return { ok: true };
    }
  };

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE] },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: failingProvider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "sample-org/vtdd-v2");
  assert.equal(
    body.warnings.some((warning) =>
      warning.includes("repository nickname registry read unverified")
    ),
    true
  );
});

test("worker blocks repository nickname write when nickname target is ambiguous", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "alias_registry:sample-org/vtdd-v2-p",
    type: MemoryRecordType.ALIAS_REGISTRY,
    content: {
      canonicalRepo: "sample-org/vtdd-v2-p",
      productName: "vtdd-v2-p",
      visibility: "public",
      aliases: ["公開VTDD"]
    },
    metadata: { source: "test" },
    priority: 60,
    tags: ["alias_registry", "sample-org/vtdd-v2-p"],
    createdAt: "2026-04-27T00:00:00.000Z"
  });
  await provider.store({
    id: "alias_registry:sample-org/vtdd-public",
    type: MemoryRecordType.ALIAS_REGISTRY,
    content: {
      canonicalRepo: "sample-org/vtdd-public",
      productName: "vtdd-public",
      visibility: "public",
      aliases: ["公開VTDD"]
    },
    metadata: { source: "test" },
    priority: 60,
    tags: ["alias_registry", "sample-org/vtdd-public"],
    createdAt: "2026-04-27T00:00:01.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/action/repository-nickname", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "公開VTDD",
        nickname: "公開本命"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_repo_read",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            total_count: 2,
            repositories: [
              {
                full_name: "sample-org/vtdd-v2-p",
                name: "vtdd-v2-p",
                private: false
              },
              {
                full_name: "sample-org/vtdd-public",
                name: "vtdd-public",
                private: false
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "repository_nickname_request_invalid");
  assert.equal(body.reason, "target repository nickname is ambiguous");
});

test("worker stores repository nickname for canonical owner repo without prior alias registry entry", async () => {
  const provider = createInMemoryMemoryProvider();

  const response = await worker.fetch(
    new Request("https://example.com/v2/action/repository-nickname", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        repository: "sample-org/new-repo",
        nickname: "新規Repo"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_API_FETCH: async () =>
        new Response(JSON.stringify({ total_count: 0, repositories: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.repository, "sample-org/new-repo");
  assert.deepEqual(body.aliasEntry.aliases, ["新規Repo"]);
});

test("worker returns GitHub issues through read plane route", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/github?resource=issues&repository=sample-org/vtdd-v2-p&state=open&limit=5",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_issue_read",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify([
            {
              number: 46,
              title: "Implement GitHub read plane",
              body: "## Intent\nExpose Issue text to Butler.",
              state: "open",
              html_url: "https://github.com/sample-org/vtdd-v2-p/issues/46",
              user: { login: "marushu" }
            }
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.read.records[0].number, 46);
  assert.equal(body.read.records[0].body, "## Intent\nExpose Issue text to Butler.");
});

test("worker returns repository contents and workflow job steps through read plane route", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/github?resource=contents&repository=sample-org/vtdd-v2-p&path=AGENTS.md&ref=main",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_repo_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/contents/AGENTS.md")) {
          return new Response(
            JSON.stringify({
              name: "AGENTS.md",
              path: "AGENTS.md",
              type: "file",
              size: 28,
              sha: "agents-sha",
              encoding: "base64",
              content: Buffer.from("Issue-driven source truth.\n", "utf8").toString("base64"),
              html_url: "https://github.com/sample-org/vtdd-v2-p/blob/main/AGENTS.md",
              download_url: "https://raw.githubusercontent.com/sample-org/vtdd-v2-p/main/AGENTS.md"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ message: `unexpected ${parsed.pathname}` }), { status: 404 });
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.read.resource, "contents");
  assert.equal(body.read.records[0].path, "AGENTS.md");
  assert.equal(body.read.records[0].content, "Issue-driven source truth.\n");

  const jobsResponse = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/github?resource=workflow_jobs&repository=sample-org/vtdd-v2-p&runId=4004",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_repo_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/actions/runs/4004/jobs")) {
          return new Response(
            JSON.stringify({
              jobs: [
                {
                  id: 5005,
                  run_id: 4004,
                  name: "test",
                  status: "completed",
                  conclusion: "failure",
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/4004/job/5005",
                  steps: [
                    {
                      name: "npm test",
                      number: 3,
                      status: "completed",
                      conclusion: "failure"
                    }
                  ]
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ message: `unexpected ${parsed.pathname}` }), { status: 404 });
      }
    }
  );

  assert.equal(jobsResponse.status, 200);
  const jobsBody = await jobsResponse.json();
  assert.equal(jobsBody.ok, true);
  assert.equal(jobsBody.read.resource, "workflow_jobs");
  assert.equal(jobsBody.read.records[0].steps[0].conclusion, "failure");
});

test("worker returns unsupported for unknown GitHub read resources", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/github?resource=milestones", {
      headers: gatewayAuthHeaders
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_issue_read"
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "github_read_request_invalid");
});

test("worker returns canonical Custom GPT setup artifacts", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/setup-artifact?artifact=instructions&repository=sample-org/vtdd-v2-p&ref=main",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            sha: "instructions-sha",
            encoding: "base64",
            content: Buffer.from("vtddRetrieveCloudflarePages\nvtddRetrieveSetupArtifact\nvtddRetrieveSelfParity", "utf8").toString(
              "base64"
            )
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.artifact.artifact, "instructions");
  assert.equal(body.artifact.path, "docs/setup/custom-gpt-instructions.md");
  assert.equal(body.artifact.content.includes("vtddRetrieveSelfParity"), true);
});

test("worker returns Butler self-parity summary", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/self-parity?repository=sample-org/vtdd-v2-p&ref=main&issueNumber=91&pullNumber=148",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/docs/setup/known-good.json")) {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }
        const isInstructions = parsed.pathname.endsWith("/docs/setup/custom-gpt-instructions.md");
        return new Response(
          JSON.stringify({
            sha: isInstructions ? "instructions-sha" : "openapi-sha",
            encoding: "base64",
            content: Buffer.from(
              isInstructions
                ? [
                    "vtddGateway",
                    "vtddDeployProduction",
                    "vtddRetrieveGitHub",
                    "vtddRetrieveCloudflarePages",
                    "vtddRetrieveSetupArtifact",
                    "vtddRetrieveSelfParity",
                    "Action Schema update required",
                    "Instructions update required",
                    "Cloudflare deploy update required"
                  ].join("\n")
                : [
                    "paths:",
                    "  /v2/gateway:",
                    "  /v2/action/deploy:",
                    "  /v2/retrieve/github:",
                    "  /v2/retrieve/cloudflare-pages:",
                    "  /v2/retrieve/setup-artifact:",
                    "  /v2/retrieve/self-parity:",
                    "    get:",
                    "      operationId: vtddGateway",
                    "      operationId: vtddDeployProduction",
                    "      operationId: vtddRetrieveGitHub",
                    "      operationId: vtddRetrieveCloudflarePages",
                    "      operationId: vtddRetrieveSetupArtifact",
                    "      operationId: vtddRetrieveSelfParity"
                  ].join("\n"),
              "utf8"
            ).toString("base64")
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.selfParity.runtimeParity, "in_sync");
  assert.equal(body.selfParity.runtimeMissingRoutes.length, 0);
  assert.equal(body.selfParity.canonical.artifacts.instructions.path, "docs/setup/custom-gpt-instructions.md");
  assert.equal(
    body.selfParity.deployOperatorUrl,
    "https://example.com/v2/approval/passkey/operator?repositoryInput=sample-org%2Fvtdd-v2-p&phase=execution&actionType=deploy_production&highRiskKind=deploy_production&issueNumber=91"
  );
  assert.equal(
    body.selfParity.deployOperatorMarkdownLink,
    `[Open deploy operator](${body.selfParity.deployOperatorUrl})`
  );
  assert.equal(
    body.selfParity.githubAppSecretSyncOperatorUrl,
    "https://example.com/v2/approval/passkey/operator?repositoryInput=sample-org%2Fvtdd-v2-p&phase=execution&actionType=destructive&highRiskKind=github_app_secret_sync&issueNumber=91"
  );
  assert.equal(
    body.selfParity.githubAppSecretSyncOperatorMarkdownLink,
    `[Open GitHub App secret sync operator](${body.selfParity.githubAppSecretSyncOperatorUrl})`
  );
  assert.notEqual(body.selfParity.githubAppSecretSyncOperatorUrl, body.selfParity.deployOperatorUrl);
  assert.equal(
    body.selfParity.issueCloseOperatorUrl,
    "https://example.com/v2/approval/passkey/operator?repositoryInput=sample-org%2Fvtdd-v2-p&phase=execution&actionType=issue_close&highRiskKind=issue_close&issueNumber=91&pullNumber=148"
  );
  assert.equal(
    body.selfParity.issueCloseOperatorMarkdownLink,
    `[Open issue close operator](${body.selfParity.issueCloseOperatorUrl})`
  );
  assert.equal(body.selfParity.issueCloseOperator.status, "ready");
  assert.deepEqual(body.selfParity.issueCloseOperator.blockers, []);
  assert.equal(body.selfParity.deployRecovery, null);
  assert.equal(body.selfParity.surfaceUpdateChecklist.cloudflareDeploy.status, "not_required");
  assert.equal(body.selfParity.knownGoodComparison.status, "known_good_unavailable");
  assert.equal(
    body.selfParity.surfaceUpdateChecklist.customGptActionSchema.status,
    "unverified_editor_state"
  );
  assert.equal(
    body.selfParity.surfaceUpdateChecklist.customGptInstructions.sourceSha,
    "instructions-sha"
  );
});

test("worker returns Butler startup preflight from shared repo truth and memory", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "startup-preflight-memory-344",
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      summary: "Issue #344 promotes thread-local Butler-first startup behavior into repo truth.",
      checkpointReason: "avoid drift across Butler, mac Codex, and VPS Codex CLI",
      userTension: "iPhone/iPad-first recovery must not depend on the Mac being awake"
    },
    metadata: { repository: "sample-org/vtdd-v2-p", relatedIssue: 344 },
    priority: 90,
    tags: ["working_memory", "rag-checkpoint", "startup-preflight", "issue:344"],
    createdAt: "2026-05-15T00:00:00Z"
  });

  const sourceContent = {
    "AGENTS.md": [
      "# AGENTS.md",
      "Purpose: ".padEnd(520, "x"),
      "## Butler-First Operating Principle",
      "VTDD is iPhone/iPad-first and handoff-first."
    ].join("\n"),
    ".agents/skills/vtdd-chief-butler/SKILL.md": [
      "---",
      "name: vtdd-chief-butler",
      "---",
      "# VTDD Chief Butler",
      "repository-backed traffic-control contract"
    ].join("\n"),
    ".agents/skills/vtdd-status-advisor/SKILL.md": [
      "---",
      "name: vtdd-status-advisor",
      "---",
      "# VTDD Status Advisor",
      "readonly answer, blocker judgment, and next-action advice"
    ].join("\n"),
    "docs/butler/thread-independent-startup-contract.md": [
      "# Thread-independent startup contract",
      "Startup source order: ".padEnd(520, "y"),
      "threadLocalAssumptionsPromoted=false",
      "Butler -> VPS Codex CLI"
    ].join("\n"),
    "docs/butler/execution-queue-contract.md": [
      "# VTDD Execution Queue Contract",
      "Owner input is a queue update event before it is an implementation instruction.",
      "`EMERGENCY` `ROOT` `NEXT` `QUEUE` `EVIDENCE` `QUESTION`"
    ].join("\n"),
    "docs/mvp/active-issue-execution-queue.md": [
      "# Active Issue Execution Queue",
      "## Now",
      "- Issue #590: app-server turn timeout must become a recoverable Dashboard chat state.",
      "## Next",
      "- Issue #579: after timeout recovery, handle PWA reconnect/auth recovery.",
      "## Root Blockers",
      "- Issue #450: Dashboard Butler live runtime remains the central route blocker.",
      "## Evidence Gaps",
      "- Issue #528: Dashboard normal chat usability still needs production PWA evidence.",
      "## Blocked",
      "- Issue #355: high-risk authority requires scoped approval.",
      "## Queue",
      "- Issue #599: PR and Issue titles should be Japanese-first.",
      "## Questions",
      "- Issue #595: runtime auto-classification remains incomplete."
    ].join("\n"),
    "docs/butler/capability-matrix.md": [
      "# Butler capability matrix",
      "Startup Surface Dependency Reading",
      "Mac dependency detected"
    ].join("\n"),
    "docs/setup/custom-gpt-instructions.md": [
      "vtddGateway",
      "vtddDeployProduction",
      "vtddRetrieveGitHub",
      "vtddRetrieveCloudflarePages",
      "vtddRetrieveSetupArtifact",
      "vtddRetrieveSelfParity",
      "vtddStartupPreflight",
      "Action Schema update required",
      "Instructions update required",
      "Cloudflare deploy update required"
    ].join("\n"),
    "docs/setup/custom-gpt-actions-openapi.yaml": [
      "paths:",
      "  /v2/gateway:",
      "  /v2/action/deploy:",
      "  /v2/retrieve/github:",
      "  /v2/retrieve/cloudflare-pages:",
      "  /v2/retrieve/setup-artifact:",
      "  /v2/retrieve/self-parity:",
      "  /v2/retrieve/startup-preflight:",
      "    get:",
      "      operationId: vtddGateway",
      "      operationId: vtddDeployProduction",
      "      operationId: vtddRetrieveGitHub",
      "      operationId: vtddRetrieveCloudflarePages",
      "      operationId: vtddRetrieveSetupArtifact",
      "      operationId: vtddRetrieveSelfParity",
      "      operationId: vtddStartupPreflight"
    ].join("\n")
  };

  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/startup-preflight?repository=sample-org/vtdd-v2-p&issueNumber=344&currentSurface=butler&phase=execution",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_startup_read",
      MEMORY_PROVIDER: provider,
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/docs/setup/known-good.json")) {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }
        if (parsed.pathname.endsWith("/issues/344")) {
          return new Response(
            JSON.stringify({
              number: 344,
              title: "spec: Butler / mac Codex / VPS Codex CLI 共通 startup preflight",
              body: "Intent: all surfaces read the same startup context before work.",
              state: "open",
              html_url: "https://github.com/sample-org/vtdd-v2-p/issues/344",
              user: { login: "marushu" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (parsed.pathname.endsWith("/issues")) {
          return new Response(
            JSON.stringify([
              {
                number: 344,
                title: "spec: Butler / mac Codex / VPS Codex CLI 共通 startup preflight",
                body: "Intent: all surfaces read the same startup context before work.",
                state: "open",
                html_url: "https://github.com/sample-org/vtdd-v2-p/issues/344",
                user: { login: "marushu" }
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (parsed.pathname.includes("/contents/")) {
          const decodedPath = decodeURIComponent(
            parsed.pathname.split("/contents/")[1] || ""
          );
          const content = sourceContent[decodedPath];
          if (!content) {
            return new Response(JSON.stringify({ message: "Not Found" }), {
              status: 404,
              headers: { "content-type": "application/json" }
            });
          }
          return new Response(
            JSON.stringify({
              name: decodedPath.split("/").pop(),
              path: decodedPath,
              type: "file",
              sha: `${decodedPath.replace(/[^a-z0-9]/gi, "-")}-sha`,
              html_url: `https://github.com/sample-org/vtdd-v2-p/blob/main/${decodedPath}`,
              encoding: "base64",
              content: Buffer.from(content, "utf8").toString("base64")
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`unexpected GitHub API url: ${parsed.pathname}`);
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.startupPreflight.schemaVersion, "startup_preflight_v1");
  assert.equal(body.startupPreflight.repository, "sample-org/vtdd-v2-p");
  assert.equal(body.startupPreflight.issueNumber, 344);
  assert.equal(body.startupPreflight.threadLocalAssumptionsPromoted, true);
  assert.equal(body.startupPreflight.butlerFirstPrinciple.status, "promoted");
  assert.equal(body.startupPreflight.repoBackedSkills.status, "read");
  assert.deepEqual(body.startupPreflight.repoBackedSkills.missingSkills, []);
  assert.equal(
    body.startupPreflight.repoBackedSkills.requiredSkills.find(
      (skill) => skill.name === "vtdd-chief-butler"
    )?.role,
    "central_traffic_control"
  );
  assert.equal(body.startupPreflight.toolParityInventory.status, "partial");
  assert.equal(
    body.startupPreflight.toolParityInventory.buckets.repoBacked.includes("repo-validation-scripts"),
    true
  );
  assert.equal(
    body.startupPreflight.toolParityInventory.buckets.macOnlyGaps.includes("openai-developers-skills"),
    true
  );
  assert.match(
    body.startupPreflight.toolParityInventory.ownerFacingSummary,
    /#495 parity gaps/
  );
  assert.equal(body.startupPreflight.executionQueue.status, "read");
  assert.equal(
    body.startupPreflight.executionQueue.currentNow,
    "Issue #590: app-server turn timeout must become a recoverable Dashboard chat state."
  );
  assert.equal(body.startupPreflight.executionQueue.contract.classificationContractPresent, true);
  assert.deepEqual(body.startupPreflight.executionQueue.missingSections, []);
  assert.equal(
    body.startupPreflight.executionQueue.sectionSummaries["Root Blockers"].firstBullet,
    "Issue #450: Dashboard Butler live runtime remains the central route blocker."
  );
  assert.match(body.startupPreflight.executionQueue.ownerFacingSummary, /Issue #590/);
  assert.equal(body.startupPreflight.activeIssue.number, 344);
  assert.equal(body.startupPreflight.memory.status, "read");
  assert.equal(body.startupPreflight.memory.compactContext[0].id, "startup-preflight-memory-344");
  assert.equal(body.startupPreflight.setup.status, "read");
  assert.equal(body.startupPreflight.surfaceCapability.macRequired, false);
  assert.equal(body.startupPreflight.gapClassification.includes("mac_codex_only_probe"), false);
  assert.match(body.startupPreflight.nextSafeAction, /Issue #344/);
});

test("worker marks startup execution queue unverified when active queue source is missing", async () => {
  const provider = createInMemoryMemoryProvider();
  const sourceContent = {
    "AGENTS.md": "## Butler-First Operating Principle\nVTDD is iPhone/iPad-first.",
    ".agents/skills/vtdd-chief-butler/SKILL.md": "---\nname: vtdd-chief-butler\n---\n",
    ".agents/skills/vtdd-status-advisor/SKILL.md": "---\nname: vtdd-status-advisor\n---\n",
    "docs/butler/thread-independent-startup-contract.md":
      "threadLocalAssumptionsPromoted=false",
    "docs/butler/execution-queue-contract.md":
      "`EMERGENCY` `ROOT` `NEXT` `QUEUE` `EVIDENCE` `QUESTION`",
    "docs/butler/capability-matrix.md": "Startup Surface Dependency Reading",
    "docs/setup/custom-gpt-instructions.md": "vtddStartupPreflight",
    "docs/setup/custom-gpt-actions-openapi.yaml":
      "paths:\n  /v2/retrieve/startup-preflight:\n    get:\n      operationId: vtddStartupPreflight"
  };

  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/startup-preflight?repository=sample-org/vtdd-v2-p&issueNumber=609&currentSurface=dashboard_butler&phase=execution",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_startup_read",
      MEMORY_PROVIDER: provider,
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/docs/setup/known-good.json")) {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }
        if (parsed.pathname.endsWith("/issues/609")) {
          return new Response(
            JSON.stringify({
              number: 609,
              title: "Dashboard Butler traffic-control preflight",
              body: "Intent: expose execution queue truth to Dashboard Butler.",
              state: "open",
              html_url: "https://github.com/sample-org/vtdd-v2-p/issues/609",
              user: { login: "marushu" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (parsed.pathname.endsWith("/issues")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        if (parsed.pathname.includes("/contents/")) {
          const decodedPath = decodeURIComponent(
            parsed.pathname.split("/contents/")[1] || ""
          );
          const content = sourceContent[decodedPath];
          if (!content) {
            return new Response(JSON.stringify({ message: "Not Found" }), {
              status: 404,
              headers: { "content-type": "application/json" }
            });
          }
          return new Response(
            JSON.stringify({
              path: decodedPath,
              type: "file",
              sha: `${decodedPath.replace(/[^a-z0-9]/gi, "-")}-sha`,
              html_url: `https://github.com/sample-org/vtdd-v2-p/blob/main/${decodedPath}`,
              encoding: "base64",
              content: Buffer.from(content, "utf8").toString("base64")
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`unexpected GitHub API url: ${parsed.pathname}`);
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.startupPreflight.executionQueue.status, "未確認");
  assert.equal(body.startupPreflight.executionQueue.activeQueue.status, "未確認");
  assert.equal(
    body.startupPreflight.missingSources.some(
      (source) => source.path === "docs/mvp/active-issue-execution-queue.md"
    ),
    true
  );
  assert.match(body.startupPreflight.executionQueue.ownerFacingSummary, /未確認/);
});

test("worker returns deploy recovery operator url in self-parity when runtime is stale", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/self-parity?repository=sample-org/vtdd-v2-p&ref=main&issueNumber=91",
      {
        headers: gatewayAuthHeaders
      }
    ),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/docs/setup/known-good.json")) {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }
        const isInstructions = parsed.pathname.endsWith("/docs/setup/custom-gpt-instructions.md");
        return new Response(
          JSON.stringify({
            sha: isInstructions ? "instructions-sha" : "openapi-sha",
            encoding: "base64",
            content: Buffer.from(
              isInstructions
                ? [
                    "vtddGateway",
                    "vtddDeployProduction",
                    "vtddRetrieveGitHub",
                    "vtddRetrieveCloudflarePages",
                    "vtddRetrieveSetupArtifact",
                    "vtddRetrieveSelfParity",
                    "Action Schema update required",
                    "Instructions update required",
                    "Cloudflare deploy update required"
                  ].join("\n")
                : [
                    "paths:",
                    "  /v2/gateway:",
                    "  /v2/action/deploy:",
                    "  /v2/retrieve/github:",
                    "  /v2/retrieve/cloudflare-pages:",
                    "  /v2/retrieve/setup-artifact:",
                    "  /v2/retrieve/self-parity:",
                    "    get:",
                    "      operationId: vtddGateway",
                    "      operationId: vtddDeployProduction",
                    "      operationId: vtddRetrieveGitHub",
                    "      operationId: vtddRetrieveCloudflarePages",
                    "      operationId: vtddRetrieveSetupArtifact",
                    "      operationId: vtddRetrieveSelfParity",
                    "      operationId: vtddBrandNewParityRoute"
                  ].join("\n"),
              "utf8"
            ).toString("base64")
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.selfParity.runtimeParity, "cloudflare_deploy_update_required");
  assert.equal(
    body.selfParity.deployRecovery.operatorUrl,
    "https://example.com/v2/approval/passkey/operator?repositoryInput=sample-org%2Fvtdd-v2-p&phase=execution&actionType=deploy_production&highRiskKind=deploy_production&issueNumber=91"
  );
  assert.equal(
    body.selfParity.deployRecovery.operatorMarkdownLink,
    `[Open deploy operator](${body.selfParity.deployRecovery.operatorUrl})`
  );
  assert.equal(body.selfParity.surfaceUpdateChecklist.cloudflareDeploy.status, "required");
  assert.equal(
    body.selfParity.surfaceUpdateChecklist.cloudflareDeploy.operatorUrl,
    body.selfParity.deployRecovery.operatorUrl
  );
});

test("worker executes scoped GitHub issues and issue comments through the normal write plane", async () => {
  const issueResponse = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "issue_create",
        repository: "sample-org/vtdd-v2-p",
        title: "test: live E2E evidence",
        body: "Issue body fixed by approval scope.",
        policyInput: {
          approvalPhrase: "GO",
          targetConfirmed: true,
          approvalScopeMatched: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            number: 107,
            title: "test: live E2E evidence",
            state: "open",
            html_url: "https://github.com/sample-org/vtdd-v2-p/issues/107"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        )
    }
  );

  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "issue_comment_create",
        repository: "sample-org/vtdd-v2-p",
        issueContext: {
          issueNumber: 52
        },
        body: "scoped comment",
        policyInput: {
          approvalPhrase: "GO",
          targetConfirmed: true,
          approvalScopeMatched: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            id: 101,
            html_url: "https://github.com/sample-org/vtdd-v2-p/issues/52#issuecomment-101"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(issueResponse.status, 200);
  const issueBody = await issueResponse.json();
  assert.equal(issueBody.ok, true);
  assert.equal(issueBody.write.operation, "issue_create");
  assert.equal(issueBody.write.issueNumber, 107);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.write.operation, "issue_comment_create");
  assert.equal(body.write.commentId, 101);
});

test("worker binds natural GO to an immediately presented issue_create payload", async () => {
  let requestBody = null;
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "issue_create",
        repository: "sample-org/vtdd-v2-p",
        title: "live E2E: natural GO issue create",
        body: "Parent: #151\n\nExact payload shown immediately before GO.",
        responseMode: "action_visible",
        naturalApproval: {
          exactPayloadPresented: true,
          repositoryResolved: true,
          userText: "この title/body で Issue を作成して。GO",
          presentedPayload: {
            operation: "issue_create",
            repository: "sample-org/vtdd-v2-p",
            title: "live E2E: natural GO issue create",
            body: "Parent: #151\n\nExact payload shown immediately before GO."
          }
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            number: 151,
            title: "live E2E: natural GO issue create",
            state: "open",
            html_url: "https://github.com/sample-org/vtdd-v2-p/issues/151"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.write.operation, "issue_create");
  assert.equal(body.write.issueNumber, 151);
  assert.deepEqual(requestBody, {
    title: "live E2E: natural GO issue create",
    body: "Parent: #151\n\nExact payload shown immediately before GO."
  });
});

test("worker binds natural GO to an immediately presented issue_comment_create payload", async () => {
  let requestBody = null;
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "issue_comment_create",
        repository: "sample-org/vtdd-v2-p",
        issueContext: {
          issueNumber: 161
        },
        body: "Live evidence comment for #161.",
        responseMode: "action_visible",
        naturalApproval: {
          exactPayloadPresented: true,
          repositoryResolved: true,
          userText: "このコメントで追記して。GO",
          presentedPayload: {
            operation: "issue_comment_create",
            repository: "sample-org/vtdd-v2-p",
            issueNumber: 161,
            body: "Live evidence comment for #161."
          }
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            id: 435161,
            html_url: "https://github.com/sample-org/vtdd-v2-p/issues/161#issuecomment-435161"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.write.operation, "issue_comment_create");
  assert.equal(body.write.issueNumber, 161);
  assert.equal(body.write.commentId, 435161);
  assert.deepEqual(requestBody, {
    body: "Live evidence comment for #161."
  });
});

test("worker binds natural GO to an immediately presented pull_comment_create payload", async () => {
  let requestBody = null;
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "pull_comment_create",
        repository: "sample-org/vtdd-v2-p",
        pullNumber: 162,
        body: "PR follow-up comment.",
        responseMode: "action_visible",
        naturalApproval: {
          exactPayloadPresented: true,
          repositoryResolved: true,
          userText: "この PR コメントで投稿して。GO",
          presentedPayload: {
            operation: "pull_comment_create",
            repository: "sample-org/vtdd-v2-p",
            pullNumber: 162,
            body: "PR follow-up comment."
          }
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async (_url, init) => {
        requestBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            id: 435162,
            html_url: "https://github.com/sample-org/vtdd-v2-p/pull/162#issuecomment-435162"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.write.operation, "pull_comment_create");
  assert.equal(body.write.pullNumber, 162);
  assert.equal(body.write.commentId, 435162);
  assert.deepEqual(requestBody, {
    body: "PR follow-up comment."
  });
});

test("worker does not bind natural GO when issue_create payload was not presented", async () => {
  let githubCalled = false;
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "issue_create",
        repository: "sample-org/vtdd-v2-p",
        title: "live E2E: natural GO issue create",
        body: "Payload was not presented.",
        responseMode: "action_visible",
        naturalApproval: {
          exactPayloadPresented: false,
          repositoryResolved: true,
          userText: "GO",
          presentedPayload: {
            operation: "issue_create",
            repository: "sample-org/vtdd-v2-p",
            title: "live E2E: natural GO issue create",
            body: "Payload was not presented."
          }
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async () => {
        githubCalled = true;
        return new Response(JSON.stringify({ number: 1 }), {
          status: 201,
          headers: { "content-type": "application/json" }
        });
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, 422);
  assert.equal(body.issues.includes("targetConfirmed must be true"), true);
  assert.equal(body.issues.includes("approvalScopeMatched must be true"), true);
  assert.equal(body.issues.includes("approvalPhrase must be GO"), true);
  assert.equal(githubCalled, false);
});

test("worker does not bind natural GO when presented issue_create payload differs", async () => {
  let githubCalled = false;
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "issue_create",
        repository: "sample-org/vtdd-v2-p",
        title: "actual title",
        body: "actual body",
        responseMode: "action_visible",
        naturalApproval: {
          exactPayloadPresented: true,
          repositoryResolved: true,
          userText: "GO",
          presentedPayload: {
            operation: "issue_create",
            repository: "sample-org/vtdd-v2-p",
            title: "different title",
            body: "actual body"
          }
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async () => {
        githubCalled = true;
        return new Response(JSON.stringify({ number: 1 }), {
          status: 201,
          headers: { "content-type": "application/json" }
        });
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, 422);
  assert.equal(githubCalled, false);
});

test("worker keeps natural GO binding limited to configured normal write operations", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "pull_create",
        repository: "sample-org/vtdd-v2-p",
        title: "PR title",
        body: "PR body",
        head: "codex/example",
        responseMode: "action_visible",
        naturalApproval: {
          exactPayloadPresented: true,
          repositoryResolved: true,
          userText: "GO",
          presentedPayload: {
            operation: "pull_create",
            repository: "sample-org/vtdd-v2-p",
            title: "PR title",
            body: "PR body"
          }
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write"
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, 422);
  assert.equal(body.issues.includes("targetConfirmed must be true"), true);
});

test("worker rejects unsupported high-risk GitHub write operations on the normal write plane", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "merge",
        repository: "sample-org/vtdd-v2-p",
        responseMode: "action_visible",
        policyInput: {
          approvalPhrase: "GO",
          targetConfirmed: true,
          approvalScopeMatched: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write"
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, 422);
  assert.equal(body.error, "github_write_request_invalid");
});

test("worker returns action-visible GitHub write fetch failures", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "issue_create",
        repository: "sample-org/vtdd-v2-p",
        title: "test",
        body: "body",
        responseMode: "action_visible",
        policyInput: {
          approvalPhrase: "GO",
          targetConfirmed: true,
          approvalScopeMatched: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async () => {
        throw new TypeError("fetch failed");
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, 503);
  assert.equal(body.error, "github_write_failed");
  assert.equal(body.reason, "failed to execute GitHub write operation: issue_create");
  assert.equal(body.issues.includes("github_write_fetch_exception"), true);
  assert.deepEqual(body.diagnostics, {
    operation: "issue_create",
    requestMethod: "POST",
    requestUrl: "https://api.github.com/repos/sample-org/vtdd-v2-p/issues",
    exceptionName: "TypeError",
    exceptionMessage: "fetch failed"
  });
});

test("worker preserves HTTP error status for GitHub write consumers that do not request action envelopes", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "merge",
        repository: "sample-org/vtdd-v2-p",
        policyInput: {
          approvalPhrase: "GO",
          targetConfirmed: true,
          approvalScopeMatched: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write"
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, undefined);
  assert.equal(body.error, "github_write_request_invalid");
});

test("worker executes GitHub merge on the high-risk authority plane with approval grant id", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-merge-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-merge-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "merge",
        highRiskKind: "pull_merge",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "55",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-26T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github-authority", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "pull_merge",
        repository: "sample-org/vtdd-v2-p",
        pullNumber: 21,
        mergeMethod: "squash",
        issueContext: {
          issueNumber: 55
        },
        policyInput: {
          approvalPhrase: "GO",
          approvalGrantId: "approval-merge-123",
          targetConfirmed: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            sha: "abc123",
            merged: true,
            message: "Pull Request successfully merged"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.authorityAction.operation, "pull_merge");
  assert.equal(body.authorityAction.merged, true);
});

test("worker executes GitHub ready-for-review on the high-risk authority plane with scoped approval grant id", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-ready-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-ready-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "pull_ready_for_review",
        highRiskKind: "pull_ready_for_review",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "55",
        pullNumber: "21",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-26T00:00:00.000Z"
  });

  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github-authority", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "pull_ready_for_review",
        repository: "sample-org/vtdd-v2-p",
        pullNumber: 21,
        issueContext: {
          issueNumber: 55
        },
        policyInput: {
          approvalPhrase: "GO",
          approvalGrantId: "approval-ready-123",
          targetConfirmed: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (calls.length === 1) {
          return new Response(
            JSON.stringify({
              draft: true,
              node_id: "PR_kwDOExample",
              html_url: "https://github.com/sample-org/vtdd-v2-p/pull/21"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            data: {
              markPullRequestReadyForReview: {
                pullRequest: {
                  isDraft: false,
                  number: 21,
                  url: "https://github.com/sample-org/vtdd-v2-p/pull/21"
                }
              }
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.authorityAction.operation, "pull_ready_for_review");
  assert.equal(body.authorityAction.readyForReview, true);
  assert.equal(body.authorityAction.changed, true);
  assert.deepEqual(
    calls.map((call) => call.init.method),
    ["GET", "POST"]
  );
});

test("worker allows same-origin passkey operator to dispatch GitHub merge authority", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-merge-browser-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-merge-browser-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "merge",
        highRiskKind: "pull_merge",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "55",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-26T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github-authority", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://example.com",
        "sec-fetch-site": "same-origin"
      },
      body: JSON.stringify({
        operation: "pull_merge",
        repository: "sample-org/vtdd-v2-p",
        pullNumber: 21,
        mergeMethod: "squash",
        issueContext: {
          issueNumber: 55
        },
        policyInput: {
          approvalPhrase: "GO",
          approvalGrantId: "approval-merge-browser-123",
          targetConfirmed: true
        }
      })
    }),
    {
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            sha: "abc123",
            merged: true,
            message: "Pull Request successfully merged"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.authorityAction.operation, "pull_merge");
  assert.equal(body.authorityAction.htmlUrl, "https://github.com/sample-org/vtdd-v2-p/pull/21");
});

test("worker uses bound default fetch for GitHub merge authority dispatch", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-merge-bound-fetch",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-merge-bound-fetch",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "merge",
        highRiskKind: "pull_merge",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "55",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-26T00:00:00.000Z"
  });

  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async function workerRuntimeFetch(url, init) {
    assert.equal(this, globalThis);
    calls.push({ url, init });
    if (calls.length === 1) {
      return new Response(
        JSON.stringify({
          mergeable: true,
          mergeable_state: "clean",
          html_url: "https://github.com/sample-org/vtdd-v2-p/pull/21"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (init?.method === "PUT") {
      return new Response(
        JSON.stringify({
          sha: "abc123",
          merged: true,
          message: "Pull Request successfully merged"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        merged: true,
        merged_at: "2026-05-09T01:02:03Z",
        merge_commit_sha: "def456",
        html_url: "https://github.com/sample-org/vtdd-v2-p/pull/21"
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  try {
    const response = await worker.fetch(
      new Request("https://example.com/v2/action/github-authority", {
        method: "POST",
        headers: {
          ...gatewayAuthHeaders,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          operation: "pull_merge",
          repository: "sample-org/vtdd-v2-p",
          pullNumber: 21,
          mergeMethod: "squash",
          issueContext: {
            issueNumber: 55
          },
          policyInput: {
            approvalPhrase: "GO",
            approvalGrantId: "approval-merge-bound-fetch",
            targetConfirmed: true
          }
        })
      }),
      {
        ...gatewayAuthEnv,
        MEMORY_PROVIDER: provider,
        GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk"
      }
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.authorityAction.runtimeTruth.mergedAt, "2026-05-09T01:02:03Z");
    assert.deepEqual(
      calls.map((call) => call.init.method),
      ["GET", "PUT", "GET"]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("worker returns GitHub merge diagnostics to same-origin passkey operator", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-merge-browser-diagnostics",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-merge-browser-diagnostics",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "merge",
        highRiskKind: "pull_merge",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "55",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-26T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github-authority", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://example.com",
        "sec-fetch-site": "same-origin"
      },
      body: JSON.stringify({
        operation: "pull_merge",
        repository: "sample-org/vtdd-v2-p",
        pullNumber: 21,
        mergeMethod: "squash",
        issueContext: {
          issueNumber: 55
        },
        policyInput: {
          approvalPhrase: "GO",
          approvalGrantId: "approval-merge-browser-diagnostics",
          targetConfirmed: true
        }
      })
    }),
    {
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async (url, init) => {
        if (init?.method === "GET") {
          return new Response(
            JSON.stringify({
              mergeable: true,
              mergeable_state: "clean"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        throw new TypeError("fetch failed");
      }
    }
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.reason, "failed to execute GitHub merge: fetch failed");
  assert.equal(body.issues.includes("github_merge_fetch_exception"), true);
  assert.equal(body.diagnostics.exceptionMessage, "fetch failed");
  assert.equal(
    body.diagnostics.requestUrl,
    "https://api.github.com/repos/sample-org/vtdd-v2-p/pulls/21/merge"
  );
});

test("worker rejects fabricated browser approval grants on the GitHub authority plane", async () => {
  let githubCalled = false;
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github-authority", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://example.com",
        "sec-fetch-site": "same-origin"
      },
      body: JSON.stringify({
        operation: "pull_merge",
        repository: "sample-org/vtdd-v2-p",
        pullNumber: 21,
        mergeMethod: "squash",
        issueContext: {
          issueNumber: 55
        },
        approvalGrant: {
          approvalId: "fabricated-approval",
          verified: true,
          expiresAt: "2099-01-01T00:00:00.000Z",
          scope: {
            actionType: "merge",
            highRiskKind: "pull_merge",
            repositoryInput: "sample-org/vtdd-v2-p",
            issueNumber: "55",
            relatedIssue: "55",
            phase: "execution"
          }
        },
        policyInput: {
          approvalPhrase: "GO",
          targetConfirmed: true
        }
      })
    }),
    {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async () => {
        githubCalled = true;
        return new Response(JSON.stringify({ merged: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.issues.some((issue) => String(issue).includes("real passkey approval grant is required")), true);
  assert.equal(githubCalled, false);
});

test("worker blocks GitHub authority when issue number fields conflict", async () => {
  let githubCalled = false;
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github-authority", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "issue_close",
        repository: "sample-org/vtdd-v2-p",
        issueNumber: 99,
        pullNumber: 21,
        issueContext: {
          issueNumber: 55
        },
        policyInput: {
          approvalPhrase: "GO",
          approvalGrantId: "approval-close-123",
          targetConfirmed: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async () => {
        githubCalled = true;
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "github_authority_scope_invalid");
  assert.equal(body.issues.includes("issueNumber conflicts with issueContext.issueNumber"), true);
  assert.equal(githubCalled, false);
});

test("worker blocks bounded issue close on the high-risk authority plane when merged pull proof is missing", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-close-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-close-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "issue_close",
        highRiskKind: "issue_close",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "55",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-26T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/action/github-authority", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        operation: "issue_close",
        repository: "sample-org/vtdd-v2-p",
        pullNumber: 21,
        issueContext: {
          issueNumber: 55
        },
        policyInput: {
          approvalPhrase: "GO",
          approvalGrantId: "approval-close-123",
          targetConfirmed: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            number: 21,
            merged_at: null
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.reason, "bounded issue close requires a merged pull request");
});

test("worker dispatches governed production deploy using the request origin as the default runtime url", async () => {
  const provider = createInMemoryMemoryProvider();
  const calls = [];
  await provider.store({
    id: "approval-deploy-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-deploy-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "deploy_production",
        highRiskKind: "deploy_production",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "82",
        relatedIssue: "82",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-27T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/deploy", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        policyInput: {
          approvalPhrase: "GO",
          approvalGrantId: "approval-deploy-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_deploy",
      DEPLOY_DISPATCH_VERIFY_DELAY_MS: "0",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).includes("/actions/workflows/deploy-production.yml/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 9090,
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/9090",
                  status: "queued",
                  conclusion: null
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(null, { status: 204 });
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.deploy.status, "dispatched");
  assert.equal(body.deploy.runUrl, "https://github.com/sample-org/vtdd-v2-p/actions/runs/9090");
  assert.equal(body.deploy.runtimeUrl, "https://sample-user-vtdd.example.workers.dev");
  const dispatchBody = JSON.parse(calls[0].init.body);
  assert.equal(
    dispatchBody.inputs.runtime_url,
    "https://sample-user-vtdd.example.workers.dev"
  );
  assert.equal("approval_phrase" in dispatchBody.inputs, false);
});

test("worker allows same-origin browser governed production deploy with a real approval grant", async () => {
  const provider = createInMemoryMemoryProvider();
  const calls = [];
  await provider.store({
    id: "approval-deploy-browser-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-deploy-browser-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "deploy_production",
        highRiskKind: "deploy_production",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "82",
        relatedIssue: "82",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-27T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/deploy", {
      method: "POST",
      headers: {
        origin: "https://sample-user-vtdd.example.workers.dev",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        policyInput: {
          approvalGrantId: "approval-deploy-browser-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_deploy",
      DEPLOY_DISPATCH_VERIFY_DELAY_MS: "0",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).includes("/actions/workflows/deploy-production.yml/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 9091,
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/9091",
                  status: "queued",
                  conclusion: null
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(null, { status: 204 });
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.deploy.status, "dispatched");
  assert.equal(body.deploy.runUrl, "https://github.com/sample-org/vtdd-v2-p/actions/runs/9091");
  assert.equal(body.deploy.runtimeUrl, "https://sample-user-vtdd.example.workers.dev");
  const dispatchBody = JSON.parse(calls[0].init.body);
  assert.equal(
    dispatchBody.inputs.runtime_url,
    "https://sample-user-vtdd.example.workers.dev"
  );
  assert.equal("approval_phrase" in dispatchBody.inputs, false);
});

test("worker returns raw deploy context when workflow dispatch is unverified", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-deploy-unverified-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-deploy-unverified-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "deploy_production",
        highRiskKind: "deploy_production",
        repositoryInput: "sample-org/vtdd-v2-p",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-27T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/deploy", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        policyInput: {
          approvalPhrase: "GO",
          approvalGrantId: "approval-deploy-unverified-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_deploy",
      DEPLOY_DISPATCH_VERIFY_ATTEMPTS: "1",
      DEPLOY_DISPATCH_VERIFY_DELAY_MS: "0",
      GITHUB_API_FETCH: async (url) => {
        if (String(url).includes("/actions/workflows/deploy-production.yml/runs")) {
          return new Response(JSON.stringify({ workflow_runs: [] }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(null, { status: 204 });
      }
    }
  );

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.warning, "deploy_dispatch_unverified");
  assert.equal(
    body.reason,
    "GitHub accepted deploy dispatch, but no deploy-production workflow run was observed"
  );
  assert.equal(body.deploy.status, "dispatch_accepted_unverified");
  assert.equal(body.deploy.repository, "sample-org/vtdd-v2-p");
  assert.equal(body.deploy.workflowFile, "deploy-production.yml");
  assert.equal(body.deploy.runtimeUrl, "https://sample-user-vtdd.example.workers.dev");
  assert.equal(
    body.deploy.workflowRunsUrl,
    "https://github.com/sample-org/vtdd-v2-p/actions/workflows/deploy-production.yml"
  );
});

test("worker syncs OPENAI_API_KEY through approval-bound GitHub Actions secret route", async () => {
  const provider = createInMemoryMemoryProvider();
  const calls = [];
  await provider.store({
    id: "approval-actions-secret-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-actions-secret-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        highRiskKind: "github_actions_secret_sync",
        repositoryInput: "sample-org/vtdd-v2-p",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-28T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/github-actions-secret", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        secretName: "OPENAI_API_KEY",
        secretValue: "sk-test-secret",
        policyInput: {
          approvalGrantId: "approval-actions-secret-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_secret",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith("/actions/secrets/public-key")) {
          return new Response(
            JSON.stringify({
              key_id: "key-123",
              key: "LW+MLFAtyNPENefjLqmydKkBGp4l5suTetSR9313Xm8="
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(null, { status: 204 });
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.secretSync.secretName, "OPENAI_API_KEY");
  assert.equal(JSON.stringify(body).includes("sk-test-secret"), false);
  assert.equal(calls[1].url.endsWith("/actions/secrets/OPENAI_API_KEY"), true);
});

test("worker syncs Dashboard VPS maintenance variable through approval-bound GitHub Actions variable route", async () => {
  const provider = createInMemoryMemoryProvider();
  const calls = [];
  await provider.store({
    id: "approval-actions-variable-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-actions-variable-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        highRiskKind: "github_actions_variable_sync",
        repositoryInput: "sample-org/vtdd-v2-p",
        variableName: "VTDD_DASHBOARD_VPS_MAINTENANCE_HOST",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-28T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/github-actions-variable", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        variableName: "VTDD_DASHBOARD_VPS_MAINTENANCE_HOST",
        variableValue: "x85-131-245-163",
        policyInput: {
          approvalGrantId: "approval-actions-variable-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_secret",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (init?.method === "GET") {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(null, { status: 201 });
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.variableSync.variableName, "VTDD_DASHBOARD_VPS_MAINTENANCE_HOST");
  assert.equal(body.variableSync.status, "created");
  assert.equal(JSON.stringify(body).includes("x85-131-245-163"), false);
  assert.equal(calls[1].url.endsWith("/actions/variables"), true);
  assert.equal(JSON.parse(calls[1].init.body).name, "VTDD_DASHBOARD_VPS_MAINTENANCE_HOST");
});

test("worker syncs Dashboard VPS maintenance variable from proposal after passkey only and records notification", async () => {
  const provider = createInMemoryMemoryProvider();
  const eventStore = createInMemoryDashboardEventStore();
  const calls = [];
  const proposalResponse = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/github-actions-variable/proposals", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        issueNumber: 637,
        variableName: "VTDD_DASHBOARD_VPS_MAINTENANCE_HOST",
        variableValue: "x85-131-245-163"
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );
  assert.equal(proposalResponse.status, 200);
  const proposalBody = await proposalResponse.json();
  assert.equal(proposalBody.ok, true);
  assert.equal(proposalBody.approvalOperatorUrl.includes("variableProposalId="), true);
  assert.equal(JSON.stringify(proposalBody).includes("x85-131-245-163"), false);

  await provider.store({
    id: "approval-actions-variable-proposal-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-actions-variable-proposal-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: proposalBody.approvalScope
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-28T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/github-actions-variable", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        variableProposalId: proposalBody.variableProposalId,
        policyInput: {
          approvalGrantId: "approval-actions-variable-proposal-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      DASHBOARD_EVENT_STORE: eventStore,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_secret",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (init?.method === "GET") {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(null, { status: 201 });
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.variableSync.variableName, "VTDD_DASHBOARD_VPS_MAINTENANCE_HOST");
  assert.equal(body.runtimeTruth.nextAction, "production_deploy_required");
  assert.equal(body.notification.event.workflowName, "github-actions-variable-sync");
  assert.equal(JSON.stringify(body).includes("x85-131-245-163"), false);
  const stored = await eventStore.latest({
    kind: "owner_action_required",
    repository: "sample-org/vtdd-v2-p",
    workflowName: "github-actions-variable-sync"
  });
  assert.equal(stored.conclusion, "success");
  assert.equal(stored.changeSummary.includes("production deploy"), true);
});

test("worker syncs VTDD_GATEWAY_BEARER_TOKEN through approval-bound GitHub Actions secret route", async () => {
  const provider = createInMemoryMemoryProvider();
  const calls = [];
  await provider.store({
    id: "approval-actions-gateway-secret-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-actions-gateway-secret-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        highRiskKind: "github_actions_secret_sync",
        repositoryInput: "sample-org/vtdd-v2-p",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-28T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/github-actions-secret", {
      method: "POST",
      headers: {
        ...gatewayAuthHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        secretName: "VTDD_GATEWAY_BEARER_TOKEN",
        secretValue: "gateway-test-secret",
        policyInput: {
          approvalGrantId: "approval-actions-gateway-secret-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_secret",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith("/actions/secrets/public-key")) {
          return new Response(
            JSON.stringify({
              key_id: "key-123",
              key: "LW+MLFAtyNPENefjLqmydKkBGp4l5suTetSR9313Xm8="
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(null, { status: 204 });
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.secretSync.secretName, "VTDD_GATEWAY_BEARER_TOKEN");
  assert.equal(JSON.stringify(body).includes("gateway-test-secret"), false);
  assert.equal(calls[1].url.endsWith("/actions/secrets/VTDD_GATEWAY_BEARER_TOKEN"), true);
});

test("worker allows same-origin browser OPENAI_API_KEY secret sync with approval grant", async () => {
  const provider = createInMemoryMemoryProvider();
  const calls = [];
  await provider.store({
    id: "approval-browser-actions-secret-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-browser-actions-secret-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        highRiskKind: "github_actions_secret_sync",
        repositoryInput: "sample-org/vtdd-v2-p",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-28T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/github-actions-secret", {
      method: "POST",
      headers: {
        origin: "https://sample-user-vtdd.example.workers.dev",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        secretName: "OPENAI_API_KEY",
        secretValue: "sk-test-secret",
        policyInput: {
          approvalGrantId: "approval-browser-actions-secret-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_secret",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith("/actions/secrets/public-key")) {
          return new Response(
            JSON.stringify({
              key_id: "key-123",
              key: "LW+MLFAtyNPENefjLqmydKkBGp4l5suTetSR9313Xm8="
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(null, { status: 204 });
      }
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.secretSync.secretName, "OPENAI_API_KEY");
  assert.equal(JSON.stringify(body).includes("sk-test-secret"), false);
  assert.equal(calls[1].url.endsWith("/actions/secrets/OPENAI_API_KEY"), true);
});

test("worker returns JSON when OPENAI_API_KEY token resolution fails", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "approval-actions-secret-throw-123",
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: "passkey_grant",
      status: "verified",
      approvalId: "approval-actions-secret-throw-123",
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        highRiskKind: "github_actions_secret_sync",
        repositoryInput: "sample-org/vtdd-v2-p",
        phase: "execution"
      }
    },
    metadata: { source: "test" },
    priority: 90,
    tags: ["passkey_grant"],
    createdAt: "2026-04-28T00:00:00.000Z"
  });

  const response = await worker.fetch(
    new Request("https://sample-user-vtdd.example.workers.dev/v2/action/github-actions-secret", {
      method: "POST",
      headers: {
        origin: "https://sample-user-vtdd.example.workers.dev",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repository: "sample-org/vtdd-v2-p",
        secretName: "OPENAI_API_KEY",
        secretValue: "sk-test-secret",
        policyInput: {
          approvalGrantId: "approval-actions-secret-throw-123"
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider,
      GITHUB_APP_INSTALLATION_TOKEN_PROVIDER: async () => {
        throw new Error("token=secret-token sk-test-secret");
      }
    }
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "github_actions_secret_sync_unavailable");
  assert.match(body.reason, /installation token provider failed/);
  assert.equal(JSON.stringify(body).includes("secret-token"), false);
  assert.equal(JSON.stringify(body).includes("sk-test-secret"), false);
});

test("worker returns remote Codex execution progress", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/action/progress?executionId=remote-codex-issue6-abcd12", {
      headers: {
        authorization: "Bearer test-token"
      }
    }),
    {
      ...gatewayAuthEnv,
      REMOTE_CODEX_EXECUTOR_TRANSPORT: "api_key_runner",
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            workflow_runs: [
              {
                id: 101,
                name: "remote-codex-executor",
                display_title: "remote-codex-issue6-abcd12",
                html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/101",
                status: "queued",
                conclusion: null,
                head_branch: "main",
                run_started_at: "2026-04-24T08:00:00Z",
                updated_at: "2026-04-24T08:01:00Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.progress.workflowRunId, 101);
  assert.equal(body.progress.status, "queued");
});

test("worker returns explicit VPS runner health status", async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-05-09T10:02:00Z");
  try {
    const response = await worker.fetch(
      new Request(
        "https://example.com/v2/action/vps-runner-status?executionId=remote-codex-issue229-alive&repository=sample-org/sunaba-eye&issueNumber=229&branch=codex/issue-229",
        {
          headers: {
            authorization: "Bearer test-token"
          }
        }
      ),
      {
        ...gatewayAuthEnv,
        GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
        GITHUB_API_FETCH: async (url) => {
          if (String(url).includes("/issues/229/comments")) {
            return new Response(
              JSON.stringify([
                {
                  id: 22901,
                  html_url: "https://github.com/sample-org/sunaba-eye/issues/229#issuecomment-22901",
                  created_at: "2026-05-09T10:00:00Z",
                  body: "<!-- vtdd:vps-runner-execution:remote-codex-issue229-alive -->"
                },
                {
                  id: 22902,
                  html_url: "https://github.com/sample-org/sunaba-eye/issues/229#issuecomment-22902",
                  created_at: "2026-05-09T10:01:00Z",
                  body:
                    "<!-- vtdd:vps-runner-event:remote-codex-issue229-alive -->\n```json\n{\"status\":\"running\",\"currentStep\":\"codex_subprocess\",\"heartbeatAt\":\"2026-05-09T10:01:00.000Z\",\"updatedAt\":\"2026-05-09T10:01:00.000Z\"}\n```"
                }
              ]),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          }
          if (String(url).includes("/pulls?")) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { "content-type": "application/json" }
            });
          }
          return new Response(
            JSON.stringify({
              name: "codex/issue-229",
              commit: { sha: "abc123" },
              _links: { html: "https://github.com/sample-org/sunaba-eye/tree/codex/issue-229" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
      }
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.health.runnerStatus, "alive");
    assert.equal(body.health.lastSeenAt, "2026-05-09T10:01:00.000Z");
    assert.equal(body.health.queue.pickedUp, true);
    assert.equal(body.health.currentStep, "codex_subprocess");
    assert.equal(body.progress.status, "in_progress");
  } finally {
    Date.now = originalNow;
  }
});

test("worker gateway blocks butler path when judgment order is invalid", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: [
          JudgmentStep.RUNTIME_TRUTH,
          JudgmentStep.CONSTITUTION,
          JudgmentStep.ISSUE_CONTEXT,
          JudgmentStep.CURRENT_QUERY
        ],
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE] },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "butler_invalid_judgment_order");
});

test("worker gateway blocks merge in guarded absence mode and records stop log", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.MERGE,
          mode: TaskMode.EXECUTION,
          autonomyMode: AutonomyMode.GUARDED_ABSENCE,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: {
            model: "github_app",
            tier: CredentialTier.HIGH_RISK,
            shortLived: true,
            boundApprovalId: "approval-123"
          },
          consent: { grantedCategories: [ConsentCategory.EXECUTE] },
          approvalPhrase: "GO merge request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: true
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "guarded_absence_forbids_action");
  assert.equal(Boolean(body.guardedAbsenceExecutionLog?.recordId), true);

  const records = await provider.retrieve({
    type: MemoryRecordType.EXECUTION_LOG,
    limit: 5
  });
  assert.equal(records.length, 1);
});

test("worker accepts legacy /mvp gateway route for compatibility", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/mvp/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
});

test("worker gateway persists decision log and returns decision references", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: { runtimeAvailable: true },
          credential: { model: "github_app", tier: CredentialTier.EXECUTE },
          consent: { grantedCategories: [ConsentCategory.PROPOSE] },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        },
        memoryRecord: {
          recordType: "decision_log",
          content: {
            decision: "Issue #17 の接続不足を修正する",
            rationale: "Butler が過去判断を理由付きで説明できるようにする",
            relatedIssue: 17
          },
          metadata: {
            decidedBy: "shuhei"
          }
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(Boolean(body.memoryWritePersisted?.recordId), true);
  assert.equal(body.retrievalReferences.decisionLogs.length, 1);
});

test("worker blocks gateway without required bearer token", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("worker accepts gateway with valid Cloudflare Access service token headers", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-access-client-id": "access-id",
        "cf-access-client-secret": "access-secret"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    {
      CF_ACCESS_CLIENT_ID: "access-id",
      CF_ACCESS_CLIENT_SECRET: "access-secret"
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
});

test("worker blocks constitution retrieve when machine auth runtime is not configured", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/constitution"),
    {}
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("worker can return action-visible provider failure envelope for retrieve routes", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/constitution?responseMode=action_visible", {
      headers: gatewayAuthHeaders
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.httpStatus, 503);
  assert.equal(body.error, "memory_provider_unavailable");
  assert.equal(body.reason, "valid memory provider is required for constitution retrieval");
  assert.deepEqual(body.issues, []);
  assert.equal(body.diagnostics.route, "/v2/retrieve/constitution");
});

test("worker returns constitution records through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "constitution-1",
    type: MemoryRecordType.CONSTITUTION,
    content: { rule: "runtime_truth_over_memory" },
    metadata: { version: "v2" },
    priority: 90,
    tags: ["constitution"],
    createdAt: "2026-04-16T02:00:00Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/constitution?limit=3", {
      headers: {
        authorization: "Bearer test-token"
      }
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.recordType, "constitution");
  assert.equal(body.recordCount, 1);
});

test("worker returns decision log references through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "decision-1",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "Issue #17 を再接続する",
      rationale: "Butler 参照を復元する",
      relatedIssue: 17,
      decidedBy: "shuhei",
      timestamp: "2026-04-16T01:00:00Z",
      supersededBy: null
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 95,
    tags: ["decision_log", "issue:17"],
    createdAt: "2026-04-16T01:00:00Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/decisions?relatedIssue=17&limit=3", {
      headers: {
        authorization: "Bearer test-token"
      }
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.recordType, "decision_log");
  assert.equal(body.recordCount, 1);
});

test("worker returns proposal log references through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "proposal-1",
    type: MemoryRecordType.PROPOSAL_LOG,
    content: {
      hypothesis: "Issue化前の案を保存する",
      options: ["案A", "案B"],
      rejectedReasons: [{ option: "案A", reason: "安全境界が弱い" }],
      concerns: ["記録漏れ"],
      unresolvedQuestions: ["表示順をどうするか"],
      relatedIssue: 20,
      proposedBy: "shuhei",
      timestamp: "2026-04-16T01:30:00Z"
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 85,
    tags: ["proposal_log", "issue:20"],
    createdAt: "2026-04-16T01:30:00Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/proposals?relatedIssue=20&limit=3", {
      headers: {
        authorization: "Bearer test-token"
      }
    }),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.recordType, "proposal_log");
  assert.equal(body.recordCount, 1);
});

test("worker returns cross-issue memory index through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "constitution-cross-1",
    type: MemoryRecordType.CONSTITUTION,
    content: {
      title: "constitution_rule",
      description: "Constitution should be returned in cross retrieval."
    },
    metadata: { version: "v2" },
    priority: 90,
    tags: ["constitution"],
    createdAt: "2026-04-16T03:00:00Z"
  });
  await provider.store({
    id: "decision-cross-1",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "Cross retrieval should include decisions",
      rationale: "Butler needs why trace",
      relatedIssue: 19,
      decidedBy: "owner",
      timestamp: "2026-04-16T03:10:00Z",
      supersededBy: null
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 95,
    tags: ["decision_log", "issue:19"],
    createdAt: "2026-04-16T03:10:00Z"
  });
  await provider.store({
    id: "proposal-cross-1",
    type: MemoryRecordType.PROPOSAL_LOG,
    content: {
      hypothesis: "Cross retrieval API should include proposal context",
      options: ["route", "route+orchestration"],
      rejectedReasons: [{ option: "route", reason: "insufficient review history" }],
      concerns: ["search drift"],
      unresolvedQuestions: ["UI wiring timing"],
      relatedIssue: 19,
      proposedBy: "owner",
      timestamp: "2026-04-16T03:20:00Z"
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 85,
    tags: ["proposal_log", "issue:19"],
    createdAt: "2026-04-16T03:20:00Z"
  });

  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/cross?phase=execution&relatedIssue=19&issueNumber=19&issueTitle=Retrieval%20Contract&limit=8",
      {
        headers: {
          authorization: "Bearer test-token"
        }
      }
    ),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.retrievalPlan.sources[0], "issue");
  assert.equal(body.primaryReference.source, "issue");
});

test("worker cross-memory route honors action-schema text and semantic parameters", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "decision-cross-text-semantic",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "Butler context preflight must preserve VTDD premise anchors",
      rationale: "RAG search text from the Action Schema must reach the worker runtime",
      relatedIssue: 159,
      decidedBy: "owner",
      timestamp: "2026-05-05T08:30:00Z",
      supersededBy: null
    },
    metadata: { repository: "marushu/vtdd-v2-p" },
    priority: 95,
    tags: ["decision_log", "issue:159", "preflight-anchor"],
    createdAt: "2026-05-05T08:30:00Z"
  });

  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/cross?phase=execution&issueNumber=159&text=preflight%20anchor&semantic=true&limit=5",
      {
        headers: {
          authorization: "Bearer test-token"
        }
      }
    ),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.queryText, "preflight anchor");
  assert.equal(body.semanticRetrieval.enabled, true);
  assert.equal(body.semanticRetrieval.applied, true);
  assert.equal(
    body.referencesBySource.decision_log.some(
      (item) => item.id === "decision-cross-text-semantic"
    ),
    true
  );
});

test("worker returns compact operational memory through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "operational-decision-1",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "Recurring reviewer blockers must be surfaced before PR completion claims",
      rationale: "Historical blocker recurrence should reduce owner re-explanation.",
      recurrenceCount: 3
    },
    metadata: {
      repository: "repo-a/vtdd",
      recurrenceCount: 3
    },
    priority: 96,
    tags: ["decision_log", "reviewer", "blocker", "policy", "recurring"],
    createdAt: "2026-05-01T00:00:00Z"
  });
  await provider.store({
    id: "operational-working-1",
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      note: "Current branch is waiting on reviewer blocker reconciliation."
    },
    metadata: {
      repository: "repo-b/vtdd"
    },
    priority: 70,
    tags: ["working_memory", "reviewer"],
    createdAt: "2026-05-09T00:00:00Z"
  });

  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/operational-memory?text=reviewer%20blocker%20policy&repository=repo-b/vtdd&currentState=reviewer%20blocked&runtimeTruthSource=github_app&checkedAt=2026-05-10T01%3A00%3A00Z&limit=2",
      {
        headers: {
          authorization: "Bearer test-token"
        }
      }
    ),
    {
      ...gatewayAuthEnv,
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.queryText, "reviewer blocker policy");
  assert.equal(body.memoryUseRule, "runtime_truth_current_state_overrides_memory_background_reference");
  assert.equal(body.runtimeTruth.overridesMemory, true);
  assert.equal(body.compactContext.length, 2);
  assert.equal(body.compactContext[0].id, "operational-decision-1");
  assert.equal(body.compactContext[0].crossRepository, true);
  assert.equal(body.retrievalSignals.dumpedAllMemory, false);
});

test("worker returns not_found for unknown route", async () => {
  const response = await worker.fetch(new Request("https://example.com/unknown"));
  assert.equal(response.status, 404);
});
