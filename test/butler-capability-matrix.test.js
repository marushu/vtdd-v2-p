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

  assert.equal(doc.includes("| natural GO -> issue_create | `source-only` |"), true);
  assert.equal(doc.includes("#151 remains open because iPhone Butler live evidence is missing"), true);
  assert.equal(doc.includes("| closed issue list read | `broken-live` |"), true);
  assert.equal(doc.includes("| `@codex` handoff comment | `unverified` |"), true);
  assert.equal(doc.includes("| Butler -> Codex Cloud pickup | `unverified` |"), true);
  assert.equal(doc.includes("| self-parity check | `verified-live` |"), true);
});

test("Butler capability matrix prioritizes the Butler-to-Codex path and surface guidance", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  assert.equal(doc.includes("Butler -> Codex handoff progress"), true);
  assert.equal(doc.includes("requested/queued/picked up/branch/PR/failed"), true);
  assert.equal(doc.includes("Surface update guidance"), true);
  assert.equal(doc.includes("Instructions/Action Schema/Cloudflare deploy links"), true);
  assert.equal(doc.includes("live Butler/iPhone validation phrase"), true);
  assert.equal(doc.includes("expected GitHub/runtime evidence"), true);
});
