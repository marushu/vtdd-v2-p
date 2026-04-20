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
const SETUP_WIZARD_IMPORT_TOKEN_TTL_SECONDS = 15 * 60;
const SETUP_WIZARD_IMPORT_TOKEN_PARAM = "import_token";
const SETUP_WIZARD_IMPORT_EXPIRES_PARAM = "import_expires";
const SETUP_WIZARD_GITHUB_APP_BOOTSTRAP_PATH = "/setup/wizard/github-app/bootstrap";
const SETUP_WIZARD_GITHUB_APP_MANIFEST_CALLBACK_PATH = "/setup/wizard/github-app/manifest/callback";
const SETUP_WIZARD_GITHUB_APP_INSTALLATION_CAPTURE_PATH =
  "/setup/wizard/github-app/capture-installation";
const SETUP_WIZARD_APPROVAL_BOUND_BOOTSTRAP_SESSION_REQUEST_PATH =
  "/setup/wizard/bootstrap-session/request";
const SETUP_WIZARD_APPROVAL_BOUND_BOOTSTRAP_SESSION_CONSUME_PATH =
  "/setup/wizard/bootstrap-session/consume";
const SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_TTL_SECONDS = 5 * 60;
const SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_TOKEN_PARAM = "bootstrap_session_request_token";
const SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_EXPIRES_PARAM = "bootstrap_session_request_expires";
const SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_STATE_PARAM = "bootstrap_session_request";
const SETUP_WIZARD_BOOTSTRAP_SESSION_PENDING_INSTALLATION_ID_PARAM =
  "bootstrap_session_pending_installation_id";
const SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_STATE_PARAM = "bootstrap_session_consume";
const SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_ENVELOPE_ID_PARAM =
  "bootstrap_session_consume_envelope_id";
const SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_REASON_PARAM =
  "bootstrap_session_consume_reason";
const SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_PROOF_STATE_PARAM =
  "bootstrap_session_consume_proof_state";
const SETUP_WIZARD_BOOTSTRAP_SESSION_ENVELOPE_VERSION = "v1";
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
const GITHUB_API_USER_AGENT = "vtdd-v2-worker";
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

    if (
      request.method === "POST" &&
      url.pathname === SETUP_WIZARD_GITHUB_APP_INSTALLATION_CAPTURE_PATH
    ) {
      const auth = await authorizeSetupWizardRequest({ request, url, env });
      if (!auth.ok) {
        return auth.response;
      }
      return handleGitHubAppInstallationCaptureRequest({ request, url, env });
    }

    if (
      request.method === "POST" &&
      url.pathname === SETUP_WIZARD_APPROVAL_BOUND_BOOTSTRAP_SESSION_REQUEST_PATH
    ) {
      const auth = await authorizeSetupWizardRequest({ request, url, env });
      if (!auth.ok) {
        return auth.response;
      }
      return handleApprovalBoundBootstrapSessionRequest({ request, url, env });
    }

    if (
      request.method === "POST" &&
      url.pathname === SETUP_WIZARD_APPROVAL_BOUND_BOOTSTRAP_SESSION_CONSUME_PATH
    ) {
      const auth = await authorizeSetupWizardRequest({ request, url, env });
      if (!auth.ok) {
        return auth.response;
      }
      return handleApprovalBoundBootstrapSessionConsume({ request, url, env });
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
  const rawGitHubAppSetupCheck = deriveEffectiveGitHubAppSetupCheckFromContinuation({
    url,
    githubAppSetupCheck: await runGitHubAppSetupCheck(url, env)
  });
  const githubAppBootstrapInternal = buildGitHubAppBootstrapStatus({ url, env });
  const githubAppBootstrap = toPublicGitHubAppBootstrapStatus(githubAppBootstrapInternal);
  const approvalBoundBootstrapSession = await buildApprovalBoundBootstrapSessionStatus({
    url,
    env,
    githubAppBootstrap,
    githubAppSetupCheck: rawGitHubAppSetupCheck
  });
  const githubAppSetupCheckWithRequest = attachDetectedInstallationRequestAction({
    githubAppSetupCheck: rawGitHubAppSetupCheck,
    approvalBoundBootstrapSession
  });
  const githubAppSetupCheckWithDetectedGuidance = attachDetectedRequestGuidance({
    githubAppSetupCheck: githubAppSetupCheckWithRequest
  });
  const githubAppSetupCheckWithSelectionRequest = attachInstallationSelectionRequestAction({
    githubAppSetupCheck: githubAppSetupCheckWithDetectedGuidance,
    approvalBoundBootstrapSession
  });
  const githubAppSetupCheckWithSelectionGuidance = attachSelectionRequestGuidance({
    githubAppSetupCheck: githubAppSetupCheckWithSelectionRequest
  });
  const githubAppSetupCheckWithCompletionAction = attachDetectedInstallationCompletionAction({
    githubAppSetupCheck: githubAppSetupCheckWithSelectionGuidance,
    approvalBoundBootstrapSession
  });
  const githubAppSetupCheck = attachDetectedCompletionGuidance({
    githubAppSetupCheck: githubAppSetupCheckWithCompletionAction
  });
  const approvalBoundBootstrapSessionWithInlineRequest = attachInlineRequestSurfaceHint({
    approvalBoundBootstrapSession,
    githubAppSetupCheck
  });
  const approvalBoundBootstrapSessionForResponse = attachInlineConsumeSurfaceHint({
    approvalBoundBootstrapSession: approvalBoundBootstrapSessionWithInlineRequest,
    githubAppSetupCheck
  });
  const format = normalize(url.searchParams.get("format"));
  const autoConsumeResponse = await maybeAutoConsumeDetectedInstallationCompletion({
    request,
    url,
    env,
    format,
    githubAppSetupCheck
  });
  if (autoConsumeResponse) {
    return autoConsumeResponse;
  }
  const guidance = buildSetupWizardGuidance({ result, url });
  const enrichedResult = await attachSetupWizardImportUrls({ result, url, env });
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
        approvalBoundBootstrapSession: approvalBoundBootstrapSessionForResponse,
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
      approvalBoundBootstrapSession: approvalBoundBootstrapSessionForResponse,
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
    githubAppBootstrap,
    approvalBoundBootstrapSession: approvalBoundBootstrapSessionForResponse
  });
  return html(result.ok ? 200 : 422, htmlBody);
}

async function authorizeSetupWizardRequest({ request, url, env }) {
  const config = getSetupWizardAuthConfig(env);
  if (!config.enabled) {
    return { ok: true };
  }

  const format = normalize(url.searchParams.get("format"));
  if (format === "openapi") {
    const importAuthorized = await verifySetupWizardImportToken({
      url,
      sessionSecret: config.sessionSecret
    });
    if (importAuthorized) {
      return { ok: true };
    }
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

async function handleApprovalBoundBootstrapSessionRequest({ request, url, env }) {
  const payload = await readApprovalBoundBootstrapSessionRequestPayload(request);
  const returnTo = normalizeReturnTo(payload.returnTo) || "/setup/wizard";

  if (payload.approvalPhrase !== "GO" || payload.passkeyVerified !== "true") {
    if (payload.mode === "form") {
      const failureUrl = new URL(returnTo, url.origin);
      failureUrl.searchParams.set(SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_STATE_PARAM, "invalid");
      return new Response(null, {
        status: 303,
        headers: {
          location: `${failureUrl.pathname}${failureUrl.search}`
        }
      });
    }

    return json(403, {
      ok: false,
      error: "approval_bound_bootstrap_session_requires_go_passkey",
      reason: "approval-bound bootstrap session request requires GO + passkey"
    });
  }

  const authConfig = getSetupWizardAuthConfig(env);
  const redirectUrl = new URL(returnTo, url.origin);
  const expiresAt = Math.floor(Date.now() / 1000) + SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_TTL_SECONDS;
  redirectUrl.searchParams.set(SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_STATE_PARAM, "requested");
  redirectUrl.searchParams.set(
    SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_EXPIRES_PARAM,
    String(expiresAt)
  );
  redirectUrl.searchParams.set(
    SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_TOKEN_PARAM,
    await createSetupWizardBootstrapSessionRequestToken({
      url: redirectUrl,
      expiresAt,
      sessionSecret: authConfig.sessionSecret
    })
  );

  if (payload.mode === "form") {
    const selectionAutoContinueResponse =
      await maybeAutoContinueSelectedInstallationAfterRequest({
        redirectUrl,
        originUrl: url,
        env,
        pendingInstallationId: payload.pendingInstallationId
      });
    if (selectionAutoContinueResponse) {
      return selectionAutoContinueResponse;
    }

    const autoContinueResponse = await maybeAutoContinueDetectedInstallationAfterRequest({
      redirectUrl,
      originUrl: url,
      env
    });
    if (autoContinueResponse) {
      return autoContinueResponse;
    }

    return new Response(null, {
      status: 303,
      headers: {
        location: `${redirectUrl.pathname}${redirectUrl.search}`
      }
    });
  }

  return json(200, {
    ok: true,
    requested: true,
    returnTo: `${redirectUrl.pathname}${redirectUrl.search}`
  });
}

async function handleApprovalBoundBootstrapSessionConsume({ request, url, env }) {
  const payload = await readApprovalBoundBootstrapSessionConsumePayload(request);
  const returnTo = normalizeReturnTo(payload.returnTo) || "/setup/wizard";
  const authConfig = getSetupWizardAuthConfig(env);

  if (!authConfig.sessionSecret) {
    return json(503, {
      ok: false,
      error: "approval_bound_bootstrap_session_consume_unavailable",
      reason: "setup wizard session secret is not configured"
    });
  }

  const contextUrl = new URL(returnTo, url.origin);
  const requestRecorded = await verifySetupWizardBootstrapSessionRequestToken({
    url: contextUrl,
    sessionSecret: authConfig.sessionSecret
  });
  const requestExpiresAt = getSetupWizardBootstrapSessionRequestExpiresAt(contextUrl);
  const githubAppBootstrap = buildGitHubAppBootstrapStatus({ url: contextUrl, env });
  const githubAppSetupCheck = await runGitHubAppSetupCheck(contextUrl, env);
  const bootstrapState = normalizeText(githubAppBootstrap?.state) || "missing_prerequisites";
  const preview = buildBootstrapSessionPreview({
    env,
    githubAppBootstrap,
    githubAppSetupCheck
  });
  const envelopeValid =
    requestRecorded &&
    Number.isFinite(requestExpiresAt) &&
    (await verifySetupWizardBootstrapSessionEnvelopeToken({
      token: payload.envelopeToken,
      url: contextUrl,
      expiresAt: requestExpiresAt,
      bootstrapState,
      preview,
      sessionSecret: authConfig.sessionSecret
    }));

  if (!envelopeValid) {
    if (payload.mode === "form") {
      const failureUrl = new URL(returnTo, url.origin);
      failureUrl.searchParams.set(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_STATE_PARAM, "invalid");
      return new Response(null, {
        status: 303,
        headers: {
          location: `${failureUrl.pathname}${failureUrl.search}`
        }
      });
    }

    return json(403, {
      ok: false,
      error: "approval_bound_bootstrap_session_consume_invalid_envelope",
      reason: "bootstrap session envelope is invalid for the current wizard context"
    });
  }

  const envelopeId = normalizeText(payload.envelopeToken).slice(0, 12);
  const installationOnlyWrite =
    preview.plannedWrites.length === 1 && preview.plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID";
  const detectedInstallationId = normalizeText(githubAppSetupCheck?.detectedInstallationId);

  if (
    installationOnlyWrite &&
    normalizeText(githubAppSetupCheck?.state) === "installation_detected" &&
    detectedInstallationId
  ) {
    const writeResult = await writeGitHubAppInstallationBinding({
      env,
      bootstrap: githubAppBootstrap,
      installationId: detectedInstallationId
    });

    if (!writeResult.ok) {
      if (payload.mode === "form") {
        const failureUrl = new URL(returnTo, url.origin);
        failureUrl.searchParams.set(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_STATE_PARAM, "failed");
        failureUrl.searchParams.set(
          SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_ENVELOPE_ID_PARAM,
          envelopeId
        );
        failureUrl.searchParams.set(
          SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_REASON_PARAM,
          normalizeText(writeResult.error) || "consume_write_failed"
        );
        return new Response(null, {
          status: 303,
          headers: {
            location: `${failureUrl.pathname}${failureUrl.search}`
          }
        });
      }

      return json(writeResult.status ?? 502, {
        ok: false,
        error: writeResult.error || "approval_bound_bootstrap_session_consume_write_failed",
        reason: writeResult.reason || "failed to store detected installation binding",
        envelopeId
      });
    }

    const proof = await runBootstrapSessionConsumeProof({
      url: contextUrl,
      env,
      installationId: detectedInstallationId
    });

    if (payload.mode === "form") {
      const successUrl = new URL(returnTo, url.origin);
      successUrl.searchParams.set(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_STATE_PARAM, "completed");
      successUrl.searchParams.set(
        SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_ENVELOPE_ID_PARAM,
        envelopeId
      );
      if (normalizeText(proof?.state)) {
        successUrl.searchParams.set(
          SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_PROOF_STATE_PARAM,
          normalizeText(proof.state)
        );
      }
      return new Response(null, {
        status: 303,
        headers: {
          location: `${successUrl.pathname}${successUrl.search}`
        }
      });
    }

    return json(200, {
      ok: true,
      consumed: true,
      state: "consume_completed",
      summary:
        "VTDD consumed the signed bootstrap session envelope and stored the detected installation binding on Worker runtime.",
      envelopeId,
      updatedSecrets: ["GITHUB_APP_INSTALLATION_ID"],
      installationId: detectedInstallationId,
      guidance: [
        "The single-use approval-bound installation-binding request is now consumed for the current installation candidate.",
        "Do not issue a new GO + passkey request unless the installation candidate changes."
      ],
      writeTarget: preview?.writeTarget ?? null,
      plannedWrites: ["GITHUB_APP_INSTALLATION_ID"],
      postChecks: Array.isArray(preview?.postChecks) ? [...preview.postChecks] : [],
      proof
    });
  }

  if (payload.mode === "form") {
    const successUrl = new URL(returnTo, url.origin);
    successUrl.searchParams.set(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_STATE_PARAM, "deferred");
    successUrl.searchParams.set(
      SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_ENVELOPE_ID_PARAM,
      envelopeId
    );
    return new Response(null, {
      status: 303,
      headers: {
        location: `${successUrl.pathname}${successUrl.search}`
      }
    });
  }

  return json(200, {
    ok: true,
    consumed: false,
    state: "consume_deferred",
    summary:
      "VTDD validated the signed bootstrap session envelope against the current wizard context, but attestation-backed consume is still deferred.",
    envelopeId,
    writeTarget: preview?.writeTarget ?? null,
    plannedWrites: Array.isArray(preview?.plannedWrites) ? [...preview.plannedWrites] : [],
    postChecks: Array.isArray(preview?.postChecks) ? [...preview.postChecks] : []
  });
}

async function maybeAutoConsumeDetectedInstallationCompletion({
  request,
  url,
  env,
  format,
  githubAppSetupCheck
}) {
  if (request.method !== "GET" || format === "json" || format === "openapi") {
    return null;
  }

  if (normalizeText(url.searchParams.get(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_STATE_PARAM))) {
    return null;
  }

  const completionAction = githubAppSetupCheck?.completeDetectedInstallationAction ?? null;
  const consumePath = normalizeText(completionAction?.path);
  const returnTo = normalizeGitHubAppBootstrapReturnTo(completionAction?.returnTo);
  const envelopeToken = normalizeText(completionAction?.envelopeToken);

  if (
    consumePath !== SETUP_WIZARD_APPROVAL_BOUND_BOOTSTRAP_SESSION_CONSUME_PATH ||
    !returnTo ||
    !envelopeToken
  ) {
    return null;
  }

  return continueDetectedInstallationCompletion({
    consumePath,
    returnTo,
    envelopeToken,
    originUrl: url,
    env
  });
}

async function maybeAutoContinueDetectedInstallationAfterRequest({
  redirectUrl,
  originUrl,
  env
}) {
  const rawGitHubAppSetupCheck = await runGitHubAppSetupCheck(redirectUrl, env);
  const githubAppBootstrap = toPublicGitHubAppBootstrapStatus(
    buildGitHubAppBootstrapStatus({ url: redirectUrl, env })
  );
  const approvalBoundBootstrapSession = await buildApprovalBoundBootstrapSessionStatus({
    url: redirectUrl,
    env,
    githubAppBootstrap,
    githubAppSetupCheck: rawGitHubAppSetupCheck
  });
  const githubAppSetupCheck = attachDetectedInstallationCompletionAction({
    githubAppSetupCheck: rawGitHubAppSetupCheck,
    approvalBoundBootstrapSession
  });
  const completionAction = githubAppSetupCheck?.completeDetectedInstallationAction ?? null;
  const consumePath = normalizeText(completionAction?.path);
  const returnTo = normalizeGitHubAppBootstrapReturnTo(completionAction?.returnTo);
  const envelopeToken = normalizeText(completionAction?.envelopeToken);

  if (
    consumePath !== SETUP_WIZARD_APPROVAL_BOUND_BOOTSTRAP_SESSION_CONSUME_PATH ||
    !returnTo ||
    !envelopeToken
  ) {
    return null;
  }

  return continueDetectedInstallationCompletion({
    consumePath,
    returnTo,
    envelopeToken,
    originUrl,
    env
  });
}

async function maybeAutoContinueSelectedInstallationAfterRequest({
  redirectUrl,
  originUrl,
  env,
  pendingInstallationId
}) {
  const normalizedInstallationId = normalizeText(pendingInstallationId);
  if (!normalizedInstallationId) {
    return null;
  }

  const captureRequest = new Request(
    new URL(SETUP_WIZARD_GITHUB_APP_INSTALLATION_CAPTURE_PATH, originUrl.origin),
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        returnTo: `${redirectUrl.pathname}${redirectUrl.search}`,
        GITHUB_APP_INSTALLATION_ID: normalizedInstallationId
      })
    }
  );

  return handleGitHubAppInstallationCaptureRequest({
    request: captureRequest,
    url: new URL(SETUP_WIZARD_GITHUB_APP_INSTALLATION_CAPTURE_PATH, originUrl.origin),
    env
  });
}

async function continueDetectedInstallationCompletion({
  consumePath,
  returnTo,
  envelopeToken,
  originUrl,
  env
}) {
  const consumeRequest = new Request(new URL(consumePath, originUrl.origin), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      returnTo,
      envelope_token: envelopeToken
    })
  });

  return handleApprovalBoundBootstrapSessionConsume({
    request: consumeRequest,
    url: new URL(consumePath, originUrl.origin),
    env
  });
}

async function maybeAutoContinueSelectedInstallationAfterCapture({
  returnTo,
  installationId,
  originUrl,
  env
}) {
  const normalizedReturnTo = normalizeGitHubAppBootstrapReturnTo(returnTo);
  const normalizedInstallationId = normalizeText(installationId);
  if (!normalizedReturnTo || !normalizedInstallationId) {
    return null;
  }

  const authConfig = getSetupWizardAuthConfig(env);
  if (!authConfig.sessionSecret) {
    return null;
  }

  const contextUrl = new URL(normalizedReturnTo, originUrl.origin);
  const requestRecorded = await verifySetupWizardBootstrapSessionRequestToken({
    url: contextUrl,
    sessionSecret: authConfig.sessionSecret
  });
  if (!requestRecorded) {
    return null;
  }

  const requestExpiresAt = getSetupWizardBootstrapSessionRequestExpiresAt(contextUrl);
  if (!Number.isFinite(requestExpiresAt)) {
    return null;
  }

  const githubAppBootstrap = buildGitHubAppBootstrapStatus({ url: contextUrl, env });
  if (normalizeText(githubAppBootstrap?.state) !== "available") {
    return null;
  }

  const githubAppSetupCheck = await runGitHubAppSetupCheck(contextUrl, env);
  const preview = buildBootstrapSessionPreview({
    env,
    githubAppBootstrap,
    githubAppSetupCheck
  });
  const installationOnlyWrite =
    Array.isArray(preview?.plannedWrites) &&
    preview.plannedWrites.length === 1 &&
    preview.plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID";
  if (!installationOnlyWrite) {
    return null;
  }

  const proof = await runBootstrapSessionConsumeProof({
    url: contextUrl,
    env,
    installationId: normalizedInstallationId
  });
  const successUrl = new URL(normalizedReturnTo, originUrl.origin);
  successUrl.searchParams.set(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_STATE_PARAM, "completed");
  successUrl.searchParams.set(
    SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_ENVELOPE_ID_PARAM,
    normalizeText(
      contextUrl.searchParams.get(SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_TOKEN_PARAM)
    ).slice(0, 12)
  );
  if (normalizeText(proof?.state)) {
    successUrl.searchParams.set(
      SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_PROOF_STATE_PARAM,
      normalizeText(proof.state)
    );
  }

  return new Response(null, {
    status: 303,
    headers: {
      location: `${successUrl.pathname}${successUrl.search}`
    }
  });
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
    const autoContinueResponse = await maybeAutoContinueSelectedInstallationAfterCapture({
      returnTo,
      installationId,
      originUrl: url,
      env
    });
    if (autoContinueResponse) {
      return autoContinueResponse;
    }

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
    const diagnostics = await diagnoseGitHubManifestConversionToken({
      fetchImpl,
      authToken: bootstrap.githubManifestConversionToken
    });
    return json(502, {
      ok: false,
      error: "github_app_manifest_conversion_failed",
      reason: converted.reason,
      diagnostics
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
      const diagnostics = await diagnoseCloudflareBootstrapSecretWrite({
        fetchImpl: typeof env?.CF_API_FETCH === "function" ? env.CF_API_FETCH : globalThis.fetch.bind(globalThis),
        apiToken: bootstrap.cloudflareApiToken,
        accountId: bootstrap.accountId,
        scriptName: bootstrap.scriptName,
        failedStage: "workers_secret_write",
        failedResponse: updated
      });
      return json(502, {
        ok: false,
        error: "github_app_manifest_secret_write_failed",
        secretName,
        reason: updated.reason,
        diagnostics
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
        <p><strong>VTDD now has a GitHub App identity stored on Worker runtime.</strong></p>
        <p><strong>Setup progress</strong></p>
        <ul>
          <li>GitHub App ID retrieved.</li>
          <li>GitHub App private key retrieved and stored on Worker runtime.</li>
          <li>GitHub App identity runtime configuration completed.</li>
          <li>VTDD kept the same setup return context for this setup flow.</li>
          <li>After installation consent, VTDD will continue into installation detection, binding, and readiness verification.</li>
        </ul>
        <p class="meta">Next, GitHub needs to install that identity to your repositories so VTDD can mint short-lived installation tokens later.</p>
        ${
          installUrl
            ? `<p><a href="${escapeHtml(installUrl)}">Install the GitHub App</a></p>`
            : ""
        }
        <p class="meta">After installation, return to setup wizard in this same flow. VTDD will try to detect the installation automatically before asking you for manual recovery steps.</p>
        <p><a href="${escapeHtml(redirectTarget)}">Return to setup wizard</a></p>
      </div>
    `)
  );
}

async function handleGitHubAppInstallationCaptureRequest({ request, url, env }) {
  const bootstrap = buildGitHubAppBootstrapStatus({ url, env });
  if (bootstrap.state !== "available") {
    return json(503, {
      ok: false,
      error: "github_app_installation_capture_unavailable",
      state: bootstrap.state,
      summary: bootstrap.summary,
      missingPrerequisites: bootstrap.missingPrerequisites ?? []
    });
  }

  const payload = await readGitHubAppInstallationCapturePayload(request);
  const installationId = normalizeText(payload.GITHUB_APP_INSTALLATION_ID);
  if (!installationId) {
    return json(422, {
      ok: false,
      error: "github_app_installation_capture_missing_value"
    });
  }
  const returnTo =
    normalizeGitHubAppBootstrapReturnTo(payload.returnTo) || "/setup/wizard?githubAppCheck=on";
  const captureBoundary = await evaluateInstallationCaptureBoundary({
    url,
    env,
    returnTo,
    installationId
  });
  if (!captureBoundary.ok) {
    if (payload.mode === "form") {
      const failureUrl = new URL(returnTo, url.origin);
      if (captureBoundary.error === "approval_bound_request_required_for_selection_capture") {
        failureUrl.searchParams.set(SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_STATE_PARAM, "missing");
        failureUrl.searchParams.set(
          SETUP_WIZARD_BOOTSTRAP_SESSION_PENDING_INSTALLATION_ID_PARAM,
          installationId
        );
      } else {
        failureUrl.searchParams.set(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_STATE_PARAM, "failed");
        failureUrl.searchParams.set(
          SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_REASON_PARAM,
          captureBoundary.error
        );
      }
      return new Response(null, {
        status: 303,
        headers: {
          location: `${failureUrl.pathname}${failureUrl.search}`
        }
      });
    }

    return json(captureBoundary.status ?? 403, {
      ok: false,
      error: captureBoundary.error,
      reason: captureBoundary.reason,
      requiredAction:
        captureBoundary.requiredAction ??
        (captureBoundary.error === "approval_bound_request_required_for_selection_capture"
          ? {
              id: "record_go_passkey_request_for_capture",
              path: SETUP_WIZARD_APPROVAL_BOUND_BOOTSTRAP_SESSION_REQUEST_PATH,
              returnTo,
              approvalBoundary: "GO + passkey",
              pendingInstallationIdParam: "pending_installation_id",
              pendingInstallationId: installationId
            }
          : null)
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
      error: "github_app_installation_capture_fetch_unavailable",
      reason: "runtime fetch is unavailable"
    });
  }

  const updated = await writeGitHubAppInstallationBinding({
    env,
    bootstrap,
    installationId,
    fetchImpl
  });
  if (!updated.ok) {
    return json(updated.status ?? 502, {
      ok: false,
      error: updated.error || "github_app_installation_capture_write_failed",
      reason: updated.reason,
      evidence: {
        httpStatus: updated.httpStatus ?? null
      }
    });
  }

  if (payload.mode === "form") {
    const autoContinueResponse = await maybeAutoContinueSelectedInstallationAfterCapture({
      returnTo,
      installationId,
      originUrl: url,
      env
    });
    if (autoContinueResponse) {
      return autoContinueResponse;
    }

    return new Response(null, {
      status: 303,
      headers: {
        location: returnTo
      }
    });
  }

  return json(200, {
    ok: true,
    updatedSecrets: ["GITHUB_APP_INSTALLATION_ID"],
    returnTo
  });
}

async function evaluateInstallationCaptureBoundary({
  url,
  env,
  returnTo,
  installationId
}) {
  const contextUrl = new URL(returnTo, url.origin);
  const setupCheck = await runGitHubAppSetupCheck(contextUrl, env);
  const state = normalizeText(setupCheck?.state);
  if (state !== "installation_selection_required" && state !== "installation_detected") {
    const pendingInstallationId = normalizeText(
      contextUrl.searchParams.get(SETUP_WIZARD_BOOTSTRAP_SESSION_PENDING_INSTALLATION_ID_PARAM)
    );
    if (pendingInstallationId) {
      const diagnosticsReturnTo =
        normalizeSetupWizardDiagnosticsReturnTo(returnTo) || returnTo;
      return {
        ok: false,
        status: 409,
        error: "github_app_installation_capture_pending_selection_state_drifted",
        reason:
          "pending installation capture token is present, but setup flow no longer has a capturable detected/selection state",
        requiredAction: {
          id: "rerun_installation_detection_same_flow",
          method: "GET",
          path: diagnosticsReturnTo
        }
      };
    }
    return { ok: true };
  }

  const normalizedInstallationId = normalizeText(installationId);
  const pendingInstallationId = normalizeText(
    contextUrl.searchParams.get(SETUP_WIZARD_BOOTSTRAP_SESSION_PENDING_INSTALLATION_ID_PARAM)
  );
  if (pendingInstallationId && pendingInstallationId !== normalizedInstallationId) {
    return {
      ok: false,
      status: 422,
      error: "github_app_installation_capture_pending_selection_mismatch",
      reason:
        "installation id does not match the pending installation capture token for this setup flow",
      requiredAction: {
        id: "retry_pending_installation_candidate_capture",
        path: SETUP_WIZARD_GITHUB_APP_INSTALLATION_CAPTURE_PATH,
        returnTo,
        installationId: pendingInstallationId
      }
    };
  }
  if (state === "installation_selection_required") {
    const options = Array.isArray(setupCheck?.installationSelectionOptions)
      ? setupCheck.installationSelectionOptions
      : [];
    if (options.length > 0) {
      const optionIds = new Set(
        options.map((item) => normalizeText(item?.installationId)).filter(Boolean)
      );
      if (!optionIds.has(normalizedInstallationId)) {
        const optionIdsList = [...optionIds];
        return {
          ok: false,
          status: 422,
          error: "github_app_installation_capture_invalid_selection_candidate",
          reason:
            "installation id is not in the current selection candidates for this setup flow",
          requiredAction: {
            id: "select_current_installation_candidate",
            path: SETUP_WIZARD_GITHUB_APP_INSTALLATION_CAPTURE_PATH,
            returnTo,
            installationCandidates: optionIdsList
          }
        };
      }
    }
  }

  if (state === "installation_detected") {
    const detectedInstallationId = normalizeText(setupCheck?.detectedInstallationId);
    if (detectedInstallationId && detectedInstallationId !== normalizedInstallationId) {
      return {
        ok: false,
        status: 422,
        error: "github_app_installation_capture_detected_id_mismatch",
        reason:
          "installation id does not match the detected installation candidate in this setup flow",
        requiredAction: {
          id: "use_detected_installation_candidate_capture",
          path: SETUP_WIZARD_GITHUB_APP_INSTALLATION_CAPTURE_PATH,
          returnTo,
          installationId: detectedInstallationId
        }
      };
    }
  }

  const githubAppBootstrap = toPublicGitHubAppBootstrapStatus(
    buildGitHubAppBootstrapStatus({ url: contextUrl, env })
  );
  const approvalBoundBootstrapSession = await buildApprovalBoundBootstrapSessionStatus({
    url: contextUrl,
    env,
    githubAppBootstrap,
    githubAppSetupCheck: setupCheck
  });
  const setupCheckWithSelectionRequest =
    state === "installation_selection_required"
      ? attachInstallationSelectionRequestAction({
          githubAppSetupCheck: setupCheck,
          approvalBoundBootstrapSession
        })
      : setupCheck;
  const setupCheckWithSelectionGuidance = attachSelectionRequestGuidance({
    githubAppSetupCheck: setupCheckWithSelectionRequest
  });
  const setupCheckWithDetectedRequest =
    state === "installation_detected"
      ? attachDetectedInstallationRequestAction({
          githubAppSetupCheck: setupCheckWithSelectionGuidance,
          approvalBoundBootstrapSession
        })
      : setupCheckWithSelectionGuidance;
  const setupCheckWithDetectedGuidance = attachDetectedRequestGuidance({
    githubAppSetupCheck: setupCheckWithDetectedRequest
  });
  const requestAction =
    normalizeText(setupCheckWithDetectedGuidance?.state) === "installation_selection_required"
      ? setupCheckWithDetectedGuidance?.requestInstallationSelectionAction
      : setupCheckWithDetectedGuidance?.requestDetectedInstallationAction;
  if (!requestAction) {
    return { ok: true };
  }

  const authConfig = getSetupWizardAuthConfig(env);
  if (!authConfig.sessionSecret) {
    return {
      ok: false,
      status: 403,
      error: "approval_bound_request_required_for_selection_capture",
      reason: "GO + passkey request token is required before selection-based installation capture"
    };
  }

  const requestRecorded = await verifySetupWizardBootstrapSessionRequestToken({
    url: contextUrl,
    sessionSecret: authConfig.sessionSecret
  });
  if (!requestRecorded) {
    return {
      ok: false,
      status: 403,
      error: "approval_bound_request_required_for_selection_capture",
      reason: "GO + passkey request token is required before selection-based installation capture"
    };
  }

  return { ok: true };
}

async function writeGitHubAppInstallationBinding({
  env,
  bootstrap,
  installationId,
  fetchImpl
}) {
  const normalizedInstallationId = normalizeText(installationId);
  if (!normalizedInstallationId) {
    return {
      ok: false,
      status: 422,
      error: "github_app_installation_capture_missing_value",
      reason: "installation id is required"
    };
  }

  const runtimeFetchImpl =
    fetchImpl ??
    (typeof env?.CF_API_FETCH === "function"
      ? env.CF_API_FETCH
      : typeof globalThis.fetch === "function"
        ? globalThis.fetch.bind(globalThis)
        : null);
  if (!runtimeFetchImpl) {
    return {
      ok: false,
      status: 503,
      error: "github_app_installation_capture_fetch_unavailable",
      reason: "runtime fetch is unavailable"
    };
  }

  const updated = await putCloudflareWorkerSecret({
    fetchImpl: runtimeFetchImpl,
    apiToken: bootstrap.cloudflareApiToken,
    accountId: bootstrap.accountId,
    scriptName: bootstrap.scriptName,
    secretName: "GITHUB_APP_INSTALLATION_ID",
    secretValue: normalizedInstallationId
  });
  if (!updated.ok) {
    return {
      ok: false,
      status: 502,
      error: "github_app_installation_capture_write_failed",
      reason: updated.reason,
      httpStatus: updated.httpStatus ?? null
    };
  }

  return {
    ok: true,
    installationId: normalizedInstallationId
  };
}

async function runBootstrapSessionConsumeProof({ url, env, installationId }) {
  const effectiveEnv = {
    ...(env ?? {}),
    GITHUB_APP_INSTALLATION_ID: normalizeText(installationId)
  };
  return runGitHubAppSetupCheck(url, effectiveEnv);
}

async function attachSetupWizardImportUrls({ result, url, env }) {
  const actionSchemaJson = result?.onboarding?.customGpt?.actionSchemaJson;
  if (!actionSchemaJson) {
    return result;
  }

  const authConfig = getSetupWizardAuthConfig(env);

  return {
    ...result,
    onboarding: {
      ...result.onboarding,
      customGpt: {
        ...result.onboarding.customGpt,
        actionSchemaImportUrl: await buildActionSchemaImportUrl({
          url,
          sessionSecret: authConfig.sessionSecret,
          authEnabled: authConfig.enabled
        })
      }
    }
  };
}

async function buildActionSchemaImportUrl({ url, sessionSecret, authEnabled }) {
  const importUrl = new URL(url.toString());
  importUrl.searchParams.set("format", "openapi");
  importUrl.searchParams.delete("githubAppCheck");
  importUrl.searchParams.delete("cloudflareCheck");
  importUrl.searchParams.delete(SETUP_WIZARD_IMPORT_TOKEN_PARAM);
  importUrl.searchParams.delete(SETUP_WIZARD_IMPORT_EXPIRES_PARAM);

  if (authEnabled && sessionSecret) {
    const expiresAt = Math.floor(Date.now() / 1000) + SETUP_WIZARD_IMPORT_TOKEN_TTL_SECONDS;
    importUrl.searchParams.set(SETUP_WIZARD_IMPORT_EXPIRES_PARAM, String(expiresAt));
    importUrl.searchParams.set(
      SETUP_WIZARD_IMPORT_TOKEN_PARAM,
      await createSetupWizardImportToken({
        url: importUrl,
        expiresAt,
        sessionSecret
      })
    );
  }

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

async function readApprovalBoundBootstrapSessionRequestPayload(request) {
  const contentType = normalizeText(request.headers.get("content-type"));
  if (contentType.includes("application/json")) {
    const payload = await readJson(request);
    return {
      mode: "json",
      approvalPhrase: normalizeText(payload?.approval_phrase),
      passkeyVerified: normalizeText(payload?.passkey_verified),
      returnTo: normalizeText(payload?.returnTo),
      pendingInstallationId: normalizeText(payload?.pending_installation_id)
    };
  }

  const form = await request.formData();
  return {
    mode: "form",
    approvalPhrase: normalizeText(form.get("approval_phrase")),
    passkeyVerified: normalizeText(form.get("passkey_verified")),
    returnTo: normalizeText(form.get("returnTo")),
    pendingInstallationId: normalizeText(form.get("pending_installation_id"))
  };
}

async function readApprovalBoundBootstrapSessionConsumePayload(request) {
  const contentType = normalizeText(request.headers.get("content-type"));
  if (contentType.includes("application/json")) {
    const payload = await readJson(request);
    return {
      mode: "json",
      envelopeToken: normalizeText(payload?.envelope_token),
      returnTo: normalizeText(payload?.returnTo)
    };
  }

  const form = await request.formData();
  return {
    mode: "form",
    envelopeToken: normalizeText(form.get("envelope_token")),
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

async function createSetupWizardImportToken({ url, expiresAt, sessionSecret }) {
  const normalized = buildSetupWizardImportTokenPayload({
    url,
    expiresAt
  });
  return signSetupWizardValue({
    message: normalized,
    sessionSecret
  });
}

async function verifySetupWizardImportToken({ url, sessionSecret }) {
  const token = normalizeText(url.searchParams.get(SETUP_WIZARD_IMPORT_TOKEN_PARAM));
  const expiresAt = Number.parseInt(
    normalizeText(url.searchParams.get(SETUP_WIZARD_IMPORT_EXPIRES_PARAM)),
    10
  );
  if (!token || !Number.isFinite(expiresAt)) {
    return false;
  }
  if (expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = await createSetupWizardImportToken({
    url,
    expiresAt,
    sessionSecret
  });
  return safeEqual(token, expected);
}

async function createSetupWizardBootstrapSessionRequestToken({
  url,
  expiresAt,
  sessionSecret
}) {
  return signSetupWizardValue({
    message: buildSetupWizardBootstrapSessionRequestPayload({ url, expiresAt }),
    sessionSecret
  });
}

async function verifySetupWizardBootstrapSessionRequestToken({ url, sessionSecret }) {
  const requested = normalizeText(
    url.searchParams.get(SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_STATE_PARAM)
  );
  const token = normalizeText(
    url.searchParams.get(SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_TOKEN_PARAM)
  );
  const expiresAt = Number.parseInt(
    normalizeText(url.searchParams.get(SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_EXPIRES_PARAM)),
    10
  );

  if (requested !== "requested" || !token || !Number.isFinite(expiresAt)) {
    return false;
  }
  if (expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = await createSetupWizardBootstrapSessionRequestToken({
    url,
    expiresAt,
    sessionSecret
  });
  return safeEqual(token, expected);
}

async function verifySetupWizardBootstrapSessionEnvelopeToken({
  token,
  url,
  expiresAt,
  bootstrapState,
  preview,
  sessionSecret
}) {
  const normalizedToken = normalizeText(token);
  if (!normalizedToken || !Number.isFinite(expiresAt)) {
    return false;
  }
  if (expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = await createSetupWizardBootstrapSessionEnvelopeToken({
    url,
    expiresAt,
    bootstrapState,
    preview,
    sessionSecret
  });
  return safeEqual(normalizedToken, expected);
}

function getSetupWizardBootstrapSessionRequestExpiresAt(url) {
  return Number.parseInt(
    normalizeText(url?.searchParams?.get(SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_EXPIRES_PARAM)),
    10
  );
}

async function createSetupWizardBootstrapSessionEnvelopeToken({
  url,
  expiresAt,
  bootstrapState,
  preview,
  sessionSecret
}) {
  return signSetupWizardValue({
    message: buildSetupWizardBootstrapSessionEnvelopePayload({
      url,
      expiresAt,
      bootstrapState,
      preview
    }),
    sessionSecret
  });
}

function buildSetupWizardImportTokenPayload({ url, expiresAt }) {
  const normalizedUrl = new URL(url.toString());
  normalizedUrl.searchParams.delete(SETUP_WIZARD_IMPORT_TOKEN_PARAM);
  normalizedUrl.searchParams.set("format", "openapi");
  normalizedUrl.searchParams.set(SETUP_WIZARD_IMPORT_EXPIRES_PARAM, String(expiresAt));
  normalizedUrl.searchParams.sort();
  return `${normalizedUrl.pathname}?${normalizedUrl.searchParams.toString()}`;
}

function buildSetupWizardBootstrapSessionRequestPayload({ url, expiresAt }) {
  const normalizedUrl = new URL(url.toString());
  normalizedUrl.searchParams.delete(SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_TOKEN_PARAM);
  normalizedUrl.searchParams.delete("format");
  normalizedUrl.searchParams.set(
    SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_STATE_PARAM,
    "requested"
  );
  normalizedUrl.searchParams.set(
    SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_EXPIRES_PARAM,
    String(expiresAt)
  );
  normalizedUrl.searchParams.sort();
  return `${normalizedUrl.pathname}?${normalizedUrl.searchParams.toString()}`;
}

function buildSetupWizardBootstrapSessionEnvelopePayload({
  url,
  expiresAt,
  bootstrapState,
  preview
}) {
  const normalizedUrl = new URL(url.toString());
  normalizedUrl.searchParams.delete(SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_TOKEN_PARAM);
  normalizedUrl.searchParams.delete("format");
  normalizedUrl.searchParams.set(
    SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_STATE_PARAM,
    "requested"
  );
  normalizedUrl.searchParams.set(
    SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_EXPIRES_PARAM,
    String(expiresAt)
  );
  normalizedUrl.searchParams.sort();
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites.join(",") : "";
  const postChecks = Array.isArray(preview?.postChecks) ? preview.postChecks.join(",") : "";
  return [
    `version=${SETUP_WIZARD_BOOTSTRAP_SESSION_ENVELOPE_VERSION}`,
    `context=${normalizedUrl.pathname}?${normalizedUrl.searchParams.toString()}`,
    `bootstrapState=${normalizeText(bootstrapState)}`,
    `writeTarget=${normalizeText(preview?.writeTarget)}`,
    `plannedWrites=${plannedWrites}`,
    `postChecks=${postChecks}`,
    "singleUse=true"
  ].join("|");
}

function safeEqual(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b || a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
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
  githubAppBootstrap,
  approvalBoundBootstrapSession
}) {
  const pageTitle = locale === "ja" ? "VTDD セットアップウィザード" : "VTDD Setup Wizard";
  const copiedText = locale === "ja" ? "コピーしました。" : "Copied.";
  const manualCopyText =
    locale === "ja" ? "全選択して手動でコピーしてください。" : "Select all and copy manually.";
  const extraScript = buildGitHubAppAutoRecheckScript({ githubAppSetupCheck });
  const body = result.ok
    ? renderSuccessContent(
        result,
        answers,
        url,
        locale,
        cloudflareSetupCheck,
        githubAppSetupCheck,
        githubAppBootstrap,
        approvalBoundBootstrapSession
      )
    : renderFailureContent(
        result,
        answers,
        url,
        locale,
        cloudflareSetupCheck,
        githubAppSetupCheck,
        githubAppBootstrap,
        approvalBoundBootstrapSession
      );

  return renderHtmlDocument(body, {
    pageTitle,
    copiedText,
    manualCopyText,
    extraScript
  });
}

function renderHtmlDocument(body, ui = {}) {
  const pageTitle = normalizeText(ui.pageTitle) || "VTDD Setup Wizard";
  const copiedText = normalizeText(ui.copiedText) || "Copied.";
  const manualCopyText =
    normalizeText(ui.manualCopyText) || "Select all and copy manually.";
  const extraScript = normalizeText(ui.extraScript);
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

      async function copyFromValue(button) {
        const value = button.getAttribute("data-copy-value") || "";
        if (!value) {
          return;
        }

        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
          } else {
            const textarea = document.createElement("textarea");
            textarea.value = value;
            textarea.setAttribute("readonly", "");
            textarea.style.position = "absolute";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
          }
          setCopyState(button, ${JSON.stringify(copiedText)});
        } catch {
          setCopyState(button, ${JSON.stringify(manualCopyText)});
        }
      }

      document.querySelectorAll("[data-copy-target]").forEach((button) => {
        button.addEventListener("click", () => {
          copyFromTextarea(button);
        });
      });
      document.querySelectorAll("[data-copy-value]").forEach((button) => {
        button.addEventListener("click", () => {
          copyFromValue(button);
        });
      });
      ${extraScript}
    </script>
  </body>
</html>`;
}

function buildGitHubAppAutoRecheckScript({ githubAppSetupCheck }) {
  if (normalizeText(githubAppSetupCheck?.state) !== "awaiting_installation") {
    return "";
  }

  return `
      (function () {
        const key = "vtdd_github_installation_recheck_count";
        const maxAttempts = 6;
        const delayMs = 5000;
        const current = Number(sessionStorage.getItem(key) || "0");
        if (!Number.isFinite(current) || current >= maxAttempts) {
          return;
        }
        sessionStorage.setItem(key, String(current + 1));
        window.setTimeout(() => {
          window.location.reload();
        }, delayMs);
      })();
  `;
}

function renderSuccessContent(
  result,
  answers,
  url,
  locale = "en",
  cloudflareSetupCheck,
  githubAppSetupCheck,
  githubAppBootstrap,
  approvalBoundBootstrapSession
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
  const currentSetupUrl = url.toString();
  const jsonOutputUrl = `${url.origin}/setup/wizard?format=json`;
  const currentSetupLabel =
    locale === "ja" ? "現在の Setup URL" : "Current Setup URL";
  const copyCurrentSetupLabel =
    locale === "ja" ? "Setup URL をコピー" : "Copy Setup URL";
  const copyJsonLabel =
    locale === "ja" ? "JSON URL をコピー" : "Copy JSON URL";
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
    <div class="section-header">
      <p class="meta" style="margin: 0;">${escapeHtml(currentSetupLabel)}: <code>${escapeHtml(currentSetupUrl)}</code></p>
      <button class="copy-button" type="button" data-copy-value="${escapeHtml(currentSetupUrl)}" data-copy-target="setupCurrentUrlStatus">${escapeHtml(copyCurrentSetupLabel)}</button>
    </div>
    <p class="copy-hint" data-copy-status="setupCurrentUrlStatus"></p>
    <div class="section-header">
      <p class="meta" style="margin: 0;">${escapeHtml(jsonLabel)}: <code>${escapeHtml(jsonOutputUrl)}</code></p>
      <button class="copy-button" type="button" data-copy-value="${escapeHtml(jsonOutputUrl)}" data-copy-target="setupJsonUrlStatus">${escapeHtml(copyJsonLabel)}</button>
    </div>
    <p class="copy-hint" data-copy-status="setupJsonUrlStatus"></p>
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
      ${renderApprovalBoundBootstrapSession(approvalBoundBootstrapSession, locale)}
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
  githubAppBootstrap,
  approvalBoundBootstrapSession
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
      ${renderApprovalBoundBootstrapSession(approvalBoundBootstrapSession, locale)}
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
  const detectedInstallationId = normalizeText(check?.detectedInstallationId);
  const installationCapturePath = normalizeText(check?.installationCapturePath);
  const returnTo = normalizeGitHubAppBootstrapReturnTo(check?.returnTo);
  const requestDetectedInstallationAction = check?.requestDetectedInstallationAction ?? null;
  const requestActionPath = normalizeText(requestDetectedInstallationAction?.path);
  const requestActionReturnTo = normalizeGitHubAppBootstrapReturnTo(
    requestDetectedInstallationAction?.returnTo
  );
  const requestActionPendingInstallationId = normalizeText(
    requestDetectedInstallationAction?.pendingInstallationId
  );
  const requestActionPendingInstallationIdParam =
    normalizeText(requestDetectedInstallationAction?.pendingInstallationIdParam) ||
    "pending_installation_id";
  const requestInstallationSelectionAction = check?.requestInstallationSelectionAction ?? null;
  const selectionRequestActionPath = normalizeText(requestInstallationSelectionAction?.path);
  const selectionRequestActionReturnTo = normalizeGitHubAppBootstrapReturnTo(
    requestInstallationSelectionAction?.returnTo
  );
  const completeDetectedInstallationAction = check?.completeDetectedInstallationAction ?? null;
  const completionActionPath = normalizeText(completeDetectedInstallationAction?.path);
  const completionActionReturnTo = normalizeGitHubAppBootstrapReturnTo(
    completeDetectedInstallationAction?.returnTo
  );
  const completionActionEnvelopeToken = normalizeText(
    completeDetectedInstallationAction?.envelopeToken
  );
  const diagnosticsReturnTo =
    normalizeSetupWizardDiagnosticsReturnTo(returnTo || "/setup/wizard?githubAppCheck=on") ||
    "/setup/wizard?githubAppCheck=on";
  const installationSelectionOptions = Array.isArray(check?.installationSelectionOptions)
    ? check.installationSelectionOptions
        .map((item) => ({
          installationId: normalizeText(item?.installationId),
          accountLogin: normalizeText(item?.accountLogin),
          accountType: normalizeText(item?.accountType)
        }))
        .filter((item) => item.installationId && item.accountLogin)
    : [];
  const listItem = (text) => `<li>${escapeHtml(text)}</li>`;
  const progressVariant = normalizeText(check?.progressVariant);
  const configuredAfterConsume = progressVariant === "post_consume_configured";
  const probeFailedAfterConsume = progressVariant === "post_consume_probe_failed";

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
        state === "not_configured"
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(
                locale === "ja"
                  ? "VTDD は GitHub App bootstrap 前の状態です"
                  : "VTDD is before GitHub App bootstrap"
              )}</strong></p>
              <p><strong>${escapeHtml(locale === "ja" ? "セットアップ進捗" : "Setup progress")}</strong></p>
              <ul>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "GitHub App identity はまだ Worker runtime に保存されていません。"
                    : "GitHub App identity is not stored on Worker runtime yet."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "次に manifest flow で App ID と private key を取得し、runtime に保存します。"
                    : "Next, VTDD acquires App ID and private key through manifest flow and stores them on runtime."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "その後は同じ setup flow で installation detection から binding/readiness へ進みます。"
                    : "Then VTDD continues in the same setup flow from installation detection into binding and readiness."
                )}</li>
              </ul>
            </div>
          `
          : ""
      }
      ${
        state === "partially_configured" &&
        progressVariant === "missing_only_installation"
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(
                locale === "ja"
                  ? "installation binding の残りステップに進んでいます"
                  : "VTDD is narrowed to the remaining installation binding step"
              )}</strong></p>
              <p><strong>${escapeHtml(locale === "ja" ? "セットアップ進捗" : "Setup progress")}</strong></p>
              <ul>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "GitHub App identity は Worker runtime に設定済みです。"
                    : "GitHub App identity is already configured on Worker runtime."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "次は同じ setup flow で installation detection を優先し、手動運搬なしの capture を試みます。"
                    : "Next, VTDD prioritizes installation detection in this same setup flow before manual transport."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "detection が unavailable の場合のみ、bounded fallback として installation ID 設定に進みます。"
                    : "Only if detection stays unavailable does VTDD fall back to bounded installation ID storage."
                )}</li>
              </ul>
              ${
                diagnosticsReturnTo
                  ? `<form method="get" action="${escapeHtml(diagnosticsReturnTo)}"><button type="submit" class="copy-button">${escapeHtml(
                      locale === "ja" ? "live diagnostics を実行" : "Run live diagnostics now"
                    )}</button></form>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        state === "installation_selection_required" &&
        installationCapturePath &&
        installationSelectionOptions.length > 0
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(
                locale === "ja"
                  ? "候補 installation を wizard 内でそのまま選べます"
                  : "You can choose the installation directly in the wizard"
              )}</strong></p>
              <p><strong>${escapeHtml(locale === "ja" ? "セットアップ進捗" : "Setup progress")}</strong></p>
              <ul>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "GitHub から active installation 候補を取得しました。"
                    : "VTDD retrieved active installation candidates from GitHub."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "候補 ID は wizard 内で保持しており、手動コピーは不要です。"
                    : "Candidate IDs stay inside wizard, so manual copy/paste is not required."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "次に owner を選ぶと、VTDD が同じ setup flow で installation capture→binding 設定→readiness 確認へ進みます。"
                    : "Next, selecting the owner lets VTDD continue in the same setup flow through installation capture, binding write, and readiness verification."
                )}</li>
                ${
                  selectionRequestActionPath && selectionRequestActionReturnTo
                    ? listItem(
                        locale === "ja"
                          ? "approval-bound write が利用可能な場合は、先に GO + passkey request を記録すると同じ setup flow で consume/proof を吸収できます。"
                          : "When approval-bound write is available, recording the GO + passkey request first lets VTDD absorb consume/proof in this same setup flow."
                      )
                    : ""
                }
                ${
                  selectionRequestActionPath && selectionRequestActionReturnTo
                    ? listItem(
                        locale === "ja"
                          ? "この GO + passkey 継続は、選択対象となる installation 候補に束縛された single-use の request として扱われます。"
                          : "This GO + passkey continuation is handled as a single-use request bound to the selected installation candidate."
                      )
                    : ""
                }
                <li>${escapeHtml(
                  locale === "ja"
                    ? "選択したい owner が見当たらない場合は GitHub 側で installation を調整し、この setup flow に戻ると VTDD が再検出します。"
                    : "If your owner is not listed, adjust installation scope on GitHub and return to this setup flow so VTDD can re-detect."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "この時点の外部ステップは owner 未掲載時の GitHub 側調整のみで、ID の手動運搬は不要です。"
                    : "At this point, the only external step is GitHub-side scope adjustment when your owner is not listed, and manual ID transport is not needed."
                )}</li>
              </ul>
              ${
                selectionRequestActionPath && selectionRequestActionReturnTo
                  ? `<form method="post" action="${escapeHtml(selectionRequestActionPath)}">
                      <input type="hidden" name="returnTo" value="${escapeHtml(
                        selectionRequestActionReturnTo
                      )}" />
                      <input type="hidden" name="approval_phrase" value="GO" />
                      <input type="hidden" name="passkey_verified" value="true" />
                      <button type="submit" class="copy-button">${escapeHtml(
                        locale === "ja"
                          ? "GO + passkey request を記録して続行"
                          : "Record GO + passkey request and continue"
                      )}</button>
                    </form>`
                  : ""
              }
              <p class="meta">${escapeHtml(
                locale === "ja"
                  ? "GitHub が返した active installation 候補です。値をコピーせず、この setup flow に合う owner を選ぶと VTDD が installation binding を保存します。"
                  : "These are the active installation candidates GitHub returned. Choose the owner that matches this setup flow and VTDD will store the installation binding without asking you to copy values."
              )}</p>
              <div class="button-group">
                ${installationSelectionOptions
                  .map(
                    (item) => `
                      <form method="post" action="${escapeHtml(installationCapturePath)}">
                        <input type="hidden" name="returnTo" value="${escapeHtml(
                          returnTo || "/setup/wizard?githubAppCheck=on"
                        )}" />
                        <input type="hidden" name="GITHUB_APP_INSTALLATION_ID" value="${escapeHtml(
                          item.installationId
                        )}" />
                        <button type="submit" class="copy-button">${escapeHtml(
                          locale === "ja"
                            ? `${item.accountLogin} の installation を使う`
                            : `Use ${item.accountLogin} installation`
                        )}</button>
                      </form>
                      ${
                        selectionRequestActionPath && selectionRequestActionReturnTo
                          ? `<form method="post" action="${escapeHtml(selectionRequestActionPath)}">
                              <input type="hidden" name="returnTo" value="${escapeHtml(
                                selectionRequestActionReturnTo
                              )}" />
                              <input type="hidden" name="approval_phrase" value="GO" />
                              <input type="hidden" name="passkey_verified" value="true" />
                              <input type="hidden" name="pending_installation_id" value="${escapeHtml(
                                item.installationId
                              )}" />
                              <button type="submit" class="copy-button">${escapeHtml(
                                locale === "ja"
                                  ? `GO + passkey request を記録して ${item.accountLogin} の installation を使う`
                                  : `Record GO + passkey request and use ${item.accountLogin} installation`
                              )}</button>
                            </form>`
                          : ""
                      }
                    `
                  )
                  .join("")}
              </div>
              ${
                diagnosticsReturnTo
                  ? `<form method="get" action="${escapeHtml(diagnosticsReturnTo)}"><button type="submit" class="copy-button">${escapeHtml(
                      locale === "ja" ? "live diagnostics を実行" : "Run live diagnostics now"
                    )}</button></form>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        state === "installation_selection_required" &&
        installationSelectionOptions.length === 0
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(
                locale === "ja"
                  ? "installation 候補の確認は GitHub 側での確認が必要です"
                  : "Confirming the installation candidate still needs a GitHub-side check"
              )}</strong></p>
              <p><strong>${escapeHtml(locale === "ja" ? "セットアップ進捗" : "Setup progress")}</strong></p>
              <ul>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "VTDD は active installation 候補を取得しましたが、安全に 1 件へ自動確定できませんでした。"
                    : "VTDD retrieved active installation candidates but could not safely narrow to one installation candidate yet."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "ID の手動コピーではなく、GitHub 側で installation 候補を確認して同じ setup flow に戻る想定です。"
                    : "Instead of manual ID transport, confirm the installation candidate on GitHub and return to the same setup flow."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "次に VTDD が detection を再実行し、installation binding と readiness 確認へ進みます。"
                    : "Next, VTDD will rerun detection and continue into installation binding and readiness verification."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "この時点の外部ステップは GitHub 側での installation 範囲調整のみで、ID の手動運搬は不要です。"
                    : "At this point, the only external step is adjusting installation scope on GitHub, without manual ID transport."
                )}</li>
              </ul>
              ${
                diagnosticsReturnTo
                  ? `<form method="get" action="${escapeHtml(diagnosticsReturnTo)}"><button type="submit" class="copy-button">${escapeHtml(
                      locale === "ja" ? "live diagnostics を実行" : "Run live diagnostics now"
                    )}</button></form>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        state === "awaiting_installation"
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(
                locale === "ja"
                  ? "VTDD は installation の出現を短く再確認しています"
                  : "VTDD is briefly rechecking for the installation"
              )}</strong></p>
              <p><strong>${escapeHtml(locale === "ja" ? "Setup progress" : "Setup progress")}</strong></p>
              <ul>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "VTDD は GitHub App identity を保持したまま installation 出現を確認中です。"
                    : "VTDD already has GitHub App identity and is now waiting for installation visibility."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "同じ setup flow で短時間の自動再確認を行い、手動の再入力は求めません。"
                    : "VTDD is retrying briefly in the same setup flow without asking for manual re-entry."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "GitHub 側で installation が反映され次第、そのまま detection から binding/readiness へ進みます。"
                    : "Once GitHub exposes the installation, VTDD will continue directly from detection into binding and readiness."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "この時点の外部ステップは GitHub 側の installation 同意のみで、ID の手動コピーは不要です。"
                    : "At this point, the only external step is GitHub-side installation consent, and manual ID copy/paste is not needed."
                )}</li>
              </ul>
              ${
                diagnosticsReturnTo
                  ? `<form method="get" action="${escapeHtml(diagnosticsReturnTo)}"><button type="submit" class="copy-button">${escapeHtml(
                      locale === "ja" ? "live diagnostics を実行" : "Run live diagnostics now"
                    )}</button></form>`
                  : ""
              }
              <p class="meta">${escapeHtml(
                locale === "ja"
                  ? "同じ setup flow の中で数回だけ自動再確認します。GitHub 側で install が反映されれば、そのまま detection に進みます。"
                  : "VTDD will retry this check a few times in the same setup flow. If GitHub finishes exposing the installation, the wizard will move straight into detection."
              )}</p>
            </div>
          `
          : ""
      }
      ${
        state === "probe_failed" && probeFailedAfterConsume
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(
                locale === "ja"
                  ? "installation binding 後の live readiness probe が fail-closed でした"
                  : "The live readiness probe failed closed after installation binding"
              )}</strong></p>
              <p><strong>${escapeHtml(locale === "ja" ? "Setup progress" : "Setup progress")}</strong></p>
              <ul>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "installation binding は同じ setup flow で設定済みです。"
                    : "Installation binding is already stored in this same setup flow."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "今回の停止点は installation detection ではなく、直後の live readiness probe です。"
                    : "This stop is not installation detection; it is the immediate live readiness probe."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "installation binding 用の single-use request はこの setup flow ですでに消費済みとして吸収されています。"
                    : "The single-use request for installation binding is already consumed and absorbed in this setup flow."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "installation candidate が変わらない限り、この段階で GO + passkey request を新規に再発行する必要はありません。"
                    : "Unless the installation candidate changes, no new GO + passkey request is needed at this stage."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "probe blocker を解消したら同じ setup flow で readiness を再確認し、verified 状態へ進みます。"
                    : "After clearing the probe blocker, rerun readiness in the same setup flow to move to verified state."
                )}</li>
              </ul>
              ${
                diagnosticsReturnTo
                  ? `<form method="get" action="${escapeHtml(diagnosticsReturnTo)}"><button type="submit" class="copy-button">${escapeHtml(
                      locale === "ja" ? "live diagnostics を実行" : "Run live diagnostics now"
                    )}</button></form>`
                  : ""
              }
            </div>
          `
          : state === "probe_failed"
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(
                locale === "ja"
                  ? "installation 検出は fail-closed で停止し、同じ flow で復旧待ちです"
                  : "Installation detection failed closed and is waiting for in-flow recovery"
              )}</strong></p>
              <p><strong>${escapeHtml(locale === "ja" ? "Setup progress" : "Setup progress")}</strong></p>
              <ul>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "GitHub App identity の前提は保持したまま、検出 probe の失敗原因を確認中です。"
                    : "VTDD keeps the existing GitHub App identity context while diagnosing the detection probe failure."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "manual secret/ID の運搬ではなく、同じ setup flow で githubAppCheck=on を再実行します。"
                    : "Instead of manual secret/ID transport, rerun githubAppCheck=on in this same setup flow."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "probe blocker が解消されると、VTDD は installation detection から binding/readiness へ再開します。"
                    : "Once the probe blocker is cleared, VTDD resumes from installation detection into binding and readiness."
                )}</li>
              </ul>
              ${
                diagnosticsReturnTo
                  ? `<form method="get" action="${escapeHtml(diagnosticsReturnTo)}"><button type="submit" class="copy-button">${escapeHtml(
                      locale === "ja" ? "live diagnostics を実行" : "Run live diagnostics now"
                    )}</button></form>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        state === "configured" && configuredAfterConsume
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(
                locale === "ja"
                  ? "installation binding は完了し、次は live readiness 確認です"
                  : "Installation binding is complete, and the next step is live readiness verification"
              )}</strong></p>
              <p><strong>${escapeHtml(locale === "ja" ? "Setup progress" : "Setup progress")}</strong></p>
              <ul>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "installation binding は同じ setup flow ですでに保存されています。"
                    : "Installation binding is already stored in this same setup flow."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "次は installation capture をやり直さず、live readiness diagnostics を実行する段階です。"
                    : "The next step is live readiness diagnostics, not another installation capture step."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "installation binding 用の single-use request はこの setup flow ですでに消費済みとして吸収されています。"
                    : "The single-use request for installation binding is already consumed and absorbed in this setup flow."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "installation candidate が変わらない限り、この段階で GO + passkey request を新規に再発行する必要はありません。"
                    : "Unless the installation candidate changes, no new GO + passkey request is needed at this stage."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "githubAppCheck=on を同じ flow で再実行すると、verified へ向けた readiness 証跡を更新できます。"
                    : "Rerunning githubAppCheck=on in the same flow refreshes readiness evidence toward verified state."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "この段階では外部プロバイダ画面への追加移動や installation ID の手動運搬は不要です。"
                    : "At this stage, no extra external-provider redirect or manual installation ID transport is needed."
                )}</li>
              </ul>
              ${
                diagnosticsReturnTo
                  ? `<form method="get" action="${escapeHtml(diagnosticsReturnTo)}"><button type="submit" class="copy-button">${escapeHtml(
                      locale === "ja" ? "live diagnostics を実行" : "Run live diagnostics now"
                    )}</button></form>`
                  : ""
              }
            </div>
          `
          : state === "configured"
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(
                locale === "ja"
                  ? "GitHub App runtime 設定は完了し、次は live 診断です"
                  : "GitHub App runtime configuration is complete, and live diagnostics is next"
              )}</strong></p>
              <p><strong>${escapeHtml(locale === "ja" ? "Setup progress" : "Setup progress")}</strong></p>
              <ul>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "GitHub App bootstrap の必須 runtime 設定は Worker 上で揃っています。"
                    : "Required GitHub App bootstrap runtime settings are present on Worker."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "次に githubAppCheck=on で token mint と live repository access を確認します。"
                    : "Next, run githubAppCheck=on to verify token minting and live repository access."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "この live readiness 証跡が揃うと、wizard は verified の進捗を示せます。"
                    : "Once live readiness evidence is recorded, wizard can report verified progress."
                )}</li>
              </ul>
              ${
                diagnosticsReturnTo
                  ? `<form method="get" action="${escapeHtml(diagnosticsReturnTo)}"><button type="submit" class="copy-button">${escapeHtml(
                      locale === "ja" ? "live diagnostics を実行" : "Run live diagnostics now"
                    )}</button></form>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        state === "installation_detected" &&
        completionActionPath &&
        completionActionReturnTo &&
        completionActionEnvelopeToken
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(
                locale === "ja"
                  ? "VTDD が installation を検出し、そのまま継続できます"
                  : "VTDD found the installation and can continue now"
              )}</strong></p>
              <p><strong>${escapeHtml(locale === "ja" ? "Setup progress" : "Setup progress")}</strong></p>
              <ul>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "GitHub App installation を検出しました。"
                    : "GitHub App installation detected."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "この setup flow は検出済み installation 候補と結び付いています。"
                    : "This setup flow is now bound to the detected installation candidate."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "次に VTDD が installation binding を設定し、設定後そのまま readiness 確認に進みます。"
                    : "Next, VTDD will store the installation binding and then continue directly into readiness verification."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "この時点では外部プロバイダ画面への追加移動は不要で、この wizard 内でそのまま続行できます。"
                    : "At this point, no extra external-provider redirect is needed; continuation stays inside this wizard."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "この consume 継続は、検出済み installation 候補に束縛された single-use として扱われます。"
                    : "This consume continuation is handled as single-use and bound to the detected installation candidate."
                )}</li>
              </ul>
              <p class="meta">${escapeHtml(
                locale === "ja"
                  ? "GitHub 側の同意が終わっていれば、ここで続行するだけで VTDD が installation binding を保存し、そのまま readiness 確認まで進めます。"
                  : "If the GitHub-side consent is done, continuing here is enough for VTDD to store installation binding and move straight into readiness verification."
              )}</p>
              <form method="post" action="${escapeHtml(completionActionPath)}">
                <input type="hidden" name="returnTo" value="${escapeHtml(
                  completionActionReturnTo
                )}" />
                <input type="hidden" name="envelope_token" value="${escapeHtml(
                  completionActionEnvelopeToken
                )}" />
                <button type="submit" class="copy-button">${escapeHtml(
                  locale === "ja"
                    ? "検出した Installation を保存して続行"
                    : "Store detected installation and continue"
                )}</button>
              </form>
            </div>
          `
          : state === "installation_detected" && requestActionPath && requestActionReturnTo
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(
                locale === "ja"
                  ? "VTDD が installation を検出しました。次は承認つきで続行します"
                  : "VTDD found the installation. The next step is approval-bound continuation"
              )}</strong></p>
              <p><strong>${escapeHtml(locale === "ja" ? "Setup progress" : "Setup progress")}</strong></p>
              <ul>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "GitHub App installation を検出しました。"
                    : "GitHub App installation detected."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "VTDD は manual ID 運搬なしで同じ setup flow を保っています。"
                    : "VTDD is keeping the same setup flow without asking for manual ID transport."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "次に GO + passkey request を記録すると、VTDD が installation binding と readiness 確認に進みます。"
                    : "Next, recording the GO + passkey request lets VTDD continue into installation binding and readiness verification."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "この時点では外部プロバイダ画面への追加移動は不要で、wizard 内の承認つき続行だけで進めます。"
                    : "At this point, no extra external-provider redirect is needed; continuation stays inside this wizard with approval."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "この GO + passkey 継続は検出済み候補に束縛された single-use の request として扱われます。"
                    : "This GO + passkey continuation is handled as a single-use request bound to the detected candidate."
                )}</li>
              </ul>
              <p class="meta">${escapeHtml(
                locale === "ja"
                  ? "追加の値の運搬ではなく、ここで GO + passkey request を記録すると、VTDD が同じ setup flow の中で installation binding と readiness 確認に進みます。"
                  : "Instead of asking you to carry values manually, this records the GO + passkey request so VTDD can continue into installation binding and readiness in the same setup flow."
              )}</p>
              <form method="post" action="${escapeHtml(requestActionPath)}">
                <input type="hidden" name="returnTo" value="${escapeHtml(
                  requestActionReturnTo
                )}" />
                <input type="hidden" name="approval_phrase" value="GO" />
                <input type="hidden" name="passkey_verified" value="true" />
                <input type="hidden" name="${escapeHtml(
                  requestActionPendingInstallationIdParam
                )}" value="${escapeHtml(requestActionPendingInstallationId)}" />
                <button type="submit" class="copy-button">${escapeHtml(
                  locale === "ja"
                    ? "GO + passkey で続行"
                    : "Continue with GO + passkey"
                )}</button>
              </form>
            </div>
          `
          : state === "installation_detected" && detectedInstallationId && installationCapturePath
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(
                locale === "ja"
                  ? "VTDD が installation を 1 件検出しました"
                  : "VTDD found a single GitHub App installation"
              )}</strong></p>
              <p><strong>${escapeHtml(locale === "ja" ? "Setup progress" : "Setup progress")}</strong></p>
              <ul>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "GitHub App installation を 1 件検出しました。"
                    : "A single GitHub App installation was detected."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "検出した installation ID はこの setup flow の候補として保持されています。"
                    : "VTDD is keeping the detected installation candidate in this setup flow."
                )}</li>
                <li>${escapeHtml(
                  locale === "ja"
                    ? "次に VTDD が installation binding を設定し、そのまま readiness 確認に進みます。"
                    : "Next, VTDD will store installation binding and continue into readiness verification."
                )}</li>
              </ul>
              <p class="meta">${escapeHtml(
                locale === "ja"
                  ? "この installation ID を保存すると、VTDD は short-lived installation token を mint できる状態に近づきます。"
                  : "Saving this installation ID moves VTDD closer to minting short-lived installation tokens."
              )}</p>
              <form method="post" action="${escapeHtml(installationCapturePath)}">
                <input type="hidden" name="returnTo" value="${escapeHtml(
                  returnTo || "/setup/wizard?githubAppCheck=on"
                )}" />
                <input type="hidden" name="GITHUB_APP_INSTALLATION_ID" value="${escapeHtml(
                  detectedInstallationId
                )}" />
                <button type="submit" class="copy-button">${escapeHtml(
                  locale === "ja"
                    ? "検出した Installation を保存して続行"
                    : "Store detected installation and continue"
                )}</button>
              </form>
            </div>
          `
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
              <p class="meta">${escapeHtml(locale === "ja" ? "この step では、VTDD が GitHub を安全に触るための身分証を作りに行きます。戻ってくると App ID と private key が Worker runtime に保存されます。" : "This step creates the GitHub-side identity VTDD needs for safe execution. When you return, App ID and private key will be stored on Worker runtime.")}</p>
              <form method="post" action="${escapeHtml(manifestLaunch.action)}">
                <input type="hidden" name="manifest" value="${escapeHtml(manifestLaunch.manifest)}" />
                <button type="submit" class="copy-button">${escapeHtml(locale === "ja" ? "GitHub App を自動作成" : "Create GitHub App Automatically")}</button>
              </form>
            </div>
          `
          : ""
      }
      ${
        state === "available" && !manifestLaunch
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

function buildConsumeFailedProgressHint({ locale, consumeResultNextProof }) {
  const id = normalizeText(consumeResultNextProof?.id);
  if (id === "github_app_installation_capture_pending_selection_state_drifted") {
    return locale === "ja"
      ? "次に同じ setup flow で installation detection を再実行し、現在の capturable state で fresh envelope を再発行してください。"
      : "Next, rerun installation detection in this same setup flow, then reissue a fresh envelope for the current capturable state.";
  }

  if (
    id === "github_app_installation_capture_pending_selection_mismatch" ||
    id === "github_app_installation_capture_detected_id_mismatch" ||
    id === "github_app_installation_capture_invalid_selection_candidate"
  ) {
    return locale === "ja"
      ? "次にこの setup flow の現在候補に一致する installation で再試行し、fresh envelope で consume をやり直してください。"
      : "Next, retry with the installation candidate that matches this setup flow, then consume again with a fresh envelope.";
  }

  return locale === "ja"
    ? "次に bounded write 経路を復元し、fresh envelope で再実行してください。"
    : "Next, restore the bounded write path and retry with a fresh envelope.";
}

function buildConsumeResultRequiredActionLabel({ locale, actionId }) {
  if (actionId === "run_live_readiness_diagnostics_same_flow") {
    return locale === "ja" ? "live diagnostics を実行" : "Run live diagnostics now";
  }

  return locale === "ja" ? "同じ setup flow で再確認する" : "Retry in same setup flow";
}

function shouldRenderConsumeResultNextProof({ consumeResultNextProof, consumeResultRequiredAction }) {
  const nextProofId = normalizeText(consumeResultNextProof?.id);
  if (!nextProofId) {
    return false;
  }

  if (
    nextProofId === "live_readiness_verified_in_same_flow" &&
    !normalizeText(consumeResultRequiredAction?.id)
  ) {
    return false;
  }

  return true;
}

function renderApprovalBoundBootstrapSession(session, locale = "en") {
  const state = normalizeText(session?.state) || "deferred";
  const summary =
    normalizeText(session?.summary) ||
    "Approval-bound bootstrap session status is not available.";
  const guidance = Array.isArray(session?.guidance) ? session.guidance : [];
  const targetAbsorbs = Array.isArray(session?.targetAbsorbs) ? session.targetAbsorbs : [];
  const approvalBoundary = normalizeText(session?.approvalBoundary);
  const checkedAt = normalizeText(session?.checkedAt);
  const requestPath =
    normalizeText(session?.requestPath) ||
    SETUP_WIZARD_APPROVAL_BOUND_BOOTSTRAP_SESSION_REQUEST_PATH;
  const requiredAction = session?.requiredAction ?? null;
  const pendingInstallationIdParam =
    normalizeText(requiredAction?.pendingInstallationIdParam) || "pending_installation_id";
  const pendingInstallationId = normalizeText(requiredAction?.pendingInstallationId);
  const requestEnabled = toBoolean(session?.requestEnabled);
  const requestSurfacedInline = toBoolean(session?.requestSurfacedInline);
  const returnTo = normalizeReturnTo(session?.returnTo) || "/setup/wizard";
  const contract = session?.contract ?? null;
  const allowlistedSecrets = Array.isArray(contract?.allowlistedSecrets)
    ? contract.allowlistedSecrets
    : [];
  const authorityState = normalizeText(contract?.authorityState);
  const sessionMode = normalizeText(contract?.sessionMode);
  const issuance = normalizeText(contract?.issuance);
  const maxAgeSeconds = Number.isFinite(Number(contract?.maxAgeSeconds))
    ? Number(contract.maxAgeSeconds)
    : null;
  const singleUse = toBoolean(contract?.singleUse);
  const attestationState = normalizeText(contract?.attestationState);
  const preview = contract?.preview ?? null;
  const writeTarget = normalizeText(preview?.writeTarget);
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const postChecks = Array.isArray(preview?.postChecks) ? preview.postChecks : [];
  const blockedBy = Array.isArray(preview?.blockedBy) ? preview.blockedBy : [];
  const recommendedNextStep = session?.recommendedNextStep ?? null;
  const nextStepId = normalizeText(recommendedNextStep?.id);
  const nextStepSummary = normalizeText(recommendedNextStep?.summary);
  const nextStepAction = normalizeText(recommendedNextStep?.action);
  const stepBoundaries = session?.stepBoundaries ?? null;
  const vtddOwnedSteps = Array.isArray(stepBoundaries?.vtddOwnedSteps)
    ? stepBoundaries.vtddOwnedSteps
    : [];
  const externalRedirects = Array.isArray(stepBoundaries?.externalRedirects)
    ? stepBoundaries.externalRedirects
    : [];
  const capabilityReadout = session?.capabilityReadout ?? null;
  const githubConnection = capabilityReadout?.githubConnection ?? null;
  const workerRuntime = capabilityReadout?.workerRuntime ?? null;
  const vtddCapability = capabilityReadout?.vtddCapability ?? null;
  const phaseReadout = session?.phaseReadout ?? null;
  const currentPhase = phaseReadout?.currentPhase ?? null;
  const nextCapability = phaseReadout?.nextCapability ?? null;
  const transitionTrigger = phaseReadout?.transitionTrigger ?? null;
  const progressReadout = session?.progressReadout ?? null;
  const completedPhases = Array.isArray(progressReadout?.completedPhases)
    ? progressReadout.completedPhases
    : [];
  const currentBlocker = progressReadout?.currentBlocker ?? null;
  const remainingPhases = Array.isArray(progressReadout?.remainingPhases)
    ? progressReadout.remainingPhases
    : [];
  const providerConnectionReadout = session?.providerConnectionReadout ?? null;
  const githubProviderPhase = providerConnectionReadout?.github ?? null;
  const cloudflareProviderPhase = providerConnectionReadout?.cloudflare ?? null;
  const serviceConnectionModelReadout = session?.serviceConnectionModelReadout ?? null;
  const githubConnectionModel = serviceConnectionModelReadout?.github ?? null;
  const cloudflareConnectionModel = serviceConnectionModelReadout?.cloudflare ?? null;
  const serviceConnectionActionability = session?.serviceConnectionActionability ?? null;
  const githubConnectionActionability = serviceConnectionActionability?.github ?? null;
  const cloudflareConnectionActionability = serviceConnectionActionability?.cloudflare ?? null;
  const serviceConnectionFrictionReadout = session?.serviceConnectionFrictionReadout ?? null;
  const githubConnectionFriction = serviceConnectionFrictionReadout?.github ?? null;
  const cloudflareConnectionFriction = serviceConnectionFrictionReadout?.cloudflare ?? null;
  const serviceConnectionHandoffShapeReadout =
    session?.serviceConnectionHandoffShapeReadout ?? null;
  const githubConnectionHandoff = serviceConnectionHandoffShapeReadout?.github ?? null;
  const cloudflareConnectionHandoff = serviceConnectionHandoffShapeReadout?.cloudflare ?? null;
  const serviceConnectionReturnContinuityReadout =
    session?.serviceConnectionReturnContinuityReadout ?? null;
  const githubReturnContinuity = serviceConnectionReturnContinuityReadout?.github ?? null;
  const cloudflareReturnContinuity =
    serviceConnectionReturnContinuityReadout?.cloudflare ?? null;
  const responsibilityReadout = session?.responsibilityReadout ?? null;
  const humanStep = responsibilityReadout?.humanStep ?? null;
  const vtddStep = responsibilityReadout?.vtddStep ?? null;
  const providerStep = responsibilityReadout?.providerStep ?? null;
  const authBoundaryReadout = session?.authBoundaryReadout ?? null;
  const serviceAccess = authBoundaryReadout?.serviceAccess ?? null;
  const operatorBootstrapAuthority = authBoundaryReadout?.operatorBootstrapAuthority ?? null;
  const externalAccountConnection = authBoundaryReadout?.externalAccountConnection ?? null;
  const runtimeMachineAuth = authBoundaryReadout?.runtimeMachineAuth ?? null;
  const issuanceReadout = session?.issuanceReadout ?? null;
  const issuableState = issuanceReadout?.issuableState ?? null;
  const blockingGate = issuanceReadout?.blockingGate ?? null;
  const nextIssuanceCondition = issuanceReadout?.nextIssuanceCondition ?? null;
  const authorityShapeReadout = session?.authorityShapeReadout ?? null;
  const authorityOwner = authorityShapeReadout?.authorityOwner ?? null;
  const authorityScope = authorityShapeReadout?.authorityScope ?? null;
  const authorityAudit = authorityShapeReadout?.authorityAudit ?? null;
  const authorityExpiryReadout = session?.authorityExpiryReadout ?? null;
  const expiryTrigger = authorityExpiryReadout?.expiryTrigger ?? null;
  const expiryWindow = authorityExpiryReadout?.expiryWindow ?? null;
  const expiryAfterUse = authorityExpiryReadout?.expiryAfterUse ?? null;
  const authorityRenewalReadout = session?.authorityRenewalReadout ?? null;
  const renewalTrigger = authorityRenewalReadout?.renewalTrigger ?? null;
  const renewalGate = authorityRenewalReadout?.renewalGate ?? null;
  const renewalScope = authorityRenewalReadout?.renewalScope ?? null;
  const authorityRenewalDenialReadout = session?.authorityRenewalDenialReadout ?? null;
  const denialReason = authorityRenewalDenialReadout?.denialReason ?? null;
  const denialBoundary = authorityRenewalDenialReadout?.denialBoundary ?? null;
  const denialRecovery = authorityRenewalDenialReadout?.denialRecovery ?? null;
  const authorityRequestFreshnessReadout = session?.authorityRequestFreshnessReadout ?? null;
  const freshnessRequirement = authorityRequestFreshnessReadout?.freshnessRequirement ?? null;
  const staleRequestRejection = authorityRequestFreshnessReadout?.staleRequestRejection ?? null;
  const freshnessRecovery = authorityRequestFreshnessReadout?.freshnessRecovery ?? null;
  const authorityRequestReplayReadout = session?.authorityRequestReplayReadout ?? null;
  const replayRisk = authorityRequestReplayReadout?.replayRisk ?? null;
  const replayRejection = authorityRequestReplayReadout?.replayRejection ?? null;
  const replayRecovery = authorityRequestReplayReadout?.replayRecovery ?? null;
  const authorityRequestBindingReadout = session?.authorityRequestBindingReadout ?? null;
  const bindingTarget = authorityRequestBindingReadout?.bindingTarget ?? null;
  const bindingDrift = authorityRequestBindingReadout?.bindingDrift ?? null;
  const bindingRecovery = authorityRequestBindingReadout?.bindingRecovery ?? null;
  const authorityRequestTargetReadout = session?.authorityRequestTargetReadout ?? null;
  const targetContext = authorityRequestTargetReadout?.targetContext ?? null;
  const targetDrift = authorityRequestTargetReadout?.targetDrift ?? null;
  const targetRecovery = authorityRequestTargetReadout?.targetRecovery ?? null;
  const authorityRequestProvenanceReadout = session?.authorityRequestProvenanceReadout ?? null;
  const provenanceSource = authorityRequestProvenanceReadout?.provenanceSource ?? null;
  const provenanceDrift = authorityRequestProvenanceReadout?.provenanceDrift ?? null;
  const provenanceRecovery = authorityRequestProvenanceReadout?.provenanceRecovery ?? null;
  const sessionEnvelope = session?.sessionEnvelope ?? null;
  const envelopeState = sessionEnvelope?.state ?? null;
  const envelopeId = sessionEnvelope?.envelopeId ?? null;
  const envelopeToken = sessionEnvelope?.envelopeToken ?? null;
  const envelopeExpiresAt = sessionEnvelope?.expiresAt ?? null;
  const envelopeSingleUse = sessionEnvelope?.singleUse ?? null;
  const envelopeBoundScope = sessionEnvelope?.boundScope ?? null;
  const consumePath =
    normalizeText(session?.consumePath) ||
    SETUP_WIZARD_APPROVAL_BOUND_BOOTSTRAP_SESSION_CONSUME_PATH;
  const consumeEnabled = toBoolean(session?.consumeEnabled);
  const consumeSurfacedInline = toBoolean(session?.consumeSurfacedInline);
  const envelopeConsumeResult = session?.envelopeConsumeResult ?? null;
  const consumeResultState = envelopeConsumeResult?.state ?? null;
  const consumeResultSummary = envelopeConsumeResult?.summary ?? null;
  const consumeResultEnvelopeId = envelopeConsumeResult?.envelopeId ?? null;
  const consumeResultNextProof = envelopeConsumeResult?.nextProof ?? null;
  const consumeResultRequiredAction = envelopeConsumeResult?.requiredAction ?? null;
  const consumeResultProof = envelopeConsumeResult?.proof ?? null;
  const envelopeConsumptionPlan = session?.envelopeConsumptionPlan ?? null;
  const consumptionIntent = envelopeConsumptionPlan?.consumptionIntent ?? null;
  const consumptionBoundary = envelopeConsumptionPlan?.consumptionBoundary ?? null;
  const consumptionVerification = envelopeConsumptionPlan?.consumptionVerification ?? null;
  const envelopeConsumePreflight = session?.envelopeConsumePreflight ?? null;
  const preflightGate = envelopeConsumePreflight?.preflightGate ?? null;
  const preflightFailure = envelopeConsumePreflight?.preflightFailure ?? null;
  const preflightRecovery = envelopeConsumePreflight?.preflightRecovery ?? null;
  const envelopeConsumeOutcome = session?.envelopeConsumeOutcome ?? null;
  const outcomeState = envelopeConsumeOutcome?.outcomeState ?? null;
  const outcomeFailure = envelopeConsumeOutcome?.outcomeFailure ?? null;
  const outcomeNextProof = envelopeConsumeOutcome?.outcomeNextProof ?? null;
  const envelopeConsumeAuditReadout = session?.envelopeConsumeAuditReadout ?? null;
  const auditRecord = envelopeConsumeAuditReadout?.auditRecord ?? null;
  const auditFailure = envelopeConsumeAuditReadout?.auditFailure ?? null;
  const auditRetention = envelopeConsumeAuditReadout?.auditRetention ?? null;
  const completionReadout = session?.completionReadout ?? null;
  const claimState = completionReadout?.claimState ?? null;
  const cannotYetClaim = completionReadout?.cannotYetClaim ?? null;
  const claimBecomesValidWhen = completionReadout?.claimBecomesValidWhen ?? null;
  const evidenceReadout = session?.evidenceReadout ?? null;
  const runtimeEvidence = Array.isArray(evidenceReadout?.runtimeEvidence)
    ? evidenceReadout.runtimeEvidence
    : [];
  const blockedEvidence = Array.isArray(evidenceReadout?.blockedEvidence)
    ? evidenceReadout.blockedEvidence
    : [];
  const nextProof = evidenceReadout?.nextProof ?? null;
  const safetyReadout = session?.safetyReadout ?? null;
  const stopReason = safetyReadout?.stopReason ?? null;
  const invariantProtected = safetyReadout?.invariantProtected ?? null;
  const unsafeShortcutDenied = safetyReadout?.unsafeShortcutDenied ?? null;

  return `
    <h2>${escapeHtml(locale === "ja" ? "承認境界つき Bootstrap Session" : "Approval-Bound Bootstrap Session")}</h2>
    <div class="block">
      <p><strong>state:</strong> <code>${escapeHtml(state)}</code></p>
      <p>${escapeHtml(summary)}</p>
      ${
        approvalBoundary
          ? `<p><strong>${escapeHtml(locale === "ja" ? "Approval boundary" : "Approval boundary")}:</strong> <code>${escapeHtml(approvalBoundary)}</code></p>`
          : ""
      }
      ${
        targetAbsorbs.length > 0
          ? `<p><strong>${escapeHtml(locale === "ja" ? "この path が吸収したい step" : "Steps this path is intended to absorb")}:</strong> ${targetAbsorbs
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
        recommendedNextStep
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Recommended next step" : "Recommended next step")}:</strong></p>
              ${
                nextStepId
                  ? `<p><code>${escapeHtml(nextStepId)}</code></p>`
                  : ""
              }
              ${
                nextStepSummary
                  ? `<p>${escapeHtml(nextStepSummary)}</p>`
                  : ""
              }
              ${
                nextStepAction
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Action" : "Action")}:</strong> <code>${escapeHtml(nextStepAction)}</code></p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        stepBoundaries
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Step boundary" : "Step boundary")}:</strong></p>
              ${
                vtddOwnedSteps.length > 0
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "VTDD-owned steps" : "VTDD-owned steps")}:</strong> ${vtddOwnedSteps
                      .map((item) => `<code>${escapeHtml(item)}</code>`)
                      .join(", ")}</p>`
                  : ""
              }
              ${
                externalRedirects.length > 0
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Remaining external redirects" : "Remaining external redirects")}:</strong> ${externalRedirects
                      .map((item) => `<code>${escapeHtml(item)}</code>`)
                      .join(", ")}</p>`
                  : `<p><strong>${escapeHtml(locale === "ja" ? "Remaining external redirects" : "Remaining external redirects")}:</strong> ${escapeHtml(
                      locale === "ja" ? "none" : "none"
                    )}</p>`
              }
            </div>
          `
          : ""
      }
      ${
        capabilityReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Capability readout" : "Capability readout")}:</strong></p>
              ${
                githubConnection
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "GitHub connection" : "GitHub connection")}:</strong> <code>${escapeHtml(normalizeText(githubConnection.state))}</code> ${escapeHtml(normalizeText(githubConnection.summary))}</p>`
                  : ""
              }
              ${
                workerRuntime
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Worker runtime" : "Worker runtime")}:</strong> <code>${escapeHtml(normalizeText(workerRuntime.state))}</code> ${escapeHtml(normalizeText(workerRuntime.summary))}</p>`
                  : ""
              }
              ${
                vtddCapability
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "VTDD capability" : "VTDD capability")}:</strong> <code>${escapeHtml(normalizeText(vtddCapability.state))}</code> ${escapeHtml(normalizeText(vtddCapability.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        phaseReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Flow phase" : "Flow phase")}:</strong></p>
              ${
                currentPhase
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Current phase" : "Current phase")}:</strong> <code>${escapeHtml(normalizeText(currentPhase.id))}</code> ${escapeHtml(normalizeText(currentPhase.summary))}</p>`
                  : ""
              }
              ${
                nextCapability
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Next capability" : "Next capability")}:</strong> <code>${escapeHtml(normalizeText(nextCapability.id))}</code> ${escapeHtml(normalizeText(nextCapability.summary))}</p>`
                  : ""
              }
              ${
                transitionTrigger
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Transition trigger" : "Transition trigger")}:</strong> <code>${escapeHtml(normalizeText(transitionTrigger.id))}</code> ${escapeHtml(normalizeText(transitionTrigger.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        progressReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Flow progress" : "Flow progress")}:</strong></p>
              ${
                completedPhases.length > 0
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Completed phases" : "Completed phases")}:</strong> ${completedPhases
                      .map((item) => `<code>${escapeHtml(item)}</code>`)
                      .join(", ")}</p>`
                  : `<p><strong>${escapeHtml(locale === "ja" ? "Completed phases" : "Completed phases")}:</strong> ${escapeHtml(
                      locale === "ja" ? "none yet" : "none yet"
                    )}</p>`
              }
              ${
                currentBlocker
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Current blocker" : "Current blocker")}:</strong> <code>${escapeHtml(normalizeText(currentBlocker.id))}</code> ${escapeHtml(normalizeText(currentBlocker.summary))}</p>`
                  : ""
              }
              ${
                remainingPhases.length > 0
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Remaining phases" : "Remaining phases")}:</strong> ${remainingPhases
                      .map((item) => `<code>${escapeHtml(item)}</code>`)
                      .join(", ")}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        providerConnectionReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Provider connection phase" : "Provider connection phase")}:</strong></p>
              ${
                githubProviderPhase
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "GitHub phase" : "GitHub phase")}:</strong> <code>${escapeHtml(normalizeText(githubProviderPhase.id))}</code> ${escapeHtml(normalizeText(githubProviderPhase.summary))}</p>`
                  : ""
              }
              ${
                cloudflareProviderPhase
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Cloudflare phase" : "Cloudflare phase")}:</strong> <code>${escapeHtml(normalizeText(cloudflareProviderPhase.id))}</code> ${escapeHtml(normalizeText(cloudflareProviderPhase.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        serviceConnectionModelReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Service connection model" : "Service connection model")}:</strong></p>
              ${
                githubConnectionModel
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "GitHub connection" : "GitHub connection")}:</strong> <code>${escapeHtml(normalizeText(githubConnectionModel.id))}</code> ${escapeHtml(normalizeText(githubConnectionModel.summary))} <strong>${escapeHtml(locale === "ja" ? "Type" : "Type")}:</strong> <code>${escapeHtml(normalizeText(githubConnectionModel.connectionType))}</code> <strong>${escapeHtml(locale === "ja" ? "Needed for" : "Needed for")}:</strong> ${escapeHtml(normalizeText(githubConnectionModel.requiredBecause))}</p>`
                  : ""
              }
              ${
                cloudflareConnectionModel
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Cloudflare connection" : "Cloudflare connection")}:</strong> <code>${escapeHtml(normalizeText(cloudflareConnectionModel.id))}</code> ${escapeHtml(normalizeText(cloudflareConnectionModel.summary))} <strong>${escapeHtml(locale === "ja" ? "Type" : "Type")}:</strong> <code>${escapeHtml(normalizeText(cloudflareConnectionModel.connectionType))}</code> <strong>${escapeHtml(locale === "ja" ? "Needed for" : "Needed for")}:</strong> ${escapeHtml(normalizeText(cloudflareConnectionModel.requiredBecause))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        serviceConnectionActionability
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Service connection actionability" : "Service connection actionability")}:</strong></p>
              ${
                githubConnectionActionability
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "GitHub action" : "GitHub action")}:</strong> <code>${escapeHtml(normalizeText(githubConnectionActionability.id))}</code> ${escapeHtml(normalizeText(githubConnectionActionability.summary))} <strong>${escapeHtml(locale === "ja" ? "User action needed now" : "User action needed now")}:</strong> <code>${escapeHtml(normalizeText(githubConnectionActionability.userActionNeededNow))}</code>${
                      githubConnectionActionability.expectedActionType
                        ? ` <strong>${escapeHtml(locale === "ja" ? "Expected action type" : "Expected action type")}:</strong> <code>${escapeHtml(normalizeText(githubConnectionActionability.expectedActionType))}</code>`
                        : ""
                    }</p>`
                  : ""
              }
              ${
                cloudflareConnectionActionability
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Cloudflare action" : "Cloudflare action")}:</strong> <code>${escapeHtml(normalizeText(cloudflareConnectionActionability.id))}</code> ${escapeHtml(normalizeText(cloudflareConnectionActionability.summary))} <strong>${escapeHtml(locale === "ja" ? "User action needed now" : "User action needed now")}:</strong> <code>${escapeHtml(normalizeText(cloudflareConnectionActionability.userActionNeededNow))}</code>${
                      cloudflareConnectionActionability.expectedActionType
                        ? ` <strong>${escapeHtml(locale === "ja" ? "Expected action type" : "Expected action type")}:</strong> <code>${escapeHtml(normalizeText(cloudflareConnectionActionability.expectedActionType))}</code>`
                        : ""
                    }</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        serviceConnectionFrictionReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Service connection friction" : "Service connection friction")}:</strong></p>
              ${
                githubConnectionFriction
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "GitHub friction" : "GitHub friction")}:</strong> <code>${escapeHtml(normalizeText(githubConnectionFriction.id))}</code> ${escapeHtml(normalizeText(githubConnectionFriction.summary))} <strong>${escapeHtml(locale === "ja" ? "Manual transport remains" : "Manual transport remains")}:</strong> <code>${escapeHtml(normalizeText(githubConnectionFriction.manualTransportRemains))}</code> <strong>${escapeHtml(locale === "ja" ? "Allowed human involvement" : "Allowed human involvement")}:</strong> ${escapeHtml(normalizeText(githubConnectionFriction.allowedHumanInvolvement))}</p>`
                  : ""
              }
              ${
                cloudflareConnectionFriction
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Cloudflare friction" : "Cloudflare friction")}:</strong> <code>${escapeHtml(normalizeText(cloudflareConnectionFriction.id))}</code> ${escapeHtml(normalizeText(cloudflareConnectionFriction.summary))} <strong>${escapeHtml(locale === "ja" ? "Manual transport remains" : "Manual transport remains")}:</strong> <code>${escapeHtml(normalizeText(cloudflareConnectionFriction.manualTransportRemains))}</code> <strong>${escapeHtml(locale === "ja" ? "Allowed human involvement" : "Allowed human involvement")}:</strong> ${escapeHtml(normalizeText(cloudflareConnectionFriction.allowedHumanInvolvement))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        serviceConnectionHandoffShapeReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Service connection handoff shape" : "Service connection handoff shape")}:</strong></p>
              ${
                githubConnectionHandoff
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "GitHub handoff" : "GitHub handoff")}:</strong> <code>${escapeHtml(normalizeText(githubConnectionHandoff.id))}</code> ${escapeHtml(normalizeText(githubConnectionHandoff.summary))} <strong>${escapeHtml(locale === "ja" ? "Human step shape" : "Human step shape")}:</strong> ${escapeHtml(normalizeText(githubConnectionHandoff.humanStepShape))} <strong>${escapeHtml(locale === "ja" ? "Return capture owner" : "Return capture owner")}:</strong> <code>${escapeHtml(normalizeText(githubConnectionHandoff.returnCaptureOwner))}</code></p>`
                  : ""
              }
              ${
                cloudflareConnectionHandoff
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Cloudflare handoff" : "Cloudflare handoff")}:</strong> <code>${escapeHtml(normalizeText(cloudflareConnectionHandoff.id))}</code> ${escapeHtml(normalizeText(cloudflareConnectionHandoff.summary))} <strong>${escapeHtml(locale === "ja" ? "Human step shape" : "Human step shape")}:</strong> ${escapeHtml(normalizeText(cloudflareConnectionHandoff.humanStepShape))} <strong>${escapeHtml(locale === "ja" ? "Return capture owner" : "Return capture owner")}:</strong> <code>${escapeHtml(normalizeText(cloudflareConnectionHandoff.returnCaptureOwner))}</code></p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        serviceConnectionReturnContinuityReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Service return continuity" : "Service return continuity")}:</strong></p>
              ${
                githubReturnContinuity
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "GitHub return" : "GitHub return")}:</strong> <code>${escapeHtml(normalizeText(githubReturnContinuity.id))}</code> ${escapeHtml(normalizeText(githubReturnContinuity.summary))} <strong>${escapeHtml(locale === "ja" ? "Expected return context" : "Expected return context")}:</strong> ${escapeHtml(normalizeText(githubReturnContinuity.expectedReturnContext))} <strong>${escapeHtml(locale === "ja" ? "Human re-entry required" : "Human re-entry required")}:</strong> <code>${escapeHtml(normalizeText(githubReturnContinuity.humanReentryRequired))}</code></p>`
                  : ""
              }
              ${
                cloudflareReturnContinuity
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Cloudflare return" : "Cloudflare return")}:</strong> <code>${escapeHtml(normalizeText(cloudflareReturnContinuity.id))}</code> ${escapeHtml(normalizeText(cloudflareReturnContinuity.summary))} <strong>${escapeHtml(locale === "ja" ? "Expected return context" : "Expected return context")}:</strong> ${escapeHtml(normalizeText(cloudflareReturnContinuity.expectedReturnContext))} <strong>${escapeHtml(locale === "ja" ? "Human re-entry required" : "Human re-entry required")}:</strong> <code>${escapeHtml(normalizeText(cloudflareReturnContinuity.humanReentryRequired))}</code></p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        responsibilityReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Responsibility split" : "Responsibility split")}:</strong></p>
              ${
                humanStep
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Human step" : "Human step")}:</strong> <code>${escapeHtml(normalizeText(humanStep.id))}</code> ${escapeHtml(normalizeText(humanStep.summary))}</p>`
                  : ""
              }
              ${
                vtddStep
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "VTDD step" : "VTDD step")}:</strong> <code>${escapeHtml(normalizeText(vtddStep.id))}</code> ${escapeHtml(normalizeText(vtddStep.summary))}</p>`
                  : ""
              }
              ${
                providerStep
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Provider step" : "Provider step")}:</strong> <code>${escapeHtml(normalizeText(providerStep.id))}</code> ${escapeHtml(normalizeText(providerStep.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        authBoundaryReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Auth boundary split" : "Auth boundary split")}:</strong></p>
              ${
                serviceAccess
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "VTDD service access" : "VTDD service access")}:</strong> <code>${escapeHtml(normalizeText(serviceAccess.state))}</code> ${escapeHtml(normalizeText(serviceAccess.summary))}</p>`
                  : ""
              }
              ${
                operatorBootstrapAuthority
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Operator bootstrap authority" : "Operator bootstrap authority")}:</strong> <code>${escapeHtml(normalizeText(operatorBootstrapAuthority.state))}</code> ${escapeHtml(normalizeText(operatorBootstrapAuthority.summary))}</p>`
                  : ""
              }
              ${
                externalAccountConnection
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "External account connection" : "External account connection")}:</strong> <code>${escapeHtml(normalizeText(externalAccountConnection.state))}</code> ${escapeHtml(normalizeText(externalAccountConnection.summary))}</p>`
                  : ""
              }
              ${
                runtimeMachineAuth
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Runtime machine auth" : "Runtime machine auth")}:</strong> <code>${escapeHtml(normalizeText(runtimeMachineAuth.state))}</code> ${escapeHtml(normalizeText(runtimeMachineAuth.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        issuanceReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Issuance readout" : "Issuance readout")}:</strong></p>
              ${
                issuableState
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Issuable state" : "Issuable state")}:</strong> <code>${escapeHtml(normalizeText(issuableState.id))}</code> ${escapeHtml(normalizeText(issuableState.summary))}</p>`
                  : ""
              }
              ${
                blockingGate
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Blocking gate" : "Blocking gate")}:</strong> <code>${escapeHtml(normalizeText(blockingGate.id))}</code> ${escapeHtml(normalizeText(blockingGate.summary))}</p>`
                  : ""
              }
              ${
                nextIssuanceCondition
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Next issuance condition" : "Next issuance condition")}:</strong> <code>${escapeHtml(normalizeText(nextIssuanceCondition.id))}</code> ${escapeHtml(normalizeText(nextIssuanceCondition.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        authorityShapeReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Authority shape" : "Authority shape")}:</strong></p>
              ${
                authorityOwner
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Authority owner" : "Authority owner")}:</strong> <code>${escapeHtml(normalizeText(authorityOwner.id))}</code> ${escapeHtml(normalizeText(authorityOwner.summary))}</p>`
                  : ""
              }
              ${
                authorityScope
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Authority scope" : "Authority scope")}:</strong> <code>${escapeHtml(normalizeText(authorityScope.id))}</code> ${escapeHtml(normalizeText(authorityScope.summary))}</p>`
                  : ""
              }
              ${
                authorityAudit
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Authority audit" : "Authority audit")}:</strong> <code>${escapeHtml(normalizeText(authorityAudit.id))}</code> ${escapeHtml(normalizeText(authorityAudit.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        authorityExpiryReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Authority expiry" : "Authority expiry")}:</strong></p>
              ${
                expiryTrigger
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Expiry trigger" : "Expiry trigger")}:</strong> <code>${escapeHtml(normalizeText(expiryTrigger.id))}</code> ${escapeHtml(normalizeText(expiryTrigger.summary))}</p>`
                  : ""
              }
              ${
                expiryWindow
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Expiry window" : "Expiry window")}:</strong> <code>${escapeHtml(normalizeText(expiryWindow.id))}</code> ${escapeHtml(normalizeText(expiryWindow.summary))}</p>`
                  : ""
              }
              ${
                expiryAfterUse
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Expiry after use" : "Expiry after use")}:</strong> <code>${escapeHtml(normalizeText(expiryAfterUse.id))}</code> ${escapeHtml(normalizeText(expiryAfterUse.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        authorityRenewalReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Authority renewal" : "Authority renewal")}:</strong></p>
              ${
                renewalTrigger
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Renewal trigger" : "Renewal trigger")}:</strong> <code>${escapeHtml(normalizeText(renewalTrigger.id))}</code> ${escapeHtml(normalizeText(renewalTrigger.summary))}</p>`
                  : ""
              }
              ${
                renewalGate
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Renewal gate" : "Renewal gate")}:</strong> <code>${escapeHtml(normalizeText(renewalGate.id))}</code> ${escapeHtml(normalizeText(renewalGate.summary))}</p>`
                  : ""
              }
              ${
                renewalScope
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Renewal scope" : "Renewal scope")}:</strong> <code>${escapeHtml(normalizeText(renewalScope.id))}</code> ${escapeHtml(normalizeText(renewalScope.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        authorityRenewalDenialReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Authority renewal denial" : "Authority renewal denial")}:</strong></p>
              ${
                denialReason
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Denial reason" : "Denial reason")}:</strong> <code>${escapeHtml(normalizeText(denialReason.id))}</code> ${escapeHtml(normalizeText(denialReason.summary))}</p>`
                  : ""
              }
              ${
                denialBoundary
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Denial boundary" : "Denial boundary")}:</strong> <code>${escapeHtml(normalizeText(denialBoundary.id))}</code> ${escapeHtml(normalizeText(denialBoundary.summary))}</p>`
                  : ""
              }
              ${
                denialRecovery
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Denial recovery" : "Denial recovery")}:</strong> <code>${escapeHtml(normalizeText(denialRecovery.id))}</code> ${escapeHtml(normalizeText(denialRecovery.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        authorityRequestFreshnessReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Authority request freshness" : "Authority request freshness")}:</strong></p>
              ${
                freshnessRequirement
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Freshness requirement" : "Freshness requirement")}:</strong> <code>${escapeHtml(normalizeText(freshnessRequirement.id))}</code> ${escapeHtml(normalizeText(freshnessRequirement.summary))}</p>`
                  : ""
              }
              ${
                staleRequestRejection
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Stale request rejection" : "Stale request rejection")}:</strong> <code>${escapeHtml(normalizeText(staleRequestRejection.id))}</code> ${escapeHtml(normalizeText(staleRequestRejection.summary))}</p>`
                  : ""
              }
              ${
                freshnessRecovery
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Freshness recovery" : "Freshness recovery")}:</strong> <code>${escapeHtml(normalizeText(freshnessRecovery.id))}</code> ${escapeHtml(normalizeText(freshnessRecovery.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        authorityRequestReplayReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Authority request replay" : "Authority request replay")}:</strong></p>
              ${
                replayRisk
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Replay risk" : "Replay risk")}:</strong> <code>${escapeHtml(normalizeText(replayRisk.id))}</code> ${escapeHtml(normalizeText(replayRisk.summary))}</p>`
                  : ""
              }
              ${
                replayRejection
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Replay rejection" : "Replay rejection")}:</strong> <code>${escapeHtml(normalizeText(replayRejection.id))}</code> ${escapeHtml(normalizeText(replayRejection.summary))}</p>`
                  : ""
              }
              ${
                replayRecovery
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Replay recovery" : "Replay recovery")}:</strong> <code>${escapeHtml(normalizeText(replayRecovery.id))}</code> ${escapeHtml(normalizeText(replayRecovery.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        authorityRequestBindingReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Authority request binding" : "Authority request binding")}:</strong></p>
              ${
                bindingTarget
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Binding target" : "Binding target")}:</strong> <code>${escapeHtml(normalizeText(bindingTarget.id))}</code> ${escapeHtml(normalizeText(bindingTarget.summary))}</p>`
                  : ""
              }
              ${
                bindingDrift
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Binding drift" : "Binding drift")}:</strong> <code>${escapeHtml(normalizeText(bindingDrift.id))}</code> ${escapeHtml(normalizeText(bindingDrift.summary))}</p>`
                  : ""
              }
              ${
                bindingRecovery
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Binding recovery" : "Binding recovery")}:</strong> <code>${escapeHtml(normalizeText(bindingRecovery.id))}</code> ${escapeHtml(normalizeText(bindingRecovery.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        authorityRequestTargetReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Authority request target" : "Authority request target")}:</strong></p>
              ${
                targetContext
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Target context" : "Target context")}:</strong> <code>${escapeHtml(normalizeText(targetContext.id))}</code> ${escapeHtml(normalizeText(targetContext.summary))}</p>`
                  : ""
              }
              ${
                targetDrift
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Target drift" : "Target drift")}:</strong> <code>${escapeHtml(normalizeText(targetDrift.id))}</code> ${escapeHtml(normalizeText(targetDrift.summary))}</p>`
                  : ""
              }
              ${
                targetRecovery
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Target recovery" : "Target recovery")}:</strong> <code>${escapeHtml(normalizeText(targetRecovery.id))}</code> ${escapeHtml(normalizeText(targetRecovery.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        authorityRequestProvenanceReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Authority request provenance" : "Authority request provenance")}:</strong></p>
              ${
                provenanceSource
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Provenance source" : "Provenance source")}:</strong> <code>${escapeHtml(normalizeText(provenanceSource.id))}</code> ${escapeHtml(normalizeText(provenanceSource.summary))}</p>`
                  : ""
              }
              ${
                provenanceDrift
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Provenance drift" : "Provenance drift")}:</strong> <code>${escapeHtml(normalizeText(provenanceDrift.id))}</code> ${escapeHtml(normalizeText(provenanceDrift.summary))}</p>`
                  : ""
              }
              ${
                provenanceRecovery
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Provenance recovery" : "Provenance recovery")}:</strong> <code>${escapeHtml(normalizeText(provenanceRecovery.id))}</code> ${escapeHtml(normalizeText(provenanceRecovery.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        sessionEnvelope
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Session envelope" : "Session envelope")}:</strong></p>
              ${
                envelopeState
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Envelope state" : "Envelope state")}:</strong> <code>${escapeHtml(normalizeText(envelopeState))}</code></p>`
                  : ""
              }
              ${
                envelopeId
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Envelope id" : "Envelope id")}:</strong> <code>${escapeHtml(normalizeText(envelopeId))}</code></p>`
                  : ""
              }
              ${
                envelopeExpiresAt
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Envelope expires at" : "Envelope expires at")}:</strong> <code>${escapeHtml(normalizeText(envelopeExpiresAt))}</code></p>`
                  : ""
              }
              ${
                typeof envelopeSingleUse === "boolean"
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Envelope single use" : "Envelope single use")}:</strong> <code>${escapeHtml(String(envelopeSingleUse))}</code></p>`
                  : ""
              }
              ${
                envelopeBoundScope
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Envelope bound scope" : "Envelope bound scope")}:</strong> <code>${escapeHtml(normalizeText(envelopeBoundScope))}</code></p>`
                  : ""
              }
              ${
                consumeEnabled && envelopeToken && !consumeSurfacedInline
                  ? `
                    <form method="post" action="${escapeHtml(consumePath)}" style="margin-top: 12px;">
                      <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
                      <input type="hidden" name="envelope_token" value="${escapeHtml(normalizeText(envelopeToken))}" />
                      <button type="submit" class="copy-button">${escapeHtml(
                        locale === "ja"
                          ? "Session envelope を consume して確認"
                          : "Consume session envelope"
                      )}</button>
                    </form>
                  `
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        envelopeConsumeResult
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Envelope consume result" : "Envelope consume result")}:</strong></p>
              ${
                consumeResultState
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Consume state" : "Consume state")}:</strong> <code>${escapeHtml(normalizeText(consumeResultState))}</code></p>`
                  : ""
              }
              ${
                consumeResultSummary
                  ? `<p>${escapeHtml(normalizeText(consumeResultSummary))}</p>`
                  : ""
              }
              ${
                consumeResultState === "consume_completed"
                  ? `
                    <p><strong>${escapeHtml(locale === "ja" ? "Setup progress" : "Setup progress")}:</strong></p>
                    <ul>
                      <li>${escapeHtml(
                        locale === "ja"
                          ? "同じ setup flow の signed envelope を照合し、installation 候補を取得しました。"
                          : "VTDD validated the signed envelope in the same setup flow and absorbed the installation candidate."
                      )}</li>
                      <li>${escapeHtml(
                        locale === "ja"
                          ? "VTDD が installation binding を Worker runtime に設定しました。"
                          : "VTDD stored the installation binding on Worker runtime."
                      )}</li>
                      <li>${escapeHtml(
                        locale === "ja"
                          ? consumeResultProof && normalizeText(consumeResultProof.state) === "ready"
                            ? "設定後すぐ readiness を確認し、live repository access を確認しました。"
                            : consumeResultProof &&
                                normalizeText(consumeResultProof.state) === "configured"
                              ? "設定後すぐ readiness 確認を実行し、runtime configuration completed を確認しました。"
                              : consumeResultProof &&
                                  normalizeText(consumeResultProof.state) === "probe_failed"
                                ? "設定後すぐ readiness 確認を実行しましたが、live probe は fail-closed でした。"
                                : "設定後すぐ post-consume proof を記録しました。"
                          : consumeResultProof && normalizeText(consumeResultProof.state) === "ready"
                            ? "Immediately after the write, VTDD verified readiness and confirmed live repository access."
                            : consumeResultProof &&
                                normalizeText(consumeResultProof.state) === "configured"
                              ? "Immediately after the write, VTDD verified readiness and confirmed runtime configuration completion."
                              : consumeResultProof &&
                                  normalizeText(consumeResultProof.state) === "probe_failed"
                                ? "VTDD ran readiness verification immediately after the write, but the live probe still failed closed."
                                : "VTDD recorded post-consume proof immediately after the write."
                      )}</li>
                    </ul>
                  `
                  : ""
              }
              ${
                consumeResultState === "consume_deferred"
                  ? `
                    <p><strong>${escapeHtml(locale === "ja" ? "Setup progress" : "Setup progress")}:</strong></p>
                    <ul>
                      <li>${escapeHtml(
                        locale === "ja"
                          ? "VTDD は signed envelope を現在の setup flow と照合しました。"
                          : "VTDD validated the signed envelope against the current setup flow."
                      )}</li>
                      <li>${escapeHtml(
                        locale === "ja"
                          ? "ただし、attestation 付き consume 実行経路はまだ deferred のため書き込みは行っていません。"
                          : "The attested consume execution path is still deferred, so VTDD did not perform the bounded write yet."
                      )}</li>
                      <li>${escapeHtml(
                        locale === "ja"
                          ? "次に attested consume 経路を復元すると、installation binding と直後の readiness 確認に進めます。"
                          : "Next, restoring one attested consume path lets VTDD continue into installation binding and immediate readiness verification."
                      )}</li>
                    </ul>
                  `
                  : ""
              }
              ${
                consumeResultState === "consume_rejected"
                  ? `
                    <p><strong>${escapeHtml(locale === "ja" ? "Setup progress" : "Setup progress")}:</strong></p>
                    <ul>
                      <li>${escapeHtml(
                        locale === "ja"
                          ? "VTDD はこの consume 要求を現在の wizard context と照合しました。"
                          : "VTDD checked this consume request against the current wizard context."
                      )}</li>
                      <li>${escapeHtml(
                        locale === "ja"
                          ? "signed envelope が一致しないため fail-closed で拒否しました。"
                          : "VTDD rejected it fail-closed because the signed envelope did not match."
                      )}</li>
                      <li>${escapeHtml(
                        locale === "ja"
                          ? "次に現在の context で新しい GO + passkey request と envelope を発行すると再試行できます。"
                          : "Next, issuing a fresh GO + passkey request and envelope in the current context allows retry."
                      )}</li>
                    </ul>
                  `
                  : ""
              }
              ${
                consumeResultState === "consume_failed"
                  ? `
                    <p><strong>${escapeHtml(locale === "ja" ? "Setup progress" : "Setup progress")}:</strong></p>
                    <ul>
                      <li>${escapeHtml(
                        locale === "ja"
                          ? "VTDD は signed envelope を検証し、bounded write を開始しました。"
                          : "VTDD validated the signed envelope and entered the bounded write path."
                      )}</li>
                      <li>${escapeHtml(
                        locale === "ja"
                          ? "ただし、installation binding 書き込み完了前に fail-closed で停止しました。"
                          : "VTDD then failed closed before installation binding write completion."
                      )}</li>
                      <li>${escapeHtml(
                        buildConsumeFailedProgressHint({
                          locale,
                          consumeResultNextProof
                        })
                      )}</li>
                    </ul>
                  `
                  : ""
              }
              ${
                consumeResultEnvelopeId
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Envelope id" : "Envelope id")}:</strong> <code>${escapeHtml(normalizeText(consumeResultEnvelopeId))}</code></p>`
                  : ""
              }
              ${
                shouldRenderConsumeResultNextProof({
                  consumeResultNextProof,
                  consumeResultRequiredAction
                })
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Next proof" : "Next proof")}:</strong> <code>${escapeHtml(normalizeText(consumeResultNextProof.id))}</code> ${escapeHtml(normalizeText(consumeResultNextProof.summary))}</p>`
                  : ""
              }
              ${
                normalizeText(consumeResultRequiredAction?.method) === "GET" &&
                normalizeText(consumeResultRequiredAction?.path)
                  ? `<form method="get" action="${escapeHtml(
                      normalizeText(consumeResultRequiredAction.path)
                    )}" style="margin-top: 12px;">
                      <button type="submit" class="copy-button">${escapeHtml(
                        buildConsumeResultRequiredActionLabel({
                          locale,
                          actionId: normalizeText(consumeResultRequiredAction.id)
                        })
                      )}</button>
                    </form>`
                  : ""
              }
              ${
                consumeResultProof
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Post-consume proof" : "Post-consume proof")}:</strong> <code>${escapeHtml(normalizeText(consumeResultProof.state))}</code> ${escapeHtml(normalizeText(consumeResultProof.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        envelopeConsumptionPlan
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Envelope consumption plan" : "Envelope consumption plan")}:</strong></p>
              ${
                consumptionIntent
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Consumption intent" : "Consumption intent")}:</strong> <code>${escapeHtml(normalizeText(consumptionIntent.id))}</code> ${escapeHtml(normalizeText(consumptionIntent.summary))}</p>`
                  : ""
              }
              ${
                consumptionBoundary
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Consumption boundary" : "Consumption boundary")}:</strong> <code>${escapeHtml(normalizeText(consumptionBoundary.id))}</code> ${escapeHtml(normalizeText(consumptionBoundary.summary))}</p>`
                  : ""
              }
              ${
                consumptionVerification
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Consumption verification" : "Consumption verification")}:</strong> <code>${escapeHtml(normalizeText(consumptionVerification.id))}</code> ${escapeHtml(normalizeText(consumptionVerification.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        envelopeConsumePreflight
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Envelope consume preflight" : "Envelope consume preflight")}:</strong></p>
              ${
                preflightGate
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Preflight gate" : "Preflight gate")}:</strong> <code>${escapeHtml(normalizeText(preflightGate.id))}</code> ${escapeHtml(normalizeText(preflightGate.summary))}</p>`
                  : ""
              }
              ${
                preflightFailure
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Preflight failure" : "Preflight failure")}:</strong> <code>${escapeHtml(normalizeText(preflightFailure.id))}</code> ${escapeHtml(normalizeText(preflightFailure.summary))}</p>`
                  : ""
              }
              ${
                preflightRecovery
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Preflight recovery" : "Preflight recovery")}:</strong> <code>${escapeHtml(normalizeText(preflightRecovery.id))}</code> ${escapeHtml(normalizeText(preflightRecovery.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        envelopeConsumeOutcome
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Envelope consume outcome" : "Envelope consume outcome")}:</strong></p>
              ${
                outcomeState
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Outcome state" : "Outcome state")}:</strong> <code>${escapeHtml(normalizeText(outcomeState.id))}</code> ${escapeHtml(normalizeText(outcomeState.summary))}</p>`
                  : ""
              }
              ${
                outcomeFailure
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Outcome failure" : "Outcome failure")}:</strong> <code>${escapeHtml(normalizeText(outcomeFailure.id))}</code> ${escapeHtml(normalizeText(outcomeFailure.summary))}</p>`
                  : ""
              }
              ${
                outcomeNextProof
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Outcome next proof" : "Outcome next proof")}:</strong> <code>${escapeHtml(normalizeText(outcomeNextProof.id))}</code> ${escapeHtml(normalizeText(outcomeNextProof.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        envelopeConsumeAuditReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Envelope consume audit" : "Envelope consume audit")}:</strong></p>
              ${
                auditRecord
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Audit record" : "Audit record")}:</strong> <code>${escapeHtml(normalizeText(auditRecord.id))}</code> ${escapeHtml(normalizeText(auditRecord.summary))}</p>`
                  : ""
              }
              ${
                auditFailure
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Audit failure" : "Audit failure")}:</strong> <code>${escapeHtml(normalizeText(auditFailure.id))}</code> ${escapeHtml(normalizeText(auditFailure.summary))}</p>`
                  : ""
              }
              ${
                auditRetention
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Audit retention" : "Audit retention")}:</strong> <code>${escapeHtml(normalizeText(auditRetention.id))}</code> ${escapeHtml(normalizeText(auditRetention.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        completionReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Completion claim" : "Completion claim")}:</strong></p>
              ${
                claimState
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Current claim" : "Current claim")}:</strong> <code>${escapeHtml(normalizeText(claimState.id))}</code> ${escapeHtml(normalizeText(claimState.summary))}</p>`
                  : ""
              }
              ${
                cannotYetClaim
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Cannot yet claim" : "Cannot yet claim")}:</strong> <code>${escapeHtml(normalizeText(cannotYetClaim.id))}</code> ${escapeHtml(normalizeText(cannotYetClaim.summary))}</p>`
                  : ""
              }
              ${
                claimBecomesValidWhen
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Claim becomes valid when" : "Claim becomes valid when")}:</strong> <code>${escapeHtml(normalizeText(claimBecomesValidWhen.id))}</code> ${escapeHtml(normalizeText(claimBecomesValidWhen.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        evidenceReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Evidence readout" : "Evidence readout")}:</strong></p>
              ${
                runtimeEvidence.length > 0
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Runtime evidence" : "Runtime evidence")}:</strong> ${runtimeEvidence
                      .map((item) => `<code>${escapeHtml(item)}</code>`)
                      .join(", ")}</p>`
                  : ""
              }
              ${
                blockedEvidence.length > 0
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Blocked evidence" : "Blocked evidence")}:</strong> ${blockedEvidence
                      .map((item) => `<code>${escapeHtml(item)}</code>`)
                      .join(", ")}</p>`
                  : ""
              }
              ${
                nextProof
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Next proof" : "Next proof")}:</strong> <code>${escapeHtml(normalizeText(nextProof.id))}</code> ${escapeHtml(normalizeText(nextProof.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        safetyReadout
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Safety readout" : "Safety readout")}:</strong></p>
              ${
                stopReason
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Stop reason" : "Stop reason")}:</strong> <code>${escapeHtml(normalizeText(stopReason.id))}</code> ${escapeHtml(normalizeText(stopReason.summary))}</p>`
                  : ""
              }
              ${
                invariantProtected
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Invariant protected" : "Invariant protected")}:</strong> <code>${escapeHtml(normalizeText(invariantProtected.id))}</code> ${escapeHtml(normalizeText(invariantProtected.summary))}</p>`
                  : ""
              }
              ${
                unsafeShortcutDenied
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Unsafe shortcut denied" : "Unsafe shortcut denied")}:</strong> <code>${escapeHtml(normalizeText(unsafeShortcutDenied.id))}</code> ${escapeHtml(normalizeText(unsafeShortcutDenied.summary))}</p>`
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        contract
          ? `
            <div class="block" style="margin-top: 12px;">
              <p><strong>${escapeHtml(locale === "ja" ? "Session contract" : "Session contract")}:</strong></p>
              ${
                authorityState
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Authority state" : "Authority state")}:</strong> <code>${escapeHtml(authorityState)}</code></p>`
                  : ""
              }
              ${
                sessionMode
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Session mode" : "Session mode")}:</strong> <code>${escapeHtml(sessionMode)}</code></p>`
                  : ""
              }
              ${
                issuance
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Issuance" : "Issuance")}:</strong> <code>${escapeHtml(issuance)}</code></p>`
                  : ""
              }
              ${
                attestationState
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Attestation" : "Attestation")}:</strong> <code>${escapeHtml(attestationState)}</code></p>`
                  : ""
              }
              ${
                maxAgeSeconds !== null
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Max age" : "Max age")}:</strong> <code>${escapeHtml(String(maxAgeSeconds))}</code> seconds</p>`
                  : ""
              }
              <p><strong>${escapeHtml(locale === "ja" ? "Single use" : "Single use")}:</strong> <code>${escapeHtml(singleUse ? "true" : "false")}</code></p>
              ${
                allowlistedSecrets.length > 0
                  ? `<p><strong>${escapeHtml(locale === "ja" ? "Allowlisted secrets" : "Allowlisted secrets")}:</strong> ${allowlistedSecrets
                      .map((item) => `<code>${escapeHtml(item)}</code>`)
                      .join(", ")}</p>`
                  : ""
              }
              ${
                preview
                  ? `
                    ${
                      writeTarget
                        ? `<p><strong>${escapeHtml(locale === "ja" ? "Planned write target" : "Planned write target")}:</strong> <code>${escapeHtml(writeTarget)}</code></p>`
                        : ""
                    }
                    ${
                      plannedWrites.length > 0
                        ? `<p><strong>${escapeHtml(locale === "ja" ? "Planned writes" : "Planned writes")}:</strong> ${plannedWrites
                            .map((item) => `<code>${escapeHtml(item)}</code>`)
                            .join(", ")}</p>`
                        : ""
                    }
                    ${
                      postChecks.length > 0
                        ? `<p><strong>${escapeHtml(locale === "ja" ? "Post-session checks" : "Post-session checks")}:</strong> ${postChecks
                            .map((item) => `<code>${escapeHtml(item)}</code>`)
                            .join(", ")}</p>`
                        : ""
                    }
                    ${
                      blockedBy.length > 0
                        ? `<p><strong>${escapeHtml(locale === "ja" ? "Currently blocked by" : "Currently blocked by")}:</strong> ${blockedBy
                            .map((item) => `<code>${escapeHtml(item)}</code>`)
                            .join(", ")}</p>`
                        : ""
                    }
                  `
                  : ""
              }
            </div>
          `
          : ""
      }
      ${
        requestEnabled && !requestSurfacedInline
          ? `
            <form method="post" action="${escapeHtml(requestPath)}" style="margin-top: 12px;">
              <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />
              <input type="hidden" name="approval_phrase" value="GO" />
              <input type="hidden" name="passkey_verified" value="true" />
              ${
                pendingInstallationId
                  ? `<input type="hidden" name="${escapeHtml(
                      pendingInstallationIdParam
                    )}" value="${escapeHtml(pendingInstallationId)}" />`
                  : ""
              }
              <button type="submit" class="copy-button">${escapeHtml(
                locale === "ja"
                  ? "GO + passkey request を記録"
                  : "Record GO + passkey request"
              )}</button>
            </form>
          `
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

async function diagnoseCloudflareBootstrapSecretWrite({
  fetchImpl,
  apiToken,
  accountId,
  scriptName,
  failedStage,
  failedResponse
}) {
  if (typeof fetchImpl !== "function") {
    return {
      state: "runtime_fetch_unavailable",
      summary: "Cloudflare bootstrap diagnostics could not run because fetch is unavailable.",
      evidence: {
        stage: "runtime_fetch_unavailable",
        httpStatus: null,
        errorCodes: []
      }
    };
  }

  const writeFailure = classifyCloudflareSetupFailure({
    stage: failedStage,
    response: failedResponse
  });

  const tokenVerify = await callCloudflareApi(
    fetchImpl,
    apiToken,
    "https://api.cloudflare.com/client/v4/user/tokens/verify"
  );
  if (!tokenVerify.success) {
    return {
      ...classifyCloudflareSetupFailure({
        stage: "token_verify",
        response: tokenVerify
      }),
      writeFailure
    };
  }

  const scriptSecretsProbe = await callCloudflareApi(
    fetchImpl,
    apiToken,
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(scriptName)}/secrets`
  );
  if (!scriptSecretsProbe.success) {
    return {
      ...classifyCloudflareSetupFailure({
        stage: "script_secret_probe",
        response: scriptSecretsProbe
      }),
      writeFailure
    };
  }

  return {
    state: "secret_write_failed_after_verify",
    summary:
      "Cloudflare bootstrap diagnostics verified the token and target script read path, but secret write still failed.",
    guidance: [
      "Re-check that CLOUDFLARE_API_TOKEN includes Workers Scripts Write for the same account.",
      "If the token was recently rotated, rewrite CLOUDFLARE_API_TOKEN on Worker runtime and retry setup wizard."
    ],
    checkedAt: new Date().toISOString(),
    evidence: {
      stage: "workers_secret_write",
      httpStatus: Number(failedResponse?.httpStatus ?? 0) || null,
      errorCodes: Array.isArray(failedResponse?.errorCodes) ? failedResponse.errorCodes : []
    },
    writeFailure,
    tokenVerify: {
      state: "verified",
      httpStatus: tokenVerify.httpStatus,
      errorCodes: []
    },
    scriptSecretsProbe: {
      state: "reachable",
      httpStatus: scriptSecretsProbe.httpStatus,
      errorCodes: []
    }
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
        "If this happens in setup wizard bootstrap, re-check CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_WORKER_SCRIPT_NAME.",
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
        "Ensure token is active and scoped to the same account as CLOUDFLARE_ACCOUNT_ID.",
        "If setup wizard secret writes are failing, rewrite CLOUDFLARE_API_TOKEN on Worker runtime before retrying."
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
        "Grant token permissions required for the failing setup step.",
        "For setup wizard GitHub App bootstrap secret writes, ensure Workers Scripts Write is included.",
        "For Access diagnostics, keep Access: Apps and Policies Read (and Edit if creating resources)."
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
        "Start GitHub App bootstrap from setup wizard so VTDD can capture App identity first.",
        "After manifest return and installation consent, keep the same setup flow and run githubAppCheck=on for detection before any manual fallback.",
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
    const missingOnlyInstallation =
      missingFields.length === 1 && missingFields[0] === "GITHUB_APP_INSTALLATION_ID";
    if (missingOnlyInstallation && diagnosticsEnabled) {
      const detection = await detectGitHubAppInstallation({
        env: runtimeEnv,
        targetOwner: getSingleSetupWizardRepoOwner(url),
        fetchImpl:
          typeof env?.GITHUB_API_FETCH === "function"
            ? env.GITHUB_API_FETCH.bind(env)
            : typeof globalThis.fetch === "function"
              ? globalThis.fetch.bind(globalThis)
              : null
      });
      const appMetadata = await getGitHubAppMetadata({
        env: runtimeEnv,
        fetchImpl:
          typeof env?.GITHUB_API_FETCH === "function"
            ? env.GITHUB_API_FETCH.bind(env)
            : typeof globalThis.fetch === "function"
              ? globalThis.fetch.bind(globalThis)
              : null
      });

      if (detection.state === "installation_detected") {
        return {
          state: "installation_detected",
          summary:
            "GitHub App identity is stored on Worker runtime, and VTDD found one installation that can be captured automatically.",
          guidance: [
            "Use this detected installation in the same setup flow so VTDD can capture installation binding without manual ID transport.",
            "After capture, run readiness verification so VTDD can prove live repository access.",
            "When approval-bound continuation is available, no extra provider redirect is needed; continue inside this wizard with GO + passkey."
          ],
          detectedInstallationId: detection.installationId,
          installationCapturePath: SETUP_WIZARD_GITHUB_APP_INSTALLATION_CAPTURE_PATH,
          returnTo: `${url.pathname}${url.search || "?githubAppCheck=on"}`,
          evidence: {
            stage: "installation_detection",
            source: "github_app_installations",
            repositoryCount: detection.totalInstallations
          },
          checkedAt: new Date().toISOString()
        };
      }

      if (detection.state === "awaiting_installation") {
        return {
          state: "awaiting_installation",
          returnTo:
            normalizeSetupWizardDiagnosticsReturnTo(`${url.pathname}${url.search || ""}`) ||
            "/setup/wizard?githubAppCheck=on",
          summary:
            "VTDD has a GitHub App identity, but GitHub has not exposed an installation for capture yet.",
          guidance: [
            "Finish GitHub App installation, then return to this same setup flow and reload diagnostics.",
            "If you already installed it, wait a moment and retry this check without re-entering IDs.",
            "At this point, the only external step is GitHub-side installation consent; no manual ID copy/paste is needed."
          ],
          links: buildGitHubAppInstallationLinks(appMetadata),
          evidence: {
            stage: "installation_detection",
            source: "github_app_installations",
            repositoryCount: 0
          },
          checkedAt: new Date().toISOString()
        };
      }

      if (detection.state === "installation_selection_required") {
        const installationSelectionOptions = detection.selectionOptions ?? [];
        return {
          state: "installation_selection_required",
          summary:
            "VTDD found multiple GitHub App installations, so it cannot safely capture one automatically.",
          guidance:
            installationSelectionOptions.length > 0
              ? [
                  "Keep setup wizard focused on one installation candidate at a time.",
                  "Choose the correct installation in GitHub, then return here so VTDD can capture it without manual ID transport.",
                  "If your owner is listed, continue in this wizard without another provider redirect."
                ]
              : [
                  "Keep setup wizard focused on one installation candidate at a time.",
                  "Choose the correct installation in GitHub, then return here so VTDD can capture it without manual ID transport.",
                  "At this point, the only external step is adjusting installation scope on GitHub; no manual ID copy/paste is needed."
                ],
          links: buildGitHubAppInstallationLinks(appMetadata),
          installationSelectionOptions,
          installationCapturePath: SETUP_WIZARD_GITHUB_APP_INSTALLATION_CAPTURE_PATH,
          returnTo:
            normalizeSetupWizardDiagnosticsReturnTo(`${url.pathname}${url.search || ""}`) ||
            "/setup/wizard?githubAppCheck=on",
          evidence: {
            stage: "installation_detection",
            source: "github_app_installations",
            repositoryCount: detection.totalInstallations
          },
          checkedAt: new Date().toISOString()
        };
      }

      if (detection.state === "probe_failed") {
        return {
          state: "probe_failed",
          returnTo:
            normalizeSetupWizardDiagnosticsReturnTo(`${url.pathname}${url.search || ""}`) ||
            "/setup/wizard?githubAppCheck=on",
          summary: detection.summary,
          guidance: [
            "Keep the same setup flow and rerun githubAppCheck=on after fixing the probe blocker.",
            ...detection.guidance
          ],
          evidence: {
            stage: "installation_detection",
            source: "github_app_installations"
          },
          checkedAt: new Date().toISOString()
        };
      }
    }

    return {
      state: "partially_configured",
      ...(missingOnlyInstallation
        ? {
            progressVariant: "missing_only_installation",
            returnTo:
              normalizeSetupWizardDiagnosticsReturnTo(`${url.pathname}${url.search || ""}`) ||
              "/setup/wizard?githubAppCheck=on"
          }
        : {}),
      summary:
        missingOnlyInstallation
          ? "VTDD already has the GitHub App identity, but it still needs the installation binding before it can mint installation tokens."
          : "GitHub App setup check: some required Worker secrets are missing, so VTDD cannot mint installation tokens yet.",
      guidance: missingOnlyInstallation
        ? [
            "Install the GitHub App, then return to this same setup flow with githubAppCheck=on so VTDD can try installation detection first.",
            "If detection is still unavailable, use setting GITHUB_APP_INSTALLATION_ID on Worker runtime only as a bounded fallback."
          ]
        : missingFields.map((field) => `Set ${field} on Worker runtime.`),
      evidence: {
        stage: "configuration_check",
        source: "worker_runtime"
      }
    };
  }

  if (!diagnosticsEnabled) {
    return {
      state: "configured",
      returnTo:
        normalizeSetupWizardDiagnosticsReturnTo(`${url.pathname}${url.search || ""}`) ||
        "/setup/wizard?githubAppCheck=on",
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
      "Use GitHub's manifest flow from setup wizard so VTDD can capture App ID and private key on return without manual copy/paste.",
      "This endpoint is allowlisted and does not accept arbitrary secret names.",
      "Manifest conversion uses an operator-managed GitHub token already stored on Worker runtime.",
      "The narrow bootstrap endpoint remains recovery-only when an already-created App must be reconnected outside the manifest path."
    ],
    manifestLaunch: buildGitHubAppManifestLaunch(url),
    scriptName,
    accountId,
    cloudflareApiToken,
    githubManifestConversionToken
  };
}

async function buildApprovalBoundBootstrapSessionStatus({
  url,
  env,
  githubAppBootstrap,
  githubAppSetupCheck
}) {
  const authConfig = getSetupWizardAuthConfig(env);
  const bootstrapState = normalizeText(githubAppBootstrap?.state) || "missing_prerequisites";
  const missingPrerequisites = Array.isArray(githubAppBootstrap?.missingPrerequisites)
    ? githubAppBootstrap.missingPrerequisites
    : [];
  const preview = buildBootstrapSessionPreview({
    env,
    githubAppBootstrap,
    githubAppSetupCheck
  });
  const requestRecorded =
    authConfig.sessionSecret && url
      ? await verifySetupWizardBootstrapSessionRequestToken({
          url,
          sessionSecret: authConfig.sessionSecret
        })
      : false;
  const requestExpiresAt = requestRecorded ? getSetupWizardBootstrapSessionRequestExpiresAt(url) : null;
  const requestInvalid =
    normalizeText(url?.searchParams?.get(SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_STATE_PARAM)) ===
    "invalid";
  const requestMissing =
    normalizeText(url?.searchParams?.get(SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_STATE_PARAM)) ===
    "missing";
  const effectiveContext = deriveEffectiveBootstrapSessionContext({
    url,
    preview,
    githubAppSetupCheck
  });
  const effectivePreview = effectiveContext.preview;
  const effectiveGitHubAppSetupCheck = effectiveContext.githubAppSetupCheck;
  const absorbedLiveProof =
    normalizeText(effectiveGitHubAppSetupCheck?.state) === "ready" &&
    normalizeText(
      url?.searchParams?.get(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_STATE_PARAM)
    ) === "completed";
  const base = {
    approvalBoundary: "GO + passkey",
    targetAbsorbs: [
      "github_app_installation_binding",
      "allowlisted_runtime_secret_write",
      "post_write_readiness_verification"
    ],
    stepBoundaries: buildBootstrapSessionStepBoundaries({
      preview: effectivePreview,
      githubAppSetupCheck: effectiveGitHubAppSetupCheck
    }),
    capabilityReadout: buildBootstrapSessionCapabilityReadout({
      bootstrapState,
      preview: effectivePreview,
      githubAppSetupCheck: effectiveGitHubAppSetupCheck
    }),
    phaseReadout: buildBootstrapSessionPhaseReadout({
      bootstrapState,
      preview: effectivePreview,
      githubAppSetupCheck: effectiveGitHubAppSetupCheck
    }),
    progressReadout: buildBootstrapSessionProgressReadout({
      bootstrapState,
      preview: effectivePreview,
      githubAppSetupCheck: effectiveGitHubAppSetupCheck
    }),
    providerConnectionReadout: buildBootstrapSessionProviderConnectionReadout({
      bootstrapState,
      preview: effectivePreview,
      githubAppSetupCheck: effectiveGitHubAppSetupCheck
    }),
    serviceConnectionModelReadout: buildBootstrapSessionServiceConnectionModelReadout({
      bootstrapState,
      preview: effectivePreview,
      githubAppSetupCheck: effectiveGitHubAppSetupCheck
    }),
    serviceConnectionActionability: buildBootstrapSessionServiceConnectionActionability({
      bootstrapState,
      preview: effectivePreview,
      githubAppSetupCheck: effectiveGitHubAppSetupCheck
    }),
    serviceConnectionFrictionReadout: buildBootstrapSessionServiceConnectionFrictionReadout({
      bootstrapState,
      preview: effectivePreview,
      githubAppSetupCheck: effectiveGitHubAppSetupCheck
    }),
    serviceConnectionHandoffShapeReadout: buildBootstrapSessionServiceConnectionHandoffShapeReadout({
      bootstrapState,
      preview: effectivePreview,
      githubAppSetupCheck: effectiveGitHubAppSetupCheck
    }),
    serviceConnectionReturnContinuityReadout: buildBootstrapSessionServiceConnectionReturnContinuityReadout({
      bootstrapState,
      preview: effectivePreview,
      githubAppSetupCheck: effectiveGitHubAppSetupCheck
    }),
    responsibilityReadout: absorbedLiveProof
      ? null
      : buildBootstrapSessionResponsibilityReadout({
          bootstrapState,
          preview: effectivePreview,
          githubAppSetupCheck: effectiveGitHubAppSetupCheck
        }),
    authBoundaryReadout: absorbedLiveProof
      ? null
      : buildBootstrapSessionAuthBoundaryReadout({
          bootstrapState,
          preview: effectivePreview,
          authConfig,
          githubAppSetupCheck
        }),
    issuanceReadout: absorbedLiveProof
      ? null
      : buildBootstrapSessionIssuanceReadout({
          bootstrapState,
          preview: effectivePreview,
          githubAppSetupCheck: effectiveGitHubAppSetupCheck
        }),
    authorityShapeReadout: absorbedLiveProof
      ? null
      : buildBootstrapSessionAuthorityShapeReadout({
          bootstrapState,
          preview: effectivePreview,
          githubAppSetupCheck: effectiveGitHubAppSetupCheck
        }),
    authorityExpiryReadout: absorbedLiveProof
      ? null
      : buildBootstrapSessionAuthorityExpiryReadout({
          bootstrapState,
          preview: effectivePreview,
          maxAgeSeconds: SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_TTL_SECONDS,
          githubAppSetupCheck: effectiveGitHubAppSetupCheck
        }),
    authorityRenewalReadout: absorbedLiveProof
      ? null
      : buildBootstrapSessionAuthorityRenewalReadout({
          bootstrapState,
          preview: effectivePreview,
          githubAppSetupCheck: effectiveGitHubAppSetupCheck
        }),
    authorityRenewalDenialReadout: absorbedLiveProof
      ? null
      : buildBootstrapSessionAuthorityRenewalDenialReadout({
          bootstrapState,
          preview: effectivePreview,
          githubAppSetupCheck: effectiveGitHubAppSetupCheck
        }),
    authorityRequestFreshnessReadout: absorbedLiveProof
      ? null
      : buildBootstrapSessionAuthorityRequestFreshnessReadout({
          bootstrapState,
          preview: effectivePreview,
          maxAgeSeconds: SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_TTL_SECONDS,
          githubAppSetupCheck: effectiveGitHubAppSetupCheck
        }),
    authorityRequestReplayReadout: absorbedLiveProof
      ? null
      : buildBootstrapSessionAuthorityRequestReplayReadout({
          bootstrapState,
          preview: effectivePreview,
          githubAppSetupCheck: effectiveGitHubAppSetupCheck
        }),
    authorityRequestBindingReadout: absorbedLiveProof
      ? null
      : buildBootstrapSessionAuthorityRequestBindingReadout({
          bootstrapState,
          preview: effectivePreview,
          githubAppSetupCheck: effectiveGitHubAppSetupCheck
        }),
    authorityRequestTargetReadout: absorbedLiveProof
      ? null
      : buildBootstrapSessionAuthorityRequestTargetReadout({
          bootstrapState,
          preview: effectivePreview,
          url,
          githubAppSetupCheck: effectiveGitHubAppSetupCheck
        }),
    authorityRequestProvenanceReadout: absorbedLiveProof
      ? null
      : buildBootstrapSessionAuthorityRequestProvenanceReadout({
          bootstrapState,
          preview: effectivePreview,
          githubAppSetupCheck: effectiveGitHubAppSetupCheck
        }),
    completionReadout: buildBootstrapSessionCompletionReadout({
      bootstrapState,
      preview: effectivePreview,
      githubAppSetupCheck: effectiveGitHubAppSetupCheck
    }),
    evidenceReadout: buildBootstrapSessionEvidenceReadout({
      bootstrapState,
      preview: effectivePreview,
      githubAppSetupCheck: effectiveGitHubAppSetupCheck
    }),
    safetyReadout: buildBootstrapSessionSafetyReadout({
      bootstrapState,
      preview: effectivePreview,
      githubAppSetupCheck: effectiveGitHubAppSetupCheck
    }),
    contract: {
      authorityState: "not_issued",
      sessionMode: "approval_bound_one_time_bootstrap",
      issuance: "deferred_until_attestation_backed_bootstrap_authority_exists",
      attestationState: "not_implemented",
      maxAgeSeconds: SETUP_WIZARD_BOOTSTRAP_SESSION_REQUEST_TTL_SECONDS,
      singleUse: true,
      allowlistedSecrets: [...GITHUB_APP_BOOTSTRAP_SECRET_ALLOWLIST],
      preview: effectivePreview
    },
    sessionEnvelope:
      requestRecorded &&
      !absorbedLiveProof &&
      authConfig.sessionSecret &&
      Number.isFinite(requestExpiresAt) &&
      requestExpiresAt >= Math.floor(Date.now() / 1000)
        ? await buildBootstrapSessionEnvelope({
            url,
            sessionSecret: authConfig.sessionSecret,
            bootstrapState,
            preview: effectivePreview,
            expiresAt: requestExpiresAt
          })
        : null,
    envelopeConsumeResult: absorbedLiveProof
      ? null
      : buildBootstrapSessionEnvelopeConsumeResult({
          url,
          preview: effectivePreview
        }),
    envelopeConsumptionPlan: null,
    envelopeConsumePreflight: null,
    envelopeConsumeOutcome: null,
    envelopeConsumeAuditReadout: null,
    requestPath: absorbedLiveProof
      ? null
      : SETUP_WIZARD_APPROVAL_BOUND_BOOTSTRAP_SESSION_REQUEST_PATH,
    requestEnabled: !absorbedLiveProof,
    consumePath: absorbedLiveProof
      ? null
      : SETUP_WIZARD_APPROVAL_BOUND_BOOTSTRAP_SESSION_CONSUME_PATH,
    consumeEnabled: requestRecorded && !absorbedLiveProof,
    returnTo: absorbedLiveProof ? null : `${url?.pathname || "/setup/wizard"}${url?.search || ""}`,
    recommendedNextStep: null,
    checkedAt: new Date().toISOString()
  };

  if (requestInvalid) {
    return {
      ...base,
      state: "request_rejected",
      summary:
        "VTDD rejected the approval-bound bootstrap session request because it did not satisfy the GO + passkey contract.",
      guidance: [
        "This path does not open a privileged session unless the request shape matches GO + passkey.",
        "Current setup still does not mint short-lived bootstrap authority from this request."
      ],
      recommendedNextStep: {
        id: "repeat_go_passkey_request",
        summary:
          "Submit the bootstrap session request again only after the wizard can carry a valid GO + passkey-shaped request.",
        action: "record_go_passkey_request"
      },
      contract: {
        ...base.contract,
        preview: {
          ...base.contract.preview,
          blockedBy: ["go_passkey_contract_not_satisfied"]
        }
      }
    };
  }

  if (requestMissing) {
    const pendingInstallationId = resolvePendingInstallationIdForRequestAction({
      url,
      githubAppSetupCheck
    });
    return {
      ...base,
      state: "request_required_for_capture",
      summary:
        "VTDD blocked installation capture in this setup flow because no current GO + passkey request token was present.",
      requiredAction: {
        id: "record_go_passkey_request_for_capture",
        path: SETUP_WIZARD_APPROVAL_BOUND_BOOTSTRAP_SESSION_REQUEST_PATH,
        returnTo: `${url?.pathname || "/setup/wizard"}${url?.search || ""}`,
        approvalBoundary: "GO + passkey",
        pendingInstallationIdParam: "pending_installation_id",
        ...(pendingInstallationId ? { pendingInstallationId } : {})
      },
      guidance: [
        "Record a fresh GO + passkey request in this same setup flow before retrying installation capture.",
        "This fail-closed boundary keeps installation binding write approval-bound and auditable."
      ],
      recommendedNextStep: {
        id: "record_go_passkey_request_for_capture",
        summary:
          "Record GO + passkey request now, then retry installation capture in this same setup flow.",
        action: "record_go_passkey_request"
      }
    };
  }

  if (!authConfig.enabled) {
    return {
      ...base,
      state: "blocked_by_entry_boundary",
      summary:
        "VTDD does not expose the approval-bound bootstrap session because setup wizard entry protection is not configured yet.",
      guidance: [
        "Configure setup wizard passcode/session protection before exposing a privileged bootstrap path.",
        "Do not replace the missing boundary with an open secret write form."
      ],
      recommendedNextStep: {
        id: "configure_setup_wizard_entry_boundary",
        summary:
          "Restore the setup wizard entry boundary first so VTDD can safely expose any future privileged bootstrap path.",
        action: "configure_setup_wizard_passcode_session"
      }
    };
  }

  if (bootstrapState !== "available") {
    const missingSet = new Set(missingPrerequisites);
    let recommendedNextStep = {
      id: "restore_operator_bootstrap_prerequisites",
      summary:
        "Restore the operator-seeded Cloudflare bootstrap prerequisites before trying to open any approval-bound bootstrap session.",
      action: "configure_cloudflare_bootstrap_prerequisites"
    };

    if (
      missingSet.has("GITHUB_MANIFEST_CONVERSION_TOKEN") &&
      missingPrerequisites.length === 1
    ) {
      recommendedNextStep = {
        id: "restore_manifest_conversion_token",
        summary:
          "Restore the operator-managed manifest conversion token so VTDD can continue GitHub App bootstrap from wizard.",
        action: "set_github_manifest_conversion_token"
      };
    }

    return {
      ...base,
      state: requestRecorded
        ? "request_recorded_but_blocked"
        : "blocked_by_operator_prerequisites",
      summary:
        requestRecorded
          ? "VTDD recorded the GO + passkey-shaped request, but no privileged bootstrap session was opened because operator-seeded prerequisites are still missing."
          : "VTDD does not expose the approval-bound bootstrap session yet because the current runtime is still missing operator-seeded bootstrap prerequisites.",
      guidance: [
        requestRecorded
          ? "The request was acknowledged, but it did not grant write authority or open a privileged session."
          : "Current setup can explain the future path, but it cannot safely absorb the bounded write step yet.",
        missingPrerequisites.length > 0
          ? `Current missing prerequisites: ${missingPrerequisites.join(", ")}.`
          : "Re-check Cloudflare bootstrap prerequisites before enabling a privileged setup path."
      ],
      recommendedNextStep,
      contract: {
        ...base.contract,
        preview: {
          ...base.contract.preview,
          blockedBy: missingPrerequisites
        }
      }
    };
  }

  let recommendedNextStep = {
    id: "wait_for_attestation_backed_bootstrap_authority",
    summary:
      "The runtime is ready for a future approval-bound bootstrap session, but VTDD still needs attestation-backed bootstrap authority before it can open one.",
    action: "implement_attestation_backed_bootstrap_authority"
  };

  if (
    effectivePreview.plannedWrites.length === 1 &&
    effectivePreview.plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID"
  ) {
    recommendedNextStep = {
      id: "capture_or_detect_installation_binding",
      summary:
        "Finish installation binding first so VTDD can narrow the future approval-bound bootstrap session to the remaining installation step.",
      action: "capture_installation_binding"
    };
  } else if (effectivePreview.plannedWrites.length > 1) {
    recommendedNextStep = {
      id: "complete_github_app_bootstrap",
      summary:
        "Complete the current GitHub App bootstrap path first so the future approval-bound session can shrink to the minimum remaining write set.",
      action: "write_missing_github_app_runtime_fields"
    };
  } else if (normalizeText(effectiveGitHubAppSetupCheck?.state) === "ready") {
    recommendedNextStep = {
      id: "continue_with_live_github_capability",
      summary:
        "The bounded bootstrap path has already proven live GitHub readiness, so the next step is to continue with real VTDD GitHub capability rather than more setup wiring.",
      action: "use_live_github_capability"
    };
  }

  return {
    ...base,
    approvalBoundary: absorbedLiveProof ? null : base.approvalBoundary,
    targetAbsorbs: absorbedLiveProof ? [] : base.targetAbsorbs,
    stepBoundaries: absorbedLiveProof ? null : base.stepBoundaries,
    completionReadout: absorbedLiveProof ? null : base.completionReadout,
    safetyReadout: absorbedLiveProof ? null : base.safetyReadout,
    evidenceReadout: absorbedLiveProof ? null : base.evidenceReadout,
    phaseReadout: absorbedLiveProof ? null : base.phaseReadout,
    progressReadout: absorbedLiveProof ? null : base.progressReadout,
    providerConnectionReadout: absorbedLiveProof ? null : base.providerConnectionReadout,
    capabilityReadout: absorbedLiveProof ? null : base.capabilityReadout,
    serviceConnectionModelReadout: absorbedLiveProof
      ? null
      : base.serviceConnectionModelReadout,
    serviceConnectionActionability: absorbedLiveProof
      ? null
      : base.serviceConnectionActionability,
    serviceConnectionFrictionReadout: absorbedLiveProof
      ? null
      : base.serviceConnectionFrictionReadout,
    serviceConnectionHandoffShapeReadout: absorbedLiveProof
      ? null
      : base.serviceConnectionHandoffShapeReadout,
    serviceConnectionReturnContinuityReadout: absorbedLiveProof
      ? null
      : base.serviceConnectionReturnContinuityReadout,
    envelopeConsumptionPlan: requestRecorded
      && !absorbedLiveProof
      ? buildBootstrapSessionEnvelopeConsumptionPlan({
          bootstrapState,
          preview: effectivePreview
        })
      : null,
    envelopeConsumePreflight: requestRecorded
      && !absorbedLiveProof
      ? buildBootstrapSessionEnvelopeConsumePreflight({
          bootstrapState,
          preview: effectivePreview
        })
      : null,
    envelopeConsumeOutcome: requestRecorded
      && !absorbedLiveProof
      ? buildBootstrapSessionEnvelopeConsumeOutcome({
          bootstrapState,
          preview: effectivePreview
        })
      : null,
    envelopeConsumeAuditReadout: requestRecorded
      && !absorbedLiveProof
      ? buildBootstrapSessionEnvelopeConsumeAuditReadout({
          bootstrapState,
          preview: effectivePreview
        })
      : null,
    state:
      absorbedLiveProof
        ? "bounded_consume_completed_with_live_proof"
        : requestRecorded
          ? "request_recorded_but_deferred"
          : "deferred",
    summary:
      absorbedLiveProof
        ? "VTDD consumed the bounded installation-binding step and immediately proved live GitHub readiness in the same setup flow."
        : requestRecorded
        ? "VTDD recorded the GO + passkey-shaped request, but no privileged bootstrap session was opened because attestation-backed bootstrap authority is still deferred."
        : "VTDD has the operator-seeded baseline needed for a future approval-bound bootstrap session, but the session itself is still intentionally deferred.",
    guidance: absorbedLiveProof
      ? []
      : [
          requestRecorded
            ? "This request proves the wizard can carry approval-bound intent without granting authority yet."
            : "Current live setup still uses the bounded GitHub App bootstrap path plus operator-managed Cloudflare authority.",
          "The future approval-bound session should absorb setup-critical transport without becoming a generic secret terminal.",
          "Do not present setup as wizard-complete until this path is implemented and verified."
        ],
    recommendedNextStep,
    contract: absorbedLiveProof
      ? null
      : {
          ...base.contract,
          preview: {
            ...base.contract.preview,
            writeTarget: base.contract.preview?.writeTarget ?? null,
            plannedWrites: Array.isArray(base.contract.preview?.plannedWrites)
              ? [...base.contract.preview.plannedWrites]
              : [],
            postChecks: Array.isArray(base.contract.preview?.postChecks)
              ? [...base.contract.preview.postChecks]
              : [],
            blockedBy: ["attestation_backed_bootstrap_authority_not_implemented"]
          }
        }
  };
}

async function buildBootstrapSessionEnvelope({
  url,
  sessionSecret,
  bootstrapState,
  preview,
  expiresAt
}) {
  const token = await createSetupWizardBootstrapSessionEnvelopeToken({
    url,
    expiresAt,
    bootstrapState,
    preview,
    sessionSecret
  });

  return {
    state: "signed_request_bound_envelope",
    version: SETUP_WIZARD_BOOTSTRAP_SESSION_ENVELOPE_VERSION,
    envelopeId: token.slice(0, 12),
    envelopeToken: token,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    singleUse: true,
    boundScope: "allowlisted_runtime_bootstrap_only",
    bootstrapState,
    writeTarget: preview?.writeTarget ?? null,
    plannedWrites: Array.isArray(preview?.plannedWrites) ? [...preview.plannedWrites] : [],
    postChecks: Array.isArray(preview?.postChecks) ? [...preview.postChecks] : []
  };
}

function buildBootstrapSessionEnvelopeConsumeResult({ url, preview }) {
  const state = normalizeText(
    url?.searchParams?.get(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_STATE_PARAM)
  );
  if (!state) {
    return null;
  }

  const envelopeId = normalizeText(
    url?.searchParams?.get(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_ENVELOPE_ID_PARAM)
  );
  const failureReason = normalizeText(
    url?.searchParams?.get(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_REASON_PARAM)
  );
  const proofState = normalizeText(
    url?.searchParams?.get(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_PROOF_STATE_PARAM)
  );
  const postChecks = Array.isArray(preview?.postChecks) ? preview.postChecks : [];

  if (state === "completed") {
    return {
      state: "consume_completed",
      summary:
        "VTDD consumed the signed bootstrap session envelope and stored the detected installation binding on Worker runtime.",
      envelopeId,
      proof: buildBootstrapSessionConsumeProofReadout({ proofState }),
      nextProof: buildBootstrapSessionConsumeCompletedNextProof({
        proofState,
        postChecks
      }),
      requiredAction: buildBootstrapSessionConsumeCompletedRequiredAction({
        proofState,
        url
      })
    };
  }

  if (state === "deferred") {
    return {
      state: "consume_deferred",
      summary:
        "VTDD validated the signed bootstrap session envelope against the current wizard context, but attestation-backed consume is still deferred.",
      envelopeId,
      nextProof: {
        id: postChecks.join("_then_") || "attested_bootstrap_consume_proof_missing",
        summary:
          "The next proof is one attested consume path that can perform the bounded write and immediately run the planned post-write checks."
      }
    };
  }

  if (state === "invalid") {
    return {
      state: "consume_rejected",
      summary:
        "VTDD rejected the bootstrap session consume attempt because the signed envelope did not match the current wizard context.",
      envelopeId,
      nextProof: {
        id: "reissue_request_bound_envelope_for_current_context",
        summary:
          "Return to the current wizard context, record a fresh request, and issue a new envelope before trying consume again."
      }
    };
  }

  if (state === "failed") {
    return {
      state: "consume_failed",
      summary:
        "VTDD validated the signed envelope but failed closed before the bounded installation binding write could complete.",
      envelopeId,
      nextProof: buildBootstrapSessionConsumeFailedNextProof({ failureReason }),
      requiredAction: buildBootstrapSessionConsumeFailedRequiredAction({
        failureReason,
        url
      })
    };
  }

  return null;
}

function buildBootstrapSessionConsumeCompletedNextProof({ proofState, postChecks }) {
  if (proofState === "ready") {
    return {
      id: "live_readiness_verified_in_same_flow",
      summary:
        "Live readiness proof is already verified in this same setup flow, so no additional installation-binding proof step is pending."
    };
  }

  if (proofState === "probe_failed") {
    return {
      id: "rerun_live_readiness_probe_same_flow",
      summary:
        "Fix the live probe blocker, then rerun readiness diagnostics in this same setup flow without re-running installation capture."
    };
  }

  if (proofState === "configured") {
    return {
      id: "run_live_readiness_diagnostics_same_flow",
      summary:
        "Run live readiness diagnostics in this same setup flow to move from runtime-configured state to verified live proof."
    };
  }

  return {
    id: postChecks.join("_then_") || "github_app_live_readiness_proof_pending",
    summary:
      "The next proof is the planned installation-token mint and live probe checks succeeding after the one-time installation binding write."
  };
}

function buildBootstrapSessionConsumeCompletedRequiredAction({ proofState, url }) {
  if (proofState !== "probe_failed" && proofState !== "configured") {
    return null;
  }

  const currentReturnTo = `${url?.pathname || "/setup/wizard"}${url?.search || ""}`;
  const diagnosticsPath =
    normalizeSetupWizardDiagnosticsReturnTo(currentReturnTo) || currentReturnTo;

  return {
    id: "run_live_readiness_diagnostics_same_flow",
    method: "GET",
    path: diagnosticsPath
  };
}

function buildBootstrapSessionConsumeFailedRequiredAction({ failureReason, url }) {
  const currentReturnTo = `${url?.pathname || "/setup/wizard"}${url?.search || ""}`;
  const diagnosticsPath =
    normalizeSetupWizardDiagnosticsReturnTo(currentReturnTo) || currentReturnTo;

  if (
    failureReason === "github_app_installation_capture_pending_selection_state_drifted" ||
    failureReason === "github_app_installation_capture_pending_selection_mismatch" ||
    failureReason === "github_app_installation_capture_detected_id_mismatch" ||
    failureReason === "github_app_installation_capture_invalid_selection_candidate"
  ) {
    return {
      id: "rerun_installation_detection_same_flow",
      method: "GET",
      path: diagnosticsPath
    };
  }

  return null;
}

function buildBootstrapSessionConsumeFailedNextProof({ failureReason }) {
  if (failureReason === "github_app_installation_capture_pending_selection_state_drifted") {
    return {
      id: failureReason,
      summary:
        "Rerun installation detection in this same setup flow, then issue a fresh request-bound envelope for the current capturable state before retrying consume."
    };
  }

  if (failureReason === "github_app_installation_capture_pending_selection_mismatch") {
    return {
      id: failureReason,
      summary:
        "Retry from the same setup flow with the matched pending installation candidate, then issue a fresh request-bound envelope before consume."
    };
  }

  if (failureReason === "github_app_installation_capture_detected_id_mismatch") {
    return {
      id: failureReason,
      summary:
        "Use the currently detected installation candidate for this setup flow, then request and consume a fresh envelope."
    };
  }

  if (failureReason === "github_app_installation_capture_invalid_selection_candidate") {
    return {
      id: failureReason,
      summary:
        "Choose one of the current in-flow selection candidates, then issue a fresh request-bound envelope before consume."
    };
  }

  return {
    id: failureReason || "bounded_installation_binding_write_failed",
    summary:
      "Restore the bounded installation write path, then issue a fresh envelope before retrying consume."
  };
}

function buildBootstrapSessionConsumeProofReadout({ proofState }) {
  if (!proofState) {
    return null;
  }

  if (proofState === "ready") {
    return {
      state: "ready",
      summary:
        "VTDD immediately rechecked GitHub App readiness after the bounded installation binding write and confirmed live repository access."
    };
  }

  if (proofState === "probe_failed") {
    return {
      state: "probe_failed",
      summary:
        "VTDD completed the bounded installation binding write, but the immediate live readiness probe still failed closed."
    };
  }

  if (proofState === "configured") {
    return {
      state: "configured",
      summary:
        "VTDD completed the bounded installation binding write, and runtime now reports the GitHub App configuration as complete pending live diagnostics."
    };
  }

  return {
    state: proofState,
    summary:
      "VTDD recorded a post-consume proof state after the bounded installation binding write."
  };
}

function deriveEffectiveGitHubAppSetupCheckFromContinuation({ url, githubAppSetupCheck }) {
  const base = githubAppSetupCheck ?? null;
  const consumeState = normalizeText(
    url?.searchParams?.get(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_STATE_PARAM)
  );
  const proofState = normalizeText(
    url?.searchParams?.get(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_PROOF_STATE_PARAM)
  );

  if (consumeState !== "completed" || !base) {
    return base;
  }

  const {
    installationSelectionOptions: _installationSelectionOptions,
    installationCapturePath: _installationCapturePath,
    requestDetectedInstallationAction: _requestDetectedInstallationAction,
    completeDetectedInstallationAction: _completeDetectedInstallationAction,
    detectedInstallationId: _detectedInstallationId,
    ...rest
  } = base;

  if (proofState === "ready") {
    return {
      ...rest,
      state: "ready",
      summary:
        "GitHub App setup check passed in the current setup flow: VTDD completed installation binding and confirmed live repository access.",
      links: [],
      guidance: [
        "VTDD can continue with live GitHub capability from this setup flow.",
        "The single-use approval-bound installation-binding request is already consumed and absorbed in this setup flow.",
        "No new GO + passkey request is needed in this flow unless the installation candidate changes.",
        "Keep App permissions minimal and expand only when a specific runtime path needs it."
      ],
      evidence: {
        stage: "live_probe",
        source: "github_app_live"
      }
    };
  }

  if (proofState === "configured") {
    return {
      ...rest,
      state: "configured",
      progressVariant: "post_consume_configured",
      returnTo:
        normalizeSetupWizardDiagnosticsReturnTo(rest.returnTo || `${url.pathname}${url.search || ""}`) ||
        "/setup/wizard?githubAppCheck=on",
      links: [],
      summary:
        "GitHub App installation binding completed in the current setup flow, and runtime now reports the GitHub App configuration as complete pending live diagnostics.",
      guidance: [
        "Installation binding is already stored in this same setup flow.",
        "The single-use approval-bound request for installation binding is already consumed and absorbed in this setup flow.",
        "Do not issue a new GO + passkey request for installation binding at this stage unless the installation candidate changes.",
        "Run githubAppCheck=on again to execute live readiness diagnostics without re-entering installation IDs.",
        "No extra external-provider redirect or manual installation ID transport is needed at this stage."
      ],
      evidence: {
        stage: "configuration_check",
        source: "worker_runtime"
      }
    };
  }

  if (proofState === "probe_failed") {
    return {
      ...rest,
      state: "probe_failed",
      progressVariant: "post_consume_probe_failed",
      returnTo:
        normalizeSetupWizardDiagnosticsReturnTo(rest.returnTo || `${url.pathname}${url.search || ""}`) ||
        "/setup/wizard?githubAppCheck=on",
      links: [],
      summary:
        "GitHub App installation binding completed in the current setup flow, but the immediate live readiness probe still failed closed.",
      guidance: [
        "Installation binding already completed in this same setup flow, so do not retry installation capture.",
        "The single-use approval-bound request for installation binding is already consumed and absorbed in this setup flow.",
        "Do not issue a new GO + passkey request for installation binding at this stage unless the installation candidate changes.",
        "Fix the live probe blocker, then rerun githubAppCheck=on to continue readiness verification."
      ],
      evidence: {
        stage: "live_probe",
        source: "github_app_live"
      }
    };
  }

  return base;
}

function deriveEffectiveBootstrapSessionContext({ url, preview, githubAppSetupCheck }) {
  const consumeState = normalizeText(
    url?.searchParams?.get(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_STATE_PARAM)
  );
  const proofState = normalizeText(
    url?.searchParams?.get(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_PROOF_STATE_PARAM)
  );

  if (consumeState !== "completed") {
    return {
      preview,
      githubAppSetupCheck
    };
  }

  const effectivePreview = {
    ...(preview ?? {}),
    plannedWrites: []
  };
  const effectiveGitHubAppSetupCheck =
    proofState === "ready" || proofState === "configured"
      ? {
          ...(githubAppSetupCheck ?? {}),
          state: proofState
        }
      : githubAppSetupCheck;

  return {
    preview: effectivePreview,
    githubAppSetupCheck: effectiveGitHubAppSetupCheck
  };
}

function buildBootstrapSessionEnvelopeConsumptionPlan({ bootstrapState, preview }) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const postChecks = Array.isArray(preview?.postChecks) ? preview.postChecks : [];

  if (bootstrapState !== "available") {
    return {
      consumptionIntent: {
        id: "do_not_consume_before_prerequisites_are_restored",
        summary:
          "This envelope is not meant to consume into a write while operator prerequisites are still missing."
      },
      consumptionBoundary: {
        id: "fail_closed_on_missing_operator_prerequisites",
        summary:
          "Consumption must fail closed if the operator-seeded bootstrap prerequisites are not present at consume time."
      },
      consumptionVerification: {
        id: "recheck_prerequisites_before_any_write_attempt",
        summary:
          "Before any future consume path runs, VTDD must recheck the prerequisite state instead of trusting the old request alone."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      consumptionIntent: {
        id: "consume_once_for_installation_binding_only",
        summary:
          "The envelope is intended for one installation-binding write only, followed by installation token mint and live probe checks."
      },
      consumptionBoundary: {
        id: "fail_closed_if_scope_widens_beyond_installation_binding",
        summary:
          "Consumption must fail closed if the remaining scope widens beyond installation binding or if the current gap no longer matches the envelope."
      },
      consumptionVerification: {
        id: postChecks.join("_then_") || "verify_installation_binding_after_consume",
        summary:
          "After consumption, VTDD should immediately run the planned installation follow-up checks before considering the envelope spent."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      consumptionIntent: {
        id: "consume_once_for_remaining_runtime_identity_write_set",
        summary:
          "The envelope is intended for one bounded runtime-identity write set only, not for repeated or broadened secret management."
      },
      consumptionBoundary: {
        id: "fail_closed_if_remaining_write_set_changes",
        summary:
          "Consumption must fail closed if the remaining write set has changed from what the envelope was signed to carry."
      },
      consumptionVerification: {
        id: postChecks.join("_then_") || "verify_runtime_identity_after_consume",
        summary:
          "After consumption, VTDD should immediately run the planned post-write checks so the flow can shrink or stop with evidence."
      }
    };
  }

  return {
    consumptionIntent: {
      id: "consume_once_for_verification_bound_follow_up",
      summary:
        "The envelope is intended only for a verification-bound follow-up path once no setup-critical writes remain."
    },
    consumptionBoundary: {
      id: "fail_closed_if_consume_reopens_bootstrap_write_scope",
      summary:
        "Consumption must fail closed if it would reopen bootstrap write scope after configuration is already present."
      },
    consumptionVerification: {
      id: postChecks.join("_then_") || "verify_live_readiness_after_consume",
      summary:
        "After consumption, VTDD should only run the remaining verification checks and then retire the envelope."
    }
  };
}

function buildBootstrapSessionEnvelopeConsumePreflight({ bootstrapState, preview }) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];

  if (bootstrapState !== "available") {
    return {
      preflightGate: {
        id: "operator_prerequisites_must_be_present_at_consume_time",
        summary:
          "Before consume, VTDD must confirm that the operator-seeded bootstrap prerequisites are still present."
      },
      preflightFailure: {
        id: "fail_closed_if_prerequisites_dropped_before_consume",
        summary:
          "If the prerequisite baseline dropped after the request was signed, consume must fail closed immediately."
      },
      preflightRecovery: {
        id: "restore_prerequisites_and_reissue_request_before_consume",
        summary:
          "Recovery is to restore prerequisites and issue a fresh request and envelope before any consume path runs."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      preflightGate: {
        id: "remaining_scope_must_still_equal_installation_binding_only",
        summary:
          "Before consume, VTDD must confirm that installation binding is still the only remaining bounded write."
      },
      preflightFailure: {
        id: "fail_closed_if_installation_scope_changed_before_consume",
        summary:
          "If installation binding was resolved or the remaining scope widened, consume must fail closed instead of replaying the old envelope."
      },
      preflightRecovery: {
        id: "recompute_installation_scope_and_reissue_envelope",
        summary:
          "Recovery is to recompute the current installation scope and issue a fresh envelope only if that exact remaining step still exists."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      preflightGate: {
        id: "remaining_write_set_must_match_signed_envelope_scope",
        summary:
          "Before consume, VTDD must confirm that the current remaining runtime write set still matches the signed envelope scope."
      },
      preflightFailure: {
        id: "fail_closed_if_runtime_write_set_shifted_before_consume",
        summary:
          "If the remaining runtime write set changed after signing, consume must fail closed rather than applying stale bootstrap intent."
      },
      preflightRecovery: {
        id: "recompute_runtime_scope_and_reissue_envelope",
        summary:
          "Recovery is to recompute the latest runtime scope and issue a fresh envelope only for that current bounded write set."
      }
    };
  }

  return {
    preflightGate: {
      id: "remaining_work_must_stay_verification_bound",
      summary:
        "Before consume, VTDD must confirm that the remaining work is still verification-bound and does not reopen bootstrap write scope."
    },
    preflightFailure: {
      id: "fail_closed_if_verification_path_reopens_write_scope",
      summary:
        "If the remaining path reopens setup-critical writes, consume must fail closed instead of stretching the old envelope."
    },
    preflightRecovery: {
      id: "recompute_verification_scope_and_reissue_envelope",
      summary:
        "Recovery is to recompute the current remaining verification scope and issue a fresh envelope only for that path."
    }
  };
}

function buildBootstrapSessionEnvelopeConsumeOutcome({ bootstrapState, preview }) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const postChecks = Array.isArray(preview?.postChecks) ? preview.postChecks : [];

  if (bootstrapState !== "available") {
    return {
      outcomeState: {
        id: "blocked_until_prerequisite_consume_path_exists",
        summary:
          "Any consume outcome stays blocked until the prerequisite baseline exists and a real consume path can run."
      },
      outcomeFailure: {
        id: "consume_would_fail_closed_on_missing_prerequisites",
        summary:
          "If consume were attempted in this state, it should fail closed because the prerequisite baseline is not present."
      },
      outcomeNextProof: {
        id: "proof_of_restored_prerequisites_before_consume",
        summary:
          "The next proof would be evidence that prerequisites were restored before a fresh consume attempt was allowed."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      outcomeState: {
        id: "deferred_until_attested_installation_binding_consume_exists",
        summary:
          "The consume outcome is still deferred until VTDD has an attested way to spend the envelope on the single installation-binding step."
      },
      outcomeFailure: {
        id: "future_consume_must_fail_closed_if_installation_gap_changed",
        summary:
          "A future consume attempt must fail closed if the installation-binding gap changed before the envelope was spent."
      },
      outcomeNextProof: {
        id: postChecks.join("_then_") || "installation_binding_consume_proof_missing",
        summary:
          "The next proof would be the planned installation follow-up checks succeeding after one attested consume."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      outcomeState: {
        id: "deferred_until_attested_runtime_bootstrap_consume_exists",
        summary:
          "The consume outcome is still deferred until VTDD has an attested way to spend the envelope on the current bounded runtime write set."
      },
      outcomeFailure: {
        id: "future_consume_must_fail_closed_if_runtime_scope_changed",
        summary:
          "A future consume attempt must fail closed if the bounded runtime scope changed before the envelope was spent."
      },
      outcomeNextProof: {
        id: postChecks.join("_then_") || "runtime_bootstrap_consume_proof_missing",
        summary:
          "The next proof would be the planned post-write checks succeeding after one attested consume of the bounded write set."
      }
    };
  }

  return {
    outcomeState: {
      id: "deferred_until_attested_verification_consume_exists",
      summary:
        "The consume outcome is still deferred until VTDD has an attested way to spend the envelope on the remaining verification-bound path."
    },
    outcomeFailure: {
      id: "future_consume_must_fail_closed_if_verification_scope_reopens",
      summary:
        "A future consume attempt must fail closed if the verification path reopens bootstrap write scope."
    },
    outcomeNextProof: {
      id: postChecks.join("_then_") || "verification_consume_proof_missing",
      summary:
        "The next proof would be the remaining verification checks succeeding after one attested consume."
    }
  };
}

function buildBootstrapSessionEnvelopeConsumeAuditReadout({ bootstrapState, preview }) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];

  if (bootstrapState !== "available") {
    return {
      auditRecord: {
        id: "future_audit_record_required_even_for_blocked_consume",
        summary:
          "A future consume path should still record that consume was blocked by missing prerequisites rather than silently dropping the attempt."
      },
      auditFailure: {
        id: "audit_must_fail_closed_if_block_reason_cannot_be_recorded",
        summary:
          "If VTDD cannot record why consume was blocked, it should fail closed rather than pretend the attempt never happened."
      },
      auditRetention: {
        id: "retain_block_reason_with_request_bound_context",
        summary:
          "The audit record should retain the request-bound context and blocked reason so the operator can understand why consume did not proceed."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      auditRecord: {
        id: "future_audit_record_for_single_installation_binding_consume",
        summary:
          "A future consume path should record the one-time installation-binding write, the envelope id, and the immediate follow-up checks."
      },
      auditFailure: {
        id: "audit_must_fail_closed_if_installation_consume_cannot_be_traced",
        summary:
          "If the installation-binding consume cannot be traced back to the signed envelope and resulting checks, VTDD should fail closed."
      },
      auditRetention: {
        id: "retain_installation_consume_trace_until_follow_up_checks_complete",
        summary:
          "The audit record should stay available through the installation follow-up checks so the one-shot consume can be reviewed end to end."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      auditRecord: {
        id: "future_audit_record_for_bounded_runtime_bootstrap_consume",
        summary:
          "A future consume path should record the bounded runtime write set, envelope id, and the exact post-write checks that prove what happened."
      },
      auditFailure: {
        id: "audit_must_fail_closed_if_runtime_consume_cannot_be_traced",
        summary:
          "If the bounded runtime consume cannot be traced to a signed envelope and resulting checks, VTDD should fail closed."
      },
      auditRetention: {
        id: "retain_runtime_consume_trace_through_post_write_proof",
        summary:
          "The audit record should remain available until the post-write proof is complete so the consumed envelope can be audited end to end."
      }
    };
  }

  return {
    auditRecord: {
      id: "future_audit_record_for_verification_bound_consume",
      summary:
        "A future consume path should record the verification-bound consume, envelope id, and the final readiness proof it was meant to unlock."
    },
    auditFailure: {
      id: "audit_must_fail_closed_if_verification_consume_cannot_be_traced",
      summary:
        "If the verification-bound consume cannot be traced to the signed envelope and resulting proof, VTDD should fail closed."
    },
    auditRetention: {
      id: "retain_verification_consume_trace_until_final_readiness_proof",
      summary:
        "The audit record should remain available until the final readiness proof is complete."
    }
  };
}

function buildBootstrapSessionWriteTarget({ githubAppBootstrap }) {
  const accountId = normalizeText(githubAppBootstrap?.accountId);
  const scriptName = normalizeText(githubAppBootstrap?.scriptName);
  if (accountId && scriptName) {
    return `cloudflare:${accountId}/workers/scripts/${scriptName}/secrets`;
  }
  if (scriptName) {
    return `cloudflare:workers/scripts/${scriptName}/secrets`;
  }
  return "cloudflare:workers/scripts/<unresolved>/secrets";
}

function buildBootstrapSessionPreview({ env, githubAppBootstrap, githubAppSetupCheck }) {
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
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";
  let postChecks = [];

  if (setupState === "installation_detected") {
    postChecks = [
      "github_app_installation_capture",
      "github_app_installation_token_mint",
      "github_app_live_probe"
    ];
  } else if (
    setupState === "awaiting_installation" ||
    setupState === "installation_selection_required"
  ) {
    postChecks = [
      "github_app_installation_detection_or_capture",
      "github_app_installation_token_mint",
      "github_app_live_probe"
    ];
  } else if (missingFields.length === 0) {
    postChecks = ["github_app_installation_token_mint", "github_app_live_probe"];
  } else if (missingFields.length === 1 && missingFields[0] === "GITHUB_APP_INSTALLATION_ID") {
    postChecks = [
      "github_app_installation_detection_or_capture",
      "github_app_installation_token_mint",
      "github_app_live_probe"
    ];
  } else {
    postChecks = ["github_app_setup_check"];
  }

  return {
    writeTarget: buildBootstrapSessionWriteTarget({ githubAppBootstrap }),
    plannedWrites: missingFields.length > 0 ? missingFields : [],
    postChecks
  };
}

function buildBootstrapSessionStepBoundaries({ preview, githubAppSetupCheck }) {
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const plannedWriteSet = new Set(plannedWrites);
  const vtddOwnedSteps = [
    "redirect_context_preservation",
    "installation_detection_or_capture_surface",
    "readiness_status_reporting"
  ];
  const externalRedirects = [];

  if (
    plannedWriteSet.has("GITHUB_APP_ID") ||
    plannedWriteSet.has("GITHUB_APP_PRIVATE_KEY")
  ) {
    externalRedirects.push("github_app_creation_and_manifest_consent");
  }

  if (
    plannedWriteSet.has("GITHUB_APP_INSTALLATION_ID") ||
    setupState === "awaiting_installation" ||
    setupState === "installation_selection_required"
  ) {
    externalRedirects.push("github_app_installation_consent");
  }

  return {
    vtddOwnedSteps,
    externalRedirects
  };
}

function buildBootstrapSessionCapabilityReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];

  if (bootstrapState !== "available") {
    return {
      githubConnection: {
        state: "blocked",
        summary:
          "GitHub connection is still blocked because VTDD cannot yet complete the bootstrap path from runtime."
      },
      workerRuntime: {
        state: "blocked",
        summary:
          "Worker runtime is not ready for a bounded setup-critical write because operator bootstrap prerequisites are still missing."
      },
      vtddCapability: {
        state: "cannot_yet_continue_github_app_bootstrap",
        summary:
          "VTDD cannot yet carry GitHub App bootstrap through to readiness because the current runtime is missing required bootstrap prerequisites."
      }
    };
  }

  if (plannedWrites.length === 0) {
    if (setupState === "ready") {
      return {
        githubConnection: {
          state: "verified_live",
          summary:
            "GitHub connection is already verified live in this setup flow."
        },
        workerRuntime: {
          state: "verified_runtime_identity",
          summary:
            "Worker runtime already holds the verified GitHub App identity and installation binding for this setup path."
        },
        vtddCapability: {
          state: "can_continue_live_github_work",
          summary:
            "VTDD can continue from setup into real GitHub work because live readiness is already proven."
        }
      };
    }

    return {
      githubConnection: {
        state: "ready",
        summary: "GitHub connection is ready for live verification from VTDD."
      },
      workerRuntime: {
        state: "ready_for_verification",
        summary:
          "Worker runtime already has the current GitHub App identity and does not need another bounded write for setup."
      },
      vtddCapability: {
        state: "can_verify_live_github_readiness",
        summary:
          "VTDD can verify live GitHub readiness from the wizard, even though approval-bound bootstrap authority is still deferred."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      githubConnection: {
        state: "installation_binding_pending",
        summary:
          "GitHub App identity is present, but installation binding is still the remaining connection step."
      },
      workerRuntime: {
        state: "ready_for_narrow_installation_write",
        summary:
          "Worker runtime is ready for a narrow installation-binding write once the approval-bound path exists."
      },
      vtddCapability: {
        state: "cannot_yet_mint_installation_tokens",
        summary:
          "VTDD cannot yet mint installation tokens, but finishing installation binding would unlock live GitHub readiness checks."
      }
    };
  }

  return {
    githubConnection: {
      state: "bootstrap_in_progress",
      summary:
        setupState === "installation_detected"
          ? "GitHub App installation is detectable, but runtime identity is still incomplete."
          : "GitHub connection is still in progress because VTDD is missing current GitHub App runtime identity."
    },
    workerRuntime: {
      state: "ready_for_bounded_bootstrap",
      summary:
        "Worker runtime has the operator-seeded baseline needed for a future bounded bootstrap write."
    },
    vtddCapability: {
      state: "cannot_yet_mint_installation_tokens",
      summary:
        "VTDD cannot yet mint installation tokens or verify live GitHub readiness until the missing GitHub App runtime fields are stored."
    }
  };
}

function buildBootstrapSessionPhaseReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];

  if (bootstrapState !== "available") {
    return {
      currentPhase: {
        id: "bootstrap_prerequisites_blocked",
        summary:
          "VTDD is still before the approval-bound bootstrap phase because operator-seeded prerequisites are missing."
      },
      nextCapability: {
        id: "bounded_runtime_bootstrap_availability",
        summary:
          "Once prerequisites are restored, VTDD can present a bounded bootstrap path with the remaining setup-critical writes in one flow."
      },
      transitionTrigger: {
        id: "restore_operator_bootstrap_prerequisites",
        summary:
          "Restore the missing bootstrap prerequisites so wizard can move from blocked prerequisite reading into bounded bootstrap planning."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      currentPhase: {
        id: "installation_binding_pending",
        summary:
          "VTDD has GitHub App identity in runtime and is now narrowed to the installation-binding phase."
      },
      nextCapability: {
        id: "installation_token_mint_and_live_probe",
        summary:
          "After installation binding, VTDD can mint installation tokens and verify live GitHub readiness."
      },
      transitionTrigger: {
        id: "capture_or_detect_installation_binding",
        summary:
          "Capture or detect the installation binding so wizard can move from partial identity to live GitHub verification."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      currentPhase: {
        id: "runtime_identity_bootstrap_pending",
        summary:
          setupState === "installation_detected"
            ? "VTDD has crossed provider installation consent, but runtime identity is still incomplete."
            : "VTDD is still collecting the current GitHub App runtime identity needed for live readiness."
      },
      nextCapability: {
        id: "narrow_installation_binding_phase",
        summary:
          "After the missing GitHub App runtime fields are stored, wizard can narrow to installation binding as the remaining setup step."
      },
      transitionTrigger: {
        id: "write_missing_github_app_runtime_fields",
        summary:
          "Complete the current GitHub App bootstrap path so VTDD can move from broad runtime bootstrap to the narrower installation phase."
      }
    };
  }

  if (setupState === "ready") {
    return {
      currentPhase: {
        id: "live_readiness_verified",
        summary:
          "VTDD has already verified live GitHub readiness in this setup flow and no bounded bootstrap writes remain."
      },
      nextCapability: {
        id: "live_github_work_execution",
        summary:
          "VTDD can continue into real GitHub work from the verified runtime identity."
      },
      transitionTrigger: {
        id: "bounded_bootstrap_path_can_retire",
        summary:
          "The bounded bootstrap path can retire because installation binding and live readiness proof are already complete."
      }
    };
  }

  return {
    currentPhase: {
      id: "live_readiness_verification",
      summary:
        "VTDD has the current GitHub App runtime identity and is in the verification phase rather than the bootstrap phase."
    },
    nextCapability: {
      id: "live_github_work_execution",
      summary:
        "After live verification succeeds, VTDD can do real GitHub work from the configured runtime identity."
    },
    transitionTrigger: {
      id: "run_live_github_readiness_probe",
      summary:
        "Run the live readiness probe so wizard can move from configuration-complete to verified GitHub capability."
    }
  };
}

function buildBootstrapSessionProgressReadout({ bootstrapState, preview, githubAppSetupCheck }) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      completedPhases: [],
      currentBlocker: {
        id: "operator_bootstrap_prerequisites_missing",
        summary:
          "Operator-seeded bootstrap prerequisites are still missing, so VTDD cannot enter the bounded bootstrap flow yet."
      },
      remainingPhases: [
        "runtime_identity_bootstrap",
        "installation_binding",
        "live_readiness_verification"
      ]
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      completedPhases: ["runtime_identity_bootstrap"],
      currentBlocker: {
        id: "installation_binding_still_missing",
        summary:
          "Installation binding is still missing, so VTDD cannot mint installation tokens or finish live verification yet."
      },
      remainingPhases: ["installation_binding", "live_readiness_verification"]
    };
  }

  if (plannedWrites.length > 1) {
    return {
      completedPhases: [],
      currentBlocker: {
        id: "runtime_identity_still_incomplete",
        summary:
          "The current GitHub App runtime identity is still incomplete, so VTDD cannot narrow the flow to installation binding yet."
      },
      remainingPhases: [
        "runtime_identity_bootstrap",
        "installation_binding",
        "live_readiness_verification"
      ]
    };
  }

  if (setupState === "ready") {
    return {
      completedPhases: [
        "runtime_identity_bootstrap",
        "installation_binding",
        "live_readiness_verification"
      ],
      currentBlocker: null,
      remainingPhases: []
    };
  }

  return {
    completedPhases: ["runtime_identity_bootstrap", "installation_binding"],
    currentBlocker: {
      id: "live_readiness_not_yet_verified",
      summary:
        "Configuration is in place, but VTDD still needs a live readiness probe before it can claim verified GitHub capability."
    },
    remainingPhases: ["live_readiness_verification"]
  };
}

function buildBootstrapSessionProviderConnectionReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      github: {
        id: "github_login_or_consent_not_yet_actionable",
        summary:
          "Wizard cannot meaningfully send you into the GitHub login or consent phase yet because Cloudflare bootstrap authority is still missing."
      },
      cloudflare: {
        id: "cloudflare_operator_authority_missing",
        summary:
          "Cloudflare is not a user login flow here yet; wizard is still blocked on operator-seeded Cloudflare bootstrap authority."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      github: {
        id: "github_app_creation_or_install_consent_phase",
        summary:
          "Wizard is still in the GitHub-side App creation or installation consent phase rather than a finished connected state."
      },
      cloudflare: {
        id: "cloudflare_runtime_authority_available_without_user_login",
        summary:
          "Cloudflare runtime authority is already present on Worker runtime, but it is still operator-seeded rather than a user-facing Cloudflare login step."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      github: {
        id: "github_installation_connection_phase",
        summary:
          "Wizard is narrowed to the GitHub installation connection phase, where VTDD needs installation consent or capture rather than raw identity bootstrap."
      },
      cloudflare: {
        id: "cloudflare_runtime_write_phase",
        summary:
          "Cloudflare is acting as the runtime secret store for the bounded installation-binding write, not as a browser login step."
      }
    };
  }

  if (setupState === "ready") {
    return {
      github: {
        id: "github_connection_verified",
        summary:
          "GitHub connection is already verified through live installation-token mint and repository access."
      },
      cloudflare: {
        id: "cloudflare_runtime_connection_already_bound",
        summary:
          "Cloudflare runtime connection is already bound for this setup path, so no additional Cloudflare login step is being asked for."
      }
    };
  }

  return {
    github: {
      id: "github_connection_ready_for_live_probe",
      summary:
        "GitHub-side configuration is in place, and the remaining work is live proof rather than another login or consent step."
    },
    cloudflare: {
      id: "cloudflare_runtime_connection_present",
      summary:
        "Cloudflare runtime connection is already present for this setup path and remains a backend authority boundary rather than a browser login step."
    }
  };
}

function buildBootstrapSessionServiceConnectionModelReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      github: {
        id: "github_connection_not_yet_reachable",
        connectionType: "login_or_provider_consent",
        requiredBecause:
          "VTDD needs GitHub-side identity creation and installation consent before it can act on repositories.",
        summary:
          "GitHub connection is part login/consent and part App installation, but wizard is not ready to send you there until Cloudflare-side bootstrap authority exists."
      },
      cloudflare: {
        id: "cloudflare_connection_still_operator_seeded",
        connectionType: "operator_seeded_runtime_authority",
        requiredBecause:
          "VTDD needs Cloudflare-side runtime authority to store and verify setup-critical Worker secrets.",
        summary:
          "Cloudflare is required for setup, but the current path still depends on operator-seeded runtime authority rather than a user-facing login step."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      github: {
        id: "github_connection_via_app_creation_and_install",
        connectionType: "login_or_provider_consent",
        requiredBecause:
          "VTDD needs GitHub App identity and installation consent so it can mint installation tokens and reach the selected repository context.",
        summary:
          "GitHub connection is currently expressed as App creation and installation consent rather than a generic sign-in screen."
      },
      cloudflare: {
        id: "cloudflare_connection_via_existing_runtime_authority",
        connectionType: "operator_seeded_runtime_authority",
        requiredBecause:
          "VTDD needs Cloudflare Worker runtime authority to persist the setup-critical values produced by the GitHub handoff.",
        summary:
          "Cloudflare connection already exists behind the wizard as runtime authority, so the user is not being sent through a separate Cloudflare login step here."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      github: {
        id: "github_connection_via_installation_binding",
        connectionType: "provider_consent_and_binding",
        requiredBecause:
          "VTDD still needs the GitHub App installation to be connected to the selected repository context before live access can be proven.",
        summary:
          "GitHub connection is narrowed to installation binding, which is a provider-side consent/binding step rather than raw credential entry."
      },
      cloudflare: {
        id: "cloudflare_connection_via_bounded_runtime_write",
        connectionType: "operator_seeded_runtime_authority",
        requiredBecause:
          "VTDD uses Cloudflare as the bounded runtime secret store that records the installation binding once detected.",
        summary:
          "Cloudflare remains a backend authority boundary for the bounded write, not a browser login step."
      }
    };
  }

  if (setupState === "ready") {
    return {
      github: {
        id: "github_connection_already_live",
        connectionType: "verified_provider_connection",
        requiredBecause:
          "VTDD now has proven repository access through GitHub App installation tokens in this setup flow.",
        summary:
          "GitHub connection is already proven live, so no additional login or consent step is currently needed."
      },
      cloudflare: {
        id: "cloudflare_connection_already_live",
        connectionType: "verified_runtime_authority",
        requiredBecause:
          "VTDD already has the Cloudflare runtime authority needed to hold the verified setup state from this flow.",
        summary:
          "Cloudflare runtime authority is already present and bound for this setup path."
      }
    };
  }

  return {
    github: {
      id: "github_connection_ready_for_live_probe",
      connectionType: "verified_configuration_pending_live_probe",
      requiredBecause:
        "VTDD needs GitHub-side connection to be proven by a live probe before setup can claim GitHub capability.",
      summary:
        "GitHub connection inputs are in place, and the remaining step is live proof rather than another login or consent action."
    },
    cloudflare: {
      id: "cloudflare_connection_present_for_live_probe",
      connectionType: "runtime_authority_present",
      requiredBecause:
        "VTDD needs Cloudflare runtime authority to preserve the setup state that the live probe is about to validate.",
      summary:
        "Cloudflare runtime authority is already present for this path and does not surface as a separate browser login step."
    }
  };
}

function buildBootstrapSessionServiceConnectionActionability({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      github: {
        id: "github_wait_until_wizard_can_open_connection_step",
        userActionNeededNow: "no",
        expectedActionType: "login_or_provider_consent_later",
        summary:
          "GitHub will eventually require a provider-side login or consent step, but wizard is not ready to ask for it until Cloudflare bootstrap authority is restored."
      },
      cloudflare: {
        id: "cloudflare_restore_operator_authority",
        userActionNeededNow: "yes",
        expectedActionType: "operator_bootstrap_authority_recovery",
        summary:
          "Cloudflare needs action now, but the action is restoring operator-seeded runtime authority rather than sending the user through a normal browser login."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      github: {
        id: "github_provider_step_needed_now",
        userActionNeededNow: "yes",
        expectedActionType: "login_or_provider_consent",
        summary:
          "GitHub still needs an active provider-side step now, typically App creation or installation consent."
      },
      cloudflare: {
        id: "cloudflare_no_user_login_step_needed_now",
        userActionNeededNow: "no",
        expectedActionType: "runtime_authority_already_present",
        summary:
          "Cloudflare does not need a separate user login step right now because runtime authority is already present behind the wizard."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      github: {
        id: "github_installation_binding_needed_now",
        userActionNeededNow: "yes",
        expectedActionType: "installation_binding_or_consent",
        summary:
          "GitHub still needs the installation to be connected to the selected repository context before setup can continue."
      },
      cloudflare: {
        id: "cloudflare_bounded_write_no_login_needed_now",
        userActionNeededNow: "no",
        expectedActionType: "bounded_runtime_write",
        summary:
          "Cloudflare is only needed as the bounded runtime write target for the installation binding, not as a user login step."
      }
    };
  }

  if (setupState === "ready") {
    return {
      github: {
        id: "github_no_connection_action_needed_now",
        userActionNeededNow: "no",
        expectedActionType: "already_verified",
        summary:
          "GitHub connection is already verified, so setup does not need another login, consent, or installation action right now."
      },
      cloudflare: {
        id: "cloudflare_no_connection_action_needed_now",
        userActionNeededNow: "no",
        expectedActionType: "already_bound",
        summary:
          "Cloudflare runtime authority is already bound for this setup path, so no new Cloudflare action is needed right now."
      }
    };
  }

  return {
    github: {
      id: "github_live_probe_runs_without_new_login",
      userActionNeededNow: "no",
      expectedActionType: "live_probe",
      summary:
        "GitHub no longer needs a new login or consent step; the next action is the live readiness probe."
    },
    cloudflare: {
      id: "cloudflare_present_for_probe_without_new_login",
      userActionNeededNow: "no",
      expectedActionType: "runtime_state_preservation",
      summary:
        "Cloudflare is already present to preserve runtime state while the live probe runs, so no separate user action is needed."
    }
  };
}

function buildBootstrapSessionServiceConnectionFrictionReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      github: {
        id: "github_connection_deferred_not_manual_transport",
        manualTransportRemains: "no",
        allowedHumanInvolvement:
          "provider login or consent later, once wizard can safely open that step",
        summary:
          "GitHub is not currently asking the human to fetch or carry values; the connection step is deferred until wizard can open it coherently."
      },
      cloudflare: {
        id: "cloudflare_operator_recovery_still_outside_target_flow",
        manualTransportRemains: "yes",
        allowedHumanInvolvement:
          "operator boundary recovery only, not end-user copy/paste inside wizard-complete target flow",
        summary:
          "Cloudflare still has operator-seeded recovery debt here, which means the current path has not yet eliminated manual authority restoration."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      github: {
        id: "github_login_or_consent_allowed_but_no_value_transport",
        manualTransportRemains: "no",
        allowedHumanInvolvement: "provider login, app creation, or installation consent",
        summary:
          "GitHub may still require the human to authenticate or consent, but VTDD is trying to avoid making the human carry values back from GitHub."
      },
      cloudflare: {
        id: "cloudflare_runtime_absorbs_values_without_user_copy",
        manualTransportRemains: "no",
        allowedHumanInvolvement: "none in the happy path beyond prior runtime authority seeding",
        summary:
          "Cloudflare is acting as the runtime sink for setup state, so the user should not need to copy values into wizard in this phase."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      github: {
        id: "github_binding_step_should_not_require_copy_paste",
        manualTransportRemains: "no",
        allowedHumanInvolvement: "repository installation consent or redirect completion",
        summary:
          "The remaining GitHub step is installation binding, and the target flow is to absorb that without turning the human into a value courier."
      },
      cloudflare: {
        id: "cloudflare_bounded_write_without_user_transport",
        manualTransportRemains: "no",
        allowedHumanInvolvement: "none during bounded installation write",
        summary:
          "Cloudflare should receive the bounded installation-binding write directly from VTDD rather than through human copy/paste."
      }
    };
  }

  if (setupState === "ready") {
    return {
      github: {
        id: "github_connection_completed_without_remaining_transport",
        manualTransportRemains: "no",
        allowedHumanInvolvement: "none for completed setup",
        summary:
          "GitHub setup is already complete, and there is no remaining manual transport debt in this path."
      },
      cloudflare: {
        id: "cloudflare_connection_completed_without_remaining_transport",
        manualTransportRemains: "no",
        allowedHumanInvolvement: "none for completed setup",
        summary:
          "Cloudflare runtime state is already in place, and there is no remaining manual transport debt in this path."
      }
    };
  }

  return {
    github: {
      id: "github_live_probe_phase_without_manual_transport",
      manualTransportRemains: "no",
      allowedHumanInvolvement: "none while live proof runs",
      summary:
        "GitHub is in live-proof phase, so the remaining work is verification rather than any manual fetch/copy/return loop."
    },
    cloudflare: {
      id: "cloudflare_live_probe_phase_without_manual_transport",
      manualTransportRemains: "no",
      allowedHumanInvolvement: "none while runtime preserves live proof state",
      summary:
        "Cloudflare is only preserving runtime state for live proof here, not asking the human to transport anything."
    }
  };
}

function buildBootstrapSessionServiceConnectionHandoffShapeReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      github: {
        id: "github_handoff_not_open_yet",
        humanStepShape: "future provider login or consent redirect only",
        returnCaptureOwner: "vtdd_when_bootstrap_boundary_is_restored",
        summary:
          "GitHub handoff is not open yet, but the intended shape is still redirect/auth first and VTDD-owned return capture afterward."
      },
      cloudflare: {
        id: "cloudflare_handoff_still_operator_boundary",
        humanStepShape: "operator boundary recovery outside wizard-complete happy path",
        returnCaptureOwner: "operator_for_current_recovery_debt",
        summary:
          "Cloudflare is still carrying operator recovery debt here, so return capture is not yet fully absorbed by VTDD."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      github: {
        id: "github_redirect_then_vtdd_capture",
        humanStepShape: "provider login, app creation, or consent redirect",
        returnCaptureOwner: "vtdd",
        summary:
          "GitHub may still send the human through provider-side auth or consent, but VTDD should capture the resulting state rather than asking the human to bring it back manually."
      },
      cloudflare: {
        id: "cloudflare_runtime_capture_without_human_return",
        humanStepShape: "no user-facing handoff in the happy path",
        returnCaptureOwner: "vtdd_runtime_boundary",
        summary:
          "Cloudflare should receive setup state directly on the runtime side, without a human return trip carrying values."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      github: {
        id: "github_install_redirect_then_vtdd_binding_capture",
        humanStepShape: "installation consent or redirect completion only",
        returnCaptureOwner: "vtdd",
        summary:
          "The remaining GitHub handoff is installation-side consent, and VTDD should absorb the returned binding state."
      },
      cloudflare: {
        id: "cloudflare_bounded_runtime_capture",
        humanStepShape: "no human return step for bounded write",
        returnCaptureOwner: "vtdd_runtime_boundary",
        summary:
          "Cloudflare should only be the bounded runtime capture point for the installation binding result."
      }
    };
  }

  if (setupState === "ready") {
    return {
      github: {
        id: "github_handoff_already_absorbed",
        humanStepShape: "none for completed setup",
        returnCaptureOwner: "vtdd_already_completed",
        summary:
          "GitHub handoff has already been absorbed into completed setup state."
      },
      cloudflare: {
        id: "cloudflare_handoff_already_absorbed",
        humanStepShape: "none for completed setup",
        returnCaptureOwner: "vtdd_runtime_boundary_already_completed",
        summary:
          "Cloudflare runtime capture has already been absorbed into completed setup state."
      }
    };
  }

  return {
    github: {
      id: "github_live_probe_without_new_handoff",
      humanStepShape: "no new human handoff while live proof runs",
      returnCaptureOwner: "vtdd",
      summary:
        "GitHub is already past the provider handoff stage, so VTDD is only running live proof now."
    },
    cloudflare: {
      id: "cloudflare_live_probe_state_retained_by_vtdd",
      humanStepShape: "no human handoff while runtime preserves proof state",
      returnCaptureOwner: "vtdd_runtime_boundary",
      summary:
        "Cloudflare is only retaining runtime state while VTDD runs live proof."
    }
  };
}

function buildBootstrapSessionServiceConnectionReturnContinuityReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      github: {
        id: "github_return_continuity_deferred_until_boundary_restored",
        expectedReturnContext:
          "same setup wizard context once VTDD can safely open the provider step",
        humanReentryRequired: "no",
        summary:
          "GitHub return continuity is still deferred, but the target remains a return to the same wizard context rather than a manual restart."
      },
      cloudflare: {
        id: "cloudflare_return_continuity_blocked_by_operator_recovery",
        expectedReturnContext:
          "operator recovery currently sits outside the intended wizard return path",
        humanReentryRequired: "yes",
        summary:
          "Cloudflare still breaks clean return continuity because operator recovery debt is not yet absorbed into the wizard-complete path."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      github: {
        id: "github_return_to_same_wizard_context_after_provider_step",
        expectedReturnContext:
          "same wizard flow with VTDD capturing returned provider state",
        humanReentryRequired: "no",
        summary:
          "After GitHub-side auth or consent, the user should return to the same wizard context and let VTDD absorb the resulting state."
      },
      cloudflare: {
        id: "cloudflare_continuity_stays_inside_runtime_boundary",
        expectedReturnContext:
          "no separate user return path; runtime boundary keeps setup continuity",
        humanReentryRequired: "no",
        summary:
          "Cloudflare continuity stays on the runtime side, so the user should not need a separate return trip or re-entry step."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      github: {
        id: "github_install_return_absorbed_into_same_setup_context",
        expectedReturnContext:
          "same wizard context after installation consent or redirect completion",
        humanReentryRequired: "no",
        summary:
          "The installation step should return into the same setup context so VTDD can capture the binding without asking the human to restart or paste values."
      },
      cloudflare: {
        id: "cloudflare_bounded_write_keeps_continuity_without_reentry",
        expectedReturnContext:
          "runtime captures bounded write result without user-side re-entry",
        humanReentryRequired: "no",
        summary:
          "Cloudflare should preserve continuity for the bounded write without introducing a user-facing return loop."
      }
    };
  }

  if (setupState === "ready") {
    return {
      github: {
        id: "github_return_continuity_already_satisfied",
        expectedReturnContext: "completed setup already holds the absorbed return state",
        humanReentryRequired: "no",
        summary:
          "GitHub return continuity has already been satisfied because the setup result is fully absorbed."
      },
      cloudflare: {
        id: "cloudflare_return_continuity_already_satisfied",
        expectedReturnContext: "completed runtime state already preserves absorbed return state",
        humanReentryRequired: "no",
        summary:
          "Cloudflare return continuity has already been satisfied because the runtime state is already bound."
      }
    };
  }

  return {
    github: {
      id: "github_live_probe_continues_without_reentry",
      expectedReturnContext: "same wizard context while VTDD runs live proof",
      humanReentryRequired: "no",
      summary:
        "GitHub is already back inside the wizard flow, so live proof should continue without any human re-entry step."
    },
    cloudflare: {
      id: "cloudflare_live_probe_continuity_preserved_runtime_side",
      expectedReturnContext: "runtime side preserves continuity during live proof",
      humanReentryRequired: "no",
      summary:
        "Cloudflare only preserves runtime continuity during live proof and does not require a user-facing return path."
    }
  };
}

function buildBootstrapSessionResponsibilityReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      humanStep: {
        id: "approve_or_restore_operator_bootstrap_prerequisites",
        summary:
          "The human still needs to restore the operator-managed bootstrap prerequisites before VTDD can continue setup."
      },
      vtddStep: {
        id: "hold_meaningful_setup_context",
        summary:
          "VTDD keeps the setup narrative coherent, but it does not open a privileged bootstrap path until the missing prerequisites exist."
      },
      providerStep: {
        id: "cloudflare_retains_runtime_secret_boundary",
        summary:
          "Cloudflare remains the system of record for runtime secret storage and execution hosting."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      humanStep: {
        id: "approve_installation_binding_if_needed",
        summary:
          "The human may still need to complete the bounded GitHub installation step, but should not carry IDs across surfaces manually."
      },
      vtddStep: {
        id: "detect_or_capture_installation_binding",
        summary:
          "VTDD narrows the remaining work to installation detection or binding capture and keeps the post-installation checks in one flow."
      },
      providerStep: {
        id: "github_owns_installation_consent",
        summary:
          "GitHub still owns installation scope and permission consent for the App."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      humanStep: {
        id: "approve_provider_creation_or_installation_step",
        summary:
          "The human may still need to pass through provider consent, but should not become the transport layer for runtime IDs or secrets."
      },
      vtddStep: {
        id: "orchestrate_runtime_identity_bootstrap",
        summary:
          "VTDD owns callback capture, bounded transport planning, and follow-up checks for the missing GitHub App runtime identity."
      },
      providerStep: {
        id: "github_and_cloudflare_keep_native_trust_boundaries",
        summary:
          "GitHub still owns App creation and install consent, while Cloudflare still owns runtime secret storage."
      }
    };
  }

  if (setupState === "ready") {
    return {
      humanStep: {
        id: "continue_from_verified_setup_without_new_wiring",
        summary:
          "The human no longer needs to advance setup wiring or verification in this flow and can continue from the verified VTDD capability."
      },
      vtddStep: {
        id: "carry_verified_capability_forward",
        summary:
          "VTDD owns carrying the already-verified GitHub capability forward rather than reopening setup verification."
      },
      providerStep: {
        id: "providers_hold_verified_runtime_boundary",
        summary:
          "GitHub and Cloudflare continue to hold their native trust boundaries for the already-verified runtime path."
      }
    };
  }

  return {
    humanStep: {
      id: "approve_live_verification_if_requested",
      summary:
        "The human no longer needs to move setup-critical material, and only needs to continue the bounded verification path when requested."
    },
    vtddStep: {
      id: "run_live_readiness_checks",
      summary:
        "VTDD now owns the remaining live readiness probe and can report verified capability in wizard terms."
      },
    providerStep: {
      id: "providers_serve_verified_runtime_identity",
      summary:
        "GitHub and Cloudflare continue to serve their native trust boundaries while VTDD verifies the configured runtime identity."
    }
  };
}

function buildBootstrapSessionAuthBoundaryReadout({
  bootstrapState,
  preview,
  authConfig,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const serviceAccessState = authConfig?.enabled ? "configured" : "not_configured";
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      serviceAccess: {
        state: serviceAccessState,
        summary:
          serviceAccessState === "configured"
            ? "VTDD service access is configured, so the user can enter setup wizard without exposing the surface publicly."
            : "VTDD service access is not configured yet, so setup entry protection still needs to be restored."
      },
      operatorBootstrapAuthority: {
        state: "missing_prerequisites",
        summary:
          "Operator bootstrap authority is still incomplete because the prerequisite bootstrap inputs are missing."
      },
      externalAccountConnection: {
        state: "not_ready",
        summary:
          "External account connection cannot progress meaningfully until the operator bootstrap prerequisites are restored."
      },
      runtimeMachineAuth: {
        state: "separate_internal_boundary",
        summary:
          "Runtime machine auth remains a separate fail-closed boundary for internal execution routes and is not part of browser setup entry."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      serviceAccess: {
        state: serviceAccessState,
        summary:
          "VTDD service access remains the browser-facing entry boundary and is distinct from GitHub and Cloudflare rights."
      },
      operatorBootstrapAuthority: {
        state: "narrow_write_deferred",
        summary:
          "Operator bootstrap authority is narrowed and deferred to the future approval-bound write path rather than opened broadly."
      },
      externalAccountConnection: {
        state: "installation_binding_pending",
        summary:
          "External account connection is narrowed to the remaining GitHub installation-binding step."
      },
      runtimeMachineAuth: {
        state: "separate_internal_boundary",
        summary:
          "Runtime machine auth still protects internal execution routes separately from setup wizard state."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      serviceAccess: {
        state: serviceAccessState,
        summary:
          "VTDD service access is configured separately from the provider rights still needed for runtime bootstrap."
      },
      operatorBootstrapAuthority: {
        state: "ready_but_not_issued_to_user",
        summary:
          "Operator bootstrap authority exists only as a narrow service-held prerequisite and is not exposed as generic user write access."
      },
      externalAccountConnection: {
        state: "provider_connection_in_progress",
        summary:
          "External account connection is still in progress because GitHub creation or install consent is not yet fully reflected in runtime identity."
      },
      runtimeMachineAuth: {
        state: "separate_internal_boundary",
        summary:
          "Runtime machine auth remains distinct from browser setup and is not reused as bootstrap authority."
      }
    };
  }

  if (setupState === "ready") {
    return {
      serviceAccess: {
        state: serviceAccessState,
        summary:
          "VTDD service access is configured and no longer the setup blocker."
      },
      operatorBootstrapAuthority: {
        state: "deferred_after_verified_ready_path",
        summary:
          "Operator bootstrap authority stays narrow and deferred after this verified narrow setup path, rather than reopening broader write authority."
      },
      externalAccountConnection: {
        state: "verified_live_connection",
        summary:
          "External account connection is already verified live in runtime for this setup flow."
      },
      runtimeMachineAuth: {
        state: "separate_internal_boundary",
        summary:
          "Runtime machine auth continues to protect internal execution surfaces separately from the already-verified setup flow."
      }
    };
  }

  return {
    serviceAccess: {
      state: serviceAccessState,
      summary:
        "VTDD service access is configured and no longer the setup blocker."
    },
    operatorBootstrapAuthority: {
      state: "deferred_after_configuration",
      summary:
        "Operator bootstrap authority stays narrow and deferred because the remaining work is verification, not another broad secret write."
    },
    externalAccountConnection: {
      state: "configured_pending_live_probe",
      summary:
        "External account connection is configured in runtime and only awaits live verification."
    },
    runtimeMachineAuth: {
      state: "separate_internal_boundary",
      summary:
        "Runtime machine auth continues to protect internal execution surfaces separately from the setup flow."
    }
  };
}

function buildBootstrapSessionCompletionReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      claimState: {
        id: "meaningful_but_blocked_setup_surface",
        summary:
          "VTDD can claim a meaning-first setup surface, but not a bounded automation path that can continue through setup-critical runtime bootstrap."
      },
      cannotYetClaim: {
        id: "wizard_complete_setup",
        summary:
          "VTDD cannot yet claim wizard-complete setup because operator bootstrap prerequisites are still missing."
      },
      claimBecomesValidWhen: {
        id: "operator_prerequisites_restored_and_bounded_path_available",
        summary:
          "That claim moves forward only after the operator prerequisites are restored and the bounded bootstrap path can continue coherently."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      claimState: {
        id: "narrowed_setup_flow",
        summary:
          "VTDD can claim that setup has narrowed to installation binding as the last unresolved configuration phase."
      },
      cannotYetClaim: {
        id: "wizard_complete_setup",
        summary:
          "VTDD still cannot claim wizard-complete setup because installation binding and live verification are not finished."
      },
      claimBecomesValidWhen: {
        id: "installation_binding_and_live_probe_complete",
        summary:
          "That claim becomes valid only after installation binding succeeds and VTDD verifies live readiness."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      claimState: {
        id: "coherent_bootstrap_in_progress",
        summary:
          "VTDD can claim that setup is in one coherent bootstrap flow, but runtime identity bootstrap is still incomplete."
      },
      cannotYetClaim: {
        id: "wizard_complete_setup",
        summary:
          "VTDD cannot yet claim wizard-complete setup because the current GitHub App runtime identity is not fully stored."
      },
      claimBecomesValidWhen: {
        id: "runtime_identity_bootstrap_narrows_to_installation_and_verification",
        summary:
          "That claim only moves forward after the runtime identity bootstrap narrows to installation binding and then to live verification."
      }
    };
  }

  if (setupState === "ready") {
    return {
      claimState: {
        id: "wizard_complete_ready_path_verified",
        summary:
          "VTDD can claim that the current setup path is verified live and no further setup wiring is required in this flow."
      },
      cannotYetClaim: {
        id: "generic_bootstrap_authority_complete",
        summary:
          "VTDD still cannot claim that a general approval-bound bootstrap authority exists beyond this verified narrow path."
      },
      claimBecomesValidWhen: {
        id: "future_general_bootstrap_path_is_implemented_and_verified",
        summary:
          "That broader claim becomes valid only after the future generalized approval-bound bootstrap path is implemented and verified."
      }
    };
  }

  return {
    claimState: {
      id: "configuration_ready_pending_verification",
      summary:
        "VTDD can claim that configuration is in place and the remaining work is live verification rather than more bootstrap wiring."
    },
    cannotYetClaim: {
      id: "wizard_complete_setup",
      summary:
        "VTDD still cannot claim wizard-complete setup until the configured runtime identity is verified live."
    },
    claimBecomesValidWhen: {
      id: "live_verification_passes",
      summary:
        "That claim becomes valid only after the live readiness probe passes and VTDD can prove the configured path does real GitHub work."
    }
  };
}

function buildBootstrapSessionIssuanceReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      issuableState: {
        id: "not_issuable",
        summary:
          "VTDD must not issue an approval-bound bootstrap session while the operator-seeded bootstrap prerequisites are still missing."
      },
      blockingGate: {
        id: "operator_bootstrap_prerequisites_missing",
        summary:
          "The issuance gate is blocked at the operator bootstrap layer, so no bounded write session can be opened yet."
      },
      nextIssuanceCondition: {
        id: "operator_prerequisites_restored",
        summary:
          "Issuance can move forward only after the operator bootstrap prerequisites are restored and the bounded path is available again."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      issuableState: {
        id: "issuance_deferred_to_installation_binding",
        summary:
          "VTDD has narrowed the future session to installation binding, but issuance is still deferred until that connection step is completed."
      },
      blockingGate: {
        id: "installation_binding_not_complete",
        summary:
          "The issuance gate is blocked on installation binding because VTDD cannot safely mint installation-scoped capability without it."
      },
      nextIssuanceCondition: {
        id: "installation_binding_detected_or_captured",
        summary:
          "The next issuance condition is proof that installation binding was detected or captured in the wizard flow."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      issuableState: {
        id: "issuance_deferred_to_runtime_identity_completion",
        summary:
          "VTDD has the bootstrap baseline, but the future session is still deferred until the current GitHub App runtime identity is complete."
      },
      blockingGate: {
        id: "runtime_identity_not_complete",
        summary:
          "The issuance gate is blocked because the runtime is still missing GitHub App identity fields that the future bounded session would need to reconcile."
      },
      nextIssuanceCondition: {
        id: "runtime_identity_fields_written",
        summary:
          "The next issuance condition is that the missing GitHub App runtime fields are written so the remaining session scope can narrow."
      }
    };
  }

  if (setupState === "ready") {
    return {
      issuableState: {
        id: "no_setup_issuance_needed_for_verified_path",
        summary:
          "VTDD does not need to issue another setup session in this flow because the narrow path is already verified live."
      },
      blockingGate: {
        id: "no_current_setup_issuance_blocker",
        summary:
          "There is no current setup-issuance blocker in this verified path because setup no longer needs another approval-bound session."
      },
      nextIssuanceCondition: {
        id: "future_generalized_bootstrap_needs_separate_implementation",
        summary:
          "A future generalized bootstrap issuance path remains separate work and is not required for this already-verified narrow setup flow."
      }
    };
  }

  return {
    issuableState: {
      id: "issuance_deferred_to_attestation_backend",
      summary:
        "VTDD has no remaining setup-critical writes to plan, but it still does not issue a bootstrap session until attestation-backed authority exists."
    },
    blockingGate: {
      id: "attestation_backed_bootstrap_authority_not_implemented",
      summary:
        "The issuance gate is blocked at the final authority layer because attestation-backed bootstrap authority is still not implemented."
    },
    nextIssuanceCondition: {
      id: "attestation_backed_bootstrap_authority_exists",
      summary:
        "Issuance only becomes possible after VTDD has an attestation-backed way to mint the approval-bound bootstrap session."
    }
  };
}

function buildBootstrapSessionAuthorityShapeReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      authorityOwner: {
        id: "service_owned_prerequisite_not_session_issued",
        summary:
          "The only authority present is still the service-held operator prerequisite, not a user-carried bootstrap session."
      },
      authorityScope: {
        id: "bounded_session_shape_not_available",
        summary:
          "The intended authority shape remains a narrow setup-specific session, but VTDD does not expose it before the operator prerequisites are restored."
      },
      authorityAudit: {
        id: "approval_boundary_reserved",
        summary:
          "Audit remains anchored to GO + passkey because no session issuance or bounded write has occurred yet."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      authorityOwner: {
        id: "future_session_bound_installation_authority",
        summary:
          "The future authority is intended to be session-bound and narrowed to the remaining installation-binding step rather than held as broad operator access."
      },
      authorityScope: {
        id: "single_remaining_allowlisted_write",
        summary:
          "The authority scope is reduced to the single remaining allowlisted installation-binding write plus its follow-up readiness checks."
      },
      authorityAudit: {
        id: "go_passkey_plus_installation_proof",
        summary:
          "Any future issuance must stay auditable through GO + passkey and proof that the installation binding belongs to this wizard flow."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      authorityOwner: {
        id: "future_session_bound_runtime_bootstrap_authority",
        summary:
          "The future authority is intended to be a one-time session-bound bootstrap right, not persistent user or operator admin access."
      },
      authorityScope: {
        id: "allowlisted_runtime_identity_write_set",
        summary:
          "Its scope is the allowlisted GitHub App runtime identity write set and the post-write checks needed to narrow the flow further."
      },
      authorityAudit: {
        id: "go_passkey_plus_bounded_write_trace",
        summary:
          "Any future issuance must be audited as a GO + passkey-approved bounded write rather than an untracked secret management action."
      }
    };
  }

  if (setupState === "ready") {
    return {
      authorityOwner: {
        id: "no_additional_setup_authority_owner_needed",
        summary:
          "This verified narrow path does not need another setup authority owner because the required setup work is already complete."
      },
      authorityScope: {
        id: "verified_path_has_no_current_setup_write_scope",
        summary:
          "There is no current setup write scope left in this verified path because runtime configuration and live proof are already complete."
      },
      authorityAudit: {
        id: "verified_path_keeps_prior_go_passkey_audit_history",
        summary:
          "Audit remains as the recorded GO + passkey-approved history for this path rather than a signal that another current setup authority must be issued."
      }
    };
  }

  return {
    authorityOwner: {
      id: "future_session_bound_verification_authority_only",
      summary:
        "No further bootstrap write authority should be broadened here; the remaining future authority is limited to verification-oriented session use."
    },
    authorityScope: {
      id: "no_additional_setup_write_scope",
      summary:
        "The authority shape is no longer about additional setup writes because runtime configuration is already present."
    },
    authorityAudit: {
      id: "go_passkey_boundary_preserved_without_write",
      summary:
        "Audit still preserves the GO + passkey boundary even though the remaining blocked step is attestation-backed issuance rather than another write."
    }
  };
}

function buildBootstrapSessionAuthorityExpiryReadout({
  bootstrapState,
  preview,
  maxAgeSeconds,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const expirySeconds = Number.isFinite(Number(maxAgeSeconds)) ? Number(maxAgeSeconds) : 0;
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      expiryTrigger: {
        id: "no_session_to_expire_until_prerequisites_exist",
        summary:
          "There is no approval-bound session to expire yet because VTDD must not issue one before the operator bootstrap prerequisites exist."
      },
      expiryWindow: {
        id: "future_short_lived_window_reserved",
        summary:
          `Once issuance exists, the intended window remains short-lived at ${expirySeconds} seconds rather than long-running operator access.`
      },
      expiryAfterUse: {
        id: "future_single_use_expiry_reserved",
        summary:
          "The intended session still expires after one bounded use, but that behavior remains deferred until issuance actually exists."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      expiryTrigger: {
        id: "expire_after_installation_binding_step",
        summary:
          "The future session should expire once the single remaining installation-binding step and its immediate checks are complete."
      },
      expiryWindow: {
        id: "single_step_short_lived_window",
        summary:
          `The intended expiry window stays short-lived at ${expirySeconds} seconds because only one remaining allowlisted step should fit inside it.`
      },
      expiryAfterUse: {
        id: "expire_after_one_installation_binding_use",
        summary:
          "The future session should be consumed by one installation-binding use rather than staying available for repeated secret writes."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      expiryTrigger: {
        id: "expire_after_bounded_runtime_bootstrap_attempt",
        summary:
          "The future session should expire after one bounded runtime-bootstrap attempt, whether it succeeds or fails, instead of lingering across repeated write tries."
      },
      expiryWindow: {
        id: "runtime_bootstrap_short_lived_window",
        summary:
          `The intended expiry window stays short-lived at ${expirySeconds} seconds so the bootstrap authority cannot turn into standing runtime admin access.`
      },
      expiryAfterUse: {
        id: "expire_after_one_bounded_write_trace",
        summary:
          "The future session should terminate after one traced bounded write flow rather than surviving for manual retry loops."
      }
    };
  }

  if (setupState === "ready") {
    return {
      expiryTrigger: {
        id: "no_current_setup_session_to_expire",
        summary:
          "There is no current setup session to expire in this verified path because setup no longer needs another approval-bound session."
      },
      expiryWindow: {
        id: "future_generalized_session_window_is_separate",
        summary:
          `Any future generalized session would still be short-lived at ${expirySeconds} seconds, but that is separate work rather than part of this already-verified path.`
      },
      expiryAfterUse: {
        id: "verified_path_relies_on_completed_single_use_history",
        summary:
          "This verified path now relies on the already-completed single-use history rather than a current session that still needs to expire."
      }
    };
  }

  return {
    expiryTrigger: {
      id: "expire_without_additional_bootstrap_write",
      summary:
        "Any future issuance should expire without another setup-critical write because the remaining work is verification rather than bootstrap transport."
    },
    expiryWindow: {
      id: "verification_only_short_lived_window",
      summary:
        `The intended window still stays short-lived at ${expirySeconds} seconds even when the remaining blocked step is verification-oriented.`
    },
    expiryAfterUse: {
      id: "expire_after_one_verification_bound_use",
      summary:
        "Any future session should still expire after one verification-bound use rather than remain reusable."
    }
  };
}

function buildBootstrapSessionAuthorityRenewalReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      renewalTrigger: {
        id: "no_renewal_until_prerequisites_restored",
        summary:
          "VTDD should not even consider renewing a bootstrap session until the operator bootstrap prerequisites are restored."
      },
      renewalGate: {
        id: "fresh_go_passkey_required_after_block",
        summary:
          "Any future retry still needs a fresh GO + passkey-shaped request after the blocking prerequisite state is resolved."
      },
      renewalScope: {
        id: "recompute_from_current_blocked_state",
        summary:
          "When renewal becomes possible, VTDD should recompute the bounded scope from the current runtime state instead of replaying stale write intent."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      renewalTrigger: {
        id: "renew_only_if_installation_binding_still_missing",
        summary:
          "A new session should only be requested if installation binding is still genuinely missing after the previous bounded attempt expires."
      },
      renewalGate: {
        id: "fresh_go_passkey_plus_current_installation_context",
        summary:
          "Renewal still requires a fresh GO + passkey approval and current installation context rather than blindly replaying the old session."
      },
      renewalScope: {
        id: "remain_narrowed_to_installation_binding",
        summary:
          "Any renewed authority must stay narrowed to the single remaining installation-binding step and must not widen back to broader bootstrap scope."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      renewalTrigger: {
        id: "renew_only_if_runtime_identity_still_incomplete",
        summary:
          "A new session should only be requested if the runtime identity is still incomplete after the prior bounded attempt has expired."
      },
      renewalGate: {
        id: "fresh_go_passkey_plus_current_runtime_state",
        summary:
          "Renewal still requires a fresh GO + passkey approval tied to the current runtime state, not reuse of an earlier bootstrap approval."
      },
      renewalScope: {
        id: "recompute_and_shrink_remaining_write_set",
        summary:
          "Any renewed authority must recalculate the remaining write set and shrink if some runtime fields were already stored."
      }
    };
  }

  if (setupState === "ready") {
    return {
      renewalTrigger: {
        id: "no_current_setup_renewal_needed",
        summary:
          "This verified path does not need a current setup renewal because the narrow setup flow is already complete."
      },
      renewalGate: {
        id: "future_generalized_renewal_is_separate_work",
        summary:
          "Any future generalized renewal gate is separate work and is not part of the current verified narrow setup path."
      },
      renewalScope: {
        id: "verified_path_has_no_current_renewal_scope",
        summary:
          "There is no current renewal scope left in this verified path because setup no longer needs another approval-bound session."
      }
    };
  }

  return {
    renewalTrigger: {
      id: "renew_only_for_remaining_verification_need",
      summary:
        "A new session should only be considered if the remaining blocked work is still the verification-bound step rather than another bootstrap write."
    },
    renewalGate: {
      id: "fresh_go_passkey_before_verification_bound_retry",
      summary:
        "Any future retry still requires a fresh GO + passkey approval instead of keeping a reusable verification session alive."
    },
    renewalScope: {
      id: "remain_verification_bound_without_reopening_write_scope",
      summary:
        "Renewal must stay verification-bound and must not reopen setup-critical write scope once configuration is already present."
      }
  };
}

function buildBootstrapSessionAuthorityRenewalDenialReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      denialReason: {
        id: "deny_renewal_while_prerequisites_are_missing",
        summary:
          "VTDD should deny renewal outright while operator bootstrap prerequisites are missing, because renewing into a blocked runtime would only hide the real blocker."
      },
      denialBoundary: {
        id: "prerequisite_boundary_before_any_retry_authority",
        summary:
          "The prerequisite boundary comes before any retry authority, so renewal must fail closed until the operator baseline exists again."
      },
      denialRecovery: {
        id: "restore_prerequisites_then_reissue_fresh_request",
        summary:
          "Recovery is to restore the missing prerequisites first and only then ask for a fresh GO + passkey-shaped request."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      denialReason: {
        id: "deny_renewal_if_installation_binding_is_already_resolved",
        summary:
          "VTDD should deny renewal if installation binding has already been resolved, because renewing the old scope would recreate a step that is no longer needed."
      },
      denialBoundary: {
        id: "no_reopening_completed_installation_scope",
        summary:
          "Once installation binding is complete, renewal must not reopen that installation-scoped authority."
      },
      denialRecovery: {
        id: "recompute_from_current_installation_state",
        summary:
          "Recovery is to recompute from the current installation state and continue only with whatever narrower remaining work still exists."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      denialReason: {
        id: "deny_renewal_if_runtime_scope_would_widen_or_repeat_blindly",
        summary:
          "VTDD should deny renewal if the request would blindly replay or widen runtime bootstrap scope instead of reflecting the current remaining write set."
      },
      denialBoundary: {
        id: "no_reuse_of_stale_runtime_bootstrap_scope",
        summary:
          "Renewal must not reuse stale runtime-bootstrap scope once the current runtime state may already have changed."
      },
      denialRecovery: {
        id: "recompute_remaining_runtime_scope_before_retry",
        summary:
          "Recovery is to recalculate the remaining runtime scope first and issue a fresh narrower request only if work still remains."
      }
    };
  }

  if (setupState === "ready") {
    return {
      denialReason: {
        id: "no_current_setup_renewal_denial_path_needed",
        summary:
          "This verified path does not currently need a renewal-denial path because setup no longer needs another approval-bound session."
      },
      denialBoundary: {
        id: "future_generalized_renewal_denial_is_separate_work",
        summary:
          "Any future generalized renewal-denial boundary is separate work and is not part of the current verified narrow setup path."
      },
      denialRecovery: {
        id: "verified_path_continues_without_current_renewal_recovery",
        summary:
          "The verified path continues from completed setup capability rather than recovering from a current renewal-denial branch."
      }
    };
  }

  return {
    denialReason: {
      id: "deny_renewal_if_it_reopens_write_scope_after_configuration",
      summary:
        "VTDD should deny renewal if it would reopen setup-critical write scope after configuration is already present."
    },
    denialBoundary: {
      id: "verification_phase_does_not_restore_bootstrap_write_rights",
      summary:
        "The verification phase must not be used to smuggle bootstrap write rights back into the flow."
    },
    denialRecovery: {
      id: "continue_with_verification_bound_path_only",
      summary:
        "Recovery is to stay on the verification-bound path and request a fresh approval only for that remaining verification work."
      }
  };
}

function buildBootstrapSessionAuthorityRequestFreshnessReadout({
  bootstrapState,
  preview,
  maxAgeSeconds,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const expirySeconds = Number.isFinite(Number(maxAgeSeconds)) ? Number(maxAgeSeconds) : 0;
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      freshnessRequirement: {
        id: "fresh_request_only_after_prerequisites_exist",
        summary:
          "VTDD should only accept a fresh approval-bound request after the operator prerequisites exist, not while the runtime is still blocked."
      },
      staleRequestRejection: {
        id: "reject_stale_request_from_pre_prerequisite_state",
        summary:
          "Requests carried over from the blocked pre-prerequisite state should be rejected as stale because they no longer describe a valid issuable context."
      },
      freshnessRecovery: {
        id: "restore_prerequisites_then_submit_new_go_passkey_request",
        summary:
          `Recovery is to restore prerequisites and submit a new GO + passkey-shaped request inside the current ${expirySeconds}-second bounded window.`
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      freshnessRequirement: {
        id: "fresh_request_must_match_current_installation_gap",
        summary:
          "Any approval-bound request must be fresh enough to match the current installation-binding gap, not an earlier broader setup state."
      },
      staleRequestRejection: {
        id: "reject_request_if_installation_gap_changed",
        summary:
          "A request becomes stale if installation binding has already changed or been resolved since that approval context was created."
      },
      freshnessRecovery: {
        id: "reconfirm_installation_gap_and_submit_new_request",
        summary:
          `Recovery is to confirm the current installation gap and submit a new narrow request within the ${expirySeconds}-second approval window.`
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      freshnessRequirement: {
        id: "fresh_request_must_match_current_runtime_gap",
        summary:
          "Any approval-bound request must be fresh enough to reflect the current remaining runtime identity gap, not an older bootstrap snapshot."
      },
      staleRequestRejection: {
        id: "reject_request_if_runtime_gap_shifted",
        summary:
          "A request becomes stale if the runtime identity gap has shifted since approval, because VTDD must not replay stale write intent."
      },
      freshnessRecovery: {
        id: "recompute_runtime_gap_and_submit_new_request",
        summary:
          `Recovery is to recompute the current runtime gap and submit a new GO + passkey-shaped request within the ${expirySeconds}-second bounded window.`
      }
    };
  }

  if (setupState === "ready") {
    return {
      freshnessRequirement: {
        id: "no_current_setup_request_freshness_needed",
        summary:
          "This verified path does not currently need request freshness because setup no longer needs another approval-bound request."
      },
      staleRequestRejection: {
        id: "future_generalized_request_freshness_is_separate_work",
        summary:
          "Any future generalized freshness rejection is separate work and is not part of the current verified narrow setup path."
      },
      freshnessRecovery: {
        id: "verified_path_continues_without_current_request_recovery",
        summary:
          `The verified path continues from completed setup capability rather than recovering through a new request inside the ${expirySeconds}-second approval window.`
      }
    };
  }

  return {
    freshnessRequirement: {
      id: "fresh_request_must_match_remaining_verification_need",
      summary:
        "Any future request must be fresh enough to match the remaining verification-bound need rather than an outdated bootstrap write state."
    },
    staleRequestRejection: {
      id: "reject_request_if_it_reopens_old_write_context",
      summary:
        "A request becomes stale if it tries to reopen an older write context after configuration is already present."
    },
    freshnessRecovery: {
      id: "reconfirm_verification_need_and_submit_new_request",
      summary:
        `Recovery is to reconfirm the remaining verification need and submit a new bounded request within the ${expirySeconds}-second approval window.`
    }
  };
}

function buildBootstrapSessionAuthorityRequestReplayReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      replayRisk: {
        id: "blocked_state_request_replay_risk",
        summary:
          "Replaying a request from the blocked prerequisite state would wrongly carry old approval intent into a runtime that was never issuable."
      },
      replayRejection: {
        id: "reject_replay_from_non_issuable_state",
        summary:
          "VTDD should reject replay from a non-issuable state instead of treating repeated submission as progress."
      },
      replayRecovery: {
        id: "restore_prerequisites_and_submit_new_request_once",
        summary:
          "Recovery is to restore prerequisites and then submit one new GO + passkey-shaped request from the current issuable state."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      replayRisk: {
        id: "installation_binding_request_replay_risk",
        summary:
          "Replaying an old installation-binding request could recreate an already-completed step or ignore a changed installation context."
      },
      replayRejection: {
        id: "reject_replay_of_consumed_installation_request",
        summary:
          "VTDD should reject replay of a consumed installation-binding request because this path is single-use and tied to the current installation gap only."
      },
      replayRecovery: {
        id: "reconfirm_installation_gap_then_request_once",
        summary:
          "Recovery is to reconfirm the current installation gap and submit one new narrow request only if that gap still exists."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      replayRisk: {
        id: "runtime_bootstrap_request_replay_risk",
        summary:
          "Replaying an older runtime-bootstrap request could reapply stale write intent after the remaining runtime gap has already changed."
      },
      replayRejection: {
        id: "reject_replay_of_consumed_runtime_request",
        summary:
          "VTDD should reject replay of a consumed runtime-bootstrap request because single-use approval must not become a reusable write token."
      },
      replayRecovery: {
        id: "recompute_runtime_gap_then_request_once",
        summary:
          "Recovery is to recompute the current remaining runtime gap and submit one new bounded request only for that latest scope."
      }
    };
  }

  if (setupState === "ready") {
    return {
      replayRisk: {
        id: "no_current_setup_request_replay_risk",
        summary:
          "This verified path does not currently carry a setup request replay risk because setup no longer needs another approval-bound request."
      },
      replayRejection: {
        id: "future_generalized_request_replay_is_separate_work",
        summary:
          "Any future generalized replay rejection is separate work and is not part of the current verified narrow setup path."
      },
      replayRecovery: {
        id: "verified_path_continues_without_current_replay_recovery",
        summary:
          "The verified path continues from completed setup capability rather than recovering from a current request replay branch."
      }
    };
  }

  return {
    replayRisk: {
      id: "verification_request_replay_risk",
      summary:
        "Replaying an old verification-bound request could reopen an outdated bootstrap context after configuration is already present."
    },
    replayRejection: {
      id: "reject_replay_that_reopens_old_verification_context",
      summary:
        "VTDD should reject replay of an already-consumed verification-bound request rather than keeping reusable approval alive."
    },
    replayRecovery: {
      id: "reconfirm_verification_need_then_request_once",
      summary:
        "Recovery is to reconfirm the current verification need and submit one new bounded request only for that remaining path."
    }
  };
}

function buildBootstrapSessionAuthorityRequestBindingReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (setupState === "ready") {
    return {
      bindingTarget: {
        id: "no_current_setup_request_binding_needed",
        summary:
          "VTDD already absorbed the setup binding it needed for the current path, so no further request binding is required to keep this flow coherent."
      },
      bindingDrift: {
        id: "future_generalized_request_binding_is_separate_work",
        summary:
          "Any future generalized request binding belongs to separate bootstrap work, not to the current verified-ready setup path."
      },
      bindingRecovery: {
        id: "verified_path_continues_without_current_binding_recovery",
        summary:
          "The verified path continues without a current binding recovery step because the setup-bound request was already consumed and absorbed."
      }
    };
  }

  if (bootstrapState !== "available") {
    return {
      bindingTarget: {
        id: "blocked_runtime_context_only",
        summary:
          "Any future approval-bound request must bind to the currently blocked runtime context rather than float above the missing prerequisite state."
      },
      bindingDrift: {
        id: "prerequisite_drift_invalidates_request_context",
        summary:
          "If prerequisite state changes, the old request context drifts immediately and must not be reused as if it still described the current runtime."
      },
      bindingRecovery: {
        id: "rebind_after_prerequisites_are_restored",
        summary:
          "Recovery is to restore prerequisites first, then create a fresh request bound to the current runtime context."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      bindingTarget: {
        id: "current_installation_binding_gap",
        summary:
          "The request must bind to the current installation-binding gap only, not to a broader earlier bootstrap phase."
      },
      bindingDrift: {
        id: "installation_context_shift_invalidates_request",
        summary:
          "If the installation context changes or binding is resolved, the previous request drifts out of scope and must be rejected."
      },
      bindingRecovery: {
        id: "rebind_to_current_installation_gap",
        summary:
          "Recovery is to confirm the current installation gap and issue a fresh request bound only to that remaining step."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      bindingTarget: {
        id: "current_runtime_identity_gap",
        summary:
          "The request must bind to the current remaining runtime identity gap so VTDD can keep the bounded write set traceable."
      },
      bindingDrift: {
        id: "runtime_gap_shift_invalidates_bound_request",
        summary:
          "If the remaining runtime identity gap shifts, the old bound request drifts and must not be replayed against the updated state."
      },
      bindingRecovery: {
        id: "rebind_to_current_runtime_gap",
        summary:
          "Recovery is to recompute the current runtime gap and issue a fresh request bound only to that latest remaining scope."
      }
    };
  }

  return {
    bindingTarget: {
      id: "remaining_verification_context_only",
      summary:
        "Any future request must bind only to the remaining verification context, not to an older bootstrap-write phase."
    },
    bindingDrift: {
      id: "verification_context_shift_invalidates_request",
      summary:
        "If the remaining verification context changes, the old request must be treated as out of date rather than reopened."
    },
    bindingRecovery: {
      id: "rebind_to_remaining_verification_need",
      summary:
        "Recovery is to reconfirm the remaining verification need and issue a fresh request bound only to that current context."
    }
  };
}

function buildBootstrapSessionAuthorityRequestTargetReadout({
  bootstrapState,
  preview,
  url,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const repo = normalizeText(url?.searchParams?.get("repo")) || "<unresolved-repo>";
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (setupState === "ready") {
    return {
      targetContext: {
        id: "no_current_setup_request_target_needed",
        summary:
          `VTDD already completed the current setup path for ${repo}, so no additional request targeting is needed to keep this verified flow coherent.`
      },
      targetDrift: {
        id: "future_generalized_request_targeting_is_separate_work",
        summary:
          "Any future generalized request targeting belongs to separate bootstrap work, not to the current verified-ready setup path."
      },
      targetRecovery: {
        id: "verified_path_continues_without_current_target_recovery",
        summary:
          "The verified path continues without a current target-recovery step because the setup-bound request target was already consumed and absorbed."
      }
    };
  }

  if (bootstrapState !== "available") {
    return {
      targetContext: {
        id: "blocked_repo_target_context",
        summary:
          `Any future approval-bound request must stay bound to the current setup target ${repo} and its blocked prerequisite context rather than float across repositories.`
      },
      targetDrift: {
        id: "repo_or_prerequisite_target_shift_invalidates_request",
        summary:
          "If the setup target or blocked prerequisite context changes, the old request target drifts immediately and must not be reused."
      },
      targetRecovery: {
        id: "restore_target_context_then_request_again",
        summary:
          "Recovery is to restore the intended setup target and prerequisites, then submit a fresh request for that current target only."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      targetContext: {
        id: "repo_target_with_installation_binding_gap",
        summary:
          `The request must stay bound to setup target ${repo} and its current installation-binding gap, not a broader or different repository context.`
      },
      targetDrift: {
        id: "repo_or_installation_target_shift_invalidates_request",
        summary:
          "If the setup target or installation context changes, the previous request target drifts out of scope and must be rejected."
      },
      targetRecovery: {
        id: "reconfirm_repo_and_installation_target_then_request",
        summary:
          "Recovery is to reconfirm the current repository target and installation gap, then create a fresh request for that exact target."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      targetContext: {
        id: "repo_target_with_runtime_identity_gap",
        summary:
          `The request must stay bound to setup target ${repo} and its current remaining runtime identity gap so the bounded write set stays target-specific.`
      },
      targetDrift: {
        id: "repo_or_runtime_target_shift_invalidates_request",
        summary:
          "If the repository target or remaining runtime identity gap changes, the old request target must be treated as stale."
      },
      targetRecovery: {
        id: "reconfirm_repo_and_runtime_target_then_request",
        summary:
          "Recovery is to recompute the current repository target and remaining runtime gap, then issue a fresh request only for that target."
      }
    };
  }

  return {
    targetContext: {
      id: "repo_target_with_remaining_verification_need",
      summary:
        `Any future request must stay bound to setup target ${repo} and its remaining verification need rather than reopen a past bootstrap target.`
    },
    targetDrift: {
      id: "repo_or_verification_target_shift_invalidates_request",
      summary:
        "If the repository target or verification context changes, the old request target is out of date and must not be reused."
    },
    targetRecovery: {
      id: "reconfirm_repo_and_verification_target_then_request",
      summary:
        "Recovery is to reconfirm the current repository target and remaining verification need, then create a fresh request for that target only."
    }
  };
}

function buildBootstrapSessionAuthorityRequestProvenanceReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (setupState === "ready") {
    return {
      provenanceSource: {
        id: "no_current_setup_request_provenance_needed",
        summary:
          "VTDD already absorbed the current setup path inside the live wizard flow, so no additional request provenance is needed for this verified-ready state."
      },
      provenanceDrift: {
        id: "future_generalized_request_provenance_is_separate_work",
        summary:
          "Any future generalized request provenance belongs to separate bootstrap work, not to the current verified-ready setup path."
      },
      provenanceRecovery: {
        id: "verified_path_continues_without_current_provenance_recovery",
        summary:
          "The verified path continues without a current provenance-recovery step because the setup-bound request provenance was already consumed and absorbed."
      }
    };
  }

  if (bootstrapState !== "available") {
    return {
      provenanceSource: {
        id: "current_wizard_entry_with_blocked_prerequisite_context",
        summary:
          "Any future approval-bound request must come from the current protected wizard flow that is reading the blocked prerequisite state, not from an older or external handoff."
      },
      provenanceDrift: {
        id: "older_or_external_flow_provenance_invalidates_request",
        summary:
          "If a request comes from an older setup flow or outside the current protected wizard context, its provenance drifts and must not be trusted."
      },
      provenanceRecovery: {
        id: "resume_current_protected_wizard_flow_then_request",
        summary:
          "Recovery is to resume the current protected wizard flow after prerequisites are restored, then create a fresh request from that flow only."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      provenanceSource: {
        id: "current_wizard_flow_after_runtime_identity_capture",
        summary:
          "The request must come from the current protected wizard flow after runtime identity capture, not from an earlier broader bootstrap phase."
      },
      provenanceDrift: {
        id: "pre_installation_or_external_flow_provenance_invalidates_request",
        summary:
          "If the request provenance comes from before the current installation-binding phase or from outside the wizard flow, it is out of date."
      },
      provenanceRecovery: {
        id: "resume_current_installation_phase_then_request",
        summary:
          "Recovery is to resume the current installation-binding phase in wizard and create a fresh request from that live flow only."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      provenanceSource: {
        id: "current_wizard_flow_with_runtime_identity_gap",
        summary:
          "The request must come from the current protected wizard flow that is holding the remaining runtime identity gap, not from a detached operator or chat-side transport path."
      },
      provenanceDrift: {
        id: "older_runtime_bootstrap_flow_provenance_invalidates_request",
        summary:
          "If the request provenance comes from an earlier runtime-bootstrap attempt or outside the current wizard flow, it must be treated as stale."
      },
      provenanceRecovery: {
        id: "resume_current_runtime_gap_flow_then_request",
        summary:
          "Recovery is to resume the current runtime-gap flow inside wizard and issue a fresh request from that same protected flow."
      }
    };
  }

  return {
    provenanceSource: {
      id: "current_wizard_flow_with_remaining_verification_need",
      summary:
        "Any future request must come from the current protected wizard flow that is reading the remaining verification need, not from an older bootstrap phase."
    },
    provenanceDrift: {
      id: "older_bootstrap_or_external_verification_flow_invalidates_request",
      summary:
        "If the provenance comes from an older bootstrap flow or from outside the current verification path, the request is out of date."
    },
    provenanceRecovery: {
      id: "resume_current_verification_flow_then_request",
      summary:
        "Recovery is to resume the current verification-bound wizard flow and create a fresh request from that live context only."
    }
  };
}

function buildBootstrapSessionEvidenceReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const postChecks = Array.isArray(preview?.postChecks) ? preview.postChecks : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      runtimeEvidence: ["setup_wizard_entry_access", "approval_bound_contract_surface"],
      blockedEvidence: ["missing_operator_bootstrap_prerequisites"],
      nextProof: {
        id: "operator_prerequisites_restored",
        summary:
          "The next meaningful proof is that the operator bootstrap prerequisites are restored and the bounded bootstrap path can advance beyond prerequisite blocking."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      runtimeEvidence: [
        "github_app_identity_present_in_runtime",
        "bounded_installation_binding_preview"
      ],
      blockedEvidence: ["installation_binding_not_yet_stored"],
      nextProof: {
        id: "installation_binding_detected_or_captured",
        summary:
          "The next proof is that installation binding is detected or captured so VTDD can mint installation tokens and continue to live verification."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      runtimeEvidence: ["operator_bootstrap_baseline_available", ...postChecks],
      blockedEvidence: ["missing_runtime_identity_fields"],
      nextProof: {
        id: "runtime_identity_fields_written",
        summary:
          "The next proof is that the missing GitHub App runtime fields are stored so the flow narrows to installation binding."
      }
    };
  }

  if (setupState === "ready") {
    return {
      runtimeEvidence: [
        "github_app_runtime_identity_present",
        "installation_binding_present",
        "live_readiness_verified",
        ...postChecks
      ],
      blockedEvidence: [],
      nextProof: {
        id: "use_verified_live_github_capability",
        summary:
          "The next proof is VTDD continuing from this verified live GitHub capability rather than reopening setup transport."
      }
    };
  }

  return {
    runtimeEvidence: [
      "github_app_runtime_identity_present",
      "installation_binding_present",
      ...postChecks
    ],
    blockedEvidence: ["live_readiness_not_yet_verified"],
    nextProof: {
      id: "live_probe_passes",
      summary:
        "The next proof is a passing live readiness probe that shows VTDD can do real GitHub work through the configured runtime identity."
    }
  };
}

function buildBootstrapSessionSafetyReadout({
  bootstrapState,
  preview,
  githubAppSetupCheck
}) {
  const plannedWrites = Array.isArray(preview?.plannedWrites) ? preview.plannedWrites : [];
  const setupState = normalizeText(githubAppSetupCheck?.state) || "unknown";

  if (bootstrapState !== "available") {
    return {
      stopReason: {
        id: "operator_bootstrap_prerequisites_not_ready",
        summary:
          "VTDD stops here because opening any bootstrap write path without the operator prerequisites would blur the bootstrap boundary."
      },
      invariantProtected: {
        id: "no_generic_secret_terminal",
        summary:
          "The setup surface must not degrade into a generic secret terminal just to get around missing bootstrap prerequisites."
      },
      unsafeShortcutDenied: {
        id: "skip_operator_bootstrap_boundary",
        summary:
          "VTDD refuses to skip the operator bootstrap boundary by pretending the missing prerequisites are only a cosmetic setup problem."
      }
    };
  }

  if (plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID") {
    return {
      stopReason: {
        id: "installation_binding_still_required",
        summary:
          "VTDD stops at installation binding because token minting and live verification would be unsafe without a real installation connection."
      },
      invariantProtected: {
        id: "no_fake_github_connection_ready_state",
        summary:
          "The wizard must not claim GitHub connection readiness before installation binding is actually present."
      },
      unsafeShortcutDenied: {
        id: "assume_installation_binding_without_proof",
        summary:
          "VTDD refuses to assume installation binding from partial identity alone."
      }
    };
  }

  if (plannedWrites.length > 1) {
    return {
      stopReason: {
        id: "runtime_identity_still_incomplete",
        summary:
          "VTDD stops before installation and verification because the current runtime identity is still incomplete."
      },
      invariantProtected: {
        id: "no_broad_bootstrap_authority_exposure",
        summary:
          "The setup path must not widen into broad write authority just to bypass the missing runtime identity fields."
      },
      unsafeShortcutDenied: {
        id: "pretend_runtime_identity_is_complete",
        summary:
          "VTDD refuses to treat partial GitHub App bootstrap as if the runtime identity were already complete."
      }
    };
  }

  if (setupState === "ready") {
    return {
      stopReason: {
        id: "no_setup_stop_active",
        summary:
          "VTDD is no longer stopped inside setup because this flow already proved live GitHub readiness."
      },
      invariantProtected: {
        id: "verified_ready_state_not_reopened_as_pending",
        summary:
          "Once live readiness is proven in this flow, the wizard must not regress that verified state back into a pending setup narrative."
      },
      unsafeShortcutDenied: {
        id: "reopen_verified_setup_as_if_proof_were_missing",
        summary:
          "VTDD refuses to present the verified setup path as if live proof were still missing."
      }
    };
  }

  return {
    stopReason: {
      id: "live_verification_still_required",
      summary:
        "VTDD stops short of a completion claim because configuration without live verification is still an unproven path."
    },
    invariantProtected: {
      id: "no_unverified_wizard_complete_claim",
      summary:
        "The wizard must not call setup complete until live verification proves the configured path does real GitHub work."
    },
    unsafeShortcutDenied: {
      id: "skip_live_probe_before_claiming_completion",
      summary:
        "VTDD refuses to skip the live probe and still claim wizard-complete setup."
      }
  };
}

async function detectGitHubAppInstallation({ env, fetchImpl, targetOwner }) {
  const runtimeEnv = env ?? {};
  const appId = normalizeText(runtimeEnv.GITHUB_APP_ID);
  const privateKey = resolveGitHubAppPrivateKey(runtimeEnv);
  if (!appId || !privateKey || typeof fetchImpl !== "function") {
    return {
      state: "probe_failed",
      summary: "VTDD could not inspect GitHub App installations from Worker runtime.",
      guidance: [
        "Restore GitHub App runtime prerequisites, then rerun githubAppCheck=on in this same setup flow.",
        "Do not switch to manual secret or ID transport while this probe is blocked."
      ]
    };
  }

  const appJwt = await createGitHubAppJwtFromPrivateKey({ appId, privateKey });
  if (!appJwt.ok) {
    return {
      state: "probe_failed",
      summary: "VTDD could not sign a GitHub App JWT while checking installations.",
      guidance: [
        "Regenerate the GitHub App private key and update Worker runtime.",
        "After runtime update, rerun githubAppCheck=on in the same setup flow to continue detection."
      ]
    };
  }

  let response;
  try {
    response = await fetchImpl(`${GITHUB_API_BASE_URL}/app/installations`, {
      method: "GET",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${appJwt.token}`,
        "user-agent": GITHUB_API_USER_AGENT,
        "x-github-api-version": "2022-11-28"
      }
    });
  } catch {
    return {
      state: "probe_failed",
      summary: "VTDD could not reach GitHub while checking App installations.",
      guidance: [
        "Confirm Worker runtime can reach api.github.com, then rerun githubAppCheck=on in this same setup flow.",
        "Do not fall back to manual ID transport while installation detection connectivity is blocked."
      ]
    };
  }

  const payload = await readSafeJson(response);
  if (!response.ok) {
    return {
      state: "probe_failed",
      summary:
        normalizeText(payload?.message) ||
        `VTDD could not inspect GitHub App installations (http ${response.status}).`,
      guidance: buildGitHubAppSetupGuidanceFromWarning(
        `github app installation detection failed: ${
          normalizeText(payload?.message) || `http ${response.status}`
        }`
      )
    };
  }

  const installations = Array.isArray(payload)
    ? payload.filter((item) => {
        const installationId = normalizeText(item?.id);
        const suspendedAt = normalizeText(item?.suspended_at);
        return installationId && !suspendedAt;
      })
    : [];
  if (installations.length === 0) {
    return {
      state: "awaiting_installation",
      totalInstallations: 0
    };
  }
  if (installations.length === 1) {
    return {
      state: "installation_detected",
      installationId: normalizeText(installations[0]?.id),
      totalInstallations: 1
    };
  }

  const normalizedTargetOwner = normalizeText(targetOwner).toLowerCase();
  if (normalizedTargetOwner) {
    const matchingInstallations = installations.filter((item) => {
      const accountLogin = normalizeText(item?.account?.login).toLowerCase();
      return accountLogin && accountLogin === normalizedTargetOwner;
    });
    if (matchingInstallations.length === 1) {
      return {
        state: "installation_detected",
        installationId: normalizeText(matchingInstallations[0]?.id),
        totalInstallations: installations.length
      };
    }
  }

  return {
    state: "installation_selection_required",
    totalInstallations: installations.length,
    selectionOptions: buildGitHubAppInstallationSelectionOptions(installations)
  };
}

function getSingleSetupWizardRepoOwner(url) {
  const repositories = parseRepositories(url);
  if (repositories.length === 0) {
    return "";
  }

  const owners = repositories
    .map((item) => normalizeText(item?.canonicalRepo))
    .filter((item) => item.includes("/"))
    .map((item) => item.split("/")[0])
    .filter(Boolean);
  if (owners.length !== repositories.length) {
    return "";
  }

  const uniqueOwners = [...new Set(owners)];
  return uniqueOwners.length === 1 ? uniqueOwners[0] : "";
}

async function getGitHubAppMetadata({ env, fetchImpl }) {
  const runtimeEnv = env ?? {};
  const appId = normalizeText(runtimeEnv.GITHUB_APP_ID);
  const privateKey = resolveGitHubAppPrivateKey(runtimeEnv);
  if (!appId || !privateKey || typeof fetchImpl !== "function") {
    return null;
  }

  const appJwt = await createGitHubAppJwtFromPrivateKey({ appId, privateKey });
  if (!appJwt.ok) {
    return null;
  }

  let response;
  try {
    response = await fetchImpl(`${GITHUB_API_BASE_URL}/app`, {
      method: "GET",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${appJwt.token}`,
        "user-agent": GITHUB_API_USER_AGENT,
        "x-github-api-version": "2022-11-28"
      }
    });
  } catch {
    return null;
  }

  const payload = await readSafeJson(response);
  if (!response.ok) {
    return null;
  }

  const slug = normalizeText(payload?.slug);
  const htmlUrl = normalizeText(payload?.html_url);
  if (!slug && !htmlUrl) {
    return null;
  }

  return {
    slug,
    htmlUrl
  };
}

function buildGitHubAppInstallationLinks(appMetadata) {
  const slug = normalizeText(appMetadata?.slug);
  const htmlUrl = normalizeText(appMetadata?.htmlUrl);
  const links = [];

  if (slug) {
    links.push({
      title: "Open GitHub App installation",
      url: `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`
    });
  }

  if (htmlUrl) {
    links.push({
      title: "Open GitHub App settings",
      url: htmlUrl
    });
  }

  return links;
}

function buildGitHubAppInstallationSelectionOptions(installations) {
  const options = (Array.isArray(installations) ? installations : [])
    .map((item) => {
      const installationId = normalizeText(item?.id);
      const accountLogin = normalizeText(item?.account?.login);
      const accountType = normalizeText(item?.account?.type);
      if (!installationId || !accountLogin) {
        return null;
      }
      return {
        installationId,
        accountLogin,
        accountType
      };
    })
    .filter(Boolean);

  if (options.length < 2) {
    return [];
  }

  const uniqueAccountLogins = new Set(options.map((item) => item.accountLogin.toLowerCase()));
  if (uniqueAccountLogins.size !== options.length) {
    return [];
  }

  return options;
}

function buildGitHubAppManifestLaunch(url) {
  const returnTo =
    normalizeGitHubAppBootstrapReturnTo(`${url.pathname}${url.search || "?githubAppCheck=on"}`) ||
    "/setup/wizard?githubAppCheck=on";
  const redirectUrl = new URL(SETUP_WIZARD_GITHUB_APP_MANIFEST_CALLBACK_PATH, url.origin);
  redirectUrl.searchParams.set("returnTo", returnTo);
  const setupUrl = new URL(returnTo, url.origin);
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

function attachDetectedInstallationCompletionAction({
  githubAppSetupCheck,
  approvalBoundBootstrapSession
}) {
  const setupCheck = githubAppSetupCheck ?? null;
  const session = approvalBoundBootstrapSession ?? null;
  const state = normalizeText(setupCheck?.state);
  const detectedInstallationId = normalizeText(setupCheck?.detectedInstallationId);
  const envelopeToken = normalizeText(session?.sessionEnvelope?.envelopeToken);
  const consumePath = normalizeText(session?.consumePath);
  const returnTo = normalizeSetupWizardContinuationReturnTo(
    session?.returnTo || setupCheck?.returnTo
  );
  const consumeEnabled = toBoolean(session?.consumeEnabled);
  const plannedWrites = Array.isArray(session?.sessionEnvelope?.plannedWrites)
    ? session.sessionEnvelope.plannedWrites
    : [];
  const installationOnlyWrite =
    plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID";

  if (
    state !== "installation_detected" ||
    !detectedInstallationId ||
    !consumeEnabled ||
    !envelopeToken ||
    !consumePath ||
    !returnTo ||
    !installationOnlyWrite
  ) {
    return setupCheck;
  }

  return {
    ...setupCheck,
    completeDetectedInstallationAction: {
      id: "consume_detected_installation_binding",
      path: consumePath,
      returnTo,
      envelopeToken,
      installationId: detectedInstallationId
    }
  };
}

function attachDetectedInstallationRequestAction({
  githubAppSetupCheck,
  approvalBoundBootstrapSession
}) {
  const setupCheck = githubAppSetupCheck ?? null;
  const session = approvalBoundBootstrapSession ?? null;
  const state = normalizeText(setupCheck?.state);
  const detectedInstallationId = normalizeText(setupCheck?.detectedInstallationId);
  const requestEnabled = toBoolean(session?.requestEnabled);
  const requestPath = normalizeText(session?.requestPath);
  const returnTo = normalizeSetupWizardContinuationReturnTo(
    session?.returnTo || setupCheck?.returnTo
  );
  const plannedWrites = Array.isArray(session?.contract?.preview?.plannedWrites)
    ? session.contract.preview.plannedWrites
    : [];
  const installationOnlyWrite =
    plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID";

  if (
    state !== "installation_detected" ||
    !detectedInstallationId ||
    !requestEnabled ||
    !requestPath ||
    !returnTo ||
    !installationOnlyWrite
  ) {
    return setupCheck;
  }

  return {
    ...setupCheck,
    requestDetectedInstallationAction: {
      id: "request_detected_installation_binding",
      path: requestPath,
      returnTo,
      pendingInstallationIdParam: "pending_installation_id",
      pendingInstallationId: detectedInstallationId
    }
  };
}

function attachInstallationSelectionRequestAction({
  githubAppSetupCheck,
  approvalBoundBootstrapSession
}) {
  const setupCheck = githubAppSetupCheck ?? null;
  const session = approvalBoundBootstrapSession ?? null;
  const state = normalizeText(setupCheck?.state);
  const options = Array.isArray(setupCheck?.installationSelectionOptions)
    ? setupCheck.installationSelectionOptions
    : [];
  const requestEnabled = toBoolean(session?.requestEnabled);
  const requestPath = normalizeText(session?.requestPath);
  const returnTo = normalizeSetupWizardContinuationReturnTo(
    session?.returnTo || setupCheck?.returnTo
  );
  const plannedWrites = Array.isArray(session?.contract?.preview?.plannedWrites)
    ? session.contract.preview.plannedWrites
    : [];
  const installationOnlyWrite =
    plannedWrites.length === 1 && plannedWrites[0] === "GITHUB_APP_INSTALLATION_ID";

  if (
    state !== "installation_selection_required" ||
    options.length === 0 ||
    !requestEnabled ||
    !requestPath ||
    !returnTo ||
    !installationOnlyWrite
  ) {
    return setupCheck;
  }

  return {
    ...setupCheck,
    requestInstallationSelectionAction: {
      id: "request_selected_installation_binding",
      path: requestPath,
      returnTo,
      pendingInstallationIdParam: "pending_installation_id"
    }
  };
}

function attachDetectedRequestGuidance({ githubAppSetupCheck }) {
  const setupCheck = githubAppSetupCheck ?? null;
  const state = normalizeText(setupCheck?.state);
  const requestActionId = normalizeText(setupCheck?.requestDetectedInstallationAction?.id);
  const guidance = Array.isArray(setupCheck?.guidance) ? setupCheck.guidance : [];

  if (
    state !== "installation_detected" ||
    requestActionId !== "request_detected_installation_binding"
  ) {
    return setupCheck;
  }

  const inFlowGuidance =
    "When approval-bound continuation is available, stay in this wizard and record GO + passkey before VTDD consumes installation binding.";
  const singleUseGuidance =
    "This GO + passkey continuation should remain single-use and bound to the currently detected installation candidate.";
  const genericGuidance =
    "When approval-bound continuation is available, no extra provider redirect is needed; continue inside this wizard with GO + passkey.";
  const guidanceWithoutGeneric = guidance.filter((item) => item !== genericGuidance);
  const nextGuidance = guidanceWithoutGeneric.includes(inFlowGuidance)
    ? guidanceWithoutGeneric
    : [...guidanceWithoutGeneric, inFlowGuidance];
  const finalGuidance = nextGuidance.includes(singleUseGuidance)
    ? nextGuidance
    : [...nextGuidance, singleUseGuidance];

  return {
    ...setupCheck,
    guidance: finalGuidance
  };
}

function attachDetectedCompletionGuidance({ githubAppSetupCheck }) {
  const setupCheck = githubAppSetupCheck ?? null;
  const state = normalizeText(setupCheck?.state);
  const completionActionId = normalizeText(setupCheck?.completeDetectedInstallationAction?.id);
  const guidance = Array.isArray(setupCheck?.guidance) ? setupCheck.guidance : [];

  if (
    state !== "installation_detected" ||
    completionActionId !== "consume_detected_installation_binding"
  ) {
    return setupCheck;
  }

  const inFlowGuidance =
    "When approval-bound consume is available, stay in this wizard and continue with the detected installation to complete binding and readiness in-flow.";
  const singleUseGuidance =
    "This approval-bound consume remains single-use and bound to the currently detected installation candidate.";
  const genericGuidance =
    "When approval-bound continuation is available, no extra provider redirect is needed; continue inside this wizard with GO + passkey.";
  const guidanceWithoutGeneric = guidance.filter((item) => item !== genericGuidance);
  const nextGuidance = guidanceWithoutGeneric.includes(inFlowGuidance)
    ? guidanceWithoutGeneric
    : [...guidanceWithoutGeneric, inFlowGuidance];
  const finalGuidance = nextGuidance.includes(singleUseGuidance)
    ? nextGuidance
    : [...nextGuidance, singleUseGuidance];

  return {
    ...setupCheck,
    guidance: finalGuidance
  };
}

function attachSelectionRequestGuidance({ githubAppSetupCheck }) {
  const setupCheck = githubAppSetupCheck ?? null;
  const state = normalizeText(setupCheck?.state);
  const requestActionId = normalizeText(setupCheck?.requestInstallationSelectionAction?.id);
  const guidance = Array.isArray(setupCheck?.guidance) ? setupCheck.guidance : [];

  if (
    state !== "installation_selection_required" ||
    requestActionId !== "request_selected_installation_binding"
  ) {
    return setupCheck;
  }

  const inFlowGuidance =
    "When approval-bound continuation is available, stay in this wizard and record GO + passkey before selecting the installation candidate.";
  const singleUseGuidance =
    "This GO + passkey continuation should remain single-use and bound to the selected installation candidate.";
  const genericGuidance =
    "When approval-bound continuation is available, no extra provider redirect is needed; continue inside this wizard with GO + passkey.";
  const guidanceWithoutGeneric = guidance.filter((item) => item !== genericGuidance);
  const nextGuidance = guidanceWithoutGeneric.includes(inFlowGuidance)
    ? guidanceWithoutGeneric
    : [...guidanceWithoutGeneric, inFlowGuidance];
  const finalGuidance = nextGuidance.includes(singleUseGuidance)
    ? nextGuidance
    : [...nextGuidance, singleUseGuidance];

  return {
    ...setupCheck,
    guidance: finalGuidance
  };
}

function attachInlineRequestSurfaceHint({
  approvalBoundBootstrapSession,
  githubAppSetupCheck
}) {
  const session = approvalBoundBootstrapSession ?? null;
  if (!session) {
    return session;
  }

  return {
    ...session,
    requestSurfacedInline: Boolean(
      githubAppSetupCheck?.requestDetectedInstallationAction ||
        githubAppSetupCheck?.requestInstallationSelectionAction
    )
  };
}

function attachInlineConsumeSurfaceHint({
  approvalBoundBootstrapSession,
  githubAppSetupCheck
}) {
  const session = approvalBoundBootstrapSession ?? null;
  if (!session) {
    return session;
  }

  return {
    ...session,
    consumeSurfacedInline: Boolean(githubAppSetupCheck?.completeDetectedInstallationAction)
  };
}

function resolvePendingInstallationIdForRequestAction({ url, githubAppSetupCheck }) {
  const pendingInstallationId = normalizeText(
    url?.searchParams?.get(SETUP_WIZARD_BOOTSTRAP_SESSION_PENDING_INSTALLATION_ID_PARAM)
  );
  if (!pendingInstallationId) {
    return "";
  }

  const setupState = normalizeText(githubAppSetupCheck?.state);
  if (setupState === "installation_detected") {
    const detectedInstallationId = normalizeText(githubAppSetupCheck?.detectedInstallationId);
    return detectedInstallationId === pendingInstallationId ? pendingInstallationId : "";
  }

  if (setupState === "installation_selection_required") {
    const options = Array.isArray(githubAppSetupCheck?.installationSelectionOptions)
      ? githubAppSetupCheck.installationSelectionOptions
      : [];
    const optionIds = new Set(
      options.map((item) => normalizeText(item?.installationId)).filter(Boolean)
    );
    return optionIds.has(pendingInstallationId) ? pendingInstallationId : "";
  }

  return "";
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

async function readGitHubAppInstallationCapturePayload(request) {
  const contentType = normalizeText(request.headers.get("content-type")).toLowerCase();

  if (contentType.includes("application/json")) {
    const payload = await request.json().catch(() => ({}));
    return {
      mode: "json",
      returnTo: normalizeText(payload?.returnTo),
      GITHUB_APP_INSTALLATION_ID: normalizeText(payload?.GITHUB_APP_INSTALLATION_ID)
    };
  }

  const form = await request.formData();
  return {
    mode: "form",
    returnTo: normalizeText(form.get("returnTo")),
    GITHUB_APP_INSTALLATION_ID: normalizeText(form.get("GITHUB_APP_INSTALLATION_ID"))
  };
}

function normalizeGitHubAppBootstrapReturnTo(value) {
  const text = normalizeText(value);
  if (!text.startsWith("/setup/wizard")) {
    return "";
  }
  const url = new URL(text, "https://example.com");
  if (!isTruthySignal(normalize(url.searchParams.get("githubAppCheck")))) {
    url.searchParams.set("githubAppCheck", "on");
  }
  return `${url.pathname}${url.search}`;
}

function normalizeSetupWizardContinuationReturnTo(value) {
  const text = normalizeGitHubAppBootstrapReturnTo(value);
  if (!text) {
    return "";
  }

  const url = new URL(text, "https://example.com");
  url.searchParams.delete("format");
  return `${url.pathname}${url.search}`;
}

function normalizeSetupWizardDiagnosticsReturnTo(value) {
  const text = normalizeSetupWizardContinuationReturnTo(value);
  if (!text) {
    return "";
  }

  const url = new URL(text, "https://example.com");
  url.searchParams.delete(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_STATE_PARAM);
  url.searchParams.delete(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_ENVELOPE_ID_PARAM);
  url.searchParams.delete(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_REASON_PARAM);
  url.searchParams.delete(SETUP_WIZARD_BOOTSTRAP_SESSION_CONSUME_PROOF_STATE_PARAM);
  return `${url.pathname}${url.search}`;
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
    reason,
    errorCodes: errors
      .map((item) => Number(item.code))
      .filter((item) => Number.isFinite(item)),
    errorMessages: errors.map((item) => normalizeText(item.message)).filter(Boolean)
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

  const conversionUrl = `${GITHUB_API_BASE_URL}/app-manifests/${encodeURIComponent(code)}/conversions`;
  const authHeaderCandidates = buildGitHubTokenAuthHeaderCandidates(token);
  let lastFailure = null;

  for (const authorizationValue of authHeaderCandidates) {
    const response = await fetchImpl(conversionUrl, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: authorizationValue,
        "user-agent": GITHUB_API_USER_AGENT,
        "x-github-api-version": "2022-11-28"
      }
    });

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

    lastFailure = {
      status: response.status,
      message: normalizeText(payload?.message),
      authorizationValue
    };

    if (response.status !== 401 && response.status !== 403) {
      break;
    }
  }

  const reason = buildGitHubManifestConversionFailureReason(lastFailure);
  return {
    ok: false,
    reason
  };
}

function buildGitHubTokenAuthHeaderCandidates(token) {
  const normalized = normalizeText(token);
  const candidates = [`Bearer ${normalized}`, `token ${normalized}`];
  return [...new Set(candidates)];
}

async function diagnoseGitHubManifestConversionToken({ fetchImpl, authToken }) {
  const token = normalizeText(authToken);
  if (!token) {
    return {
      ok: false,
      state: "missing_token"
    };
  }

  const authHeaderCandidates = buildGitHubTokenAuthHeaderCandidates(token);
  let last = null;

  for (const authorizationValue of authHeaderCandidates) {
    const response = await fetchImpl(`${GITHUB_API_BASE_URL}/user`, {
      method: "GET",
      headers: {
        accept: "application/vnd.github+json",
        authorization: authorizationValue,
        "user-agent": GITHUB_API_USER_AGENT,
        "x-github-api-version": "2022-11-28"
      }
    });

    const payload = await readSafeJson(response);
    const login = normalizeText(payload?.login);
    const accountType = normalizeText(payload?.type);
    const scopes = normalizeHeaderCsv(response.headers.get("x-oauth-scopes"));
    const acceptedScopes = normalizeHeaderCsv(response.headers.get("x-accepted-oauth-scopes"));

    last = {
      ok: response.ok && Boolean(login),
      status: response.status,
      authHeaderType: authorizationValue.startsWith("token ") ? "token" : "bearer",
      actorLogin: login || null,
      actorType: accountType || null,
      oauthScopes: scopes,
      acceptedScopes,
      message: normalizeText(payload?.message) || null
    };

    if (last.ok) {
      return {
        ...last,
        state: "token_actor_resolved"
      };
    }
  }

  return {
    ...(last ?? {}),
    state: "token_actor_unresolved"
  };
}

function buildGitHubManifestConversionFailureReason(failure) {
  const status = Number(failure?.status) || 500;
  const message = normalizeText(failure?.message);
  if (message) {
    return message;
  }

  if (status === 403) {
    return "github app manifest conversion failed with http 403 (service-owned GitHub token may be unsupported for this endpoint or missing required owner permissions)";
  }

  if (status === 401) {
    return "github app manifest conversion failed with http 401 (service-owned GitHub token is invalid or expired)";
  }

  return `github app manifest conversion failed with http ${status}`;
}

function normalizeHeaderCsv(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(",")
    .map((item) => normalizeText(item))
    .filter(Boolean);
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
  if (normalized.includes("installation detection failed")) {
    return [
      "Re-check GitHub App installation target and current private key.",
      "If the app was installed very recently, retry diagnostics in a moment."
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

async function createGitHubAppJwtFromPrivateKey({ appId, privateKey }) {
  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const issuedAt = nowSeconds - 60;
    const expiresAt = nowSeconds + 9 * 60;
    const encodedHeader = encodeJwtPart({ alg: "RS256", typ: "JWT" });
    const encodedPayload = encodeJwtPart({
      iat: issuedAt,
      exp: expiresAt,
      iss: appId
    });
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const key = await crypto.subtle.importKey(
      "pkcs8",
      decodePemPrivateKey(privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      new TextEncoder().encode(signingInput)
    );
    return {
      ok: true,
      token: `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`
    };
  } catch {
    return { ok: false };
  }
}

function encodeJwtPart(payload) {
  const json = JSON.stringify(payload);
  return base64UrlEncodeBytes(new TextEncoder().encode(json));
}

function decodePemPrivateKey(value) {
  const pem = normalizeText(value);
  const body = pem
    .replaceAll("-----BEGIN PRIVATE KEY-----", "")
    .replaceAll("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  return decodeBase64ToBytes(body);
}

function base64UrlEncodeBytes(bytes) {
  return toBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function toBase64(bytes) {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function decodeBase64ToBytes(value) {
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(value, "base64"));
}

function resolveGitHubAppPrivateKey(env) {
  const runtimeEnv = env ?? {};
  const base64Value = normalizeText(runtimeEnv.GITHUB_APP_PRIVATE_KEY_BASE64);
  if (base64Value) {
    try {
      return normalizeGitHubAppPrivateKeyValue(decodeBase64(base64Value));
    } catch {
      return "";
    }
  }
  return normalizeGitHubAppPrivateKeyValue(runtimeEnv.GITHUB_APP_PRIVATE_KEY);
}

function normalizeGitHubAppPrivateKeyValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  const unquoted =
    normalized.startsWith('"') && normalized.endsWith('"')
      ? normalized.slice(1, -1)
      : normalized;

  return unquoted.replaceAll("\\n", "\n");
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
