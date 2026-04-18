import {
  AutonomyMode,
  MemoryRecordType,
  appendDecisionLogFromGateway,
  appendProposalLogFromGateway,
  createMemoryRecord,
  inferRelatedIssueFromGatewayInput,
  inferRelatedIssueFromProposalGatewayInput,
  normalizeAutonomyMode,
  retrieveCrossIssueMemoryIndex,
  retrieveDecisionLogReferences,
  retrieveProposalLogReferences,
  retrieveConstitution,
  resolveGatewayAliasRegistryFromGitHubApp,
  runInitialSetupWizard,
  runMvpGateway,
  validateMemoryProvider
} from "./core/index.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8"
};

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8"
};

const CANONICAL_API_PREFIX = "/v2";
const LEGACY_API_PREFIX = "/mvp";
const AUTONOMY_MODE_ENV = "VTDD_AUTONOMY_MODE";
const LEGACY_AUTONOMY_MODE_ENV = "MVP_AUTONOMY_MODE";

const SETUP_WIZARD_CLOUDFLARE_CHECK_ENABLED_ENV = "SETUP_WIZARD_CLOUDFLARE_CHECK_ENABLED";
const SETUP_WIZARD_PASSCODE_ENV = "SETUP_WIZARD_PASSCODE";
const SETUP_WIZARD_SESSION_SECRET_ENV = "SETUP_WIZARD_SESSION_SECRET";
const SETUP_WIZARD_SESSION_COOKIE = "vtdd_setup_access";
const SETUP_WIZARD_SESSION_TTL_SECONDS = 30 * 60;
const SETUP_WIZARD_GITHUB_APP_BOOTSTRAP_PATH = "/setup/wizard/github-app/bootstrap";
const SETUP_WIZARD_GITHUB_APP_MANIFEST_CALLBACK_PATH = "/setup/wizard/github-app/manifest/callback";
const CLOUDFLARE_WORKER_SCRIPT_NAME_ENV = "CLOUDFLARE_WORKER_SCRIPT_NAME";
const GITHUB_MANIFEST_CONVERSION_TOKEN_ENV = "GITHUB_MANIFEST_CONVERSION_TOKEN";
const GITHUB_APP_BOOTSTRAP_SECRET_ALLOWLIST = Object.freeze([
  "GITHUB_APP_ID",
  "GITHUB_APP_INSTALLATION_ID",
  "GITHUB_APP_PRIVATE_KEY"
]);
const GITHUB_APP_MANIFEST_SECRET_ALLOWLIST = Object.freeze([
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY"
]);
const GITHUB_API_BASE_URL = "https://api.github.com";
const CLOUDFLARE_BILLING_HINT_REGEX =
  /(payment|billing|subscription|add payment method|outstanding balance|cannot modify this subscription|zone cannot be upgraded|plan modification|card)/i;

const CLOUDFLARE_SETUP_HELP_LINKS = Object.freeze({
  tokenVerify: "https://developers.cloudflare.com/api/resources/user/subresources/tokens/methods/verify/",
  accessApps:
    "https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/",
  permissions: "https://developers.cloudflare.com/fundamentals/api/reference/permissions/",
  billingTroubleshoot: "https://developers.cloudflare.com/billing/troubleshoot/",
  billingOverview: "https://developers.cloudflare.com/fundamentals/concepts/free-plan/"
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, {
        ok: true,
        service: "vtdd-v2-worker",
        mode: "v2",
        autonomyMode: resolveRuntimeAutonomyMode(env)
      });
    }

    if (request.method === "POST" && url.pathname === "/setup/wizard/access") {
      return handleSetupWizardAccessRequest({ request, url, env });
    }

    if (request.method === "POST" && url.pathname === SETUP_WIZARD_GITHUB_APP_BOOTSTRAP_PATH) {
      const auth = await authorizeSetupWizardRequest({ request, url, env });
      if (!auth.ok) {
        return auth.response;
      }
      return handleGitHubAppBootstrapRequest({ request, url, env });
    }

    if (request.method === "GET" && url.pathname === SETUP_WIZARD_GITHUB_APP_MANIFEST_CALLBACK_PATH) {
      const auth = await authorizeSetupWizardRequest({ request, url, env });
      if (!auth.ok) {
        return auth.response;
      }
      return handleGitHubAppManifestCallbackRequest({ request, url, env });
    }

    if (request.method === "GET" && url.pathname === "/setup/wizard") {
      const auth = await authorizeSetupWizardRequest({ request, url, env });
      if (!auth.ok) {
        return auth.response;
      }
      return handleSetupWizardRequest({ request, url, env });
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/gateway")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/gateway" });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      const payload = await readJson(request);
      const prepared = await prepareGatewayPayload({ payload, env });
      const result = appendWarnings(runMvpGateway(prepared.payload), prepared.warnings);
      const gatewayOutcome = result.allowed
        ? await completeGatewayRuntime({
            payload: prepared.payload,
            gatewayResult: result,
            env
          })
        : { status: 422, body: result };

      const auditedGatewayOutcome = await appendGuardedAbsenceExecutionLog({
        payload: prepared.payload,
        gatewayOutcome,
        env
      });
      return json(auditedGatewayOutcome.status, auditedGatewayOutcome.body);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/constitution")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/constitution" });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleRetrieveConstitutionRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/decisions")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/decisions" });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleRetrieveDecisionLogsRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/proposals")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/proposals" });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleRetrieveProposalLogsRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/cross")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/cross" });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleRetrieveCrossIssueRequest(url, env);
    }

    return json(404, {
      ok: false,
      error: "not_found"
    });
  }
};

async function handleSetupWizardRequest({ request, url, env }) {
  const answers = buildSetupWizardAnswers(url);
  const result = runInitialSetupWizard({ answers });
  const cloudflareSetupCheck = await runCloudflareSetupCheck(url, env);
  const githubAppSetupCheck = await runGitHubAppSetupCheck(url, env);
  const githubAppBootstrapInternal = buildGitHubAppBootstrapStatus({ url, env });
  const githubAppBootstrap = toPublicGitHubAppBootstrapStatus(githubAppBootstrapInternal);
  const format = normalize(url.searchParams.get("format"));
  const guidance = buildSetupWizardGuidance({ result, url });
  const enrichedResult = attachSetupWizardImportUrls({ result, url });
  const locale = detectSetupWizardLocale({ request, url });

  if (format === "openapi") {
    const actionSchemaJson = enrichedResult?.onboarding?.customGpt?.actionSchemaJson;
    if (!enrichedResult.ok || !actionSchemaJson) {
      return json(422, {
        ...enrichedResult,
        generatedAnswers: answers,
        cloudflareSetupCheck,
        githubAppSetupCheck,
        githubAppBootstrap,
        guidance
      });
    }

    return new Response(actionSchemaJson, {
      status: 200,
      headers: JSON_HEADERS
    });
  }

  if (format === "json") {
    return json(result.ok ? 200 : 422, {
      ...enrichedResult,
      generatedAnswers: answers,
      cloudflareSetupCheck,
      githubAppSetupCheck,
      githubAppBootstrap,
      guidance
    });
  }

  const htmlBody = renderSetupWizardHtml({
    result: enrichedResult,
    answers,
    url,
    locale,
    cloudflareSetupCheck,
    githubAppSetupCheck,
    githubAppBootstrap
  });
  return html(result.ok ? 200 : 422, htmlBody);
}

async function authorizeSetupWizardRequest({ request, url, env }) {
  const config = getSetupWizardAuthConfig(env);
  if (!config.enabled) {
    return { ok: true };
  }

  const cookieHeader = request.headers.get("cookie");
  const cookieValue = readCookie(cookieHeader, SETUP_WIZARD_SESSION_COOKIE);
  const sessionValid = await verifySetupWizardSession({
    cookieValue,
    sessionSecret: config.sessionSecret
  });

  if (sessionValid) {
    return { ok: true };
  }

  return {
    ok: false,
    response: renderSetupWizardLockedResponse({ request, url })
  };
}

async function handleSetupWizardAccessRequest({ request, url, env }) {
  const config = getSetupWizardAuthConfig(env);
  if (!config.enabled) {
    return json(409, {
      ok: false,
      error: "setup_wizard_access_not_enabled",
      reason: "setup wizard passcode boundary is not configured"
    });
  }

  const payload = await readSetupWizardAccessPayload(request);
  if (payload.passcode !== config.passcode) {
    return json(403, {
      ok: false,
      error: "invalid_setup_passcode"
    });
  }

  const cookieValue = await createSetupWizardSessionToken({
    sessionSecret: config.sessionSecret
  });
  const setCookie = buildSetupWizardSessionCookie(cookieValue);
  const returnTo = normalizeReturnTo(payload.returnTo);

  if (payload.mode === "form") {
    return new Response(null, {
      status: 303,
      headers: {
        location: returnTo || "/setup/wizard",
        "set-cookie": setCookie
      }
    });
  }

  return json(
    200,
    {
      ok: true,
      unlocked: true,
      returnTo: returnTo || "/setup/wizard"
    },
    {
      "set-cookie": setCookie
    }
  );
}

async function handleGitHubAppBootstrapRequest({ request, url, env }) {
  const bootstrap = buildGitHubAppBootstrapStatus({ url, env });
  if (bootstrap.state !== "available") {
    return json(503, {
      ok: false,
      error: "github_app_bootstrap_unavailable",
      state: bootstrap.state,
      summary: bootstrap.summary,
      missingPrerequisites: bootstrap.missingPrerequisites ?? [],
      guidance: bootstrap.guidance ?? [],
      allowlistedSecrets: bootstrap.allowlistedSecrets ?? []
    });
  }

  const payload = await readGitHubAppBootstrapPayload(request);
  const missingSecretValues = GITHUB_APP_BOOTSTRAP_SECRET_ALLOWLIST.filter(
    (name) => !normalizeText(payload[name])
  );
  if (missingSecretValues.length > 0) {
    return json(422, {
      ok: false,
      error: "github_app_bootstrap_missing_values",
      missingSecretValues
    });
  }

  const fetchImpl =
    typeof env?.CF_API_FETCH === "function"
      ? env.CF_API_FETCH
      : typeof globalThis.fetch === "function"
        ? globalThis.fetch.bind(globalThis)
        : null;
  if (!fetchImpl) {
    return json(503, {
      ok: false,
      error: "github_app_bootstrap_fetch_unavailable",
      reason: "runtime fetch is unavailable"
    });
  }

  for (const secretName of GITHUB_APP_BOOTSTRAP_SECRET_ALLOWLIST) {
    const updated = await putCloudflareWorkerSecret({
      fetchImpl,
      apiToken: bootstrap.cloudflareApiToken,
      accountId: bootstrap.accountId,
      scriptName: bootstrap.scriptName,
      secretName,
      secretValue: payload[secretName]
    });
    if (!updated.ok) {
      return json(502, {
        ok: false,
        error: "github_app_bootstrap_write_failed",
        secretName,
        reason: updated.reason,
        evidence: {
          httpStatus: updated.httpStatus ?? null
        }
      });
    }
  }

  const returnTo =
    normalizeGitHubAppBootstrapReturnTo(payload.returnTo) || "/setup/wizard?githubAppCheck=on";

  if (payload.mode === "form") {
    return new Response(null, {
      status: 303,
      headers: {
        location: returnTo
      }
    });
  }

  return json(200, {
    ok: true,
    updatedSecrets: [...GITHUB_APP_BOOTSTRAP_SECRET_ALLOWLIST],
    returnTo
  });
}

async function handleGitHubAppManifestCallbackRequest({ request, url, env }) {
  const bootstrap = buildGitHubAppBootstrapStatus({ url, env });
  if (bootstrap.state !== "available") {
    return json(503, {
      ok: false,
      error: "github_app_manifest_bootstrap_unavailable",
      state: bootstrap.state,
      summary: bootstrap.summary,
      missingPrerequisites: bootstrap.missingPrerequisites ?? []
    });
  }

  const code = normalizeText(url.searchParams.get("code"));
  const returnTo = normalizeGitHubAppBootstrapReturnTo(url.searchParams.get("returnTo"));

  if (!code) {
    return json(422, {
      ok: false,
      error: "github_app_manifest_callback_missing_parameters"
    });
  }

  const fetchImpl =
    typeof env?.GITHUB_API_FETCH === "function"
      ? env.GITHUB_API_FETCH
      : typeof globalThis.fetch === "function"
        ? globalThis.fetch.bind(globalThis)
        : null;
  if (!fetchImpl) {
    return json(503, {
      ok: false,
      error: "github_app_manifest_fetch_unavailable"
    });
  }

  const converted = await convertGitHubAppManifestCode({
    fetchImpl,
    code,
    authToken: bootstrap.githubManifestConversionToken
  });
  if (!converted.ok) {
    return json(502, {
      ok: false,
      error: "github_app_manifest_conversion_failed",
      reason: converted.reason
    });
  }

  const secretsToWrite = [
    ["GITHUB_APP_ID", String(converted.appId)],
    ["GITHUB_APP_PRIVATE_KEY", converted.privateKey]
  ];
  for (const [secretName, secretValue] of secretsToWrite) {
    const updated = await putCloudflareWorkerSecret({
      fetchImpl: typeof env?.CF_API_FETCH === "function" ? env.CF_API_FETCH : globalThis.fetch.bind(globalThis),
      apiToken: bootstrap.cloudflareApiToken,
      accountId: bootstrap.accountId,
      scriptName: bootstrap.scriptName,
      secretName,
      secretValue
    });
    if (!updated.ok) {
      return json(502, {
        ok: false,
        error: "github_app_manifest_secret_write_failed",
        secretName,
        reason: updated.reason
      });
    }
  }

  const installUrl = converted.slug
    ? `https://github.com/apps/${encodeURIComponent(converted.slug)}/installations/new`
    : converted.htmlUrl;
  const redirectTarget = returnTo || "/setup/wizard?githubAppCheck=on";

  return html(
    200,
    renderHtmlDocument(`
      <p class="meta">GitHub App manifest bootstrap completed.</p>
      <div class="block">
        <p><strong>App ID</strong> and <strong>private key</strong> were written to Worker runtime.</p>
        <p class="meta">Installation ID is still required after you install the app.</p>
        ${
          installUrl
            ? `<p><a href="${escapeHtml(installUrl)}" target="_blank" rel="noopener noreferrer">Install the GitHub App</a></p>`
            : ""
        }
        <p><a href="${escapeHtml(redirectTarget)}">Return to setup wizard</a></p>
      </div>
    `)
  );
}

function attachSetupWizardImportUrls({ result, url }) {
  const actionSchemaJson = result?.onboarding?.customGpt?.actionSchemaJson;
  if (!actionSchemaJson) {
    return result;
  }

  return {
    ...result,
    onboarding: {
      ...result.onboarding,
      customGpt: {
        ...result.onboarding.customGpt,
        actionSchemaImportUrl: buildActionSchemaImportUrl(url)
      }
    }
  };
}

function buildActionSchemaImportUrl(url) {
  const importUrl = new URL(url.toString());
  importUrl.searchParams.set("format", "openapi");
  importUrl.searchParams.delete("githubAppCheck");
  importUrl.searchParams.delete("cloudflareCheck");
  return importUrl.toString();
}

function getSetupWizardAuthConfig(env) {
  const passcode = normalizeText(env?.[SETUP_WIZARD_PASSCODE_ENV]);
  const sessionSecret =
    normalizeText(env?.[SETUP_WIZARD_SESSION_SECRET_ENV]) || normalizeText(passcode);

  return {
    enabled: Boolean(passcode),
    passcode,
    sessionSecret
  };
}

function renderSetupWizardLockedResponse({ request, url }) {
  const locale = detectSetupWizardLocale({ request, url });
  const format = normalize(url.searchParams.get("format"));
  const returnTo = url.pathname + url.search;

  if (format === "json" || format === "openapi") {
    return json(401, {
      ok: false,
      error: "setup_wizard_locked",
      reason: "setup wizard requires bootstrap passcode authentication",
      unlockPath: "/setup/wizard/access",
      returnTo
    });
  }

  return html(
    401,
    renderHtmlDocument(`
        <p class="meta">${escapeHtml(locale === "ja" ? "セットアップウィザードへのアクセスは保護されています。" : "Setup wizard access is protected.")}</p>
        <div class="block">
          <p>${escapeHtml(locale === "ja" ? "この端末で続行するには bootstrap passcode を入力してください。" : "Enter the bootstrap passcode to continue on this device.")}</p>
          <form method="post" action="/setup/wizard/access">
            <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
            <label for="passcode"><strong>${escapeHtml(locale === "ja" ? "パスコード" : "Passcode")}</strong></label>
            <p class="meta" style="margin-top: 4px;">${escapeHtml(locale === "ja" ? "下の入力欄をタップして passcode を入れ、Unlock してください。" : "Tap the field below, enter the passcode, then unlock.")}</p>
            <input
              id="passcode"
              name="passcode"
              type="password"
              inputmode="text"
              autocomplete="one-time-code"
              placeholder="${escapeHtml(locale === "ja" ? "パスコードを入力" : "Enter passcode")}"
              style="display: block; width: 100%; max-width: 100%; min-height: 44px; margin-top: 8px; padding: 12px 14px; font-size: 16px; line-height: 1.4; border-radius: 10px; border: 1px solid #cbd5e1; background: #fff;"
            />
            <div style="margin-top: 12px;">
              <button type="submit" class="copy-button">${escapeHtml(locale === "ja" ? "セットアップウィザードを開く" : "Unlock Setup Wizard")}</button>
            </div>
          </form>
        </div>
      `, {
        pageTitle: locale === "ja" ? "VTDD セットアップウィザード" : "VTDD Setup Wizard",
        copiedText: locale === "ja" ? "コピーしました。" : "Copied.",
        manualCopyText:
          locale === "ja" ? "全選択して手動でコピーしてください。" : "Select all and copy manually."
      })
  );
}

async function readSetupWizardAccessPayload(request) {
  const contentType = normalizeText(request.headers.get("content-type"));
  if (contentType.includes("application/json")) {
    const payload = await readJson(request);
    return {
      mode: "json",
      passcode: normalizeText(payload?.passcode),
      returnTo: normalizeText(payload?.returnTo)
    };
  }

  const form = await request.formData();
  return {
    mode: "form",
    passcode: normalizeText(form.get("passcode")),
    returnTo: normalizeText(form.get("returnTo"))
  };
}

function normalizeReturnTo(value) {
  const text = normalizeText(value);
  if (!text.startsWith("/setup/wizard")) {
    return "";
  }
  return text;
}

function readCookie(cookieHeader, name) {
  const header = normalizeText(cookieHeader);
  if (!header) {
    return "";
  }

  for (const part of header.split(";")) {
    const [cookieName, ...rest] = part.trim().split("=");
    if (cookieName === name) {
      return rest.join("=");
    }
  }

  return "";
}

async function createSetupWizardSessionToken({ sessionSecret }) {
  const expiresAt = Date.now() + SETUP_WIZARD_SESSION_TTL_SECONDS * 1000;
  const signature = await signSetupWizardValue({
    sessionSecret,
    message: String(expiresAt)
  });
  return `${expiresAt}.${signature}`;
}

async function verifySetupWizardSession({ cookieValue, sessionSecret }) {
  const raw = normalizeText(cookieValue);
  if (!raw) {
    return false;
  }

  const [expiresAtText, signature] = raw.split(".", 2);
  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || !signature) {
    return false;
  }

  const expected = await signSetupWizardValue({
    sessionSecret,
    message: String(expiresAt)
  });
  return signature === expected;
}

async function signSetupWizardValue({ sessionSecret, message }) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(`setup-wizard:${message}`)
  );
  return toHex(new Uint8Array(signature));
}

function buildSetupWizardSessionCookie(cookieValue) {
  return [
    `${SETUP_WIZARD_SESSION_COOKIE}=${cookieValue}`,
    "Path=/setup/wizard",
    `Max-Age=${SETUP_WIZARD_SESSION_TTL_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}

async function handleRetrieveConstitutionRequest(url, env) {
  const provider = env?.MEMORY_PROVIDER ?? null;
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for constitution retrieval"
    });
  }

  const limit = normalizeLimit(url.searchParams.get("limit"), 5);
  const records = await retrieveConstitution(provider, limit);
  return json(200, {
    ok: true,
    recordType: "constitution",
    recordCount: records.length,
    records
  });
}

async function handleRetrieveDecisionLogsRequest(url, env) {
  const provider = env?.MEMORY_PROVIDER ?? null;
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for decision log retrieval"
    });
  }

  const limit = normalizeLimit(url.searchParams.get("limit"), 5);
  const relatedIssue = normalizeIssue(url.searchParams.get("relatedIssue"));
  const retrieved = await retrieveDecisionLogReferences(provider, {
    limit,
    relatedIssue
  });

  if (!retrieved.ok) {
    return json(retrieved.status, {
      ok: false,
      error: retrieved.error ?? "memory_read_failed",
      reason: retrieved.reason
    });
  }

  return json(200, {
    ok: true,
    recordType: "decision_log",
    recordCount: retrieved.references.length,
    references: retrieved.references
  });
}

async function handleRetrieveProposalLogsRequest(url, env) {
  const provider = env?.MEMORY_PROVIDER ?? null;
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for proposal log retrieval"
    });
  }

  const limit = normalizeLimit(url.searchParams.get("limit"), 5);
  const relatedIssue = normalizeIssue(url.searchParams.get("relatedIssue"));
  const retrieved = await retrieveProposalLogReferences(provider, {
    limit,
    relatedIssue
  });

  if (!retrieved.ok) {
    return json(retrieved.status, {
      ok: false,
      error: retrieved.error ?? "memory_read_failed",
      reason: retrieved.reason
    });
  }

  return json(200, {
    ok: true,
    recordType: "proposal_log",
    recordCount: retrieved.references.length,
    references: retrieved.references
  });
}

async function handleRetrieveCrossIssueRequest(url, env) {
  const provider = env?.MEMORY_PROVIDER ?? null;
  const phase = normalize(url.searchParams.get("phase")) || "execution";
  const limit = normalizeLimit(url.searchParams.get("limit"), 5);
  const relatedIssue = normalizeIssue(url.searchParams.get("relatedIssue"));
  const issueNumber = normalizeIssue(url.searchParams.get("issueNumber"));
  const issueTitle = normalizeText(url.searchParams.get("issueTitle"));
  const issueUrl = normalizeText(url.searchParams.get("issueUrl"));
  const queryText = normalizeText(url.searchParams.get("q"));

  const retrieved = await retrieveCrossIssueMemoryIndex(provider, {
    phase,
    limit,
    relatedIssue,
    text: queryText,
    issueContext:
      issueNumber || issueTitle || issueUrl
        ? {
            issueNumber,
            issueTitle,
            issueUrl
          }
        : null
  });
  if (!retrieved.ok) {
    return json(retrieved.status ?? 503, {
      ok: false,
      error: retrieved.error ?? "memory_read_failed",
      reason: retrieved.reason
    });
  }

  return json(200, {
    ok: true,
    retrievalPlan: retrieved.retrievalPlan,
    relatedIssue: retrieved.relatedIssue,
    queryText: retrieved.queryText,
    primaryReference: retrieved.primaryReference,
    referencesBySource: retrieved.referencesBySource,
    orderedReferences: retrieved.orderedReferences
  });
}

async function prepareGatewayPayload({ payload, env }) {
  const basePayload = payload && typeof payload === "object" ? payload : {};
  const basePolicyInput =
    basePayload.policyInput && typeof basePayload.policyInput === "object"
      ? basePayload.policyInput
      : {};
  const runtimeAutonomyMode = resolveRuntimeAutonomyMode(env);
  const requestedAutonomyMode = normalizeAutonomyMode(basePolicyInput.autonomyMode);
  const effectiveAutonomyMode =
    runtimeAutonomyMode === AutonomyMode.GUARDED_ABSENCE
      ? AutonomyMode.GUARDED_ABSENCE
      : requestedAutonomyMode;

  const resolvedAliasRegistry = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: basePolicyInput,
    env
  });
  const warnings = [...(resolvedAliasRegistry.warnings ?? [])];
  if (
    runtimeAutonomyMode === AutonomyMode.GUARDED_ABSENCE &&
    requestedAutonomyMode !== AutonomyMode.GUARDED_ABSENCE
  ) {
    warnings.push("runtime forces guarded absence mode; payload autonomyMode override was ignored");
  }

  return {
    payload: {
      ...basePayload,
      policyInput: {
        ...basePolicyInput,
        aliasRegistry: resolvedAliasRegistry.aliasRegistry,
        autonomyMode: effectiveAutonomyMode
      }
    },
    warnings
  };
}

function appendWarnings(result, warnings) {
  if (!Array.isArray(warnings) || warnings.length === 0) {
    return result;
  }

  const currentWarnings = Array.isArray(result?.warnings) ? result.warnings : [];
  const merged = new Set([...currentWarnings, ...warnings].map(normalizeText).filter(Boolean));

  return {
    ...result,
    warnings: [...merged]
  };
}

async function appendGuardedAbsenceExecutionLog({ payload, gatewayOutcome, env }) {
  const policyInput = normalizeObject(payload?.policyInput);
  const autonomyMode = normalizeAutonomyMode(policyInput.autonomyMode);
  if (autonomyMode !== AutonomyMode.GUARDED_ABSENCE) {
    return gatewayOutcome;
  }

  const provider = env?.MEMORY_PROVIDER ?? null;
  const providerValidation = validateMemoryProvider(provider);
  if (!providerValidation.ok) {
    return attachGatewayWarning(
      gatewayOutcome,
      "guarded absence execution log skipped: memory provider unavailable"
    );
  }

  const nowIso = new Date().toISOString();
  const body = normalizeObject(gatewayOutcome?.body);
  const blockedByRule = normalizeText(body.blockedByRule) || null;
  const recordInput = {
    id: buildGuardedAbsenceExecutionLogId({
      actionType: policyInput.actionType,
      timestamp: nowIso
    }),
    type: MemoryRecordType.EXECUTION_LOG,
    content: {
      mode: autonomyMode,
      phase: normalizeText(payload?.phase) || "execution",
      actorRole: normalizeText(payload?.actorRole) || null,
      actionType: normalizeText(policyInput.actionType) || null,
      allowed: body.allowed === true,
      blockedByRule,
      reason: normalizeText(body.reason) || null,
      repositoryInput: normalizeText(policyInput.repositoryInput) || null,
      repository: normalizeText(body.repository) || null,
      requiredApproval: normalizeText(body.requiredApproval) || null,
      stopCategory: classifyGuardedStopCategory(blockedByRule)
    },
    metadata: {
      source: "guarded_absence_gateway",
      statusCode: Number(gatewayOutcome?.status) || 200,
      blockedByRule,
      recordedAt: nowIso
    },
    priority: 88,
    tags: [
      "execution_log",
      "guarded_absence",
      body.allowed === true ? "result:allowed" : "result:blocked",
      blockedByRule ? `rule:${normalizeTag(blockedByRule)}` : null
    ].filter(Boolean),
    createdAt: nowIso
  };

  const created = createMemoryRecord(recordInput);
  if (!created.ok) {
    return attachGatewayWarning(
      gatewayOutcome,
      "guarded absence execution log skipped: execution_log schema invalid"
    );
  }

  try {
    const stored = await provider.store(created.record);
    if (!stored?.ok) {
      return attachGatewayWarning(
        gatewayOutcome,
        "guarded absence execution log skipped: memory provider rejected execution_log record"
      );
    }

    return {
      status: gatewayOutcome.status,
      body: {
        ...body,
        guardedAbsenceExecutionLog: {
          recordId: stored.record.id,
          recordType: stored.record.type,
          mode: autonomyMode
        }
      }
    };
  } catch {
    return attachGatewayWarning(
      gatewayOutcome,
      "guarded absence execution log skipped: memory provider store failed"
    );
  }
}

async function completeGatewayRuntime({ payload, gatewayResult, env }) {
  const provider = env?.MEMORY_PROVIDER ?? null;
  const providerValidation = validateMemoryProvider(provider);
  const needsDecisionWrite = gatewayResult?.memoryWrite?.recordType === "decision_log";
  const needsProposalWrite = gatewayResult?.memoryWrite?.recordType === "proposal_log";
  const crossRetrievalRequest = normalizeCrossRetrievalRequest(
    gatewayResult?.conversationAssist?.crossRetrievalRequest
  );
  const shouldAttachCrossReferences = crossRetrievalRequest.enabled;
  const shouldAttachDecisionReferences = Array.isArray(gatewayResult?.retrievalPlan?.sources)
    ? gatewayResult.retrievalPlan.sources.includes("decision_log")
    : false;
  const shouldAttachProposalReferences = Array.isArray(gatewayResult?.retrievalPlan?.sources)
    ? gatewayResult.retrievalPlan.sources.includes("proposal_log")
    : false;

  if (
    !needsDecisionWrite &&
    !needsProposalWrite &&
    !shouldAttachCrossReferences &&
    !shouldAttachDecisionReferences &&
    !shouldAttachProposalReferences
  ) {
    return { status: 200, body: gatewayResult };
  }

  if (!providerValidation.ok) {
    if (needsDecisionWrite || needsProposalWrite) {
      const reason = needsProposalWrite
        ? "valid memory provider is required for proposal log persistence"
        : "valid memory provider is required for decision log persistence";
      return {
        status: 503,
        body: {
          allowed: false,
          error: "memory_provider_unavailable",
          reason
        }
      };
    }

    const retrievalReferences = {};
    const warnings = [];
    if (shouldAttachDecisionReferences) {
      retrievalReferences.decisionLogs = [];
      warnings.push("memory provider unavailable; decision references skipped");
    }
    if (shouldAttachProposalReferences) {
      retrievalReferences.proposalLogs = [];
      warnings.push("memory provider unavailable; proposal references skipped");
    }
    if (shouldAttachCrossReferences) {
      retrievalReferences.cross = null;
      warnings.push("memory provider unavailable; cross references skipped");
    }

    return {
      status: 200,
      body: {
        ...gatewayResult,
        retrievalReferences,
        warnings
      }
    };
  }

  let responseBody = { ...gatewayResult };

  if (needsDecisionWrite) {
    const persisted = await appendDecisionLogFromGateway(provider, payload, gatewayResult);
    if (!persisted.ok) {
      if (persisted.status === 422) {
        return {
          status: 422,
          body: {
            allowed: false,
            blockedByRule: persisted.blockedByRule ?? "decision_log_schema_invalid",
            reason: persisted.reason,
            issues: Array.isArray(persisted.issues) ? persisted.issues : []
          }
        };
      }
      return {
        status: persisted.status ?? 503,
        body: {
          allowed: false,
          error: persisted.error ?? "memory_write_failed",
          reason: persisted.reason
        }
      };
    }

    responseBody = {
      ...responseBody,
      memoryWritePersisted: {
        recordId: persisted.record.id,
        recordType: persisted.record.type,
        relatedIssue: persisted.entry.relatedIssue,
        timestamp: persisted.entry.timestamp
      }
    };
  }

  if (needsProposalWrite) {
    const persisted = await appendProposalLogFromGateway(provider, payload, gatewayResult);
    if (!persisted.ok) {
      if (persisted.status === 422) {
        return {
          status: 422,
          body: {
            allowed: false,
            blockedByRule: persisted.blockedByRule ?? "proposal_log_schema_invalid",
            reason: persisted.reason,
            issues: Array.isArray(persisted.issues) ? persisted.issues : []
          }
        };
      }
      return {
        status: persisted.status ?? 503,
        body: {
          allowed: false,
          error: persisted.error ?? "memory_write_failed",
          reason: persisted.reason
        }
      };
    }

    responseBody = {
      ...responseBody,
      memoryWritePersisted: {
        recordId: persisted.record.id,
        recordType: persisted.record.type,
        relatedIssue: persisted.entry.relatedIssue ?? null,
        timestamp: persisted.entry.timestamp
      }
    };
  }

  if (shouldAttachDecisionReferences) {
    const relatedIssue =
      responseBody?.memoryWritePersisted?.relatedIssue ?? inferRelatedIssueFromGatewayInput(payload);
    const retrieved = await retrieveDecisionLogReferences(provider, {
      limit: 5,
      relatedIssue
    });

    if (!retrieved.ok) {
      return {
        status: retrieved.status ?? 503,
        body: {
          allowed: false,
          error: retrieved.error ?? "memory_read_failed",
          reason: retrieved.reason
        }
      };
    }

    responseBody = {
      ...responseBody,
      retrievalReferences: {
        ...(responseBody.retrievalReferences ?? {}),
        decisionLogs: retrieved.references
      }
    };
  }

  if (shouldAttachProposalReferences) {
    const relatedIssue =
      responseBody?.memoryWritePersisted?.recordType === "proposal_log"
        ? responseBody.memoryWritePersisted.relatedIssue
        : inferRelatedIssueFromProposalGatewayInput(payload);
    const retrieved = await retrieveProposalLogReferences(provider, {
      limit: 5,
      relatedIssue
    });

    if (!retrieved.ok) {
      return {
        status: retrieved.status ?? 503,
        body: {
          allowed: false,
          error: retrieved.error ?? "memory_read_failed",
          reason: retrieved.reason
        }
      };
    }

    responseBody = {
      ...responseBody,
      retrievalReferences: {
        ...(responseBody.retrievalReferences ?? {}),
        proposalLogs: retrieved.references
      }
    };
  }

  if (shouldAttachCrossReferences) {
    const crossInput = buildCrossRetrievalInput({
      payload,
      responseBody,
      crossRetrievalRequest
    });
    const retrieved = await retrieveCrossIssueMemoryIndex(provider, crossInput);
    if (!retrieved.ok) {
      responseBody = {
        ...responseBody,
        retrievalReferences: {
          ...(responseBody.retrievalReferences ?? {}),
          cross: null
        },
        warnings: [...(responseBody.warnings ?? []), retrieved.reason || "cross retrieval skipped"]
      };
    } else {
      responseBody = {
        ...responseBody,
        retrievalReferences: {
          ...(responseBody.retrievalReferences ?? {}),
          cross: formatCrossRetrievalOutput(retrieved, crossInput.displayMode)
        }
      };
    }
  }

  return {
    status: 200,
    body: responseBody
  };
}

function buildCrossRetrievalInput({ payload, responseBody, crossRetrievalRequest }) {
  const relatedIssue =
    crossRetrievalRequest.relatedIssue ??
    responseBody?.memoryWritePersisted?.relatedIssue ??
    inferRelatedIssueFromGatewayInput(payload) ??
    inferRelatedIssueFromProposalGatewayInput(payload);
  const issueContextInput = payload?.issueContext ?? {};
  const issueNumber = normalizeIssue(issueContextInput.issueNumber) ?? relatedIssue;
  const issueTitle = normalizeText(issueContextInput.issueTitle);
  const issueUrl = normalizeText(issueContextInput.issueUrl);

  return {
    phase: crossRetrievalRequest.phase,
    limit: crossRetrievalRequest.limit,
    relatedIssue,
    text: crossRetrievalRequest.text,
    displayMode: crossRetrievalRequest.displayMode,
    issueContext:
      issueNumber || issueTitle || issueUrl
        ? {
            issueNumber,
            issueTitle: issueTitle || null,
            issueUrl: issueUrl || null
          }
        : null
  };
}

function formatCrossRetrievalOutput(retrieved, displayMode) {
  const ordered = Array.isArray(retrieved.orderedReferences) ? retrieved.orderedReferences : [];
  const limitedOrdered =
    displayMode === "expanded" ? ordered.slice(0, 12) : ordered.slice(0, 5);
  const sourceCounts = {};
  for (const [source, entries] of Object.entries(retrieved.referencesBySource ?? {})) {
    sourceCounts[source] = Array.isArray(entries) ? entries.length : 0;
  }

  return {
    displayMode,
    retrievalPlan: retrieved.retrievalPlan,
    relatedIssue: retrieved.relatedIssue,
    queryText: retrieved.queryText,
    primaryReference: retrieved.primaryReference,
    sourceCounts,
    orderedReferences: limitedOrdered
  };
}

function normalizeCrossRetrievalRequest(request) {
  const value = request && typeof request === "object" ? request : {};
  const enabled = value.enabled === true;
  return {
    enabled,
    phase: normalize(value.phase) === "exploration" ? "exploration" : "execution",
    limit: normalizeLimit(value.limit, 5),
    displayMode: normalize(value.displayMode) === "expanded" ? "expanded" : "short",
    relatedIssue: normalizeIssue(value.relatedIssue),
    text: normalizeText(value.text) || null
  };
}

function buildSetupWizardAnswers(url) {
  const repositories = parseRepositories(url);
  const initialSurfaces = parseInitialSurfaces(url);
  const actionEndpointBaseUrl = normalizeUrl(url.searchParams.get("actionEndpointBaseUrl")) || url.origin;

  return {
    repositories,
    allowDefaultRepository: false,
    credentialModel: "github_app",
    highRiskApproval: "go_passkey",
    reviewerInitial: "gemini",
    setupMode: "iphone_first",
    actionEndpointBaseUrl,
    initialSurfaces,
    repositoryVisibility: normalizeVisibility(url.searchParams.get("repositoryVisibility")),
    branchProtectionApiStatus: normalizeSignalStatus(url.searchParams.get("branchProtectionApiStatus")),
    rulesetsApiStatus: normalizeSignalStatus(url.searchParams.get("rulesetsApiStatus")),
    deployAuthorityPreference: normalizeDeployAuthorityPreference(
      url.searchParams.get("deployAuthorityPreference")
    )
  };
}

function parseRepositories(url) {
  const provided = url.searchParams
    .getAll("repo")
    .map(normalizeRepo)
    .filter(Boolean);
  return provided.map((canonicalRepo) => ({
    canonicalRepo,
    aliases: deriveAliases(canonicalRepo)
  }));
}

function parseInitialSurfaces(url) {
  const surfaces = url.searchParams
    .getAll("surface")
    .map(normalize)
    .filter(Boolean);

  return surfaces.length > 0 ? surfaces : ["custom_gpt"];
}

function deriveAliases(canonicalRepo) {
  const [, repoNameRaw] = canonicalRepo.split("/");
  const repoName = String(repoNameRaw ?? "").trim().toLowerCase();
  const compact = repoName.replace(/[^a-z0-9]+/g, "");
  const aliases = new Set([repoName, compact].filter(Boolean));
  return [...aliases];
}

function renderSetupWizardHtml({
  result,
  answers,
  url,
  locale = "en",
  cloudflareSetupCheck,
  githubAppSetupCheck,
  githubAppBootstrap
}) {
  const pageTitle = locale === "ja" ? "VTDD セットアップウィザード" : "VTDD Setup Wizard";
  const copiedText = locale === "ja" ? "コピーしました。" : "Copied.";
  const manualCopyText =
    locale === "ja" ? "全選択して手動でコピーしてください。" : "Select all and copy manually.";
  const body = result.ok
    ? renderSuccessContent(
        result,
        answers,
        url,
        locale,
        cloudflareSetupCheck,
        githubAppSetupCheck,
        githubAppBootstrap
      )
    : renderFailureContent(
        result,
        answers,
        url,
        locale,
        cloudflareSetupCheck,
        githubAppSetupCheck,
        githubAppBootstrap
      );

  return renderHtmlDocument(body, {
    pageTitle,
    copiedText,
    manualCopyText
  });
}

function renderHtmlDocument(body, ui = {}) {
  const pageTitle = normalizeText(ui.pageTitle) || "VTDD Setup Wizard";
  const copiedText = normalizeText(ui.copiedText) || "Copied.";
  const manualCopyText =
    normalizeText(ui.manualCopyText) || "Select all and copy manually.";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        padding: 20px;
        background: #f4f6fb;
        color: #152033;
      }
      main {
        max-width: 860px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 14px;
        padding: 20px;
        box-shadow: 0 6px 24px rgba(14, 30, 52, 0.12);
      }
      h1 {
        font-size: 24px;
        margin: 0 0 12px;
      }
      h2 {
        font-size: 18px;
        margin: 18px 0 10px;
      }
      .section-header {
        margin-top: 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      p {
        margin: 8px 0;
        line-height: 1.5;
      }
      ul {
        margin: 10px 0;
        padding-left: 18px;
      }
      li {
        margin: 4px 0;
      }
      .meta {
        font-size: 14px;
        color: #4b5a73;
      }
      .block {
        background: #f8fbff;
        border: 1px solid #d8e6ff;
        border-radius: 10px;
        padding: 12px;
      }
      textarea {
        width: 100%;
        min-height: 180px;
        border-radius: 8px;
        border: 1px solid #c4d7f7;
        padding: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
      }
      .copy-button {
        border: 1px solid #8eb0f8;
        background: #edf4ff;
        color: #1e4ca6;
        font-size: 12px;
        font-weight: 600;
        border-radius: 8px;
        padding: 6px 10px;
      }
      .copy-hint {
        font-size: 12px;
        color: #4b5a73;
      }
      code {
        background: #eef3ff;
        padding: 2px 5px;
        border-radius: 5px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(pageTitle)}</h1>
      ${body}
    </main>
    <script>
      function setCopyState(button, message) {
        const targetId = button.getAttribute("data-copy-target");
        const status = document.querySelector('[data-copy-status="' + targetId + '"]');
        if (status) {
          status.textContent = message;
        }
      }

      async function copyFromTextarea(button) {
        const targetId = button.getAttribute("data-copy-target");
        const textarea = document.getElementById(targetId);
        if (!textarea) {
          return;
        }

        const value = textarea.value || textarea.textContent || "";
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
          } else {
            textarea.focus();
            textarea.select();
            document.execCommand("copy");
          }
          setCopyState(button, ${JSON.stringify(copiedText)});
        } catch {
          textarea.focus();
          textarea.select();
          setCopyState(button, ${JSON.stringify(manualCopyText)});
        }
      }

      document.querySelectorAll("[data-copy-target]").forEach((button) => {
        button.addEventListener("click", () => {
          copyFromTextarea(button);
        });
      });
    </script>
  </body>
</html>`;
}

function renderSuccessContent(
  result,
  answers,
  url,
  locale = "en",
  cloudflareSetupCheck,
  githubAppSetupCheck,
  githubAppBootstrap
) {
  const onboarding = result.onboarding ?? {};
  const customGpt = onboarding.customGpt ?? {};
  const deployAuthority = onboarding.deployAuthority ?? {};
  const productionDeploy = onboarding.productionDeploy ?? {};
  const machineAuth = onboarding.machineAuth ?? {};
  const repositoryResolution = onboarding.repositoryResolution ?? {};
  const memorySafety = onboarding.memorySafety ?? {};
  const roleSeparation = onboarding.roleSeparation ?? {};
  const surfaceIndependence = onboarding.surfaceIndependence ?? {};
  const butlerReviewProtocol = onboarding.butlerReviewProtocol ?? {};
  const retrievalContract = onboarding.retrievalContract ?? {};
  const policyEngine = onboarding.policyEngine ?? {};
  const guardedAbsence = onboarding.guardedAbsence ?? {};
  const reviewer = onboarding.reviewer ?? {};
  const repoList = answers.repositories.map((item) => escapeHtml(item.canonicalRepo));
  const steps = Array.isArray(onboarding.steps) ? onboarding.steps : [];
  const actionSchemaJson = customGpt.actionSchemaJson ?? "";
  const actionSchemaImportUrl = customGpt.actionSchemaImportUrl ?? "";
  const constructionText = customGpt.constructionText ?? "";
  const introText =
    locale === "ja"
      ? "iPhone の Safari で開き、この下の内容を Custom GPT 設定へコピーしてください。"
      : "Open this URL on iPhone Safari, then copy the blocks below into Custom GPT settings.";
  const jsonLabel = locale === "ja" ? "JSON 出力" : "JSON output";
  const repositoriesTitle = locale === "ja" ? "リポジトリ" : "Repositories";
  const checklistTitle = locale === "ja" ? "チェックリスト" : "Checklist";
  const constructionTitle =
    locale === "ja" ? "Custom GPT Instructions" : "Custom GPT Construction";
  const copyConstructionLabel =
    locale === "ja" ? "構成テキストをコピー" : "Copy Construction";
  const copySchemaLabel = locale === "ja" ? "スキーマをコピー" : "Copy Schema";
  const copyImportLabel =
    locale === "ja" ? "Import URL をコピー" : "Copy Import URL";
  const constructionHint =
    locale === "ja"
      ? "モバイルで選択しづらい場合はコピーボタンを使ってください。Instructions 全体をこの内容で置き換えます。"
      : "Tap copy button if text selection is difficult on mobile. Replace the full Instructions field with this text.";
  const importHint =
    locale === "ja"
      ? "この URL を Custom GPT Action のスキーマ Import に貼り付けます。"
      : "Paste this URL into Custom GPT Action schema import.";
  const schemaHint =
    locale === "ja"
      ? "OpenAPI JSON 全文をコピーします。"
      : "Tap copy button to copy full OpenAPI JSON.";
  const importHelp =
    locale === "ja"
      ? "iPhone で全文貼り付けが大変な場合は、下の URL から Import を使ってください。"
      : "If pasting full schema is hard on iPhone, use Import from URL with the link below.";
  const operatorManagedNote =
    locale === "ja"
      ? "GitHub App の allowlist された 3 項目だけがこの narrow bootstrap form で扱われます。Cloudflare 側の bootstrap credential は Worker runtime で operator-managed のまま保持してください。"
      : "Only the allowlisted GitHub App trio is handled through the narrow bootstrap form. Keep Cloudflare bootstrap credentials operator-managed on Worker runtime.";
  const checklistSteps =
    locale === "ja"
      ? [
          "Instructions は「構成テキストをコピー」で入れる",
          "Action は「Import URL」を使って設定する",
          "Action auth は Bearer を使う",
          "GitHub App と Cloudflare の状態を下で確認する"
        ]
      : steps;
  const detailedContracts = [
    renderDeployAuthorityRecommendation(deployAuthority),
    renderProductionDeployContract(productionDeploy),
    renderMachineAuthContract(machineAuth),
    renderRepositoryResolutionContract(repositoryResolution),
    renderMemorySafetyContract(memorySafety),
    renderRoleSeparationContract(roleSeparation),
    renderSurfaceIndependenceContract(surfaceIndependence),
    renderButlerReviewProtocolContract(butlerReviewProtocol),
    renderRetrievalContract(retrievalContract),
    renderPolicyEngineContract(policyEngine),
    renderGuardedAbsenceContract(guardedAbsence),
    renderReviewerContract(reviewer)
  ].join("");
  const detailedContractsSection =
    locale === "ja"
      ? `
        <details class="block" style="margin-top: 18px;">
          <summary><strong>詳細契約を開く</strong></summary>
          <div style="margin-top: 12px;">
            ${detailedContracts}
          </div>
        </details>
      `
      : detailedContracts;

  return `
    <p class="meta">${escapeHtml(introText)}</p>
    <p class="meta">${escapeHtml(jsonLabel)}: <code>${escapeHtml(`${url.origin}/setup/wizard?format=json`)}</code></p>
    <h2>${escapeHtml(repositoriesTitle)}</h2>
    <div class="block">
      <ul>${repoList.map((repo) => `<li>${repo}</li>`).join("")}</ul>
    </div>
    <h2>${escapeHtml(checklistTitle)}</h2>
    <div class="block">
      <ul>${checklistSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>
    </div>
    ${detailedContractsSection}
    <div class="section-header">
      <h2>${escapeHtml(constructionTitle)}</h2>
      <button class="copy-button" type="button" data-copy-target="constructionText">${escapeHtml(copyConstructionLabel)}</button>
    </div>
    <textarea id="constructionText" readonly>${escapeHtml(constructionText)}</textarea>
    <p class="copy-hint" data-copy-status="constructionText">${escapeHtml(constructionHint)}</p>
    <div class="section-header">
      <h2>Custom GPT Action Schema (OpenAPI)</h2>
      <button class="copy-button" type="button" data-copy-target="actionSchemaJson">${escapeHtml(copySchemaLabel)}</button>
    </div>
    <p class="meta">${escapeHtml(importHelp)}</p>
    <div class="section-header">
      <h3>Schema Import URL</h3>
      <button class="copy-button" type="button" data-copy-target="actionSchemaImportUrl">${escapeHtml(copyImportLabel)}</button>
    </div>
    <textarea id="actionSchemaImportUrl" readonly>${escapeHtml(actionSchemaImportUrl)}</textarea>
    <p class="copy-hint" data-copy-status="actionSchemaImportUrl">${escapeHtml(importHint)}</p>
      <textarea id="actionSchemaJson" readonly>${escapeHtml(actionSchemaJson)}</textarea>
      <p class="copy-hint" data-copy-status="actionSchemaJson">${escapeHtml(schemaHint)}</p>
      ${renderGitHubAppSetupCheck(githubAppSetupCheck, locale)}
      ${renderGitHubAppBootstrap(githubAppBootstrap, url, locale)}
      ${renderCloudflareSetupCheck(cloudflareSetupCheck, locale)}
      <p class="meta">${escapeHtml(operatorManagedNote)}</p>
    `;
}

function renderDeployAuthorityRecommendation(recommendation) {
  const selectedPath = normalizeText(recommendation?.selectedPath);
  if (!selectedPath) {
    return "";
  }

  const fallbackPath = normalizeText(recommendation?.fallbackPath) || "none";
  const rationale = normalizeText(recommendation?.rationale) || "No rationale provided.";
  const invariants = Array.isArray(recommendation?.invariants) ? recommendation.invariants : [];
  const relationshipToIssue37 = normalizeText(recommendation?.relationshipToIssue37) || "unknown";
  const availability = recommendation?.protectionAvailability ?? {};
  const repositoryVisibility = normalizeText(availability.repositoryVisibility) || "unknown";
  const branchProtectionApiStatus =
    normalizeText(availability.branchProtectionApiStatus) || "unknown";
  const rulesetsApiStatus = normalizeText(availability.rulesetsApiStatus) || "unknown";
  const prefersGitHubHardening =
    availability.prefersGitHubHardening === true ? "true" : "false";

  return `
    <h2>Deploy Authority Recommendation</h2>
    <div class="block">
      <p><strong>Selected path:</strong> <code>${escapeHtml(selectedPath)}</code></p>
      <p><strong>Fallback path:</strong> <code>${escapeHtml(fallbackPath)}</code></p>
      <p>${escapeHtml(rationale)}</p>
      <p><strong>Relationship to #37:</strong> <code>${escapeHtml(relationshipToIssue37)}</code></p>
      <p><strong>Detection inputs</strong></p>
      <ul>
        <li><code>repositoryVisibility=${escapeHtml(repositoryVisibility)}</code></li>
        <li><code>branchProtectionApiStatus=${escapeHtml(branchProtectionApiStatus)}</code></li>
        <li><code>rulesetsApiStatus=${escapeHtml(rulesetsApiStatus)}</code></li>
        <li><code>prefersGitHubHardening=${escapeHtml(prefersGitHubHardening)}</code></li>
      </ul>
      ${
        invariants.length > 0
          ? `<p><strong>Invariants</strong></p><ul>${invariants
              .map((item) => `<li><code>${escapeHtml(normalizeText(item))}</code></li>`)
              .join("")}</ul>`
          : ""
      }
    </div>
  `;
}

function renderProductionDeployContract(contract) {
  const workflow = normalizeText(contract?.workflow);
  const environment = normalizeText(contract?.environment);
  const requiredSecrets = Array.isArray(contract?.requiredSecrets) ? contract.requiredSecrets : [];
  const requiredInputs = Array.isArray(contract?.requiredInputs) ? contract.requiredInputs : [];
  const reminder = normalizeText(contract?.reminder);

  if (!workflow || !environment) {
    return "";
  }

  return `
    <h2>Production Deploy Contract</h2>
    <div class="block">
      <p><strong>Workflow:</strong> <code>${escapeHtml(workflow)}</code></p>
      <p><strong>Environment:</strong> <code>${escapeHtml(environment)}</code></p>
      <p><strong>Required secrets:</strong> ${requiredSecrets.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Required inputs:</strong> ${requiredInputs.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Reminder:</strong> ${escapeHtml(reminder || "Production deploy remains human-gated.")}</p>
    </div>
  `;
}

function renderMachineAuthContract(contract) {
  const recommendedMode = normalizeText(contract?.recommendedMode);
  const bearerSecretName = normalizeText(contract?.bearerSecretName);
  const actionAuthType = normalizeText(contract?.actionAuthType);
  const fallbackMode = normalizeText(contract?.fallbackMode);
  const fallbackHeaderNames = Array.isArray(contract?.fallbackHeaderNames)
    ? contract.fallbackHeaderNames
    : [];
  const fallbackSecretNames = Array.isArray(contract?.fallbackSecretNames)
    ? contract.fallbackSecretNames
    : [];
  const reminder = normalizeText(contract?.reminder);

  if (!recommendedMode || !bearerSecretName || !actionAuthType) {
    return "";
  }

  return `
    <h2>Machine Auth Contract</h2>
    <div class="block">
      <p><strong>Recommended mode:</strong> <code>${escapeHtml(recommendedMode)}</code></p>
      <p><strong>Worker secret:</strong> <code>${escapeHtml(bearerSecretName)}</code></p>
      <p><strong>Custom GPT Action auth:</strong> <code>${escapeHtml(actionAuthType)}</code></p>
      <p><strong>Fallback mode:</strong> <code>${escapeHtml(fallbackMode || "none")}</code></p>
      <p><strong>Fallback headers:</strong> ${fallbackHeaderNames.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Fallback secrets:</strong> ${fallbackSecretNames.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Reminder:</strong> ${escapeHtml(reminder || "Do not paste secret values into setup surfaces.")}</p>
    </div>
  `;
}

function renderRepositoryResolutionContract(contract) {
  const aliasResolutionMode = normalizeText(contract?.aliasResolutionMode);
  const executionRule = normalizeText(contract?.executionRule);
  const confirmationRule = normalizeText(contract?.confirmationRule);
  const defaultRepositoryPolicy = normalizeText(contract?.defaultRepositoryPolicy);
  const reminder = normalizeText(contract?.reminder);

  if (!aliasResolutionMode || !executionRule || !confirmationRule || !defaultRepositoryPolicy) {
    return "";
  }

  return `
    <h2>Repository Resolution Contract</h2>
    <div class="block">
      <p><strong>Read path:</strong> <code>${escapeHtml(aliasResolutionMode)}</code></p>
      <p><strong>Execution rule:</strong> <code>${escapeHtml(executionRule)}</code></p>
      <p><strong>Confirmation rule:</strong> <code>${escapeHtml(confirmationRule)}</code></p>
      <p><strong>Default repository:</strong> <code>${escapeHtml(defaultRepositoryPolicy)}</code></p>
      <p><strong>Reminder:</strong> ${escapeHtml(reminder || "Resolve repo intent before execution.")}</p>
    </div>
  `;
}

function renderMemorySafetyContract(contract) {
  const allowedRecordTypes = Array.isArray(contract?.allowedRecordTypes)
    ? contract.allowedRecordTypes
    : [];
  const forbiddenContent = Array.isArray(contract?.forbiddenContent) ? contract.forbiddenContent : [];
  const gitSource = normalizeText(contract?.sourceOfTruth?.git);
  const dbSource = normalizeText(contract?.sourceOfTruth?.db);
  const reminder = normalizeText(contract?.reminder);

  if (allowedRecordTypes.length === 0 || forbiddenContent.length === 0 || !gitSource || !dbSource) {
    return "";
  }

  return `
    <h2>Memory Safety Contract</h2>
    <div class="block">
      <p><strong>Allowed memory records:</strong> ${allowedRecordTypes.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Do not store:</strong> ${forbiddenContent.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Git source of truth:</strong> <code>${escapeHtml(gitSource)}</code></p>
      <p><strong>DB source of truth:</strong> <code>${escapeHtml(dbSource)}</code></p>
      <p><strong>Reminder:</strong> ${escapeHtml(reminder || "Keep memory compact and safe.")}</p>
    </div>
  `;
}

function renderRoleSeparationContract(contract) {
  const butlerInputs = Array.isArray(contract?.butler?.inputs) ? contract.butler.inputs : [];
  const butlerOutputs = Array.isArray(contract?.butler?.outputs) ? contract.butler.outputs : [];
  const executorInputs = Array.isArray(contract?.executor?.inputs) ? contract.executor.inputs : [];
  const executorOutputs = Array.isArray(contract?.executor?.outputs) ? contract.executor.outputs : [];
  const reviewerInputs = Array.isArray(contract?.reviewer?.inputs) ? contract.reviewer.inputs : [];
  const reviewerOutputs = Array.isArray(contract?.reviewer?.outputs) ? contract.reviewer.outputs : [];
  const authorityLimits = Array.isArray(contract?.reviewer?.authorityLimits)
    ? contract.reviewer.authorityLimits
    : [];
  const handoffOrder = Array.isArray(contract?.handoffOrder) ? contract.handoffOrder : [];
  const reminder = normalizeText(contract?.reminder);

  if (
    butlerInputs.length === 0 ||
    executorInputs.length === 0 ||
    reviewerInputs.length === 0 ||
    handoffOrder.length === 0
  ) {
    return "";
  }

  return `
    <h2>Role Separation Contract</h2>
    <div class="block">
      <p><strong>Butler input:</strong> ${butlerInputs.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Butler output:</strong> ${butlerOutputs.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Executor input:</strong> ${executorInputs.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Executor output:</strong> ${executorOutputs.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Reviewer input:</strong> ${reviewerInputs.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Reviewer output:</strong> ${reviewerOutputs.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Reviewer authority limits:</strong> ${authorityLimits.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Handoff order:</strong> ${handoffOrder.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Reminder:</strong> ${escapeHtml(reminder || "Role boundaries stay distinct.")}</p>
    </div>
  `;
}

function renderSurfaceIndependenceContract(contract) {
  const role = normalizeText(contract?.role);
  const contractLayer = normalizeText(contract?.contract);
  const runtime = normalizeText(contract?.runtime);
  const surfaces = Array.isArray(contract?.surfaces) ? contract.surfaces : [];
  const initialSurfacePolicy = normalizeText(contract?.initialSurfacePolicy);
  const replacementInvariants = Array.isArray(contract?.replacementInvariants)
    ? contract.replacementInvariants
    : [];
  const reminder = normalizeText(contract?.reminder);

  if (
    !role ||
    !contractLayer ||
    !runtime ||
    surfaces.length === 0 ||
    !initialSurfacePolicy ||
    replacementInvariants.length === 0
  ) {
    return "";
  }

  return `
    <h2>Surface Independence Contract</h2>
    <div class="block">
      <p><strong>Role layer:</strong> <code>${escapeHtml(role)}</code></p>
      <p><strong>Contract layer:</strong> <code>${escapeHtml(contractLayer)}</code></p>
      <p><strong>Runtime layer:</strong> <code>${escapeHtml(runtime)}</code></p>
      <p><strong>Allowed surfaces:</strong> ${surfaces.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Initial surface policy:</strong> <code>${escapeHtml(initialSurfacePolicy)}</code></p>
      <p><strong>Replacement invariants:</strong> ${replacementInvariants.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Reminder:</strong> ${escapeHtml(reminder || "Surface replacement must not redefine Butler.")}</p>
    </div>
  `;
}

function renderButlerReviewProtocolContract(contract) {
  const judgmentOrder = Array.isArray(contract?.judgmentOrder) ? contract.judgmentOrder : [];
  const explorationPhase = Array.isArray(contract?.explorationPhase) ? contract.explorationPhase : [];
  const executionPhase = Array.isArray(contract?.executionPhase) ? contract.executionPhase : [];
  const mandatoryRules = Array.isArray(contract?.mandatoryRules) ? contract.mandatoryRules : [];
  const humanPosition = normalizeText(contract?.humanPosition);
  const reminder = normalizeText(contract?.reminder);

  if (
    judgmentOrder.length === 0 ||
    explorationPhase.length === 0 ||
    executionPhase.length === 0 ||
    mandatoryRules.length === 0 ||
    !humanPosition
  ) {
    return "";
  }

  return `
    <h2>Butler Review Protocol</h2>
    <div class="block">
      <p><strong>Judgment order:</strong> ${judgmentOrder.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Exploration phase:</strong> ${explorationPhase.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Execution phase:</strong> ${executionPhase.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Mandatory rules:</strong> ${mandatoryRules.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Human position:</strong> ${escapeHtml(humanPosition)}</p>
      <p><strong>Reminder:</strong> ${escapeHtml(reminder || "Butler remains constitution-first.")}</p>
    </div>
  `;
}

function renderRetrievalContract(contract) {
  const sources = Array.isArray(contract?.sources) ? contract.sources : [];
  const recallSourceOrder = Array.isArray(contract?.recallSourceOrder)
    ? contract.recallSourceOrder
    : [];
  const executionOrder = Array.isArray(contract?.executionOrder) ? contract.executionOrder : [];
  const useCases = Array.isArray(contract?.useCases) ? contract.useCases : [];
  const providerModel = normalizeText(contract?.providerModel);
  const reminder = normalizeText(contract?.reminder);

  if (
    sources.length === 0 ||
    recallSourceOrder.length === 0 ||
    executionOrder.length === 0 ||
    useCases.length === 0 ||
    !providerModel
  ) {
    return "";
  }

  return `
    <h2>Retrieval Contract</h2>
    <div class="block">
      <p><strong>Sources:</strong> ${sources.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Recall source order:</strong> ${recallSourceOrder.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Execution order:</strong> ${executionOrder.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Use cases:</strong> ${useCases.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Provider model:</strong> <code>${escapeHtml(providerModel)}</code></p>
      <p><strong>Reminder:</strong> ${escapeHtml(reminder || "Retrieval contract stays provider-agnostic.")}</p>
    </div>
  `;
}

function renderPolicyEngineContract(contract) {
  const mode = normalizeText(contract?.mode);
  const executionPreconditions = Array.isArray(contract?.executionPreconditions)
    ? contract.executionPreconditions
    : [];
  const decisionOrder = Array.isArray(contract?.decisionOrder) ? contract.decisionOrder : [];
  const reminder = normalizeText(contract?.reminder);

  if (!mode || executionPreconditions.length === 0 || decisionOrder.length === 0) {
    return "";
  }

  return `
    <h2>Policy Engine Contract</h2>
    <div class="block">
      <p><strong>Mode:</strong> <code>${escapeHtml(mode)}</code></p>
      <p><strong>Execution preconditions:</strong> ${executionPreconditions.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Decision order:</strong> ${decisionOrder.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Reminder:</strong> ${escapeHtml(reminder || "Policy remains deterministic.")}</p>
    </div>
  `;
}

function renderGuardedAbsenceContract(contract) {
  const modeName = normalizeText(contract?.modeName);
  const allowedActions = Array.isArray(contract?.allowedActions) ? contract.allowedActions : [];
  const forbiddenActions = Array.isArray(contract?.forbiddenActions) ? contract.forbiddenActions : [];
  const mandatoryStops = Array.isArray(contract?.mandatoryStops) ? contract.mandatoryStops : [];
  const reminder = normalizeText(contract?.reminder);

  if (!modeName) {
    return "";
  }

  return `
    <h2>Guarded Absence Contract</h2>
    <div class="block">
      <p><strong>Mode:</strong> <code>${escapeHtml(modeName)}</code></p>
      <p><strong>Allowed actions:</strong> ${allowedActions.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Forbidden actions:</strong> ${forbiddenActions.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Mandatory stops:</strong> ${mandatoryStops.map((item) => escapeHtml(item)).join(", ")}</p>
      <p><strong>Reminder:</strong> ${escapeHtml(reminder || "Guarded absence remains traceable.")}</p>
    </div>
  `;
}

function renderReviewerContract(contract) {
  const initialReviewer = normalizeText(contract?.initialReviewer);
  const fallbackReviewer = normalizeText(contract?.fallbackReviewer);
  const fallbackCondition = normalizeText(contract?.fallbackCondition);
  const inputContract = Array.isArray(contract?.inputContract) ? contract.inputContract : [];
  const outputContract = Array.isArray(contract?.outputContract) ? contract.outputContract : [];
  const authorityLimits = Array.isArray(contract?.authorityLimits) ? contract.authorityLimits : [];
  const reminder = normalizeText(contract?.reminder);

  if (!initialReviewer) {
    return "";
  }

  return `
    <h2>Reviewer Contract</h2>
    <div class="block">
      <p><strong>Initial reviewer:</strong> <code>${escapeHtml(initialReviewer)}</code></p>
      <p><strong>Fallback reviewer:</strong> <code>${escapeHtml(fallbackReviewer || "none")}</code></p>
      <p><strong>Fallback condition:</strong> <code>${escapeHtml(fallbackCondition || "none")}</code></p>
      <p><strong>Reviewer input:</strong> ${inputContract.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Reviewer output:</strong> ${outputContract.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Authority limits:</strong> ${authorityLimits.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>
      <p><strong>Reminder:</strong> ${escapeHtml(reminder || "Reviewer remains advisory to human judgment.")}</p>
    </div>
  `;
}

function renderFailureContent(
  result,
  answers,
  url,
  locale = "en",
  cloudflareSetupCheck,
  githubAppSetupCheck,
  githubAppBootstrap
) {
  const issues = Array.isArray(result.blockingIssues) ? result.blockingIssues : [];
  const issueItems = issues.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const guidance = buildSetupWizardGuidance({ result, url });
  const guidanceItems = guidance.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return `
    <p class="meta">${escapeHtml(locale === "ja" ? "ウィザード検証に失敗しました。" : "Wizard validation failed.")}</p>
    <h2>${escapeHtml(locale === "ja" ? "ブロッキング項目" : "Blocking Issues")}</h2>
    <div class="block">
      <ul>${issueItems || "<li>unknown validation error</li>"}</ul>
    </div>
    ${
      guidanceItems
        ? `<h2>${escapeHtml(locale === "ja" ? "ガイダンス" : "Guidance")}</h2><div class="block"><ul>${guidanceItems}</ul></div>`
        : ""
      }
      ${renderGitHubAppSetupCheck(githubAppSetupCheck, locale)}
      ${renderGitHubAppBootstrap(githubAppBootstrap, url, locale)}
      ${renderCloudflareSetupCheck(cloudflareSetupCheck, locale)}
      <h2>${escapeHtml(locale === "ja" ? "デバッグ（安全な回答のみ）" : "Debug (safe answers only)")}</h2>
      <textarea readonly>${escapeHtml(JSON.stringify(answers, null, 2))}</textarea>
      <p class="meta">Tip: use <code>${escapeHtml(`${url.origin}/setup/wizard?format=json`)}</code> to inspect machine-readable output.</p>
    `;
}

function detectSetupWizardLocale({ request, url }) {
  const explicit = normalize(url.searchParams.get("lang"));
  if (explicit === "ja" || explicit === "en") {
    return explicit;
  }

  const acceptLanguage = normalizeText(request?.headers?.get("accept-language")).toLowerCase();
  if (
    acceptLanguage.startsWith("ja") ||
    acceptLanguage.includes(",ja") ||
    acceptLanguage.includes(" ja")
  ) {
    return "ja";
  }

  return "en";
}

function buildSetupWizardGuidance({ result, url }) {
  const issues = Array.isArray(result?.blockingIssues) ? result.blockingIssues : [];
  const guidance = [];
  if (issues.includes("at least one repository mapping is required")) {
    const sampleRepo = "sample-org/sample-repo";
    const encoded = encodeURIComponent(sampleRepo);
    guidance.push(
      `Add at least one repo query parameter, for example: ${url.origin}/setup/wizard?repo=${encoded}`
    );
    guidance.push("Repeat repo parameter when multiple repositories are needed.");
  }
  return guidance;
}

function renderCloudflareSetupCheck(check, locale = "en") {
  const state = normalizeText(check?.state) || "not_configured";
  const summary = normalizeText(check?.summary) || "Cloudflare setup check is not configured.";
  const guidance = Array.isArray(check?.guidance) ? check.guidance : [];
  const links = Array.isArray(check?.links) ? check.links : [];
  const evidence = check?.evidence ?? null;
  const checkedAt = normalizeText(check?.checkedAt);
  const listItem = (text) => `<li>${escapeHtml(text)}</li>`;

  const evidenceItems = [];
  if (normalizeText(evidence?.stage)) {
    evidenceItems.push(`stage: ${normalizeText(evidence.stage)}`);
  }
  if (Number.isFinite(Number(evidence?.httpStatus))) {
    evidenceItems.push(`httpStatus: ${Number(evidence.httpStatus)}`);
  }
  const errorCodes = Array.isArray(evidence?.errorCodes)
    ? evidence.errorCodes.filter((item) => Number.isFinite(Number(item)))
    : [];
  if (errorCodes.length > 0) {
    evidenceItems.push(`errorCodes: ${errorCodes.join(", ")}`);
  }

  return `
    <h2>${escapeHtml(locale === "ja" ? "Cloudflare 設定チェック" : "Cloudflare Setup Check")}</h2>
    <div class="block">
      <p><strong>state:</strong> <code>${escapeHtml(state)}</code></p>
      <p>${escapeHtml(summary)}</p>
      ${
        guidance.length > 0
          ? `<ul>${guidance.map((item) => listItem(item)).join("")}</ul>`
          : ""
      }
      ${
        evidenceItems.length > 0
          ? `<p class="meta">${escapeHtml(evidenceItems.join(" / "))}</p>`
          : ""
      }
      ${
        links.length > 0
          ? `<ul>${links
              .map(
                (item) =>
                  `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></li>`
              )
              .join("")}</ul>`
          : ""
      }
      ${
        checkedAt
          ? `<p class="meta">checkedAt: <code>${escapeHtml(checkedAt)}</code></p>`
          : ""
      }
    </div>
  `;
}

function renderGitHubAppSetupCheck(check, locale = "en") {
  const state = normalizeText(check?.state) || "not_configured";
  const summary = normalizeText(check?.summary) || "GitHub App setup check is not configured.";
  const guidance = Array.isArray(check?.guidance) ? check.guidance : [];
  const links = Array.isArray(check?.links) ? check.links : [];
  const evidence = check?.evidence ?? null;
  const checkedAt = normalizeText(check?.checkedAt);
  const listItem = (text) => `<li>${escapeHtml(text)}</li>`;

  const evidenceItems = [];
  if (normalizeText(evidence?.stage)) {
    evidenceItems.push(`stage: ${normalizeText(evidence.stage)}`);
  }
  if (normalizeText(evidence?.source)) {
    evidenceItems.push(`source: ${normalizeText(evidence.source)}`);
  }
  if (Number.isFinite(Number(evidence?.repositoryCount))) {
    evidenceItems.push(`repositoryCount: ${Number(evidence.repositoryCount)}`);
  }

  return `
    <h2>${escapeHtml(locale === "ja" ? "GitHub App 設定チェック" : "GitHub App Setup Check")}</h2>
    <div class="block">
      <p><strong>state:</strong> <code>${escapeHtml(state)}</code></p>
      <p>${escapeHtml(summary)}</p>
      ${
        guidance.length > 0
          ? `<ul>${guidance.map((item) => listItem(item)).join("")}</ul>`
          : ""
      }
      ${
        links.length > 0
          ? `<ul>${links
              .map(
                (item) =>
                  `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></li>`
              )
              .join("")}</ul>`
          : ""
      }
      ${
        evidenceItems.length > 0
          ? `<p class="meta">${escapeHtml(evidenceItems.join(" / "))}</p>`
          : ""
      }
      ${
        checkedAt
          ? `<p class="meta">checkedAt: <code>${escapeHtml(checkedAt)}</code></p>`
          : ""
      }
    </div>
  `;
}

function renderGitHubAppBootstrap(bootstrap, url, locale = "en") {
  const state = normalizeText(bootstrap?.state) || "missing_prerequisites";
  const summary =
    normalizeText(bootstrap?.summary) || "GitHub App bootstrap write path is not available.";
  const allowlistedSecrets = Array.isArray(bootstrap?.allowlistedSecrets)
    ? bootstrap.allowlistedSecrets
    : [];
  const missingPrerequisites = Array.isArray(bootstrap?.missingPrerequisites)
    ? bootstrap.missingPrerequisites
    : [];
  const guidance = Array.isArray(bootstrap?.guidance) ? bootstrap.guidance : [];
  const actionPath =
    normalizeText(bootstrap?.actionPath) || SETUP_WIZARD_GITHUB_APP_BOOTSTRAP_PATH;
  const scriptName = normalizeText(bootstrap?.scriptName);
  const returnTo = `${url.pathname}${url.search || "?githubAppCheck=on"}`;
  const manifestLaunch = bootstrap?.manifestLaunch ?? null;

  return `
    <h2>${escapeHtml(locale === "ja" ? "GitHub App Runtime Bootstrap" : "GitHub App Runtime Bootstrap")}</h2>
    <div class="block">
      <p><strong>state:</strong> <code>${escapeHtml(state)}</code></p>
      <p>${escapeHtml(summary)}</p>
      ${
        scriptName
          ? `<p><strong>Worker script:</strong> <code>${escapeHtml(scriptName)}</code></p>`
          : ""
      }
      ${
        allowlistedSecrets.length > 0
          ? `<p><strong>Allowlisted secrets:</strong> ${allowlistedSecrets
              .map((item) => `<code>${escapeHtml(item)}</code>`)
              .join(", ")}</p>`
          : ""
      }
      ${
        missingPrerequisites.length > 0
          ? `<p><strong>Missing prerequisites:</strong> ${missingPrerequisites
              .map((item) => `<code>${escapeHtml(item)}</code>`)
              .join(", ")}</p>`
          : ""
      }
      ${
        guidance.length > 0
          ? `<ul>${guidance.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : ""
      }
      ${
        state === "available" && manifestLaunch
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "GitHub App を自動作成" : "Create GitHub App automatically")}</strong></p>
              <p class="meta">${escapeHtml(locale === "ja" ? "GitHub の manifest flow を開き、App ID と private key をこの Worker bootstrap に戻します。" : "This opens GitHub's manifest flow and returns here with App ID and private key ready for Worker bootstrap.")}</p>
              <form method="post" action="${escapeHtml(manifestLaunch.action)}" target="_blank" rel="noopener noreferrer">
                <input type="hidden" name="manifest" value="${escapeHtml(manifestLaunch.manifest)}" />
                <button type="submit" class="copy-button">${escapeHtml(locale === "ja" ? "GitHub App を自動作成" : "Create GitHub App Automatically")}</button>
              </form>
            </div>
          `
          : ""
      }
      ${
        state === "available"
          ? `
            <form method="post" action="${escapeHtml(actionPath)}">
              <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
              <label for="githubAppId"><strong>GitHub App ID</strong></label>
              <input id="githubAppId" name="GITHUB_APP_ID" type="text" inputmode="numeric" autocomplete="off" />
              <label for="githubAppInstallationId"><strong>GitHub App Installation ID</strong></label>
              <input id="githubAppInstallationId" name="GITHUB_APP_INSTALLATION_ID" type="text" inputmode="numeric" autocomplete="off" />
              <label for="githubAppPrivateKey"><strong>GitHub App Private Key</strong></label>
              <textarea id="githubAppPrivateKey" name="GITHUB_APP_PRIVATE_KEY" rows="8" autocomplete="off"></textarea>
              <p class="meta">Values are sent only to the narrow bootstrap endpoint and are never echoed back in the response.</p>
              <div style="margin-top: 12px;">
                <button type="submit" class="copy-button">Write GitHub App Runtime Secrets</button>
              </div>
            </form>
          `
          : ""
      }
    </div>
  `;
}

async function runCloudflareSetupCheck(url, env) {
  const runtimeEnv = env ?? {};
  const setupCheckEnabled = toBoolean(runtimeEnv[SETUP_WIZARD_CLOUDFLARE_CHECK_ENABLED_ENV]);
  if (!setupCheckEnabled) {
    return {
      state: "disabled",
      summary: "Cloudflare setup check is disabled by default.",
      guidance: [
        "Enable SETUP_WIZARD_CLOUDFLARE_CHECK_ENABLED=true in Worker runtime if you need automated diagnostics."
      ]
    };
  }

  const diagnosticsEnabled = normalize(url.searchParams.get("cloudflareCheck"));
  if (!isTruthySignal(diagnosticsEnabled)) {
    return {
      state: "disabled",
      summary:
        "Cloudflare setup check is enabled in runtime but not requested for this page view.",
      guidance: ["Add cloudflareCheck=on to setup wizard URL when you need Cloudflare diagnostics."]
    };
  }

  const apiToken = normalizeText(runtimeEnv.CLOUDFLARE_API_TOKEN);
  const accountId = normalizeText(runtimeEnv.CLOUDFLARE_ACCOUNT_ID);
  if (!apiToken || !accountId) {
    return {
      state: "not_configured",
      summary:
        "Cloudflare setup check skipped: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are not configured on Worker runtime.",
      guidance: [
        "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID as Worker environment secrets if you want automatic diagnostics in setup wizard.",
        "Do not paste Cloudflare credentials into chat, URL, or wizard form fields."
      ],
      links: [
        { title: "Cloudflare API token verify", url: CLOUDFLARE_SETUP_HELP_LINKS.tokenVerify },
        { title: "Cloudflare billing troubleshoot", url: CLOUDFLARE_SETUP_HELP_LINKS.billingTroubleshoot }
      ]
    };
  }

  const fetchImpl =
    typeof runtimeEnv.CF_API_FETCH === "function"
      ? runtimeEnv.CF_API_FETCH
      : typeof globalThis.fetch === "function"
        ? globalThis.fetch.bind(globalThis)
        : null;

  if (!fetchImpl) {
    return {
      state: "runtime_fetch_unavailable",
      summary: "Cloudflare setup check failed: fetch runtime is unavailable.",
      guidance: ["Run diagnostics in an environment where fetch is available."],
      links: [{ title: "Cloudflare API token verify", url: CLOUDFLARE_SETUP_HELP_LINKS.tokenVerify }]
    };
  }

  try {
    const tokenVerify = await callCloudflareApi(fetchImpl, apiToken, "https://api.cloudflare.com/client/v4/user/tokens/verify");
    if (!tokenVerify.success) {
      return classifyCloudflareSetupFailure({
        stage: "token_verify",
        response: tokenVerify
      });
    }

    const accessProbe = await callCloudflareApi(
      fetchImpl,
      apiToken,
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/access/apps?page=1&per_page=1`
    );
    if (!accessProbe.success) {
      return classifyCloudflareSetupFailure({
        stage: "access_apps_probe",
        response: accessProbe
      });
    }

    return {
      state: "ready",
      summary: "Cloudflare setup check passed: token/account can read Access applications.",
      guidance: [
        "Cloudflare Access application auto-setup can proceed.",
        "If you enable auto-create later, keep token scope minimal and tag generated resources as VTDD managed."
      ],
      links: [
        { title: "Cloudflare Access applications API", url: CLOUDFLARE_SETUP_HELP_LINKS.accessApps },
        { title: "Cloudflare API permissions", url: CLOUDFLARE_SETUP_HELP_LINKS.permissions }
      ],
      checkedAt: new Date().toISOString(),
      evidence: {
        stage: "access_apps_probe",
        httpStatus: accessProbe.httpStatus,
        errorCodes: [],
        errorMessages: []
      }
    };
  } catch (error) {
    return {
      state: "network_error",
      summary: "Cloudflare setup check failed due to network/runtime error.",
      guidance: [
        "Confirm Worker runtime can reach api.cloudflare.com and retry.",
        "If this persists, inspect Worker logs for runtime exceptions."
      ],
      links: [
        { title: "Cloudflare billing troubleshoot", url: CLOUDFLARE_SETUP_HELP_LINKS.billingTroubleshoot }
      ],
      checkedAt: new Date().toISOString(),
      evidence: {
        stage: "runtime_exception",
        httpStatus: null,
        errorCodes: []
      }
    };
  }
}

async function callCloudflareApi(fetchImpl, apiToken, endpoint) {
  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: {
      authorization: `Bearer ${apiToken}`,
      "content-type": "application/json"
    }
  });

  const payload = await readSafeJson(response);
  const errors = normalizeCloudflareErrors(payload?.errors);
  const success = response.ok && payload?.success === true;
  return {
    success,
    httpStatus: response.status,
    errors
  };
}

function classifyCloudflareSetupFailure({ stage, response }) {
  const errors = Array.isArray(response?.errors) ? response.errors : [];
  const httpStatus = Number(response?.httpStatus ?? 0);
  const errorCodes = errors
    .map((item) => Number(item.code))
    .filter((item) => Number.isFinite(item));
  const errorMessages = errors.map((item) => normalizeText(item.message)).filter(Boolean);
  const messageBlob = errorMessages.join(" ").toLowerCase();

  if (errorCodes.includes(7003) || messageBlob.includes("could not route to /client/v4/accounts")) {
    return {
      state: "invalid_account_identifier",
      summary: "Cloudflare setup check failed: account id or endpoint identifier looks invalid.",
      guidance: [
        "Verify CLOUDFLARE_ACCOUNT_ID from Cloudflare dashboard account details.",
        "If this happens in GitHub Actions deploy logs, re-check account id and target service/script name."
      ],
      links: [
        { title: "Cloudflare Access applications API", url: CLOUDFLARE_SETUP_HELP_LINKS.accessApps }
      ],
      checkedAt: new Date().toISOString(),
      evidence: { stage, httpStatus, errorCodes }
    };
  }

  if (httpStatus === 402 || CLOUDFLARE_BILLING_HINT_REGEX.test(messageBlob)) {
    return {
      state: "billing_action_required",
      summary:
        "Cloudflare setup check indicates billing/payment action may be required (for example card not registered or billing state unresolved).",
      guidance: [
        "Open Cloudflare Billing and confirm payment method is registered.",
        "Resolve outstanding balances or failed plan modifications, then retry setup wizard.",
        "After billing update, retry in a few minutes and re-open /setup/wizard."
      ],
      links: [
        { title: "Cloudflare billing troubleshoot", url: CLOUDFLARE_SETUP_HELP_LINKS.billingTroubleshoot },
        { title: "Cloudflare billing overview", url: CLOUDFLARE_SETUP_HELP_LINKS.billingOverview }
      ],
      checkedAt: new Date().toISOString(),
      evidence: { stage, httpStatus, errorCodes }
    };
  }

  if (
    httpStatus === 401 ||
    errorCodes.includes(10000) ||
    messageBlob.includes("authentication") ||
    messageBlob.includes("unauthorized")
  ) {
    return {
      state: "api_token_invalid",
      summary: "Cloudflare setup check failed: API token is invalid, expired, or disabled.",
      guidance: [
        "Re-issue Cloudflare API token and set it again in Worker environment secret.",
        "Ensure token is active and scoped to the same account as CLOUDFLARE_ACCOUNT_ID."
      ],
      links: [
        { title: "Cloudflare API token verify", url: CLOUDFLARE_SETUP_HELP_LINKS.tokenVerify }
      ],
      checkedAt: new Date().toISOString(),
      evidence: { stage, httpStatus, errorCodes }
    };
  }

  if (
    httpStatus === 403 ||
    messageBlob.includes("permission") ||
    messageBlob.includes("forbidden") ||
    messageBlob.includes("not entitled")
  ) {
    return {
      state: "insufficient_permission",
      summary: "Cloudflare setup check failed: token permission or entitlement is insufficient.",
      guidance: [
        "Grant Access app/policy scopes required for setup automation.",
        "Recommended minimum: Access: Apps and Policies Read (and Edit if creating resources)."
      ],
      links: [
        { title: "Cloudflare API permissions", url: CLOUDFLARE_SETUP_HELP_LINKS.permissions }
      ],
      checkedAt: new Date().toISOString(),
      evidence: { stage, httpStatus, errorCodes }
    };
  }

  return {
    state: "cloudflare_api_error",
    summary: "Cloudflare setup check failed with an unclassified API error.",
    guidance: [
      "Inspect evidence fields (error code/message) and Worker logs.",
      "If this repeats, verify token/account scopes and retry setup flow."
    ],
    links: [{ title: "Cloudflare Access applications API", url: CLOUDFLARE_SETUP_HELP_LINKS.accessApps }],
    checkedAt: new Date().toISOString(),
    evidence: { stage, httpStatus, errorCodes }
  };
}

async function runGitHubAppSetupCheck(url, env) {
  const runtimeEnv = env ?? {};
  const appId = normalizeText(runtimeEnv.GITHUB_APP_ID);
  const installationId = normalizeText(runtimeEnv.GITHUB_APP_INSTALLATION_ID);
  const privateKey = resolveGitHubAppPrivateKey(runtimeEnv);
  const configuredFields = [
    ["GITHUB_APP_ID", appId],
    ["GITHUB_APP_INSTALLATION_ID", installationId],
    ["GITHUB_APP_PRIVATE_KEY", privateKey]
  ];
  const missingFields = configuredFields.filter(([, value]) => !value).map(([name]) => name);
  const configuredCount = configuredFields.length - missingFields.length;
  const diagnosticsEnabled = isTruthySignal(normalize(url.searchParams.get("githubAppCheck")));

  if (configuredCount === 0) {
    return {
      state: "not_configured",
      summary:
        "GitHub App setup check: Worker runtime does not have GitHub App bootstrap secrets yet.",
      guidance: [
        "Create and install a GitHub App first.",
        "Then set GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, and GITHUB_APP_PRIVATE_KEY as Worker secrets.",
        "Do not paste App private key into chat, URL, or setup wizard answers."
      ],
      links: [
        {
          title: "GitHub Apps documentation",
          url: "https://docs.github.com/en/apps/creating-github-apps"
        }
      ]
    };
  }

  if (missingFields.length > 0) {
    return {
      state: "partially_configured",
      summary:
        "GitHub App setup check: some required Worker secrets are missing, so VTDD cannot mint installation tokens yet.",
      guidance: missingFields.map((field) => `Set ${field} on Worker runtime.`),
      evidence: {
        stage: "configuration_check",
        source: "worker_runtime"
      }
    };
  }

  if (!diagnosticsEnabled) {
    return {
      state: "configured",
      summary:
        "GitHub App bootstrap secrets are configured on Worker runtime. Add githubAppCheck=on to verify token mint and live repository access.",
      guidance: [
        "Open setup wizard with githubAppCheck=on when you want live GitHub App diagnostics.",
        "VTDD can mint short-lived installation tokens automatically after bootstrap."
      ],
      evidence: {
        stage: "configuration_check",
        source: "worker_runtime"
      }
    };
  }

  const live = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: { aliasRegistry: [] },
    env: runtimeEnv
  });

  if (live.source === "github_app_live") {
    return {
      state: "ready",
      summary:
        "GitHub App setup check passed: VTDD can mint an installation token and read the live repository index.",
      guidance: [
        "You can rely on live repository listing and repository switch detection.",
        "Keep App permissions minimal and expand only when a specific runtime path needs it."
      ],
      evidence: {
        stage: "live_probe",
        source: live.source,
        repositoryCount: Array.isArray(live.aliasRegistry) ? live.aliasRegistry.length : 0
      },
      checkedAt: new Date().toISOString()
    };
  }

  const warning = normalizeText((live.warnings ?? [])[0]);
  return {
    state: "probe_failed",
    summary: warning || "GitHub App setup check failed during live probe.",
    guidance: buildGitHubAppSetupGuidanceFromWarning(warning),
    evidence: {
      stage: "live_probe",
      source: live.source
    },
    checkedAt: new Date().toISOString()
  };
}

function buildGitHubAppBootstrapStatus({ url, env }) {
  const runtimeEnv = env ?? {};
  const cloudflareApiToken = normalizeText(runtimeEnv.CLOUDFLARE_API_TOKEN);
  const accountId = normalizeText(runtimeEnv.CLOUDFLARE_ACCOUNT_ID);
  const githubManifestConversionToken = normalizeText(
    runtimeEnv[GITHUB_MANIFEST_CONVERSION_TOKEN_ENV]
  );
  const scriptName = resolveCloudflareWorkerScriptName({ url, env: runtimeEnv });
  const authConfig = getSetupWizardAuthConfig(runtimeEnv);
  const missingPrerequisites = [];

  if (!authConfig.enabled) {
    missingPrerequisites.push("SETUP_WIZARD_PASSCODE");
  }
  if (!cloudflareApiToken) {
    missingPrerequisites.push("CLOUDFLARE_API_TOKEN");
  }
  if (!accountId) {
    missingPrerequisites.push("CLOUDFLARE_ACCOUNT_ID");
  }
  if (!githubManifestConversionToken) {
    missingPrerequisites.push(GITHUB_MANIFEST_CONVERSION_TOKEN_ENV);
  }
  if (!scriptName) {
    missingPrerequisites.push(CLOUDFLARE_WORKER_SCRIPT_NAME_ENV);
  }

  if (missingPrerequisites.length > 0) {
    return {
      state: "missing_prerequisites",
      summary:
        "GitHub App runtime bootstrap is unavailable until Cloudflare bootstrap prerequisites are configured on this Worker.",
      missingPrerequisites,
      allowlistedSecrets: [...GITHUB_APP_BOOTSTRAP_SECRET_ALLOWLIST],
      actionPath: SETUP_WIZARD_GITHUB_APP_BOOTSTRAP_PATH,
      guidance: [
        "This path is intentionally narrow: only the GitHub App runtime secret trio can be written.",
        "Configure Cloudflare bootstrap credentials and a service-owned GitHub manifest conversion token on Worker runtime first.",
        "The conversion token stays operator-managed on Worker runtime and is never collected through setup wizard."
      ]
    };
  }

  return {
    state: "available",
    summary:
      "Passcode-authenticated setup wizard can write the allowlisted GitHub App runtime secrets to this Worker.",
    missingPrerequisites: [],
    allowlistedSecrets: [...GITHUB_APP_BOOTSTRAP_SECRET_ALLOWLIST],
    actionPath: SETUP_WIZARD_GITHUB_APP_BOOTSTRAP_PATH,
    guidance: [
      "Paste GitHub App ID, installation ID, and private key once, then reload setup wizard diagnostics.",
      "This endpoint is allowlisted and does not accept arbitrary secret names.",
      "Manifest conversion uses an operator-managed GitHub token already stored on Worker runtime."
    ],
    manifestLaunch: buildGitHubAppManifestLaunch(url),
    scriptName,
    accountId,
    cloudflareApiToken,
    githubManifestConversionToken
  };
}

function buildGitHubAppManifestLaunch(url) {
  const returnTo = `${url.pathname}${url.search || "?githubAppCheck=on"}`;
  const redirectUrl = new URL(SETUP_WIZARD_GITHUB_APP_MANIFEST_CALLBACK_PATH, url.origin);
  redirectUrl.searchParams.set("returnTo", returnTo);
  const setupUrl = new URL("/setup/wizard", url.origin);
  setupUrl.search = url.search;
  const webhookUrl = new URL("/github/webhooks", url.origin);

  return {
    action: "https://github.com/settings/apps/new",
    manifest: JSON.stringify({
      name: "VTDD Butler V2",
      url: url.origin,
      hook_attributes: {
        url: webhookUrl.toString(),
        active: false
      },
      redirect_url: redirectUrl.toString(),
      setup_url: setupUrl.toString(),
      description:
        "VTDD Butler bootstrap app for iPhone-first setup and GitHub execution.",
      public: false,
      default_permissions: {
        metadata: "read",
        contents: "write",
        pull_requests: "write",
        issues: "write"
      },
      default_events: ["issues", "issue_comment", "pull_request", "pull_request_review", "pull_request_review_comment"]
    })
  };
}

function toPublicGitHubAppBootstrapStatus(status) {
  if (!status || typeof status !== "object") {
    return status;
  }

  const {
    cloudflareApiToken: _cloudflareApiToken,
    githubManifestConversionToken: _githubManifestConversionToken,
    ...publicStatus
  } = status;
  return publicStatus;
}

function resolveCloudflareWorkerScriptName({ url, env }) {
  const explicit = normalizeText(env?.[CLOUDFLARE_WORKER_SCRIPT_NAME_ENV]);
  if (explicit) {
    return explicit;
  }

  const hostname = normalizeText(url?.hostname);
  if (!hostname.endsWith(".workers.dev")) {
    return "";
  }

  const [scriptName] = hostname.split(".", 1);
  return normalizeText(scriptName);
}

async function readGitHubAppBootstrapPayload(request) {
  const contentType = normalizeText(request.headers.get("content-type"));
  if (contentType.includes("application/json")) {
    const payload = await readJson(request);
    return {
      mode: "json",
      returnTo: normalizeText(payload?.returnTo),
      GITHUB_APP_ID: normalizeText(payload?.GITHUB_APP_ID),
      GITHUB_APP_INSTALLATION_ID: normalizeText(payload?.GITHUB_APP_INSTALLATION_ID),
      GITHUB_APP_PRIVATE_KEY: normalizeText(payload?.GITHUB_APP_PRIVATE_KEY)
    };
  }

  const form = await request.formData();
  return {
    mode: "form",
    returnTo: normalizeText(form.get("returnTo")),
    GITHUB_APP_ID: normalizeText(form.get("GITHUB_APP_ID")),
    GITHUB_APP_INSTALLATION_ID: normalizeText(form.get("GITHUB_APP_INSTALLATION_ID")),
    GITHUB_APP_PRIVATE_KEY: normalizeText(form.get("GITHUB_APP_PRIVATE_KEY"))
  };
}

function normalizeGitHubAppBootstrapReturnTo(value) {
  const text = normalizeText(value);
  if (!text.startsWith("/setup/wizard")) {
    return "";
  }
  return text;
}

async function putCloudflareWorkerSecret({
  fetchImpl,
  apiToken,
  accountId,
  scriptName,
  secretName,
  secretValue
}) {
  const response = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/secrets`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${apiToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: secretName,
        text: secretValue,
        type: "secret_text"
      })
    }
  );

  const payload = await readSafeJson(response);
  if (response.ok && payload?.success !== false) {
    return {
      ok: true,
      httpStatus: response.status
    };
  }

  const errors = normalizeCloudflareErrors(payload?.errors);
  const reason =
    errors.map((item) => normalizeText(item.message)).find(Boolean) ||
    `cloudflare secret update failed with http ${response.status}`;
  return {
    ok: false,
    httpStatus: response.status,
    reason
  };
}

async function convertGitHubAppManifestCode({ fetchImpl, code, authToken }) {
  const token = normalizeText(authToken);
  if (!token) {
    return {
      ok: false,
      reason: "github manifest conversion token is not configured on worker runtime"
    };
  }

  const response = await fetchImpl(
    `${GITHUB_API_BASE_URL}/app-manifests/${encodeURIComponent(code)}/conversions`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28"
      }
    }
  );

  const payload = await readSafeJson(response);
  const appId = normalizeText(payload?.id);
  const privateKey = normalizeText(payload?.pem);
  const slug = normalizeText(payload?.slug);
  const htmlUrl = normalizeText(payload?.html_url);

  if (response.ok && appId && privateKey) {
    return {
      ok: true,
      appId,
      privateKey,
      slug,
      htmlUrl
    };
  }

  const reason =
    normalizeText(payload?.message) ||
    `github app manifest conversion failed with http ${response.status}`;
  return {
    ok: false,
    reason
  };
}

function buildGitHubAppSetupGuidanceFromWarning(warning) {
  const normalized = normalizeText(warning).toLowerCase();
  if (normalized.includes("must all be configured")) {
    return [
      "Set GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, and GITHUB_APP_PRIVATE_KEY on Worker runtime.",
      "After updating secrets, redeploy or restart the Worker."
    ];
  }
  if (normalized.includes("resource not accessible by integration")) {
    return [
      "Confirm the GitHub App is installed to the correct repo or organization.",
      "Check repository permissions and visibility scope for the installation."
    ];
  }
  if (normalized.includes("invalid or expired")) {
    return [
      "Regenerate the GitHub App private key and update GITHUB_APP_PRIVATE_KEY.",
      "Confirm the installation still exists for the target repo or organization."
    ];
  }
  if (normalized.includes("rate limited")) {
    return [
      "Retry after the GitHub API rate limit window resets.",
      "Keep setup wizard diagnostics occasional; normal VTDD flow can still fall back to provided aliases."
    ];
  }
  if (normalized.includes("mint failed")) {
    return [
      "Verify GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, and GITHUB_APP_PRIVATE_KEY.",
      "If values look correct, regenerate the private key and retry diagnostics."
    ];
  }
  if (normalized.includes("network request failed")) {
    return ["Confirm Worker runtime can reach api.github.com and retry diagnostics."];
  }
  return [
    "Re-check GitHub App installation target and Worker secrets.",
    "If live probe still fails, keep using provided aliases temporarily and return to bootstrap diagnostics."
  ];
}

async function readSafeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeCloudflareErrors(errors) {
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors
    .map((item) => ({
      code: Number(item?.code),
      message: normalizeText(item?.message),
      documentationUrl: normalizeText(item?.documentation_url)
    }))
    .filter((item) => Number.isFinite(item.code) || item.message);
}

function resolveGitHubAppPrivateKey(env) {
  const runtimeEnv = env ?? {};
  const base64Value = normalizeText(runtimeEnv.GITHUB_APP_PRIVATE_KEY_BASE64);
  if (base64Value) {
    try {
      return decodeBase64(base64Value);
    } catch {
      return "";
    }
  }
  return normalizeText(runtimeEnv.GITHUB_APP_PRIVATE_KEY);
}

function isTruthySignal(value) {
  return value === "on" || value === "true" || value === "1";
}

function toBoolean(value) {
  const normalized = normalize(value);
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function resolveRuntimeAutonomyMode(env) {
  const runtimeEnv = env ?? {};
  const configured = runtimeEnv[AUTONOMY_MODE_ENV] ?? runtimeEnv[LEGACY_AUTONOMY_MODE_ENV];
  return normalizeAutonomyMode(configured);
}

function attachGatewayWarning(gatewayOutcome, warning) {
  const body = normalizeObject(gatewayOutcome?.body);
  const warnings = Array.isArray(body.warnings) ? body.warnings : [];
  const merged = [...new Set([...warnings, normalizeText(warning)].filter(Boolean))];
  return {
    status: gatewayOutcome.status,
    body: {
      ...body,
      warnings: merged
    }
  };
}

function buildGuardedAbsenceExecutionLogId({ actionType, timestamp }) {
  const actionPart = normalizeTag(actionType || "unknown");
  const timestampPart = normalizeTag(
    String(timestamp || "")
      .replaceAll(":", "")
      .replaceAll("-", "")
      .replaceAll(".", "")
  );
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `guarded_absence_${actionPart}_${timestampPart}_${randomPart}`;
}

function classifyGuardedStopCategory(blockedByRule) {
  const rule = normalize(blockedByRule);
  if (!rule) {
    return "allowed_or_not_blocked";
  }
  if (rule.includes("guarded_absence")) {
    return "guarded_absence_boundary";
  }
  if (rule.includes("approval")) {
    return "approval_boundary";
  }
  if (rule.includes("consent")) {
    return "consent_boundary";
  }
  if (rule.includes("traceability")) {
    return "traceability_boundary";
  }
  if (rule.includes("runtime_truth") || rule.includes("reconcile")) {
    return "runtime_truth_boundary";
  }
  if (rule.includes("target") || rule.includes("repository")) {
    return "target_resolution_boundary";
  }
  return "other_boundary";
}

function authorizeGatewayRequest({ request, env, apiSuffix = "/gateway" }) {
  const runtimeEnv = env ?? {};
  const routeLabel = `/${CANONICAL_API_PREFIX.replace(/^\//, "")}${apiSuffix} (legacy ${LEGACY_API_PREFIX}${apiSuffix} is also accepted)`;

  const bearerToken = normalizeText(
    runtimeEnv.VTDD_GATEWAY_BEARER_TOKEN ?? runtimeEnv.MVP_GATEWAY_BEARER_TOKEN
  );
  if (bearerToken) {
    const authorizationHeader = normalizeText(request.headers.get("authorization"));
    const provided = parseBearerToken(request.headers.get("authorization"));
    if (!authorizationHeader) {
      return {
        ok: false,
        status: 401,
        reason: `machine auth credential is required for ${routeLabel}`
      };
    }
    if (!provided) {
      return {
        ok: false,
        status: 403,
        reason: `authorization header must use bearer token for ${routeLabel}`
      };
    }
    if (provided === bearerToken) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 403,
      reason: `provided bearer token is invalid for ${routeLabel}`
    };
  }

  const accessClientId = normalizeText(runtimeEnv.CF_ACCESS_CLIENT_ID);
  const accessClientSecret = normalizeText(runtimeEnv.CF_ACCESS_CLIENT_SECRET);
  if (accessClientId || accessClientSecret) {
    const providedId = normalizeText(request.headers.get("cf-access-client-id"));
    const providedSecret = normalizeText(request.headers.get("cf-access-client-secret"));
    if (!providedId && !providedSecret) {
      return {
        ok: false,
        status: 401,
        reason: `Cloudflare Access service token headers are required for ${routeLabel}`
      };
    }
    if (!accessClientId || !accessClientSecret) {
      return {
        ok: false,
        status: 403,
        reason:
          "Cloudflare Access service token configuration is incomplete on runtime (both CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are required)"
      };
    }
    if (
      accessClientId &&
      accessClientSecret &&
      providedId === accessClientId &&
      providedSecret === accessClientSecret
    ) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 403,
      reason: `provided Cloudflare Access service token headers are invalid for ${routeLabel}`
    };
  }

  return {
    ok: false,
    status: 503,
    reason: `machine auth runtime is not configured for ${routeLabel}`
  };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeLimit(value, fallback) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(numeric), 200);
}

function normalizeIssue(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...extraHeaders
    }
  });
}

function html(status, body, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      ...HTML_HEADERS,
      ...extraHeaders
    }
  });
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeTag(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "_");
}

function parseBearerToken(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  const [scheme, token] = text.split(/\s+/, 2);
  if (normalize(scheme) !== "bearer") {
    return "";
  }
  return normalizeText(token);
}

function normalizeRepo(value) {
  const repo = normalize(value);
  if (!repo || !repo.includes("/")) {
    return "";
  }
  return repo;
}

function isApiPath(pathname, suffix) {
  return (
    pathname === `${CANONICAL_API_PREFIX}${suffix}` || pathname === `${LEGACY_API_PREFIX}${suffix}`
  );
}

function normalizeUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  try {
    const parsed = new URL(text);
    return parsed.origin;
  } catch {
    return "";
  }
}

function normalizeVisibility(value) {
  const normalized = normalize(value);
  if (normalized === "public" || normalized === "private") {
    return normalized;
  }
  return "unknown";
}

function normalizeSignalStatus(value) {
  const normalized = normalize(value);
  if (["available", "unavailable", "forbidden", "unknown"].includes(normalized)) {
    return normalized;
  }
  return "unknown";
}

function normalizeDeployAuthorityPreference(value) {
  const normalized = normalize(value);
  if (["auto", "github_assisted", "vtdd_managed"].includes(normalized)) {
    return normalized;
  }
  return "auto";
}

function decodeBase64(value) {
  if (typeof atob === "function") {
    return atob(value);
  }
  return Buffer.from(value, "base64").toString("utf8");
}

function toHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
