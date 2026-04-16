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
  assert.equal(result.onboarding.customGpt.endpointBaseUrl, "https://vtdd-v2-mvp.example.workers.dev");
  assert.equal(result.onboarding.customGpt.actionSchemaJson.includes("/v2/gateway"), true);
  assert.equal(result.onboarding.deployAuthority.selectedPath, "one_shot_github_actions");
  assert.equal(result.onboarding.deployAuthority.fallbackPath, "direct_provider");
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
  assert.equal(Boolean(parsed?.components?.securitySchemes?.GatewayAccessClientIdHeader), true);
  assert.equal(Boolean(parsed?.components?.securitySchemes?.GatewayAccessClientSecretHeader), true);
  assert.equal(
    typeof parsed?.components?.schemas === "object" && !Array.isArray(parsed?.components?.schemas),
    true
  );
  assert.equal(
    Array.isArray(parsed?.paths?.["/v2/gateway"]?.post?.security),
    true
  );
  assert.equal(
    Array.isArray(parsed?.paths?.["/v2/retrieve/constitution"]?.get?.security),
    true
  );
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
