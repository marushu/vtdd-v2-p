import test from "node:test";
import assert from "node:assert/strict";
import {
  ActorRole,
  RemoteCodexDispatchGoal,
  RemoteCodexExecutorTransport,
  RemoteCodexExecutionStatus,
  createRemoteCodexExecutionRequest,
  dispatchRemoteCodexExecution,
  getRemoteCodexExecutorTransportRegistry,
  retrieveRemoteCodexExecutionProgress
} from "../src/core/index.js";

test("remote Codex transport registry exposes pluggable user-owned backend choices", () => {
  const registry = getRemoteCodexExecutorTransportRegistry();

  assert.deepEqual(Object.keys(registry).sort(), [
    RemoteCodexExecutorTransport.API_KEY_RUNNER,
    RemoteCodexExecutorTransport.CODEX_CLOUD_CLI_CONTROL_RUNNER,
    RemoteCodexExecutorTransport.CODEX_CLOUD_GITHUB_COMMENT,
    RemoteCodexExecutorTransport.VPS_RUNNER
  ].sort());
  assert.equal(registry.codex_cloud_github_comment.default, true);
  assert.equal(registry.codex_cloud_github_comment.requestOnlyUntilRuntimeEvidence, true);
  assert.deepEqual(registry.codex_cloud_github_comment.successEvidence, [
    "github_branch",
    "github_pull_request"
  ]);
  assert.equal(registry.codex_cloud_cli_control_runner.ownerBoundary, "user_owned_private_control_repository_or_trusted_runner");
  assert.equal(registry.codex_cloud_cli_control_runner.usesOpenAiApiKey, false);
  assert.equal(registry.api_key_runner.optIn, true);
  assert.equal(registry.api_key_runner.usesOpenAiApiKey, true);
  assert.equal(registry.vps_runner.implemented, false);
});

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

test("remote Codex execution request accepts explicit bounded PR revision goal override", () => {
  const result = createRemoteCodexExecutionRequest({
    payload: {
      actorRole: ActorRole.BUTLER,
      issueContext: { issueNumber: 161 },
      continuationContext: {
        codexGoal: RemoteCodexDispatchGoal.REVISE_PR
      },
      policyInput: {
        approvalPhrase: "GO",
        targetConfirmed: true,
        approvalScopeMatched: true,
        runtimeTruth: {
          runtimeState: {
            activeBranch: "codex/issue-161"
          }
        }
      }
    },
    gatewayResult: {
      repository: "sample-org/vtdd-v2",
      executionContinuity: {
        codexGoal: "wait_for_review"
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.request.codexGoal, RemoteCodexDispatchGoal.REVISE_PR);
});

test("remote Codex execution request rejects wait-only continuity goal before workflow dispatch", () => {
  const result = createRemoteCodexExecutionRequest({
    payload: {
      actorRole: ActorRole.BUTLER,
      issueContext: { issueNumber: 161 },
      policyInput: {
        approvalPhrase: "GO",
        targetConfirmed: true,
        approvalScopeMatched: true,
        runtimeTruth: {
          runtimeState: {
            activeBranch: "codex/issue-161"
          }
        }
      }
    },
    gatewayResult: {
      repository: "sample-org/vtdd-v2",
      executionContinuity: {
        codexGoal: "wait_for_review"
      }
    }
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues, ["codexGoal must be open_pr, revise_pr, or respond_to_review"]);
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

test("remote Codex execution defaults to control runner when a control repository is configured", async () => {
  const calls = [];
  let executionId = "";
  const dispatched = await dispatchRemoteCodexExecution({
    payload: {
      actorRole: ActorRole.BUTLER,
      issueContext: { issueNumber: 153 },
      policyInput: {
        approvalPhrase: "GO",
        targetConfirmed: true,
        approvalScopeMatched: true,
        runtimeTruth: {
          runtimeState: {
            activeBranch: "codex/issue-153"
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
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/private-control-runner",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/dispatches")) {
          executionId = JSON.parse(init.body).inputs.execution_id;
          return new Response(null, { status: 204 });
        }
        return new Response(
          JSON.stringify({
            workflow_runs: [
              {
                id: 1531,
                name: "codex-cloud-cli-control-runner",
                display_title: executionId,
                html_url: "https://github.com/sample-org/private-control-runner/actions/runs/1531",
                status: "queued",
                conclusion: null,
                head_branch: "main"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(dispatched.ok, true);
  assert.equal(dispatched.execution.transport, RemoteCodexExecutorTransport.CODEX_CLOUD_CLI_CONTROL_RUNNER);
  assert.equal(dispatched.execution.controlRepository, "sample-org/private-control-runner");
  assert.equal(dispatched.execution.workflowRunId, 1531);
  assert.equal(calls[0].url.includes("/actions/workflows/remote-codex-executor.yml/dispatches"), true);
});

test("remote Codex control-runner dispatch uses workflow evidence without OPENAI_API_KEY approval", async () => {
  const calls = [];
  let executionId = "";
  const dispatched = await dispatchRemoteCodexExecution({
    payload: {
      actorRole: ActorRole.BUTLER,
      issueContext: { issueNumber: 173 },
      policyInput: {
        approvalPhrase: "GO",
        targetConfirmed: true,
        approvalScopeMatched: true,
        runtimeTruth: {
          runtimeState: {
            activeBranch: "codex/issue-173"
          }
        }
      }
    },
    gatewayResult: {
      repository: "sample-org/tomio",
      executionContinuity: {
        codexGoal: "open_pr"
      }
    },
    env: {
      REMOTE_CODEX_EXECUTOR_TRANSPORT: RemoteCodexExecutorTransport.CODEX_CLOUD_CLI_CONTROL_RUNNER,
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/private-control-runner",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/dispatches")) {
          executionId = JSON.parse(init.body).inputs.execution_id;
          return new Response(null, { status: 204 });
        }
        return new Response(
          JSON.stringify({
            workflow_runs: [
              {
                id: 1731,
                name: "codex-cloud-cli-control-runner",
                display_title: executionId,
                html_url: "https://github.com/sample-org/private-control-runner/actions/runs/1731",
                status: "queued",
                conclusion: null,
                head_branch: "main"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(dispatched.ok, true);
  assert.equal(dispatched.execution.transport, RemoteCodexExecutorTransport.CODEX_CLOUD_CLI_CONTROL_RUNNER);
  assert.equal(dispatched.execution.controlRepository, "sample-org/private-control-runner");
  assert.equal(dispatched.execution.targetRepository, "sample-org/tomio");
  assert.equal(dispatched.execution.workflowRunId, 1731);
  assert.equal(JSON.stringify(calls.map((call) => call.init)).includes("OPENAI_API_KEY"), false);
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

test("remote Codex vps_runner is registered but blocked until a user-owned VPS adapter exists", async () => {
  const dispatched = await dispatchRemoteCodexExecution({
    payload: {
      actorRole: ActorRole.BUTLER,
      executorTransport: RemoteCodexExecutorTransport.VPS_RUNNER,
      issueContext: { issueNumber: 173 },
      policyInput: {
        approvalPhrase: "GO",
        targetConfirmed: true,
        approvalScopeMatched: true,
        runtimeTruth: {
          runtimeState: {
            activeBranch: "codex/issue-173"
          }
        }
      }
    },
    gatewayResult: {
      repository: "sample-org/sunaba-eye",
      executionContinuity: {
        codexGoal: "open_pr"
      }
    },
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token"
    }
  });

  assert.equal(dispatched.ok, false);
  assert.equal(dispatched.status, 501);
  assert.equal(dispatched.error, "vps_runner_not_implemented");
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

test("remote Codex control-runner progress includes target PR runtime truth", async () => {
  const calls = [];
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: "remote-codex-issue157-live",
    repository: "sample-org/vtdd-v2",
    branch: "codex/issue-157",
    executorTransport: RemoteCodexExecutorTransport.CODEX_CLOUD_CLI_CONTROL_RUNNER,
    env: {
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/private-control-runner",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 15701,
                  name: "codex-cloud-cli-control-runner",
                  display_title: "remote-codex-issue157-live",
                  html_url: "https://github.com/sample-org/private-control-runner/actions/runs/15701",
                  status: "completed",
                  conclusion: "success",
                  head_branch: "main",
                  run_started_at: "2026-05-05T01:00:00Z",
                  updated_at: "2026-05-05T01:03:00Z"
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify([
            {
              number: 157,
              html_url: "https://github.com/sample-org/vtdd-v2/pull/157",
              state: "open",
              title: "Implement Issue #157 handoff progress"
            }
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(progress.ok, true);
  assert.equal(progress.progress.status, RemoteCodexExecutionStatus.COMPLETED);
  assert.equal(progress.progress.workflowRunId, 15701);
  assert.equal(progress.progress.branch, "main");
  assert.equal(progress.progress.targetRuntimeTruth.status, RemoteCodexExecutionStatus.COMPLETED);
  assert.equal(progress.progress.targetRuntimeTruth.targetRepository, "sample-org/vtdd-v2");
  assert.equal(progress.progress.targetRuntimeTruth.targetBranch, "codex/issue-157");
  assert.equal(progress.progress.targetRuntimeTruth.pullRequest.number, 157);
  assert.equal(progress.progress.targetRuntimeTruth.branch, null);
  assert.equal(progress.progress.targetRuntimeTruth.blocker, null);
  assert.equal(calls.length, 2);
});

test("remote Codex control-runner progress blocks completed run without target branch or PR", async () => {
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: "remote-codex-issue157-no-evidence",
    repository: "sample-org/vtdd-v2",
    branch: "codex/issue-157",
    executorTransport: RemoteCodexExecutorTransport.CODEX_CLOUD_CLI_CONTROL_RUNNER,
    env: {
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/private-control-runner",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async (url) => {
        if (String(url).includes("/runs")) {
          return new Response(
            JSON.stringify({
              workflow_runs: [
                {
                  id: 15702,
                  name: "codex-cloud-cli-control-runner",
                  display_title: "remote-codex-issue157-no-evidence",
                  html_url: "https://github.com/sample-org/private-control-runner/actions/runs/15702",
                  status: "completed",
                  conclusion: "failure",
                  head_branch: "main"
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/pulls?")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ message: "Branch not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        });
      }
    }
  });

  assert.equal(progress.ok, true);
  assert.equal(progress.progress.status, RemoteCodexExecutionStatus.COMPLETED);
  assert.equal(progress.progress.branch, "main");
  assert.equal(progress.progress.targetRuntimeTruth.status, RemoteCodexExecutionStatus.BLOCKED);
  assert.equal(progress.progress.targetRuntimeTruth.pullRequest, null);
  assert.equal(progress.progress.targetRuntimeTruth.branch, null);
  assert.equal(progress.progress.targetRuntimeTruth.blocker.error, "remote_codex_workflow_failed");
  assert.equal(progress.progress.targetRuntimeTruth.blocker.conclusion, "failure");
});

test("remote Codex control-runner progress blocks when target runtime truth inputs are missing", async () => {
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: "remote-codex-issue157-missing-target",
    executorTransport: RemoteCodexExecutorTransport.CODEX_CLOUD_CLI_CONTROL_RUNNER,
    env: {
      VTDD_GITHUB_ACTIONS_REPOSITORY: "sample-org/private-control-runner",
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async (url) => {
        assert.equal(String(url).includes("/runs"), true);
        return new Response(
          JSON.stringify({
            workflow_runs: [
              {
                id: 15703,
                display_title: "remote-codex-issue157-missing-target",
                html_url: "https://github.com/sample-org/private-control-runner/actions/runs/15703",
                status: "completed",
                conclusion: "success",
                head_branch: "main"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(progress.ok, true);
  assert.equal(progress.progress.status, RemoteCodexExecutionStatus.COMPLETED);
  assert.equal(progress.progress.branch, "main");
  assert.equal(progress.progress.targetRuntimeTruth.status, RemoteCodexExecutionStatus.BLOCKED);
  assert.equal(
    progress.progress.targetRuntimeTruth.blocker.error,
    "remote_codex_target_runtime_truth_unavailable"
  );
  assert.deepEqual(progress.progress.targetRuntimeTruth.blocker.missing, [
    "targetRepository",
    "targetBranch"
  ]);
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

test("remote Codex comment transport progress treats branch without PR as in progress", async () => {
  const calls = [];
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: "remote-codex-issue157-branch",
    repository: "sample-org/vtdd-v2",
    issueNumber: 157,
    branch: "codex/issue-157",
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/issues/157/comments")) {
          return new Response(
            JSON.stringify([
              {
                id: 1571,
                html_url: "https://github.com/sample-org/vtdd-v2/issues/157#issuecomment-1571",
                body: "<!-- vtdd:remote-codex-execution:remote-codex-issue157-branch -->\n@codex"
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/pulls?")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(
          JSON.stringify({
            name: "codex/issue-157",
            commit: { sha: "abc123" },
            _links: {
              html: "https://github.com/sample-org/vtdd-v2/tree/codex/issue-157"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(progress.ok, true);
  assert.equal(progress.progress.status, RemoteCodexExecutionStatus.IN_PROGRESS);
  assert.equal(progress.progress.branch.name, "codex/issue-157");
  assert.equal(progress.progress.branch.sha, "abc123");
  assert.equal(progress.progress.pullRequest, null);
  assert.equal(calls.length, 3);
});

test("remote Codex comment transport progress surfaces connector blocker without branch or PR", async () => {
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: "remote-codex-issue157-blocked",
    repository: "sample-org/vtdd-v2",
    issueNumber: 157,
    branch: "codex/issue-157",
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async (url) => {
        if (String(url).includes("/issues/157/comments")) {
          return new Response(
            JSON.stringify([
              {
                id: 1571,
                html_url: "https://github.com/sample-org/vtdd-v2/issues/157#issuecomment-1571",
                body: "<!-- vtdd:remote-codex-execution:remote-codex-issue157-blocked -->\n@codex"
              },
              {
                id: 1572,
                user: { login: "chatgpt-codex-connector[bot]" },
                html_url: "https://github.com/sample-org/vtdd-v2/issues/157#issuecomment-1572",
                body: "To use Codex here, create a Codex account and connect to github."
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/pulls?")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ message: "Branch not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        });
      }
    }
  });

  assert.equal(progress.ok, true);
  assert.equal(progress.progress.status, RemoteCodexExecutionStatus.BLOCKED);
  assert.equal(progress.progress.blocker.error, "codex_cloud_connector_required");
  assert.equal(progress.progress.blocker.commentId, 1572);
  assert.equal(progress.progress.pullRequest, null);
  assert.equal(progress.progress.branch, null);
});

test("remote Codex comment transport blocks when pickup never creates branch or PR", async () => {
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: "remote-codex-issue157-stale",
    repository: "sample-org/vtdd-v2",
    issueNumber: 157,
    branch: "codex/issue-157",
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      CODEX_CLOUD_PICKUP_GRACE_SECONDS: "0",
      GITHUB_API_FETCH: async (url) => {
        if (String(url).includes("/issues/157/comments")) {
          return new Response(
            JSON.stringify([
              {
                id: 1571,
                created_at: "2026-04-30T11:15:22Z",
                html_url: "https://github.com/sample-org/vtdd-v2/issues/157#issuecomment-1571",
                body: "<!-- vtdd:remote-codex-execution:remote-codex-issue157-stale -->\n@codex"
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/pulls?")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ message: "Branch not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        });
      }
    }
  });

  assert.equal(progress.ok, true);
  assert.equal(progress.progress.status, RemoteCodexExecutionStatus.BLOCKED);
  assert.equal(progress.progress.blocker.error, "codex_cloud_pickup_not_observed");
  assert.equal(progress.progress.blocker.commentId, 1571);
  assert.equal(progress.progress.pullRequest, null);
  assert.equal(progress.progress.branch, null);
});
