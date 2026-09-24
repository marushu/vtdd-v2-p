#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { evaluateRuntimeSetupManifestParity } from "../src/core/custom-gpt-setup-artifacts.js";

const DEFAULT_ACTION_SCHEMA_PATH = "docs/setup/custom-gpt-actions-openapi.yaml";
const DEFAULT_INSTRUCTIONS_PATH = "docs/setup/custom-gpt-instructions.md";

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
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

function readText(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function formatList(items) {
  return items.length > 0 ? items.map((item) => `  - ${item}`).join("\n") : "  - None";
}

const args = parseArgs(process.argv.slice(2));
const actionSchemaPath = args.actionSchema || DEFAULT_ACTION_SCHEMA_PATH;
const instructionsPath = args.instructions || DEFAULT_INSTRUCTIONS_PATH;

const result = evaluateRuntimeSetupManifestParity({
  openApiContent: readText(actionSchemaPath),
  instructionsContent: readText(instructionsPath)
});

if (!result.ok) {
  console.error("Runtime setup manifest parity check failed.");
  console.error(`Action Schema: ${actionSchemaPath}`);
  console.error(`Instructions: ${instructionsPath}`);
  console.error("Missing routes:");
  console.error(formatList(result.runtimeMissing.routes));
  console.error("Missing operationIds:");
  console.error(formatList(result.runtimeMissing.operationIds));
  console.error("Missing instruction tokens:");
  console.error(formatList(result.runtimeMissing.instructionTokens));
  if (result.operationLimit?.exceeded) {
    console.error(
      `Custom GPT operation limit exceeded: ${result.operationLimit.count}/${result.operationLimit.limit}`
    );
  }
  console.error(
    "Update RUNTIME_SETUP_MANIFEST in src/core/custom-gpt-setup-artifacts.js when adding Action Schema routes or operationIds."
  );
  process.exit(1);
}

console.log("Runtime setup manifest parity check passed.");
console.log(`Checked ${result.canonical.routes.length} routes.`);
console.log(
  `Checked ${result.canonical.operationIds.length}/${result.operationLimit.limit} Custom GPT operationIds.`
);
