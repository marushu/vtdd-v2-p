import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateExecutionPolicy,
  GitHubHighRiskOperation,
  ActionType,
  ApprovalLevel,
  ConsentCategory,
  CredentialTier,
  TaskMode,
  executeGitHubHighRiskPlane
} from "../src/core/index.js";

const aliasRegistry = [
  {
    canonicalRepo: "sample-org/vtdd-v2-p",
    productName: "VTDD",
    aliases: ["vtdd"]
  }
];

const mergeGrant = {
  approvalId: "approval-merge-123",
  verified: true,
  expiresAt: "2099-01-01T00:00:00.000Z",
  scope: {
    actionType: "merge",
    highRiskKind: "pull_merge",
    repositoryInput: "sample-org/vtdd-v2-p",
    issueNumber: "55",
    relatedIssue: "55",
    phase: "execution"
  }
};

test("merge now requires GO + passkey approval level in core policy", () => {
  const denied = evaluateExecutionPolicy({
    actionType: ActionType.MERGE,
    mode: TaskMode.EXECUTION,
    repositoryInput: "vtdd",
    aliasRegistry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: {
      model: "github_app",
      tier: CredentialTier.HIGH_RISK,
      shortLived: true,
      boundApprovalId: "approval-merge-123"
    },
    consent: {
      grantedCategories: [ConsentCategory.EXECUTE]
    },
    approvalPhrase: "GO merge request",
    approvalScopeMatched: true,
    issueTraceable: true,
    go: true,
    passkey: false
  });
  const allowed = evaluateExecutionPolicy({
    actionType: ActionType.MERGE,
    mode: TaskMode.EXECUTION,
    repositoryInput: "vtdd",
    aliasRegistry,
    targetConfirmed: true,
    constitutionConsulted: true,
    runtimeTruth: { runtimeAvailable: true },
    credential: {
      model: "github_app",
      tier: CredentialTier.HIGH_RISK,
      shortLived: true,
      boundApprovalId: "approval-merge-123"
    },
    consent: {
      grantedCategories: [ConsentCategory.EXECUTE]
    },
    approvalPhrase: "GO merge request",
    approvalGrant: mergeGrant,
    approvalScope: mergeGrant.scope,
    approvalScopeMatched: true,
    issueTraceable: true,
    go: true,
    passkey: false
  });

  assert.equal(denied.allowed, false);
  assert.equal(denied.requiredApproval, ApprovalLevel.GO_PASSKEY);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.requiredApproval, ApprovalLevel.GO_PASSKEY);
});

test("github high-risk plane merges a pull request with scoped approval grant", async () => {
  const calls = [];
  const result = await executeGitHubHighRiskPlane({
    operation: GitHubHighRiskOperation.PULL_MERGE,
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 55,
    pullNumber: 21,
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalGrant: mergeGrant,
    approvalScope: mergeGrant.scope,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({
            sha: "abc123",
            merged: true,
            message: "Pull Request successfully merged"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.authorityAction.operation, "pull_merge");
  assert.equal(result.authorityAction.merged, true);
  assert.equal(calls[0].init.method, "PUT");
});

test("github high-risk plane closes bounded issue only after merged pull verification", async () => {
  const calls = [];
  const result = await executeGitHubHighRiskPlane({
    operation: GitHubHighRiskOperation.ISSUE_CLOSE,
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 55,
    pullNumber: 21,
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalGrant: {
      approvalId: "approval-close-123",
      verified: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        highRiskKind: "issue_close",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "55",
        relatedIssue: "55",
        phase: "execution"
      }
    },
    approvalScope: {
      actionType: "destructive",
      highRiskKind: "issue_close",
      repositoryInput: "sample-org/vtdd-v2-p",
      issueNumber: "55",
      relatedIssue: "55",
      phase: "execution"
    },
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (calls.length === 1) {
          return new Response(
            JSON.stringify({
              number: 21,
              merged_at: "2026-04-26T12:00:00Z"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            number: 55,
            state: "closed",
            html_url: "https://github.com/sample-org/vtdd-v2-p/issues/55"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.authorityAction.operation, "issue_close");
  assert.equal(result.authorityAction.issueState, "closed");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].init.method, "PATCH");
});

test("github high-risk plane rejects missing approval grant or unmerged bounded close", async () => {
  const missingGrant = await executeGitHubHighRiskPlane({
    operation: GitHubHighRiskOperation.PULL_MERGE,
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 55,
    pullNumber: 21,
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalGrant: null,
    approvalScope: mergeGrant.scope,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk"
    }
  });

  const unmergedClose = await executeGitHubHighRiskPlane({
    operation: GitHubHighRiskOperation.ISSUE_CLOSE,
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 55,
    pullNumber: 21,
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalGrant: {
      approvalId: "approval-close-123",
      verified: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      scope: {
        actionType: "destructive",
        highRiskKind: "issue_close",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "55",
        relatedIssue: "55",
        phase: "execution"
      }
    },
    approvalScope: {
      actionType: "destructive",
      highRiskKind: "issue_close",
      repositoryInput: "sample-org/vtdd-v2-p",
      issueNumber: "55",
      relatedIssue: "55",
      phase: "execution"
    },
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            number: 21,
            merged_at: null
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  });

  assert.equal(missingGrant.ok, false);
  assert.equal(missingGrant.reason.includes("real passkey approval grant is required"), true);
  assert.equal(unmergedClose.ok, false);
  assert.equal(unmergedClose.reason, "bounded issue close requires a merged pull request");
});
