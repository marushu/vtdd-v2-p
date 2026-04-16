import {
  appendDecisionLogFromGateway,
  appendProposalLogFromGateway,
  inferRelatedIssueFromGatewayInput,
  inferRelatedIssueFromProposalGatewayInput,
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

const DEFAULT_REPOSITORIES = Object.freeze([
  {
    canonicalRepo: "marushu/vtdd-v2",
    aliases: ["vtdd", "vtdd-v2"]
  }
]);

const CANONICAL_API_PREFIX = "/v2";
const LEGACY_API_PREFIX = "/mvp";

const SETUP_WIZARD_CLOUDFLARE_CHECK_ENABLED_ENV = "SETUP_WIZARD_CLOUDFLARE_CHECK_ENABLED";
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
        mode: "v2"
      });
    }

    if (request.method === "GET" && url.pathname === "/setup/wizard") {
      return handleSetupWizardRequest(url, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/gateway")) {
      const auth = authorizeGatewayRequest({ request, env });
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
      if (!result.allowed) {
        return json(422, result);
      }

      const gatewayOutcome = await completeGatewayRuntime({
        payload: prepared.payload,
        gatewayResult: result,
        env
      });
      return json(gatewayOutcome.status, gatewayOutcome.body);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/constitution")) {
      const auth = authorizeGatewayRequest({ request, env });
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
      const auth = authorizeGatewayRequest({ request, env });
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
      const auth = authorizeGatewayRequest({ request, env });
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
      const auth = authorizeGatewayRequest({ request, env });
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

async function handleSetupWizardRequest(url, env) {
  const answers = buildSetupWizardAnswers(url);
  const result = runInitialSetupWizard({ answers });
  const cloudflareSetupCheck = await runCloudflareSetupCheck(url, env);
  const format = normalize(url.searchParams.get("format"));

  if (format === "json") {
    return json(result.ok ? 200 : 422, {
      ...result,
      generatedAnswers: answers,
      cloudflareSetupCheck
    });
  }

  const htmlBody = renderSetupWizardHtml({ result, answers, url, cloudflareSetupCheck });
  return html(result.ok ? 200 : 422, htmlBody);
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

  const resolvedAliasRegistry = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: basePolicyInput,
    env
  });

  return {
    payload: {
      ...basePayload,
      policyInput: {
        ...basePolicyInput,
        aliasRegistry: resolvedAliasRegistry.aliasRegistry
      }
    },
    warnings: resolvedAliasRegistry.warnings
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
    initialSurfaces
  };
}

function parseRepositories(url) {
  const provided = url.searchParams
    .getAll("repo")
    .map(normalizeRepo)
    .filter(Boolean);

  if (provided.length === 0) {
    return DEFAULT_REPOSITORIES.map((item) => ({
      canonicalRepo: item.canonicalRepo,
      aliases: [...item.aliases]
    }));
  }

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

function renderSetupWizardHtml({ result, answers, url, cloudflareSetupCheck }) {
  const body = result.ok
    ? renderSuccessContent(result, answers, url, cloudflareSetupCheck)
    : renderFailureContent(result, answers, url, cloudflareSetupCheck);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>VTDD Setup Wizard</title>
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
      <h1>VTDD Setup Wizard</h1>
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
          setCopyState(button, "Copied.");
        } catch {
          textarea.focus();
          textarea.select();
          setCopyState(button, "Select all and copy manually.");
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

function renderSuccessContent(result, answers, url, cloudflareSetupCheck) {
  const onboarding = result.onboarding ?? {};
  const customGpt = onboarding.customGpt ?? {};
  const repoList = answers.repositories.map((item) => escapeHtml(item.canonicalRepo));
  const steps = Array.isArray(onboarding.steps) ? onboarding.steps : [];
  const actionSchemaJson = customGpt.actionSchemaJson ?? "";
  const constructionText = customGpt.constructionText ?? "";

  return `
    <p class="meta">Open this URL on iPhone Safari, then copy the blocks below into Custom GPT settings.</p>
    <p class="meta">JSON output: <code>${escapeHtml(`${url.origin}/setup/wizard?format=json`)}</code></p>
    <h2>Repositories</h2>
    <div class="block">
      <ul>${repoList.map((repo) => `<li>${repo}</li>`).join("")}</ul>
    </div>
    <h2>Checklist</h2>
    <div class="block">
      <ul>${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>
    </div>
    <div class="section-header">
      <h2>Custom GPT Construction</h2>
      <button class="copy-button" type="button" data-copy-target="constructionText">Copy Construction</button>
    </div>
    <textarea id="constructionText" readonly>${escapeHtml(constructionText)}</textarea>
    <p class="copy-hint" data-copy-status="constructionText">Tap copy button if text selection is difficult on mobile.</p>
    <div class="section-header">
      <h2>Custom GPT Action Schema (OpenAPI)</h2>
      <button class="copy-button" type="button" data-copy-target="actionSchemaJson">Copy Schema</button>
    </div>
    <textarea id="actionSchemaJson" readonly>${escapeHtml(actionSchemaJson)}</textarea>
    <p class="copy-hint" data-copy-status="actionSchemaJson">Tap copy button to copy full OpenAPI JSON.</p>
    ${renderCloudflareSetupCheck(cloudflareSetupCheck)}
    <p class="meta">Secrets are not handled here. Keep Cloudflare credentials in GitHub Environment secrets only.</p>
  `;
}

function renderFailureContent(result, answers, url, cloudflareSetupCheck) {
  const issues = Array.isArray(result.blockingIssues) ? result.blockingIssues : [];
  const issueItems = issues.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return `
    <p class="meta">Wizard validation failed.</p>
    <h2>Blocking Issues</h2>
    <div class="block">
      <ul>${issueItems || "<li>unknown validation error</li>"}</ul>
    </div>
    ${renderCloudflareSetupCheck(cloudflareSetupCheck)}
    <h2>Debug (safe answers only)</h2>
    <textarea readonly>${escapeHtml(JSON.stringify(answers, null, 2))}</textarea>
    <p class="meta">Tip: use <code>${escapeHtml(`${url.origin}/setup/wizard?format=json`)}</code> to inspect machine-readable output.</p>
  `;
}

function renderCloudflareSetupCheck(check) {
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
    <h2>Cloudflare Setup Check</h2>
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

function isTruthySignal(value) {
  return value === "on" || value === "true" || value === "1";
}

function toBoolean(value) {
  const normalized = normalize(value);
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function authorizeGatewayRequest({ request, env }) {
  const runtimeEnv = env ?? {};

  const bearerToken = normalizeText(
    runtimeEnv.VTDD_GATEWAY_BEARER_TOKEN ?? runtimeEnv.MVP_GATEWAY_BEARER_TOKEN
  );
  if (bearerToken) {
    const provided = parseBearerToken(request.headers.get("authorization"));
    if (provided === bearerToken) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 401,
      reason: "valid bearer token is required for /v2/gateway (legacy /mvp/gateway is also accepted)"
    };
  }

  const accessClientId = normalizeText(runtimeEnv.CF_ACCESS_CLIENT_ID);
  const accessClientSecret = normalizeText(runtimeEnv.CF_ACCESS_CLIENT_SECRET);
  if (accessClientId || accessClientSecret) {
    const providedId = normalizeText(request.headers.get("cf-access-client-id"));
    const providedSecret = normalizeText(request.headers.get("cf-access-client-secret"));
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
      status: 401,
      reason:
        "valid Cloudflare Access service token headers are required for /v2/gateway (legacy /mvp/gateway is also accepted)"
    };
  }

  return { ok: true };
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

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

function html(status, body) {
  return new Response(body, {
    status,
    headers: HTML_HEADERS
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
