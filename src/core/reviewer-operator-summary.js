export const ReviewerOperatorSeverity = Object.freeze({
  CRITICAL: "致命的",
  IMPORTANT: "重要",
  MINOR: "軽微",
  INFO: "情報のみ"
});

export function formatReviewerOperatorSummary(input = {}) {
  const reviewer = normalizeText(input.reviewer) || "reviewer";
  const status = normalizeText(input.status);
  const recommendedAction = normalizeText(input.recommendedAction).toLowerCase() || "manual_review";
  const criticalFindings = normalizeStringArray(input.criticalFindings);
  const risks = normalizeStringArray(input.risks);
  const blocker = normalizeText(input.blocker);
  const blocking = determineBlocking({
    status,
    recommendedAction,
    blocker
  });
  const severity = determineSeverity({
    status,
    recommendedAction,
    criticalFindings,
    risks,
    blocker
  });
  const reasons = buildReasons({
    status,
    recommendedAction,
    criticalFindings,
    risks,
    blocker
  });
  const humanJudgment = buildHumanJudgment({
    status,
    recommendedAction,
    blocking,
    blocker
  });

  return [
    "## Operator Summary",
    "",
    `推奨: ${formatRecommendation({ status, recommendedAction, blocker })}`,
    `merge blocker: ${blocking ? "はい" : "いいえ"}`,
    `severity: ${severity}`,
    `reviewer: ${reviewer}`,
    "",
    "理由:",
    ...reasons.map((reason) => `- ${reason}`),
    "",
    "人間判断:",
    `- ${humanJudgment}`
  ].join("\n");
}

function determineBlocking({ status, recommendedAction, blocker }) {
  if (blocker) {
    return true;
  }
  if (status === "requested" || status === "blocked") {
    return true;
  }
  return recommendedAction === "request_changes" || recommendedAction === "manual_review";
}

function determineSeverity({ status, recommendedAction, criticalFindings, risks, blocker }) {
  if (blocker || status === "blocked") {
    return ReviewerOperatorSeverity.CRITICAL;
  }
  if (status === "requested" || recommendedAction === "request_changes" || recommendedAction === "manual_review") {
    return ReviewerOperatorSeverity.IMPORTANT;
  }
  if (risks.length > 0 || criticalFindings.length > 0) {
    return ReviewerOperatorSeverity.MINOR;
  }
  return ReviewerOperatorSeverity.INFO;
}

function buildReasons({ status, recommendedAction, criticalFindings, risks, blocker }) {
  if (blocker || status === "blocked") {
    return [`reviewer 実行が blocked: ${blocker || "原因未分類"}`];
  }
  if (status === "requested") {
    return ["reviewer fallback は依頼済みだが、完了した review evidence は未到着"];
  }

  const reasons = [];
  if (recommendedAction === "request_changes") {
    reasons.push("未解決の重要指摘あり");
  } else if (recommendedAction === "manual_review") {
    reasons.push("自動判断不可。人間確認が必要");
  } else {
    reasons.push("重大 blocker は報告されていない");
  }

  if (criticalFindings.length > 0) {
    reasons.push(...summarizeItems("重要指摘", criticalFindings));
  }
  const unverifiedRisks = risks.filter(isUnverifiedRisk);
  if (unverifiedRisks.length > 0) {
    reasons.push(...summarizeItems("未検証", unverifiedRisks));
  }
  const residualRisks = risks.filter((risk) => !isUnverifiedRisk(risk));
  if (residualRisks.length > 0) {
    reasons.push(...summarizeItems("残リスク", residualRisks));
  }

  return dedupe(reasons).slice(0, 5);
}

function summarizeItems(label, items) {
  return items.slice(0, 2).map((item) => `${label}: ${item}`);
}

function isUnverifiedRisk(value) {
  const text = normalizeText(value).toLowerCase();
  return (
    text.includes("unverified") ||
    text.includes("not verified") ||
    text.includes("verify") ||
    text.includes("e2e") ||
    text.includes("iphone") ||
    text.includes("apple watch") ||
    text.includes("未確認") ||
    text.includes("未検証")
  );
}

function buildHumanJudgment({ status, recommendedAction, blocking, blocker }) {
  if (blocker || status === "blocked") {
    return "blocker 解消後に reviewer を再実行";
  }
  if (status === "requested") {
    return "完了 reviewer evidence 到着まで merge 非推奨";
  }
  if (recommendedAction === "request_changes") {
    return "指摘対応と再 review 後に merge 判断";
  }
  if (recommendedAction === "manual_review") {
    return "人間が未検証点を確認してから merge 判断";
  }
  if (!blocking) {
    return "残リスク確認後なら merge 判断可能";
  }
  return "人間確認が必要";
}

function formatRecommendation({ status, recommendedAction, blocker }) {
  if (blocker || status === "blocked") {
    return "merge 非推奨（reviewer 実行 blocked）";
  }
  if (status === "requested") {
    return "merge 非推奨（review 未完了）";
  }
  if (recommendedAction === "approve") {
    return "merge 可能（残リスク確認）";
  }
  if (recommendedAction === "request_changes") {
    return "merge 非推奨";
  }
  return "人間確認";
}

function dedupe(values) {
  return [...new Set(values)];
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(normalizeText).filter(Boolean);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
