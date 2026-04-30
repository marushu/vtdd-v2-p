import { GitHubWriteOperation } from "./github-write-plane.js";

export const GitHubAppOperationTier = Object.freeze({
  READ: "read",
  NORMAL_GO: "normal_go",
  PASSKEY_AUTHORITY: "passkey_authority"
});

export const GitHubAppOperationRegistry = Object.freeze({
  [GitHubWriteOperation.ISSUE_CREATE]: {
    operation: GitHubWriteOperation.ISSUE_CREATE,
    tier: GitHubAppOperationTier.NORMAL_GO,
    requiredPayloadFields: ["repository", "title", "body"],
    naturalGoIdentityFields: ["repository", "title", "body"]
  },
  [GitHubWriteOperation.ISSUE_COMMENT_CREATE]: {
    operation: GitHubWriteOperation.ISSUE_COMMENT_CREATE,
    tier: GitHubAppOperationTier.NORMAL_GO,
    requiredPayloadFields: ["repository", "issueNumber", "body"],
    naturalGoIdentityFields: ["repository", "issueNumber", "body"]
  },
  [GitHubWriteOperation.ISSUE_COMMENT_UPDATE]: {
    operation: GitHubWriteOperation.ISSUE_COMMENT_UPDATE,
    tier: GitHubAppOperationTier.NORMAL_GO,
    requiredPayloadFields: ["repository", "issueNumber", "commentId", "body"],
    naturalGoIdentityFields: ["repository", "issueNumber", "commentId", "body"],
    naturalGoEnabled: false
  },
  [GitHubWriteOperation.BRANCH_CREATE]: {
    operation: GitHubWriteOperation.BRANCH_CREATE,
    tier: GitHubAppOperationTier.NORMAL_GO,
    requiredPayloadFields: ["repository", "branch", "baseRef"],
    naturalGoIdentityFields: ["repository", "branch", "baseRef"],
    naturalGoEnabled: false
  },
  [GitHubWriteOperation.PULL_CREATE]: {
    operation: GitHubWriteOperation.PULL_CREATE,
    tier: GitHubAppOperationTier.NORMAL_GO,
    requiredPayloadFields: ["repository", "title", "body", "head", "baseRef"],
    naturalGoIdentityFields: ["repository", "title", "body", "head", "baseRef"],
    naturalGoEnabled: false
  },
  [GitHubWriteOperation.PULL_UPDATE]: {
    operation: GitHubWriteOperation.PULL_UPDATE,
    tier: GitHubAppOperationTier.NORMAL_GO,
    requiredPayloadFields: ["repository", "pullNumber", "title", "body"],
    naturalGoIdentityFields: ["repository", "pullNumber", "title", "body"],
    naturalGoEnabled: false
  },
  [GitHubWriteOperation.PULL_COMMENT_CREATE]: {
    operation: GitHubWriteOperation.PULL_COMMENT_CREATE,
    tier: GitHubAppOperationTier.NORMAL_GO,
    requiredPayloadFields: ["repository", "pullNumber", "body"],
    naturalGoIdentityFields: ["repository", "pullNumber", "body"]
  },
  pull_merge: {
    operation: "pull_merge",
    tier: GitHubAppOperationTier.PASSKEY_AUTHORITY,
    requiredPayloadFields: ["repository", "pullNumber", "mergeMethod"],
    passkey: {
      actionType: "merge",
      highRiskKind: "pull_merge"
    }
  },
  issue_close: {
    operation: "issue_close",
    tier: GitHubAppOperationTier.PASSKEY_AUTHORITY,
    requiredPayloadFields: ["repository", "issueNumber", "mergedPullNumber"],
    passkey: {
      actionType: "merge",
      highRiskKind: "issue_close"
    }
  },
  deploy_production: {
    operation: "deploy_production",
    tier: GitHubAppOperationTier.PASSKEY_AUTHORITY,
    requiredPayloadFields: ["repository"],
    passkey: {
      actionType: "deploy_production",
      highRiskKind: "deploy_production"
    }
  },
  github_actions_secret_sync: {
    operation: "github_actions_secret_sync",
    tier: GitHubAppOperationTier.PASSKEY_AUTHORITY,
    requiredPayloadFields: ["repository", "secretName"],
    passkey: {
      actionType: "destructive",
      highRiskKind: "github_actions_secret_sync"
    }
  }
});

const NATURAL_GO_ENABLED_OPERATIONS = new Set([
  GitHubWriteOperation.ISSUE_CREATE,
  GitHubWriteOperation.ISSUE_COMMENT_CREATE,
  GitHubWriteOperation.PULL_COMMENT_CREATE
]);

export function getGitHubAppOperation(operation) {
  return GitHubAppOperationRegistry[normalizeText(operation)] ?? null;
}

export function bindNaturalGitHubWriteApproval({ payload, policyInput }) {
  if (
    policyInput?.targetConfirmed === true &&
    policyInput?.approvalScopeMatched === true &&
    normalizeText(policyInput?.approvalPhrase)
  ) {
    return policyInput;
  }

  if (!canBindNaturalGitHubWriteApproval(payload)) {
    return policyInput;
  }

  return {
    ...policyInput,
    targetConfirmed: true,
    approvalScopeMatched: true,
    approvalPhrase: "GO"
  };
}

export function canBindNaturalGitHubWriteApproval(payload) {
  const operation = normalizeText(payload?.operation);
  const operationConfig = getGitHubAppOperation(operation);
  if (
    !operationConfig ||
    operationConfig.tier !== GitHubAppOperationTier.NORMAL_GO ||
    operationConfig.naturalGoEnabled === false ||
    !NATURAL_GO_ENABLED_OPERATIONS.has(operation)
  ) {
    return false;
  }

  const naturalApproval = normalizeObject(payload?.naturalApproval);
  if (naturalApproval.exactPayloadPresented !== true || naturalApproval.repositoryResolved !== true) {
    return false;
  }

  if (!containsGoToken(naturalApproval.userText)) {
    return false;
  }

  const presentedPayload = normalizeObject(naturalApproval.presentedPayload);
  if (normalizeText(presentedPayload.operation) !== operation) {
    return false;
  }

  return operationConfig.naturalGoIdentityFields.every((field) =>
    fieldMatchesPresentedPayload({
      field,
      payload,
      presentedPayload
    })
  );
}

function fieldMatchesPresentedPayload({ field, payload, presentedPayload }) {
  const actual = readPayloadIdentityField(payload, field);
  const presented = readPayloadIdentityField(presentedPayload, field);
  if (field === "body") {
    return Boolean(normalizeBody(actual)) && normalizeBody(actual) === normalizeBody(presented);
  }
  if (["issueNumber", "pullNumber", "commentId"].includes(field)) {
    const actualNumber = normalizePositiveInteger(actual);
    return Boolean(actualNumber) && actualNumber === normalizePositiveInteger(presented);
  }
  return Boolean(normalizeText(actual)) && normalizeText(actual) === normalizeText(presented);
}

function readPayloadIdentityField(payload, field) {
  if (field === "issueNumber") {
    return payload?.issueNumber ?? payload?.issueContext?.issueNumber;
  }
  return payload?.[field];
}

function containsGoToken(value) {
  return /(^|[^A-Za-z0-9_])GO([^A-Za-z0-9_]|$)/i.test(normalizeText(value));
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBody(value) {
  return typeof value === "string" ? value : "";
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
