import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-16-worker-passkey-secret-sync-bridge.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-16 evidence doc records happy-path and boundary-path runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(
    doc.includes(
      "node --test test/passkey-operator-page.test.js test/passkey-operator-helper.test.js test/github-app-secret-sync.test.js test/worker.test.js"
    ),
    true
  );
  assert.equal(doc.includes("`syncApiBase=http://127.0.0.1:8789/api`"), true);
  assert.equal(
    doc.includes("`http://127.0.0.1:8789/api/github-app-secret-sync/execute`"),
    true
  );
  assert.equal(doc.includes("CORS-safe `POST/OPTIONS` handling"), true);
  assert.equal(doc.includes("`desktop maintenance required`"), true);
  assert.equal(doc.includes("does not read `~/.vtdd/*` directly"), true);
});

test("issue-to-e2e matrix references E2E-16 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-16 Worker passkey secret sync bridge"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-16-worker-passkey-secret-sync-bridge.md"), true);
});
