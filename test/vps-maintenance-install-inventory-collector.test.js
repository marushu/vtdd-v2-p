import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { containsBroadSudoersGrant } from "../scripts/collect-vps-maintenance-install-inventory.mjs";

test("VPS maintenance install inventory collector reports missing paths without root execution", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-vps-install-inventory-"));
  const result = spawnSync(
    process.execPath,
    [
      "scripts/collect-vps-maintenance-install-inventory.mjs",
      "--host",
      "x85-131-245-163",
      "--repository",
      "marushu/vtdd-v2-p",
      "--helper-path",
      path.join(tempRoot, "missing-helper"),
      "--manifest-path",
      path.join(tempRoot, "missing-manifest.json"),
      "--sudoers-path",
      path.join(tempRoot, "missing-sudoers")
    ],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.source, "vps_local_filesystem_observer");
  assert.equal(body.installInventory.status, "missing");
  assert.equal(body.installInventory.checks.every((check) => check.status === "missing"), true);
  assert.equal(body.runtimeTruth.rootExecutionStarted, false);
  assert.equal(body.runtimeTruth.helperExecutionStarted, false);
  assert.equal(JSON.stringify(body).includes("vtdd-runner ALL=(ALL) NOPASSWD:ALL"), false);
});

test("VPS maintenance install inventory collector blocks broad sudoers grants without leaking file content", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-vps-install-inventory-"));
  const helperPath = path.join(tempRoot, "helper");
  const manifestPath = path.join(tempRoot, "manifest.json");
  const sudoersPath = path.join(tempRoot, "sudoers");
  await fs.writeFile(helperPath, "#!/bin/sh\n", "utf8");
  await fs.writeFile(manifestPath, "{}\n", "utf8");
  await fs.writeFile(sudoersPath, "vtdd-runner ALL=(ALL) NOPASSWD:ALL\n", "utf8");

  const result = spawnSync(
    process.execPath,
    [
      "scripts/collect-vps-maintenance-install-inventory.mjs",
      "--host",
      "x85-131-245-163",
      "--repository",
      "marushu/vtdd-v2-p",
      "--helper-path",
      helperPath,
      "--manifest-path",
      manifestPath,
      "--sudoers-path",
      sudoersPath
    ],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 1);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.installInventory.status, "blocked");
  assert.equal(body.installInventory.issues.includes("sudoers must not allow NOPASSWD:ALL"), true);
  assert.equal(body.runtimeTruth.sudoersContentReadable, true);
  assert.equal(JSON.stringify(body).includes("vtdd-runner ALL=(ALL) NOPASSWD:ALL"), false);
});

test("VPS maintenance install inventory collector can verify scoped sudo helper without reading sudoers content", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vtdd-vps-install-inventory-"));
  const helperPath = path.join(tempRoot, "helper");
  const manifestPath = path.join(tempRoot, "manifest.json");
  const sudoersPath = path.join(tempRoot, "sudoers");
  const fakeBin = path.join(tempRoot, "bin");
  await fs.mkdir(fakeBin, { recursive: true });
  await fs.writeFile(helperPath, "#!/bin/sh\n", { mode: 0o755 });
  await fs.writeFile(manifestPath, "{}\n", "utf8");
  await fs.writeFile(sudoersPath, "vtdd-runner ALL=(root) NOPASSWD: /usr/local/sbin/vtdd-vps-maintenance-helper\n", {
    mode: 0o000
  });
  await fs.writeFile(
    path.join(fakeBin, "sudo"),
    "#!/bin/sh\nif [ \"$1\" = \"-n\" ] && [ \"$3\" = \"--version\" ]; then echo vtdd-vps-maintenance-helper; exit 0; fi\nexit 1\n",
    { mode: 0o755 }
  );

  const result = spawnSync(
    process.execPath,
    [
      "scripts/collect-vps-maintenance-install-inventory.mjs",
      "--host",
      "x85-131-245-163",
      "--repository",
      "marushu/vtdd-v2-p",
      "--helper-path",
      helperPath,
      "--manifest-path",
      manifestPath,
      "--sudoers-path",
      sudoersPath,
      "--verify-scoped-sudo"
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`
      }
    }
  );

  assert.equal(result.status, 0);
  const body = JSON.parse(result.stdout);
  assert.equal(body.installInventory.status, "unverified");
  assert.equal(body.installInventory.checks.find((check) => check.id === "scoped_sudoers_entry").status, "pass");
  assert.equal(body.runtimeTruth.sudoersHelperProbeStarted, true);
  assert.equal(body.runtimeTruth.rootExecutionStarted, false);
  assert.equal(body.runtimeTruth.helperExecutionStarted, false);
  assert.equal(body.observation.sudoersHelperProbe.ok, true);
});

test("VPS maintenance install inventory collector detects broad sudoers grants", () => {
  assert.equal(containsBroadSudoersGrant("vtdd-runner ALL=(ALL) NOPASSWD:ALL"), true);
  assert.equal(containsBroadSudoersGrant("vtdd-runner ALL=(root) NOPASSWD:/usr/local/sbin/vtdd-helper"), false);
});
