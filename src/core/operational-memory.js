import { validateMemoryProvider } from "./memory-provider.js";
import { MemoryRecordType } from "./memory-schema.js";

export const OperationalMemoryLayer = Object.freeze({
  IMMEDIATE_CONTEXT: "immediate_context",
  ACTIVE_OPERATIONAL_MEMORY: "active_operational_memory",
  LONG_TERM_OPERATIONAL_MEMORY: "long_term_operational_memory",
  SEMANTIC_OPERATIONAL_PATTERNS: "semantic_operational_patterns"
});

export const OperationalMemorySignal = Object.freeze({
  RELEVANCE: "relevance",
  RECENCY: "recency",
  GOVERNANCE_IMPORTANCE: "governance_importance",
  RECURRENCE: "recurrence",
  OPERATIONAL_IMPACT: "operational_impact",
  SIMILARITY: "similarity",
  EMOTIONAL_INTENSITY: "emotional_intensity"
});

export const RuntimeTruthRetrievalTrigger = Object.freeze({
  ISSUE: "issue",
  PR: "pr",
  BLOCKER: "blocker",
  EXECUTION_FAILURE: "execution_failure",
  REVIEW_OBJECTION: "review_objection",
  CI_INSTABILITY: "ci_instability",
  DEPLOYMENT_FAILURE: "deployment_failure",
  ORCHESTRATION_ANOMALY: "orchestration_anomaly"
});

export const OPERATIONAL_MEMORY_STORAGE_CANDIDATES = Object.freeze([
  "cloudflare_d1",
  "cloudflare_vectorize",
  "cloudflare_r2",
  "durable_objects"
]);

const DEFAULT_LIMIT = 8;

const LAYER_CONTRACTS = Object.freeze([
  {
    layer: OperationalMemoryLayer.IMMEDIATE_CONTEXT,
    purpose: "current conversation/runtime context",
    source: "runtime_input",
    recordTypes: [],
    retention: "ephemeral",
    retrievalRole: "highest-precedence current context, not persisted by this layer"
  },
  {
    layer: OperationalMemoryLayer.ACTIVE_OPERATIONAL_MEMORY,
    purpose: "recent issues, PRs, blockers, executions, and reviews",
    source: "memory_provider",
    recordTypes: [
      MemoryRecordType.WORKING_MEMORY,
      MemoryRecordType.EXECUTION_LOG,
      MemoryRecordType.PROPOSAL_LOG,
      MemoryRecordType.APPROVAL_LOG
    ],
    retention: "recent_operational_window",
    retrievalRole: "keeps current operational handoff and blocker state visible"
  },
  {
    layer: OperationalMemoryLayer.LONG_TERM_OPERATIONAL_MEMORY,
    purpose: "historical failures, remediation, governance philosophy, recurring pain, and preferences",
    source: "memory_provider",
    recordTypes: [
      MemoryRecordType.CONSTITUTION,
      MemoryRecordType.DECISION_LOG,
      MemoryRecordType.REPAIR_CASE,
      MemoryRecordType.TEMPERATURE_NOTE
    ],
    retention: "durable_history",
    retrievalRole: "preserves operational continuity across sessions and repositories"
  },
  {
    layer: OperationalMemoryLayer.SEMANTIC_OPERATIONAL_PATTERNS,
    purpose: "cross-project heuristics, disliked patterns, preferred workflows, and successful orchestration approaches",
    source: "memory_provider.query",
    recordTypes: [
      MemoryRecordType.DECISION_LOG,
      MemoryRecordType.REPAIR_CASE,
      MemoryRecordType.PROPOSAL_LOG,
      MemoryRecordType.EXECUTION_LOG
    ],
    retention: "derived_retrieval_index",
    retrievalRole: "adds relevance-ranked cross-repository learning without replacing structured truth"
  }
]);

const MEMORY_TYPE_LAYER_MAP = Object.freeze({
  [MemoryRecordType.WORKING_MEMORY]: OperationalMemoryLayer.ACTIVE_OPERATIONAL_MEMORY,
  [MemoryRecordType.EXECUTION_LOG]: OperationalMemoryLayer.ACTIVE_OPERATIONAL_MEMORY,
  [MemoryRecordType.APPROVAL_LOG]: OperationalMemoryLayer.ACTIVE_OPERATIONAL_MEMORY,
  [MemoryRecordType.CONSTITUTION]: OperationalMemoryLayer.LONG_TERM_OPERATIONAL_MEMORY,
  [MemoryRecordType.DECISION_LOG]: OperationalMemoryLayer.LONG_TERM_OPERATIONAL_MEMORY,
  [MemoryRecordType.REPAIR_CASE]: OperationalMemoryLayer.LONG_TERM_OPERATIONAL_MEMORY,
  [MemoryRecordType.TEMPERATURE_NOTE]: OperationalMemoryLayer.LONG_TERM_OPERATIONAL_MEMORY,
  [MemoryRecordType.PROPOSAL_LOG]: OperationalMemoryLayer.SEMANTIC_OPERATIONAL_PATTERNS
});

const STRUCTURED_MEMORY_TYPES = Object.freeze(Object.keys(MEMORY_TYPE_LAYER_MAP));

export function buildOperationalMemoryArchitecture() {
  return {
    purpose: "persistent_operational_cognition",
    nonGoals: [
      "generic_chatbot_memory",
      "unrestricted_autonomous_execution",
      "personality_simulation"
    ],
    storageCandidates: [...OPERATIONAL_MEMORY_STORAGE_CANDIDATES],
    layers: LAYER_CONTRACTS.map((layer) => ({
      ...layer,
      recordTypes: [...layer.recordTypes]
    })),
    retrievalSignals: [
      OperationalMemorySignal.RELEVANCE,
      OperationalMemorySignal.RECENCY,
      OperationalMemorySignal.GOVERNANCE_IMPORTANCE,
      OperationalMemorySignal.RECURRENCE,
      OperationalMemorySignal.OPERATIONAL_IMPACT,
      OperationalMemorySignal.SIMILARITY,
      OperationalMemorySignal.EMOTIONAL_INTENSITY
    ],
    runtimeTruthRule:
      "runtime truth is evaluated separately and must override memory for current state"
  };
}

export async function retrieveOperationalMemory(provider, input = {}) {
  const providerValidation = validateMemoryProvider(provider);
  if (!providerValidation.ok) {
    return {
      ok: false,
      status: 503,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for operational memory retrieval"
    };
  }

  const limit = normalizeLimit(input.limit, DEFAULT_LIMIT);
  const queryText = normalizeText(input.text);
  const now = normalizeTimestamp(input.now) || new Date().toISOString();
  const currentRepository = normalizeText(input.repository);
  const runtimeTruth = normalizeRuntimeTruth(input.runtimeTruth);

  try {
    const structuredRecords = await retrieveStructuredOperationalRecords(provider, {
      limit: Math.max(limit * 4, limit)
    });
    const semanticRecords = queryText
      ? await provider.query({
          text: queryText,
          limit: Math.max(limit * 4, limit)
        })
      : [];

    const candidates = mergeRecords(structuredRecords, normalizeQueriedRecords(semanticRecords))
      .map((record) =>
        toOperationalMemoryReference(record, {
          queryText,
          now,
          currentRepository
        })
      )
      .filter(Boolean)
      .sort(compareOperationalMemoryReferences)
      .slice(0, limit);

    return {
      ok: true,
      architecture: buildOperationalMemoryArchitecture(),
      queryText: queryText || null,
      repository: currentRepository || null,
      runtimeTruth,
      memoryUseRule: runtimeTruth
        ? "runtime_truth_current_state_overrides_memory_background_reference"
        : "memory_background_reference_only",
      compactContext: candidates,
      referencesByLayer: groupByLayer(candidates),
      retrievalSignals: {
        rankedBy: [
          OperationalMemorySignal.RELEVANCE,
          OperationalMemorySignal.GOVERNANCE_IMPORTANCE,
          OperationalMemorySignal.RECURRENCE,
          OperationalMemorySignal.OPERATIONAL_IMPACT,
          OperationalMemorySignal.SIMILARITY,
          OperationalMemorySignal.RECENCY,
          OperationalMemorySignal.EMOTIONAL_INTENSITY
        ],
        limit,
        dumpedAllMemory: false
      }
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: "operational_memory_read_failed",
      reason: "failed to retrieve operational memory",
      details: normalizeText(error?.message) || "unknown provider error"
    };
  }
}

export async function retrieveRuntimeTruthOperationalMemory(provider, input = {}) {
  const runtimeTruth = normalizeRuntimeTruth(input.runtimeTruth);
  const trigger = normalizeRuntimeTrigger(input.trigger ?? input.triggerType ?? runtimeTruth?.trigger);
  if (!trigger) {
    return {
      ok: false,
      status: 422,
      blockedByRule: "runtime_truth_retrieval_trigger_required",
      reason: "Issue #251 retrieval requires a runtime truth trigger"
    };
  }

  const runtimeQueryText = buildRuntimeTriggeredQueryText({
    trigger,
    text: input.text,
    runtimeTruth: input.runtimeTruth,
    issueContext: input.issueContext,
    prContext: input.prContext,
    blocker: input.blocker
  });

  const retrieved = await retrieveOperationalMemory(provider, {
    ...input,
    text: runtimeQueryText,
    runtimeTruth: {
      ...(normalizeObject(input.runtimeTruth)),
      trigger
    }
  });
  if (!retrieved.ok) {
    return retrieved;
  }

  const compactContext = retrieved.compactContext.map((reference) => ({
    ...reference,
    runtimeTrigger: trigger,
    suggestedUse: classifyOperationalSuggestion(reference, trigger)
  }));
  const painSignals = detectRecurringOperationalPain(compactContext);

  return {
    ...retrieved,
    queryText: runtimeQueryText,
    runtimeTrigger: trigger,
    supportedTriggers: Object.values(RuntimeTruthRetrievalTrigger),
    compactContext,
    referencesByLayer: groupByLayer(compactContext),
    proactivePainDetected: painSignals.detected,
    recurringOperationalPain: painSignals,
    proposalIntegration: buildProposalIntegration({
      trigger,
      compactContext,
      painSignals,
      runtimeTruth
    }),
    memoryUseRule:
      "runtime_truth_triggers_memory_retrieval_but_current_state_still_overrides_historical_memory"
  };
}

async function retrieveStructuredOperationalRecords(provider, input = {}) {
  const limit = normalizeLimit(input.limit, DEFAULT_LIMIT);
  const retrievedByType = await Promise.all(
    STRUCTURED_MEMORY_TYPES.map((type) => provider.retrieve({ type, limit }))
  );
  return retrievedByType.flatMap((retrieved) => normalizeQueriedRecords(retrieved));
}

function toOperationalMemoryReference(record, input = {}) {
  const layer = resolveLayerForType(record?.type);
  if (!layer) {
    return null;
  }

  const metadata = normalizeObject(record?.metadata);
  const content = normalizeObject(record?.content);
  const tags = normalizeTags(record?.tags);
  const queryText = normalizeText(input.queryText);
  const repository = normalizeText(metadata.repository ?? content.repository);
  const currentRepository = normalizeText(input.currentRepository);
  const textBlob = `${JSON.stringify(content)} ${JSON.stringify(metadata)} ${tags.join(" ")}`.toLowerCase();

  const scoreSignals = {
    relevance: scoreRelevance(textBlob, queryText),
    governanceImportance: scoreGovernanceImportance(record, tags),
    recurrence: scoreRecurrence(record, tags),
    operationalImpact: scoreOperationalImpact(record, tags),
    similarity: scoreSimilarity(textBlob, queryText, tags),
    recency: scoreRecency(record?.createdAt, input.now),
    emotionalIntensity: scoreEmotionalIntensity(record, tags)
  };

  return {
    id: normalizeText(record?.id),
    layer,
    type: normalizeText(record?.type),
    title: resolveTitle(record),
    summary: resolveSummary(record),
    repository: repository || null,
    crossRepository: Boolean(currentRepository && repository && repository !== currentRepository),
    createdAt: normalizeText(record?.createdAt) || null,
    tags,
    score: calculateOperationalMemoryScore(scoreSignals),
    scoreSignals,
    use: "background_reference"
  };
}

function resolveLayerForType(type) {
  return MEMORY_TYPE_LAYER_MAP[normalizeText(type)] ?? null;
}

function scoreRelevance(textBlob, queryText) {
  if (!queryText) {
    return 0;
  }
  const tokens = tokenize(queryText);
  if (tokens.length === 0) {
    return 0;
  }
  const matches = tokens.filter((token) => textBlob.includes(token)).length;
  return Math.round((matches / tokens.length) * 100);
}

function scoreGovernanceImportance(record, tags) {
  const priority = normalizePriority(record?.priority);
  const governanceTags = ["constitution", "governance", "approval", "policy", "authority", "safety"];
  const tagScore = tags.some((tag) => governanceTags.includes(tag)) ? 25 : 0;
  const typeScore =
    record?.type === MemoryRecordType.CONSTITUTION || record?.type === MemoryRecordType.DECISION_LOG ? 20 : 0;
  return Math.min(100, Math.round(priority * 0.55 + tagScore + typeScore));
}

function scoreRecurrence(record, tags) {
  const metadata = normalizeObject(record?.metadata);
  const content = normalizeObject(record?.content);
  const count = Number(metadata.recurrenceCount ?? content.recurrenceCount ?? 0);
  const tagScore = tags.includes("recurring") || tags.includes("recurrence") ? 40 : 0;
  const numericScore = Number.isFinite(count) && count > 0 ? Math.min(60, count * 15) : 0;
  return Math.min(100, Math.round(tagScore + numericScore));
}

function scoreOperationalImpact(record, tags) {
  const metadata = normalizeObject(record?.metadata);
  const content = normalizeObject(record?.content);
  const priority = normalizePriority(record?.priority);
  const impact = Number(metadata.operationalImpact ?? content.operationalImpact ?? 0);
  const impactTags = [
    "blocker",
    "failure",
    "ci",
    "deploy",
    "deployment",
    "reviewer",
    "review",
    "orchestration",
    "merge",
    "runtime_truth"
  ];
  const tagScore = tags.some((tag) => impactTags.includes(tag)) ? 30 : 0;
  const numericScore = Number.isFinite(impact) && impact > 0 ? Math.min(40, impact) : 0;
  return Math.min(100, Math.round(priority * 0.3 + tagScore + numericScore));
}

function scoreSimilarity(textBlob, queryText, tags) {
  const relevance = scoreRelevance(textBlob, queryText);
  const tokens = tokenize(queryText);
  if (tokens.length === 0) {
    return 0;
  }
  const tagMatches = tokens.filter((token) => tags.includes(token)).length;
  return Math.min(100, Math.round(relevance * 0.75 + (tagMatches / tokens.length) * 25));
}

function scoreEmotionalIntensity(record, tags) {
  const metadata = normalizeObject(record?.metadata);
  const content = normalizeObject(record?.content);
  const explicit = Number(metadata.emotionalIntensity ?? content.emotionalIntensity ?? 0);
  const intensityTags = [
    "frustration",
    "frustrating",
    "pain",
    "recurring_pain",
    "operator_pain",
    "cognitive_load",
    "urgent",
    "blocked"
  ];
  const tagScore = tags.some((tag) => intensityTags.includes(tag)) ? 45 : 0;
  const text = `${JSON.stringify(content)} ${JSON.stringify(metadata)}`.toLowerCase();
  const textScore = /\b(frustrat|pain|exhaust|annoy|again|repeated|cognitive load)\b/.test(text)
    ? 25
    : 0;
  const explicitScore = Number.isFinite(explicit) && explicit > 0 ? Math.min(55, explicit) : 0;
  return Math.min(100, Math.round(tagScore + textScore + explicitScore));
}

function scoreRecency(createdAt, now) {
  const created = Date.parse(createdAt);
  const current = Date.parse(now);
  if (!Number.isFinite(created) || !Number.isFinite(current) || created > current) {
    return 0;
  }
  const ageDays = (current - created) / 86_400_000;
  if (ageDays <= 1) {
    return 100;
  }
  if (ageDays >= 180) {
    return 10;
  }
  return Math.max(10, Math.round(100 - ageDays * 0.5));
}

function calculateOperationalMemoryScore(signals) {
  return Math.round(
    signals.relevance * 0.4 +
      signals.governanceImportance * 0.18 +
      signals.recurrence * 0.16 +
      signals.operationalImpact * 0.12 +
      signals.similarity * 0.08 +
      signals.recency * 0.04 +
      signals.emotionalIntensity * 0.02
  );
}

function compareOperationalMemoryReferences(a, b) {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
}

function groupByLayer(references) {
  const grouped = {
    [OperationalMemoryLayer.IMMEDIATE_CONTEXT]: [],
    [OperationalMemoryLayer.ACTIVE_OPERATIONAL_MEMORY]: [],
    [OperationalMemoryLayer.LONG_TERM_OPERATIONAL_MEMORY]: [],
    [OperationalMemoryLayer.SEMANTIC_OPERATIONAL_PATTERNS]: []
  };
  for (const reference of references) {
    grouped[reference.layer].push(reference);
  }
  return grouped;
}

function mergeRecords(primary, secondary) {
  const map = new Map();
  for (const record of [...primary, ...secondary]) {
    const key = createRecordMergeKey(record);
    if (!map.has(key)) {
      map.set(key, record);
    }
  }
  return [...map.values()];
}

function createRecordMergeKey(record) {
  const id = normalizeText(record?.id);
  if (id) {
    return `id:${id}`;
  }
  return [
    "shape",
    normalizeText(record?.type),
    normalizeText(record?.createdAt),
    resolveTitle(record),
    resolveSummary(record)
  ].join(":");
}

function normalizeQueriedRecords(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (Array.isArray(value?.records)) {
    return value.records;
  }
  return [];
}

function resolveTitle(record) {
  const content = normalizeObject(record?.content);
  return (
    normalizeText(content.title) ||
    normalizeText(content.decision) ||
    normalizeText(content.hypothesis) ||
    normalizeText(content.failurePattern) ||
    normalizeText(content.summary) ||
    normalizeText(content.note) ||
    normalizeText(record?.id)
  );
}

function resolveSummary(record) {
  const content = normalizeObject(record?.content);
  return (
    normalizeText(content.summary) ||
    normalizeText(content.rationale) ||
    normalizeText(content.remediation) ||
    normalizeText(content.description) ||
    normalizeText(content.note) ||
    normalizeText(content.result) ||
    null
  );
}

function normalizeRuntimeTruth(value) {
  const runtimeTruth = normalizeObject(value);
  if (Object.keys(runtimeTruth).length === 0) {
    return null;
  }
  return {
    currentState: normalizeText(runtimeTruth.currentState) || null,
    trigger: normalizeRuntimeTrigger(runtimeTruth.trigger ?? runtimeTruth.triggerType),
    source: normalizeText(runtimeTruth.source) || null,
    checkedAt: normalizeText(runtimeTruth.checkedAt) || null,
    overridesMemory: true
  };
}

function normalizeRuntimeTrigger(value) {
  const trigger = normalizeText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (Object.values(RuntimeTruthRetrievalTrigger).includes(trigger)) {
    return trigger;
  }
  return null;
}

function buildRuntimeTriggeredQueryText(input = {}) {
  const parts = [
    input.trigger,
    input.text,
    normalizeObject(input.runtimeTruth).currentState,
    normalizeObject(input.runtimeTruth).summary,
    normalizeObject(input.issueContext).title,
    normalizeObject(input.issueContext).body,
    normalizeObject(input.prContext).title,
    normalizeObject(input.prContext).summary,
    normalizeObject(input.blocker).summary
  ];
  return parts.map(normalizeText).filter(Boolean).join(" ");
}

function detectRecurringOperationalPain(references) {
  const painReferences = references.filter((reference) => {
    const signals = reference.scoreSignals ?? {};
    return (
      Number(signals.recurrence) >= 40 ||
      Number(signals.emotionalIntensity) >= 45 ||
      reference.tags.includes("recurring_pain") ||
      reference.tags.includes("operator_pain")
    );
  });

  return {
    detected: painReferences.length > 0,
    count: painReferences.length,
    references: painReferences.map((reference) => ({
      id: reference.id,
      title: reference.title,
      repository: reference.repository,
      crossRepository: reference.crossRepository,
      recurrence: reference.scoreSignals.recurrence,
      emotionalIntensity: reference.scoreSignals.emotionalIntensity,
      operationalImpact: reference.scoreSignals.operationalImpact
    }))
  };
}

function buildProposalIntegration(input = {}) {
  const references = Array.isArray(input.compactContext) ? input.compactContext : [];
  const topReferences = references.slice(0, 3).map((reference) => ({
    id: reference.id,
    title: reference.title,
    repository: reference.repository,
    crossRepository: reference.crossRepository,
    suggestedUse: reference.suggestedUse
  }));
  const highPriority = references
    .filter((reference) => Number(reference.scoreSignals?.operationalImpact) >= 60)
    .slice(0, 3)
    .map((reference) => reference.id);

  return {
    uses: [
      "issue_proposal",
      "remediation_proposal",
      "prioritization",
      "orchestration_suggestion"
    ],
    issueProposal: {
      recommended: input.painSignals?.detected === true,
      basis: topReferences
    },
    remediationProposal: {
      recommended: references.length > 0,
      trigger: input.trigger,
      basis: topReferences
    },
    prioritization: {
      priority: input.painSignals?.detected === true || highPriority.length > 0 ? "high" : "normal",
      highImpactReferenceIds: highPriority
    },
    orchestrationSuggestion: {
      recommended:
        input.trigger === RuntimeTruthRetrievalTrigger.ORCHESTRATION_ANOMALY ||
        input.trigger === RuntimeTruthRetrievalTrigger.PR ||
        input.trigger === RuntimeTruthRetrievalTrigger.REVIEW_OBJECTION ||
        references.some((reference) => reference.tags.includes("orchestration")),
      basis: topReferences
    },
    crossRepositoryLearning: references
      .filter((reference) => reference.crossRepository)
      .slice(0, 3)
      .map((reference) => ({
        id: reference.id,
        repository: reference.repository,
        title: reference.title
      }))
  };
}

function classifyOperationalSuggestion(reference, trigger) {
  const tags = reference.tags ?? [];
  if (tags.includes("repair_case") || reference.type === MemoryRecordType.REPAIR_CASE) {
    return "remediation_proposal";
  }
  if (tags.includes("proposal_log") || reference.type === MemoryRecordType.PROPOSAL_LOG) {
    return "issue_proposal";
  }
  if (tags.includes("orchestration") || trigger === RuntimeTruthRetrievalTrigger.ORCHESTRATION_ANOMALY) {
    return "orchestration_suggestion";
  }
  return "prioritization";
}

function normalizePriority(value) {
  const numeric = Number(value ?? 50);
  if (!Number.isFinite(numeric)) {
    return 50;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeText(item).toLowerCase()).filter(Boolean);
}

function normalizeLimit(value, fallback) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(numeric), 50);
}

function normalizeTimestamp(value) {
  const text = normalizeText(value);
  if (!text || !Number.isFinite(Date.parse(text))) {
    return null;
  }
  return text;
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function tokenize(value) {
  return normalizeText(value)
    .toLowerCase()
    .split(/[^a-z0-9_#-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}
