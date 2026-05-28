#!/usr/bin/env node

import fs from "node:fs";

import { validateOwnerFacingJapaneseFirst } from "../src/core/owner-facing-language.js";

const REQUIRED_MARKERS = [
  "## This PR satisfies Intent",
  "## Satisfied Success Criteria",
  "## Unsatisfied Success Criteria",
  "## Dry-run Impact Report",
  "## Execution Queue Delta",
  "## File / Line Hypotheses",
  "## Hypothesis Retrospective",
  "## Verification Evidence",
  "## Butler Completion Contract",
  "## Surface Update Checklist",
];

const REQUIRED_QUEUE_FIELDS = [
  "Queue position before",
  "Preemption decision",
  "Queue delta",
  "Why this PR is next",
  "Active Issues not downscoped",
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

const REQUIRED_DRY_RUN_FIELDS = [
  "Target Issue",
  "Implementing Success Criteria",
  "Explicit Non-goals",
  "Expected touched files/routes/workflows",
  "Affected Issues",
  "Affected PRs",
  "Affected workflows",
  "Affected runtime/operator surfaces",
  "What may break if we patch narrowly",
  "Unknowns to investigate before coding",
  "Validation needed",
  "Stop condition",
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
  const warnings = [];
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

  const dryRunFields = extractSectionFields(body, "## Dry-run Impact Report");
  for (const field of REQUIRED_DRY_RUN_FIELDS) {
    if (!Object.hasOwn(dryRunFields, field)) {
      errors.push(`Missing Dry-run Impact Report field: ${field}`);
      continue;
    }
    if (!templateMode && isPlaceholder(dryRunFields[field])) {
      errors.push(`Dry-run Impact Report field is not filled: ${field}`);
    }
  }

  const queueFields = extractSectionFields(body, "## Execution Queue Delta");
  for (const field of REQUIRED_QUEUE_FIELDS) {
    if (!Object.hasOwn(queueFields, field)) {
      errors.push(`Missing Execution Queue Delta field: ${field}`);
      continue;
    }
    if (!templateMode && isPlaceholder(queueFields[field])) {
      errors.push(`Execution Queue Delta field is not filled: ${field}`);
    }
  }
  if (!templateMode) {
    validateQueueFieldSemantics(queueFields, errors);
  }

  if (!templateMode && sectionLooksEmpty(body, "## File / Line Hypotheses")) {
    errors.push("File / Line Hypotheses section is empty.");
  }

  if (!templateMode && sectionLooksEmpty(body, "## Hypothesis Retrospective")) {
    errors.push("Hypothesis Retrospective section is empty.");
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

  const language = validateOwnerFacingJapaneseFirst(body, {
    surface: "PR body",
    requireJapanese: true,
    requireRecoveryContext: false,
    errorOnBareIssuePrReference: false,
    minimumJapaneseCharacters: templateMode ? 20 : 20
  });
  errors.push(...language.errors);
  warnings.push(...language.warnings);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function extractButlerFields(body) {
  return extractSectionFields(body, "## Butler Completion Contract");
}

function validateQueueFieldSemantics(fields, errors) {
  const preemptionDecision = fields["Preemption decision"] || "";
  if (
    preemptionDecision &&
    !/\b(EMERGENCY|ROOT|NEXT|QUEUE|EVIDENCE|QUESTION)\b/.test(preemptionDecision)
  ) {
    errors.push(
      "Execution Queue Delta Preemption decision must name one queue classification: EMERGENCY, ROOT, NEXT, QUEUE, EVIDENCE, or QUESTION.",
    );
  }

  const queueDelta = fields["Queue delta"] || "";
  if (queueDelta && !/(Issue #\d+|PR #\d+|`Now`|`Next`|Root Blockers|Evidence Gaps|Blocked|Queue)/.test(queueDelta)) {
    errors.push("Execution Queue Delta Queue delta must name the Issue/PR or queue bucket being moved.");
  }

  const activeIssues = fields["Active Issues not downscoped"] || "";
  if (
    activeIssues &&
    !/(縮小しない|縮小しません|not downscop|not shrink|remain active|active issues are not)/i.test(activeIssues)
  ) {
    errors.push("Execution Queue Delta must explicitly state that active Issues are not downscoped.");
  }
}

function extractSectionFields(body, heading) {
  const fields = {};
  const section = body.split(heading)[1]?.split(/\n## /)[0] || "";
  for (const line of section.split("\n")) {
    const match = line.match(/^\s*-\s*([^:]+):\s*(.*)$/);
    if (match) {
      fields[match[1].trim()] = match[2].trim();
    }
  }
  return fields;
}

function sectionLooksEmpty(body, heading) {
  const section = body.split(heading)[1]?.split(/\n## /)[0] || "";
  const normalized = section.replace(/<!--[\s\S]*?-->/g, "").trim();
  return isPlaceholder(normalized);
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

  for (const warning of result.warnings || []) {
    console.error(`warning: ${warning}`);
  }
  console.log("PR body template validation passed.");
}

export { REQUIRED_BUTLER_FIELDS, REQUIRED_MARKERS, REQUIRED_QUEUE_FIELDS, validatePrBody };
