import test from "node:test";
import assert from "node:assert/strict";
import {
  ButlerBatchExecutionStage,
  ButlerBatchIssueDisposition,
  buildButlerBatchHandoffQueue,
  buildButlerIssueBatchPlan,
  monitorButlerBatchDevelopment
} from "../src/core/butler-batch-planning.js";

test("butler batch planner proposes a safe parallel issue group from open GitHub issues", () => {
  const plan = buildButlerIssueBatchPlan({
    repository: "marushu/vtdd-v2-p",
    maxParallel: 2,
    openIssues: [
      issue(274, "feat: Butler batch planning", {
        body: "Butler should plan open Issues and Codex handoff batches. Touch docs/butler/batch-planning.md.",
        labels: ["priority:high"]
      }),
      issue(275, "docs: update memory guide", {
        body: "Update docs/memory/operational-memory-layer.md only.",
        labels: ["p2"]
      }),
      issue(276, "fix: GitHub read plane pagination", {
        body: "Touch src/core/github-read-plane.js and test/github-read-plane.test.js.",
        labels: ["p1"]
      })
    ]
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.repository, "marushu/vtdd-v2-p");
  assert.deepEqual(
    plan.proposedBatch.map((item) => item.issueNumber),
    [274, 275]
  );
  assert.equal(plan.waitingQueue[0].issueNumber, 276);
  assert.equal(plan.waitingQueue[0].disposition, ButlerBatchIssueDisposition.WAITING_CONFLICT);
  assert.equal(plan.mergeOrder[0].issueNumber, 274);
});

test("butler batch planner serializes high conflict issues and explains merge order", () => {
  const plan = buildButlerIssueBatchPlan({
    maxParallel: 3,
    openIssues: [
      issue(300, "feat: GitHub issue read truth", {
        body: "Change src/core/github-read-plane.js and test/github-read-plane.test.js.",
        labels: ["p1"]
      }),
      issue(301, "fix: GitHub PR runtime truth", {
        body: "Change src/core/github-read-plane.js and docs/security/github-operation-plane.md.",
        labels: ["p1"]
      }),
      issue(302, "docs: public setup archive note", {
        body: "Update docs/setup/custom-gpt-instructions.md.",
        labels: ["p2"]
      })
    ]
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.proposedBatch.some((item) => item.issueNumber === 300), true);
  const conflicted = plan.waitingQueue.find((item) => item.issueNumber === 301);
  assert.equal(conflicted.disposition, ButlerBatchIssueDisposition.WAITING_CONFLICT);
  assert.match(conflicted.reason, /overlaps with Issue #300/);
  assert.equal(plan.mergeOrder.find((item) => item.issueNumber === 301).disposition, "waiting_conflict");
});

test("butler batch planner waits for explicit dependency issues", () => {
  const plan = buildButlerIssueBatchPlan({
    openIssues: [
      issue(400, "feat: executor base", {
        body: "Implement src/core/remote-codex-executor.js.",
        labels: ["p1"]
      }),
      issue(401, "feat: executor UI follow-up", {
        body: "Depends on #400 before worker UI can safely change.",
        labels: ["p1"]
      })
    ]
  });

  const waiting = plan.waitingQueue.find((item) => item.issueNumber === 401);
  assert.equal(waiting.disposition, ButlerBatchIssueDisposition.WAITING_DEPENDENCY);
  assert.deepEqual(waiting.dependencies, [400]);
});

test("butler batch handoff queue remains request-only until human GO", () => {
  const plan = buildButlerIssueBatchPlan({
    repository: "marushu/vtdd-v2-p",
    openIssues: [issue(274, "feat: Butler batch planning")]
  });

  const notApproved = buildButlerBatchHandoffQueue({ plan });
  assert.equal(notApproved.ok, true);
  assert.equal(notApproved.approved, false);
  assert.equal(notApproved.handoffs.length, 0);

  const approved = buildButlerBatchHandoffQueue({
    plan,
    go: true,
    approvalPhrase: "GO issue #274 batch handoff"
  });
  assert.equal(approved.approved, true);
  assert.equal(approved.handoffs[0].issueNumber, 274);
  assert.equal(approved.handoffs[0].handoff.issueTraceable, true);
  assert.equal(approved.handoffs[0].issueTraceability.relatedIssue, 274);
});

test("butler batch monitor reports queued, in progress, blocked, PR created, review, and merge-ready", () => {
  const result = monitorButlerBatchDevelopment({
    trackedIssues: [
      { issueNumber: 501 },
      { issueNumber: 502 },
      { issueNumber: 503 },
      { issueNumber: 504 },
      { issueNumber: 505 },
      { issueNumber: 506 }
    ],
    executionProgress: [
      { issueNumber: 501, executionId: "remote-501", status: "queued" },
      { issueNumber: 502, executionId: "remote-502", status: "in_progress", branch: "codex/issue-502" },
      {
        issueNumber: 503,
        executionId: "remote-503",
        status: "blocked",
        blocker: { error: "vps_runner_pickup_not_observed" }
      }
    ],
    pullRequests: [
      { number: 504, issueNumber: 504, state: "open", headRef: "codex/issue-504" },
      { number: 505, issueNumber: 505, state: "open", headRef: "codex/issue-505" },
      { number: 506, issueNumber: 506, state: "open", headRef: "codex/issue-506" }
    ],
    reviews: [
      { pullNumber: 505, state: "COMMENTED" },
      { pullNumber: 506, state: "APPROVED" }
    ],
    checks: [
      { pullNumber: 505, status: "completed", conclusion: "success" },
      { pullNumber: 506, status: "completed", conclusion: "success" }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(stageFor(result, 501), ButlerBatchExecutionStage.QUEUED);
  assert.equal(stageFor(result, 502), ButlerBatchExecutionStage.IN_PROGRESS);
  assert.equal(stageFor(result, 503), ButlerBatchExecutionStage.BLOCKED);
  assert.equal(stageFor(result, 504), ButlerBatchExecutionStage.PR_CREATED);
  assert.equal(stageFor(result, 505), ButlerBatchExecutionStage.REVIEW);
  assert.equal(stageFor(result, 506), ButlerBatchExecutionStage.MERGE_READY);
  assert.deepEqual(result.summary, {
    queued: 1,
    inProgress: 1,
    blocked: 1,
    prCreated: 1,
    review: 1,
    mergeReady: 1
  });
});

function issue(number, title, options = {}) {
  return {
    number,
    title,
    body: options.body ?? "",
    labels: options.labels ?? [],
    state: "open",
    htmlUrl: `https://github.com/marushu/vtdd-v2-p/issues/${number}`
  };
}

function stageFor(result, issueNumber) {
  return result.issues.find((item) => item.issueNumber === issueNumber).stage;
}
