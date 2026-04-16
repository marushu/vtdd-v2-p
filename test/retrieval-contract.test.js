import test from "node:test";
import assert from "node:assert/strict";
import {
  RetrievalSource,
  SemanticRetrievalMode,
  buildRetrievalPlan,
  buildRetrievalQualityMetricsTemplate,
  buildSemanticRetrievalPolicy,
  rerankReferencesBySource,
  selectPrimaryReference
} from "../src/core/index.js";

test("execution retrieval plan prioritizes issue first", () => {
  const plan = buildRetrievalPlan({
    phase: "execution",
    includeProposal: true,
    includeConversation: false
  });
  assert.equal(plan.sources[0], RetrievalSource.ISSUE);
  assert.equal(plan.sources.includes(RetrievalSource.CONSTITUTION), true);
  assert.equal(plan.sources.includes(RetrievalSource.PR_CONTEXT), true);
});

test("execution retrieval can exclude proposal and conversation", () => {
  const plan = buildRetrievalPlan({
    phase: "execution",
    includeProposal: false,
    includeConversation: false
  });
  assert.equal(plan.sources.includes(RetrievalSource.PROPOSAL_LOG), false);
  assert.equal(plan.sources.includes(RetrievalSource.CONVERSATION), false);
});

test("exploration retrieval starts from constitution", () => {
  const plan = buildRetrievalPlan({
    phase: "exploration",
    includeProposal: true,
    includeConversation: true
  });
  assert.equal(plan.sources[0], RetrievalSource.CONSTITUTION);
  assert.equal(plan.sources.includes(RetrievalSource.PR_CONTEXT), true);
});

test("selectPrimaryReference picks first available source by contract order", () => {
  const selected = selectPrimaryReference({
    phase: "execution",
    candidates: {
      [RetrievalSource.DECISION_LOG]: [{ id: "d1" }],
      [RetrievalSource.ISSUE]: [{ id: "i1" }],
      [RetrievalSource.CONSTITUTION]: [{ id: "c1" }]
    }
  });
  assert.equal(selected.source, RetrievalSource.ISSUE);
  assert.deepEqual(selected.document, { id: "i1" });
});

test("semantic retrieval policy declares provider-agnostic extension and structured-first rule", () => {
  const policy = buildSemanticRetrievalPolicy({
    enabled: true,
    mode: SemanticRetrievalMode.ASSISTIVE,
    queryText: "過去の判断を思い出したい",
    maxPerSource: 6
  });

  assert.equal(policy.enabled, true);
  assert.equal(policy.providerAgnostic, true);
  assert.equal(policy.extensionPoint, "memory_provider.query");
  assert.equal(policy.structuredFirstSources.includes(RetrievalSource.ISSUE), true);
  assert.equal(policy.semanticEligibleSources.includes(RetrievalSource.DECISION_LOG), true);
});

test("semantic rerank keeps structured reference first and appends semantic fill", () => {
  const policy = buildSemanticRetrievalPolicy({
    enabled: true,
    mode: SemanticRetrievalMode.ASSISTIVE,
    queryText: "cross retrieval",
    maxPerSource: 3
  });

  const reranked = rerankReferencesBySource({
    source: RetrievalSource.DECISION_LOG,
    structuredReferences: [{ id: "decision-structured", decision: "structured first" }],
    semanticReferences: [
      { id: "decision-semantic-1", decision: "semantic", semanticScore: 0.91 },
      { id: "decision-structured", decision: "duplicate", semanticScore: 0.99 }
    ],
    semanticPolicy: policy
  });

  assert.equal(reranked[0].id, "decision-structured");
  assert.equal(reranked.length, 2);
  assert.equal(reranked[1].retrievalSignal.type, "semantic_query");
});

test("retrieval quality metrics template includes precision and recall slots", () => {
  const template = buildRetrievalQualityMetricsTemplate({
    useCases: ["recall_context"]
  });

  assert.equal(template.length, 1);
  assert.equal(template[0].useCase, "recall_context");
  assert.equal(Object.hasOwn(template[0].precision, "at5"), true);
  assert.equal(Object.hasOwn(template[0].recall, "at10"), true);
});
