import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const CONTRACT_PATH = path.join(process.cwd(), "docs", "mvp", "live-verified-contract.md");
const OVERVIEW_PATH = path.join(process.cwd(), "docs", "vision", "vtdd-v2-overview.md");

test("live verified contract defines human-observable completion and insufficient evidence", () => {
  const doc = fs.readFileSync(CONTRACT_PATH, "utf8");

  assert.equal(doc.includes("`live_verified` must mean human-observable external evidence."), true);
  assert.equal(doc.includes("- a file existing in the repository"), true);
  assert.equal(doc.includes("- a Codex task summary"), true);
  assert.equal(doc.includes("- an internal runtime flag"), true);
  assert.equal(doc.includes("- a docs-only contract"), true);
});

test("live verified contract fixes canonical status vocabulary", () => {
  const doc = fs.readFileSync(CONTRACT_PATH, "utf8");

  assert.equal(doc.includes("`docs_only`"), true);
  assert.equal(doc.includes("`code_only`"), true);
  assert.equal(doc.includes("`surface_connected`"), true);
  assert.equal(doc.includes("`live_verified`"), true);
});

test("live verified contract covers human-observable evidence for key VTDD operations", () => {
  const doc = fs.readFileSync(CONTRACT_PATH, "utf8");

  assert.equal(doc.includes("### Repository listing"), true);
  assert.equal(doc.includes("### Issue listing/detail"), true);
  assert.equal(doc.includes("### PR create/update"), true);
  assert.equal(doc.includes("### Review comment arrival"), true);
  assert.equal(doc.includes("### Butler synthesis over PR/review/CI truth"), true);
  assert.equal(doc.includes("### Merge"), true);
  assert.equal(doc.includes("### Issue close"), true);
});

test("overview points current completion reading at human-observable live verification", () => {
  const doc = fs.readFileSync(OVERVIEW_PATH, "utf8");

  assert.equal(doc.includes("`live_verified` in this repository means human-observable external evidence"), true);
});
