import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-17-github-app-secret-sync-bootstrap.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-17 evidence doc records happy-path and boundary-path runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(
    doc.includes(
      "node --test test/github-app-secret-sync.test.js test/passkey-operator-helper.test.js test/worker.test.js"
    ),
    true
  );
  assert.equal(doc.includes("`VTDD_GITHUB_APP_ID`"), true);
  assert.equal(doc.includes("`VTDD_GITHUB_APP_PRIVATE_KEY`"), true);
  assert.equal(doc.includes("`issueNumber=15`"), true);
  assert.equal(doc.includes("`approvalGrantId`"), true);
  assert.equal(doc.includes("`highRiskKind=github_app_secret_sync`"), true);
  assert.equal(doc.includes("`--gateway-bearer-token`"), true);
  assert.equal(doc.includes("steady-state runtime dependency"), true);
});

test("issue-to-e2e matrix references E2E-17 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-17 GitHub App secret sync bootstrap"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-17-github-app-secret-sync-bootstrap.md"), true);
});
