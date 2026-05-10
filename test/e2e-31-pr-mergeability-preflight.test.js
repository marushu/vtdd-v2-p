import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-31-pr-mergeability-preflight.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-31 evidence doc records PR mergeability preflight runs and live-E2E blocker", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("Issues:\n- `#265`"), true);
  assert.equal(
    doc.includes("node --test test/github-read-plane.test.js test/github-high-risk-plane.test.js test/worker.test.js"),
    true
  );
  assert.equal(doc.includes("`vtddRetrieveGitHub(pulls)` exposes `mergeable`"), true);
  assert.equal(doc.includes("performs `GET /pulls/{pull_number}` before `PUT /pulls/{pull_number}/merge`"), true);
  assert.equal(doc.includes("returns `github_high_risk_preflight_blocked` before calling the merge API"), true);
  assert.equal(doc.includes("Live E2E against a real conflicting GitHub PR was not run in this revision."), true);
  assert.equal(doc.includes("must not claim that the live conflicting-PR path is verified"), true);
});

test("issue-to-e2e matrix references E2E-31 without overclaiming completion", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-31 PR mergeability preflight"), true);
  assert.equal(doc.includes("- Issues: `#265`"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-31-pr-mergeability-preflight.md"), true);
  assert.equal(doc.includes("- Status: `partial`"), true);
});
