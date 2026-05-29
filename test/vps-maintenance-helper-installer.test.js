import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { buildSudoers } from "../scripts/install-vps-privileged-maintenance-helper.mjs";

const script = "scripts/install-vps-privileged-maintenance-helper.mjs";

test("VPS maintenance helper installer dry-run reports scoped install plan without writing root files", () => {
  const result = spawnSync(
    process.execPath,
    [
      script,
      "--dry-run",
      "--host",
      "x85-131-245-163",
      "--repository",
      "marushu/vtdd-v2-p",
      "--repo-dir",
      "/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p",
      "--node-bin",
      "/home/vtdd-runner/.nvm/versions/node/v24.15.0/bin/node"
    ],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.mode, "dry_run");
  assert.equal(body.rootExecutionStarted, false);
  assert.equal(body.helperExecutionStarted, false);
  assert.equal(body.sudoersShape.allowedCommand, "/usr/local/sbin/vtdd-vps-maintenance-helper");
  assert.equal(body.sudoersShape.forbidden.includes("NOPASSWD:ALL"), true);
  assert.equal(body.manifestSummary.highRiskCapabilities.includes("playwright.install.deps.chromium"), true);
});

test("VPS maintenance helper installer staging writes helper manifest and scoped sudoers", async () => {
  const stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-helper-install-"));
  const result = spawnSync(
    process.execPath,
    [
      script,
      "--staging-dir",
      stagingDir,
      "--host",
      "x85-131-245-163",
      "--repository",
      "marushu/vtdd-v2-p",
      "--repo-dir",
      "/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p",
      "--node-bin",
      "/home/vtdd-runner/.nvm/versions/node/v24.15.0/bin/node"
    ],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.mode, "staging");
  const helper = await fs.readFile(path.join(stagingDir, "usr/local/sbin/vtdd-vps-maintenance-helper"), "utf8");
  const manifest = JSON.parse(await fs.readFile(path.join(stagingDir, "etc/vtdd/privileged-maintenance-capabilities.json"), "utf8"));
  const sudoers = await fs.readFile(path.join(stagingDir, "etc/sudoers.d/vtdd-vps-maintenance-helper"), "utf8");

  assert.equal(helper.includes("vtdd-v2-mvp.polished-tree-da7c.workers.dev"), false);
  assert.equal(helper.includes("exec \"$NODE_BIN\" \"$HELPER_SCRIPT\" \"$@\""), true);
  assert.equal(manifest.repository, "marushu/vtdd-v2-p");
  assert.equal(manifest.capabilities.some((capability) => capability.commandClass === "playwright_install_deps_chromium"), true);
  const playwrightCapability = manifest.capabilities.find(
    (capability) => capability.commandClass === "playwright_install_deps_chromium"
  );
  const sysctlCapability = manifest.capabilities.find((capability) => capability.commandClass === "codex_sandbox_sysctl_apply");
  assert.deepEqual(playwrightCapability.affectedPaths, [
    "/etc/apt",
    "/etc/fonts",
    "/usr",
    "/var/lib/apt",
    "/var/lib/dpkg",
    "/var/cache/apt",
    "/var/log/apt"
  ]);
  assert.deepEqual(sysctlCapability.affectedPaths, ["/etc/sysctl.conf", "/etc/sysctl.d", "/proc/sys"]);
  assert.equal(
    manifest.capabilities.some((capability) => capability.riskLevel === "high" && capability.affectedPaths.length === 1 && capability.affectedPaths[0] === "/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p"),
    false
  );
  assert.equal(/\bNOPASSWD\s*:\s*ALL\b/i.test(sudoers), false);
  assert.equal(sudoers, "vtdd-runner ALL=(root) NOPASSWD: /usr/local/sbin/vtdd-vps-maintenance-helper\n");
});

test("VPS maintenance helper installer requires root for real install mode", () => {
  if (process.getuid?.() === 0) {
    return;
  }
  const result = spawnSync(
    process.execPath,
    [
      script,
      "--host",
      "x85-131-245-163",
      "--repository",
      "marushu/vtdd-v2-p",
      "--repo-dir",
      "/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p",
      "--node-bin",
      "/home/vtdd-runner/.nvm/versions/node/v24.15.0/bin/node"
    ],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 1);
  const body = JSON.parse(result.stdout);
  assert.equal(body.issues.includes("root is required unless --dry-run or --staging-dir is used"), true);
});

test("VPS maintenance helper installer never emits broad sudoers grants", () => {
  const sudoers = buildSudoers({
    runnerUser: "vtdd-runner",
    helperPath: "/usr/local/sbin/vtdd-vps-maintenance-helper"
  });
  assert.equal(/\bNOPASSWD\s*:\s*ALL\b/i.test(sudoers), false);
  assert.equal(sudoers.includes("sudo su"), false);
});
