import { retrieveConstitution } from "./memory-retrieve.js";
import { validateMemoryProvider } from "./memory-provider.js";
import { MemoryRecordType } from "./memory-schema.js";
import { buildRetrievalPlan, RetrievalSource, selectPrimaryReference } from "./retrieval-contract.js";
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

  const retrievalPlan = buildRetrievalPlan({
    phase,
    includeProposal: true,
    includeConversation: false
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

    const primary = selectPrimaryReference({
      phase,
      candidates
    });

    return {
      ok: true,
      retrievalPlan,
      relatedIssue,
      queryText: queryText || null,
      referencesBySource: candidates,
      orderedReferences: flattenByPlan(retrievalPlan.sources, candidates, limit),
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
