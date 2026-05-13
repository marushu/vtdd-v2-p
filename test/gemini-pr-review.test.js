import test from "node:test";
import assert from "node:assert/strict";
import {
  GEMINI_PR_REVIEW_MARKER,
  REVIEWER_OBJECTION_RESOLUTION_MARKER,
  buildGeminiReviewRequestBody,
  buildPullRequestDiff,
  buildPullRequestReviewContext,
  buildReviewResponseSummary,
  extractReviewerResponseFromGemini,
  findExistingGeminiReviewComment,
  formatReviewResponseSummary,
  formatGeminiReviewComment,
  normalizeMentionLogin,
  parseGeminiReviewComment,
  resolveOperatorMention,
  resolveGeminiReviewTrigger
} from "../src/core/index.js";

test("pull_request_target opened event triggers Gemini review", () => {
  const result = resolveGeminiReviewTrigger({
    eventName: "pull_request_target",
    payload: {
      action: "opened",
      pull_request: {
        number: 12,
        draft: false
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.shouldReview, true);
  assert.equal(result.value.pullRequestNumber, 12);
});

test("pull_request_target draft opened event still triggers Gemini review", () => {
  const result = resolveGeminiReviewTrigger({
    eventName: "pull_request_target",
    payload: {
      action: "opened",
      pull_request: {
        number: 12,
        draft: true
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.shouldReview, true);
  assert.equal(result.value.trigger, "pull_request_target:opened");
  assert.equal(result.value.pullRequestNumber, 12);
});

test("issue_comment on PR from bot marker is skipped", () => {
  const result = resolveGeminiReviewTrigger({
    eventName: "issue_comment",
    payload: {
      issue: {
        number: 12,
        pull_request: {
          url: "https://api.github.com/repos/example/repo/pulls/12"
        }
      },
      comment: {
        body: `${GEMINI_PR_REVIEW_MARKER}\nhello`
      },
      sender: {
        login: "github-actions[bot]"
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.shouldReview, false);
});

test("issue_comment on PR from bot objection resolution triggers Gemini re-check", () => {
  const result = resolveGeminiReviewTrigger({
    eventName: "issue_comment",
    payload: {
      issue: {
        number: 207,
        pull_request: {
          url: "https://api.github.com/repos/marushu/vtdd-v2-p/pulls/207"
        }
      },
      comment: {
        body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
## VTDD Reviewer Objection Resolution

The manual-test objection has been addressed because revision-applied marker is present.`
      },
      sender: {
        login: "vtdd-codex[bot]"
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.shouldReview, true);
  assert.equal(result.value.trigger, "issue_comment:created");
  assert.equal(result.value.pullRequestNumber, 207);
});

test("issue_comment on PR from Gemini marker still skips self-trigger loop", () => {
  const result = resolveGeminiReviewTrigger({
    eventName: "issue_comment",
    payload: {
      issue: {
        number: 207,
        pull_request: {
          url: "https://api.github.com/repos/marushu/vtdd-v2-p/pulls/207"
        }
      },
      comment: {
        body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini Critical Review

- Recommended action: \`approve\``
      },
      sender: {
        login: "vtdd-codex[bot]"
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.shouldReview, false);
  assert.equal(result.value.reason, "bot_or_marker_comment");
});

test("buildPullRequestDiff truncates large diffs", () => {
  const diff = buildPullRequestDiff(
    [
      {
        filename: "src/index.js",
        status: "modified",
        patch: "x".repeat(200)
      }
    ],
    { maxCharacters: 80 }
  );

  assert.equal(diff.includes("[diff truncated]"), true);
});

test("buildPullRequestReviewContext includes bounded PR metadata", () => {
  const context = buildPullRequestReviewContext({
    repository: "sample/repo",
    trigger: "pull_request_target:opened",
    pullRequest: {
      number: 5,
      title: "Implement reviewer loop",
      body: "Adds runtime review path.",
      state: "open",
      base: { ref: "main" },
      head: { ref: "codex/issue-9" },
      user: { login: "codex-user" }
    },
    files: [{ filename: "src/core/reviewer.js", status: "added" }],
    issueComments: [{ user: { login: "owner" }, body: "Please re-check this path." }],
    reviewComments: [{ user: { login: "reviewer" }, body: "This branch needs another look." }],
    reviews: [{ user: { login: "reviewer" }, state: "COMMENTED", body: "Overall risky." }]
  });

  assert.equal(context.includes("Repository: sample/repo"), true);
  assert.equal(context.includes("Please re-check this path."), true);
  assert.equal(context.includes("Overall risky."), true);
});

test("buildPullRequestReviewContext keeps objection resolution evidence", () => {
  const context = buildPullRequestReviewContext({
    repository: "sample/repo",
    trigger: "issue_comment:created",
    pullRequest: {
      number: 207,
      title: "Issue #206: VTDD VPS runner handoff",
      body: "Smoke test.",
      state: "open",
      base: { ref: "main" },
      head: { ref: "codex/issue-206" },
      user: { login: "marushu" }
    },
    files: [{ filename: "docs/mvp/e2e/vps-revise-pr-objection-smoke.md", status: "added" }],
    issueComments: [
      {
        user: { login: "vtdd-codex[bot]" },
        body: `${GEMINI_PR_REVIEW_MARKER}\nold review`
      },
      {
        user: { login: "vtdd-codex[bot]" },
        body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
The manual-test objection has been addressed because revision-applied marker is present.`
      }
    ],
    reviewComments: [],
    reviews: []
  });

  assert.equal(context.includes("old review"), false);
  assert.equal(context.includes("revision-applied marker is present"), true);
});

test("buildReviewResponseSummary maps request_changes findings to response evidence", () => {
  const reviewerComment = {
    user: { login: "vtdd-codex[bot]" },
    url: "https://github.com/example/repo/pull/207#issuecomment-review",
    created_at: "2026-05-13T01:00:00Z",
    updated_at: "2026-05-13T01:00:00Z",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- manual-test objection must be addressed

### 残リスク
- rerun evidence must be visible`
  };
  const responseComment = {
    user: { login: "vtdd-codex[bot]" },
    url: "https://github.com/example/repo/pull/207#issuecomment-response",
    created_at: "2026-05-13T01:01:00Z",
    body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
## VTDD Reviewer Objection Resolution

Addressed finding: manual-test objection must be addressed
Evidence: node --test test/gemini-pr-review.test.js`
  };

  const summary = buildReviewResponseSummary({
    pullRequest: {
      body: "- Unit: node --test test/gemini-pr-review.test.js"
    },
    files: [{ filename: "test/gemini-pr-review.test.js", status: "modified" }],
    issueComments: [reviewerComment, responseComment]
  });

  assert.equal(summary.currentRecommendedAction, "request_changes");
  assert.deepEqual(summary.criticalFindings, ["manual-test objection must be addressed"]);
  assert.deepEqual(summary.unresolvedItems, []);
  assert.deepEqual(summary.findingResponses.map((item) => [item.id, item.status]), [
    ["critical-1", "addressed"]
  ]);
  assert.equal(summary.complete, true);
  assert.equal(summary.filesChangedInResponse.includes("test/gemini-pr-review.test.js (modified)"), true);
  assert.equal(summary.testsEvidenceRun.some((item) => item.includes("node --test")), true);
  assert.equal(formatReviewResponseSummary(summary).includes("Response completeness: complete"), true);
});

test("buildReviewResponseSummary supports explicit critical finding ids and unresolved directives", () => {
  const reviewerComment = {
    user: { login: "vtdd-codex[bot]" },
    url: "https://github.com/example/repo/pull/314#issuecomment-review",
    created_at: "2026-05-13T02:00:00Z",
    updated_at: "2026-05-13T02:00:00Z",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- response summary needs explicit mapping
- live E2E is not available in this slice

### 残リスク
- explicit mapping must stay machine-readable`
  };
  const responseComment = {
    user: { login: "vtdd-codex[bot]" },
    created_at: "2026-05-13T02:01:00Z",
    body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
## VTDD Reviewer Objection Resolution

Addresses: critical-1
Evidence: node --test test/gemini-pr-review.test.js
Unresolved: critical-2 remains blocked until deploy/live Butler E2E is authorized.`
  };

  const summary = buildReviewResponseSummary({
    pullRequest: {},
    files: [],
    issueComments: [reviewerComment, responseComment]
  });

  assert.deepEqual(summary.findingResponses.map((item) => [item.id, item.status]), [
    ["critical-1", "addressed"],
    ["critical-2", "unresolved"]
  ]);
  assert.deepEqual(summary.unresolvedItems, ["live E2E is not available in this slice"]);
  assert.match(formatReviewResponseSummary(summary), /critical-1: addressed/);
  assert.match(formatReviewResponseSummary(summary), /critical-2: unresolved/);
});

test("buildReviewResponseSummary chooses latest reviewer marker by timestamp across comment arrays", () => {
  const olderReviewComment = {
    user: { login: "vtdd-codex[bot]" },
    url: "https://github.com/example/repo/pull/314#discussion-old",
    created_at: "2026-05-13T01:00:00Z",
    updated_at: "2026-05-13T01:00:00Z",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- old finding should not be latest`
  };
  const newerIssueComment = {
    user: { login: "vtdd-codex[bot]" },
    url: "https://github.com/example/repo/pull/314#issuecomment-new",
    created_at: "2026-05-13T02:00:00Z",
    updated_at: "2026-05-13T02:30:00Z",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- latest finding must be used`
  };
  const responseComment = {
    user: { login: "marushu" },
    author_association: "OWNER",
    created_at: "2026-05-13T02:31:00Z",
    body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
Addresses: critical-1
Evidence: npm test`
  };

  const summary = buildReviewResponseSummary({
    pullRequest: {},
    issueComments: [newerIssueComment, responseComment],
    reviewComments: [olderReviewComment]
  });

  assert.equal(summary.reviewerCommentUrl, "https://github.com/example/repo/pull/314#issuecomment-new");
  assert.deepEqual(summary.criticalFindings, ["latest finding must be used"]);
  assert.deepEqual(summary.unresolvedItems, []);
});

test("buildReviewResponseSummary ignores stale and untrusted objection resolution comments", () => {
  const reviewerComment = {
    user: { login: "vtdd-codex[bot]" },
    url: "https://github.com/example/repo/pull/314#issuecomment-review",
    created_at: "2026-05-13T03:00:00Z",
    updated_at: "2026-05-13T03:00:00Z",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- trusted response must be after current review`
  };
  const staleOwnerResponse = {
    user: { login: "marushu" },
    author_association: "OWNER",
    created_at: "2026-05-13T02:00:00Z",
    body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
Addresses: critical-1
Evidence: old npm test`
  };
  const untrustedNewResponse = {
    user: { login: "external-user" },
    author_association: "NONE",
    created_at: "2026-05-13T03:01:00Z",
    body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
Addresses: critical-1
Evidence: untrusted claim`
  };

  const summary = buildReviewResponseSummary({
    pullRequest: {},
    issueComments: [staleOwnerResponse, reviewerComment, untrustedNewResponse]
  });

  assert.deepEqual(summary.responseCommentUrls, []);
  assert.deepEqual(summary.findingResponses.map((item) => [item.id, item.status]), [
    ["critical-1", "unresolved"]
  ]);
  assert.deepEqual(summary.unresolvedItems, ["trusted response must be after current review"]);
  assert.equal(summary.complete, false);
});

test("buildReviewResponseSummary excludes response comments without a valid created_at boundary", () => {
  const reviewerComment = {
    user: { login: "vtdd-codex[bot]" },
    created_at: "2026-05-13T04:00:00Z",
    updated_at: "2026-05-13T04:00:00Z",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- evidence needs a trustworthy timestamp`
  };
  const missingTimestampResponse = {
    user: { login: "marushu" },
    author_association: "OWNER",
    body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
Addresses: critical-1
Evidence: missing timestamp`
  };
  const invalidTimestampResponse = {
    user: { login: "marushu" },
    author_association: "OWNER",
    created_at: "not-a-date",
    body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
Addresses: critical-1
Evidence: invalid timestamp`
  };

  const summary = buildReviewResponseSummary({
    pullRequest: {},
    issueComments: [reviewerComment, missingTimestampResponse, invalidTimestampResponse]
  });

  assert.deepEqual(summary.responseCommentUrls, []);
  assert.deepEqual(summary.findingResponses.map((item) => [item.id, item.status]), [
    ["critical-1", "unresolved"]
  ]);
  assert.deepEqual(summary.unresolvedItems, ["evidence needs a trustworthy timestamp"]);
});

test("buildReviewResponseSummary uses response created_at, not updated_at, for stale exclusion", () => {
  const reviewerComment = {
    user: { login: "vtdd-codex[bot]" },
    created_at: "2026-05-13T05:00:00Z",
    updated_at: "2026-05-13T05:00:00Z",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- old edited response must not count`
  };
  const editedOldResponse = {
    user: { login: "marushu" },
    author_association: "OWNER",
    created_at: "2026-05-13T04:59:00Z",
    updated_at: "2026-05-13T05:01:00Z",
    body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
Addresses: critical-1
Evidence: edited after reviewer marker`
  };

  const summary = buildReviewResponseSummary({
    pullRequest: {},
    issueComments: [editedOldResponse, reviewerComment]
  });

  assert.deepEqual(summary.responseCommentUrls, []);
  assert.deepEqual(summary.findingResponses.map((item) => [item.id, item.status]), [
    ["critical-1", "unresolved"]
  ]);
  assert.deepEqual(summary.unresolvedItems, ["old edited response must not count"]);
});

test("buildReviewResponseSummary treats same-timestamp response comments as unresolved", () => {
  const reviewerComment = {
    user: { login: "vtdd-codex[bot]" },
    created_at: "2026-05-13T06:00:00Z",
    updated_at: "2026-05-13T06:00:00Z",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- same timestamp is ambiguous`
  };
  const sameTimestampResponse = {
    user: { login: "marushu" },
    author_association: "OWNER",
    created_at: "2026-05-13T06:00:00Z",
    body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
Addresses: critical-1
Evidence: same timestamp`
  };

  const summary = buildReviewResponseSummary({
    pullRequest: {},
    issueComments: [reviewerComment, sameTimestampResponse]
  });

  assert.deepEqual(summary.responseCommentUrls, []);
  assert.deepEqual(summary.findingResponses.map((item) => [item.id, item.status]), [
    ["critical-1", "unresolved"]
  ]);
  assert.deepEqual(summary.unresolvedItems, ["same timestamp is ambiguous"]);
});

test("buildReviewResponseSummary ignores reviewer markers without valid timestamps", () => {
  const invalidReviewerComment = {
    user: { login: "vtdd-codex[bot]" },
    created_at: "not-a-date",
    updated_at: "zzzz-invalid",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- invalid reviewer marker must not become latest`
  };
  const validApproveComment = {
    user: { login: "vtdd-codex[bot]" },
    created_at: "2026-05-13T07:00:00Z",
    updated_at: "2026-05-13T07:00:00Z",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`approve\`

### 重要指摘
- 報告なし。`
  };
  const responseComment = {
    user: { login: "marushu" },
    author_association: "OWNER",
    created_at: "2026-05-13T07:01:00Z",
    body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
Addresses: critical-1
Evidence: invalid marker should be ignored`
  };

  const summary = buildReviewResponseSummary({
    pullRequest: {},
    issueComments: [validApproveComment, invalidReviewerComment, responseComment]
  });

  assert.equal(summary, null);
});

test("buildReviewResponseSummary treats same-timestamp reviewer markers as ambiguous", () => {
  const firstReviewerComment = {
    user: { login: "vtdd-codex[bot]" },
    created_at: "2026-05-13T08:00:00Z",
    updated_at: "2026-05-13T08:00:00Z",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- first same-time finding`
  };
  const secondReviewerComment = {
    user: { login: "vtdd-codex[bot]" },
    created_at: "2026-05-13T08:00:00Z",
    updated_at: "2026-05-13T08:00:00Z",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- second same-time finding`
  };
  const responseComment = {
    user: { login: "marushu" },
    author_association: "OWNER",
    created_at: "2026-05-13T08:01:00Z",
    body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
Addresses: critical-1
Evidence: array order must not choose a reviewer marker`
  };

  const summary = buildReviewResponseSummary({
    pullRequest: {},
    issueComments: [firstReviewerComment, responseComment],
    reviewComments: [secondReviewerComment]
  });

  assert.equal(summary, null);
});

test("buildReviewResponseSummary uses reviewer updated_at as the explicit latest marker revision time", () => {
  const olderEditedReviewerComment = {
    user: { login: "vtdd-codex[bot]" },
    url: "https://github.com/example/repo/pull/314#issuecomment-edited",
    created_at: "2026-05-13T08:30:00Z",
    updated_at: "2026-05-13T09:30:00Z",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- edited reviewer marker is latest content`
  };
  const newerCreatedReviewerComment = {
    user: { login: "vtdd-codex[bot]" },
    url: "https://github.com/example/repo/pull/314#issuecomment-created",
    created_at: "2026-05-13T09:00:00Z",
    updated_at: "2026-05-13T09:00:00Z",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- created later but edited marker should win`
  };
  const responseComment = {
    user: { login: "marushu" },
    author_association: "OWNER",
    created_at: "2026-05-13T09:31:00Z",
    body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
Addresses: critical-1
Evidence: npm test`
  };

  const summary = buildReviewResponseSummary({
    pullRequest: {},
    issueComments: [olderEditedReviewerComment, responseComment],
    reviewComments: [newerCreatedReviewerComment]
  });

  assert.equal(summary.reviewerCommentUrl, "https://github.com/example/repo/pull/314#issuecomment-edited");
  assert.deepEqual(summary.criticalFindings, ["edited reviewer marker is latest content"]);
});

test("buildReviewResponseSummary excludes trusted response comments with duplicate created_at timestamps", () => {
  const reviewerComment = {
    user: { login: "vtdd-codex[bot]" },
    created_at: "2026-05-13T10:00:00Z",
    updated_at: "2026-05-13T10:00:00Z",
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- duplicate response timestamps are ambiguous`
  };
  const firstResponse = {
    user: { login: "marushu" },
    author_association: "OWNER",
    url: "https://github.com/example/repo/pull/314#issuecomment-response-1",
    created_at: "2026-05-13T10:01:00Z",
    body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
Addresses: critical-1
Evidence: first same-time response`
  };
  const secondResponse = {
    user: { login: "marushu" },
    author_association: "OWNER",
    url: "https://github.com/example/repo/pull/314#issuecomment-response-2",
    created_at: "2026-05-13T10:01:00Z",
    body: `${REVIEWER_OBJECTION_RESOLUTION_MARKER}
Addresses: critical-1
Evidence: second same-time response`
  };

  const summary = buildReviewResponseSummary({
    pullRequest: {},
    issueComments: [reviewerComment, firstResponse],
    reviewComments: [secondResponse]
  });

  assert.deepEqual(summary.responseCommentUrls, []);
  assert.deepEqual(summary.findingResponses.map((item) => [item.id, item.status]), [
    ["critical-1", "unresolved"]
  ]);
  assert.deepEqual(summary.unresolvedItems, ["duplicate response timestamps are ambiguous"]);
});

test("parseGeminiReviewComment accepts legacy English reviewer sections", () => {
  const parsed = parseGeminiReviewComment({
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini Critical Review

- Recommended action: \`request_changes\`

### Critical Findings
- English finding still parses

### Risks
- English risk still parses`
  });

  assert.deepEqual(parsed.criticalFindings, ["English finding still parses"]);
  assert.deepEqual(parsed.risks, ["English risk still parses"]);
});

test("buildPullRequestReviewContext passes unresolved response summary to Gemini rerun input", () => {
  const context = buildPullRequestReviewContext({
    repository: "sample/repo",
    trigger: "issue_comment:created",
    pullRequest: {
      number: 314,
      title: "Carry reviewer response evidence",
      body: "PR body",
      state: "open",
      base: { ref: "main" },
      head: { ref: "codex/issue-314" },
      user: { login: "marushu" }
    },
    files: [{ filename: "src/core/gemini-pr-review.js", status: "modified" }],
    issueComments: [
      {
        user: { login: "vtdd-codex[bot]" },
        url: "https://github.com/example/repo/pull/314#issuecomment-review",
        created_at: "2026-05-13T10:30:00Z",
        updated_at: "2026-05-13T10:30:00Z",
        body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini レビュー

- Recommended action: \`request_changes\`

### 重要指摘
- response summary is missing

### 残リスク
- reviewer context may lose evidence`
      }
    ],
    reviewComments: [],
    reviews: []
  });

  assert.equal(context.includes("Review response summary:"), true);
  assert.equal(context.includes("Current recommended action: request_changes"), true);
  assert.equal(context.includes("response summary is missing"), true);
  assert.equal(context.includes("Response completeness: incomplete"), true);
});

test("buildGeminiReviewRequestBody requires diff and context", () => {
  assert.throws(
    () => buildGeminiReviewRequestBody({ prDiff: "", context: "x" }),
    /prDiff is required/
  );
  assert.throws(
    () => buildGeminiReviewRequestBody({ prDiff: "x", context: "" }),
    /context is required/
  );
});

test("buildGeminiReviewRequestBody asks for Japanese-first reviewer prose", () => {
  const body = buildGeminiReviewRequestBody({
    prDiff: "diff --git a/src/index.js b/src/index.js",
    context: "PR context"
  });
  const instruction = body.systemInstruction.parts[0].text;

  assert.equal(instruction.includes("Japanese-first owner-facing prose"), true);
  assert.equal(instruction.includes("Keep recommendedAction as the machine-readable enum value."), true);
  assert.equal(instruction.includes("risks in Japanese"), true);
});

test("extractReviewerResponseFromGemini validates JSON output", () => {
  const result = extractReviewerResponseFromGemini({
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                criticalFindings: ["Potential regression in approval boundary."],
                risks: [],
                recommendedAction: "request_changes"
              })
            }
          ]
        }
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.review.recommendedAction, "request_changes");
});

test("extractReviewerResponseFromGemini rejects non-json output", () => {
  const result = extractReviewerResponseFromGemini({
    candidates: [
      {
        content: {
          parts: [{ text: "not json" }]
        }
      }
    ]
  });

  assert.equal(result.ok, false);
});

test("formatGeminiReviewComment renders marker and sections", () => {
  const body = formatGeminiReviewComment({
    trigger: "pull_request_target:opened",
    model: "gemini-2.5-flash",
    review: {
      criticalFindings: ["Issue traceability の scope drift があります。"],
      risks: ["人間が Non-goals の境界維持を確認してください。"],
      recommendedAction: "request_changes"
    }
  });

  assert.equal(body.includes(GEMINI_PR_REVIEW_MARKER), true);
  assert.equal(body.includes("## Operator Summary"), true);
  assert.equal(body.includes("推奨: merge 非推奨"), true);
  assert.equal(body.includes("merge blocker: はい"), true);
  assert.equal(body.includes("severity: 重要"), true);
  assert.equal(body.indexOf("## Operator Summary") < body.indexOf("## VTDD Gemini レビュー"), true);
  assert.equal(body.includes("VTDD Gemini レビュー"), true);
  assert.equal(body.includes("request_changes"), true);
  assert.equal(body.includes("### 重要指摘"), true);
  assert.equal(body.includes("### 残リスク"), true);
  assert.equal(body.includes("Issue traceability の scope drift があります。"), true);
  assert.equal(body.includes("Reviewer は批評専用です。"), true);
});

test("formatGeminiReviewComment can render a short operator milestone mention", () => {
  const body = formatGeminiReviewComment({
    trigger: "pull_request_target:synchronize",
    model: "gemini-2.5-flash",
    notificationMention: "marushu",
    review: {
      criticalFindings: ["重大 blocker は見つかりませんでした。"],
      risks: ["merge 前に人間が残リスクを確認してください。"],
      recommendedAction: "approve"
    }
  });

  assert.equal(body.split("\n")[1], "@marushu VTDD milestone: review 結果が更新されました。");
  assert.equal(body.split("\n")[2], "## Operator Summary");
  assert.equal(body.includes("推奨: merge 可能（残リスク確認）"), true);
  assert.equal(body.includes("merge blocker: いいえ"), true);
  assert.equal(body.includes("severity: 軽微"), true);
  assert.equal(body.includes("Recommended action: `approve`"), true);
});

test("shared mention normalization filters non-operator GitHub actors", () => {
  assert.equal(normalizeMentionLogin("marushu"), "marushu");
  assert.equal(normalizeMentionLogin("github-actions[bot]"), "");
  assert.equal(normalizeMentionLogin("vtdd-codex-bot"), "");
  assert.equal(normalizeMentionLogin("ghost"), "");
  assert.equal(normalizeMentionLogin("app/vtdd-codex"), "");
});

test("shared operator mention resolution falls back to the first mentionable actor", () => {
  assert.equal(resolveOperatorMention(["github-actions[bot]", "issue-owner", "pr-owner"]), "issue-owner");
  assert.equal(resolveOperatorMention(["ghost", "unknown", "github-actions[bot]"]), "");
});

test("findExistingGeminiReviewComment locates prior marker comment", () => {
  const comment = findExistingGeminiReviewComment([
    { id: 1, body: "ordinary comment" },
    { id: 2, body: `${GEMINI_PR_REVIEW_MARKER}\nexisting review` }
  ]);

  assert.deepEqual(comment, {
    id: 2,
    body: `${GEMINI_PR_REVIEW_MARKER}\nexisting review`
  });
});

test("parseGeminiReviewComment treats approve as non-blocking reviewer evidence", () => {
  const parsed = parseGeminiReviewComment({
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini Critical Review

- Recommended action: \`approve\``,
    url: "https://github.com/example/repo/pull/28#issuecomment-1",
    createdAt: "2026-05-05T06:15:35Z",
    updatedAt: "2026-05-05T09:48:45Z",
    includesCreatedEdit: true
  });

  assert.deepEqual(parsed, {
    reviewer: "gemini",
    recommendedAction: "approve",
    criticalFindings: [],
    risks: [],
    blocking: false,
    url: "https://github.com/example/repo/pull/28#issuecomment-1",
    createdAt: "2026-05-05T06:15:35Z",
    updatedAt: "2026-05-05T09:48:45Z",
    includesCreatedEdit: true,
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini Critical Review

- Recommended action: \`approve\``
  });
});

test("parseGeminiReviewComment accepts GitHub read-plane comment fields", () => {
  const parsed = parseGeminiReviewComment({
    body: `${GEMINI_PR_REVIEW_MARKER}
## VTDD Gemini Critical Review

- Recommended action: \`approve\``,
    htmlUrl: "https://github.com/example/repo/pull/28#issuecomment-2",
    createdAt: "2026-05-05T06:15:35Z",
    updatedAt: "2026-05-05T09:48:45Z"
  });

  assert.equal(parsed.url, "https://github.com/example/repo/pull/28#issuecomment-2");
  assert.equal(parsed.includesCreatedEdit, true);
});

test("issue comment from human remains a rerun trigger", () => {
  const result = resolveGeminiReviewTrigger({
    eventName: "issue_comment",
    payload: {
      issue: {
        number: 11,
        pull_request: {
          url: "https://api.github.com/repos/marushu/vtdd-v2-p/pulls/11"
        }
      },
      comment: {
        body: "Please rerun Gemini review after update."
      },
      sender: {
        login: "marushu"
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.shouldReview, true);
  assert.equal(result.value.pullRequestNumber, 11);
});
