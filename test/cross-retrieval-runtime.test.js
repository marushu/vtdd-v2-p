import test from "node:test";
import assert from "node:assert/strict";
import {
  MemoryRecordType,
  RetrievalSource,
  createInMemoryMemoryProvider,
  retrieveCrossIssueMemoryIndex
} from "../src/core/index.js";

test("cross retrieval returns ordered references with issue as primary in execution phase", async () => {
  const provider = createInMemoryMemoryProvider();
  await seedCrossRetrievalRecords(provider);

  const result = await retrieveCrossIssueMemoryIndex(provider, {
    phase: "execution",
    limit: 10,
    relatedIssue: 17,
    issueContext: {
      issueNumber: 17,
      issueTitle: "spec: Decision Log runtime connection"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.retrievalPlan.sources[0], RetrievalSource.ISSUE);
  assert.equal(result.primaryReference.source, RetrievalSource.ISSUE);
  assert.equal(result.referencesBySource.issue[0].issueNumber, 17);
  assert.equal(result.referencesBySource.decision_log.length > 0, true);
  assert.equal(result.referencesBySource.proposal_log.length > 0, true);
  assert.equal(result.referencesBySource.pr_context.length > 0, true);
});

test("cross retrieval returns provider_unavailable when provider is missing", async () => {
  const result = await retrieveCrossIssueMemoryIndex(null, {
    phase: "execution",
    relatedIssue: 17
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.error, "memory_provider_unavailable");
});

async function seedCrossRetrievalRecords(provider) {
  await provider.store({
    id: "constitution-1",
    type: MemoryRecordType.CONSTITUTION,
    content: {
      title: "runtime_truth_over_memory",
      description: "Runtime truth must precede memory references."
    },
    metadata: { version: "v2" },
    priority: 90,
    tags: ["constitution"],
    createdAt: "2026-04-16T10:00:00Z"
  });

  await provider.store({
    id: "decision-17-1",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "Decision log must be retrieval-ready",
      rationale: "Butler should answer why",
      relatedIssue: 17,
      decidedBy: "owner",
      timestamp: "2026-04-16T10:10:00Z",
      supersededBy: null
    },
    metadata: {
      repository: "sample-org/vtdd-v2"
    },
    priority: 95,
    tags: ["decision_log", "issue:17"],
    createdAt: "2026-04-16T10:10:00Z"
  });

  await provider.store({
    id: "proposal-17-1",
    type: MemoryRecordType.PROPOSAL_LOG,
    content: {
      hypothesis: "Cross retrieval route will reduce repeated explanation",
      options: ["route only", "route + orchestration integration"],
      rejectedReasons: [{ option: "route only", reason: "insufficient for PR context" }],
      concerns: ["retrieval ordering drift"],
      unresolvedQuestions: ["how to expose issue context from UI"],
      relatedIssue: 17,
      proposedBy: "owner",
      timestamp: "2026-04-16T10:20:00Z"
    },
    metadata: {
      repository: "sample-org/vtdd-v2"
    },
    priority: 85,
    tags: ["proposal_log", "issue:17"],
    createdAt: "2026-04-16T10:20:00Z"
  });

  await provider.store({
    id: "execution-pr-88",
    type: MemoryRecordType.EXECUTION_LOG,
    content: {
      summary: "PR #88 review requested changes before merge",
      relatedIssue: 17,
      prNumber: 88,
      reviewer: "gemini",
      status: "changes_requested"
    },
    metadata: {
      kind: "pr_review_summary",
      repository: "sample-org/vtdd-v2"
    },
    priority: 82,
    tags: ["execution", "pr_context", "pr:88", "issue:17"],
    createdAt: "2026-04-16T10:30:00Z"
  });
}
