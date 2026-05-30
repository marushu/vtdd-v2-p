import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const manifest = {
  version: 1,
  host: "x85-131-245-163",
  repository: "marushu/vtdd-v2-p",
  updatedAt: "2026-05-29T00:00:00.000Z",
  capabilities: [
    {
      id: "playwright.chromium.deps",
      title: "Playwright Chromium dependency install",
      status: "enabled",
      commandClass: "playwright_install_deps_chromium",
      riskLevel: "high",
      workingDirectories: ["/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"],
      allowedArgs: ["npx playwright install-deps chromium"],
      affectedPaths: ["/usr/lib", "/usr/share/fonts"],
      redactionRules: ["no secrets", "summarize package list"],
      rollbackPlan: "disable capability and keep audit history",
      expectedRuntimeTruth: ["before package check", "exit code", "after Chromium launch check"],
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z"
    }
  ]
};

test("VPS privileged maintenance helper script dry-runs a bounded helper request", () => {
  const helperRequest = {
    kind: "vps_privileged_maintenance_helper_request",
    status: "ready_for_vps_helper",
    requestId: "vps-maintenance-helper-request:test",
    vpsProposalId: "vps-maintenance-proposal:test",
    approvalGrantId: "approval:test",
    host: "x85-131-245-163",
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 637,
    operation: "add",
    capability: manifest.capabilities[0]
  };

  const result = spawnSync(
    process.execPath,
    ["scripts/run-vps-privileged-maintenance-helper.mjs", "--dry-run"],
    {
      input: JSON.stringify({
        manifest,
        helperRequest,
        now: "2026-05-29T02:00:00.000Z"
      }),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.runtimeTruth.status, "dry_run_ready");
  assert.equal(body.runtimeTruth.rootExecutionStarted, false);
});

test("VPS privileged maintenance helper script exits nonzero for disabled capability", () => {
  const helperRequest = {
    kind: "vps_privileged_maintenance_helper_request",
    status: "ready_for_vps_helper",
    requestId: "vps-maintenance-helper-request:test",
    vpsProposalId: "vps-maintenance-proposal:test",
    approvalGrantId: "approval:test",
    host: "x85-131-245-163",
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 637,
    operation: "add",
    capability: manifest.capabilities[0]
  };

  const result = spawnSync(
    process.execPath,
    ["scripts/run-vps-privileged-maintenance-helper.mjs", "--dry-run"],
    {
      input: JSON.stringify({
        manifest: {
          ...manifest,
          capabilities: [{ ...manifest.capabilities[0], status: "disabled" }]
        },
        helperRequest
      }),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 1);
  const body = JSON.parse(result.stdout);
  assert.equal(body.error, "vps_helper_capability_disabled");
});

test("VPS privileged maintenance helper script blocks execute mode when not root", () => {
  const helperRequest = {
    kind: "vps_privileged_maintenance_helper_request",
    status: "ready_for_vps_helper",
    requestId: "vps-maintenance-helper-request:test",
    vpsProposalId: "vps-maintenance-proposal:test",
    approvalGrantId: "approval:test",
    host: "x85-131-245-163",
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 637,
    operation: "add",
    capability: manifest.capabilities[0]
  };

  const result = spawnSync(
    process.execPath,
    ["scripts/run-vps-privileged-maintenance-helper.mjs", "--execute"],
    {
      input: JSON.stringify({
        manifest,
        helperRequest,
        now: "2026-05-29T02:00:00.000Z"
      }),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 1);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error, "root_required");
  assert.equal(body.runtimeTruth.rootExecutionStarted, false);
  assert.equal(body.runtimeTruth.helperExecutionStarted, true);
  assert.equal(body.runtimeTruth.status, "blocked");
});
