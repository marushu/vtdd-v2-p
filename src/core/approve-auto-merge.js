import { normalizeText } from "./text-normalization.js";

export const ApproveAutoMergePolicyMode = Object.freeze({
  MANUAL: "manual",
  APPROVE_AUTO_MERGE: "approve_auto_merge"
});

export const APPROVE_AUTO_MERGE_CANDIDATE_MARKER = "<!-- vtdd:auto-merge=candidate -->";
export const APPROVE_AUTO_MERGE_BLOCKED_MARKER = "<!-- vtdd:auto-merge=blocked -->";
export const APPROVE_AUTO_MERGE_EXECUTED_MARKER = "<!-- vtdd:auto-merge=executed -->";

const DEFAULT_REQUIRED_CHECKS = ["guarded-policy", "test", "review"];
const AUTO_MERGE_LABELS = new Set(["approve_auto_merge", "vtdd:auto-merge", "auto-merge"]);

export function resolveApproveAutoMergePolicy(input = {}) {
  const explicit = normalizePolicyMode(input.policyMode || input.mode || input.envPolicy);
  if (explicit) {
    return explicit;
  }
  const labels = normalizeLabels(input.labels);
  if (labels.some((label) => AUTO_MERGE_LABELS.has(label))) {
    return ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE;
  }
  return ApproveAutoMergePolicyMode.MANUAL;
}

export function evaluateApproveAutoMerge(input = {}) {
  const policyMode = resolveApproveAutoMergePolicy({
    policyMode: input.policyMode,
    labels: input.labels
  });
  const pullRequest = normalizePullRequest(input.pullRequest);
  const reviewLoop = normalizeReviewLoop(input.reviewLoop);
  const requiredChecks = normalizeRequiredChecks(input.requiredChecks);
  const checkRuns = normalizeCheckRuns(input.checkRuns);
  const checkTruth = evaluateRequiredChecks({ checkRuns, requiredChecks });
  const reasons = [];
  const evidence = [];

  if (policyMode !== ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE) {
    reasons.push("approve_auto_merge policy is not enabled for this repository, Issue, or PR.");
  }
  if (!pullRequest.exists) {
    reasons.push("pull request runtime truth is missing.");
  }
  if (pullRequest.state && pullRequest.state !== "open") {
    reasons.push(`pull request state is ${pullRequest.state}, not open.`);
  }
  if (pullRequest.draft) {
    reasons.push("pull request is still draft.");
  }
  if (!pullRequest.number) {
    reasons.push("pull request number is missing.");
  }
  if (!pullRequest.headSha) {
    reasons.push("pull request head SHA is missing.");
  }
  if (!pullRequest.issueNumber) {
    reasons.push("related Issue number is missing.");
  }
  if (pullRequest.mergeConflict || pullRequest.mergeability.status === "conflict") {
    reasons.push("runtime truth shows merge conflicts.");
  }
  if (!pullRequest.mergeability.verified) {
    reasons.push("pull request mergeability is unverified.");
  }
  if (pullRequest.mergeability.verified && pullRequest.mergeability.mergeable !== true) {
    reasons.push("pull request is not mergeable.");
  }
  if (
    pullRequest.mergeability.mergeableState &&
    !["clean", "has_hooks", "unstable"].includes(pullRequest.mergeability.mergeableState)
  ) {
    reasons.push(`pull request mergeable_state is ${pullRequest.mergeability.mergeableState}.`);
  }
  if (pullRequest.updatedSinceReview) {
    reasons.push("pull request changed after the latest reviewer evidence.");
  }

  if (reviewLoop.reviewerSignalTruth?.mergeReviewTruth?.satisfied !== true) {
    reasons.push("reviewer merge truth is not satisfied.");
  }
  if (reviewLoop.reviewerSignalTruth?.mergeReviewTruth?.blocked === true) {
    reasons.push("reviewer merge truth is blocked.");
  }
  if (reviewLoop.unresolvedReviewCommentsCount > 0) {
    reasons.push("unresolved reviewer objections remain.");
  }
  if (reviewLoop.criticalReviewPending) {
    reasons.push("critical review is still pending.");
  }
  if (reviewLoop.reviewerEvidence?.recommendedAction !== "approve") {
    reasons.push("latest trusted reviewer action is not approve.");
  }
  if (!reviewLoop.reviewerEvidence?.headSha) {
    reasons.push("reviewer evidence head SHA is missing.");
  }
  if (
    reviewLoop.reviewerEvidence?.headSha &&
    pullRequest.headSha &&
    reviewLoop.reviewerEvidence.headSha !== pullRequest.headSha
  ) {
    reasons.push("reviewer evidence head SHA does not match current PR head SHA.");
  }
  if (reviewLoop.hasRunawayIncident) {
    reasons.push("reviewer runaway incident is present.");
  }
  if (reviewLoop.hasActorIdentityIncident) {
    reasons.push("actor identity incident is present.");
  }
  if (!checkTruth.satisfied) {
    reasons.push(...checkTruth.reasons);
  }

  evidence.push(`policy=${policyMode}`);
  evidence.push(`repo=${pullRequest.repository || "unknown"}`);
  evidence.push(`pr=${pullRequest.number || "unknown"}`);
  evidence.push(`issue=${pullRequest.issueNumber || "unknown"}`);
  evidence.push(`headSha=${pullRequest.headSha || "unknown"}`);
  evidence.push(`reviewer=${reviewLoop.reviewer || "unknown"}`);
  evidence.push(`reviewerAction=${reviewLoop.reviewerEvidence?.recommendedAction || "none"}`);
  evidence.push(`reviewerHeadSha=${reviewLoop.reviewerEvidence?.headSha || "unknown"}`);
  evidence.push(`mergeable=${String(pullRequest.mergeability.mergeable)}`);
  evidence.push(`mergeableState=${pullRequest.mergeability.mergeableState || "unknown"}`);
  evidence.push(`checks=${checkTruth.summary}`);

  return {
    allowed: reasons.length === 0,
    policyMode,
    reasons,
    evidence,
    requiredChecks,
    checkTruth,
    searchKeyword: "自動マージ"
  };
}

export function formatApproveAutoMergeCandidateComment(input = {}) {
  const evaluation = input.evaluation || {};
  const pullRequest = normalizePullRequest(input.pullRequest);
  const lines = [
    APPROVE_AUTO_MERGE_CANDIDATE_MARKER,
    "## VTDD 自動マージ候補",
    "",
    "この PR は `approve_auto_merge` policy の gate を通過しました。merge 実行前の証跡として残します。",
    "",
    "- 検索語: `自動マージ`",
    `- Repository: \`${pullRequest.repository || "unknown"}\``,
    `- PR: \`#${pullRequest.number || "unknown"}\``,
    `- Issue: \`#${pullRequest.issueNumber || "unknown"}\``,
    `- Head SHA: \`${pullRequest.headSha || "unknown"}\``,
    "",
    "### 判定根拠",
    ...formatList(evaluation.evidence),
    "",
    "_Reviewer approve 単体ではなく、checks / mergeability / SHA / reviewer objection / incident gate を通過した場合のみ自動マージします。_"
  ];
  return lines.join("\n");
}

export function formatApproveAutoMergeBlockedComment(input = {}) {
  const evaluation = input.evaluation || {};
  const pullRequest = normalizePullRequest(input.pullRequest);
  const lines = [
    APPROVE_AUTO_MERGE_BLOCKED_MARKER,
    "## VTDD 自動マージ停止",
    "",
    "この PR は `approve_auto_merge` policy 対象ですが、自動マージ gate を通過しませんでした。",
    "",
    "- 検索語: `自動マージ`",
    `- Repository: \`${pullRequest.repository || "unknown"}\``,
    `- PR: \`#${pullRequest.number || "unknown"}\``,
    `- Issue: \`#${pullRequest.issueNumber || "unknown"}\``,
    `- Head SHA: \`${pullRequest.headSha || "unknown"}\``,
    "",
    "### 停止理由",
    ...formatList(evaluation.reasons),
    "",
    "### 判定根拠",
    ...formatList(evaluation.evidence),
    "",
    "_必要なら owner が手動 GO / passkey merge path で判断してください。_"
  ];
  return lines.join("\n");
}

export function formatApproveAutoMergeExecutedComment(input = {}) {
  const evaluation = input.evaluation || {};
  const pullRequest = normalizePullRequest(input.pullRequest);
  const mergeResult = input.mergeResult && typeof input.mergeResult === "object" ? input.mergeResult : {};
  const lines = [
    APPROVE_AUTO_MERGE_EXECUTED_MARKER,
    "## VTDD 自動マージ実行済み",
    "",
    "この PR は `approve_auto_merge` policy により自動マージされました。",
    "",
    "- 検索語: `自動マージ`",
    `- Repository: \`${pullRequest.repository || "unknown"}\``,
    `- PR: \`#${pullRequest.number || "unknown"}\``,
    `- Issue: \`#${pullRequest.issueNumber || "unknown"}\``,
    `- Head SHA: \`${pullRequest.headSha || "unknown"}\``,
    `- Merge SHA: \`${normalizeText(mergeResult.sha) || "unknown"}\``,
    `- Merge message: ${normalizeText(mergeResult.message) || "unknown"}`,
    "",
    "### 判定根拠",
    ...formatList(evaluation.evidence),
    "",
    "### RAG 保存候補",
    "",
    "```json",
    JSON.stringify(buildApproveAutoMergeMemoryCandidate({ evaluation, pullRequest, mergeResult }), null, 2),
    "```",
    "",
    "_問題が起きた場合は `自動マージ` で検索し、このコメントから判断根拠を辿ってください。_"
  ];
  return lines.join("\n");
}

function buildApproveAutoMergeMemoryCandidate({ evaluation, pullRequest, mergeResult }) {
  return {
    recordType: "working_memory",
    summary: `自動マージ実行: ${pullRequest.repository || "unknown"} PR #${pullRequest.number || "unknown"}`,
    relatedIssue: pullRequest.issueNumber || null,
    repository: pullRequest.repository || null,
    details: [
      "approve_auto_merge policy により、reviewer approve / checks / mergeability / head SHA / objection / incident gate を通過したため自動マージした。",
      `PR: #${pullRequest.number || "unknown"}`,
      `Head SHA: ${pullRequest.headSha || "unknown"}`,
      `Merge SHA: ${normalizeText(mergeResult.sha) || "unknown"}`,
      `Evidence: ${(Array.isArray(evaluation.evidence) ? evaluation.evidence : []).join("; ")}`
    ].join("\n"),
    tags: [
      "auto_merge",
      "自動マージ",
      "approve_auto_merge",
      pullRequest.repository ? `repo:${pullRequest.repository}` : null,
      pullRequest.issueNumber ? `issue:${pullRequest.issueNumber}` : null,
      pullRequest.number ? `pr:${pullRequest.number}` : null
    ].filter(Boolean),
    priority: 75
  };
}

function evaluateRequiredChecks({ checkRuns, requiredChecks }) {
  const reasons = [];
  const byName = new Map();
  for (const check of checkRuns) {
    const existing = byName.get(check.name);
    if (!existing || check.startedAt > existing.startedAt) {
      byName.set(check.name, check);
    }
  }

  for (const name of requiredChecks) {
    const check = byName.get(name);
    if (!check) {
      reasons.push(`required check ${name} is missing.`);
      continue;
    }
    if (check.status !== "completed") {
      reasons.push(`required check ${name} is ${check.status || "unknown"}, not completed.`);
      continue;
    }
    if (check.conclusion !== "success") {
      reasons.push(`required check ${name} conclusion is ${check.conclusion || "unknown"}, not success.`);
    }
  }

  return {
    satisfied: reasons.length === 0,
    reasons,
    summary: requiredChecks
      .map((name) => {
        const check = byName.get(name);
        return `${name}:${check?.status || "missing"}/${check?.conclusion || "none"}`;
      })
      .join(", ")
  };
}

function normalizePullRequest(value) {
  const input = value && typeof value === "object" ? value : {};
  const labels = normalizeLabels(input.labels);
  const issueNumber = normalizePositiveInteger(input.issueNumber) || extractIssueNumber(input.body);
  const mergeable = typeof input.mergeable === "boolean" ? input.mergeable : normalizeNullableBoolean(input.mergeability?.mergeable);
  const mergeableState =
    normalizeText(input.mergeableState) ||
    normalizeText(input.mergeable_state) ||
    normalizeText(input.mergeability?.state) ||
    normalizeText(input.mergeability?.mergeableState);
  const mergeConflict =
    input.mergeConflict === true ||
    input.mergeability?.hasConflict === true ||
    mergeable === false ||
    mergeableState === "dirty";
  const verified = typeof mergeable === "boolean" || Boolean(mergeableState);
  return {
    exists:
      Boolean(normalizePositiveInteger(input.number)) ||
      Boolean(normalizeText(input.url)) ||
      Boolean(normalizeText(input.state)),
    repository: normalizeText(input.repository) || null,
    number: normalizePositiveInteger(input.number),
    issueNumber,
    url: normalizeText(input.url) || null,
    body: normalizeText(input.body) || null,
    state: normalizeText(input.state).toLowerCase() || "open",
    draft: input.draft === true,
    headSha: normalizeText(input.headSha) || normalizeText(input.head?.sha) || null,
    labels,
    updatedSinceReview: input.updatedSinceReview === true,
    mergeConflict,
    mergeability: {
      verified,
      status: mergeConflict ? "conflict" : verified ? "verified" : "unverified",
      mergeable,
      mergeableState: mergeableState || null
    }
  };
}

function normalizeReviewLoop(value) {
  const input = value && typeof value === "object" ? value : {};
  const reviewerEvidence = input.reviewerEvidence && typeof input.reviewerEvidence === "object"
    ? input.reviewerEvidence
    : {};
  const timeline = Array.isArray(input.reviewTimeline) ? input.reviewTimeline : [];
  return {
    reviewer: normalizeText(input.reviewer) || "gemini",
    reviewerEvidence: {
      recommendedAction: normalizeText(reviewerEvidence.recommendedAction).toLowerCase() || null,
      headSha: normalizeText(reviewerEvidence.headSha) || null,
      url: normalizeText(reviewerEvidence.url) || null
    },
    reviewerSignalTruth: input.reviewerSignalTruth && typeof input.reviewerSignalTruth === "object"
      ? input.reviewerSignalTruth
      : null,
    unresolvedReviewCommentsCount: normalizeCount(input.unresolvedReviewCommentsCount),
    criticalReviewPending: input.criticalReviewPending === true,
    hasRunawayIncident: timeline.some((item) => normalizeText(item?.type) === "reviewer_runaway"),
    hasActorIdentityIncident: timeline.some((item) => normalizeText(item?.type) === "vtdd_incident")
  };
}

function normalizeRequiredChecks(value) {
  const list = Array.isArray(value) ? value : String(value ?? "").split(",");
  const normalized = list.map(normalizeText).filter(Boolean);
  return normalized.length > 0 ? normalized : DEFAULT_REQUIRED_CHECKS;
}

function normalizeCheckRuns(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => {
      const name = normalizeText(item?.name);
      if (!name) {
        return null;
      }
      return {
        name,
        status: normalizeText(item?.status).toLowerCase() || null,
        conclusion: normalizeText(item?.conclusion).toLowerCase() || null,
        startedAt: Date.parse(normalizeText(item?.startedAt ?? item?.started_at)) || 0
      };
    })
    .filter(Boolean);
}

function normalizePolicyMode(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE) {
    return ApproveAutoMergePolicyMode.APPROVE_AUTO_MERGE;
  }
  if (normalized === ApproveAutoMergePolicyMode.MANUAL) {
    return ApproveAutoMergePolicyMode.MANUAL;
  }
  return null;
}

function normalizeLabels(value) {
  return (Array.isArray(value) ? value : [])
    .map((label) => normalizeText(typeof label === "string" ? label : label?.name).toLowerCase())
    .filter(Boolean);
}

function normalizeNullableBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function normalizePositiveInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function extractIssueNumber(body) {
  const match = normalizeText(body).match(/(?:Issue|Related Issue|Closes)\s+#([0-9]+)/i);
  return normalizePositiveInteger(match?.[1]);
}

function formatList(items, fallback = "- なし。") {
  const list = (Array.isArray(items) ? items : []).map(normalizeText).filter(Boolean);
  return list.length > 0 ? list.map((item) => `- ${item}`) : [fallback];
}
