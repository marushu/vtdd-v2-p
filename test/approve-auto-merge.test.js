import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVE_AUTO_MERGE_CANDIDATE_MARKER,
  APPROVE_AUTO_MERGE_EXECUTED_MARKER,
  ApproveAutoMergePolicyMode,
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
    }
  });

  assert.equal(candidate.includes(APPROVE_AUTO_MERGE_CANDIDATE_MARKER), true);
  assert.equal(candidate.includes("自動マージ"), true);
  assert.equal(executed.includes(APPROVE_AUTO_MERGE_EXECUTED_MARKER), true);
  assert.equal(executed.includes("merge789"), true);
  assert.equal(executed.includes("自動マージ"), true);
  assert.equal(executed.includes("RAG 保存候補"), true);
  assert.equal(executed.includes('"recordType": "working_memory"'), true);
  assert.equal(executed.includes('"auto_merge"'), true);
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
