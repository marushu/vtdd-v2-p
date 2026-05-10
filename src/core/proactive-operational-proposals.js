export const ProactiveDetectionTarget = Object.freeze({
  OPERATIONAL_GAP: "operational_gap",
  RECURRING_PAIN: "recurring_pain",
  GOVERNANCE_PROBLEM: "governance_problem",
  CAPABILITY_GAP: "capability_gap"
});

export const ProactiveProposalStage = Object.freeze({
  DETECT: "detect",
  EXPLAIN: "explain",
  PROPOSE: "propose",
  PRIORITIZE: "prioritize",
  ASK_FOR_GO: "ask_for_go"
});

const TARGET_RULES = Object.freeze([
  {
    target: ProactiveDetectionTarget.OPERATIONAL_GAP,
    patterns: [
      /missing runtime truth/i,
      /runtime truth/i,
      /orchestration instability/i,
      /notification visibility/i,
      /proposal failure/i,
      /telemetry gap/i
    ],
    defaultTitle: "architecture: close operational runtime gap",
    defaultRemediation:
      "Add a bounded runtime truth or telemetry surface that lets Butler detect the gap before asking the owner to diagnose it."
  },
  {
    target: ProactiveDetectionTarget.RECURRING_PAIN,
    patterns: [
      /repeated blocker/i,
      /recurring/i,
      /manual intervention/i,
      /ci failure/i,
      /flaky/i,
      /blocked repeatedly/i
    ],
    defaultTitle: "operations: reduce recurring manual intervention",
    defaultRemediation:
      "Capture the repeated blocker as structured operational memory and add a narrow detection path that proposes a repeatable remediation."
  },
  {
    target: ProactiveDetectionTarget.GOVERNANCE_PROBLEM,
    patterns: [
      /hidden execution/i,
      /authority boundary/i,
      /approval flow/i,
      /go \+ passkey/i,
      /permission/i,
      /secret/i,
      /bypass/i
    ],
    defaultTitle: "governance: make approval boundary explicit",
    defaultRemediation:
      "Make the approval boundary user-visible and block execution until the required GO or GO + passkey condition is present."
  },
  {
    target: ProactiveDetectionTarget.CAPABILITY_GAP,
    patterns: [
      /owner-equivalent/i,
      /capability missing/i,
      /github ui fallback/i,
      /missing capability/i,
      /fallback requirement/i,
      /not supported/i
    ],
    defaultTitle: "capability: add missing operational capability",
    defaultRemediation:
      "Define the missing capability, fallback path, and approval boundary before connecting it to execution."
  }
]);

const PRIORITY_WEIGHTS = Object.freeze({
  blockerSeverity: 30,
  operationalImpact: 20,
  dependencyChains: 15,
  ownerCognitiveLoad: 15,
  recurrenceFrequency: 12,
  governanceImportance: 8
});

export function buildProactiveOperationalProposals(input = {}) {
  const signals = normalizeSignals(input);
  const memoryReferences = normalizeMemoryReferences(input.operationalMemory?.compactContext ?? input.memoryReferences);
  const existingIssues = normalizeExistingIssues(input.openIssues ?? input.githubRuntimeTruth?.openIssues);
  const detected = signals
    .map((signal) =>
      buildDetectedOpportunity(signal, {
        memoryReferences,
        existingIssues,
        repository: normalizeText(input.repository ?? input.githubRuntimeTruth?.repository)
      })
    )
    .filter(Boolean)
    .sort(compareDetectedOpportunities);

  return {
    ok: true,
    repository: normalizeText(input.repository ?? input.githubRuntimeTruth?.repository) || null,
    model: [
      ProactiveProposalStage.DETECT,
      ProactiveProposalStage.EXPLAIN,
      ProactiveProposalStage.PROPOSE,
      ProactiveProposalStage.PRIORITIZE,
      ProactiveProposalStage.ASK_FOR_GO
    ],
    governanceBoundary: {
      may: ["detect", "explain", "propose", "prioritize"],
      mustNot: ["silently_execute_high_risk_actions", "bypass_approval_boundaries"],
      execution: "approval_bound"
    },
    proposals: detected,
    priorityModel: { ...PRIORITY_WEIGHTS },
    summary: {
      signalCount: signals.length,
      proposalCount: detected.length,
      recurringPainCount: detected.filter((item) => item.target === ProactiveDetectionTarget.RECURRING_PAIN).length,
      governanceProblemCount: detected.filter((item) => item.target === ProactiveDetectionTarget.GOVERNANCE_PROBLEM).length,
      asksForGo: detected.every((item) => item.askForGO.required === true),
      executes: false
    }
  };
}

function buildDetectedOpportunity(signal, context) {
  const targetRule = classifyTarget(signal);
  if (!targetRule) {
    return null;
  }

  const title = normalizeText(signal.title) || targetRule.defaultTitle;
  const explanation = buildExplanation(signal, targetRule, context.memoryReferences);
  const priority = scorePriority(signal, targetRule, context);
  const relatedMemory = selectRelatedMemory(signal, context.memoryReferences, 3);
  const duplicateCandidates = findDuplicateCandidates(signal, context.existingIssues);

  return {
    id: normalizeText(signal.id) || makeStableId(targetRule.target, title),
    target: targetRule.target,
    detectedFrom: normalizeText(signal.source) || "runtime_or_memory_signal",
    title,
    explanation,
    rootCauseHypothesis: normalizeText(signal.rootCause) || inferRootCause(signal, targetRule),
    evidence: normalizeEvidence(signal),
    recurrence: normalizeCount(signal.recurrenceCount ?? signal.recurrence),
    relatedMemory,
    duplicateCandidates,
    remediationPlan: buildRemediationPlan(signal, targetRule, relatedMemory),
    issueDraft: buildIssueDraft({ signal, targetRule, title, explanation, priority, relatedMemory }),
    executionPlan: buildExecutionPlan(signal, targetRule),
    boundedImplementationSlices: buildBoundedSlices(signal, targetRule),
    priority,
    dependencyOrdering: buildDependencyOrdering(signal, targetRule),
    askForGO: {
      required: true,
      prompt:
        "この issue draft / remediation plan で GitHub Issue 化または実装着手するなら GO と言ってください。",
      approvalBoundary: "proposal_only_until_human_go"
    }
  };
}

function classifyTarget(signal) {
  const target = normalizeText(signal.target ?? signal.kind ?? signal.category);
  const searchable = `${signal.title ?? ""}\n${signal.description ?? ""}\n${signal.summary ?? ""}\n${signal.rootCause ?? ""}\n${normalizeArray(signal.tags).join(" ")}`;
  const recurrence = normalizeCount(signal.recurrenceCount ?? signal.recurrence);

  const explicit = TARGET_RULES.find((rule) => rule.target === target);
  if (explicit) {
    return explicit;
  }

  const patternMatch = TARGET_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(searchable)));
  if (patternMatch) {
    return patternMatch;
  }

  if (recurrence > 1) {
    return TARGET_RULES.find((rule) => rule.target === ProactiveDetectionTarget.RECURRING_PAIN);
  }

  return null;
}

function buildExplanation(signal, targetRule, memoryReferences) {
  const description = normalizeText(signal.description ?? signal.summary);
  const recurrence = normalizeCount(signal.recurrenceCount ?? signal.recurrence);
  const related = selectRelatedMemory(signal, memoryReferences, 2);
  const parts = [
    description || `Butler detected a ${targetRule.target.replaceAll("_", " ")} signal.`,
    recurrence > 1 ? `This appears recurring (${recurrence} observed signals).` : "",
    related.length > 0
      ? `Historical memory adds context from ${related.map((item) => item.id || item.title).join(", ")}.`
      : ""
  ].filter(Boolean);
  return parts.join(" ");
}

function scorePriority(signal, targetRule, context) {
  const recurrence = normalizeCount(signal.recurrenceCount ?? signal.recurrence);
  const dependencies = normalizeArray(signal.dependencies);
  const duplicateCandidates = findDuplicateCandidates(signal, context.existingIssues);
  const factorScores = {
    blockerSeverity: scoreFromTerms(signal, ["blocker", "blocked", "cannot", "failing", "failure"], 100, 35),
    operationalImpact: scoreFromTerms(signal, ["runtime", "orchestration", "notification", "telemetry", "proposal"], 90, 45),
    dependencyChains: Math.min(100, dependencies.length * 30 + duplicateCandidates.length * 15),
    ownerCognitiveLoad: scoreFromTerms(signal, ["manual", "owner", "cognitive", "human", "intervention"], 95, 40),
    recurrenceFrequency: Math.min(100, recurrence * 25),
    governanceImportance:
      targetRule.target === ProactiveDetectionTarget.GOVERNANCE_PROBLEM
        ? 100
        : scoreFromTerms(signal, ["approval", "authority", "hidden", "go", "passkey"], 85, 20)
  };

  const weighted = Object.entries(factorScores).reduce((sum, [key, value]) => {
    return sum + value * (PRIORITY_WEIGHTS[key] / 100);
  }, 0);

  return {
    score: Math.max(1, Math.min(100, Math.round(weighted))),
    factors: factorScores,
    recommendation: priorityRecommendation(weighted)
  };
}

function buildRemediationPlan(signal, targetRule, relatedMemory) {
  const explicitSteps = normalizeArray(signal.remediationSteps);
  const memoryStep =
    relatedMemory.length > 0
      ? "Use related operational memory to avoid repeating rejected or failed remediation paths."
      : null;
  return [
    "Confirm current runtime truth and visible evidence before writing an Issue.",
    normalizeText(signal.remediation) || targetRule.defaultRemediation,
    memoryStep,
    ...explicitSteps,
    "Present the exact Issue draft and wait for human GO before any GitHub write."
  ].filter(Boolean);
}

function buildIssueDraft({ signal, targetRule, title, explanation, priority, relatedMemory }) {
  const bodySections = [
    "## Problem",
    explanation,
    "",
    "## Proposed Remediation",
    normalizeText(signal.remediation) || targetRule.defaultRemediation,
    "",
    "## Detection Evidence",
    normalizeEvidence(signal)
      .map((item) => `- ${item}`)
      .join("\n") || "- No concrete evidence supplied; collect runtime truth before execution.",
    "",
    "## Priority Rationale",
    `Priority ${priority.score}/100 (${priority.recommendation}) based on recurrence, operational impact, owner cognitive load, dependency chains, and governance importance.`,
    "",
    "## Historical Context",
    relatedMemory.length > 0
      ? relatedMemory.map((item) => `- ${item.id || item.title}: ${item.summary || item.title}`).join("\n")
      : "- No related operational memory reference found.",
    "",
    "## GO Boundary",
    "Butler may propose and prioritize this Issue, but must wait for human GO before creating the Issue or executing remediation."
  ];

  return {
    title,
    body: bodySections.join("\n"),
    labels: ["proposal", `target:${targetRule.target}`, `priority:${priority.recommendation}`]
  };
}

function buildExecutionPlan(signal, targetRule) {
  return {
    status: "proposal_only",
    requiresGO: true,
    steps: [
      "Show the exact Issue draft to the owner.",
      "Wait for explicit human GO for Issue creation or implementation handoff.",
      "After GO, execute only the bounded slice selected from the approved Issue.",
      "Report verification evidence back to the owner."
    ],
    prohibitedUntilApproved: [
      "issue_create",
      "implementation_handoff",
      "high_risk_action",
      "permission_or_secret_mutation"
    ],
    approvalBoundary:
      targetRule.target === ProactiveDetectionTarget.GOVERNANCE_PROBLEM || hasHighRiskTerms(signal)
        ? "GO + passkey required before deploy, secret, permission, settings, or other high-risk external effects; normal writes still require GO"
        : "GO required before normal write or execution"
  };
}

function buildBoundedSlices(signal, targetRule) {
  const explicit = normalizeArray(signal.boundedImplementationSlices);
  if (explicit.length > 0) {
    return explicit;
  }
  return [
    `Define detector contract for ${targetRule.target}.`,
    "Add or update focused tests for happy path and boundary/failure path.",
    "Document the user-visible proposal and approval boundary."
  ];
}

function buildDependencyOrdering(signal, targetRule) {
  const dependencies = normalizeArray(signal.dependencies);
  return [
    ...dependencies.map((dependency, index) => ({
      order: index + 1,
      item: dependency,
      reason: "declared dependency"
    })),
    {
      order: dependencies.length + 1,
      item: `proposal:${targetRule.target}`,
      reason: "bounded proposal can proceed after declared dependencies are understood"
    }
  ];
}

function selectRelatedMemory(signal, memoryReferences, limit) {
  const tokens = tokenize(`${signal.title ?? ""} ${signal.description ?? ""} ${normalizeArray(signal.tags).join(" ")}`);
  return memoryReferences
    .map((reference) => ({
      ...reference,
      matchScore: countMatches(tokens, `${reference.title ?? ""} ${reference.summary ?? ""} ${reference.tags?.join(" ") ?? ""}`)
    }))
    .filter((reference) => reference.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit)
    .map(({ matchScore, ...reference }) => reference);
}

function findDuplicateCandidates(signal, existingIssues) {
  const tokens = tokenize(`${signal.title ?? ""} ${signal.description ?? ""}`);
  if (tokens.length === 0) {
    return [];
  }
  return existingIssues
    .map((issue) => ({
      issueNumber: issue.issueNumber,
      title: issue.title,
      matchScore: countMatches(tokens, `${issue.title} ${issue.body}`)
    }))
    .filter((issue) => issue.matchScore >= Math.min(3, tokens.length))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3)
    .map(({ matchScore, ...issue }) => issue);
}

function normalizeSignals(input) {
  const runtimeSignals = normalizeArray(input.signals ?? input.operationalSignals);
  const gapSignals = normalizeArray(input.operationalGaps).map((item) => ({
    ...normalizeSignalObject(item),
    target: ProactiveDetectionTarget.OPERATIONAL_GAP
  }));
  const recurringPainSignals = normalizeArray(input.recurringPain).map((item) => ({
    ...normalizeSignalObject(item),
    target: ProactiveDetectionTarget.RECURRING_PAIN
  }));
  const governanceSignals = normalizeArray(input.governanceProblems).map((item) => ({
    ...normalizeSignalObject(item),
    target: ProactiveDetectionTarget.GOVERNANCE_PROBLEM
  }));
  const capabilitySignals = normalizeArray(input.capabilityGaps).map((item) => ({
    ...normalizeSignalObject(item),
    target: ProactiveDetectionTarget.CAPABILITY_GAP
  }));

  return [...runtimeSignals, ...gapSignals, ...recurringPainSignals, ...governanceSignals, ...capabilitySignals]
    .map(normalizeSignalObject)
    .filter((signal) => normalizeText(signal.title ?? signal.description ?? signal.summary));
}

function normalizeSignalObject(value) {
  if (typeof value === "string") {
    return { description: value };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return { ...value };
}

function normalizeMemoryReferences(value) {
  return normalizeArray(value).map((item) => ({
    id: normalizeText(item.id),
    title: normalizeText(item.title),
    summary: normalizeText(item.summary),
    score: Number(item.score) || 0,
    tags: normalizeArray(item.tags).map(normalizeText).filter(Boolean)
  }));
}

function normalizeExistingIssues(value) {
  return normalizeArray(value).map((issue) => ({
    issueNumber: Number(issue.issueNumber ?? issue.number) || null,
    title: normalizeText(issue.title),
    body: normalizeText(issue.body)
  }));
}

function normalizeEvidence(signal) {
  return normalizeArray(signal.evidence ?? signal.observations)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function inferRootCause(signal, targetRule) {
  const recurrence = normalizeCount(signal.recurrenceCount ?? signal.recurrence);
  if (recurrence > 1) {
    return "Repeated operational signals are not yet converted into structured proposal and remediation work.";
  }
  if (targetRule.target === ProactiveDetectionTarget.GOVERNANCE_PROBLEM) {
    return "The approval or authority boundary is not visible enough before execution decisions.";
  }
  return "The current Butler surface is missing a proactive detection-to-proposal step for this operational signal.";
}

function scoreFromTerms(signal, terms, matchedScore, fallbackScore) {
  const searchable = `${signal.title ?? ""} ${signal.description ?? ""} ${signal.summary ?? ""} ${normalizeArray(signal.tags).join(" ")}`;
  return terms.some((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(searchable))
    ? matchedScore
    : fallbackScore;
}

function priorityRecommendation(score) {
  if (score >= 65) {
    return "high";
  }
  if (score >= 50) {
    return "medium";
  }
  return "low";
}

function hasHighRiskTerms(signal) {
  return /secret|permission|deploy|merge|delete|settings|passkey/i.test(
    `${signal.title ?? ""} ${signal.description ?? ""} ${normalizeArray(signal.tags).join(" ")}`
  );
}

function compareDetectedOpportunities(a, b) {
  return b.priority.score - a.priority.score || a.title.localeCompare(b.title);
}

function makeStableId(target, title) {
  return `${target}:${normalizeText(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)}`;
}

function tokenize(value) {
  return normalizeText(value)
    .toLowerCase()
    .split(/[^a-z0-9#]+/)
    .filter((token) => token.length >= 3);
}

function countMatches(tokens, value) {
  const text = normalizeText(value).toLowerCase();
  return tokens.filter((token) => text.includes(token)).length;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [];
}

function normalizeCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
