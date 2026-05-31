#!/usr/bin/env node

import fs from "node:fs";

import { validateOwnerFacingJapaneseFirst } from "../src/core/owner-facing-language.js";

const REQUIRED_MARKERS = [
  "## This PR satisfies Intent",
  "## Satisfied Success Criteria",
  "## Unsatisfied Success Criteria",
  "## 開発前作戦図",
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
  "Primary owner surface",
  "Fallback surface",
  "Owner goal",
  "Butler entrypoint",
  "Dashboard Butler natural-language path",
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

const PRE_DEVELOPMENT_STRATEGY_HEADING = "## 開発前作戦図";

const REQUIRED_PRE_DEVELOPMENT_STRATEGY_FIELDS = [
  "作戦図 evidence",
  "完了体験",
  "VTDD 全体で進める部分",
  "設計",
  "仮説",
  "検証計画",
  "改修見積もり",
  "既に通っている経路",
  "未確認の境界",
  "穴が出そうな箇所",
  "PR 前に確認すること",
  "実装候補と捨てた案",
  "merge 後に通す E2E",
  "次の PR を増やさない理由",
  "停止条件",
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

  const strategyFields = extractSectionFields(body, PRE_DEVELOPMENT_STRATEGY_HEADING);
  for (const field of REQUIRED_PRE_DEVELOPMENT_STRATEGY_FIELDS) {
    if (!Object.hasOwn(strategyFields, field)) {
      errors.push(`Missing 開発前作戦図 field: ${field}`);
      continue;
    }
    if (!templateMode && isPreDevelopmentPlaceholder(strategyFields[field])) {
      errors.push(`開発前作戦図 field is not filled: ${field}`);
    }
  }
  if (!templateMode) {
    validatePreDevelopmentStrategySemantics(strategyFields, body, errors);
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
  if (!templateMode) {
    validateButlerSurfaceSemantics(butlerFields, errors);
  }
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

function validateButlerSurfaceSemantics(fields, errors) {
  const primarySurface = fields["Primary owner surface"] || "";
  if (primarySurface && !isDashboardButlerPrimarySurface(primarySurface)) {
    errors.push("Butler Completion Contract Primary owner surface must be Dashboard Butler only.");
  }

  const fallbackSurface = fields["Fallback surface"] || "";
  if (fallbackSurface && /Custom GPT/i.test(fallbackSurface) && !/fallback|フォールバック/i.test(fallbackSurface)) {
    errors.push("Butler Completion Contract Fallback surface may name Custom GPT only as fallback.");
  }

  const naturalLanguagePath = fields["Dashboard Butler natural-language path"] || "";
  if (naturalLanguagePath && !describesDashboardNaturalLanguagePath(naturalLanguagePath)) {
    errors.push("Butler Completion Contract Dashboard Butler natural-language path must describe the Dashboard Butler natural-language/chat entrypoint.");
  }

  const actionSchemaExposure = fields["Action Schema exposure"] || "";
  if (actionSchemaExposure && claimsActionSchemaPrimaryPath(actionSchemaExposure)) {
    errors.push("Butler Completion Contract Action Schema exposure must not be described as the primary owner path.");
  }
}

function isDashboardButlerPrimarySurface(value) {
  const normalized = normalizeValue(value);
  if (!/^dashboard butler\b/.test(normalized)) {
    return false;
  }
  return !/(custom gpt|action schema|mac codex|fallback|フォールバック)/i.test(value);
}

function describesDashboardNaturalLanguagePath(value) {
  if (!/Dashboard Butler/i.test(value)) {
    return false;
  }
  if (!/(自然文|通常チャット|natural-language|natural language|chat)/i.test(value)) {
    return false;
  }
  if (/(internal route only|route only|api only|schema only|placeholder|todo|tbd|未定)/i.test(value)) {
    return false;
  }
  return /(入口|entry|entrypoint|path|経路|到達|接続|説明|必須|受け|interprets?|reaches?|connects?)/i.test(value);
}

function claimsActionSchemaPrimaryPath(value) {
  if (!/(Action Schema|operationId|Custom GPT)/i.test(value)) {
    return false;
  }
  if (/(not\s+(the\s+)?primary|not\s+(a\s+)?main|isn'?t\s+(the\s+)?primary|isn'?t\s+(a\s+)?main|ではない|扱わない|主経路とは扱わない|primary.*ではありません|fallback|フォールバック)/i.test(value)) {
    return false;
  }
  return /(primary|main path|main route|主経路|入口|entrypoint)/i.test(value);
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

function validatePreDevelopmentStrategySemantics(fields, body, errors) {
  const evidence = fields["作戦図 evidence"] || "";
  if (evidence && !/docs\/development-strategy\/issue-[0-9]+-[^)\s]+\.md/.test(evidence)) {
    errors.push("開発前作戦図 作戦図 evidence must point to docs/development-strategy/issue-<number>-<slug>.md.");
  }
  if (evidence) {
    const evidencePath = extractStrategyEvidencePath(evidence);
    if (!evidencePath || !fs.existsSync(evidencePath)) {
      errors.push("開発前作戦図 作戦図 evidence path must exist in this repository checkout.");
    }
    const evidenceIssue = extractStrategyEvidenceIssueNumber(evidencePath);
    const targetIssue = extractTargetIssueNumber(fields, body);
    if (evidenceIssue && targetIssue && evidenceIssue !== targetIssue) {
      errors.push(
        `開発前作戦図 作戦図 evidence Issue #${evidenceIssue} must match Target Issue #${targetIssue}.`,
      );
    }
  }

  const completionExperience = fields["完了体験"] || "";
  if (completionExperience && !/(Butler|オーナー|owner|ユーザー|Dashboard)/i.test(completionExperience)) {
    errors.push("開発前作戦図 完了体験 must name the owner/Butler-facing experience.");
  }

  const prePrChecks = fields["PR 前に確認すること"] || "";
  if (prePrChecks && !/(確認|読む|read|test|検証|source|docs|Issue|PR|workflow|CI)/i.test(prePrChecks)) {
    errors.push("開発前作戦図 PR 前に確認すること must describe concrete pre-PR checks.");
  }

  const postMergeE2E = fields["merge 後に通す E2E"] || "";
  if (postMergeE2E && !/(E2E|e2e|test|テスト|検証|live|node --test)/i.test(postMergeE2E)) {
    errors.push("開発前作戦図 merge 後に通す E2E must name mapped E2E or test evidence.");
  }

  const noNextPrReason = fields["次の PR を増やさない理由"] || "";
  if (noNextPrReason && !/(次|PR|増や|残|閉じ|穴|不足|後続|scope|範囲)/i.test(noNextPrReason)) {
    errors.push("開発前作戦図 次の PR を増やさない理由 must explain why this slice should not spawn predictable follow-up PRs.");
  }

  const design = fields["設計"] || "";
  if (design && !/(owner|オーナー|Butler|境界|scope|範囲|surface|経路|完了|設計)/i.test(design)) {
    errors.push("開発前作戦図 設計 must describe the completion design, scope, boundary, or owner-facing surface.");
  }

  const hypothesis = fields["仮説"] || "";
  if (hypothesis && !/(仮説|疑|root|原因|failure|壊|穴|予測|予見|あたり|suspect|because|なぜ)/i.test(hypothesis)) {
    errors.push("開発前作戦図 仮説 must state the suspected cause or prediction before implementation.");
  }

  const verificationPlan = fields["検証計画"] || "";
  if (verificationPlan && !/(検証|test|テスト|E2E|unit|integration|runtime truth|確認|prove|disprove)/i.test(verificationPlan)) {
    errors.push("開発前作戦図 検証計画 must name the checks that prove or disprove the hypothesis.");
  }

  const estimate = fields["改修見積もり"] || "";
  if (estimate && !/(file|\.js|\.mjs|\.md|\.yml|\.yaml|\.ts|\.tsx|関数|function|route|workflow|line|行|機能|feature|scripts\/|src\/|docs\/|test\/|\.github\/)/i.test(estimate)) {
    errors.push("開発前作戦図 改修見積もり must name concrete files, lines, functions, routes, workflows, or feature boundaries.");
  }
}

function extractStrategyEvidencePath(value) {
  const match = String(value || "").match(/docs\/development-strategy\/issue-[0-9]+-[^\s)]+\.md/);
  return match ? match[0] : "";
}

function extractStrategyEvidenceIssueNumber(value) {
  const match = String(value || "").match(/docs\/development-strategy\/issue-([0-9]+)-[^\s)]+\.md/);
  return match ? match[1] : "";
}

function extractTargetIssueNumber(strategyFields, body) {
  const dryRunFields = extractSectionFields(body, "## Dry-run Impact Report");
  const dryRunTarget = dryRunFields["Target Issue"] || "";
  const dryRunMatch = dryRunTarget.match(/Issue #([0-9]+)/i);
  if (dryRunMatch) {
    return dryRunMatch[1];
  }
  const metadataMatch = String(body || "").match(/^- Issue:\s*Issue #([0-9]+)/im);
  if (metadataMatch) {
    return metadataMatch[1];
  }
  const strategyEvidence = strategyFields["作戦図 evidence"] || "";
  return extractStrategyEvidenceIssueNumber(strategyEvidence);
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

function isPreDevelopmentPlaceholder(value) {
  const normalized = normalizeValue(value);
  if (PLACEHOLDER_VALUES.has(normalized)) {
    return true;
  }
  return /^(未確認|未定|なし|不要|該当なし|n\/a|na)$/i.test(String(value || "").trim())
    || /具体化してください|明記してください|設計してください|仮説化してください|決めてください|してください|未記入|TODO|TBD/i.test(String(value || ""));
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

export {
  REQUIRED_BUTLER_FIELDS,
  REQUIRED_MARKERS,
  REQUIRED_PRE_DEVELOPMENT_STRATEGY_FIELDS,
  REQUIRED_QUEUE_FIELDS,
  validatePrBody
};
