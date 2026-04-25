import test from "node:test";
import assert from "node:assert/strict";
import {
  ActorRole,
  RemoteCodexExecutorTransport,
  RemoteCodexExecutionStatus,
  createRemoteCodexExecutionRequest,
  dispatchRemoteCodexExecution,
  retrieveRemoteCodexExecutionProgress
} from "../src/core/index.js";

test("remote Codex execution request is built from gateway result and payload", () => {
  const result = createRemoteCodexExecutionRequest({
    payload: {
      actorRole: ActorRole.BUTLER,
      issueContext: { issueNumber: 6 },
      policyInput: {
        approvalPhrase: "GO",
        targetConfirmed: true,
        approvalScopeMatched: true,
        runtimeTruth: {
          runtimeState: {
            activeBranch: "codex/issue-6"
          }
        }
      }
    },
    gatewayResult: {
      repository: "sample-org/vtdd-v2",
      executionContinuity: {
        codexGoal: "open_pr"
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.request.repository, "sample-org/vtdd-v2");
  assert.equal(result.request.issueNumber, 6);
  assert.equal(result.request.branch, "codex/issue-6");
  assert.equal(result.request.baseRef, "main");
  assert.equal(result.request.codexGoal, "open_pr");
});

test("remote Codex execution default dispatch posts bounded @codex GitHub comment", async () => {
  const calls = [];
  const dispatched = await dispatchRemoteCodexExecution({
    payload: {
      actorRole: ActorRole.BUTLER,
      issueContext: { issueNumber: 6 },
      policyInput: {
        approvalPhrase: "GO",
        targetConfirmed: true,
        approvalScopeMatched: true,
        runtimeTruth: {
          runtimeState: {
            activeBranch: "codex/issue-6"
          }
        }
      }
    },
    gatewayResult: {
      repository: "sample-org/vtdd-v2",
      executionContinuity: {
        codexGoal: "open_pr"
      }
    },
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({
            id: 123,
            html_url: "https://github.com/sample-org/vtdd-v2/issues/6#issuecomment-123"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(dispatched.ok, true);
  assert.equal(dispatched.execution.transport, RemoteCodexExecutorTransport.CODEX_CLOUD_GITHUB_COMMENT);
  assert.equal(dispatched.execution.status, RemoteCodexExecutionStatus.QUEUED);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.includes("/repos/sample-org/vtdd-v2/issues/6/comments"), true);
  assert.equal(calls[0].init.method, "POST");
  const body = JSON.parse(calls[0].init.body).body;
  assert.equal(body.includes("@codex"), true);
  assert.equal(body.includes("Completion target: create or update a pull request"), true);
  assert.equal(body.includes("Do not merge."), true);
  assert.equal(body.includes("OPENAI_API_KEY"), false);
});

test("remote Codex API-backed execution dispatch posts workflow_dispatch to GitHub", async () => {
  const calls = [];
  const dispatched = await dispatchRemoteCodexExecution({
    payload: {
      actorRole: ActorRole.BUTLER,
      issueContext: { issueNumber: 6 },
      policyInput: {
        approvalPhrase: "GO",
        targetConfirmed: true,
        approvalScopeMatched: true,
        runtimeTruth: {
          runtimeState: {
            activeBranch: "codex/issue-6"
          }
        }
      }
    },
    gatewayResult: {
      repository: "sample-org/vtdd-v2",
      executionContinuity: {
        codexGoal: "open_pr"
      }
    },
    env: {
      REMOTE_CODEX_EXECUTOR_TRANSPORT: RemoteCodexExecutorTransport.API_KEY_RUNNER,
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        return new Response(null, { status: 204 });
      }
    }
  });

  assert.equal(dispatched.ok, true);
  assert.equal(dispatched.execution.status, RemoteCodexExecutionStatus.QUEUED);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.includes("/actions/workflows/remote-codex-executor.yml/dispatches"), true);
  assert.equal(calls[0].init.method, "POST");
});

test("remote Codex API-backed execution progress reads matching workflow run", async () => {
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: "remote-codex-issue6-abcd12",
    env: {
      REMOTE_CODEX_EXECUTOR_TRANSPORT: RemoteCodexExecutorTransport.API_KEY_RUNNER,
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            workflow_runs: [
              {
                id: 101,
                name: "remote-codex-executor",
                display_title: "remote-codex-issue6-abcd12",
                html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/101",
                status: "in_progress",
                conclusion: null,
                head_branch: "main",
                run_started_at: "2026-04-24T08:00:00Z",
                updated_at: "2026-04-24T08:01:00Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  });

  assert.equal(progress.ok, true);
  assert.equal(progress.progress.workflowRunId, 101);
  assert.equal(progress.progress.status, RemoteCodexExecutionStatus.IN_PROGRESS);
});

test("remote Codex comment transport progress reads delegation comment and PR state", async () => {
  const calls = [];
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: "remote-codex-issue6-abcd12",
    repository: "sample-org/vtdd-v2",
    issueNumber: 6,
    branch: "codex/issue-6",
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/issues/6/comments")) {
          return new Response(
            JSON.stringify([
              {
                id: 123,
                html_url: "https://github.com/sample-org/vtdd-v2/issues/6#issuecomment-123",
                body: "<!-- vtdd:remote-codex-execution:remote-codex-issue6-abcd12 -->\n@codex"
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify([
            {
              number: 44,
              html_url: "https://github.com/sample-org/vtdd-v2/pull/44",
              state: "open",
              title: "VTDD remote Codex execution for issue #6"
            }
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(progress.ok, true);
  assert.equal(progress.progress.transport, RemoteCodexExecutorTransport.CODEX_CLOUD_GITHUB_COMMENT);
  assert.equal(progress.progress.status, RemoteCodexExecutionStatus.COMPLETED);
  assert.equal(progress.progress.pullRequest.number, 44);
  assert.equal(calls.length, 2);
});
