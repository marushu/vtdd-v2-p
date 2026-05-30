#!/usr/bin/env node

import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { planVpsPrivilegedMaintenanceHelperExecution } from "../src/core/index.js";

const DEFAULT_HELPER_INSTALL_PATH = "/usr/local/sbin/vtdd-vps-maintenance-helper";
const DEFAULT_MANIFEST_PATH = "/etc/vtdd/privileged-maintenance-capabilities.json";
const DEFAULT_SUDOERS_PATH = "/etc/sudoers.d/vtdd-vps-maintenance-helper";
const DEFAULT_RUNNER_USER = "vtdd-runner";
const DEFAULT_RUNUSER_PATH = "/usr/sbin/runuser";

function parseArgs(argv) {
  const result = {
    mode: "dry_run",
    auditInstall: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      result.mode = "dry_run";
    } else if (arg === "--execute") {
      result.mode = "execute";
    } else if (arg === "--install-audit") {
      result.auditInstall = true;
    } else if (arg === "--input") {
      result.inputPath = argv[index + 1] || "";
      index += 1;
    }
  }
  return result;
}

async function readInput(inputPath) {
  if (inputPath) {
    return fs.readFile(inputPath, "utf8");
  }
  let text = "";
  for await (const chunk of process.stdin) {
    text += chunk;
  }
  return text;
}

async function observePath(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return {
      installed: true,
      owner: ownerLabel(stat)
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        installed: false,
        owner: null
      };
    }
    return {
      installed: null,
      owner: null,
      error: summarizeError(error)
    };
  }
}

async function observeSudoersPolicy({ sudoersPath, helperPath, runnerUser }) {
  try {
    const content = await fs.readFile(sudoersPath, "utf8");
    return {
      readable: true,
      allowsAll: /\bNOPASSWD\s*:\s*ALL\b/i.test(content),
      scopedHelperEntry: content
        .split(/\r?\n/)
        .some((line) => line.trim() === `${runnerUser} ALL=(root) NOPASSWD: ${helperPath}`)
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        readable: false,
        allowsAll: false,
        scopedHelperEntry: false
      };
    }
    return {
      readable: false,
      allowsAll: null,
      scopedHelperEntry: null,
      error: summarizeError(error)
    };
  }
}

async function auditInstall(args) {
  const config = {
    helperPath: DEFAULT_HELPER_INSTALL_PATH,
    manifestPath: DEFAULT_MANIFEST_PATH,
    sudoersPath: DEFAULT_SUDOERS_PATH,
    runnerUser: DEFAULT_RUNNER_USER
  };
  if (process.getuid?.() !== 0) {
    return {
      ok: false,
      error: "root_required",
      kind: "vps_privileged_maintenance_install_audit",
      rootAuditStarted: false,
      helperExecutionStarted: true,
      redacted: true,
      observed: null,
      observation: null,
      issues: ["root is required for install audit"]
    };
  }
  const [helper, manifest, sudoers, sudoersPolicy] = await Promise.all([
    observePath(config.helperPath),
    observePath(config.manifestPath),
    observePath(config.sudoersPath),
    observeSudoersPolicy(config)
  ]);
  const issues = [];
  if (helper.installed !== true || helper.owner !== "root") issues.push("root-owned helper is not verified");
  if (manifest.installed !== true || manifest.owner !== "root") issues.push("root-owned manifest is not verified");
  if (sudoers.installed !== true || sudoers.owner !== "root") issues.push("root-owned sudoers entry is not verified");
  if (sudoersPolicy.allowsAll === true) issues.push("sudoers must not allow NOPASSWD:ALL");
  if (sudoersPolicy.scopedHelperEntry === false) issues.push("sudoers scoped helper entry is missing");
  return {
    ok: issues.length === 0,
    kind: "vps_privileged_maintenance_install_audit",
    rootAuditStarted: process.getuid?.() === 0,
    helperExecutionStarted: true,
    redacted: true,
    observed: {
      helperInstalled: helper.installed,
      manifestInstalled: manifest.installed,
      sudoersInstalled: sudoers.installed,
      helperOwner: helper.owner,
      manifestOwner: manifest.owner,
      sudoersOwner: sudoers.owner,
      sudoersAllowsAll: sudoersPolicy.allowsAll,
      sudoersScopedHelperEntry: sudoersPolicy.scopedHelperEntry
    },
    observation: {
      helper,
      manifest,
      sudoers,
      sudoersContentReadable: sudoersPolicy.readable,
      sudoersPolicyError: sudoersPolicy.error || null
    },
    issues
  };
}

export function executeHelperPlan({
  helperPlan,
  timeoutMs,
  getuid = process.getuid,
  spawnSyncFn = spawnSync,
  runuserPath = DEFAULT_RUNUSER_PATH,
  nowFn = () => new Date()
}) {
  const boundary = helperPlan?.commandPreview?.executionBoundary ?? {};
  const workingDirectory = String(helperPlan?.capability?.workingDirectories?.[0] ?? "").trim();
  const helperStartedAsRoot = getuid?.() === 0;
  const now = nowFn().toISOString();
  const baseTruth = {
    ok: false,
    kind: "vps_privileged_maintenance_helper_execution",
    status: "blocked",
    host: helperPlan?.host || "",
    repository: helperPlan?.repository || "",
    relatedIssue: helperPlan?.relatedIssue || null,
    operation: helperPlan?.operation || "",
    capabilityId: helperPlan?.capability?.id || "",
    commandClass: boundary.commandClass || "",
    commandExecutionBoundary: boundary,
    before: {
      workingDirectory,
      startedAt: now
    },
    after: null,
    exitCode: null,
    redactedLogSummary: "",
    rootExecutionStarted: false,
    helperExecutionStarted: true,
    helperStartedAsRoot,
    redacted: true,
    updatedAt: now
  };

  const runAsUser = boundary.requiresRoot === true ? "root" : DEFAULT_RUNNER_USER;
  if (boundary.requiresRoot !== true && !helperStartedAsRoot) {
    return {
      ok: false,
      error: "root_required_for_run_as",
      issues: ["root-owned helper must start as root before dropping privileges for non-root helper execution"],
      runtimeTruth: {
        ...baseTruth,
        redactedLogSummary: "blocked before execution; root-owned helper was not running as root for run-as transition"
      }
    };
  }
  if (!helperStartedAsRoot) {
    return {
      ok: false,
      error: "root_required",
      issues: ["root is required for VPS privileged maintenance helper execution"],
      runtimeTruth: {
        ...baseTruth,
        redactedLogSummary: "blocked before execution; root-owned helper was not running as root"
      }
    };
  }
  if (!workingDirectory.startsWith("/")) {
    return {
      ok: false,
      error: "vps_helper_working_directory_invalid",
      issues: ["helper execution working directory must be absolute"],
      runtimeTruth: {
        ...baseTruth,
        redactedLogSummary: "blocked before execution; working directory was not absolute"
      }
    };
  }

  const executable = String(boundary.executable || "").trim();
  const args = Array.isArray(boundary.args) ? boundary.args.map((part) => String(part)) : [];
  const spawnExecutable = boundary.requiresRoot === true ? executable : runuserPath;
  const spawnArgs = boundary.requiresRoot === true ? args : ["-u", runAsUser, "--", executable, ...args];
  const timeout = normalizeTimeoutMs(timeoutMs);
  const spawned = spawnSyncFn(spawnExecutable, spawnArgs, {
    cwd: workingDirectory,
    encoding: "utf8",
    shell: false,
    timeout,
    env: {
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      HOME: process.env.HOME || "/root",
      CI: process.env.CI || "1"
    }
  });
  const completedAt = nowFn().toISOString();
  const exitCode = typeof spawned.status === "number" ? spawned.status : spawned.error ? 124 : 1;
  return {
    ok: exitCode === 0,
    runtimeTruth: {
      ...baseTruth,
      ok: exitCode === 0,
      status: exitCode === 0 ? "completed" : "failed",
      runAsUser,
      after: {
        completedAt,
        timedOut: spawned.error?.code === "ETIMEDOUT"
      },
      exitCode,
      redactedLogSummary: summarizeProcessOutput(spawned),
      rootExecutionStarted: boundary.requiresRoot === true,
      updatedAt: completedAt
    }
  };
}

function ownerLabel(stat) {
  if (stat?.uid === 0) return "root";
  return Number.isInteger(stat?.uid) ? String(stat.uid) : null;
}

function summarizeError(error) {
  const code = typeof error?.code === "string" ? error.code : "UNKNOWN";
  return code.replace(/[^A-Z0-9_]/gi, "").slice(0, 80) || "UNKNOWN";
}

function normalizeTimeoutMs(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10 * 60 * 1000;
  return Math.min(parsed, 15 * 60 * 1000);
}

function summarizeProcessOutput(result) {
  const lines = [
    result.error ? `error=${summarizeError(result.error)}` : "",
    result.stdout ? `stdout=${result.stdout}` : "",
    result.stderr ? `stderr=${result.stderr}` : ""
  ]
    .filter(Boolean)
    .join("\n");
  return redactSensitiveText(lines).slice(0, 2000) || "command produced no output";
}

function redactSensitiveText(value) {
  return String(value ?? "")
    .replace(/(approval[_-]?grant[_-]?id|token|secret|password|authorization)\s*[:=]\s*\S+/gi, "$1=<redacted>")
    .replace(/gh[opsu]_[A-Za-z0-9_]+/g, "<redacted-token>")
    .replace(/[A-Za-z0-9+/]{32,}={0,2}/g, "<redacted-long-value>");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.auditInstall) {
    const result = await auditInstall(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }
  const raw = await readInput(args.inputPath);
  const input = raw.trim() ? JSON.parse(raw) : {};
  const result = planVpsPrivilegedMaintenanceHelperExecution({
    manifest: input.manifest,
    helperRequest: input.helperRequest,
    mode: args.mode,
    now: input.now
  });
  if (args.mode === "execute" && result.ok) {
    const executed = executeHelperPlan({
      helperPlan: result.helperPlan,
      timeoutMs: input.timeoutMs
    });
    process.stdout.write(`${JSON.stringify(executed, null, 2)}\n`);
    if (!executed.ok) {
      process.exitCode = 1;
    }
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
