import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import {
  ActionType,
  ConsentCategory,
  CredentialTier,
  TaskMode
} from "../src/core/index.js";

const aliasRegistry = [
  {
    canonicalRepo: "marushu/vtdd-v2",
    aliases: ["vtdd"]
  }
];

test("worker returns health", async () => {
  const response = await worker.fetch(new Request("https://example.com/health"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
});

test("worker returns setup wizard html", async () => {
  const response = await worker.fetch(new Request("https://example.com/setup/wizard"));
  assert.equal(response.status, 200);
  const contentType = response.headers.get("content-type") ?? "";
  assert.equal(contentType.includes("text/html"), true);
  const html = await response.text();
  assert.equal(html.includes("VTDD Setup Wizard"), true);
  assert.equal(html.includes("Custom GPT Construction"), true);
  assert.equal(html.includes("Copy Construction"), true);
  assert.equal(html.includes("Copy Schema"), true);
});

test("worker returns setup wizard json", async () => {
  const response = await worker.fetch(
    new Request(
      "https://example.com/setup/wizard?format=json&repo=marushu/vtdd-v2&surface=custom_gpt"
    )
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.onboarding.customGpt.actionSchemaJson.includes("/mvp/gateway"), true);
  assert.equal(body.generatedAnswers.actionEndpointBaseUrl, "https://example.com");
});

test("worker runs gateway route", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/mvp/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.BUILD,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
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
    })
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.allowed, true);
  assert.equal(body.repository, "marushu/vtdd-v2");
});

test("worker blocks invalid policy input", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/mvp/gateway", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phase: "execution",
        actorRole: "executor",
        policyInput: {
          actionType: ActionType.DEPLOY_PRODUCTION,
          mode: TaskMode.EXECUTION,
          repositoryInput: "vtdd",
          aliasRegistry,
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
    })
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
