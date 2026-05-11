#!/usr/bin/env node

import fs from "node:fs";

const REQUIRED_MARKERS = [
  "## This PR satisfies Intent",
  "## Satisfied Success Criteria",
  "## Unsatisfied Success Criteria",
  "## Verification Evidence",
  "## Butler Completion Contract",
  "## Surface Update Checklist",
];

const REQUIRED_BUTLER_FIELDS = [
  "Owner goal",
  "Butler entrypoint",
  "Action Schema exposure",
  "Runtime path",
  "Runner/runtime truth",
  "Authority boundary",
  "E2E evidence",
  "Completion status",
];

const PLACEHOLDER_VALUES = new Set([
  "",
  "none",
  "none.",
  "not required",
  "not required.",
  "not provided",
  "not provided.",
  "todo",
  "tbd",
]);

function validatePrBody(body, options = {}) {
  const errors = [];
  const templateMode = options.template === true;
  for (const marker of REQUIRED_MARKERS) {
    if (!body.includes(marker)) {
      errors.push(`Missing PR template marker: ${marker}`);
    }
  }

  const butlerFields = extractButlerFields(body);
  for (const field of REQUIRED_BUTLER_FIELDS) {
    if (!Object.hasOwn(butlerFields, field)) {
      errors.push(`Missing Butler Completion Contract field: ${field}`);
      continue;
    }
    if (!templateMode && isPlaceholder(butlerFields[field])) {
      errors.push(`Butler Completion Contract field is not filled: ${field}`);
    }
  }

  const completionStatus = normalizeValue(butlerFields["Completion status"]);
  if (
    !templateMode &&
    completionStatus &&
    !["complete", "incomplete", "unconnected"].includes(completionStatus)
  ) {
    errors.push("Butler Completion Contract status must be complete, incomplete, or unconnected.");
  }

  if (!templateMode && completionStatus === "complete" && isEmptyEvidence(butlerFields["E2E evidence"])) {
    errors.push("Butler Completion Contract status is complete but Butler-facing E2E evidence is missing.");
  }

  if (!templateMode && completionStatus !== "complete" && unsatisfiedCriteriaIsNone(body)) {
    errors.push("PR claims no unsatisfied Success Criteria but Butler Completion Contract is not complete.");
  }

  if (/Closes #[0-9]+/i.test(body)) {
    if (!/E2E:/i.test(body)) {
      errors.push("PR uses Closes but E2E slot is missing.");
    }
    if (!/Evidence path\/link:/i.test(body)) {
      errors.push("PR uses Closes but evidence path/link slot is missing.");
    }
    if (normalizeValue(butlerFields["Completion status"]) !== "complete") {
      errors.push("PR uses Closes but Butler Completion Contract status is not complete.");
    }
    if (isEmptyEvidence(butlerFields["E2E evidence"])) {
      errors.push("PR uses Closes but Butler-facing E2E evidence is missing.");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function extractButlerFields(body) {
  const fields = {};
  const section = body.split("## Butler Completion Contract")[1]?.split(/\n## /)[0] || "";
  for (const line of section.split("\n")) {
    const match = line.match(/^\s*-\s*([^:]+):\s*(.*)$/);
    if (match) {
      fields[match[1].trim()] = match[2].trim();
    }
  }
  return fields;
}

function normalizeValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isEmptyEvidence(value) {
  return isPlaceholder(value);
}

function isPlaceholder(value) {
  return PLACEHOLDER_VALUES.has(normalizeValue(value));
}

function unsatisfiedCriteriaIsNone(body) {
  const section = body.split("## Unsatisfied Success Criteria")[1]?.split(/\n## /)[0] || "";
  return normalizeValue(section.replace(/^- /gm, "").trim()) === "none.";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const templateMode = args.includes("--template");
  const inputPath = args.find((arg) => arg !== "--template");
  if (!inputPath) {
    console.error("Usage: node scripts/validate-pr-body.mjs [--template] <path>");
    process.exit(1);
  }

  const body = fs.readFileSync(inputPath, "utf8");
  const result = validatePrBody(body, { template: templateMode });
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exit(1);
  }

  console.log("PR body template validation passed.");
}

export { REQUIRED_BUTLER_FIELDS, REQUIRED_MARKERS, validatePrBody };
