export const DASHBOARD_APP_SERVER_USAGE_PROFILES = Object.freeze({
  conversation: Object.freeze({
    profile: "conversation",
    reasoningEffort: "low",
    reason: "ordinary_conversation"
  }),
  status_read: Object.freeze({
    profile: "status_read",
    reasoningEffort: "low",
    reason: "status_or_read_request"
  }),
  development: Object.freeze({
    profile: "development",
    reasoningEffort: "medium",
    reason: "implementation_or_repository_work"
  }),
  long_development: Object.freeze({
    profile: "long_development",
    reasoningEffort: "high",
    reason: "long_running_development_or_e2e"
  })
});

const PROFILE_ORDER = ["conversation", "status_read", "development", "long_development"];

const LONG_DEVELOPMENT_PATTERNS = [
  /長時間/,
  /最後まで/,
  /一塊/,
  /まとめて/,
  /全部/,
  /全て/,
  /すべて/,
  /一度に/,
  /刻みすぎ/,
  /E2E/i,
  /end[- ]?to[- ]?end/i,
  /deploy.*追/i,
  /デプロイ.*追/,
  /production deploy/i,
  /リスタートまで/,
  /restart.*deploy/i,
  /完了まで/,
  /close.*Issue/i
];

const DEVELOPMENT_PATTERNS = [
  /実装/,
  /修正/,
  /改修/,
  /開発/,
  /作成/,
  /作って/,
  /開いて/,
  /テスト/,
  /\btest\b/i,
  /pull request/i,
  /ブランチ/,
  /branch/i,
  /commit/i,
  /コミット/,
  /merge/i,
  /マージ/,
  /deploy/i,
  /デプロイ/,
  /レビュー/,
  /review/i,
  /runner/i,
  /bridge/i,
  /VPS/i,
  /Codex CLI/i,
  /worker/i,
  /schema/i,
  /Action Schema/i,
  /コード/,
  /ファイル/,
  /ビルド/,
  /build/i,
  /verify/i
];

const STATUS_READ_PATTERNS = [
  /確認/,
  /見て/,
  /読んで/,
  /状況/,
  /状態/,
  /最新/,
  /マージ済み/,
  /デプロイ完了/,
  /どのブランチ/,
  /戻せる/,
  /ログ/,
  /truth/i,
  /status/i,
  /\bPR\s*#?\d+\b/i,
  /\bIssue\s*#?\d+\b/i
];

function normalizeUsageText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function normalizeDashboardAppServerUsageProfile(profileLike = null, fallbackProfile = "conversation") {
  const input = profileLike && typeof profileLike === "object" ? profileLike : { profile: profileLike };
  const requestedProfile = normalizeUsageText(input.profile || input.name || fallbackProfile);
  const profile = PROFILE_ORDER.includes(requestedProfile) ? requestedProfile : fallbackProfile;
  const defaults = DASHBOARD_APP_SERVER_USAGE_PROFILES[profile] || DASHBOARD_APP_SERVER_USAGE_PROFILES.conversation;
  const reasoningEffort = normalizeUsageText(input.reasoningEffort || input.reasoning_effort || defaults.reasoningEffort);
  const model = normalizeUsageText(input.model || "");
  return {
    profile,
    reasoningEffort,
    selectedBy: normalizeUsageText(input.selectedBy || input.selected_by || "content"),
    reason: normalizeUsageText(input.reason || defaults.reason),
    ...(model ? { model } : {})
  };
}

export function classifyDashboardAppServerUsageProfile({
  text = "",
  repository = "",
  relatedIssue = "",
  mediaReferences = []
} = {}) {
  const normalizedText = normalizeUsageText(text);
  const hasRepositoryContext = Boolean(normalizeUsageText(repository));
  const hasIssueContext = Boolean(normalizeUsageText(relatedIssue));
  const hasMedia = Array.isArray(mediaReferences) && mediaReferences.length > 0;
  if (hasMedia || matchesAny(normalizedText, LONG_DEVELOPMENT_PATTERNS)) {
    return normalizeDashboardAppServerUsageProfile({
      profile: "long_development",
      reason: hasMedia ? "media_or_attachment_requires_full_context" : "long_running_development_or_e2e"
    });
  }
  if (matchesAny(normalizedText, DEVELOPMENT_PATTERNS)) {
    return normalizeDashboardAppServerUsageProfile({
      profile: "development",
      reason: "implementation_or_repository_work"
    });
  }
  if (hasRepositoryContext || hasIssueContext || matchesAny(normalizedText, STATUS_READ_PATTERNS)) {
    return normalizeDashboardAppServerUsageProfile({
      profile: "status_read",
      reason: "status_or_read_request"
    });
  }
  return normalizeDashboardAppServerUsageProfile({
    profile: "conversation",
    reason: "ordinary_conversation"
  });
}

export function buildDashboardAppServerUsageCostBoundary(profileLike = null) {
  const usageProfile = normalizeDashboardAppServerUsageProfile(profileLike);
  return {
    profile: usageProfile.profile,
    codexWillStart: true,
    appServerBridgeRequired: true,
    contentAwareProfile: true,
    selectedBy: usageProfile.selectedBy,
    reason: usageProfile.reason,
    modelConfigured: Boolean(usageProfile.model),
    reasoningEffortConfigured: Boolean(usageProfile.reasoningEffort),
    ...(usageProfile.model ? { model: usageProfile.model } : {}),
    ...(usageProfile.reasoningEffort ? { reasoningEffort: usageProfile.reasoningEffort } : {})
  };
}
