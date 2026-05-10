const CONFLICT_FILES_SOURCE = "not_provided_by_github_pull_request_endpoint";
const FRESH_BRANCH_SUGGESTION =
  "Recreate a fresh branch from the current base branch, replay the scoped changes, and open/update the PR before retrying merge.";

export function normalizePullRequestMergeability(item) {
  const mergeable = typeof item?.mergeable === "boolean" ? item.mergeable : null;
  const state = normalizeText(item?.mergeable_state);
  const draft = item?.draft === true;
  const merged = item?.merged === true || Boolean(normalizeText(item?.merged_at));
  const hasConflict = mergeable === false || state === "dirty";
  const isUnknown = mergeable === null || state === "unknown";
  const blockedReason = normalizeMergeBlockedReason({ draft, hasConflict, isUnknown, merged, state });
  const blocked = Boolean(blockedReason);
  const warning = blocked ? normalizeMergeWarning({ hasConflict, isUnknown, state, blockedReason }) : null;

  return {
    mergeable,
    state: state || null,
    hasConflict,
    blocked,
    blockedReason,
    warning,
    freshBranchSuggestion: hasConflict ? FRESH_BRANCH_SUGGESTION : null,
    conflictFiles: null,
    conflictFilesSource: CONFLICT_FILES_SOURCE
  };
}

function normalizeMergeBlockedReason({ draft, hasConflict, isUnknown, merged, state }) {
  if (merged) {
    return null;
  }
  if (draft) {
    return "pull_request_is_draft";
  }
  if (hasConflict) {
    return "pull_request_has_merge_conflicts";
  }
  if (isUnknown) {
    return "pull_request_mergeability_unknown";
  }
  if (state === "blocked") {
    return "pull_request_merge_blocked";
  }
  if (state === "behind") {
    return "pull_request_branch_behind_base";
  }
  if (state === "unstable") {
    return "pull_request_checks_unstable";
  }
  return null;
}

function normalizeMergeWarning({ hasConflict, isUnknown, state, blockedReason }) {
  if (hasConflict) {
    return "Warning: PR merge conflicts were detected before merge. Resolve conflicts or recreate a fresh branch before attempting the merge API.";
  }
  if (isUnknown) {
    return "Warning: GitHub has not finished computing PR mergeability. Re-read PR runtime truth before attempting merge.";
  }
  if (state === "behind") {
    return "Warning: PR branch is behind the base branch. Update or recreate the branch before attempting merge.";
  }
  return `Warning: PR merge is blocked (${blockedReason}). Resolve the blocking condition before attempting merge.`;
}

function normalizeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
