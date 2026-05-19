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
  executeGitHubHighRiskPlane,
  getGitHubAppOperation,
  GitHubAppOperationTier
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
    phase: "execution"
  }
};

const readyGrant = {
  approvalId: "approval-ready-123",
  verified: true,
  expiresAt: "2099-01-01T00:00:00.000Z",
  scope: {
    actionType: "pull_ready_for_review",
    highRiskKind: "pull_ready_for_review",
    repositoryInput: "sample-org/vtdd-v2-p",
    issueNumber: "55",
    pullNumber: "21",
    phase: "execution"
  }
};

test("github app operation registry defines issue close authority scope and runtime truth", () => {
  const issueClose = getGitHubAppOperation("issue_close");
  const pullMerge = getGitHubAppOperation("pull_merge");
  const pullReady = getGitHubAppOperation("pull_ready_for_review");

  assert.equal(issueClose.tier, GitHubAppOperationTier.PASSKEY_AUTHORITY);
  assert.deepEqual(issueClose.requiredPayloadFields, ["repository", "issueNumber"]);
  assert.deepEqual(issueClose.requiredRuntimeEvidenceFields, ["pullNumber"]);
  assert.deepEqual(issueClose.authorityScopeIdentityFields, ["repository", "issueNumber", "phase"]);
  assert.equal(issueClose.requiredRuntimeTruthChecks.includes("pull_request_merged_at_present"), true);
  assert.deepEqual(issueClose.passkey.operatorUrlRequirements, [
    "repositoryInput",
    "phase",
    "issueNumber",
    "pullNumber",
    "actionType",
    "highRiskKind"
  ]);
  assert.equal(pullMerge.tier, GitHubAppOperationTier.PASSKEY_AUTHORITY);
  assert.deepEqual(pullMerge.requiredPayloadFields, ["repository", "issueNumber", "mergeMethod"]);
  assert.deepEqual(pullMerge.requiredRuntimeEvidenceFields, ["pullNumber"]);
  assert.deepEqual(pullMerge.authorityScopeIdentityFields, ["repository", "issueNumber", "phase"]);
  assert.deepEqual(pullMerge.passkey.operatorUrlRequirements, [
    "repositoryInput",
    "phase",
    "issueNumber",
    "actionType",
    "highRiskKind"
  ]);
  assert.equal(pullReady.tier, GitHubAppOperationTier.PASSKEY_AUTHORITY);
  assert.deepEqual(pullReady.requiredPayloadFields, ["repository", "issueNumber", "pullNumber"]);
  assert.deepEqual(pullReady.requiredRuntimeEvidenceFields, ["pullNumber"]);
  assert.deepEqual(pullReady.authorityScopeIdentityFields, ["repository", "issueNumber", "pullNumber", "phase"]);
  assert.deepEqual(pullReady.passkey.operatorUrlRequirements, [
    "repositoryInput",
    "phase",
    "issueNumber",
    "pullNumber",
    "actionType",
    "highRiskKind"
  ]);
});

test("merge requires scoped passkey approval level in core policy", () => {
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
    approvalGrant: mergeGrant,
    approvalScope: mergeGrant.scope,
    approvalScopeMatched: true,
    issueTraceable: true,
    go: false,
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
    mergeMethod: "squash",
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalGrant: mergeGrant,
    approvalScope: mergeGrant.scope,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (calls.length === 1) {
          return new Response(
            JSON.stringify({
              mergeable: true,
              mergeable_state: "clean",
              html_url: "https://github.com/sample-org/vtdd-v2-p/pull/21"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (init?.method === "PUT") {
          return new Response(
            JSON.stringify({
              sha: "abc123",
              merged: true,
              message: "Pull Request successfully merged"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            merged: true,
            merged_at: "2026-05-09T01:02:03Z",
            merge_commit_sha: "def456",
            html_url: "https://github.com/sample-org/vtdd-v2-p/pull/21"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.authorityAction.operation, "pull_merge");
  assert.equal(result.authorityAction.merged, true);
  assert.deepEqual(result.authorityAction.runtimeTruth, {
    merged: true,
    mergedAt: "2026-05-09T01:02:03Z",
    mergeCommitSha: "def456",
    htmlUrl: "https://github.com/sample-org/vtdd-v2-p/pull/21"
  });
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].init.method, "PUT");
  assert.equal(calls[2].init.method, "GET");
});

test("github high-risk plane binds default fetch for Cloudflare Worker merge dispatch", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async function cloudflareLikeFetch(url, init) {
    assert.equal(this, globalThis);
    calls.push({ url, init });
    if (calls.length === 1) {
      return new Response(
        JSON.stringify({
          mergeable: true,
          mergeable_state: "clean",
          html_url: "https://github.com/sample-org/vtdd-v2-p/pull/21"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (init?.method === "PUT") {
      return new Response(
        JSON.stringify({
          sha: "abc123",
          merged: true,
          message: "Pull Request successfully merged"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        merged: true,
        merged_at: "2026-05-09T01:02:03Z",
        merge_commit_sha: "def456",
        html_url: "https://github.com/sample-org/vtdd-v2-p/pull/21"
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  try {
    const result = await executeGitHubHighRiskPlane({
      operation: GitHubHighRiskOperation.PULL_MERGE,
      repository: "sample-org/vtdd-v2-p",
      issueNumber: 55,
      pullNumber: 21,
      mergeMethod: "squash",
      approvalPhrase: "GO",
      targetConfirmed: true,
      approvalGrant: mergeGrant,
      approvalScope: mergeGrant.scope,
      env: {
        GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk"
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.authorityAction.runtimeTruth.mergedAt, "2026-05-09T01:02:03Z");
    assert.deepEqual(
      calls.map((call) => call.init.method),
      ["GET", "PUT", "GET"]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("github high-risk plane blocks merge before merge API when pull request has conflicts", async () => {
  const calls = [];
  const result = await executeGitHubHighRiskPlane({
    operation: GitHubHighRiskOperation.PULL_MERGE,
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 55,
    pullNumber: 21,
    mergeMethod: "squash",
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
            mergeable: false,
            mergeable_state: "dirty",
            html_url: "https://github.com/sample-org/vtdd-v2-p/pull/21"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.error, "github_high_risk_preflight_blocked");
  assert.equal(result.issues.includes("pull_request_has_merge_conflicts"), true);
  assert.match(result.reason, /merge conflicts were detected before merge/);
  assert.equal(result.diagnostics.requestMethod, "GET");
  assert.equal(result.diagnostics.mergeable, false);
  assert.equal(result.diagnostics.mergeableState, "dirty");
  assert.equal(result.diagnostics.mergeConflict, true);
  assert.match(result.diagnostics.freshBranchSuggestion, /Recreate a fresh branch/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
});

test("github high-risk plane marks draft pull request ready for review with scoped approval grant", async () => {
  const calls = [];
  const result = await executeGitHubHighRiskPlane({
    operation: GitHubHighRiskOperation.PULL_READY_FOR_REVIEW,
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 55,
    pullNumber: 21,
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalGrant: readyGrant,
    approvalScope: readyGrant.scope,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url, init });
        if (calls.length === 1) {
          return new Response(
            JSON.stringify({
              draft: true,
              node_id: "PR_kwDOExample",
              html_url: "https://github.com/sample-org/vtdd-v2-p/pull/21"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            data: {
              markPullRequestReadyForReview: {
                pullRequest: {
                  isDraft: false,
                  number: 21,
                  url: "https://github.com/sample-org/vtdd-v2-p/pull/21"
                }
              }
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.authorityAction.operation, "pull_ready_for_review");
  assert.equal(result.authorityAction.readyForReview, true);
  assert.equal(result.authorityAction.changed, true);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].url, "https://api.github.com/graphql");
  assert.equal(calls[1].init.method, "POST");
});

test("github high-risk plane treats already-ready pull request as no-op success", async () => {
  const result = await executeGitHubHighRiskPlane({
    operation: GitHubHighRiskOperation.PULL_READY_FOR_REVIEW,
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 55,
    pullNumber: 21,
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalGrant: readyGrant,
    approvalScope: readyGrant.scope,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async () =>
        new Response(
          JSON.stringify({
            draft: false,
            html_url: "https://github.com/sample-org/vtdd-v2-p/pull/21"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.authorityAction.readyForReview, true);
  assert.equal(result.authorityAction.changed, false);
});

test("github high-risk plane fails when ready-for-review mutation does not prove readiness", async () => {
  const result = await executeGitHubHighRiskPlane({
    operation: GitHubHighRiskOperation.PULL_READY_FOR_REVIEW,
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 55,
    pullNumber: 21,
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalGrant: readyGrant,
    approvalScope: readyGrant.scope,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async (url) => {
        if (String(url).includes("/pulls/")) {
          return new Response(
            JSON.stringify({
              draft: true,
              node_id: "PR_kwDOExample"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            data: {
              markPullRequestReadyForReview: {
                pullRequest: {
                  isDraft: true,
                  number: 21,
                  url: "https://github.com/sample-org/vtdd-v2-p/pull/21"
                }
              }
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.reason, "GitHub ready-for-review mutation did not return a ready pull request");
});

test("github high-risk plane requires merge method from registry", async () => {
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
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk"
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.includes("mergeMethod is required"), true);
});

test("github high-risk plane surfaces merge fetch exception diagnostics", async () => {
  const result = await executeGitHubHighRiskPlane({
    operation: GitHubHighRiskOperation.PULL_MERGE,
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 55,
    pullNumber: 21,
    mergeMethod: "squash",
    approvalPhrase: "GO",
    targetConfirmed: true,
    approvalGrant: mergeGrant,
    approvalScope: mergeGrant.scope,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_high_risk",
      GITHUB_API_FETCH: async (url, init) => {
        if (init?.method === "GET") {
          return new Response(
            JSON.stringify({
              mergeable: true,
              mergeable_state: "clean"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        throw new TypeError("fetch failed");
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.reason, "failed to execute GitHub merge: fetch failed");
  assert.equal(result.issues.includes("github_merge_fetch_exception"), true);
  assert.deepEqual(result.diagnostics, {
    operation: "pull_merge",
    requestMethod: "PUT",
    requestUrl: "https://api.github.com/repos/sample-org/vtdd-v2-p/pulls/21/merge",
    exceptionName: "TypeError",
    exceptionMessage: "fetch failed"
  });
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
        actionType: "issue_close",
        highRiskKind: "issue_close",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "55",
        phase: "execution"
      }
    },
    approvalScope: {
      actionType: "issue_close",
      highRiskKind: "issue_close",
      repositoryInput: "sample-org/vtdd-v2-p",
      issueNumber: "55",
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
    mergeMethod: "squash",
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
        actionType: "issue_close",
        highRiskKind: "issue_close",
        repositoryInput: "sample-org/vtdd-v2-p",
        issueNumber: "55",
        phase: "execution"
      }
    },
    approvalScope: {
      actionType: "issue_close",
      highRiskKind: "issue_close",
      repositoryInput: "sample-org/vtdd-v2-p",
      issueNumber: "55",
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
