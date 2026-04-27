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
    "vtddRetrieveSetupArtifact",
    "vtddRetrieveSelfParity",
    "Action Schema update required",
    "Instructions update required",
    "Cloudflare deploy update required"
  ].join("\n");
  const canonicalOpenApi = [
    "paths:",
    "  /v2/gateway:",
    "  /v2/retrieve/github:",
    "  /v2/retrieve/setup-artifact:",
    "  /v2/retrieve/self-parity:",
    "    get:",
    "      operationId: vtddGateway",
    "      operationId: vtddRetrieveGitHub",
    "      operationId: vtddRetrieveSetupArtifact",
    "      operationId: vtddRetrieveSelfParity",
    "      operationId: vtddBrandNewParityRoute"
  ].join("\n");

  const result = await evaluateButlerSelfParity({
    repository: "sample-org/vtdd-v2-p",
    ref: "main",
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
  assert.equal(result.selfParity.recommendedActions.includes("Cloudflare deploy update required."), true);
});
