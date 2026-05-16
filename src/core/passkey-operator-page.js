export function renderPasskeyOperatorPage(input = {}) {
  const operatorMode = resolvePasskeyOperatorMode(input);
  const passkeyEnabled = input.passkeyEnabled !== false;
  const sectionVisibility = resolveSectionVisibility(operatorMode, { passkeyEnabled });
  const origin = escapeHtml(input.origin || "");
  const apiBase = escapeHtml(input.apiBase || "/v2");
  const syncApiBase = escapeHtml(input.syncApiBase || "");
  const registrationDefaultOperatorId = escapeHtml(input.operatorId || "vtdd-operator");
  const registrationDefaultOperatorLabel = escapeHtml(input.operatorLabel || "VTDD Operator");
  const repoDefault = escapeHtml(input.repositoryInput || "");
  const issueDefault = escapeHtml(input.issueNumber || "");
  const pullNumberDefault = escapeHtml(input.pullNumber || "");
  const phaseDefault = escapeHtml(input.phase || "execution");
  const actionTypeDefault = escapeHtml(input.actionType || defaultActionTypeForMode(operatorMode));
  const highRiskKindDefault = escapeHtml(input.highRiskKind || defaultHighRiskKindForMode(operatorMode));
  const mergeMethodDefault = escapeHtml(input.mergeMethod || "squash");
  const returnUrl = escapeHtml(input.returnUrl || "");
  const githubAppRoleDefault = escapeHtml(input.githubAppRole || "legacy");
  const syncEnabled = input.syncEnabled === true;
  const syncMessage = escapeHtml(
    input.syncMessage ||
      (syncEnabled
        ? "approvalGrantId が取得済みなら実行できます。desktop helper bridge に接続します。"
        : "desktop maintenance required: local secret sync bridge が未接続です。")
  );

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>VTDD Passkey Operator</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f3efe6;
        --panel: #fffdf7;
        --ink: #17212b;
        --muted: #5e6b75;
        --line: #d9d0c1;
        --accent: #0f5f4b;
        --accent-2: #b66a24;
      }
      body {
        margin: 0;
        font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
        background: linear-gradient(180deg, #f6f0e3 0%, #ebe4d6 100%);
        color: var(--ink);
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      h1, h2 {
        margin: 0 0 12px;
      }
      p {
        line-height: 1.6;
      }
      .hero {
        background: radial-gradient(circle at top left, #fff7dc 0%, var(--panel) 60%);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 24px;
        margin-bottom: 24px;
        box-shadow: 0 14px 30px rgba(23, 33, 43, 0.08);
      }
      .grid {
        display: grid;
        gap: 20px;
      }
      @media (min-width: 900px) {
        .grid {
          grid-template-columns: 1fr 1fr;
        }
      }
      section {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 20px;
        box-shadow: 0 10px 24px rgba(23, 33, 43, 0.06);
      }
      label {
        display: block;
        font-size: 14px;
        color: var(--muted);
        margin-bottom: 6px;
      }
      input,
      select {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--line);
        margin-bottom: 12px;
        font: inherit;
        background: #fff;
      }
      button {
        appearance: none;
        border: none;
        border-radius: 999px;
        padding: 11px 16px;
        font: inherit;
        cursor: pointer;
        background: var(--accent);
        color: white;
      }
      button.secondary {
        background: var(--accent-2);
      }
      button.ghost {
        background: #eef3ef;
        color: var(--accent);
        border: 1px solid #b8cec3;
      }
      .button-link {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 11px 16px;
        background: #eef3ef;
        color: var(--accent);
        border: 1px solid #b8cec3;
        text-decoration: none;
      }
      [hidden] {
        display: none !important;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: #f7f4ed;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 12px;
        min-height: 64px;
      }
      .muted {
        color: var(--muted);
        font-size: 14px;
      }
      .row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .inline-check {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 8px 0 12px;
        color: var(--muted);
        font-size: 14px;
      }
      .inline-check input {
        width: auto;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="hero">
        <h1>VTDD Passkey Operator</h1>
        <p>このページは real WebAuthn/passkey approval 用の operator helper です。登録と high-risk approval の両方を same-origin で実行し、最終的に <code>approvalGrantId</code> を取得できます。</p>
        <p class="muted">origin: ${origin || "[same-origin]"}</p>
      </div>

      <div class="grid">
        <section data-operator-section="registration"${hiddenAttribute(!sectionVisibility.registration)}>
          <h2>1. Passkey 登録</h2>
          <label for="operator-id">Operator ID</label>
          <input id="operator-id" value="${registrationDefaultOperatorId}" />
          <label for="operator-label">Operator Label</label>
          <input id="operator-label" value="${registrationDefaultOperatorLabel}" />
          <div class="row">
            <button id="register-button">Register passkey</button>
          </div>
          <p class="muted">登録は 1 回で十分です。複数デバイスを使う場合は必要に応じて追加登録します。</p>
          <pre id="register-output"></pre>
        </section>

        <section data-operator-section="approval"${hiddenAttribute(!sectionVisibility.approval)}>
          <h2>2. High-risk Approval</h2>
          <label for="repo-input">Repository</label>
          <input id="repo-input" value="${repoDefault}" placeholder="marushu/vtdd-v2-p" />
          <label for="issue-input">Issue Number</label>
          <input id="issue-input" value="${issueDefault}" placeholder="15" />
          <label for="phase-input">Phase</label>
          <input id="phase-input" value="${phaseDefault}" />
          <label for="action-type-input">Action Type</label>
          <input id="action-type-input" value="${actionTypeDefault}" />
          <label for="risk-kind-input">High-risk Kind</label>
          <input id="risk-kind-input" value="${highRiskKindDefault}" />
          <div class="row">
            <button class="secondary" id="approve-button">Approve high-risk action</button>
            <button class="ghost" id="copy-approval-grant-button" type="button">Copy approvalGrantId</button>
          </div>
          <label class="inline-check" for="auto-copy-approval-grant-input">
            <input id="auto-copy-approval-grant-input" type="checkbox" />
            Auto-copy approvalGrantId after approval
          </label>
          <p class="muted">GitHub App secret sync なら <code>actionType=destructive</code> / <code>highRiskKind=github_app_secret_sync</code>、production deploy なら <code>actionType=deploy_production</code> / <code>highRiskKind=deploy_production</code>、PR merge なら <code>actionType=merge</code> / <code>highRiskKind=pull_merge</code> を使います。</p>
          <pre id="approve-output"></pre>
        </section>

        <section data-operator-section="github-app-secret-sync"${hiddenAttribute(!sectionVisibility.githubAppSecretSync)}>
          <h2>3. GitHub App Secret Sync</h2>
          <p class="muted">real passkey approval 後、この helper から <code>#15</code> の explicit operator bootstrap を実行します。</p>
          <label for="github-app-role-input">GitHub App Role</label>
          <select id="github-app-role-input">
            ${renderGithubAppRoleOption("legacy", "Legacy vtdd-codex", githubAppRoleDefault)}
            ${renderGithubAppRoleOption("gemini-reviewer", "VTDD Gemini Reviewer", githubAppRoleDefault)}
            ${renderGithubAppRoleOption("codex-fallback-reviewer", "VTDD Codex Fallback Reviewer", githubAppRoleDefault)}
            ${renderGithubAppRoleOption("mac-codex", "VTDD mac Codex", githubAppRoleDefault)}
            ${renderGithubAppRoleOption("vps-codex-cli", "VTDD VPS Codex CLI", githubAppRoleDefault)}
          </select>
          <label for="approval-grant-id-input">approvalGrantId</label>
          <input id="approval-grant-id-input" value="" placeholder="approval:..." autocomplete="off" />
          <div class="row">
            <button id="sync-button"${syncEnabled ? "" : " disabled"}>Sync GitHub App secrets</button>
          </div>
          <p class="muted">${syncMessage}</p>
          <pre id="sync-output"></pre>
        </section>

        <section data-operator-section="production-deploy"${hiddenAttribute(!sectionVisibility.productionDeploy)}>
          <h2>4. Production Deploy</h2>
          <p class="muted">deploy stale を検知したあと、取得済みの <code>approvalGrantId</code> を使って same-origin の governed deploy path を dispatch します。</p>
          <div class="row">
            <button id="deploy-button">Dispatch production deploy</button>
            <a class="button-link" id="deploy-run-link" href="#" target="_blank" rel="noopener noreferrer" hidden>Open deploy run</a>
            <a class="button-link" id="return-to-butler-link" href="${returnUrl}" rel="noopener noreferrer"${returnUrl ? "" : " hidden"}>Return to Butler</a>
          </div>
          <p class="muted">この Worker origin を <code>runtimeUrl</code> として使います。実行後は deploy run link で完了状態を確認できます。</p>
          <pre id="deploy-output"></pre>
        </section>

        <section data-operator-section="pr-merge"${hiddenAttribute(!sectionVisibility.prMerge)}>
          <h2>5. GitHub PR Merge</h2>
          <p class="muted">PR merge 用の real passkey approval 後、この helper から same-origin の GitHub authority path を dispatch します。</p>
          <label for="pull-number-input">Pull Number</label>
          <input id="pull-number-input" value="${pullNumberDefault}" placeholder="148" />
          <label for="merge-method-input">Merge Method</label>
          <input id="merge-method-input" value="${mergeMethodDefault}" placeholder="squash" />
          <div class="row">
            <button id="ready-button">Mark ready for review</button>
            <button id="merge-button">Dispatch PR merge</button>
            <a class="button-link" id="merge-pr-link" href="#" target="_blank" rel="noopener noreferrer" hidden>Open pull request</a>
          </div>
          <p class="muted">draft を解除する場合は <code>actionType=pull_ready_for_review</code> / <code>highRiskKind=pull_ready_for_review</code>、merge は <code>actionType=merge</code> / <code>highRiskKind=pull_merge</code> の approvalGrantId が必要です。merge 後は GitHub runtime truth で merged 状態を確認してください。</p>
          <pre id="merge-output"></pre>
        </section>

        <section data-operator-section="issue-close"${hiddenAttribute(!sectionVisibility.issueClose)}>
          <h2>6. GitHub Issue Close</h2>
          <p class="muted">Issue close 用の real passkey approval 後、この helper から same-origin の GitHub authority path を dispatch します。</p>
          <label for="issue-close-pull-number-input">Merged Pull Number</label>
          <input id="issue-close-pull-number-input" value="${pullNumberDefault}" placeholder="407" />
          <div class="row">
            <button id="issue-close-button">Dispatch Issue close</button>
            <a class="button-link" id="issue-close-link" href="#" target="_blank" rel="noopener noreferrer" hidden>Open closed issue</a>
          </div>
          <p class="muted"><code>actionType=issue_close</code> / <code>highRiskKind=issue_close</code> の approvalGrantId が必要です。bounded issue close は merged pull proof を確認してから実行します。</p>
          <pre id="issue-close-output"></pre>
        </section>

        <section data-operator-section="github-actions-secret-sync"${hiddenAttribute(!sectionVisibility.githubActionsSecretSync)}>
          <h2>7. GitHub Actions Secret Sync</h2>
          <p class="muted">GitHub Actions secret を同期します。値は Butler 会話に貼らず、この operator page から送信します。<code>VTDD_GATEWAY_BEARER_TOKEN</code> は Actions secret だけではなく Worker secret / Custom GPT Action auth と一致している必要があります。</p>
          <label for="github-actions-secret-name-input">Secret name</label>
          <select id="github-actions-secret-name-input">
            <option value="OPENAI_API_KEY">OPENAI_API_KEY</option>
            <option value="VTDD_GATEWAY_BEARER_TOKEN">VTDD_GATEWAY_BEARER_TOKEN</option>
          </select>
          <label for="openai-api-key-input">OPENAI_API_KEY</label>
          <input id="openai-api-key-input" type="password" autocomplete="off" placeholder="sk-..." />
          <div class="row">
            <button id="openai-secret-sync-button">Sync GitHub Actions secret</button>
          </div>
          <p class="muted"><code>actionType=destructive</code> / <code>highRiskKind=github_actions_secret_sync</code> の approvalGrantId が必要です。</p>
          <pre id="openai-secret-sync-output"></pre>
        </section>

        <section data-operator-section="gateway-bearer-vault"${hiddenAttribute(!sectionVisibility.gatewayBearerVault)}>
          <h2>8. Gateway Bearer Vault</h2>
          <p class="muted">メモアプリ等に保管している <code>VTDD_GATEWAY_BEARER_TOKEN</code> を、この端末の local helper 経由で Mac/VPS vault に保存します。値は Butler 会話、GitHub コメント、RAG、レスポンス本文に表示しません。</p>
          <label for="gateway-bearer-token-input">VTDD_GATEWAY_BEARER_TOKEN</label>
          <input id="gateway-bearer-token-input" type="password" autocomplete="off" placeholder="token..." />
          <div class="row">
            <button id="gateway-bearer-vault-button"${syncEnabled ? "" : " disabled"}>Save gateway bearer to vault</button>
          </div>
          <p class="muted"><code>actionType=destructive</code> / <code>highRiskKind=gateway_bearer_vault_bootstrap</code> の approvalGrantId が必要です。<code>syncApiBase</code> が未指定の場合、このページから local vault へは書き込めません。</p>
          <p class="muted">初回 bootstrap では既存 bearer token がなく、helper が approvalGrant を runtime 検証できない場合があります。その場合はレスポンスに <code>not_checked_initial_bootstrap_gateway_bearer_missing</code> と表示します。Repository / Issue / High-risk Kind を確認してから実行してください。</p>
          <pre id="gateway-bearer-vault-output"></pre>
        </section>

        <section data-operator-section="vps-runner-admin"${hiddenAttribute(!sectionVisibility.vpsRunnerAdmin)}>
          <h2>9. VPS Runner Admin</h2>
          <p class="muted">VPS runner の repo allowlist 追加、runner restart、smoke などの管理操作用 approval です。ここでは real passkey で短命の <code>approvalGrantId</code> だけを発行します。VPS 操作そのものは GitHub queue と runner event に残る bounded command として別途実行されます。</p>
          <p class="muted"><code>actionType=destructive</code> / <code>highRiskKind=vps_runner_admin</code> の approvalGrantId が必要です。文字列としての passkey は承認ではありません。</p>
        </section>
      </div>
    </main>

    <script>
      const registerOutput = document.getElementById("register-output");
      const approveOutput = document.getElementById("approve-output");
      const syncOutput = document.getElementById("sync-output");
      const deployOutput = document.getElementById("deploy-output");
      const mergeOutput = document.getElementById("merge-output");
      const issueCloseOutput = document.getElementById("issue-close-output");
      const openaiSecretSyncOutput = document.getElementById("openai-secret-sync-output");
      const gatewayBearerVaultOutput = document.getElementById("gateway-bearer-vault-output");
      const copyApprovalGrantButton = document.getElementById("copy-approval-grant-button");
      const autoCopyApprovalGrantInput = document.getElementById("auto-copy-approval-grant-input");
      const deployRunLink = document.getElementById("deploy-run-link");
      const mergePrLink = document.getElementById("merge-pr-link");
      const issueCloseLink = document.getElementById("issue-close-link");
      let latestApprovalGrantId = "";

      async function readResponseBody(response) {
        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();
        if (contentType.includes("application/json")) {
          try {
            return text ? JSON.parse(text) : {};
          } catch (error) {
            return {
              error: "invalid_json_response",
              reason: String(error),
              rawBody: sanitizeRawBody(text)
            };
          }
        }
        return {
          error: "non_json_response",
          reason: "Expected JSON response but received " + (contentType || "unknown content-type"),
          httpStatus: response.status,
          rawBody: sanitizeRawBody(text)
        };
      }

      function sanitizeRawBody(text) {
        return String(text || "")
          .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_OPENAI_KEY]")
          .replace(/(authorization|api[_-]?key|token|secret)(["'\\s:=]+)([^"'\\s<>&]+)/gi, "$1$2[REDACTED]")
          .slice(0, 500);
      }

      function responseError(body, fallback) {
        const parts = [body.reason || body.error || fallback];
        if (body.httpStatus) {
          parts.push("HTTP status: " + body.httpStatus);
        }
        if (body.rawBody) {
          parts.push("rawBody: " + body.rawBody);
        }
        if (body.diagnostics) {
          parts.push("diagnostics: " + JSON.stringify(body.diagnostics, null, 2));
        }
        return new Error(parts.join("\\n"));
      }

      async function copyText(text) {
        const value = String(text || "");
        if (!value) {
          throw new Error("nothing to copy");
        }
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
          return;
        }
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!copied) {
          throw new Error("clipboard copy failed");
        }
      }

      async function copyApprovalGrantIdToClipboard({ quiet = false } = {}) {
        await copyText(latestApprovalGrantId);
        if (!quiet) {
          approveOutput.textContent = approveOutput.textContent + "\\n\\nCopied approvalGrantId to clipboard.";
        }
      }

      function extractDeployRunUrl(body) {
        return body?.deploy?.runUrl || "";
      }

      function normalizeDeployRunUrl(value) {
        const text = String(value || "");
        if (!text) {
          return "";
        }
        try {
          const url = new URL(text);
          if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
            return "";
          }
          if (!/\\/actions\\/runs\\/\\d+(?:$|[/?#])/.test(url.pathname + url.search + url.hash)) {
            return "";
          }
          return url.href;
        } catch {
          return "";
        }
      }

      function clearDeployRunLink() {
        if (!deployRunLink) {
          return;
        }
        deployRunLink.href = "#";
        deployRunLink.hidden = true;
      }

      function showDeployRunLink(body) {
        const runUrl = normalizeDeployRunUrl(extractDeployRunUrl(body));
        if (!runUrl || !deployRunLink) {
          return;
        }
        deployRunLink.href = runUrl;
        deployRunLink.hidden = false;
      }

      function extractMergePullRequestUrl(body) {
        return body?.authorityAction?.htmlUrl || body?.authorityAction?.pullRequestUrl || "";
      }

      function normalizeGitHubPullRequestUrl(value) {
        const text = String(value || "");
        if (!text) {
          return "";
        }
        try {
          const url = new URL(text);
          if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
            return "";
          }
          if (!/\\/pull\\/\\d+(?:$|[/?#])/.test(url.pathname + url.search + url.hash)) {
            return "";
          }
          return url.href;
        } catch {
          return "";
        }
      }

      function clearMergePrLink() {
        if (!mergePrLink) {
          return;
        }
        mergePrLink.href = "#";
        mergePrLink.hidden = true;
      }

      function showMergePrLink(body) {
        const prUrl = normalizeGitHubPullRequestUrl(extractMergePullRequestUrl(body));
        if (!prUrl || !mergePrLink) {
          return;
        }
        mergePrLink.href = prUrl;
        mergePrLink.hidden = false;
      }

      function extractIssueCloseUrl(body) {
        return body?.authorityAction?.htmlUrl || "";
      }

      function normalizeGitHubIssueUrl(value) {
        const text = String(value || "");
        if (!text) {
          return "";
        }
        try {
          const url = new URL(text);
          if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
            return "";
          }
          if (!/\\/issues\\/\\d+(?:$|[/?#])/.test(url.pathname + url.search + url.hash)) {
            return "";
          }
          return url.href;
        } catch {
          return "";
        }
      }

      function clearIssueCloseLink() {
        if (!issueCloseLink) {
          return;
        }
        issueCloseLink.href = "#";
        issueCloseLink.hidden = true;
      }

      function showIssueCloseLink(body) {
        const issueUrl = normalizeGitHubIssueUrl(extractIssueCloseUrl(body));
        if (!issueUrl || !issueCloseLink) {
          return;
        }
        issueCloseLink.href = issueUrl;
        issueCloseLink.hidden = false;
      }

      function readNumberInput(id) {
        const input = document.getElementById(id);
        return Number(input?.value || 0) || null;
      }

      function readApprovalPullNumber() {
        const highRiskKind = document.getElementById("risk-kind-input").value;
        if (highRiskKind === "issue_close") {
          return readNumberInput("issue-close-pull-number-input") || readNumberInput("pull-number-input");
        }
        return readNumberInput("pull-number-input");
      }

      copyApprovalGrantButton.addEventListener("click", async () => {
        try {
          await copyApprovalGrantIdToClipboard();
        } catch (error) {
          approveOutput.textContent = approveOutput.textContent + "\\n\\n" + String(error);
        }
      });

      document.getElementById("register-button").addEventListener("click", async () => {
        try {
          registerOutput.textContent = "register options request...";
          const optionsResponse = await fetch("${apiBase}/approval/passkey/register/options", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              operatorId: document.getElementById("operator-id").value,
              operatorLabel: document.getElementById("operator-label").value
            })
          });
          const optionsBody = await readResponseBody(optionsResponse);
          if (!optionsResponse.ok) {
            throw responseError(optionsBody, "register options failed");
          }

          const publicKey = decodeRegistrationOptions(optionsBody.optionsJSON);
          const credential = await navigator.credentials.create({ publicKey });
          const verifyResponse = await fetch("${apiBase}/approval/passkey/register/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sessionId: optionsBody.sessionId,
              response: encodeRegistrationCredential(credential)
            })
          });
          const verifyBody = await readResponseBody(verifyResponse);
          if (!verifyResponse.ok) {
            throw responseError(verifyBody, "register verify failed");
          }
          registerOutput.textContent = JSON.stringify(verifyBody, null, 2);
        } catch (error) {
          registerOutput.textContent = String(error);
        }
      });

      document.getElementById("approve-button").addEventListener("click", async () => {
        try {
          approveOutput.textContent = "approval challenge request...";
          const challengeResponse = await fetch("${apiBase}/approval/passkey/challenge", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              phase: document.getElementById("phase-input").value || "execution",
              highRiskKind: document.getElementById("risk-kind-input").value,
              repositoryInput: document.getElementById("repo-input").value,
              issueNumber: Number(document.getElementById("issue-input").value || 0) || null,
              pullNumber: readApprovalPullNumber(),
              issueContext: {
                issueNumber: Number(document.getElementById("issue-input").value || 0) || null
              },
              policyInput: {
                actionType: document.getElementById("action-type-input").value,
                repositoryInput: document.getElementById("repo-input").value,
                highRiskKind: document.getElementById("risk-kind-input").value
              }
            })
          });
          const challengeBody = await readResponseBody(challengeResponse);
          if (!challengeResponse.ok) {
            throw responseError(challengeBody, "approval challenge failed");
          }

          const publicKey = decodeAuthenticationOptions(challengeBody.optionsJSON);
          const assertion = await navigator.credentials.get({ publicKey });
          const verifyResponse = await fetch("${apiBase}/approval/passkey/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sessionId: challengeBody.sessionId,
              response: encodeAuthenticationAssertion(assertion)
            })
          });
          const verifyBody = await readResponseBody(verifyResponse);
          if (!verifyResponse.ok) {
            throw responseError(verifyBody, "approval verify failed");
          }
          latestApprovalGrantId = verifyBody?.approvalGrant?.approvalId || verifyBody?.approvalGrantId || "";
          approveOutput.textContent = JSON.stringify(verifyBody, null, 2);
          if (latestApprovalGrantId && autoCopyApprovalGrantInput.checked) {
            try {
              await copyApprovalGrantIdToClipboard({ quiet: true });
              approveOutput.textContent = approveOutput.textContent + "\\n\\nCopied approvalGrantId to clipboard.";
            } catch (error) {
              approveOutput.textContent = approveOutput.textContent + "\\n\\nAuto-copy failed: " + String(error);
            }
          }
        } catch (error) {
          approveOutput.textContent = String(error);
        }
      });

      document.getElementById("sync-button").addEventListener("click", async () => {
        try {
          const pastedApprovalGrantId = document.getElementById("approval-grant-id-input").value.trim();
          const approvalGrantId = latestApprovalGrantId || pastedApprovalGrantId;
          if (!approvalGrantId) {
            throw new Error("approvalGrantId is required before secret sync");
          }
          if (!"${syncApiBase}") {
            throw new Error("desktop maintenance required: local secret sync bridge is not configured");
          }
          syncOutput.textContent = "github app secret sync request...";
          const syncResponse = await fetch("${syncApiBase}/github-app-secret-sync/execute", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              approvalGrantId,
              repositoryInput: document.getElementById("repo-input").value,
              githubAppRole: document.getElementById("github-app-role-input").value
            })
          });
          const syncBody = await readResponseBody(syncResponse);
          if (!syncResponse.ok) {
            throw responseError(syncBody, "github app secret sync failed");
          }
          syncOutput.textContent = JSON.stringify(syncBody, null, 2);
        } catch (error) {
          syncOutput.textContent = String(error);
        }
      });

      document.getElementById("deploy-button").addEventListener("click", async () => {
        try {
          if (!latestApprovalGrantId) {
            throw new Error("approvalGrantId is required before production deploy");
          }
          clearDeployRunLink();
          deployOutput.textContent = "production deploy request...";
          const deployResponse = await fetch("${apiBase}/action/deploy", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              repository: document.getElementById("repo-input").value,
              issueNumber: Number(document.getElementById("issue-input").value || 0) || null,
              policyInput: {
                approvalPhrase: "GO",
                approvalGrantId: latestApprovalGrantId
              }
            })
          });
          const deployBody = await readResponseBody(deployResponse);
          if (!deployResponse.ok) {
            throw responseError(deployBody, "production deploy failed");
          }
          showDeployRunLink(deployBody);
          deployOutput.textContent = JSON.stringify(deployBody, null, 2);
        } catch (error) {
          deployOutput.textContent = String(error);
        }
      });

      document.getElementById("merge-button").addEventListener("click", async () => {
        try {
          if (!latestApprovalGrantId) {
            throw new Error("approvalGrantId is required before PR merge");
          }
          clearMergePrLink();
          mergeOutput.textContent = "PR merge request...";
          const mergeResponse = await fetch("${apiBase}/action/github-authority", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              operation: "pull_merge",
              repository: document.getElementById("repo-input").value,
              pullNumber: Number(document.getElementById("pull-number-input").value || 0) || null,
              mergeMethod: document.getElementById("merge-method-input").value || "squash",
              issueContext: {
                issueNumber: Number(document.getElementById("issue-input").value || 0) || null
              },
              policyInput: {
                approvalPhrase: "GO",
                approvalGrantId: latestApprovalGrantId,
                targetConfirmed: true
              }
            })
          });
          const mergeBody = await readResponseBody(mergeResponse);
          if (!mergeResponse.ok) {
            throw responseError(mergeBody, "PR merge failed");
          }
          showMergePrLink(mergeBody);
          mergeOutput.textContent = JSON.stringify(mergeBody, null, 2);
        } catch (error) {
          mergeOutput.textContent = String(error);
        }
      });

      document.getElementById("ready-button").addEventListener("click", async () => {
        try {
          if (!latestApprovalGrantId) {
            throw new Error("approvalGrantId is required before marking PR ready for review");
          }
          clearMergePrLink();
          mergeOutput.textContent = "PR ready-for-review request...";
          const readyResponse = await fetch("${apiBase}/action/github-authority", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              operation: "pull_ready_for_review",
              repository: document.getElementById("repo-input").value,
              pullNumber: Number(document.getElementById("pull-number-input").value || 0) || null,
              issueContext: {
                issueNumber: Number(document.getElementById("issue-input").value || 0) || null
              },
              policyInput: {
                approvalPhrase: "GO",
                approvalGrantId: latestApprovalGrantId,
                targetConfirmed: true
              }
            })
          });
          const readyBody = await readResponseBody(readyResponse);
          if (!readyResponse.ok) {
            throw responseError(readyBody, "PR ready-for-review failed");
          }
          showMergePrLink(readyBody);
          mergeOutput.textContent = JSON.stringify(readyBody, null, 2);
        } catch (error) {
          mergeOutput.textContent = String(error);
        }
      });

      document.getElementById("issue-close-button").addEventListener("click", async () => {
        try {
          if (!latestApprovalGrantId) {
            throw new Error("approvalGrantId is required before Issue close");
          }
          clearIssueCloseLink();
          issueCloseOutput.textContent = "Issue close request...";
          const issueCloseResponse = await fetch("${apiBase}/action/github-authority", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              operation: "issue_close",
              repository: document.getElementById("repo-input").value,
              issueNumber: Number(document.getElementById("issue-input").value || 0) || null,
              pullNumber: Number(document.getElementById("issue-close-pull-number-input").value || 0) || null,
              issueContext: {
                issueNumber: Number(document.getElementById("issue-input").value || 0) || null
              },
              policyInput: {
                approvalPhrase: "GO",
                approvalGrantId: latestApprovalGrantId,
                targetConfirmed: true
              }
            })
          });
          const issueCloseBody = await readResponseBody(issueCloseResponse);
          if (!issueCloseResponse.ok) {
            throw responseError(issueCloseBody, "Issue close failed");
          }
          showIssueCloseLink(issueCloseBody);
          issueCloseOutput.textContent = JSON.stringify(issueCloseBody, null, 2);
        } catch (error) {
          issueCloseOutput.textContent = String(error);
        }
      });

      document.getElementById("openai-secret-sync-button").addEventListener("click", async () => {
        try {
          if (!latestApprovalGrantId) {
            throw new Error("approvalGrantId is required before GitHub Actions secret sync");
          }
          const secretName = document.getElementById("github-actions-secret-name-input").value;
          const secretValue = document.getElementById("openai-api-key-input").value;
          if (!secretValue) {
            throw new Error(secretName + " is required");
          }
          openaiSecretSyncOutput.textContent = secretName + " secret sync request...";
          const syncResponse = await fetch("${apiBase}/action/github-actions-secret", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              repository: document.getElementById("repo-input").value,
              secretName,
              secretValue,
              policyInput: {
                approvalGrantId: latestApprovalGrantId
              }
            })
          });
          const syncBody = await readResponseBody(syncResponse);
          if (!syncResponse.ok) {
            throw responseError(syncBody, secretName + " secret sync failed");
          }
          document.getElementById("openai-api-key-input").value = "";
          openaiSecretSyncOutput.textContent = JSON.stringify(syncBody, null, 2);
        } catch (error) {
          openaiSecretSyncOutput.textContent = String(error);
        }
      });

      document.getElementById("gateway-bearer-vault-button").addEventListener("click", async () => {
        try {
          const pastedApprovalGrantId = document.getElementById("approval-grant-id-input").value.trim();
          const approvalGrantId = latestApprovalGrantId || pastedApprovalGrantId;
          if (!approvalGrantId) {
            throw new Error("approvalGrantId is required before gateway bearer vault bootstrap");
          }
          if (!"${syncApiBase}") {
            throw new Error("desktop maintenance required: local gateway bearer vault bridge is not configured");
          }
          const gatewayBearerTokenInput = document.getElementById("gateway-bearer-token-input");
          const gatewayBearerToken = gatewayBearerTokenInput.value;
          if (!gatewayBearerToken) {
            throw new Error("VTDD_GATEWAY_BEARER_TOKEN is required");
          }
          gatewayBearerVaultOutput.textContent = "gateway bearer vault bootstrap request...";
          const vaultResponse = await fetch("${syncApiBase}/gateway-bearer-vault/bootstrap", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              approvalGrantId,
              repositoryInput: document.getElementById("repo-input").value,
              gatewayBearerToken
            })
          });
          const vaultBody = await readResponseBody(vaultResponse);
          if (!vaultResponse.ok) {
            throw responseError(vaultBody, "gateway bearer vault bootstrap failed");
          }
          gatewayBearerTokenInput.value = "";
          gatewayBearerVaultOutput.textContent = JSON.stringify(vaultBody, null, 2);
        } catch (error) {
          gatewayBearerVaultOutput.textContent = String(error);
        }
      });

      function decodeRegistrationOptions(options) {
        return {
          ...options,
          challenge: base64UrlToBuffer(options.challenge),
          user: {
            ...options.user,
            id: base64UrlToBuffer(options.user.id)
          },
          excludeCredentials: Array.isArray(options.excludeCredentials)
            ? options.excludeCredentials.map((item) => ({
                ...item,
                id: base64UrlToBuffer(item.id)
              }))
            : []
        };
      }

      function decodeAuthenticationOptions(options) {
        return {
          ...options,
          challenge: base64UrlToBuffer(options.challenge),
          allowCredentials: Array.isArray(options.allowCredentials)
            ? options.allowCredentials.map((item) => ({
                ...item,
                id: base64UrlToBuffer(item.id)
              }))
            : []
        };
      }

      function encodeRegistrationCredential(credential) {
        return {
          id: credential.id,
          rawId: bufferToBase64Url(credential.rawId),
          type: credential.type,
          response: {
            attestationObject: bufferToBase64Url(credential.response.attestationObject),
            clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
            transports: typeof credential.response.getTransports === "function"
              ? credential.response.getTransports()
              : []
          }
        };
      }

      function encodeAuthenticationAssertion(assertion) {
        return {
          id: assertion.id,
          rawId: bufferToBase64Url(assertion.rawId),
          type: assertion.type,
          response: {
            authenticatorData: bufferToBase64Url(assertion.response.authenticatorData),
            clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
            signature: bufferToBase64Url(assertion.response.signature),
            userHandle: assertion.response.userHandle
              ? bufferToBase64Url(assertion.response.userHandle)
              : null
          }
        };
      }

      function base64UrlToBuffer(value) {
        const base64 = String(value)
          .replace(/-/g, "+")
          .replace(/_/g, "/")
          .padEnd(Math.ceil(String(value).length / 4) * 4, "=");
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
      }

      function bufferToBase64Url(buffer) {
        const bytes = new Uint8Array(buffer);
        let text = "";
        for (const byte of bytes) {
          text += String.fromCharCode(byte);
        }
        return btoa(text).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
      }
    </script>
  </body>
</html>`;
}

export function resolvePasskeyOperatorMode(input = {}) {
  const explicitMode = normalizeOperatorMode(input.operatorMode || input.mode);
  if (explicitMode) {
    return explicitMode;
  }

  const actionType = normalizeOperatorToken(input.actionType);
  const highRiskKind = normalizeOperatorToken(input.highRiskKind);

  if (!actionType && !highRiskKind) {
    return "full";
  }
  if (actionType === "deploy_production" || highRiskKind === "deploy_production") {
    return "deploy";
  }
  if (actionType === "merge" || highRiskKind === "pull_merge") {
    return "merge";
  }
  if (actionType === "pull_ready_for_review" || highRiskKind === "pull_ready_for_review") {
    return "merge";
  }
  if (actionType === "issue_close" || highRiskKind === "issue_close") {
    return "issue_close";
  }
  if (highRiskKind === "github_actions_secret_sync") {
    return "github_actions_secret_sync";
  }
  if (highRiskKind === "gateway_bearer_vault_bootstrap") {
    return "gateway_bearer_vault";
  }
  if (highRiskKind === "github_app_secret_sync") {
    return "github_app_secret_sync";
  }
  if (highRiskKind === "vps_runner_admin" || highRiskKind === "vps_admin") {
    return "vps";
  }

  return "full";
}

function resolveSectionVisibility(operatorMode, options = {}) {
  const full = operatorMode === "full";
  const passkeyEnabled = options.passkeyEnabled !== false;
  return {
    registration: passkeyEnabled,
    approval: passkeyEnabled,
    githubAppSecretSync: full || operatorMode === "github_app_secret_sync",
    productionDeploy: full || operatorMode === "deploy",
    prMerge: full || operatorMode === "merge",
    issueClose: full || operatorMode === "issue_close",
    githubActionsSecretSync: full || operatorMode === "github_actions_secret_sync",
    gatewayBearerVault: full || operatorMode === "gateway_bearer_vault",
    vpsRunnerAdmin: full || operatorMode === "vps"
  };
}

function hiddenAttribute(hidden) {
  return hidden ? " hidden" : "";
}

function renderGithubAppRoleOption(value, label, selectedValue) {
  const selected = value === selectedValue ? " selected" : "";
  return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
}

function normalizeOperatorMode(value) {
  const token = normalizeOperatorToken(value);
  if (["full", "deploy", "merge", "issue_close", "github_app_secret_sync", "github_actions_secret_sync", "gateway_bearer_vault", "vps"].includes(token)) {
    return token;
  }
  if (token === "secret_sync") {
    return "github_app_secret_sync";
  }
  if (token === "openai_secret_sync" || token === "codex_secret_sync") {
    return "github_actions_secret_sync";
  }
  if (token === "gateway_vault" || token === "gateway_bearer") {
    return "gateway_bearer_vault";
  }
  return "";
}

function defaultActionTypeForMode(operatorMode) {
  if (operatorMode === "deploy") {
    return "deploy_production";
  }
  if (operatorMode === "merge") {
    return "merge";
  }
  if (operatorMode === "issue_close") {
    return "issue_close";
  }
  return "destructive";
}

function defaultHighRiskKindForMode(operatorMode) {
  if (operatorMode === "deploy") {
    return "deploy_production";
  }
  if (operatorMode === "merge") {
    return "pull_merge";
  }
  if (operatorMode === "issue_close") {
    return "issue_close";
  }
  if (operatorMode === "github_actions_secret_sync") {
    return "github_actions_secret_sync";
  }
  if (operatorMode === "gateway_bearer_vault") {
    return "gateway_bearer_vault_bootstrap";
  }
  if (operatorMode === "vps") {
    return "vps_runner_admin";
  }
  return "github_app_secret_sync";
}

function normalizeOperatorToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
