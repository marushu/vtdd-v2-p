import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { renderPasskeyOperatorPage } from "../src/core/index.js";

test("passkey operator page can target explicit api base and sync endpoint", () => {
  const html = renderPasskeyOperatorPage({
    operatorMode: "full",
    apiBase: "/api",
    syncApiBase: "http://127.0.0.1:8789/api",
    actionType: "deploy_production",
    repositoryInput: "marushu/vtdd-v2-p",
    issueNumber: 15,
    highRiskKind: "github_app_secret_sync",
    returnUrl: "https://chatgpt.com/g/example-butler",
    syncEnabled: true
  });

  assert.equal(html.includes('fetch("/api/approval/passkey/challenge"'), true);
  assert.equal(html.includes('fetch("http://127.0.0.1:8789/api/github-app-secret-sync/execute"'), true);
  assert.equal(html.includes('fetch("http://127.0.0.1:8789/api/gateway-bearer-vault/bootstrap"'), true);
  assert.equal(html.includes('fetch("/api/action/deploy"'), true);
  assert.equal(html.includes('fetch("/api/action/github-authority"'), true);
  assert.equal(html.includes('fetch("/api/action/github-actions-secret"'), true);
  assert.equal(html.includes("readResponseBody"), true);
  assert.equal(html.includes("non_json_response"), true);
  assert.equal(html.includes("Sync GitHub App secrets"), true);
  assert.equal(html.includes("Sync GitHub Actions secret"), true);
  assert.equal(html.includes("VTDD_GATEWAY_BEARER_TOKEN"), true);
  assert.equal(html.includes("Save gateway bearer to vault"), true);
  assert.equal(html.includes("Dispatch production deploy"), true);
  assert.equal(html.includes("Dispatch PR merge"), true);
  assert.equal(html.includes("Dispatch Issue close"), true);
  assert.equal(html.includes("Open deploy run"), true);
  assert.equal(html.includes("Open pull request"), true);
  assert.equal(html.includes("Open closed issue"), true);
  assert.equal(html.includes("Return to Butler"), true);
  assert.equal(html.includes('href="https://chatgpt.com/g/example-butler"'), true);
  assert.equal(html.includes("Butler 会話に貼らず"), true);
  assert.equal(html.includes("Copy approvalGrantId"), true);
  assert.equal(html.includes("Auto-copy approvalGrantId after approval"), true);
  assert.equal(html.includes('id="approval-grant-id-input"'), true);
  assert.equal(html.includes("const approvalGrantId = latestApprovalGrantId || pastedApprovalGrantId"), true);
  assert.equal(html.includes('id="action-type-input" value="deploy_production"'), true);
  assert.equal(html.includes('repositoryInput: document.getElementById("repo-input").value'), true);
  assert.equal(html.includes("function readRequiredRepositoryInput()"), true);
  assert.equal(html.includes("repositoryInput is required before approval/deploy"), true);
  assert.equal(html.includes('issueNumber: Number(document.getElementById("issue-input").value || 0) || null'), true);
});

test("passkey operator page pre-fills PR merge fields from URL input", () => {
  const html = renderPasskeyOperatorPage({
    repositoryInput: "marushu/vtdd-v2-p",
    issueNumber: 125,
    pullNumber: 148,
    phase: "execution",
    actionType: "merge",
    highRiskKind: "pull_merge",
    mergeMethod: "squash"
  });

  assert.equal(html.includes('id="repo-input" value="marushu/vtdd-v2-p"'), true);
  assert.equal(html.includes('id="issue-input" value="125"'), true);
  assert.equal(html.includes('id="pull-number-input" value="148"'), true);
  assert.equal(html.includes('id="action-type-input" value="merge"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="pull_merge"'), true);
  assert.equal(html.includes('id="merge-method-input" value="squash"'), true);
  assert.equal(html.includes("Mark ready for review"), true);
  assert.equal(html.includes('operation: "pull_ready_for_review"'), true);
  assert.equal(html.includes('operation: "pull_merge"'), true);
  assert.equal(html.includes('pullNumber: Number(document.getElementById("pull-number-input").value || 0) || null'), true);
});

test("passkey operator page can scope PR ready-for-review approval to pull proof", () => {
  const html = renderPasskeyOperatorPage({
    repositoryInput: "marushu/vtdd-v2-p",
    issueNumber: 194,
    pullNumber: 202,
    phase: "execution",
    actionType: "pull_ready_for_review",
    highRiskKind: "pull_ready_for_review"
  });

  assert.equal(html.includes('<section data-operator-section="approval">'), true);
  assert.equal(html.includes('<section data-operator-section="pr-merge">'), true);
  assert.equal(html.includes('id="action-type-input" value="pull_ready_for_review"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="pull_ready_for_review"'), true);
  assert.equal(html.includes('id="pull-number-input" value="202"'), true);
  assert.equal(html.includes("PR ready-for-review request"), true);
});

test("passkey operator page can scope issue close approval to merged pull proof", () => {
  const html = renderPasskeyOperatorPage({
    repositoryInput: "marushu/vtdd-v2-p",
    issueNumber: 157,
    pullNumber: 176,
    phase: "execution",
    actionType: "issue_close",
    highRiskKind: "issue_close"
  });

  assert.equal(html.includes('<section data-operator-section="approval">'), true);
  assert.equal(html.includes('<section data-operator-section="pr-merge" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="issue-close">'), true);
  assert.equal(html.includes('id="issue-input" value="157"'), true);
  assert.equal(html.includes('id="issue-close-pull-number-input" value="176"'), true);
  assert.equal(html.includes('id="action-type-input" value="issue_close"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="issue_close"'), true);
  assert.equal(html.includes("Dispatch Issue close"), true);
  assert.equal(html.includes('operation: "issue_close"'), true);
  assert.equal(html.includes('pullNumber: Number(document.getElementById("issue-close-pull-number-input").value || 0) || null'), true);
  assert.equal(html.includes("Issue close request"), true);
  assert.equal(html.includes("Open closed issue"), true);
});

test("passkey operator page focuses deploy mode on deploy approval and dispatch sections", () => {
  const html = renderPasskeyOperatorPage({
    repositoryInput: "marushu/vtdd-v2-p",
    phase: "execution",
    actionType: "deploy_production",
    highRiskKind: "deploy_production",
    returnUrl: "https://chatgpt.com/g/example-butler"
  });

  assert.equal(html.includes('<section data-operator-section="registration" hidden>'), true);
  assert.equal(
    html.includes('<section data-operator-section="approval" data-owner-flow="one-tap-deploy">'),
    true
  );
  assert.equal(html.includes('<section data-operator-section="production-deploy">'), true);
  assert.equal(html.includes('<section data-operator-section="pr-merge" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="issue-close" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="github-app-secret-sync" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="github-actions-secret-sync" hidden>'), true);
  assert.equal(html.includes('id="approve-button">パスキー</button>'), true);
  assert.equal(html.includes("production deploy を承認して、そのまま反映を開始します。"), true);
  assert.equal(html.includes("承認対象"), true);
  assert.equal(html.includes("Repository: marushu/vtdd-v2-p"), true);
  assert.equal(html.includes("Action: deploy_production / deploy_production"), true);
  assert.equal(html.includes("Approve high-risk action"), false);
  assert.equal(html.includes("Copy approvalGrantId"), false);
  assert.equal(html.includes("Auto-copy approvalGrantId after approval"), false);
  assert.equal(html.includes('id="deploy-button" hidden>Dispatch production deploy</button>'), true);
  assert.equal(html.includes("Dashboard 通知センターと保存済み Web Push 購読へ届きます"), true);
  assert.equal(html.includes("deploy を開始しました。完了通知を待ってください。"), true);
  assert.equal(html.includes("deploy-debug-output"), true);
  assert.equal(html.includes("<summary>詳細</summary>"), true);
  assert.equal(html.includes("Return to Butler"), true);
  assert.equal(html.includes('id="issue-input" value=""'), true);
  assert.equal(html.includes('id="pull-number-input" value=""'), true);
  assert.equal(html.includes('repository: repositoryInput'), true);
  assert.equal(html.includes("function shouldAutoDispatchProductionDeploy()"), true);
  assert.equal(html.includes("function applyOperatorModeDefaults()"), true);
  assert.equal(html.includes("function forceDeployApprovalScope()"), true);
  assert.equal(html.includes("function requireDeployApprovalGrantScope()"), true);
  assert.equal(html.includes("function approvalGrantHasDeployScope(approvalGrant)"), true);
  assert.equal(html.includes('document.getElementById("action-type-input").value = "deploy_production"'), true);
  assert.equal(html.includes('document.getElementById("risk-kind-input").value = "deploy_production"'), true);
  assert.equal(html.includes('data-deploy-scope-locked="true"'), true);
  assert.equal(html.includes("applyOperatorModeDefaults();"), true);
  assert.equal(html.includes("const repositoryInput = readRequiredRepositoryInput();"), true);
  assert.equal(html.includes("if (!latestApprovalGrantId)"), true);
  assert.equal(html.includes("requireDeployApprovalGrantScope();"), true);
  assert.equal(html.includes("deploy 用の承認ではありません。パスキーで production deploy を再承認してください。"), true);
  assert.equal(html.includes("return operatorMode === \"deploy\""), true);
  assert.equal(html.includes('operatorMode === "deploy"'), true);
  assert.equal(html.includes('document.getElementById("action-type-input").value === "deploy_production"'), true);
  assert.equal(html.includes('document.getElementById("risk-kind-input").value === "deploy_production"'), true);
  assert.equal(html.includes('await dispatchProductionDeploy({ source: "approval" });'), true);
  assert.equal(html.includes('passkey approval accepted. production deploy request...'), true);
});

test("passkey operator page blocks approval and deploy before repositoryInput is present", () => {
  const html = renderPasskeyOperatorPage({
    operatorMode: "deploy",
    actionType: "deploy_production",
    highRiskKind: "deploy_production"
  });

  assert.equal(html.includes('id="repo-input" value=""'), true);
  assert.equal(html.includes("const repositoryInput = readRequiredRepositoryInput();"), true);
  assert.equal(html.includes("repositoryInput is required before approval/deploy"), true);
  assert.equal(html.includes("Deploy does not require issueNumber or pullNumber"), true);
  assert.equal(html.includes("repository: repositoryInput"), true);
  assert.equal(html.includes("async function dispatchProductionDeploy"), true);
});

test("passkey operator deploy mode ignores stale action scope from restored input", () => {
  const html = renderPasskeyOperatorPage({
    operatorMode: "deploy",
    repositoryInput: "marushu/vtdd-v2-p",
    actionType: "merge",
    highRiskKind: "pull_merge"
  });

  assert.equal(html.includes('id="action-type-input" value="deploy_production"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="deploy_production"'), true);
  assert.equal(html.includes('id="action-type-input" value="merge"'), false);
  assert.equal(html.includes('id="risk-kind-input" value="pull_merge"'), false);
  assert.equal(html.includes('autocomplete="off" readonly data-deploy-scope-locked="true"'), true);
  assert.equal(html.includes('highRiskKind: document.getElementById("risk-kind-input").value'), true);
  assert.equal(html.includes('actionType: document.getElementById("action-type-input").value'), true);
  assert.equal(html.includes("forceDeployApprovalScope();"), true);
});

test("passkey operator page fills safe approval defaults from explicit mode", () => {
  const deployHtml = renderPasskeyOperatorPage({
    operatorMode: "deploy",
    repositoryInput: "marushu/vtdd-v2-p"
  });

  assert.equal(deployHtml.includes('<section data-operator-section="registration" hidden>'), true);
  assert.equal(deployHtml.includes('id="action-type-input" value="deploy_production"'), true);
  assert.equal(deployHtml.includes('id="risk-kind-input" value="deploy_production"'), true);
  assert.equal(deployHtml.includes('<section data-operator-section="production-deploy">'), true);

  const mergeHtml = renderPasskeyOperatorPage({
    operatorMode: "merge",
    repositoryInput: "marushu/vtdd-v2-p",
    pullNumber: 148
  });

  assert.equal(mergeHtml.includes('id="action-type-input" value="merge"'), true);
  assert.equal(mergeHtml.includes('id="risk-kind-input" value="pull_merge"'), true);
  assert.equal(mergeHtml.includes('<section data-operator-section="registration" hidden>'), true);
  assert.equal(mergeHtml.includes('<section data-operator-section="pr-merge">'), true);
  assert.equal(mergeHtml.includes('<section data-operator-section="issue-close" hidden>'), true);

  const issueCloseHtml = renderPasskeyOperatorPage({
    operatorMode: "issue_close",
    repositoryInput: "marushu/vtdd-v2-p"
  });
  assert.equal(issueCloseHtml.includes('id="action-type-input" value="issue_close"'), true);
  assert.equal(issueCloseHtml.includes('id="risk-kind-input" value="issue_close"'), true);
  assert.equal(issueCloseHtml.includes('<section data-operator-section="issue-close">'), true);
  assert.equal(issueCloseHtml.includes('<section data-operator-section="pr-merge" hidden>'), true);

  const githubAppSecretSyncHtml = renderPasskeyOperatorPage({
    operatorMode: "github_app_secret_sync",
    repositoryInput: "marushu/vtdd-v2-p"
  });
  assert.equal(githubAppSecretSyncHtml.includes('id="action-type-input" value="destructive"'), true);
  assert.equal(
    githubAppSecretSyncHtml.includes('id="risk-kind-input" value="github_app_secret_sync"'),
    true
  );
  assert.equal(
    githubAppSecretSyncHtml.includes('<section data-operator-section="github-app-secret-sync">'),
    true
  );
  assert.equal(
    githubAppSecretSyncHtml.includes('<section data-operator-section="production-deploy" hidden>'),
    true
  );
});

test("passkey operator page shows registration only for full or explicit registration mode", () => {
  const fullHtml = renderPasskeyOperatorPage({
    operatorMode: "full",
    repositoryInput: "marushu/vtdd-v2-p"
  });
  assert.equal(fullHtml.includes('<section data-operator-section="registration">'), true);

  const registerHtml = renderPasskeyOperatorPage({
    operatorMode: "register",
    repositoryInput: "marushu/vtdd-v2-p"
  });
  assert.equal(registerHtml.includes('<section data-operator-section="registration">'), true);
  assert.equal(registerHtml.includes('<section data-operator-section="production-deploy" hidden>'), true);

  const dashboardHtml = renderPasskeyOperatorPage({
    operatorMode: "dashboard",
    repositoryInput: "marushu/vtdd-v2-p",
    issueNumber: 15,
    pullNumber: 148,
    actionType: "merge",
    highRiskKind: "pull_merge"
  });
  assert.equal(dashboardHtml.includes('<section data-operator-section="registration" hidden>'), true);
  assert.equal(dashboardHtml.includes('<section data-operator-section="approval">'), true);
  assert.equal(dashboardHtml.includes("<h1>Dashboard Passkey</h1>"), true);
  assert.equal(dashboardHtml.includes("<h2>Dashboard を開く</h2>"), true);
  assert.equal(dashboardHtml.includes('id="approve-button">パスキーで開く</button>'), true);
  assert.equal(dashboardHtml.includes("読み取り専用パスキー確認"), true);
  assert.equal(dashboardHtml.includes("Copy approvalGrantId"), false);
  assert.equal(dashboardHtml.includes("Auto-copy approvalGrantId after approval"), false);
  assert.equal(dashboardHtml.includes("Approve high-risk action"), false);
  assert.equal(dashboardHtml.includes("GitHub App secret sync なら"), false);
  assert.equal(dashboardHtml.includes("highRiskKind=github_app_secret_sync"), false);
  assert.equal(dashboardHtml.includes('id="repo-input" value=""'), true);
  assert.equal(dashboardHtml.includes('id="issue-input" value=""'), true);
  assert.equal(dashboardHtml.includes('id="pull-number-input" value="148"'), false);
  assert.equal(dashboardHtml.includes("repo / Issue / PR scope は使いません"), true);
  assert.equal(dashboardHtml.includes('value="marushu/vtdd-v2-p"'), false);
  assert.equal(dashboardHtml.includes('value="merge"'), false);
  assert.equal(dashboardHtml.includes('value="pull_merge"'), false);
  assert.equal(dashboardHtml.includes("function readApprovalRepositoryInput()"), true);
  assert.equal(dashboardHtml.includes("const repositoryInput = readApprovalRepositoryInput();"), true);
});

test("passkey operator dashboard mode returns to sanitized dashboard path after approval", () => {
  const notificationsHtml = renderPasskeyOperatorPage({
    operatorMode: "dashboard",
    dashboardReturnPath: "/dashboard/notifications?runId=private"
  });
  assert.equal(notificationsHtml.includes("<h2>Dashboard を開く</h2>"), true);
  assert.equal(notificationsHtml.includes('id="approve-button">パスキーで開く</button>'), true);
  assert.equal(notificationsHtml.includes("Dashboard を開くための read-only session"), true);
  assert.equal(notificationsHtml.includes("認証後は通知センターへ戻ります。"), true);
  assert.equal(notificationsHtml.includes("パスキーで通知を見る"), false);
  assert.equal(notificationsHtml.includes("Approve high-risk action"), false);
  assert.equal(notificationsHtml.includes("GitHub App secret sync なら"), false);
  assert.equal(notificationsHtml.includes("highRiskKind=github_app_secret_sync"), false);
  assert.equal(notificationsHtml.includes('window.location.assign("/dashboard/notifications")'), true);
  assert.equal(notificationsHtml.includes("runId=private"), false);

  const unsafeHtml = renderPasskeyOperatorPage({
    operatorMode: "dashboard",
    dashboardReturnPath: "https://evil.example/dashboard/notifications"
  });
  assert.equal(unsafeHtml.includes('window.location.assign("/dashboard")'), true);
  assert.equal(unsafeHtml.includes("evil.example"), false);
});

test("passkey operator page focuses merge mode on approval and PR merge sections", () => {
  const html = renderPasskeyOperatorPage({
    repositoryInput: "marushu/vtdd-v2-p",
    pullNumber: 148,
    actionType: "merge",
    highRiskKind: "pull_merge"
  });

  assert.equal(html.includes('<section data-operator-section="registration" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="approval">'), true);
  assert.equal(html.includes('<section data-operator-section="pr-merge">'), true);
  assert.equal(html.includes('<section data-operator-section="issue-close" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="production-deploy" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="github-app-secret-sync" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="github-actions-secret-sync" hidden>'), true);
});

test("passkey operator page focuses secret sync modes without hiding the required approval section", () => {
  const githubAppSecretHtml = renderPasskeyOperatorPage({
    repositoryInput: "marushu/vtdd-v2-p",
    actionType: "destructive",
    highRiskKind: "github_app_secret_sync"
  });
  assert.equal(githubAppSecretHtml.includes('<section data-operator-section="approval">'), true);
  assert.equal(githubAppSecretHtml.includes('<section data-operator-section="github-app-secret-sync">'), true);
  assert.equal(githubAppSecretHtml.includes('<select id="github-app-role-input">'), true);
  assert.equal(githubAppSecretHtml.includes('value="gemini-reviewer"'), true);
  assert.equal(githubAppSecretHtml.includes("VTDD Gemini Reviewer"), true);
  assert.equal(githubAppSecretHtml.includes("githubAppRole: document.getElementById"), true);
  assert.equal(githubAppSecretHtml.includes('<section data-operator-section="production-deploy" hidden>'), true);
  assert.equal(githubAppSecretHtml.includes('<section data-operator-section="pr-merge" hidden>'), true);
  assert.equal(githubAppSecretHtml.includes('<section data-operator-section="issue-close" hidden>'), true);

  const actionsSecretHtml = renderPasskeyOperatorPage({
    repositoryInput: "marushu/vtdd-v2-p",
    actionType: "destructive",
    highRiskKind: "github_actions_secret_sync"
  });
  assert.equal(actionsSecretHtml.includes('<section data-operator-section="approval">'), true);
  assert.equal(actionsSecretHtml.includes('<section data-operator-section="github-actions-secret-sync">'), true);
  assert.equal(actionsSecretHtml.includes('<option value="VTDD_GATEWAY_BEARER_TOKEN">'), true);
  assert.equal(actionsSecretHtml.includes("Worker secret / Custom GPT Action auth"), true);
  assert.equal(actionsSecretHtml.includes('<section data-operator-section="gateway-bearer-vault" hidden>'), true);
  assert.equal(actionsSecretHtml.includes('<section data-operator-section="github-app-secret-sync" hidden>'), true);
  assert.equal(actionsSecretHtml.includes('<section data-operator-section="production-deploy" hidden>'), true);
  assert.equal(actionsSecretHtml.includes('<section data-operator-section="pr-merge" hidden>'), true);
  assert.equal(actionsSecretHtml.includes('<section data-operator-section="issue-close" hidden>'), true);
});

test("passkey operator page supports local helper mode without passkey controls", () => {
  const html = renderPasskeyOperatorPage({
    apiBase: "/api",
    repositoryInput: "marushu/vtdd-v2-p",
    actionType: "destructive",
    highRiskKind: "github_app_secret_sync",
    githubAppRole: "gemini-reviewer",
    syncEnabled: true,
    passkeyEnabled: false
  });

  assert.equal(html.includes('<section data-operator-section="registration" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="approval" hidden>'), true);
  assert.equal(html.includes('<option value="gemini-reviewer" selected>VTDD Gemini Reviewer</option>'), true);
  assert.equal(html.includes('id="approval-grant-id-input"'), true);
  assert.equal(html.includes('fetch("/api/approval/passkey/challenge"'), true);
});

test("passkey operator page focuses VPS runner admin mode on real approval only", () => {
  const html = renderPasskeyOperatorPage({
    repositoryInput: "sample-org/private-repo",
    issueNumber: 157,
    actionType: "destructive",
    highRiskKind: "vps_runner_admin"
  });

  assert.equal(html.includes('<section data-operator-section="approval">'), true);
  assert.equal(html.includes('<section data-operator-section="vps-runner-admin">'), true);
  assert.equal(html.includes('<section data-operator-section="production-deploy" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="pr-merge" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="issue-close" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="github-app-secret-sync" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="github-actions-secret-sync" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="gateway-bearer-vault" hidden>'), true);
  assert.equal(html.includes('id="action-type-input" value="destructive"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="vps_runner_admin"'), true);
  assert.equal(html.includes("文字列としての passkey は承認ではありません"), true);
});

test("passkey operator page supports gateway bearer vault bootstrap mode", () => {
  const html = renderPasskeyOperatorPage({
    repositoryInput: "marushu/vtdd-v2-p",
    actionType: "destructive",
    highRiskKind: "gateway_bearer_vault_bootstrap",
    syncApiBase: "http://127.0.0.1:8789/api",
    syncEnabled: true
  });

  assert.equal(html.includes('<section data-operator-section="approval">'), true);
  assert.equal(html.includes('<section data-operator-section="gateway-bearer-vault">'), true);
  assert.equal(html.includes('id="risk-kind-input" value="gateway_bearer_vault_bootstrap"'), true);
  assert.equal(html.includes('id="gateway-bearer-token-input" type="password"'), true);
  assert.equal(html.includes('fetch("http://127.0.0.1:8789/api/gateway-bearer-vault/bootstrap"'), true);
  assert.equal(html.includes("Butler 会話、GitHub コメント、RAG、レスポンス本文に表示しません"), true);
  assert.equal(html.includes("not_checked_initial_bootstrap_gateway_bearer_missing"), true);
  assert.equal(html.includes('<section data-operator-section="github-app-secret-sync" hidden>'), true);
  assert.equal(html.includes('<section data-operator-section="production-deploy" hidden>'), true);
});

test("passkey operator page fills VPS runner admin defaults from explicit mode", () => {
  const html = renderPasskeyOperatorPage({
    operatorMode: "vps",
    repositoryInput: "sample-org/private-repo"
  });

  assert.equal(html.includes('id="action-type-input" value="destructive"'), true);
  assert.equal(html.includes('id="risk-kind-input" value="vps_runner_admin"'), true);
  assert.equal(html.includes('<section data-operator-section="vps-runner-admin">'), true);
});

test("passkey operator page keeps the full maintenance view when no mode is inferred", () => {
  const html = renderPasskeyOperatorPage({ operatorMode: "full" });

  assert.equal(html.includes('<section data-operator-section="github-app-secret-sync">'), true);
  assert.equal(html.includes('<section data-operator-section="production-deploy">'), true);
  assert.equal(html.includes('<section data-operator-section="pr-merge">'), true);
  assert.equal(html.includes('<section data-operator-section="issue-close">'), true);
  assert.equal(html.includes('<section data-operator-section="github-actions-secret-sync">'), true);
  assert.equal(html.includes('<section data-operator-section="gateway-bearer-vault">'), true);
  assert.equal(html.includes('<section data-operator-section="vps-runner-admin">'), true);
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

test("passkey operator page clipboard helper uses navigator clipboard when available", async () => {
  let copied = "";
  const helpers = loadOperatorPageHelpers({
    navigator: {
      clipboard: {
        writeText: async (value) => {
          copied = value;
        }
      }
    }
  });

  await helpers.copyText("approval:test");

  assert.equal(copied, "approval:test");
});

test("passkey operator page clipboard helper falls back to textarea copy", async () => {
  let copied = false;
  let textareaRemoved = false;
  const textarea = {
    value: "",
    style: {},
    setAttribute() {},
    select() {
      copied = this.value === "approval:fallback";
    }
  };
  const helpers = loadOperatorPageHelpers({
    navigator: {},
    document: {
      getElementById() {
        return {
          value: "",
          textContent: "",
          addEventListener() {}
        };
      },
      createElement(tagName) {
        assert.equal(tagName, "textarea");
        return textarea;
      },
      execCommand(command) {
        assert.equal(command, "copy");
        return copied;
      },
      body: {
        appendChild(element) {
          assert.equal(element, textarea);
        },
        removeChild(element) {
          assert.equal(element, textarea);
          textareaRemoved = true;
        }
      }
    }
  });

  await helpers.copyText("approval:fallback");

  assert.equal(copied, true);
  assert.equal(textareaRemoved, true);
});

test("passkey operator page exposes deploy run link from dispatch response", () => {
  const deployRunLink = {
    href: "#",
    hidden: true
  };
  const helpers = loadOperatorPageHelpers({
    document: {
      getElementById(id) {
        if (id === "deploy-run-link") {
          return deployRunLink;
        }
        return {
          value: "",
          textContent: "",
          addEventListener() {}
        };
      }
    }
  });

  helpers.showDeployRunLink({
    ok: true,
    deploy: {
      runUrl: "https://github.com/sample-org/vtdd-v2-p/actions/runs/123456"
    }
  });

  assert.equal(deployRunLink.href, "https://github.com/sample-org/vtdd-v2-p/actions/runs/123456");
  assert.equal(deployRunLink.hidden, false);

  helpers.clearDeployRunLink();
  assert.equal(deployRunLink.href, "#");
  assert.equal(deployRunLink.hidden, true);
});

test("passkey operator page rejects unsafe or missing deploy run links", () => {
  const deployRunLink = {
    href: "#",
    hidden: true
  };
  const helpers = loadOperatorPageHelpers({
    document: {
      getElementById(id) {
        if (id === "deploy-run-link") {
          return deployRunLink;
        }
        return {
          value: "",
          textContent: "",
          addEventListener() {}
        };
      }
    }
  });

  helpers.showDeployRunLink({
    ok: true,
    deploy: {
      runUrl: "https://evil.example/actions/runs/123456"
    }
  });
  assert.equal(deployRunLink.href, "#");
  assert.equal(deployRunLink.hidden, true);

  helpers.showDeployRunLink({
    ok: true,
    runUrl: "https://github.com/sample-org/vtdd-v2-p/actions/runs/123456"
  });
  assert.equal(deployRunLink.href, "#");
  assert.equal(deployRunLink.hidden, true);
});

test("passkey operator page exposes safe PR link from merge response", () => {
  const mergePrLink = {
    href: "#",
    hidden: true
  };
  const helpers = loadOperatorPageHelpers({
    document: {
      getElementById(id) {
        if (id === "merge-pr-link") {
          return mergePrLink;
        }
        return {
          value: "",
          textContent: "",
          addEventListener() {}
        };
      }
    }
  });

  helpers.showMergePrLink({
    ok: true,
    authorityAction: {
      htmlUrl: "https://github.com/sample-org/vtdd-v2-p/pull/148"
    }
  });

  assert.equal(mergePrLink.href, "https://github.com/sample-org/vtdd-v2-p/pull/148");
  assert.equal(mergePrLink.hidden, false);

  helpers.clearMergePrLink();
  assert.equal(mergePrLink.href, "#");
  assert.equal(mergePrLink.hidden, true);

  helpers.showMergePrLink({
    ok: true,
    authorityAction: {
      htmlUrl: "https://evil.example/sample-org/vtdd-v2-p/pull/148"
    }
  });
  assert.equal(mergePrLink.href, "#");
  assert.equal(mergePrLink.hidden, true);
});

test("passkey operator page exposes safe issue link from issue close response", () => {
  const issueCloseLink = {
    href: "#",
    hidden: true
  };
  const helpers = loadOperatorPageHelpers({
    document: {
      getElementById(id) {
        if (id === "issue-close-link") {
          return issueCloseLink;
        }
        return {
          value: "",
          textContent: "",
          addEventListener() {}
        };
      }
    }
  });

  helpers.showIssueCloseLink({
    ok: true,
    authorityAction: {
      htmlUrl: "https://github.com/sample-org/vtdd-v2-p/issues/349"
    }
  });

  assert.equal(issueCloseLink.href, "https://github.com/sample-org/vtdd-v2-p/issues/349");
  assert.equal(issueCloseLink.hidden, false);

  helpers.clearIssueCloseLink();
  assert.equal(issueCloseLink.href, "#");
  assert.equal(issueCloseLink.hidden, true);

  helpers.showIssueCloseLink({
    ok: true,
    authorityAction: {
      htmlUrl: "https://evil.example/sample-org/vtdd-v2-p/issues/349"
    }
  });
  assert.equal(issueCloseLink.href, "#");
  assert.equal(issueCloseLink.hidden, true);
});

function loadOperatorPageHelpers(overrides = {}) {
  const html = renderPasskeyOperatorPage();
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(script);

  const elements = new Map();
  const context = {
    Response,
    URL,
    navigator: {},
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
    },
    ...overrides
  };
  vm.runInNewContext(script, context);
  assert.equal(typeof context.readResponseBody, "function");
  return context;
}
