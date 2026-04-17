import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const BOOTSTRAP_PLAN_PATH = path.join(process.cwd(), "docs", "mvp", "bootstrap-plan.md");
const HANDOFF_PATH = path.join(process.cwd(), "docs", "mvp", "next-step-handoff.md");

test("bootstrap plan reflects current execution anchor and completion tracker", () => {
  const doc = fs.readFileSync(BOOTSTRAP_PLAN_PATH, "utf8");
  assert.equal(doc.includes("`#13` is the canonical execution anchor for MVP bootstrap"), true);
  assert.equal(doc.includes("`docs/mvp/issue-to-e2e-matrix.md`"), true);
  assert.equal(doc.includes("repository completion remains `partial`"), true);
  assert.equal(doc.includes("mapped run evidence and human closure judgment"), true);
  assert.equal(doc.includes("`#105` Secure Worker Secret Bootstrap"), true);
});

test("next-step handoff reflects close-readiness phase after matrix evidence exists", () => {
  const doc = fs.readFileSync(HANDOFF_PATH, "utf8");
  assert.equal(doc.includes("`#13` has already been rewritten as the MVP execution anchor"), true);
  assert.equal(doc.includes("mapped E2E run evidence is now present across the matrix"), true);
  assert.equal(doc.includes("close-readiness and current-reading alignment"), true);
  assert.equal(doc.includes("sync local `main` with `origin/main`"), true);
  assert.equal(doc.includes("do not treat docs-only progress as end-to-end completion"), true);
});
