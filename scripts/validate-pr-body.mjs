#!/usr/bin/env node

import fs from "node:fs";

const REQUIRED_MARKERS = [
  "## This PR satisfies Intent",
  "## Satisfied Success Criteria",
  "## Unsatisfied Success Criteria",
  "## Verification Evidence",
];

function validatePrBody(body) {
  const errors = [];
  for (const marker of REQUIRED_MARKERS) {
    if (!body.includes(marker)) {
      errors.push(`Missing PR template marker: ${marker}`);
    }
  }

  if (/Closes #[0-9]+/i.test(body)) {
    if (!/E2E:/i.test(body)) {
      errors.push("PR uses Closes but E2E slot is missing.");
    }
    if (!/Evidence path\/link:/i.test(body)) {
      errors.push("PR uses Closes but evidence path/link slot is missing.");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/validate-pr-body.mjs <path>");
    process.exit(1);
  }

  const body = fs.readFileSync(inputPath, "utf8");
  const result = validatePrBody(body);
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exit(1);
  }

  console.log("PR body template validation passed.");
}

export { REQUIRED_MARKERS, validatePrBody };
