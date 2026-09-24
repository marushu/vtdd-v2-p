import test from "node:test";
import assert from "node:assert/strict";
import {
  BusinessActionType,
  BusinessAuthorityClass,
  BusinessMissionKind,
  BusinessMissionStatus,
  BusinessWorkstreamRole,
  BusinessWorkstreamStatus,
  applyBusinessWorkstreamResult,
  buildBusinessImprovementProposal,
  buildBusinessMissionOwnerSummary,
  canMissionAutoContinueAction,
  classifyBusinessActionAuthority,
  createBusinessMission,
  getBusinessWorkerRegistry,
  getReadyBusinessWorkstreams,
  inferBusinessMissionKind,
  shouldAttachBusinessMissionToOwnerGoal,
  shouldStartBusinessMissionFromOwnerGoal,
  shouldSupersedeBusinessMission
} from "../src/core/business-mission-orchestrator.js";

test("strong business goal starts a Mission but ordinary questions do not", () => {
  assert.equal(
    shouldStartBusinessMissionFromOwnerGoal("TOMIO を売れる状態まで持っていって"),
    true
  );
  assert.equal(
    shouldStartBusinessMissionFromOwnerGoal("hibou の問い合わせを一つも漏らさず全部処理して"),
    true
  );
  assert.equal(
    shouldStartBusinessMissionFromOwnerGoal("Web広告を回してユーザーを増やして"),
    true
  );
  assert.equal(
    shouldStartBusinessMissionFromOwnerGoal("今日は何月何日？"),
    false
  );
  assert.equal(
    shouldStartBusinessMissionFromOwnerGoal("PR #756 の状況を確認して"),
    false
  );
  assert.equal(
    shouldStartBusinessMissionFromOwnerGoal("TOMIO の設計どう思う？"),
    false
  );
});

test("active Mission only attaches to related follow-up and supersedes on a distinct strong goal", () => {
  const mission = createBusinessMission({
    missionId: "mission-tomio-attach-001",
    ownerGoal: "TOMIO を売れる状態まで持っていって",
    accepted: true
  });

  assert.equal(
    shouldAttachBusinessMissionToOwnerGoal({
      mission,
      ownerGoal: "今どこまで進んだ？"
    }),
    true
  );
  assert.equal(
    shouldAttachBusinessMissionToOwnerGoal({
      mission,
      ownerGoal: "今日は何月何日？"
    }),
    false
  );
  assert.equal(
    shouldSupersedeBusinessMission({
      mission,
      ownerGoal: "hibou の問い合わせを一つも漏らさず全部処理して"
    }),
    true
  );
  assert.equal(
    shouldSupersedeBusinessMission({
      mission,
      ownerGoal: "TOMIO のアプリを改善して"
    }),
    false
  );
});

test("TOMIO owner goal becomes a product launch mission", () => {
  assert.equal(
    inferBusinessMissionKind("TOMIO を売れる状態まで持っていって"),
    BusinessMissionKind.PRODUCT_LAUNCH
  );

  const mission = createBusinessMission({
    missionId: "mission-tomio-001",
    ownerGoal: "TOMIO を売れる状態まで持っていって",
    target: "TOMIO",
    accepted: true,
    successMetrics: ["App Store release ready", "first paying users"]
  });

  assert.equal(mission.status, BusinessMissionStatus.ACTIVE);
  assert.equal(mission.kind, BusinessMissionKind.PRODUCT_LAUNCH);
  assert.equal(mission.ownerGoal, "TOMIO を売れる状態まで持っていって");
  assert.equal(mission.target, "TOMIO");
  assert.deepEqual(
    mission.workstreams.map((item) => item.role),
    [
      BusinessWorkstreamRole.RESEARCH,
      BusinessWorkstreamRole.PRODUCT,
      BusinessWorkstreamRole.DEVELOPMENT,
      BusinessWorkstreamRole.QA,
      BusinessWorkstreamRole.PERFORMANCE,
      BusinessWorkstreamRole.RELEASE,
      BusinessWorkstreamRole.MARKETING,
      BusinessWorkstreamRole.ANALYTICS,
      BusinessWorkstreamRole.IMPROVEMENT
    ]
  );
  assert.equal(mission.workstreams[0].status, BusinessWorkstreamStatus.READY);
  assert.equal(mission.workstreams[1].status, BusinessWorkstreamStatus.PENDING);
});

test("hibou inquiry owner goal becomes customer support mission", () => {
  const mission = createBusinessMission({
    missionId: "mission-hibou-inquiry-001",
    ownerGoal: "hibou サイトに来た問い合わせを一つも漏らさず処理して",
    accepted: true
  });

  assert.equal(mission.kind, BusinessMissionKind.CUSTOMER_INQUIRY);
  assert.deepEqual(
    mission.workstreams.map((item) => item.role),
    [
      BusinessWorkstreamRole.CUSTOMER_SUPPORT,
      BusinessWorkstreamRole.ANALYTICS,
      BusinessWorkstreamRole.IMPROVEMENT
    ]
  );
});

test("marketing goal is classified as growth before generic operations", () => {
  assert.equal(
    inferBusinessMissionKind("Web広告とマーケティングでユーザーを増やしたい"),
    BusinessMissionKind.GROWTH
  );
});

test("role registry exposes responsibilities without standing credentials", () => {
  const registry = getBusinessWorkerRegistry();
  assert.equal(registry.length, 10);
  assert.equal(registry.some((item) => item.role === BusinessWorkstreamRole.DEVELOPMENT), true);
  assert.equal(registry.some((item) => item.role === BusinessWorkstreamRole.MARKETING), true);
  assert.equal("credential" in registry[0], false);
  assert.equal("token" in registry[0], false);
});

test("reversible work is mission-scoped auto after mission acceptance", () => {
  const mission = createBusinessMission({
    missionId: "mission-auto-001",
    ownerGoal: "アプリを作り上げて",
    accepted: true
  });

  assert.equal(
    classifyBusinessActionAuthority(BusinessActionType.CODE),
    BusinessAuthorityClass.MISSION_SCOPED_AUTO
  );
  assert.equal(
    classifyBusinessActionAuthority(BusinessActionType.TEST),
    BusinessAuthorityClass.MISSION_SCOPED_AUTO
  );
  assert.equal(
    classifyBusinessActionAuthority(BusinessActionType.PR_CREATE),
    BusinessAuthorityClass.MISSION_SCOPED_AUTO
  );
  assert.equal(
    canMissionAutoContinueAction({ mission, actionType: BusinessActionType.CODE }),
    true
  );
});

test("proposed mission cannot auto continue reversible execution yet", () => {
  const mission = createBusinessMission({
    missionId: "mission-proposed-001",
    ownerGoal: "アプリを作り上げて"
  });

  assert.equal(mission.status, BusinessMissionStatus.PROPOSED);
  assert.equal(
    canMissionAutoContinueAction({ mission, actionType: BusinessActionType.CODE }),
    false
  );
});

test("external side effects preserve owner GO and passkey boundaries", () => {
  assert.equal(
    classifyBusinessActionAuthority(BusinessActionType.MERGE),
    BusinessAuthorityClass.OWNER_GO
  );
  assert.equal(
    classifyBusinessActionAuthority(BusinessActionType.EXTERNAL_SEND),
    BusinessAuthorityClass.OWNER_GO
  );
  assert.equal(
    classifyBusinessActionAuthority(BusinessActionType.RELEASE_SUBMIT),
    BusinessAuthorityClass.OWNER_GO
  );
  assert.equal(
    classifyBusinessActionAuthority(BusinessActionType.DEPLOY),
    BusinessAuthorityClass.OWNER_PASSKEY
  );
  assert.equal(
    classifyBusinessActionAuthority(BusinessActionType.SPEND),
    BusinessAuthorityClass.OWNER_PASSKEY
  );
  assert.equal(
    classifyBusinessActionAuthority(BusinessActionType.CREDENTIAL_MUTATION),
    BusinessAuthorityClass.OWNER_PASSKEY
  );
  assert.equal(
    classifyBusinessActionAuthority("unknown_action"),
    BusinessAuthorityClass.FORBIDDEN
  );
});

test("completed workstream unlocks its dependent workstream", () => {
  let mission = createBusinessMission({
    missionId: "mission-chain-001",
    ownerGoal: "TOMIO を売れる状態まで持っていって",
    accepted: true
  });

  const first = mission.workstreams[0];
  assert.deepEqual(getReadyBusinessWorkstreams(mission).map((item) => item.workstreamId), [
    first.workstreamId
  ]);

  mission = applyBusinessWorkstreamResult(mission, {
    workstreamId: first.workstreamId,
    status: BusinessWorkstreamStatus.COMPLETED,
    outcome: "research complete",
    evidence: ["docs/research.md"],
    resultSource: "dashboard_app_server_bridge",
    reconciledAt: "2026-09-23T11:30:00Z"
  });

  assert.deepEqual(mission.workstreams[0].evidence, ["docs/research.md"]);
  assert.equal(mission.workstreams[0].resultSource, "dashboard_app_server_bridge");
  assert.equal(mission.workstreams[0].reconciledAt, "2026-09-23T11:30:00Z");
  assert.equal(mission.workstreams[1].status, BusinessWorkstreamStatus.READY);
  assert.deepEqual(getReadyBusinessWorkstreams(mission).map((item) => item.workstreamId), [
    mission.workstreams[1].workstreamId
  ]);
});

test("blocked workstream produces an owner-facing action without agent chatter", () => {
  let mission = createBusinessMission({
    missionId: "mission-release-001",
    ownerGoal: "TOMIO を App Store に出して売って",
    accepted: true
  });

  const release = mission.workstreams.find((item) => item.role === BusinessWorkstreamRole.RELEASE);
  mission = applyBusinessWorkstreamResult(mission, {
    workstreamId: release.workstreamId,
    status: BusinessWorkstreamStatus.BLOCKED,
    blocker: "App Store submission requires owner confirmation",
    requiredAction: "GO release submission"
  });

  const summary = buildBusinessMissionOwnerSummary(mission);
  assert.equal(summary.status, BusinessMissionStatus.BLOCKED);
  assert.equal(summary.ownerActions.length, 1);
  assert.equal(summary.ownerActions[0].role, BusinessWorkstreamRole.RELEASE);
  assert.equal("prompt" in summary.ownerActions[0], false);
  assert.equal("agentTranscript" in summary, false);
});

test("all completed workstreams complete the mission", () => {
  let mission = createBusinessMission({
    missionId: "mission-complete-001",
    ownerGoal: "hibou の問い合わせを全部処理して",
    accepted: true
  });

  for (const item of [...mission.workstreams]) {
    mission = applyBusinessWorkstreamResult(mission, {
      workstreamId: item.workstreamId,
      status: BusinessWorkstreamStatus.COMPLETED
    });
  }

  assert.equal(mission.status, BusinessMissionStatus.COMPLETED);
});

test("improvement proposal stays a proposal and remains mission-scoped", () => {
  const mission = createBusinessMission({
    missionId: "mission-improve-001",
    ownerGoal: "TOMIO を売れる状態まで持っていって",
    accepted: true
  });

  const proposal = buildBusinessImprovementProposal({
    mission,
    observation: {
      summary: "手動で同じ問い合わせ分類を繰り返している",
      source: "customer_support",
      severity: "high",
      evidence: ["same classification repeated 8 times"]
    }
  });

  assert.equal(proposal.missionId, mission.missionId);
  assert.equal(proposal.proposedRole, BusinessWorkstreamRole.IMPROVEMENT);
  assert.equal(proposal.authority, BusinessAuthorityClass.MISSION_SCOPED_AUTO);
  assert.equal(proposal.status, "proposal");
});

test("budget boundary rejects negative values", () => {
  assert.throws(
    () => createBusinessMission({
      missionId: "mission-budget-001",
      ownerGoal: "広告を回して",
      budgetBoundary: {
        currency: "JPY",
        perDay: -1
      }
    }),
    /finite non-negative/
  );
});
