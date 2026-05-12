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

function normalizeCompletionStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return "unconnected";
  }
  if (normalized === "partial" || normalized === "in_progress" || normalized === "in-progress") {
    return "incomplete";
  }
  if (["complete", "incomplete", "unconnected"].includes(normalized)) {
    return normalized;
  }
  return normalized;
}

function defaultUnsatisfiedCriteria(status) {
  if (status === "complete") {
    return "None.";
  }
  return "- Remaining scoped work or owner-facing connections are still open outside this PR slice.";
}

function defaultButlerContract(status) {
  const unconnectedE2E =
    status === "complete"
      ? "Required and must be listed explicitly."
      : "Unconnected in this PR slice; Butler-facing E2E remains open.";

  return {
    ownerGoal: "See Intent and Success Criteria sections for the scoped owner-facing goal.",
    entrypoint: "Unchanged or not yet connected in this PR slice.",
    actionSchemaExposure: "Unchanged in this PR slice unless stated otherwise below.",
    runtimePath: "See this PR's scoped implementation/evidence description.",
    runtimeTruth: "See verification evidence and runtime path notes in this PR.",
    authorityBoundary: "Unchanged; no new high-risk authority is introduced in this PR slice unless stated otherwise.",
    e2eEvidence: unconnectedE2E,
    completionStatus: status
  };
}

function renderPrBody(options = {}) {
  const issue = options.issue ? `#${options.issue}` : null;
  const issueLink = issue ? ` ${issue}` : "";
  const executionId = options.executionId || "Not provided.";
  const codexGoal = options.codexGoal || "Not provided.";
  const evidencePath = options.evidencePath || "Not provided.";
  const status = normalizeCompletionStatus(options.completionStatus || options.butler?.completionStatus);
  const butlerDefaults = defaultButlerContract(status);
  const butler = {
    ...butlerDefaults,
    ...(options.butler || {})
  };

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

${bulletize(options.unsatisfied, defaultUnsatisfiedCriteria(status))}

## Non-goal violations

${options.nonGoals || "None."}

## Verification Evidence

- Unit: ${options.unit || "None."}
- Integration: ${options.integration || "None."}
- E2E: ${options.e2e || "None."}
- Manual: ${options.manual || "None."}
- Evidence path/link: ${evidencePath}

## Butler Completion Contract

- Owner goal: ${options.ownerGoal || butler.ownerGoal}
- Butler entrypoint: ${options.butlerEntrypoint || butler.entrypoint}
- Action Schema exposure: ${options.actionSchemaExposure || butler.actionSchemaExposure}
- Runtime path: ${options.runtimePath || butler.runtimePath}
- Runner/runtime truth: ${options.runtimeTruth || butler.runtimeTruth}
- Authority boundary: ${options.authorityBoundary || butler.authorityBoundary}
- E2E evidence: ${options.butlerE2E || butler.e2eEvidence}
- Completion status: ${status}

## Surface Update Checklist

- Cloudflare deploy: ${options.cloudflareDeploy || "Not required."}
- Custom GPT Action Schema update: ${options.actionSchemaUpdate || "Not required."}
- Custom GPT Instructions update: ${options.instructionsUpdate || "Not required."}
- iPhone Butler live E2E: ${options.iphoneButlerE2E || "Not required."}

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
