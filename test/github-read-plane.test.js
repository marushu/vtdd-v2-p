import test from "node:test";
import assert from "node:assert/strict";
import { GitHubReadResource, retrieveGitHubReadPlane } from "../src/core/index.js";

test("github read plane lists repositories through GitHub App token", async () => {
  const calls = [];
  const result = await retrieveGitHubReadPlane({
    resource: GitHubReadResource.REPOSITORIES,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_repo_read",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({
            repositories: [
              {
                full_name: "sample-org/vtdd-v2-p",
                name: "vtdd-v2-p",
                private: false,
                default_branch: "main",
                html_url: "https://github.com/sample-org/vtdd-v2-p"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.read.resource, "repositories");
  assert.equal(result.read.records[0].fullName, "sample-org/vtdd-v2-p");
  assert.equal(calls[0].init.headers.authorization, "Bearer ghs_repo_read");
});

test("github read plane lists issues and filters pull request-shaped issue results", async () => {
  const result = await retrieveGitHubReadPlane({
    resource: GitHubReadResource.ISSUES,
    repository: "sample-org/vtdd-v2-p",
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_issue_read",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify([
            {
              number: 42,
              title: "Real issue",
              body: "## Intent\nUse Issue text as the execution spec.",
              state: "open",
              html_url: "https://github.com/sample-org/vtdd-v2-p/issues/42",
              user: { login: "marushu" }
            },
            {
              number: 43,
              title: "PR-shaped issue row",
              state: "open",
              html_url: "https://github.com/sample-org/vtdd-v2-p/pull/43",
              user: { login: "marushu" },
              pull_request: { url: "https://api.github.com/repos/sample-org/vtdd-v2-p/pulls/43" }
            }
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.read.records.length, 1);
  assert.equal(result.read.records[0].number, 42);
  assert.equal(result.read.records[0].body, "## Intent\nUse Issue text as the execution spec.");
});

test("github read plane includes issue body when reading a specific issue", async () => {
  const calls = [];
  const result = await retrieveGitHubReadPlane({
    resource: GitHubReadResource.ISSUES,
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 4,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_issue_read",
      GITHUB_API_FETCH: async (url) => {
        calls.push(url);
        return new Response(
          JSON.stringify({
            number: 4,
            title: "Parent execution loop",
            body: "## Intent\nButler reads the canonical Issue before execution.",
            state: "open",
            html_url: "https://github.com/sample-org/vtdd-v2-p/issues/4",
            user: { login: "marushu" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].endsWith("/repos/sample-org/vtdd-v2-p/issues/4"), true);
  assert.equal(result.read.issueNumber, 4);
  assert.equal(result.read.records[0].body, "## Intent\nButler reads the canonical Issue before execution.");
});

test("github read plane exposes pull request merge truth when reading a specific PR", async () => {
  const calls = [];
  const result = await retrieveGitHubReadPlane({
    resource: GitHubReadResource.PULLS,
    repository: "sample-org/vtdd-v2-p",
    pullNumber: 114,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_pull_read",
      GITHUB_API_FETCH: async (url) => {
        calls.push(url);
        return new Response(
          JSON.stringify({
            number: 114,
            title: "Treat Codex fallback comments as reviewer evidence",
            state: "closed",
            draft: false,
            head: {
              ref: "codex/fix-reviewer-evidence-instructions",
              sha: "d8755b961c6db1a5555320abf067d459686f48b8"
            },
            base: {
              ref: "main",
              sha: "83ba6135f3a01c27948a018c721135a301d938fe"
            },
            merged: true,
            merged_at: "2026-04-29T03:00:45Z",
            merge_commit_sha: "c9ad3c36ed5032bfb4f02bb79d65a8806bcd1047",
            html_url: "https://github.com/sample-org/vtdd-v2-p/pull/114"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].endsWith("/repos/sample-org/vtdd-v2-p/pulls/114"), true);
  assert.equal(result.read.pullNumber, 114);
  assert.equal(result.read.records[0].state, "closed");
  assert.equal(result.read.records[0].merged, true);
  assert.equal(result.read.records[0].mergedAt, "2026-04-29T03:00:45Z");
  assert.equal(result.read.records[0].mergeCommitSha, "c9ad3c36ed5032bfb4f02bb79d65a8806bcd1047");
  assert.equal(result.read.records[0].headSha, "d8755b961c6db1a5555320abf067d459686f48b8");
  assert.equal(result.read.records[0].baseSha, "83ba6135f3a01c27948a018c721135a301d938fe");
});

test("github read plane can filter pull requests by exact head owner and branch", async () => {
  const calls = [];
  const result = await retrieveGitHubReadPlane({
    resource: GitHubReadResource.PULLS,
    repository: "sample-org/vtdd-v2-p",
    state: "all",
    head: "sample-org:codex/issue-135",
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_pull_read",
      GITHUB_API_FETCH: async (url) => {
        calls.push(url);
        return new Response(
          JSON.stringify([
            {
              number: 135,
              title: "Issue #135 runner",
              state: "open",
              head: {
                ref: "codex/issue-135",
                sha: "head-sha",
                repo: {
                  full_name: "sample-org/vtdd-v2-p",
                  owner: { login: "sample-org" }
                }
              },
              base: { ref: "main", sha: "base-sha" },
              html_url: "https://github.com/sample-org/vtdd-v2-p/pull/135"
            }
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].includes("state=all"), true);
  assert.equal(calls[0].includes("head=sample-org%3Acodex%2Fissue-135"), true);
  assert.equal(result.read.records[0].headRef, "codex/issue-135");
  assert.equal(result.read.records[0].headOwner, "sample-org");
});

test("github read plane reads pull reviews, review comments, checks, workflow runs, and branches", async () => {
  const responses = new Map([
    [
      "/repos/sample-org/vtdd-v2-p/pulls/5/reviews?per_page=20",
      [
        {
          id: 1001,
          state: "COMMENTED",
          body: "please revisit",
          user: { login: "gemini-reviewer" },
          submitted_at: "2026-04-26T00:00:00Z",
          html_url: "https://github.com/sample-org/vtdd-v2-p/pull/5#pullrequestreview-1001"
        }
      ]
    ],
    [
      "/repos/sample-org/vtdd-v2-p/pulls/5/comments?per_page=20",
      [
        {
          id: 2002,
          path: "src/app.js",
          body: "nit",
          user: { login: "gemini-reviewer" },
          created_at: "2026-04-26T00:01:00Z",
          html_url: "https://github.com/sample-org/vtdd-v2-p/pull/5#discussion_r2002"
        }
      ]
    ],
    [
      "/repos/sample-org/vtdd-v2-p/commits/codex%2Fissue-6/check-runs?per_page=20",
      {
        check_runs: [
          {
            id: 3003,
            name: "test",
            status: "completed",
            conclusion: "success",
            html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/3003"
          }
        ]
      }
    ],
    [
      "/repos/sample-org/vtdd-v2-p/actions/runs?per_page=20&branch=codex%2Fissue-6",
      {
        workflow_runs: [
          {
            id: 4004,
            name: "ci",
            status: "completed",
            conclusion: "success",
            head_branch: "codex/issue-6",
            html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/4004"
          }
        ]
      }
    ],
    [
      "/repos/sample-org/vtdd-v2-p/branches/codex%2Fissue-6",
      {
        name: "codex/issue-6",
        protected: false,
        commit: {
          sha: "abc123",
          url: "https://api.github.com/repos/sample-org/vtdd-v2-p/commits/abc123"
        }
      }
    ]
  ]);

  const env = {
    GITHUB_APP_INSTALLATION_TOKEN: "ghs_read",
    GITHUB_API_FETCH: async (url) => {
      const parsed = new URL(url);
      const key = `${parsed.pathname}${parsed.search}`;
      const body = responses.get(key);
      if (!body) {
        return new Response(JSON.stringify({ message: `unexpected ${key}` }), { status: 404 });
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  };

  const reviews = await retrieveGitHubReadPlane({
    resource: GitHubReadResource.PULL_REVIEWS,
    repository: "sample-org/vtdd-v2-p",
    pullNumber: 5,
    env
  });
  const reviewComments = await retrieveGitHubReadPlane({
    resource: GitHubReadResource.PULL_REVIEW_COMMENTS,
    repository: "sample-org/vtdd-v2-p",
    pullNumber: 5,
    env
  });
  const checks = await retrieveGitHubReadPlane({
    resource: GitHubReadResource.CHECKS,
    repository: "sample-org/vtdd-v2-p",
    branch: "codex/issue-6",
    env
  });
  const workflowRuns = await retrieveGitHubReadPlane({
    resource: GitHubReadResource.WORKFLOW_RUNS,
    repository: "sample-org/vtdd-v2-p",
    branch: "codex/issue-6",
    env
  });
  const branches = await retrieveGitHubReadPlane({
    resource: GitHubReadResource.BRANCHES,
    repository: "sample-org/vtdd-v2-p",
    branch: "codex/issue-6",
    env
  });

  assert.equal(reviews.ok, true);
  assert.equal(reviews.read.records[0].state, "COMMENTED");
  assert.equal(reviewComments.ok, true);
  assert.equal(reviewComments.read.records[0].path, "src/app.js");
  assert.equal(checks.ok, true);
  assert.equal(checks.read.records[0].conclusion, "success");
  assert.equal(workflowRuns.ok, true);
  assert.equal(workflowRuns.read.records[0].headBranch, "codex/issue-6");
  assert.equal(branches.ok, true);
  assert.equal(branches.read.records[0].sha, "abc123");
});

test("github read plane rejects unsupported resources and missing required identifiers", async () => {
  const unsupported = await retrieveGitHubReadPlane({
    resource: "milestones",
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_read"
    }
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.status, 422);

  const missingPullNumber = await retrieveGitHubReadPlane({
    resource: GitHubReadResource.PULL_REVIEWS,
    repository: "sample-org/vtdd-v2-p",
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_read"
    }
  });
  assert.equal(missingPullNumber.ok, false);
  assert.equal(missingPullNumber.reason.includes("pullNumber is required"), true);
});
