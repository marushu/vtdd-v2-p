import test from "node:test";
import assert from "node:assert/strict";

import {
  CustomGptSetupArtifact,
  evaluateButlerSelfParity,
  retrieveCustomGptSetupArtifact
} from "../src/core/index.js";

function encodeContent(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

test("retrieveCustomGptSetupArtifact returns canonical setup artifact content from GitHub", async () => {
  const result = await retrieveCustomGptSetupArtifact({
    artifact: CustomGptSetupArtifact.INSTRUCTIONS,
    repository: "sample-org/vtdd-v2-p",
    ref: "main",
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        assert.equal(
          parsed.pathname,
          "/repos/sample-org/vtdd-v2-p/contents/docs/setup/custom-gpt-instructions.md"
        );
        assert.equal(parsed.searchParams.get("ref"), "main");
        return new Response(
          JSON.stringify({
            sha: "abc123",
            encoding: "base64",
            content: encodeContent("vtddRetrieveSelfParity\nAction Schema update required")
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.artifact.artifact, "instructions");
  assert.equal(result.artifact.path, "docs/setup/custom-gpt-instructions.md");
  assert.equal(result.artifact.sha, "abc123");
  assert.equal(result.artifact.content.includes("vtddRetrieveSelfParity"), true);
});

test("retrieveCustomGptSetupArtifact rejects unsupported artifacts", async () => {
  const result = await retrieveCustomGptSetupArtifact({
    artifact: "pdf_bundle",
    repository: "sample-org/vtdd-v2-p",
    env: { GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read" }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.error, "custom_gpt_setup_artifact_request_invalid");
});

test("evaluateButlerSelfParity reports deploy update required when canonical setup expects missing runtime features", async () => {
  const canonicalInstructions = [
    "vtddGateway",
    "vtddRetrieveGitHub",
    "vtddDeployProduction",
    "vtddRetrieveSetupArtifact",
    "vtddRetrieveSelfParity",
    "Action Schema update required",
    "Instructions update required",
    "Cloudflare deploy update required"
  ].join("\n");
  const canonicalOpenApi = [
    "paths:",
    "  /v2/gateway:",
    "  /v2/action/deploy:",
    "  /v2/retrieve/github:",
    "  /v2/retrieve/setup-artifact:",
    "  /v2/retrieve/self-parity:",
    "    get:",
    "      operationId: vtddGateway",
    "      operationId: vtddDeployProduction",
    "      operationId: vtddRetrieveGitHub",
    "      operationId: vtddRetrieveSetupArtifact",
    "      operationId: vtddRetrieveSelfParity",
    "      operationId: vtddBrandNewParityRoute"
  ].join("\n");

  const result = await evaluateButlerSelfParity({
    repository: "sample-org/vtdd-v2-p",
    ref: "main",
    runtimeOrigin: "https://sample-user-vtdd.example.workers.dev",
    issueNumber: 91,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        const isInstructions = parsed.pathname.endsWith("/docs/setup/custom-gpt-instructions.md");
        return new Response(
          JSON.stringify({
            sha: isInstructions ? "instructions-sha" : "openapi-sha",
            encoding: "base64",
            content: encodeContent(isInstructions ? canonicalInstructions : canonicalOpenApi)
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.selfParity.runtimeParity, "cloudflare_deploy_update_required");
  assert.equal(result.selfParity.runtimeMissingOperationIds.includes("vtddBrandNewParityRoute"), true);
  assert.deepEqual(result.selfParity.staleCapabilities, {
    routes: [],
    operationIds: ["vtddBrandNewParityRoute"],
    instructionTokens: []
  });
  assert.equal(result.selfParity.recommendedActions.includes("Cloudflare deploy update required."), true);
  assert.equal(
    result.selfParity.deployRecovery.operatorUrl,
    "https://sample-user-vtdd.example.workers.dev/v2/approval/passkey/operator?repositoryInput=sample-org%2Fvtdd-v2-p&phase=execution&actionType=deploy_production&highRiskKind=deploy_production&issueNumber=91"
  );
  assert.equal(result.selfParity.deployOperatorUrl, result.selfParity.deployRecovery.operatorUrl);
  assert.equal(
    result.selfParity.deployOperatorMarkdownLink,
    `[Open deploy operator](${result.selfParity.deployOperatorUrl})`
  );
  assert.equal(
    result.selfParity.deployRecovery.operatorMarkdownLink,
    result.selfParity.deployOperatorMarkdownLink
  );
  assert.equal(
    result.selfParity.recommendedActions.some((item) => item.includes("/v2/approval/passkey/operator")),
    true
  );
});

test("evaluateButlerSelfParity treats current nickname and secret sync actions as deployed runtime capabilities", async () => {
  const canonicalInstructions = [
    "vtddGateway",
    "vtddExecute",
    "vtddWriteGitHub",
    "vtddGitHubAuthority",
    "vtddDeployProduction",
    "vtddSyncGitHubActionsSecret",
    "vtddUpsertRepositoryNickname",
    "vtddExecutionProgress",
    "vtddRetrieveGitHub",
    "vtddRetrieveRepositoryNicknames",
    "vtddRetrieveSetupArtifact",
    "vtddRetrieveSelfParity",
    "Action Schema update required",
    "Instructions update required",
    "Cloudflare deploy update required"
  ].join("\n");
  const canonicalOpenApi = [
    "paths:",
    "  /health:",
    "    get:",
    "      operationId: getHealth",
    "  /v2/gateway:",
    "    post:",
    "      operationId: vtddGateway",
    "  /v2/action/execute:",
    "    post:",
    "      operationId: vtddExecute",
    "  /v2/action/github:",
    "    post:",
    "      operationId: vtddWriteGitHub",
    "  /v2/action/github-authority:",
    "    post:",
    "      operationId: vtddGitHubAuthority",
    "  /v2/action/deploy:",
    "    post:",
    "      operationId: vtddDeployProduction",
    "  /v2/action/github-actions-secret:",
    "    post:",
    "      operationId: vtddSyncGitHubActionsSecret",
    "  /v2/action/repository-nickname:",
    "    post:",
    "      operationId: vtddUpsertRepositoryNickname",
    "  /v2/action/progress:",
    "    get:",
    "      operationId: vtddExecutionProgress",
    "  /v2/retrieve/github:",
    "    get:",
    "      operationId: vtddRetrieveGitHub",
    "  /v2/retrieve/repository-nicknames:",
    "    get:",
    "      operationId: vtddRetrieveRepositoryNicknames",
    "  /v2/retrieve/approval-grant:",
    "    get:",
    "      operationId: vtddRetrieveApprovalGrant",
    "  /v2/retrieve/setup-artifact:",
    "    get:",
    "      operationId: vtddRetrieveSetupArtifact",
    "  /v2/retrieve/self-parity:",
    "    get:",
    "      operationId: vtddRetrieveSelfParity"
  ].join("\n");

  const result = await evaluateButlerSelfParity({
    repository: "sample-org/vtdd-v2-p",
    ref: "main",
    runtimeOrigin: "https://sample-user-vtdd.example.workers.dev",
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        const isInstructions = parsed.pathname.endsWith("/docs/setup/custom-gpt-instructions.md");
        return new Response(
          JSON.stringify({
            sha: isInstructions ? "instructions-sha" : "openapi-sha",
            encoding: "base64",
            content: encodeContent(isInstructions ? canonicalInstructions : canonicalOpenApi)
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.selfParity.runtimeParity, "in_sync");
  assert.deepEqual(result.selfParity.runtimeMissingRoutes, []);
  assert.deepEqual(result.selfParity.runtimeMissingOperationIds, []);
  assert.deepEqual(result.selfParity.runtimeMissingInstructionTokens, []);
  assert.equal(result.selfParity.staleCapabilities, null);
  assert.equal(
    result.selfParity.deployOperatorUrl,
    "https://sample-user-vtdd.example.workers.dev/v2/approval/passkey/operator?repositoryInput=sample-org%2Fvtdd-v2-p&phase=execution&actionType=deploy_production&highRiskKind=deploy_production"
  );
  assert.equal(
    result.selfParity.deployOperatorMarkdownLink,
    `[Open deploy operator](${result.selfParity.deployOperatorUrl})`
  );
  assert.equal(result.selfParity.deployRecovery, null);
});
