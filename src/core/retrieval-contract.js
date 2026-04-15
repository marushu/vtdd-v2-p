export const RetrievalSource = Object.freeze({
  ISSUE: "issue",
  CONSTITUTION: "constitution",
  RUNTIME_TRUTH: "runtime_truth",
  DECISION_LOG: "decision_log",
  PROPOSAL_LOG: "proposal_log",
  PR_CONTEXT: "pr_context",
  CONVERSATION: "conversation"
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
  RetrievalSource.ISSUE,
  RetrievalSource.CONVERSATION
]);

export function buildRetrievalPlan(input) {
  const {
    phase = "execution",
    includeProposal = true,
    includeConversation = false,
    availableSources = Object.values(RetrievalSource)
  } = input ?? {};

  const baseOrder = normalizePhase(phase) === "execution" ? EXECUTION_ORDER : EXPLORATION_ORDER;
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
    phase: normalizePhase(phase),
    sources
  };
}

export function selectPrimaryReference(input) {
  const { phase = "execution", candidates = {} } = input ?? {};
  const plan = buildRetrievalPlan({ phase, includeConversation: true });

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
