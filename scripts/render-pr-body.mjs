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
  return "- このPRスライス外に、未接続または未完了の owner-facing 作業が残っています。";
}

function defaultButlerContract(status) {
  const unconnectedE2E =
    status === "complete"
      ? "必須。実行した Butler-facing E2E evidence を明記してください。"
      : "このPRスライスでは未接続。Butler-facing E2E は未実施です。";

  return {
    ownerGoal: "このPRが扱う owner-facing goal は Intent / Success Criteria に記載しています。",
    entrypoint: "このPRスライスでは未変更、またはまだ未接続です。",
    actionSchemaExposure: "このPRスライスでは未変更です。変更がある場合は下に明記します。",
    runtimePath: "このPRの実装内容と evidence に記載した runtime path を参照してください。",
    runtimeTruth: "このPRの verification evidence と runtime path notes を参照してください。",
    authorityBoundary: "未変更。このPRスライスでは新しい high-risk authority を追加していません。",
    e2eEvidence: unconnectedE2E,
    completionStatus: status
  };
}

function renderPrBody(options = {}) {
  const issue = options.issue ? `#${options.issue}` : null;
  const issueLink = issue ? ` Issue ${issue}` : "";
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
    ? `- ${issue} の部分進捗です。merge 前に、この行を scoped Intent mapping に置き換えてください。`
    : "- merge 前に、この行を scoped Intent mapping に置き換えてください。",
)}

## Satisfied Success Criteria

${bulletize(options.satisfied, "- まだありません。")}

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

- Cloudflare deploy: ${options.cloudflareDeploy || "不要。"}
- Custom GPT Action Schema update: ${options.actionSchemaUpdate || "不要。"}
- Custom GPT Instructions update: ${options.instructionsUpdate || "不要。"}
- iPhone Butler live E2E: ${options.iphoneButlerE2E || "不要。"}

## Related Constitution Rules

${bulletize(options.rules, "- このPRを制約した Constitution rules を記載してください。")}

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
