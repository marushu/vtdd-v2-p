import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const README_PATH = path.join(process.cwd(), "README.md");
const INSTRUCTIONS_PATH = path.join(process.cwd(), "docs", "setup", "custom-gpt-instructions.md");
const OPENAPI_PATH = path.join(process.cwd(), "docs", "setup", "custom-gpt-actions-openapi.yaml");

test("custom gpt setup artifacts exist as tracked setup docs", () => {
  assert.equal(fs.existsSync(INSTRUCTIONS_PATH), true);
  assert.equal(fs.existsSync(OPENAPI_PATH), true);
});

test("readme points to current custom gpt setup artifacts", () => {
  const readme = fs.readFileSync(README_PATH, "utf8");
  assert.equal(readme.includes("docs/setup/custom-gpt-instructions.md"), true);
  assert.equal(readme.includes("docs/setup/custom-gpt-actions-openapi.yaml"), true);
});

test("custom gpt instructions preserve current butler and approval boundaries", () => {
  const doc = fs.readFileSync(INSTRUCTIONS_PATH, "utf8");
  assert.equal(doc.includes("Issue as the canonical execution spec"), true);
  assert.equal(doc.includes("Do not assume a default repository."), true);
  assert.equal(doc.includes("vtddGateway"), true);
  assert.equal(doc.includes("vtddExecute"), true);
  assert.equal(doc.includes("vtddExecutionProgress"), true);
  assert.equal(doc.includes("High-risk actions require GO + passkey."), true);
  assert.equal(doc.includes("Do not claim a PR exists when only a Codex task summary exists."), true);
});

test("custom gpt openapi doc exposes current gateway, execute, and progress routes", () => {
  const doc = fs.readFileSync(OPENAPI_PATH, "utf8");
  assert.equal(doc.includes("openapi: 3.1.0"), true);
  assert.equal(doc.includes("/v2/gateway:"), true);
  assert.equal(doc.includes("/v2/action/execute:"), true);
  assert.equal(doc.includes("/v2/action/progress:"), true);
  assert.equal(doc.includes("/v2/retrieve/approval-grant:"), true);
  assert.equal(doc.includes("GatewayBearerAuth"), true);
  assert.equal(doc.includes("conversation:"), true);
  assert.equal(doc.includes("repositoryInput:"), true);
  assert.equal(doc.includes("issueNumber"), true);
});
