import test from "node:test";
import assert from "node:assert/strict";
import {
  SetupMode,
  SetupOutputTarget,
  runInitialSetupWizard
} from "../src/core/index.js";

const validAnswers = {
  repositories: [
    {
      canonicalRepo: "sample-org/vtdd-v2",
      aliases: ["vtdd"]
    },
    {
      canonicalRepo: "sample-org/accounting-app",
      aliases: ["ledger", "bookkeeping"]
    }
  ],
  allowDefaultRepository: false,
  credentialModel: "github_app",
  highRiskApproval: "go_passkey",
  reviewerInitial: "gemini",
  setupMode: "iphone_first",
  actionEndpointBaseUrl: "https://vtdd-v2-mvp.example.workers.dev/path",
  initialSurfaces: ["custom_gpt"]
};

test("setup wizard returns git/db outputs and iphone onboarding pack", () => {
  const result = runInitialSetupWizard({ answers: validAnswers });
  assert.equal(result.ok, true);
  assert.equal(result.outputs.git.length > 0, true);
  assert.equal(result.outputs.db.length > 0, true);
  assert.equal(result.outputs.git[0].target, SetupOutputTarget.GIT);
  assert.equal(result.outputs.db[0].target, SetupOutputTarget.DB);
  assert.equal(result.onboarding.setupMode, SetupMode.IPHONE_FIRST);
  assert.deepEqual(result.onboarding.steps, [
    "Open the invitation-only Day0 setup URL on iPhone Safari or browser and accept the beta / billing responsibility terms.",
    "Complete GitHub setup on your own account and let the wizard create or reuse your user-owned VTDD fork.",
    "Complete Cloudflare setup on your own account and create or resolve a user-owned Worker runtime.",
    "Add Gemini API key to the user-owned runtime through the guided setup step.",
    "After Day0 setup reaches ready, continue with the shared VTDD GPT entry or switch to Codex using the same user-owned repository and runtime."
  ]);
  assert.equal(result.onboarding.customGpt.endpointBaseUrl, "https://vtdd-v2-mvp.example.workers.dev");
  assert.equal(result.onboarding.customGpt.actionSchemaJson.includes("/v2/gateway"), true);
  assert.equal(result.onboarding.deployAuthority.selectedPath, "one_shot_github_actions");
  assert.equal(result.onboarding.deployAuthority.fallbackPath, "direct_provider");
  assert.equal(result.onboarding.productionDeploy.workflow, "deploy-production");
  assert.equal(result.onboarding.productionDeploy.environment, "production");
  assert.deepEqual(result.onboarding.productionDeploy.requiredSecrets, [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID"
  ]);
  assert.deepEqual(result.onboarding.productionDeploy.requiredInputs, [
    "approval_phrase=GO",
    "passkey_verified=true"
  ]);
  assert.equal(result.onboarding.machineAuth.recommendedMode, "worker_bearer");
  assert.equal(result.onboarding.machineAuth.bearerSecretName, "VTDD_GATEWAY_BEARER_TOKEN");
  assert.equal(result.onboarding.machineAuth.actionAuthType, "Bearer");
  assert.equal(result.onboarding.machineAuth.fallbackMode, "cloudflare_access_service_token");
  assert.deepEqual(result.onboarding.machineAuth.fallbackHeaderNames, [
    "cf-access-client-id",
    "cf-access-client-secret"
  ]);
  assert.deepEqual(result.onboarding.machineAuth.fallbackSecretNames, [
    "CF_ACCESS_CLIENT_ID",
    "CF_ACCESS_CLIENT_SECRET"
  ]);
  assert.equal(
    result.onboarding.repositoryResolution.aliasResolutionMode,
    "context_first_best_effort_for_read"
  );
  assert.equal(
    result.onboarding.repositoryResolution.executionRule,
    "unresolved_target_blocks_execution"
  );
  assert.equal(
    result.onboarding.repositoryResolution.confirmationRule,
    "resolved_target_plus_action_plus_confirm_for_execute_or_destructive"
  );
  assert.equal(result.onboarding.repositoryResolution.defaultRepositoryPolicy, "forbidden");
  assert.deepEqual(result.onboarding.memorySafety.allowedRecordTypes, [
    "decision_log",
    "proposal_log",
    "alias_registry",
    "approval_log",
    "execution_log",
    "working_memory_summary"
  ]);
  assert.deepEqual(result.onboarding.memorySafety.forbiddenContent, [
    "tokens",
    "private keys",
    "raw secrets",
    "full casual transcripts"
  ]);
  assert.equal(
    result.onboarding.memorySafety.sourceOfTruth.git,
    "shared canonical specification"
  );
  assert.equal(
    result.onboarding.memorySafety.sourceOfTruth.db,
    "user-specific memory and operational traces"
  );
  assert.deepEqual(result.onboarding.roleSeparation.butler.inputs, [
    "human conversation",
    "constitution",
    "runtime truth",
    "issue / proposal / decision context",
    "reviewer output"
  ]);
  assert.deepEqual(result.onboarding.roleSeparation.butler.outputs, [
    "structured next-step guidance",
    "execution judgment",
    "reviewer summary for human decision"
  ]);
  assert.deepEqual(result.onboarding.roleSeparation.executor.outputs, [
    "code changes",
    "tests",
    "PR artifacts",
    "execution logs"
  ]);
  assert.deepEqual(result.onboarding.roleSeparation.reviewer.inputs, ["PR diff", "review context"]);
  assert.deepEqual(result.onboarding.roleSeparation.reviewer.outputs, [
    "critical_findings[]",
    "risks[]",
    "recommended_action"
  ]);
  assert.deepEqual(result.onboarding.roleSeparation.reviewer.authorityLimits, [
    "no execution authority",
    "no merge authority",
    "no deployment authority"
  ]);
  assert.deepEqual(result.onboarding.roleSeparation.handoffOrder, [
    "Butler -> Executor",
    "Executor -> Reviewer",
    "Reviewer -> Butler",
    "Human -> Final Authority"
  ]);
  assert.equal(
    result.onboarding.surfaceIndependence.role,
    "conversation, specification support, execution judgment, context recovery"
  );
  assert.equal(
    result.onboarding.surfaceIndependence.contract,
    "inputs, outputs, judgment order, approval expectations, and resolution rules"
  );
  assert.equal(
    result.onboarding.surfaceIndependence.runtime,
    "memory retrieval, runtime truth retrieval, proposal handling, approval orchestration"
  );
  assert.deepEqual(result.onboarding.surfaceIndependence.surfaces, [
    "custom_gpt",
    "web",
    "mobile",
    "cli"
  ]);
  assert.equal(
    result.onboarding.surfaceIndependence.initialSurfacePolicy,
    "custom_gpt_allowed_but_non_canonical"
  );
  assert.deepEqual(result.onboarding.surfaceIndependence.replacementInvariants, [
    "constitution_first_preserved",
    "issue_as_spec_preserved",
    "approval_boundary_preserved",
    "judgment_model_not_redefined_by_surface"
  ]);
  assert.deepEqual(result.onboarding.butlerReviewProtocol.judgmentOrder, [
    "Constitution",
    "Runtime Truth",
    "Issue / Proposal / Decision",
    "Current question / PR / state"
  ]);
  assert.deepEqual(result.onboarding.butlerReviewProtocol.explorationPhase, [
    "discuss ideas under constitutional constraints",
    "do not normalize proposals that violate the Constitution"
  ]);
  assert.deepEqual(result.onboarding.butlerReviewProtocol.executionPhase, [
    "evaluate whether requested work is constitutionally allowed",
    "check runtime truth before trusting stale assumptions",
    "verify traceability to issue sections",
    "flag out-of-scope and dangerous changes"
  ]);
  assert.deepEqual(result.onboarding.butlerReviewProtocol.mandatoryRules, [
    "no judgment without Constitution",
    "no execution judgment before runtime truth",
    "no untraceable implementation accepted as in-scope execution",
    "no surface override of Butler judgment order"
  ]);
  assert.deepEqual(result.onboarding.retrievalContract.sources, [
    "issue",
    "constitution",
    "runtime_truth",
    "decision_log",
    "proposal_log",
    "pr_context"
  ]);
  assert.deepEqual(result.onboarding.retrievalContract.recallSourceOrder, [
    "issue",
    "constitution",
    "decision_log",
    "proposal_log",
    "pr_context"
  ]);
  assert.deepEqual(result.onboarding.retrievalContract.executionOrder, [
    "issue",
    "constitution",
    "runtime_truth",
    "decision_log",
    "proposal_log",
    "pr_context"
  ]);
  assert.deepEqual(result.onboarding.retrievalContract.useCases, [
    "recall_context",
    "similar_issue_discovery",
    "decision_rationale_lookup",
    "constitution_rule_recall"
  ]);
  assert.equal(
    result.onboarding.retrievalContract.providerModel,
    "contract_fixed_provider_agnostic_cloudflare_allowed_as_initial_runtime"
  );
  assert.equal(result.onboarding.policyEngine.mode, "deterministic");
  assert.deepEqual(result.onboarding.policyEngine.executionPreconditions, [
    "constitution consulted",
    "runtime truth available or safe fallback selected",
    "target repository resolved",
    "approval level satisfied"
  ]);
  assert.deepEqual(result.onboarding.policyEngine.decisionOrder, [
    "role boundary",
    "constitution check",
    "runtime truth check",
    "repository resolution",
    "traceability",
    "consent",
    "approval",
    "credential boundary"
  ]);
  assert.equal(result.onboarding.guardedAbsence.modeName, "guarded_absence");
  assert.deepEqual(result.onboarding.guardedAbsence.allowedActions, [
    "read",
    "summarize",
    "issue_create",
    "build",
    "pr_comment",
    "pr_operation"
  ]);
  assert.deepEqual(result.onboarding.guardedAbsence.forbiddenActions, [
    "pr_review_submit",
    "merge",
    "deploy_production",
    "destructive",
    "external_publish"
  ]);
  assert.deepEqual(result.onboarding.guardedAbsence.mandatoryStops, [
    "ambiguous request",
    "spec conflict",
    "unconfirmed target",
    "one issue / one PR violation"
  ]);
  assert.equal(result.onboarding.reviewer.initialReviewer, "gemini");
  assert.equal(result.onboarding.reviewer.fallbackReviewer, "antigravity");
  assert.equal(
    result.onboarding.reviewer.fallbackCondition,
    "emergency_only_with_learning_use_disabled"
  );
  assert.equal(result.onboarding.surfaceEntry.readinessRule, "show_only_after_day0_ready");
  assert.equal(result.onboarding.surfaceEntry.chatgpt.loginRequired, true);
  assert.equal(
    result.onboarding.surfaceEntry.chatgpt.sharedGptLinkMode,
    "shared_live_gpt_link_after_ready"
  );
  assert.equal(
    result.onboarding.surfaceEntry.codex.handoffMode,
    "same_repo_same_runtime_after_ready"
  );
  assert.equal(
    result.onboarding.surfaceEntry.codex.workspaceExpectation,
    "open_user_owned_vtdd_repository"
  );
  assert.deepEqual(result.onboarding.reviewer.inputContract, ["PR diff", "context"]);
  assert.deepEqual(result.onboarding.reviewer.outputContract, [
    "critical_findings[]",
    "risks[]",
    "recommended_action"
  ]);
  assert.deepEqual(result.onboarding.reviewer.authorityLimits, [
    "no execution authority",
    "no merge authority",
    "no deployment authority"
  ]);
  assert.equal(
    result.onboarding.customGpt.actionSchemaJson.includes("/v2/retrieve/constitution"),
    true
  );
  assert.equal(
    result.onboarding.customGpt.actionSchemaJson.includes("/v2/retrieve/decisions"),
    true
  );
  assert.equal(
    result.onboarding.customGpt.actionSchemaJson.includes("/v2/retrieve/proposals"),
    true
  );
  assert.equal(
    result.onboarding.customGpt.actionSchemaJson.includes("/v2/retrieve/cross"),
    true
  );
  assert.equal(
    result.onboarding.customGpt.constructionText.includes("Always answer in Japanese"),
    true
  );
  assert.equal(
    result.onboarding.customGpt.constructionText.includes(
      "Never ask the user to type API paths such as /v2/... (legacy /mvp/...) or raw JSON payloads."
    ),
    true
  );
  assert.equal(
    result.onboarding.customGpt.constructionText.includes(
      "Infer intent from natural conversation instead of fixed command phrases."
    ),
    true
  );
  assert.equal(
    result.onboarding.customGpt.constructionText.includes(
      "Treat pr_comment and pr_review_submit as different approval boundaries: pr_comment does not require GO, but pr_review_submit requires GO."
    ),
    true
  );
  assert.equal(
    result.onboarding.customGpt.constructionText.includes(
      "Normal mode uses autonomyMode=normal. Absence mode uses autonomyMode=guarded_absence with strict stop boundaries."
    ),
    true
  );
  assert.equal(
    result.onboarding.customGpt.constructionText.includes(
      "Treat production deploy as VTDD-governed high-risk authority and avoid permanent production deploy secrets in GitHub."
    ),
    true
  );
  const parsed = JSON.parse(result.onboarding.customGpt.actionSchemaJson);
  assert.equal(
    Boolean(
      parsed?.paths?.["/v2/gateway"]?.post?.requestBody?.content?.["application/json"]?.schema?.properties
    ),
    true
  );
  const policyInputSchema =
    parsed?.paths?.["/v2/gateway"]?.post?.requestBody?.content?.["application/json"]?.schema
      ?.properties?.policyInput?.properties;
  assert.equal(Boolean(policyInputSchema?.autonomyMode), true);
  assert.equal(Boolean(policyInputSchema?.ambiguity), true);
  assert.equal(Boolean(policyInputSchema?.targetConfirmed), true);
  assert.equal(Boolean(parsed?.components?.securitySchemes?.GatewayBearerAuth), true);
  assert.deepEqual(Object.keys(parsed?.components?.securitySchemes ?? {}), ["GatewayBearerAuth"]);
  assert.equal(
    typeof parsed?.components?.schemas === "object" && !Array.isArray(parsed?.components?.schemas),
    true
  );
  assert.deepEqual(parsed?.paths?.["/v2/gateway"]?.post?.security, [{ GatewayBearerAuth: [] }]);
  assert.deepEqual(parsed?.paths?.["/v2/retrieve/constitution"]?.get?.security, [
    { GatewayBearerAuth: [] }
  ]);
  assert.equal(
    Array.isArray(parsed?.paths?.["/v2/retrieve/decisions"]?.get?.security),
    true
  );
  assert.equal(
    Array.isArray(parsed?.paths?.["/v2/retrieve/proposals"]?.get?.security),
    true
  );
  assert.equal(
    Array.isArray(parsed?.paths?.["/v2/retrieve/cross"]?.get?.security),
    true
  );
  assert.equal(Boolean(parsed?.paths?.["/v2/gateway"]?.post?.responses?.["401"]), true);
  assert.equal(Boolean(parsed?.paths?.["/v2/gateway"]?.post?.responses?.["403"]), true);
  assert.equal(Boolean(parsed?.paths?.["/v2/gateway"]?.post?.responses?.["422"]), true);
});

test("setup wizard exposes direct provider fallback when GitHub protection is unavailable", () => {
  const result = runInitialSetupWizard({
    answers: {
      ...validAnswers,
      repositoryVisibility: "private",
      branchProtectionApiStatus: "forbidden",
      rulesetsApiStatus: "forbidden"
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.onboarding.deployAuthority.selectedPath, "direct_provider");
  assert.equal(result.onboarding.deployAuthority.fallbackPath, "one_shot_github_actions");
});

test("setup wizard blocks non github_app credential model", () => {
  const result = runInitialSetupWizard({
    answers: {
      ...validAnswers,
      credentialModel: "personal_access_token"
    }
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.blockingIssues.includes("credential model must be github_app"),
    true
  );
});

test("setup wizard blocks default repository usage", () => {
  const result = runInitialSetupWizard({
    answers: {
      ...validAnswers,
      allowDefaultRepository: true
    }
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.blockingIssues.includes("default repository is forbidden"),
    true
  );
});

test("setup wizard requires action endpoint when custom_gpt is used", () => {
  const result = runInitialSetupWizard({
    answers: {
      ...validAnswers,
      actionEndpointBaseUrl: ""
    }
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.blockingIssues.includes("actionEndpointBaseUrl is required for custom_gpt surface"),
    true
  );
});

test("setup wizard blocks sensitive credentials in answers", () => {
  const result = runInitialSetupWizard({
    answers: {
      ...validAnswers,
      cloudflareApiToken: "cf_token_secret_value"
    }
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.blockingIssues.some((item) =>
      item.includes("sensitive credentials must not be entered in setup wizard answers")
    ),
    true
  );
});

test("setup wizard marks unsafe db output as blocked", () => {
  const result = runInitialSetupWizard({
    answers: {
      ...validAnswers,
      initialSurfaces: ["custom_gpt", "token=ghp_abcdefghijklmnopqrstuvwxyz1234"]
    }
  });
  assert.equal(result.ok, true);
  const blocked = result.outputs.db.find((item) => item.kind === "blocked");
  assert.equal(Boolean(blocked), true);
});
