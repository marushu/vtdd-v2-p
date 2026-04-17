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

    if (request.method === "GET" && url.pathname === "/setup/wizard") {
      return handleSetupWizardRequest(url, env);
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

async function handleSetupWizardRequest(url, env) {
  const answers = buildSetupWizardAnswers(url);
  const result = runInitialSetupWizard({ answers });
  const cloudflareSetupCheck = await runCloudflareSetupCheck(url, env);
  const githubAppSetupCheck = await runGitHubAppSetupCheck(url, env);
  const format = normalize(url.searchParams.get("format"));
  const guidance = buildSetupWizardGuidance({ result, url });
  const enrichedResult = attachSetupWizardImportUrls({ result, url });

  if (format === "openapi") {
    const actionSchemaJson = enrichedResult?.onboarding?.customGpt?.actionSchemaJson;
    if (!enrichedResult.ok || !actionSchemaJson) {
      return json(422, {
        ...enrichedResult,
        generatedAnswers: answers,
        cloudflareSetupCheck,
        githubAppSetupCheck,
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
      guidance
    });
  }

  const htmlBody = renderSetupWizardHtml({
    result: enrichedResult,
    answers,
    url,
    cloudflareSetupCheck,
    githubAppSetupCheck
  });
  return html(result.ok ? 200 : 422, htmlBody);
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

function renderSetupWizardHtml({ result, answers, url, cloudflareSetupCheck, githubAppSetupCheck }) {
  const body = result.ok
    ? renderSuccessContent(result, answers, url, cloudflareSetupCheck, githubAppSetupCheck)
    : renderFailureContent(result, answers, url, cloudflareSetupCheck, githubAppSetupCheck);

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

function renderSuccessContent(result, answers, url, cloudflareSetupCheck, githubAppSetupCheck) {
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
    ${renderDeployAuthorityRecommendation(deployAuthority)}
    ${renderProductionDeployContract(productionDeploy)}
    ${renderMachineAuthContract(machineAuth)}
    ${renderRepositoryResolutionContract(repositoryResolution)}
    ${renderMemorySafetyContract(memorySafety)}
    ${renderRoleSeparationContract(roleSeparation)}
    ${renderSurfaceIndependenceContract(surfaceIndependence)}
    ${renderButlerReviewProtocolContract(butlerReviewProtocol)}
    ${renderRetrievalContract(retrievalContract)}
    ${renderPolicyEngineContract(policyEngine)}
    ${renderGuardedAbsenceContract(guardedAbsence)}
    ${renderReviewerContract(reviewer)}
    <div class="section-header">
      <h2>Custom GPT Construction</h2>
      <button class="copy-button" type="button" data-copy-target="constructionText">Copy Construction</button>
    </div>
    <textarea id="constructionText" readonly>${escapeHtml(constructionText)}</textarea>
    <p class="copy-hint" data-copy-status="constructionText">Tap copy button if text selection is difficult on mobile. Replace the full Instructions field with this text.</p>
    <div class="section-header">
      <h2>Custom GPT Action Schema (OpenAPI)</h2>
      <button class="copy-button" type="button" data-copy-target="actionSchemaJson">Copy Schema</button>
    </div>
    <p class="meta">If pasting full schema is hard on iPhone, use Import from URL with the link below.</p>
    <div class="section-header">
      <h3>Schema Import URL</h3>
      <button class="copy-button" type="button" data-copy-target="actionSchemaImportUrl">Copy Import URL</button>
    </div>
    <textarea id="actionSchemaImportUrl" readonly>${escapeHtml(actionSchemaImportUrl)}</textarea>
    <p class="copy-hint" data-copy-status="actionSchemaImportUrl">Paste this URL into Custom GPT Action schema import.</p>
    <textarea id="actionSchemaJson" readonly>${escapeHtml(actionSchemaJson)}</textarea>
    <p class="copy-hint" data-copy-status="actionSchemaJson">Tap copy button to copy full OpenAPI JSON.</p>
    ${renderGitHubAppSetupCheck(githubAppSetupCheck)}
    ${renderCloudflareSetupCheck(cloudflareSetupCheck)}
    <p class="meta">Secrets are not handled here. Keep Cloudflare credentials in GitHub Environment secrets only.</p>
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

function renderFailureContent(result, answers, url, cloudflareSetupCheck, githubAppSetupCheck) {
  const issues = Array.isArray(result.blockingIssues) ? result.blockingIssues : [];
  const issueItems = issues.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const guidance = buildSetupWizardGuidance({ result, url });
  const guidanceItems = guidance.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return `
    <p class="meta">Wizard validation failed.</p>
    <h2>Blocking Issues</h2>
    <div class="block">
      <ul>${issueItems || "<li>unknown validation error</li>"}</ul>
    </div>
    ${
      guidanceItems
        ? `<h2>Guidance</h2><div class="block"><ul>${guidanceItems}</ul></div>`
        : ""
    }
    ${renderGitHubAppSetupCheck(githubAppSetupCheck)}
    ${renderCloudflareSetupCheck(cloudflareSetupCheck)}
    <h2>Debug (safe answers only)</h2>
    <textarea readonly>${escapeHtml(JSON.stringify(answers, null, 2))}</textarea>
    <p class="meta">Tip: use <code>${escapeHtml(`${url.origin}/setup/wizard?format=json`)}</code> to inspect machine-readable output.</p>
  `;
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

function renderGitHubAppSetupCheck(check) {
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
    <h2>GitHub App Setup Check</h2>
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

function normalizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
