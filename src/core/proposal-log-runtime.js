import { createProposalLogEntry } from "./log-contracts.js";
import { validateMemoryProvider } from "./memory-provider.js";
import { MemoryRecordType } from "./memory-schema.js";

const DEFAULT_RETRIEVE_LIMIT = 5;

export async function appendProposalLogFromGateway(provider, gatewayInput = {}, gatewayResult = {}) {
  const providerValidation = validateMemoryProvider(provider);
  if (!providerValidation.ok) {
    return {
      ok: false,
      status: 503,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for proposal log persistence"
    };
  }

  const created = createCanonicalProposalFromGateway(gatewayInput);
  if (!created.ok) {
    return {
      ok: false,
      status: 422,
      blockedByRule: "proposal_log_schema_invalid",
      reason: "proposal log must satisfy canonical schema",
      issues: created.issues
    };
  }

  const recordInput = buildProposalMemoryRecord({
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
        reason: "failed to persist proposal log",
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
      reason: "failed to persist proposal log",
      details: normalizeText(error?.message) || "unknown provider error"
    };
  }
}

export async function retrieveProposalLogReferences(provider, input = {}) {
  const providerValidation = validateMemoryProvider(provider);
  if (!providerValidation.ok) {
    return {
      ok: false,
      status: 503,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for proposal log retrieval"
    };
  }

  const limit = normalizeLimit(input.limit, DEFAULT_RETRIEVE_LIMIT);
  const relatedIssue = normalizeIssue(input.relatedIssue);

  let records = [];
  try {
    records = await provider.retrieve({
      type: MemoryRecordType.PROPOSAL_LOG,
      limit: Math.max(limit * 4, limit)
    });
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: "memory_read_failed",
      reason: "failed to retrieve proposal logs",
      details: normalizeText(error?.message) || "unknown provider error"
    };
  }

  const references = records
    .map(toProposalReference)
    .filter(Boolean)
    .filter((item) => (relatedIssue ? item.relatedIssue === relatedIssue : true))
    .slice(0, limit);

  return {
    ok: true,
    references
  };
}

export function inferRelatedIssueFromProposalGatewayInput(gatewayInput = {}) {
  const memoryRecord = gatewayInput?.memoryRecord ?? {};
  const content = normalizeObject(memoryRecord.content);
  const metadata = normalizeObject(memoryRecord.metadata);
  const issue = normalizeIssue(content.relatedIssue ?? metadata.relatedIssue);
  return issue > 0 ? issue : null;
}

export function createCanonicalProposalFromGateway(gatewayInput = {}) {
  const memoryRecord = gatewayInput?.memoryRecord ?? {};
  const content = normalizeObject(memoryRecord.content);
  const metadata = normalizeObject(memoryRecord.metadata);
  const rawContent = memoryRecord.content;

  const candidate = {
    hypothesis: firstText(content.hypothesis, typeof rawContent === "string" ? rawContent : ""),
    options: firstArray(content.options, metadata.options),
    rejectedReasons: firstRejectedReasons(content.rejectedReasons, metadata.rejectedReasons),
    concerns: firstArray(content.concerns, metadata.concerns),
    unresolvedQuestions: firstArray(content.unresolvedQuestions, metadata.unresolvedQuestions),
    relatedIssue: normalizeIssue(content.relatedIssue ?? metadata.relatedIssue),
    proposedBy: firstText(content.proposedBy, metadata.proposedBy, gatewayInput?.actorRole),
    timestamp: firstText(content.timestamp, metadata.timestamp, new Date().toISOString())
  };

  return createProposalLogEntry(candidate);
}

function buildProposalMemoryRecord({ entry, gatewayInput, gatewayResult }) {
  const repository = normalizeText(gatewayResult?.repository);
  const proposedByTag = normalizeTag(entry.proposedBy);
  const phaseTag = normalizeTag(gatewayInput?.phase);
  const issuePart = entry.relatedIssue ? String(entry.relatedIssue) : "none";

  return {
    id: makeRecordId({ issuePart, timestamp: entry.timestamp }),
    type: MemoryRecordType.PROPOSAL_LOG,
    content: entry,
    metadata: {
      relatedIssue: entry.relatedIssue ?? null,
      proposedBy: entry.proposedBy,
      repository: repository || null,
      phase: phaseTag || null
    },
    priority: 80,
    tags: [
      "proposal_log",
      entry.relatedIssue ? `issue:${entry.relatedIssue}` : "issue:none",
      proposedByTag ? `proposed_by:${proposedByTag}` : null,
      phaseTag ? `phase:${phaseTag}` : null,
      repository ? `repo:${normalizeTag(repository.replace("/", "_"))}` : null
    ].filter(Boolean),
    createdAt: entry.timestamp
  };
}

function toProposalReference(record) {
  const entry = normalizeProposalEntry(record?.content);
  if (!entry) {
    return null;
  }

  return {
    id: normalizeText(record?.id),
    hypothesis: entry.hypothesis,
    options: entry.options,
    rejectedReasons: entry.rejectedReasons,
    concerns: entry.concerns,
    unresolvedQuestions: entry.unresolvedQuestions,
    relatedIssue: entry.relatedIssue ?? null,
    proposedBy: entry.proposedBy,
    timestamp: entry.timestamp,
    repository: normalizeText(record?.metadata?.repository) || null
  };
}

function normalizeProposalEntry(content) {
  const candidate = normalizeObject(content);
  if (Object.keys(candidate).length > 0) {
    const validated = createProposalLogEntry(candidate);
    return validated.ok ? validated.entry : null;
  }

  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      const validated = createProposalLogEntry(parsed);
      return validated.ok ? validated.entry : null;
    } catch {
      return null;
    }
  }

  return null;
}

function makeRecordId({ issuePart, timestamp }) {
  const timestampPart = normalizeTag(String(timestamp).replaceAll(":", "").replaceAll("-", ""));
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `proposal_${issuePart}_${timestampPart}_${randomPart}`;
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

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }
  return [];
}

function firstRejectedReasons(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }
  return [];
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
