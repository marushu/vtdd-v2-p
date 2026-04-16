export const RetrievalSource = Object.freeze({
  ISSUE: "issue",
  CONSTITUTION: "constitution",
  RUNTIME_TRUTH: "runtime_truth",
  DECISION_LOG: "decision_log",
  PROPOSAL_LOG: "proposal_log",
  PR_CONTEXT: "pr_context",
  CONVERSATION: "conversation"
});

export const SemanticRetrievalMode = Object.freeze({
  DISABLED: "disabled",
  ASSISTIVE: "assistive"
});

const EXECUTION_ORDER = Object.freeze([
  RetrievalSource.ISSUE,
  RetrievalSource.CONSTITUTION,
  RetrievalSource.RUNTIME_TRUTH,
  RetrievalSource.DECISION_LOG,
  RetrievalSource.PROPOSAL_LOG,
  RetrievalSource.PR_CONTEXT,
  RetrievalSource.CONVERSATION
]);

const EXPLORATION_ORDER = Object.freeze([
  RetrievalSource.CONSTITUTION,
  RetrievalSource.DECISION_LOG,
  RetrievalSource.PROPOSAL_LOG,
  RetrievalSource.PR_CONTEXT,
  RetrievalSource.ISSUE,
  RetrievalSource.CONVERSATION
]);

const STRUCTURED_FIRST_SOURCES = Object.freeze([
  RetrievalSource.ISSUE,
  RetrievalSource.CONSTITUTION,
  RetrievalSource.RUNTIME_TRUTH
]);

const SEMANTIC_ELIGIBLE_SOURCES = Object.freeze([
  RetrievalSource.CONSTITUTION,
  RetrievalSource.DECISION_LOG,
  RetrievalSource.PROPOSAL_LOG,
  RetrievalSource.PR_CONTEXT
]);

const DEFAULT_RETRIEVAL_QUALITY_USE_CASES = Object.freeze([
  "recall_context",
  "similar_issue_discovery",
  "decision_rationale_lookup"
]);

export function buildRetrievalPlan(input) {
  const {
    phase = "execution",
    includeProposal = true,
    includeConversation = false,
    availableSources = Object.values(RetrievalSource),
    semanticRetrieval = {}
  } = input ?? {};

  const normalizedPhase = normalizePhase(phase);
  const baseOrder = normalizedPhase === "execution" ? EXECUTION_ORDER : EXPLORATION_ORDER;
  const available = new Set(availableSources.map(normalize));

  const sources = baseOrder.filter((source) => {
    if (source === RetrievalSource.PROPOSAL_LOG && !includeProposal) {
      return false;
    }
    if (source === RetrievalSource.CONVERSATION && !includeConversation) {
      return false;
    }
    return available.has(source);
  });

  return {
    phase: normalizedPhase,
    sources,
    semanticRetrieval: buildSemanticRetrievalPolicy({
      phase: normalizedPhase,
      ...semanticRetrieval
    })
  };
}

export function buildSemanticRetrievalPolicy(input = {}) {
  const queryText = normalizeText(input.queryText);
  const enabled = input.enabled === true && Boolean(queryText);
  const mode = enabled ? normalizeSemanticMode(input.mode) : SemanticRetrievalMode.DISABLED;
  const maxPerSource = normalizeLimit(input.maxPerSource, 4);

  return {
    enabled,
    mode,
    extensionPoint: "memory_provider.query",
    providerAgnostic: true,
    structuredFirstSources: [...STRUCTURED_FIRST_SOURCES],
    semanticEligibleSources: [...SEMANTIC_ELIGIBLE_SOURCES],
    rerankRule:
      "structured references stay first; semantic candidates can fill remaining slots within each source",
    maxPerSource,
    qualityMetricsTemplate: buildRetrievalQualityMetricsTemplate({
      useCases: input.qualityUseCases
    })
  };
}

export function buildRetrievalQualityMetricsTemplate(input = {}) {
  const useCases = normalizeUseCases(input.useCases);
  return useCases.map((useCase) => ({
    useCase,
    precision: {
      at3: null,
      at5: null
    },
    recall: {
      at5: null,
      at10: null
    },
    baseline: "define_before_rollout",
    target: "compare_structured_only_vs_semantic_assistive"
  }));
}

export function rerankReferencesBySource(input = {}) {
  const {
    source,
    structuredReferences = [],
    semanticReferences = [],
    semanticPolicy = buildSemanticRetrievalPolicy()
  } = input;

  const structured = Array.isArray(structuredReferences) ? structuredReferences : [];
  if (
    !semanticPolicy.enabled ||
    !semanticPolicy.semanticEligibleSources.includes(source) ||
    semanticReferences.length === 0
  ) {
    return dedupeReferences(structured);
  }

  const semantic = sortSemanticReferences(semanticReferences)
    .slice(0, semanticPolicy.maxPerSource)
    .map((item) => ({
      ...item,
      retrievalSignal: {
        type: "semantic_query",
        mode: semanticPolicy.mode,
        score: normalizeScore(item.semanticScore)
      }
    }));

  return dedupeReferences([...structured, ...semantic]);
}

export function selectPrimaryReference(input) {
  const { phase = "execution", candidates = {} } = input ?? {};
  const plan = buildRetrievalPlan({
    phase,
    includeConversation: true,
    semanticRetrieval: {
      enabled: false
    }
  });

  for (const source of plan.sources) {
    const docs = Array.isArray(candidates[source]) ? candidates[source] : [];
    if (docs.length > 0) {
      return {
        source,
        document: docs[0]
      };
    }
  }

  return null;
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizePhase(value) {
  const phase = normalize(value);
  if (phase === "execution" || phase === "exploration") {
    return phase;
  }
  return "execution";
}

function normalizeSemanticMode(value) {
  const mode = normalize(value);
  if (mode === SemanticRetrievalMode.ASSISTIVE) {
    return SemanticRetrievalMode.ASSISTIVE;
  }
  return SemanticRetrievalMode.DISABLED;
}

function normalizeLimit(value, fallback) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(numeric), 20);
}

function normalizeUseCases(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [...DEFAULT_RETRIEVAL_QUALITY_USE_CASES];
  }
  const normalized = value.map(normalizeText).filter(Boolean);
  return normalized.length > 0 ? normalized : [...DEFAULT_RETRIEVAL_QUALITY_USE_CASES];
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function sortSemanticReferences(references) {
  const items = Array.isArray(references) ? references : [];
  return items
    .map((item, index) => ({
      item,
      index,
      score: normalizeScore(item?.semanticScore)
    }))
    .sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

function normalizeScore(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return 0;
}

function dedupeReferences(references) {
  const map = new Map();
  for (const item of references) {
    const key = createReferenceKey(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return [...map.values()];
}

function createReferenceKey(reference) {
  const id = normalizeText(reference?.id);
  if (id) {
    return `id:${id}`;
  }
  return `raw:${JSON.stringify(reference ?? {})}`;
}
