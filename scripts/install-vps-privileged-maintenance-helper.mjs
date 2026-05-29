#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { listVpsPrivilegedMaintenanceCommandRegistry } from "../src/core/index.js";

const DEFAULT_HELPER_INSTALL_PATH = "/usr/local/sbin/vtdd-vps-maintenance-helper";
const DEFAULT_MANIFEST_PATH = "/etc/vtdd/privileged-maintenance-capabilities.json";
const DEFAULT_SUDOERS_PATH = "/etc/sudoers.d/vtdd-vps-maintenance-helper";
const DEFAULT_RUNNER_USER = "vtdd-runner";

function parseArgs(argv) {
  const result = {
    dryRun: false,
    stagingDir: "",
    helperPath: DEFAULT_HELPER_INSTALL_PATH,
    manifestPath: DEFAULT_MANIFEST_PATH,
    sudoersPath: DEFAULT_SUDOERS_PATH,
    runnerUser: DEFAULT_RUNNER_USER,
    host: os.hostname(),
    repository: "",
    repoDir: process.cwd(),
    nodeBin: process.execPath
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg === "--staging-dir") {
      result.stagingDir = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--helper-path") {
      result.helperPath = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--manifest-path") {
      result.manifestPath = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--sudoers-path") {
      result.sudoersPath = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--runner-user") {
      result.runnerUser = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--host") {
      result.host = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--repository") {
      result.repository = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--repo-dir") {
      result.repoDir = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--node-bin") {
      result.nodeBin = argv[index + 1] || "";
      index += 1;
    }
  }
  return result;
}

function validateConfig(config) {
  const issues = [];
  if (!config.host) issues.push("host is required");
  if (!/^[^/\s]+\/[^/\s]+$/.test(config.repository)) issues.push("repository must be owner/repo");
  for (const [field, value] of [
    ["helperPath", config.helperPath],
    ["manifestPath", config.manifestPath],
    ["sudoersPath", config.sudoersPath],
    ["repoDir", config.repoDir],
    ["nodeBin", config.nodeBin]
  ]) {
    if (!String(value || "").startsWith("/")) issues.push(`${field} must be absolute`);
  }
  if (!/^[a-z_][a-z0-9_-]*[$]?$/i.test(config.runnerUser)) issues.push("runnerUser is invalid");
  if (config.helperPath.includes("\n") || config.runnerUser.includes("\n")) {
    issues.push("paths and runnerUser must be single-line values");
  }
  return issues;
}

function buildInitialManifest(config, now = new Date().toISOString()) {
  const capabilities = listVpsPrivilegedMaintenanceCommandRegistry().map((entry) => ({
    id: entry.commandClass.replaceAll("_", "."),
    title: entry.title,
    status: "enabled",
    commandClass: entry.commandClass,
    riskLevel: entry.requiredRiskLevel,
    workingDirectories: [config.repoDir],
    allowedArgs: entry.allowedArgs,
    affectedPaths: affectedPathsForCommand(entry, config),
    redactionRules: ["no secrets", "summarize stdout/stderr", "redact tokens and credentials"],
    rollbackPlan: "disable capability in the root-owned manifest and keep audit history",
    expectedRuntimeTruth: ["before state", "exit code", "redacted log summary", "after state", "next action"],
    createdAt: now,
    updatedAt: now
  }));
  return {
    version: 1,
    host: config.host,
    repository: config.repository,
    updatedAt: now,
    capabilities
  };
}

function affectedPathsForCommand(entry, config) {
  if (entry.commandClass === "playwright_install_deps_chromium") {
    return ["/etc/apt", "/var/lib/apt", "/var/cache/apt", "/usr/lib", "/usr/share/fonts"];
  }
  if (entry.commandClass === "codex_sandbox_sysctl_apply") {
    return ["/etc/sysctl.conf", "/etc/sysctl.d", "/proc/sys"];
  }
  if (entry.commandClass.startsWith("systemd_user_")) {
    return [`/home/${config.runnerUser}/.config/systemd/user`, "/run/user"];
  }
  return [config.repoDir];
}

function buildHelperScript(config) {
  return `#!/usr/bin/env sh
set -eu

NODE_BIN=${JSON.stringify(config.nodeBin)}
REPO_DIR=${JSON.stringify(config.repoDir)}
HELPER_SCRIPT="$REPO_DIR/scripts/run-vps-privileged-maintenance-helper.mjs"

if [ "\${1:-}" = "--version" ]; then
  printf '%s\\n' "vtdd-vps-maintenance-helper repo=${config.repository} host=${config.host}"
  exit 0
fi

exec "$NODE_BIN" "$HELPER_SCRIPT" "$@"
`;
}

function buildSudoers(config) {
  return `${config.runnerUser} ALL=(root) NOPASSWD: ${config.helperPath}\n`;
}

function targetPath(config, absolutePath) {
  if (!config.stagingDir) return absolutePath;
  return path.join(config.stagingDir, absolutePath.replace(/^\/+/, ""));
}

async function writeFileWithParents(filePath, content, mode) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, { mode });
  await fs.chmod(filePath, mode);
}

async function install(config, artifacts) {
  const helperTarget = targetPath(config, config.helperPath);
  const manifestTarget = targetPath(config, config.manifestPath);
  const sudoersTarget = targetPath(config, config.sudoersPath);
  await writeFileWithParents(helperTarget, artifacts.helperScript, 0o755);
  await writeFileWithParents(manifestTarget, `${JSON.stringify(artifacts.manifest, null, 2)}\n`, 0o644);
  await writeFileWithParents(sudoersTarget, artifacts.sudoers, 0o440);
  if (!config.stagingDir && typeof process.setuid === "function" && process.getuid?.() === 0) {
    await Promise.all([fs.chown(helperTarget, 0, 0), fs.chown(manifestTarget, 0, 0), fs.chown(sudoersTarget, 0, 0)]);
  }
  return { helperTarget, manifestTarget, sudoersTarget };
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const issues = validateConfig(config);
  if (!config.dryRun && !config.stagingDir && process.getuid?.() !== 0) {
    issues.push("root is required unless --dry-run or --staging-dir is used");
  }
  const manifest = buildInitialManifest(config);
  const artifacts = {
    helperScript: buildHelperScript(config),
    manifest,
    sudoers: buildSudoers(config)
  };
  if (/\bNOPASSWD\s*:\s*ALL\b/i.test(artifacts.sudoers)) {
    issues.push("sudoers must not allow NOPASSWD:ALL");
  }
  if (issues.length > 0) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: "vps_maintenance_helper_install_invalid", issues }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const result = {
    ok: true,
    kind: "vps_privileged_maintenance_helper_install",
    mode: config.dryRun ? "dry_run" : config.stagingDir ? "staging" : "install",
    host: config.host,
    repository: config.repository,
    rootExecutionStarted: !config.dryRun && !config.stagingDir,
    helperExecutionStarted: false,
    redacted: true,
    paths: {
      helperPath: config.helperPath,
      manifestPath: config.manifestPath,
      sudoersPath: config.sudoersPath
    },
    sudoersShape: {
      user: config.runnerUser,
      runAs: "root",
      allowedCommand: config.helperPath,
      forbidden: ["NOPASSWD:ALL", "sudo su", "root shell"]
    },
    manifestSummary: {
      version: manifest.version,
      capabilityCount: manifest.capabilities.length,
      highRiskCapabilities: manifest.capabilities.filter((capability) => capability.riskLevel === "high").map((capability) => capability.id)
    }
  };

  if (!config.dryRun) {
    result.written = await install(config, artifacts);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}

export { buildHelperScript, buildInitialManifest, buildSudoers, parseArgs, validateConfig };
