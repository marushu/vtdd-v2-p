#!/usr/bin/env node

import fs from "node:fs";

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

function bulletize(value, fallback = "None.") {
  if (!value) {
    return fallback;
  }
  const lines = String(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return fallback;
  }
  if (lines.length === 1 && (lines[0] === "None." || lines[0] === "None")) {
    return "None.";
  }
  return lines.map((line) => `- ${line.replace(/^- /, "")}`).join("\n");
}

function renderPrBody(options = {}) {
  const issue = options.issue ? `#${options.issue}` : null;
  const issueLink = issue ? ` ${issue}` : "";
  const executionId = options.executionId || "Not provided.";
  const codexGoal = options.codexGoal || "Not provided.";
  const evidencePath = options.evidencePath || "Not provided.";

  return `## This PR satisfies Intent

${bulletize(
  options.intent,
  issue
    ? `- Partial progress for ${issue}. Replace this line with the scoped Intent mapping before merge.`
    : "- Replace this line with the scoped Intent mapping before merge.",
)}

## Satisfied Success Criteria

${bulletize(options.satisfied, "- None yet.")}

## Unsatisfied Success Criteria

${bulletize(options.unsatisfied, "None.")}

## Non-goal violations

${options.nonGoals || "None."}

## Verification Evidence

- Unit: ${options.unit || "None."}
- Integration: ${options.integration || "None."}
- E2E: ${options.e2e || "None."}
- Manual: ${options.manual || "None."}
- Evidence path/link: ${evidencePath}

## Related Constitution Rules

${bulletize(options.rules, "- Add the governing Constitution rules here.")}

## Out-of-scope but NOT implemented

${bulletize(options.outOfScope, "None.")}

## Extra changes (if any)

${options.extra || "None."}

<!-- VTDD metadata -->
- Issue:${issueLink}
- Execution ID: ${executionId}
- Goal: ${codexGoal}
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const body = renderPrBody(args);

  if (args.output) {
    fs.writeFileSync(args.output, body);
  } else {
    process.stdout.write(body);
  }
}

export { renderPrBody };
