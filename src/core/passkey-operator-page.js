export function renderPasskeyOperatorPage(input = {}) {
  const origin = escapeHtml(input.origin || "");
  const apiBase = escapeHtml(input.apiBase || "/v2");
  const registrationDefaultOperatorId = escapeHtml(input.operatorId || "vtdd-operator");
  const registrationDefaultOperatorLabel = escapeHtml(input.operatorLabel || "VTDD Operator");
  const repoDefault = escapeHtml(input.repositoryInput || "");
  const issueDefault = escapeHtml(input.issueNumber || "");
  const phaseDefault = escapeHtml(input.phase || "execution");
  const actionTypeDefault = escapeHtml(input.actionType || "destructive");
  const highRiskKindDefault = escapeHtml(input.highRiskKind || "github_app_secret_sync");
  const syncEnabled = input.syncEnabled === true;

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
      input {
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
        <section>
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

        <section>
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
          </div>
          <p class="muted">GitHub App secret sync なら <code>actionType=destructive</code> / <code>highRiskKind=github_app_secret_sync</code>、production deploy なら <code>actionType=deploy_production</code> / <code>highRiskKind=deploy_production</code> を使います。</p>
          <pre id="approve-output"></pre>
        </section>

        <section>
          <h2>3. GitHub App Secret Sync</h2>
          <p class="muted">real passkey approval 後、この helper から <code>#15</code> の explicit operator bootstrap を実行します。</p>
          <div class="row">
            <button id="sync-button"${syncEnabled ? "" : " disabled"}>Sync GitHub App secrets</button>
          </div>
          <p class="muted">${syncEnabled ? "approvalGrantId が取得済みなら実行できます。" : "この surface では secret sync endpoint が有効化されていません。"}</p>
          <pre id="sync-output"></pre>
        </section>
      </div>
    </main>

    <script>
      const registerOutput = document.getElementById("register-output");
      const approveOutput = document.getElementById("approve-output");
      const syncOutput = document.getElementById("sync-output");
      let latestApprovalGrantId = "";

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
          const optionsBody = await optionsResponse.json();
          if (!optionsResponse.ok) {
            throw new Error(optionsBody.reason || optionsBody.error || "register options failed");
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
          const verifyBody = await verifyResponse.json();
          if (!verifyResponse.ok) {
            throw new Error(verifyBody.reason || verifyBody.error || "register verify failed");
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
          const challengeBody = await challengeResponse.json();
          if (!challengeResponse.ok) {
            throw new Error(challengeBody.reason || challengeBody.error || "approval challenge failed");
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
          const verifyBody = await verifyResponse.json();
          if (!verifyResponse.ok) {
            throw new Error(verifyBody.reason || verifyBody.error || "approval verify failed");
          }
          latestApprovalGrantId = verifyBody?.approvalGrant?.approvalId || "";
          approveOutput.textContent = JSON.stringify(verifyBody, null, 2);
        } catch (error) {
          approveOutput.textContent = String(error);
        }
      });

      document.getElementById("sync-button").addEventListener("click", async () => {
        try {
          if (!latestApprovalGrantId) {
            throw new Error("approvalGrantId is required before secret sync");
          }
          syncOutput.textContent = "github app secret sync request...";
          const syncResponse = await fetch("${apiBase}/github-app-secret-sync/execute", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              approvalGrantId: latestApprovalGrantId,
              repositoryInput: document.getElementById("repo-input").value
            })
          });
          const syncBody = await syncResponse.json();
          if (!syncResponse.ok) {
            throw new Error(syncBody.reason || syncBody.error || "github app secret sync failed");
          }
          syncOutput.textContent = JSON.stringify(syncBody, null, 2);
        } catch (error) {
          syncOutput.textContent = String(error);
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
