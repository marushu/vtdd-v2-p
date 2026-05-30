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
    primaryOwnerSurface: "Dashboard Butler。owner-facing の主経路は Dashboard Butler であり、Custom GPT ではありません。",
    fallbackSurface: "Custom GPT は明示された fallback surface として扱います。主経路ではありません。",
    ownerGoal: "このPRが扱う owner-facing goal は Intent / Success Criteria に記載しています。",
    entrypoint: "このPRスライスでは未変更、またはまだ未接続です。",
    dashboardNaturalLanguagePath: "Dashboard Butler の自然文 / 通常チャット入口は、このPRスライスでは未変更または未接続です。",
    actionSchemaExposure: "Custom GPT fallback 用の露出状態として扱います。このPRスライスでは未変更です。",
    runtimePath: "このPRの実装内容と evidence に記載した runtime path を参照してください。",
    runtimeTruth: "このPRの verification evidence と runtime path notes を参照してください。",
    authorityBoundary: "未変更。このPRスライスでは新しい high-risk authority を追加していません。",
    e2eEvidence: unconnectedE2E,
    completionStatus: status
  };
}

function defaultDryRunReport(options = {}) {
  const issue = options.issue ? `Issue #${options.issue}` : "対象 Issue を明記してください。";
  return {
    targetIssue: issue,
    successCriteria: "このPRで実装する Success Criteria を明記してください。",
    nonGoals: "このPRで触らない範囲を明記してください。",
    expectedTouched: "想定ファイル、route、workflow、docs を明記してください。",
    affectedIssues: "影響し得る Issue を明記してください。なければ `なし` と書いてください。",
    affectedPrs: "影響し得る PR を明記してください。なければ `なし` と書いてください。",
    affectedWorkflows: "影響し得る GitHub Actions / reviewer / deploy workflow を明記してください。",
    affectedRuntimeSurfaces: "影響し得る Butler / Worker / VPS / operator / Custom GPT surface を明記してください。",
    narrowPatchRisk: "この Issue だけを見て直すと壊れ得るものを明記してください。",
    unknowns: "実装前に調べる未知を明記してください。",
    validationNeeded: "必要な unit / integration / E2E / live verification を明記してください。",
    stopCondition: "続行すると drift になる条件を明記してください。"
  };
}

function defaultQueueDelta(options = {}) {
  const issue = options.issue ? `Issue #${options.issue}` : "対象 Issue";
  return {
    positionBefore: `${issue} は active issue execution queue 上の bounded slice として扱います。`,
    preemptionDecision: "EMERGENCY ではありません。現在の root blocker / active queue に対する scoped progress として扱います。",
    queueDelta: `${issue} の queue item をこのPRで進めます。残る blocker / evidence gap を明記してください。`,
    whyNext: "このPRが今の queue で次に必要な理由を明記してください。",
    activeIssuesNotDownscoped: "Active Issues は縮小しません。このPRで扱わない active Issue は未完了として残します。"
  };
}

function defaultFileLineHypotheses() {
  return {
    hypotheses:
      "- file: `未特定`\n  - hypothesis: 実装前に疑わしいファイル / 関数 / 行範囲を明記してください。\n  - risk if changed narrowly: 狭く直した場合の破綻リスクを明記してください。\n  - validation: 仮説の検証方法を明記してください。\n  - related Issue: 対象 Issue を明記してください。",
    retrospective:
      "- expected: PR merge 前または merge 後に、実際の結果と比較してください。\n- actual: 未実施。\n- mismatch: 未実施。\n- lesson: 未実施。\n- should become RAG candidate: 未判断。"
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
  const dryRunDefaults = defaultDryRunReport(options);
  const dryRun = {
    ...dryRunDefaults,
    ...(options.dryRun || {})
  };
  const queueDefaults = defaultQueueDelta(options);
  const queue = {
    ...queueDefaults,
    ...(options.queue || {})
  };
  const fileLineDefaults = defaultFileLineHypotheses();
  const fileLine = {
    ...fileLineDefaults,
    ...(options.fileLine || {})
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

## Dry-run Impact Report

- Target Issue: ${options.dryRunTargetIssue || dryRun.targetIssue}
- Implementing Success Criteria: ${options.dryRunSuccessCriteria || dryRun.successCriteria}
- Explicit Non-goals: ${options.dryRunNonGoals || dryRun.nonGoals}
- Expected touched files/routes/workflows: ${options.dryRunExpectedTouched || dryRun.expectedTouched}
- Affected Issues: ${options.dryRunAffectedIssues || dryRun.affectedIssues}
- Affected PRs: ${options.dryRunAffectedPrs || dryRun.affectedPrs}
- Affected workflows: ${options.dryRunAffectedWorkflows || dryRun.affectedWorkflows}
- Affected runtime/operator surfaces: ${options.dryRunAffectedRuntimeSurfaces || dryRun.affectedRuntimeSurfaces}
- What may break if we patch narrowly: ${options.dryRunNarrowPatchRisk || dryRun.narrowPatchRisk}
- Unknowns to investigate before coding: ${options.dryRunUnknowns || dryRun.unknowns}
- Validation needed: ${options.dryRunValidationNeeded || dryRun.validationNeeded}
- Stop condition: ${options.dryRunStopCondition || dryRun.stopCondition}

## Execution Queue Delta

- Queue position before: ${options.queuePositionBefore || queue.positionBefore}
- Preemption decision: ${options.preemptionDecision || queue.preemptionDecision}
- Queue delta: ${options.queueDelta || queue.queueDelta}
- Why this PR is next: ${options.whyThisPrIsNext || queue.whyNext}
- Active Issues not downscoped: ${options.activeIssuesNotDownscoped || queue.activeIssuesNotDownscoped}

## File / Line Hypotheses

${options.fileLineHypotheses || fileLine.hypotheses}

## Hypothesis Retrospective

${options.hypothesisRetrospective || fileLine.retrospective}

## Verification Evidence

- Unit: ${options.unit || "None."}
- Integration: ${options.integration || "None."}
- E2E: ${options.e2e || "None."}
- Manual: ${options.manual || "None."}
- Evidence path/link: ${evidencePath}

## Butler Completion Contract

- Primary owner surface: ${options.primaryOwnerSurface || butler.primaryOwnerSurface}
- Fallback surface: ${options.fallbackSurface || butler.fallbackSurface}
- Owner goal: ${options.ownerGoal || butler.ownerGoal}
- Butler entrypoint: ${options.butlerEntrypoint || butler.entrypoint}
- Dashboard Butler natural-language path: ${options.dashboardNaturalLanguagePath || butler.dashboardNaturalLanguagePath}
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
