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

test("remote Codex execution request rejects non-string handoff approval refs", () => {
  const result = createRemoteCodexExecutionRequest({
    payload: {
      actorRole: ActorRole.BUTLER,
      issueContext: { issueNumber: 125 },
      continuationContext: {
        requiresHandoff: true,
        handoff: {
          issueTraceable: true,
          approvalScopeMatched: true,
          relatedIssue: 125,
          summary: "Issue #125 bounded Codex handoff"
        }
      },
      policyInput: {
        approvalPhrase: "GO Issue #125 Codex handoff",
        targetConfirmed: true,
        issueTraceability: {
          relatedIssue: 125,
          intentRefs: [125],
          successCriteriaRefs: ["#125 Success Criteria"],
          nonGoalRefs: ["#125 Non-goals"]
        },
        runtimeTruth: {
          runtimeState: {
            activeBranch: "codex/issue-125"
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

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues, ["approvalScopeMatched must be true"]);
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

test("remote Codex execution mints GitHub App installation token from worker runtime credentials", async () => {
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
      GITHUB_APP_ID: "67890",
      GITHUB_APP_INSTALLATION_ID: "24680",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----",
      GITHUB_APP_JWT_PROVIDER: async () => "app_jwt_token_for_tests",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/app/installations/24680/access_tokens")) {
          return new Response(
            JSON.stringify({
              token: "ghs_minted_executor_token",
              expires_at: "2026-04-25T15:00:00Z"
            }),
            { status: 201, headers: { "content-type": "application/json" } }
          );
        }
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
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.includes("/app/installations/24680/access_tokens"), true);
  assert.equal(calls[0].init.headers.authorization, "Bearer app_jwt_token_for_tests");
  assert.equal(calls[1].url.includes("/repos/sample-org/vtdd-v2/issues/6/comments"), true);
  assert.equal(calls[1].init.headers.authorization, "Bearer ghs_minted_executor_token");
});

test("remote Codex API-backed execution dispatch posts workflow_dispatch to GitHub", async () => {
  const calls = [];
  let executionId = "";
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
        if (String(url).includes("/dispatches")) {
          executionId = JSON.parse(init.body).inputs.execution_id;
          return new Response(null, { status: 204 });
        }
        if (String(url).includes("/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 101,
                  name: "remote-codex-executor",
                  display_title: executionId,
                  html_url: "https://github.com/sample-org/vtdd-v2-p/actions/runs/101",
                  status: "queued",
                  conclusion: null,
                  head_branch: "main",
                  run_started_at: "2026-04-24T08:00:00Z",
                  updated_at: "2026-04-24T08:01:00Z"
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(null, { status: 204 });
      }
    }
  });

  assert.equal(dispatched.ok, true);
  assert.equal(dispatched.execution.status, RemoteCodexExecutionStatus.QUEUED);
  assert.equal(dispatched.execution.transport, RemoteCodexExecutorTransport.API_KEY_RUNNER);
  assert.equal(dispatched.execution.workflowRunId, 101);
  assert.equal(dispatched.execution.workflowUrl, "https://github.com/sample-org/vtdd-v2-p/actions/runs/101");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.includes("/actions/workflows/remote-codex-executor.yml/dispatches"), true);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[1].url.includes("/actions/workflows/remote-codex-executor.yml/runs"), true);
});

test("remote Codex API-backed execution requires explicit request acknowledgment", async () => {
  const dispatched = await dispatchRemoteCodexExecution({
    payload: {
      actorRole: ActorRole.BUTLER,
      executorTransport: RemoteCodexExecutorTransport.API_KEY_RUNNER,
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
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/vtdd-v2-p",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token"
    }
  });

  assert.equal(dispatched.ok, false);
  assert.equal(dispatched.status, 422);
  assert.equal(dispatched.error, "api_key_runner_approval_required");
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
