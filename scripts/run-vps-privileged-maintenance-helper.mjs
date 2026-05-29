#!/usr/bin/env node

import fs from "node:fs/promises";

import { planVpsPrivilegedMaintenanceHelperExecution } from "../src/core/index.js";

function parseArgs(argv) {
  const result = {
    mode: "dry_run"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      result.mode = "dry_run";
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
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
