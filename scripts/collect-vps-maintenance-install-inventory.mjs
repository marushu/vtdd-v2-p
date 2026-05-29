#!/usr/bin/env node

import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { buildVpsPrivilegedMaintenanceInstallInventory } from "../src/core/index.js";

const DEFAULT_HELPER_INSTALL_PATH = "/usr/local/sbin/vtdd-vps-maintenance-helper";
const DEFAULT_MANIFEST_PATH = "/etc/vtdd/privileged-maintenance-capabilities.json";
const DEFAULT_SUDOERS_PATH = "/etc/sudoers.d/vtdd-vps-maintenance-helper";
const DEFAULT_SUDO_PROBE_TIMEOUT_MS = 3000;
const DEFAULT_SUDO_PROBE_MAX_BUFFER = 16 * 1024;
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
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

async function observeSudoersPolicy(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return {
      readable: true,
      allowsAll: containsBroadSudoersGrant(content)
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        readable: false,
        allowsAll: false
      };
    }
    return {
      readable: false,
      allowsAll: null,
      error: summarizeError(error)
    };
  }
}

async function probeScopedSudoHelper({ helperPath, enabled, timeoutMs, maxBuffer }) {
  if (!enabled) {
    return {
      started: false,
      ok: null,
      skippedReason: "preconditions_not_met"
    };
  }
  try {
    await execFileAsync("sudo", ["-n", helperPath, "--version"], {
      timeout: timeoutMs,
      encoding: "utf8",
      maxBuffer
    });
    return {
      started: true,
      ok: true,
      error: null
    };
  } catch (error) {
    return {
      started: true,
      ok: false,
      error: summarizeError(error)
    };
  }
}

function shouldProbeScopedSudoHelper({ verifyScopedSudo, helper, manifest, sudoers, sudoersPolicy }) {
  return (
    verifyScopedSudo === true &&
    helper.installed === true &&
    helper.owner === "root" &&
    manifest.installed === true &&
    manifest.owner === "root" &&
    sudoers.installed === true &&
    sudoers.owner === "root" &&
    sudoersPolicy.allowsAll === false
  );
}

function containsBroadSudoersGrant(content) {
  return /\bNOPASSWD\s*:\s*ALL\b/i.test(String(content || ""));
}

function ownerLabel(stat) {
  if (stat?.uid === 0) return "root";
  return Number.isInteger(stat?.uid) ? String(stat.uid) : null;
}

function summarizeError(error) {
  const code = typeof error?.code === "string" ? error.code : "UNKNOWN";
  return code.replace(/[^A-Z0-9_]/gi, "").slice(0, 80) || "UNKNOWN";
}

async function collectVpsMaintenanceInstallInventory(input = {}) {
  const host = String(input.host || "").trim();
  const repository = String(input.repository || "").trim();
  const helperPath = String(input.helperPath || input["helper-path"] || DEFAULT_HELPER_INSTALL_PATH).trim();
  const manifestPath = String(input.manifestPath || input["manifest-path"] || DEFAULT_MANIFEST_PATH).trim();
  const sudoersPath = String(input.sudoersPath || input["sudoers-path"] || DEFAULT_SUDOERS_PATH).trim();
  const runnerUser = String(input.runnerUser || input["runner-user"] || "vtdd-runner").trim();
  const verifyScopedSudo = input.verifyScopedSudo === "true" || input["verify-scoped-sudo"] === "true";
  const sudoProbeTimeoutMs = normalizePositiveInteger(
    input.sudoProbeTimeoutMs || input["sudo-probe-timeout-ms"],
    DEFAULT_SUDO_PROBE_TIMEOUT_MS
  );
  const sudoProbeMaxBuffer = normalizePositiveInteger(
    input.sudoProbeMaxBuffer || input["sudo-probe-max-buffer"],
    DEFAULT_SUDO_PROBE_MAX_BUFFER
  );

  const [helper, manifest, sudoers, sudoersPolicy] = await Promise.all([
    observePath(helperPath),
    observePath(manifestPath),
    observePath(sudoersPath),
    observeSudoersPolicy(sudoersPath)
  ]);
  const shouldProbe = shouldProbeScopedSudoHelper({
    verifyScopedSudo,
    helper,
    manifest,
    sudoers,
    sudoersPolicy
  });
  const sudoersHelperProbe = await probeScopedSudoHelper({
    helperPath,
    enabled: shouldProbe,
    timeoutMs: sudoProbeTimeoutMs,
    maxBuffer: sudoProbeMaxBuffer
  });

  const installInventory = buildVpsPrivilegedMaintenanceInstallInventory({
    host,
    repository,
    helperPath,
    manifestPath,
    sudoersPath,
    runnerUser,
    helperInstalled: helper.installed,
    manifestInstalled: manifest.installed,
    sudoersInstalled: sudoers.installed,
    helperOwner: helper.owner,
    manifestOwner: manifest.owner,
    sudoersOwner: sudoers.owner,
    sudoersAllowsAll: sudoersPolicy.allowsAll,
    sudoersHelperProbe: sudoersHelperProbe.ok,
    sudoersHelperProbeStarted: sudoersHelperProbe.started
  });

  return {
    ok: installInventory.ok,
    source: "vps_local_filesystem_observer",
    installInventory,
    runtimeTruth: {
      ...installInventory.runtimeTruth,
      observer: "scripts/collect-vps-maintenance-install-inventory.mjs",
      sudoersContentReadable: sudoersPolicy.readable,
      sudoersHelperProbeStarted: sudoersHelperProbe.started,
      sudoersHelperProbeTimeoutMs: sudoersHelperProbe.started ? sudoProbeTimeoutMs : null,
      rootExecutionStarted: false,
      helperExecutionStarted: false,
      redacted: true
    },
    observation: {
      helper: redactObservation(helper),
      manifest: redactObservation(manifest),
      sudoers: redactObservation(sudoers),
      sudoersContentReadable: sudoersPolicy.readable,
      sudoersPolicyError: sudoersPolicy.error || null,
      sudoersHelperProbe: {
        started: sudoersHelperProbe.started,
        ok: sudoersHelperProbe.ok,
        error: sudoersHelperProbe.error || null,
        skippedReason: sudoersHelperProbe.skippedReason || null,
        command: sudoersHelperProbe.started ? "sudo -n <helper> --version" : null,
        timeoutMs: sudoersHelperProbe.started ? sudoProbeTimeoutMs : null
      }
    }
  };
}

function normalizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function redactObservation(value) {
  return {
    installed: value.installed,
    owner: value.owner,
    error: value.error || null
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await collectVpsMaintenanceInstallInventory(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

export { collectVpsMaintenanceInstallInventory, containsBroadSudoersGrant };
