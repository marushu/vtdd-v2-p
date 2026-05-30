import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { executeHelperPlan } from "../scripts/run-vps-privileged-maintenance-helper.mjs";

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

const nonRootManifest = {
  version: 1,
  host: "x85-131-245-163",
  repository: "marushu/vtdd-v2-p",
  updatedAt: "2026-05-30T00:00:00.000Z",
  capabilities: [
    {
      id: "vps.runner.status.dry.run",
      title: "Check VPS runner queue status without executing work",
      status: "enabled",
      commandClass: "vps_runner_status_dry_run",
      riskLevel: "low",
      workingDirectories: ["/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"],
      allowedArgs: ["node scripts/run-vps-runner.mjs --dry-run"],
      affectedPaths: [],
      redactionRules: ["no secrets"],
      rollbackPlan: "no state change",
      expectedRuntimeTruth: ["dry-run queue selection status"],
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z"
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

test("VPS privileged maintenance helper script blocks non-root run-as execution when helper is not root", () => {
  const helperRequest = {
    kind: "vps_privileged_maintenance_helper_request",
    status: "ready_for_vps_helper",
    requestId: "vps-maintenance-helper-request:non-root",
    vpsProposalId: "vps-maintenance-proposal:non-root",
    approvalGrantId: "approval:non-root",
    host: "x85-131-245-163",
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 637,
    operation: "review",
    capability: nonRootManifest.capabilities[0]
  };

  const result = spawnSync(
    process.execPath,
    ["scripts/run-vps-privileged-maintenance-helper.mjs", "--execute"],
    {
      input: JSON.stringify({
        manifest: nonRootManifest,
        helperRequest,
        now: "2026-05-30T00:00:00.000Z"
      }),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 1);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error, "root_required_for_run_as");
  assert.equal(body.runtimeTruth.rootExecutionStarted, false);
  assert.equal(body.runtimeTruth.helperExecutionStarted, true);
  assert.equal(body.runtimeTruth.commandExecutionBoundary.requiresRoot, false);
});

test("VPS privileged maintenance helper executes non-root capabilities through fixed vtdd-runner run-as argv", () => {
  const helperPlan = {
    host: "x85-131-245-163",
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 637,
    operation: "review",
    capability: nonRootManifest.capabilities[0],
    commandPreview: {
      executionBoundary: {
        commandClass: "vps_runner_status_dry_run",
        riskLevel: "low",
        requiresRoot: false,
        executable: "node",
        args: ["scripts/run-vps-runner.mjs", "--dry-run"],
        shell: false
      }
    }
  };
  const spawnCalls = [];

  const result = executeHelperPlan({
    helperPlan,
    timeoutMs: 1000,
    getuid: () => 0,
    resolveRunAsUid: () => "1001",
    nowFn: () => new Date("2026-05-30T00:00:00.000Z"),
    spawnSyncFn: (executable, args, options) => {
      spawnCalls.push({ executable, args, options });
      return {
        status: 0,
        stdout: "dry-run queue empty",
        stderr: ""
      };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].executable, "/usr/sbin/runuser");
  assert.deepEqual(spawnCalls[0].args, [
    "-u",
    "vtdd-runner",
    "--",
    "/usr/bin/env",
    "HOME=/home/vtdd-runner",
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "XDG_RUNTIME_DIR=/run/user/1001",
    "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus",
    "CI=1",
    process.execPath,
    "scripts/run-vps-runner.mjs",
    "--dry-run"
  ]);
  assert.equal(spawnCalls[0].options.shell, false);
  assert.equal(result.runtimeTruth.status, "completed");
  assert.equal(result.runtimeTruth.runAsUser, "vtdd-runner");
  assert.equal(result.runtimeTruth.rootExecutionStarted, false);
  assert.equal(result.runtimeTruth.helperStartedAsRoot, true);
  assert.equal(result.runtimeTruth.runAsUserUid, "1001");
  assert.equal(result.runtimeTruth.resolvedExecutable, process.execPath);
  assert.equal(result.runtimeTruth.exitCode, 0);
});

test("VPS privileged maintenance helper blocks non-root run-as execution when runner uid is unresolved", () => {
  const helperPlan = {
    host: "x85-131-245-163",
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 637,
    operation: "review",
    capability: nonRootManifest.capabilities[0],
    commandPreview: {
      executionBoundary: {
        commandClass: "vps_runner_status_dry_run",
        riskLevel: "low",
        requiresRoot: false,
        executable: "node",
        args: ["scripts/run-vps-runner.mjs", "--dry-run"],
        shell: false
      }
    }
  };

  const result = executeHelperPlan({
    helperPlan,
    timeoutMs: 1000,
    getuid: () => 0,
    resolveRunAsUid: () => "",
    spawnSyncFn: () => {
      throw new Error("spawn must not start without a run-as uid");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "run_as_uid_unresolved");
  assert.equal(result.runtimeTruth.helperStartedAsRoot, true);
  assert.equal(result.runtimeTruth.rootExecutionStarted, false);
});
