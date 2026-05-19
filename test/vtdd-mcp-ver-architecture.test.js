import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "architecture", "vtdd-mcp-ver.md");

test("vtdd-mcp-ver architecture doc keeps Butler while converging Mac and VPS on shared truth", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("Butler stays in place"), true);
  assert.equal(doc.includes("Mac Codex"), true);
  assert.equal(doc.includes("VPS Codex CLI"), true);
  assert.equal(doc.includes("same memory, runtime truth, review truth, and implementation recall"), true);
  assert.equal(doc.includes("Butler -> Action Schema -> VTDD core"), true);
  assert.equal(doc.includes("Mac Codex -> MCP -> VTDD core"), true);
  assert.equal(doc.includes("VPS Codex CLI -> MCP -> VTDD core"), true);
});

test("vtdd-mcp-ver architecture doc preserves governance over MCP", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("MCP is an interface layer inside that system."), true);
  assert.equal(doc.includes("MCP is not the source of truth"), true);
  assert.equal(doc.includes("MCP must not create a separate weaker or stronger governance model."), true);
  assert.equal(doc.includes("High-risk operations remain governed by scoped passkey approval."), true);
  assert.equal(doc.includes("MCP is not permanently read-only."), true);
});

test("vtdd-mcp-ver architecture doc defines shared implementation recall contract", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("vtdd_recall_implementation"), true);
  assert.equal(doc.includes("repository"), true);
  assert.equal(doc.includes("related Issue"), true);
  assert.equal(doc.includes("related PR"), true);
  assert.equal(doc.includes("reviewer objections and resolutions"), true);
  assert.equal(doc.includes("\"runtimeStatus\": \"merged | open_pr | stale | unknown\""), true);
});

test("vtdd-mcp-ver architecture doc maps preserved assets and harness boundary", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("Keep As Core"), true);
  assert.equal(doc.includes("Expose Through MCP"), true);
  assert.equal(doc.includes("Keep Action Schema Only For Now"), true);
  assert.equal(doc.includes("Codex App Server / exec-server"), true);
  assert.equal(doc.includes("Current VPS execution is a user-owned Codex CLI process wrapper."), true);
});

test("vtdd-mcp-ver architecture doc defines canonical Codex MCP bridge path", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("Canonical Codex MCP Connection"), true);
  assert.equal(doc.includes("VTDD_MCP_TOKEN"), true);
  assert.equal(doc.includes("codex mcp add vtdd --url https://your-vtdd-runtime.example.com/mcp --bearer-token-env-var VTDD_MCP_TOKEN"), true);
  assert.equal(doc.includes("default_tools_approval_mode=\"approve\""), true);
  assert.equal(doc.includes("approval_mode=\"approve\""), true);
  assert.equal(doc.includes("user cancelled MCP tool call"), true);
  assert.equal(doc.includes("request_user_input"), true);
  assert.equal(doc.includes("bearer-token discovery hints"), true);
});

test("vtdd-mcp-ver architecture doc defines live parity verification across Mac and VPS", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("Live Parity Verification"), true);
  assert.equal(doc.includes("vtdd_review_truth"), true);
  assert.equal(doc.includes("PR #328 の review truth"), true);
  assert.equal(doc.includes("Issue #318 の implementation recall"), true);
  assert.equal(doc.includes("connection established but parity incomplete"), true);
  assert.equal(doc.includes("Do not describe one-sided success as shared-memory/shared-truth completion."), true);
});
