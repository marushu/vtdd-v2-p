import { createDecisionLogEntry } from "./log-contracts.js";
import { validateMemoryProvider } from "./memory-provider.js";
import { MemoryRecordType } from "./memory-schema.js";

const DEFAULT_RETRIEVE_LIMIT = 5;

export async function appendDecisionLogFromGateway(provider, gatewayInput = {}, gatewayResult = {}) {
  const providerValidation = validateMemoryProvider(provider);
  if (!providerValidation.ok) {
    return {
      ok: false,
      status: 503,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for decision log persistence"
    };
  }

  const created = createCanonicalDecisionFromGateway(gatewayInput);
  if (!created.ok) {
    return {
      ok: false,
      status: 422,
      blockedByRule: "decision_log_schema_invalid",
      reason: "decision log must satisfy canonical schema",
      issues: created.issues
    };
  }

  const recordInput = buildDecisionMemoryRecord({
    entry: created.entry,
    gatewayInput,
    gatewayResult
  });

  try {
    const stored = await provider.store(recordInput);
    if (!stored?.ok) {
      return {
        ok: false,
        status: 503,
        error: "memory_write_failed",
        reason: "failed to persist decision log",
        issues: Array.isArray(stored?.issues) ? stored.issues : []
      };
    }

    return {
      ok: true,
      entry: created.entry,
      record: stored.record
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: "memory_write_failed",
      reason: "failed to persist decision log",
      details: normalizeText(error?.message) || "unknown provider error"
    };
  }
}

export async function retrieveDecisionLogReferences(provider, input = {}) {
  const providerValidation = validateMemoryProvider(provider);
  if (!providerValidation.ok) {
    return {
      ok: false,
      status: 503,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for decision log retrieval"
    };
  }

  const limit = normalizeLimit(input.limit, DEFAULT_RETRIEVE_LIMIT);
  const relatedIssue = normalizeIssue(input.relatedIssue);

  let records = [];
  try {
    records = await provider.retrieve({
      type: MemoryRecordType.DECISION_LOG,
      limit: Math.max(limit * 4, limit)
    });
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: "memory_read_failed",
      reason: "failed to retrieve decision logs",
      details: normalizeText(error?.message) || "unknown provider error"
    };
  }

  const references = records
    .map(toDecisionReference)
    .filter(Boolean)
    .filter((item) => (relatedIssue ? item.relatedIssue === relatedIssue : true))
    .slice(0, limit);

  return {
    ok: true,
    references
  };
}

export function inferRelatedIssueFromGatewayInput(gatewayInput = {}) {
  const memoryRecord = gatewayInput?.memoryRecord ?? {};
  const content = normalizeObject(memoryRecord.content);
  const metadata = normalizeObject(memoryRecord.metadata);

  const issue = normalizeIssue(content.relatedIssue ?? metadata.relatedIssue);
  return issue > 0 ? issue : null;
}

export function createCanonicalDecisionFromGateway(gatewayInput = {}) {
  const memoryRecord = gatewayInput?.memoryRecord ?? {};
  const content = normalizeObject(memoryRecord.content);
  const metadata = normalizeObject(memoryRecord.metadata);
  const rawContent = memoryRecord.content;

  const candidate = {
    decision: firstText(content.decision, typeof rawContent === "string" ? rawContent : ""),
    rationale: firstText(content.rationale, metadata.rationale),
    relatedIssue: firstNumber(content.relatedIssue, metadata.relatedIssue),
    decidedBy: firstText(content.decidedBy, metadata.decidedBy, gatewayInput?.actorRole),
    timestamp: firstText(content.timestamp, metadata.timestamp, new Date().toISOString()),
    supersededBy: firstText(content.supersededBy, metadata.supersededBy) || null
  };

  return createDecisionLogEntry(candidate);
}

function buildDecisionMemoryRecord({ entry, gatewayInput, gatewayResult }) {
  const repository = normalizeText(gatewayResult?.repository);
  const decidedByTag = normalizeTag(entry.decidedBy);
  const phaseTag = normalizeTag(gatewayInput?.phase);
  const recordId = makeRecordId(entry);

  return {
    id: recordId,
    type: MemoryRecordType.DECISION_LOG,
    content: entry,
    metadata: {
      relatedIssue: entry.relatedIssue,
      decidedBy: entry.decidedBy,
      supersededBy: entry.supersededBy,
      repository: repository || null,
      phase: phaseTag || null
    },
    priority: 90,
    tags: [
      "decision_log",
      `issue:${entry.relatedIssue}`,
      decidedByTag ? `decided_by:${decidedByTag}` : null,
      phaseTag ? `phase:${phaseTag}` : null,
      repository ? `repo:${normalizeTag(repository.replace("/", "_"))}` : null
    ].filter(Boolean),
    createdAt: entry.timestamp
  };
}

function toDecisionReference(record) {
  const entry = normalizeDecisionEntry(record?.content);
  if (!entry) {
    return null;
  }

  return {
    id: normalizeText(record?.id),
    decision: entry.decision,
    rationale: entry.rationale,
    relatedIssue: entry.relatedIssue,
    decidedBy: entry.decidedBy,
    timestamp: entry.timestamp,
    supersededBy: entry.supersededBy ?? null,
    repository: normalizeText(record?.metadata?.repository) || null
  };
}

function normalizeDecisionEntry(content) {
  const candidate = normalizeObject(content);
  if (Object.keys(candidate).length > 0) {
    const validated = createDecisionLogEntry(candidate);
    return validated.ok ? validated.entry : null;
  }

  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      const validated = createDecisionLogEntry(parsed);
      return validated.ok ? validated.entry : null;
    } catch {
      return null;
    }
  }

  return null;
}

function makeRecordId(entry) {
  const issuePart = String(entry.relatedIssue);
  const timestampPart = normalizeTag(entry.timestamp.replaceAll(":", "").replaceAll("-", ""));
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `decision_${issuePart}_${timestampPart}_${randomPart}`;
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeIssue(value) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }
  return null;
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function firstNumber(...values) {
  for (const value of values) {
    const numeric = normalizeIssue(value);
    if (numeric) {
      return numeric;
    }
  }
  return -1;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeTag(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "_");
}

function normalizeLimit(value, fallback) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(numeric), 200);
}
