export const BusinessMissionKind = Object.freeze({
  PRODUCT_LAUNCH: "product_launch",
  CUSTOMER_INQUIRY: "customer_inquiry",
  GROWTH: "growth",
  OPERATIONS: "operations"
});

export const BusinessMissionStatus = Object.freeze({
  PROPOSED: "proposed",
  ACTIVE: "active",
  BLOCKED: "blocked",
  COMPLETED: "completed",
  CANCELLED: "cancelled"
});

export const BusinessWorkstreamStatus = Object.freeze({
  PENDING: "pending",
  READY: "ready",
  RUNNING: "running",
  BLOCKED: "blocked",
  COMPLETED: "completed",
  SKIPPED: "skipped"
});

export const BusinessWorkstreamRole = Object.freeze({
  PRODUCT: "product",
  RESEARCH: "research",
  DEVELOPMENT: "development",
  QA: "qa",
  PERFORMANCE: "performance",
  RELEASE: "release",
  CUSTOMER_SUPPORT: "customer_support",
  MARKETING: "marketing",
  ANALYTICS: "analytics",
  IMPROVEMENT: "improvement"
});

export const BusinessAuthorityClass = Object.freeze({
  MISSION_SCOPED_AUTO: "mission_scoped_auto",
  OWNER_GO: "owner_go",
  OWNER_PASSKEY: "owner_passkey",
  FORBIDDEN: "forbidden"
});

export const BusinessActionType = Object.freeze({
  READ: "read",
  ANALYZE: "analyze",
  PLAN: "plan",
  DRAFT: "draft",
  CODE: "code",
  TEST: "test",
  BENCHMARK: "benchmark",
  PR_CREATE: "pr_create",
  MERGE: "merge",
  EXTERNAL_SEND: "external_send",
  EXTERNAL_PUBLISH: "external_publish",
  RELEASE_SUBMIT: "release_submit",
  DEPLOY: "deploy",
  SPEND: "spend",
  CONTRACT: "contract",
  CREDENTIAL_MUTATION: "credential_mutation",
  PERMISSION_MUTATION: "permission_mutation",
  DESTRUCTIVE: "destructive"
});

const WORKER_REGISTRY = Object.freeze({
  [BusinessWorkstreamRole.PRODUCT]: Object.freeze({
    role: BusinessWorkstreamRole.PRODUCT,
    purpose: "owner goal を product requirement / acceptance criteria / release intent に変換する",
    inputs: Object.freeze(["owner_goal", "research", "runtime_truth"]),
    outputs: Object.freeze(["product_brief", "acceptance_criteria", "priority"])
  }),
  [BusinessWorkstreamRole.RESEARCH]: Object.freeze({
    role: BusinessWorkstreamRole.RESEARCH,
    purpose: "市場・競合・技術・既存資産・制約を読み、Mission の判断材料を作る",
    inputs: Object.freeze(["owner_goal", "target", "known_context"]),
    outputs: Object.freeze(["findings", "risks", "options"])
  }),
  [BusinessWorkstreamRole.DEVELOPMENT]: Object.freeze({
    role: BusinessWorkstreamRole.DEVELOPMENT,
    purpose: "承認済み Mission scope を実装し、test / PR evidence まで進める",
    inputs: Object.freeze(["product_brief", "acceptance_criteria", "repository_truth"]),
    outputs: Object.freeze(["branch", "implementation", "tests", "pull_request"])
  }),
  [BusinessWorkstreamRole.QA]: Object.freeze({
    role: BusinessWorkstreamRole.QA,
    purpose: "acceptance criteria と runtime behavior を検証し、regression / blocker を返す",
    inputs: Object.freeze(["implementation", "acceptance_criteria"]),
    outputs: Object.freeze(["verification", "defects", "release_readiness"])
  }),
  [BusinessWorkstreamRole.PERFORMANCE]: Object.freeze({
    role: BusinessWorkstreamRole.PERFORMANCE,
    purpose: "起動時間・CPU・memory・latency・描画・通信等を計測し、改善を反復する",
    inputs: Object.freeze(["implementation", "benchmarks", "telemetry"]),
    outputs: Object.freeze(["baseline", "bottlenecks", "optimization_result"])
  }),
  [BusinessWorkstreamRole.RELEASE]: Object.freeze({
    role: BusinessWorkstreamRole.RELEASE,
    purpose: "release artifact / store metadata / submission checklist を準備し authority boundary で停止する",
    inputs: Object.freeze(["release_readiness", "product_brief", "store_requirements"]),
    outputs: Object.freeze(["release_candidate", "submission_draft", "owner_action"])
  }),
  [BusinessWorkstreamRole.CUSTOMER_SUPPORT]: Object.freeze({
    role: BusinessWorkstreamRole.CUSTOMER_SUPPORT,
    purpose: "問い合わせを dedupe / classify / context resolve し、返信・follow-up・記録を進める",
    inputs: Object.freeze(["inquiry_event", "customer_context", "communication_history"]),
    outputs: Object.freeze(["classification", "reply_draft", "follow_up", "support_log"])
  }),
  [BusinessWorkstreamRole.MARKETING]: Object.freeze({
    role: BusinessWorkstreamRole.MARKETING,
    purpose: "positioning / LP / SEO / ad creative / campaign plan を作り、支出・公開境界で停止する",
    inputs: Object.freeze(["product_brief", "research", "analytics"]),
    outputs: Object.freeze(["campaign_plan", "creative_draft", "landing_page_plan"])
  }),
  [BusinessWorkstreamRole.ANALYTICS]: Object.freeze({
    role: BusinessWorkstreamRole.ANALYTICS,
    purpose: "Mission KPI / funnel / support / runtime truth を観測して次の判断材料を作る",
    inputs: Object.freeze(["success_metrics", "runtime_truth", "business_metrics"]),
    outputs: Object.freeze(["metric_snapshot", "gap_analysis", "signals"])
  }),
  [BusinessWorkstreamRole.IMPROVEMENT]: Object.freeze({
    role: BusinessWorkstreamRole.IMPROVEMENT,
    purpose: "観測結果から product と VTDD 自身の改善 Proposal を作る",
    inputs: Object.freeze(["metric_snapshot", "defects", "latency", "manual_work"]),
    outputs: Object.freeze(["improvement_proposals", "automation_candidates"])
  })
});

const ACTION_AUTHORITY = Object.freeze({
  [BusinessActionType.READ]: BusinessAuthorityClass.MISSION_SCOPED_AUTO,
  [BusinessActionType.ANALYZE]: BusinessAuthorityClass.MISSION_SCOPED_AUTO,
  [BusinessActionType.PLAN]: BusinessAuthorityClass.MISSION_SCOPED_AUTO,
  [BusinessActionType.DRAFT]: BusinessAuthorityClass.MISSION_SCOPED_AUTO,
  [BusinessActionType.CODE]: BusinessAuthorityClass.MISSION_SCOPED_AUTO,
  [BusinessActionType.TEST]: BusinessAuthorityClass.MISSION_SCOPED_AUTO,
  [BusinessActionType.BENCHMARK]: BusinessAuthorityClass.MISSION_SCOPED_AUTO,
  [BusinessActionType.PR_CREATE]: BusinessAuthorityClass.MISSION_SCOPED_AUTO,
  [BusinessActionType.MERGE]: BusinessAuthorityClass.OWNER_GO,
  [BusinessActionType.EXTERNAL_SEND]: BusinessAuthorityClass.OWNER_GO,
  [BusinessActionType.EXTERNAL_PUBLISH]: BusinessAuthorityClass.OWNER_GO,
  [BusinessActionType.RELEASE_SUBMIT]: BusinessAuthorityClass.OWNER_GO,
  [BusinessActionType.DEPLOY]: BusinessAuthorityClass.OWNER_PASSKEY,
  [BusinessActionType.SPEND]: BusinessAuthorityClass.OWNER_PASSKEY,
  [BusinessActionType.CONTRACT]: BusinessAuthorityClass.OWNER_PASSKEY,
  [BusinessActionType.CREDENTIAL_MUTATION]: BusinessAuthorityClass.OWNER_PASSKEY,
  [BusinessActionType.PERMISSION_MUTATION]: BusinessAuthorityClass.OWNER_PASSKEY,
  [BusinessActionType.DESTRUCTIVE]: BusinessAuthorityClass.OWNER_PASSKEY
});

const PLAN_TEMPLATES = Object.freeze({
  [BusinessMissionKind.PRODUCT_LAUNCH]: Object.freeze([
    BusinessWorkstreamRole.RESEARCH,
    BusinessWorkstreamRole.PRODUCT,
    BusinessWorkstreamRole.DEVELOPMENT,
    BusinessWorkstreamRole.QA,
    BusinessWorkstreamRole.PERFORMANCE,
    BusinessWorkstreamRole.RELEASE,
    BusinessWorkstreamRole.MARKETING,
    BusinessWorkstreamRole.ANALYTICS,
    BusinessWorkstreamRole.IMPROVEMENT
  ]),
  [BusinessMissionKind.CUSTOMER_INQUIRY]: Object.freeze([
    BusinessWorkstreamRole.CUSTOMER_SUPPORT,
    BusinessWorkstreamRole.ANALYTICS,
    BusinessWorkstreamRole.IMPROVEMENT
  ]),
  [BusinessMissionKind.GROWTH]: Object.freeze([
    BusinessWorkstreamRole.RESEARCH,
    BusinessWorkstreamRole.MARKETING,
    BusinessWorkstreamRole.ANALYTICS,
    BusinessWorkstreamRole.IMPROVEMENT
  ]),
  [BusinessMissionKind.OPERATIONS]: Object.freeze([
    BusinessWorkstreamRole.RESEARCH,
    BusinessWorkstreamRole.DEVELOPMENT,
    BusinessWorkstreamRole.QA,
    BusinessWorkstreamRole.PERFORMANCE,
    BusinessWorkstreamRole.ANALYTICS,
    BusinessWorkstreamRole.IMPROVEMENT
  ])
});

export function getBusinessWorkerRegistry() {
  return Object.values(WORKER_REGISTRY).map((entry) => ({
    ...entry,
    inputs: [...entry.inputs],
    outputs: [...entry.outputs]
  }));
}

export function classifyBusinessActionAuthority(actionType) {
  const normalized = normalizeString(actionType);
  return ACTION_AUTHORITY[normalized] ?? BusinessAuthorityClass.FORBIDDEN;
}

export function inferBusinessMissionKind(ownerGoal) {
  const goal = normalizeText(ownerGoal).toLowerCase();
  if (!goal) {
    throw new TypeError("ownerGoal is required");
  }

  if (matchesAny(goal, [
    "問い合わせ",
    "問合せ",
    "customer inquiry",
    "customer support",
    "support request",
    "返信"
  ])) {
    return BusinessMissionKind.CUSTOMER_INQUIRY;
  }

  if (matchesAny(goal, [
    "広告",
    "マーケ",
    "marketing",
    "growth",
    "集客",
    "売上を伸",
    "ユーザーを増",
    "cv",
    "conversion"
  ])) {
    return BusinessMissionKind.GROWTH;
  }

  if (matchesAny(goal, [
    "アプリ",
    "app",
    "app store",
    "リリース",
    "release",
    "売れる状態",
    "作り上げ",
    "形にして",
    "tomio"
  ])) {
    return BusinessMissionKind.PRODUCT_LAUNCH;
  }

  return BusinessMissionKind.OPERATIONS;
}

export function createBusinessMission(input = {}) {
  const missionId = normalizeString(input.missionId);
  const ownerGoal = normalizeText(input.ownerGoal);

  if (!missionId) {
    throw new TypeError("missionId is required");
  }
  if (!ownerGoal) {
    throw new TypeError("ownerGoal is required");
  }

  const explicitKind = normalizeString(input.kind);
  const kind = explicitKind || inferBusinessMissionKind(ownerGoal);
  assertMissionKind(kind);

  const status = input.accepted === true
    ? BusinessMissionStatus.ACTIVE
    : BusinessMissionStatus.PROPOSED;

  const mission = {
    missionId,
    ownerGoal,
    target: normalizeNullableText(input.target),
    kind,
    status,
    successMetrics: normalizeTextArray(input.successMetrics),
    constraints: normalizeTextArray(input.constraints),
    budgetBoundary: normalizeBudgetBoundary(input.budgetBoundary),
    source: normalizeNullableString(input.source) ?? "butler",
    createdAt: normalizeNullableText(input.createdAt),
    acceptedAt: input.accepted === true ? normalizeNullableText(input.acceptedAt) : null,
    workstreams: []
  };

  return {
    ...mission,
    workstreams: planBusinessMissionWorkstreams(mission)
  };
}

export function planBusinessMissionWorkstreams(mission) {
  const missionId = normalizeString(mission?.missionId);
  const kind = normalizeString(mission?.kind);

  if (!missionId) {
    throw new TypeError("mission.missionId is required");
  }
  assertMissionKind(kind);

  const roles = PLAN_TEMPLATES[kind];
  return roles.map((role, index) => {
    const worker = WORKER_REGISTRY[role];
    const workstreamId = `${missionId}:ws:${String(index + 1).padStart(2, "0")}:${role}`;
    const priorRole = index > 0 ? roles[index - 1] : null;
    const priorId = priorRole
      ? `${missionId}:ws:${String(index).padStart(2, "0")}:${priorRole}`
      : null;

    return {
      workstreamId,
      role,
      purpose: worker.purpose,
      dependsOn: priorId ? [priorId] : [],
      defaultActionClass: BusinessAuthorityClass.MISSION_SCOPED_AUTO,
      status: index === 0
        ? BusinessWorkstreamStatus.READY
        : BusinessWorkstreamStatus.PENDING
    };
  });
}

export function canMissionAutoContinueAction({ mission, actionType } = {}) {
  if (mission?.status !== BusinessMissionStatus.ACTIVE) {
    return false;
  }
  return classifyBusinessActionAuthority(actionType) === BusinessAuthorityClass.MISSION_SCOPED_AUTO;
}

export function getReadyBusinessWorkstreams(mission) {
  const workstreams = Array.isArray(mission?.workstreams) ? mission.workstreams : [];
  const completed = new Set(
    workstreams
      .filter((item) => item?.status === BusinessWorkstreamStatus.COMPLETED || item?.status === BusinessWorkstreamStatus.SKIPPED)
      .map((item) => item.workstreamId)
  );

  return workstreams.filter((item) => {
    if (![BusinessWorkstreamStatus.READY, BusinessWorkstreamStatus.PENDING].includes(item?.status)) {
      return false;
    }
    const dependencies = Array.isArray(item.dependsOn) ? item.dependsOn : [];
    return dependencies.every((dependency) => completed.has(dependency));
  });
}

export function applyBusinessWorkstreamResult(mission, result = {}) {
  const workstreamId = normalizeString(result.workstreamId);
  const nextStatus = normalizeString(result.status);

  if (!workstreamId) {
    throw new TypeError("result.workstreamId is required");
  }
  if (!Object.values(BusinessWorkstreamStatus).includes(nextStatus)) {
    throw new TypeError(`unsupported workstream status: ${nextStatus || "<empty>"}`);
  }

  const workstreams = Array.isArray(mission?.workstreams) ? mission.workstreams : [];
  let found = false;
  const updated = workstreams.map((item) => {
    if (item?.workstreamId !== workstreamId) {
      return cloneWorkstream(item);
    }
    found = true;
    return {
      ...cloneWorkstream(item),
      status: nextStatus,
      outcome: normalizeNullableText(result.outcome),
      blocker: normalizeNullableText(result.blocker),
      requiredAction: normalizeNullableText(result.requiredAction)
    };
  });

  if (!found) {
    throw new TypeError(`unknown workstreamId: ${workstreamId}`);
  }

  const completed = new Set(
    updated
      .filter((item) => [BusinessWorkstreamStatus.COMPLETED, BusinessWorkstreamStatus.SKIPPED].includes(item.status))
      .map((item) => item.workstreamId)
  );

  const withReadiness = updated.map((item) => {
    if (item.status !== BusinessWorkstreamStatus.PENDING) {
      return item;
    }
    const dependencies = Array.isArray(item.dependsOn) ? item.dependsOn : [];
    return dependencies.every((dependency) => completed.has(dependency))
      ? { ...item, status: BusinessWorkstreamStatus.READY }
      : item;
  });

  const status = deriveMissionStatus(mission?.status, withReadiness);
  return {
    ...mission,
    status,
    workstreams: withReadiness
  };
}

export function buildBusinessMissionOwnerSummary(mission) {
  const workstreams = Array.isArray(mission?.workstreams) ? mission.workstreams : [];
  const ready = getReadyBusinessWorkstreams(mission);
  const blocked = workstreams.filter((item) => item?.status === BusinessWorkstreamStatus.BLOCKED);
  const running = workstreams.filter((item) => item?.status === BusinessWorkstreamStatus.RUNNING);
  const completed = workstreams.filter((item) => item?.status === BusinessWorkstreamStatus.COMPLETED);

  const ownerActions = blocked
    .filter((item) => normalizeNullableText(item.requiredAction))
    .map((item) => ({
      workstreamId: item.workstreamId,
      role: item.role,
      requiredAction: item.requiredAction,
      blocker: item.blocker ?? null
    }));

  return {
    missionId: mission?.missionId ?? null,
    ownerGoal: mission?.ownerGoal ?? null,
    kind: mission?.kind ?? null,
    status: mission?.status ?? null,
    progress: {
      completed: completed.length,
      total: workstreams.length
    },
    running: running.map(pickOwnerFacingWorkstream),
    nextAutomaticWork: mission?.status === BusinessMissionStatus.ACTIVE
      ? ready.map(pickOwnerFacingWorkstream)
      : [],
    ownerActions,
    blockers: blocked
      .filter((item) => !normalizeNullableText(item.requiredAction))
      .map(pickOwnerFacingWorkstream)
  };
}

export function buildBusinessImprovementProposal({ mission, observation } = {}) {
  const summary = normalizeText(observation?.summary);
  if (!summary) {
    throw new TypeError("observation.summary is required");
  }

  const severity = normalizeString(observation?.severity) || "normal";
  const source = normalizeString(observation?.source) || "analytics";
  const proposalId = normalizeString(observation?.proposalId)
    || `${normalizeString(mission?.missionId) || "mission"}:improvement:${slugify(summary).slice(0, 48) || "candidate"}`;

  return {
    proposalId,
    missionId: mission?.missionId ?? null,
    source,
    severity,
    summary,
    evidence: normalizeTextArray(observation?.evidence),
    proposedRole: BusinessWorkstreamRole.IMPROVEMENT,
    authority: BusinessAuthorityClass.MISSION_SCOPED_AUTO,
    status: "proposal"
  };
}

function deriveMissionStatus(previousStatus, workstreams) {
  if (previousStatus === BusinessMissionStatus.CANCELLED) {
    return previousStatus;
  }
  if (workstreams.length > 0 && workstreams.every((item) => [
    BusinessWorkstreamStatus.COMPLETED,
    BusinessWorkstreamStatus.SKIPPED
  ].includes(item.status))) {
    return BusinessMissionStatus.COMPLETED;
  }
  if (workstreams.some((item) => item.status === BusinessWorkstreamStatus.BLOCKED)) {
    return BusinessMissionStatus.BLOCKED;
  }
  return previousStatus === BusinessMissionStatus.PROPOSED
    ? BusinessMissionStatus.PROPOSED
    : BusinessMissionStatus.ACTIVE;
}

function pickOwnerFacingWorkstream(item) {
  return {
    workstreamId: item.workstreamId,
    role: item.role,
    purpose: item.purpose,
    blocker: item.blocker ?? null
  };
}

function cloneWorkstream(item) {
  return {
    ...item,
    dependsOn: Array.isArray(item?.dependsOn) ? [...item.dependsOn] : []
  };
}

function assertMissionKind(kind) {
  if (!Object.values(BusinessMissionKind).includes(kind)) {
    throw new TypeError(`unsupported mission kind: ${kind || "<empty>"}`);
  }
}

function normalizeBudgetBoundary(value) {
  if (value == null) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("budgetBoundary must be an object or null");
  }

  const currency = normalizeNullableString(value.currency);
  const perDay = normalizeFiniteNumber(value.perDay);
  const perMonth = normalizeFiniteNumber(value.perMonth);

  return {
    currency,
    perDay,
    perMonth
  };
}

function normalizeFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new TypeError("budget values must be finite non-negative numbers");
  }
  return numeric;
}

function normalizeTextArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeNullableString(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeString(value) {
  return normalizeText(value).toLowerCase();
}

function matchesAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function slugify(value) {
  return normalizeString(value)
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
