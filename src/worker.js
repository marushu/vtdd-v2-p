import {
  AutonomyMode,
  MemoryRecordType,
  appendDecisionLogFromGateway,
  appendProposalLogFromGateway,
  createPasskeyApprovalOptions,
  createPasskeyRegistrationOptions,
  createMemoryRecord,
  createRemoteCodexExecutionRequest,
  dedupePasskeys,
  dispatchRemoteCodexExecution,
  inferRelatedIssueFromGatewayInput,
  inferRelatedIssueFromProposalGatewayInput,
  normalizeScopeSnapshot,
  normalizeAutonomyMode,
  retrieveRemoteCodexExecutionProgress,
  retrieveCrossIssueMemoryIndex,
  retrieveDecisionLogReferences,
  retrieveProposalLogReferences,
  retrieveConstitution,
  resolveGatewayAliasRegistryFromGitHubApp,
  runMvpGateway,
  validateMemoryProvider,
  verifyPasskeyApproval,
  verifyPasskeyRegistration
} from "./core/index.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8"
};

const CANONICAL_API_PREFIX = "/v2";
const LEGACY_API_PREFIX = "/mvp";
const AUTONOMY_MODE_ENV = "VTDD_AUTONOMY_MODE";
const LEGACY_AUTONOMY_MODE_ENV = "MVP_AUTONOMY_MODE";

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

    if (request.method === "POST" && isApiPath(url.pathname, "/action/execute")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/action/execute" });
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

      const requestValidation = createRemoteCodexExecutionRequest({
        payload: prepared.payload,
        gatewayResult: result
      });
      if (!requestValidation.ok) {
        return json(422, {
          ok: false,
          error: "remote_codex_execution_request_invalid",
          issues: requestValidation.issues
        });
      }

      const dispatched = await dispatchRemoteCodexExecution({
        payload: prepared.payload,
        gatewayResult: result,
        env
      });
      if (!dispatched.ok) {
        return json(dispatched.status ?? 503, {
          ok: false,
          error: dispatched.error ?? "remote_codex_dispatch_failed",
          blockedByRule: dispatched.blockedByRule ?? null,
          reason: dispatched.reason,
          issues: dispatched.issues ?? []
        });
      }

      return json(202, {
        ok: true,
        allowed: true,
        execution: dispatched.execution
      });
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/action/progress")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/action/progress" });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      const progress = await retrieveRemoteCodexExecutionProgress({
        executionId: url.searchParams.get("executionId"),
        env
      });
      if (!progress.ok) {
        return json(progress.status ?? 503, {
          ok: false,
          error: progress.error,
          reason: progress.reason
        });
      }

      return json(200, {
        ok: true,
        progress: progress.progress
      });
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/approval-grant")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/approval-grant" });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveApprovalGrantRequest(url, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/approval/passkey/register/options")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/approval/passkey/register/options"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handlePasskeyRegistrationOptionsRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/approval/passkey/register/verify")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/approval/passkey/register/verify"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handlePasskeyRegistrationVerifyRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/approval/passkey/challenge")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/approval/passkey/challenge"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handlePasskeyApprovalOptionsRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/approval/passkey/verify")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/approval/passkey/verify"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handlePasskeyApprovalVerifyRequest(request, env);
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

async function handleRetrieveApprovalGrantRequest(url, env) {
  const provider = env?.MEMORY_PROVIDER ?? null;
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for approval grant retrieval"
    });
  }

  const approvalId = normalizeText(url.searchParams.get("approvalId"));
  if (!approvalId) {
    return json(422, {
      ok: false,
      error: "approval_id_required",
      reason: "approvalId query parameter is required"
    });
  }

  const record = await findApprovalRecordById(provider, approvalId);
  if (!record || normalizeText(record?.content?.kind) !== "passkey_grant") {
    return json(404, {
      ok: false,
      error: "approval_grant_not_found",
      reason: "matching passkey approval grant was not found"
    });
  }

  return json(200, {
    ok: true,
    approvalGrant: {
      approvalId: normalizeText(record.content.approvalId) || record.id,
      verified: record.content.status === "verified",
      verifiedAt: normalizeText(record.content.verifiedAt) || null,
      expiresAt: normalizeText(record.content.expiresAt) || null,
      scope: normalizeScopeSnapshot(record.content.scope)
    }
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

  const resolvedApprovalGrant = await resolveApprovalGrant({
    payload: basePayload,
    policyInput: basePolicyInput,
    env
  });
  if (resolvedApprovalGrant.warning) {
    warnings.push(resolvedApprovalGrant.warning);
  }

  return {
    payload: {
      ...basePayload,
      policyInput: {
        ...basePolicyInput,
        aliasRegistry: resolvedAliasRegistry.aliasRegistry,
        autonomyMode: effectiveAutonomyMode,
        approvalGrant: resolvedApprovalGrant.approvalGrant,
        approvalScope: buildApprovalScopeSnapshot({
          payload: basePayload,
          policyInput: basePolicyInput
        })
      }
    },
    warnings
  };
}

async function handlePasskeyRegistrationOptionsRequest(request, env) {
  const provider = env?.MEMORY_PROVIDER ?? null;
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for passkey registration"
    });
  }

  const body = await readJson(request);
  const created = await createPasskeyRegistrationOptions({
    adapter: env?.PASSKEY_ADAPTER,
    rpID: env?.VTDD_PASSKEY_RP_ID || new URL(request.url).hostname,
    rpName: env?.VTDD_PASSKEY_RP_NAME || "VTDD",
    origin: env?.VTDD_PASSKEY_ORIGIN || new URL(request.url).origin,
    operatorId: normalizeText(body?.operatorId) || "vtdd-operator",
    operatorLabel: normalizeText(body?.operatorLabel) || "VTDD Operator"
  });

  if (!created.ok) {
    return json(422, {
      ok: false,
      error: "passkey_registration_options_invalid",
      issues: created.issues ?? []
    });
  }

  const stored = await provider.store(created.sessionRecord);
  if (!stored?.ok) {
    return json(503, {
      ok: false,
      error: "memory_write_failed",
      reason: "failed to persist pending registration session"
    });
  }

  return json(200, {
    ok: true,
    sessionId: created.sessionRecord.id,
    optionsJSON: created.optionsJSON
  });
}

async function handlePasskeyRegistrationVerifyRequest(request, env) {
  const provider = env?.MEMORY_PROVIDER ?? null;
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for passkey registration verify"
    });
  }

  const body = await readJson(request);
  const sessionId = normalizeText(body?.sessionId);
  const sessionRecord = await findApprovalRecordById(provider, sessionId);
  if (!sessionRecord) {
    return json(404, {
      ok: false,
      error: "passkey_session_not_found",
      reason: "registration session not found"
    });
  }

  const verified = await verifyPasskeyRegistration({
    adapter: env?.PASSKEY_ADAPTER,
    sessionRecord,
    response: body?.response,
    rpID: env?.VTDD_PASSKEY_RP_ID || new URL(request.url).hostname,
    origin: env?.VTDD_PASSKEY_ORIGIN || new URL(request.url).origin
  });

  if (!verified.ok) {
    return json(422, {
      ok: false,
      error: "passkey_registration_verify_failed",
      issues: verified.issues ?? []
    });
  }

  await provider.store(verified.passkeyRecord);
  await provider.store(verified.completedSessionRecord);

  return json(200, {
    ok: true,
    credentialId: verified.passkeyRecord.content.credentialId
  });
}

async function handlePasskeyApprovalOptionsRequest(request, env) {
  const provider = env?.MEMORY_PROVIDER ?? null;
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for passkey approval"
    });
  }

  const body = await readJson(request);
  const passkeys = await retrieveRegisteredPasskeys(provider);
  const created = await createPasskeyApprovalOptions({
    adapter: env?.PASSKEY_ADAPTER,
    rpID: env?.VTDD_PASSKEY_RP_ID || new URL(request.url).hostname,
    origin: env?.VTDD_PASSKEY_ORIGIN || new URL(request.url).origin,
    passkeys,
    scope: buildApprovalScopeSnapshot({
      payload: body,
      policyInput: body?.policyInput
    })
  });

  if (!created.ok) {
    return json(422, {
      ok: false,
      error: "passkey_approval_options_invalid",
      issues: created.issues ?? []
    });
  }

  const stored = await provider.store(created.sessionRecord);
  if (!stored?.ok) {
    return json(503, {
      ok: false,
      error: "memory_write_failed",
      reason: "failed to persist pending passkey approval session"
    });
  }

  return json(200, {
    ok: true,
    sessionId: created.sessionRecord.id,
    optionsJSON: created.optionsJSON
  });
}

async function handlePasskeyApprovalVerifyRequest(request, env) {
  const provider = env?.MEMORY_PROVIDER ?? null;
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for passkey approval verify"
    });
  }

  const body = await readJson(request);
  const sessionId = normalizeText(body?.sessionId);
  const sessionRecord = await findApprovalRecordById(provider, sessionId);
  if (!sessionRecord) {
    return json(404, {
      ok: false,
      error: "passkey_session_not_found",
      reason: "approval session not found"
    });
  }

  const verified = await verifyPasskeyApproval({
    adapter: env?.PASSKEY_ADAPTER,
    sessionRecord,
    response: body?.response,
    passkeys: await retrieveRegisteredPasskeys(provider),
    rpID: env?.VTDD_PASSKEY_RP_ID || new URL(request.url).hostname,
    origin: env?.VTDD_PASSKEY_ORIGIN || new URL(request.url).origin
  });

  if (!verified.ok) {
    return json(422, {
      ok: false,
      error: "passkey_approval_verify_failed",
      issues: verified.issues ?? []
    });
  }

  await provider.store(verified.updatedPasskeyRecord);
  await provider.store(verified.grantRecord);

  return json(200, {
    ok: true,
    approvalGrant: verified.approvalGrant
  });
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

async function resolveApprovalGrant({ payload, policyInput, env }) {
  const provider = env?.MEMORY_PROVIDER ?? null;
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return { approvalGrant: null };
  }

  const approvalId = normalizeText(policyInput?.approvalGrantId);
  if (!approvalId) {
    return { approvalGrant: null };
  }

  const record = await findApprovalRecordById(provider, approvalId);
  if (!record || record?.content?.kind !== "passkey_grant") {
    return {
      approvalGrant: null,
      warning: "approval grant id was provided but no matching passkey grant was found"
    };
  }

  return {
    approvalGrant: {
      approvalId,
      verified: record.content.status === "verified",
      expiresAt: record.content.expiresAt,
      scope: record.content.scope
    }
  };
}

function buildApprovalScopeSnapshot({ payload, policyInput }) {
  const issueContext = normalizeObject(payload?.issueContext);
  const traceability = normalizeObject(policyInput?.issueTraceability);
  return normalizeScopeSnapshot({
    actionType: policyInput?.actionType,
    highRiskKind: payload?.highRiskKind ?? policyInput?.highRiskKind,
    repositoryInput: policyInput?.repositoryInput,
    issueNumber: issueContext.issueNumber,
    relatedIssue: traceability.relatedIssue ?? issueContext.issueNumber,
    phase: payload?.phase
  });
}

async function retrieveRegisteredPasskeys(provider) {
  const records = await provider.retrieve({
    type: MemoryRecordType.WORKING_MEMORY,
    tags: ["passkey_registry"]
  });
  return dedupePasskeys(records);
}

async function findApprovalRecordById(provider, recordId) {
  if (!recordId) {
    return null;
  }
  const records = await provider.query({
    type: MemoryRecordType.APPROVAL_LOG,
    text: recordId,
    limit: 50
  });
  return (
    records.find((record) => normalizeText(record?.id) === recordId) ??
    records.find((record) => normalizeText(record?.content?.approvalId) === recordId) ??
    records.find((record) => normalizeText(record?.content?.sessionId) === recordId) ??
    null
  );
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

function isApiPath(pathname, suffix) {
  return (
    pathname === `${CANONICAL_API_PREFIX}${suffix}` || pathname === `${LEGACY_API_PREFIX}${suffix}`
  );
}
