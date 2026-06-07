import test from "node:test";
import assert from "node:assert/strict";
import { runDeployBridgeSyncRestart } from "../scripts/sync-dashboard-app-server-bridge-after-deploy.mjs";

function createFakeRunner({ dirty = false, restartChangesService = true } = {}) {
  const calls = [];
  let head = "before-sha";
  let restarted = false;
  const runner = (command, args) => {
    calls.push([command, ...args]);
    const joined = [command, ...args].join(" ");
    if (joined === "git rev-parse HEAD") {
      return { status: 0, stdout: `${head}\n`, stderr: "" };
    }
    if (joined === "git rev-parse origin/main") {
      return { status: 0, stdout: `${head === "after-sha" ? "after-sha" : "remote-before-sha"}\n`, stderr: "" };
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
        stdout: [
          "ActiveState=active",
          "SubState=running",
          `MainPID=${restarted && restartChangesService ? "5678" : "1234"}`,
          "ExecMainStatus=0",
          `ActiveEnterTimestamp=${restarted && restartChangesService ? "Thu 2026-06-04 18:23:12 JST" : "Thu 2026-06-04 15:00:46 JST"}`
        ].join("\n") + "\n",
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
      restarted = true;
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
  assert.equal(result.runtimeTruth.targetRef, "origin/main");
  assert.equal(result.runtimeTruth.targetRefSha, "after-sha");
  assert.equal(result.runtimeTruth.syncVerified, true);
  assert.equal(result.runtimeTruth.afterMatchesTargetRef, true);
  assert.equal(result.runtimeTruth.restartVerified, true);
  assert.equal(result.runtimeTruth.beforeServiceMainPid, "1234");
  assert.equal(result.runtimeTruth.afterServiceMainPid, "5678");
  assert.equal(result.runtimeTruth.beforeServiceActiveEnterTimestamp, "Thu 2026-06-04 15:00:46 JST");
  assert.equal(result.runtimeTruth.afterServiceActiveEnterTimestamp, "Thu 2026-06-04 18:23:12 JST");
  assert.deepEqual(fake.calls.filter((call) => call[0] === "systemctl" && call.includes("restart")), [
    ["systemctl", "--user", "restart", "vtdd-dashboard-app-server-bridge-unresolved.service"]
  ]);
});

test("deploy bridge sync/restart helper does not treat unchanged service state as completion", async () => {
  const fake = createFakeRunner({ restartChangesService: false });
  const result = await runDeployBridgeSyncRestart({
    cwd: "/repo",
    service: "vtdd-dashboard-app-server-bridge-unresolved.service",
    ref: "origin/main",
    runner: fake.runner,
    now: () => "2026-06-04T06:00:00.000Z"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "restart_unverified");
  assert.equal(result.runtimeTruth.status, "restart_unverified");
  assert.equal(result.runtimeTruth.serviceRestarted, false);
  assert.equal(result.runtimeTruth.restartVerified, false);
  assert.equal(result.runtimeTruth.beforeServiceMainPid, "1234");
  assert.equal(result.runtimeTruth.afterServiceMainPid, "1234");
  assert.match(result.runtimeTruth.reason, /did not change MainPID/);
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
