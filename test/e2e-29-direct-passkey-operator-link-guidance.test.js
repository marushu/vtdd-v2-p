import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-29-direct-passkey-operator-link-guidance.md"
);
const MATRIX_PATH = path.join(process.cwd(), "docs", "mvp", "issue-to-e2e-matrix.md");

test("E2E-29 evidence doc records direct operator link guidance runs", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("`#91`"), true);
  assert.equal(doc.includes("selfParity.deployRecovery.operatorUrl"), true);
  assert.equal(doc.includes("iPhone/mobile"), true);
  assert.equal(doc.includes("actionType=deploy_production"), true);
  assert.equal(doc.includes("GO + real passkey"), true);
});

test("issue-to-e2e matrix references E2E-29 run evidence", () => {
  const doc = fs.readFileSync(MATRIX_PATH, "utf8");
  assert.equal(doc.includes("## E2E-29 Direct passkey operator link guidance for deploy recovery"), true);
  assert.equal(doc.includes("docs/mvp/e2e/e2e-29-direct-passkey-operator-link-guidance.md"), true);
  assert.equal(doc.includes("- Issues: `#91`"), true);
});
