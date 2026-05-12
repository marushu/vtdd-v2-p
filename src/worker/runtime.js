import {
  AutonomyMode,
  ActorRole,
  buildCustomGptRecoveryBundle,
  CustomGptSetupChannel,
  MemoryRecordType,
  appendDecisionLogFromGateway,
  appendProposalLogFromGateway,
  createCloudflareMemoryProvider,
  createPasskeyApprovalOptions,
  createPasskeyRegistrationOptions,
  createMemoryRecord,
  createRemoteCodexExecutionRequest,
  deleteRepositoryNickname,
  dedupePasskeys,
  dispatchRemoteCodexExecution,
  executeDeployProductionPlane,
  executeGitHubActionsSecretSync,
  evaluateButlerSelfParity,
  evaluateExecutionContinuity,
  evaluateMemorySafety,
  executeGitHubHighRiskPlane,
  inferRelatedIssueFromGatewayInput,
  inferRelatedIssueFromProposalGatewayInput,
  isExpiredPasskeyEphemeralRecord,
  normalizeScopeSnapshot,
  normalizeAutonomyMode,
  retrieveRemoteCodexExecutionProgress,
  retrieveVpsRunnerHealthStatus,
  retrieveCrossIssueMemoryIndex,
  retrieveOperationalMemory,
  retrieveDecisionLogReferences,
  retrieveProposalLogReferences,
  retrieveConstitution,
  retrieveCustomGptSetupArtifact,
  renderPasskeyOperatorPage,
  renderCustomGptRecoveryPage,
  buildVtddCloudflarePageDirectory,
  renderVtddHelpGuidePage,
  sanitizeGitHubActionsSecretSyncErrorMessage,
  RepositoryNicknameMode,
  resolveGatewayAliasRegistryFromGitHubApp,
  resolveRepositoryTarget,
  GitHubHighRiskOperation,
  getGitHubAppOperation,
  mergeAliasRegistries,
  retrieveStoredAliasRegistry,
  retrieveGitHubReadPlane,
  TaskMode,
  bindNaturalGitHubWriteApproval,
  cancelVpsRunnerQueue,
  executeGitHubWritePlane,
  runMvpGateway,
  upsertRepositoryNickname,
  validateMemoryProvider,
  verifyPasskeyApproval,
  verifyPasskeyRegistration
} from "../core/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as z from "zod";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8"
};

const CANONICAL_API_PREFIX = "/v2";
const LEGACY_API_PREFIX = "/mvp";
const MCP_PATH = "/mcp";
const MCP_PROTOCOL_VERSION = "2025-03-26";
const MCP_PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
const MCP_PROTECTED_RESOURCE_METADATA_MIRROR_PATH = `${MCP_PROTECTED_RESOURCE_METADATA_PATH}/mcp`;
const MCP_SERVER_INFO = Object.freeze({
  name: "vtdd-mcp",
  version: "0.1.0"
});
const MCP_INSTRUCTIONS =
  "VTDD MCP は Butler と同じ runtime truth / review truth / operational memory を読むための read-first surface です。現在の truth は runtime truth を優先し、memory は補助として扱ってください。";
const AUTONOMY_MODE_ENV = "VTDD_AUTONOMY_MODE";
const LEGACY_AUTONOMY_MODE_ENV = "MVP_AUTONOMY_MODE";
const MEMORY_D1_BINDING = "VTDD_MEMORY_D1";
const MEMORY_R2_BINDING = "VTDD_MEMORY_R2";
const MEMORY_BLOB_THRESHOLD_ENV = "VTDD_MEMORY_BLOB_THRESHOLD";
const DEFAULT_MEMORY_LIMIT = 20;
const MAX_MEMORY_LIMIT = 200;
const memoryProviderCache = new WeakMap();
const d1AdapterCache = new WeakMap();

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

    if (
      request.method === "GET" &&
      (url.pathname === "/setup" ||
        url.pathname === "/setup/recovery" ||
        url.pathname === "/setup/latest" ||
        url.pathname === "/setup/known-good")
    ) {
      return handleCustomGptRecoveryPageRequest(url, env);
    }

    if (request.method === "GET" && (url.pathname === "/help" || url.pathname === "/guide")) {
      return html(
        200,
        renderVtddHelpGuidePage({
          runtimeOrigin: url.origin,
          mcpPath: MCP_PATH
        })
      );
    }

    if (
      request.method === "GET" &&
      (url.pathname === MCP_PROTECTED_RESOURCE_METADATA_PATH ||
        url.pathname === MCP_PROTECTED_RESOURCE_METADATA_MIRROR_PATH)
    ) {
      return json(200, buildMcpProtectedResourceMetadata(url));
    }

    if ((request.method === "POST" || request.method === "GET") && url.pathname === MCP_PATH) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: MCP_PATH });
      if (!auth.ok) {
        const headers =
          auth.status === 401 ? buildMcpUnauthorizedHeaders(url, auth.headers ?? {}) : auth.headers ?? {};
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        }, headers);
      }
      return handleMcpRequest({ request, env, url });
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/approval/passkey/operator")) {
      await purgeExpiredPasskeyArtifacts(resolveMemoryProvider(env));
      return handlePasskeyOperatorPageRequest(request);
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
      const prepared = await prepareGatewayPayload({
        payload,
        env,
        allowRemoteCodexHandoffNormalization: true
      });
      const result = appendWarnings(
        runMvpGateway(prepared.payload, {
          allowButlerRemoteCodexHandoff: true
        }),
        prepared.warnings
      );
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

    if (request.method === "POST" && isApiPath(url.pathname, "/action/github")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/action/github" });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleGitHubWritePlaneRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/memory-write")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/action/memory-write"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleMemoryWriteRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/github-authority")) {
      const auth = authorizePasskeyBrowserOrMachineRequest({
        request,
        env,
        apiSuffix: "/action/github-authority"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleGitHubHighRiskPlaneRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/deploy")) {
      const auth = authorizePasskeyBrowserOrMachineRequest({
        request,
        env,
        apiSuffix: "/action/deploy"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleDeployProductionRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/github-actions-secret")) {
      const auth = authorizePasskeyBrowserOrMachineRequest({
        request,
        env,
        apiSuffix: "/action/github-actions-secret"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleGitHubActionsSecretSyncRequest(request, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/repository-nickname")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/action/repository-nickname"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleRepositoryNicknameUpsertRequest(request, env);
    }

    if (
      request.method === "POST" &&
      isApiPath(url.pathname, "/action/repository-nickname/delete")
    ) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/action/repository-nickname/delete"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      return handleRepositoryNicknameDeleteRequest(request, env);
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
        repository: url.searchParams.get("repository"),
        issueNumber: url.searchParams.get("issueNumber"),
        branch: url.searchParams.get("branch"),
        executorTransport: url.searchParams.get("executorTransport"),
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

    if (request.method === "GET" && isApiPath(url.pathname, "/action/vps-runner-status")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/action/vps-runner-status"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      const status = await retrieveVpsRunnerHealthStatus({
        executionId: url.searchParams.get("executionId"),
        repository: url.searchParams.get("repository"),
        issueNumber: url.searchParams.get("issueNumber"),
        branch: url.searchParams.get("branch"),
        env
      });
      if (!status.ok) {
        return json(status.status ?? 503, {
          ok: false,
          error: status.error,
          reason: status.reason
        });
      }

      return json(200, {
        ok: true,
        health: status.health,
        progress: status.progress
      });
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/action/vps-runner-cancel")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/action/vps-runner-cancel"
      });
      if (!auth.ok) {
        return json(auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }

      const payload = await readJson(request);
      const cancellation = await cancelVpsRunnerQueue({
        repository: payload.repository,
        issueNumber: payload.issueNumber,
        executionId: payload.executionId,
        mode: payload.mode,
        reason: payload.reason,
        actor: payload.actor,
        env
      });
      if (!cancellation.ok) {
        return json(cancellation.status ?? 503, {
          ok: false,
          error: cancellation.error,
          reason: cancellation.reason,
          issues: cancellation.issues ?? []
        });
      }

      return json(200, {
        ok: true,
        cancellation: cancellation.cancellation
      });
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/approval-grant")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/approval-grant" });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveApprovalGrantRequest(url, env);
    }

    if (request.method === "POST" && isApiPath(url.pathname, "/approval/passkey/register/options")) {
      await purgeExpiredPasskeyArtifacts(resolveMemoryProvider(env));
      const auth = await authorizePasskeyRegistrationRequest({
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
      await purgeExpiredPasskeyArtifacts(resolveMemoryProvider(env));
      const auth = await authorizePasskeyRegistrationRequest({
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
      await purgeExpiredPasskeyArtifacts(resolveMemoryProvider(env));
      const auth = authorizePasskeyBrowserOrMachineRequest({
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
      await purgeExpiredPasskeyArtifacts(resolveMemoryProvider(env));
      const auth = authorizePasskeyBrowserOrMachineRequest({
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
        return retrieveErrorJson(url, auth.status, {
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
        return retrieveErrorJson(url, auth.status, {
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
        return retrieveErrorJson(url, auth.status, {
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
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveCrossIssueRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/operational-memory")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/retrieve/operational-memory"
      });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveOperationalMemoryRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/github")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/github" });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveGitHubReadPlaneRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/cloudflare-pages")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/retrieve/cloudflare-pages"
      });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveCloudflarePagesRequest(url);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/setup-artifact")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/setup-artifact" });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveCustomGptSetupArtifactRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/self-parity")) {
      const auth = authorizeGatewayRequest({ request, env, apiSuffix: "/retrieve/self-parity" });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveButlerSelfParityRequest(url, env);
    }

    if (request.method === "GET" && isApiPath(url.pathname, "/retrieve/repository-nicknames")) {
      const auth = authorizeGatewayRequest({
        request,
        env,
        apiSuffix: "/retrieve/repository-nicknames"
      });
      if (!auth.ok) {
        return retrieveErrorJson(url, auth.status, {
          ok: false,
          error: "unauthorized",
          reason: auth.reason
        });
      }
      return handleRetrieveRepositoryNicknamesRequest(env);
    }

    return json(404, {
      ok: false,
      error: "not_found"
    });
  }
};

async function handleRetrieveConstitutionRequest(url, env) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return retrieveErrorJson(url, 503, {
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
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return retrieveErrorJson(url, 503, {
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
    return retrieveErrorJson(url, retrieved.status, {
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
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return retrieveErrorJson(url, 503, {
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
    return retrieveErrorJson(url, retrieved.status, {
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
  const provider = resolveMemoryProvider(env);
  const phase = normalize(url.searchParams.get("phase")) || "execution";
  const limit = normalizeLimit(url.searchParams.get("limit"), 5);
  const relatedIssue = normalizeIssue(url.searchParams.get("relatedIssue"));
  const issueNumber = normalizeIssue(url.searchParams.get("issueNumber"));
  const issueTitle = normalizeText(url.searchParams.get("issueTitle"));
  const issueUrl = normalizeText(url.searchParams.get("issueUrl"));
  const queryText =
    normalizeText(url.searchParams.get("text")) || normalizeText(url.searchParams.get("q"));
  const semanticEnabled = parseBooleanQueryParam(url.searchParams.get("semantic"));

  const retrieved = await retrieveCrossIssueMemoryIndex(provider, {
    phase,
    limit,
    relatedIssue,
    text: queryText,
    semanticRetrieval: {
      enabled: semanticEnabled,
      mode: semanticEnabled ? "assistive" : "disabled"
    },
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
    return retrieveErrorJson(url, retrieved.status ?? 503, {
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
    semanticRetrieval: retrieved.semanticRetrieval,
    primaryReference: retrieved.primaryReference,
    referencesBySource: retrieved.referencesBySource,
    orderedReferences: retrieved.orderedReferences
  });
}

async function handleRetrieveOperationalMemoryRequest(url, env) {
  const provider = resolveMemoryProvider(env);
  const limit = normalizeLimit(url.searchParams.get("limit"), 8);
  const queryText =
    normalizeText(url.searchParams.get("text")) || normalizeText(url.searchParams.get("q"));
  const repository = normalizeText(url.searchParams.get("repository"));
  const runtimeTruth = buildRetrieveRuntimeTruth(url);

  const retrieved = await retrieveOperationalMemory(provider, {
    text: queryText,
    repository,
    limit,
    runtimeTruth
  });
  if (!retrieved.ok) {
    return retrieveErrorJson(url, retrieved.status ?? 503, {
      ok: false,
      error: retrieved.error ?? "operational_memory_read_failed",
      reason: retrieved.reason
    });
  }

  return json(200, {
    ok: true,
    architecture: retrieved.architecture,
    queryText: retrieved.queryText,
    repository: retrieved.repository,
    runtimeTruth: retrieved.runtimeTruth,
    memoryUseRule: retrieved.memoryUseRule,
    compactContext: retrieved.compactContext,
    referencesByLayer: retrieved.referencesByLayer,
    retrievalSignals: retrieved.retrievalSignals
  });
}

async function handleRetrieveApprovalGrantRequest(url, env) {
  const provider = resolveMemoryProvider(env);
  await purgeExpiredPasskeyArtifacts(provider);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return retrieveErrorJson(url, 503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for approval grant retrieval"
    });
  }

  const approvalId = normalizeText(url.searchParams.get("approvalId"));
  if (!approvalId) {
    return retrieveErrorJson(url, 422, {
      ok: false,
      error: "approval_id_required",
      reason: "approvalId query parameter is required"
    });
  }

  const record = await findApprovalRecordById(provider, approvalId);
  if (!record || normalizeText(record?.content?.kind) !== "passkey_grant") {
    return retrieveErrorJson(url, 404, {
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

async function handleMemoryWriteRequest(request, env) {
  const payload = await readJson(request);
  const confirmed = payload?.confirmed === true || normalize(payload?.ownerConsent) === "go";
  if (!confirmed) {
    return json(422, {
      ok: false,
      error: "memory_write_confirmation_required",
      reason: "memory write requires Butler to show the structured memory candidate and receive GO"
    });
  }

  const memoryRecord = buildMemoryWriteRecord(payload);
  if (!memoryRecord.ok) {
    return json(422, {
      ok: false,
      error: "memory_write_request_invalid",
      reason: memoryRecord.reason,
      issues: memoryRecord.issues ?? []
    });
  }

  const safety = evaluateMemorySafety({
    recordType: memoryRecord.record.recordType,
    content: memoryRecord.record.content,
    metadata: {
      ...memoryRecord.record.metadata,
      tags: memoryRecord.record.tags
    }
  });
  if (!safety.ok) {
    return json(422, {
      ok: false,
      error: "memory_write_blocked",
      blockedByRule: safety.rule,
      reason: safety.reason,
      findings: safety.findings ?? []
    });
  }

  const provider = resolveMemoryProvider(env);
  const providerValidation = validateMemoryProvider(provider);
  if (!providerValidation.ok) {
    return json(503, {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for operational memory writes"
    });
  }

  const gatewayInput = {
    phase: normalizeText(payload.phase) || "execution",
    actorRole: normalizeText(payload.actorRole) || "butler",
    memoryRecord: {
      recordType: memoryRecord.record.recordType,
      content: memoryRecord.record.content,
      metadata: memoryRecord.record.metadata
    }
  };
  const gatewayResult = {
    repository: normalizeText(payload.repository) || null
  };

  if (memoryRecord.record.recordType === MemoryRecordType.DECISION_LOG) {
    const persisted = await appendDecisionLogFromGateway(provider, gatewayInput, gatewayResult);
    return memoryWriteResponse({ persisted, provider, relatedIssue: memoryRecord.relatedIssue });
  }

  if (memoryRecord.record.recordType === MemoryRecordType.PROPOSAL_LOG) {
    const persisted = await appendProposalLogFromGateway(provider, gatewayInput, gatewayResult);
    return memoryWriteResponse({ persisted, provider, relatedIssue: memoryRecord.relatedIssue });
  }

  const created = createMemoryRecord({
    id: makeOperationalMemoryRecordId(memoryRecord.record),
    type: memoryRecord.record.recordType,
    content: memoryRecord.record.content,
    metadata: memoryRecord.record.metadata,
    priority: memoryRecord.record.priority,
    tags: memoryRecord.record.tags,
    createdAt: memoryRecord.record.timestamp
  });
  if (!created.ok) {
    return json(422, {
      ok: false,
      error: "memory_record_invalid",
      reason: "memory record does not satisfy the shared memory schema",
      issues: created.issues
    });
  }

  const stored = await provider.store(created.record);
  if (!stored?.ok) {
    return json(503, {
      ok: false,
      error: "memory_write_failed",
      reason: "failed to persist operational memory",
      issues: Array.isArray(stored?.issues) ? stored.issues : []
    });
  }

  const postWriteRetrieval = await retrievePostWriteMemory({
    provider,
    relatedIssue: memoryRecord.relatedIssue
  });

  return json(200, {
    ok: true,
    memoryWritePersisted: {
      recordId: stored.record.id,
      recordType: stored.record.type,
      relatedIssue: memoryRecord.relatedIssue,
      timestamp: stored.record.createdAt
    },
    postWriteRetrieval
  });
}

async function memoryWriteResponse({ persisted, provider, relatedIssue }) {
  if (!persisted.ok) {
    return json(persisted.status ?? 503, {
      ok: false,
      error: persisted.error ?? "memory_write_failed",
      blockedByRule: persisted.blockedByRule ?? null,
      reason: persisted.reason,
      issues: persisted.issues ?? []
    });
  }

  const postWriteRetrieval = await retrievePostWriteMemory({ provider, relatedIssue });

  return json(200, {
    ok: true,
    memoryWritePersisted: {
      recordId: persisted.record.id,
      recordType: persisted.record.type,
      relatedIssue: persisted.entry.relatedIssue ?? relatedIssue ?? null,
      timestamp: persisted.entry.timestamp
    },
    postWriteRetrieval
  });
}

async function retrievePostWriteMemory({ provider, relatedIssue }) {
  if (!relatedIssue) {
    return null;
  }

  const retrieved = await retrieveCrossIssueMemoryIndex(provider, {
    phase: "execution",
    relatedIssue,
    limit: 5,
    displayMode: "short"
  });
  return retrieved.ok
    ? formatCrossRetrievalOutput(retrieved, "short")
    : { ok: false, error: retrieved.error, reason: retrieved.reason };
}

function buildMemoryWriteRecord(payload = {}) {
  const recordType = normalizeMemoryWriteRecordType(payload.recordType ?? payload.type);
  if (!recordType) {
    return {
      ok: false,
      reason: "recordType must be decision_log, proposal_log, working_memory, or repair_case",
      issues: ["recordType is required"]
    };
  }

  const relatedIssue = normalizeIssue(payload.relatedIssue);
  const repository = normalizeText(payload.repository) || null;
  const timestamp = normalizeText(payload.timestamp) || new Date().toISOString();
  const metadata = {
    ...normalizeObject(payload.metadata),
    relatedIssue,
    repository,
    source: "butler_memory_write_action",
    fullCasualChat: false
  };

  if (recordType === MemoryRecordType.DECISION_LOG) {
    return {
      ok: true,
      relatedIssue,
      record: {
        recordType,
        content: {
          decision: normalizeText(payload.decision ?? payload.summary),
          rationale: normalizeText(payload.rationale),
          relatedIssue,
          decidedBy: normalizeText(payload.decidedBy) || "butler_with_owner_go",
          timestamp,
          supersededBy: normalizeText(payload.supersededBy) || null
        },
        metadata,
        timestamp,
        priority: normalizeMemoryPriority(payload.priority, 90),
        tags: buildMemoryWriteTags({ recordType, relatedIssue, repository, extraTags: payload.tags })
      }
    };
  }

  if (recordType === MemoryRecordType.PROPOSAL_LOG) {
    return {
      ok: true,
      relatedIssue,
      record: {
        recordType,
        content: {
          hypothesis: normalizeText(payload.hypothesis ?? payload.summary),
          options: normalizeStringArray(payload.options),
          rejectedReasons: normalizeRejectedReasons(payload.rejectedReasons),
          concerns: normalizeStringArray(payload.concerns),
          unresolvedQuestions: normalizeStringArray(payload.unresolvedQuestions),
          relatedIssue,
          proposedBy: normalizeText(payload.proposedBy) || "butler_with_owner_go",
          timestamp
        },
        metadata,
        timestamp,
        priority: normalizeMemoryPriority(payload.priority, 80),
        tags: buildMemoryWriteTags({ recordType, relatedIssue, repository, extraTags: payload.tags })
      }
    };
  }

  const summary = normalizeText(payload.summary);
  if (!summary) {
    return {
      ok: false,
      reason: "summary is required for working_memory and repair_case",
      issues: ["summary is required"]
    };
  }

  return {
    ok: true,
    relatedIssue,
    record: {
      recordType,
      content: {
        summary,
        details: normalizeText(payload.details) || null,
        relatedIssue,
        repository,
        timestamp
      },
      metadata,
      timestamp,
      priority: normalizeMemoryPriority(payload.priority, recordType === MemoryRecordType.REPAIR_CASE ? 85 : 60),
      tags: buildMemoryWriteTags({ recordType, relatedIssue, repository, extraTags: payload.tags })
    }
  };
}

function normalizeMemoryWriteRecordType(value) {
  const type = normalize(value);
  if (
    [
      MemoryRecordType.DECISION_LOG,
      MemoryRecordType.PROPOSAL_LOG,
      MemoryRecordType.WORKING_MEMORY,
      MemoryRecordType.REPAIR_CASE
    ].includes(type)
  ) {
    return type;
  }
  return "";
}

function normalizeMemoryPriority(value, fallback) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function buildMemoryWriteTags({ recordType, relatedIssue, repository, extraTags }) {
  const tags = [
    recordType,
    relatedIssue ? `issue:${relatedIssue}` : null,
    repository ? `repo:${normalizeTag(repository.replace("/", "_"))}` : null,
    ...normalizeStringArray(extraTags)
  ].filter(Boolean);
  return [...new Set(tags)];
}

function normalizeStringArray(value) {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.map(normalizeText).filter(Boolean);
}

function normalizeRejectedReasons(value) {
  const values = Array.isArray(value) ? value : [];
  return values
    .map((item) => ({
      option: normalizeText(item?.option),
      reason: normalizeText(item?.reason)
    }))
    .filter((item) => item.option && item.reason);
}

function makeOperationalMemoryRecordId(record) {
  const issuePart = normalizeIssue(record.content?.relatedIssue) ?? "none";
  const timestampPart = normalizeText(record.timestamp).replace(/[^0-9]/g, "").slice(0, 14);
  const summaryPart = normalizeTag(record.content?.summary ?? record.recordType).slice(0, 40);
  return `${record.recordType}_${issuePart}_${timestampPart}_${summaryPart}`;
}

async function handleRetrieveGitHubReadPlaneRequest(url, env) {
  const retrieved = await retrieveGitHubReadPlane({
    resource: url.searchParams.get("resource"),
    repository: url.searchParams.get("repository"),
    issueNumber: url.searchParams.get("issueNumber"),
    pullNumber: url.searchParams.get("pullNumber"),
    branch: url.searchParams.get("branch"),
    ref: url.searchParams.get("ref"),
    state: url.searchParams.get("state"),
    limit: url.searchParams.get("limit"),
    env
  });

  if (!retrieved.ok) {
    return retrieveErrorJson(url, retrieved.status ?? 503, {
      ok: false,
      error: retrieved.error ?? "github_read_failed",
      reason: retrieved.reason,
      issues: retrieved.issues ?? []
    });
  }

  return json(200, {
    ok: true,
    read: retrieved.read
  });
}

async function handleRetrieveCustomGptSetupArtifactRequest(url, env) {
  const retrieved = await retrieveCustomGptSetupArtifact({
    artifact: normalizeText(url.searchParams.get("artifact")),
    repository: normalizeText(url.searchParams.get("repository")),
    ref: normalizeText(url.searchParams.get("ref")),
    env
  });

  if (!retrieved.ok) {
    return retrieveErrorJson(url, retrieved.status ?? 503, {
      ok: false,
      error: retrieved.error ?? "custom_gpt_setup_artifact_unavailable",
      reason: retrieved.reason,
      issues: retrieved.issues ?? []
    });
  }

  return json(200, {
    ok: true,
    artifact: retrieved.artifact
  });
}

function handleRetrieveCloudflarePagesRequest(url) {
  return json(200, buildVtddCloudflarePageDirectory({ runtimeOrigin: url.origin }));
}

async function handleRetrieveButlerSelfParityRequest(url, env) {
  const parity = await evaluateButlerSelfParity({
    repository: normalizeText(url.searchParams.get("repository")),
    ref: normalizeText(url.searchParams.get("ref")),
    issueNumber: normalizeIssue(url.searchParams.get("issueNumber")),
    runtimeOrigin: url.origin,
    env
  });

  if (!parity.ok) {
    return retrieveErrorJson(url, parity.status ?? 503, {
      ok: false,
      error: parity.error ?? "custom_gpt_self_parity_unavailable",
      reason: parity.reason
    });
  }

  return json(200, {
    ok: true,
    selfParity: parity.selfParity
  });
}

async function handleRetrieveRepositoryNicknamesRequest(env) {
  const provider = resolveMemoryProvider(env);
  const retrieved = await safeRetrieveStoredAliasRegistry(provider);
  if (!retrieved.ok) {
    return json(200, {
      ok: false,
      httpStatus: retrieved.status ?? 503,
      error: retrieved.error,
      reason: retrieved.reason,
      issues: retrieved.issues ?? [],
      recordType: MemoryRecordType.ALIAS_REGISTRY,
      recordCount: 0,
      aliasRegistry: []
    });
  }

  return json(200, {
    ok: true,
    recordType: MemoryRecordType.ALIAS_REGISTRY,
    recordCount: retrieved.aliasRegistry.length,
    aliasRegistry: retrieved.aliasRegistry
  });
}

async function handleMcpRequest({ request, env, url }) {
  const acceptHeader = normalize(request.headers.get("accept"));
  if (request.method === "GET" && !acceptHeader.includes("text/event-stream")) {
    return json(
      405,
      {
        ok: false,
        error: "mcp_post_required",
        reason: "VTDD MCP endpoint requires MCP JSON-RPC POST requests.",
        protectedResourceMetadataUrl: buildRuntimeUrl(
          url.origin,
          MCP_PROTECTED_RESOURCE_METADATA_MIRROR_PATH
        )
      },
      {
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
        allow: "POST"
      }
    );
  }
  const server = createVtddMcpServer({ env, runtimeOrigin: url.origin });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  await server.connect(transport);
  const response = await transport.handleRequest(normalizeMcpTransportRequest(request));
  return withMcpProtocolVersionHeader(response);
}

function normalizeMcpTransportRequest(request) {
  const headers = new Headers(request.headers);
  if (!normalizeText(headers.get("accept"))) {
    headers.set("accept", "application/json, text/event-stream");
  }
  if (!normalizeText(headers.get("mcp-protocol-version"))) {
    headers.set("mcp-protocol-version", MCP_PROTOCOL_VERSION);
  }
  return new Request(request, { headers });
}

function createVtddMcpServer({ env, runtimeOrigin }) {
  const server = new McpServer(MCP_SERVER_INFO, {
    instructions: MCP_INSTRUCTIONS
  });

  server.registerTool(
    "vtdd_runtime_truth",
    {
      description:
        "指定した repository / Issue / PR / branch の current runtime truth を返します。GitHub state が current truth です。",
      inputSchema: z.object({
        repository: z.string().min(1).describe("owner/repo 形式の repository。"),
        issueNumber: z.number().int().positive().optional().describe("対象 Issue 番号。"),
        pullNumber: z.number().int().positive().optional().describe("対象 Pull Request 番号。"),
        branch: z.string().optional().describe("対象 branch 名。"),
        includeChecks: z.boolean().optional().describe("check runs を含めるか。"),
        includeWorkflowRuns: z.boolean().optional().describe("workflow runs を含めるか。"),
        limit: z.number().int().positive().optional().describe("一覧系 read の最大件数。")
      })
    },
    async (args) => buildMcpToolResult(await executeMcpRuntimeTruth(args, env))
  );

  server.registerTool(
    "vtdd_review_truth",
    {
      description:
        "指定 PR の reviewer truth を返します。GitHub formal reviews、VTDD reviewer markers、blocking 状態、次の安全な action をまとめます。",
      inputSchema: z.object({
        repository: z.string().min(1).describe("owner/repo 形式の repository。"),
        pullNumber: z.number().int().positive().describe("対象 Pull Request 番号。")
      })
    },
    async (args) => buildMcpToolResult(await executeMcpReviewTruth(args, env))
  );

  server.registerTool(
    "vtdd_search_operational_memory",
    {
      description:
        "structured operational memory を検索します。runtime truth を currentState として添えると memory との差異も返せます。",
      inputSchema: z.object({
        text: z.string().min(1).describe("検索テキスト。"),
        repository: z.string().optional().describe("owner/repo 形式の repository。"),
        currentState: z.string().optional().describe("現在の runtime truth の短い説明。"),
        runtimeTruthSource: z.string().optional().describe("runtime truth source。"),
        checkedAt: z.string().optional().describe("runtime truth observed timestamp (ISO8601)."),
        limit: z.number().int().positive().optional().describe("返す compact context の最大件数。")
      })
    },
    async (args) => buildMcpToolResult(await executeMcpOperationalMemorySearch(args, env))
  );

  server.registerTool(
    "vtdd_recall_implementation",
    {
      description:
        "『あれどうやって実装したっけ？』に答えるための shared implementation recall を返します。",
      inputSchema: z.object({
        repository: z.string().min(1).describe("owner/repo 形式の repository。"),
        issueNumber: z.number().int().positive().optional().describe("関連 Issue 番号。"),
        pullNumber: z.number().int().positive().optional().describe("関連 Pull Request 番号。"),
        text: z.string().optional().describe("実装 recall の補助クエリ。"),
        limit: z.number().int().positive().optional().describe("memory references の最大件数。")
      })
    },
    async (args) => buildMcpToolResult(await executeMcpImplementationRecall(args, env))
  );

  server.registerTool(
    "vtdd_pr_status",
    {
      description:
        "指定 PR の state / checks / review truth を Butler と同じ runtime truth モデルで返します。",
      inputSchema: z.object({
        repository: z.string().min(1).describe("owner/repo 形式の repository。"),
        pullNumber: z.number().int().positive().describe("対象 Pull Request 番号。")
      })
    },
    async (args) => buildMcpToolResult(await executeMcpPrStatus(args, env))
  );

  server.registerTool(
    "vtdd_issue_status",
    {
      description: "指定 Issue の intent / body / memory references / blockers を返します。",
      inputSchema: z.object({
        repository: z.string().min(1).describe("owner/repo 形式の repository。"),
        issueNumber: z.number().int().positive().describe("対象 Issue 番号。"),
        limit: z.number().int().positive().optional().describe("memory references の最大件数。")
      })
    },
    async (args) => buildMcpToolResult(await executeMcpIssueStatus(args, env, runtimeOrigin))
  );

  return server;
}

function buildMcpToolResult(result) {
  if (!result.ok) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: false,
              error: result.error,
              reason: result.reason,
              issues: result.issues ?? []
            },
            null,
            2
          )
        }
      ],
      isError: true
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result.value, null, 2)
      }
    ],
    isError: false
  };
}

function withMcpProtocolVersionHeader(response) {
  if (normalizeText(response.headers.get("mcp-protocol-version"))) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("mcp-protocol-version", MCP_PROTOCOL_VERSION);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function executeMcpToolCall({ toolName, toolArguments, env, runtimeOrigin }) {
  if (toolName === "vtdd_runtime_truth") {
    return executeMcpRuntimeTruth(toolArguments, env);
  }
  if (toolName === "vtdd_review_truth") {
    return executeMcpReviewTruth(toolArguments, env);
  }
  if (toolName === "vtdd_search_operational_memory") {
    return executeMcpOperationalMemorySearch(toolArguments, env);
  }
  if (toolName === "vtdd_recall_implementation") {
    return executeMcpImplementationRecall(toolArguments, env);
  }
  if (toolName === "vtdd_pr_status") {
    return executeMcpPrStatus(toolArguments, env);
  }
  if (toolName === "vtdd_issue_status") {
    return executeMcpIssueStatus(toolArguments, env, runtimeOrigin);
  }
  return {
    ok: false,
    error: "mcp_tool_unknown",
    reason: `unknown MCP tool: ${toolName || "unknown"}`
  };
}

async function executeMcpRuntimeTruth(argumentsInput, env) {
  const repository = normalizeText(argumentsInput.repository);
  if (!repository) {
    return {
      ok: false,
      error: "repository_required",
      reason: "repository is required"
    };
  }

  const issueNumber = normalizeIssue(argumentsInput.issueNumber);
  const pullNumber = normalizeIssue(argumentsInput.pullNumber);
  const branch = normalizeText(argumentsInput.branch);
  const limit = normalizeLimit(argumentsInput.limit, 10);
  const includeChecks = argumentsInput.includeChecks !== false;
  const includeWorkflowRuns = argumentsInput.includeWorkflowRuns === true;

  const issue = issueNumber
    ? await readGitHubResource({
        resource: "issues",
        repository,
        issueNumber,
        env
      })
    : { ok: true, records: [] };
  if (!issue.ok) {
    return issue;
  }

  const pull = pullNumber
    ? await readGitHubResource({
        resource: "pulls",
        repository,
        pullNumber,
        env
      })
    : { ok: true, records: [] };
  if (!pull.ok) {
    return pull;
  }

  const activePull = pull.records?.[0] ?? null;
  const ref = branch || activePull?.headRef || "";
  const checks =
    includeChecks && ref
      ? await readGitHubResource({
          resource: "checks",
          repository,
          ref,
          limit,
          env
        })
      : { ok: true, records: [] };
  if (!checks.ok) {
    return checks;
  }

  const workflowRuns =
    includeWorkflowRuns && (branch || activePull?.headRef)
      ? await readGitHubResource({
          resource: "workflow_runs",
          repository,
          branch: branch || activePull?.headRef,
          limit,
          env
        })
      : { ok: true, records: [] };
  if (!workflowRuns.ok) {
    return workflowRuns;
  }

  const branches = branch
    ? await readGitHubResource({
        resource: "branches",
        repository,
        branch,
        env
      })
    : { ok: true, records: [] };
  if (!branches.ok) {
    return branches;
  }

  return {
    ok: true,
    value: {
      ok: true,
      repository,
      issue: issue.records?.[0] ?? null,
      pullRequest: activePull,
      checks: checks.records ?? [],
      workflowRuns: workflowRuns.records ?? [],
      branch: branches.records?.[0] ?? null,
      sourceOfTruth: "github_runtime_truth"
    }
  };
}

async function executeMcpReviewTruth(argumentsInput, env) {
  const repository = normalizeText(argumentsInput.repository);
  const pullNumber = normalizeIssue(argumentsInput.pullNumber);
  if (!repository || !pullNumber) {
    return {
      ok: false,
      error: "repository_and_pull_required",
      reason: "repository and pullNumber are required"
    };
  }

  const pull = await readGitHubResource({ resource: "pulls", repository, pullNumber, env });
  if (!pull.ok || !pull.records?.[0]) {
    return pull.ok
      ? {
          ok: false,
          error: "pull_not_found",
          reason: "pull request runtime truth was not found"
        }
      : pull;
  }

  const reviews = await readGitHubResource({
    resource: "pull_reviews",
    repository,
    pullNumber,
    env
  });
  if (!reviews.ok) {
    return reviews;
  }

  const issueComments = await readGitHubResource({
    resource: "issue_comments",
    repository,
    issueNumber: pullNumber,
    env
  });
  if (!issueComments.ok) {
    return issueComments;
  }

  const reviewComments = await readGitHubResource({
    resource: "pull_review_comments",
    repository,
    pullNumber,
    env
  });
  if (!reviewComments.ok) {
    return reviewComments;
  }

  const continuity = evaluateExecutionContinuity({
    mode: TaskMode.EXECUTION,
    actorRole: ActorRole.BUTLER,
    continuationContext: { requiresHandoff: false },
    runtimeTruth: {
      runtimeState: {
        activeBranch: pull.records[0].headRef,
        pullRequest: {
          ...pull.records[0],
          issueComments: issueComments.records ?? [],
          reviewComments: reviewComments.records ?? [],
          reviews: reviews.records ?? [],
          reviewCommentsCount: Array.isArray(reviewComments.records) ? reviewComments.records.length : 0,
          unresolvedReviewCommentsCount: Array.isArray(reviewComments.records)
            ? reviewComments.records.length
            : 0,
          reviewer: "gemini",
          updatedSinceReview: false
        }
      }
    }
  });

  if (!continuity.ok) {
    return {
      ok: false,
      error: continuity.rule ?? "review_truth_unavailable",
      reason: continuity.reason || "failed to build review truth"
    };
  }

  return {
    ok: true,
    value: {
      ok: true,
      repository,
      pullNumber,
      reviewTruth: continuity.value.reviewLoop,
      butlerReviewSynthesis: continuity.value.butlerReviewSynthesis,
      nextSuggestedActions: continuity.value.nextSuggestedActions,
      sourceOfTruth: continuity.value.sourceOfTruth
    }
  };
}

async function executeMcpOperationalMemorySearch(argumentsInput, env) {
  const text = normalizeText(argumentsInput.text);
  if (!text) {
    return {
      ok: false,
      error: "text_required",
      reason: "text is required"
    };
  }

  const query = new URLSearchParams();
  query.set("text", text);
  if (normalizeText(argumentsInput.repository)) {
    query.set("repository", normalizeText(argumentsInput.repository));
  }
  if (normalizeText(argumentsInput.currentState)) {
    query.set("currentState", normalizeText(argumentsInput.currentState));
  }
  if (normalizeText(argumentsInput.runtimeTruthSource)) {
    query.set("runtimeTruthSource", normalizeText(argumentsInput.runtimeTruthSource));
  }
  if (normalizeText(argumentsInput.checkedAt)) {
    query.set("checkedAt", normalizeText(argumentsInput.checkedAt));
  }
  if (normalizePositiveInteger(argumentsInput.limit)) {
    query.set("limit", String(normalizePositiveInteger(argumentsInput.limit)));
  }

  const response = await handleRetrieveOperationalMemoryRequest(
    new URL(`https://mcp.local${CANONICAL_API_PREFIX}/retrieve/operational-memory?${query.toString()}`),
    env
  );
  return responseToMcpToolResult(response);
}

async function executeMcpImplementationRecall(argumentsInput, env) {
  const repository = normalizeText(argumentsInput.repository);
  if (!repository) {
    return {
      ok: false,
      error: "repository_required",
      reason: "repository is required"
    };
  }

  const issueNumber = normalizeIssue(argumentsInput.issueNumber);
  const pullNumber = normalizeIssue(argumentsInput.pullNumber);
  const text = normalizeText(argumentsInput.text);
  const limit = normalizeLimit(argumentsInput.limit, 8);

  const decisionLogs = issueNumber
    ? await readDecisionLogReferences({ env, relatedIssue: issueNumber, limit: 5 })
    : { ok: true, references: [] };
  if (!decisionLogs.ok) {
    return decisionLogs;
  }

  const proposalLogs = issueNumber
    ? await readProposalLogReferences({ env, relatedIssue: issueNumber, limit: 5 })
    : { ok: true, references: [] };
  if (!proposalLogs.ok) {
    return proposalLogs;
  }

  const cross = issueNumber
    ? await readCrossIssueMemory({
        env,
        relatedIssue: issueNumber,
        issueNumber,
        text,
        limit
      })
    : { ok: true, body: null };
  if (!cross.ok) {
    return cross;
  }

  const issue = issueNumber
    ? await readGitHubResource({ resource: "issues", repository, issueNumber, env })
    : { ok: true, records: [] };
  if (!issue.ok) {
    return issue;
  }

  const pull = pullNumber
    ? await readGitHubResource({ resource: "pulls", repository, pullNumber, env })
    : { ok: true, records: [] };
  if (!pull.ok) {
    return pull;
  }

  const pullRecord = pull.records?.[0] ?? null;
  const runtimeStatus = pullRecord
    ? pullRecord.merged
      ? "merged"
      : pullRecord.state === "open"
        ? "open_pr"
        : "unknown"
    : "unknown";

  return {
    ok: true,
    value: {
      repository,
      issueNumber: issueNumber ?? null,
      pullNumber: pullNumber ?? null,
      commits: [pullRecord?.headSha, pullRecord?.mergeCommitSha].filter(Boolean),
      files: [],
      tests: [],
      evidence: [
        ...(cross.body?.orderedReferences ?? []).map((item) => item?.url || item?.id).filter(Boolean),
        pullRecord?.htmlUrl
      ].filter(Boolean),
      decisions: (decisionLogs.references ?? []).map((item) => item.summary || item.id).filter(Boolean),
      reviewerResolutions: (proposalLogs.references ?? []).map((item) => item.summary || item.id).filter(Boolean),
      runtimeStatus,
      relatedIssue: issue.records?.[0] ?? null,
      relatedPullRequest: pullRecord,
      memoryReferences: cross.body?.orderedReferences ?? []
    }
  };
}

async function executeMcpPrStatus(argumentsInput, env) {
  const repository = normalizeText(argumentsInput.repository);
  const pullNumber = normalizeIssue(argumentsInput.pullNumber);
  if (!repository || !pullNumber) {
    return {
      ok: false,
      error: "repository_and_pull_required",
      reason: "repository and pullNumber are required"
    };
  }

  const runtimeTruth = await executeMcpRuntimeTruth(
    {
      repository,
      pullNumber,
      includeChecks: true,
      includeWorkflowRuns: true
    },
    env
  );
  if (!runtimeTruth.ok) {
    return runtimeTruth;
  }

  const reviewTruth = await executeMcpReviewTruth({ repository, pullNumber }, env);
  if (!reviewTruth.ok) {
    return reviewTruth;
  }

  return {
    ok: true,
    value: {
      ok: true,
      repository,
      pullNumber,
      runtimeTruth: runtimeTruth.value,
      reviewTruth: reviewTruth.value.reviewTruth,
      butlerReviewSynthesis: reviewTruth.value.butlerReviewSynthesis,
      nextSuggestedActions: reviewTruth.value.nextSuggestedActions
    }
  };
}

async function executeMcpIssueStatus(argumentsInput, env, runtimeOrigin) {
  const repository = normalizeText(argumentsInput.repository);
  const issueNumber = normalizeIssue(argumentsInput.issueNumber);
  if (!repository || !issueNumber) {
    return {
      ok: false,
      error: "repository_and_issue_required",
      reason: "repository and issueNumber are required"
    };
  }

  const issue = await readGitHubResource({ resource: "issues", repository, issueNumber, env });
  if (!issue.ok) {
    return issue;
  }

  const cross = await readCrossIssueMemory({
    env,
    relatedIssue: issueNumber,
    issueNumber,
    limit: normalizeLimit(argumentsInput.limit, 8)
  });
  if (!cross.ok) {
    return cross;
  }

  return {
    ok: true,
    value: {
      ok: true,
      repository,
      issueNumber,
      issue: issue.records?.[0] ?? null,
      blockers: (cross.body?.orderedReferences ?? []).map((item) => item.summary || item.id).filter(Boolean),
      memoryReferences: cross.body?.orderedReferences ?? [],
      runtimeOrigin
    }
  };
}

async function readGitHubResource(input) {
  const retrieved = await retrieveGitHubReadPlane({
    ...input,
    env: input.env
  });
  if (!retrieved.ok) {
    return {
      ok: false,
      error: retrieved.error ?? "github_read_failed",
      reason: retrieved.reason,
      issues: retrieved.issues ?? []
    };
  }
  return {
    ok: true,
    records: Array.isArray(retrieved.read?.records) ? retrieved.read.records : []
  };
}

async function readDecisionLogReferences({ env, relatedIssue, limit }) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for decision log retrieval"
    };
  }
  const retrieved = await retrieveDecisionLogReferences(provider, { relatedIssue, limit });
  if (!retrieved.ok) {
    return {
      ok: false,
      error: retrieved.error ?? "memory_read_failed",
      reason: retrieved.reason
    };
  }
  return {
    ok: true,
    references: retrieved.references
  };
}

async function readProposalLogReferences({ env, relatedIssue, limit }) {
  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return {
      ok: false,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for proposal log retrieval"
    };
  }
  const retrieved = await retrieveProposalLogReferences(provider, { relatedIssue, limit });
  if (!retrieved.ok) {
    return {
      ok: false,
      error: retrieved.error ?? "memory_read_failed",
      reason: retrieved.reason
    };
  }
  return {
    ok: true,
    references: retrieved.references
  };
}

async function readCrossIssueMemory({ env, relatedIssue, issueNumber, text, limit }) {
  const provider = resolveMemoryProvider(env);
  const retrieved = await retrieveCrossIssueMemoryIndex(provider, {
    phase: "execution",
    relatedIssue,
    limit,
    text: normalizeText(text) || null,
    semanticRetrieval: {
      enabled: Boolean(normalizeText(text)),
      mode: normalizeText(text) ? "assistive" : "disabled"
    },
    issueContext: issueNumber
      ? {
          issueNumber,
          issueTitle: null,
          issueUrl: null
        }
      : null
  });
  if (!retrieved.ok) {
    return {
      ok: false,
      error: retrieved.error ?? "memory_read_failed",
      reason: retrieved.reason
    };
  }
  return {
    ok: true,
    body: {
      retrievalPlan: retrieved.retrievalPlan,
      relatedIssue: retrieved.relatedIssue,
      queryText: retrieved.queryText,
      primaryReference: retrieved.primaryReference,
      orderedReferences: retrieved.orderedReferences
    }
  };
}

async function responseToMcpToolResult(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    return {
      ok: false,
      error: body?.error ?? "mcp_tool_failed",
      reason: body?.reason ?? `request failed with status ${response.status}`,
      issues: body?.issues ?? []
    };
  }
  return {
    ok: true,
    value: body
  };
}

function mcpJsonResponse(status, body, protocolVersion = MCP_PROTOCOL_VERSION) {
  return json(status, body, {
    "mcp-protocol-version": protocolVersion
  });
}

function mcpResultResponse(id, result, protocolVersion = MCP_PROTOCOL_VERSION) {
  return mcpJsonResponse(200, {
    jsonrpc: "2.0",
    id,
    result
  }, protocolVersion);
}

function mcpErrorResponse(id, code, message, protocolVersion = MCP_PROTOCOL_VERSION) {
  return mcpJsonResponse(200, {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  }, protocolVersion);
}

function buildMcpProtectedResourceMetadata(url) {
  const resource = buildRuntimeUrl(url.origin, MCP_PATH);
  return {
    resource,
    resource_name: "VTDD MCP",
    resource_documentation: buildRuntimeUrl(url.origin, "/help#paths"),
    bearer_methods_supported: ["header"],
    scopes_supported: ["vtdd:mcp:read"]
  };
}

function buildMcpUnauthorizedHeaders(url, baseHeaders = {}) {
  return {
    ...baseHeaders,
    "www-authenticate": `Bearer realm="vtdd-mcp", resource_metadata="${buildRuntimeUrl(
      url.origin,
      MCP_PROTECTED_RESOURCE_METADATA_MIRROR_PATH
    )}"`,
    "mcp-protocol-version": MCP_PROTOCOL_VERSION
  };
}

function buildRuntimeUrl(origin, path) {
  try {
    return new URL(path, `${origin}/`).href;
  } catch {
    return path;
  }
}

async function safeRetrieveStoredAliasRegistry(provider) {
  try {
    return await retrieveStoredAliasRegistry(provider);
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: "repository_nickname_retrieval_failed",
      reason: error instanceof Error ? error.message : String(error),
      issues: ["repository_nickname_retrieval_exception"]
    };
  }
}

async function handleGitHubWritePlaneRequest(request, env) {
  const payload = await readJson(request);
  if (!payload || typeof payload !== "object") {
    return json(422, {
      ok: false,
      error: "request_body_required",
      reason: "valid JSON request body is required"
    });
  }

  const policyInput =
    payload.policyInput && typeof payload.policyInput === "object" ? payload.policyInput : {};
  const boundPolicyInput = bindNaturalGitHubWriteApproval({ payload, policyInput });
  const issueContext =
    payload.issueContext && typeof payload.issueContext === "object" ? payload.issueContext : {};

  const executed = await executeGitHubWritePlane({
    operation: payload.operation,
    repository: payload.repository,
    issueNumber: payload.issueNumber ?? issueContext.issueNumber,
    pullNumber: payload.pullNumber,
    commentId: payload.commentId,
    branch: payload.branch,
    baseRef: payload.baseRef,
    head: payload.head,
    title: payload.title,
    body: payload.body,
    approvalPhrase: boundPolicyInput.approvalPhrase,
    targetConfirmed: boundPolicyInput.targetConfirmed,
    approvalScopeMatched: boundPolicyInput.approvalScopeMatched,
    env
  });

  if (!executed.ok) {
    const httpStatus = executed.status ?? 503;
    if (wantsActionVisibleGitHubWriteErrors(payload)) {
      return json(200, {
        ok: false,
        httpStatus,
        error: executed.error ?? "github_write_failed",
        reason: executed.reason,
        issues: executed.issues ?? [],
        diagnostics: executed.diagnostics ?? null
      });
    }
    return json(httpStatus, {
      ok: false,
      error: executed.error ?? "github_write_failed",
      reason: executed.reason,
      issues: executed.issues ?? [],
      diagnostics: executed.diagnostics ?? null
    });
  }

  return json(200, {
    ok: true,
    write: executed.write
  });
}

function wantsActionVisibleGitHubWriteErrors(payload) {
  const responseMode = normalizeText(payload?.responseMode);
  return responseMode === "action_visible";
}

function retrieveErrorJson(url, status, body = {}) {
  if (!wantsActionVisibleRetrieveErrors(url)) {
    return json(status, body);
  }

  return json(200, {
    ok: false,
    httpStatus: status,
    error: normalizeText(body.error) || "retrieve_failed",
    reason: normalizeText(body.reason) || null,
    issues: Array.isArray(body.issues) ? body.issues : [],
    diagnostics: {
      route: normalizeText(url?.pathname) || null,
      responseMode: "action_visible",
      rootCause:
        "Custom GPT Action test screen can surface non-2xx retrieve responses as ClientResponseError; this envelope preserves error/reason/issues for debugging."
    }
  });
}

function wantsActionVisibleRetrieveErrors(url) {
  const responseMode = normalizeText(url?.searchParams?.get("responseMode"));
  return responseMode === "action_visible";
}

function validateConsistentIssueScope({ payload, issueContext }) {
  const payloadIssueNumber = normalizePositiveInteger(payload?.issueNumber);
  const contextIssueNumber = normalizePositiveInteger(issueContext?.issueNumber);
  if (payloadIssueNumber && contextIssueNumber && payloadIssueNumber !== contextIssueNumber) {
    return {
      ok: false,
      issues: ["issueNumber conflicts with issueContext.issueNumber"]
    };
  }
  return { ok: true, issues: [] };
}

async function handleGitHubHighRiskPlaneRequest(request, env) {
  const payload = await readJson(request);
  if (!payload || typeof payload !== "object") {
    return json(422, {
      ok: false,
      error: "request_body_required",
      reason: "valid JSON request body is required"
    });
  }

  const policyInput =
    payload.policyInput && typeof payload.policyInput === "object" ? payload.policyInput : {};
  const issueContext =
    payload.issueContext && typeof payload.issueContext === "object" ? payload.issueContext : {};
  const issueScopeValidation = validateConsistentIssueScope({ payload, issueContext });
  if (!issueScopeValidation.ok) {
    return json(422, {
      ok: false,
      error: "github_authority_scope_invalid",
      reason: issueScopeValidation.issues.join(", "),
      issues: issueScopeValidation.issues
    });
  }
  const operation = normalizeText(payload.operation);
  const repository = normalizeText(payload.repository);
  const scopedIssueNumber = issueContext.issueNumber ?? payload.issueNumber ?? null;
  const phase = normalizeText(payload.phase) || "execution";
  const highRiskKind = operation;
  const actionType = mapGitHubHighRiskOperationToActionType(operation);
  const approvalScope = buildApprovalScopeSnapshot({
    payload: {
      phase,
      highRiskKind,
      repositoryInput: repository,
      issueNumber: scopedIssueNumber,
      pullNumber: payload.pullNumber,
      issueContext
    },
    policyInput: {
      ...policyInput,
      actionType,
      repositoryInput: repository,
      highRiskKind,
      issueTraceability: {
        relatedIssue: issueContext.issueNumber ?? payload.issueNumber ?? null
      }
    }
  });
  const resolvedApprovalGrant = await resolveApprovalGrant({
    payload: {
      phase,
      highRiskKind,
      repositoryInput: repository,
      issueNumber: scopedIssueNumber,
      pullNumber: payload.pullNumber,
      issueContext
    },
    policyInput: {
      ...policyInput,
      actionType,
      repositoryInput: repository,
      highRiskKind,
      issueTraceability: {
        relatedIssue: issueContext.issueNumber ?? payload.issueNumber ?? null
      }
    },
    env
  });

  const executed = await executeGitHubHighRiskPlane({
    operation,
    repository,
    issueNumber: scopedIssueNumber,
    pullNumber: payload.pullNumber,
    mergeMethod: payload.mergeMethod,
    commitTitle: payload.commitTitle,
    commitMessage: payload.commitMessage,
    approvalPhrase: policyInput.approvalPhrase,
    targetConfirmed: policyInput.targetConfirmed,
    approvalGrant: resolvedApprovalGrant.approvalGrant,
    approvalScope,
    env
  });

  if (!executed.ok) {
    return json(executed.status ?? 503, {
      ok: false,
      error: executed.error ?? "github_high_risk_failed",
      reason: executed.reason,
      issues: executed.issues ?? [],
      diagnostics: executed.diagnostics ?? null
    });
  }

  return json(200, {
    ok: true,
    authorityAction: executed.authorityAction
  });
}

async function handleDeployProductionRequest(request, env) {
  const payload = await readJson(request);
  if (!payload || typeof payload !== "object") {
    return json(422, {
      ok: false,
      error: "request_body_required",
      reason: "valid JSON request body is required"
    });
  }

  const policyInput =
    payload.policyInput && typeof payload.policyInput === "object" ? payload.policyInput : {};
  const resolvedApprovalGrant = await resolveApprovalGrant({
    payload: {
      phase: normalizeText(payload.phase) || "execution",
      highRiskKind: "deploy_production",
      repositoryInput: payload.repository
    },
    policyInput: {
      ...policyInput,
      actionType: "deploy_production",
      repositoryInput: payload.repository,
      highRiskKind: "deploy_production"
    },
    env
  });

  const executed = await executeDeployProductionPlane({
    repository: payload.repository,
    runtimeUrl: payload.runtimeUrl || new URL(request.url).origin,
    approvalPhrase: policyInput.approvalPhrase,
    approvalGrantId: policyInput.approvalGrantId,
    approvalGrant: payload.approvalGrant ?? policyInput.approvalGrant ?? resolvedApprovalGrant.approvalGrant,
    env
  });

  if (!executed.ok) {
    return json(executed.status ?? 503, {
      ok: false,
      error: executed.error ?? "deploy_failed",
      reason: executed.reason,
      issues: executed.issues ?? [],
      deploy: executed.deploy
    });
  }

  return json(202, {
    ok: true,
    warning: executed.warning ?? undefined,
    reason: executed.reason ?? undefined,
    deploy: executed.deploy
  });
}

async function handleGitHubActionsSecretSyncRequest(request, env) {
  const payload = await readJson(request);
  if (!payload || typeof payload !== "object") {
    return json(422, {
      ok: false,
      error: "request_body_required",
      reason: "valid JSON request body is required"
    });
  }

  const policyInput =
    payload.policyInput && typeof payload.policyInput === "object" ? payload.policyInput : {};
  const resolvedApprovalGrant = await resolveApprovalGrant({
    payload: {
      phase: normalizeText(payload.phase) || "execution",
      highRiskKind: "github_actions_secret_sync",
      repositoryInput: payload.repository
    },
    policyInput: {
      ...policyInput,
      actionType: "destructive",
      repositoryInput: payload.repository,
      highRiskKind: "github_actions_secret_sync"
    },
    env
  });

  const executed = await executeGitHubActionsSecretSync({
    repository: payload.repository,
    secretName: payload.secretName,
    secretValue: payload.secretValue,
    approvalGrant:
      payload.approvalGrant ?? policyInput.approvalGrant ?? resolvedApprovalGrant.approvalGrant,
    env
  }).catch((error) => ({
    ok: false,
    status: 503,
    error: "github_actions_secret_sync_exception",
    reason: sanitizeGitHubActionsSecretSyncErrorMessage(error)
  }));

  if (!executed.ok) {
    return json(executed.status ?? 503, {
      ok: false,
      error: executed.error ?? "github_actions_secret_sync_failed",
      reason: executed.reason,
      issues: executed.issues ?? []
    });
  }

  return json(200, {
    ok: true,
    secretSync: executed.secretSync
  });
}

async function handleCustomGptRecoveryPageRequest(url, env) {
  const channel =
    url.pathname === "/setup/known-good"
      ? CustomGptSetupChannel.KNOWN_GOOD
      : CustomGptSetupChannel.LATEST;
  const ref = normalizeText(url.searchParams.get("ref")) || "main";
  const issueNumber = normalizeIssue(url.searchParams.get("issueNumber"));

  const bundle = await buildCustomGptRecoveryBundle({
    channel,
    ref,
    issueNumber,
    runtimeOrigin: url.origin,
    env
  });

  return html(
    200,
    renderCustomGptRecoveryPage({
      runtimeOrigin: url.origin,
      channel,
      ref,
      issueNumber,
      recovery: bundle.ok ? bundle.recovery : null,
      error: bundle.ok
        ? null
        : {
            error: bundle.error,
            reason: bundle.reason,
            issues: bundle.issues ?? []
          }
    })
  );
}

function handlePasskeyOperatorPageRequest(request) {
  const url = new URL(request.url);
  const syncApiBase = normalizeOptionalHttpUrl(url.searchParams.get("syncApiBase"));
  const syncEnabled = Boolean(syncApiBase);
  const requestedActionType = url.searchParams.get("actionType");
  const requestedHighRiskKind = url.searchParams.get("highRiskKind");
  const html = renderPasskeyOperatorPage({
    origin: url.origin,
    syncApiBase,
    operatorMode: url.searchParams.get("mode") || (requestedActionType || requestedHighRiskKind ? "" : "full"),
    repositoryInput: url.searchParams.get("repositoryInput"),
    issueNumber: url.searchParams.get("issueNumber"),
    pullNumber: url.searchParams.get("pullNumber"),
    phase: url.searchParams.get("phase") || "execution",
    actionType: requestedActionType,
    highRiskKind: requestedHighRiskKind,
    mergeMethod: url.searchParams.get("mergeMethod") || "squash",
    returnUrl: normalizeOperatorReturnUrl(url.searchParams.get("returnUrl")),
    operatorId: url.searchParams.get("operatorId") || "vtdd-operator",
    operatorLabel: url.searchParams.get("operatorLabel") || "VTDD Operator",
    syncEnabled,
    syncMessage: syncEnabled
      ? "approvalGrantId が取得済みなら実行できます。desktop helper bridge に接続します。"
      : "desktop maintenance required: local secret sync bridge が未接続です。"
  });

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}

function normalizeOptionalHttpUrl(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function normalizeOperatorReturnUrl(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    if (url.protocol !== "https:") {
      return "";
    }
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "chatgpt.com" && hostname !== "chat.openai.com") {
      return "";
    }
    return url.href;
  } catch {
    return "";
  }
}

async function prepareGatewayPayload({ payload, env, allowRemoteCodexHandoffNormalization = false }) {
  const basePayload = payload && typeof payload === "object" ? payload : {};
  const basePolicyInput =
    basePayload.policyInput && typeof basePayload.policyInput === "object"
      ? basePayload.policyInput
      : {};
  const normalizedPayload = normalizeButlerReadConsentPayload(
    allowRemoteCodexHandoffNormalization
      ? normalizeRemoteCodexHandoffPayload(basePayload)
      : basePayload
  );
  const normalizedPolicyInput =
    normalizedPayload.policyInput && typeof normalizedPayload.policyInput === "object"
      ? normalizedPayload.policyInput
      : {};
  const runtimeAutonomyMode = resolveRuntimeAutonomyMode(env);
  const requestedAutonomyMode = normalizeAutonomyMode(normalizedPolicyInput.autonomyMode);
  const effectiveAutonomyMode =
    runtimeAutonomyMode === AutonomyMode.GUARDED_ABSENCE
      ? AutonomyMode.GUARDED_ABSENCE
      : requestedAutonomyMode;

  const runtimeAliasResolution = await resolveRuntimeAliasRegistry({
    baseAliasRegistry: normalizedPolicyInput.aliasRegistry,
    env
  });
  const combinedAliasRegistry = runtimeAliasResolution.aliasRegistry;
  const resolvedAliasRegistry = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: {
      ...normalizedPolicyInput,
      aliasRegistry: combinedAliasRegistry
    },
    env
  });
  const warnings = [
    ...(runtimeAliasResolution.warnings ?? []),
    ...(resolvedAliasRegistry.warnings ?? [])
  ];
  if (
    runtimeAutonomyMode === AutonomyMode.GUARDED_ABSENCE &&
    requestedAutonomyMode !== AutonomyMode.GUARDED_ABSENCE
  ) {
    warnings.push("runtime forces guarded absence mode; payload autonomyMode override was ignored");
  }

  const runtimeTruthResolution = allowRemoteCodexHandoffNormalization
    ? await resolveRemoteCodexHandoffRuntimeTruth({
        payload: normalizedPayload,
        policyInput: normalizedPolicyInput,
        aliasRegistry: resolvedAliasRegistry.aliasRegistry,
        env
      })
    : { policyInput: normalizedPolicyInput, warnings: [] };
  warnings.push(...(runtimeTruthResolution.warnings ?? []));
  const policyInputWithRuntimeTruth = runtimeTruthResolution.policyInput;

  const resolvedApprovalGrant = await resolveApprovalGrant({
    payload: normalizedPayload,
    policyInput: policyInputWithRuntimeTruth,
    env
  });
  if (resolvedApprovalGrant.warning) {
    warnings.push(resolvedApprovalGrant.warning);
  }

  return {
    payload: {
      ...normalizedPayload,
      policyInput: {
        ...policyInputWithRuntimeTruth,
        aliasRegistry: resolvedAliasRegistry.aliasRegistry,
        autonomyMode: effectiveAutonomyMode,
        approvalGrant: resolvedApprovalGrant.approvalGrant,
        approvalScope: buildApprovalScopeSnapshot({
          payload: normalizedPayload,
          policyInput: policyInputWithRuntimeTruth
        })
      }
    },
    warnings
  };
}

async function resolveRemoteCodexHandoffRuntimeTruth({
  payload,
  policyInput,
  aliasRegistry,
  env
}) {
  const actionType = normalize(policyInput.actionType);
  const actorRole = normalize(payload?.actorRole);
  if (actorRole !== "butler" || actionType !== "build") {
    return { policyInput, warnings: [] };
  }

  const runtimeTruth =
    policyInput.runtimeTruth && typeof policyInput.runtimeTruth === "object"
      ? policyInput.runtimeTruth
      : {};
  const runtimeState =
    runtimeTruth.runtimeState && typeof runtimeTruth.runtimeState === "object"
      ? runtimeTruth.runtimeState
      : {};
  if (runtimeTruth.runtimeAvailable === true && Object.keys(runtimeState).length > 0) {
    return { policyInput, warnings: [] };
  }

  const repositoryResolution = resolveRepositoryTarget({
    input: policyInput.repositoryInput,
    mode: policyInput.mode,
    aliasRegistry
  });
  if (!repositoryResolution.resolved) {
    return { policyInput, warnings: [] };
  }

  const issueNumber = normalizeIssue(payload?.issueContext?.issueNumber);
  const continuationContext =
    payload?.continuationContext && typeof payload.continuationContext === "object"
      ? payload.continuationContext
      : {};
  const handoff =
    continuationContext.handoff && typeof continuationContext.handoff === "object"
      ? continuationContext.handoff
      : {};
  const handoffTarget =
    handoff.targetPullRequest && typeof handoff.targetPullRequest === "object"
      ? handoff.targetPullRequest
      : {};
  const activeBranch =
    normalizeText(runtimeState.activeBranch) ||
    normalizeText(handoff.headRef) ||
    normalizeText(handoffTarget.headRef) ||
    normalizeText(handoffTarget.head?.ref) ||
    normalizeText(payload?.executionTarget?.branch) ||
    (issueNumber ? `codex/issue-${issueNumber}` : "");
  const [repositoryOwner] = repositoryResolution.repository.split("/");
  const [pulls, branches, workflowRuns] = await Promise.all([
    retrieveGitHubReadPlane({
      resource: "pulls",
      repository: repositoryResolution.repository,
      state: "all",
      head: `${repositoryOwner}:${activeBranch}`,
      limit: 10,
      env
    }),
    retrieveGitHubReadPlane({
      resource: "branches",
      repository: repositoryResolution.repository,
      branch: activeBranch,
      limit: 1,
      env
    }),
    retrieveGitHubReadPlane({
      resource: "workflow_runs",
      repository: repositoryResolution.repository,
      branch: activeBranch,
      limit: 10,
      env
    })
  ]);

  if (!pulls.ok || !branches.ok || !workflowRuns.ok) {
    return {
      policyInput,
      warnings: ["remote Codex handoff runtime truth read was unavailable"]
    };
  }

  const pullRequest = selectPullRequestForBranch(pulls.read?.records, {
    branch: activeBranch,
    owner: repositoryOwner
  });
  const branchRecord = Array.isArray(branches.read?.records) ? branches.read.records[0] : null;
  return {
    policyInput: {
      ...policyInput,
      runtimeTruth: {
        ...runtimeTruth,
        runtimeAvailable: true,
        runtimeState: {
          ...runtimeState,
          activeBranch,
          branch: branchRecord ?? null,
          pullRequest: pullRequest.pullRequest ?? { exists: false },
          staleBranchAmbiguity: pullRequest.staleBranchAmbiguity ?? null,
          workflowRuns: workflowRuns.read?.records ?? []
        }
      }
    },
    warnings: []
  };
}

function selectPullRequestForBranch(records, target) {
  const items = Array.isArray(records) ? records : [];
  const branch = normalizeText(target?.branch);
  const owner = normalizeText(target?.owner);
  const selected = items.find(
    (item) =>
      normalizeText(item?.state) === "open" &&
      normalizeText(item?.headRef) === branch &&
      normalizeText(item?.headOwner) === owner
  );
  const staleItems = items.filter(
    (item) => normalizeText(item?.headRef) === branch && normalizeText(item?.headOwner) === owner
  );
  if (!selected) {
    return {
      pullRequest: { exists: false },
      staleBranchAmbiguity:
        staleItems.length > 0
          ? {
              error: "stale_branch_pr_ambiguity",
              reason:
                "target branch is associated only with non-open pull requests; revise_pr must not target this branch without a fresh open PR lock",
              pullRequests: staleItems.map((item) => ({
                number: item.number ?? null,
                url: item.htmlUrl ?? null,
                state: item.state ?? null,
                title: item.title ?? null,
                headRef: item.headRef ?? null,
                headSha: item.headSha ?? null,
                baseRef: item.baseRef ?? null
              }))
            }
          : null
    };
  }
  return {
    pullRequest: {
      exists: true,
      number: selected.number ?? null,
      url: selected.htmlUrl ?? null,
      state: selected.state ?? null,
      title: selected.title ?? null,
      headRef: selected.headRef ?? null,
      headSha: selected.headSha ?? null,
      baseRef: selected.baseRef ?? null
    },
    staleBranchAmbiguity: null
  };
}

function normalizeButlerReadConsentPayload(payload) {
  const policyInput =
    payload?.policyInput && typeof payload.policyInput === "object" ? payload.policyInput : {};
  const actionType = normalize(policyInput.actionType);
  const actorRole = normalize(payload?.actorRole);
  if (actorRole !== "butler" || (actionType !== "read" && actionType !== "summarize")) {
    return payload;
  }

  const consent =
    policyInput.consent && typeof policyInput.consent === "object" ? policyInput.consent : {};
  const consentWasProvided = policyInput.consent && typeof policyInput.consent === "object";
  const grantedCategories = Array.isArray(consent.grantedCategories)
    ? consent.grantedCategories
    : [];
  if (consentWasProvided && grantedCategories.length > 0) {
    return payload;
  }

  return {
    ...payload,
    policyInput: {
      ...policyInput,
      consent: {
        ...consent,
        grantedCategories: mergeGrantedConsentCategories(grantedCategories, ["read"])
      }
    }
  };
}

function normalizeRemoteCodexHandoffPayload(payload) {
  const policyInput =
    payload?.policyInput && typeof payload.policyInput === "object" ? payload.policyInput : {};
  const actionType = normalizeText(policyInput.actionType);
  const actorRole = normalizeText(payload?.actorRole);
  const issueNumber = normalizeIssue(payload?.issueContext?.issueNumber);
  if (actorRole !== "butler" || actionType !== "build" || !issueNumber) {
    return payload;
  }

  const continuationContext =
    payload?.continuationContext && typeof payload.continuationContext === "object"
      ? payload.continuationContext
      : {};
  const handoff =
    continuationContext.handoff && typeof continuationContext.handoff === "object"
      ? continuationContext.handoff
      : {};
  const issueTraceability =
    policyInput.issueTraceability && typeof policyInput.issueTraceability === "object"
      ? policyInput.issueTraceability
      : {};
  const consent =
    policyInput.consent && typeof policyInput.consent === "object" ? policyInput.consent : {};
  const grantedCategories = Array.isArray(consent.grantedCategories)
    ? consent.grantedCategories
    : [];
  const goGranted = policyInput.go === true;
  const normalizedGrantedCategories = goGranted
    ? mergeGrantedConsentCategories(grantedCategories, ["read", "propose", "execute"])
    : grantedCategories;
  const requestedExecutorTransport = normalizeText(
    payload?.executorTransport ?? continuationContext.executorTransport
  );
  const apiKeyRunnerAcknowledged =
    payload?.apiKeyRunnerAcknowledged === true ||
    continuationContext.apiKeyRunnerAcknowledged === true ||
    (goGranted && requestedExecutorTransport === "api_key_runner");

  return {
    ...payload,
    apiKeyRunnerAcknowledged,
    continuationContext: {
      ...continuationContext,
      requiresHandoff: true,
      apiKeyRunnerAcknowledged,
      handoff: {
        ...handoff,
        issueTraceable: handoff.issueTraceable === false ? false : true,
        approvalScopeMatched: handoff.approvalScopeMatched === false ? false : true,
        relatedIssue: normalizeIssue(handoff.relatedIssue) ?? issueNumber,
        summary:
          normalizeText(handoff.summary) ||
          `Issue #${issueNumber} bounded remote Codex handoff`
      }
    },
    policyInput: {
      ...policyInput,
      issueTraceable: policyInput.issueTraceable === false ? false : true,
      consent: {
        ...consent,
        grantedCategories: normalizedGrantedCategories
      },
      approvalPhrase: normalizeText(policyInput.approvalPhrase) || (goGranted ? "GO" : ""),
      issueTraceability: {
        ...issueTraceability,
        relatedIssue: normalizeIssue(issueTraceability.relatedIssue) ?? issueNumber,
        intentRefs: normalizeTraceRefs(issueTraceability.intentRefs, `#${issueNumber} Intent`),
        successCriteriaRefs: normalizeTraceRefs(
          issueTraceability.successCriteriaRefs,
          `#${issueNumber} Success Criteria`
        ),
        nonGoalRefs: normalizeTraceRefs(issueTraceability.nonGoalRefs, `#${issueNumber} Non-goals`)
      }
    }
  };
}

function mergeGrantedConsentCategories(current, required) {
  const seen = new Set();
  const merged = [];
  for (const category of [...current, ...required]) {
    const text = normalizeText(category);
    const key = normalize(text);
    if (!text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(text);
  }
  return merged;
}

function normalizeTraceRefs(value, fallback) {
  if (Array.isArray(value) && value.some((item) => Boolean(normalizeText(item)))) {
    return value;
  }
  return [fallback];
}

async function resolveRuntimeAliasRegistry({ baseAliasRegistry, env }) {
  const provider = resolveMemoryProvider(env);
  const stored = await safeRetrieveStoredAliasRegistry(provider);
  const aliasRegistry = mergeAliasRegistries(baseAliasRegistry, stored.ok ? stored.aliasRegistry : []);
  if (stored.ok) {
    return { aliasRegistry, warnings: [] };
  }

  return {
    aliasRegistry,
    warnings: [
      [
        "repository nickname registry read unverified",
        stored.error,
        stored.reason
      ]
        .map(normalizeText)
        .filter(Boolean)
        .join(": ")
    ]
  };
}

async function handleRepositoryNicknameUpsertRequest(request, env) {
  const provider = resolveMemoryProvider(env);
  const body = await readJson(request);
  const runtimeAliasResolution = await resolveRuntimeAliasRegistry({
    baseAliasRegistry: [],
    env
  });
  const resolvedAliasRegistry = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: {
      aliasRegistry: runtimeAliasResolution.aliasRegistry
    },
    env
  });
  const repositoryInput = body?.repository ?? body?.repositoryInput;
  const canonicalRepositoryInput = normalizeCanonicalRepositoryInput(repositoryInput);
  const resolution = canonicalRepositoryInput
    ? {
        resolved: true,
        repository: canonicalRepositoryInput,
        via: "canonical_owner_repo"
      }
    : resolveRepositoryTarget({
        input: repositoryInput,
        mode: TaskMode.EXECUTION,
        aliasRegistry: resolvedAliasRegistry.aliasRegistry
      });

  if (!resolution.resolved) {
    return json(422, {
      ok: false,
      error: "repository_nickname_request_invalid",
      reason: resolution.reason,
      candidates: resolution.candidates ?? []
    });
  }

  const result = await upsertRepositoryNickname({
    provider,
    repository: resolution.repository,
    nickname: body?.nickname,
    nicknames: body?.nicknames,
    mode: body?.mode || RepositoryNicknameMode.APPEND,
    aliasRegistry: resolvedAliasRegistry.aliasRegistry
  });

  if (!result.ok) {
    const status = result.status ?? 422;
    return json(status >= 500 ? 200 : status, {
      ok: false,
      httpStatus: status,
      error: result.error,
      reason: result.reason,
      issues: result.issues ?? []
    });
  }

  return json(200, {
    ok: true,
    repository: resolution.repository,
    aliasEntry: result.aliasEntry
  });
}

async function handleRepositoryNicknameDeleteRequest(request, env) {
  const provider = resolveMemoryProvider(env);
  const body = await readJson(request);
  const runtimeAliasResolution = await resolveRuntimeAliasRegistry({
    baseAliasRegistry: [],
    env
  });
  const resolvedAliasRegistry = await resolveGatewayAliasRegistryFromGitHubApp({
    policyInput: {
      aliasRegistry: runtimeAliasResolution.aliasRegistry
    },
    env
  });
  const repositoryInput = body?.repository ?? body?.repositoryInput;
  const canonicalRepositoryInput = normalizeCanonicalRepositoryInput(repositoryInput);
  const resolution = canonicalRepositoryInput
    ? {
        resolved: true,
        repository: canonicalRepositoryInput,
        via: "canonical_owner_repo"
      }
    : resolveRepositoryTarget({
        input: repositoryInput,
        mode: TaskMode.EXECUTION,
        aliasRegistry: resolvedAliasRegistry.aliasRegistry
      });

  if (!resolution.resolved) {
    return json(422, {
      ok: false,
      error: "repository_nickname_delete_request_invalid",
      reason: resolution.reason,
      candidates: resolution.candidates ?? []
    });
  }

  const result = await deleteRepositoryNickname({
    provider,
    repository: resolution.repository,
    nickname: body?.nickname
  });

  if (!result.ok) {
    const status = result.status ?? 422;
    return json(status >= 500 ? 200 : status, {
      ok: false,
      httpStatus: status,
      error: result.error,
      reason: result.reason,
      issues: result.issues ?? []
    });
  }

  return json(200, {
    ok: true,
    repository: result.repository,
    nickname: result.nickname,
    deleted: result.deleted,
    deletedRecord: result.deletedRecord,
    aliasEntry: result.aliasEntry
  });
}

function normalizeCanonicalRepositoryInput(value) {
  const text = normalizeText(value).toLowerCase();
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(text)) {
    return "";
  }
  return text;
}

async function handlePasskeyRegistrationOptionsRequest(request, env) {
  const provider = resolveMemoryProvider(env);
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
  const provider = resolveMemoryProvider(env);
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
  const provider = resolveMemoryProvider(env);
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
  const provider = resolveMemoryProvider(env);
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
  const provider = resolveMemoryProvider(env);
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
  const operationConfig = getGitHubAppOperation(payload?.highRiskKind ?? policyInput?.highRiskKind);
  const identityFields = new Set(operationConfig?.authorityScopeIdentityFields ?? [
    "repository",
    "issueNumber",
    "pullNumber",
    "relatedIssue",
    "phase"
  ]);
  return normalizeScopeSnapshot({
    actionType: policyInput?.actionType,
    highRiskKind: payload?.highRiskKind ?? policyInput?.highRiskKind,
    repositoryInput: identityFields.has("repository")
      ? policyInput?.repositoryInput ?? payload?.repositoryInput
      : undefined,
    issueNumber: identityFields.has("issueNumber")
      ? issueContext.issueNumber ?? payload?.issueNumber
      : undefined,
    pullNumber: identityFields.has("pullNumber") ? payload?.pullNumber : undefined,
    relatedIssue: identityFields.has("relatedIssue")
      ? traceability.relatedIssue ?? issueContext.issueNumber ?? payload?.relatedIssue
      : undefined,
    phase: identityFields.has("phase") ? payload?.phase : undefined
  });
}

function mapGitHubHighRiskOperationToActionType(operation) {
  if (operation === GitHubHighRiskOperation.PULL_READY_FOR_REVIEW) {
    return "pull_ready_for_review";
  }
  if (operation === GitHubHighRiskOperation.PULL_MERGE) {
    return "merge";
  }
  if (operation === GitHubHighRiskOperation.ISSUE_CLOSE) {
    return "issue_close";
  }
  return normalizeText(operation);
}

async function retrieveRegisteredPasskeys(provider) {
  const records = await provider.retrieve({
    type: MemoryRecordType.WORKING_MEMORY,
    tags: ["passkey_registry"]
  });
  return dedupePasskeys(records);
}

async function purgeExpiredPasskeyArtifacts(provider) {
  if (!provider || typeof provider.retrieve !== "function" || typeof provider.deleteRecords !== "function") {
    return { ok: true, deletedCount: 0 };
  }

  const records = await provider.retrieve({
    type: MemoryRecordType.APPROVAL_LOG,
    limit: MAX_MEMORY_LIMIT
  });
  const expiredIds = records
    .filter((record) => isExpiredPasskeyEphemeralRecord(record))
    .map((record) => normalizeText(record?.id))
    .filter(Boolean);

  if (expiredIds.length === 0) {
    return { ok: true, deletedCount: 0 };
  }

  return provider.deleteRecords({ ids: expiredIds });
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

  const provider = resolveMemoryProvider(env);
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
  const provider = resolveMemoryProvider(env);
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
    semanticRetrieval: crossRetrievalRequest.semanticRetrieval,
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
    text: normalizeText(value.text) || normalizeText(value.queryHint) || null,
    semanticRetrieval: normalizeSemanticRetrievalRequest(value.semanticRetrieval)
  };
}

function normalizeSemanticRetrievalRequest(value) {
  const input = value && typeof value === "object" ? value : {};
  const enabled = input.enabled === true;
  return {
    enabled,
    mode: enabled ? "assistive" : "disabled"
  };
}

function parseBooleanQueryParam(value) {
  const normalized = normalize(value);
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function buildRetrieveRuntimeTruth(url) {
  const currentState = normalizeText(url.searchParams.get("currentState"));
  const source = normalizeText(url.searchParams.get("runtimeTruthSource"));
  const checkedAt = normalizeText(url.searchParams.get("checkedAt"));
  if (!currentState && !source && !checkedAt) {
    return null;
  }
  return {
    currentState,
    source,
    checkedAt
  };
}

function resolveRuntimeAutonomyMode(env) {
  const runtimeEnv = env ?? {};
  const configured = runtimeEnv[AUTONOMY_MODE_ENV] ?? runtimeEnv[LEGACY_AUTONOMY_MODE_ENV];
  return normalizeAutonomyMode(configured);
}

function resolveMemoryProvider(env) {
  if (!env || typeof env !== "object") {
    return null;
  }

  const injectedProvider = env.MEMORY_PROVIDER ?? null;
  if (validateMemoryProvider(injectedProvider).ok) {
    return injectedProvider;
  }

  if (memoryProviderCache.has(env)) {
    return memoryProviderCache.get(env);
  }

  const d1Binding = env[MEMORY_D1_BINDING] ?? null;
  if (!d1Binding) {
    memoryProviderCache.set(env, null);
    return null;
  }

  const provider = createCloudflareMemoryProvider({
    d1: createD1MemoryIndexAdapter(d1Binding),
    r2: createR2TextAdapter(env[MEMORY_R2_BINDING] ?? null),
    blobThreshold: resolveMemoryBlobThreshold(env)
  });

  memoryProviderCache.set(env, provider);
  return provider;
}

function createD1MemoryIndexAdapter(d1) {
  if (!d1 || typeof d1.prepare !== "function") {
    return null;
  }
  if (d1AdapterCache.has(d1)) {
    return d1AdapterCache.get(d1);
  }

  let schemaPromise = null;
  const adapter = {
    async insertRecord(record) {
      await ensureSchema();
      await d1
        .prepare(
          `INSERT OR REPLACE INTO vtdd_memory_records (
             id, type, content_json, content_ref, metadata_json, priority, tags_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          record.id,
          record.type,
          record.content === null || record.content === undefined ? null : JSON.stringify(record.content),
          normalizeText(record.contentRef) || null,
          JSON.stringify(record.metadata ?? {}),
          Number(record.priority ?? 50),
          JSON.stringify(record.tags ?? []),
          record.createdAt
        )
        .run();
    },

    async queryRecords(filter = {}) {
      await ensureSchema();

      const ids = Array.isArray(filter.ids)
        ? filter.ids.map((item) => normalizeText(item)).filter(Boolean)
        : [];
      const type = normalizeText(filter.type);
      const limit = normalizeMemoryLimit(filter.limit);
      const statement = buildMemorySelectStatement({ ids, type });
      const result = await d1.prepare(statement.sql).bind(...statement.params).all();
      const rows = Array.isArray(result?.results) ? result.results : [];
      let records = rows.map(mapStoredMemoryRecord).filter(Boolean);

      if (Array.isArray(filter.tags) && filter.tags.length > 0) {
        const requiredTags = filter.tags.map((tag) => normalizeText(tag).toLowerCase()).filter(Boolean);
        records = records.filter((record) =>
          requiredTags.every((tag) =>
            Array.isArray(record.tags) &&
            record.tags.some((recordTag) => normalizeText(recordTag).toLowerCase() === tag)
          )
        );
      }

      const queryText = normalizeText(filter.text).toLowerCase();
      if (queryText) {
        records = records.filter((record) => JSON.stringify(record).toLowerCase().includes(queryText));
      }

      records.sort((left, right) => {
        return right.priority - left.priority || String(right.createdAt).localeCompare(String(left.createdAt));
      });

      if (ids.length > 0) {
        const order = new Map(ids.map((id, index) => [id, index]));
        records.sort((left, right) => {
          const leftIndex = order.has(left.id) ? order.get(left.id) : Number.MAX_SAFE_INTEGER;
          const rightIndex = order.has(right.id) ? order.get(right.id) : Number.MAX_SAFE_INTEGER;
          return leftIndex - rightIndex;
        });
      }

      return records.slice(0, limit);
    },

    async deleteRecords(input = {}) {
      await ensureSchema();

      const ids = Array.isArray(input?.ids)
        ? input.ids.map((item) => normalizeText(item)).filter(Boolean)
        : [];
      if (ids.length === 0) {
        return { ok: true, deletedCount: 0 };
      }

      const placeholders = ids.map(() => "?").join(", ");
      await d1
        .prepare(`DELETE FROM vtdd_memory_records WHERE id IN (${placeholders})`)
        .bind(...ids)
        .run();

      return { ok: true, deletedCount: ids.length };
    }
  };

  d1AdapterCache.set(d1, adapter);
  return adapter;

  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await d1.exec(
          "CREATE TABLE IF NOT EXISTS vtdd_memory_records (id TEXT PRIMARY KEY, type TEXT NOT NULL, content_json TEXT, content_ref TEXT, metadata_json TEXT NOT NULL, priority INTEGER NOT NULL, tags_json TEXT NOT NULL, created_at TEXT NOT NULL);"
        );
        await d1.exec(
          "CREATE INDEX IF NOT EXISTS idx_vtdd_memory_records_type_priority_created_at ON vtdd_memory_records (type, priority DESC, created_at DESC);"
        );
      })();
    }
    return schemaPromise;
  }
}

function createR2TextAdapter(bucket) {
  if (!bucket || typeof bucket.put !== "function" || typeof bucket.get !== "function") {
    return null;
  }

  return {
    async put(key, value) {
      await bucket.put(key, value);
    },
    async get(key) {
      const object = await bucket.get(key);
      if (!object) {
        return null;
      }
      if (typeof object === "string") {
        return object;
      }
      if (typeof object.text === "function") {
        return object.text();
      }
      return null;
    }
  };
}

function buildMemorySelectStatement({ ids, type }) {
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(", ");
    return {
      sql: `SELECT * FROM vtdd_memory_records WHERE id IN (${placeholders})`,
      params: ids
    };
  }
  if (type) {
    return {
      sql: "SELECT * FROM vtdd_memory_records WHERE type = ? ORDER BY priority DESC, created_at DESC LIMIT ?",
      params: [type, MAX_MEMORY_LIMIT]
    };
  }
  return {
    sql: "SELECT * FROM vtdd_memory_records ORDER BY priority DESC, created_at DESC LIMIT ?",
    params: [MAX_MEMORY_LIMIT]
  };
}

function mapStoredMemoryRecord(row) {
  if (!row || typeof row !== "object") {
    return null;
  }
  return {
    id: normalizeText(row.id),
    type: normalizeText(row.type),
    content: row.content_json ? safeParseJson(row.content_json) : null,
    contentRef: normalizeText(row.content_ref) || undefined,
    metadata: safeParseJson(row.metadata_json, {}),
    priority: Number(row.priority ?? 50),
    tags: safeParseJson(row.tags_json, []),
    createdAt: normalizeText(row.created_at)
  };
}

function resolveMemoryBlobThreshold(env) {
  const numeric = Number(env?.[MEMORY_BLOB_THRESHOLD_ENV] ?? 1024);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 1024;
  }
  return Math.floor(numeric);
}

function normalizeMemoryLimit(value) {
  const numeric = Number(value ?? DEFAULT_MEMORY_LIMIT);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_MEMORY_LIMIT;
  }
  return Math.min(Math.floor(numeric), MAX_MEMORY_LIMIT);
}

function safeParseJson(value, fallback = null) {
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
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

async function authorizePasskeyRegistrationRequest({ request, env, apiSuffix }) {
  const machineAuth = authorizeGatewayRequest({ request, env, apiSuffix });
  if (machineAuth.ok) {
    return machineAuth;
  }

  const browserAuth = authorizePasskeyBrowserOrMachineRequest({ request, env, apiSuffix });
  if (!browserAuth.ok) {
    return browserAuth;
  }

  const provider = resolveMemoryProvider(env);
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return browserAuth;
  }

  const passkeys = await retrieveRegisteredPasskeys(provider);
  if (passkeys.length === 0) {
    return browserAuth;
  }

  return {
    ok: false,
    status: 403,
    reason: "browser bootstrap registration is allowed only before the first passkey is registered"
  };
}

function authorizePasskeyBrowserOrMachineRequest({ request, env, apiSuffix }) {
  const machineAuth = authorizeGatewayRequest({ request, env, apiSuffix });
  if (machineAuth.ok) {
    return machineAuth;
  }
  if (isSameOriginBrowserRequest(request)) {
    return { ok: true };
  }
  return machineAuth;
}

function isSameOriginBrowserRequest(request) {
  const originHeader = normalizeText(request.headers.get("origin"));
  const fetchSite = normalize(request.headers.get("sec-fetch-site"));
  const contentType = normalize(request.headers.get("content-type"));
  if (!originHeader) {
    return false;
  }

  const requestUrl = new URL(request.url);
  const requestOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
  if (originHeader !== requestOrigin) {
    return false;
  }
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    return false;
  }
  if (request.method === "POST" && !contentType.includes("application/json")) {
    return false;
  }
  return true;
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

function html(status, body) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8"
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

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeBody(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
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
