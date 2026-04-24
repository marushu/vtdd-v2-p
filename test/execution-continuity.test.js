import test from "node:test";
import assert from "node:assert/strict";
import {
  ActorRole,
  CodexGoal,
  ExecutionTransferMode,
  TaskMode,
  evaluateExecutionContinuity
} from "../src/core/index.js";

test("execution continuity resumes by default and aims for PR creation when no PR exists", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.EXECUTOR,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-4",
        pullRequest: {}
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.transferMode, ExecutionTransferMode.RESUME);
  assert.equal(result.value.codexGoal, CodexGoal.OPEN_PR);
  assert.equal(result.value.nextSuggestedActions.includes("open_pull_request"), true);
});

test("execution continuity requires handoff for Butler-mediated transfer when bridge data is missing", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    continuationContext: {
      requiresHandoff: true
    },
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-4"
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.rule, "butler_handoff_required_for_execution_transfer");
});

test("execution continuity returns PR revision loop guidance when unresolved review comments exist", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-4",
        pullRequest: {
          number: 42,
          url: "https://github.com/example/repo/pull/42",
          state: "open",
          title: "Connect reviewer loop",
          reviewCommentsCount: 3,
          unresolvedReviewCommentsCount: 2,
          updatedSinceReview: true,
          reviewer: "gemini",
          reviewComments: [{ user: { login: "gemini" }, body: "Still blocked on reviewer objections." }]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.codexGoal, CodexGoal.REVISE_PR);
  assert.equal(result.value.reviewLoop.rerunReviewer, true);
  assert.equal(result.value.nextSuggestedActions.includes("apply_pr_feedback"), true);
  assert.equal(result.value.butlerReviewSynthesis.available, true);
  assert.equal(
    result.value.butlerReviewSynthesis.headline.includes("unresolved reviewer objections"),
    true
  );
});
