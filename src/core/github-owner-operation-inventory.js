export const GitHubOwnerOperationStatus = Object.freeze({
  SUPPORTED: "supported",
  GATED: "gated",
  UNSUPPORTED: "unsupported",
  INTENTIONALLY_BLOCKED: "intentionally_blocked"
});

const ISSUE_244 = "#244";

export const GitHubOwnerOperationInventory = Object.freeze([
  {
    id: "repository_read",
    group: "repository",
    status: GitHubOwnerOperationStatus.SUPPORTED,
    requiredGitHubAppPermission: "metadata:read",
    requiredButlerActionSurface: "github_read.repository",
    requiredPasskeyOperatorBoundary: "none; read-only runtime truth",
    runtimeTruthVerificationMethod: "GET /repos/{owner}/{repo}",
    remediationIssue: null
  },
  {
    id: "issue_read",
    group: "issue",
    status: GitHubOwnerOperationStatus.SUPPORTED,
    requiredGitHubAppPermission: "issues:read",
    requiredButlerActionSurface: "github_read.issue",
    requiredPasskeyOperatorBoundary: "none; read-only runtime truth",
    runtimeTruthVerificationMethod: "GET /repos/{owner}/{repo}/issues/{issue_number}",
    remediationIssue: null
  },
  {
    id: "issue_create",
    group: "issue",
    status: GitHubOwnerOperationStatus.SUPPORTED,
    requiredGitHubAppPermission: "issues:write",
    requiredButlerActionSurface: "github_write.issue_create",
    requiredPasskeyOperatorBoundary: "exact payload + human GO",
    runtimeTruthVerificationMethod: "POST /repos/{owner}/{repo}/issues then read returned issue number/state",
    remediationIssue: null
  },
  {
    id: "issue_update_body_title_state_labels_assignees_milestone",
    group: "issue",
    status: GitHubOwnerOperationStatus.UNSUPPORTED,
    requiredGitHubAppPermission: "issues:write",
    requiredButlerActionSurface: "github_write.issue_update",
    requiredPasskeyOperatorBoundary: "exact payload + human GO for bounded edits; scoped passkey approval when closing after merge",
    runtimeTruthVerificationMethod: "PATCH /repos/{owner}/{repo}/issues/{issue_number} then read back changed fields",
    remediationIssue: ISSUE_244
  },
  {
    id: "issue_close_after_scoped_merge",
    group: "issue",
    status: GitHubOwnerOperationStatus.GATED,
    requiredGitHubAppPermission: "issues:write and pull_requests:read",
    requiredButlerActionSurface: "github_high_risk.issue_close",
    requiredPasskeyOperatorBoundary: "scoped passkey approval",
    runtimeTruthVerificationMethod: "verify PR merged_at, PATCH issue state=closed, then read issue state",
    remediationIssue: null
  },
  {
    id: "issue_comment_create_update",
    group: "issue_comment",
    status: GitHubOwnerOperationStatus.SUPPORTED,
    requiredGitHubAppPermission: "issues:write",
    requiredButlerActionSurface: "github_write.issue_comment_create and github_write.issue_comment_update",
    requiredPasskeyOperatorBoundary: "exact payload + human GO",
    runtimeTruthVerificationMethod: "write comment, update by comment id, then read issue comments",
    remediationIssue: null
  },
  {
    id: "issue_comment_delete",
    group: "issue_comment",
    status: GitHubOwnerOperationStatus.UNSUPPORTED,
    requiredGitHubAppPermission: "issues:write",
    requiredButlerActionSurface: "github_write.issue_comment_delete",
    requiredPasskeyOperatorBoundary: "scoped passkey approval when deletion is destructive or evidence-bearing",
    runtimeTruthVerificationMethod: "DELETE /repos/{owner}/{repo}/issues/comments/{comment_id} then verify comment is absent/tombstoned",
    remediationIssue: ISSUE_244
  },
  {
    id: "pull_read_files_reviews_checks",
    group: "pull_request",
    status: GitHubOwnerOperationStatus.SUPPORTED,
    requiredGitHubAppPermission: "pull_requests:read, checks:read, actions:read, contents:read",
    requiredButlerActionSurface: "github_read.pull_request_runtime_truth",
    requiredPasskeyOperatorBoundary: "none; read-only runtime truth",
    runtimeTruthVerificationMethod: "GET PR, files, reviews, review comments, checks/statuses/workflow runs",
    remediationIssue: null
  },
  {
    id: "pull_create_update_comment",
    group: "pull_request",
    status: GitHubOwnerOperationStatus.SUPPORTED,
    requiredGitHubAppPermission: "pull_requests:write and issues:write",
    requiredButlerActionSurface: "github_write.pull_create, github_write.pull_update, github_write.pull_comment_create",
    requiredPasskeyOperatorBoundary: "exact payload + human GO",
    runtimeTruthVerificationMethod: "POST/PATCH PR or issue comment endpoint, then read PR/comment runtime truth",
    remediationIssue: null
  },
  {
    id: "pull_close_reopen_labels_review_requests_draft_state",
    group: "pull_request",
    status: GitHubOwnerOperationStatus.UNSUPPORTED,
    requiredGitHubAppPermission: "pull_requests:write and issues:write",
    requiredButlerActionSurface: "github_write.pull_state_update",
    requiredPasskeyOperatorBoundary: "exact payload + human GO; scoped passkey approval for destructive state transitions if policy marks high-risk",
    runtimeTruthVerificationMethod: "PATCH /pulls/{pull_number} or related PR endpoints, then read PR state",
    remediationIssue: ISSUE_244
  },
  {
    id: "pull_ready_for_review",
    group: "pull_request",
    status: GitHubOwnerOperationStatus.GATED,
    requiredGitHubAppPermission: "pull_requests:write",
    requiredButlerActionSurface: "github_high_risk.pull_ready_for_review",
    requiredPasskeyOperatorBoundary: "scoped passkey approval",
    runtimeTruthVerificationMethod: "read draft=true, GraphQL markPullRequestReadyForReview, then verify isDraft=false",
    remediationIssue: null
  },
  {
    id: "pull_merge",
    group: "pull_request",
    status: GitHubOwnerOperationStatus.GATED,
    requiredGitHubAppPermission: "pull_requests:write and contents:write",
    requiredButlerActionSurface: "github_high_risk.pull_merge",
    requiredPasskeyOperatorBoundary: "scoped passkey approval",
    runtimeTruthVerificationMethod: "PUT /pulls/{pull_number}/merge then read merged_at and merge_commit_sha",
    remediationIssue: null
  },
  {
    id: "branch_ref_create",
    group: "branch",
    status: GitHubOwnerOperationStatus.SUPPORTED,
    requiredGitHubAppPermission: "contents:write",
    requiredButlerActionSurface: "github_write.branch_create",
    requiredPasskeyOperatorBoundary: "exact payload + human GO",
    runtimeTruthVerificationMethod: "GET base ref, POST git refs, then read branch/ref",
    remediationIssue: null
  },
  {
    id: "branch_ref_update_delete",
    group: "branch",
    status: GitHubOwnerOperationStatus.UNSUPPORTED,
    requiredGitHubAppPermission: "contents:write",
    requiredButlerActionSurface: "github_write.branch_ref_update_delete",
    requiredPasskeyOperatorBoundary: "exact payload + human GO for scoped ref update; deletion only for merged scoped branch or scoped passkey approval if destructive",
    runtimeTruthVerificationMethod: "PATCH/DELETE git refs, then read branch/ref absence or updated sha",
    remediationIssue: ISSUE_244
  },
  {
    id: "workflow_runs_dispatch_cancel_rerun_artifacts",
    group: "workflow",
    status: GitHubOwnerOperationStatus.UNSUPPORTED,
    requiredGitHubAppPermission: "actions:write and actions:read",
    requiredButlerActionSurface: "github_actions.workflow_governed_control",
    requiredPasskeyOperatorBoundary: "exact payload + human GO for bounded dispatch/rerun; scoped passkey approval for cancel/destructive cleanup",
    runtimeTruthVerificationMethod: "workflow dispatch/cancel/rerun API then read run status, conclusion, URL, and artifact state",
    remediationIssue: ISSUE_244
  },
  {
    id: "repository_settings_rulesets_environments_pages_webhooks",
    group: "repository_settings",
    status: GitHubOwnerOperationStatus.GATED,
    requiredGitHubAppPermission: "administration:write, metadata:read, environments:write, pages:write where applicable",
    requiredButlerActionSurface: "github_admin.repository_settings_governed_change",
    requiredPasskeyOperatorBoundary: "explicit GO + real passkey/operator approval",
    runtimeTruthVerificationMethod: "read current setting, apply exact approved mutation, read back setting and audit result",
    remediationIssue: null
  },
  {
    id: "repository_permissions_collaborators_teams_app_installation",
    group: "permissions",
    status: GitHubOwnerOperationStatus.GATED,
    requiredGitHubAppPermission: "administration:write and members:read/write where GitHub App supports it",
    requiredButlerActionSurface: "github_admin.permission_governed_change",
    requiredPasskeyOperatorBoundary: "explicit GO + real passkey/operator approval",
    runtimeTruthVerificationMethod: "read current access/install state, apply exact approved mutation, read back resulting permission state",
    remediationIssue: null
  },
  {
    id: "repository_secrets_variables",
    group: "secrets",
    status: GitHubOwnerOperationStatus.GATED,
    requiredGitHubAppPermission: "secrets:write, variables:write, actions:write, environments:write as applicable",
    requiredButlerActionSurface: "github_actions_secret_sync and github_admin.variable_governed_change",
    requiredPasskeyOperatorBoundary: "scoped passkey approval; never expose raw secret material",
    runtimeTruthVerificationMethod: "encrypted secret/variable write result plus metadata readback without raw value",
    remediationIssue: null
  },
  {
    id: "releases_tags_packages",
    group: "release",
    status: GitHubOwnerOperationStatus.UNSUPPORTED,
    requiredGitHubAppPermission: "contents:write and packages:write where applicable",
    requiredButlerActionSurface: "github_release.governed_release_control",
    requiredPasskeyOperatorBoundary: "exact payload + human GO for draft metadata; scoped passkey approval for publish/delete",
    runtimeTruthVerificationMethod: "release/tag/package API mutation then read release/tag/package state and URL",
    remediationIssue: ISSUE_244
  },
  {
    id: "deployments_environments_statuses",
    group: "deployment",
    status: GitHubOwnerOperationStatus.GATED,
    requiredGitHubAppPermission: "deployments:write, environments:write, actions:write",
    requiredButlerActionSurface: "deploy_production plus github_deployment.governed_status_control",
    requiredPasskeyOperatorBoundary: "explicit GO + real passkey/operator approval",
    runtimeTruthVerificationMethod: "dispatch deployment path, read workflow/deployment status, then read runtime truth/parity",
    remediationIssue: null
  },
  {
    id: "repository_archive_delete_transfer_visibility_destructive_cleanup",
    group: "repository_danger_zone",
    status: GitHubOwnerOperationStatus.INTENTIONALLY_BLOCKED,
    requiredGitHubAppPermission: "administration:write/delete where GitHub allows it",
    requiredButlerActionSurface: "none; Butler must refuse steady-state execution",
    requiredPasskeyOperatorBoundary: "not executable through VTDD steady-state; requires explicit owner policy change outside #244",
    runtimeTruthVerificationMethod: "refusal must report requested operation, risk, and required owner policy change",
    remediationIssue: null
  }
]);

export function listGitHubOwnerOperationInventory() {
  return GitHubOwnerOperationInventory.map((entry) => ({ ...entry }));
}

export function explainGitHubOwnerOperation(operationId) {
  const id = normalizeText(operationId);
  const entry = GitHubOwnerOperationInventory.find((candidate) => candidate.id === id);
  if (!entry) {
    return {
      ok: false,
      status: GitHubOwnerOperationStatus.UNSUPPORTED,
      reason: "operation is not present in the owner-operation inventory",
      remediationIssue: ISSUE_244
    };
  }

  return {
    ok: true,
    ...entry
  };
}

export function validateGitHubOwnerOperationInventory(inventory = GitHubOwnerOperationInventory) {
  const issues = [];
  const ids = new Set();
  const requiredFields = [
    "id",
    "group",
    "status",
    "requiredGitHubAppPermission",
    "requiredButlerActionSurface",
    "requiredPasskeyOperatorBoundary",
    "runtimeTruthVerificationMethod"
  ];

  for (const [index, entry] of inventory.entries()) {
    for (const field of requiredFields) {
      if (!normalizeText(entry?.[field])) {
        issues.push(`entry ${index} is missing ${field}`);
      }
    }
    if (!Object.values(GitHubOwnerOperationStatus).includes(entry?.status)) {
      issues.push(`${entry?.id || `entry ${index}`} has invalid status`);
    }
    if (ids.has(entry?.id)) {
      issues.push(`${entry.id} is duplicated`);
    }
    ids.add(entry?.id);
    if (entry?.status === GitHubOwnerOperationStatus.UNSUPPORTED && !normalizeText(entry?.remediationIssue)) {
      issues.push(`${entry.id} is unsupported without remediationIssue`);
    }
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}
