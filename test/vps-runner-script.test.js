import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFreshExecutionBranchCandidates,
  buildCodexExecutionPrompt,
  buildCodexExecArgs,
  buildGuardedPullRequestBody,
  buildPullRequestBody,
  buildVpsRunnerEventComment,
  buildVpsRunnerStateComment,
  buildVpsRunnerPullRequestContext,
  checkoutVpsRunnerBranch,
  classifyVpsRunnerFailure,
  formatPullRequestContext,
  isNonFastForwardPushFailure,
  loadVpsRunnerRepositoryPolicies,
  normalizeRepositoryPolicies,
  parseVpsRunnerEventComment,
  parseVpsRunnerQueueComment,
  postVpsRunnerEvent,
  runVpsRunnerOnce,
  summarizeDiagnosticText,
  selectPendingVpsReviewerFallbacks,
  selectPendingVpsRunnerExecutions
} from "../scripts/run-vps-runner.mjs";

test("VPS runner parses bounded queue comment payload", () => {
  const parsed = parseVpsRunnerQueueComment(`<!-- vtdd:vps-runner-execution:remote-codex-issue157-vps -->
VTDD-managed VPS runner execution request.

\`\`\`json
{
  "executionId": "remote-codex-issue157-vps",
  "transport": "vps_runner",
  "repository": "sample-org/vtdd-v2",
  "issueNumber": 157,
  "branch": "codex/issue-157",
  "baseRef": "main",
  "codexGoal": "open_pr",
  "approvalScopeMatched": true
}
\`\`\``);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.payload.executionId, "remote-codex-issue157-vps");
  assert.equal(parsed.payload.repository, "sample-org/vtdd-v2");
  assert.equal(parsed.payload.issueNumber, 157);
  assert.equal(parsed.payload.branch, "codex/issue-157");
});

test("VPS runner rejects queue comments without scoped approval", () => {
  const parsed = parseVpsRunnerQueueComment(`<!-- vtdd:vps-runner-execution:remote-codex-issue157-vps -->
\`\`\`json
{
  "executionId": "remote-codex-issue157-vps",
  "transport": "vps_runner",
  "repository": "sample-org/vtdd-v2",
  "issueNumber": 157,
  "branch": "codex/issue-157",
  "approvalScopeMatched": false
}
\`\`\``);

  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, "vps_runner_payload_invalid");
  assert.equal(parsed.issues.includes("approvalScopeMatched must be true"), true);
});

test("VPS runner selects only allowlisted pending queues", () => {
  const comments = [
    {
      id: 1,
      html_url: "https://github.com/sample-org/vtdd-v2/issues/157#issuecomment-1",
      created_at: "2026-05-07T10:00:00Z",
      user: { login: "alice" },
      body: queueComment({ executionId: "exec-1", repository: "sample-org/vtdd-v2" })
    },
    {
      id: 2,
      html_url: "https://github.com/sample-org/vtdd-v2/issues/157#issuecomment-2",
      created_at: "2026-05-07T10:01:00Z",
      body: buildVpsRunnerEventComment({
        executionId: "exec-2",
        event: { status: "running", lastEvent: "runner_started" }
      })
    },
    {
      id: 3,
      html_url: "https://github.com/sample-org/vtdd-v2/issues/157#issuecomment-3",
      created_at: "2026-05-07T10:02:00Z",
      body: queueComment({ executionId: "exec-2", repository: "sample-org/vtdd-v2" })
    },
    {
      id: 4,
      html_url: "https://github.com/evil/repo/issues/1#issuecomment-4",
      created_at: "2026-05-07T10:03:00Z",
      body: queueComment({ executionId: "exec-3", repository: "evil/repo" })
    }
  ];

  const selected = selectPendingVpsRunnerExecutions({
    comments,
    allowedRepositories: ["sample-org/vtdd-v2"]
  });

  assert.equal(selected.length, 1);
  assert.equal(selected[0].payload.executionId, "exec-1");
  assert.equal(selected[0].actors.queueCommentAuthor, "alice");
});

test("VPS runner repository policies allow per-repo base refs and branch prefixes", () => {
  const policies = normalizeRepositoryPolicies({
    config: {
      repositories: {
        "sample-org/tomio": {
          baseRefs: ["private"],
          branchPrefix: "codex/"
        }
      }
    }
  });

  const comments = [
    {
      id: 1,
      html_url: "https://github.com/sample-org/tomio/issues/7#issuecomment-1",
      created_at: "2026-05-07T10:00:00Z",
      body: queueComment({
        executionId: "tomio-1",
        repository: "sample-org/tomio",
        issueNumber: 7,
        branch: "codex/issue-7",
        baseRef: "private"
      })
    },
    {
      id: 2,
      html_url: "https://github.com/sample-org/tomio/issues/8#issuecomment-2",
      created_at: "2026-05-07T10:01:00Z",
      body: queueComment({
        executionId: "tomio-2",
        repository: "sample-org/tomio",
        issueNumber: 8,
        branch: "codex/issue-8",
        baseRef: "main"
      })
    },
    {
      id: 3,
      html_url: "https://github.com/sample-org/tomio/issues/9#issuecomment-3",
      created_at: "2026-05-07T10:02:00Z",
      body: queueComment({
        executionId: "tomio-3",
        repository: "sample-org/tomio",
        issueNumber: 9,
        branch: "feature/issue-9",
        baseRef: "private"
      })
    }
  ];

  const selected = selectPendingVpsRunnerExecutions({ comments, repositoryPolicies: policies });

  assert.equal(selected.length, 1);
  assert.equal(selected[0].payload.executionId, "tomio-1");
});

test("VPS runner loads repository policies from config file", async () => {
  const policies = await loadVpsRunnerRepositoryPolicies({
    env: { VTDD_VPS_RUNNER_CONFIG: "/tmp/vtdd-runner-repos.json" },
    readFile: async () =>
      JSON.stringify({
        repositories: {
          "sample-org/vtdd-v2": {
            baseRefs: ["main"],
            branchPrefixes: ["codex/"]
          },
          "sample-org/disabled": {
            enabled: false
          }
        }
      })
  });

  assert.deepEqual(policies, [
    {
      repository: "sample-org/vtdd-v2",
      baseRefs: ["main"],
      branchPrefixes: ["codex/"]
    }
  ]);
});

test("VPS runner event comment is parseable by execution id", () => {
  const body = buildVpsRunnerEventComment({
    executionId: "exec-1",
    event: {
      status: "failed",
      lastEvent: "codex_login_missing",
      currentStep: "codex_subprocess",
      heartbeatAt: "2026-05-09T10:00:00.000Z",
      updatedAt: "2026-05-09T10:00:00.000Z",
      command: {
        name: "codex",
        phase: "completed",
        exitCode: 1,
        stderrSummary: "Missing bearer authentication"
      },
      rawFailure: { error: "codex_auth_unavailable" }
    }
  });
  const parsed = parseVpsRunnerEventComment(body);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.executionId, "exec-1");
  assert.equal(parsed.event.status, "failed");
  assert.equal(parsed.event.currentStep, "codex_subprocess");
  assert.equal(parsed.event.heartbeatAt, "2026-05-09T10:00:00.000Z");
  assert.equal(parsed.event.command.name, "codex");
  assert.equal(parsed.event.command.exitCode, 1);
  assert.equal(parsed.event.command.stderrSummary, "Missing bearer authentication");
  assert.equal(parsed.event.rawFailure.error, "codex_auth_unavailable");
});

test("VPS runner milestone event mentions queue comment author", () => {
  const body = buildVpsRunnerEventComment({
    executionId: "exec-mention",
    notification: {
      queueCommentAuthor: "alice",
      issueAuthor: "bob"
    },
    event: {
      status: "branch_created",
      lastEvent: "branch_pushed"
    }
  });

  assert.equal(body.split("\n")[1], "@alice VTDD milestone: branch pushed.");
  assert.equal(body.includes("@alice"), true);
  assert.equal(body.includes("@bob"), false);
  assert.equal(parseVpsRunnerEventComment(body).ok, true);
});

test("VPS runner heartbeat event does not mention anyone", () => {
  const body = buildVpsRunnerEventComment({
    executionId: "exec-heartbeat",
    notification: {
      queueCommentAuthor: "alice"
    },
    event: {
      status: "running",
      lastEvent: "codex_subprocess_heartbeat",
      currentStep: "codex_subprocess"
    }
  });

  assert.equal(body.includes("@alice"), false);
});

test("VPS runner notification falls back from bot queue actor to issue author", () => {
  const body = buildVpsRunnerEventComment({
    executionId: "exec-fallback",
    notification: {
      queueCommentAuthor: "github-actions[bot]",
      issueAuthor: "issue-owner"
    },
    event: {
      status: "failed",
      lastEvent: "runner_failed"
    }
  });

  assert.equal(body.includes("@issue-owner"), true);
  assert.equal(body.includes("@github-actions"), false);
});

test("VPS runner notification can fall back to PR author on branch milestones", () => {
  const body = buildVpsRunnerEventComment({
    executionId: "exec-pr-author",
    notification: {
      queueCommentAuthor: "github-actions[bot]",
      issueAuthor: "vtdd-codex[bot]",
      pullRequestAuthor: "pr-owner",
      approvalActor: "go-owner"
    },
    event: {
      status: "branch_created",
      lastEvent: "branch_pushed"
    }
  });

  assert.equal(body.includes("@pr-owner"), true);
  assert.equal(body.includes("@go-owner"), false);
  assert.equal(body.includes("@github-actions"), false);
});

test("VPS runner notification omits mention when no mentionable actor exists", () => {
  const body = buildVpsRunnerEventComment({
    executionId: "exec-no-mention",
    notification: {
      queueCommentAuthor: "app/vtdd-codex",
      issueAuthor: "ghost"
    },
    event: {
      status: "failed",
      lastEvent: "runner_failed"
    }
  });

  assert.equal(body.includes("@"), false);
  assert.equal(body.includes("VTDD milestone: failed."), true);
});

test("VPS runner state comment remains compatible with runner event parsing", () => {
  const body = buildVpsRunnerStateComment({
    executionId: "exec-state-1",
    event: {
      status: "running",
      lastEvent: "codex_subprocess_heartbeat",
      currentStep: "codex_subprocess",
      heartbeatAt: "2026-05-09T10:01:00.000Z",
      updatedAt: "2026-05-09T10:01:00.000Z"
    }
  });
  const parsed = parseVpsRunnerEventComment(body);

  assert.equal(body.includes("vtdd:vps-runner-state:exec-state-1"), true);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.executionId, "exec-state-1");
  assert.equal(parsed.event.status, "running");
  assert.equal(parsed.event.currentStep, "codex_subprocess");
});

test("VPS runner state comment exposes concise lead time before JSON runtime truth", () => {
  const body = buildVpsRunnerStateComment({
    executionId: "exec-lead-time-1",
    event: {
      status: "running",
      lastEvent: "branch_pushed",
      leadTime: {
        queued_at: "2026-05-09T10:00:00.000Z",
        picked_up_at: "2026-05-09T10:00:12.000Z",
        codex_started_at: "2026-05-09T10:00:20.000Z",
        branch_pushed_at: "2026-05-09T10:04:02.000Z",
        durations: {
          queue_wait_duration: { seconds: 12, label: "12s" },
          codex_execution_duration: { seconds: 222, label: "3m 42s" }
        }
      }
    }
  });
  const parsed = parseVpsRunnerEventComment(body);

  assert.equal(body.includes("Lead time:"), true);
  assert.equal(body.includes("- Queue wait: 12s"), true);
  assert.equal(body.includes("- Codex execution: 3m 42s"), true);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.event.leadTime.durations.queue_wait_duration.label, "12s");
});

test("VPS runner heartbeat updates existing state comment instead of posting a new comment", async () => {
  const calls = [];
  const payload = {
    executionId: "exec-heartbeat-1",
    repository: "sample-org/vtdd-v2",
    issueNumber: 226
  };
  const githubFetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).endsWith("/issues/226/comments?per_page=100&page=1")) {
      return [
        {
          id: 22602,
          body: buildVpsRunnerStateComment({
            executionId: "exec-heartbeat-1",
            event: {
              status: "running",
              currentStep: "gh_repo_clone",
              heartbeatAt: "2026-05-09T10:00:00.000Z",
              updatedAt: "2026-05-09T10:00:00.000Z"
            }
          })
        }
      ];
    }
    return { id: 22602 };
  };

  await postVpsRunnerEvent({
    githubFetch,
    payload,
    event: {
      status: "running",
      lastEvent: "codex_subprocess_heartbeat",
      currentStep: "codex_subprocess",
      heartbeatAt: "2026-05-09T10:01:00.000Z",
      updatedAt: "2026-05-09T10:01:00.000Z"
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "/repos/sample-org/vtdd-v2/issues/226/comments?per_page=100&page=1");
  assert.equal(calls[1].url, "/repos/sample-org/vtdd-v2/issues/comments/22602");
  assert.equal(calls[1].init.method, "PATCH");
  assert.equal(calls[1].init.body.body.includes("codex_subprocess_heartbeat"), true);
});

test("VPS runner heartbeat finds an existing state comment beyond the first comments page", async () => {
  const calls = [];
  const payload = {
    executionId: "exec-heartbeat-paged",
    repository: "sample-org/vtdd-v2",
    issueNumber: 226
  };
  const githubFetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).endsWith("/issues/226/comments?per_page=100&page=1")) {
      return Array.from({ length: 100 }, (_, index) => ({
        id: 1000 + index,
        body: `ordinary comment ${index}`
      }));
    }
    if (String(url).endsWith("/issues/226/comments?per_page=100&page=2")) {
      return [
        {
          id: 22699,
          body: buildVpsRunnerStateComment({
            executionId: "exec-heartbeat-paged",
            event: {
              status: "running",
              currentStep: "codex_subprocess",
              heartbeatAt: "2026-05-09T10:00:00.000Z",
              updatedAt: "2026-05-09T10:00:00.000Z"
            }
          })
        }
      ];
    }
    return { id: 22699 };
  };

  await postVpsRunnerEvent({
    githubFetch,
    payload,
    event: {
      status: "running",
      lastEvent: "codex_subprocess_heartbeat",
      currentStep: "codex_subprocess",
      heartbeatAt: "2026-05-09T10:01:00.000Z",
      updatedAt: "2026-05-09T10:01:00.000Z"
    }
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "/repos/sample-org/vtdd-v2/issues/226/comments?per_page=100&page=1");
  assert.equal(calls[1].url, "/repos/sample-org/vtdd-v2/issues/226/comments?per_page=100&page=2");
  assert.equal(calls[2].url, "/repos/sample-org/vtdd-v2/issues/comments/22699");
  assert.equal(calls[2].init.method, "PATCH");
});

test("VPS runner milestone events still create new comments", async () => {
  const calls = [];
  await postVpsRunnerEvent({
    githubFetch: async (url, init = {}) => {
      calls.push({ url, init });
      return { id: 22603 };
    },
    payload: {
      executionId: "exec-branch-1",
      repository: "sample-org/vtdd-v2",
      issueNumber: 226
    },
    event: {
      status: "branch_created",
      lastEvent: "branch_pushed",
      currentStep: "branch_pushed",
      branch: "codex/issue-226"
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/repos/sample-org/vtdd-v2/issues/226/comments");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body.body.includes("vtdd:vps-runner-event:exec-branch-1"), true);
});

test("VPS runner lead time keeps pr_created_at distinct from completed_at", async () => {
  const calls = [];
  const payload = {
    executionId: "exec-pr-created-1",
    repository: "sample-org/vtdd-v2",
    issueNumber: 260,
    lifecycle: {
      queuedAt: "2026-05-09T10:00:00.000Z",
      pickedUpAt: "2026-05-09T10:00:12.000Z",
      codexStartedAt: "2026-05-09T10:00:20.000Z",
      branchPushedAt: "2026-05-09T10:04:02.000Z"
    }
  };

  await postVpsRunnerEvent({
    githubFetch: async (url, init = {}) => {
      calls.push({ url, init });
      return { id: 26003 };
    },
    payload,
    event: {
      status: "pr_created",
      lastEvent: "pull_request_created",
      currentStep: "pull_request_created",
      updatedAt: "2026-05-09T10:04:10.000Z"
    }
  });

  const parsed = parseVpsRunnerEventComment(calls[0].init.body.body);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.event.leadTime.pr_created_at, "2026-05-09T10:04:10.000Z");
  assert.equal(parsed.event.leadTime.completed_at, null);
  assert.equal(parsed.event.leadTime.durations.total_lead_time.label, "4m 10s");
});

test("VPS runner diagnostic summaries redact secrets and stay short", () => {
  const summary = summarizeDiagnosticText(
    [
      "fatal: authentication failed for ghp_123456789012345678901234567890abcdef",
      "api key sk-123456789012345678901234567890 should not be shown",
      Array(120).fill("detail").join(" ")
    ].join("\n"),
    180
  );

  assert.equal(summary.includes("ghp_123456789012345678901234567890abcdef"), false);
  assert.equal(summary.includes("sk-123456789012345678901234567890"), false);
  assert.equal(summary.includes("[REDACTED_GITHUB_TOKEN]"), true);
  assert.equal(summary.includes("[REDACTED_API_KEY]"), true);
  assert.equal(summary.endsWith("[truncated]"), true);
  assert.equal(summary.length <= 192, true);
});

test("VPS runner dry run reports selected execution without side effects", async () => {
  const calls = [];
  const result = await runVpsRunnerOnce({
    token: "ghs_test",
    allowedRepositories: ["sample-org/vtdd-v2"],
    workRoot: "/tmp/vtdd-runner-test",
    dryRun: true,
    githubFetch: async (url) => {
      calls.push(url);
      if (url.includes("/issues?")) {
        return [{ number: 157 }];
      }
      return [
        {
          id: 1,
          html_url: "https://github.com/sample-org/vtdd-v2/issues/157#issuecomment-1",
          created_at: "2026-05-07T10:00:00Z",
          body: queueComment({ executionId: "exec-1", repository: "sample-org/vtdd-v2" })
        }
      ];
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.message.includes("Dry run selected exec-1"), true);
  assert.deepEqual(calls, [
    "/repos/sample-org/vtdd-v2/issues?state=open&sort=updated&direction=desc&per_page=100",
    "/repos/sample-org/vtdd-v2/issues/157/comments?per_page=100"
  ]);
});

test("VPS runner creates a fresh branch when the requested branch already exists remotely", async () => {
  const calls = [];
  const result = await checkoutVpsRunnerBranch({
    payload: {
      branch: "codex/issue-244",
      baseRef: "main",
      codexGoal: "open_pr"
    },
    cwd: "/tmp/workspace",
    env: {},
    run: async (command, args) => {
      calls.push({ command, args });
      if (args[0] === "ls-remote" && args[3] === "codex/issue-244") {
        return { stdout: "abc123\trefs/heads/codex/issue-244\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    }
  });

  assert.equal(result.branch, "codex/issue-244-v2");
  assert.equal(result.originalBranch, "codex/issue-244");
  assert.equal(result.baseRef, "main");
  assert.equal(result.recovered, true);
  assert.equal(result.reason, "remote_branch_collision");
  assert.deepEqual(calls.map((call) => call.args), [
    ["fetch", "origin", "main"],
    ["ls-remote", "--heads", "origin", "codex/issue-244"],
    ["ls-remote", "--heads", "origin", "codex/issue-244-v2"],
    ["checkout", "-B", "codex/issue-244-v2", "origin/main"],
    ["push", "-u", "origin", "codex/issue-244-v2"]
  ]);
});

test("VPS runner retries with a fresh branch after non-fast-forward push rejection", async () => {
  const calls = [];
  const result = await checkoutVpsRunnerBranch({
    payload: {
      branch: "codex/issue-244",
      baseRef: "main",
      codexGoal: "open_pr"
    },
    cwd: "/tmp/workspace",
    env: {},
    run: async (command, args) => {
      calls.push({ command, args });
      if (args[0] === "push" && args[3] === "codex/issue-244") {
        const error = new Error("git push -u origin codex/issue-244 failed with exit code 1");
        error.stderr = "! [rejected] codex/issue-244 -> codex/issue-244 (non-fast-forward)\n";
        throw error;
      }
      return { stdout: "", stderr: "" };
    }
  });

  assert.equal(result.branch, "codex/issue-244-v2");
  assert.equal(result.recovered, true);
  assert.equal(result.reason, "push_rejected_retry");
  assert.equal(result.pushRecovery.failedBranch, "codex/issue-244");
  assert.equal(result.pushRecovery.error, "non_fast_forward_push_rejected");
  assert.deepEqual(
    calls.filter((call) => call.args[0] === "push").map((call) => call.args[3]),
    ["codex/issue-244", "codex/issue-244-v2"]
  );
});

test("VPS runner branch candidates include version and timestamp fallbacks", () => {
  const candidates = buildFreshExecutionBranchCandidates("codex/issue-244", new Date("2026-05-10T12:34:56.000Z"));

  assert.equal(candidates[0], "codex/issue-244");
  assert.equal(candidates[1], "codex/issue-244-v2");
  assert.equal(candidates.includes("codex/issue-244-v20"), true);
  assert.equal(candidates.at(-1), "codex/issue-244-20260510T123456Z");
});

test("VPS runner recognizes non-fast-forward push failures", () => {
  const error = new Error("git push failed");
  error.stderr = "error: failed to push some refs to 'origin'\nhint: Updates were rejected because the remote contains work.";

  assert.equal(isNonFastForwardPushFailure(error), true);
  assert.equal(isNonFastForwardPushFailure(new Error("permission denied")), false);
});

test("VPS runner selects pending Codex reviewer fallback comments after development queues", () => {
  const selected = selectPendingVpsReviewerFallbacks({
    repositoryPolicies: normalizeRepositoryPolicies({
      allowedRepositories: ["sample-org/vtdd-v2"]
    }),
    comments: [
      {
        id: 1,
        html_url: "https://github.com/sample-org/vtdd-v2/pull/22#issuecomment-1",
        created_at: "2026-05-08T10:00:00Z",
        repository: "sample-org/vtdd-v2",
        pullRequestNumber: 22,
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "## VTDD Codex Reviewer Fallback Request",
          "",
          "- Status: `requested`",
          "- Trigger: `pull_request_target:synchronize`",
          "- Reason: `gemini_temporarily_unavailable`",
          "- Delivery mode: `vps_codex_cli`"
        ].join("\n")
      },
      {
        id: 2,
        html_url: "https://github.com/sample-org/vtdd-v2/pull/23#issuecomment-2",
        created_at: "2026-05-08T10:01:00Z",
        repository: "sample-org/vtdd-v2",
        pullRequestNumber: 23,
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "- Status: `requested`",
          "- Delivery mode: `codex_cloud_github_comment`"
        ].join("\n")
      }
    ]
  });

  assert.equal(selected.length, 1);
  assert.equal(selected[0].repository, "sample-org/vtdd-v2");
  assert.equal(selected[0].pullRequestNumber, 22);
  assert.equal(selected[0].trigger, "pull_request_target:synchronize");
});

test("VPS runner Codex prompt preserves high-risk boundaries", () => {
  const prompt = buildCodexExecutionPrompt({
    payload: {
      repository: "sample-org/vtdd-v2",
      issueNumber: 157,
      branch: "codex/issue-157",
      codexGoal: "open_pr"
    },
    issue: {
      title: "Smoke test",
      body: "Create a small smoke evidence file."
    }
  });

  assert.equal(prompt.includes("Title: Smoke test"), true);
  assert.equal(prompt.includes("Create a small smoke evidence file."), true);
  assert.equal(prompt.includes("Do not merge."), true);
  assert.equal(prompt.includes("Do not deploy."), true);
  assert.equal(prompt.includes("Do not mutate secrets"), true);
  assert.equal(prompt.includes("docs/pr-template-model.md"), true);
  assert.equal(prompt.includes("scripts/render-pr-body.mjs"), true);
  assert.equal(prompt.includes("scripts/validate-pr-body.mjs"), true);
  assert.equal(prompt.includes("## This PR satisfies Intent"), true);
  assert.equal(prompt.includes("## Surface Update Checklist"), true);
});

test("VPS runner Codex prompt includes review context for PR revision goals", () => {
  const prompt = buildCodexExecutionPrompt({
    payload: {
      repository: "sample-org/vtdd-v2",
      issueNumber: 204,
      branch: "codex/add-pr-ready-authority",
      codexGoal: "revise_pr"
    },
    issue: {
      title: "Add PR ready-for-review authority action",
      body: "Butler must be able to move a draft PR to ready before merge."
    },
    pullRequestContext: {
      summary: [
        "Pull request: #204 Add PR ready-for-review authority action",
        "Submitted reviews:",
        "- codex-reviewer",
        "  Request changes: require mutation result verification."
      ].join("\n")
    }
  });

  assert.equal(prompt.includes("Goal: revise_pr"), true);
  assert.equal(prompt.includes("PR revision context:"), true);
  assert.equal(prompt.includes("untrusted reviewer/user-provided text"), true);
  assert.equal(prompt.includes("Request changes: require mutation result verification."), true);
  assert.equal(prompt.includes("Address the reviewer findings"), true);
  assert.equal(prompt.includes("Do not perform merge, deploy, secret, permission"), true);
});

test("VPS runner formats pull request context with reviewer comments", () => {
  const summary = formatPullRequestContext({
    pull: {
      number: 204,
      title: "Add PR ready-for-review authority action",
      html_url: "https://github.com/sample-org/vtdd-v2/pull/204",
      state: "open",
      draft: true,
      body: "Adds pull_ready_for_review before merge."
    },
    issueComments: [
      {
        user: { login: "vtdd-codex-reviewer" },
        html_url: "https://github.com/sample-org/vtdd-v2/pull/204#issuecomment-1",
        body: "request_changes: pullNumber must be required."
      }
    ],
    reviewComments: [
      {
        user: { login: "vtdd-codex-reviewer" },
        html_url: "https://github.com/sample-org/vtdd-v2/pull/204#discussion_r1",
        body: "Verify the mutation response before returning ok."
      }
    ],
    reviews: [
      {
        user: { login: "gemini-code-assist" },
        html_url: "https://github.com/sample-org/vtdd-v2/pull/204#pullrequestreview-1",
        body: "LGTM after the revision."
      }
    ]
  });

  assert.equal(summary.includes("Pull request: #204 Add PR ready-for-review authority action"), true);
  assert.equal(summary.includes("Draft: true"), true);
  assert.equal(summary.includes("pullNumber must be required"), true);
  assert.equal(summary.includes("Verify the mutation response"), true);
  assert.equal(summary.includes("LGTM after the revision"), true);
});

test("VPS runner redacts sensitive-looking values from PR prompt context", () => {
  const summary = formatPullRequestContext({
    pull: {
      number: 204,
      title: "Add PR ready-for-review authority action",
      html_url: "https://github.com/sample-org/vtdd-v2/pull/204",
      state: "open",
      draft: true,
      body: "token=ghp_123456789012345678901234567890abcdef"
    },
    issueComments: [
      {
        user: { login: "reviewer" },
        body: "api key sk-123456789012345678901234567890"
      }
    ],
    reviewComments: [],
    reviews: []
  });

  assert.equal(summary.includes("ghp_123456789012345678901234567890abcdef"), false);
  assert.equal(summary.includes("sk-123456789012345678901234567890"), false);
  assert.equal(summary.includes("[REDACTED_GITHUB_TOKEN]"), true);
  assert.equal(summary.includes("[REDACTED_API_KEY]"), true);
});

test("VPS runner blocks revision goals when no open PR exists for the branch", async () => {
  await assert.rejects(
    buildVpsRunnerPullRequestContext({
      payload: {
        repository: "sample-org/vtdd-v2",
        branch: "codex/no-open-pr"
      },
      githubFetch: async () => []
    }),
    /No open pull request found for revision branch codex\/no-open-pr/
  );
});

test("VPS runner PR body satisfies guarded PR template markers", () => {
  const body = buildPullRequestBody({
    repository: "sample-org/vtdd-v2",
    issueNumber: 194,
    executionId: "remote-codex-issue194-test",
    branch: "codex/issue-194",
    codexGoal: "open_pr"
  });

  assert.equal(body.includes("## This PR satisfies Intent"), true);
  assert.equal(body.includes("## Satisfied Success Criteria"), true);
  assert.equal(body.includes("## Unsatisfied Success Criteria"), true);
  assert.equal(body.includes("## Verification Evidence"), true);
  assert.equal(body.includes("## Surface Update Checklist"), true);
  assert.equal(body.includes("Execution ID: remote-codex-issue194-test"), true);
  assert.equal(body.includes("No merge or deploy is performed by the VPS runner."), true);
});

test("VPS runner preserves a guarded-policy-compliant PR body candidate", () => {
  const candidate = buildPullRequestBody({
    repository: "sample-org/vtdd-v2",
    issueNumber: 213,
    executionId: "remote-codex-issue213-test",
    branch: "codex/issue-213",
    codexGoal: "open_pr"
  });
  const normalized = buildGuardedPullRequestBody({
    payload: {
      repository: "sample-org/vtdd-v2",
      issueNumber: 213,
      executionId: "remote-codex-issue213-test",
      branch: "codex/issue-213",
      codexGoal: "open_pr"
    },
    candidateBody: candidate
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.normalized, false);
  assert.equal(normalized.body, candidate);
});

test("VPS runner normalizes malformed PR body candidates with canonical template", () => {
  const normalized = buildGuardedPullRequestBody({
    payload: {
      repository: "sample-org/vtdd-v2",
      issueNumber: 213,
      executionId: "remote-codex-issue213-test",
      branch: "codex/issue-213",
      codexGoal: "open_pr"
    },
    candidateBody: "Partial notes without guarded-policy markers."
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.normalized, true);
  assert.equal(normalized.validationErrors.includes("Missing PR template marker: ## This PR satisfies Intent"), true);
  assert.equal(normalized.body.includes("## This PR satisfies Intent"), true);
  assert.equal(normalized.body.includes("## Satisfied Success Criteria"), true);
  assert.equal(normalized.body.includes("## Unsatisfied Success Criteria"), true);
  assert.equal(normalized.body.includes("## Verification Evidence"), true);
  assert.equal(normalized.body.includes("## Surface Update Checklist"), true);
  assert.equal(normalized.body.includes("Issue #213"), true);
});

test("VPS runner classifies unauthenticated Codex CLI as raw auth failure", () => {
  const failure = classifyVpsRunnerFailure(
    new Error("codex exec failed: unexpected status 401 Unauthorized: Missing bearer authentication")
  );

  assert.equal(failure.error, "codex_auth_unavailable");
  assert.equal(failure.reason, "Codex CLI is not authenticated on the VPS runner.");
  assert.equal(failure.rawError.includes("401 Unauthorized"), true);
});

test("VPS runner classifies bubblewrap sandbox failure as sandbox unavailable", () => {
  const failure = classifyVpsRunnerFailure(new Error("bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted"));

  assert.equal(failure.error, "codex_sandbox_unavailable");
  assert.equal(failure.reason.includes("VTDD_VPS_RUNNER_CODEX_SANDBOX_BYPASS=true"), true);
});

test("VPS runner Codex args require explicit opt-in for sandbox bypass", () => {
  assert.deepEqual(buildCodexExecArgs({ env: {} }), [
    "exec",
    "--skip-git-repo-check",
    "--sandbox",
    "workspace-write",
    "-"
  ]);
  assert.deepEqual(buildCodexExecArgs({ env: { VTDD_VPS_RUNNER_CODEX_SANDBOX_BYPASS: "true" } }), [
    "exec",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
    "-"
  ]);
});

function queueComment({
  executionId,
  repository,
  issueNumber = 157,
  branch = "codex/issue-157",
  baseRef = "main"
}) {
  return `<!-- vtdd:vps-runner-execution:${executionId} -->
\`\`\`json
{
  "executionId": "${executionId}",
  "transport": "vps_runner",
  "repository": "${repository}",
  "issueNumber": ${issueNumber},
  "branch": "${branch}",
  "baseRef": "${baseRef}",
  "codexGoal": "open_pr",
  "approvalScopeMatched": true
}
\`\`\``;
}
