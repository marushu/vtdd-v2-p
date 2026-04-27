import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-26-governed-production-deploy-from-passkey-operator.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-26 evidence doc records governed deploy runs from the passkey operator", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(
    doc.includes(
      "node --test test/deploy-production-plane.test.js test/passkey-operator-page.test.js test/worker.test.js test/custom-gpt-setup-docs.test.js"
    ),
    true
  );
  assert.equal(doc.includes("Dispatch production deploy"), true);
  assert.equal(doc.includes("/v2/action/deploy"), true);
  assert.equal(doc.includes("runtime_url"), true);
  assert.equal(doc.includes("deploy_unavailable"), true);
  assert.equal(doc.includes("Worker-owned passkey operator surface"), true);
});

test("issue-to-e2e matrix references E2E-26 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-26 Governed production deploy from passkey operator"), true);
  assert.equal(
    doc.includes("docs/mvp/e2e/e2e-26-governed-production-deploy-from-passkey-operator.md"),
    true
  );
  assert.equal(doc.includes("- Issues: `#82`"), true);
});
