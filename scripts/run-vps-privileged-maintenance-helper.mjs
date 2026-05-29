#!/usr/bin/env node

import fs from "node:fs/promises";

import { planVpsPrivilegedMaintenanceHelperExecution } from "../src/core/index.js";

const DEFAULT_HELPER_INSTALL_PATH = "/usr/local/sbin/vtdd-vps-maintenance-helper";
const DEFAULT_MANIFEST_PATH = "/etc/vtdd/privileged-maintenance-capabilities.json";
const DEFAULT_SUDOERS_PATH = "/etc/sudoers.d/vtdd-vps-maintenance-helper";
const DEFAULT_RUNNER_USER = "vtdd-runner";

function parseArgs(argv) {
  const result = {
    mode: "dry_run",
    auditInstall: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      result.mode = "dry_run";
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

function ownerLabel(stat) {
  if (stat?.uid === 0) return "root";
  return Number.isInteger(stat?.uid) ? String(stat.uid) : null;
}

function summarizeError(error) {
  const code = typeof error?.code === "string" ? error.code : "UNKNOWN";
  return code.replace(/[^A-Z0-9_]/gi, "").slice(0, 80) || "UNKNOWN";
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
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

await main();
