import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReviewerSignalTruth,
  collectCodexFallbackSignals,
  collectFormalReviewTruth,
  collectGeminiReviewerSignals
} from "../src/core/reviewer-marker-truth.js";

test("reviewer marker truth collects trusted Gemini markers and ignores untrusted copies", () => {
  const result = collectGeminiReviewerSignals({
    issueComments: [
      {
        user: { login: "random-user" },
        body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini Critical Review\n\n- Recommended action: `approve`"
      },
      {
        user: { login: "vtdd-codex" },
        body: [
          "<!-- vtdd:reviewer=gemini -->",
          "## VTDD Gemini Critical Review",
          "",
          "- Recommended action: `request_changes`",
          "",
          "### Critical Findings",
          "- Runtime path is not connected."
        ].join("\n"),
        url: "https://github.com/example/repo/pull/1#issuecomment-1"
      }
    ]
  });

  assert.equal(result.totalCount, 1);
  assert.equal(result.blockingCount, 1);
  assert.equal(result.latestEvidence.recommendedAction, "request_changes");
  assert.equal(result.latestEvidence.url, "https://github.com/example/repo/pull/1#issuecomment-1");
});

test("reviewer marker truth selects latest trusted marker by timestamp when comment order is stale", () => {
  const result = collectGeminiReviewerSignals({
    issueComments: [
      {
        user: { login: "vtdd-codex" },
        createdAt: "2026-05-12T04:40:00Z",
        body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini Critical Review\n\n- Recommended action: `approve`"
      },
      {
        user: { login: "vtdd-codex" },
        createdAt: "2026-05-12T04:30:00Z",
        body: "<!-- vtdd:reviewer=gemini -->\n## VTDD Gemini Critical Review\n\n- Recommended action: `request_changes`"
      }
    ]
  });

  assert.equal(result.totalCount, 2);
  assert.equal(result.latestEvidence.recommendedAction, "approve");
});

test("reviewer marker truth normalizes Codex fallback evidence with body for readiness checks", () => {
  const result = collectCodexFallbackSignals({
    issueComments: [
      {
        user: { login: "vtdd-codex[bot]" },
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "## VTDD Codex Reviewer Fallback Request",
          "",
          "- Status: `completed`",
          "- Recommended action: `approve`",
          "",
          "### Critical Findings",
          "- None"
        ].join("\n"),
        url: "https://github.com/example/repo/pull/2#issuecomment-2"
      }
    ]
  });

  assert.equal(result.completed, true);
  assert.equal(result.blocking, false);
  assert.equal(result.latestEvidence.reviewer, "codex");
  assert.equal(result.latestEvidence.recommendedAction, "approve");
  assert.equal(result.latestEvidence.body.includes("Critical Findings"), true);
});

test("reviewer marker truth ignores untrusted Codex connector setup blockers", () => {
  const result = collectCodexFallbackSignals({
    issueComments: [
      {
        user: { login: "random-user" },
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "## VTDD Codex Reviewer Fallback Request",
          "",
          "- Status: `blocked`",
          "- Reason: `github_connector_setup_required`"
        ].join("\n")
      },
      {
        user: { login: "vtdd-codex[bot]" },
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "## VTDD Codex Reviewer Fallback Request",
          "",
          "- Status: `completed`",
          "- Recommended action: `approve`",
          "",
          "### Critical Findings",
          "- None"
        ].join("\n")
      }
    ]
  });

  assert.equal(result.blocked, false);
  assert.equal(result.completed, true);
  assert.equal(result.latestEvidence.recommendedAction, "approve");
});

test("reviewer marker truth accepts Codex connector setup blockers only from connector actor", () => {
  const result = collectCodexFallbackSignals({
    issueComments: [
      {
        user: { login: "chatgpt-codex-connector" },
        body: "To use Codex here, [create a Codex account and connect to github](https://chatgpt.com/codex/cloud/settings/connectors)."
      }
    ]
  });

  assert.equal(result.blocked, true);
  assert.equal(result.completed, false);
  assert.equal(result.latestEvidence, null);
});

test("reviewer marker truth lets newer completed Codex fallback supersede older connector blocker", () => {
  const result = collectCodexFallbackSignals({
    issueComments: [
      {
        user: { login: "chatgpt-codex-connector" },
        createdAt: "2026-05-12T04:40:00Z",
        body: "To use Codex here, [create a Codex account and connect to github](https://chatgpt.com/codex/cloud/settings/connectors)."
      },
      {
        user: { login: "vtdd-codex[bot]" },
        createdAt: "2026-05-12T04:50:00Z",
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "## VTDD Codex Reviewer Fallback Request",
          "",
          "- Status: `completed`",
          "- Recommended action: `approve`",
          "",
          "### Critical Findings",
          "- 重要指摘なし。"
        ].join("\n")
      }
    ]
  });

  assert.equal(result.blocked, false);
  assert.equal(result.completed, true);
  assert.equal(result.latestEvidence.recommendedAction, "approve");
});

test("reviewer marker truth keeps newer connector blocker over older Codex fallback", () => {
  const result = collectCodexFallbackSignals({
    issueComments: [
      {
        user: { login: "vtdd-codex[bot]" },
        createdAt: "2026-05-12T04:40:00Z",
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "## VTDD Codex Reviewer Fallback Request",
          "",
          "- Status: `completed`",
          "- Recommended action: `approve`"
        ].join("\n")
      },
      {
        user: { login: "chatgpt-codex-connector" },
        createdAt: "2026-05-12T04:50:00Z",
        body: "To use Codex here, [create a Codex account and connect to github](https://chatgpt.com/codex/cloud/settings/connectors)."
      }
    ]
  });

  assert.equal(result.blocked, true);
  assert.equal(result.completed, false);
  assert.equal(result.latestEvidence, null);
});

test("reviewer marker truth keeps formal changes-requested blocking over marker approval", () => {
  const formalReviewTruth = collectFormalReviewTruth({
    reviewDecision: "APPROVED",
    reviews: [
      { user: { login: "gemini" }, state: "APPROVED" },
      { user: { login: "maintainer" }, state: "CHANGES_REQUESTED" }
    ]
  });
  const signalTruth = buildReviewerSignalTruth({
    reviewer: "gemini",
    reviewerStatus: "gemini_review_available",
    reviewerEvidence: { recommendedAction: "approve" },
    formalReviewTruth
  });

  assert.equal(formalReviewTruth.hasFormalApproval, true);
  assert.equal(formalReviewTruth.blocking, true);
  assert.equal(signalTruth.mergeReviewTruth.satisfied, false);
  assert.equal(signalTruth.mergeReviewTruth.blocked, true);
  assert.equal(signalTruth.mergeReviewTruth.reason, "github_formal_review_changes_requested");
});
