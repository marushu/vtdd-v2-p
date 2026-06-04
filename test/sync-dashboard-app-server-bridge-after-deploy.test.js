import test from "node:test";
import assert from "node:assert/strict";
import { runDeployBridgeSyncRestart } from "../scripts/sync-dashboard-app-server-bridge-after-deploy.mjs";

function createFakeRunner({ dirty = false } = {}) {
  const calls = [];
  let head = "before-sha";
  const runner = (command, args) => {
    calls.push([command, ...args]);
    const joined = [command, ...args].join(" ");
    if (joined === "git rev-parse HEAD") {
      return { status: 0, stdout: `${head}\n`, stderr: "" };
    }
    if (joined === "git status --short --branch") {
      return { status: 0, stdout: "## main...origin/main\n?? .tmp/\n", stderr: "" };
    }
    if (joined === "git diff --quiet") {
      return { status: dirty ? 1 : 0, stdout: "", stderr: "" };
    }
    if (joined === "git diff --cached --quiet") {
      return { status: 0, stdout: "", stderr: "" };
    }
    if (joined === "systemctl --user is-active vtdd-dashboard-app-server-bridge-unresolved.service") {
      return { status: 0, stdout: "active\n", stderr: "" };
    }
    if (
      joined ===
      "systemctl --user show vtdd-dashboard-app-server-bridge-unresolved.service --property=ActiveState,SubState,MainPID,ExecMainPID,ExecMainStatus,ActiveEnterTimestamp"
    ) {
      return {
        status: 0,
        stdout: "ActiveState=active\nSubState=running\nMainPID=1234\nExecMainStatus=0\nActiveEnterTimestamp=Thu 2026-06-04 15:00:46 JST\n",
        stderr: ""
      };
    }
    if (joined === "git fetch origin main") {
      return { status: 0, stdout: "", stderr: "" };
    }
    if (joined === "git pull --ff-only origin main") {
      head = "after-sha";
      return { status: 0, stdout: "Fast-forward\n", stderr: "" };
    }
    if (joined === "systemctl --user restart vtdd-dashboard-app-server-bridge-unresolved.service") {
      return { status: 0, stdout: "", stderr: "" };
    }
    return { status: 127, stdout: "", stderr: `unexpected command: ${joined}` };
  };
  return { runner, calls };
}

test("deploy bridge sync/restart helper fast-forwards checkout and restarts unresolved bridge", async () => {
  const fake = createFakeRunner();
  const result = await runDeployBridgeSyncRestart({
    cwd: "/repo",
    service: "vtdd-dashboard-app-server-bridge-unresolved.service",
    ref: "origin/main",
    runner: fake.runner,
    now: () => "2026-06-04T06:00:00.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "synced_and_restarted");
  assert.equal(result.runtimeTruth.beforeSha, "before-sha");
  assert.equal(result.runtimeTruth.afterSha, "after-sha");
  assert.equal(result.runtimeTruth.afterServiceMainPid, "1234");
  assert.deepEqual(fake.calls.filter((call) => call[0] === "systemctl" && call.includes("restart")), [
    ["systemctl", "--user", "restart", "vtdd-dashboard-app-server-bridge-unresolved.service"]
  ]);
});

test("deploy bridge sync/restart helper blocks tracked dirty checkout before restart", async () => {
  const fake = createFakeRunner({ dirty: true });
  const result = await runDeployBridgeSyncRestart({
    cwd: "/repo",
    service: "vtdd-dashboard-app-server-bridge-unresolved.service",
    ref: "origin/main",
    runner: fake.runner,
    now: () => "2026-06-04T06:00:00.000Z"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked_tracked_dirty_checkout");
  assert.equal(result.runtimeTruth.serviceRestarted, false);
  assert.equal(fake.calls.some((call) => call.join(" ") === "systemctl --user restart vtdd-dashboard-app-server-bridge-unresolved.service"), false);
});
