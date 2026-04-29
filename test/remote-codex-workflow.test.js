import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/remote-codex-executor.yml", "utf8");

test("remote Codex workflow commits, pushes, and creates or updates a PR", () => {
  assert.equal(workflow.includes("name: Validate remote Codex inputs"), true);
  assert.equal(workflow.includes("name: Commit and push Codex changes"), true);
  assert.equal(workflow.includes("git push origin"), true);
  assert.equal(workflow.includes("name: Create or update pull request"), true);
  assert.equal(workflow.includes("gh pr view"), true);
  assert.equal(workflow.includes("gh pr create"), true);
  assert.equal(workflow.includes("node scripts/render-pr-body.mjs"), true);
  assert.equal(workflow.includes("node scripts/validate-pr-body.mjs"), true);
  assert.equal(workflow.includes("--body-file /tmp/vtdd-remote-codex-pr-body.md"), true);
});

test("remote Codex workflow fails instead of pretending PR creation succeeded with no changes", () => {
  assert.equal(workflow.includes("No existing PR and no Codex changes to open a PR with."), true);
  assert.equal(workflow.includes("exit 1"), true);
});

test("remote Codex workflow avoids embedding dispatch inputs inside shell heredocs", () => {
  assert.equal(workflow.includes("node <<'EOF'"), true);
  assert.equal(workflow.includes("Repository: ${{ github.event.inputs.target_repository }}"), false);
  assert.equal(workflow.includes("Handoff JSON: ${{ github.event.inputs.handoff_json }}"), false);
  assert.equal(workflow.includes("git push origin \"${{ github.event.inputs.target_branch }}\""), false);
});

test("remote Codex workflow marks OPENAI_API_KEY runner as explicit opt-in", () => {
  assert.equal(workflow.includes("Optional API-backed runner."), true);
  assert.equal(workflow.includes("may create separate API billing"), true);
  assert.equal(workflow.includes("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}"), true);
});

test("remote Codex workflow authenticates Codex CLI before execution", () => {
  assert.equal(workflow.includes("name: Authenticate Codex CLI"), true);
  assert.equal(workflow.includes("printenv OPENAI_API_KEY | codex login --with-api-key"), true);
  assert.equal(
    workflow.indexOf("codex login --with-api-key") < workflow.indexOf("codex exec "),
    true
  );
});

test("remote Codex workflow runs Codex with workspace-write sandbox", () => {
  assert.equal(
    workflow.includes(
      "codex exec --sandbox workspace-write -c sandbox_workspace_write.network_access=true --skip-git-repo-check"
    ),
    true
  );
  assert.equal(workflow.includes("--dangerously-bypass-approvals-and-sandbox"), false);
});

test("remote Codex workflow keeps secrets out of the Codex exec step", () => {
  const runStepStart = workflow.indexOf("name: Run Codex CLI");
  const commitStepStart = workflow.indexOf("name: Commit and push Codex changes");
  const runStep = workflow.slice(runStepStart, commitStepStart);

  assert.equal(runStep.includes("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}"), false);
  assert.equal(runStep.includes("GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}"), false);
});

test("remote Codex workflow restricts api_key_runner to the control repository", () => {
  assert.equal(workflow.includes('if [ "$TARGET_REPOSITORY" != "$GITHUB_REPOSITORY" ]; then'), true);
  assert.equal(workflow.includes("api_key_runner is restricted to this repository."), true);
});
