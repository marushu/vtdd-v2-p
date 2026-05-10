import test from "node:test";
import assert from "node:assert/strict";

import { GitHubReadResource, retrieveGitHubReadPlane } from "../src/core/github-read-plane.js";

const repository = process.env.LIVE_GITHUB_REPOSITORY || "";
const pullNumber = Number.parseInt(process.env.LIVE_GITHUB_CONFLICT_PULL_NUMBER || "", 10);
const token = process.env.GITHUB_APP_INSTALLATION_TOKEN || "";

const skipReason =
  repository && Number.isInteger(pullNumber) && pullNumber > 0 && token
    ? false
    : "set LIVE_GITHUB_REPOSITORY, LIVE_GITHUB_CONFLICT_PULL_NUMBER, and GITHUB_APP_INSTALLATION_TOKEN to run the read-only live conflicting-PR check";

test(
  "E2E-31 live read-only conflicting PR mergeability preflight",
  { skip: skipReason },
  async () => {
    const result = await retrieveGitHubReadPlane({
      resource: GitHubReadResource.PULLS,
      repository,
      pullNumber,
      env: {
        GITHUB_APP_INSTALLATION_TOKEN: token
      }
    });

    assert.equal(result.ok, true);
    const pull = result.read.records[0];
    assert.equal(pull.mergeable, false);
    assert.equal(pull.mergeableState, "dirty");
    assert.equal(pull.mergeConflict, true);
    assert.equal(pull.mergeBlocked, true);
    assert.equal(pull.mergeBlockedReason, "pull_request_has_merge_conflicts");
    assert.match(pull.mergeWarning, /merge conflicts were detected before merge/);
    assert.match(pull.freshBranchSuggestion, /Recreate a fresh branch/);
    assert.equal(pull.conflictFiles, null);
    assert.equal(pull.conflictFilesSource, "not_provided_by_github_pull_request_endpoint");
  }
);
