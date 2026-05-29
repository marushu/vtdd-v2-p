import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVE_AUTO_MERGE_CANDIDATE_MARKER,
  APPROVE_AUTO_MERGE_EXECUTED_MARKER,
  ApproveAutoMergePolicyMode,
  buildApproveAutoMergeMemoryRecord,
  evaluateApproveAutoMerge,
  formatApproveAutoMergeCandidateComment,
  formatApproveAutoMergeExecutedComment,
  parseGeminiReviewComment,
  resolveApproveAutoMergePolicy
} from "../src/core/index.js";

const approvedReviewLoop = {
  reviewer: "gemini",
  reviewerEvidence: {
    recommendedAction: "approve",
    headSha: "abc123",
    url: "https://github.com/sample-org/vtdd-v2-p/pull/10#issuecomment-1"
  },
  reviewerSignalTruth: {
    mergeReviewTruth: {
      satisfied: true,
      blocked: false,
      reason: "vtdd_reviewer_marker_approve_no_formal_blocker"
    }
  },
  unresolvedReviewCommentsCount: 0,
  criticalReviewPending: false,
  reviewTimeline: [
    {
      type: "gemini_review",
      recommendedAction: "approve",
      headSha: "abc123"
    }
  ]
};

const mergeablePullRequest = {
  repository: "sample-org/vtdd-v2-p",
  number: 10,
  issueNumber: 448,
  state: "open",
  draft: false,
  headSha: "abc123",
  mergeable: true,
  mergeableState: "clean"
};

const successChecks = [
  { name: "guarded-policy", status: "completed", conclusion: "success", startedAt: "2026-05-20T00:00:00Z" },
  { name: "test", status: "completed", conclusion: "success", startedAt: "2026-05-20T00:00:01Z" },
  { name: "review", status: "completed", conclusion: "success", startedAt: "2026-05-20T00:00:02Z" }
];

test("approve auto merge allows only fully gated approve PRs", () => {
  const result = evaluateApproveAutoMerge({
    policyMode: ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE,
    pullRequest: mergeablePullRequest,
    reviewLoop: approvedReviewLoop,
    checkRuns: successChecks
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reasons.length, 0);
  assert.equal(result.evidence.some((item) => item.includes("reviewerAction=approve")), true);
  assert.equal(result.searchKeyword, "自動マージ");
});

test("approve auto merge blocks approve when required checks fail", () => {
  const result = evaluateApproveAutoMerge({
    policyMode: ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE,
    pullRequest: mergeablePullRequest,
    reviewLoop: approvedReviewLoop,
    checkRuns: successChecks.map((check) =>
      check.name === "test" ? { ...check, conclusion: "failure" } : check
    )
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reasons.includes("required check test conclusion is failure, not success."), true);
});

test("approve auto merge blocks ready PRs with explicit hold labels", () => {
  const result = evaluateApproveAutoMerge({
    policyMode: ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE,
    labels: [{ name: "vtdd:hold" }],
    pullRequest: mergeablePullRequest,
    reviewLoop: approvedReviewLoop,
    checkRuns: successChecks
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reasons.includes("auto merge hold label is present: vtdd:hold."), true);
  assert.equal(result.evidence.includes("blockingLabels=vtdd:hold"), true);
});

test("approve auto merge blocks stale reviewer head SHA", () => {
  const result = evaluateApproveAutoMerge({
    policyMode: ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE,
    pullRequest: { ...mergeablePullRequest, headSha: "new456" },
    reviewLoop: approvedReviewLoop,
    checkRuns: successChecks
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reasons.includes("reviewer evidence head SHA does not match current PR head SHA."), true);
});

test("approve auto merge blocks same-head request changes even when a later approve exists", () => {
  const result = evaluateApproveAutoMerge({
    policyMode: ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE,
    pullRequest: mergeablePullRequest,
    reviewLoop: {
      ...approvedReviewLoop,
      reviewTimeline: [
        {
          type: "codex_fallback",
          reviewer: "codex",
          recommendedAction: "request_changes",
          headSha: "abc123",
          url: "https://github.com/sample-org/vtdd-v2-p/pull/10#issuecomment-request",
          createdAt: "2026-05-29T10:23:40Z"
        },
        {
          type: "codex_fallback",
          reviewer: "codex",
          recommendedAction: "approve",
          headSha: "abc123",
          url: "https://github.com/sample-org/vtdd-v2-p/pull/10#issuecomment-approve",
          createdAt: "2026-05-29T10:23:45Z"
        }
      ]
    },
    checkRuns: successChecks
  });

  assert.equal(result.allowed, false);
  assert.equal(
    result.reasons.some((reason) =>
      reason.includes("unresolved reviewer request_changes remains for current head")
    ),
    true
  );
  assert.equal(result.evidence.includes("reviewerConflict=unresolved_request_changes"), true);
});

test("approve auto merge allows same-head approve after trusted objection resolution marker", () => {
  const result = evaluateApproveAutoMerge({
    policyMode: ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE,
    pullRequest: mergeablePullRequest,
    reviewLoop: {
      ...approvedReviewLoop,
      reviewTimeline: [
        {
          type: "codex_fallback",
          reviewer: "codex",
          recommendedAction: "request_changes",
          headSha: "abc123",
          url: "https://github.com/sample-org/vtdd-v2-p/pull/10#issuecomment-request",
          createdAt: "2026-05-29T10:23:40Z"
        },
        {
          type: "reviewer_objection_resolution",
          reviewer: "vtdd-codex",
          headSha: "abc123",
          url: "https://github.com/sample-org/vtdd-v2-p/pull/10#issuecomment-response",
          createdAt: "2026-05-29T10:23:43Z"
        },
        {
          type: "codex_fallback",
          reviewer: "codex",
          recommendedAction: "approve",
          headSha: "abc123",
          url: "https://github.com/sample-org/vtdd-v2-p/pull/10#issuecomment-approve",
          createdAt: "2026-05-29T10:23:45Z"
        }
      ]
    },
    checkRuns: successChecks
  });

  assert.equal(result.allowed, true);
  assert.equal(result.evidence.includes("reviewerConflict=none"), true);
});

test("approve auto merge blocks reviewer pending marker after same-head approve", () => {
  const result = evaluateApproveAutoMerge({
    policyMode: ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE,
    pullRequest: mergeablePullRequest,
    reviewLoop: {
      ...approvedReviewLoop,
      reviewTimeline: [
        {
          type: "gemini_review",
          reviewer: "gemini",
          recommendedAction: "approve",
          headSha: "abc123",
          url: "https://github.com/sample-org/vtdd-v2-p/pull/10#issuecomment-approve",
          createdAt: "2026-05-29T10:23:45Z"
        },
        {
          type: "codex_fallback",
          reviewer: "codex",
          status: "requested",
          headSha: "abc123",
          url: "https://github.com/sample-org/vtdd-v2-p/pull/10#issuecomment-requested",
          createdAt: "2026-05-29T10:23:50Z"
        }
      ]
    },
    checkRuns: successChecks
  });

  assert.equal(result.allowed, false);
  assert.equal(
    result.reasons.some((reason) =>
      reason.includes("reviewer review is pending after latest approve for current head")
    ),
    true
  );
  assert.equal(result.evidence.includes("reviewerConflict=post_approve_review_pending"), true);
});

test("approve auto merge blocks request changes marker after same-head approve", () => {
  const result = evaluateApproveAutoMerge({
    policyMode: ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE,
    pullRequest: mergeablePullRequest,
    reviewLoop: {
      ...approvedReviewLoop,
      reviewTimeline: [
        {
          type: "gemini_review",
          reviewer: "gemini",
          recommendedAction: "approve",
          headSha: "abc123",
          url: "https://github.com/sample-org/vtdd-v2-p/pull/10#issuecomment-approve",
          createdAt: "2026-05-29T10:23:45Z"
        },
        {
          type: "codex_fallback",
          reviewer: "codex",
          status: "completed",
          recommendedAction: "request_changes",
          headSha: "abc123",
          url: "https://github.com/sample-org/vtdd-v2-p/pull/10#issuecomment-request",
          createdAt: "2026-05-29T10:23:55Z"
        }
      ]
    },
    checkRuns: successChecks
  });

  assert.equal(result.allowed, false);
  assert.equal(
    result.reasons.some((reason) =>
      reason.includes("unresolved reviewer request_changes remains for current head")
    ),
    true
  );
  assert.equal(result.evidence.includes("reviewerConflict=post_approve_request_changes"), true);
});

test("approve auto merge remains opt-in by policy or labels", () => {
  assert.equal(resolveApproveAutoMergePolicy({}), ApproveAutoMergePolicyMode.MANUAL);
  assert.equal(
    resolveApproveAutoMergePolicy({ labels: [{ name: "vtdd:auto-merge" }] }),
    ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE
  );
});

test("approve auto merge evidence comments are searchable by 自動マージ", () => {
  const evaluation = evaluateApproveAutoMerge({
    policyMode: ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE,
    pullRequest: mergeablePullRequest,
    reviewLoop: approvedReviewLoop,
    checkRuns: successChecks
  });
  const candidate = formatApproveAutoMergeCandidateComment({
    pullRequest: mergeablePullRequest,
    evaluation
  });
  const executed = formatApproveAutoMergeExecutedComment({
    pullRequest: mergeablePullRequest,
    evaluation,
    mergeResult: {
      sha: "merge789",
      message: "Pull Request successfully merged"
    },
    memoryWrite: {
      ok: true,
      recordType: "working_memory",
      recordId: "working_memory_448_auto_merge_10"
    }
  });

  assert.equal(candidate.includes(APPROVE_AUTO_MERGE_CANDIDATE_MARKER), true);
  assert.equal(candidate.includes("自動マージ"), true);
  assert.equal(executed.includes(APPROVE_AUTO_MERGE_EXECUTED_MARKER), true);
  assert.equal(executed.includes("merge789"), true);
  assert.equal(executed.includes("自動マージ"), true);
  assert.equal(executed.includes("RAG 保存"), true);
  assert.equal(executed.includes("status: `persisted`"), true);
  assert.equal(executed.includes("working_memory_448_auto_merge_10"), true);
});

test("approve auto merge builds persisted working memory payload", () => {
  const evaluation = evaluateApproveAutoMerge({
    policyMode: ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE,
    pullRequest: mergeablePullRequest,
    reviewLoop: approvedReviewLoop,
    checkRuns: successChecks
  });
  const record = buildApproveAutoMergeMemoryRecord({
    pullRequest: mergeablePullRequest,
    evaluation,
    mergeResult: {
      sha: "merge789",
      message: "Pull Request successfully merged"
    }
  });

  assert.equal(record.recordType, "working_memory");
  assert.equal(record.confirmed, true);
  assert.equal(record.repository, "sample-org/vtdd-v2-p");
  assert.equal(record.relatedIssue, 448);
  assert.equal(record.details.includes("Merge SHA: merge789"), true);
  assert.equal(record.tags.includes("auto_merge"), true);
});

test("approve auto merge executed comment does not overclaim failed RAG persistence", () => {
  const evaluation = evaluateApproveAutoMerge({
    policyMode: ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE,
    pullRequest: mergeablePullRequest,
    reviewLoop: approvedReviewLoop,
    checkRuns: successChecks
  });
  const executed = formatApproveAutoMergeExecutedComment({
    pullRequest: mergeablePullRequest,
    evaluation,
    mergeResult: {
      sha: "merge789",
      message: "Pull Request successfully merged"
    },
    memoryWrite: {
      ok: false,
      error: "memory_write_failed",
      reason: "runtime rejected the write"
    }
  });

  assert.equal(executed.includes("status: `failed`"), true);
  assert.equal(executed.includes("RAGへは保存されていません"), true);
  assert.equal(executed.includes("status: `persisted`"), false);
});

test("Gemini reviewer parser preserves reviewed head SHA for auto merge gate", () => {
  const parsed = parseGeminiReviewComment({
    body: [
      "<!-- vtdd:reviewer=gemini -->",
      "## VTDD Gemini レビュー",
      "- Head SHA: `abc123`",
      "- Recommended action: `approve`",
      "### 重要指摘",
      "- 重大 blocker は見つかりませんでした。",
      "### 残リスク",
      "- なし。"
    ].join("\n")
  });

  assert.equal(parsed.recommendedAction, "approve");
  assert.equal(parsed.headSha, "abc123");
});
