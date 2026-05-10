import { RemoteCodexExecutionStatus } from "./remote-codex-executor.js";

export const ButlerBatchConflictRisk = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high"
});

export const ButlerBatchIssueDisposition = Object.freeze({
  PROPOSED: "proposed",
  WAITING_DEPENDENCY: "waiting_dependency",
  WAITING_CONFLICT: "waiting_conflict",
  WAITING_CAPACITY: "waiting_capacity",
  BLOCKED_RUNTIME_TRUTH: "blocked_runtime_truth"
});

export const ButlerBatchExecutionStage = Object.freeze({
  QUEUED: "queued",
  IN_PROGRESS: "in_progress",
  BLOCKED: "blocked",
  PR_CREATED: "pr_created",
  REVIEW: "review",
  MERGE_READY: "merge_ready",
  UNKNOWN: "unknown"
});

const DEFAULT_MAX_PARALLEL = 3;

const AREA_KEYWORDS = Object.freeze([
  {
    pattern: /\b(butler|orchestrator|管制|batch|planning|parallel)\b/i,
    areas: ["src/core/butler-orchestrator.js", "src/core/butler-batch-planning.js", "docs/butler"]
  },
  {
    pattern: /\b(github|issue|issues|pull request|pr|runtime truth|read)\b/i,
    areas: ["src/core/github-read-plane.js", "src/core/github-write-plane.js", "docs/security/github-operation-plane.md"]
  },
  {
    pattern: /\b(codex|handoff|executor|runner|queued|in_progress|blocked)\b/i,
    areas: ["src/core/remote-codex-executor.js", "src/core/remote-codex-handoff-scope.js", "docs/butler/remote-codex-cli-executor.md"]
  },
  {
    pattern: /\b(review|reviewer|gemini|merge-ready|merge ready|checks?)\b/i,
    areas: ["src/core/gemini-pr-review.js", "src/core/reviewer-contract.js", "docs/butler/review-protocol.md"]
  },
  {
    pattern: /\b(memory|rag|decision log|proposal log)\b/i,
    areas: ["src/core/memory-provider.js", "src/core/memory-schema.js", "docs/memory"]
  },
  {
    pattern: /\b(deploy|cloudflare|production|passkey)\b/i,
    areas: ["src/core/deploy-production-plane.js", "src/core/passkey-approval.js", "docs/security"]
  }
]);

export function buildButlerIssueBatchPlan(input = {}) {
  const runtimeIssues = normalizeOpenIssues(input.openIssues ?? input.githubRuntimeTruth?.openIssues);
  const maxParallel = normalizePositiveInteger(input.maxParallel) ?? DEFAULT_MAX_PARALLEL;
  const inFlight = normalizeTrackedIssueNumbers(input.inFlightIssues ?? input.githubRuntimeTruth?.inFlightIssues);

  if (runtimeIssues.length === 0) {
    return {
      ok: false,
      error: "open_issues_runtime_truth_required",
      reason: "open Issues from GitHub runtime truth are required before Butler can plan a batch"
    };
  }

  const candidates = runtimeIssues
    .map((issue) => enrichIssueForBatchPlanning(issue))
    .sort(compareIssuePriority);
  const candidateNumbers = new Set(candidates.map((issue) => issue.issueNumber));
  const proposed = [];
  const waiting = [];

  for (const candidate of candidates) {
    const dependencyBlockers = candidate.dependencies.filter((issueNumber) =>
      candidateNumbers.has(issueNumber)
    );
    if (dependencyBlockers.length > 0) {
      waiting.push({
        ...candidate,
        disposition: ButlerBatchIssueDisposition.WAITING_DEPENDENCY,
        reason: `wait for dependency Issue(s): ${dependencyBlockers.map((number) => `#${number}`).join(", ")}`
      });
      continue;
    }

    const risk = classifyIssueConflictRisk(candidate, [...proposed, ...inFlight]);
    if (risk.risk === ButlerBatchConflictRisk.HIGH) {
      waiting.push({
        ...candidate,
        conflictRisk: risk.risk,
        conflictReasons: risk.reasons,
        disposition: ButlerBatchIssueDisposition.WAITING_CONFLICT,
        reason: risk.reasons.join("; ")
      });
      continue;
    }

    if (proposed.length >= maxParallel) {
      waiting.push({
        ...candidate,
        conflictRisk: risk.risk,
        conflictReasons: risk.reasons,
        disposition: ButlerBatchIssueDisposition.WAITING_CAPACITY,
        reason: `batch capacity ${maxParallel} is already filled`
      });
      continue;
    }

    proposed.push({
      ...candidate,
      conflictRisk: risk.risk,
      conflictReasons: risk.reasons,
      disposition: ButlerBatchIssueDisposition.PROPOSED,
      reason: "safe to run in the current batch"
    });
  }

  const mergeOrder = buildMergeOrder({ proposed, waiting });
  return {
    ok: true,
    repository: normalizeText(input.repository) || normalizeText(input.githubRuntimeTruth?.repository) || null,
    source: "github_runtime_truth_open_issues",
    maxParallel,
    proposedBatch: proposed,
    waitingQueue: waiting,
    mergeOrder,
    summary: {
      openIssueCount: candidates.length,
      proposedCount: proposed.length,
      waitingCount: waiting.length,
      highConflictWaitingCount: waiting.filter(
        (item) => item.disposition === ButlerBatchIssueDisposition.WAITING_CONFLICT
      ).length
    }
  };
}

export function buildButlerBatchHandoffQueue(input = {}) {
  const plan = input.plan?.ok ? input.plan : buildButlerIssueBatchPlan(input);
  if (!plan.ok) {
    return plan;
  }

  const approved = input.go === true && normalizeText(input.approvalPhrase).toUpperCase().startsWith("GO");
  return {
    ok: true,
    approved,
    blockedByRule: approved ? null : "batch_handoff_requires_human_go",
    reason: approved
      ? "human GO is present for the bounded proposed batch"
      : "Butler may propose the batch, but multiple Codex handoff remains request-only until human GO",
    handoffs: approved
      ? plan.proposedBatch.map((issue) => buildIssueHandoffRequest({ issue, plan, input }))
      : []
  };
}

export function monitorButlerBatchDevelopment(input = {}) {
  const trackedIssues = normalizeTrackedIssues(input.trackedIssues ?? input.plan?.proposedBatch ?? []);
  const progressRecords = normalizeProgressRecords(input.executionProgress ?? []);
  const pullRequests = normalizePullRequests(input.pullRequests ?? []);
  const reviews = normalizeReviews(input.reviews ?? []);
  const checks = normalizeChecks(input.checks ?? []);

  const issues = trackedIssues.map((issue) => {
    const issueNumber = normalizePositiveInteger(issue.issueNumber ?? issue.number);
    const branch = normalizeText(issue.branch) || (issueNumber ? `codex/issue-${issueNumber}` : "");
    const progress = findProgressForIssue({ issueNumber, branch, progressRecords });
    const pullRequest = findPullRequestForIssue({ issueNumber, branch, pullRequests, progress });
    const prReviews = pullRequest ? reviews.filter((review) => review.pullNumber === pullRequest.number) : [];
    const prChecks = pullRequest
      ? checks.filter(
          (check) =>
            check.pullNumber === pullRequest.number ||
            (check.ref && pullRequest.headSha && check.ref === pullRequest.headSha) ||
            (check.ref && branch && check.ref === branch)
        )
      : [];
    const stage = classifyBatchExecutionStage({ progress, pullRequest, reviews: prReviews, checks: prChecks });

    return {
      issueNumber,
      title: normalizeText(issue.title),
      branch: branch || null,
      stage,
      executionId: normalizeText(progress?.executionId) || null,
      pullRequest: pullRequest
        ? {
            number: pullRequest.number,
            state: pullRequest.state,
            draft: pullRequest.draft,
            url: pullRequest.url
          }
        : null,
      blocker: progress?.blocker ?? null,
      evidence: {
        progressStatus: normalizeText(progress?.status) || null,
        reviewStates: prReviews.map((review) => review.state),
        checkConclusions: prChecks.map((check) => check.conclusion ?? check.status).filter(Boolean)
      }
    };
  });

  return {
    ok: true,
    issues,
    summary: {
      queued: countStage(issues, ButlerBatchExecutionStage.QUEUED),
      inProgress: countStage(issues, ButlerBatchExecutionStage.IN_PROGRESS),
      blocked: countStage(issues, ButlerBatchExecutionStage.BLOCKED),
      prCreated: countStage(issues, ButlerBatchExecutionStage.PR_CREATED),
      review: countStage(issues, ButlerBatchExecutionStage.REVIEW),
      mergeReady: countStage(issues, ButlerBatchExecutionStage.MERGE_READY)
    }
  };
}

function enrichIssueForBatchPlanning(issue) {
  const body = normalizeText(issue.body);
  const title = normalizeText(issue.title);
  const searchable = `${title}\n${body}`;
  return {
    issueNumber: normalizePositiveInteger(issue.number ?? issue.issueNumber),
    title,
    labels: normalizeLabels(issue.labels),
    priority: estimatePriority(issue),
    touchedAreas: estimateTouchedAreas(searchable),
    dependencies: estimateDependencies(searchable),
    conflictRisk: ButlerBatchConflictRisk.LOW,
    conflictReasons: [],
    sourceUrl: normalizeText(issue.htmlUrl ?? issue.html_url) || null
  };
}

function estimatePriority(issue) {
  const labels = normalizeLabels(issue.labels).map((label) => label.toLowerCase());
  const title = normalizeText(issue.title);
  let score = 50;
  if (labels.some((label) => /^(p0|priority:critical|critical)$/.test(label))) {
    score += 50;
  } else if (labels.some((label) => /^(p1|priority:high|high)$/.test(label))) {
    score += 35;
  } else if (labels.some((label) => /^(p2|priority:medium|medium)$/.test(label))) {
    score += 20;
  }
  if (/\b(blocker|security|regression|broken)\b/i.test(title)) {
    score += 15;
  }
  if (/\b(feat|feature)\b/i.test(title)) {
    score += 5;
  }
  return score;
}

function estimateTouchedAreas(text) {
  const areas = new Set();
  const explicitPathPattern = /\b(?:src|test|docs|scripts)\/[A-Za-z0-9._/-]+/g;
  for (const match of text.matchAll(explicitPathPattern)) {
    areas.add(match[0].replace(/[),.;:]+$/, ""));
  }
  for (const mapping of AREA_KEYWORDS) {
    if (mapping.pattern.test(text)) {
      for (const area of mapping.areas) {
        areas.add(area);
      }
    }
  }
  return areas.size > 0 ? [...areas].sort() : ["unknown"];
}

function estimateDependencies(text) {
  const dependencies = new Set();
  const dependencyPattern =
    /\b(?:depends on|after|blocked by|requires|must follow|merge after)\s+#([0-9]+)/gi;
  for (const match of text.matchAll(dependencyPattern)) {
    const issueNumber = normalizePositiveInteger(match[1]);
    if (issueNumber) {
      dependencies.add(issueNumber);
    }
  }
  return [...dependencies].sort((left, right) => left - right);
}

function classifyIssueConflictRisk(candidate, selectedOrInFlight) {
  const reasons = [];
  const candidateAreas = new Set(candidate.touchedAreas);
  const broadCore =
    candidateAreas.has("unknown") ||
    candidate.touchedAreas.length >= 5 ||
    candidate.touchedAreas.some((area) => area === "src/core" || area === "src/worker/runtime.js");
  if (broadCore) {
    reasons.push("broad or unknown touched area needs serialization unless no other issue overlaps");
  }

  for (const other of selectedOrInFlight) {
    const otherAreas = new Set(normalizeAreas(other.touchedAreas));
    const overlap = [...candidateAreas].filter((area) => otherAreas.has(area));
    if (overlap.length > 0 || (candidateAreas.has("unknown") && otherAreas.has("unknown"))) {
      reasons.push(
        `overlaps with Issue #${normalizePositiveInteger(other.issueNumber ?? other.number) ?? "unknown"} on ${overlap.join(", ") || "unknown"}`
      );
    }
  }

  if (reasons.some((reason) => reason.startsWith("overlaps with")) && broadCore) {
    return { risk: ButlerBatchConflictRisk.HIGH, reasons };
  }
  if (reasons.some((reason) => reason.startsWith("overlaps with"))) {
    return { risk: ButlerBatchConflictRisk.HIGH, reasons };
  }
  if (broadCore) {
    return { risk: ButlerBatchConflictRisk.MEDIUM, reasons };
  }
  return { risk: ButlerBatchConflictRisk.LOW, reasons };
}

function buildMergeOrder({ proposed, waiting }) {
  const ordered = [...proposed, ...waiting]
    .sort((left, right) => {
      const leftDisposition = dispositionRank(left.disposition);
      const rightDisposition = dispositionRank(right.disposition);
      if (leftDisposition !== rightDisposition) {
        return leftDisposition - rightDisposition;
      }
      return compareIssuePriority(left, right);
    })
    .map((issue, index) => ({
      order: index + 1,
      issueNumber: issue.issueNumber,
      disposition: issue.disposition,
      reason:
        issue.disposition === ButlerBatchIssueDisposition.PROPOSED
          ? "merge after its own PR checks and review pass; earlier low-conflict PRs may merge independently"
          : issue.reason
    }));
  return ordered;
}

function buildIssueHandoffRequest({ issue, plan, input }) {
  return {
    issueNumber: issue.issueNumber,
    branch: `codex/issue-${issue.issueNumber}`,
    baseRef: normalizeText(input.baseRef) || "main",
    codexGoal: "open_pr",
    repository: plan.repository,
    approvalPhrase: normalizeText(input.approvalPhrase),
    handoff: {
      issueTraceable: true,
      approvalScopeMatched: true,
      relatedIssue: issue.issueNumber,
      summary: `Issue #${issue.issueNumber} bounded batch handoff from Butler plan`
    },
    issueTraceability: {
      relatedIssue: issue.issueNumber,
      intentRefs: [`#${issue.issueNumber} Intent`],
      successCriteriaRefs: [`#${issue.issueNumber} Success Criteria`],
      nonGoalRefs: [`#${issue.issueNumber} Non-goals`]
    }
  };
}

function classifyBatchExecutionStage({ progress, pullRequest, reviews, checks }) {
  if (progress?.status === RemoteCodexExecutionStatus.BLOCKED || progress?.blocker) {
    return ButlerBatchExecutionStage.BLOCKED;
  }
  if (pullRequest) {
    if (isMergeReady({ pullRequest, reviews, checks })) {
      return ButlerBatchExecutionStage.MERGE_READY;
    }
    if (reviews.length > 0 || checks.length > 0) {
      return ButlerBatchExecutionStage.REVIEW;
    }
    return ButlerBatchExecutionStage.PR_CREATED;
  }
  if (progress?.status === RemoteCodexExecutionStatus.IN_PROGRESS || progress?.branch) {
    return ButlerBatchExecutionStage.IN_PROGRESS;
  }
  if (progress?.status === RemoteCodexExecutionStatus.QUEUED || progress?.executionId) {
    return ButlerBatchExecutionStage.QUEUED;
  }
  return ButlerBatchExecutionStage.UNKNOWN;
}

function isMergeReady({ pullRequest, reviews, checks }) {
  if (!pullRequest || pullRequest.state !== "open" || pullRequest.draft === true) {
    return false;
  }
  const hasBlockingReview = reviews.some((review) =>
    ["changes_requested", "requested_changes", "blocked"].includes(review.state)
  );
  if (hasBlockingReview) {
    return false;
  }
  const hasApproval = reviews.some((review) => review.state === "approved");
  if (!hasApproval) {
    return false;
  }
  if (checks.length === 0) {
    return false;
  }
  return checks.every((check) => check.status === "completed" && check.conclusion === "success");
}

function findProgressForIssue({ issueNumber, branch, progressRecords }) {
  return (
    progressRecords.find((record) => {
      const recordIssueNumber = normalizePositiveInteger(record.issueNumber);
      return (
        (issueNumber && recordIssueNumber === issueNumber) ||
        (branch && normalizeText(record.branch?.name ?? record.branch) === branch)
      );
    }) ?? null
  );
}

function findPullRequestForIssue({ issueNumber, branch, pullRequests, progress }) {
  const progressPull = normalizeObject(progress?.pullRequest);
  if (Object.keys(progressPull).length > 0) {
    return normalizePullRequest({
      ...progressPull,
      issueNumber: issueNumber ?? progressPull.issueNumber,
      headRef: branch || progressPull.headRef
    });
  }
  return (
    pullRequests.find((pullRequest) => {
      return (
        (issueNumber && pullRequest.issueNumbers.includes(issueNumber)) ||
        (branch && pullRequest.headRef === branch)
      );
    }) ?? null
  );
}

function normalizeOpenIssues(value) {
  const records = Array.isArray(value?.read?.records)
    ? value.read.records
    : Array.isArray(value?.records)
      ? value.records
      : Array.isArray(value)
        ? value
        : [];
  return records.filter((issue) => normalizeText(issue?.state || "open") === "open");
}

function normalizeTrackedIssues(value) {
  return (Array.isArray(value) ? value : []).map((item) => ({
    issueNumber: normalizePositiveInteger(item.issueNumber ?? item.number),
    title: normalizeText(item.title),
    branch: normalizeText(item.branch) || (item.issueNumber || item.number ? `codex/issue-${item.issueNumber ?? item.number}` : ""),
    touchedAreas: normalizeAreas(item.touchedAreas)
  }));
}

function normalizeTrackedIssueNumbers(value) {
  return normalizeTrackedIssues(value).filter((item) => item.issueNumber);
}

function normalizeProgressRecords(value) {
  return (Array.isArray(value) ? value : []).map((record) => ({
    ...record,
    issueNumber: normalizePositiveInteger(record.issueNumber),
    executionId: normalizeText(record.executionId),
    status: normalizeText(record.status),
    branch: record.branch,
    blocker: Object.keys(normalizeObject(record.blocker)).length > 0 ? normalizeObject(record.blocker) : null
  }));
}

function normalizePullRequests(value) {
  return (Array.isArray(value) ? value : []).map(normalizePullRequest).filter(Boolean);
}

function normalizePullRequest(value) {
  const number = normalizePositiveInteger(value?.number ?? value?.pullNumber);
  if (!number) {
    return null;
  }
  const bodyText = `${normalizeText(value.title)}\n${normalizeText(value.body)}`;
  const explicitIssueNumbers = extractIssueNumbers(bodyText);
  const issueNumber = normalizePositiveInteger(value.issueNumber);
  return {
    number,
    state: normalizeText(value.state) || "open",
    draft: value.draft === true,
    url: normalizeText(value.url ?? value.htmlUrl ?? value.html_url) || null,
    headRef: normalizeText(value.headRef ?? value.head?.ref),
    headSha: normalizeText(value.headSha ?? value.head?.sha),
    issueNumbers: issueNumber ? [issueNumber, ...explicitIssueNumbers] : explicitIssueNumbers
  };
}

function normalizeReviews(value) {
  return (Array.isArray(value) ? value : [])
    .map((review) => ({
      pullNumber: normalizePositiveInteger(review.pullNumber),
      state: normalizeText(review.state).toLowerCase()
    }))
    .filter((review) => review.pullNumber && review.state);
}

function normalizeChecks(value) {
  return (Array.isArray(value) ? value : []).map((check) => ({
    pullNumber: normalizePositiveInteger(check.pullNumber),
    ref: normalizeText(check.ref),
    status: normalizeText(check.status) || "completed",
    conclusion: normalizeText(check.conclusion)
  }));
}

function extractIssueNumbers(text) {
  const numbers = new Set();
  for (const match of normalizeText(text).matchAll(/#([0-9]+)/g)) {
    const issueNumber = normalizePositiveInteger(match[1]);
    if (issueNumber) {
      numbers.add(issueNumber);
    }
  }
  return [...numbers];
}

function compareIssuePriority(left, right) {
  if (right.priority !== left.priority) {
    return right.priority - left.priority;
  }
  return (left.issueNumber ?? Number.MAX_SAFE_INTEGER) - (right.issueNumber ?? Number.MAX_SAFE_INTEGER);
}

function dispositionRank(disposition) {
  if (disposition === ButlerBatchIssueDisposition.PROPOSED) {
    return 0;
  }
  if (disposition === ButlerBatchIssueDisposition.WAITING_DEPENDENCY) {
    return 1;
  }
  if (disposition === ButlerBatchIssueDisposition.WAITING_CONFLICT) {
    return 2;
  }
  return 3;
}

function countStage(issues, stage) {
  return issues.filter((issue) => issue.stage === stage).length;
}

function normalizeLabels(value) {
  return (Array.isArray(value) ? value : [])
    .map((label) => normalizeText(label?.name ?? label))
    .filter(Boolean);
}

function normalizeAreas(value) {
  return (Array.isArray(value) ? value : []).map(normalizeText).filter(Boolean);
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
