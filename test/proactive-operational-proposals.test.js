import test from "node:test";
import assert from "node:assert/strict";
import {
  ActionType,
  ActorRole,
  ConsentCategory,
  CredentialTier,
  ProactiveDetectionTarget,
  ProactiveProposalStage,
  buildProactiveOperationalProposals,
  runMvpGateway
} from "../src/core/index.js";

test("proactive engine turns recurring operational pain into prioritized issue proposals", () => {
  const result = buildProactiveOperationalProposals({
    repository: "marushu/vtdd-v2-p",
    recurringPain: [
      {
        id: "ci-repeat",
        title: "Recurring CI failure needs owner manual intervention",
        description: "The same blocker has required repeated manual intervention before PR completion.",
        recurrenceCount: 4,
        evidence: ["CI failed three times this week", "Owner manually restarted the same check twice"],
        tags: ["ci", "recurring", "manual"]
      }
    ],
    operationalMemory: {
      compactContext: [
        {
          id: "repair-ci-loop",
          title: "CI blocker remediation",
          summary: "Previous CI recurrence was fixed by adding a detector before owner escalation.",
          tags: ["ci", "recurring", "blocker"],
          score: 92
        }
      ]
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.model, [
    ProactiveProposalStage.DETECT,
    ProactiveProposalStage.EXPLAIN,
    ProactiveProposalStage.PROPOSE,
    ProactiveProposalStage.PRIORITIZE,
    ProactiveProposalStage.ASK_FOR_GO
  ]);
  assert.equal(result.summary.executes, false);
  assert.equal(result.summary.recurringPainCount, 1);

  const proposal = result.proposals[0];
  assert.equal(proposal.target, ProactiveDetectionTarget.RECURRING_PAIN);
  assert.equal(proposal.priority.recommendation, "high");
  assert.equal(proposal.relatedMemory[0].id, "repair-ci-loop");
  assert.match(proposal.issueDraft.body, /Historical Context/);
  assert.match(proposal.issueDraft.body, /GO Boundary/);
  assert.equal(proposal.askForGO.required, true);
});

test("proactive engine detects governance problems without bypassing approval boundaries", () => {
  const result = buildProactiveOperationalProposals({
    governanceProblems: [
      {
        title: "Hidden execution risk in deploy approval flow",
        description: "Deploy path mentions GO but the passkey approval flow is unclear.",
        recurrenceCount: 2,
        evidence: ["Operator asked whether deploy already ran"],
        tags: ["deploy", "go", "passkey", "authority"]
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.governanceBoundary.mustNot, [
    "silently_execute_high_risk_actions",
    "bypass_approval_boundaries"
  ]);
  assert.equal(result.summary.asksForGo, true);
  assert.equal(result.summary.executes, false);

  const proposal = result.proposals[0];
  assert.equal(proposal.target, ProactiveDetectionTarget.GOVERNANCE_PROBLEM);
  assert.equal(proposal.executionPlan.status, "proposal_only");
  assert.equal(proposal.executionPlan.requiresGO, true);
  assert.match(proposal.executionPlan.approvalBoundary, /GO \+ passkey required/);
  assert.doesNotMatch(proposal.executionPlan.approvalBoundary, /may be required/);
  assert.equal(proposal.executionPlan.prohibitedUntilApproved.includes("high_risk_action"), true);
});

test("proactive engine detects recurrence-only runtime signals as recurring pain", () => {
  const result = buildProactiveOperationalProposals({
    signals: [
      {
        id: "runtime-signal-repeat",
        title: "Runtime adapter timeout",
        description: "The adapter returned no terminal status before owner escalation.",
        recurrenceCount: 3,
        evidence: ["Observed in three separate handoff windows"]
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.recurringPainCount, 1);

  const proposal = result.proposals[0];
  assert.equal(proposal.target, ProactiveDetectionTarget.RECURRING_PAIN);
  assert.equal(proposal.recurrence, 3);
  assert.match(proposal.explanation, /This appears recurring \(3 observed signals\)\./);
  assert.equal(proposal.priority.factors.recurrenceFrequency, 75);
});

test("proactive engine improves proposal context with historical memory and duplicate candidates", () => {
  const result = buildProactiveOperationalProposals({
    signals: [
      {
        title: "Missing runtime truth for notification visibility gap",
        description: "Notification visibility gap leaves Butler unable to explain whether owner was alerted.",
        target: ProactiveDetectionTarget.OPERATIONAL_GAP,
        evidence: ["No alert delivery state is visible in runtime truth"],
        dependencies: ["runtime truth contract"]
      }
    ],
    memoryReferences: [
      {
        id: "decision-notification-runtime",
        title: "Notification runtime truth decision",
        summary: "Alert delivery status should be read from runtime truth before escalation.",
        tags: ["notification", "runtime", "truth"],
        score: 88
      }
    ],
    openIssues: [
      {
        number: 248,
        title: "architecture: notification visibility runtime truth",
        body: "Missing runtime truth for notification visibility should be addressed."
      }
    ]
  });

  assert.equal(result.ok, true);
  const proposal = result.proposals[0];
  assert.equal(proposal.target, ProactiveDetectionTarget.OPERATIONAL_GAP);
  assert.equal(proposal.relatedMemory[0].id, "decision-notification-runtime");
  assert.deepEqual(proposal.duplicateCandidates, [
    {
      issueNumber: 248,
      title: "architecture: notification visibility runtime truth"
    }
  ]);
  assert.deepEqual(proposal.dependencyOrdering[0], {
    order: 1,
    item: "runtime truth contract",
    reason: "declared dependency"
  });
  assert.equal(proposal.boundedImplementationSlices.length > 0, true);
});

test("gateway exposes proactive proposals as approval-bound Butler output", () => {
  const result = runMvpGateway({
    phase: "exploration",
    actorRole: ActorRole.BUTLER,
    surfaceContext: {
      surface: "custom_gpt",
      judgmentModelId: "vtdd-butler-core-v1"
    },
    judgmentTrace: ["constitution", "runtime_truth", "issue_context", "current_query"],
    policyInput: {
      actionType: ActionType.ISSUE_CREATE,
      mode: "execution",
      repositoryInput: "vtdd",
      aliasRegistry: [
        {
          canonicalRepo: "marushu/vtdd-v2-p",
          aliases: ["vtdd"]
        }
      ],
      targetConfirmed: true,
      constitutionConsulted: true,
      runtimeTruth: { runtimeAvailable: true },
      credential: { model: "github_app", tier: CredentialTier.EXECUTE },
      consent: {
        grantedCategories: [ConsentCategory.READ, ConsentCategory.PROPOSE, ConsentCategory.EXECUTE]
      },
      approvalPhrase: "GO issue proposal",
      approvalScopeMatched: true,
      issueTraceable: true,
      go: true,
      passkey: false
    },
    proactiveOperations: {
      recurringPain: [
        {
          title: "Recurring proposal failure creates owner cognitive load",
          description: "Butler repeatedly needs the owner to convert the same proposal failure into an Issue.",
          recurrenceCount: 3,
          evidence: ["Three proposal failures were observed in the current operating window"]
        }
      ]
    }
  });

  assert.equal(result.allowed, true);
  assert.equal(result.proactiveOperationalProposals.ok, true);
  assert.equal(result.proactiveOperationalProposals.summary.executes, false);
  assert.equal(result.proactiveOperationalProposals.proposals[0].askForGO.required, true);
  assert.match(result.proactiveOperationalProposals.proposals[0].issueDraft.body, /GO Boundary/);
});
