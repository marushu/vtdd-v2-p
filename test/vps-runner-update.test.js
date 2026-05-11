import test from "node:test";
import assert from "node:assert/strict";
import {
  VpsRunnerUpdateActionType,
  buildVpsRunnerUpdateApprovalScope,
  buildVpsRunnerUpdateQueueComment,
  parseVpsRunnerUpdateQueueComment,
  requestVpsRunnerUpdate,
  retrieveVpsRunnerUpdateStatus,
  validateVpsRunnerUpdateRequest
} from "../src/core/index.js";
import {
  parseVpsRunnerUpdateEventComment,
  resolveVpsRunnerRestartCommand,
  selectPendingVpsRunnerUpdates
} from "../scripts/run-vps-runner.mjs";

test("VPS runner update request is scoped by repository ref phase and actionType", () => {
  const validation = validateVpsRunnerUpdateRequest({
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 294,
    ref: "main",
    phase: "execution",
    actionType: VpsRunnerUpdateActionType.UPDATE_RESTART,
    approvalPhrase: "GO",
    approvalGrantId: "approval-vps-update"
  });

  assert.equal(validation.ok, true);
  assert.deepEqual(buildVpsRunnerUpdateApprovalScope(validation.request), {
    actionType: "vps_runner_update_restart",
    highRiskKind: "vps_runner_admin",
    repositoryInput: "sample-org/vtdd-v2-p",
    issueNumber: "294",
    relatedIssue: "294",
    phase: "execution",
    ref: "main"
  });
});

test("VPS runner update rejects non-main ref and unsupported action", () => {
  const validation = validateVpsRunnerUpdateRequest({
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 294,
    ref: "codex/issue-287",
    phase: "execution",
    actionType: "shell",
    approvalPhrase: "GO",
    approvalGrantId: "approval-vps-update"
  });

  assert.equal(validation.ok, false);
  assert.equal(validation.issues.includes("ref must be main for VPS runner self-update"), true);
  assert.equal(
    validation.issues.includes("actionType must be vps_runner_update_restart or vps_runner_update_reload"),
    true
  );
});

test("VPS runner update queue comment round-trips bounded payload", () => {
  const body = buildVpsRunnerUpdateQueueComment({
    request: {
      updateId: "vps-update-294",
      repository: "sample-org/vtdd-v2-p",
      issueNumber: 294,
      ref: "main",
      phase: "execution",
      actionType: VpsRunnerUpdateActionType.UPDATE_RELOAD,
      requestedAt: "2026-05-11T00:00:00.000Z"
    }
  });
  const parsed = parseVpsRunnerUpdateQueueComment(body);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.payload.updateId, "vps-update-294");
  assert.equal(parsed.payload.ref, "main");
  assert.equal(parsed.payload.actionType, "vps_runner_update_reload");
  assert.equal(body.includes("arbitrary shell"), true);
});

test("requestVpsRunnerUpdate posts GitHub-visible queue comment after matching passkey grant", async () => {
  const calls = [];
  const result = await requestVpsRunnerUpdate({
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 294,
    ref: "main",
    phase: "execution",
    actionType: VpsRunnerUpdateActionType.UPDATE_RESTART,
    approvalPhrase: "GO",
    approvalGrantId: "approval-vps-update",
    approvalGrant: {
      approvalId: "approval-vps-update",
      verified: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "vps_runner_update_restart",
        highRiskKind: "vps_runner_admin",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "294",
        relatedIssue: "294",
        phase: "execution",
        ref: "main"
      }
    },
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_update",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            id: 123,
            html_url: "https://github.com/sample-org/vtdd-v2-p/issues/294#issuecomment-123"
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.update.status, "queued");
  assert.equal(calls[0].url.includes("/issues/294/comments"), true);
  const body = JSON.parse(calls[0].init.body).body;
  assert.equal(body.includes("vtdd:vps-runner-update:"), true);
  assert.equal(body.includes('"ref": "main"'), true);
});

test("retrieveVpsRunnerUpdateStatus reports commit sha lastSeenAt and runnerVersion from events", async () => {
  const result = await retrieveVpsRunnerUpdateStatus({
    updateId: "vps-update-294",
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 294,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_update",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify([
            {
              id: 10,
              html_url: "https://github.com/sample-org/vtdd-v2-p/issues/294#issuecomment-10",
              created_at: "2026-05-11T00:00:00Z",
              body: buildVpsRunnerUpdateQueueComment({
                request: {
                  updateId: "vps-update-294",
                  repository: "sample-org/vtdd-v2-p",
                  issueNumber: 294,
                  ref: "main",
                  phase: "execution",
                  actionType: "vps_runner_update_restart"
                }
              })
            },
            {
              id: 11,
              html_url: "https://github.com/sample-org/vtdd-v2-p/issues/294#issuecomment-11",
              created_at: "2026-05-11T00:01:00Z",
              body: `<!-- vtdd:vps-runner-update-event:vps-update-294 -->
\`\`\`json
{
  "status": "completed",
  "updateId": "vps-update-294",
  "repository": "sample-org/vtdd-v2-p",
  "issueNumber": 294,
  "ref": "main",
  "phase": "execution",
  "actionType": "vps_runner_update_restart",
  "runnerVersion": "1.2.3",
  "commitSha": "abc123",
  "lastSeenAt": "2026-05-11T00:01:00.000Z",
  "updatedAt": "2026-05-11T00:01:00.000Z"
}
\`\`\``
            }
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.update.status, "completed");
  assert.equal(result.update.commitSha, "abc123");
  assert.equal(result.update.runnerVersion, "1.2.3");
  assert.equal(result.update.lastSeenAt, "2026-05-11T00:01:00.000Z");
});

test("VPS runner selects pending update queue and ignores completed update", () => {
  const comments = [
    {
      id: 1,
      created_at: "2026-05-11T00:00:00Z",
      body: buildVpsRunnerUpdateQueueComment({
        request: {
          updateId: "vps-update-1",
          repository: "sample-org/vtdd-v2-p",
          issueNumber: 294,
          ref: "main",
          phase: "execution",
          actionType: "vps_runner_update_restart"
        }
      })
    },
    {
      id: 2,
      created_at: "2026-05-11T00:01:00Z",
      body: buildVpsRunnerUpdateQueueComment({
        request: {
          updateId: "vps-update-2",
          repository: "sample-org/vtdd-v2-p",
          issueNumber: 294,
          ref: "main",
          phase: "execution",
          actionType: "vps_runner_update_restart"
        }
      })
    },
    {
      id: 3,
      created_at: "2026-05-11T00:02:00Z",
      body: `<!-- vtdd:vps-runner-update-event:vps-update-2 -->\n\`\`\`json\n{"status":"completed"}\n\`\`\``
    }
  ];

  const pending = selectPendingVpsRunnerUpdates({
    comments,
    allowedRepositories: ["sample-org/vtdd-v2-p"]
  });

  assert.equal(pending.length, 1);
  assert.equal(pending[0].payload.updateId, "vps-update-1");
});

test("VPS runner restart command is allowlisted by strategy token", () => {
  const command = resolveVpsRunnerRestartCommand({
    actionType: "vps_runner_update_restart",
    env: {
      VTDD_VPS_RUNNER_RESTART_STRATEGY: "systemctl_user",
      VTDD_VPS_RUNNER_SERVICE: "vtdd-runner.service"
    }
  });

  assert.equal(command.ok, true);
  assert.deepEqual(command.args, ["--user", "restart", "vtdd-runner.service"]);

  const unsupported = resolveVpsRunnerRestartCommand({
    actionType: "vps_runner_update_restart",
    env: {
      VTDD_VPS_RUNNER_RESTART_STRATEGY: "bash -c rm -rf"
    }
  });
  assert.equal(unsupported.ok, false);
});

test("VPS runner update event parser exposes status", () => {
  const parsed = parseVpsRunnerUpdateEventComment(`<!-- vtdd:vps-runner-update-event:vps-update-294 -->
\`\`\`json
{"status":"running","currentStep":"git_fetch"}
\`\`\``);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.updateId, "vps-update-294");
  assert.equal(parsed.event.status, "running");
});
