import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const README_PATH = path.join(process.cwd(), "README.md");
const INSTRUCTIONS_PATH = path.join(process.cwd(), "docs", "setup", "custom-gpt-instructions.md");
const SHORT_INSTRUCTIONS_PATH = path.join(
  process.cwd(),
  "docs",
  "setup",
  "custom-gpt-instructions-short.md"
);
const SHORT_MIN_INSTRUCTIONS_PATH = path.join(
  process.cwd(),
  "docs",
  "setup",
  "custom-gpt-instructions-short-min.md"
);
const OPENAPI_PATH = path.join(process.cwd(), "docs", "setup", "custom-gpt-actions-openapi.yaml");
const OPENAPI_JSON_PATH = path.join(
  process.cwd(),
  "docs",
  "setup",
  "custom-gpt-actions-openapi.json"
);

test("custom gpt setup artifacts exist as tracked setup docs", () => {
  assert.equal(fs.existsSync(INSTRUCTIONS_PATH), true);
  assert.equal(fs.existsSync(SHORT_INSTRUCTIONS_PATH), true);
  assert.equal(fs.existsSync(SHORT_MIN_INSTRUCTIONS_PATH), true);
  assert.equal(fs.existsSync(OPENAPI_PATH), true);
  assert.equal(fs.existsSync(OPENAPI_JSON_PATH), true);
});

test("readme points to current custom gpt setup artifacts", () => {
  const readme = fs.readFileSync(README_PATH, "utf8");
  assert.equal(readme.includes("docs/setup/custom-gpt-instructions.md"), true);
  assert.equal(readme.includes("docs/setup/custom-gpt-instructions-short.md"), true);
  assert.equal(readme.includes("docs/setup/custom-gpt-instructions-short-min.md"), true);
  assert.equal(readme.includes("canonical minimal"), true);
  assert.equal(readme.includes("expanded editor paste\n  target"), true);
  assert.equal(readme.includes("full reference and setup\n  artifact source"), true);
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
  assert.equal(doc.includes("vtddSyncGitHubActionsSecret"), true);
  assert.equal(doc.includes("vtddExecutionProgress"), true);
  assert.equal(doc.includes("vtddRetrieveGitHub"), true);
  assert.equal(doc.includes("vtddUpsertRepositoryNickname"), true);
  assert.equal(doc.includes("vtddDeleteRepositoryNickname"), true);
  assert.equal(doc.includes("vtddRetrieveRepositoryNicknames"), true);
  assert.equal(doc.includes("vtddRetrieveSetupArtifact"), true);
  assert.equal(doc.includes("vtddRetrieveSelfParity"), true);
  assert.equal(doc.includes("vtddRetrieveConstitution"), true);
  assert.equal(doc.includes("vtddRetrieveDecisionLogs"), true);
  assert.equal(doc.includes("vtddRetrieveProposalLogs"), true);
  assert.equal(doc.includes("vtddRetrieveCrossMemory"), true);
  assert.equal(doc.includes("Before proposing an Issue, GitHub write, Codex handoff, or PR next action"), true);
  assert.equal(doc.includes("no relevant RAG/memory hit is found, say so"), true);
  assert.equal(doc.includes("do not invent past precedent"), true);
  assert.equal(doc.includes("current state is governed by GitHub runtime truth"), true);
  assert.equal(doc.includes("Current natural GO\n  binding is supported for `issue_create`, `issue_comment_create`, and\n  `pull_comment_create`"), true);
  assert.equal(doc.includes("If the human says something like \"この内容で Issue 作って\""), true);
  assert.equal(doc.includes("この title/body で Issue を作成するなら「GO」と言ってください"), true);
  assert.equal(doc.includes("Do not ask the human to say `targetConfirmed=true`"), true);
  assert.equal(doc.includes("naturalApproval.exactPayloadPresented=true"), true);
  assert.equal(doc.includes("Do not ask the user to author internal `policyInput`, `judgmentTrace`, or"), true);
  assert.equal(doc.includes("Do not invent step names such as `issue_retrieval`"), true);
  assert.equal(doc.includes("Do not ask the human to supply internal constitution flags"), true);
  assert.equal(doc.includes("The Action Schema must expose `build` only under `vtddExecute`"), true);
  assert.equal(doc.includes("For vtddExecute Codex handoff, use `policyInput.actionType=build`"), true);
  assert.equal(doc.includes("policyInput.issueTraceability` includes real Intent / Success Criteria / Non-goals refs"), true);
  assert.equal(doc.includes("continuationContext.requiresHandoff=true"), true);
  assert.equal(doc.includes("short natural GO tied to the user's visible intent"), true);
  assert.equal(doc.includes("do not make the human write or understand those internal fields"), true);
  assert.equal(doc.includes("Gemini が指摘している修正を Codex に進めさせます"), true);
  assert.equal(doc.includes("exact bounded handoff payload"), false);
  assert.equal(
    doc.includes(
      "the first four judgmentTrace steps must be exactly:\n  1. constitution\n  2. runtime_truth\n  3. issue_context\n  4. current_query"
    ),
    true
  );
  assert.equal(doc.includes("when the user says `君`, `自分`, `Butler`, `VTDD`, or `このGPT`"), true);
  assert.equal(doc.includes("`君自身のアップデートある？`"), true);
  assert.equal(doc.includes("`古くなってない？`"), true);
  assert.equal(doc.includes("Nickname memory is explicit user-owned alias registry data"), true);
  assert.equal(doc.includes("such as `ぶい の本番にデプロイして`"), true);
  assert.equal(doc.includes("vtddDeleteRepositoryNickname"), true);
  assert.equal(doc.includes("do not use empty `nicknames` with `replace` as a deletion shortcut"), true);
  assert.equal(doc.includes("before asking the human to restate the repository"), true);
  assert.equal(doc.includes("A nickname retrieval failure is not proof that the nickname is unknown"), true);
  assert.equal(doc.includes("approvalGrant.scope.repositoryInput"), true);
  assert.equal(doc.includes("unverified fallback candidate"), true);
  assert.equal(doc.includes("prefer vtddRetrieveSelfParity over general model-capability disclaimers"), true);
  assert.equal(doc.includes("Before the first significant GitHub/runtime action in a session"), true);
  assert.equal(doc.includes("Cloudflare deploy update required"), true);
  assert.equal(doc.includes("selfParity.deployRecovery.operatorUrl"), true);
  assert.equal(doc.includes("open it on iPhone/mobile"), true);
  assert.equal(doc.includes("Never show only the relative `/v2/approval/passkey/operator...` path"), true);
  assert.equal(doc.includes("never paste a bare long URL that can be truncated"), true);
  assert.equal(doc.includes("still provide `selfParity.deployOperatorMarkdownLink`"), true);
  assert.equal(doc.includes("render `selfParity.deployOperatorUrl` as a short Markdown link"), true);
  assert.equal(doc.includes("phase=execution"), true);
  assert.equal(doc.includes("High-risk actions require GO + passkey."), true);
  assert.equal(doc.includes("Merge requires explicit human GO + real passkey."), true);
  assert.equal(doc.includes("Action Schema update required"), true);
  assert.equal(doc.includes("Instructions update required"), true);
  assert.equal(doc.includes("runtime is in sync, do not overclaim that the current Custom GPT editor is also in sync"), true);
  assert.equal(doc.includes("surface the returned `error`, `reason`, and `issues` plainly in Japanese"), true);
  assert.equal(doc.includes("Do not collapse nickname failures into vague guesses"), true);
  assert.equal(doc.includes("If the Action surface reports `ClientResponseError`"), true);
  assert.equal(doc.includes("report it as an unverified Action transport failure"), true);
  assert.equal(doc.includes("If vtddDeployProduction fails, tell the user the exact deploy `error`, `reason`, and `issues`"), true);
  assert.equal(doc.includes("Executor transport is pluggable and user-owned."), true);
  assert.equal(
    doc.includes("For normal bounded Codex handoff, call the existing `vtddExecute` Action with `executorTransport=vps_runner`"),
    true
  );
  assert.equal(doc.includes("do not create or require a separate Custom GPT Action for VPS handoff"), true);
  assert.equal(doc.includes("Default transport is `vps_runner` for this runtime"), true);
  assert.equal(doc.includes("codex_cloud_cli_control_runner"), true);
  assert.equal(doc.includes("vtdd-v2-secret` is owner-specific example/evidence"), true);
  assert.equal(doc.includes("vps_runner"), true);
  assert.equal(doc.includes("openai_api_key_not_configured"), true);
  assert.equal(doc.includes("never echo the secret value"), true);
  assert.equal(doc.includes("A completed `vtdd:reviewer=codex-fallback` marker comment"), true);
  assert.equal(doc.includes("trusted VTDD-controlled actor, Codex Cloud reviewer result, or GitHub App token path"), true);
  assert.equal(doc.includes("do not treat missing GitHub Review API objects alone as missing reviewer evidence"), true);
  assert.equal(doc.includes("Do not claim a PR exists when only a Codex task summary exists."), true);
  assert.equal(
    doc.includes("Do not claim that Issues/PRs/comments are absent when the read path is unsupported, unauthorized, or unverified."),
    true
  );
});

test("short custom gpt instructions stay under editor limits while preserving critical boundaries", () => {
  const doc = fs.readFileSync(SHORT_INSTRUCTIONS_PATH, "utf8");
  assert.equal(doc.length <= 7900, true);
  assert.equal(doc.includes("Do not assume a default repository."), true);
  assert.equal(doc.includes("vtddGateway"), true);
  assert.equal(doc.includes("vtddRetrieveGitHub"), true);
  assert.equal(doc.includes("vtddRetrieveSelfParity"), true);
  assert.equal(doc.includes("vtddDeployProduction"), true);
  assert.equal(doc.includes("vtddSyncGitHubActionsSecret"), true);
  assert.equal(doc.includes("vtddUpsertRepositoryNickname"), true);
  assert.equal(doc.includes("vtddDeleteRepositoryNickname"), true);
  assert.equal(doc.includes("vtddRetrieveRepositoryNicknames"), true);
  assert.equal(doc.includes("vtddRetrieveCrossMemory"), true);
  assert.equal(doc.includes("vtddRetrieveDecisionLogs"), true);
  assert.equal(doc.includes("vtddRetrieveProposalLogs"), true);
  assert.equal(doc.includes("vtddRetrieveConstitution"), true);
  assert.equal(doc.includes("no RAG hit OK"), true);
  assert.equal(doc.includes("never invent"), true);
  assert.equal(doc.includes("Runtime truth > memory"), true);
  assert.equal(doc.includes("For normal GO writes (`issue_create`, `issue_comment_create`, `pull_comment_create`)"), true);
  assert.equal(doc.includes("ask only `GO`"), true);
  assert.equal(doc.includes("Never ask targetConfirmed/approvalScopeMatched/approvalPhrase/raw JSON"), true);
  assert.equal(doc.includes("Nickname memory is user-owned alias data"), true);
  assert.equal(doc.includes("non-owner/repo token like `ぶい の...`"), true);
  assert.equal(doc.includes("call nickname read/gateway first"), true);
  assert.equal(doc.includes("Nickname read failure is not proof of unknown repo"), true);
  assert.equal(doc.includes("approvalGrant.scope.repositoryInput"), true);
  assert.equal(doc.includes("unverified fallback"), true);
  assert.equal(doc.includes("surface error/reason/issues"), true);
  assert.equal(doc.includes("surface error/reason/issues"), true);
  assert.equal(doc.includes("If Action returns `ClientResponseError`, state action"), true);
  assert.equal(doc.includes("If self-parity returns `ClientResponseError`, say unverified transport failure"), true);
  assert.equal(doc.includes("judgmentModelId=vtdd-butler-core-v1"), true);
  assert.equal(doc.includes("vtddExecute handoff: actionType=build"), true);
  assert.equal(doc.includes("PR feedback fix => revise_pr"), true);
  assert.equal(doc.includes("short natural GO tied to the visible intent"), true);
  assert.equal(doc.includes("Gemini が指摘している修正を Codex に進めさせます"), true);
  assert.equal(doc.includes("Executor transport is pluggable and user-owned"), true);
  assert.equal(doc.includes("Current default for Codex task handoff is the user-owned VPS"), true);
  assert.equal(doc.includes("executorTransport=vps_runner"), true);
  assert.equal(doc.includes("Do not add a separate GPT Action for VPS handoff"), true);
  assert.equal(doc.includes("codex_cloud_cli_control_runner"), true);
  assert.equal(doc.includes("vps_runner"), true);
  assert.equal(doc.includes("requiresHandoff=true"), true);
  assert.equal(doc.includes("Do not dispatch `wait_for_review`"), true);
  assert.equal(doc.includes("issueTraceability Intent/SC/Non-goal refs"), true);
  assert.equal(
    doc.includes("judgmentTrace first four steps exactly: constitution, runtime_truth, issue_context, current_query"),
    true
  );
  assert.equal(doc.includes("No constitutionConsulted input"), true);
  assert.equal(doc.includes("Schema: build only under vtddExecute"), true);
  assert.equal(doc.includes("Cloudflare deploy update required"), true);
  assert.equal(doc.includes("Action Schema update required"), true);
  assert.equal(doc.includes("Instructions update required"), true);
  assert.equal(doc.includes("selfParity.deployRecovery.operatorMarkdownLink or operatorUrl"), true);
  assert.equal(doc.includes("selfParity.deployOperatorMarkdownLink"), true);
  assert.equal(doc.includes("<actual selfParity.deployOperatorUrl>"), true);
  assert.equal(doc.includes("never raw `/v2/approval/passkey/operator...`"), true);
  assert.equal(doc.includes("bare URL"), true);
  assert.equal(doc.includes("phase=execution"), true);
  assert.equal(doc.includes("GO + real passkey"), true);
  assert.equal(doc.includes("openai_api_key_not_configured"), true);
  assert.equal(doc.includes("If vtddDeployProduction fails, say the exact deploy error/reason/issues"), true);
  assert.equal(
    doc.includes("Completed `vtdd:reviewer=codex-fallback` from trusted VTDD actor/Codex Cloud result with recommendedAction is evidence"),
    true
  );
  assert.equal(doc.includes("missing GitHub Review objects alone is not absence"), true);
});

test("short-min custom gpt instructions stay pasteable while preserving critical invariants", () => {
  const doc = fs.readFileSync(SHORT_MIN_INSTRUCTIONS_PATH, "utf8");

  assert.equal(doc.length < 7900, true);
  assert.equal(doc.includes("minimal Custom GPT paste target"), true);
  assert.equal(doc.includes("custom-gpt-instructions.md` is the full canonical reference"), true);
  assert.equal(doc.includes("custom-gpt-instructions-short.md` is the expanded paste target"), true);

  const criticalTokens = [
    "Issue is canonical spec",
    "GitHub/runtime state is progress truth",
    "Do not assume a default repository.",
    "vtddExecute handoff must use actionType=build",
    "requiresHandoff=true",
    "issueTraceability Intent/SC/Non-goal refs",
    "issueContext.issueNumber",
    "policyInput.issueTraceability.relatedIssue",
    "continuationContext.handoff.relatedIssue",
    "GO + real passkey",
    "show exact title/body/comment/update payload",
    "Preserve reviewer objections",
    "vtddRetrieveSelfParity",
    "Remote Codex build invariant",
    "Executor transport is pluggable and user-owned",
    "executorTransport=vps_runner",
    "No merge, deploy, secret/settings/permission mutation, issue close",
    "No owner-specific runtime URL/account/bootstrap value"
  ];

  for (const token of criticalTokens) {
    assert.equal(doc.includes(token), true, `missing short-min invariant: ${token}`);
  }
});

test("custom gpt openapi doc exposes current gateway, execute, and progress routes", () => {
  const doc = fs.readFileSync(OPENAPI_PATH, "utf8");
  assert.match(doc, /openapi:\s+3\.(0|1)\.\d+/);
  assert.equal(doc.includes("/v2/gateway:"), true);
  assert.equal(doc.includes("/v2/action/execute:"), true);
  assert.equal(doc.includes("/v2/action/github:"), true);
  assert.equal(doc.includes("/v2/action/github-authority:"), true);
  assert.equal(doc.includes("/v2/action/deploy:"), true);
  assert.equal(doc.includes("/v2/action/github-actions-secret:"), true);
  assert.equal(doc.includes("/v2/action/repository-nickname:"), true);
  assert.equal(doc.includes("/v2/action/repository-nickname/delete:"), true);
  assert.equal(doc.includes("/v2/action/progress:"), true);
  assert.equal(doc.includes("/v2/retrieve/github:"), true);
  assert.equal(doc.includes("/v2/retrieve/repository-nicknames:"), true);
  assert.equal(doc.includes("/v2/retrieve/setup-artifact:"), true);
  assert.equal(doc.includes("/v2/retrieve/self-parity:"), true);
  assert.equal(doc.includes("/v2/retrieve/approval-grant:"), true);
  assert.equal(doc.includes("/v2/retrieve/constitution:"), true);
  assert.equal(doc.includes("/v2/retrieve/decisions:"), true);
  assert.equal(doc.includes("/v2/retrieve/proposals:"), true);
  assert.equal(doc.includes("/v2/retrieve/cross:"), true);
  assert.equal(doc.includes("operationId: vtddRetrieveConstitution"), true);
  assert.equal(doc.includes("operationId: vtddRetrieveDecisionLogs"), true);
  assert.equal(doc.includes("operationId: vtddRetrieveProposalLogs"), true);
  assert.equal(doc.includes("operationId: vtddRetrieveCrossMemory"), true);
  assert.equal(doc.includes("GatewayBearerAuth"), true);
  assert.equal(doc.includes("operationId: getHealth\n      security: []"), true);
  assert.equal(doc.includes("conversation:"), true);
  assert.equal(doc.includes("repositoryInput:"), true);
  assert.equal(doc.includes("issueNumber"), true);
  assert.equal(doc.includes("- issue_create"), true);
  assert.equal(doc.includes("pullNumber"), true);
  assert.equal(doc.includes("workflow_runs"), true);
  assert.equal(doc.includes("enum:\n                - vtdd-butler-core-v1"), true);
  assert.equal(doc.includes("requiresHandoff:"), true);
  assert.equal(doc.includes("- relatedIssue"), true);
  assert.equal(doc.includes("issueTraceability:"), true);
  assert.equal(doc.includes("approvalScopeMatched:"), true);
  assert.equal(doc.includes("naturalApproval:"), true);
  assert.equal(doc.includes("exactPayloadPresented:"), true);
  assert.equal(doc.includes("presentedPayload:"), true);
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
  assert.match(doc.openapi, /^3\.(0|1)\.\d+$/);
  assert.equal(typeof doc.paths, "object");
  assert.notEqual(doc.paths, null);
  assert.equal(typeof doc.paths["/v2/gateway"], "object");
  assert.equal(typeof doc.paths["/v2/action/execute"], "object");
  assert.equal(typeof doc.paths["/v2/action/github"], "object");
  assert.equal(
    doc.paths["/v2/action/github"].post.requestBody.content["application/json"].schema.properties.operation.enum.includes(
      "issue_create"
    ),
    true
  );
  const githubWriteSchema = doc.paths["/v2/action/github"].post.requestBody.content["application/json"].schema;
  assert.equal(typeof githubWriteSchema.properties.naturalApproval, "object");
  assert.deepEqual(githubWriteSchema.properties.naturalApproval.properties.presentedPayload.properties.operation.enum, [
    "issue_create",
    "issue_comment_create",
    "pull_comment_create"
  ]);
  assert.equal(typeof doc.paths["/v2/action/github-authority"], "object");
  assert.equal(typeof doc.paths["/v2/action/deploy"], "object");
  assert.equal(typeof doc.paths["/v2/action/github-actions-secret"], "object");
  assert.equal(typeof doc.paths["/v2/action/repository-nickname"], "object");
  assert.equal(typeof doc.paths["/v2/action/repository-nickname/delete"], "object");
  assert.equal(
    doc.paths["/v2/action/repository-nickname/delete"].post.operationId,
    "vtddDeleteRepositoryNickname"
  );
  assert.equal(typeof doc.paths["/v2/action/progress"], "object");
  assert.deepEqual(
    doc.components.schemas.VtddExecuteRequest.properties.executorTransport.enum,
    [
      "codex_cloud_github_comment",
      "codex_cloud_cli_control_runner",
      "vps_runner",
      "api_key_runner"
    ]
  );
  assert.deepEqual(
    doc.components.schemas.VtddExecuteRequest.properties.continuationContext.properties
      .executorTransport.enum,
    [
      "codex_cloud_github_comment",
      "codex_cloud_cli_control_runner",
      "vps_runner",
      "api_key_runner"
    ]
  );
  assert.deepEqual(
    doc.components.schemas.VtddExecuteRequest.properties.continuationContext.properties
      .codexGoal.enum,
    ["open_pr", "revise_pr", "respond_to_review"]
  );
  assert.deepEqual(
    doc.paths["/v2/action/progress"].get.parameters.find(
      (parameter) => parameter.name === "executorTransport"
    ).schema.enum,
    [
      "codex_cloud_github_comment",
      "codex_cloud_cli_control_runner",
      "vps_runner",
      "api_key_runner"
    ]
  );
  assert.equal(typeof doc.paths["/v2/retrieve/github"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/repository-nicknames"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/setup-artifact"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/self-parity"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/approval-grant"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/constitution"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/decisions"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/proposals"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/cross"], "object");
  assert.equal(doc.paths["/v2/retrieve/constitution"].get.operationId, "vtddRetrieveConstitution");
  assert.equal(doc.paths["/v2/retrieve/decisions"].get.operationId, "vtddRetrieveDecisionLogs");
  assert.equal(doc.paths["/v2/retrieve/proposals"].get.operationId, "vtddRetrieveProposalLogs");
  assert.equal(doc.paths["/v2/retrieve/cross"].get.operationId, "vtddRetrieveCrossMemory");
  assert.deepEqual(
    doc.components.schemas.VtddGatewayRequest.properties.surfaceContext.properties
      .judgmentModelId.enum,
    ["vtdd-butler-core-v1"]
  );
  assert.deepEqual(
    doc.components.schemas.VtddExecuteRequest.properties.surfaceContext.properties.judgmentModelId.enum,
    ["vtdd-butler-core-v1"]
  );
  assert.equal(
    doc.components.schemas.VtddExecuteRequest.properties.continuationContext.properties
      .requiresHandoff.type,
    "boolean"
  );
  assert.equal(
    doc.components.schemas.VtddExecuteRequest.properties.continuationContext.properties
      .handoff.properties.approvalScopeMatched.type,
    "boolean"
  );
  assert.deepEqual(
    doc.components.schemas.VtddExecuteRequest.properties.continuationContext.properties.handoff.required,
    ["issueTraceable", "approvalScopeMatched", "relatedIssue", "summary"]
  );
  assert.equal(
    doc.components.schemas.VtddExecuteRequest.properties.policyInput.properties.issueTraceability
      .properties.intentRefs.items.type,
    "string"
  );
  assert.equal(
    doc.components.schemas.VtddGatewayRequest.properties.policyInput.properties.actionType.enum.includes("build"),
    false
  );
  assert.equal(
    doc.components.schemas.VtddExecuteRequest.properties.policyInput.properties.actionType.enum.includes("build"),
    true
  );
  assert.deepEqual(doc.paths["/health"].get.security, []);
  assert.equal(typeof doc.components.schemas, "object");
  assert.equal(doc.components.securitySchemes.GatewayBearerAuth.scheme, "bearer");
});

test("custom gpt openapi json exposes JSON bodies for Butler action auth failures", () => {
  const doc = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf8"));
  const routes = [
    ["/v2/action/github", "post"],
    ["/v2/action/repository-nickname", "post"],
    ["/v2/action/repository-nickname/delete", "post"],
    ["/v2/retrieve/constitution", "get"],
    ["/v2/retrieve/decisions", "get"],
    ["/v2/retrieve/proposals", "get"],
    ["/v2/retrieve/cross", "get"],
    ["/v2/retrieve/github", "get"],
    ["/v2/retrieve/repository-nicknames", "get"],
    ["/v2/retrieve/setup-artifact", "get"],
    ["/v2/retrieve/approval-grant", "get"],
    ["/v2/retrieve/self-parity", "get"]
  ];

  for (const [route, method] of routes) {
    for (const status of ["401", "403"]) {
      assert.deepEqual(doc.paths[route][method].responses[status].content["application/json"].schema, {
        $ref: "#/components/schemas/VtddGenericResponse"
      });
    }
  }
});

test("custom gpt retrieve actions expose action-visible response mode for test-screen debugging", () => {
  const doc = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf8"));
  const routes = [
    "/v2/retrieve/constitution",
    "/v2/retrieve/decisions",
    "/v2/retrieve/proposals",
    "/v2/retrieve/cross",
    "/v2/retrieve/github",
    "/v2/retrieve/repository-nicknames",
    "/v2/retrieve/setup-artifact",
    "/v2/retrieve/self-parity",
    "/v2/retrieve/approval-grant"
  ];

  for (const route of routes) {
    const parameter = doc.paths[route].get.parameters.find((item) => item.name === "responseMode");
    assert.equal(parameter.in, "query");
    assert.deepEqual(parameter.schema.enum, ["action_visible"]);
    assert.match(parameter.description, /ClientResponseError/);
  }
});
