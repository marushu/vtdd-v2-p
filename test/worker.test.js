import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import worker from "../src/worker.js";
import {
  ActionType,
  ActorRole,
  AutonomyMode,
  ConsentCategory,
  CredentialTier,
  JudgmentStep,
  MemoryRecordType,
  TaskMode,
  createInMemoryMemoryProvider
} from "../src/core/index.js";

const aliasRegistry = [
  {
    canonicalRepo: "sample-org/vtdd-v2",
    aliases: ["vtdd"]
  }
];

const validButlerJudgmentTrace = [
  JudgmentStep.CONSTITUTION,
  JudgmentStep.RUNTIME_TRUTH,
  JudgmentStep.ISSUE_CONTEXT,
  JudgmentStep.CURRENT_QUERY
];

const gatewayAuthHeaders = {
  "content-type": "application/json",
  authorization: "Bearer test-token"
};

const gatewayAuthEnv = {
  VTDD_GATEWAY_BEARER_TOKEN: "test-token"
};

function readCookieValue(setCookieHeader, name) {
  const header = String(setCookieHeader ?? "");
  const prefix = `${name}=`;
  const part = header
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return part ? part.slice(prefix.length) : "";
}

async function unlockSetupWizard(env, returnTo = "/setup/wizard?repo=sample-org/vtdd-v2") {
  const unlockResponse = await worker.fetch(
    new Request("https://example.com/setup/wizard/access", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        passcode: env.SETUP_WIZARD_PASSCODE,
        returnTo
      })
    }),
    env
  );

  const setCookie = unlockResponse.headers.get("set-cookie") ?? "";
  const sessionCookie = readCookieValue(setCookie, "vtdd_setup_access");
  return {
    unlockResponse,
    setCookie,
    sessionCookie
  };
}

test("worker returns health", async () => {
  const response = await worker.fetch(new Request("https://example.com/health"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mode, "v2");
  assert.equal(body.autonomyMode, AutonomyMode.NORMAL);
});

test("worker health reflects guarded absence mode when runtime env sets it", async () => {
  const response = await worker.fetch(new Request("https://example.com/health"), {
    VTDD_AUTONOMY_MODE: "guarded_absence"
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.autonomyMode, AutonomyMode.GUARDED_ABSENCE);
});

test("worker health accepts legacy autonomy mode env alias", async () => {
  const response = await worker.fetch(new Request("https://example.com/health"), {
    MVP_AUTONOMY_MODE: "guarded_absence"
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.autonomyMode, AutonomyMode.GUARDED_ABSENCE);
});

test("worker health returns to normal mode when VTDD_AUTONOMY_MODE is set to normal", async () => {
  const response = await worker.fetch(new Request("https://example.com/health"), {
    VTDD_AUTONOMY_MODE: "normal",
    MVP_AUTONOMY_MODE: "guarded_absence"
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.autonomyMode, AutonomyMode.NORMAL);
});

test("worker returns setup wizard html when repo query is provided", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?repo=sample-org/vtdd-v2")
  );
  assert.equal(response.status, 200);
  const contentType = response.headers.get("content-type") ?? "";
  assert.equal(contentType.includes("text/html"), true);
  const html = await response.text();
  assert.equal(html.includes("VTDD Setup Wizard"), true);
  assert.equal(html.includes("Custom GPT Construction"), true);
  assert.equal(html.includes("Copy Construction"), true);
  assert.equal(html.includes("Copy Schema"), true);
  assert.equal(html.includes("Copy Import URL"), true);
  assert.equal(html.includes("Copy Setup URL"), true);
  assert.equal(html.includes("Copy JSON URL"), true);
  assert.equal(html.includes('textarea id="constructionText"'), true);
  assert.equal(html.includes('textarea id="actionSchemaImportUrl"'), true);
  assert.equal(html.includes('textarea id="actionSchemaJson"'), true);
  assert.equal(html.includes("You are VTDD Butler."), true);
  assert.equal(html.includes("Replace the full Instructions field with this text."), true);
  assert.equal(html.includes("/v2/gateway"), true);
  assert.equal(html.includes("format=openapi"), true);
  assert.equal(html.includes("Deploy Authority Recommendation"), true);
  assert.equal(html.includes("one_shot_github_actions"), true);
  assert.equal(html.includes("direct_provider"), true);
  assert.equal(html.includes("Relationship to #37"), true);
  assert.equal(html.includes("coexist_with_github_actions_mvp_path"), true);
  assert.equal(html.includes("Production Deploy Contract"), true);
  assert.equal(html.includes("deploy-production"), true);
  assert.equal(html.includes("approval_phrase=GO"), true);
  assert.equal(html.includes("passkey_verified=true"), true);
  assert.equal(html.includes("CLOUDFLARE_API_TOKEN"), true);
  assert.equal(html.includes("CLOUDFLARE_ACCOUNT_ID"), true);
  assert.equal(html.includes("Machine Auth Contract"), true);
  assert.equal(html.includes("VTDD_GATEWAY_BEARER_TOKEN"), true);
  assert.equal(html.includes("Bearer"), true);
  assert.equal(html.includes("cf-access-client-id"), true);
  assert.equal(html.includes("cf-access-client-secret"), true);
  assert.equal(html.includes("CF_ACCESS_CLIENT_ID"), true);
  assert.equal(html.includes("CF_ACCESS_CLIENT_SECRET"), true);
  assert.equal(html.includes("Repository Resolution Contract"), true);
  assert.equal(html.includes("context_first_best_effort_for_read"), true);
  assert.equal(html.includes("unresolved_target_blocks_execution"), true);
  assert.equal(
    html.includes("resolved_target_plus_action_plus_confirm_for_execute_or_destructive"),
    true
  );
  assert.equal(html.includes("Default repository"), true);
  assert.equal(html.includes("Memory Safety Contract"), true);
  assert.equal(html.includes("decision_log"), true);
  assert.equal(html.includes("proposal_log"), true);
  assert.equal(html.includes("alias_registry"), true);
  assert.equal(html.includes("approval_log"), true);
  assert.equal(html.includes("execution_log"), true);
  assert.equal(html.includes("working_memory_summary"), true);
  assert.equal(html.includes("full casual transcripts"), true);
  assert.equal(html.includes("shared canonical specification"), true);
  assert.equal(html.includes("user-specific memory and operational traces"), true);
  assert.equal(html.includes("Role Separation Contract"), true);
  assert.equal(html.includes("human conversation"), true);
  assert.equal(html.includes("execution judgment"), true);
  assert.equal(html.includes("PR artifacts"), true);
  assert.equal(html.includes("reviewer output"), true);
  assert.equal(html.includes("Butler -&gt; Executor"), true);
  assert.equal(html.includes("Executor -&gt; Reviewer"), true);
  assert.equal(html.includes("Reviewer -&gt; Butler"), true);
  assert.equal(html.includes("Human -&gt; Final Authority"), true);
  assert.equal(html.includes("Surface Independence Contract"), true);
  assert.equal(html.includes("custom_gpt_allowed_but_non_canonical"), true);
  assert.equal(html.includes("constitution_first_preserved"), true);
  assert.equal(html.includes("issue_as_spec_preserved"), true);
  assert.equal(html.includes("approval_boundary_preserved"), true);
  assert.equal(html.includes("judgment_model_not_redefined_by_surface"), true);
  assert.equal(html.includes("custom_gpt"), true);
  assert.equal(html.includes("web"), true);
  assert.equal(html.includes("mobile"), true);
  assert.equal(html.includes("cli"), true);
  assert.equal(html.includes("Butler Review Protocol"), true);
  assert.equal(html.includes("Constitution"), true);
  assert.equal(html.includes("Runtime Truth"), true);
  assert.equal(html.includes("Issue / Proposal / Decision"), true);
  assert.equal(html.includes("Current question / PR / state"), true);
  assert.equal(html.includes("no judgment without Constitution"), true);
  assert.equal(html.includes("no execution judgment before runtime truth"), true);
  assert.equal(
    html.includes("no untraceable implementation accepted as in-scope execution"),
    true
  );
  assert.equal(html.includes("Retrieval Contract"), true);
  assert.equal(html.includes("runtime_truth"), true);
  assert.equal(html.includes("decision_log"), true);
  assert.equal(html.includes("proposal_log"), true);
  assert.equal(html.includes("pr_context"), true);
  assert.equal(html.includes("recall_context"), true);
  assert.equal(html.includes("similar_issue_discovery"), true);
  assert.equal(html.includes("decision_rationale_lookup"), true);
  assert.equal(html.includes("constitution_rule_recall"), true);
  assert.equal(
    html.includes("contract_fixed_provider_agnostic_cloudflare_allowed_as_initial_runtime"),
    true
  );
  assert.equal(html.includes("Policy Engine Contract"), true);
  assert.equal(html.includes("deterministic"), true);
  assert.equal(html.includes("constitution consulted"), true);
  assert.equal(html.includes("runtime truth available or safe fallback selected"), true);
  assert.equal(html.includes("target repository resolved"), true);
  assert.equal(html.includes("approval level satisfied"), true);
  assert.equal(html.includes("role boundary"), true);
  assert.equal(html.includes("constitution check"), true);
  assert.equal(html.includes("runtime truth check"), true);
  assert.equal(html.includes("repository resolution"), true);
  assert.equal(html.includes("traceability"), true);
  assert.equal(html.includes("consent"), true);
  assert.equal(html.includes("approval"), true);
  assert.equal(html.includes("credential boundary"), true);
  assert.equal(html.includes("Guarded Absence Contract"), true);
  assert.equal(html.includes("guarded_absence"), true);
  assert.equal(html.includes("pr_review_submit"), true);
  assert.equal(html.includes("deploy_production"), true);
  assert.equal(html.includes("ambiguous request"), true);
  assert.equal(html.includes("one issue / one PR violation"), true);
  assert.equal(html.includes("Reviewer Contract"), true);
  assert.equal(html.includes("gemini"), true);
  assert.equal(html.includes("antigravity"), true);
  assert.equal(html.includes("critical_findings[]"), true);
  assert.equal(html.includes("no execution authority"), true);
  assert.equal(html.includes("repositoryVisibility=unknown"), true);
  assert.equal(html.includes("branchProtectionApiStatus=unknown"), true);
  assert.equal(html.includes("rulesetsApiStatus=unknown"), true);
  assert.equal(html.includes("cloudflareApiToken"), false);
  assert.equal(html.includes("githubAppPrivateKey"), false);
});

test("worker setup wizard shows passcode boundary when configured", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?repo=sample-org/vtdd-v2"),
    {
      SETUP_WIZARD_PASSCODE: "2468"
    }
  );

  assert.equal(response.status, 401);
  const html = await response.text();
  assert.equal(html.includes("Setup wizard access is protected."), true);
  assert.equal(html.includes("Unlock Setup Wizard"), true);
  assert.equal(html.includes("Enter passcode"), true);
  assert.equal(html.includes("Tap the field below"), true);
  assert.equal(html.includes('action="/setup/wizard/access"'), true);
});

test("worker localizes setup wizard html to Japanese from accept-language", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?repo=sample-org/vtdd-v2", {
      headers: {
        "accept-language": "ja-JP,ja;q=0.9,en-US;q=0.8"
      }
    })
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("VTDD セットアップウィザード"), true);
  assert.equal(html.includes("リポジトリ"), true);
  assert.equal(html.includes("チェックリスト"), true);
  assert.equal(html.includes("構成テキストをコピー"), true);
  assert.equal(html.includes("Import URL をコピー"), true);
  assert.equal(html.includes("Setup URL をコピー"), true);
  assert.equal(html.includes("JSON URL をコピー"), true);
  assert.equal(html.includes("詳細契約を開く"), true);
  assert.equal(html.includes("Action auth は Bearer を使う"), true);
});

test("worker localizes locked setup wizard to Japanese from accept-language", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?repo=sample-org/vtdd-v2", {
      headers: {
        "accept-language": "ja-JP,ja;q=0.9"
      }
    }),
    {
      SETUP_WIZARD_PASSCODE: "2468"
    }
  );

  assert.equal(response.status, 401);
  const html = await response.text();
  assert.equal(html.includes("セットアップウィザードへのアクセスは保護されています。"), true);
  assert.equal(html.includes("パスコード"), true);
  assert.equal(html.includes("セットアップウィザードを開く"), true);
});

test("worker setup wizard json returns locked response when passcode boundary is configured", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2"),
    {
      SETUP_WIZARD_PASSCODE: "2468"
    }
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "setup_wizard_locked");
  assert.equal(body.unlockPath, "/setup/wizard/access");
});

test("worker setup wizard access accepts passcode and grants cookie-backed access", async () => {
  const unlockResponse = await worker.fetch(
    new Request("https://example.com/setup/wizard/access", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        passcode: "2468",
        returnTo: "/setup/wizard?repo=sample-org/vtdd-v2"
      })
    }),
    {
      SETUP_WIZARD_PASSCODE: "2468"
    }
  );

  assert.equal(unlockResponse.status, 200);
  const setCookie = unlockResponse.headers.get("set-cookie") ?? "";
  assert.equal(setCookie.includes("vtdd_setup_access="), true);
  assert.equal(setCookie.includes("HttpOnly"), true);
  assert.equal(setCookie.includes("Secure"), true);

  const sessionCookie = readCookieValue(setCookie, "vtdd_setup_access");
  assert.notEqual(sessionCookie, "");

  const wizardResponse = await worker.fetch(
    new Request("https://example.com/setup/wizard?repo=sample-org/vtdd-v2", {
      headers: {
        cookie: `vtdd_setup_access=${sessionCookie}`
      }
    }),
    {
      SETUP_WIZARD_PASSCODE: "2468"
    }
  );

  assert.equal(wizardResponse.status, 200);
  const html = await wizardResponse.text();
  assert.equal(html.includes("VTDD Setup Wizard"), true);
});

test("worker setup wizard access rejects invalid passcode", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard/access", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        passcode: "9999"
      })
    }),
    {
      SETUP_WIZARD_PASSCODE: "2468"
    }
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "invalid_setup_passcode");
});

test("worker setup wizard json reports github app bootstrap prerequisites", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2"),
    {
      SETUP_WIZARD_PASSCODE: "2468"
    }
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error, "setup_wizard_locked");
});

test("worker setup wizard unlocked html shows narrow github app bootstrap form when prerequisites exist", async () => {
  const env = {
    SETUP_WIZARD_PASSCODE: "2468",
    CLOUDFLARE_API_TOKEN: "bootstrap-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_WORKER_SCRIPT_NAME: "vtdd-v2-mvp",
    GITHUB_MANIFEST_CONVERSION_TOKEN: "ghp_conversion_token"
  };
  const { unlockResponse, sessionCookie } = await unlockSetupWizard(env);
  assert.equal(unlockResponse.status, 200);
  assert.notEqual(sessionCookie, "");

  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?repo=sample-org/vtdd-v2", {
      headers: {
        cookie: `vtdd_setup_access=${sessionCookie}`
      }
    }),
    env
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("GitHub App Runtime Bootstrap"), true);
  assert.equal(html.includes("Approval-Bound Bootstrap Session"), true);
  assert.equal(html.includes("GO + passkey"), true);
  assert.equal(html.includes("github_app_installation_binding"), true);
  assert.equal(html.includes('action="/setup/wizard/bootstrap-session/request"'), true);
  assert.equal(html.includes("Record GO + passkey request"), true);
  assert.equal(html.includes("Session contract"), true);
  assert.equal(html.includes("approval_bound_one_time_bootstrap"), true);
  assert.equal(html.includes("not_issued"), true);
  assert.equal(html.includes("Step boundary"), true);
  assert.equal(html.includes("VTDD-owned steps"), true);
  assert.equal(html.includes("Remaining external redirects"), true);
  assert.equal(html.includes("Capability readout"), true);
  assert.equal(html.includes("GitHub connection"), true);
  assert.equal(html.includes("Worker runtime"), true);
  assert.equal(html.includes("VTDD capability"), true);
  assert.equal(html.includes("Flow phase"), true);
  assert.equal(html.includes("Current phase"), true);
  assert.equal(html.includes("Next capability"), true);
  assert.equal(html.includes("Transition trigger"), true);
  assert.equal(html.includes("Flow progress"), true);
  assert.equal(html.includes("Completed phases"), true);
  assert.equal(html.includes("Current blocker"), true);
  assert.equal(html.includes("Remaining phases"), true);
  assert.equal(html.includes("Responsibility split"), true);
  assert.equal(html.includes("Human step"), true);
  assert.equal(html.includes("VTDD step"), true);
  assert.equal(html.includes("Provider step"), true);
  assert.equal(html.includes("Auth boundary split"), true);
  assert.equal(html.includes("VTDD service access"), true);
  assert.equal(html.includes("Operator bootstrap authority"), true);
  assert.equal(html.includes("External account connection"), true);
  assert.equal(html.includes("Runtime machine auth"), true);
  assert.equal(html.includes("Issuance readout"), true);
  assert.equal(html.includes("Issuable state"), true);
  assert.equal(html.includes("Blocking gate"), true);
  assert.equal(html.includes("Next issuance condition"), true);
  assert.equal(html.includes("Authority shape"), true);
  assert.equal(html.includes("Authority owner"), true);
  assert.equal(html.includes("Authority scope"), true);
  assert.equal(html.includes("Authority audit"), true);
  assert.equal(html.includes("Authority expiry"), true);
  assert.equal(html.includes("Expiry trigger"), true);
  assert.equal(html.includes("Expiry window"), true);
  assert.equal(html.includes("Expiry after use"), true);
  assert.equal(html.includes("Authority renewal"), true);
  assert.equal(html.includes("Renewal trigger"), true);
  assert.equal(html.includes("Renewal gate"), true);
  assert.equal(html.includes("Renewal scope"), true);
  assert.equal(html.includes("Authority renewal denial"), true);
  assert.equal(html.includes("Denial reason"), true);
  assert.equal(html.includes("Denial boundary"), true);
  assert.equal(html.includes("Denial recovery"), true);
  assert.equal(html.includes("Completion claim"), true);
  assert.equal(html.includes("Current claim"), true);
  assert.equal(html.includes("Cannot yet claim"), true);
  assert.equal(html.includes("Claim becomes valid when"), true);
  assert.equal(html.includes("Evidence readout"), true);
  assert.equal(html.includes("Runtime evidence"), true);
  assert.equal(html.includes("Blocked evidence"), true);
  assert.equal(html.includes("Next proof"), true);
  assert.equal(html.includes("Safety readout"), true);
  assert.equal(html.includes("Stop reason"), true);
  assert.equal(html.includes("Invariant protected"), true);
  assert.equal(html.includes("Unsafe shortcut denied"), true);
  assert.equal(html.includes("Allowlisted secrets"), true);
  assert.equal(html.includes("Planned writes"), true);
  assert.equal(html.includes("Post-session checks"), true);
  assert.equal(html.includes('action="/setup/wizard/github-app/bootstrap"'), true);
  assert.equal(html.includes('action="https://github.com/settings/apps/new"'), true);
  assert.equal(html.includes("&quot;hook_attributes&quot;"), true);
  assert.equal(html.includes("&quot;url&quot;:&quot;https://example.com/github/webhooks&quot;"), true);
  assert.equal(html.includes("Create GitHub App Automatically"), true);
  assert.equal(html.includes("GITHUB_APP_PRIVATE_KEY"), true);
  assert.equal(html.includes("Write GitHub App Runtime Secrets"), true);
});

test("worker setup wizard unlocked json reports github app bootstrap availability and missing prerequisites", async () => {
  const env = {
    SETUP_WIZARD_PASSCODE: "2468"
  };
  const { unlockResponse, sessionCookie } = await unlockSetupWizard(env);
  assert.equal(unlockResponse.status, 200);

  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2", {
      headers: {
        cookie: `vtdd_setup_access=${sessionCookie}`
      }
    }),
    env
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.githubAppBootstrap.state, "missing_prerequisites");
  assert.equal(body.approvalBoundBootstrapSession.state, "blocked_by_operator_prerequisites");
  assert.equal(body.approvalBoundBootstrapSession.approvalBoundary, "GO + passkey");
  assert.equal(body.approvalBoundBootstrapSession.contract.authorityState, "not_issued");
  assert.equal(body.approvalBoundBootstrapSession.contract.sessionMode, "approval_bound_one_time_bootstrap");
  assert.equal(body.approvalBoundBootstrapSession.contract.singleUse, true);
  assert.equal(body.approvalBoundBootstrapSession.contract.maxAgeSeconds, 300);
  assert.equal(body.approvalBoundBootstrapSession.recommendedNextStep.id, "restore_operator_bootstrap_prerequisites");
  assert.equal(
    body.approvalBoundBootstrapSession.recommendedNextStep.action,
    "configure_cloudflare_bootstrap_prerequisites"
  );
  assert.deepEqual(body.approvalBoundBootstrapSession.contract.allowlistedSecrets, [
    "GITHUB_APP_ID",
    "GITHUB_APP_INSTALLATION_ID",
    "GITHUB_APP_PRIVATE_KEY"
  ]);
  assert.equal(
    body.approvalBoundBootstrapSession.contract.preview.writeTarget,
    "cloudflare:workers/scripts/<unresolved>/secrets"
  );
  assert.deepEqual(body.approvalBoundBootstrapSession.contract.preview.plannedWrites, [
    "GITHUB_APP_ID",
    "GITHUB_APP_INSTALLATION_ID",
    "GITHUB_APP_PRIVATE_KEY"
  ]);
  assert.deepEqual(body.approvalBoundBootstrapSession.contract.preview.postChecks, [
    "github_app_setup_check"
  ]);
  assert.equal(
    body.approvalBoundBootstrapSession.contract.preview.blockedBy.includes("CLOUDFLARE_API_TOKEN"),
    true
  );
  assert.equal(
    body.approvalBoundBootstrapSession.targetAbsorbs.includes("allowlisted_runtime_secret_write"),
    true
  );
  assert.deepEqual(body.approvalBoundBootstrapSession.stepBoundaries.vtddOwnedSteps, [
    "redirect_context_preservation",
    "installation_detection_or_capture_surface",
    "readiness_status_reporting"
  ]);
  assert.deepEqual(body.approvalBoundBootstrapSession.stepBoundaries.externalRedirects, [
    "github_app_creation_and_manifest_consent",
    "github_app_installation_consent"
  ]);
  assert.equal(body.approvalBoundBootstrapSession.capabilityReadout.githubConnection.state, "blocked");
  assert.equal(body.approvalBoundBootstrapSession.capabilityReadout.workerRuntime.state, "blocked");
  assert.equal(
    body.approvalBoundBootstrapSession.capabilityReadout.vtddCapability.state,
    "cannot_yet_continue_github_app_bootstrap"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.phaseReadout.currentPhase.id,
    "bootstrap_prerequisites_blocked"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.phaseReadout.nextCapability.id,
    "bounded_runtime_bootstrap_availability"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.phaseReadout.transitionTrigger.id,
    "restore_operator_bootstrap_prerequisites"
  );
  assert.deepEqual(body.approvalBoundBootstrapSession.progressReadout.completedPhases, []);
  assert.equal(
    body.approvalBoundBootstrapSession.progressReadout.currentBlocker.id,
    "operator_bootstrap_prerequisites_missing"
  );
  assert.deepEqual(body.approvalBoundBootstrapSession.progressReadout.remainingPhases, [
    "runtime_identity_bootstrap",
    "installation_binding",
    "live_readiness_verification"
  ]);
  assert.equal(
    body.approvalBoundBootstrapSession.responsibilityReadout.humanStep.id,
    "approve_or_restore_operator_bootstrap_prerequisites"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.responsibilityReadout.vtddStep.id,
    "hold_meaningful_setup_context"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.responsibilityReadout.providerStep.id,
    "cloudflare_retains_runtime_secret_boundary"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authBoundaryReadout.serviceAccess.state,
    "configured"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authBoundaryReadout.operatorBootstrapAuthority.state,
    "missing_prerequisites"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authBoundaryReadout.externalAccountConnection.state,
    "not_ready"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authBoundaryReadout.runtimeMachineAuth.state,
    "separate_internal_boundary"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.issuanceReadout.issuableState.id,
    "not_issuable"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.issuanceReadout.blockingGate.id,
    "operator_bootstrap_prerequisites_missing"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.issuanceReadout.nextIssuanceCondition.id,
    "operator_prerequisites_restored"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityShapeReadout.authorityOwner.id,
    "service_owned_prerequisite_not_session_issued"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityShapeReadout.authorityScope.id,
    "bounded_session_shape_not_available"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityShapeReadout.authorityAudit.id,
    "approval_boundary_reserved"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityExpiryReadout.expiryTrigger.id,
    "no_session_to_expire_until_prerequisites_exist"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityExpiryReadout.expiryWindow.id,
    "future_short_lived_window_reserved"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityExpiryReadout.expiryAfterUse.id,
    "future_single_use_expiry_reserved"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalReadout.renewalTrigger.id,
    "no_renewal_until_prerequisites_restored"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalReadout.renewalGate.id,
    "fresh_go_passkey_required_after_block"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalReadout.renewalScope.id,
    "recompute_from_current_blocked_state"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalDenialReadout.denialReason.id,
    "deny_renewal_while_prerequisites_are_missing"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalDenialReadout.denialBoundary.id,
    "prerequisite_boundary_before_any_retry_authority"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalDenialReadout.denialRecovery.id,
    "restore_prerequisites_then_reissue_fresh_request"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.completionReadout.claimState.id,
    "meaningful_but_blocked_setup_surface"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.completionReadout.cannotYetClaim.id,
    "wizard_complete_setup"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.completionReadout.claimBecomesValidWhen.id,
    "operator_prerequisites_restored_and_bounded_path_available"
  );
  assert.deepEqual(body.approvalBoundBootstrapSession.evidenceReadout.runtimeEvidence, [
    "setup_wizard_entry_access",
    "approval_bound_contract_surface"
  ]);
  assert.deepEqual(body.approvalBoundBootstrapSession.evidenceReadout.blockedEvidence, [
    "missing_operator_bootstrap_prerequisites"
  ]);
  assert.equal(
    body.approvalBoundBootstrapSession.evidenceReadout.nextProof.id,
    "operator_prerequisites_restored"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.safetyReadout.stopReason.id,
    "operator_bootstrap_prerequisites_not_ready"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.safetyReadout.invariantProtected.id,
    "no_generic_secret_terminal"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.safetyReadout.unsafeShortcutDenied.id,
    "skip_operator_bootstrap_boundary"
  );
  assert.deepEqual(body.githubAppBootstrap.allowlistedSecrets, [
    "GITHUB_APP_ID",
    "GITHUB_APP_INSTALLATION_ID",
    "GITHUB_APP_PRIVATE_KEY"
  ]);
  assert.equal(body.githubAppBootstrap.missingPrerequisites.includes("CLOUDFLARE_API_TOKEN"), true);
  assert.equal(body.githubAppBootstrap.missingPrerequisites.includes("CLOUDFLARE_ACCOUNT_ID"), true);
  assert.equal(body.githubAppBootstrap.missingPrerequisites.includes("CLOUDFLARE_WORKER_SCRIPT_NAME"), true);
  assert.equal(
    body.githubAppBootstrap.missingPrerequisites.includes("GITHUB_MANIFEST_CONVERSION_TOKEN"),
    true
  );
});

test("worker setup wizard unlocked json does not expose cloudflare bootstrap token when github app bootstrap is available", async () => {
  const env = {
    SETUP_WIZARD_PASSCODE: "2468",
    CLOUDFLARE_API_TOKEN: "bootstrap-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_WORKER_SCRIPT_NAME: "vtdd-v2-mvp",
    GITHUB_MANIFEST_CONVERSION_TOKEN: "ghp_conversion_token"
  };
  const { unlockResponse, sessionCookie } = await unlockSetupWizard(env);
  assert.equal(unlockResponse.status, 200);

  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2", {
      headers: {
        cookie: `vtdd_setup_access=${sessionCookie}`
      }
    }),
    env
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.githubAppBootstrap.state, "available");
  assert.equal(body.approvalBoundBootstrapSession.state, "deferred");
  assert.equal(body.approvalBoundBootstrapSession.recommendedNextStep.id, "complete_github_app_bootstrap");
  assert.equal(
    body.approvalBoundBootstrapSession.contract.preview.writeTarget,
    "cloudflare:account-id/workers/scripts/vtdd-v2-mvp/secrets"
  );
  assert.deepEqual(body.approvalBoundBootstrapSession.contract.preview.plannedWrites, [
    "GITHUB_APP_ID",
    "GITHUB_APP_INSTALLATION_ID",
    "GITHUB_APP_PRIVATE_KEY"
  ]);
  assert.deepEqual(body.approvalBoundBootstrapSession.contract.preview.postChecks, [
    "github_app_setup_check"
  ]);
  assert.equal(
    body.approvalBoundBootstrapSession.contract.preview.blockedBy.includes(
      "attestation_backed_bootstrap_authority_not_implemented"
    ),
    true
  );
  assert.equal(
    body.approvalBoundBootstrapSession.capabilityReadout.githubConnection.state,
    "bootstrap_in_progress"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.capabilityReadout.workerRuntime.state,
    "ready_for_bounded_bootstrap"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.capabilityReadout.vtddCapability.state,
    "cannot_yet_mint_installation_tokens"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.phaseReadout.currentPhase.id,
    "runtime_identity_bootstrap_pending"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.phaseReadout.nextCapability.id,
    "narrow_installation_binding_phase"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.phaseReadout.transitionTrigger.id,
    "write_missing_github_app_runtime_fields"
  );
  assert.deepEqual(body.approvalBoundBootstrapSession.progressReadout.completedPhases, []);
  assert.equal(
    body.approvalBoundBootstrapSession.progressReadout.currentBlocker.id,
    "runtime_identity_still_incomplete"
  );
  assert.deepEqual(body.approvalBoundBootstrapSession.progressReadout.remainingPhases, [
    "runtime_identity_bootstrap",
    "installation_binding",
    "live_readiness_verification"
  ]);
  assert.equal(
    body.approvalBoundBootstrapSession.responsibilityReadout.humanStep.id,
    "approve_provider_creation_or_installation_step"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.responsibilityReadout.vtddStep.id,
    "orchestrate_runtime_identity_bootstrap"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.responsibilityReadout.providerStep.id,
    "github_and_cloudflare_keep_native_trust_boundaries"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authBoundaryReadout.serviceAccess.state,
    "configured"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authBoundaryReadout.operatorBootstrapAuthority.state,
    "ready_but_not_issued_to_user"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authBoundaryReadout.externalAccountConnection.state,
    "provider_connection_in_progress"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authBoundaryReadout.runtimeMachineAuth.state,
    "separate_internal_boundary"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.issuanceReadout.issuableState.id,
    "issuance_deferred_to_runtime_identity_completion"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.issuanceReadout.blockingGate.id,
    "runtime_identity_not_complete"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.issuanceReadout.nextIssuanceCondition.id,
    "runtime_identity_fields_written"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityShapeReadout.authorityOwner.id,
    "future_session_bound_runtime_bootstrap_authority"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityShapeReadout.authorityScope.id,
    "allowlisted_runtime_identity_write_set"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityShapeReadout.authorityAudit.id,
    "go_passkey_plus_bounded_write_trace"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityExpiryReadout.expiryTrigger.id,
    "expire_after_bounded_runtime_bootstrap_attempt"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityExpiryReadout.expiryWindow.id,
    "runtime_bootstrap_short_lived_window"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityExpiryReadout.expiryAfterUse.id,
    "expire_after_one_bounded_write_trace"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalReadout.renewalTrigger.id,
    "renew_only_if_runtime_identity_still_incomplete"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalReadout.renewalGate.id,
    "fresh_go_passkey_plus_current_runtime_state"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalReadout.renewalScope.id,
    "recompute_and_shrink_remaining_write_set"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalDenialReadout.denialReason.id,
    "deny_renewal_if_runtime_scope_would_widen_or_repeat_blindly"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalDenialReadout.denialBoundary.id,
    "no_reuse_of_stale_runtime_bootstrap_scope"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalDenialReadout.denialRecovery.id,
    "recompute_remaining_runtime_scope_before_retry"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.completionReadout.claimState.id,
    "coherent_bootstrap_in_progress"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.completionReadout.cannotYetClaim.id,
    "wizard_complete_setup"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.completionReadout.claimBecomesValidWhen.id,
    "runtime_identity_bootstrap_narrows_to_installation_and_verification"
  );
  assert.deepEqual(body.approvalBoundBootstrapSession.evidenceReadout.blockedEvidence, [
    "missing_runtime_identity_fields"
  ]);
  assert.equal(
    body.approvalBoundBootstrapSession.evidenceReadout.nextProof.id,
    "runtime_identity_fields_written"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.safetyReadout.stopReason.id,
    "runtime_identity_still_incomplete"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.safetyReadout.invariantProtected.id,
    "no_broad_bootstrap_authority_exposure"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.safetyReadout.unsafeShortcutDenied.id,
    "pretend_runtime_identity_is_complete"
  );
  assert.equal(body.githubAppBootstrap.accountId, "account-id");
  assert.equal("cloudflareApiToken" in body.githubAppBootstrap, false);
  assert.equal("githubManifestConversionToken" in body.githubAppBootstrap, false);
});

test("worker setup wizard records approval-bound bootstrap request without granting authority", async () => {
  const env = {
    SETUP_WIZARD_PASSCODE: "2468",
    CLOUDFLARE_API_TOKEN: "bootstrap-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_WORKER_SCRIPT_NAME: "vtdd-v2-mvp",
    GITHUB_MANIFEST_CONVERSION_TOKEN: "ghp_conversion_token"
  };
  const { sessionCookie } = await unlockSetupWizard(env);

  const requestResponse = await worker.fetch(
    new Request("https://example.com/setup/wizard/bootstrap-session/request", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `vtdd_setup_access=${sessionCookie}`
      },
      body: new URLSearchParams({
        returnTo: "/setup/wizard?repo=sample-org/vtdd-v2",
        approval_phrase: "GO",
        passkey_verified: "true"
      })
    }),
    env
  );

  assert.equal(requestResponse.status, 303);
  const location = requestResponse.headers.get("location") ?? "";
  assert.equal(location.includes("bootstrap_session_request=requested"), true);
  assert.equal(location.includes("bootstrap_session_request_token="), true);

  const response = await worker.fetch(
    new Request(`https://example.com${location}`, {
      headers: {
        cookie: `vtdd_setup_access=${sessionCookie}`
      }
    }),
    env
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("request_recorded_but_deferred"), true);
  assert.equal(
    html.includes("no privileged bootstrap session was opened because attestation-backed bootstrap authority is still deferred"),
    true
  );
});

test("worker setup wizard preview narrows planned write to installation binding when app identity already exists", async () => {
  const env = {
    SETUP_WIZARD_PASSCODE: "2468",
    CLOUDFLARE_API_TOKEN: "bootstrap-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_WORKER_SCRIPT_NAME: "vtdd-v2-mvp",
    GITHUB_MANIFEST_CONVERSION_TOKEN: "ghp_conversion_token",
    GITHUB_APP_ID: "12345",
    GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----"
  };
  const { sessionCookie } = await unlockSetupWizard(env);

  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2", {
      headers: {
        cookie: `vtdd_setup_access=${sessionCookie}`
      }
    }),
    env
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(
    body.approvalBoundBootstrapSession.recommendedNextStep.id,
    "capture_or_detect_installation_binding"
  );
  assert.deepEqual(body.approvalBoundBootstrapSession.contract.preview.plannedWrites, [
    "GITHUB_APP_INSTALLATION_ID"
  ]);
  assert.deepEqual(body.approvalBoundBootstrapSession.contract.preview.postChecks, [
    "github_app_installation_detection_or_capture",
    "github_app_installation_token_mint",
    "github_app_live_probe"
  ]);
  assert.deepEqual(body.approvalBoundBootstrapSession.stepBoundaries.externalRedirects, [
    "github_app_installation_consent"
  ]);
  assert.equal(
    body.approvalBoundBootstrapSession.capabilityReadout.githubConnection.state,
    "installation_binding_pending"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.capabilityReadout.workerRuntime.state,
    "ready_for_narrow_installation_write"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.capabilityReadout.vtddCapability.state,
    "cannot_yet_mint_installation_tokens"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.phaseReadout.currentPhase.id,
    "installation_binding_pending"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.phaseReadout.nextCapability.id,
    "installation_token_mint_and_live_probe"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.phaseReadout.transitionTrigger.id,
    "capture_or_detect_installation_binding"
  );
  assert.deepEqual(body.approvalBoundBootstrapSession.progressReadout.completedPhases, [
    "runtime_identity_bootstrap"
  ]);
  assert.equal(
    body.approvalBoundBootstrapSession.progressReadout.currentBlocker.id,
    "installation_binding_still_missing"
  );
  assert.deepEqual(body.approvalBoundBootstrapSession.progressReadout.remainingPhases, [
    "installation_binding",
    "live_readiness_verification"
  ]);
  assert.equal(
    body.approvalBoundBootstrapSession.responsibilityReadout.humanStep.id,
    "approve_installation_binding_if_needed"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.responsibilityReadout.vtddStep.id,
    "detect_or_capture_installation_binding"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.responsibilityReadout.providerStep.id,
    "github_owns_installation_consent"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authBoundaryReadout.serviceAccess.state,
    "configured"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authBoundaryReadout.operatorBootstrapAuthority.state,
    "narrow_write_deferred"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authBoundaryReadout.externalAccountConnection.state,
    "installation_binding_pending"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authBoundaryReadout.runtimeMachineAuth.state,
    "separate_internal_boundary"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.issuanceReadout.issuableState.id,
    "issuance_deferred_to_installation_binding"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.issuanceReadout.blockingGate.id,
    "installation_binding_not_complete"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.issuanceReadout.nextIssuanceCondition.id,
    "installation_binding_detected_or_captured"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityShapeReadout.authorityOwner.id,
    "future_session_bound_installation_authority"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityShapeReadout.authorityScope.id,
    "single_remaining_allowlisted_write"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityShapeReadout.authorityAudit.id,
    "go_passkey_plus_installation_proof"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityExpiryReadout.expiryTrigger.id,
    "expire_after_installation_binding_step"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityExpiryReadout.expiryWindow.id,
    "single_step_short_lived_window"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityExpiryReadout.expiryAfterUse.id,
    "expire_after_one_installation_binding_use"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalReadout.renewalTrigger.id,
    "renew_only_if_installation_binding_still_missing"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalReadout.renewalGate.id,
    "fresh_go_passkey_plus_current_installation_context"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalReadout.renewalScope.id,
    "remain_narrowed_to_installation_binding"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalDenialReadout.denialReason.id,
    "deny_renewal_if_installation_binding_is_already_resolved"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalDenialReadout.denialBoundary.id,
    "no_reopening_completed_installation_scope"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.authorityRenewalDenialReadout.denialRecovery.id,
    "recompute_from_current_installation_state"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.completionReadout.claimState.id,
    "narrowed_setup_flow"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.completionReadout.cannotYetClaim.id,
    "wizard_complete_setup"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.completionReadout.claimBecomesValidWhen.id,
    "installation_binding_and_live_probe_complete"
  );
  assert.deepEqual(body.approvalBoundBootstrapSession.evidenceReadout.runtimeEvidence, [
    "github_app_identity_present_in_runtime",
    "bounded_installation_binding_preview"
  ]);
  assert.deepEqual(body.approvalBoundBootstrapSession.evidenceReadout.blockedEvidence, [
    "installation_binding_not_yet_stored"
  ]);
  assert.equal(
    body.approvalBoundBootstrapSession.evidenceReadout.nextProof.id,
    "installation_binding_detected_or_captured"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.safetyReadout.stopReason.id,
    "installation_binding_still_required"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.safetyReadout.invariantProtected.id,
    "no_fake_github_connection_ready_state"
  );
  assert.equal(
    body.approvalBoundBootstrapSession.safetyReadout.unsafeShortcutDenied.id,
    "assume_installation_binding_without_proof"
  );
});

test("worker setup wizard rejects bootstrap request without GO plus passkey in json mode", async () => {
  const env = {
    SETUP_WIZARD_PASSCODE: "2468",
    CLOUDFLARE_API_TOKEN: "bootstrap-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_WORKER_SCRIPT_NAME: "vtdd-v2-mvp",
    GITHUB_MANIFEST_CONVERSION_TOKEN: "ghp_conversion_token"
  };
  const { sessionCookie } = await unlockSetupWizard(env);

  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard/bootstrap-session/request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `vtdd_setup_access=${sessionCookie}`
      },
      body: JSON.stringify({
        returnTo: "/setup/wizard?repo=sample-org/vtdd-v2",
        approval_phrase: "WAIT",
        passkey_verified: "false"
      })
    }),
    env
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, "approval_bound_bootstrap_session_requires_go_passkey");
});

test("worker setup wizard bootstrap writes allowlisted github app runtime secrets", async () => {
  const calls = [];
  const env = {
    SETUP_WIZARD_PASSCODE: "2468",
    CLOUDFLARE_API_TOKEN: "bootstrap-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_WORKER_SCRIPT_NAME: "vtdd-v2-mvp",
    GITHUB_MANIFEST_CONVERSION_TOKEN: "ghp_conversion_token",
    CF_API_FETCH: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: { name: "placeholder", type: "secret_text" }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }
  };
  const { sessionCookie } = await unlockSetupWizard(env);

  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard/github-app/bootstrap", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `vtdd_setup_access=${sessionCookie}`
      },
      body: JSON.stringify({
        GITHUB_APP_ID: "12345",
        GITHUB_APP_INSTALLATION_ID: "98765",
        GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----",
        returnTo: "/setup/wizard?githubAppCheck=on"
      })
    }),
    env
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.updatedSecrets.length, 3);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.url, "https://api.cloudflare.com/client/v4/accounts/account-id/workers/scripts/vtdd-v2-mvp/secrets");
    const payload = JSON.parse(String(call.init.body));
    assert.equal(["GITHUB_APP_ID", "GITHUB_APP_INSTALLATION_ID", "GITHUB_APP_PRIVATE_KEY"].includes(payload.name), true);
    assert.equal(payload.type, "secret_text");
  }
});

test("worker setup wizard manifest callback writes github app id and private key only", async () => {
  const calls = [];
  const githubCalls = [];
  const env = {
    SETUP_WIZARD_PASSCODE: "2468",
    CLOUDFLARE_API_TOKEN: "bootstrap-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_WORKER_SCRIPT_NAME: "vtdd-v2-mvp",
    GITHUB_MANIFEST_CONVERSION_TOKEN: "ghp_conversion_token",
    GITHUB_API_FETCH: async (url, init = {}) => {
      githubCalls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          id: 12345,
          pem: "-----BEGIN PRIVATE KEY-----\nmanifest\n-----END PRIVATE KEY-----",
          slug: "vtdd-butler-v2"
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" }
        }
      );
    },
    CF_API_FETCH: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: { name: "placeholder", type: "secret_text" }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }
  };
  const { sessionCookie } = await unlockSetupWizard(env);

  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard/github-app/manifest/callback?code=manifest-code&returnTo=%2Fsetup%2Fwizard%3FgithubAppCheck%3Don",
      {
        headers: {
          cookie: `vtdd_setup_access=${sessionCookie}`
        }
      }
    ),
    env
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("GitHub App manifest bootstrap completed."), true);
  assert.equal(html.includes("VTDD now has a GitHub App identity stored on Worker runtime."), true);
  assert.equal(html.includes("Install the GitHub App"), true);
  assert.equal(
    html.includes(
      "VTDD will try to detect the installation automatically before asking you for manual recovery steps."
    ),
    true
  );
  assert.equal(githubCalls.length, 1);
  assert.equal(githubCalls[0].init.headers.authorization, "Bearer ghp_conversion_token");
  assert.equal(githubCalls[0].init.headers["user-agent"], "vtdd-v2-worker");
  assert.equal(calls.length, 2);
  const names = calls.map((call) => JSON.parse(String(call.init.body)).name).sort();
  assert.deepEqual(names, ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"]);
});

test("worker setup wizard manifest callback retries token auth after bearer 403", async () => {
  const githubCalls = [];
  const env = {
    SETUP_WIZARD_PASSCODE: "2468",
    CLOUDFLARE_API_TOKEN: "bootstrap-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_WORKER_SCRIPT_NAME: "vtdd-v2-mvp",
    GITHUB_MANIFEST_CONVERSION_TOKEN: "gho_operator_token",
    GITHUB_API_FETCH: async (url, init = {}) => {
      githubCalls.push({ url: String(url), init });
      if (githubCalls.length === 1) {
        return new Response(JSON.stringify({ message: "Forbidden" }), {
          status: 403,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(
        JSON.stringify({
          id: 12345,
          pem: "-----BEGIN PRIVATE KEY-----\nmanifest\n-----END PRIVATE KEY-----",
          slug: "vtdd-butler-v2"
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" }
        }
      );
    },
    CF_API_FETCH: async () =>
      new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: { name: "placeholder", type: "secret_text" }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
  };
  const { sessionCookie } = await unlockSetupWizard(env);

  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard/github-app/manifest/callback?code=manifest-code&returnTo=%2Fsetup%2Fwizard%3FgithubAppCheck%3Don",
      {
        headers: {
          cookie: `vtdd_setup_access=${sessionCookie}`
        }
      }
    ),
    env
  );

  assert.equal(response.status, 200);
  assert.equal(githubCalls.length, 2);
  assert.equal(githubCalls[0].init.headers.authorization, "Bearer gho_operator_token");
  assert.equal(githubCalls[1].init.headers.authorization, "token gho_operator_token");
  assert.equal(githubCalls[0].init.headers["user-agent"], "vtdd-v2-worker");
  assert.equal(githubCalls[1].init.headers["user-agent"], "vtdd-v2-worker");
});

test("worker setup wizard manifest callback returns actionable 403 contract guidance", async () => {
  const env = {
    SETUP_WIZARD_PASSCODE: "2468",
    CLOUDFLARE_API_TOKEN: "bootstrap-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_WORKER_SCRIPT_NAME: "vtdd-v2-mvp",
    GITHUB_MANIFEST_CONVERSION_TOKEN: "gho_operator_token",
    GITHUB_API_FETCH: async (url) => {
      if (String(url).endsWith("/user")) {
        return new Response(
          JSON.stringify({
            login: "marushu",
            type: "User"
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-oauth-scopes": "repo, workflow, read:org"
            }
          }
        );
      }
      return new Response(JSON.stringify({}), {
        status: 403,
        headers: { "content-type": "application/json" }
      });
    }
  };
  const { sessionCookie } = await unlockSetupWizard(env);

  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard/github-app/manifest/callback?code=manifest-code&returnTo=%2Fsetup%2Fwizard%3FgithubAppCheck%3Don",
      {
        headers: {
          cookie: `vtdd_setup_access=${sessionCookie}`
        }
      }
    ),
    env
  );

  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "github_app_manifest_conversion_failed");
  assert.equal(body.reason.includes("service-owned GitHub token may be unsupported"), true);
  assert.equal(body.diagnostics.state, "token_actor_resolved");
  assert.equal(body.diagnostics.actorLogin, "marushu");
  assert.equal(body.diagnostics.actorType, "User");
  assert.deepEqual(body.diagnostics.oauthScopes, ["repo", "workflow", "read:org"]);
  assert.equal(body.diagnostics.authHeaderType, "bearer");
});

test("worker setup wizard manifest callback returns cloudflare bootstrap diagnostics when secret write auth fails", async () => {
  const env = {
    SETUP_WIZARD_PASSCODE: "2468",
    CLOUDFLARE_API_TOKEN: "bootstrap-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_WORKER_SCRIPT_NAME: "vtdd-v2-mvp",
    GITHUB_MANIFEST_CONVERSION_TOKEN: "gho_operator_token",
    GITHUB_API_FETCH: async (url) => {
      if (String(url).includes("/app-manifests/")) {
        return new Response(
          JSON.stringify({
            id: 123456,
            slug: "vtdd-butler-v2",
            pem: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
            html_url: "https://github.com/apps/vtdd-butler-v2"
          }),
          {
            status: 201,
            headers: { "content-type": "application/json" }
          }
        );
      }
      return new Response(JSON.stringify({}), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    },
    CF_API_FETCH: async (url, init) => {
      if (String(url).includes("/workers/scripts/vtdd-v2-mvp/secrets") && init?.method === "PUT") {
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 10000, message: "Authentication error" }]
          }),
          {
            status: 403,
            headers: { "content-type": "application/json" }
          }
        );
      }
      if (String(url).includes("/user/tokens/verify")) {
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 10000, message: "Authentication error" }]
          }),
          {
            status: 403,
            headers: { "content-type": "application/json" }
          }
        );
      }
      return new Response(JSON.stringify({ success: false, errors: [] }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }
  };
  const { sessionCookie } = await unlockSetupWizard(env);

  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard/github-app/manifest/callback?code=manifest-code&returnTo=%2Fsetup%2Fwizard%3FgithubAppCheck%3Don",
      {
        headers: {
          cookie: `vtdd_setup_access=${sessionCookie}`
        }
      }
    ),
    env
  );

  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "github_app_manifest_secret_write_failed");
  assert.equal(body.secretName, "GITHUB_APP_ID");
  assert.equal(body.reason, "Authentication error");
  assert.equal(body.diagnostics.state, "api_token_invalid");
  assert.equal(body.diagnostics.writeFailure.state, "insufficient_permission");
});

test("worker setup wizard manifest callback distinguishes cloudflare permission mismatch after verify succeeds", async () => {
  const env = {
    SETUP_WIZARD_PASSCODE: "2468",
    CLOUDFLARE_API_TOKEN: "bootstrap-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_WORKER_SCRIPT_NAME: "vtdd-v2-mvp",
    GITHUB_MANIFEST_CONVERSION_TOKEN: "gho_operator_token",
    GITHUB_API_FETCH: async (url) => {
      if (String(url).includes("/app-manifests/")) {
        return new Response(
          JSON.stringify({
            id: 123456,
            slug: "vtdd-butler-v2",
            pem: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
            html_url: "https://github.com/apps/vtdd-butler-v2"
          }),
          {
            status: 201,
            headers: { "content-type": "application/json" }
          }
        );
      }
      return new Response(JSON.stringify({}), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    },
    CF_API_FETCH: async (url, init) => {
      if (String(url).includes("/workers/scripts/vtdd-v2-mvp/secrets") && init?.method === "PUT") {
        return new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 1001, message: "Forbidden" }]
          }),
          {
            status: 403,
            headers: { "content-type": "application/json" }
          }
        );
      }
      if (String(url).includes("/user/tokens/verify")) {
        return new Response(
          JSON.stringify({
            success: true,
            errors: [],
            result: { status: "active" }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      if (String(url).includes("/workers/scripts/vtdd-v2-mvp/secrets") && init?.method === "GET") {
        return new Response(
          JSON.stringify({
            success: true,
            errors: [],
            result: []
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      return new Response(JSON.stringify({ success: false, errors: [] }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }
  };
  const { sessionCookie } = await unlockSetupWizard(env);

  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard/github-app/manifest/callback?code=manifest-code&returnTo=%2Fsetup%2Fwizard%3FgithubAppCheck%3Don",
      {
        headers: {
          cookie: `vtdd_setup_access=${sessionCookie}`
        }
      }
    ),
    env
  );

  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "github_app_manifest_secret_write_failed");
  assert.equal(body.diagnostics.state, "secret_write_failed_after_verify");
  assert.equal(body.diagnostics.writeFailure.state, "insufficient_permission");
  assert.equal(body.diagnostics.scriptSecretsProbe.state, "reachable");
});

test("worker setup wizard manifest callback reports unavailable when manifest conversion token is missing", async () => {
  const env = {
    SETUP_WIZARD_PASSCODE: "2468",
    CLOUDFLARE_API_TOKEN: "bootstrap-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_WORKER_SCRIPT_NAME: "vtdd-v2-mvp"
  };
  const { sessionCookie } = await unlockSetupWizard(env);

  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard/github-app/manifest/callback?code=manifest-code&returnTo=%2Fsetup%2Fwizard%3FgithubAppCheck%3Don",
      {
        headers: {
          cookie: `vtdd_setup_access=${sessionCookie}`
        }
      }
    ),
    env
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, "github_app_manifest_bootstrap_unavailable");
  assert.equal(body.missingPrerequisites.includes("GITHUB_MANIFEST_CONVERSION_TOKEN"), true);
});

test("worker setup wizard detects a single github app installation before installation id is stored", async () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem"
    },
    publicKeyEncoding: {
      type: "spki",
      format: "pem"
    }
  });
  const env = {
    GITHUB_APP_ID: "12345",
    GITHUB_APP_PRIVATE_KEY: privateKey,
    GITHUB_API_FETCH: async (url) => {
      if (String(url).endsWith("/app/installations")) {
        return new Response(
          JSON.stringify([
            {
              id: 125153871
            }
          ]),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }
      return new Response(JSON.stringify({}), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }
  };

  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2&githubAppCheck=on"
    ),
    env
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.githubAppSetupCheck.state, "installation_detected");
  assert.equal(body.githubAppSetupCheck.detectedInstallationId, "125153871");
  assert.equal(
    body.githubAppSetupCheck.installationCapturePath,
    "/setup/wizard/github-app/capture-installation"
  );
});

test("worker setup wizard can store detected installation id through narrow capture endpoint", async () => {
  const calls = [];
  const env = {
    SETUP_WIZARD_PASSCODE: "2468",
    CLOUDFLARE_API_TOKEN: "bootstrap-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_WORKER_SCRIPT_NAME: "vtdd-v2-mvp",
    GITHUB_MANIFEST_CONVERSION_TOKEN: "gho_operator_token",
    CF_API_FETCH: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: { name: "GITHUB_APP_INSTALLATION_ID", type: "secret_text" }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }
  };
  const { sessionCookie } = await unlockSetupWizard(env);

  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard/github-app/capture-installation", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `vtdd_setup_access=${sessionCookie}`
      },
      body: new URLSearchParams({
        GITHUB_APP_INSTALLATION_ID: "125153871",
        returnTo: "/setup/wizard?repo=sample-org/vtdd-v2&githubAppCheck=on"
      })
    }),
    env
  );

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "/setup/wizard?repo=sample-org/vtdd-v2&githubAppCheck=on"
  );
  assert.equal(calls.length, 1);
  const payload = JSON.parse(String(calls[0].init.body));
  assert.equal(payload.name, "GITHUB_APP_INSTALLATION_ID");
  assert.equal(payload.text, "125153871");
});

test("worker setup wizard bootstrap rejects requests with missing allowlisted values", async () => {
  const env = {
    SETUP_WIZARD_PASSCODE: "2468",
    CLOUDFLARE_API_TOKEN: "bootstrap-token",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_WORKER_SCRIPT_NAME: "vtdd-v2-mvp",
    GITHUB_MANIFEST_CONVERSION_TOKEN: "ghp_conversion_token"
  };
  const { sessionCookie } = await unlockSetupWizard(env);

  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard/github-app/bootstrap", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `vtdd_setup_access=${sessionCookie}`
      },
      body: JSON.stringify({
        GITHUB_APP_ID: "12345",
        GITHUB_APP_INSTALLATION_ID: "98765"
      })
    }),
    env
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error, "github_app_bootstrap_missing_values");
  assert.equal(body.missingSecretValues.includes("GITHUB_APP_PRIVATE_KEY"), true);
});

test("worker setup wizard html reflects direct provider recommendation when GitHub protection is unavailable", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard?repo=sample-org/vtdd-v2&repositoryVisibility=private&branchProtectionApiStatus=forbidden&rulesetsApiStatus=forbidden"
    )
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes("Deploy Authority Recommendation"), true);
  assert.equal(html.includes("direct_provider"), true);
  assert.equal(html.includes("one_shot_github_actions"), true);
  assert.equal(html.includes("degrade_from_github_actions_mvp_path_to_provider_managed_path"), true);
  assert.equal(html.includes("repositoryVisibility=private"), true);
  assert.equal(html.includes("branchProtectionApiStatus=forbidden"), true);
  assert.equal(html.includes("rulesetsApiStatus=forbidden"), true);
});

test("worker setup wizard requires repo query and returns explicit guidance", async () => {
  const response = await worker.fetch(new Request("https://example.com/setup/wizard?format=json"));
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.blockingIssues.includes("at least one repository mapping is required"), true);
  assert.equal(Array.isArray(body.guidance), true);
  assert.equal(
    body.guidance.some((item) => item.includes("repo=sample-org%2Fsample-repo")),
    true
  );
});

test("worker returns setup wizard json", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2&surface=custom_gpt"
    )
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.onboarding.customGpt.actionSchemaJson.includes("/v2/gateway"), true);
  assert.equal(
    body.onboarding.customGpt.actionSchemaImportUrl,
    "https://example.com/setup/wizard?format=openapi&repo=sample-org%2Fvtdd-v2&surface=custom_gpt"
  );
  assert.equal(
    body.onboarding.deployAuthority.relationshipToIssue37,
    "coexist_with_github_actions_mvp_path"
  );
  assert.equal(body.onboarding.productionDeploy.workflow, "deploy-production");
  assert.equal(body.onboarding.productionDeploy.environment, "production");
  assert.equal(body.onboarding.machineAuth.recommendedMode, "worker_bearer");
  assert.equal(body.onboarding.machineAuth.bearerSecretName, "VTDD_GATEWAY_BEARER_TOKEN");
  assert.equal(body.onboarding.machineAuth.actionAuthType, "Bearer");
  assert.equal(
    body.onboarding.repositoryResolution.aliasResolutionMode,
    "context_first_best_effort_for_read"
  );
  assert.equal(
    body.onboarding.repositoryResolution.executionRule,
    "unresolved_target_blocks_execution"
  );
  assert.equal(
    body.onboarding.repositoryResolution.confirmationRule,
    "resolved_target_plus_action_plus_confirm_for_execute_or_destructive"
  );
  assert.equal(body.onboarding.repositoryResolution.defaultRepositoryPolicy, "forbidden");
  assert.deepEqual(body.onboarding.memorySafety.allowedRecordTypes, [
    "decision_log",
    "proposal_log",
    "alias_registry",
    "approval_log",
    "execution_log",
    "working_memory_summary"
  ]);
  assert.deepEqual(body.onboarding.memorySafety.forbiddenContent, [
    "tokens",
    "private keys",
    "raw secrets",
    "full casual transcripts"
  ]);
  assert.equal(
    body.onboarding.memorySafety.sourceOfTruth.git,
    "shared canonical specification"
  );
  assert.equal(
    body.onboarding.memorySafety.sourceOfTruth.db,
    "user-specific memory and operational traces"
  );
  assert.deepEqual(body.onboarding.roleSeparation.butler.inputs, [
    "human conversation",
    "constitution",
    "runtime truth",
    "issue / proposal / decision context",
    "reviewer output"
  ]);
  assert.deepEqual(body.onboarding.roleSeparation.butler.outputs, [
    "structured next-step guidance",
    "execution judgment",
    "reviewer summary for human decision"
  ]);
  assert.deepEqual(body.onboarding.roleSeparation.executor.outputs, [
    "code changes",
    "tests",
    "PR artifacts",
    "execution logs"
  ]);
  assert.deepEqual(body.onboarding.roleSeparation.reviewer.inputs, ["PR diff", "review context"]);
  assert.deepEqual(body.onboarding.roleSeparation.reviewer.outputs, [
    "critical_findings[]",
    "risks[]",
    "recommended_action"
  ]);
  assert.deepEqual(body.onboarding.roleSeparation.reviewer.authorityLimits, [
    "no execution authority",
    "no merge authority",
    "no deployment authority"
  ]);
  assert.deepEqual(body.onboarding.roleSeparation.handoffOrder, [
    "Butler -> Executor",
    "Executor -> Reviewer",
    "Reviewer -> Butler",
    "Human -> Final Authority"
  ]);
  assert.equal(
    body.onboarding.surfaceIndependence.role,
    "conversation, specification support, execution judgment, context recovery"
  );
  assert.equal(
    body.onboarding.surfaceIndependence.contract,
    "inputs, outputs, judgment order, approval expectations, and resolution rules"
  );
  assert.equal(
    body.onboarding.surfaceIndependence.runtime,
    "memory retrieval, runtime truth retrieval, proposal handling, approval orchestration"
  );
  assert.deepEqual(body.onboarding.surfaceIndependence.surfaces, [
    "custom_gpt",
    "web",
    "mobile",
    "cli"
  ]);
  assert.equal(
    body.onboarding.surfaceIndependence.initialSurfacePolicy,
    "custom_gpt_allowed_but_non_canonical"
  );
  assert.deepEqual(body.onboarding.surfaceIndependence.replacementInvariants, [
    "constitution_first_preserved",
    "issue_as_spec_preserved",
    "approval_boundary_preserved",
    "judgment_model_not_redefined_by_surface"
  ]);
  assert.deepEqual(body.onboarding.butlerReviewProtocol.judgmentOrder, [
    "Constitution",
    "Runtime Truth",
    "Issue / Proposal / Decision",
    "Current question / PR / state"
  ]);
  assert.deepEqual(body.onboarding.butlerReviewProtocol.explorationPhase, [
    "discuss ideas under constitutional constraints",
    "do not normalize proposals that violate the Constitution"
  ]);
  assert.deepEqual(body.onboarding.butlerReviewProtocol.executionPhase, [
    "evaluate whether requested work is constitutionally allowed",
    "check runtime truth before trusting stale assumptions",
    "verify traceability to issue sections",
    "flag out-of-scope and dangerous changes"
  ]);
  assert.deepEqual(body.onboarding.butlerReviewProtocol.mandatoryRules, [
    "no judgment without Constitution",
    "no execution judgment before runtime truth",
    "no untraceable implementation accepted as in-scope execution",
    "no surface override of Butler judgment order"
  ]);
  assert.deepEqual(body.onboarding.retrievalContract.sources, [
    "issue",
    "constitution",
    "runtime_truth",
    "decision_log",
    "proposal_log",
    "pr_context"
  ]);
  assert.deepEqual(body.onboarding.retrievalContract.recallSourceOrder, [
    "issue",
    "constitution",
    "decision_log",
    "proposal_log",
    "pr_context"
  ]);
  assert.deepEqual(body.onboarding.retrievalContract.executionOrder, [
    "issue",
    "constitution",
    "runtime_truth",
    "decision_log",
    "proposal_log",
    "pr_context"
  ]);
  assert.deepEqual(body.onboarding.retrievalContract.useCases, [
    "recall_context",
    "similar_issue_discovery",
    "decision_rationale_lookup",
    "constitution_rule_recall"
  ]);
  assert.equal(
    body.onboarding.retrievalContract.providerModel,
    "contract_fixed_provider_agnostic_cloudflare_allowed_as_initial_runtime"
  );
  assert.equal(body.onboarding.policyEngine.mode, "deterministic");
  assert.deepEqual(body.onboarding.policyEngine.executionPreconditions, [
    "constitution consulted",
    "runtime truth available or safe fallback selected",
    "target repository resolved",
    "approval level satisfied"
  ]);
  assert.deepEqual(body.onboarding.policyEngine.decisionOrder, [
    "role boundary",
    "constitution check",
    "runtime truth check",
    "repository resolution",
    "traceability",
    "consent",
    "approval",
    "credential boundary"
  ]);
  assert.equal(body.onboarding.guardedAbsence.modeName, "guarded_absence");
  assert.equal(body.onboarding.guardedAbsence.forbiddenActions.includes("deploy_production"), true);
  assert.equal(body.onboarding.reviewer.initialReviewer, "gemini");
  assert.equal(body.onboarding.reviewer.fallbackReviewer, "antigravity");
  assert.equal(body.generatedAnswers.actionEndpointBaseUrl, "https://example.com");
  assert.equal(body.cloudflareSetupCheck.state, "disabled");
  assert.equal(body.githubAppSetupCheck.state, "not_configured");
});

test("worker returns setup wizard openapi schema for import url", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=openapi&repo=sample-org/vtdd-v2")
  );
  assert.equal(response.status, 200);
  const contentType = response.headers.get("content-type") ?? "";
  assert.equal(contentType.includes("application/json"), true);
  const body = await response.json();
  assert.equal(body.openapi, "3.1.0");
  assert.equal(body.paths["/v2/gateway"].post.operationId, "postMvpGateway");
  assert.equal(body.servers[0].url, "https://example.com");
  assert.deepEqual(Object.keys(body.components.securitySchemes), ["GatewayBearerAuth"]);
  assert.deepEqual(body.paths["/v2/gateway"].post.security, [{ GatewayBearerAuth: [] }]);
});

test("worker setup wizard returns signed import url when passcode protection is enabled", async () => {
  const env = {
    SETUP_WIZARD_PASSCODE: "2468"
  };
  const { sessionCookie } = await unlockSetupWizard(env);

  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2", {
      headers: {
        cookie: `vtdd_setup_access=${sessionCookie}`
      }
    }),
    env
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  const importUrl = new URL(body.onboarding.customGpt.actionSchemaImportUrl);
  assert.equal(importUrl.searchParams.get("format"), "openapi");
  assert.equal(importUrl.searchParams.get("repo"), "sample-org/vtdd-v2");
  assert.equal(Boolean(importUrl.searchParams.get("import_expires")), true);
  assert.equal(Boolean(importUrl.searchParams.get("import_token")), true);
});

test("worker setup wizard signed import url works without setup cookie", async () => {
  const env = {
    SETUP_WIZARD_PASSCODE: "2468"
  };
  const { sessionCookie } = await unlockSetupWizard(env);

  const setupResponse = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2", {
      headers: {
        cookie: `vtdd_setup_access=${sessionCookie}`
      }
    }),
    env
  );
  assert.equal(setupResponse.status, 200);
  const setupBody = await setupResponse.json();

  const response = await worker.fetch(
    new Request(setupBody.onboarding.customGpt.actionSchemaImportUrl),
    env
  );
  assert.equal(response.status, 200);
  const contentType = response.headers.get("content-type") ?? "";
  assert.equal(contentType.includes("application/json"), true);
  const body = await response.json();
  assert.equal(body.openapi, "3.1.0");
});

test("worker setup wizard json keeps iphone-first and no-default-repo policy visible", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2")
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.generatedAnswers.setupMode, "iphone_first");
  assert.equal(body.generatedAnswers.allowDefaultRepository, false);
  assert.equal(body.onboarding.setupMode, "iphone_first");
  assert.equal(body.onboarding.customGpt.constructionText.includes("Do not assume a default repository."), true);
});

test("worker setup wizard never exposes secret credential input fields", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2")
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal("cloudflareApiToken" in body.generatedAnswers, false);
  assert.equal("cloudflareAccountId" in body.generatedAnswers, false);
  assert.equal("githubAppPrivateKey" in body.generatedAnswers, false);
  assert.equal("githubToken" in body.generatedAnswers, false);
  assert.equal("openaiApiKey" in body.generatedAnswers, false);
  assert.equal("geminiApiKey" in body.generatedAnswers, false);
});

test("worker setup wizard reports partially configured github app bootstrap", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2"),
    {
      GITHUB_APP_ID: "12345"
    }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.githubAppSetupCheck.state, "partially_configured");
  assert.equal(
    body.githubAppSetupCheck.guidance.some((item) => item.includes("GITHUB_APP_INSTALLATION_ID")),
    true
  );
  assert.equal(
    body.githubAppSetupCheck.guidance.some((item) => item.includes("GITHUB_APP_PRIVATE_KEY")),
    true
  );
});

test("worker setup wizard verifies github app live probe when requested", async () => {
  const calls = [];
  const githubApiFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/app/installations/98765/access_tokens")) {
      return new Response(
        JSON.stringify({
          token: "ghs_minted_installation_token",
          expires_at: "2030-01-01T00:00:00Z"
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" }
        }
      );
    }
    return new Response(
      JSON.stringify({
        total_count: 1,
        repositories: [
          {
            full_name: "sample-org/vtdd-v2",
            name: "vtdd-v2",
            private: true
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  };

  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2&githubAppCheck=on"
    ),
    {
      GITHUB_APP_ID: "12345",
      GITHUB_APP_INSTALLATION_ID: "98765",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----",
      GITHUB_APP_JWT_PROVIDER: async () => "app_jwt_token_for_tests",
      GITHUB_API_FETCH: githubApiFetch
    }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.githubAppSetupCheck.state, "ready");
  assert.equal(body.githubAppSetupCheck.evidence.source, "github_app_live");
  assert.equal(body.githubAppSetupCheck.evidence.repositoryCount, 1);
  assert.equal(calls.length, 2);
});

test("worker setup wizard accepts deploy authority detection query inputs", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2&repositoryVisibility=private&branchProtectionApiStatus=forbidden&rulesetsApiStatus=forbidden"
    )
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.generatedAnswers.repositoryVisibility, "private");
  assert.equal(body.generatedAnswers.branchProtectionApiStatus, "forbidden");
  assert.equal(body.generatedAnswers.rulesetsApiStatus, "forbidden");
  assert.equal(body.onboarding.deployAuthority.selectedPath, "direct_provider");
  assert.equal(
    body.onboarding.deployAuthority.relationshipToIssue37,
    "degrade_from_github_actions_mvp_path_to_provider_managed_path"
  );
});

test("worker setup wizard classifies cloudflare billing-related setup failure", async () => {
  const calls = [];
  const cloudflareApiFetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/user/tokens/verify")) {
      return new Response(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: { status: "active" }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }
    return new Response(
      JSON.stringify({
        success: false,
        errors: [
          {
            code: 10042,
            message: "Billing setup required. Add payment method before using this feature."
          }
        ],
        messages: []
      }),
      {
        status: 403,
        headers: { "content-type": "application/json" }
      }
    );
  };

  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2&cloudflareCheck=on"
    ),
    {
      SETUP_WIZARD_CLOUDFLARE_CHECK_ENABLED: "true",
      CLOUDFLARE_API_TOKEN: "token-for-check-only",
      CLOUDFLARE_ACCOUNT_ID: "account-id-for-check-only",
      CF_API_FETCH: cloudflareApiFetch
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(calls.length, 2);
  assert.equal(body.cloudflareSetupCheck.state, "billing_action_required");
  assert.equal(
    body.cloudflareSetupCheck.summary.includes("billing/payment action may be required"),
    true
  );
  assert.equal(Array.isArray(body.cloudflareSetupCheck.links), true);
  assert.equal(body.cloudflareSetupCheck.links.length > 0, true);
});

test("worker setup wizard does not call cloudflare api unless explicitly requested", async () => {
  let called = false;
  const cloudflareApiFetch = async () => {
    called = true;
    return new Response(
      JSON.stringify({
        success: true,
        errors: [],
        messages: []
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  };

  const response = await worker.fetch(
    new Request("https://example.com/setup/wizard?format=json&repo=sample-org/vtdd-v2"),
    {
      SETUP_WIZARD_CLOUDFLARE_CHECK_ENABLED: "true",
      CLOUDFLARE_API_TOKEN: "token-for-check-only",
      CLOUDFLARE_ACCOUNT_ID: "account-id-for-check-only",
      CF_API_FETCH: cloudflareApiFetch
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.cloudflareSetupCheck.state, "disabled");
  assert.equal(called, false);
});

test("worker runs gateway route", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO deploy request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "sample-org/vtdd-v2");
});

test("worker gateway allows butler path when deterministic judgment order is satisfied", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: validButlerJudgmentTrace,
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "sample-org/vtdd-v2");
});

test("worker gateway blocks butler path when judgment order is invalid", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "custom_gpt",
          judgmentModelId: "vtdd-butler-core-v1"
        },
        judgmentTrace: [
          JudgmentStep.RUNTIME_TRUTH,
          JudgmentStep.CONSTITUTION,
          JudgmentStep.ISSUE_CONTEXT,
          JudgmentStep.CURRENT_QUERY
        ],
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "butler_invalid_judgment_order");
});

test("worker gateway blocks butler path when surface overrides judgment model", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: ActorRole.BUTLER,
        surfaceContext: {
          surface: "web",
          judgmentModelId: "vendor-specific-model"
        },
        judgmentTrace: validButlerJudgmentTrace,
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "surface_must_not_override_judgment_model");
});

test("worker gateway allows pr comment without GO when other gates pass", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.PR_COMMENT,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "",
          approvalScopeMatched: false,
          issueTraceable: true,
          go: false,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.requiredApproval, "none");
});

test("worker gateway blocks pr review submit without GO", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.PR_REVIEW_SUBMIT,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO review submit",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: false,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "approval_boundary");
  assert.equal(body.reason, "explicit GO is required before execution");
});

test("worker gateway keeps merge on GO plus passkey boundary", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.MERGE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.HIGH_RISK,
            shortLived: true,
            boundApprovalId: "approval-merge-1"
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO merge request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "approval_boundary");
  assert.equal(body.reason, "high-risk action requires GO + passkey");
});

test("worker gateway blocks merge in guarded absence mode and records stop log", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.MERGE,
          mode: TaskMode.EXECUTION,
          autonomyMode: AutonomyMode.GUARDED_ABSENCE,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.HIGH_RISK,
            shortLived: true,
            boundApprovalId: "approval-123"
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO merge request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: true
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "guarded_absence_forbids_action");
  assert.equal(Boolean(body.guardedAbsenceExecutionLog?.recordId), true);

  const records = await provider.retrieve({
    type: MemoryRecordType.EXECUTION_LOG,
    limit: 5
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].content.mode, "guarded_absence");
  assert.equal(records[0].content.allowed, false);
  assert.equal(records[0].content.blockedByRule, "guarded_absence_forbids_action");
});

test("worker runtime forced guarded absence mode overrides payload normal mode", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.PR_OPERATION,
          mode: TaskMode.EXECUTION,
          autonomyMode: AutonomyMode.NORMAL,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true,
            runtimeState: {
              issuePrCount: 1
            }
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO pr operation",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      VTDD_AUTONOMY_MODE: "guarded_absence",
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.autonomyMode, AutonomyMode.GUARDED_ABSENCE);
  assert.equal(
    body.warnings.includes(
      "runtime forces guarded absence mode; payload autonomyMode override was ignored"
    ),
    true
  );
  assert.equal(Boolean(body.guardedAbsenceExecutionLog?.recordId), true);

  const records = await provider.retrieve({
    type: MemoryRecordType.EXECUTION_LOG,
    limit: 5
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].content.mode, "guarded_absence");
  assert.equal(records[0].content.allowed, true);
  assert.equal(records[0].content.actionType, ActionType.PR_OPERATION);
  assert.equal(records[0].content.blockedByRule, null);
});

test("worker guarded absence blocks ambiguous request and records stop log", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          autonomyMode: AutonomyMode.GUARDED_ABSENCE,
          ambiguity: {
            ambiguousRequest: true
          },
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO build request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "guarded_absence_blocks_ambiguous_request");
  assert.equal(Boolean(body.guardedAbsenceExecutionLog?.recordId), true);

  const records = await provider.retrieve({
    type: MemoryRecordType.EXECUTION_LOG,
    limit: 5
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].content.blockedByRule, "guarded_absence_blocks_ambiguous_request");
});

test("worker guarded absence blocks spec conflict and records stop log", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          autonomyMode: AutonomyMode.GUARDED_ABSENCE,
          ambiguity: {
            specConflict: true
          },
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO build request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "guarded_absence_blocks_spec_conflict");
  assert.equal(Boolean(body.guardedAbsenceExecutionLog?.recordId), true);

  const records = await provider.retrieve({
    type: MemoryRecordType.EXECUTION_LOG,
    limit: 5
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].content.blockedByRule, "guarded_absence_blocks_spec_conflict");
});

test("worker guarded absence blocks unconfirmed target and records stop log", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          autonomyMode: AutonomyMode.GUARDED_ABSENCE,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: false,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO build request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "target_confirmation_required");
  assert.equal(Boolean(body.guardedAbsenceExecutionLog?.recordId), true);

  const records = await provider.retrieve({
    type: MemoryRecordType.EXECUTION_LOG,
    limit: 5
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].content.blockedByRule, "target_confirmation_required");
});

test("worker gateway uses github app live repository index for natural list conversation", async () => {
  const githubApiFetch = async () =>
    new Response(
      JSON.stringify({
        total_count: 2,
        repositories: [
          {
            full_name: "sample-org/vtdd-v2",
            name: "vtdd-v2",
            private: true
          },
          {
            full_name: "sample-org/accounting-app",
            name: "accounting-app",
            private: false
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        conversation: {
          userText: "持ってるリポジトリ一覧を見せて"
        },
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "unknown",
          runtimeTruth: {
            runtimeAvailable: false,
            safeFallbackChosen: true
          },
          consent: {
            grantedCategories: [ConsentCategory.READ]
          },
          issueTraceable: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_live_index_token",
      GITHUB_API_FETCH: githubApiFetch
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.conversationAssist.detectedIntent, "list_repositories");
  assert.equal(body.conversationAssist.responseGuide.style, "repository_list");
  assert.equal(body.repositoryCandidates.length, 2);
  assert.equal(
    body.repositoryCandidates.some((item) => item.canonicalRepo === "sample-org/vtdd-v2"),
    true
  );
  assert.equal(
    body.repositoryCandidates.some(
      (item) => item.canonicalRepo === "sample-org/accounting-app" && item.visibility === "public"
    ),
    true
  );
});

test("worker gateway resolves repository switch intent using live github app aliases", async () => {
  const githubApiFetch = async () =>
    new Response(
      JSON.stringify({
        total_count: 1,
        repositories: [
          {
            full_name: "sample-org/vtdd-v2",
            name: "vtdd-v2",
            private: true
          }
        ]
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        conversation: {
          userText: "VTDD を開いて",
          currentRepository: "sample-org/accounting-app"
        },
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          runtimeTruth: {
            runtimeAvailable: false,
            safeFallbackChosen: true
          },
          consent: {
            grantedCategories: [ConsentCategory.READ]
          },
          issueTraceable: false
        }
      })
    }),
    {
      ...gatewayAuthEnv,
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_live_index_token",
      GITHUB_API_FETCH: githubApiFetch
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "sample-org/vtdd-v2");
  assert.equal(body.conversationAssist.mentionedRepository, "sample-org/vtdd-v2");
  assert.equal(body.conversationAssist.requiresConfirmation, true);
});

test("worker accepts legacy /mvp gateway route for compatibility", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/mvp/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
});

test("worker gateway persists decision log and returns decision references", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        },
        memoryRecord: {
          recordType: "decision_log",
          content: {
            decision: "Issue #17 の接続不足を修正する",
            rationale: "Butler が過去判断を理由付きで説明できるようにする",
            relatedIssue: 17
          },
          metadata: {
            decidedBy: "shuhei"
          }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(Boolean(body.memoryWritePersisted?.recordId), true);
  assert.equal(body.retrievalReferences.decisionLogs.length, 1);
  assert.equal(body.retrievalReferences.decisionLogs[0].relatedIssue, 17);
});

test("worker gateway blocks invalid decision log schema", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        },
        memoryRecord: {
          recordType: "decision_log",
          content: {
            decision: "Issue #17 の接続不足を修正する",
            relatedIssue: 17
          }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "decision_log_schema_invalid");
});

test("worker gateway requires memory provider for decision log persistence", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO issue create",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        },
        memoryRecord: {
          recordType: "decision_log",
          content: {
            decision: "Issue #17 の接続不足を修正する",
            rationale: "理由参照を復元する",
            relatedIssue: 17
          }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    }
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.error, "memory_provider_unavailable");
});

test("worker gateway persists proposal log and returns proposal references", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO proposal capture",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        },
        memoryRecord: {
          recordType: "proposal_log",
          content: {
            hypothesis: "Issue化前の検討案を保存する",
            options: ["案A", "案B"],
            rejectedReasons: [{ option: "案A", reason: "安全境界が弱い" }],
            concerns: ["検討履歴が消える"],
            unresolvedQuestions: ["表示戦略はどうするか"],
            relatedIssue: 20,
            proposedBy: "shuhei"
          }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(Boolean(body.memoryWritePersisted?.recordId), true);
  assert.equal(body.memoryWritePersisted.recordType, "proposal_log");
  assert.equal(body.retrievalReferences.proposalLogs.length, 1);
  assert.equal(body.retrievalReferences.proposalLogs[0].relatedIssue, 20);
});

test("worker gateway blocks invalid proposal log schema", async () => {
  const provider = createInMemoryMemoryProvider();
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO proposal capture",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        },
        memoryRecord: {
          recordType: "proposal_log",
          content: {
            hypothesis: "Issue化前の検討案を保存する"
          }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "proposal_log_schema_invalid");
});

test("worker gateway requires memory provider for proposal log persistence", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.ISSUE_CREATE,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.EXECUTE
          },
          consent: {
            grantedCategories: [ConsentCategory.PROPOSE]
          },
          approvalPhrase: "GO proposal capture",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        },
        memoryRecord: {
          recordType: "proposal_log",
          content: {
            hypothesis: "Issue化前の検討案を保存する",
            options: ["案A"],
            concerns: ["検討履歴が消える"],
            unresolvedQuestions: ["表示戦略はどうするか"]
          }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    }
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.error, "memory_provider_unavailable");
});

test("worker blocks gateway without required bearer token", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    }
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("worker blocks gateway when machine auth runtime is not configured", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    {}
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
  assert.equal(
    body.reason,
    "machine auth runtime is not configured for /v2/gateway (legacy /mvp/gateway is also accepted)"
  );
});

test("worker blocks gateway with invalid bearer token as forbidden", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer wrong-token"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    }
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("worker accepts gateway with valid bearer token", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
});

test("worker accepts gateway with valid Cloudflare Access service token headers", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-access-client-id": "access-id",
        "cf-access-client-secret": "access-secret"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    {
      CF_ACCESS_CLIENT_ID: "access-id",
      CF_ACCESS_CLIENT_SECRET: "access-secret"
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
});

test("worker blocks gateway without Cloudflare Access service token headers", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    {
      CF_ACCESS_CLIENT_ID: "access-id",
      CF_ACCESS_CLIENT_SECRET: "access-secret"
    }
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("worker blocks gateway with invalid Cloudflare Access service token headers", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-access-client-id": "access-id",
        "cf-access-client-secret": "wrong-secret"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    {
      CF_ACCESS_CLIENT_ID: "access-id",
      CF_ACCESS_CLIENT_SECRET: "access-secret"
    }
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("worker accepts legacy MVP_GATEWAY_BEARER_TOKEN env on /v2 route", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer legacy-token"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    {
      MVP_GATEWAY_BEARER_TOKEN: "legacy-token"
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
});

test("worker blocks constitution retrieve without required bearer token", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/constitution"),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    }
  );

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("worker blocks constitution retrieve when machine auth runtime is not configured", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/constitution"),
    {}
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
  assert.equal(
    body.reason,
    "machine auth runtime is not configured for /v2/retrieve/constitution (legacy /mvp/retrieve/constitution is also accepted)"
  );
});

test("worker returns constitution records through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "constitution-1",
    type: MemoryRecordType.CONSTITUTION,
    content: { rule: "runtime_truth_over_memory" },
    metadata: { version: "v2" },
    priority: 90,
    tags: ["constitution"],
    createdAt: "2026-04-16T02:00:00Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/constitution?limit=3", {
      headers: {
        authorization: "Bearer test-token"
      }
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.recordType, "constitution");
  assert.equal(body.recordCount, 1);
  assert.equal(body.records[0].id, "constitution-1");
});

test("worker returns decision log references through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "decision-1",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "Issue #17 を再接続する",
      rationale: "Butler 参照を復元する",
      relatedIssue: 17,
      decidedBy: "shuhei",
      timestamp: "2026-04-16T01:00:00Z",
      supersededBy: null
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 95,
    tags: ["decision_log", "issue:17"],
    createdAt: "2026-04-16T01:00:00Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/decisions?relatedIssue=17&limit=3", {
      headers: {
        authorization: "Bearer test-token"
      }
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.recordType, "decision_log");
  assert.equal(body.recordCount, 1);
  assert.equal(body.references[0].relatedIssue, 17);
});

test("worker returns proposal log references through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "proposal-1",
    type: MemoryRecordType.PROPOSAL_LOG,
    content: {
      hypothesis: "Issue化前の案を保存する",
      options: ["案A", "案B"],
      rejectedReasons: [{ option: "案A", reason: "安全境界が弱い" }],
      concerns: ["記録漏れ"],
      unresolvedQuestions: ["表示順をどうするか"],
      relatedIssue: 20,
      proposedBy: "shuhei",
      timestamp: "2026-04-16T01:30:00Z"
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 85,
    tags: ["proposal_log", "issue:20"],
    createdAt: "2026-04-16T01:30:00Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/proposals?relatedIssue=20&limit=3", {
      headers: {
        authorization: "Bearer test-token"
      }
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.recordType, "proposal_log");
  assert.equal(body.recordCount, 1);
  assert.equal(body.references[0].relatedIssue, 20);
});

test("worker returns cross-issue memory index through retrieve route", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "constitution-cross-1",
    type: MemoryRecordType.CONSTITUTION,
    content: {
      title: "constitution_rule",
      description: "Constitution should be returned in cross retrieval."
    },
    metadata: { version: "v2" },
    priority: 90,
    tags: ["constitution"],
    createdAt: "2026-04-16T03:00:00Z"
  });
  await provider.store({
    id: "decision-cross-1",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "Cross retrieval should include decisions",
      rationale: "Butler needs why trace",
      relatedIssue: 19,
      decidedBy: "owner",
      timestamp: "2026-04-16T03:10:00Z",
      supersededBy: null
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 95,
    tags: ["decision_log", "issue:19"],
    createdAt: "2026-04-16T03:10:00Z"
  });
  await provider.store({
    id: "proposal-cross-1",
    type: MemoryRecordType.PROPOSAL_LOG,
    content: {
      hypothesis: "Cross retrieval API should include proposal context",
      options: ["route", "route+orchestration"],
      rejectedReasons: [{ option: "route", reason: "insufficient review history" }],
      concerns: ["search drift"],
      unresolvedQuestions: ["UI wiring timing"],
      relatedIssue: 19,
      proposedBy: "owner",
      timestamp: "2026-04-16T03:20:00Z"
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 85,
    tags: ["proposal_log", "issue:19"],
    createdAt: "2026-04-16T03:20:00Z"
  });
  await provider.store({
    id: "execution-cross-pr-101",
    type: MemoryRecordType.EXECUTION_LOG,
    content: {
      summary: "PR #101 contains review summary for issue #19",
      relatedIssue: 19,
      prNumber: 101,
      reviewer: "gemini",
      status: "approved"
    },
    metadata: { kind: "pr_review_summary", repository: "sample-org/vtdd-v2" },
    priority: 80,
    tags: ["pr_context", "pr:101", "issue:19"],
    createdAt: "2026-04-16T03:30:00Z"
  });

  const response = await worker.fetch(
    new Request(
      "https://example.com/v2/retrieve/cross?phase=execution&relatedIssue=19&issueNumber=19&issueTitle=Retrieval%20Contract&limit=8",
      {
        headers: {
          authorization: "Bearer test-token"
        }
      }
    ),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.retrievalPlan.sources[0], "issue");
  assert.equal(body.primaryReference.source, "issue");
  assert.equal(body.orderedReferences[0].source, "issue");
  assert.equal(body.orderedReferences[1].source, "constitution");
  assert.equal(body.orderedReferences[2].source, "decision_log");
  assert.equal(body.referencesBySource.decision_log.length, 1);
  assert.equal(body.referencesBySource.proposal_log.length, 1);
  assert.equal(body.referencesBySource.pr_context.length, 1);
  assert.equal(body.referencesBySource.pr_context[0].prNumber, 101);
});

test("worker gateway attaches cross retrieval references for recall conversation", async () => {
  const provider = createInMemoryMemoryProvider();
  await provider.store({
    id: "constitution-gw-cross-1",
    type: MemoryRecordType.CONSTITUTION,
    content: {
      title: "constitution_rule",
      description: "Constitution first for recall flow."
    },
    metadata: { version: "v2" },
    priority: 90,
    tags: ["constitution"],
    createdAt: "2026-04-16T04:00:00Z"
  });
  await provider.store({
    id: "decision-gw-cross-1",
    type: MemoryRecordType.DECISION_LOG,
    content: {
      decision: "Use cross retrieval for recall UX",
      rationale: "Avoid asking users for API paths",
      relatedIssue: 19,
      decidedBy: "owner",
      timestamp: "2026-04-16T04:10:00Z",
      supersededBy: null
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 95,
    tags: ["decision_log", "issue:19"],
    createdAt: "2026-04-16T04:10:00Z"
  });
  await provider.store({
    id: "proposal-gw-cross-1",
    type: MemoryRecordType.PROPOSAL_LOG,
    content: {
      hypothesis: "Conversation-first UX should call cross retrieval via gateway",
      options: ["gateway attach", "manual retrieve endpoint"],
      rejectedReasons: [{ option: "manual retrieve endpoint", reason: "too technical for mobile" }],
      concerns: ["prompt drift"],
      unresolvedQuestions: ["how to present condensed output"],
      relatedIssue: 19,
      proposedBy: "owner",
      timestamp: "2026-04-16T04:20:00Z"
    },
    metadata: { repository: "sample-org/vtdd-v2" },
    priority: 85,
    tags: ["proposal_log", "issue:19"],
    createdAt: "2026-04-16T04:20:00Z"
  });
  await provider.store({
    id: "execution-gw-cross-pr-120",
    type: MemoryRecordType.EXECUTION_LOG,
    content: {
      summary: "PR #120 validated cross retrieval shape",
      relatedIssue: 19,
      prNumber: 120,
      reviewer: "gemini",
      status: "approved"
    },
    metadata: { kind: "pr_review_summary", repository: "sample-org/vtdd-v2" },
    priority: 82,
    tags: ["pr_context", "pr:120", "issue:19"],
    createdAt: "2026-04-16T04:30:00Z"
  });

  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token"
      },
      body: JSON.stringify({
        phase: "exploration",
        actorRole: "executor",
        conversation: {
          userText: "Issue #19 って何だっけ？過去判断と提案を振り返りたい"
        },
        policyInput: {
          actionType: ActionType.READ,
          mode: TaskMode.READ_ONLY,
          repositoryInput: "vtdd",
          consent: { grantedCategories: [ConsentCategory.READ] }
        }
      })
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token",
      MEMORY_PROVIDER: provider
    }
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.conversationAssist.detectedIntent, "recall_context");
  assert.equal(body.retrievalReferences.cross.displayMode, "short");
  assert.equal(body.retrievalReferences.cross.relatedIssue, 19);
  assert.equal(body.retrievalReferences.cross.sourceCounts.decision_log, 1);
  assert.equal(body.retrievalReferences.cross.sourceCounts.proposal_log, 1);
  assert.equal(body.retrievalReferences.cross.sourceCounts.pr_context, 1);
  assert.deepEqual(body.conversationAssist.responseGuide.sourceOrder, [
    "issue",
    "constitution",
    "decision_log",
    "proposal_log",
    "pr_context"
  ]);
});

test("worker returns 503 when constitution retrieve provider is unavailable", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/retrieve/constitution", {
      headers: {
        authorization: "Bearer test-token"
      }
    }),
    {
      VTDD_GATEWAY_BEARER_TOKEN: "test-token"
    }
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "memory_provider_unavailable");
});

test("worker blocks invalid policy input", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/v2/gateway", {
      method: "POST",
      headers: gatewayAuthHeaders,
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.DEPLOY_PRODUCTION,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
          targetConfirmed: true,
          constitutionConsulted: true,
          runtimeTruth: {
            runtimeAvailable: true
          },
          credential: {
            model: "github_app",
            tier: CredentialTier.HIGH_RISK
          },
          consent: {
            grantedCategories: [ConsentCategory.EXECUTE]
          },
          approvalPhrase: "GO deploy request",
          approvalScopeMatched: true,
          issueTraceable: true,
          go: true,
          passkey: false
        }
      })
    }),
    gatewayAuthEnv
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.allowed, false);
  assert.equal(body.blockedByRule, "approval_boundary");
});

test("worker returns not_found for unknown route", async () => {
  const response = await worker.fetch(new Request("https://example.com/unknown"));
  assert.equal(response.status, 404);
});
