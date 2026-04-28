import test from "node:test";
import assert from "node:assert/strict";
import {
  executeGitHubActionsSecretSync,
  validateGitHubActionsSecretSyncApprovalGrant
} from "../src/core/index.js";

const validApprovalGrant = {
  approvalId: "approval-secret-123",
  verified: true,
  expiresAt: "2099-01-01T00:00:00.000Z",
  scope: {
    repositoryInput: "sample-org/vtdd-v2-p",
    highRiskKind: "github_actions_secret_sync"
  }
};

test("github actions secret sync writes only approved OPENAI_API_KEY without echoing the secret", async () => {
  const calls = [];
  const result = await executeGitHubActionsSecretSync({
    repository: "sample-org/vtdd-v2-p",
    secretName: "OPENAI_API_KEY",
    secretValue: "sk-test-secret",
    approvalGrant: validApprovalGrant,
    encryptSecret: async ({ publicKey, secretValue }) => {
      assert.equal(publicKey, "public-key");
      assert.equal(secretValue, "sk-test-secret");
      return "encrypted-secret";
    },
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_secret",
      GITHUB_API_FETCH: async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith("/actions/secrets/public-key")) {
          return new Response(JSON.stringify({ key_id: "key-123", key: "public-key" }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(null, { status: 204 });
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.secretSync.secretName, "OPENAI_API_KEY");
  assert.equal(result.secretSync.status, "updated");
  assert.equal(JSON.stringify(result).includes("sk-test-secret"), false);
  assert.equal(calls[1].url.endsWith("/actions/secrets/OPENAI_API_KEY"), true);
  assert.equal(JSON.parse(calls[1].init.body).encrypted_value, "encrypted-secret");
});

test("github actions secret sync blocks unapproved names and wrong passkey scope", async () => {
  const unsupported = await executeGitHubActionsSecretSync({
    repository: "sample-org/vtdd-v2-p",
    secretName: "GEMINI_API_KEY",
    secretValue: "secret",
    approvalGrant: validApprovalGrant,
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_secret"
    }
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error, "github_actions_secret_sync_request_invalid");
  assert.equal(unsupported.issues.includes("secretName must be OPENAI_API_KEY"), true);

  const wrongScope = validateGitHubActionsSecretSyncApprovalGrant({
    repository: "sample-org/vtdd-v2-p",
    approvalGrant: {
      ...validApprovalGrant,
      scope: {
        repositoryInput: "sample-org/vtdd-v2-p",
        highRiskKind: "deploy_production"
      }
    }
  });
  assert.equal(wrongScope.ok, false);
  assert.equal(
    wrongScope.issues.includes("approvalGrant scope.highRiskKind must be github_actions_secret_sync"),
    true
  );
});
