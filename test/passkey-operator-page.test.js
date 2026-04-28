import test from "node:test";
import assert from "node:assert/strict";
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
