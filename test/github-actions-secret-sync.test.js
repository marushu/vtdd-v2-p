import test from "node:test";
import assert from "node:assert/strict";
import {
  executeGitHubActionsSecretSync,
  encryptGitHubActionsSecret,
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

test("github actions secret sync returns redacted JSON failure when encryption throws", async () => {
  const result = await executeGitHubActionsSecretSync({
    repository: "sample-org/vtdd-v2-p",
    secretName: "OPENAI_API_KEY",
    secretValue: "sk-test-secret",
    approvalGrant: validApprovalGrant,
    encryptSecret: async () => {
      throw new Error("token=secret-token sk-test-secret");
    },
    env: {
      GITHUB_APP_INSTALLATION_TOKEN: "ghs_secret",
      GITHUB_API_FETCH: async (url) => {
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

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.error, "github_actions_secret_encryption_failed");
  assert.equal(result.reason.includes("secret-token"), false);
  assert.equal(result.reason.includes("sk-test-secret"), false);
});

test("github actions secret encryption uses pure JavaScript sealed box", async () => {
  const encrypted = await encryptGitHubActionsSecret({
    publicKey: "LW+MLFAtyNPENefjLqmydKkBGp4l5suTetSR9313Xm8=",
    secretValue: "sk-test-secret"
  });

  assert.equal(typeof encrypted, "string");
  assert.equal(encrypted.length > 0, true);
  assert.equal(encrypted.includes("sk-test-secret"), false);
});

test("github actions secret encryption emits standard base64 sealed box output", async () => {
  const naclModule = await import("tweetnacl");
  const nacl = naclModule.default ?? naclModule;
  const sealedboxModule = await import("tweetnacl-sealedbox-js");
  const open = sealedboxModule.open ?? sealedboxModule.default?.open;
  const overheadLength = sealedboxModule.overheadLength ?? sealedboxModule.default?.overheadLength;
  const keyPair = nacl.box.keyPair();
  const secretValue = "sk-test-secret";

  const encrypted = await encryptGitHubActionsSecret({
    publicKey: Buffer.from(keyPair.publicKey).toString("base64"),
    secretValue
  });
  const encryptedBytes = Uint8Array.from(Buffer.from(encrypted, "base64"));
  const decrypted = open(encryptedBytes, keyPair.publicKey, keyPair.secretKey);

  assert.match(encrypted, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(encryptedBytes.length, new TextEncoder().encode(secretValue).length + overheadLength);
  assert.notEqual(decrypted, null);
  assert.equal(new TextDecoder().decode(decrypted), secretValue);
});
