import test from "node:test";
import assert from "node:assert/strict";
import {
  RetrievalSource,
  buildRetrievalPlan,
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
