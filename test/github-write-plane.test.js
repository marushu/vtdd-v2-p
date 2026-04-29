import test from "node:test";
import assert from "node:assert/strict";
import { executeGitHubWritePlane, GitHubWriteOperation } from "../src/core/index.js";

test("github write plane creates scoped issues with GO approval", async () => {
  const calls = [];
  const result = await executeGitHubWritePlane({
    operation: GitHubWriteOperation.ISSUE_CREATE,
    repository: "sample-org/vtdd-v2-p",
    title: "test: live E2E evidence",
    body: "Issue body fixed by approval scope.",
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalScopeMatched: true,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({
            number: 107,
            title: "test: live E2E evidence",
            state: "open",
            html_url: "https://github.com/sample-org/vtdd-v2-p/issues/107"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.write.operation, GitHubWriteOperation.ISSUE_CREATE);
  assert.equal(result.write.issueNumber, 107);
  assert.equal(result.write.url, "https://github.com/sample-org/vtdd-v2-p/issues/107");
  assert.equal(calls[0].url.includes("/repos/sample-org/vtdd-v2-p/issues"), true);
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    title: "test: live E2E evidence",
    body: "Issue body fixed by approval scope."
  });
});

test("github write plane creates scoped issue comments with GO approval", async () => {
  const calls = [];
  const result = await executeGitHubWritePlane({
    operation: GitHubWriteOperation.ISSUE_COMMENT_CREATE,
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 52,
    body: "scoped comment",
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalScopeMatched: true,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({
            id: 101,
            html_url: "https://github.com/sample-org/vtdd-v2-p/issues/52#issuecomment-101"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.write.operation, GitHubWriteOperation.ISSUE_COMMENT_CREATE);
  assert.equal(calls[0].url.includes("/repos/sample-org/vtdd-v2-p/issues/52/comments"), true);
  assert.equal(calls[0].init.method, "POST");
});

test("github write plane creates a branch by resolving the base ref sha", async () => {
  const calls = [];
  const result = await executeGitHubWritePlane({
    operation: GitHubWriteOperation.BRANCH_CREATE,
    repository: "sample-org/vtdd-v2-p",
    branch: "codex/issue-52",
    baseRef: "main",
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalScopeMatched: true,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/git/ref/heads/main")) {
          return new Response(
            JSON.stringify({
              object: { sha: "abc123" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            ref: "refs/heads/codex/issue-52",
            node_id: "REF_node"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url.includes("/git/ref/heads/main"), true);
  assert.equal(calls[1].url.includes("/git/refs"), true);
  assert.equal(JSON.parse(calls[1].init.body).sha, "abc123");
});

test("github write plane creates and updates pull requests and posts PR comments", async () => {
  const calls = [];
  const env = {
    GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
    GITHUB_API_FETCH: async (url, init) => {
      calls.push({ url, init });
      if (init.method === "POST" && String(url).includes("/pulls")) {
        return new Response(
          JSON.stringify({
            number: 88,
            title: "Implement normal write plane",
            state: "open",
            html_url: "https://github.com/sample-org/vtdd-v2-p/pull/88"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
      if (init.method === "PATCH") {
        return new Response(
          JSON.stringify({
            number: 88,
            title: "Updated PR title",
            state: "open",
            html_url: "https://github.com/sample-org/vtdd-v2-p/pull/88"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          id: 303,
          html_url: "https://github.com/sample-org/vtdd-v2-p/issues/88#issuecomment-303"
        }),
        { status: 201, headers: { "content-type": "application/json" } }
      );
    }
  };

  const created = await executeGitHubWritePlane({
    operation: GitHubWriteOperation.PULL_CREATE,
    repository: "sample-org/vtdd-v2-p",
    branch: "codex/issue-52",
    baseRef: "main",
    title: "Implement normal write plane",
    body: "Creates the Butler/Executor write plane.",
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalScopeMatched: true,
    env
  });
  const updated = await executeGitHubWritePlane({
    operation: GitHubWriteOperation.PULL_UPDATE,
    repository: "sample-org/vtdd-v2-p",
    pullNumber: 88,
    title: "Updated PR title",
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalScopeMatched: true,
    env
  });
  const commented = await executeGitHubWritePlane({
    operation: GitHubWriteOperation.PULL_COMMENT_CREATE,
    repository: "sample-org/vtdd-v2-p",
    pullNumber: 88,
    body: "Please review this update.",
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalScopeMatched: true,
    env
  });

  assert.equal(created.ok, true);
  assert.equal(created.write.pullNumber, 88);
  assert.equal(updated.ok, true);
  assert.equal(updated.write.title, "Updated PR title");
  assert.equal(commented.ok, true);
  assert.equal(commented.write.commentId, 303);
});

test("github write plane rejects missing GO approval scope or unsupported operations", async () => {
  const denied = await executeGitHubWritePlane({
    operation: GitHubWriteOperation.ISSUE_COMMENT_CREATE,
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 52,
    body: "no go",
    approvalPhrase: "",
    targetConfirmed: false,
    approvalScopeMatched: false,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write"
    }
  });
  const unsupported = await executeGitHubWritePlane({
    operation: "merge",
    repository: "sample-org/vtdd-v2-p",
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalScopeMatched: true,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write"
    }
  });

  assert.equal(denied.ok, false);
  assert.equal(denied.status, 422);
  assert.equal(denied.reason.includes("approvalPhrase must be GO"), true);
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.reason.includes("operation is unsupported"), true);
});

test("github write plane preserves sanitized fetch exception details", async () => {
  const result = await executeGitHubWritePlane({
    operation: GitHubWriteOperation.ISSUE_CREATE,
    repository: "sample-org/vtdd-v2-p",
    title: "test",
    body: "body",
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalScopeMatched: true,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_write",
      GITHUB_API_FETCH: async () => {
        throw new TypeError("fetch failed at /Users/example with Bearer ghs_secret");
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.error, "github_write_failed");
  assert.equal(result.reason, "failed to execute GitHub write operation: issue_create");
  assert.equal(result.issues.includes("github_write_fetch_exception"), true);
  assert.equal(result.issues.some((issue) => issue.includes("ghs_secret")), false);
  assert.equal(result.issues.some((issue) => issue.includes("/Users/example")), false);
});
