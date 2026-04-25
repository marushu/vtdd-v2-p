import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import { createMemoryRecord, MemoryRecordType } from "./memory-schema.js";

export const PASSKEY_REGISTRY_TAG = "passkey_registry";
export const PASSKEY_SESSION_TAG = "passkey_session";
export const PASSKEY_GRANT_TAG = "passkey_grant";
export const PASSKEY_REGISTRATION_KIND = "passkey_registration";
export const PASSKEY_APPROVAL_KIND = "passkey_approval";
export const DEFAULT_PASSKEY_SESSION_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_PASSKEY_GRANT_TTL_MS = 2 * 60 * 1000;
export const PASSKEY_EPHEMERAL_KINDS = Object.freeze([
  PASSKEY_REGISTRATION_KIND,
  PASSKEY_APPROVAL_KIND,
  PASSKEY_GRANT_TAG
]);

export const defaultPasskeyAdapter = Object.freeze({
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
});

export async function createPasskeyRegistrationOptions(input = {}) {
  const adapter = resolvePasskeyAdapter(input.adapter);
  const rpID = normalizeText(input.rpID);
  const rpName = normalizeText(input.rpName) || "VTDD";
  const origin = normalizeText(input.origin);
  const operatorId = normalizeText(input.operatorId) || "vtdd-operator";
  const operatorLabel = normalizeText(input.operatorLabel) || "VTDD Operator";
  const sessionTtlMs = normalizePositiveInt(
    input.sessionTtlMs,
    DEFAULT_PASSKEY_SESSION_TTL_MS
  );

  if (!rpID || !origin) {
    return {
      ok: false,
      issues: ["rpID and origin are required for passkey registration"]
    };
  }

  const sessionId = randomId("passkey-reg");
  const challenge = randomId("challenge");
  const optionsJSON = await adapter.generateRegistrationOptions({
    rpName,
    rpID,
    challenge,
    userName: operatorId,
    userDisplayName: operatorLabel,
    userID: isoBytes(sessionId),
    timeout: sessionTtlMs,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required"
    }
  });

  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
  const sessionRecord = createMemoryRecord({
    id: sessionId,
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: PASSKEY_REGISTRATION_KIND,
      status: "pending",
      challenge: optionsJSON.challenge,
      rpID,
      origin,
      expiresAt,
      operatorId,
      operatorLabel
    },
    metadata: {
      source: "passkey_registration_options",
      operatorId,
      operatorLabel
    },
    priority: 92,
    tags: [PASSKEY_SESSION_TAG, PASSKEY_REGISTRATION_KIND],
    createdAt: new Date().toISOString()
  });

  if (!sessionRecord.ok) {
    return sessionRecord;
  }

  return {
    ok: true,
    sessionRecord: sessionRecord.record,
    optionsJSON
  };
}

export async function verifyPasskeyRegistration(input = {}) {
  const adapter = resolvePasskeyAdapter(input.adapter);
  const sessionRecord = input.sessionRecord ?? null;
  const response = input.response ?? null;
  const rpID = normalizeText(input.rpID || sessionRecord?.content?.rpID);
  const origin = normalizeText(input.origin || sessionRecord?.content?.origin);
  const expectedChallenge = normalizeText(
    input.expectedChallenge || sessionRecord?.content?.challenge
  );
  const sessionTtlMs = normalizePositiveInt(
    input.sessionTtlMs,
    DEFAULT_PASSKEY_SESSION_TTL_MS
  );

  if (!sessionRecord || !response || !rpID || !origin || !expectedChallenge) {
    return {
      ok: false,
      issues: ["sessionRecord, response, rpID, origin, and expectedChallenge are required"]
    };
  }

  const verification = await adapter.verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true
  });

  if (!verification.verified || !verification.registrationInfo) {
    return {
      ok: false,
      issues: ["passkey registration verification failed"]
    };
  }

  const { registrationInfo } = verification;
  const credentialId = base64UrlEncode(registrationInfo.credential.id);
  const verifiedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
  const passkeyRecord = createMemoryRecord({
    id: `passkey:${credentialId}`,
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      kind: PASSKEY_REGISTRY_TAG,
      credentialId,
      publicKey: base64UrlEncode(registrationInfo.credential.publicKey),
      counter: registrationInfo.credential.counter,
      transports: response.response?.transports ?? [],
      aaguid: registrationInfo.aaguid,
      deviceType: registrationInfo.credentialDeviceType,
      backedUp: registrationInfo.credentialBackedUp === true
    },
    metadata: {
      source: "passkey_registration_verify",
      rpID,
      origin,
      operatorId: normalizeText(sessionRecord?.content?.operatorId)
    },
    priority: 86,
    tags: [PASSKEY_REGISTRY_TAG],
    createdAt: verifiedAt
  });

  const completedSessionRecord = createMemoryRecord({
    id: `${sessionRecord.id}:verified`,
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: PASSKEY_REGISTRATION_KIND,
      status: "verified",
      sessionId: sessionRecord.id,
      credentialId,
      expiresAt
    },
    metadata: {
      source: "passkey_registration_verify",
      rpID,
      origin
    },
    priority: 90,
    tags: [PASSKEY_SESSION_TAG, PASSKEY_REGISTRATION_KIND, "verified"],
    createdAt: verifiedAt
  });

  if (!passkeyRecord.ok) {
    return passkeyRecord;
  }
  if (!completedSessionRecord.ok) {
    return completedSessionRecord;
  }

  return {
    ok: true,
    verification,
    passkeyRecord: passkeyRecord.record,
    completedSessionRecord: completedSessionRecord.record
  };
}

export async function createPasskeyApprovalOptions(input = {}) {
  const adapter = resolvePasskeyAdapter(input.adapter);
  const rpID = normalizeText(input.rpID);
  const origin = normalizeText(input.origin);
  const passkeys = dedupePasskeys(input.passkeys);
  const scope = normalizeScopeSnapshot(input.scope);
  const sessionTtlMs = normalizePositiveInt(
    input.sessionTtlMs,
    DEFAULT_PASSKEY_SESSION_TTL_MS
  );

  if (!rpID || !origin) {
    return {
      ok: false,
      issues: ["rpID and origin are required for passkey approval"]
    };
  }
  if (passkeys.length === 0) {
    return {
      ok: false,
      issues: ["at least one registered passkey is required"]
    };
  }

  const sessionId = randomId("passkey-auth");
  const challenge = randomId("challenge");
  const optionsJSON = await adapter.generateAuthenticationOptions({
    rpID,
    challenge,
    timeout: sessionTtlMs,
    userVerification: "required",
    allowCredentials: passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: Array.isArray(passkey.transports) ? passkey.transports : []
    }))
  });

  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
  const sessionRecord = createMemoryRecord({
    id: sessionId,
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: PASSKEY_APPROVAL_KIND,
      status: "pending",
      challenge: optionsJSON.challenge,
      rpID,
      origin,
      expiresAt,
      scope
    },
    metadata: {
      source: "passkey_approval_options",
      scopeKey: stableStringify(scope)
    },
    priority: 94,
    tags: [PASSKEY_SESSION_TAG, PASSKEY_APPROVAL_KIND],
    createdAt: new Date().toISOString()
  });

  if (!sessionRecord.ok) {
    return sessionRecord;
  }

  return {
    ok: true,
    sessionRecord: sessionRecord.record,
    optionsJSON
  };
}

export async function verifyPasskeyApproval(input = {}) {
  const adapter = resolvePasskeyAdapter(input.adapter);
  const sessionRecord = input.sessionRecord ?? null;
  const response = input.response ?? null;
  const passkeys = dedupePasskeys(input.passkeys);
  const rpID = normalizeText(input.rpID || sessionRecord?.content?.rpID);
  const origin = normalizeText(input.origin || sessionRecord?.content?.origin);
  const expectedChallenge = normalizeText(
    input.expectedChallenge || sessionRecord?.content?.challenge
  );
  const grantTtlMs = normalizePositiveInt(
    input.grantTtlMs,
    DEFAULT_PASSKEY_GRANT_TTL_MS
  );

  if (!sessionRecord || !response || !rpID || !origin || !expectedChallenge) {
    return {
      ok: false,
      issues: ["sessionRecord, response, rpID, origin, and expectedChallenge are required"]
    };
  }

  const credentialId = normalizeText(response.id);
  const passkey = passkeys.find((item) => item.credentialId === credentialId);
  if (!passkey) {
    return {
      ok: false,
      issues: ["matching registered passkey not found"]
    };
  }

  const verification = await adapter.verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: passkey.credentialId,
      publicKey: base64UrlDecode(passkey.publicKey),
      counter: Number(passkey.counter ?? 0),
      transports: Array.isArray(passkey.transports) ? passkey.transports : []
    },
    requireUserVerification: true
  });

  if (!verification.verified) {
    return {
      ok: false,
      issues: ["passkey approval verification failed"]
    };
  }

  const approvalId = randomId("approval");
  const verifiedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + grantTtlMs).toISOString();
  const scope = normalizeScopeSnapshot(sessionRecord?.content?.scope);

  const updatedPasskeyRecord = createMemoryRecord({
    id: `passkey:${credentialId}`,
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      ...passkey,
      kind: PASSKEY_REGISTRY_TAG,
      counter:
        verification.authenticationInfo?.newCounter ?? Number(passkey.counter ?? 0)
    },
    metadata: {
      source: "passkey_approval_verify",
      rpID,
      origin
    },
    priority: 86,
    tags: [PASSKEY_REGISTRY_TAG],
    createdAt: verifiedAt
  });

  const grantRecord = createMemoryRecord({
    id: approvalId,
    type: MemoryRecordType.APPROVAL_LOG,
    content: {
      kind: PASSKEY_GRANT_TAG,
      status: "verified",
      approvalId,
      credentialId,
      verifiedAt,
      expiresAt,
      scope
    },
    metadata: {
      source: "passkey_approval_verify",
      scopeKey: stableStringify(scope)
    },
    priority: 96,
    tags: [PASSKEY_GRANT_TAG, PASSKEY_APPROVAL_KIND, "verified"],
    createdAt: verifiedAt
  });

  if (!updatedPasskeyRecord.ok) {
    return updatedPasskeyRecord;
  }
  if (!grantRecord.ok) {
    return grantRecord;
  }

  return {
    ok: true,
    verification,
    updatedPasskeyRecord: updatedPasskeyRecord.record,
    grantRecord: grantRecord.record,
    approvalGrant: {
      approvalId,
      verified: true,
      expiresAt,
      scope
    }
  };
}

export function evaluateApprovalGrant(input = {}) {
  const approvalGrant = input.approvalGrant ?? null;
  const now = input.now ?? new Date();
  const scope = normalizeScopeSnapshot(input.scope);
  if (!approvalGrant || approvalGrant.verified !== true) {
    return {
      ok: false,
      reason: "real passkey approval grant is required"
    };
  }

  const expiresAt = normalizeText(approvalGrant.expiresAt);
  if (!expiresAt || Date.parse(expiresAt) <= now.valueOf()) {
    return {
      ok: false,
      reason: "approval grant expired"
    };
  }

  if (stableStringify(normalizeScopeSnapshot(approvalGrant.scope)) !== stableStringify(scope)) {
    return {
      ok: false,
      reason: "approval grant scope does not match current target"
    };
  }

  return { ok: true };
}

export function normalizeScopeSnapshot(scope = {}) {
  return {
    actionType: normalizeText(scope.actionType),
    highRiskKind: normalizeText(scope.highRiskKind),
    repositoryInput: normalizeText(scope.repositoryInput),
    issueNumber: normalizeText(scope.issueNumber),
    relatedIssue: normalizeText(scope.relatedIssue),
    phase: normalizeText(scope.phase)
  };
}

export function dedupePasskeys(records = []) {
  const latest = new Map();
  const sorted = Array.isArray(records)
    ? [...records].sort((a, b) => String(b?.createdAt ?? "").localeCompare(String(a?.createdAt ?? "")))
    : [];

  for (const record of sorted) {
    const content = record?.content ?? record;
    const credentialId = normalizeText(content?.credentialId);
    if (!credentialId || latest.has(credentialId)) {
      continue;
    }
    latest.set(credentialId, {
      credentialId,
      publicKey: normalizeText(content?.publicKey),
      counter: Number(content?.counter ?? 0),
      transports: Array.isArray(content?.transports) ? content.transports : []
    });
  }

  return [...latest.values()].filter(
    (item) => item.credentialId && item.publicKey
  );
}

export function isExpiredPasskeyEphemeralRecord(record, now = new Date()) {
  const kind = normalizeText(record?.content?.kind);
  if (!PASSKEY_EPHEMERAL_KINDS.includes(kind)) {
    return false;
  }
  const expiresAt = normalizeText(record?.content?.expiresAt);
  if (!expiresAt) {
    return false;
  }
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return false;
  }
  return expiresAtMs <= now.valueOf();
}

function resolvePasskeyAdapter(adapter) {
  return adapter && typeof adapter === "object" ? adapter : defaultPasskeyAdapter;
}

function normalizePositiveInt(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function randomId(prefix) {
  return `${prefix}:${crypto.randomUUID()}`;
}

function isoBytes(value) {
  return new TextEncoder().encode(String(value ?? ""));
}

function base64UrlEncode(input) {
  if (typeof input === "string") {
    const normalized = normalizeText(input);
    return normalized;
  }
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let text = "";
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(text) {
  const base64 = String(text ?? "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(String(text ?? "").length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
