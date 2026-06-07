import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  buildWatchdogVpsRunnerEvent,
  evaluateAttemptBudget,
  parseWatchdogArgs,
  readHeartbeat,
  runDashboardBridgeWatchdog,
  writeBoundedWatchdogLog
} from "../scripts/watch-dashboard-app-server-bridge.mjs";

const SERVICE = "vtdd-dashboard-app-server-bridge-unresolved.service";
const NOW = Date.parse("2026-06-07T07:00:00.000Z");

test("dashboard bridge watchdog treats fresh heartbeat and active systemd service as healthy", async () => {
  const calls = [];
  const result = await runDashboardBridgeWatchdog({
    options: baseOptions(),
    nowMs: () => NOW,
    runner: systemctlRunner({
      calls,
      activeState: "active",
      subState: "running",
      mainPid: "700812"
    }),
    fsImpl: memoryFs({
      files: {
        "/tmp/bridge-heartbeat.json": heartbeatPayload("700812")
      },
      stats: {
        "/tmp/bridge-heartbeat.json": { mtimeMs: NOW - 10_000 }
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "healthy");
  assert.equal(result.attemptedRestart, false);
  assert.equal(calls.some((call) => call.args.includes("restart")), false);
});

test("dashboard bridge watchdog restarts the fixed bridge service when inactive", async () => {
  const calls = [];
  let restarted = false;
  const result = await runDashboardBridgeWatchdog({
    options: baseOptions(),
    nowMs: () => NOW,
    runner: (command, args) => {
      calls.push({ command, args });
      if (args.includes("restart")) {
        restarted = true;
        return { status: 0, stdout: "", stderr: "" };
      }
      return systemctlRunner({
        activeState: restarted ? "active" : "inactive",
        subState: restarted ? "running" : "dead",
        mainPid: restarted ? "700900" : "0"
      })(command, args);
    },
    fsImpl: memoryFs({
      files: {
        "/tmp/bridge-heartbeat.json": heartbeatPayload("700900")
      },
      stats: {
        "/tmp/bridge-heartbeat.json": { mtimeMs: NOW - 10_000 }
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "self_healed");
  assert.equal(result.attemptedRestart, true);
  assert.equal(result.before.activeState, "inactive");
  assert.equal(result.after.activeState, "active");
  assert.equal(calls.some((call) => call.args.join(" ") === "--user restart vtdd-dashboard-app-server-bridge-unresolved.service"), true);
});

test("dashboard bridge watchdog opens circuit instead of restarting forever", async () => {
  const calls = [];
  const fsImpl = memoryFs({
    files: {
      "/tmp/watchdog-state.json": JSON.stringify({
        attempts: [
          { attemptedAtMs: NOW - 1_000, status: "restart_failed" },
          { attemptedAtMs: NOW - 2_000, status: "restart_failed" },
          { attemptedAtMs: NOW - 3_000, status: "restart_failed" }
        ]
      })
    },
    stats: {
      "/tmp/bridge-heartbeat.json": { mtimeMs: NOW - 10_000 }
    }
  });

  const result = await runDashboardBridgeWatchdog({
    options: baseOptions({ maxAttempts: 3 }),
    nowMs: () => NOW,
    runner: systemctlRunner({
      calls,
      activeState: "inactive",
      subState: "dead",
      mainPid: "0"
    }),
    fsImpl
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "circuit_open");
  assert.equal(result.attemptedRestart, false);
  assert.equal(calls.some((call) => call.args.includes("restart")), false);
});

test("dashboard bridge watchdog lock prevents duplicate restart attempts", async () => {
  const calls = [];
  const result = await runDashboardBridgeWatchdog({
    options: baseOptions(),
    nowMs: () => NOW,
    runner: systemctlRunner({
      calls,
      activeState: "inactive",
      subState: "dead",
      mainPid: "0"
    }),
    fsImpl: {
      ...memoryFs(),
      async mkdir(target) {
        if (target === "/tmp/watchdog.lock") {
          const error = new Error("exists");
          error.code = "EEXIST";
          throw error;
        }
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "locked");
  assert.equal(result.attemptedRestart, false);
  assert.equal(calls.length, 0);
});

test("dashboard bridge watchdog creates the lock parent before first lock acquisition", async () => {
  const mkdirs = [];
  const result = await runDashboardBridgeWatchdog({
    options: baseOptions(),
    nowMs: () => NOW,
    runner: systemctlRunner({
      activeState: "active",
      subState: "running",
      mainPid: "700812"
    }),
    fsImpl: {
      ...memoryFs({
        files: {
          "/tmp/bridge-heartbeat.json": heartbeatPayload("700812")
        },
        stats: {
          "/tmp/bridge-heartbeat.json": { mtimeMs: NOW - 10_000 }
        }
      }),
      async mkdir(target, options) {
        mkdirs.push({ target, options });
      }
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(mkdirs.slice(0, 2), [
    { target: "/tmp", options: { recursive: true } },
    { target: "/tmp/watchdog.lock", options: { recursive: false } }
  ]);
});

test("dashboard bridge watchdog recovers stale lock directories", async () => {
  const rms = [];
  const mkdirs = [];
  let lockExists = true;
  const result = await runDashboardBridgeWatchdog({
    options: baseOptions({ lockTtlMs: 60_000 }),
    nowMs: () => NOW,
    runner: systemctlRunner({
      activeState: "active",
      subState: "running",
      mainPid: "700812"
    }),
    fsImpl: {
      ...memoryFs({
        files: {
          "/tmp/bridge-heartbeat.json": heartbeatPayload("700812")
        },
        stats: {
          "/tmp/bridge-heartbeat.json": { mtimeMs: NOW - 10_000 },
          "/tmp/watchdog.lock/lock.json": { mtimeMs: NOW - 120_000 }
        }
      }),
      async mkdir(target, options) {
        mkdirs.push({ target, options });
        if (target === "/tmp/watchdog.lock" && lockExists) {
          const error = new Error("exists");
          error.code = "EEXIST";
          throw error;
        }
      },
      async rm(target, options) {
        rms.push({ target, options });
        lockExists = false;
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(rms[0].target, "/tmp/watchdog.lock");
  assert.equal(mkdirs.filter((entry) => entry.target === "/tmp/watchdog.lock").length, 2);
});

test("dashboard bridge watchdog recovers stale lock directories without lock metadata", async () => {
  const rms = [];
  let lockExists = true;
  const result = await runDashboardBridgeWatchdog({
    options: baseOptions({ lockTtlMs: 60_000 }),
    nowMs: () => NOW,
    runner: systemctlRunner({
      activeState: "active",
      subState: "running",
      mainPid: "700812"
    }),
    fsImpl: {
      ...memoryFs({
        files: {
          "/tmp/bridge-heartbeat.json": heartbeatPayload("700812")
        },
        stats: {
          "/tmp/bridge-heartbeat.json": { mtimeMs: NOW - 10_000 },
          "/tmp/watchdog.lock": { mtimeMs: NOW - 120_000 }
        }
      }),
      async mkdir(target) {
        if (target === "/tmp/watchdog.lock" && lockExists) {
          const error = new Error("exists");
          error.code = "EEXIST";
          throw error;
        }
      },
      async rm(target, options) {
        rms.push({ target, options });
        lockExists = false;
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(rms[0].target, "/tmp/watchdog.lock");
});

test("dashboard bridge watchdog skips Dashboard report for routine healthy checks", async () => {
  const fetchCalls = [];
  const result = await runDashboardBridgeWatchdog({
    options: baseOptions({
      report: true,
      runtimeUrl: "https://runtime.example",
      token: "secret-token",
      repository: "sample-org/vtdd-v2-p"
    }),
    nowMs: () => NOW,
    runner: systemctlRunner({
      activeState: "active",
      subState: "running",
      mainPid: "700812"
    }),
    fsImpl: memoryFs({
      files: {
        "/tmp/bridge-heartbeat.json": heartbeatPayload("700812")
      },
      stats: {
        "/tmp/bridge-heartbeat.json": { mtimeMs: NOW - 10_000 }
      }
    }),
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return { ok: true, status: 202 };
    }
  });

  assert.equal(result.status, "healthy");
  assert.equal(result.report.status, "skipped_healthy");
  assert.equal(fetchCalls.length, 0);
});

test("dashboard bridge watchdog report requires explicit repository and hides bearer token from body", async () => {
  const fetchCalls = [];
  let restarted = false;
  const result = await runDashboardBridgeWatchdog({
    options: baseOptions({
      report: true,
      postRestartSettleMs: 0,
      runtimeUrl: "https://runtime.example",
      token: "secret-token",
      repository: "sample-org/vtdd-v2-p"
    }),
    nowMs: () => NOW,
    runner: (command, args) => {
      if (args.includes("restart")) {
        restarted = true;
        return { status: 0, stdout: "", stderr: "" };
      }
      return systemctlRunner({
        activeState: restarted ? "active" : "inactive",
        subState: restarted ? "running" : "dead",
        mainPid: restarted ? "700900" : "0"
      })(command, args);
    },
    fsImpl: memoryFs({
      files: {
        "/tmp/bridge-heartbeat.json": heartbeatPayload("700900")
      },
      stats: {
        "/tmp/bridge-heartbeat.json": { mtimeMs: NOW - 10_000 }
      }
    }),
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return { ok: true, status: 202 };
    }
  });

  assert.equal(result.report.ok, true);
  assert.equal(fetchCalls[0].url, "https://runtime.example/v2/events/vps-runner");
  assert.equal(fetchCalls[0].init.headers.authorization, "Bearer secret-token");
  assert.equal(fetchCalls[0].init.body.includes("secret-token"), false);
  const body = JSON.parse(fetchCalls[0].init.body);
  assert.equal(body.repository, "sample-org/vtdd-v2-p");
  assert.equal(body.threadId, "dashboard-main-unresolved");
  assert.equal(body.status, "completed");
  assert.equal(body.lastEvent, "self_healed");
});

test("dashboard bridge watchdog keeps optional report URL failures from breaking finalization", async () => {
  const result = await runDashboardBridgeWatchdog({
    options: baseOptions({
      report: true,
      runtimeUrl: "not a url",
      token: "secret-token",
      repository: "sample-org/vtdd-v2-p",
      reportHealthy: true
    }),
    nowMs: () => NOW,
    runner: systemctlRunner({
      activeState: "active",
      subState: "running",
      mainPid: "700812"
    }),
    fsImpl: memoryFs({
      files: {
        "/tmp/bridge-heartbeat.json": heartbeatPayload("700812")
      },
      stats: {
        "/tmp/bridge-heartbeat.json": { mtimeMs: NOW - 10_000 }
      }
    }),
    fetchImpl: async () => {
      throw new Error("fetch should not run for invalid runtime URL");
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "healthy");
  assert.equal(result.report.ok, false);
  assert.equal(result.report.status, "failed");
});

test("dashboard bridge watchdog keeps local log bounded", async () => {
  const fsImpl = memoryFs({
    files: {
      "/tmp/watchdog.log": ["old-1", "old-2", "old-3"].join("\n") + "\n"
    }
  });
  await writeBoundedWatchdogLog({
    logPath: "/tmp/watchdog.log",
    fsImpl,
    maxLogLines: 2,
    result: {
      ok: true,
      status: "healthy",
      service: SERVICE,
      startedAt: "2026-06-07T07:00:00.000Z",
      completedAt: "2026-06-07T07:00:00.000Z",
      attemptedRestart: false
    }
  });

  const lines = fsImpl.files.get("/tmp/watchdog.log").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[0], "old-3");
  assert.equal(JSON.parse(lines[1]).status, "healthy");
});

test("dashboard bridge watchdog parses repo as explicit reporting config, not owner-specific default", () => {
  const parsed = parseWatchdogArgs([], {});
  assert.equal(parsed.repository, "");
  assert.equal(parsed.service, SERVICE);
  assert.equal(parsed.maxAttempts, 3);
  assert.equal(parsed.maxLogLines, 100);
});

test("dashboard bridge watchdog heartbeat reader marks stale files unhealthy", async () => {
  const heartbeat = await readHeartbeat({
    heartbeatFile: "/tmp/bridge-heartbeat.json",
    nowMs: () => NOW,
    staleHeartbeatMs: 90_000,
    fsImpl: memoryFs({
      stats: {
        "/tmp/bridge-heartbeat.json": { mtimeMs: NOW - 120_000 }
      }
    })
  });

  assert.equal(heartbeat.status, "stale");
  assert.equal(heartbeat.ageMs, 120_000);
});

test("dashboard bridge watchdog heartbeat reader requires pong confirmation and matching PID", async () => {
  const unconfirmed = await readHeartbeat({
    heartbeatFile: "/tmp/bridge-heartbeat.json",
    nowMs: () => NOW,
    staleHeartbeatMs: 90_000,
    expectedPid: "700812",
    fsImpl: memoryFs({
      files: {
        "/tmp/bridge-heartbeat.json": JSON.stringify({ status: "connected", pid: "700812" })
      },
      stats: {
        "/tmp/bridge-heartbeat.json": { mtimeMs: NOW - 10_000 }
      }
    })
  });
  assert.equal(unconfirmed.status, "stale");
  assert.equal(unconfirmed.pongConfirmed, false);

  const pidMismatch = await readHeartbeat({
    heartbeatFile: "/tmp/bridge-heartbeat.json",
    nowMs: () => NOW,
    staleHeartbeatMs: 90_000,
    expectedPid: "700812",
    fsImpl: memoryFs({
      files: {
        "/tmp/bridge-heartbeat.json": heartbeatPayload("700900")
      },
      stats: {
        "/tmp/bridge-heartbeat.json": { mtimeMs: NOW - 10_000 }
      }
    })
  });
  assert.equal(pidMismatch.status, "stale");
  assert.equal(pidMismatch.pidMatches, false);
});

test("dashboard bridge watchdog attempt budget counts only the current window", () => {
  assert.deepEqual(
    evaluateAttemptBudget({
      nowMs: NOW,
      windowMs: 10_000,
      maxAttempts: 2,
      state: {
        attempts: [
          { attemptedAtMs: NOW - 9_000 },
          { attemptedAtMs: NOW - 20_000 }
        ]
      }
    }),
    {
      ok: true,
      attemptsInWindow: 1,
      maxAttempts: 2,
      windowMs: 10_000
    }
  );
});

test("dashboard bridge watchdog event maps circuit open to failed postmortem", () => {
  const event = buildWatchdogVpsRunnerEvent({
    options: { repository: "sample-org/vtdd-v2-p" },
    result: {
      status: "circuit_open",
      service: SERVICE,
      startedAt: "2026-06-07T07:00:00.000Z",
      completedAt: "2026-06-07T07:00:01.000Z",
      attemptedRestart: false
    }
  });

  assert.equal(event.repository, "sample-org/vtdd-v2-p");
  assert.equal(event.status, "failed");
  assert.equal(event.lastEvent, "circuit_open");
  assert.match(event.message, /retry budget/);
});

function baseOptions(overrides = {}) {
  return {
    service: SERVICE,
    statePath: "/tmp/watchdog-state.json",
    lockDir: "/tmp/watchdog.lock",
    heartbeatFile: "/tmp/bridge-heartbeat.json",
    logPath: "/tmp/watchdog.log",
    report: false,
    graceMs: 0,
    postRestartSettleMs: 0,
    staleHeartbeatMs: 90_000,
    ...overrides
  };
}

function systemctlRunner({ calls = [], activeState = "active", subState = "running", mainPid = "1" } = {}) {
  return (command, args) => {
    calls.push({ command, args });
    if (args.includes("is-active")) {
      return { status: activeState === "active" ? 0 : 3, stdout: `${activeState}\n`, stderr: "" };
    }
    if (args.includes("show")) {
      return {
        status: 0,
        stdout: [
          `ActiveState=${activeState}`,
          `SubState=${subState}`,
          `MainPID=${mainPid}`,
          "ExecMainPID=0",
          "ExecMainStatus=0",
          "ActiveEnterTimestamp=Sun 2026-06-07 16:55:52 JST"
        ].join("\n"),
        stderr: ""
      };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
}

function heartbeatPayload(pid) {
  return JSON.stringify({
    kind: "dashboard_app_server_bridge_heartbeat",
    status: "pong_received",
    pid
  });
}

function memoryFs({ files = {}, stats = {} } = {}) {
  const store = new Map(Object.entries(files));
  const statStore = new Map(Object.entries(stats));
  return {
    files: store,
    async mkdir() {},
    async rm(target) {
      store.delete(path.join(target, "lock.json"));
    },
    async readFile(file) {
      if (!store.has(file)) {
        throw new Error(`missing file: ${file}`);
      }
      return store.get(file);
    },
    async writeFile(file, body) {
      store.set(file, body);
    },
    async stat(file) {
      if (!statStore.has(file)) {
        throw new Error(`missing stat: ${file}`);
      }
      return statStore.get(file);
    }
  };
}
