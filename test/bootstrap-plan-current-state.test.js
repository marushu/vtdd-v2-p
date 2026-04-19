import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const BOOTSTRAP_PLAN_PATH = path.join(process.cwd(), "docs", "mvp", "bootstrap-plan.md");
const HANDOFF_PATH = path.join(process.cwd(), "docs", "mvp", "next-step-handoff.md");

test("bootstrap plan reflects historical mvp anchor and current bootstrap parent", () => {
  const doc = fs.readFileSync(BOOTSTRAP_PLAN_PATH, "utf8");
  assert.equal(doc.includes("`#13` remains the historical MVP core execution anchor"), true);
  assert.equal(doc.includes("`#182` bootstrap automation and service connection parent"), true);
  assert.equal(doc.includes("`docs/mvp/issue-to-e2e-matrix.md`"), true);
  assert.equal(doc.includes("`docs/security/setup-wizard-approval-bound-automation-path.md`"), true);
  assert.equal(doc.includes("bootstrap/setup path also reaches intended live usability"), true);
  assert.equal(doc.includes("`#105` Secure Worker Secret Bootstrap"), true);
});

test("next-step handoff reflects bootstrap architecture main-line work", () => {
  const doc = fs.readFileSync(HANDOFF_PATH, "utf8");
  assert.equal(doc.includes("current main-line work is now bootstrap architecture and service connection design under `#182` and its children"), true);
  assert.equal(doc.includes("setup/bootstrap still blocks the intended iPhone-first entry experience"), true);
  assert.equal(doc.includes("bootstrap architecture and service connection boundary definition"), true);
  assert.equal(doc.includes("sync local `main` with `origin/main`"), true);
  assert.equal(doc.includes("do not treat docs-only progress as end-to-end completion"), true);
});
