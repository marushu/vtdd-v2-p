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
  assert.equal(doc.includes("vtddWriteOperationalMemory"), true);
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
  assert.equal(doc.includes("vtddStartupPreflight"), true);
  assert.equal(doc.includes("At true conversation/work startup, prefer `vtddStartupPreflight`"), true);
  assert.equal(doc.includes("repo-backed Skill inventory"), true);
  assert.equal(doc.includes("`.agents/skills/vtdd-chief-butler/SKILL.md`"), true);
  assert.equal(doc.includes("startupPreflight.repoBackedSkills.status"), true);
  assert.equal(doc.includes("Do not claim mac-only Skills are acceptable runtime capability."), true);
  assert.equal(doc.includes("startupPreflight.toolParityInventory.status"), true);
  assert.equal(doc.includes("macOnlyGaps"), true);
  assert.equal(doc.includes("Issue #495 parity gaps"), true);
  assert.equal(doc.includes("execution queue traffic control"), true);
  assert.equal(doc.includes("active Issue execution queue"), true);
  assert.equal(doc.includes("Do not treat status intents as automatic startup."), true);
  assert.equal(
    doc.includes("For Issue / PR / close readiness / status / remaining-task questions, first send a short Japanese receipt"),
    true
  );
  assert.equal(doc.includes("avoid first-step `vtddStartupPreflight` when the repository is already resolved"), true);
  assert.equal(doc.includes("Prefer a lightweight read ladder: `vtddRetrieveGitHub` Issue/PR detail"), true);
  assert.equal(
    doc.includes("Use `vtddStartupPreflight` for status questions only when the target repository is unresolved"),
    true
  );
  assert.equal(doc.includes("Gemini review, broad remaining-task candidate generation, and milestone completion judgment"), true);
  assert.equal(doc.includes("Before proposing an Issue, GitHub write, Codex handoff, or PR next action"), true);
  assert.equal(doc.includes("If the user is asking for implementation work and no existing Issue is fixed yet"), true);
  assert.equal(doc.includes("First propose an Issue candidate in Japanese, wait for GO, create the Issue"), true);
  assert.equal(doc.includes("#303 drifted by creating the PR first and Issue-linking later"), true);
  assert.equal(doc.includes("no relevant RAG/memory hit is found, say so"), true);
  assert.equal(doc.includes("do not invent past precedent"), true);
  assert.equal(doc.includes("current state is governed by GitHub runtime truth"), true);
  assert.equal(doc.includes("show a compact structured memory candidate, ask the human for GO"), true);
  assert.equal(doc.includes("Use `recordType=decision_log` only for a decided judgment that includes an explicit rationale"), true);
  assert.equal(doc.includes("use `recordType=working_memory` instead"), true);
  assert.equal(doc.includes("Do not store full transcripts, secrets, or raw sensitive material"), true);
  assert.equal(doc.includes("After writing a RAG checkpoint, confirm it with `vtddRetrieveOperationalMemory`"), true);
  assert.equal(doc.includes("confirm by explicit `recordId` lookup instead of inventing a repository"), true);
  assert.equal(doc.includes("repo_null_record_returned_by_explicit_record_id"), true);
  assert.equal(doc.includes("record_id_repository_boundary_blocked"), true);
  assert.equal(doc.includes("when it is present, do not describe `text` search results as if they were also queried"), true);
  assert.equal(doc.includes("Do not use `vtddRetrieveCrossMemory` as the only confirmation path for `working_memory` checkpoints"), true);
  assert.equal(doc.includes("Cross memory is decision/proposal/Issue oriented; operational memory is the checkpoint recall surface"), true);
  assert.equal(doc.includes("At startup, distinguish the execution surfaces before proposing development work"), true);
  assert.equal(doc.includes("Butler on iPhone/iPad must not assume the owner's Mac is awake"), true);
  assert.equal(doc.includes("ChatGPT iPhone Codex cloud tasks can run in OpenAI-managed cloud environments"), true);
  assert.equal(doc.includes("do not describe that as operating the local Mac Codex"), true);
  assert.equal(doc.includes("Mac dependency detected"), true);
  assert.equal(doc.includes("Current natural GO\n  binding is supported for `issue_create`, `issue_comment_create`, and\n  `pull_comment_create`"), true);
  assert.equal(doc.includes("If an implementation request does not already name an existing Issue"), true);
  assert.equal(doc.includes("the next safe write is usually `issue_create`, not Codex handoff"), true);
  assert.equal(doc.includes("never freehand the PR body"), true);
  assert.equal(doc.includes("scripts/prepare-pr-body-file.mjs"), true);
  assert.equal(doc.includes("validated `--body-file` path"), true);
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
  assert.equal(doc.includes("Nickname read fast path"), true);
  assert.equal(doc.includes("do not preface with `確認します`"), true);
  assert.equal(doc.includes("Call vtddRetrieveRepositoryNicknames immediately as the first action"), true);
  assert.equal(doc.includes("does not require GO, passkey, or a confirmation question"), true);
  assert.equal(doc.includes("Do not ask `実行しますか？`; call the Action immediately"), true);
  assert.equal(doc.includes("Do not run nickname retrieval for every VTDD request"), true);
  assert.equal(doc.includes("explicit nickname list/read intents"), true);
  assert.equal(doc.includes("On nickname read success, do not call vtddStartupPreflight"), true);
  assert.equal(doc.includes("Reply compactly with only the nickname -> owner/repo mapping"), true);
  assert.equal(doc.includes("On nickname read failure, then and only then use the fallback ladder"), true);
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
  assert.equal(doc.includes("High-risk actions require scoped passkey approval."), true);
  assert.equal(doc.includes("Merge requires explicit scoped passkey approval."), true);
  assert.equal(doc.includes("Same-origin passkey registration is not a public first-viewer bootstrap"), true);
  assert.equal(doc.includes("browser registration requires `VTDD_PASSKEY_BOOTSTRAP_TOKEN` or machine auth"), true);
  assert.equal(doc.includes("Do not put the bootstrap token in a URL, PR body, Issue comment, RAG memory, chat history, or Custom GPT Instructions"), true);
  assert.equal(doc.includes("Action Schema does not need a new operationId for this boundary"), true);
  assert.equal(doc.includes("Action Schema update required"), true);
  assert.equal(doc.includes("Instructions update required"), true);
  assert.equal(doc.includes("runtime is in sync, do not overclaim that the current Custom GPT editor is also in sync"), true);
  assert.equal(doc.includes("Custom GPT Action Authentication may not be sending the configured Bearer token"), true);
  assert.equal(doc.includes("protected `/v2/retrieve/*` routes require `GatewayBearerAuth`"), true);
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
  assert.equal(doc.includes("VTDD reviewer marker comments such as `vtdd:reviewer=gemini`"), true);
  assert.equal(doc.includes("GitHub formal Pull Request Review API objects and `reviewDecision` are separate runtime truth"), true);
  assert.equal(doc.includes("Do not report GitHub reviewDecision as approved merely because the VTDD reviewer marker recommends `approve`"), true);
  assert.equal(doc.includes("A GitHub formal `CHANGES_REQUESTED` / `changes_requested` state remains blocking"), true);
  assert.equal(doc.includes("reviewLoop.reviewerSignalTruth"), true);
  assert.equal(doc.includes("Do not claim a PR exists when only a Codex task summary exists."), true);
  assert.equal(
    doc.includes("Do not claim that Issues/PRs/comments are absent when the read path is unsupported, unauthorized, or unverified."),
    true
  );
  assert.equal(doc.includes("For Issue / PR / close readiness / status / 残タスク確認 read requests"), true);
  assert.equal(doc.includes("Start with Issue/PR truth, then add checks/workflow_runs/jobs/reviews/comments/branches as needed"), true);
  assert.equal(doc.includes("Before any Codex handoff or implementation PR proposal, prepare a Japanese dry-run impact report"), true);
  assert.equal(doc.includes("Treat the dry-run report as shared startup context for Butler, mac Codex, and VPS Codex CLI"), true);
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
  assert.equal(doc.includes("vtddRetrieveOperationalMemory"), true);
  assert.equal(doc.includes("vtddStartupPreflight"), true);
  assert.equal(doc.includes("Status intent (Issue/PR/close readiness/status/残タスク): first reply short"), true);
  assert.equal(doc.includes("skip first-step vtddStartupPreflight"), true);
  assert.equal(doc.includes("Status read=>staged lightweight ladder before heavy preflight"), true);
  assert.equal(doc.includes("vtddRetrieveDecisionLogs"), true);
  assert.equal(doc.includes("vtddRetrieveProposalLogs"), true);
  assert.equal(doc.includes("vtddRetrieveConstitution"), true);
  assert.equal(doc.includes("no RAG hit OK"), true);
  assert.equal(doc.includes("never invent"), true);
  assert.equal(doc.includes("Runtime truth > memory"), true);
  assert.equal(doc.includes("Reusable memory/RAG ckpt: show candidate with known repo/Issue"), true);
  assert.equal(doc.includes("recordType=working_memory"), true);
  assert.equal(doc.includes("decision_log only for rationale-backed decided judgments"), true);
  assert.equal(doc.includes("say unknown if missing"), true);
  assert.equal(doc.includes("propose an Issue candidate first, wait for GO, create the Issue, then hand off"), true);
  assert.equal(doc.includes("#303 is the regression example"), true);
  assert.equal(doc.includes("For normal GO writes (`issue_create`, `issue_comment_create`, `pull_comment_create`)"), true);
  assert.equal(doc.includes("the next safe write is Issue creation first"), true);
  assert.equal(doc.includes("no freehand `--body`"), true);
  assert.equal(doc.includes("scripts/prepare-pr-body-file.mjs"), true);
  assert.equal(doc.includes("`--body-file`"), true);
  assert.equal(doc.includes("ask only `GO`"), true);
  assert.equal(doc.includes("Never ask targetConfirmed/approvalScopeMatched/approvalPhrase/raw JSON"), true);
  assert.equal(doc.includes("Nickname memory is user-owned alias data"), true);
  assert.equal(doc.includes("List=>no preface/no GO/no 実行しますか; read first; compact map"), true);
  assert.equal(doc.includes("Do not run for every request"), true);
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
  assert.equal(doc.includes("Handoff前dry-run"), true);
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
  assert.equal(doc.includes("Protected retrieve auth/ClientResponseError=>check Action Bearer"), true);
  assert.equal(doc.includes("selfParity.deployRecovery.operatorMarkdownLink or operatorUrl"), true);
  assert.equal(doc.includes("selfParity.deployOperatorMarkdownLink"), true);
  assert.equal(doc.includes("<actual selfParity.deployOperatorUrl>"), true);
  assert.equal(doc.includes("never raw `/v2/approval/passkey/operator...`"), true);
  assert.equal(doc.includes("bare URL"), true);
  assert.equal(doc.includes("phase=execution"), true);
  assert.equal(doc.includes("GO + real passkey"), true);
  assert.equal(doc.includes("First passkey browser registration is not public first-viewer setup"), true);
  assert.equal(doc.includes("requires VTDD_PASSKEY_BOOTSTRAP_TOKEN or machine auth"), true);
  assert.equal(doc.includes("No Action Schema operationId change is needed for this boundary"), true);
  assert.equal(doc.includes("openai_api_key_not_configured"), true);
  assert.equal(doc.includes("If vtddDeployProduction fails, say the exact deploy error/reason/issues"), true);
  assert.equal(
    doc.includes("Completed `vtdd:reviewer=codex-fallback` from trusted VTDD actor/Codex Cloud result with recommendedAction is evidence"),
    true
  );
  assert.equal(doc.includes("missing GitHub Review objects alone is not absence"), true);
  assert.equal(doc.includes("Review truth: marker approve != GitHub approval"), true);
  assert.equal(doc.includes("formal CHANGES_REQUESTED blocks"), true);
  assert.equal(doc.includes("reviewerSignalTruth warnings"), true);
});

test("short-min custom gpt instructions stay pasteable while preserving critical invariants", () => {
  const doc = fs.readFileSync(SHORT_MIN_INSTRUCTIONS_PATH, "utf8");

  assert.equal(doc.length < 7900, true);
  assert.equal(doc.includes("minimal Custom GPT paste target"), true);
  assert.equal(doc.includes("custom-gpt-instructions.md` is the full canonical reference"), true);
  assert.equal(doc.includes("custom-gpt-instructions-short.md` is the expanded paste target"), true);

  const criticalTokens = [
    "Issue is canonical spec",
    "propose the Issue first, wait GO, create it, then hand off",
    "#303 is the regression example",
    "GitHub/runtime state is progress truth",
    "Reusable memory/RAG checkpoint",
    "recordType=working_memory",
    "decision_log only for rationale-backed decided judgments",
    "show candidate with known repo/Issue",
    "say unknown if missing",
    "Do not assume a default repository.",
    "vtddExecute handoff must use actionType=build",
    "requiresHandoff=true",
    "issueTraceability Intent/SC/Non-goal refs",
    "issueContext.issueNumber",
    "policyInput.issueTraceability.relatedIssue",
    "continuationContext.handoff.relatedIssue",
    "GO + real passkey",
    "first browser registration requires VTDD_PASSKEY_BOOTSTRAP_TOKEN or machine auth",
    "show exact title/body/comment/update payload",
    "no freehand `--body`",
    "scripts/prepare-pr-body-file.mjs",
    "`--body-file`",
    "For implementation without an existing Issue, do issue_create first",
    "Preserve reviewer objections",
    "Review truth: marker approve != GitHub approval",
    "formal CHANGES_REQUESTED blocks",
    "reviewerSignalTruth warnings",
    "vtddRetrieveSelfParity",
    "list=>no preface/no GO/no 実行しますか; direct read; compact map; not every request",
    "Handoff前dry-run",
    "Gemini が指摘している修正を Codex に進めさせます。よければ GO と言ってください。",
    "RAG checkpoint",
    "vtddRetrieveOperationalMemory",
    "vtddStartupPreflight",
    "Status intent (Issue/PR/close readiness/status/残タスク): first reply short",
    "avoid first-step vtddStartupPreflight",
    "Status read=>lightweight ladder first",
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
  assert.equal(doc.includes("- VTDD_GATEWAY_BEARER_TOKEN"), true);
  assert.equal(doc.includes("/v2/action/repository-nickname:"), true);
  assert.equal(doc.includes("/v2/action/repository-nickname/delete:"), true);
  assert.equal(doc.includes("/v2/action/progress:"), true);
  assert.equal(doc.includes("/v2/retrieve/github:"), true);
  assert.equal(doc.includes("/v2/retrieve/cloudflare-pages:"), true);
  assert.equal(doc.includes("/v2/retrieve/repository-nicknames:"), true);
  assert.equal(doc.includes("/v2/retrieve/setup-artifact:"), true);
  assert.equal(doc.includes("/v2/retrieve/self-parity:"), true);
  assert.equal(doc.includes("/v2/retrieve/setup-diagnostics:"), true);
  assert.equal(doc.includes("/v2/retrieve/approval-grant:"), true);
  assert.equal(doc.includes("/v2/retrieve/constitution:"), true);
  assert.equal(doc.includes("/v2/retrieve/decisions:"), true);
  assert.equal(doc.includes("/v2/retrieve/proposals:"), true);
  assert.equal(doc.includes("/v2/retrieve/cross:"), true);
  assert.equal(doc.includes("/v2/retrieve/startup-preflight:"), true);
  assert.equal(doc.includes("execution queue traffic-control truth"), true);
  assert.equal(doc.includes("- dashboard_butler"), true);
  assert.equal(doc.includes("operationId: vtddRetrieveConstitution"), true);
  assert.equal(doc.includes("operationId: vtddRetrieveDecisionLogs"), true);
  assert.equal(doc.includes("operationId: vtddRetrieveProposalLogs"), true);
  assert.equal(doc.includes("operationId: vtddRetrieveCrossMemory"), true);
  assert.equal(doc.includes("operationId: vtddRetrieveOperationalMemory"), true);
  assert.equal(doc.includes("operationId: vtddStartupPreflight"), true);
  assert.equal(doc.includes("operationId: vtddRetrieveCloudflarePages"), true);
  assert.equal(doc.includes("operationId: vtddRetrieveSetupDiagnostics"), true);
  assert.equal(doc.includes("OperationalMemoryResponse:"), true);
  assert.equal(doc.includes("$ref: \"#/components/schemas/OperationalMemoryResponse\""), true);
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

test("custom gpt self-parity action exposes issue close proof parameters", () => {
  const openapiJson = JSON.parse(fs.readFileSync(OPENAPI_JSON_PATH, "utf8"));
  const setupArtifactParams =
    openapiJson.paths["/v2/retrieve/setup-artifact"].get.parameters.map((parameter) => parameter.name);
  const selfParityParams =
    openapiJson.paths["/v2/retrieve/self-parity"].get.parameters.map((parameter) => parameter.name);

  assert.equal(setupArtifactParams.includes("issueNumber"), false);
  assert.equal(setupArtifactParams.includes("pullNumber"), false);
  assert.equal(selfParityParams.includes("issueNumber"), true);
  assert.equal(selfParityParams.includes("pullNumber"), true);

  const yaml = fs.readFileSync(OPENAPI_PATH, "utf8");
  const setupArtifactSection = yaml.slice(
    yaml.indexOf("  /v2/retrieve/setup-artifact:"),
    yaml.indexOf("  /v2/retrieve/self-parity:")
  );
  const selfParitySection = yaml.slice(
    yaml.indexOf("  /v2/retrieve/self-parity:"),
    yaml.indexOf("  /v2/retrieve/setup-diagnostics:")
  );
  assert.equal(setupArtifactSection.includes("- name: issueNumber"), false);
  assert.equal(setupArtifactSection.includes("- name: pullNumber"), false);
  assert.equal(selfParitySection.includes("- name: issueNumber"), true);
  assert.equal(selfParitySection.includes("- name: pullNumber"), true);
  assert.equal(typeof openapiJson.paths["/v2/retrieve/setup-diagnostics"], "object");
  const diagnosticsParams =
    openapiJson.paths["/v2/retrieve/setup-diagnostics"].get.parameters.map((parameter) => parameter.name);
  assert.equal(diagnosticsParams.includes("actionName"), true);
  assert.equal(diagnosticsParams.includes("httpStatus"), true);
  assert.equal(diagnosticsParams.includes("responseMode"), true);
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
  assert.equal(typeof doc.paths["/v2/action/memory-write"], "object");
  assert.equal(doc.paths["/v2/action/memory-write"].post.operationId, "vtddWriteOperationalMemory");
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
  assert.equal(
    doc.paths["/v2/action/github-actions-secret"].post.requestBody.content[
      "application/json"
    ].schema.properties.secretName.enum.includes("VTDD_GATEWAY_BEARER_TOKEN"),
    true
  );
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
    ["open_pr", "revise_pr", "respond_to_review", "post_merge_verify"]
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
  assert.equal(typeof doc.paths["/v2/retrieve/cloudflare-pages"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/repository-nicknames"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/setup-artifact"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/self-parity"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/approval-grant"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/constitution"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/decisions"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/proposals"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/cross"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/operational-memory"], "object");
  assert.equal(typeof doc.paths["/v2/retrieve/startup-preflight"], "object");
  assert.equal(doc.paths["/v2/retrieve/constitution"].get.operationId, "vtddRetrieveConstitution");
  assert.equal(doc.paths["/v2/retrieve/decisions"].get.operationId, "vtddRetrieveDecisionLogs");
  assert.equal(doc.paths["/v2/retrieve/proposals"].get.operationId, "vtddRetrieveProposalLogs");
  assert.equal(doc.paths["/v2/retrieve/cross"].get.operationId, "vtddRetrieveCrossMemory");
  assert.equal(
    doc.paths["/v2/retrieve/startup-preflight"].get.operationId,
    "vtddStartupPreflight"
  );
  assert.equal(
    doc.paths["/v2/retrieve/startup-preflight"].get.summary.includes(
      "execution queue traffic-control truth"
    ),
    true
  );
  assert.equal(
    doc.paths["/v2/retrieve/startup-preflight"].get.parameters
      .find((parameter) => parameter.name === "currentSurface")
      .schema.enum.includes("dashboard_butler"),
    true
  );
  assert.equal(
    doc.paths["/v2/retrieve/cloudflare-pages"].get.operationId,
    "vtddRetrieveCloudflarePages"
  );
  assert.equal(
    doc.paths["/v2/retrieve/operational-memory"].get.responses["200"].content["application/json"].schema.$ref,
    "#/components/schemas/OperationalMemoryResponse"
  );
  assert.deepEqual(doc.components.schemas.OperationalMemoryResponse.required, [
    "ok",
    "architecture",
    "memoryUseRule",
    "compactContext",
    "referencesByLayer",
    "retrievalSignals"
  ]);
  assert.equal(
    doc.components.schemas.OperationalMemoryResponse.properties.referencesByLayer.properties.immediate_context.type,
    "array"
  );
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
    ["/v2/action/memory-write", "post"],
    ["/v2/action/repository-nickname", "post"],
    ["/v2/action/repository-nickname/delete", "post"],
    ["/v2/retrieve/constitution", "get"],
    ["/v2/retrieve/decisions", "get"],
    ["/v2/retrieve/proposals", "get"],
    ["/v2/retrieve/cross", "get"],
    ["/v2/retrieve/operational-memory", "get"],
    ["/v2/retrieve/startup-preflight", "get"],
    ["/v2/retrieve/github", "get"],
    ["/v2/retrieve/cloudflare-pages", "get"],
    ["/v2/retrieve/repository-nicknames", "get"],
    ["/v2/retrieve/setup-artifact", "get"],
    ["/v2/retrieve/approval-grant", "get"],
    ["/v2/retrieve/self-parity", "get"],
    ["/v2/retrieve/setup-diagnostics", "get"]
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
    "/v2/retrieve/operational-memory",
    "/v2/retrieve/startup-preflight",
    "/v2/retrieve/github",
    "/v2/retrieve/cloudflare-pages",
    "/v2/retrieve/repository-nicknames",
    "/v2/retrieve/setup-artifact",
    "/v2/retrieve/self-parity",
    "/v2/retrieve/setup-diagnostics",
    "/v2/retrieve/approval-grant"
  ];

  for (const route of routes) {
    const parameter = doc.paths[route].get.parameters.find((item) => item.name === "responseMode");
    assert.equal(parameter.in, "query");
    assert.deepEqual(parameter.schema.enum, ["action_visible"]);
    assert.match(parameter.description, /ClientResponseError/);
  }
});
