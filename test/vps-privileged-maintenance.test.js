import test from "node:test";
import assert from "node:assert/strict";
import {
  applyVpsCapabilityLifecycleOperation,
  buildVpsHelperCommandExecutionBoundary,
  buildVpsPrivilegedMaintenanceInstallInventory,
  buildVpsCapabilityProposal,
  buildVpsMaintenanceApprovalScope,
  listVpsPrivilegedMaintenanceCommandRegistry,
  normalizeVpsCapabilityManifest,
  planVpsPrivilegedMaintenanceHelperExecution
} from "../src/core/index.js";

const baseManifest = {
  version: 1,
  host: "x85-131-245-163",
  repository: "marushu/vtdd-v2-p",
  updatedAt: "2026-05-29T00:00:00.000Z",
  capabilities: [
    {
      id: "playwright.chromium.deps",
      title: "Playwright Chromium dependency install",
      status: "disabled",
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

test("VPS privileged maintenance manifest normalizes reviewable capabilities", () => {
  const result = normalizeVpsCapabilityManifest(baseManifest);

  assert.equal(result.ok, true);
  assert.equal(result.manifest.capabilities[0].id, "playwright.chromium.deps");
  assert.equal(result.manifest.capabilities[0].status, "disabled");
  assert.equal(result.manifest.capabilities[0].riskLevel, "high");
});

test("VPS privileged maintenance install inventory reports root-owned helper readiness without execution", () => {
  const ready = buildVpsPrivilegedMaintenanceInstallInventory({
    host: "x85-131-245-163",
    repository: "marushu/vtdd-v2-p",
    helperInstalled: true,
    manifestInstalled: true,
    sudoersInstalled: true,
    helperOwner: "root",
    manifestOwner: "root",
    sudoersOwner: "root",
    sudoersAllowsAll: false
  });

  assert.equal(ready.ok, true);
  assert.equal(ready.status, "ready");
  assert.equal(ready.helperPath, "/usr/local/sbin/vtdd-vps-maintenance-helper");
  assert.equal(ready.manifestPath, "/etc/vtdd/privileged-maintenance-capabilities.json");
  assert.equal(ready.sudoersPath, "/etc/sudoers.d/vtdd-vps-maintenance-helper");
  assert.equal(ready.requiredSudoersShape.user, "vtdd-runner");
  assert.equal(ready.requiredSudoersShape.allowedCommand, ready.helperPath);
  assert.equal(ready.runtimeTruth.rootExecutionStarted, false);
  assert.equal(ready.runtimeTruth.helperExecutionStarted, false);
  assert.equal(ready.checks.every((check) => check.status === "pass"), true);

  const unsafe = buildVpsPrivilegedMaintenanceInstallInventory({
    host: "x85-131-245-163",
    repository: "marushu/vtdd-v2-p",
    sudoersAllowsAll: true
  });
  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.status, "blocked");
  assert.equal(unsafe.issues.includes("sudoers must not allow NOPASSWD:ALL"), true);
});

test("VPS privileged maintenance helper command registry exposes initial presets", () => {
  const registry = listVpsPrivilegedMaintenanceCommandRegistry();
  const commandClasses = registry.map((entry) => entry.commandClass);

  assert.equal(commandClasses.includes("playwright_install_deps_chromium"), true);
  assert.equal(commandClasses.includes("codex_sandbox_sysctl_apply"), true);
  assert.equal(commandClasses.includes("systemd_user_daemon_reload"), true);
  assert.equal(commandClasses.includes("systemd_user_runner_status"), true);
  assert.equal(commandClasses.includes("systemd_user_runner_enable"), true);
  assert.equal(commandClasses.includes("systemd_user_runner_restart"), true);
  assert.equal(commandClasses.includes("systemd_user_runner_logs"), true);
  assert.equal(commandClasses.includes("systemd_user_app_server_bridge_status"), true);
  assert.equal(commandClasses.includes("systemd_user_app_server_bridge_restart"), true);
  assert.equal(commandClasses.includes("systemd_user_app_server_bridge_logs"), true);
  assert.equal(commandClasses.includes("vps_runner_status_dry_run"), true);
  assert.equal(commandClasses.includes("vps_maintenance_install_inventory_collect"), true);
  assert.equal(
    registry.every((entry) => Array.isArray(entry.allowedArgs) && entry.allowedArgs.length > 0),
    true
  );
  assert.equal(
    registry.every((entry) => Array.isArray(entry.argv) && entry.argv.length > 0),
    true
  );
  assert.equal(registry.every((entry) => entry.initialPreset === true), true);
});

test("VPS privileged maintenance helper command registry does not expose mutable internal arrays", () => {
  const registry = listVpsPrivilegedMaintenanceCommandRegistry();
  const playwright = registry.find((entry) => entry.commandClass === "playwright_install_deps_chromium");
  playwright.allowedArgs.push("npx playwright install-deps firefox");
  playwright.argv.push("firefox");

  const freshRegistry = listVpsPrivilegedMaintenanceCommandRegistry();
  const freshPlaywright = freshRegistry.find((entry) => entry.commandClass === "playwright_install_deps_chromium");
  assert.deepEqual(freshPlaywright.allowedArgs, ["npx playwright install-deps chromium"]);
  assert.deepEqual(freshPlaywright.argv, ["npx", "playwright", "install-deps", "chromium"]);
});

test("VPS privileged maintenance proposal requires PWA notification and rollback plan", () => {
  const result = buildVpsCapabilityProposal({
    host: "x85-131-245-163",
    repository: "marushu/vtdd-v2-p",
    id: "codex.sandbox.sysctl",
    title: "Codex sandbox sysctl repair",
    commandClass: "codex_sandbox_sysctl_apply",
    riskLevel: "high",
    workingDirectories: ["/"],
    allowedArgs: ["sysctl --system"],
    affectedPaths: ["/etc/sysctl.d/99-vtdd-codex-userns.conf"],
    redactionRules: ["no secret material"],
    rollbackPlan: "restore previous sysctl file and apply sysctl --system",
    expectedRuntimeTruth: ["before sysctl", "after sysctl"],
    reason: "VPS Codex CLI cannot launch Chromium sandbox after reboot"
  });

  assert.equal(result.ok, true);
  assert.equal(result.proposal.approvalRequired, true);
  assert.equal(result.proposal.pwaNotificationRequired, true);
  assert.equal(result.proposal.capability.status, "disabled");
});

test("VPS privileged maintenance rejects broad sudo/root shell patterns", () => {
  const result = buildVpsCapabilityProposal({
    host: "x85-131-245-163",
    repository: "marushu/vtdd-v2-p",
    id: "unsafe.root.shell",
    title: "Unsafe root shell",
    commandClass: "root shell",
    riskLevel: "high",
    workingDirectories: ["/"],
    allowedArgs: ["vtdd-runner ALL=(ALL) NOPASSWD:ALL"],
    rollbackPlan: "disable",
    reason: "unsafe"
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.includes("forbidden broad privileged pattern")), true);
});

test("VPS privileged maintenance lifecycle can add enable disable remove and review capabilities", () => {
  const proposal = buildVpsCapabilityProposal({
    host: "x85-131-245-163",
    repository: "marushu/vtdd-v2-p",
    id: "systemd.runner.restart",
    title: "Restart VPS runner services",
    commandClass: "systemd_user_runner_restart",
    riskLevel: "medium",
    workingDirectories: ["/home/vtdd-runner"],
    allowedArgs: ["systemctl --user restart vtdd-vps-runner.timer"],
    affectedPaths: ["systemd user manager"],
    redactionRules: ["journal summary only"],
    rollbackPlan: "disable capability and leave services unchanged",
    expectedRuntimeTruth: ["before status", "after status", "exit code"],
    reason: "WebSocket/app-server bridge recovery must be iPhone-complete"
  });
  assert.equal(proposal.ok, true);

  const added = applyVpsCapabilityLifecycleOperation({
    operation: "add",
    manifest: { ...baseManifest, capabilities: [] },
    proposal: proposal.proposal,
    now: "2026-05-29T01:00:00.000Z"
  });
  assert.equal(added.ok, true);
  assert.equal(added.manifest.capabilities[0].status, "enabled");
  assert.equal(added.runtimeTruth.pwaNotificationRequired, true);

  const disabled = applyVpsCapabilityLifecycleOperation({
    operation: "disable",
    manifest: added.manifest,
    capabilityId: "systemd.runner.restart",
    now: "2026-05-29T01:05:00.000Z"
  });
  assert.equal(disabled.ok, true);
  assert.equal(disabled.manifest.capabilities[0].status, "disabled");

  const enabled = applyVpsCapabilityLifecycleOperation({
    operation: "enable",
    manifest: disabled.manifest,
    capabilityId: "systemd.runner.restart",
    now: "2026-05-29T01:10:00.000Z"
  });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.manifest.capabilities[0].status, "enabled");

  const review = applyVpsCapabilityLifecycleOperation({
    operation: "review",
    manifest: enabled.manifest
  });
  assert.equal(review.ok, true);
  assert.deepEqual(review.review.activeCapabilities, ["systemd.runner.restart"]);

  const removed = applyVpsCapabilityLifecycleOperation({
    operation: "remove",
    manifest: enabled.manifest,
    capabilityId: "systemd.runner.restart",
    now: "2026-05-29T01:15:00.000Z"
  });
  assert.equal(removed.ok, true);
  assert.equal(removed.manifest.capabilities.length, 0);
});

test("VPS privileged maintenance approval scope preserves existing passkey operator boundary", () => {
  const scope = buildVpsMaintenanceApprovalScope({
    repository: "marushu/vtdd-v2-p",
    host: "x85-131-245-163",
    operation: "add",
    capabilityId: "playwright.chromium.deps",
    impactScope: "apt packages for Chromium runtime",
    expiresAt: "2026-05-29T01:10:00.000Z",
    relatedIssue: 637
  });

  assert.equal(scope.actionType, "destructive");
  assert.equal(scope.highRiskKind, "vps_runner_admin");
  assert.equal(scope.repositoryInput, "marushu/vtdd-v2-p");
  assert.equal(scope.relatedIssue, "637");
  assert.equal(scope.issueNumber, "637");
  assert.equal(scope.vpsHost, "x85-131-245-163");
  assert.equal(scope.vpsOperation, "add");
  assert.equal(scope.vpsCapabilityId, "playwright.chromium.deps");
  assert.equal(scope.vpsImpactScope, "apt packages for Chromium runtime");
  assert.equal(scope.vpsExpiresAt, "2026-05-29T01:10:00.000Z");
  assert.equal(scope.display.capabilityId, "playwright.chromium.deps");
  assert.equal(scope.display.host, "x85-131-245-163");
});

test("VPS helper dry-run contract validates enabled manifest capability without executing root", () => {
  const manifest = {
    ...baseManifest,
    capabilities: [
      {
        ...baseManifest.capabilities[0],
        status: "enabled"
      }
    ]
  };
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

  const result = planVpsPrivilegedMaintenanceHelperExecution({
    manifest,
    helperRequest,
    mode: "dry_run",
    now: "2026-05-29T02:00:00.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.helperPlan.status, "dry_run_ready");
  assert.equal(result.helperPlan.rootExecutionStarted, false);
  assert.equal(result.helperPlan.helperExecutionStarted, false);
  assert.deepEqual(result.helperPlan.commandPreview.allowedArgs, ["npx playwright install-deps chromium"]);
  assert.equal(result.helperPlan.commandPreview.allowedArgsPurpose, "display_only_not_execution_input");
  assert.deepEqual(result.helperPlan.commandPreview.argv, ["npx", "playwright", "install-deps", "chromium"]);
  assert.deepEqual(result.helperPlan.commandPreview.executionBoundary, {
    executable: "npx",
    args: ["playwright", "install-deps", "chromium"],
    shell: false,
    pathResolution: "root_helper_controlled_path_allowlist",
    stdin: "none",
    commandClass: "playwright_install_deps_chromium",
    requiresRoot: true,
    riskLevel: "high"
  });
  assert.equal(result.runtimeTruth.status, "dry_run_ready");
  assert.equal(result.runtimeTruth.registryBinding.commandClass, "playwright_install_deps_chromium");
  assert.deepEqual(result.runtimeTruth.commandArgv, ["npx", "playwright", "install-deps", "chromium"]);
  assert.equal(result.runtimeTruth.allowedArgsPurpose, "display_only_not_execution_input");
  assert.equal(result.runtimeTruth.commandExecutionBoundary.shell, false);
  assert.deepEqual(result.runtimeTruth.commandExecutionBoundary.args, ["playwright", "install-deps", "chromium"]);
  assert.equal(result.runtimeTruth.exitCode, null);
  assert.equal(result.runtimeTruth.redactedLogSummary, "dry-run only; privileged command was not executed");
});

test("VPS helper command execution boundary rejects shell syntax before any execution path exists", () => {
  const boundary = buildVpsHelperCommandExecutionBoundary({
    commandClass: "unsafe",
    argv: ["sh", "-c", "npx playwright install-deps chromium"],
    requiredRiskLevel: "high",
    requiresRoot: true
  });

  assert.equal(boundary.ok, false);
  assert.equal(boundary.error, "vps_helper_command_execution_boundary_invalid");
  assert.equal(boundary.issues.includes("registered helper command argv must not include a shell interpreter"), true);
});

test("VPS helper command execution boundary requires helper-controlled path resolution", () => {
  const boundary = buildVpsHelperCommandExecutionBoundary({
    commandClass: "absolute",
    argv: ["/usr/bin/npx", "playwright", "install-deps", "chromium"],
    requiredRiskLevel: "high",
    requiresRoot: true
  });

  assert.equal(boundary.ok, false);
  assert.equal(
    boundary.issues.includes(
      "registered helper command executable must be a command name resolved by the root helper path allowlist"
    ),
    true
  );
});

test("VPS helper command execution boundary rejects env shell trampoline argv", () => {
  const boundary = buildVpsHelperCommandExecutionBoundary({
    commandClass: "unsafe-env",
    argv: ["env", "bash", "-c", "npx playwright install-deps chromium"],
    requiredRiskLevel: "high",
    requiresRoot: true
  });

  assert.equal(boundary.ok, false);
  assert.equal(boundary.error, "vps_helper_command_execution_boundary_invalid");
  assert.equal(boundary.issues.includes("registered helper command argv must not include a shell interpreter"), true);
});

test("VPS helper dry-run rejects disabled, mismatched, or unregistered capabilities", () => {
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
    capability: baseManifest.capabilities[0]
  };

  const disabled = planVpsPrivilegedMaintenanceHelperExecution({
    manifest: baseManifest,
    helperRequest
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error, "vps_helper_capability_disabled");

  const mismatched = planVpsPrivilegedMaintenanceHelperExecution({
    manifest: {
      ...baseManifest,
      capabilities: [
        {
          ...baseManifest.capabilities[0],
          status: "enabled",
          allowedArgs: ["npx playwright install-deps firefox"]
        }
      ]
    },
    helperRequest
  });
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.error, "vps_helper_request_manifest_mismatch");
  assert.equal(mismatched.issues.includes("helperRequest capability.allowedArgs must match manifest capability"), true);

  const unregisteredCapability = {
    ...baseManifest.capabilities[0],
    id: "custom.unregistered.command",
    title: "Unregistered command",
    status: "enabled",
    commandClass: "custom_unregistered_command",
    allowedArgs: ["apt-get install -y example-package"]
  };
  const unregistered = planVpsPrivilegedMaintenanceHelperExecution({
    manifest: {
      ...baseManifest,
      capabilities: [unregisteredCapability]
    },
    helperRequest: {
      ...helperRequest,
      capability: unregisteredCapability
    }
  });
  assert.equal(unregistered.ok, false);
  assert.equal(unregistered.error, "vps_helper_command_class_not_registered");

  const registeredArgsMismatchCapability = {
    ...baseManifest.capabilities[0],
    status: "enabled",
    riskLevel: "high",
    allowedArgs: ["npx playwright install-deps firefox"]
  };
  const registeredArgsMismatch = planVpsPrivilegedMaintenanceHelperExecution({
    manifest: {
      ...baseManifest,
      capabilities: [registeredArgsMismatchCapability]
    },
    helperRequest: {
      ...helperRequest,
      capability: registeredArgsMismatchCapability
    }
  });
  assert.equal(registeredArgsMismatch.ok, false);
  assert.equal(registeredArgsMismatch.error, "vps_helper_command_registry_mismatch");
  assert.equal(registeredArgsMismatch.issues.includes("capability allowedArgs must match registered helper command"), true);

  const registeredRiskMismatchCapability = {
    ...baseManifest.capabilities[0],
    status: "enabled",
    riskLevel: "medium"
  };
  const registeredRiskMismatch = planVpsPrivilegedMaintenanceHelperExecution({
    manifest: {
      ...baseManifest,
      capabilities: [registeredRiskMismatchCapability]
    },
    helperRequest: {
      ...helperRequest,
      capability: registeredRiskMismatchCapability
    }
  });
  assert.equal(registeredRiskMismatch.ok, false);
  assert.equal(registeredRiskMismatch.error, "vps_helper_command_registry_mismatch");
  assert.equal(registeredRiskMismatch.issues.includes("capability riskLevel must match registered helper command"), true);
});
