import test from "node:test";
import assert from "node:assert/strict";

import {
  validateGatewayBearerVaultApprovalGrant,
  validateGatewayBearerVaultApprovalGrantObject
} from "../scripts/validate-gateway-bearer-vault-approval-grant.mjs";

test("gateway bearer vault approval grant validator accepts scoped destructive grant", () => {
  const result = validateGatewayBearerVaultApprovalGrantObject({
    repositoryInput: "marushu/vtdd-v2-p",
    approvalGrant: {
      verified: true,
      expiresAt: "2999-01-01T00:00:00.000Z",
      scope: {
        repositoryInput: "marushu/vtdd-v2-p",
        actionType: "destructive",
        highRiskKind: "gateway_bearer_vault_bootstrap"
      }
    }
  });

  assert.equal(result.ok, true);
});

test("gateway bearer vault approval grant validator rejects wrong high-risk kind", () => {
  const result = validateGatewayBearerVaultApprovalGrantObject({
    repositoryInput: "marushu/vtdd-v2-p",
    approvalGrant: {
      verified: true,
      expiresAt: "2999-01-01T00:00:00.000Z",
      scope: {
        repositoryInput: "marushu/vtdd-v2-p",
        actionType: "destructive",
        highRiskKind: "github_actions_secret_sync"
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.includes("approvalGrant scope.highRiskKind must be gateway_bearer_vault_bootstrap"),
    true
  );
});

test("gateway bearer vault approval grant retrieval keeps bearer token in header", async () => {
  let request;
  const result = await validateGatewayBearerVaultApprovalGrant({
    approvalGrantId: "approval:test",
    runtimeUrl: "https://runtime.example",
    repositoryInput: "marushu/vtdd-v2-p",
    gatewayBearerToken: "secret-token",
    fetch: async (url, init) => {
      request = { url: String(url), init };
      return new Response(
        JSON.stringify({
          ok: true,
          approvalGrant: {
            approvalId: "approval:test",
            verified: true,
            expiresAt: "2999-01-01T00:00:00.000Z",
            scope: {
              repositoryInput: "marushu/vtdd-v2-p",
              actionType: "destructive",
              highRiskKind: "gateway_bearer_vault_bootstrap"
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  });

  assert.equal(result.ok, true);
  assert.equal(request.init.headers.authorization, "Bearer secret-token");
  assert.equal(request.url.includes("secret-token"), false);
});
