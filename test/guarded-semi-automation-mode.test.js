import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "security",
  "guarded-semi-automation-mode.md"
);
const WORKFLOW_PATH = path.join(
  process.cwd(),
  ".github",
  "workflows",
  "guarded-autonomy-required-checks.yml"
);
const CODEOWNERS_PATH = path.join(process.cwd(), ".github", "CODEOWNERS");

test("guarded semi-automation doc defines mode switch and stop boundaries", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("`normal`"), true);
  assert.equal(doc.includes("`guarded_absence`"), true);
  assert.equal(doc.includes("VTDD_AUTONOMY_MODE=guarded_absence"), true);
  assert.equal(doc.includes("ambiguous request"), true);
  assert.equal(doc.includes("spec conflict"), true);
  assert.equal(doc.includes("target is not confirmed"), true);
});

test("guarded semi-automation doc defines required checks and review gate", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(
    doc.includes("guarded-autonomy-required-checks / guarded-policy"),
    true
  );
  assert.equal(doc.includes("guarded-autonomy-required-checks / test"), true);
  assert.equal(doc.includes("code owner review required"), true);
});

test("required checks workflow includes guarded-policy and test jobs", () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");
  assert.equal(workflow.includes("name: guarded-autonomy-required-checks"), true);
  assert.equal(workflow.includes("guarded-policy:"), true);
  assert.equal(workflow.includes("test:"), true);
});

test("CODEOWNERS file exists for review gate wiring", () => {
  const codeowners = fs.readFileSync(CODEOWNERS_PATH, "utf8");
  assert.equal(codeowners.includes("@marushu"), true);
});
