import test from "node:test";
import assert from "node:assert/strict";
import {
  ActorRole,
  RemoteCodexDispatchGoal,
  RemoteCodexExecutorTransport,
  RemoteCodexExecutionStatus,
  cancelVpsRunnerQueue,
  createRemoteCodexExecutionRequest,
  dispatchRemoteCodexExecution,
  getRemoteCodexExecutorTransportRegistry,
  retrieveRemoteCodexExecutionProgress,
  retrieveVpsRunnerHealthStatus
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
  assert.equal(registry.vps_runner.implemented, true);
  assert.equal(registry.vps_runner.requestQueue, "github_issue_comment");
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
            activeBranch: "codex/issue-161",
            pullRequest: {
              number: 161,
              state: "open",
              headRef: "codex/issue-161",
              headSha: "sha-161"
            }
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
  assert.deepEqual(result.request.revisionTarget, {
    number: 161,
    url: null,
    state: "open",
    headRef: "codex/issue-161",
    headSha: "sha-161"
  });
});

test("remote Codex execution request rejects revise_pr without an open locked target PR", () => {
  const result = createRemoteCodexExecutionRequest({
    payload: {
      actorRole: ActorRole.BUTLER,
      issueContext: { issueNumber: 251 },
      continuationContext: {
        codexGoal: RemoteCodexDispatchGoal.REVISE_PR
      },
      policyInput: {
        approvalPhrase: "GO",
        targetConfirmed: true,
        approvalScopeMatched: true,
        runtimeTruth: {
          runtimeState: {
            activeBranch: "codex/issue-251",
            pullRequest: {
              number: 279,
              state: "closed",
              headRef: "codex/issue-251",
              headSha: "old-sha"
            }
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
  assert.equal(result.issues.includes("revise_pr target PR must be open"), true);
});

test("remote Codex execution request pins revise_pr branch to target PR headRef", () => {
  const result = createRemoteCodexExecutionRequest({
    payload: {
      actorRole: ActorRole.BUTLER,
      issueContext: { issueNumber: 251 },
      executionTarget: {
        branch: "codex/issue-251"
      },
      continuationContext: {
        codexGoal: RemoteCodexDispatchGoal.REVISE_PR
      },
      policyInput: {
        approvalPhrase: "GO",
        targetConfirmed: true,
        approvalScopeMatched: true,
        runtimeTruth: {
          runtimeState: {
            activeBranch: "codex/issue-251",
            pullRequest: {
              number: 285,
              state: "open",
              headRef: "codex/issue-251-v2",
              headSha: "fresh-sha"
            }
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
  assert.equal(result.request.branch, "codex/issue-251-v2");
  assert.equal(result.request.revisionTarget.number, 285);
});

test("remote Codex execution request blocks conflicting revise_pr target locks", () => {
  const result = createRemoteCodexExecutionRequest({
    payload: {
      actorRole: ActorRole.BUTLER,
      issueContext: { issueNumber: 251 },
      executionTarget: {
        prNumber: 279,
        prState: "closed",
        headRef: "codex/issue-251",
        headSha: "old-sha"
      },
      continuationContext: {
        codexGoal: RemoteCodexDispatchGoal.REVISE_PR,
        handoff: {
          issueTraceable: true,
          approvalScopeMatched: true,
          relatedIssue: 251,
          summary: "Revise fresh replacement PR only",
          targetPullRequest: {
            number: 285,
            state: "open",
            headRef: "codex/issue-251-v2",
            headSha: "fresh-sha"
          }
        }
      },
      policyInput: {
        approvalPhrase: "GO",
        targetConfirmed: true,
        approvalScopeMatched: true
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
  assert.equal(
    result.issues.includes("revise_pr target number mismatch between executionTarget and handoff"),
    true
  );
  assert.equal(
    result.issues.includes("revise_pr target headRef mismatch between executionTarget and handoff"),
    true
  );
  assert.equal(
    result.issues.includes("revise_pr target headSha mismatch between executionTarget and handoff"),
    true
  );
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
  assert.equal(body.includes("docs/pr-template-model.md"), true);
  assert.equal(body.includes("scripts/render-pr-body.mjs"), true);
  assert.equal(body.includes("scripts/validate-pr-body.mjs"), true);
  assert.equal(body.includes("## This PR satisfies Intent"), true);
  assert.equal(body.includes("## Surface Update Checklist"), true);
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

test("remote Codex vps_runner dispatch posts a GitHub-backed queue comment", async () => {
  const calls = [];
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
        },
        approvalActor: "requester"
      },
      sender: { login: "ignored-sender" }
    },
    gatewayResult: {
      repository: "sample-org/sunaba-eye",
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
            id: 17301,
            html_url: "https://github.com/sample-org/sunaba-eye/issues/173#issuecomment-17301"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(dispatched.ok, true);
  assert.equal(dispatched.execution.transport, RemoteCodexExecutorTransport.VPS_RUNNER);
  assert.equal(dispatched.execution.status, RemoteCodexExecutionStatus.QUEUED);
  assert.equal(dispatched.execution.queueCommentId, 17301);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.includes("/repos/sample-org/sunaba-eye/issues/173/comments"), true);
  assert.equal(calls[0].init.method, "POST");
  const body = JSON.parse(calls[0].init.body).body;
  assert.equal(body.includes("vtdd:vps-runner-execution:"), true);
  assert.equal(body.includes("VTDD-managed VPS runner execution request."), true);
  assert.equal(body.includes('"transport": "vps_runner"'), true);
  assert.equal(body.includes('"repository": "sample-org/sunaba-eye"'), true);
  assert.equal(body.includes('"approvalActor": "requester"'), true);
  assert.equal(body.includes("@marushu"), false);
  assert.equal(body.includes("Do not merge."), true);
  assert.equal(body.includes("docs/pr-template-model.md"), true);
  assert.equal(body.includes("scripts/render-pr-body.mjs"), true);
  assert.equal(body.includes("scripts/validate-pr-body.mjs"), true);
  assert.equal(body.includes("## This PR satisfies Intent"), true);
  assert.equal(body.includes("## Surface Update Checklist"), true);
});

test("remote Codex vps_runner dispatch preserves bounded PR revision goal", async () => {
  const calls = [];
  const dispatched = await dispatchRemoteCodexExecution({
    payload: {
      actorRole: ActorRole.BUTLER,
      executorTransport: RemoteCodexExecutorTransport.VPS_RUNNER,
      issueContext: { issueNumber: 204 },
      continuationContext: {
        codexGoal: RemoteCodexDispatchGoal.REVISE_PR
      },
      policyInput: {
        approvalPhrase: "GO",
        targetConfirmed: true,
        approvalScopeMatched: true,
        runtimeTruth: {
          runtimeState: {
            activeBranch: "codex/add-pr-ready-authority",
            pullRequest: {
              number: 204,
              state: "open",
              headRef: "codex/add-pr-ready-authority",
              headSha: "sha-204"
            }
          }
        }
      }
    },
    gatewayResult: {
      repository: "sample-org/vtdd-v2",
      executionContinuity: {
        codexGoal: "wait_for_review"
      }
    },
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_dispatch_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({
            id: 20401,
            html_url: "https://github.com/sample-org/vtdd-v2/issues/204#issuecomment-20401"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(dispatched.ok, true);
  assert.equal(dispatched.execution.transport, RemoteCodexExecutorTransport.VPS_RUNNER);
  const body = JSON.parse(calls[0].init.body).body;
  assert.equal(body.includes('"codexGoal": "revise_pr"'), true);
  assert.equal(body.includes('"branch": "codex/add-pr-ready-authority"'), true);
  assert.equal(body.includes('"number": 204'), true);
  assert.equal(body.includes('"headSha": "sha-204"'), true);
});

test("remote Codex vps_runner progress reads queue comment and target PR truth", async () => {
  const calls = [];
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: "remote-codex-issue173-vps",
    repository: "sample-org/sunaba-eye",
    issueNumber: 173,
    branch: "codex/issue-173",
    executorTransport: RemoteCodexExecutorTransport.VPS_RUNNER,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (String(url).includes("/issues/173/comments")) {
          return new Response(
            JSON.stringify([
              {
                id: 17301,
                html_url: "https://github.com/sample-org/sunaba-eye/issues/173#issuecomment-17301",
                created_at: "2026-05-07T10:00:00Z",
                body: "<!-- vtdd:vps-runner-execution:remote-codex-issue173-vps -->"
              },
              {
                id: 17302,
                html_url: "https://github.com/sample-org/sunaba-eye/issues/173#issuecomment-17302",
                created_at: "2026-05-07T10:01:00Z",
                body:
                  "<!-- vtdd:vps-runner-event:remote-codex-issue173-vps -->\n```json\n{\"status\":\"running\",\"lastEvent\":\"codex_started\"}\n```"
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify([
            {
              number: 173,
              html_url: "https://github.com/sample-org/sunaba-eye/pull/173",
              state: "open",
              title: "VPS runner execution for issue #173"
            }
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(progress.ok, true);
  assert.equal(progress.progress.transport, RemoteCodexExecutorTransport.VPS_RUNNER);
  assert.equal(progress.progress.status, RemoteCodexExecutionStatus.COMPLETED);
  assert.equal(progress.progress.pullRequest.number, 173);
  assert.equal(progress.progress.runnerEvent.status, RemoteCodexExecutionStatus.IN_PROGRESS);
  assert.equal(progress.progress.blocker, null);
  assert.equal(calls.length, 2);
});

test("remote Codex vps_runner progress exposes stale branch ambiguity when only closed PRs match", async () => {
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: "remote-codex-issue251-vps",
    repository: "sample-org/vtdd-v2",
    issueNumber: 251,
    branch: "codex/issue-251",
    executorTransport: RemoteCodexExecutorTransport.VPS_RUNNER,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async (url) => {
        if (String(url).includes("/issues/251/comments")) {
          return new Response(
            JSON.stringify([
              {
                id: 25101,
                html_url: "https://github.com/sample-org/vtdd-v2/issues/251#issuecomment-25101",
                created_at: "2026-05-10T10:00:00Z",
                body: "<!-- vtdd:vps-runner-execution:remote-codex-issue251-vps -->"
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/pulls?")) {
          return new Response(
            JSON.stringify([
              {
                number: 279,
                html_url: "https://github.com/sample-org/vtdd-v2/pull/279",
                state: "closed",
                title: "Stale conflicted PR",
                head: {
                  ref: "codex/issue-251",
                  sha: "old-sha"
                }
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            name: "codex/issue-251",
            commit: { sha: "old-sha" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(progress.ok, true);
  assert.equal(progress.progress.pullRequest, null);
  assert.equal(progress.progress.staleBranchAmbiguity.error, "stale_branch_pr_ambiguity");
  assert.equal(progress.progress.staleBranchAmbiguity.pullRequests[0].number, 279);
  assert.equal(progress.progress.staleBranchAmbiguity.pullRequests[0].state, "closed");
});

test("remote Codex vps_runner cancel appends canceled marker to execution queue comment", async () => {
  const calls = [];
  const result = await cancelVpsRunnerQueue({
    repository: "sample-org/vtdd-v2",
    issueNumber: 235,
    executionId: "remote-codex-issue235-cancel",
    mode: "execution",
    reason: "stale branch",
    actor: "alice",
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_cancel_token",
      GITHUB_API_FETCH: async (url, init = {}) => {
        calls.push({ url: String(url), init });
        if (String(url).includes("/issues/235/comments")) {
          return new Response(
            JSON.stringify([
              {
                id: 23501,
                created_at: "2026-05-10T10:00:00Z",
                html_url: "https://github.com/sample-org/vtdd-v2/issues/235#issuecomment-23501",
                body:
                  "<!-- vtdd:vps-runner-execution:remote-codex-issue235-cancel -->\n```json\n{\"executionId\":\"remote-codex-issue235-cancel\",\"transport\":\"vps_runner\",\"repository\":\"sample-org/vtdd-v2\",\"issueNumber\":235,\"branch\":\"codex/issue-235\",\"approvalScopeMatched\":true}\n```"
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/issues/comments/23501")) {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    }
  });

  const patch = calls.find((call) => call.init.method === "PATCH");
  const patchBody = JSON.parse(patch.init.body).body;
  assert.equal(result.ok, true);
  assert.equal(result.cancellation.canceledCount, 1);
  assert.equal(result.cancellation.canceled[0].previousState, "pending");
  assert.equal(patchBody.includes("vtdd:vps-runner-canceled:remote-codex-issue235-cancel"), true);
  assert.equal(patchBody.includes('"reason": "stale branch"'), true);
});

test("remote Codex vps_runner issue pending cancel skips running executions", async () => {
  const patched = [];
  const result = await cancelVpsRunnerQueue({
    repository: "sample-org/vtdd-v2",
    issueNumber: 235,
    mode: "issue_pending",
    reason: "drain stale pending work",
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_cancel_token",
      GITHUB_API_FETCH: async (url, init = {}) => {
        if (String(url).includes("/issues/235/comments")) {
          return new Response(
            JSON.stringify([
              {
                id: 23501,
                created_at: "2026-05-10T10:00:00Z",
                body:
                  "<!-- vtdd:vps-runner-execution:pending-one -->\n```json\n{\"executionId\":\"pending-one\",\"transport\":\"vps_runner\",\"repository\":\"sample-org/vtdd-v2\",\"issueNumber\":235,\"branch\":\"codex/issue-235-a\",\"approvalScopeMatched\":true}\n```"
              },
              {
                id: 23502,
                created_at: "2026-05-10T10:01:00Z",
                body:
                  "<!-- vtdd:vps-runner-execution:running-one -->\n```json\n{\"executionId\":\"running-one\",\"transport\":\"vps_runner\",\"repository\":\"sample-org/vtdd-v2\",\"issueNumber\":235,\"branch\":\"codex/issue-235-b\",\"approvalScopeMatched\":true}\n```"
              },
              {
                id: 23503,
                created_at: "2026-05-10T10:02:00Z",
                body: "<!-- vtdd:vps-runner-event:running-one -->\n```json\n{\"status\":\"running\",\"updatedAt\":\"2026-05-10T10:02:00Z\"}\n```"
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (String(url).includes("/issues/comments/")) {
          patched.push({ url: String(url), body: JSON.parse(init.body).body });
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.cancellation.canceledCount, 1);
  assert.equal(result.cancellation.canceled[0].executionId, "pending-one");
  assert.equal(patched.length, 1);
  assert.equal(patched[0].url.includes("/issues/comments/23501"), true);
});

test("remote Codex vps_runner progress exposes canceled runtime truth", async () => {
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: "remote-codex-issue235-canceled",
    repository: "sample-org/vtdd-v2",
    issueNumber: 235,
    branch: "codex/issue-235",
    executorTransport: RemoteCodexExecutorTransport.VPS_RUNNER,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async (url) => {
        if (String(url).includes("/issues/235/comments")) {
          return new Response(
            JSON.stringify([
              {
                id: 23501,
                created_at: "2026-05-10T10:00:00Z",
                html_url: "https://github.com/sample-org/vtdd-v2/issues/235#issuecomment-23501",
                body:
                  "<!-- vtdd:vps-runner-execution:remote-codex-issue235-canceled -->\n```json\n{\"executionId\":\"remote-codex-issue235-canceled\",\"transport\":\"vps_runner\",\"repository\":\"sample-org/vtdd-v2\",\"issueNumber\":235,\"branch\":\"codex/issue-235\",\"approvalScopeMatched\":true}\n```\n\n<!-- vtdd:vps-runner-canceled:remote-codex-issue235-canceled -->\n```json\n{\"status\":\"canceled\",\"mode\":\"execution\",\"executionId\":\"remote-codex-issue235-canceled\",\"reason\":\"operator canceled\",\"canceledAt\":\"2026-05-10T10:01:00.000Z\"}\n```"
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
  assert.equal(progress.progress.status, RemoteCodexExecutionStatus.CANCELED);
  assert.equal(progress.progress.cancellation.reason, "operator canceled");
  assert.equal(progress.progress.blocker.error, "vps_runner_execution_canceled");
});

test("remote Codex vps_runner progress exposes execution lead time from runner events", async () => {
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: "remote-codex-issue260-vps",
    repository: "sample-org/sunaba-eye",
    issueNumber: 260,
    branch: "codex/issue-260",
    executorTransport: RemoteCodexExecutorTransport.VPS_RUNNER,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async (url) => {
        if (String(url).includes("/issues/260/comments")) {
          return new Response(
            JSON.stringify([
              {
                id: 26001,
                html_url: "https://github.com/sample-org/sunaba-eye/issues/260#issuecomment-26001",
                created_at: "2026-05-09T10:00:00.000Z",
                body: "<!-- vtdd:vps-runner-execution:remote-codex-issue260-vps -->"
              },
              {
                id: 26002,
                html_url: "https://github.com/sample-org/sunaba-eye/issues/260#issuecomment-26002",
                created_at: "2026-05-09T10:00:12.000Z",
                updated_at: "2026-05-09T10:00:12.000Z",
                body: [
                  "<!-- vtdd:vps-runner-event:remote-codex-issue260-vps -->",
                  "```json",
                  JSON.stringify({
                    status: "running",
                    lastEvent: "picked_up",
                    currentStep: "picked_up",
                    updatedAt: "2026-05-09T10:00:12.000Z"
                  }),
                  "```"
                ].join("\n")
              },
              {
                id: 26003,
                html_url: "https://github.com/sample-org/sunaba-eye/issues/260#issuecomment-26003",
                created_at: "2026-05-09T10:00:20.000Z",
                updated_at: "2026-05-09T10:00:20.000Z",
                body: [
                  "<!-- vtdd:vps-runner-event:remote-codex-issue260-vps -->",
                  "```json",
                  JSON.stringify({
                    status: "running",
                    lastEvent: "codex_subprocess_started",
                    currentStep: "codex_subprocess",
                    updatedAt: "2026-05-09T10:00:20.000Z"
                  }),
                  "```"
                ].join("\n")
              },
              {
                id: 26004,
                html_url: "https://github.com/sample-org/sunaba-eye/issues/260#issuecomment-26004",
                created_at: "2026-05-09T10:04:02.000Z",
                updated_at: "2026-05-09T10:04:02.000Z",
                body: [
                  "<!-- vtdd:vps-runner-event:remote-codex-issue260-vps -->",
                  "```json",
                  JSON.stringify({
                    status: "running",
                    lastEvent: "branch_pushed",
                    currentStep: "branch_pushed",
                    updatedAt: "2026-05-09T10:04:02.000Z"
                  }),
                  "```"
                ].join("\n")
              },
              {
                id: 26005,
                html_url: "https://github.com/sample-org/sunaba-eye/issues/260#issuecomment-26005",
                created_at: "2026-05-09T10:04:10.000Z",
                updated_at: "2026-05-09T10:04:10.000Z",
                body: [
                  "<!-- vtdd:vps-runner-event:remote-codex-issue260-vps -->",
                  "```json",
                  JSON.stringify({
                    status: "completed",
                    lastEvent: "pull_request_created",
                    currentStep: "pull_request_created",
                    updatedAt: "2026-05-09T10:04:10.000Z"
                  }),
                  "```"
                ].join("\n")
              }
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify([
            {
              number: 260,
              html_url: "https://github.com/sample-org/sunaba-eye/pull/260",
              state: "open",
              title: "VPS runner execution for issue #260",
              created_at: "2026-05-09T10:04:10.000Z"
            }
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(progress.ok, true);
  assert.equal(progress.progress.leadTime.queued_at, "2026-05-09T10:00:00.000Z");
  assert.equal(progress.progress.leadTime.picked_up_at, "2026-05-09T10:00:12.000Z");
  assert.equal(progress.progress.leadTime.codex_started_at, "2026-05-09T10:00:20.000Z");
  assert.equal(progress.progress.leadTime.branch_pushed_at, "2026-05-09T10:04:02.000Z");
  assert.equal(progress.progress.leadTime.pr_created_at, "2026-05-09T10:04:10.000Z");
  assert.equal(progress.progress.leadTime.completed_at, "2026-05-09T10:04:10.000Z");
  assert.equal(progress.progress.leadTime.durations.queue_wait_duration.label, "12s");
  assert.equal(progress.progress.leadTime.durations.codex_execution_duration.label, "3m 42s");
  assert.equal(progress.progress.leadTime.durations.pr_creation_duration.label, "8s");
  assert.equal(progress.progress.leadTime.durations.total_lead_time.label, "4m 10s");
});

test("remote Codex vps_runner progress reconstructs lead time from GitHub comment runtime truth", async () => {
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: "remote-codex-issue260-comment-truth",
    repository: "sample-org/sunaba-eye",
    issueNumber: 260,
    branch: "codex/issue-260",
    executorTransport: RemoteCodexExecutorTransport.VPS_RUNNER,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async (url) => {
        if (String(url).includes("/issues/260/comments")) {
          return new Response(
            JSON.stringify([
              {
                id: 26011,
                html_url: "https://github.com/sample-org/sunaba-eye/issues/260#issuecomment-26011",
                created_at: "2026-05-09T10:00:00.000Z",
                body: "<!-- vtdd:vps-runner-execution:remote-codex-issue260-comment-truth -->"
              },
              {
                id: 26012,
                html_url: "https://github.com/sample-org/sunaba-eye/issues/260#issuecomment-26012",
                created_at: "2026-05-09T10:01:00.000Z",
                updated_at: "2026-05-09T10:01:00.000Z",
                body: "<!-- vtdd:vps-runner-event:remote-codex-issue260-comment-truth -->\nnot json"
              },
              {
                id: 26013,
                html_url: "https://github.com/sample-org/sunaba-eye/issues/260#issuecomment-26013",
                created_at: "2026-05-09T10:04:45.000Z",
                updated_at: "2026-05-09T10:04:45.000Z",
                body: [
                  "<!-- vtdd:vps-runner-event:remote-codex-issue260-comment-truth -->",
                  "Lead time:",
                  "- Queue wait: 12s",
                  "- Codex execution: 3m 42s",
                  "- PR creation: 8s",
                  "- Total lead time: 4m 45s",
                  "",
                  "```json",
                  JSON.stringify({
                    status: "completed",
                    lastEvent: "execution_completed",
                    currentStep: "completed",
                    updatedAt: "2026-05-09T10:04:45.000Z",
                    leadTime: {
                      queued_at: "2026-05-09T10:00:00.000Z",
                      picked_up_at: "2026-05-09T10:00:12.000Z",
                      codex_started_at: "2026-05-09T10:00:20.000Z",
                      branch_pushed_at: "2026-05-09T10:04:02.000Z",
                      pr_created_at: "2026-05-09T10:04:10.000Z",
                      completed_at: "2026-05-09T10:04:45.000Z",
                      failed_at: null,
                      durations: {
                        queue_wait_duration: { seconds: 12, label: "12s" },
                        codex_execution_duration: { seconds: 222, label: "3m 42s" },
                        pr_creation_duration: { seconds: 8, label: "8s" },
                        total_lead_time: { seconds: 285, label: "4m 45s" }
                      }
                    }
                  }),
                  "```"
                ].join("\n")
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
  assert.equal(progress.progress.status, RemoteCodexExecutionStatus.COMPLETED);
  assert.equal(progress.progress.leadTime.pr_created_at, "2026-05-09T10:04:10.000Z");
  assert.equal(progress.progress.leadTime.completed_at, "2026-05-09T10:04:45.000Z");
  assert.equal(progress.progress.leadTime.durations.total_lead_time.label, "4m 45s");
});

test("remote Codex vps_runner progress blocks stale queue without pickup evidence", async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-05-07T10:10:00Z");
  try {
    const progress = await retrieveRemoteCodexExecutionProgress({
      executionId: "remote-codex-issue173-stale",
      repository: "sample-org/sunaba-eye",
      issueNumber: 173,
      branch: "codex/issue-173",
      executorTransport: RemoteCodexExecutorTransport.VPS_RUNNER,
      env: {
        VPS_RUNNER_PICKUP_GRACE_SECONDS: 300,
        GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
        GITHUB_API_FETCH: async (url) => {
          if (String(url).includes("/issues/173/comments")) {
            return new Response(
              JSON.stringify([
                {
                  id: 17301,
                  html_url: "https://github.com/sample-org/sunaba-eye/issues/173#issuecomment-17301",
                  created_at: "2026-05-07T10:00:00Z",
                  body: "<!-- vtdd:vps-runner-execution:remote-codex-issue173-stale -->"
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
    assert.equal(progress.progress.pullRequest, null);
    assert.equal(progress.progress.branch, null);
    assert.equal(progress.progress.blocker.error, "vps_runner_pickup_not_observed");
    assert.equal(progress.progress.blocker.ageSeconds, 600);
  } finally {
    Date.now = originalNow;
  }
});

test("remote Codex vps_runner progress blocks stale runner heartbeat after branch push", async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-05-07T10:20:00Z");
  try {
    const progress = await retrieveRemoteCodexExecutionProgress({
      executionId: "remote-codex-issue216-stale",
      repository: "sample-org/sunaba-eye",
      issueNumber: 216,
      branch: "codex/issue-216",
      executorTransport: RemoteCodexExecutorTransport.VPS_RUNNER,
      env: {
        VPS_RUNNER_EVENT_STALE_SECONDS: 600,
        GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
        GITHUB_API_FETCH: async (url) => {
          if (String(url).includes("/issues/216/comments")) {
            return new Response(
              JSON.stringify([
                {
                  id: 21601,
                  html_url: "https://github.com/sample-org/sunaba-eye/issues/216#issuecomment-21601",
                  created_at: "2026-05-07T10:00:00Z",
                  body: "<!-- vtdd:vps-runner-execution:remote-codex-issue216-stale -->"
                },
                {
                  id: 21602,
                  html_url: "https://github.com/sample-org/sunaba-eye/issues/216#issuecomment-21602",
                  created_at: "2026-05-07T10:05:00Z",
                  body: [
                    "<!-- vtdd:vps-runner-event:remote-codex-issue216-stale -->",
                    "```json",
                    JSON.stringify({
                      status: "running",
                      lastEvent: "codex_subprocess_heartbeat",
                      currentStep: "codex_subprocess",
                      heartbeatAt: "2026-05-07T10:05:00.000Z",
                      updatedAt: "2026-05-07T10:05:00.000Z",
                      command: {
                        name: "codex",
                        phase: "running",
                        exitCode: null,
                        stderrSummary: null
                      }
                    }),
                    "```"
                  ].join("\n")
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
              name: "codex/issue-216",
              commit: { sha: "abc123" },
              _links: { html: "https://github.com/sample-org/sunaba-eye/tree/codex/issue-216" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
      }
    });

    assert.equal(progress.ok, true);
    assert.equal(progress.progress.status, RemoteCodexExecutionStatus.BLOCKED);
    assert.equal(progress.progress.branch.name, "codex/issue-216");
    assert.equal(progress.progress.runnerEvent.currentStep, "codex_subprocess");
    assert.equal(progress.progress.runnerEvent.command.name, "codex");
    assert.equal(progress.progress.blocker.error, "vps_runner_event_stale");
    assert.equal(progress.progress.blocker.currentStep, "codex_subprocess");
    assert.equal(progress.progress.blocker.ageSeconds, 900);
  } finally {
    Date.now = originalNow;
  }
});

test("remote Codex vps_runner progress reads latest updated runner state comment", async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-05-09T10:09:00Z");
  try {
    const progress = await retrieveRemoteCodexExecutionProgress({
      executionId: "remote-codex-issue226-state",
      repository: "sample-org/sunaba-eye",
      issueNumber: 226,
      branch: "codex/issue-226",
      executorTransport: RemoteCodexExecutorTransport.VPS_RUNNER,
      env: {
        GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
        GITHUB_API_FETCH: async (url) => {
          if (String(url).includes("/issues/226/comments")) {
            return new Response(
              JSON.stringify([
                {
                  id: 22601,
                  html_url: "https://github.com/sample-org/sunaba-eye/issues/226#issuecomment-22601",
                  created_at: "2026-05-09T10:00:00Z",
                  updated_at: "2026-05-09T10:00:00Z",
                  body: "<!-- vtdd:vps-runner-execution:remote-codex-issue226-state -->"
                },
                {
                  id: 22602,
                  html_url: "https://github.com/sample-org/sunaba-eye/issues/226#issuecomment-22602",
                  created_at: "2026-05-09T10:01:00Z",
                  updated_at: "2026-05-09T10:08:00Z",
                  body: [
                    "<!-- vtdd:vps-runner-state:remote-codex-issue226-state -->",
                    "<!-- vtdd:vps-runner-event:remote-codex-issue226-state -->",
                    "```json",
                    JSON.stringify({
                      status: "running",
                      lastEvent: "codex_subprocess_heartbeat",
                      currentStep: "codex_subprocess",
                      heartbeatAt: "2026-05-09T10:08:00.000Z",
                      updatedAt: "2026-05-09T10:08:00.000Z",
                      command: {
                        name: "codex",
                        phase: "running",
                        exitCode: null,
                        stderrSummary: null
                      }
                    }),
                    "```"
                  ].join("\n")
                },
                {
                  id: 22603,
                  html_url: "https://github.com/sample-org/sunaba-eye/issues/226#issuecomment-22603",
                  created_at: "2026-05-09T10:03:00Z",
                  updated_at: "2026-05-09T10:03:00Z",
                  body: [
                    "<!-- vtdd:vps-runner-event:remote-codex-issue226-state -->",
                    "```json",
                    JSON.stringify({
                      status: "branch_created",
                      lastEvent: "branch_pushed",
                      currentStep: "branch_pushed",
                      updatedAt: "2026-05-09T10:03:00.000Z",
                      branch: "codex/issue-226"
                    }),
                    "```"
                  ].join("\n")
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
              name: "codex/issue-226",
              commit: { sha: "abc123" },
              _links: { html: "https://github.com/sample-org/sunaba-eye/tree/codex/issue-226" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
      }
    });

    assert.equal(progress.ok, true);
    assert.equal(progress.progress.status, RemoteCodexExecutionStatus.IN_PROGRESS);
    assert.equal(progress.progress.runnerEvent.commentId, 22602);
    assert.equal(progress.progress.runnerEvent.currentStep, "codex_subprocess");
    assert.equal(progress.progress.runnerEvent.heartbeatAt, "2026-05-09T10:08:00.000Z");
    assert.equal(progress.progress.runnerEvent.command.phase, "running");
  } finally {
    Date.now = originalNow;
  }
});

test("remote Codex vps_runner progress reads runner state comments beyond the first comments page", async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-05-09T10:09:00Z");
  try {
    const commentsRequests = [];
    const progress = await retrieveRemoteCodexExecutionProgress({
      executionId: "remote-codex-issue226-paged-state",
      repository: "sample-org/sunaba-eye",
      issueNumber: 226,
      branch: "codex/issue-226",
      executorTransport: RemoteCodexExecutorTransport.VPS_RUNNER,
      env: {
        GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
        GITHUB_API_FETCH: async (url) => {
          if (String(url).includes("/issues/226/comments")) {
            commentsRequests.push(String(url));
            if (/[?&]page=1(?:&|$)/.test(String(url))) {
              return new Response(
                JSON.stringify(
                  Array.from({ length: 100 }, (_, index) => ({
                    id: 22000 + index,
                    created_at: "2026-05-09T09:00:00Z",
                    updated_at: "2026-05-09T09:00:00Z",
                    body: `ordinary comment ${index}`
                  }))
                ),
                { status: 200, headers: { "content-type": "application/json" } }
              );
            }
            return new Response(
              JSON.stringify([
                {
                  id: 22601,
                  html_url: "https://github.com/sample-org/sunaba-eye/issues/226#issuecomment-22601",
                  created_at: "2026-05-09T10:00:00Z",
                  updated_at: "2026-05-09T10:00:00Z",
                  body: "<!-- vtdd:vps-runner-execution:remote-codex-issue226-paged-state -->"
                },
                {
                  id: 22602,
                  html_url: "https://github.com/sample-org/sunaba-eye/issues/226#issuecomment-22602",
                  created_at: "2026-05-09T10:01:00Z",
                  updated_at: "2026-05-09T10:08:00Z",
                  body: [
                    "<!-- vtdd:vps-runner-state:remote-codex-issue226-paged-state -->",
                    "<!-- vtdd:vps-runner-event:remote-codex-issue226-paged-state -->",
                    "```json",
                    JSON.stringify({
                      status: "running",
                      lastEvent: "codex_subprocess_heartbeat",
                      currentStep: "codex_subprocess",
                      heartbeatAt: "2026-05-09T10:08:00.000Z",
                      updatedAt: "2026-05-09T10:08:00.000Z"
                    }),
                    "```"
                  ].join("\n")
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
              name: "codex/issue-226",
              commit: { sha: "abc123" },
              _links: { html: "https://github.com/sample-org/sunaba-eye/tree/codex/issue-226" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
      }
    });

    assert.equal(progress.ok, true);
    assert.equal(commentsRequests.length, 2);
    assert.equal(progress.progress.runnerEvent.commentId, 22602);
    assert.equal(progress.progress.runnerEvent.currentStep, "codex_subprocess");
    assert.equal(progress.progress.runnerEvent.heartbeatAt, "2026-05-09T10:08:00.000Z");
  } finally {
    Date.now = originalNow;
  }
});

test("remote Codex vps_runner progress reports runner raw failure comments", async () => {
  const progress = await retrieveRemoteCodexExecutionProgress({
    executionId: "remote-codex-issue173-failed",
    repository: "sample-org/sunaba-eye",
    issueNumber: 173,
    branch: "codex/issue-173",
    executorTransport: RemoteCodexExecutorTransport.VPS_RUNNER,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
      GITHUB_API_FETCH: async (url) => {
        if (String(url).includes("/issues/173/comments")) {
          return new Response(
            JSON.stringify([
              {
                id: 17301,
                html_url: "https://github.com/sample-org/sunaba-eye/issues/173#issuecomment-17301",
                created_at: "2026-05-07T10:00:00Z",
                body: "<!-- vtdd:vps-runner-execution:remote-codex-issue173-failed -->"
              },
              {
                id: 17302,
                html_url: "https://github.com/sample-org/sunaba-eye/issues/173#issuecomment-17302",
                created_at: "2026-05-07T10:01:00Z",
                body:
                  "<!-- vtdd:vps-runner-event:remote-codex-issue173-failed -->\n```json\n{\"status\":\"failed\",\"lastEvent\":\"codex_login_missing\",\"rawFailure\":{\"error\":\"codex_auth_unavailable\",\"reason\":\"codex login is required on the VPS runner\"}}\n```"
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
  assert.equal(progress.progress.runnerEvent.lastEvent, "codex_login_missing");
  assert.equal(progress.progress.blocker.error, "codex_auth_unavailable");
  assert.equal(progress.progress.blocker.reason, "codex login is required on the VPS runner");
});

test("remote Codex vps_runner health reports alive pickup and current step", async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-05-09T10:02:00Z");
  try {
    const health = await retrieveVpsRunnerHealthStatus({
      executionId: "remote-codex-issue229-alive",
      repository: "sample-org/sunaba-eye",
      issueNumber: 229,
      branch: "codex/issue-229",
      env: {
        GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
        GITHUB_API_FETCH: async (url) => {
          if (String(url).includes("/issues/229/comments")) {
            return new Response(
              JSON.stringify([
                {
                  id: 22901,
                  html_url: "https://github.com/sample-org/sunaba-eye/issues/229#issuecomment-22901",
                  created_at: "2026-05-09T10:00:00Z",
                  body: "<!-- vtdd:vps-runner-execution:remote-codex-issue229-alive -->"
                },
                {
                  id: 22902,
                  html_url: "https://github.com/sample-org/sunaba-eye/issues/229#issuecomment-22902",
                  created_at: "2026-05-09T10:01:00Z",
                  body: [
                    "<!-- vtdd:vps-runner-event:remote-codex-issue229-alive -->",
                    "```json",
                    JSON.stringify({
                      status: "running",
                      lastEvent: "codex_subprocess_heartbeat",
                      currentStep: "codex_subprocess",
                      heartbeatAt: "2026-05-09T10:01:00.000Z",
                      updatedAt: "2026-05-09T10:01:00.000Z"
                    }),
                    "```"
                  ].join("\n")
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
              name: "codex/issue-229",
              commit: { sha: "abc123" },
              _links: { html: "https://github.com/sample-org/sunaba-eye/tree/codex/issue-229" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
      }
    });

    assert.equal(health.ok, true);
    assert.equal(health.health.runnerStatus, "alive");
    assert.equal(health.health.runnerAlive, true);
    assert.equal(health.health.lastSeenAt, "2026-05-09T10:01:00.000Z");
    assert.equal(health.health.heartbeatAt, "2026-05-09T10:01:00.000Z");
    assert.equal(health.health.queue.pickedUp, true);
    assert.equal(health.health.queue.status, "picked_up");
    assert.equal(health.health.leadTime.queued_at, "2026-05-09T10:00:00Z");
    assert.equal(health.health.leadTime.codex_started_at, "2026-05-09T10:01:00.000Z");
    assert.equal(health.health.currentStep, "codex_subprocess");
    assert.equal(health.health.progressStatus, RemoteCodexExecutionStatus.IN_PROGRESS);
    assert.equal(health.health.reason, null);
  } finally {
    Date.now = originalNow;
  }
});

test("remote Codex vps_runner health reports unavailable stale queue safely", async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-05-09T10:10:00Z");
  try {
    const health = await retrieveVpsRunnerHealthStatus({
      executionId: "remote-codex-issue229-stale",
      repository: "sample-org/sunaba-eye",
      issueNumber: 229,
      branch: "codex/issue-229",
      env: {
        VPS_RUNNER_PICKUP_GRACE_SECONDS: 300,
        GITHUB_APP_INSTALLATION_TOKEN: "ghs_progress_token",
        GITHUB_API_FETCH: async (url) => {
          if (String(url).includes("/issues/229/comments")) {
            return new Response(
              JSON.stringify([
                {
                  id: 22901,
                  html_url: "https://github.com/sample-org/sunaba-eye/issues/229#issuecomment-22901",
                  created_at: "2026-05-09T10:00:00Z",
                  body: "<!-- vtdd:vps-runner-execution:remote-codex-issue229-stale -->"
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

    assert.equal(health.ok, true);
    assert.equal(health.health.runnerStatus, "unavailable");
    assert.equal(health.health.runnerAlive, false);
    assert.equal(health.health.lastSeenAt, null);
    assert.equal(health.health.queue.pickedUp, false);
    assert.equal(health.health.queue.status, "stale");
    assert.equal(health.health.currentStep, "queue_waiting");
    assert.equal(health.health.reasonCode, "vps_runner_pickup_not_observed");
    assert.equal(
      health.health.reason,
      "VPS runner did not report pickup and no target branch or PR was observed within the pickup grace period"
    );
    assert.equal(JSON.stringify(health.health).includes("ghs_progress_token"), false);
  } finally {
    Date.now = originalNow;
  }
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
