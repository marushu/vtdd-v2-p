import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCustomGptRecoveryBundle,
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
    "vtddRetrieveCloudflarePages",
    "vtddRetrieveConstitution",
    "vtddRetrieveDecisionLogs",
    "vtddRetrieveProposalLogs",
    "vtddRetrieveCrossMemory",
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
    "  /v2/retrieve/constitution:",
    "  /v2/retrieve/decisions:",
    "  /v2/retrieve/proposals:",
    "  /v2/retrieve/cross:",
    "  /v2/retrieve/cloudflare-pages:",
    "  /v2/retrieve/setup-artifact:",
    "  /v2/retrieve/self-parity:",
    "    get:",
    "      operationId: vtddGateway",
    "      operationId: vtddDeployProduction",
    "      operationId: vtddRetrieveGitHub",
    "      operationId: vtddRetrieveConstitution",
    "      operationId: vtddRetrieveDecisionLogs",
    "      operationId: vtddRetrieveProposalLogs",
    "      operationId: vtddRetrieveCrossMemory",
    "      operationId: vtddRetrieveCloudflarePages",
    "      operationId: vtddRetrieveSetupArtifact",
    "      operationId: vtddRetrieveSelfParity",
    "      operationId: vtddBrandNewParityRoute"
  ].join("\n");

  const result = await evaluateButlerSelfParity({
    repository: "sample-org/vtdd-v2-p",
    ref: "main",
    runtimeOrigin: "https://sample-user-vtdd.example.workers.dev",
    issueNumber: 91,
    pullNumber: 148,
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
    result.selfParity.issueCloseOperatorUrl,
    "https://sample-user-vtdd.example.workers.dev/v2/approval/passkey/operator?repositoryInput=sample-org%2Fvtdd-v2-p&phase=execution&actionType=issue_close&highRiskKind=issue_close&issueNumber=91&pullNumber=148"
  );
  assert.equal(
    result.selfParity.issueCloseOperatorMarkdownLink,
    `[Open issue close operator](${result.selfParity.issueCloseOperatorUrl})`
  );
  assert.deepEqual(result.selfParity.issueCloseOperator, {
    actionType: "issue_close",
    highRiskKind: "issue_close",
    requires: ["GO", "real passkey", "merged pull proof"],
    repository: "sample-org/vtdd-v2-p",
    issueNumber: 91,
    pullNumber: 148,
    operatorUrl: result.selfParity.issueCloseOperatorUrl,
    operatorMarkdownLink: result.selfParity.issueCloseOperatorMarkdownLink,
    status: "ready",
    blockers: []
  });
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
    "vtddDeleteRepositoryNickname",
    "vtddExecutionProgress",
    "vtddRetrieveConstitution",
    "vtddRetrieveDecisionLogs",
    "vtddRetrieveProposalLogs",
    "vtddRetrieveCrossMemory",
    "vtddRetrieveOperationalMemory",
    "vtddRetrieveGitHub",
    "vtddRetrieveCloudflarePages",
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
    "  /v2/action/repository-nickname/delete:",
    "    post:",
    "      operationId: vtddDeleteRepositoryNickname",
    "  /v2/action/progress:",
    "    get:",
    "      operationId: vtddExecutionProgress",
    "  /v2/retrieve/constitution:",
    "    get:",
    "      operationId: vtddRetrieveConstitution",
    "  /v2/retrieve/decisions:",
    "    get:",
    "      operationId: vtddRetrieveDecisionLogs",
    "  /v2/retrieve/proposals:",
    "    get:",
    "      operationId: vtddRetrieveProposalLogs",
    "  /v2/retrieve/cross:",
    "    get:",
    "      operationId: vtddRetrieveCrossMemory",
    "  /v2/retrieve/operational-memory:",
    "    get:",
    "      operationId: vtddRetrieveOperationalMemory",
    "  /v2/retrieve/github:",
    "    get:",
    "      operationId: vtddRetrieveGitHub",
    "  /v2/retrieve/repository-nicknames:",
    "    get:",
    "      operationId: vtddRetrieveRepositoryNicknames",
    "  /v2/retrieve/approval-grant:",
    "    get:",
    "      operationId: vtddRetrieveApprovalGrant",
    "  /v2/retrieve/cloudflare-pages:",
    "    get:",
    "      operationId: vtddRetrieveCloudflarePages",
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
  assert.equal(result.selfParity.issueCloseOperatorUrl, null);
  assert.equal(result.selfParity.issueCloseOperator, null);
  assert.equal(result.selfParity.deployRecovery, null);
});

test("evaluateButlerSelfParity reports issue close operator blockers without constructing a URL", async () => {
  const canonicalOpenApi = [
    "openapi: 3.1.1",
    "paths:",
    "  /v2/action/gateway:",
    "    post:",
    "      operationId: vtddGateway",
    "  /v2/action/deploy-production:",
    "    post:",
    "      operationId: vtddDeployProduction",
    "  /v2/retrieve/github:",
    "    get:",
    "      operationId: vtddRetrieveGitHub",
    "  /v2/retrieve/self-parity:",
    "    get:",
    "      operationId: vtddRetrieveSelfParity"
  ].join("\n");
  const canonicalInstructions = [
    "vtddGateway",
    "vtddDeployProduction",
    "vtddRetrieveGitHub",
    "vtddRetrieveSelfParity"
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
  assert.equal(result.selfParity.issueCloseOperatorUrl, null);
  assert.equal(result.selfParity.issueCloseOperator.status, "missing_merged_pull_number");
  assert.deepEqual(result.selfParity.issueCloseOperator.blockers, ["missing_merged_pull_number"]);
});

test("buildCustomGptRecoveryBundle expands Worker URL and reports short-min length", async () => {
  const canonicalOpenApi = [
    "openapi: 3.1.1",
    "servers:",
    "  - url: https://your-runtime-host.example.workers.dev",
    "paths:",
    "  /health:",
    "    get:",
    "      operationId: getHealth",
    "  /v2/retrieve/cloudflare-pages:",
    "    get:",
    "      operationId: vtddRetrieveCloudflarePages",
    "  /v2/retrieve/setup-artifact:",
    "    get:",
    "      operationId: vtddRetrieveSetupArtifact",
    "  /v2/retrieve/self-parity:",
    "    get:",
    "      operationId: vtddRetrieveSelfParity"
  ].join("\n");
  const canonicalInstructions = [
    "vtddRetrieveCloudflarePages",
    "vtddRetrieveSetupArtifact",
    "vtddRetrieveSelfParity",
    "Action Schema update required",
    "Instructions update required",
    "Cloudflare deploy update required"
  ].join("\n");
  const shortMin = "VTDD Butler short-min instructions";

  const result = await buildCustomGptRecoveryBundle({
    repository: "sample-org/vtdd-v2-p",
    ref: "main",
    runtimeOrigin: "https://sample-user-vtdd.example.workers.dev",
    issueNumber: 242,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/docs/setup/known-good.json")) {
          return new Response(JSON.stringify({ message: "Not Found" }), {
            status: 404,
            headers: { "content-type": "application/json" }
          });
        }
        if (parsed.pathname.endsWith("/commits/main")) {
          return new Response(JSON.stringify({ sha: "a".repeat(40) }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        const isShortMin = parsed.pathname.endsWith(
          "/docs/setup/custom-gpt-instructions-short-min.md"
        );
        const isInstructions = parsed.pathname.endsWith("/docs/setup/custom-gpt-instructions.md");
        return new Response(
          JSON.stringify({
            sha: isShortMin ? "short-min-sha" : isInstructions ? "instructions-sha" : "openapi-sha",
            encoding: "base64",
            content: encodeContent(
              isShortMin ? shortMin : isInstructions ? canonicalInstructions : canonicalOpenApi
            )
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.recovery.actionSchema.content.includes(
      "  - url: https://sample-user-vtdd.example.workers.dev"
    ),
    true
  );
  assert.equal(result.recovery.actionSchema.serverUrl, "https://sample-user-vtdd.example.workers.dev");
  assert.equal(result.recovery.actionSchema.characterCount, result.recovery.actionSchema.content.length);
  assert.equal(result.recovery.actionSchema.byteCount, Buffer.byteLength(result.recovery.actionSchema.content, "utf8"));
  assert.equal(result.recovery.instructionsShortMin.characterCount, shortMin.length);
  assert.equal(result.recovery.instructionsShortMin.byteCount, Buffer.byteLength(shortMin, "utf8"));
  assert.equal(result.recovery.instructionsShortMin.limitExceeded, false);
  assert.equal(result.recovery.sourceCommitSha, "a".repeat(40));
  assert.equal(result.recovery.rollback.knownGoodCommitSha, null);
  assert.equal(result.recovery.rollback.knownGoodCommitSource, "unconfigured");
  assert.equal(result.recovery.runtime.deployState, "in_sync");
  assert.deepEqual(result.recovery.runtime.surfaceUpdateChecklist.cloudflareDeploy, {
    status: "not_required",
    reason: "Runtime manifest matches canonical setup routes, operationIds, and instruction tokens.",
    operatorUrl: null,
    operatorMarkdownLink: null
  });
  assert.equal(
    result.recovery.runtime.surfaceUpdateChecklist.customGptActionSchema.status,
    "unverified_editor_state"
  );
  assert.equal(
    result.recovery.runtime.surfaceUpdateChecklist.customGptActionSchema.sourceSha,
    "openapi-sha"
  );
  assert.equal(
    result.recovery.runtime.surfaceUpdateChecklist.customGptInstructions.status,
    "unverified_editor_state"
  );
  assert.equal(
    result.recovery.runtime.surfaceUpdateChecklist.customGptInstructions.sourceSha,
    "instructions-sha"
  );
  assert.equal(result.recovery.runtime.knownGoodComparison.status, "known_good_unavailable");
  assert.equal(result.recovery.runtime.knownGoodComparison.updateJudgment, "unverified");
  assert.deepEqual(result.recovery.safety, {
    displaysSecrets: false,
    displaysTokens: false,
    displaysApprovalGrant: false
  });
});

test("buildCustomGptRecoveryBundle reads repo-tracked known-good manifest", async () => {
  const latestOpenApi = [
    "openapi: 3.1.1",
    "servers:",
    "  - url: https://your-runtime-host.example.workers.dev",
    "paths:",
    "  /health:",
    "    get:",
    "      operationId: getHealth",
    "  /v2/retrieve/self-parity:",
    "    get:",
    "      operationId: vtddRetrieveSelfParity"
  ].join("\n");
  const latestInstructions = [
    "vtddRetrieveSelfParity",
    "Action Schema update required",
    "Instructions update required",
    "Cloudflare deploy update required"
  ].join("\n");
  const knownGoodOpenApi = latestOpenApi.replace("/v2/retrieve/self-parity", "/v2/retrieve/setup-artifact");
  const knownGoodInstructions = latestInstructions.replace("vtddRetrieveSelfParity", "vtddRetrieveSetupArtifact");
  const knownGoodSha = "e".repeat(40);

  const result = await buildCustomGptRecoveryBundle({
    repository: "sample-org/vtdd-v2-p",
    ref: "main",
    runtimeOrigin: "https://sample-user-vtdd.example.workers.dev",
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/commits/main")) {
          return new Response(JSON.stringify({ sha: "f".repeat(40) }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        if (parsed.pathname.endsWith("/docs/setup/known-good.json")) {
          return new Response(
            JSON.stringify({
              sha: "known-good-manifest-sha",
              encoding: "base64",
              content: encodeContent(
                JSON.stringify({
                  commitSha: knownGoodSha,
                  verifiedAt: "2026-05-15T02:10:23Z"
                })
              )
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        const ref = parsed.searchParams.get("ref");
        const isKnownGood = ref === knownGoodSha;
        const isShortMin = parsed.pathname.endsWith(
          "/docs/setup/custom-gpt-instructions-short-min.md"
        );
        const isInstructions = parsed.pathname.endsWith("/docs/setup/custom-gpt-instructions.md");
        const content = isKnownGood
          ? isInstructions || isShortMin
            ? knownGoodInstructions
            : knownGoodOpenApi
          : isInstructions || isShortMin
            ? latestInstructions
            : latestOpenApi;
        return new Response(
          JSON.stringify({
            sha: isKnownGood
              ? isInstructions || isShortMin
                ? "known-good-instructions-sha"
                : "known-good-openapi-sha"
              : isInstructions || isShortMin
                ? "latest-instructions-sha"
                : "latest-openapi-sha",
            encoding: "base64",
            content: encodeContent(content)
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.recovery.rollback.knownGoodCommitSha, knownGoodSha);
  assert.equal(result.recovery.rollback.knownGoodCommitSource, "docs/setup/known-good.json");
  assert.equal(result.recovery.rollback.knownGoodManifestSha, "known-good-manifest-sha");
  assert.equal(result.recovery.rollback.knownGoodVerifiedAt, "2026-05-15T02:10:23Z");
  assert.equal(result.recovery.runtime.knownGoodComparison.status, "different");
  assert.equal(
    result.recovery.runtime.knownGoodComparison.updateJudgment,
    "update_required_if_editor_is_known_good"
  );
});

test("buildCustomGptRecoveryBundle reports latest differs from configured known-good", async () => {
  const latestOpenApi = [
    "openapi: 3.1.1",
    "servers:",
    "  - url: https://your-runtime-host.example.workers.dev",
    "paths:",
    "  /health:",
    "    get:",
    "      operationId: getHealth",
    "  /v2/retrieve/self-parity:",
    "    get:",
    "      operationId: vtddRetrieveSelfParity"
  ].join("\n");
  const latestInstructions = [
    "vtddRetrieveSelfParity",
    "Action Schema update required",
    "Instructions update required",
    "Cloudflare deploy update required"
  ].join("\n");
  const knownGoodOpenApi = latestOpenApi.replace("/v2/retrieve/self-parity", "/v2/retrieve/setup-artifact");
  const knownGoodInstructions = latestInstructions.replace("vtddRetrieveSelfParity", "vtddRetrieveSetupArtifact");
  const knownGoodSha = "c".repeat(40);

  const result = await buildCustomGptRecoveryBundle({
    repository: "sample-org/vtdd-v2-p",
    ref: "main",
    runtimeOrigin: "https://sample-user-vtdd.example.workers.dev",
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_setup_read",
      VTDD_KNOWN_GOOD_COMMIT_SHA: knownGoodSha,
      GITHUB_API_FETCH: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/commits/main")) {
          return new Response(JSON.stringify({ sha: "d".repeat(40) }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        const ref = parsed.searchParams.get("ref");
        const isKnownGood = ref === knownGoodSha;
        const isShortMin = parsed.pathname.endsWith(
          "/docs/setup/custom-gpt-instructions-short-min.md"
        );
        const isInstructions = parsed.pathname.endsWith("/docs/setup/custom-gpt-instructions.md");
        const content = isKnownGood
          ? isInstructions || isShortMin
            ? knownGoodInstructions
            : knownGoodOpenApi
          : isInstructions || isShortMin
            ? latestInstructions
            : latestOpenApi;
        return new Response(
          JSON.stringify({
            sha: isKnownGood
              ? isInstructions || isShortMin
                ? "known-good-instructions-sha"
                : "known-good-openapi-sha"
              : isInstructions || isShortMin
                ? "latest-instructions-sha"
                : "latest-openapi-sha",
            encoding: "base64",
            content: encodeContent(content)
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.recovery.runtime.knownGoodComparison.status, "different");
  assert.equal(
    result.recovery.runtime.knownGoodComparison.updateJudgment,
    "update_required_if_editor_is_known_good"
  );
  assert.equal(result.recovery.runtime.knownGoodComparison.actionSchema.status, "different");
  assert.equal(result.recovery.runtime.knownGoodComparison.instructions.status, "different");
  assert.equal(
    result.recovery.runtime.surfaceUpdateChecklist.customGptActionSchema.status,
    "update_required_if_editor_is_known_good"
  );
  assert.equal(
    result.recovery.runtime.surfaceUpdateChecklist.customGptInstructions.status,
    "update_required_if_editor_is_known_good"
  );
});
