export const ActionType = Object.freeze({
  READ: "read",
  SUMMARIZE: "summarize",
  ISSUE_CREATE: "issue_create",
  BUILD: "build",
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
