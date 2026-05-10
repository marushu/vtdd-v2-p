import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ButlerOperationalResponsibility,
  HumanOperationalResponsibility,
  buildOwnerCognitiveLoadProtectionModel
} from "../src/core/index.js";

const DOC_PATH = path.join(process.cwd(), "docs", "butler", "owner-cognitive-load-protection.md");

test("owner cognitive load model assigns operational complexity to Butler and decisions to the human", () => {
  const result = buildOwnerCognitiveLoadProtectionModel({
    runtimeTruth: {
      source: "github_app",
      checkedAt: "2026-05-11T00:00:00Z",
      currentState: "one execution blocked and one batch ready"
    },
    batchPlan: {
      source: "github_runtime_truth_open_issues",
      proposedBatch: [
        {
          issueNumber: 253,
          title: "architecture: owner cognitive load protection model",
          reason: "safe to run in the current batch",
          conflictRisk: "low"
        }
      ],
      waitingQueue: [
        {
          issueNumber: 252,
          title: "dependent follow-up",
          disposition: "waiting_dependency",
          dependencies: [251],
          reason: "wait for dependency Issue(s): #251"
        }
      ],
      mergeOrder: [{ issueNumber: 253 }, { issueNumber: 252 }]
    },
    batchMonitor: {
      issues: [
        {
          issueNumber: 248,
          title: "blocked execution",
          stage: "blocked",
          blocker: { error: "reviewer_objection_unresolved" }
        },
        {
          issueNumber: 253,
          title: "owner cognitive load",
          stage: "in_progress"
        }
      ],
      summary: {
        blocked: 1,
        inProgress: 1
      }
    },
    operationalMemory: {
      compactContext: [
        {
          id: "decision-recurring-reviewer",
          title: "Reviewer blockers must be handled before completion claims",
          tags: ["decision_log", "recurring", "blocker"],
          scoreSignals: { recurrence: 100 }
        }
      ]
    },
    issueProposals: [
      {
        title: "fix: reviewer blocker remediation tracking",
        relatedIssue: 248,
        priority: "high"
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.issueNumber, 253);
  assert.equal(
    result.butlerResponsibilities.includes(ButlerOperationalResponsibility.BLOCKER_DETECTION),
    true
  );
  assert.equal(
    result.butlerResponsibilities.includes(ButlerOperationalResponsibility.RUNTIME_TRUTH_OBSERVATION),
    true
  );
  assert.deepEqual(result.humanResponsibilities, Object.values(HumanOperationalResponsibility));
  assert.equal(result.ownerFacingReport.asksOwnerToManageOperations, false);
  assert.equal(result.ownerFacingReport.status, "butler_tracking_blockers");
  assert.equal(result.butlerWork.blockerDetection[0].blocker.error, "reviewer_objection_unresolved");
  assert.deepEqual(result.butlerWork.dependencyTracking[0].dependencies, [251]);
  assert.equal(result.butlerWork.prioritySuggestion[0].ownerAction, "approve_or_redirect");
  assert.equal(result.butlerWork.recurringPainDetection[0].nextButlerAction, "propose_remediation_without_owner_reexplaining_the_pattern");
  assert.equal(result.butlerWork.executionMonitoring.mergeReadyIsNotMergeAuthorization, true);
  assert.equal(result.boundaries.doesNotMergeDeployCloseIssuesOrMutateInfrastructure, true);
});

test("owner cognitive load model blocks execution claims when runtime truth has not been observed", () => {
  const result = buildOwnerCognitiveLoadProtectionModel({
    batchPlan: {
      proposedBatch: [{ issueNumber: 253, title: "owner cognitive load" }]
    }
  });

  assert.equal(result.ownerFacingReport.status, "needs_runtime_truth_observation");
  assert.equal(
    result.butlerWork.runtimeTruthObservation.missingObservationBlocker,
    "runtime_truth_observation_required_before_execution_claims"
  );
  assert.equal(result.ownerFacingReport.decisionQueue[0].kind, "redirect");
});

test("owner cognitive load protection doc maps Issue 253 responsibilities and boundaries", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  assert.equal(doc.includes("Issue: #253"), true);
  assert.equal(doc.includes("Butler absorbs operational management"), true);
  assert.equal(doc.includes("blocker detection"), true);
  assert.equal(doc.includes("issue proposal"), true);
  assert.equal(doc.includes("remediation planning"), true);
  assert.equal(doc.includes("dependency tracking"), true);
  assert.equal(doc.includes("operational telemetry"), true);
  assert.equal(doc.includes("recurring pain detection"), true);
  assert.equal(doc.includes("runtime-truth observation"), true);
  assert.equal(doc.includes("Human responsibilities stay limited to intent, strategic direction, approval, governance boundaries, and final decisions"), true);
  assert.equal(doc.includes("does not merge, deploy, close Issues, mutate secrets, change permissions, change repository settings, or mutate external infrastructure"), true);
  assert.equal(doc.includes("setup wizard"), false);
});
