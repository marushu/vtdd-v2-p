import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/approve-auto-merge.yml", "utf8");
const script = fs.readFileSync("scripts/run-approve-auto-merge.mjs", "utf8");

test("approve auto merge workflow runs from trusted main and uses App token", () => {
  assert.equal(workflow.includes("name: approve-auto-merge"), true);
  assert.equal(workflow.includes("workflow_run:"), true);
  assert.equal(workflow.includes("guarded-autonomy-required-checks"), true);
  assert.equal(workflow.includes("gemini-pr-review"), true);
  assert.equal(workflow.includes("codex-pr-review-fallback"), true);
  assert.equal(workflow.includes("uses: actions/create-github-app-token@v1"), true);
  assert.equal(workflow.includes("ref: main"), true);
  assert.equal(workflow.includes("VTDD_RUNTIME_URL"), true);
  assert.equal(workflow.includes("VTDD_GATEWAY_BEARER_TOKEN"), true);
  assert.equal(workflow.includes("node scripts/run-approve-auto-merge.mjs"), true);
});

test("approve auto merge script records searchable evidence before and after merge", () => {
  assert.equal(script.includes("formatApproveAutoMergeCandidateComment"), true);
  assert.equal(script.includes("formatApproveAutoMergeExecutedComment"), true);
  assert.equal(script.includes("自動マージ"), true);
  assert.equal(script.includes("/merge"), true);
  assert.equal(script.includes("/v2/events/github-actions"), true);
  assert.equal(script.includes("notifyDashboardEvent"), true);
  assert.equal(script.includes("evaluateApproveAutoMerge"), true);
});
