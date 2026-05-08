import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCodexExecutionPrompt,
  buildCodexExecArgs,
  buildPullRequestBody,
  buildVpsRunnerEventComment,
  classifyVpsRunnerFailure,
  loadVpsRunnerRepositoryPolicies,
  normalizeRepositoryPolicies,
  parseVpsRunnerEventComment,
  parseVpsRunnerQueueComment,
  runVpsRunnerOnce,
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
      rawFailure: { error: "codex_auth_unavailable" }
    }
  });
  const parsed = parseVpsRunnerEventComment(body);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.executionId, "exec-1");
  assert.equal(parsed.event.status, "failed");
  assert.equal(parsed.event.rawFailure.error, "codex_auth_unavailable");
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
