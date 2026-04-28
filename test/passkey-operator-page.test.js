import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { renderPasskeyOperatorPage } from "../src/core/index.js";

test("passkey operator page can target explicit api base and sync endpoint", () => {
  const html = renderPasskeyOperatorPage({
    apiBase: "/api",
    syncApiBase: "http://127.0.0.1:8789/api",
    actionType: "deploy_production",
    repositoryInput: "marushu/vtdd-v2-p",
    issueNumber: 15,
    highRiskKind: "github_app_secret_sync",
    syncEnabled: true
  });

  assert.equal(html.includes('fetch("/api/approval/passkey/challenge"'), true);
  assert.equal(html.includes('fetch("http://127.0.0.1:8789/api/github-app-secret-sync/execute"'), true);
  assert.equal(html.includes('fetch("/api/action/deploy"'), true);
  assert.equal(html.includes('fetch("/api/action/github-actions-secret"'), true);
  assert.equal(html.includes("readResponseBody"), true);
  assert.equal(html.includes("non_json_response"), true);
  assert.equal(html.includes("Sync GitHub App secrets"), true);
  assert.equal(html.includes("Sync OPENAI_API_KEY"), true);
  assert.equal(html.includes("Dispatch production deploy"), true);
  assert.equal(html.includes("Butler 会話に貼らず"), true);
  assert.equal(html.includes('id="action-type-input" value="deploy_production"'), true);
  assert.equal(html.includes('repositoryInput: document.getElementById("repo-input").value'), true);
  assert.equal(html.includes('issueNumber: Number(document.getElementById("issue-input").value || 0) || null'), true);
});

test("passkey operator page keeps sync disabled message when helper endpoint is absent", () => {
  const html = renderPasskeyOperatorPage({
    apiBase: "/v2",
    syncEnabled: false
  });

  assert.equal(html.includes("desktop maintenance required"), true);
  assert.equal(html.includes("disabled"), true);
});

test("passkey operator page response parser reports and redacts non-json failures", async () => {
  const helpers = loadOperatorPageHelpers();

  const htmlFailure = await helpers.readResponseBody(
    new Response("<!DOCTYPE html><p>token=secret-token sk-testsecret</p>", {
      status: 502,
      headers: { "content-type": "text/html" }
    })
  );
  assert.equal(htmlFailure.error, "non_json_response");
  assert.equal(htmlFailure.httpStatus, 502);
  assert.equal(htmlFailure.rawBody.includes("<!DOCTYPE html>"), true);
  assert.equal(htmlFailure.rawBody.includes("secret-token"), false);
  assert.equal(htmlFailure.rawBody.includes("sk-testsecret"), false);

  const malformedJson = await helpers.readResponseBody(
    new Response("{", {
      status: 500,
      headers: { "content-type": "application/json" }
    })
  );
  assert.equal(malformedJson.error, "invalid_json_response");
  assert.equal(malformedJson.rawBody, "{");

  const validJson = await helpers.readResponseBody(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    })
  );
  assert.equal(validJson.ok, true);
});

function loadOperatorPageHelpers() {
  const html = renderPasskeyOperatorPage();
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(script);

  const elements = new Map();
  const context = {
    Response,
    document: {
      getElementById(id) {
        if (!elements.has(id)) {
          elements.set(id, {
            value: "",
            textContent: "",
            addEventListener() {}
          });
        }
        return elements.get(id);
      }
    }
  };
  vm.runInNewContext(script, context);
  assert.equal(typeof context.readResponseBody, "function");
  return context;
}
