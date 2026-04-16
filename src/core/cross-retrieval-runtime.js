import { retrieveConstitution } from "./memory-retrieve.js";
import { validateMemoryProvider } from "./memory-provider.js";
import { MemoryRecordType } from "./memory-schema.js";
import {
  buildRetrievalPlan,
  buildSemanticRetrievalPolicy,
  rerankReferencesBySource,
  RetrievalSource,
  SemanticRetrievalMode,
  selectPrimaryReference
} from "./retrieval-contract.js";
import { retrieveDecisionLogReferences } from "./decision-log-runtime.js";
import { retrieveProposalLogReferences } from "./proposal-log-runtime.js";

const DEFAULT_LIMIT = 5;

export async function retrieveCrossIssueMemoryIndex(provider, input = {}) {
  const providerValidation = validateMemoryProvider(provider);
  if (!providerValidation.ok) {
    return {
      ok: false,
      status: 503,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for cross retrieval"
    };
  }

  const phase = normalizePhase(input.phase);
  const limit = normalizeLimit(input.limit, DEFAULT_LIMIT);
  const relatedIssue = normalizeIssue(input.relatedIssue);
  const queryText = normalizeText(input.text);
  const issueContext = normalizeIssueContext(input.issueContext, relatedIssue);
  const runtimeTruth = normalizeRuntimeTruth(input.runtimeTruth);
  const semanticRetrievalInput = normalizeSemanticRetrievalInput(
    input.semanticRetrieval,
    queryText,
    limit
  );

  const retrievalPlan = buildRetrievalPlan({
    phase,
    includeProposal: true,
    includeConversation: false,
    semanticRetrieval: semanticRetrievalInput
  });

  try {
    const constitutionRecords = await retrieveConstitution(provider, limit);
    const decisionReferences = await retrieveDecisionLogReferences(provider, {
      limit,
      relatedIssue
    });
    if (!decisionReferences.ok) {
      return decisionReferences;
    }

    const proposalReferences = await retrieveProposalLogReferences(provider, {
      limit,
      relatedIssue
    });
    if (!proposalReferences.ok) {
      return proposalReferences;
    }

    const prContextReferences = await retrievePrContextReferences(provider, {
      limit,
      relatedIssue,
      text: queryText
    });

    const candidates = {
      [RetrievalSource.ISSUE]: issueContext ? [issueContext] : [],
      [RetrievalSource.CONSTITUTION]: constitutionRecords.map(toConstitutionReference),
      [RetrievalSource.RUNTIME_TRUTH]: runtimeTruth ? [runtimeTruth] : [],
      [RetrievalSource.DECISION_LOG]: decisionReferences.references,
      [RetrievalSource.PROPOSAL_LOG]: proposalReferences.references,
      [RetrievalSource.PR_CONTEXT]: prContextReferences,
      [RetrievalSource.CONVERSATION]: []
    };
    const semanticRetrieved = await retrieveSemanticReferences(provider, {
      text: queryText,
      relatedIssue,
      limit: limit * 2,
      semanticPolicy: retrievalPlan.semanticRetrieval
    });
    const mergedCandidates = mergeStructuredAndSemanticCandidates({
      planSources: retrievalPlan.sources,
      structuredCandidates: candidates,
      semanticCandidates: semanticRetrieved.referencesBySource,
      semanticPolicy: retrievalPlan.semanticRetrieval
    });

    const primary = selectPrimaryReference({
      phase,
      candidates: mergedCandidates
    });

    return {
      ok: true,
      retrievalPlan,
      relatedIssue,
      queryText: queryText || null,
      semanticRetrieval: {
        ...retrievalPlan.semanticRetrieval,
        applied: semanticRetrieved.applied,
        adapter: semanticRetrieved.adapter,
        sourceCounts: semanticRetrieved.sourceCounts
      },
      referencesBySource: mergedCandidates,
      orderedReferences: flattenByPlan(retrievalPlan.sources, mergedCandidates, limit),
      primaryReference: primary
        ? {
            source: primary.source,
            reference: primary.document
          }
        : null
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: "memory_read_failed",
      reason: "failed to retrieve cross-issue memory index",
      details: normalizeText(error?.message) || "unknown provider error"
    };
  }
}

export async function retrievePrContextReferences(provider, input = {}) {
  const limit = normalizeLimit(input.limit, DEFAULT_LIMIT);
  const relatedIssue = normalizeIssue(input.relatedIssue);
  const text = normalizeText(input.text);

  const records = await provider.retrieve({
    type: MemoryRecordType.EXECUTION_LOG,
    limit: Math.max(limit * 4, limit)
  });

  const references = records
    .map(toPrContextReference)
    .filter(Boolean)
    .filter((item) => (relatedIssue ? item.relatedIssue === relatedIssue : true))
    .filter((item) => (text ? JSON.stringify(item).toLowerCase().includes(text.toLowerCase()) : true))
    .slice(0, limit);

  return references;
}

function toConstitutionReference(record) {
  return {
    id: normalizeText(record?.id),
    title: normalizeText(record?.content?.title) || "constitution_rule",
    summary: normalizeText(record?.content?.description) || normalizeText(record?.content?.rule) || null,
    version: normalizeText(record?.metadata?.version) || null,
    timestamp: normalizeText(record?.createdAt) || null
  };
}

function toPrContextReference(record) {
  const metadata = normalizeObject(record?.metadata);
  const content = normalizeObject(record?.content);
  const tags = Array.isArray(record?.tags) ? record.tags.map(normalizeText) : [];

  const hasPrSignal =
    hasTagPrefix(tags, "pr:") ||
    hasTag(tags, "pr_context") ||
    hasTag(tags, "review_summary") ||
    normalizeText(metadata.kind) === "pr_context" ||
    normalizeText(metadata.kind) === "pr_review_summary" ||
    Number.isInteger(Number(metadata.prNumber)) ||
    Number.isInteger(Number(content.prNumber));
  if (!hasPrSignal) {
    return null;
  }

  const summary = normalizeText(content.summary) || normalizeText(content.note) || normalizeText(content.result);
  const relatedIssue = normalizeIssue(content.relatedIssue ?? metadata.relatedIssue);
  const prNumber = normalizeIssue(content.prNumber ?? metadata.prNumber);
  const reviewer = normalizeText(content.reviewer) || normalizeText(metadata.reviewer) || null;
  const repository = normalizeText(metadata.repository) || null;
  const status = normalizeText(content.status) || normalizeText(metadata.status) || null;

  return {
    id: normalizeText(record?.id),
    prNumber,
    relatedIssue,
    summary: summary || null,
    reviewer,
    status,
    repository,
    timestamp: normalizeText(record?.createdAt) || null
  };
}

function flattenByPlan(planSources, candidates, limit) {
  const flattened = [];
  for (const source of planSources) {
    const list = Array.isArray(candidates[source]) ? candidates[source] : [];
    for (const item of list) {
      flattened.push({
        source,
        reference: item
      });
      if (flattened.length >= limit) {
        return flattened;
      }
    }
  }
  return flattened;
}

function normalizeSemanticRetrievalInput(value, queryText, limit) {
  const semantic = normalizeObject(value);
  const enabled = semantic.enabled === true && Boolean(queryText);
  return {
    enabled,
    queryText,
    mode: normalizeSemanticMode(semantic.mode),
    maxPerSource: normalizeLimit(semantic.maxPerSource, Math.max(2, Math.min(limit, 6))),
    qualityUseCases: Array.isArray(semantic.qualityUseCases) ? semantic.qualityUseCases : undefined
  };
}

async function retrieveSemanticReferences(provider, input = {}) {
  const semanticPolicy = input.semanticPolicy ?? buildSemanticRetrievalPolicy();
  const empty = {
    applied: false,
    adapter: "memory_provider.query",
    sourceCounts: {},
    referencesBySource: createEmptySourceMap()
  };
  if (!semanticPolicy.enabled) {
    return empty;
  }

  const raw = await provider.query({
    text: input.text,
    limit: normalizeLimit(input.limit, DEFAULT_LIMIT)
  });
  const queriedRecords = normalizeQueriedRecords(raw);
  const referencesBySource = createEmptySourceMap();
  for (const record of queriedRecords) {
    const normalized = toSemanticSourceReference(record);
    if (!normalized) {
      continue;
    }
    if (!shouldKeepSemanticReference(normalized.reference, normalized.source, input.relatedIssue)) {
      continue;
    }
    referencesBySource[normalized.source].push(normalized.reference);
  }

  const sourceCounts = {};
  for (const [source, entries] of Object.entries(referencesBySource)) {
    sourceCounts[source] = entries.length;
  }

  return {
    applied: true,
    adapter: resolveSemanticAdapter(raw),
    sourceCounts,
    referencesBySource
  };
}

function mergeStructuredAndSemanticCandidates(input = {}) {
  const {
    planSources = [],
    structuredCandidates = {},
    semanticCandidates = {},
    semanticPolicy = buildSemanticRetrievalPolicy()
  } = input;

  const merged = {};
  for (const source of planSources) {
    const structuredReferences = Array.isArray(structuredCandidates[source])
      ? structuredCandidates[source]
      : [];
    const semanticReferences = Array.isArray(semanticCandidates[source]) ? semanticCandidates[source] : [];
    merged[source] = rerankReferencesBySource({
      source,
      structuredReferences,
      semanticReferences,
      semanticPolicy
    });
  }

  for (const source of Object.keys(RetrievalSource)) {
    const key = RetrievalSource[source];
    if (!Array.isArray(merged[key])) {
      merged[key] = Array.isArray(structuredCandidates[key]) ? structuredCandidates[key] : [];
    }
  }

  return merged;
}

function normalizeQueriedRecords(queryResult) {
  if (Array.isArray(queryResult)) {
    return queryResult;
  }
  if (Array.isArray(queryResult?.records)) {
    return queryResult.records;
  }
  return [];
}

function resolveSemanticAdapter(queryResult) {
  const adapter = normalizeText(queryResult?.adapter);
  return adapter || "memory_provider.query";
}

function createEmptySourceMap() {
  return {
    [RetrievalSource.ISSUE]: [],
    [RetrievalSource.CONSTITUTION]: [],
    [RetrievalSource.RUNTIME_TRUTH]: [],
    [RetrievalSource.DECISION_LOG]: [],
    [RetrievalSource.PROPOSAL_LOG]: [],
    [RetrievalSource.PR_CONTEXT]: [],
    [RetrievalSource.CONVERSATION]: []
  };
}

function toSemanticSourceReference(record) {
  const type = normalizeText(record?.type).toLowerCase();
  const score = normalizeSemanticScore(
    record?.semanticScore ?? record?.score ?? normalizeObject(record?.metadata).semanticScore
  );
  if (type === MemoryRecordType.CONSTITUTION) {
    return {
      source: RetrievalSource.CONSTITUTION,
      reference: withSemanticScore(toConstitutionReference(record), score)
    };
  }
  if (type === MemoryRecordType.DECISION_LOG) {
    const decisionReference = toDecisionLogReference(record);
    return decisionReference
      ? {
          source: RetrievalSource.DECISION_LOG,
          reference: withSemanticScore(decisionReference, score)
        }
      : null;
  }
  if (type === MemoryRecordType.PROPOSAL_LOG) {
    const proposalReference = toProposalLogReference(record);
    return proposalReference
      ? {
          source: RetrievalSource.PROPOSAL_LOG,
          reference: withSemanticScore(proposalReference, score)
        }
      : null;
  }
  if (type === MemoryRecordType.EXECUTION_LOG) {
    const prReference = toPrContextReference(record);
    return prReference
      ? {
          source: RetrievalSource.PR_CONTEXT,
          reference: withSemanticScore(prReference, score)
        }
      : null;
  }
  return null;
}

function withSemanticScore(reference, semanticScore) {
  if (!reference) {
    return null;
  }
  return {
    ...reference,
    semanticScore
  };
}

function toDecisionLogReference(record) {
  const content = normalizeObject(record?.content);
  const decision = normalizeText(content.decision);
  if (!decision) {
    return null;
  }
  return {
    id: normalizeText(record?.id),
    decision,
    rationale: normalizeText(content.rationale) || null,
    relatedIssue: normalizeIssue(content.relatedIssue ?? normalizeObject(record?.metadata).relatedIssue),
    decidedBy: normalizeText(content.decidedBy) || null,
    timestamp: normalizeText(content.timestamp) || normalizeText(record?.createdAt) || null,
    supersededBy: normalizeText(content.supersededBy) || null,
    repository: normalizeText(normalizeObject(record?.metadata).repository) || null
  };
}

function toProposalLogReference(record) {
  const content = normalizeObject(record?.content);
  const hypothesis = normalizeText(content.hypothesis);
  if (!hypothesis) {
    return null;
  }
  return {
    id: normalizeText(record?.id),
    hypothesis,
    options: Array.isArray(content.options) ? content.options : [],
    relatedIssue: normalizeIssue(content.relatedIssue ?? normalizeObject(record?.metadata).relatedIssue),
    proposedBy: normalizeText(content.proposedBy) || null,
    timestamp: normalizeText(content.timestamp) || normalizeText(record?.createdAt) || null,
    repository: normalizeText(normalizeObject(record?.metadata).repository) || null
  };
}

function shouldKeepSemanticReference(reference, source, relatedIssue) {
  if (!relatedIssue) {
    return true;
  }
  if (
    source === RetrievalSource.DECISION_LOG ||
    source === RetrievalSource.PROPOSAL_LOG ||
    source === RetrievalSource.PR_CONTEXT
  ) {
    return normalizeIssue(reference?.relatedIssue) === relatedIssue;
  }
  return true;
}

function normalizeIssueContext(issueContext, relatedIssue) {
  const context = normalizeObject(issueContext);
  const issueNumber = normalizeIssue(context.issueNumber ?? relatedIssue);
  if (!issueNumber) {
    return null;
  }
  return {
    issueNumber,
    issueTitle: normalizeText(context.issueTitle) || null,
    issueUrl: normalizeText(context.issueUrl) || null
  };
}

function normalizeRuntimeTruth(runtimeTruth) {
  const value = normalizeObject(runtimeTruth);
  if (Object.keys(value).length === 0) {
    return null;
  }
  return {
    runtimeAvailable: Boolean(value.runtimeAvailable),
    source: normalizeText(value.source) || null,
    checkedAt: normalizeText(value.checkedAt) || null
  };
}

function hasTagPrefix(tags, prefix) {
  return tags.some((tag) => tag.toLowerCase().startsWith(prefix));
}

function hasTag(tags, target) {
  const normalizedTarget = target.toLowerCase();
  return tags.some((tag) => tag.toLowerCase() === normalizedTarget);
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

function normalizePhase(value) {
  const phase = normalizeText(value).toLowerCase();
  if (phase === "execution" || phase === "exploration") {
    return phase;
  }
  return "execution";
}

function normalizeIssue(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function normalizeLimit(value, fallback) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(numeric), 200);
}

function normalizeSemanticMode(value) {
  const mode = normalizeText(value).toLowerCase();
  if (mode === SemanticRetrievalMode.ASSISTIVE) {
    return SemanticRetrievalMode.ASSISTIVE;
  }
  return SemanticRetrievalMode.DISABLED;
}

function normalizeSemanticScore(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return 0;
}
