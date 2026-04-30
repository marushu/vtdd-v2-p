import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "butler", "capability-matrix.md");

test("Butler capability matrix records live/source/unverified status without overclaiming", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  assert.equal(doc.includes("Issue: #153"), true);
  assert.equal(doc.includes("iPhone/mobile conversation"), true);
  assert.equal(doc.includes("Do not report `source-only` as done."), true);
  assert.equal(doc.includes("Do not report `requested` handoff as Codex"), true);

  assert.equal(doc.includes("| natural GO -> normal GitHub write | `partial-live` |"), true);
  assert.equal(doc.includes("registry-backed binding to `issue_create`, `issue_comment_create`, and `pull_comment_create`"), true);
  assert.equal(doc.includes("Live Butler happy-path evidence now exists for all three configured operations"), true);
  assert.equal(doc.includes("Boundary failures remain unverified"), true);
  assert.equal(doc.includes("| issue create | `verified-live` |"), true);
  assert.equal(doc.includes("https://github.com/marushu/vtdd-v2-p/issues/165"), true);
  assert.equal(doc.includes("| issue comment create | `verified-live` |"), true);
  assert.equal(doc.includes("https://github.com/marushu/vtdd-v2-p/issues/161#issuecomment-4351759028"), true);
  assert.equal(doc.includes("| PR comment create | `verified-live` |"), true);
  assert.equal(doc.includes("https://github.com/marushu/vtdd-v2-p/pull/163#issuecomment-4351775751"), true);
  assert.equal(doc.includes("| closed issue list read | `broken-live` |"), true);
  assert.equal(doc.includes("| `@codex` handoff comment | `partial-live` |"), true);
  assert.equal(doc.includes("| Butler -> Codex Cloud pickup | `partial-live` |"), true);
  assert.equal(doc.includes("| Codex fallback as VTDD reviewer | `partial-live` |"), true);
  assert.equal(doc.includes("#156 tracks this contract gap"), true);
  assert.equal(doc.includes("| self-parity check | `verified-live` |"), true);
});

test("Butler capability matrix prioritizes the Butler-to-Codex path and surface guidance", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  assert.equal(doc.includes("Butler -> Codex development handoff progress"), true);
  assert.equal(doc.includes("requested/queued/blocked/branch/PR (#157)"), true);
  assert.equal(doc.includes("Surface update guidance"), true);
  assert.equal(doc.includes("Instructions/Action Schema/Cloudflare deploy links"), true);
  assert.equal(doc.includes("`natural GO -> normal GitHub write` boundary proof (#151/#161)"), true);
  assert.equal(doc.includes("live Butler/iPhone validation phrase"), true);
  assert.equal(doc.includes("expected GitHub/runtime evidence"), true);
});
