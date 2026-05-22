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
  assert.equal(result.value.reviewLoop.reviewerSignalTruth.canonicalSource, "vtdd_reviewer_marker_comment");
  assert.equal(result.value.reviewLoop.reviewerSignalTruth.recommendedAction, "approve");
  assert.equal(result.value.reviewLoop.reviewerSignalTruth.githubFormalReview.hasFormalApproval, false);
  assert.equal(result.value.reviewLoop.reviewerSignalTruth.mergeReviewTruth.satisfied, true);
  assert.equal(
    result.value.reviewLoop.reviewerSignalTruth.warnings.includes(
      "VTDD reviewer marker recommends approve, but GitHub formal PR review approval is absent; do not report GitHub reviewDecision as approved."
    ),
    true
  );
  assert.equal(result.value.codexGoal, CodexGoal.WAIT_FOR_REVIEW);
  assert.equal(
    result.value.butlerReviewSynthesis.headline,
    "PR #28 is open. PR conflict runtime truth is unverified; Butler must re-read runtime truth before merge judgment."
  );
  assert.equal(result.value.butlerReviewSynthesis.prState.mergeability.status, "unverified");
  assert.equal(
    result.value.butlerReviewSynthesis.humanDecisionFocus.includes(
      "Gemini appends timestamped marker comments; use the latest trusted marker for the relevant PR head SHA as current reviewer evidence."
    ),
    true
  );
  assert.deepEqual(result.value.nextSuggestedActions, [
    "refresh_pull_request_runtime_truth",
    "summarize_for_human"
  ]);
});

test("execution continuity prefers current-head Gemini approve over stale Codex fallback request changes", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-452",
        pullRequest: {
          number: 453,
          url: "https://github.com/example/repo/pull/453",
          state: "open",
          title: "Dashboard runner chat events",
          reviewer: "gemini",
          headSha: "new456",
          mergeable: true,
          mergeableState: "clean",
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              createdAt: "2026-05-20T01:00:00.000Z",
              body: "<!-- vtdd:reviewer=codex-fallback -->\n## VTDD Codex fallback レビュー\n\n- Status: `completed`\n- Head SHA: `old123`\n- Recommended action: `request_changes`\n\n### 重要指摘\n- old head still needed changes"
            },
            {
              user: { login: "vtdd-codex[bot]" },
              createdAt: "2026-05-20T01:05:00.000Z",
              body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini レビュー\n\n- Head SHA: `new456`\n- Recommended action: `approve`\n\n### 残リスク\n- none"
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.reviewLoop.reviewer, "gemini");
  assert.equal(result.value.reviewLoop.reviewerStatus, "gemini_review_available");
  assert.equal(result.value.reviewLoop.reviewerEvidence.recommendedAction, "approve");
  assert.equal(result.value.reviewLoop.reviewerEvidence.headSha, "new456");
  assert.equal(result.value.reviewLoop.unresolvedReviewCommentsCount, 0);
  assert.equal(result.value.reviewLoop.criticalReviewPending, false);
  assert.equal(result.value.reviewLoop.reviewerSignalTruth.mergeReviewTruth.satisfied, true);
  assert.equal(result.value.nextSuggestedActions.includes("apply_pr_feedback"), false);
});

test("execution continuity does not satisfy review truth from stale Gemini approve when current head is unreviewed", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-448",
        pullRequest: {
          number: 454,
          url: "https://github.com/example/repo/pull/454",
          state: "open",
          title: "Auto merge reviewer truth",
          reviewer: "gemini",
          headSha: "new456",
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              createdAt: "2026-05-20T01:00:00.000Z",
              body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini レビュー\n\n- Head SHA: `old123`\n- Recommended action: `approve`"
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.reviewLoop.reviewerStatus, "review_unavailable");
  assert.equal(result.value.reviewLoop.reviewerEvidence, null);
  assert.equal(result.value.reviewLoop.reviewerSignalTruth.mergeReviewTruth.satisfied, false);
  assert.deepEqual(result.value.nextSuggestedActions, ["rerun_gemini_review", "summarize_for_human"]);
});

test("execution continuity does not satisfy review truth from headless Gemini approve when PR head is known", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-448",
        pullRequest: {
          number: 454,
          url: "https://github.com/example/repo/pull/454",
          state: "open",
          title: "Auto merge reviewer truth",
          reviewer: "gemini",
          headSha: "new456",
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              createdAt: "2026-05-20T01:00:00.000Z",
              body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini レビュー\n\n- Recommended action: `approve`"
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.reviewLoop.reviewerStatus, "review_unavailable");
  assert.equal(result.value.reviewLoop.reviewerEvidence, null);
  assert.equal(result.value.reviewLoop.reviewerSignalTruth.mergeReviewTruth.satisfied, false);
  assert.deepEqual(result.value.nextSuggestedActions, ["rerun_gemini_review", "summarize_for_human"]);
});

test("execution continuity keeps global Codex blocker even with current-head Gemini approve", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-448",
        pullRequest: {
          number: 454,
          url: "https://github.com/example/repo/pull/454",
          state: "open",
          title: "Auto merge reviewer truth",
          reviewer: "gemini",
          headSha: "new456",
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              createdAt: "2026-05-20T01:00:00.000Z",
              body: "<!-- vtdd:reviewer=codex-fallback -->\n## VTDD Codex fallback レビュー\n\n- Status: `completed`\n- Head SHA: `old123`\n- Recommended action: `request_changes`"
            },
            {
              user: { login: "vtdd-codex[bot]" },
              createdAt: "2026-05-20T01:05:00.000Z",
              body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini レビュー\n\n- Head SHA: `new456`\n- Recommended action: `approve`"
            },
            {
              user: { login: "chatgpt-codex-connector" },
              createdAt: "2026-05-20T01:10:00.000Z",
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
});

test("execution continuity treats GitHub formal changes requested as blocking even with VTDD marker approve", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/reviewer-truth",
        pullRequest: {
          number: 296,
          url: "https://github.com/example/repo/pull/296",
          state: "open",
          title: "Reviewer signal truth",
          reviewer: "gemini",
          reviewDecision: "CHANGES_REQUESTED",
          reviews: [{ user: { login: "human-reviewer" }, state: "CHANGES_REQUESTED" }],
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini Critical Review\n\n- Recommended action: `approve`",
              url: "https://github.com/example/repo/pull/296#issuecomment-1"
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.codexGoal, CodexGoal.REVISE_PR);
  assert.equal(result.value.reviewLoop.criticalReviewPending, true);
  assert.equal(result.value.reviewLoop.reviewerSignalTruth.mergeReviewTruth.blocked, true);
  assert.equal(
    result.value.reviewLoop.reviewerSignalTruth.mergeReviewTruth.reason,
    "github_formal_review_changes_requested"
  );
  assert.equal(
    result.value.butlerReviewSynthesis.humanDecisionFocus.includes(
      "GitHub formal review truth has requested changes; it remains blocking even if a VTDD reviewer marker recommends approve."
    ),
    true
  );
});

test("execution continuity proposes a fresh PR when approved runtime truth has conflicts", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-284",
        pullRequest: {
          number: 281,
          url: "https://github.com/example/repo/pull/281",
          state: "open",
          title: "Approved conflict",
          mergeable: false,
          mergeableState: "dirty",
          mergeConflict: true,
          mergeBlockedReason: "pull_request_has_merge_conflicts",
          mergeWarning:
            "Warning: PR merge conflicts were detected before merge. Resolve conflicts or recreate a fresh branch before attempting the merge API.",
          freshBranchSuggestion:
            "Recreate a fresh branch from the current base branch, replay the scoped changes, and open/update the PR before retrying merge.",
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini Critical Review\n\n- Recommended action: `approve`"
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.codexGoal, CodexGoal.REVISE_PR);
  assert.equal(result.value.pullRequest.mergeConflict, true);
  assert.equal(result.value.pullRequest.mergeBlockedReason, "pull_request_has_merge_conflicts");
  assert.deepEqual(result.value.nextSuggestedActions, [
    "create_fresh_branch",
    "open_fresh_pull_request",
    "summarize_for_human"
  ]);
  assert.equal(result.value.butlerReviewSynthesis.prState.mergeability.status, "conflict");
  assert.equal(
    result.value.butlerReviewSynthesis.humanDecisionFocus.includes(
      "Runtime truth shows PR merge conflicts; do not recommend merge even if reviewer evidence is approve."
    ),
    true
  );
});

test("execution continuity marks missing PR conflict truth as unverified before merge judgment", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-284",
        pullRequest: {
          number: 279,
          url: "https://github.com/example/repo/pull/279",
          state: "open",
          title: "Unknown mergeability"
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.pullRequest.mergeabilityVerified, false);
  assert.deepEqual(result.value.nextSuggestedActions, ["rerun_gemini_review", "summarize_for_human"]);
  assert.equal(result.value.butlerReviewSynthesis.prState.mergeability.status, "unverified");
  assert.match(result.value.butlerReviewSynthesis.headline, /conflict runtime truth is unverified/);
});

test("execution continuity blocks readiness when request_changes finding is not mapped to a response", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-314",
        pullRequest: {
          number: 314,
          url: "https://github.com/example/repo/pull/314",
          state: "open",
          title: "Reviewer response summary",
          files: [{ filename: "src/core/gemini-pr-review.js", status: "modified" }],
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              url: "https://github.com/example/repo/pull/314#issuecomment-review",
              created_at: "2026-05-13T10:00:00Z",
              updated_at: "2026-05-13T10:00:00Z",
              body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini レビュー\n\n- Recommended action: `request_changes`\n\n### 重要指摘\n- response summary is missing\n\n### 残リスク\n- rerun evidence must include the response packet"
            },
            {
              user: { login: "vtdd-codex[bot]" },
              url: "https://github.com/example/repo/pull/314#issuecomment-response",
              created_at: "2026-05-13T10:01:00Z",
              body: "<!-- vtdd:reviewer-objection-resolution -->\n## VTDD Reviewer Objection Resolution\n\nEvidence: node --test test/gemini-pr-review.test.js"
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.codexGoal, CodexGoal.REVISE_PR);
  assert.equal(result.value.reviewLoop.reviewResponseSummary.complete, false);
  assert.deepEqual(result.value.reviewLoop.reviewResponseSummary.unresolvedItems, [
    "response summary is missing"
  ]);
  assert.equal(
    result.value.reviewLoop.reviewerSignalTruth.mergeReviewTruth.reason,
    "review_response_unmapped_critical_findings"
  );
  assert.equal(
    result.value.butlerReviewSynthesis.humanDecisionFocus.includes(
      "Review response summary: currentAction=request_changes, completeness=incomplete."
    ),
    true
  );
  assert.equal(
    result.value.butlerReviewSynthesis.humanDecisionFocus.includes(
      "Unmapped reviewer finding: response summary is missing"
    ),
    true
  );
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
  assert.deepEqual(result.value.nextSuggestedActions, [
    "refresh_pull_request_runtime_truth",
    "summarize_for_human"
  ]);
});

test("execution continuity lets completed Codex fallback approve supersede earlier Gemini request changes on the same head", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-450",
        pullRequest: {
          number: 482,
          url: "https://github.com/example/repo/pull/482",
          state: "open",
          title: "Dashboard app-server bridge",
          headSha: "head-450",
          issueComments: [
            {
              user: { login: "vtdd-gemini-reviewer" },
              url: "https://github.com/example/repo/pull/482#issuecomment-gemini",
              created_at: "2026-05-22T11:17:32Z",
              body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini レビュー\n\n- Head SHA: `head-450`\n- Recommended action: `request_changes`\n\n### 重要指摘\n- post-deploy iPhone smoke is worded as unresolved"
            },
            {
              user: { login: "marushu" },
              url: "https://github.com/example/repo/pull/482#issuecomment-response",
              created_at: "2026-05-22T11:20:54Z",
              body: "<!-- vtdd:reviewer-objection-resolution -->\n## VTDD Reviewer Objection Resolution\n\nPR body separates pre-merge evidence from post-deploy gate."
            },
            {
              user: { login: "vtdd-codex-fallback-reviewer" },
              url: "https://github.com/example/repo/pull/482#issuecomment-codex",
              created_at: "2026-05-22T11:22:29Z",
              body: "<!-- vtdd:reviewer=codex-fallback -->\n## VTDD Codex fallback レビュー\n\n- Status: `completed`\n- Head SHA: `head-450`\n- Recommended action: `approve`"
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.reviewLoop.reviewer, "codex");
  assert.equal(result.value.reviewLoop.reviewerStatus, "codex_review_available");
  assert.equal(result.value.reviewLoop.reviewerEvidence.recommendedAction, "approve");
  assert.equal(result.value.reviewLoop.unresolvedReviewCommentsCount, 0);
  assert.equal(result.value.reviewLoop.criticalReviewPending, false);
  assert.equal(result.value.reviewLoop.reviewerSignalTruth.mergeReviewTruth.satisfied, true);
});

test("execution continuity exposes reviewer marker timeline in chronological order", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-270",
        pullRequest: {
          number: 270,
          url: "https://github.com/example/repo/pull/270",
          state: "open",
          title: "Review timeline",
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              url: "https://github.com/example/repo/pull/270#issuecomment-review",
              created_at: "2026-05-13T03:00:00Z",
              updated_at: "2026-05-13T03:00:00Z",
              body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini レビュー\n\n- Recommended action: `request_changes`\n\n### 重要指摘\n- needs response"
            },
            {
              user: { login: "marushu" },
              url: "https://github.com/example/repo/pull/270#issuecomment-response",
              created_at: "2026-05-13T03:01:00Z",
              body: "<!-- vtdd:reviewer-objection-resolution -->\nAddresses: critical-1\nEvidence: npm test"
            }
          ],
          reviewComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              url: "https://github.com/example/repo/pull/270#discussion-fallback",
              created_at: "2026-05-13T02:59:00Z",
              body: "<!-- vtdd:reviewer=codex-fallback -->\n- Status: `requested`"
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.reviewLoop.reviewTimeline.map((item) => item.type), [
    "codex_fallback",
    "gemini_review",
    "reviewer_objection_resolution"
  ]);
  assert.deepEqual(result.value.butlerReviewSynthesis.reviewerSignal.reviewTimeline.map((item) => item.type), [
    "codex_fallback",
    "gemini_review",
    "reviewer_objection_resolution"
  ]);
  assert.equal(
    result.value.butlerReviewSynthesis.humanDecisionFocus.some((line) =>
      line.includes("Latest review timeline item: reviewer_objection_resolution")
    ),
    true
  );
});

test("execution continuity normalizes timeline text fields consistently", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-270",
        pullRequest: {
          number: 271,
          url: "https://github.com/example/repo/pull/271",
          state: "open",
          title: "Review timeline normalization",
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              url: " https://github.com/example/repo/pull/271#issuecomment-review ",
              created_at: " 2026-05-13T04:00:00Z ",
              updated_at: " 2026-05-13T04:01:00Z ",
              body: "  <!-- vtdd:reviewer=gemini -->\n## VTDD Gemini レビュー\n\n- Recommended action: `approve`  "
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.reviewLoop.reviewTimeline[0], {
    type: "gemini_review",
    reviewer: "gemini",
    status: "approve",
    recommendedAction: "approve",
    blocking: false,
    url: "https://github.com/example/repo/pull/271#issuecomment-review",
    createdAt: "2026-05-13T04:00:00Z",
    updatedAt: "2026-05-13T04:01:00Z",
    summary: "Gemini reviewer action: approve"
  });
  assert.equal(
    result.value.butlerReviewSynthesis.reviewerSignal.reviewTimeline[0].createdAt,
    "2026-05-13T04:00:00Z"
  );
});

test("execution continuity surfaces unparsed reviewer markers as manual review blockers", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-270",
        pullRequest: {
          number: 273,
          url: "https://github.com/example/repo/pull/273",
          state: "open",
          title: "Unknown reviewer marker",
          issueComments: [
            {
              user: { login: "reviewer-bot" },
              url: "https://github.com/example/repo/pull/273#issuecomment-unknown",
              created_at: "2026-05-13T06:00:00Z",
              body: "<!-- vtdd:reviewer=future-reviewer -->\n## Changed marker format"
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.reviewLoop.reviewTimeline[0], {
    type: "reviewer_marker_unparsed",
    reviewer: "future-reviewer",
    status: "manual_review",
    recommendedAction: "manual_review",
    blocking: true,
    url: "https://github.com/example/repo/pull/273#issuecomment-unknown",
    createdAt: "2026-05-13T06:00:00Z",
    updatedAt: null,
    summary: "Unparsed reviewer marker requires manual review: future-reviewer"
  });
});

test("execution continuity treats malformed known reviewer marker content as manual review", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-270",
        pullRequest: {
          number: 274,
          url: "https://github.com/example/repo/pull/274",
          state: "open",
          title: "Malformed known reviewer marker",
          issueComments: [
            {
              user: { login: "vtdd-codex[bot]" },
              url: "https://github.com/example/repo/pull/274#issuecomment-malformed",
              created_at: "2026-05-13T07:00:00Z",
              body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini レビュー\n\n- Action changed format: approve"
            }
          ]
        }
      }
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.reviewLoop.reviewTimeline[0], {
    type: "gemini_review",
    reviewer: "gemini",
    status: "manual_review",
    recommendedAction: "manual_review",
    blocking: true,
    url: "https://github.com/example/repo/pull/274#issuecomment-malformed",
    createdAt: "2026-05-13T07:00:00Z",
    updatedAt: null,
    summary: "Gemini reviewer action: manual_review"
  });
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

test("execution continuity surfaces actor identity incidents as recovery blockers", () => {
  const result = evaluateExecutionContinuity({
    actorRole: ActorRole.BUTLER,
    mode: TaskMode.EXECUTION,
    runtimeTruth: {
      runtimeState: {
        activeBranch: "codex/issue-351",
        pullRequest: {
          number: 369,
          url: "https://github.com/example/repo/pull/369",
          state: "open",
          title: "Actor identity recovery",
          issueComments: [
            {
              user: { login: "vtdd-gemini-reviewer[bot]" },
              body: "<!-- vtdd:reviewer=codex-fallback -->\n## VTDD Codex fallback レビュー\n\n- Status: `requested`\n- Delivery mode: `vps_codex_cli`\n- Head SHA: `abc123`",
              url: "https://github.com/example/repo/pull/369#issuecomment-requested",
              created_at: "2026-05-14T15:08:49Z"
            },
            {
              user: { login: "vtdd-vps-codex-cli[bot]" },
              body: [
                "@marushu 【要対応】VPS Codex CLI: PRレビュー結果を正しいBot名で投稿できません",
                "",
                "<!-- vtdd:incident=actor_identity_failure -->",
                "",
                "- Expected actor: `VTDD Codex Fallback Reviewer`",
                "- Detected by: `VTDD VPS Codex CLI`"
              ].join("\n"),
              url: "https://github.com/example/repo/pull/369#issuecomment-incident",
              created_at: "2026-05-14T15:10:36Z"
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
  assert.deepEqual(result.value.reviewLoop.reviewTimeline.map((item) => item.type), [
    "codex_fallback",
    "vtdd_incident"
  ]);
  assert.equal(result.value.reviewLoop.reviewTimeline[1].status, "actor_identity_failure");
  assert.equal(
    result.value.butlerReviewSynthesis.humanDecisionFocus.includes(
      "Gemini is temporarily unavailable and non-manual Codex fallback is blocked; do not treat reviewer coverage as satisfied."
    ),
    true
  );
});
