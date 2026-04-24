import test from "node:test";
import assert from "node:assert/strict";
import {
  GEMINI_PR_REVIEW_MARKER,
  buildGeminiReviewRequestBody,
  buildPullRequestDiff,
  buildPullRequestReviewContext,
  extractReviewerResponseFromGemini,
  findExistingGeminiReviewComment,
  formatGeminiReviewComment,
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
      criticalFindings: ["Scope drift around issue traceability."],
      risks: ["Human should confirm non-goals remain bounded."],
      recommendedAction: "request_changes"
    }
  });

  assert.equal(body.includes(GEMINI_PR_REVIEW_MARKER), true);
  assert.equal(body.includes("VTDD Gemini Critical Review"), true);
  assert.equal(body.includes("request_changes"), true);
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
