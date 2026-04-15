import test from "node:test";
import assert from "node:assert/strict";
import {
  createDecisionLogEntry,
  createInMemoryLogStore,
  createProposalLogEntry
} from "../src/core/index.js";

test("createDecisionLogEntry validates required fields", () => {
  const result = createDecisionLogEntry({
    decision: "Use runtime stale guard",
    rationale: "Avoid outdated runtime assumptions",
    relatedIssue: 10,
    decidedBy: "butler",
    timestamp: "2026-04-15T10:00:00Z"
  });
  assert.equal(result.ok, true);
  assert.equal(result.entry.relatedIssue, 10);
});

test("createProposalLogEntry requires options", () => {
  const result = createProposalLogEntry({
    hypothesis: "Need onboarding recall",
    options: [],
    proposedBy: "butler",
    timestamp: "2026-04-15T10:00:00Z"
  });
  assert.equal(result.ok, false);
  assert.equal(result.issues.includes("options must be a non-empty array"), true);
});

test("log store appends and filters decisions", () => {
  const store = createInMemoryLogStore();
  const one = store.appendDecision({
    decision: "Adopt consent categories",
    rationale: "Separate permission domains",
    relatedIssue: 9,
    decidedBy: "executor",
    timestamp: "2026-04-15T10:00:00Z"
  });
  const two = store.appendDecision({
    decision: "Use setup wizard output contract",
    rationale: "Clarify target outputs",
    relatedIssue: 13,
    decidedBy: "executor",
    timestamp: "2026-04-15T10:01:00Z"
  });
  assert.equal(one.ok, true);
  assert.equal(two.ok, true);
  assert.equal(store.listDecisions().length, 2);
  assert.equal(store.listDecisions({ relatedIssue: 9 }).length, 1);
});

test("log store appends proposal and supersedes decision", () => {
  const store = createInMemoryLogStore();
  const decision = store.appendDecision({
    decision: "Initial retrieval order",
    rationale: "Prioritize issue and constitution",
    relatedIssue: 19,
    decidedBy: "butler",
    timestamp: "2026-04-15T10:00:00Z"
  });
  const proposal = store.appendProposal({
    hypothesis: "Need cross-issue memory index",
    options: ["vector index", "keyword index"],
    rejectedReasons: [{ option: "keyword index", reason: "low semantic recall" }],
    concerns: ["cost"],
    unresolvedQuestions: ["hybrid weighting"],
    relatedIssue: 19,
    proposedBy: "butler",
    timestamp: "2026-04-15T10:02:00Z"
  });
  assert.equal(proposal.ok, true);
  assert.equal(store.listProposals({ relatedIssue: 19 }).length, 1);

  const supersede = store.supersedeDecision({
    id: decision.entry.id,
    supersededBy: "decision_9999"
  });
  assert.equal(supersede.ok, true);
  assert.equal(supersede.entry.supersededBy, "decision_9999");
});
