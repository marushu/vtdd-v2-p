#!/usr/bin/env node

import fs from "node:fs/promises";

import { renderPrBody } from "./render-pr-body.mjs";
import { validatePrBody } from "./validate-pr-body.mjs";

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

function prepareGuardedPullRequestBody({ candidateBody, renderBody } = {}) {
  const candidate = typeof candidateBody === "string" ? candidateBody : "";
  const candidateValidation = normalizeText(candidate)
    ? validatePrBody(candidate)
    : { ok: false, errors: ["PR body candidate is missing."] };

  if (candidateValidation.ok) {
    return {
      ok: true,
      body: candidate,
      normalized: false,
      validationErrors: []
    };
  }

  const canonicalBody = typeof renderBody === "function" ? String(renderBody()) : "";
  const canonicalValidation = validatePrBody(canonicalBody);
  if (!canonicalValidation.ok) {
    return {
      ok: false,
      reason: "Could not render a guarded-policy-compliant PR body.",
      validationErrors: candidateValidation.errors,
      canonicalErrors: canonicalValidation.errors
    };
  }

  return {
    ok: true,
    body: canonicalBody,
    normalized: true,
    validationErrors: candidateValidation.errors
  };
}

async function prepareGuardedPullRequestBodyFile({ outputPath, candidateBody, renderBody } = {}) {
  const prepared = prepareGuardedPullRequestBody({ candidateBody, renderBody });
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
    console.error("Usage: node scripts/prepare-pr-body-file.mjs --output <path> [--candidate-file <path>] [render args]");
    process.exit(1);
  }

  const candidateBody = args["candidate-file"]
    ? await fs.readFile(args["candidate-file"], "utf8")
    : normalizeText(args["candidate-body"]);

  const prepared = await prepareGuardedPullRequestBodyFile({
    outputPath,
    candidateBody,
    renderBody: () => renderPrBody(args)
  });

  if (!prepared.ok) {
    for (const error of prepared.validationErrors || []) {
      console.error(error);
    }
    for (const error of prepared.canonicalErrors || []) {
      console.error(error);
    }
    if (prepared.reason) {
      console.error(prepared.reason);
    }
    process.exit(1);
  }

  process.stdout.write(prepared.normalized ? "normalized\n" : "preserved\n");
}

export { prepareGuardedPullRequestBody, prepareGuardedPullRequestBodyFile };
