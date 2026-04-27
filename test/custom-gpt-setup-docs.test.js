import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const README_PATH = path.join(process.cwd(), "README.md");
const INSTRUCTIONS_PATH = path.join(process.cwd(), "docs", "setup", "custom-gpt-instructions.md");
const OPENAPI_PATH = path.join(process.cwd(), "docs", "setup", "custom-gpt-actions-openapi.yaml");
const OPENAPI_JSON_PATH = path.join(
  process.cwd(),
  "docs",
  "setup",
  "custom-gpt-actions-openapi.json"
);

test("custom gpt setup artifacts exist as tracked setup docs", () => {
  assert.equal(fs.existsSync(INSTRUCTIONS_PATH), true);
  assert.equal(fs.existsSync(OPENAPI_PATH), true);
  assert.equal(fs.existsSync(OPENAPI_JSON_PATH), true);
});

test("readme points to current custom gpt setup artifacts", () => {
  const readme = fs.readFileSync(README_PATH, "utf8");
  assert.equal(readme.includes("docs/setup/custom-gpt-instructions.md"), true);
  assert.equal(readme.includes("docs/setup/custom-gpt-actions-openapi.yaml"), true);
  assert.equal(readme.includes("docs/setup/custom-gpt-actions-openapi.json"), true);
});

test("custom gpt instructions preserve current butler and approval boundaries", () => {
  const doc = fs.readFileSync(INSTRUCTIONS_PATH, "utf8");
  assert.equal(doc.includes("Issue as the canonical execution spec"), true);
  assert.equal(doc.includes("Do not assume a default repository."), true);
  assert.equal(doc.includes("vtddGateway"), true);
  assert.equal(doc.includes("vtddExecute"), true);
  assert.equal(doc.includes("vtddWriteGitHub"), true);
  assert.equal(doc.includes("vtddGitHubAuthority"), true);
  assert.equal(doc.includes("vtddDeployProduction"), true);
  assert.equal(doc.includes("vtddExecutionProgress"), true);
  assert.equal(doc.includes("vtddRetrieveGitHub"), true);
  assert.equal(doc.includes("vtddUpsertRepositoryNickname"), true);
  assert.equal(doc.includes("vtddRetrieveRepositoryNicknames"), true);
  assert.equal(doc.includes("vtddRetrieveSetupArtifact"), true);
  assert.equal(doc.includes("vtddRetrieveSelfParity"), true);
  assert.equal(doc.includes("when the user says `君`, `自分`, `Butler`, `VTDD`, or `このGPT`"), true);
  assert.equal(doc.includes("`君自身のアップデートある？`"), true);
  assert.equal(doc.includes("`古くなってない？`"), true);
  assert.equal(doc.includes("Nickname memory is explicit user-owned alias registry data"), true);
  assert.equal(doc.includes("prefer vtddRetrieveSelfParity over general model-capability disclaimers"), true);
  assert.equal(doc.includes("Before the first significant GitHub/runtime action in a session"), true);
  assert.equal(doc.includes("Cloudflare deploy update required"), true);
  assert.equal(doc.includes("selfParity.deployRecovery.operatorUrl"), true);
  assert.equal(doc.includes("open it on iPhone/mobile"), true);
  assert.equal(doc.includes("High-risk actions require GO + passkey."), true);
  assert.equal(doc.includes("Merge requires explicit human GO + real passkey."), true);
  assert.equal(doc.includes("Action Schema update required"), true);
  assert.equal(doc.includes("Instructions update required"), true);
  assert.equal(doc.includes("runtime is in sync, do not overclaim that the current Custom GPT editor is also in sync"), true);
  assert.equal(doc.includes("Do not claim a PR exists when only a Codex task summary exists."), true);
  assert.equal(
    doc.includes("Do not claim that Issues/PRs/comments are absent when the read path is unsupported, unauthorized, or unverified."),
    true
  );
});

test("custom gpt openapi doc exposes current gateway, execute, and progress routes", () => {
  const doc = fs.readFileSync(OPENAPI_PATH, "utf8");
  assert.equal(doc.includes("openapi: 3.1.0"), true);
  assert.equal(doc.includes("/v2/gateway:"), true);
  assert.equal(doc.includes("/v2/action/execute:"), true);
  assert.equal(doc.includes("/v2/action/github:"), true);
  assert.equal(doc.includes("/v2/action/github-authority:"), true);
  assert.equal(doc.includes("/v2/action/deploy:"), true);
  assert.equal(doc.includes("/v2/action/repository-nickname:"), true);
  assert.equal(doc.includes("/v2/action/progress:"), true);
  assert.equal(doc.includes("/v2/retrieve/github:"), true);
  assert.equal(doc.includes("/v2/retrieve/repository-nicknames:"), true);
  assert.equal(doc.includes("/v2/retrieve/setup-artifact:"), true);
  assert.equal(doc.includes("/v2/retrieve/self-parity:"), true);
  assert.equal(doc.includes("/v2/retrieve/approval-grant:"), true);
  assert.equal(doc.includes("GatewayBearerAuth"), true);
  assert.equal(doc.includes("conversation:"), true);
  assert.equal(doc.includes("repositoryInput:"), true);
  assert.equal(doc.includes("issueNumber"), true);
  assert.equal(doc.includes("pullNumber"), true);
  assert.equal(doc.includes("workflow_runs"), true);
});

test("custom gpt openapi keeps components.schemas while avoiding nested field refs", () => {
  const doc = fs.readFileSync(OPENAPI_PATH, "utf8");
  assert.equal(doc.includes("components:"), true);
  assert.equal(doc.includes("schemas:"), true);
  assert.equal(doc.includes("VtddGenericResponse:"), true);
  assert.equal(doc.includes('#/components/schemas/VtddGatewayRequest'), true);
  assert.equal(doc.includes("requestBody:"), true);
  assert.equal(doc.includes("policyInput:"), true);
  assert.equal(doc.includes("conversation:"), true);
  assert.equal(doc.includes("policyInput:\n          $ref:"), false);
  assert.equal(doc.includes("surfaceContext:\n          $ref:"), false);
  assert.equal(doc.includes("conversation:\n          $ref:"), false);
  assert.equal(doc.includes("items:\n            $ref:"), false);
});

test("custom gpt openapi json parses and exposes paths as an object", () => {
  const doc = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf8"));
  assert.equal(doc.openapi, "3.1.0");
  assert.equal(typeof doc.paths, "object");
  assert.notEqual(doc.paths, null);
  assert.equal(typeof doc.paths["/v2/gateway"], "object");
  assert.equal(typeof doc.paths["/v2/action/execute"], "object");
  assert.equal(typeof doc.paths["/v2/action/github"], "object");
  assert.equal(typeof doc.paths["/v2/action/github-authority"], "object");
  assert.equal(typeof doc.paths["/v2/action/deploy"], "object");
  assert.equal(typeof doc.paths["/v2/action/repository-nickname"], "object");
  assert.equal(typeof doc.paths["/v2/action/progress"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/github"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/repository-nicknames"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/setup-artifact"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/self-parity"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/approval-grant"], "object");
  assert.equal(typeof doc.components.schemas, "object");
  assert.equal(doc.components.securitySchemes.GatewayBearerAuth.scheme, "bearer");
});
