#!/usr/bin/env node

import fs from "node:fs/promises";

import { renderIssueBody, validateIssueBody } from "../src/core/issue-body.js";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

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

function prepareIssueBody({ candidateBody, renderBody } = {}) {
  const candidate = typeof candidateBody === "string" ? candidateBody : "";
  const candidateValidation = normalizeText(candidate)
    ? validateIssueBody(candidate)
    : { ok: false, errors: ["Issue body candidate is missing."], warnings: [] };

  if (candidateValidation.ok) {
    return {
      ok: true,
      body: candidate,
      normalized: false,
      validationErrors: [],
      warnings: candidateValidation.warnings ?? []
    };
  }

  const canonicalBody = typeof renderBody === "function" ? String(renderBody()) : "";
  const canonicalValidation = validateIssueBody(canonicalBody);
  if (!canonicalValidation.ok) {
    return {
      ok: false,
      reason: "Could not render an Issue body that passes owner-facing guard.",
      validationErrors: candidateValidation.errors,
      canonicalErrors: canonicalValidation.errors,
      warnings: [...(candidateValidation.warnings ?? []), ...(canonicalValidation.warnings ?? [])]
    };
  }

  return {
    ok: true,
    body: canonicalBody,
    normalized: true,
    validationErrors: candidateValidation.errors,
    warnings: canonicalValidation.warnings ?? []
  };
}

async function prepareIssueBodyFile({ outputPath, candidateBody, renderBody } = {}) {
  const prepared = prepareIssueBody({ candidateBody, renderBody });
  if (!prepared.ok) {
    return prepared;
  }
  await fs.writeFile(outputPath, prepared.body, "utf8");
  return {
    ...prepared,
    outputPath
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = args.output;
  if (!outputPath) {
    console.error("Usage: node scripts/prepare-issue-body-file.mjs --output <path> [--candidate-file <path>] [render args]");
    process.exit(1);
  }

  const candidateBody = args["candidate-file"]
    ? await fs.readFile(args["candidate-file"], "utf8")
    : normalizeText(args["candidate-body"]);

  const prepared = await prepareIssueBodyFile({
    outputPath,
    candidateBody,
    renderBody: () => renderIssueBody(args)
  });

  if (!prepared.ok) {
    for (const error of prepared.validationErrors || []) {
      console.error(error);
    }
    for (const error of prepared.canonicalErrors || []) {
      console.error(error);
    }
    for (const warning of prepared.warnings || []) {
      console.error(`warning: ${warning}`);
    }
    if (prepared.reason) {
      console.error(prepared.reason);
    }
    process.exit(1);
  }

  for (const warning of prepared.warnings || []) {
    console.error(`warning: ${warning}`);
  }
  process.stdout.write(prepared.normalized ? "normalized\n" : "preserved\n");
}

export { prepareIssueBody, prepareIssueBodyFile };
