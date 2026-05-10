export const ButlerOperationalResponsibility = Object.freeze({
  BLOCKER_DETECTION: "blocker_detection",
  ISSUE_PROPOSAL: "issue_proposal",
  REMEDIATION_PLANNING: "remediation_planning",
  DEPENDENCY_TRACKING: "dependency_tracking",
  ORCHESTRATION: "orchestration",
  OPERATIONAL_TELEMETRY: "operational_telemetry",
  PRIORITY_SUGGESTION: "priority_suggestion",
  EXECUTION_MONITORING: "execution_monitoring",
  RECURRING_PAIN_DETECTION: "recurring_pain_detection",
  RUNTIME_TRUTH_OBSERVATION: "runtime_truth_observation"
});

export const HumanOperationalResponsibility = Object.freeze({
  INTENT: "intent",
  STRATEGIC_DIRECTION: "strategic_direction",
  APPROVAL: "approval",
  GOVERNANCE_BOUNDARIES: "governance_boundaries",
  FINAL_DECISION: "final_decision"
});

const ISSUE_253 = 253;

export function buildOwnerCognitiveLoadProtectionModel(input = {}) {
  const batchPlan = normalizeObject(input.batchPlan);
  const batchMonitor = normalizeObject(input.batchMonitor);
  const operationalMemory = normalizeObject(input.operationalMemory);
  const runtimeTruth = normalizeObject(input.runtimeTruth);
  const issueProposals = normalizeIssueProposals(input.issueProposals);
  const recurringPainSignals = normalizeRecurringPainSignals(
    input.recurringPainSignals ?? operationalMemory.compactContext
  );

  const blockers = collectBlockers({ batchMonitor, runtimeTruth });
  const dependencies = collectDependencies(batchPlan);
  const prioritySuggestions = collectPrioritySuggestions(batchPlan);
  const remediationPlan = buildRemediationPlan({ blockers, recurringPainSignals, issueProposals });
  const executionMonitoring = buildExecutionMonitoring(batchMonitor);
  const runtimeTruthObservation = buildRuntimeTruthObservation(runtimeTruth);
  const ownerDecisionQueue = buildOwnerDecisionQueue({
    blockers,
    prioritySuggestions,
    issueProposals,
    remediationPlan,
    runtimeTruthObservation
  });

  return {
    ok: true,
    issueNumber: ISSUE_253,
    source: "issue_253_owner_cognitive_load_protection",
    operationalPrinciple: {
      butler: ["detect", "organize", "explain", "propose", "prioritize", "monitor", "report"],
      human: ["decide", "approve", "redirect"]
    },
    butlerResponsibilities: Object.values(ButlerOperationalResponsibility),
    humanResponsibilities: Object.values(HumanOperationalResponsibility),
    ownerCognitiveLoadProtections: [
      "repeated_explanation_burden_reduced_by_retrieving_operational_memory",
      "operational_interruption_reduced_by_grouping_blockers_and_decisions",
      "manual_orchestration_reduced_by_batch_plan_and_execution_monitoring",
      "reminder_burden_reduced_by_runtime_truth_and_recurring_pain_tracking",
      "context_reconstruction_reduced_by_compact_operational_counterpart_report"
    ],
    butlerWork: {
      blockerDetection: blockers,
      issueProposal: issueProposals,
      remediationPlanning: remediationPlan,
      dependencyTracking: dependencies,
      orchestration: buildOrchestration(batchPlan),
      operationalTelemetry: normalizeObject(input.operationalTelemetry ?? batchMonitor.summary),
      prioritySuggestion: prioritySuggestions,
      executionMonitoring,
      recurringPainDetection: recurringPainSignals,
      runtimeTruthObservation
    },
    ownerFacingReport: {
      status: classifyOwnerFacingStatus({ blockers, runtimeTruthObservation }),
      summary: buildOwnerFacingSummary({ blockers, prioritySuggestions, issueProposals, runtimeTruthObservation }),
      decisionQueue: ownerDecisionQueue,
      hiddenOperationalWorkCount: countHiddenOperationalWork({
        blockers,
        dependencies,
        prioritySuggestions,
        issueProposals,
        remediationPlan,
        executionMonitoring,
        recurringPainSignals
      }),
      asksOwnerToManageOperations: false
    },
    boundaries: {
      readOnly: true,
      requiresHumanGoForExecution: true,
      requiresPasskeyForHighRiskExternalEffects: true,
      doesNotMergeDeployCloseIssuesOrMutateInfrastructure: true
    }
  };
}

function collectBlockers(input = {}) {
  const issues = Array.isArray(input.batchMonitor?.issues) ? input.batchMonitor.issues : [];
  const monitoredBlockers = issues
    .filter((issue) => issue?.blocker)
    .map((issue) => ({
      issueNumber: normalizePositiveInteger(issue.issueNumber),
      title: normalizeText(issue.title) || null,
      source: "execution_monitoring",
      blocker: issue.blocker,
      nextButlerAction: "explain_blocker_and_propose_remediation"
    }));

  const runtimeBlockers = normalizeBlockerList(input.runtimeTruth?.blockers).map((blocker) => ({
    issueNumber: normalizePositiveInteger(blocker.issueNumber),
    title: normalizeText(blocker.title) || null,
    source: "runtime_truth",
    blocker: blocker.blocker ?? blocker,
    nextButlerAction: "track_runtime_truth_until_cleared"
  }));

  return [...monitoredBlockers, ...runtimeBlockers];
}

function collectDependencies(batchPlan = {}) {
  const waitingQueue = Array.isArray(batchPlan.waitingQueue) ? batchPlan.waitingQueue : [];
  return waitingQueue
    .filter((issue) => normalizeText(issue.disposition) === "waiting_dependency" || issue.dependencies?.length > 0)
    .map((issue) => ({
      issueNumber: normalizePositiveInteger(issue.issueNumber),
      title: normalizeText(issue.title) || null,
      dependencies: normalizeIssueNumbers(issue.dependencies),
      reason: normalizeText(issue.reason) || null,
      nextButlerAction: "keep_dependency_order_visible_without_owner_reconstruction"
    }));
}

function collectPrioritySuggestions(batchPlan = {}) {
  const proposedBatch = Array.isArray(batchPlan.proposedBatch) ? batchPlan.proposedBatch : [];
  return proposedBatch.map((issue, index) => ({
    rank: index + 1,
    issueNumber: normalizePositiveInteger(issue.issueNumber),
    title: normalizeText(issue.title) || null,
    reason: normalizeText(issue.reason) || "safe to run in the current batch",
    conflictRisk: normalizeText(issue.conflictRisk) || null,
    ownerAction: "approve_or_redirect"
  }));
}

function buildRemediationPlan(input = {}) {
  const blockerRemediations = input.blockers.map((blocker) => ({
    type: "blocker_remediation",
    issueNumber: blocker.issueNumber,
    trigger: blocker.blocker?.error ?? blocker.blocker?.reason ?? "blocked_execution",
    proposedByButler: true,
    ownerAction: "decide_or_approve"
  }));

  const recurringPainRemediations = input.recurringPainSignals.map((signal) => ({
    type: "recurring_pain_remediation",
    sourceId: signal.id,
    trigger: signal.title || signal.summary || "recurring_operational_pain",
    proposedByButler: true,
    ownerAction: "decide_or_approve"
  }));

  const issueProposalRemediations = input.issueProposals.map((proposal) => ({
    type: "issue_proposal",
    title: proposal.title,
    relatedIssue: proposal.relatedIssue,
    proposedByButler: true,
    ownerAction: "approve_redirect_or_reject"
  }));

  return [...blockerRemediations, ...recurringPainRemediations, ...issueProposalRemediations];
}

function buildExecutionMonitoring(batchMonitor = {}) {
  const summary = normalizeObject(batchMonitor.summary);
  const issues = Array.isArray(batchMonitor.issues) ? batchMonitor.issues : [];
  return {
    summary,
    trackedIssueCount: issues.length,
    blockedIssues: issues
      .filter((issue) => normalizeText(issue.stage) === "blocked" || issue.blocker)
      .map((issue) => normalizePositiveInteger(issue.issueNumber))
      .filter(Boolean),
    mergeReadyIssues: issues
      .filter((issue) => normalizeText(issue.stage) === "merge_ready")
      .map((issue) => normalizePositiveInteger(issue.issueNumber))
      .filter(Boolean),
    mergeReadyIsNotMergeAuthorization: true
  };
}

function buildRuntimeTruthObservation(runtimeTruth = {}) {
  const checkedAt = normalizeText(runtimeTruth.checkedAt ?? runtimeTruth.checked_at);
  const source = normalizeText(runtimeTruth.source);
  const observed = runtimeTruth.observed === true || Boolean(checkedAt || source || runtimeTruth.currentState);
  return {
    observed,
    source: source || null,
    checkedAt: checkedAt || null,
    currentState: normalizeText(runtimeTruth.currentState ?? runtimeTruth.current_state) || null,
    overridesMemory: runtimeTruth.overridesMemory !== false,
    missingObservationBlocker: observed ? null : "runtime_truth_observation_required_before_execution_claims"
  };
}

function buildOrchestration(batchPlan = {}) {
  const mergeOrder = Array.isArray(batchPlan.mergeOrder) ? batchPlan.mergeOrder : [];
  return {
    source: normalizeText(batchPlan.source) || null,
    proposedBatchIssueNumbers: Array.isArray(batchPlan.proposedBatch)
      ? batchPlan.proposedBatch.map((issue) => normalizePositiveInteger(issue.issueNumber)).filter(Boolean)
      : [],
    waitingIssueNumbers: Array.isArray(batchPlan.waitingQueue)
      ? batchPlan.waitingQueue.map((issue) => normalizePositiveInteger(issue.issueNumber)).filter(Boolean)
      : [],
    mergeOrderIssueNumbers: mergeOrder.map((issue) => normalizePositiveInteger(issue.issueNumber)).filter(Boolean),
    mergeOrderIsNotMergeAuthorization: true
  };
}

function buildOwnerDecisionQueue(input = {}) {
  const decisions = [];
  if (input.runtimeTruthObservation.missingObservationBlocker) {
    decisions.push({
      kind: "redirect",
      prompt: "runtime truth is missing; approve a read-side observation before execution claims",
      operationalDetailsHandledByButler: true
    });
  }
  for (const blocker of input.blockers) {
    decisions.push({
      kind: "direction",
      issueNumber: blocker.issueNumber,
      prompt: "choose whether Butler should draft or execute the proposed blocker remediation",
      operationalDetailsHandledByButler: true
    });
  }
  for (const suggestion of input.prioritySuggestions) {
    decisions.push({
      kind: "approval",
      issueNumber: suggestion.issueNumber,
      prompt: "approve or redirect the proposed priority",
      operationalDetailsHandledByButler: true
    });
  }
  for (const proposal of input.issueProposals) {
    decisions.push({
      kind: "approval",
      prompt: `approve, redirect, or reject issue proposal: ${proposal.title}`,
      operationalDetailsHandledByButler: true
    });
  }
  return decisions;
}

function buildOwnerFacingSummary(input = {}) {
  if (input.runtimeTruthObservation.missingObservationBlocker) {
    return "Runtime truth is missing, so Butler should observe current state before asking the owner for execution decisions.";
  }
  if (input.blockers.length > 0) {
    return `Butler found ${input.blockers.length} blocker(s) and should handle remediation tracking before asking for final approval.`;
  }
  if (input.prioritySuggestions.length > 0) {
    return `Butler proposes ${input.prioritySuggestions.length} prioritized issue(s) for owner approval or redirect.`;
  }
  if (input.issueProposals.length > 0) {
    return `Butler drafted ${input.issueProposals.length} issue proposal(s) for owner approval.`;
  }
  return "No operational blocker is visible; Butler should keep monitoring and report only material decisions.";
}

function classifyOwnerFacingStatus(input = {}) {
  if (input.runtimeTruthObservation.missingObservationBlocker) {
    return "needs_runtime_truth_observation";
  }
  if (input.blockers.length > 0) {
    return "butler_tracking_blockers";
  }
  return "ready_for_owner_decision";
}

function countHiddenOperationalWork(input = {}) {
  return [
    input.blockers,
    input.dependencies,
    input.prioritySuggestions,
    input.issueProposals,
    input.remediationPlan,
    input.recurringPainSignals
  ].reduce((total, list) => total + (Array.isArray(list) ? list.length : 0), 0) +
    Number(input.executionMonitoring?.trackedIssueCount ?? 0);
}

function normalizeIssueProposals(value) {
  return (Array.isArray(value) ? value : [])
    .map((proposal) => ({
      title: normalizeText(proposal?.title),
      body: normalizeText(proposal?.body) || null,
      relatedIssue: normalizePositiveInteger(proposal?.relatedIssue ?? proposal?.related_issue),
      priority: normalizeText(proposal?.priority) || null
    }))
    .filter((proposal) => proposal.title);
}

function normalizeRecurringPainSignals(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => {
      const tags = Array.isArray(item?.tags) ? item.tags.map((tag) => normalizeText(tag).toLowerCase()) : [];
      return tags.includes("recurring") || Number(item?.scoreSignals?.recurrence ?? 0) > 0;
    })
    .map((item) => ({
      id: normalizeText(item?.id) || null,
      title: normalizeText(item?.title) || null,
      summary: normalizeText(item?.summary) || null,
      tags: Array.isArray(item?.tags) ? item.tags.map(normalizeText).filter(Boolean) : [],
      nextButlerAction: "propose_remediation_without_owner_reexplaining_the_pattern"
    }));
}

function normalizeBlockerList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeIssueNumbers(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizePositiveInteger(item))
    .filter(Boolean);
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
