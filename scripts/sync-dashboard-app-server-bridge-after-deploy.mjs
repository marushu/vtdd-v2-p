#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const DEFAULT_SERVICE = "vtdd-dashboard-app-server-bridge-unresolved.service";
const DEFAULT_REF = "origin/main";

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    service: DEFAULT_SERVICE,
    ref: DEFAULT_REF,
    cwd: process.cwd()
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--service") options.service = argv[++index] || "";
    else if (value === "--ref") options.ref = argv[++index] || "";
    else if (value === "--cwd") options.cwd = argv[++index] || "";
    else if (value === "--help") options.help = true;
    else throw new Error(`unsupported argument: ${value}`);
  }
  return options;
}

function assertSafeService(service) {
  if (service !== DEFAULT_SERVICE) {
    throw new Error(`service must be ${DEFAULT_SERVICE}`);
  }
}

function assertSafeRef(ref) {
  if (!["origin/main", "main"].includes(ref)) {
    throw new Error("ref must be origin/main or main");
  }
}

function runCommand({ command, args = [], cwd, allowFailure = false, runner = spawnSync }) {
  const result = runner(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    maxBuffer: 1024 * 1024
  });
  const exitCode = typeof result.status === "number" ? result.status : result.error ? 1 : 0;
  const record = {
    command,
    args,
    exitCode,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim()
  };
  if (!allowFailure && exitCode !== 0) {
    const error = new Error(`${command} ${args.join(" ")} failed with exit code ${exitCode}`);
    error.commandResult = record;
    throw error;
  }
  return record;
}

function readGitState({ cwd, runner }) {
  const head = runCommand({ command: "git", args: ["rev-parse", "HEAD"], cwd, runner }).stdout;
  const branch = runCommand({ command: "git", args: ["status", "--short", "--branch"], cwd, runner }).stdout;
  const diff = runCommand({ command: "git", args: ["diff", "--quiet"], cwd, runner, allowFailure: true });
  const staged = runCommand({ command: "git", args: ["diff", "--cached", "--quiet"], cwd, runner, allowFailure: true });
  return {
    head,
    branch,
    trackedDirty: diff.exitCode !== 0 || staged.exitCode !== 0
  };
}

function readServiceState({ cwd, service, runner }) {
  const active = runCommand({
    command: "systemctl",
    args: ["--user", "is-active", service],
    cwd,
    runner,
    allowFailure: true
  }).stdout;
  const show = runCommand({
    command: "systemctl",
    args: ["--user", "show", service, "--property=ActiveState,SubState,MainPID,ExecMainPID,ExecMainStatus,ActiveEnterTimestamp"],
    cwd,
    runner,
    allowFailure: true
  }).stdout;
  const properties = Object.fromEntries(
    show
      .split("\n")
      .map((line) => line.split("="))
      .filter((parts) => parts.length === 2)
  );
  return {
    active,
    activeState: properties.ActiveState || "",
    subState: properties.SubState || "",
    mainPid: properties.MainPID || properties.ExecMainPID || "",
    execMainStatus: properties.ExecMainStatus || "",
    activeEnterTimestamp: properties.ActiveEnterTimestamp || ""
  };
}

export async function runDeployBridgeSyncRestart({
  cwd = process.cwd(),
  service = DEFAULT_SERVICE,
  ref = DEFAULT_REF,
  runner = spawnSync,
  now = () => new Date().toISOString()
} = {}) {
  assertSafeService(service);
  assertSafeRef(ref);
  const beforeGit = readGitState({ cwd, runner });
  const beforeService = readServiceState({ cwd, service, runner });
  if (beforeGit.trackedDirty) {
    return {
      ok: false,
      status: "blocked_tracked_dirty_checkout",
      cwd,
      service,
      ref,
      before: {
        git: beforeGit,
        service: beforeService
      },
      after: null,
      runtimeTruth: {
        kind: "dashboard_bridge_deploy_sync_restart",
        status: "blocked_tracked_dirty_checkout",
        rootExecutionStarted: false,
        helperExecutionStarted: true,
        serviceRestarted: false,
        checkedAt: now()
      }
    };
  }

  const fetch = runCommand({ command: "git", args: ["fetch", "origin", "main"], cwd, runner });
  const pull = runCommand({ command: "git", args: ["pull", "--ff-only", "origin", "main"], cwd, runner });
  const restart = runCommand({ command: "systemctl", args: ["--user", "restart", service], cwd, runner });
  const afterGit = readGitState({ cwd, runner });
  const afterService = readServiceState({ cwd, service, runner });
  return {
    ok: true,
    status: "synced_and_restarted",
    cwd,
    service,
    ref,
    before: {
      git: beforeGit,
      service: beforeService
    },
    commands: {
      fetch,
      pull,
      restart
    },
    after: {
      git: afterGit,
      service: afterService
    },
    runtimeTruth: {
      kind: "dashboard_bridge_deploy_sync_restart",
      status: "synced_and_restarted",
      rootExecutionStarted: false,
      helperExecutionStarted: true,
      serviceRestarted: true,
      beforeSha: beforeGit.head,
      afterSha: afterGit.head,
      beforeServiceActiveState: beforeService.activeState || beforeService.active,
      afterServiceActiveState: afterService.activeState || afterService.active,
      afterServiceMainPid: afterService.mainPid,
      checkedAt: now()
    }
  };
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    process.stdout.write(`Usage: node scripts/sync-dashboard-app-server-bridge-after-deploy.mjs --service ${DEFAULT_SERVICE} --ref origin/main\n`);
    return;
  }
  const result = await runDeployBridgeSyncRestart(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const result = {
      ok: false,
      status: "failed",
      error: error.message,
      commandResult: error.commandResult || null,
      runtimeTruth: {
        kind: "dashboard_bridge_deploy_sync_restart",
        status: "failed",
        rootExecutionStarted: false,
        helperExecutionStarted: true,
        serviceRestarted: false
      }
    };
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
  });
}
