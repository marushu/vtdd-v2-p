import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const CONTRACT_PATH = "docs/butler/thread-independent-startup-contract.md";

test("thread-independent startup contract captures cross-surface drift guardrails", () => {
  const doc = fs.readFileSync(CONTRACT_PATH, "utf8");

  assert.equal(doc.includes("Issue: #344"), true);
  assert.equal(doc.includes("without depending on the memory of one chat thread"), true);
  assert.equal(doc.includes("threadLocalAssumptionsPromoted=false"), true);
  assert.equal(doc.includes("Butler, mac Codex, and VPS Codex CLI"), true);
  assert.equal(doc.includes("Store checkpoint/savepoint/current verification records as"), true);
  assert.equal(doc.includes("`working_memory`"), true);
  assert.equal(doc.includes("Use `decision_log` only for rationale-backed decisions"), true);
  assert.equal(doc.includes("VTDD is iPhone/iPad-first"), true);
  assert.equal(doc.includes("Butler -> VPS Codex CLI"), true);
  assert.equal(doc.includes("do not silently"), true);
  assert.equal(doc.includes("Close comments are optional"), true);
  assert.equal(doc.includes("does not complete Issue #344 by itself"), true);
});

test("AGENTS and Butler setup docs reference the thread-independent startup contract", () => {
  const agents = fs.readFileSync("AGENTS.md", "utf8");
  const instructions = fs.readFileSync("docs/setup/custom-gpt-instructions.md", "utf8");
  const short = fs.readFileSync("docs/setup/custom-gpt-instructions-short.md", "utf8");
  const shortMin = fs.readFileSync("docs/setup/custom-gpt-instructions-short-min.md", "utf8");

  assert.equal(agents.includes(CONTRACT_PATH), true);
  assert.equal(agents.includes("threadLocalAssumptionsPromoted=false"), true);
  assert.equal(instructions.includes(CONTRACT_PATH), true);
  assert.equal(instructions.includes("threadLocalAssumptionsPromoted=false"), true);
  assert.equal(instructions.includes("Butler -> VPS Codex CLI"), true);
  assert.equal(instructions.includes("do not add noisy closure comments by default"), true);
  assert.equal(short.includes("Startup: call vtddStartupPreflight"), true);
  assert.equal(shortMin.includes("Thread startup: vtddStartupPreflight"), true);
});
