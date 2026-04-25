import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/remote-codex-executor.yml", "utf8");

test("remote Codex workflow commits, pushes, and creates or updates a PR", () => {
  assert.equal(workflow.includes("name: Commit and push Codex changes"), true);
  assert.equal(workflow.includes("git push origin"), true);
  assert.equal(workflow.includes("name: Create or update pull request"), true);
  assert.equal(workflow.includes("gh pr view"), true);
  assert.equal(workflow.includes("gh pr create"), true);
});

test("remote Codex workflow fails instead of pretending PR creation succeeded with no changes", () => {
  assert.equal(workflow.includes("No existing PR and no Codex changes to open a PR with."), true);
  assert.equal(workflow.includes("exit 1"), true);
});
