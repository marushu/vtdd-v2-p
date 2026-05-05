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

test("execution continuity treats approve-only Gemini reviewer comment as non-blocking", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/test-pr-for-gemini-live",
        pullRequest: {
          number: 28,
          url: "https://github.com/example/repo/pull/28",
          state: "open",
          title: "Live Gemini review test",
          reviewer: "gemini",
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini Critical Review\n\n- Recommended action: `approve`",
              url: "https://github.com/example/repo/pull/28#issuecomment-4317590536",
              includesCreatedEdit: true
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.reviewLoop.reviewCommentsCount, 1);
  assert.equal(result.value.reviewLoop.unresolvedReviewCommentsCount, 0);
  assert.equal(result.value.reviewLoop.criticalReviewPending, false);
  assert.equal(result.value.codexGoal, CodexGoal.WAIT_FOR_REVIEW);
  assert.equal(
    result.value.butlerReviewSynthesis.headline,
    "PR #28 is open. Gemini reviewer action is approve. Approve evidence: https://github.com/example/repo/pull/28#issuecomment-4317590536"
  );
  assert.equal(
    result.value.butlerReviewSynthesis.humanDecisionFocus.includes(
      "Gemini updates its existing marker comment; GitHub may show the original comment time, so use the current marker body and evidence URL."
    ),
    true
  );
  assert.deepEqual(result.value.nextSuggestedActions, ["summarize_for_human", "wait_for_human_go"]);
});

test("execution continuity exposes Codex fallback requested when Gemini is temporarily unavailable", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-74",
        pullRequest: {
          number: 74,
          url: "https://github.com/example/repo/pull/74",
          state: "open",
          title: "Reviewer fallback",
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              body: "<!-- vtdd:reviewer=codex-fallback -->\n- Status: `requested`"
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.reviewLoop.reviewer, "codex");
  assert.equal(result.value.reviewLoop.reviewerStatus, "codex_review_requested");
  assert.equal(result.value.reviewLoop.criticalReviewPending, true);
  assert.equal(result.value.codexGoal, CodexGoal.WAIT_FOR_REVIEW);
  assert.deepEqual(result.value.nextSuggestedActions, ["wait_for_codex_review", "summarize_for_human"]);
});

test("execution continuity exposes Codex fallback review as available when VTDD posts a completed fallback comment", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-84",
        pullRequest: {
          number: 84,
          url: "https://github.com/example/repo/pull/84",
          state: "open",
          title: "No-manual reviewer fallback",
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              body: "<!-- vtdd:reviewer=codex-fallback -->\n## VTDD Codex Reviewer Fallback Request\n\n- Status: `completed`\n- Recommended action: `approve`"
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.reviewLoop.reviewer, "codex");
  assert.equal(result.value.reviewLoop.reviewerStatus, "codex_review_available");
  assert.equal(result.value.reviewLoop.criticalReviewPending, false);
  assert.deepEqual(result.value.nextSuggestedActions, ["summarize_for_human", "wait_for_human_go"]);
});

test("execution continuity surfaces Codex fallback blocker when non-manual review cannot start", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-84",
        pullRequest: {
          number: 84,
          url: "https://github.com/example/repo/pull/84",
          state: "open",
          title: "No-manual reviewer fallback",
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              body: "<!-- vtdd:reviewer=codex-fallback -->\n## VTDD Codex Reviewer Fallback Request\n\n- Status: `blocked`\n- Blocker: `openai_api_key_not_configured`"
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.reviewLoop.reviewerStatus, "codex_review_blocked");
  assert.equal(result.value.reviewLoop.criticalReviewPending, true);
  assert.deepEqual(result.value.nextSuggestedActions, ["surface_reviewer_platform_blocker", "summarize_for_human"]);
});

test("execution continuity surfaces Codex connector setup comments as fallback blocker", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-156",
        pullRequest: {
          number: 181,
          url: "https://github.com/example/repo/pull/181",
          state: "open",
          title: "Context preflight",
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              body: "<!-- vtdd:reviewer=codex-fallback -->\n## VTDD Codex Reviewer Fallback Request\n\n- Status: `requested`\n\n@codex review"
            },
            {
              user: { login: "chatgpt-codex-connector" },
              body: "To use Codex here, [create a Codex account and connect to github](https://chatgpt.com/codex/cloud/settings/connectors)."
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.reviewLoop.reviewer, "codex");
  assert.equal(result.value.reviewLoop.reviewerStatus, "codex_review_blocked");
  assert.equal(result.value.reviewLoop.criticalReviewPending, true);
  assert.deepEqual(result.value.nextSuggestedActions, ["surface_reviewer_platform_blocker", "summarize_for_human"]);
  assert.equal(
    result.value.butlerReviewSynthesis.headline,
    "PR #181 is open. Gemini is temporarily unavailable and non-manual Codex fallback is currently blocked by platform or repository configuration."
  );
});
