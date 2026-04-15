export const ActionType = Object.freeze({
  READ: "read",
  SUMMARIZE: "summarize",
  ISSUE_CREATE: "issue_create",
  BUILD: "build",
  PR_COMMENT: "pr_comment",
  PR_REVIEW_SUBMIT: "pr_review_submit",
  PR_OPERATION: "pr_operation",
  MERGE: "merge",
  DEPLOY_PRODUCTION: "deploy_production",
  DESTRUCTIVE: "destructive",
  EXTERNAL_PUBLISH: "external_publish"
});

export const ApprovalLevel = Object.freeze({
  NONE: "none",
  GO: "go",
  GO_PASSKEY: "go_passkey"
});

export const TaskMode = Object.freeze({
  READ_ONLY: "read_only",
  EXECUTION: "execution"
});

export const ActorRole = Object.freeze({
  BUTLER: "butler",
  EXECUTOR: "executor",
  REVIEWER: "reviewer"
});

export const CredentialTier = Object.freeze({
  READ: "read",
  EXECUTE: "execute",
  HIGH_RISK: "high_risk"
});

export const ConsentCategory = Object.freeze({
  READ: "read",
  PROPOSE: "propose",
  EXECUTE: "execute",
  DESTRUCTIVE: "destructive",
  EXTERNAL_PUBLISH: "external_publish"
});
