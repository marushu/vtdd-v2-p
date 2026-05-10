import test from "node:test";
import assert from "node:assert/strict";
import {
  MemoryRecordType,
  OPERATIONAL_MEMORY_STORAGE_CANDIDATES,
  OperationalMemoryLayer,
  OperationalMemorySignal,
  RuntimeMemoryTrigger,
  buildOperationalMemoryArchitecture,
  createInMemoryMemoryProvider,
  retrieveOperationalMemory,
  retrieveRuntimeTriggeredOperationalMemory
} from "../src/core/index.js";

test("operational memory architecture declares the four issue #249 layers and storage candidates", () => {
  const architecture = buildOperationalMemoryArchitecture();

  assert.equal(architecture.purpose, "persistent_operational_cognition");
  assert.deepEqual(
    architecture.layers.map((layer) => layer.layer),
    [
      OperationalMemoryLayer.IMMEDIATE_CONTEXT,
      OperationalMemoryLayer.ACTIVE_OPERATIONAL_MEMORY,
      OperationalMemoryLayer.LONG_TERM_OPERATIONAL_MEMORY,
      OperationalMemoryLayer.SEMANTIC_OPERATIONAL_PATTERNS
    ]
  );
  assert.deepEqual(architecture.storageCandidates, [...OPERATIONAL_MEMORY_STORAGE_CANDIDATES]);
  assert.equal(architecture.nonGoals.includes("generic_chatbot_memory"), true);
  assert.equal(architecture.nonGoals.includes("unrestricted_autonomous_execution"), true);
  assert.equal(architecture.nonGoals.includes("personality_simulation"), true);
  assert.equal(
    architecture.retrievalSignals.includes(OperationalMemorySignal.GOVERNANCE_IMPORTANCE),
    true
  );
  assert.equal(
    architecture.retrievalSignals.includes(OperationalMemorySignal.EMOTIONAL_INTENSITY),
    true
  );
});

test("operational memory returns compact ranked references instead of dumping all memory", async () => {
  const provider = createInMemoryMemoryProvider();
  await seedOperationalMemory(provider);

  const result = await retrieveOperationalMemory(provider, {
    text: "reviewer blocker recurrence policy",
    repository: "repo-b/vtdd",
    limit: 3,
    now: "2026-05-10T00:00:00.000Z",
    runtimeTruth: {
      currentState: "current branch has unresolved reviewer blocker",
      source: "github_app",
      checkedAt: "2026-05-10T01:00:00Z"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.runtimeTruth.overridesMemory, true);
  assert.equal(result.memoryUseRule, "runtime_truth_current_state_overrides_memory_background_reference");
  assert.equal(result.compactContext.length, 3);
  assert.equal(result.retrievalSignals.dumpedAllMemory, false);
  assert.equal(result.compactContext[0].id, "decision-reviewer-policy");
  assert.equal(result.compactContext[0].scoreSignals.governanceImportance > 0, true);
  assert.equal(result.compactContext[0].scoreSignals.recurrence > 0, true);
});

test("operational memory can surface cross-repository experience for a different repository", async () => {
  const provider = createInMemoryMemoryProvider();
  await seedOperationalMemory(provider);

  const result = await retrieveOperationalMemory(provider, {
    text: "cloudflare deploy blocker",
    repository: "repo-b/vtdd",
    limit: 5,
    now: "2026-05-10T00:00:00.000Z"
  });

  assert.equal(result.ok, true);
  const crossRepoReference = result.compactContext.find((item) => item.id === "repair-repo-a-deploy");
  assert.equal(crossRepoReference.repository, "repo-a/vtdd");
  assert.equal(crossRepoReference.crossRepository, true);
  assert.equal(crossRepoReference.layer, OperationalMemoryLayer.LONG_TERM_OPERATIONAL_MEMORY);
});

test("default operational memory retrieval preserves relevance-heavy ranking score", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "direct-query-match",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "Branch collision remediation must stay visible for branch collision queries"
    },
    metadata: {
      repository: "repo-a/vtdd"
    },
    priority: 50,
    tags: ["decision_log"],
    createdAt: "2026-05-10T00:00:00Z"
  });

  const result = await retrieveOperationalMemory(provider, {
    text: "branch collision",
    repository: "repo-b/vtdd",
    limit: 1,
    now: "2026-05-10T00:00:00.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.compactContext[0].id, "direct-query-match");
  assert.equal(result.compactContext[0].rankingMode, "default");
  assert.equal(result.compactContext[0].scoreSignals.relevance, 100);
  assert.equal(result.compactContext[0].scoreSignals.similarity, 100);
  assert.equal(result.compactContext[0].score, 67);
});

test("operational memory rejects missing providers with a retrieval-safe error", async () => {
  const result = await retrieveOperationalMemory(null, {
    text: "anything"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.error, "memory_provider_unavailable");
});

test("runtime-triggered retrieval integrates PR conflict memory into Butler proposal context", async () => {
  const provider = createInMemoryMemoryProvider();
  await seedRuntimeTriggeredMemory(provider);

  const result = await retrieveRuntimeTriggeredOperationalMemory(provider, {
    trigger: RuntimeMemoryTrigger.PR,
    repository: "repo-b/vtdd",
    limit: 4,
    now: "2026-05-10T00:00:00.000Z",
    runtimeTruth: {
      trigger: RuntimeMemoryTrigger.PR,
      currentState: "PR conflict detected on active branch after branch collision",
      repository: "repo-b/vtdd",
      source: "github_app",
      checkedAt: "2026-05-10T00:01:00Z"
    },
    context: {
      prNumber: 251,
      blocker: "merge conflict"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.trigger, RuntimeMemoryTrigger.PR);
  assert.equal(result.runtimeTruth.overridesMemory, true);
  assert.equal(result.compactContext[0].id, "repair-branch-collision");
  assert.equal(result.compactContext[0].rankingMode, "runtime_triggered");
  assert.equal(result.compactContext[0].crossRepository, true);
  assert.equal(result.recurringPain.detected, true);
  assert.equal(result.proposalIntegration.remediationProposal.recommended, true);
  assert.equal(result.proposalIntegration.issueProposal.recommended, true);
  assert.equal(result.proposalIntegration.prioritization.priority, "high");
  assert.equal(
    result.proposalIntegration.orchestrationSuggestion.crossRepositoryLearningApplied,
    true
  );
});

test("runtime-triggered retrieval detects notification failures as proactive operator telemetry pain", async () => {
  const provider = createInMemoryMemoryProvider();
  await seedRuntimeTriggeredMemory(provider);

  const result = await retrieveRuntimeTriggeredOperationalMemory(provider, {
    trigger: RuntimeMemoryTrigger.ORCHESTRATION_ANOMALY,
    repository: "repo-b/vtdd",
    limit: 4,
    now: "2026-05-10T00:00:00.000Z",
    runtimeTruth: {
      trigger: RuntimeMemoryTrigger.ORCHESTRATION_ANOMALY,
      currentState: "notification failure left owner unaware of execution progress",
      repository: "repo-b/vtdd",
      source: "butler_runtime",
      checkedAt: "2026-05-10T00:01:00Z"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.compactContext[0].id, "temperature-notification-failure");
  assert.equal(result.recurringPain.detected, true);
  assert.equal(
    result.recurringPain.references.some((reference) => reference.id === "temperature-notification-failure"),
    true
  );
  assert.equal(result.proposalIntegration.issueProposal.recommended, true);
  assert.equal(
    result.proposalIntegration.orchestrationSuggestion.action,
    "surface_runtime_truth_with_ranked_memory_before_execution_or_review_response"
  );
});

test("operational memory retrieves structured record families concurrently", async () => {
  const calls = [];
  let activeCalls = 0;
  let maxActiveCalls = 0;
  const provider = {
    async store() {
      return { ok: true };
    },
    async retrieve(filter) {
      calls.push(filter.type);
      activeCalls += 1;
      maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeCalls -= 1;
      return [];
    },
    async query() {
      return [];
    },
    async validateRecord() {
      return { ok: true };
    }
  };

  const result = await retrieveOperationalMemory(provider, {
    text: "reviewer blocker",
    limit: 2,
    now: "2026-05-10T00:00:00.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length >= 4, true);
  assert.equal(maxActiveCalls > 1, true);
});

test("operational memory deduplicates semantic and structured records without stringifying records", async () => {
  const circularRecord = {
    id: "same-record",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "Reviewer blocker policy must remain visible",
      recurrenceCount: 2
    },
    metadata: {
      repository: "repo-a/vtdd"
    },
    priority: 90,
    tags: ["decision_log", "reviewer", "blocker", "policy"],
    createdAt: "2026-05-01T00:00:00Z"
  };
  circularRecord.self = circularRecord;
  const provider = {
    async store() {
      return { ok: true };
    },
    async retrieve(filter) {
      return filter.type === MemoryRecordType.DECISION_LOG ? [circularRecord] : [];
    },
    async query() {
      return [circularRecord];
    },
    async validateRecord() {
      return { ok: true };
    }
  };

  const result = await retrieveOperationalMemory(provider, {
    text: "reviewer blocker policy",
    limit: 5,
    now: "2026-05-10T00:00:00.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.compactContext.filter((item) => item.id === "same-record").length, 1);
});

async function seedOperationalMemory(provider) {
  await provider.store({
    id: "decision-reviewer-policy",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "Reviewer blocker recurrence must stop PR completion claims",
      rationale: "Repeated reviewer objections require policy-first resolution before merge claims.",
      recurrenceCount: 4
    },
    metadata: {
      repository: "repo-a/vtdd",
      recurrenceCount: 4
    },
    priority: 96,
    tags: ["decision_log", "reviewer", "blocker", "policy", "recurring"],
    createdAt: "2026-05-01T00:00:00Z"
  });

  await provider.store({
    id: "repair-repo-a-deploy",
    type: MemoryRecordType.REPAIR_CASE,
    content: {
      failurePattern: "Cloudflare deploy blocker caused by missing runtime truth check",
      remediation: "Check live runtime truth before using memory to propose deploy next steps."
    },
    metadata: {
      repository: "repo-a/vtdd",
      recurrenceCount: 2
    },
    priority: 84,
    tags: ["repair_case", "cloudflare", "deploy", "blocker", "recurring"],
    createdAt: "2026-04-20T00:00:00Z"
  });

  await provider.store({
    id: "working-current-review",
    type: MemoryRecordType.WORKING_MEMORY,
    content: {
      note: "Current reviewer loop needs a concise blocker summary."
    },
    metadata: {
      repository: "repo-b/vtdd"
    },
    priority: 70,
    tags: ["working_memory", "reviewer"],
    createdAt: "2026-05-09T00:00:00Z"
  });

  await provider.store({
    id: "proposal-small",
    type: MemoryRecordType.PROPOSAL_LOG,
    content: {
      hypothesis: "Proposal quality improves when historical blockers are retrieved before options."
    },
    metadata: {
      repository: "repo-c/vtdd"
    },
    priority: 65,
    tags: ["proposal_log", "proposal"],
    createdAt: "2026-05-08T00:00:00Z"
  });
}

async function seedRuntimeTriggeredMemory(provider) {
  await provider.store({
    id: "repair-branch-collision",
    type: MemoryRecordType.REPAIR_CASE,
    content: {
      failurePattern: "Branch collision caused PR conflict and orchestration failure",
      remediation: "Pause merge claims, rebase the active topic branch, and propose a branch-collision issue.",
      recurrenceCount: 3,
      operationalImpact: 92,
      emotionalIntensity: 74
    },
    metadata: {
      repository: "repo-a/vtdd",
      recurrenceCount: 3,
      operationalImpact: 92,
      emotionalIntensity: 74
    },
    priority: 90,
    tags: [
      "repair_case",
      "pr",
      "conflict",
      "branch",
      "collision",
      "orchestration",
      "recurring",
      "operator_pain"
    ],
    createdAt: "2026-05-01T00:00:00Z"
  });

  await provider.store({
    id: "temperature-notification-failure",
    type: MemoryRecordType.TEMPERATURE_NOTE,
    content: {
      summary: "Owner frustration increased when Butler failed to notify execution progress.",
      remediation: "Treat missing notification as an operator telemetry gap and propose proactive status updates.",
      recurrenceCount: 4,
      operationalImpact: 86,
      emotionalIntensity: 95
    },
    metadata: {
      repository: "repo-a/vtdd",
      recurrenceCount: 4,
      operationalImpact: 86,
      emotionalIntensity: 95
    },
    priority: 88,
    tags: [
      "temperature_note",
      "notification",
      "failure",
      "telemetry",
      "frustration",
      "recurring_pain"
    ],
    createdAt: "2026-05-02T00:00:00Z"
  });

  await provider.store({
    id: "proposal-low-similarity",
    type: MemoryRecordType.PROPOSAL_LOG,
    content: {
      hypothesis: "Unrelated proposal should not outrank runtime-triggered operational pain.",
      relatedIssue: 12
    },
    metadata: {
      repository: "repo-b/vtdd"
    },
    priority: 55,
    tags: ["proposal_log"],
    createdAt: "2026-05-09T00:00:00Z"
  });
}
