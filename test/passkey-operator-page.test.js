import test from "node:test";
import assert from "node:assert/strict";
import { renderPasskeyOperatorPage } from "../src/core/index.js";

test("passkey operator page can target explicit api base and sync endpoint", () => {
  const html = renderPasskeyOperatorPage({
    apiBase: "/api",
    actionType: "deploy_production",
    repositoryInput: "marushu/vtdd-v2-p",
    issueNumber: 15,
    highRiskKind: "github_app_secret_sync",
    syncEnabled: true
  });

  assert.equal(html.includes('fetch("/api/approval/passkey/challenge"'), true);
  assert.equal(html.includes('fetch("/api/github-app-secret-sync/execute"'), true);
  assert.equal(html.includes("Sync GitHub App secrets"), true);
  assert.equal(html.includes('id="action-type-input" value="deploy_production"'), true);
  assert.equal(html.includes('repositoryInput: document.getElementById("repo-input").value'), true);
  assert.equal(html.includes('issueNumber: Number(document.getElementById("issue-input").value || 0) || null'), true);
});

test("passkey operator page keeps sync disabled message when helper endpoint is absent", () => {
  const html = renderPasskeyOperatorPage({
    apiBase: "/v2",
    syncEnabled: false
  });

  assert.equal(html.includes("secret sync endpoint が有効化されていません"), true);
  assert.equal(html.includes("disabled"), true);
});
