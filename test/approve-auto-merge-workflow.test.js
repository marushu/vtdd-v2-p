import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  isMergeAlreadyInProgressError,
  resolvePullNumbers
} from "../scripts/run-approve-auto-merge.mjs";

const workflow = fs.readFileSync(".github/workflows/approve-auto-merge.yml", "utf8");
const script = fs.readFileSync("scripts/run-approve-auto-merge.mjs", "utf8");

test("approve auto merge workflow runs from trusted main and uses App token", () => {
  assert.equal(workflow.includes("name: approve-auto-merge"), true);
  assert.equal(workflow.includes("workflow_run:"), true);
  assert.equal(workflow.includes("guarded-autonomy-required-checks"), true);
  assert.equal(workflow.includes("gemini-pr-review"), true);
  assert.equal(workflow.includes("codex-pr-review-fallback"), true);
  assert.equal(workflow.includes("uses: actions/create-github-app-token@v1"), true);
  assert.equal(workflow.includes("ref: main"), true);
  assert.equal(workflow.includes("VTDD_RUNTIME_URL"), true);
  assert.equal(workflow.includes("VTDD_GATEWAY_BEARER_TOKEN"), true);
  assert.equal(workflow.includes("node scripts/run-approve-auto-merge.mjs"), true);
});

test("approve auto merge script records searchable evidence before and after merge", () => {
  assert.equal(script.includes("formatApproveAutoMergeCandidateComment"), true);
  assert.equal(script.includes("formatApproveAutoMergeExecutedComment"), true);
  assert.equal(script.includes("自動マージ"), true);
  assert.equal(script.includes("/merge"), true);
  assert.equal(script.includes("/v2/events/github-actions"), true);
  assert.equal(script.includes("changeSummary: pullRequest.title"), true);
  assert.equal(script.includes("pullNumber: pullRequest.number"), true);
  assert.equal(script.includes("/v2/action/memory-write"), true);
  assert.equal(script.includes("persistApproveAutoMergeMemory"), true);
  assert.equal(script.includes("notifyDashboardEvent"), true);
  assert.equal(script.includes("evaluateApproveAutoMerge"), true);
});

test("approve auto merge treats concurrent GitHub merge race as idempotent", () => {
  const raceError = new Error("GitHub API 405: Merge already in progress");
  raceError.status = 405;

  assert.equal(isMergeAlreadyInProgressError(raceError), true);
  assert.equal(script.includes("merge is already in progress by another approve-auto-merge run"), true);

  const unrelated405 = new Error("GitHub API 405: Method Not Allowed");
  unrelated405.status = 405;
  assert.equal(isMergeAlreadyInProgressError(unrelated405), false);

  const unrelatedMergeError = new Error("GitHub API 500: Merge already in progress");
  unrelatedMergeError.status = 500;
  assert.equal(isMergeAlreadyInProgressError(unrelatedMergeError), false);
});

test("approve auto merge resolves workflow_run PR candidate from head SHA when payload omits pull_requests", async () => {
  const calls = [];
  const pullNumbers = await resolvePullNumbers({
    payload: {
      workflow_run: {
        head_sha: "head-536",
        pull_requests: []
      }
    },
    env: {},
    repository: "sample-org/vtdd-v2-p",
    githubFetch: async (path) => {
      calls.push(path);
      assert.equal(path, "/repos/sample-org/vtdd-v2-p/commits/head-536/pulls");
      return [
        { number: 537, state: "open" },
        { number: 530, state: "closed" }
      ];
    }
  });

  assert.deepEqual(pullNumbers, [537]);
  assert.deepEqual(calls, ["/repos/sample-org/vtdd-v2-p/commits/head-536/pulls"]);
});

test("approve auto merge does not resolve ambiguous workflow_run head SHA PR candidates", async () => {
  const pullNumbers = await resolvePullNumbers({
    payload: {
      workflow_run: {
        head_sha: "shared-head",
        pull_requests: []
      }
    },
    env: {},
    repository: "sample-org/vtdd-v2-p",
    githubFetch: async (path) => {
      assert.equal(path, "/repos/sample-org/vtdd-v2-p/commits/shared-head/pulls");
      return [
        { number: 537, state: "open" },
        { number: 538, state: "open" }
      ];
    }
  });

  assert.deepEqual(pullNumbers, []);
});

test("approve auto merge resolves workflow_run PR candidate from display title when head SHA is trusted main", async () => {
  const calls = [];
  const pullNumbers = await resolvePullNumbers({
    payload: {
      workflow_run: {
        head_sha: "main-sha",
        display_title: "Issue #536 Dashboard通常閲覧でstale passkey cookieをAccess認証へfallbackする",
        pull_requests: []
      }
    },
    env: {},
    repository: "sample-org/vtdd-v2-p",
    githubFetch: async (path) => {
      calls.push(path);
      if (path === "/repos/sample-org/vtdd-v2-p/commits/main-sha/pulls") {
        return [];
      }
      assert.equal(path, "/repos/sample-org/vtdd-v2-p/pulls?state=open&per_page=100");
      return [
        {
          number: 537,
          title: "Issue #536 Dashboard通常閲覧でstale passkey cookieをAccess認証へfallbackする"
        },
        {
          number: 536,
          title: "unrelated"
        }
      ];
    }
  });

  assert.deepEqual(pullNumbers, [537]);
  assert.deepEqual(calls, [
    "/repos/sample-org/vtdd-v2-p/commits/main-sha/pulls",
    "/repos/sample-org/vtdd-v2-p/pulls?state=open&per_page=100"
  ]);
});

test("approve auto merge does not resolve ambiguous workflow_run display title matches", async () => {
  const pullNumbers = await resolvePullNumbers({
    payload: {
      workflow_run: {
        head_sha: "main-sha",
        display_title: "Shared title",
        pull_requests: []
      }
    },
    env: {},
    repository: "sample-org/vtdd-v2-p",
    githubFetch: async (path) => {
      if (path === "/repos/sample-org/vtdd-v2-p/commits/main-sha/pulls") {
        return [];
      }
      assert.equal(path, "/repos/sample-org/vtdd-v2-p/pulls?state=open&per_page=100");
      return [
        { number: 539, title: "Shared title" },
        { number: 540, title: "Shared title" }
      ];
    }
  });

  assert.deepEqual(pullNumbers, []);
});
