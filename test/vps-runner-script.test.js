import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildFreshExecutionBranchCandidates,
  buildCodexExecutionPrompt,
  buildCodexExecArgs,
  buildCodexExecutionEnv,
  buildGuardedPullRequestBody,
  buildPostMergePullTruth,
  buildPullRequestBody,
  buildVpsRunnerPreflightReceipt,
  buildVpsRunnerPrCreateArgs,
  buildVpsRunnerCompletionFinalEvent,
  buildVpsRunnerEventComment,
  buildVpsReviewerFallbackActorIdentityIncident,
  buildVpsRunnerStateComment,
  buildVpsRunnerPullRequestContext,
  checkoutVpsRunnerBranch,
  classifyVpsRunnerFailure,
  formatPullRequestContext,
  isNonFastForwardPushFailure,
  loadVpsRunnerRepositoryPolicies,
  normalizeRepositoryPolicies,
  parseVpsRunnerCancellationMarker,
  parseVpsRunnerEventComment,
  parseVpsPrivilegedMaintenanceQueueComment,
  parseVpsRunnerQueueComment,
  postVpsRunnerEvent,
  runVpsRunnerOnce,
  resolveRoleGitHubAppInstallationToken,
  summarizeDiagnosticText,
  selectPendingVpsReviewerFallbacks,
  selectPendingVpsPrivilegedMaintenanceExecutions,
  selectPendingVpsRunnerExecutions
} from "../scripts/run-vps-runner.mjs";

function developmentStrategyFixture() {
  return {
    evidencePath: "docs/development-strategy/issue-703-predev-strategy-guard.md",
    completionExperience: "Dashboard Butler とオーナーが実装前作戦図を確認できる。",
    vtddArea: "VPS runner の PR body handoff guardrail を進める。",
    design: "owner-facing completion design と scope boundary を先に固定し、VPS runner は作戦図を PR body に渡す。",
    hypothesis: "root blocker は作戦図なしの PR 正規化であり、そこを許すと予見不足の PR が通るという仮説。",
    verificationPlan: "test/vps-runner-script.test.js と PR body validator で検証する。",
    changeEstimate: "scripts/run-vps-runner.mjs の buildPullRequestBody 関数と test/vps-runner-script.test.js を改修する。",
    knownPath: "VPS runner は buildGuardedPullRequestBody で canonical PR body を作る。",
    unknownBoundary: "Dashboard Butler から作戦図を生成する UI は未接続。",
    likelyGaps: "handoff payload に developmentStrategy がない場合に canonical fallback が通ると穴になる。",
    prePrChecks: "scripts/run-vps-runner.mjs、validate-pr-body、vps runner tests を確認する。",
    optionsRejected: "作戦図なし fallback を許す案は捨てる。",
    postMergeE2E: "node --test test/vps-runner-script.test.js test/pr-body-guardrail.test.js",
    noNextPrReason: "VPS runner generator と tests を同じ PR で更新する。",
    stopCondition: "作戦図なしで valid PR body を作れる場合は停止する。"
  };
}

test("VPS runner parses bounded queue comment payload", () => {
  const parsed = parseVpsRunnerQueueComment(`<!-- vtdd:vps-runner-execution:remote-codex-issue157-vps -->
VTDD 管理の VPS runner 実行キューです。

\`\`\`json
{
  "executionId": "remote-codex-issue157-vps",
  "transport": "vps_runner",
  "repository": "sample-org/vtdd-v2",
  "issueNumber": 157,
  "branch": "codex/issue-157",
  "baseRef": "main",
  "codexGoal": "open_pr",
  "approvalScopeMatched": true,
  "issueTraceability": {
    "canonicalSpec": "github_issue",
    "issueNumber": 157,
    "relatedIssue": 157,
    "issueTraceable": true
  }
}
\`\`\``);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.payload.executionId, "remote-codex-issue157-vps");
  assert.equal(parsed.payload.repository, "sample-org/vtdd-v2");
  assert.equal(parsed.payload.issueNumber, 157);
  assert.equal(parsed.payload.branch, "codex/issue-157");
});

test("VPS runner parses privileged maintenance helper queue payload", () => {
  const parsed = parseVpsPrivilegedMaintenanceQueueComment(privilegedMaintenanceQueueComment({
    executionId: "vps-maint-637-a",
    dashboardThreadId: "dashboard-main-sample-org-vtdd-v2"
  }));

  assert.equal(parsed.ok, true);
  assert.equal(parsed.executionId, "vps-maint-637-a");
  assert.equal(parsed.payload.transport, "vps_privileged_maintenance_helper");
  assert.equal(parsed.payload.repository, "sample-org/vtdd-v2");
  assert.equal(parsed.payload.issueNumber, 637);
  assert.equal(parsed.payload.dashboardThreadId, "dashboard-main-sample-org-vtdd-v2");
  assert.equal(parsed.payload.handoff.dashboardThreadId, "dashboard-main-sample-org-vtdd-v2");
  assert.equal(parsed.payload.approvalScopeMatched, true);
  assert.equal(parsed.payload.executionEnvelope.status, "ready_for_vps_helper_execution");
  assert.equal(parsed.payload.executionEnvelope.helperInvocation.shell, false);
  assert.equal(parsed.payload.executionEnvelope.helperExecutionInput.mode, "execute");
});

test("VPS runner rejects privileged maintenance queue payload that changes helper argv", () => {
  const parsed = parseVpsPrivilegedMaintenanceQueueComment(privilegedMaintenanceQueueComment({
    executionId: "vps-maint-637-b",
    helperArgs: ["-n", "/bin/sh", "-c", "echo unsafe", "<helper-execution-input-json>"]
  }));

  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, "vps_privileged_maintenance_payload_invalid");
  assert.equal(
    parsed.issues.includes("executionEnvelope.helperInvocation.args must match the bounded root helper invocation"),
    true
  );
});

test("VPS runner selects pending privileged maintenance queue only once", () => {
  const comments = [
    {
      id: 1,
      html_url: "https://github.example/comment/1",
      created_at: "2026-05-30T00:00:00Z",
      user: { login: "owner" },
      body: privilegedMaintenanceQueueComment({ executionId: "vps-maint-637-c" })
    },
    {
      id: 2,
      created_at: "2026-05-30T00:01:00Z",
      body: "<!-- vtdd:vps-runner-event:vps-maint-637-d -->\n```json\n{\"status\":\"completed\"}\n```"
    },
    {
      id: 3,
      created_at: "2026-05-30T00:02:00Z",
      body: privilegedMaintenanceQueueComment({ executionId: "vps-maint-637-d" })
    }
  ];

  const selected = selectPendingVpsPrivilegedMaintenanceExecutions({
    comments,
    repositoryPolicies: normalizeRepositoryPolicies({ allowedRepositories: ["sample-org/vtdd-v2"] })
  });

  assert.equal(selected.length, 1);
  assert.equal(selected[0].payload.executionId, "vps-maint-637-c");
  assert.equal(selected[0].actors.queueCommentAuthor, "owner");
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
  "approvalScopeMatched": false,
  "issueTraceability": {
    "issueTraceable": true
  }
}
\`\`\``);

  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, "vps_runner_payload_invalid");
  assert.equal(parsed.issues.includes("approvalScopeMatched must be true"), true);
});

test("VPS runner rejects revise_pr queue payload without open target PR lock", () => {
  const parsed = parseVpsRunnerQueueComment(`<!-- vtdd:vps-runner-execution:remote-codex-issue251-vps -->
\`\`\`json
{
  "executionId": "remote-codex-issue251-vps",
  "transport": "vps_runner",
  "repository": "sample-org/vtdd-v2",
  "issueNumber": 251,
  "branch": "codex/issue-251",
  "baseRef": "main",
  "codexGoal": "revise_pr",
  "approvalScopeMatched": true,
  "issueTraceability": {
    "issueTraceable": true
  },
  "revisionTarget": {
    "number": 279,
    "state": "closed",
    "headRef": "codex/issue-251",
    "headSha": "old-sha"
  }
}
\`\`\``);

  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, "vps_runner_payload_invalid");
  assert.equal(parsed.issues.includes("revise_pr target PR must be open"), true);
});

test("VPS runner rejects revise_pr queue payload when branch differs from target PR headRef", () => {
  const parsed = parseVpsRunnerQueueComment(`<!-- vtdd:vps-runner-execution:remote-codex-issue251-vps -->
\`\`\`json
{
  "executionId": "remote-codex-issue251-vps",
  "transport": "vps_runner",
  "repository": "sample-org/vtdd-v2",
  "issueNumber": 251,
  "branch": "codex/issue-251",
  "baseRef": "main",
  "codexGoal": "revise_pr",
  "approvalScopeMatched": true,
  "issueTraceability": {
    "issueTraceable": true
  },
  "revisionTarget": {
    "number": 285,
    "state": "open",
    "headRef": "codex/issue-251-v2",
    "headSha": "fresh-sha"
  }
}
\`\`\``);

  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, "vps_runner_payload_invalid");
  assert.equal(parsed.issues.includes("revise_pr branch must match target PR headRef"), true);
});

test("VPS runner parses post_merge_verify queue payload with merged target PR lock", () => {
  const parsed = parseVpsRunnerQueueComment(`<!-- vtdd:vps-runner-execution:remote-codex-issue397-postmerge -->
\`\`\`json
{
  "executionId": "remote-codex-issue397-postmerge",
  "transport": "vps_runner",
  "repository": "sample-org/vtdd-v2",
  "issueNumber": 397,
  "branch": "main",
  "baseRef": "main",
  "codexGoal": "post_merge_verify",
  "approvalScopeMatched": true,
  "issueTraceability": {
    "issueTraceable": true
  },
  "revisionTarget": {
    "number": 396,
    "state": "closed",
    "merged": true,
    "mergedAt": "2026-05-15T13:43:25Z",
    "mergeCommitSha": "merge-sha-396",
    "headRef": "codex/issue-393",
    "headSha": "head-sha-393",
    "baseRef": "main"
  }
}
\`\`\``);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.payload.codexGoal, "post_merge_verify");
  assert.equal(parsed.payload.branch, "main");
  assert.equal(parsed.payload.revisionTarget.number, 396);
  assert.equal(parsed.payload.revisionTarget.merged, true);
  assert.equal(parsed.payload.revisionTarget.mergeCommitSha, "merge-sha-396");
});

test("VPS runner rejects post_merge_verify queue payload without target PR number", () => {
  const parsed = parseVpsRunnerQueueComment(`<!-- vtdd:vps-runner-execution:remote-codex-issue397-postmerge -->
\`\`\`json
{
  "executionId": "remote-codex-issue397-postmerge",
  "transport": "vps_runner",
  "repository": "sample-org/vtdd-v2",
  "issueNumber": 397,
  "branch": "main",
  "baseRef": "main",
  "codexGoal": "post_merge_verify",
  "approvalScopeMatched": true,
  "issueTraceability": {
    "issueTraceable": true
  },
  "revisionTarget": {
    "state": "closed",
    "merged": true
  }
}
\`\`\``);

  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, "vps_runner_payload_invalid");
  assert.equal(parsed.issues.includes("post_merge_verify requires target PR number"), true);
});

test("VPS runner builds post-merge PR truth from GitHub pull response", () => {
  const truth = buildPostMergePullTruth({
    pull: {
      number: 396,
      html_url: "https://github.com/sample-org/vtdd-v2/pull/396",
      state: "closed",
      merged: true,
      merged_at: "2026-05-15T13:43:25Z",
      merge_commit_sha: "merge-sha-396",
      base: { ref: "main" },
      head: { ref: "codex/issue-393", sha: "head-sha-393" }
    },
    target: {}
  });

  assert.deepEqual(truth, {
    number: 396,
    url: "https://github.com/sample-org/vtdd-v2/pull/396",
    state: "closed",
    merged: true,
    mergedAt: "2026-05-15T13:43:25Z",
    mergeCommitSha: "merge-sha-396",
    headRef: "codex/issue-393",
    headSha: "head-sha-393",
    baseRef: "main"
  });
});

test("VPS runner checkout blocks revise_pr when target lock is incomplete", async () => {
  await assert.rejects(
    checkoutVpsRunnerBranch({
      payload: {
        codexGoal: "revise_pr",
        branch: "codex/issue-251",
        revisionTarget: {
          number: 285,
          state: "open",
          headRef: "codex/issue-251-v2"
        }
      },
      cwd: "/tmp/vtdd-test",
      env: {},
      run: async () => {
        throw new Error("git must not run for invalid revision target");
      }
    }),
    /Invalid revise_pr target lock: revise_pr requires target PR headSha; revise_pr branch must match target PR headRef/
  );
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

test("VPS runner ignores queue comments with canceled markers", () => {
  const body = `${queueComment({ executionId: "exec-cancel", repository: "sample-org/vtdd-v2" })}

<!-- vtdd:vps-runner-canceled:exec-cancel -->
VTDD VPS runner cancellation marker.

\`\`\`json
{
  "status": "canceled",
  "mode": "execution",
  "executionId": "exec-cancel",
  "repository": "sample-org/vtdd-v2",
  "issueNumber": 157,
  "reason": "stale branch",
  "canceledAt": "2026-05-10T10:00:00.000Z"
}
\`\`\``;

  const cancellation = parseVpsRunnerCancellationMarker(body, {
    executionId: "exec-cancel"
  });
  const selected = selectPendingVpsRunnerExecutions({
    comments: [
      {
        id: 1,
        html_url: "https://github.com/sample-org/vtdd-v2/issues/157#issuecomment-1",
        created_at: "2026-05-07T10:00:00Z",
        body
      }
    ],
    allowedRepositories: ["sample-org/vtdd-v2"]
  });

  assert.equal(cancellation.status, "canceled");
  assert.equal(cancellation.reason, "stale branch");
  assert.equal(selected.length, 0);
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

test("VPS runner event preserves dashboard chat thread from handoff payload", async () => {
  const calls = [];
  await postVpsRunnerEvent({
    githubFetch: async (url, init = {}) => {
      calls.push({ url, init });
      return { id: 45002 };
    },
    payload: {
      executionId: "exec-dashboard-thread",
      repository: "marushu/vtdd-v2-p",
      issueNumber: 450,
      handoff: {
        dashboardThreadId: "dashboard-main-marushu-vtdd-v2-p"
      }
    },
    event: {
      status: "branch_created",
      lastEvent: "branch_created",
      currentStep: "branch_created",
      updatedAt: "2026-05-20T00:00:00.000Z"
    }
  });

  const body = calls[0].init.body.body;
  const parsed = parseVpsRunnerEventComment(body);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.event.threadId, "dashboard-main-marushu-vtdd-v2-p");
});

test("VPS runner event posts dashboard thread events to runtime", async () => {
  const githubCalls = [];
  const runtimeCalls = [];
  await postVpsRunnerEvent({
    githubFetch: async (url, init = {}) => {
      githubCalls.push({ url, init });
      return { id: 45003 };
    },
    fetchImpl: async (url, init = {}) => {
      runtimeCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: { "content-type": "application/json" }
      });
    },
    env: {
      VTDD_RUNTIME_URL: "https://vtdd-v2-mvp.example.workers.dev",
      VTDD_GATEWAY_BEARER_TOKEN: "gateway-token-for-test"
    },
    payload: {
      executionId: "exec-dashboard-runtime",
      repository: "marushu/vtdd-v2-p",
      issueNumber: 450,
      handoff: {
        dashboardThreadId: "dashboard-main-marushu-vtdd-v2-p"
      }
    },
    event: {
      status: "completed",
      lastEvent: "branch_pushed",
      finalEvent: "branch_pushed",
      currentStep: "branch_pushed",
      message: "実装ブランチを push しました。"
    }
  });

  assert.equal(runtimeCalls.length, 1);
  assert.equal(runtimeCalls[0].url, "https://vtdd-v2-mvp.example.workers.dev/v2/events/vps-runner");
  assert.equal(runtimeCalls[0].init.method, "POST");
  assert.equal(runtimeCalls[0].init.headers.authorization, "Bearer gateway-token-for-test");
  const runtimeBody = JSON.parse(runtimeCalls[0].init.body);
  assert.equal(runtimeBody.threadId, "dashboard-main-marushu-vtdd-v2-p");
  assert.equal(runtimeBody.status, "completed");
  assert.equal(runtimeBody.lastEvent, "branch_pushed");
  assert.equal(runtimeBody.message.includes("実装ブランチ"), true);

  const parsed = parseVpsRunnerEventComment(githubCalls[0].init.body.body);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.event.dashboardDelivery.status, "delivered");
  assert.equal(
    parsed.event.dashboardDelivery.endpoint,
    "https://vtdd-v2-mvp.example.workers.dev/v2/events/vps-runner"
  );
});

test("VPS runner event can read dashboard delivery token from vault manifest", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-vps-dashboard-vault-"));
  const credentialsDir = path.join(tempDir, "credentials");
  await fs.mkdir(path.join(credentialsDir, "gateway"), { recursive: true });
  const manifestPath = path.join(credentialsDir, "manifest.json");
  await fs.writeFile(path.join(credentialsDir, "gateway", "bearer-token.txt"), "vault-token-for-test\n");
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: 1,
        gateway: {
          bearerTokenPath: "gateway/bearer-token.txt",
          runtimeUrl: "https://vtdd-v2-mvp.example.workers.dev"
        }
      },
      null,
      2
    )
  );

  const githubCalls = [];
  const runtimeCalls = [];
  await postVpsRunnerEvent({
    githubFetch: async (url, init = {}) => {
      githubCalls.push({ url, init });
      return { id: 45005 };
    },
    fetchImpl: async (url, init = {}) => {
      runtimeCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: { "content-type": "application/json" }
      });
    },
    env: {
      VTDD_VPS_RUNNER_CREDENTIALS_MANIFEST: manifestPath
    },
    payload: {
      executionId: "exec-dashboard-vault-runtime",
      repository: "marushu/vtdd-v2-p",
      issueNumber: 637,
      handoff: {
        dashboardThreadId: "dashboard-main-marushu-vtdd-v2-p"
      }
    },
    event: {
      status: "completed",
      lastEvent: "privileged_maintenance_completed",
      currentStep: "vps_privileged_maintenance_helper",
      message: "完了"
    }
  });

  assert.equal(runtimeCalls.length, 1);
  assert.equal(runtimeCalls[0].url, "https://vtdd-v2-mvp.example.workers.dev/v2/events/vps-runner");
  assert.equal(runtimeCalls[0].init.headers.authorization, "Bearer vault-token-for-test");
  const parsed = parseVpsRunnerEventComment(githubCalls[0].init.body.body);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.event.dashboardDelivery.status, "delivered");
});

test("VPS runner event records missing runtime dashboard delivery configuration", async () => {
  const calls = [];
  await postVpsRunnerEvent({
    githubFetch: async (url, init = {}) => {
      calls.push({ url, init });
      return { id: 45004 };
    },
    payload: {
      executionId: "exec-dashboard-missing-runtime",
      repository: "marushu/vtdd-v2-p",
      issueNumber: 450,
      handoff: {
        dashboardThreadId: "dashboard-main-marushu-vtdd-v2-p"
      }
    },
    event: {
      status: "completed",
      lastEvent: "branch_pushed",
      currentStep: "branch_pushed",
      message: "完了"
    },
    env: {}
  });

  const parsed = parseVpsRunnerEventComment(calls[0].init.body.body);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.event.dashboardDelivery.status, "skipped");
  assert.equal(
    parsed.event.dashboardDelivery.reason,
    "VTDD_RUNTIME_URL or VTDD_GATEWAY_BEARER_TOKEN is missing"
  );
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

  assert.equal(body.split("\n")[1], "@alice VTDD milestone: branch を push しました。");
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
  assert.equal(body.includes("VTDD milestone: 失敗しました。"), true);
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

  assert.equal(body.includes("所要時間:"), true);
  assert.equal(body.includes("- queue 待ち: 12s"), true);
  assert.equal(body.includes("- Codex 実行: 3m 42s"), true);
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

test("VPS runner completed event records both PR creation and completion timestamps", async () => {
  const calls = [];
  const payload = {
    executionId: "exec-completed-1",
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
      return { id: 26004 };
    },
    payload,
    event: {
      status: "completed",
      lastEvent: "pull_request_created",
      currentStep: "pull_request_created",
      updatedAt: "2026-05-09T10:04:10.000Z"
    }
  });

  const parsed = parseVpsRunnerEventComment(calls[0].init.body.body);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.event.leadTime.pr_created_at, "2026-05-09T10:04:10.000Z");
  assert.equal(parsed.event.leadTime.completed_at, "2026-05-09T10:04:10.000Z");
  assert.equal(parsed.event.leadTime.durations.pr_creation_duration.label, "8s");
  assert.equal(parsed.event.leadTime.durations.total_lead_time.label, "4m 10s");
});

test("VPS runner completed event exposes a GitHub-visible final event", async () => {
  const calls = [];
  const payload = {
    executionId: "exec-final-event-1",
    repository: "sample-org/vtdd-v2",
    issueNumber: 264,
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
      return { id: 26401 };
    },
    payload,
    event: {
      status: "completed",
      lastEvent: "pr_updated",
      finalEvent: "pr_updated",
      currentStep: "completed",
      updatedAt: "2026-05-09T10:04:10.000Z",
      branch: "codex/issue-264",
      pr: "https://github.com/sample-org/vtdd-v2/pull/264",
      finalEventReason: "The VPS runner pushed revision changes and updated the existing pull request."
    }
  });

  const body = calls[0].init.body.body;
  const parsed = parseVpsRunnerEventComment(body);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.event.status, "completed");
  assert.equal(parsed.event.lastEvent, "pr_updated");
  assert.equal(parsed.event.finalEvent, "pr_updated");
  assert.equal(parsed.event.finalEventReason.includes("updated the existing pull request"), true);
  assert.equal(parsed.event.leadTime.pr_created_at, "2026-05-09T10:04:10.000Z");
  assert.equal(parsed.event.leadTime.completed_at, "2026-05-09T10:04:10.000Z");
  assert.equal(body.includes("VTDD milestone: PR を更新しました。"), true);
});

test("VPS runner maps completed execution goals to explicit final events", () => {
  assert.equal(
    buildVpsRunnerCompletionFinalEvent({
      payload: { codexGoal: "open_pr" }
    }),
    "pr_created"
  );
  assert.equal(
    buildVpsRunnerCompletionFinalEvent({
      payload: { codexGoal: "revise_pr" }
    }),
    "pr_updated"
  );
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

test("VPS runner creates ready PRs by default instead of blocking review as draft", () => {
  const args = buildVpsRunnerPrCreateArgs({
    payload: {
      issueNumber: 413,
      branch: "codex/issue-413-ready-pr-default",
      baseRef: "main"
    },
    bodyFile: "/tmp/vtdd-vps-runner-pr-body.md"
  });

  assert.deepEqual(args.slice(0, 2), ["pr", "create"]);
  assert.equal(args.includes("--draft"), false);
  assert.equal(args.includes("--base"), true);
  assert.equal(args.includes("--head"), true);
  assert.equal(args.includes("--body-file"), true);
});

test("VPS runner PR body describes ready PR handoff without draft blocking semantics", () => {
  const body = buildPullRequestBody({
    repository: "sample-org/vtdd-v2",
    issueNumber: 413,
    executionId: "remote-codex-issue413-ready-test",
    branch: "codex/issue-413",
    codexGoal: "open_pr"
  });

  assert.equal(body.includes("ready PR"), true);
  assert.equal(body.includes("draft PR"), false);
  assert.equal(body.includes("VPS runner は ready PR 作成のみ。"), true);
  assert.equal(body.includes("ready PR は Issue完了やmerge許可ではない"), true);
  assert.equal(body.includes("reviewer approve、required checks、head SHA一致、mergeability、approve_auto_merge policy"), true);
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

test("VPS runner does not reprocess Codex fallback requested comments after reviewer approve", () => {
  const selected = selectPendingVpsReviewerFallbacks({
    repositoryPolicies: normalizeRepositoryPolicies({
      allowedRepositories: ["sample-org/vtdd-v2"]
    }),
    comments: [
      {
        id: 1,
        html_url: "https://github.com/sample-org/vtdd-v2/pull/22#issuecomment-1",
        created_at: "2026-05-14T11:50:00Z",
        repository: "sample-org/vtdd-v2",
        pullRequestNumber: 22,
        headSha: "abc123",
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "## VTDD Codex fallback レビュー",
          "",
          "- Status: `requested`",
          "- Trigger: `issue_comment:created`",
          "- Reason: `gemini_temporarily_unavailable`",
          "- Delivery mode: `vps_codex_cli`",
          "- Head SHA: `abc123`"
        ].join("\n")
      },
      {
        id: 2,
        html_url: "https://github.com/sample-org/vtdd-v2/pull/22#issuecomment-2",
        created_at: "2026-05-14T11:51:00Z",
        user: { login: "vtdd-codex[bot]" },
        repository: "sample-org/vtdd-v2",
        pullRequestNumber: 22,
        headSha: "abc123",
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "## VTDD Codex fallback レビュー",
          "",
          "- Status: `completed`",
          "- Trigger: `issue_comment:created`",
          "- Reason: `gemini_temporarily_unavailable`",
          "- Delivery mode: `vps_codex_cli`",
          "- Head SHA: `abc123`",
          "- Recommended action: `approve`"
        ].join("\n")
      }
    ]
  });

  assert.equal(selected.length, 0);
});

test("VPS runner does not reprocess Codex fallback requested comments after reviewer request changes", () => {
  const selected = selectPendingVpsReviewerFallbacks({
    repositoryPolicies: normalizeRepositoryPolicies({
      allowedRepositories: ["sample-org/vtdd-v2"]
    }),
    comments: [
      {
        id: 1,
        html_url: "https://github.com/sample-org/vtdd-v2/pull/22#issuecomment-1",
        created_at: "2026-05-14T11:50:00Z",
        repository: "sample-org/vtdd-v2",
        pullRequestNumber: 22,
        headSha: "abc123",
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "## VTDD Codex fallback レビュー",
          "",
          "- Status: `requested`",
          "- Trigger: `issue_comment:created`",
          "- Reason: `gemini_temporarily_unavailable`",
          "- Delivery mode: `vps_codex_cli`",
          "- Head SHA: `abc123`"
        ].join("\n")
      },
      {
        id: 2,
        html_url: "https://github.com/sample-org/vtdd-v2/pull/22#issuecomment-2",
        created_at: "2026-05-14T11:51:00Z",
        user: { login: "vtdd-codex-fallback-reviewer[bot]" },
        repository: "sample-org/vtdd-v2",
        pullRequestNumber: 22,
        headSha: "abc123",
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "## VTDD Codex fallback レビュー",
          "",
          "- Status: `completed`",
          "- Trigger: `issue_comment:created`",
          "- Reason: `gemini_temporarily_unavailable`",
          "- Delivery mode: `vps_codex_cli`",
          "- Head SHA: `abc123`",
          "- Recommended action: `request_changes`"
        ].join("\n")
      }
    ]
  });

  assert.equal(selected.length, 0);
});

test("VPS runner does not reprocess Codex fallback requested comments after reviewer blocked", () => {
  const selected = selectPendingVpsReviewerFallbacks({
    repositoryPolicies: normalizeRepositoryPolicies({
      allowedRepositories: ["sample-org/vtdd-v2"]
    }),
    comments: [
      {
        id: 1,
        html_url: "https://github.com/sample-org/vtdd-v2/pull/22#issuecomment-1",
        created_at: "2026-05-14T11:50:00Z",
        repository: "sample-org/vtdd-v2",
        pullRequestNumber: 22,
        headSha: "abc123",
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "## VTDD Codex fallback レビュー",
          "",
          "- Status: `requested`",
          "- Trigger: `issue_comment:created`",
          "- Reason: `gemini_temporarily_unavailable`",
          "- Delivery mode: `vps_codex_cli`",
          "- Head SHA: `abc123`"
        ].join("\n")
      },
      {
        id: 2,
        html_url: "https://github.com/sample-org/vtdd-v2/pull/22#issuecomment-2",
        created_at: "2026-05-14T11:51:00Z",
        user: { login: "vtdd-vps-codex-cli[bot]" },
        repository: "sample-org/vtdd-v2",
        pullRequestNumber: 22,
        headSha: "abc123",
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "## VTDD Codex fallback レビュー",
          "",
          "- Status: `blocked`",
          "- Trigger: `issue_comment:created`",
          "- Reason: `codex_fallback_unavailable`",
          "- Delivery mode: `vps_codex_cli`",
          "- Head SHA: `abc123`",
          "- Blocker: `actor_identity_failure`"
        ].join("\n")
      }
    ]
  });

  assert.equal(selected.length, 0);
});

test("VPS runner can reprocess Codex fallback requested comments for a new head SHA", () => {
  const selected = selectPendingVpsReviewerFallbacks({
    repositoryPolicies: normalizeRepositoryPolicies({
      allowedRepositories: ["sample-org/vtdd-v2"]
    }),
    comments: [
      {
        id: 1,
        created_at: "2026-05-14T11:50:00Z",
        repository: "sample-org/vtdd-v2",
        pullRequestNumber: 22,
        headSha: "new456",
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "- Status: `requested`",
          "- Trigger: `pull_request_target:synchronize`",
          "- Reason: `gemini_temporarily_unavailable`",
          "- Delivery mode: `vps_codex_cli`",
          "- Head SHA: `new456`"
        ].join("\n")
      },
      {
        id: 2,
        created_at: "2026-05-14T11:40:00Z",
        user: { login: "vtdd-codex[bot]" },
        repository: "sample-org/vtdd-v2",
        pullRequestNumber: 22,
        headSha: "new456",
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "- Status: `completed`",
          "- Trigger: `issue_comment:created`",
          "- Reason: `gemini_temporarily_unavailable`",
          "- Delivery mode: `vps_codex_cli`",
          "- Head SHA: `old123`",
          "- Recommended action: `approve`"
        ].join("\n")
      }
    ]
  });

  assert.equal(selected.length, 1);
  assert.equal(selected[0].pullRequestNumber, 22);
});

test("VPS runner does not reprocess Codex fallback requests after actor identity incident", () => {
  const selected = selectPendingVpsReviewerFallbacks({
    repositoryPolicies: normalizeRepositoryPolicies({
      allowedRepositories: ["sample-org/vtdd-v2"]
    }),
    comments: [
      {
        id: 1,
        created_at: "2026-05-14T11:50:00Z",
        repository: "sample-org/vtdd-v2",
        pullRequestNumber: 22,
        headSha: "abc123",
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "- Status: `requested`",
          "- Trigger: `pull_request_target:synchronize`",
          "- Reason: `gemini_temporarily_unavailable`",
          "- Delivery mode: `vps_codex_cli`",
          "- Head SHA: `abc123`"
        ].join("\n")
      },
      {
        id: 2,
        created_at: "2026-05-14T11:51:00Z",
        repository: "sample-org/vtdd-v2",
        pullRequestNumber: 22,
        headSha: "abc123",
        body: [
          "@marushu 【要対応】VPS Codex CLI: PRレビュー結果を正しいBot名で投稿できません",
          "",
          "<!-- vtdd:incident=actor_identity_failure -->",
          "",
          "- Head SHA: `abc123`"
        ].join("\n")
      }
    ]
  });

  assert.equal(selected.length, 0);
});

test("VPS runner actor identity incident starts with Japanese owner notification", () => {
  const incident = buildVpsReviewerFallbackActorIdentityIncident({
    reviewerFallback: {
      repository: "marushu/vtdd-v2-p",
      pullRequestNumber: 368,
      headSha: "abc123"
    },
    reason: "VTDD Codex Fallback Reviewer GitHub App token unavailable: missing private key",
    notifierAvailable: true
  });

  assert.equal(
    incident.body.split("\n")[0],
    "@marushu 【要対応】VPS Codex CLI: PRレビュー結果を正しいBot名で投稿できません"
  );
  assert.equal(incident.body.includes("<!-- vtdd:incident=actor_identity_failure -->"), true);
  assert.equal(incident.body.includes("- Expected actor: `VTDD Codex Fallback Reviewer`"), true);
  assert.equal(incident.body.includes("- Detected by: `VTDD VPS Codex CLI`"), true);
  assert.equal(incident.body.includes("`marushu` として代替投稿することは禁止"), true);
});

test("VPS runner role App token resolution fails closed when role credentials are missing", async () => {
  const result = await resolveRoleGitHubAppInstallationToken({
    role: "codex_fallback_reviewer",
    env: {},
    apiBaseUrl: "https://api.github.com"
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason.includes("VTDD Codex Fallback Reviewer"), true);
  assert.equal(result.reason.includes("missing app id, private key, installation id"), true);
});

test("VPS runner role App token resolution can read role credentials from vault manifest", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-vps-role-vault-"));
  const credentialsDir = path.join(tempDir, "credentials");
  await fs.mkdir(path.join(credentialsDir, "github-apps"), { recursive: true });
  const keyPath = path.join(credentialsDir, "github-apps", "codex-fallback.pem");
  const manifestPath = path.join(credentialsDir, "manifest.json");
  await fs.writeFile(keyPath, "-----BEGIN PRIVATE KEY-----\nrole-example\n-----END PRIVATE KEY-----\n");
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: 1,
        githubAppRoles: {
          "codex-fallback-reviewer": {
            appId: "3706921",
            installationId: "132169447",
            privateKeyPath: "github-apps/codex-fallback.pem"
          }
        }
      },
      null,
      2
    )
  );

  const calls = [];
  const result = await resolveRoleGitHubAppInstallationToken({
    role: "codex_fallback_reviewer",
    apiBaseUrl: "https://api.github.invalid",
    env: {
      VTDD_VPS_RUNNER_CREDENTIALS_MANIFEST: manifestPath,
      GITHUB_APP_JWT_PROVIDER: async () => "app_jwt_for_test",
      GITHUB_API_FETCH: async (url, init = {}) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({
            token: "ghs_role_installation_token",
            expires_at: "2030-01-01T00:00:00Z"
          }),
          {
            status: 201,
            headers: { "content-type": "application/json" }
          }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.token, "ghs_role_installation_token");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.includes("/app/installations/132169447/access_tokens"), true);
});

test("VPS runner ignores untrusted approve markers when selecting Codex fallback requests", () => {
  const selected = selectPendingVpsReviewerFallbacks({
    repositoryPolicies: normalizeRepositoryPolicies({
      allowedRepositories: ["sample-org/vtdd-v2"]
    }),
    comments: [
      {
        id: 1,
        created_at: "2026-05-14T11:50:00Z",
        repository: "sample-org/vtdd-v2",
        pullRequestNumber: 22,
        headSha: "abc123",
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "- Status: `requested`",
          "- Trigger: `pull_request_target:synchronize`",
          "- Reason: `gemini_temporarily_unavailable`",
          "- Delivery mode: `vps_codex_cli`",
          "- Head SHA: `abc123`"
        ].join("\n")
      },
      {
        id: 2,
        created_at: "2026-05-14T11:51:00Z",
        user: { login: "external-contributor" },
        author_association: "NONE",
        repository: "sample-org/vtdd-v2",
        pullRequestNumber: 22,
        headSha: "abc123",
        body: [
          "<!-- vtdd:reviewer=codex-fallback -->",
          "- Status: `completed`",
          "- Trigger: `issue_comment:created`",
          "- Reason: `gemini_temporarily_unavailable`",
          "- Delivery mode: `vps_codex_cli`",
          "- Head SHA: `abc123`",
          "- Recommended action: `approve`"
        ].join("\n")
      }
    ]
  });

  assert.equal(selected.length, 1);
  assert.equal(selected[0].pullRequestNumber, 22);
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
    },
    preflight: {
      mode: "auto_receipt",
      onMissingContract: "owner_decision_required",
      issue: {
        number: 157,
        title: "Smoke test",
        bodyExcerpt: "Create a small smoke evidence file."
      },
      handoffNote: {
        currentSurface: "VPS Codex CLI",
        repository: "sample-org/vtdd-v2",
        issueNumber: 157,
        codexGoal: "open_pr",
        nextSafeAction: "resume from the canonical Issue, GitHub runtime truth, RAG checkpoints, and this preflight receipt",
        blockedReturnRoute: "If the issue/runtime truth is insufficient, stop and return a Japanese blocker comment for Butler/owner instead of guessing."
      },
      artifacts: [{ path: "AGENTS.md", sha1: "abc123" }],
      missing: []
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
  assert.equal(prompt.includes("Context preflight receipt:"), true);
  assert.equal(prompt.includes("AGENTS.md sha1=abc123"), true);
  assert.equal(prompt.includes("Handoff note:"), true);
  assert.equal(prompt.includes("Current surface: VPS Codex CLI"), true);
  assert.equal(prompt.includes("Next safe action: resume from the canonical Issue"), true);
  assert.equal(prompt.includes("Japanese blocker comment for Butler/owner"), true);
  assert.equal(prompt.includes("Before editing implementation files, write a Japanese owner-facing dry-run impact report"), true);
  assert.equal(prompt.includes("Record file/line hypotheses before editing"), true);
  assert.equal(prompt.includes("owner_decision_required"), true);
  assert.equal(prompt.includes("## This PR satisfies Intent"), true);
  assert.equal(prompt.includes("## Dry-run Impact Report"), true);
  assert.equal(prompt.includes("## File / Line Hypotheses"), true);
  assert.equal(prompt.includes("## Hypothesis Retrospective"), true);
  assert.equal(prompt.includes("## Surface Update Checklist"), true);
});

test("VPS runner Codex execution env keeps runtime bridge credentials scoped opt-in", () => {
  const source = {
    HOME: "/tmp/home",
    PATH: "/usr/bin",
    VTDD_RUNTIME_URL: "https://vtdd-v2-mvp.example.workers.dev",
    VTDD_GATEWAY_BEARER_TOKEN: "gateway-token-for-test",
    SECRET_NOT_ALLOWED: "do-not-copy"
  };
  const defaultEnv = buildCodexExecutionEnv(source);
  const bridgeEnv = buildCodexExecutionEnv(source, { includeRuntimeBridge: true });

  assert.equal(defaultEnv.VTDD_RUNTIME_URL, undefined);
  assert.equal(defaultEnv.VTDD_GATEWAY_BEARER_TOKEN, undefined);
  assert.equal(bridgeEnv.VTDD_RUNTIME_URL, "https://vtdd-v2-mvp.example.workers.dev");
  assert.equal(bridgeEnv.VTDD_GATEWAY_BEARER_TOKEN, "gateway-token-for-test");
  assert.equal(bridgeEnv.SECRET_NOT_ALLOWED, undefined);
});

test("VPS runner builds preflight receipt from canonical repo files", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-preflight-"));
  await fs.writeFile(path.join(tempRoot, "AGENTS.md"), "Do not silently downscope active Issues.\n");
  await fs.mkdir(path.join(tempRoot, "docs"), { recursive: true });
  await fs.mkdir(path.join(tempRoot, "scripts"), { recursive: true });
  await fs.writeFile(path.join(tempRoot, "docs/pr-template-model.md"), "PR template contract\n");
  await fs.writeFile(path.join(tempRoot, "scripts/render-pr-body.mjs"), "export function renderPrBody() {}\n");
  await fs.writeFile(path.join(tempRoot, "scripts/validate-pr-body.mjs"), "export function validatePrBody() {}\n");

  const payload = {
    repository: "sample-org/vtdd-v2",
    issueNumber: 307,
    branch: "codex/issue-307",
    baseRef: "main",
    codexGoal: "open_pr",
    preflightPolicy: {
      mode: "auto_receipt",
      onMissingContract: "owner_decision_required",
      requiredRepoFiles: [
        "AGENTS.md",
        "docs/pr-template-model.md",
        "scripts/render-pr-body.mjs",
        "scripts/validate-pr-body.mjs"
      ]
    }
  };

  const receipt = await buildVpsRunnerPreflightReceipt({
    workspace: tempRoot,
    payload,
    issue: {
      number: 307,
      title: "Issue-first guardrail",
      body: "実行前に canonical contract を読む"
    }
  });

  assert.equal(receipt.ok, true);
  assert.equal(receipt.artifacts.length, 4);
  assert.equal(receipt.issue.number, 307);
  assert.equal(receipt.handoffNote.currentSurface, "VPS Codex CLI");
  assert.deepEqual(receipt.handoffNote.nextReadableBy, ["Butler", "mac Codex", "VPS Codex CLI"]);
  assert.equal(receipt.handoffNote.repository, "sample-org/vtdd-v2");
  assert.equal(receipt.handoffNote.issueNumber, 307);
  assert.equal(receipt.handoffNote.branch, "codex/issue-307");
  assert.equal(receipt.handoffNote.baseRef, "main");
  assert.equal(receipt.handoffNote.codexGoal, "open_pr");
  assert.match(receipt.handoffNote.nextSafeAction, /RAG checkpoints/);
  assert.match(receipt.handoffNote.blockedReturnRoute, /Butler\/owner/);
  assert.equal(payload.preflightReceipt.ok, true);
  assert.equal(payload.preflightReceipt.handoffNote.issueNumber, 307);
});

test("VPS runner default preflight reads the thread-independent startup contract", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-preflight-default-"));
  await fs.writeFile(path.join(tempRoot, "AGENTS.md"), "Thread-Independent Startup Contract\n");
  await fs.mkdir(path.join(tempRoot, "docs", "butler"), { recursive: true });
  await fs.mkdir(path.join(tempRoot, "scripts"), { recursive: true });
  await fs.writeFile(
    path.join(tempRoot, "docs", "butler", "thread-independent-startup-contract.md"),
    "threadLocalAssumptionsPromoted=false\n"
  );
  await fs.writeFile(path.join(tempRoot, "docs", "pr-template-model.md"), "PR template contract\n");
  await fs.writeFile(path.join(tempRoot, "scripts", "prepare-pr-body-file.mjs"), "prepare\n");
  await fs.writeFile(path.join(tempRoot, "scripts", "render-pr-body.mjs"), "render\n");
  await fs.writeFile(path.join(tempRoot, "scripts", "validate-pr-body.mjs"), "validate\n");

  const payload = {
    repository: "sample-org/vtdd-v2",
    issueNumber: 344,
    codexGoal: "open_pr"
  };

  const receipt = await buildVpsRunnerPreflightReceipt({
    workspace: tempRoot,
    payload,
    issue: {
      number: 344,
      title: "共通起動前確認",
      body: "Butler / mac Codex / VPS Codex CLI で同じ startup preflight を返す"
    }
  });

  assert.equal(receipt.ok, true);
  assert.equal(
    receipt.artifacts.some(
      (artifact) => artifact.path === "docs/butler/thread-independent-startup-contract.md"
    ),
    true
  );
  assert.equal(
    payload.preflightReceipt.artifacts.some((artifact) =>
      artifact.excerpt.includes("threadLocalAssumptionsPromoted=false")
    ),
    true
  );
});

test("VPS runner preflight receipt requires owner decision when required files are missing", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-preflight-missing-"));
  await fs.writeFile(path.join(tempRoot, "AGENTS.md"), "Do not silently downscope active Issues.\n");
  const payload = {
    issueNumber: 307,
    preflightPolicy: {
      mode: "auto_receipt",
      onMissingContract: "owner_decision_required",
      requiredRepoFiles: ["AGENTS.md", "docs/pr-template-model.md"]
    }
  };

  const receipt = await buildVpsRunnerPreflightReceipt({
    workspace: tempRoot,
    payload,
    issue: {
      number: 307,
      title: "Issue-first guardrail",
      body: "実行前に canonical contract を読む"
    }
  });

  assert.equal(receipt.ok, false);
  assert.equal(receipt.onMissingContract, "owner_decision_required");
  assert.equal(receipt.missing[0].path, "docs/pr-template-model.md");
});

test("VPS runner Codex prompt includes review context for PR revision goals", () => {
  const prompt = buildCodexExecutionPrompt({
    payload: {
      repository: "sample-org/vtdd-v2",
      issueNumber: 204,
      branch: "codex/add-pr-ready-authority",
      codexGoal: "revise_pr",
      revisionTarget: {
        number: 204,
        state: "open",
        headRef: "codex/add-pr-ready-authority",
        headSha: "sha-204"
      }
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
  assert.equal(prompt.includes("Target PR lock:"), true);
  assert.equal(prompt.includes("- PR: #204"), true);
  assert.equal(prompt.includes("- Head SHA: sha-204"), true);
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

test("VPS runner blocks revision goals when open branch PR does not match locked target PR", async () => {
  await assert.rejects(
    buildVpsRunnerPullRequestContext({
      payload: {
        repository: "sample-org/vtdd-v2",
        branch: "codex/issue-251-v2",
        revisionTarget: {
          number: 285,
          state: "open",
          headRef: "codex/issue-251-v2",
          headSha: "fresh-sha"
        }
      },
      githubFetch: async (url) => {
        if (String(url).includes("/pulls?")) {
          return [
            {
              number: 279,
              state: "open",
              head: {
                ref: "codex/issue-251-v2",
                sha: "fresh-sha"
              }
            }
          ];
        }
        return [];
      }
    }),
    /No open pull request #285 found for revision branch codex\/issue-251-v2/
  );
});

test("VPS runner blocks revision goals when target PR head SHA is stale", async () => {
  await assert.rejects(
    buildVpsRunnerPullRequestContext({
      payload: {
        repository: "sample-org/vtdd-v2",
        branch: "codex/issue-251-v2",
        revisionTarget: {
          number: 285,
          state: "open",
          headRef: "codex/issue-251-v2",
          headSha: "fresh-sha"
        }
      },
      githubFetch: async (url) => {
        if (String(url).includes("/pulls?")) {
          return [
            {
              number: 285,
              state: "open",
              head: {
                ref: "codex/issue-251-v2",
                sha: "newer-sha"
              }
            }
          ];
        }
        return [];
      }
    }),
    /Revision target headSha mismatch/
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
  assert.equal(body.includes("## Butler Completion Contract"), true);
  assert.equal(body.includes("## Surface Update Checklist"), true);
  assert.equal(body.includes("Execution ID: remote-codex-issue194-test"), true);
  assert.equal(body.includes("VPS runner は merge も deploy も実行しない。"), true);
  assert.equal(body.includes("Issue固有の live E2E は別途記録する必要がある。"), true);
  assert.equal(body.includes("VPS runner では未実行。Butler は vtddExecutionProgress"), true);
  assert.equal(body.includes("Completion status: incomplete"), true);
});

test("VPS runner preserves a guarded-policy-compliant PR body candidate", () => {
  const candidate = buildPullRequestBody({
    repository: "sample-org/vtdd-v2",
    issueNumber: 703,
    executionId: "remote-codex-issue703-test",
    branch: "codex/issue-703",
    codexGoal: "open_pr",
    developmentStrategy: developmentStrategyFixture()
  });
  const normalized = buildGuardedPullRequestBody({
    payload: {
      repository: "sample-org/vtdd-v2",
      issueNumber: 703,
      executionId: "remote-codex-issue703-test",
      branch: "codex/issue-703",
      codexGoal: "open_pr",
      developmentStrategy: developmentStrategyFixture()
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
      issueNumber: 703,
      executionId: "remote-codex-issue703-test",
      branch: "codex/issue-703",
      codexGoal: "open_pr",
      developmentStrategy: developmentStrategyFixture()
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
  assert.equal(normalized.body.includes("## Butler Completion Contract"), true);
  assert.equal(normalized.body.includes("## Surface Update Checklist"), true);
  assert.equal(normalized.body.includes("Issue #703"), true);
  assert.equal(normalized.body.includes("Completion status: incomplete"), true);
});

test("VPS runner refuses to normalize PR bodies without concrete development strategy", () => {
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

  assert.equal(normalized.ok, false);
  assert.match(normalized.canonicalErrors.join("\n"), /開発前作戦図 field is not filled/);
});

test("VPS runner create path uses prepared body-file helper instead of freehand --body", async () => {
  const source = await fs.readFile(path.join(process.cwd(), "scripts", "run-vps-runner.mjs"), "utf8");
  assert.equal(source.includes('import { prepareGuardedPullRequestBody, prepareGuardedPullRequestBodyFile } from "./prepare-pr-body-file.mjs";'), true);
  assert.equal(source.includes('const prCreateArgs = buildVpsRunnerPrCreateArgs'), true);
  assert.equal(source.includes('"--body-file",\n    bodyFile'), true);
  assert.equal(source.includes('"--body",\n          normalized.body'), false);
  assert.equal(source.includes('"--draft"'), false);
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
  "approvalScopeMatched": true,
  "issueTraceability": {
    "canonicalSpec": "github_issue",
    "issueNumber": ${issueNumber},
    "relatedIssue": ${issueNumber},
    "issueTraceable": true
  }
}
\`\`\``;
}

function privilegedMaintenanceQueueComment({
  executionId,
  dashboardThreadId = "",
  helperArgs = ["-n", "/usr/local/sbin/vtdd-vps-maintenance-helper", "--execute", "--input", "<helper-execution-input-json>"]
}) {
  const dashboardThreadJson = dashboardThreadId
    ? `\n  "dashboardThreadId": "${dashboardThreadId}",\n  "handoff": {\n    "dashboardThreadId": "${dashboardThreadId}"\n  },`
    : "";
  return `<!-- vtdd:vps-privileged-maintenance-execution:${executionId} -->
\`\`\`json
{
  "executionId": "${executionId}",
  "transport": "vps_privileged_maintenance_helper",
  "repository": "sample-org/vtdd-v2",
  "issueNumber": 637,${dashboardThreadJson}
  "approvalScopeMatched": true,
  "approvalActor": "requester",
  "issueTraceability": {
    "canonicalSpec": "github_issue",
    "issueNumber": 637,
    "relatedIssue": 637,
    "issueTraceable": true
  },
  "executionEnvelope": {
    "kind": "vps_privileged_maintenance_helper_execution_envelope",
    "status": "ready_for_vps_helper_execution",
    "repository": "sample-org/vtdd-v2",
    "requestId": "vps-maint-req-637",
    "capabilityId": "vtdd-vps-runner-status",
    "mode": "execute",
    "helperInvocation": {
      "executable": "sudo",
      "args": ${JSON.stringify(helperArgs)},
      "shell": false,
      "inputFile": "helperExecutionInput"
    },
    "helperExecutionInput": {
      "manifest": {
        "version": 1,
        "host": "vps",
        "repository": "sample-org/vtdd-v2",
        "capabilities": []
      },
      "helperRequest": {
        "requestId": "vps-maint-req-637",
        "relatedIssue": 637,
        "capabilityId": "vtdd-vps-runner-status",
        "approvalGrantId": "grant_637"
      },
      "mode": "execute",
      "now": "2026-05-30T00:00:00.000Z"
    },
    "rootExecutionStarted": false,
    "helperExecutionStarted": false
  }
}
\`\`\``;
}
