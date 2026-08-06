import { resolveGitHubAppInstallationToken } from "./github-app-repository-index.js";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API_USER_AGENT = "vtdd-v2-custom-gpt-setup-artifacts";

export const CustomGptSetupArtifact = Object.freeze({
  INSTRUCTIONS: "instructions",
  INSTRUCTIONS_SHORT_MIN: "instructions_short_min",
  OPENAPI_YAML: "openapi_yaml",
  OPENAPI_JSON: "openapi_json"
});

const SETUP_ARTIFACT_SPECS = Object.freeze({
  [CustomGptSetupArtifact.INSTRUCTIONS]: {
    path: "docs/setup/custom-gpt-instructions.md",
    contentType: "text/plain; charset=utf-8"
  },
  [CustomGptSetupArtifact.INSTRUCTIONS_SHORT_MIN]: {
    path: "docs/setup/custom-gpt-instructions-short-min.md",
    contentType: "text/plain; charset=utf-8"
  },
  [CustomGptSetupArtifact.OPENAPI_YAML]: {
    path: "docs/setup/custom-gpt-actions-openapi.yaml",
    contentType: "text/yaml; charset=utf-8"
  },
  [CustomGptSetupArtifact.OPENAPI_JSON]: {
    path: "docs/setup/custom-gpt-actions-openapi.json",
    contentType: "application/json; charset=utf-8"
  }
});

export const RUNTIME_SETUP_MANIFEST = Object.freeze({
  routes: [
    "/health",
    "/setup",
    "/setup/recovery",
    "/setup/diagnostics",
    "/v2/gateway",
    "/v2/action/execute",
    "/v2/action/github",
    "/v2/action/memory-write",
    "/v2/action/github-authority",
    "/v2/action/deploy",
    "/v2/action/github-actions-secret",
    "/v2/action/github-actions-variable",
    "/v2/codex-analytics/usage/snapshots",
    "/v2/action/repository-nickname",
    "/v2/action/repository-nickname/delete",
    "/v2/action/progress",
    "/v2/action/vps-runner-status",
    "/v2/action/vps-runner-cancel",
    "/v2/vps/privileged-maintenance/proposals",
    "/v2/vps/privileged-maintenance/helper-requests",
    "/v2/vps/privileged-maintenance/helper-dry-runs",
    "/v2/vps/privileged-maintenance/helper-executions",
    "/v2/vps/privileged-maintenance/helper-execution-queues",
    "/v2/retrieve/vps-maintenance-install-inventory",
    "/v2/retrieve/constitution",
    "/v2/retrieve/decisions",
    "/v2/retrieve/proposals",
    "/v2/retrieve/cross",
    "/v2/retrieve/operational-memory",
    "/v2/retrieve/codex-analytics-usage",
    "/v2/retrieve/startup-preflight",
    "/v2/retrieve/github",
    "/v2/retrieve/cloudflare-pages",
    "/v2/retrieve/repository-nicknames",
    "/v2/retrieve/approval-grant",
    "/v2/retrieve/setup-artifact",
    "/v2/retrieve/self-parity",
    "/v2/retrieve/setup-diagnostics"
  ],
  operationIds: [
    "getHealth",
    "vtddGateway",
    "vtddExecute",
    "vtddWriteGitHub",
    "vtddWriteOperationalMemory",
    "vtddGitHubAuthority",
    "vtddDeployProduction",
    "vtddSyncGitHubActionsSecret",
    "vtddSyncGitHubActionsVariable",
    "vtddIngestCodexAnalyticsUsageSnapshot",
    "vtddUpsertRepositoryNickname",
    "vtddDeleteRepositoryNickname",
    "vtddExecutionProgress",
    "vtddVpsRunnerStatus",
    "vtddVpsRunnerCancel",
    "vtddCreateVpsMaintenanceProposal",
    "vtddCreateVpsMaintenanceHelperRequest",
    "vtddDryRunVpsMaintenanceHelper",
    "vtddCreateVpsMaintenanceHelperExecution",
    "vtddQueueVpsMaintenanceHelperExecution",
    "vtddRetrieveVpsMaintenanceInstallInventory",
    "vtddRetrieveConstitution",
    "vtddRetrieveDecisionLogs",
    "vtddRetrieveProposalLogs",
    "vtddRetrieveCrossMemory",
    "vtddRetrieveOperationalMemory",
    "vtddRetrieveCodexAnalyticsUsage",
    "vtddStartupPreflight",
    "vtddRetrieveGitHub",
    "vtddRetrieveCloudflarePages",
    "vtddRetrieveRepositoryNicknames",
    "vtddRetrieveApprovalGrant",
    "vtddRetrieveSetupArtifact",
    "vtddRetrieveSelfParity",
    "vtddRetrieveSetupDiagnostics"
  ],
  instructionTokens: [
    "vtddGateway",
    "vtddExecute",
    "vtddWriteGitHub",
    "vtddWriteOperationalMemory",
    "vtddGitHubAuthority",
    "vtddDeployProduction",
    "vtddSyncGitHubActionsSecret",
    "vtddSyncGitHubActionsVariable",
    "vtddIngestCodexAnalyticsUsageSnapshot",
    "vtddUpsertRepositoryNickname",
    "vtddDeleteRepositoryNickname",
    "vtddExecutionProgress",
    "vtddVpsRunnerStatus",
    "vtddVpsRunnerCancel",
    "vtddCreateVpsMaintenanceProposal",
    "vtddCreateVpsMaintenanceHelperRequest",
    "vtddDryRunVpsMaintenanceHelper",
    "vtddCreateVpsMaintenanceHelperExecution",
    "vtddQueueVpsMaintenanceHelperExecution",
    "vtddRetrieveVpsMaintenanceInstallInventory",
    "vtddRetrieveConstitution",
    "vtddRetrieveDecisionLogs",
    "vtddRetrieveProposalLogs",
    "vtddRetrieveCrossMemory",
    "vtddRetrieveOperationalMemory",
    "vtddRetrieveCodexAnalyticsUsage",
    "vtddStartupPreflight",
    "vtddRetrieveGitHub",
    "vtddRetrieveCloudflarePages",
    "vtddRetrieveRepositoryNicknames",
    "vtddRetrieveSetupArtifact",
    "vtddRetrieveSelfParity",
    "vtddRetrieveSetupDiagnostics",
    "Action Schema update required",
    "Instructions update required",
    "Cloudflare deploy update required"
  ]
});

const INSTRUCTIONS_CHARACTER_LIMIT = 8000;
const KNOWN_GOOD_COMMIT_ENV = "VTDD_KNOWN_GOOD_COMMIT_SHA";
const KNOWN_GOOD_MANIFEST_PATH = "docs/setup/known-good.json";
export const VTDD_SETUP_REPOSITORY = "marushu/vtdd-v2-p";

export const CustomGptSetupChannel = Object.freeze({
  LATEST: "latest",
  KNOWN_GOOD: "known_good"
});

export async function retrieveCustomGptSetupArtifact(input = {}) {
  const artifact = normalizeText(input.artifact);
  const repository = normalizeText(input.repository);
  const ref = normalizeText(input.ref) || "main";
  const env = input.env ?? {};
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  const apiBaseUrl = normalizeApiBaseUrl(env?.GITHUB_API_BASE_URL);

  const validation = validateCustomGptSetupArtifactRequest({ artifact, repository });
  if (!validation.ok) {
    return {
      ok: false,
      status: 422,
      error: "custom_gpt_setup_artifact_request_invalid",
      reason: validation.issues.join(", "),
      issues: validation.issues
    };
  }

  const tokenResolution = await resolveGitHubAppInstallationToken({ env, fetchImpl, apiBaseUrl });
  if (!tokenResolution.ok) {
    return {
      ok: false,
      status: 503,
      error: "custom_gpt_setup_artifact_unavailable",
      reason: tokenResolution.warning || "GitHub App installation token is unavailable"
    };
  }

  const spec = SETUP_ARTIFACT_SPECS[artifact];
  const endpoint = `${apiBaseUrl}/repos/${encodeRepository(repository)}/contents/${spec.path}?ref=${encodeURIComponent(ref)}`;

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "GET",
      headers: {
        authorization: `Bearer ${tokenResolution.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": GITHUB_API_VERSION,
        "user-agent": GITHUB_API_USER_AGENT
      }
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error: "custom_gpt_setup_artifact_unavailable",
      reason: `failed to retrieve canonical setup artifact: ${artifact}`
    };
  }

  const body = await readJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: "custom_gpt_setup_artifact_unavailable",
      reason: normalizeText(body?.message) || `GitHub read failed for setup artifact: ${artifact}`
    };
  }

  const content = decodeGitHubFileContent(body?.content, body?.encoding);
  if (!content) {
    return {
      ok: false,
      status: 503,
      error: "custom_gpt_setup_artifact_unavailable",
      reason: `GitHub returned an unreadable setup artifact: ${artifact}`
    };
  }

  return {
    ok: true,
    artifact: {
      artifact,
      repository,
      ref,
      path: spec.path,
      sha: normalizeText(body?.sha) || null,
      contentType: spec.contentType,
      content
    }
  };
}

export async function evaluateButlerSelfParity(input = {}) {
  const repository = normalizeText(input.repository);
  const ref = normalizeText(input.ref) || "main";
  const runtimeOrigin = normalizeOrigin(input.runtimeOrigin);
  const issueNumber = normalizeIssueNumber(input.issueNumber);
  const pullNumber = normalizeIssueNumber(input.pullNumber);
  const env = input.env ?? {};

  const instructions = await retrieveCustomGptSetupArtifact({
    artifact: CustomGptSetupArtifact.INSTRUCTIONS,
    repository,
    ref,
    env
  });
  const openapi = await retrieveCustomGptSetupArtifact({
    artifact: CustomGptSetupArtifact.OPENAPI_YAML,
    repository,
    ref,
    env
  });

  if (!instructions.ok || !openapi.ok) {
    const failed = [instructions, openapi].find((result) => !result.ok);
    return {
      ok: false,
      status: failed?.status ?? 503,
      error: failed?.error ?? "custom_gpt_self_parity_unavailable",
      reason: failed?.reason ?? "failed to evaluate Butler self-parity"
    };
  }

  const manifestParity = evaluateRuntimeSetupManifestParity({
    openApiContent: openapi.artifact.content,
    instructionsContent: instructions.artifact.content
  });
  const canonicalRoutes = manifestParity.canonical.routes;
  const canonicalOperationIds = manifestParity.canonical.operationIds;
  const canonicalInstructionTokens = extractInstructionTokens(
    instructions.artifact.content,
    RUNTIME_SETUP_MANIFEST.operationIds
  );
  const knownGoodComparison = await compareKnownGoodSetupArtifacts({
    repository,
    ref,
    runtimeOrigin,
    env,
    latestInstructions: instructions.artifact,
    latestOpenapi: openapi.artifact
  });
  const runtimeMissingRoutes = manifestParity.runtimeMissing.routes;
  const runtimeMissingOperationIds = manifestParity.runtimeMissing.operationIds;
  const runtimeMissingInstructionTokens = manifestParity.runtimeMissing.instructionTokens;

  const runtimeParity =
    runtimeMissingRoutes.length > 0 ||
    runtimeMissingOperationIds.length > 0 ||
    runtimeMissingInstructionTokens.length > 0
      ? "cloudflare_deploy_update_required"
      : "in_sync";
  const staleCapabilities =
    runtimeParity === "cloudflare_deploy_update_required"
      ? {
          routes: runtimeMissingRoutes,
          operationIds: runtimeMissingOperationIds,
          instructionTokens: runtimeMissingInstructionTokens
        }
      : null;

  const deployOperatorUrl =
    repository && runtimeOrigin
      ? buildPasskeyOperatorUrl({
          origin: runtimeOrigin,
          repository,
          phase: "execution",
          actionType: "deploy_production",
          highRiskKind: "deploy_production",
          issueNumber
        })
      : null;
  const deployOperatorMarkdownLink = deployOperatorUrl
    ? `[Open deploy operator](${deployOperatorUrl})`
    : null;
  const githubAppSecretSyncOperatorUrl =
    repository && runtimeOrigin
      ? buildPasskeyOperatorUrl({
          origin: runtimeOrigin,
          repository,
          phase: "execution",
          actionType: "destructive",
          highRiskKind: "github_app_secret_sync",
          issueNumber
        })
      : null;
  const githubAppSecretSyncOperatorMarkdownLink = githubAppSecretSyncOperatorUrl
    ? `[Open GitHub App secret sync operator](${githubAppSecretSyncOperatorUrl})`
    : null;
  const issueCloseOperatorUrl =
    repository && runtimeOrigin && issueNumber && pullNumber
      ? buildPasskeyOperatorUrl({
          origin: runtimeOrigin,
          repository,
          phase: "execution",
          actionType: "issue_close",
          highRiskKind: "issue_close",
          issueNumber,
          pullNumber
        })
      : null;
  const issueCloseOperatorMarkdownLink = issueCloseOperatorUrl
    ? `[Open issue close operator](${issueCloseOperatorUrl})`
    : null;
  const issueCloseOperatorStatus = classifyIssueCloseOperatorStatus({
    repository,
    runtimeOrigin,
    issueNumber,
    pullNumber,
    issueCloseOperatorUrl
  });

  const recommendedActions =
    runtimeParity === "in_sync"
      ? [
          "If Butler cannot use the expected feature set from the current surface, Action Schema update required.",
          "If Butler cannot follow the expected behavior from the current surface, Instructions update required."
        ]
      : [
          "Cloudflare deploy update required.",
          deployOperatorMarkdownLink
            ? `Open the same-origin passkey operator helper: ${deployOperatorMarkdownLink}`
            : "Resolve the repository on the current Butler surface before generating a passkey operator helper URL."
        ];
  const surfaceUpdateChecklist = buildSurfaceUpdateChecklist({
    runtimeParity,
    deployOperatorUrl,
    deployOperatorMarkdownLink,
    instructionsArtifact: instructions.artifact,
    openapiArtifact: openapi.artifact,
    knownGoodComparison
  });

  return {
    ok: true,
    selfParity: {
      repository,
      ref,
      runtimeParity,
      runtimeManifest: RUNTIME_SETUP_MANIFEST,
      canonical: {
        routes: canonicalRoutes,
        operationIds: canonicalOperationIds,
        instructionTokens: canonicalInstructionTokens,
        artifacts: {
          instructions: {
            path: instructions.artifact.path,
            sha: instructions.artifact.sha
          },
          openapiYaml: {
            path: openapi.artifact.path,
            sha: openapi.artifact.sha
          }
        }
      },
      runtimeMissingRoutes,
      runtimeMissingOperationIds,
      runtimeMissingInstructionTokens,
      staleCapabilities,
      deployOperatorUrl,
      deployOperatorMarkdownLink,
      githubAppSecretSyncOperatorUrl,
      githubAppSecretSyncOperatorMarkdownLink,
      githubAppSecretSyncOperator:
        githubAppSecretSyncOperatorUrl
          ? {
              actionType: "destructive",
              highRiskKind: "github_app_secret_sync",
              requires: ["GO", "real passkey", "approval grant"],
              repository,
              issueNumber,
              operatorUrl: githubAppSecretSyncOperatorUrl,
              operatorMarkdownLink: githubAppSecretSyncOperatorMarkdownLink,
              status: "ready",
              blockers: []
            }
          : {
              actionType: "destructive",
              highRiskKind: "github_app_secret_sync",
              requires: ["GO", "real passkey", "approval grant"],
              repository,
              issueNumber,
              operatorUrl: null,
              operatorMarkdownLink: null,
              status: "blocked",
              blockers: [
                ...(!repository ? ["missing_repository"] : []),
                ...(!runtimeOrigin ? ["missing_runtime_origin"] : [])
              ]
            },
      issueCloseOperatorUrl,
      issueCloseOperatorMarkdownLink,
      issueCloseOperator:
        issueCloseOperatorStatus.status !== "not_requested"
          ? {
              actionType: "issue_close",
              highRiskKind: "issue_close",
              requires: ["GO", "real passkey", "merged pull proof"],
              repository,
              issueNumber,
              pullNumber,
              operatorUrl: issueCloseOperatorUrl,
              operatorMarkdownLink: issueCloseOperatorMarkdownLink,
              status: issueCloseOperatorStatus.status,
              blockers: issueCloseOperatorStatus.blockers
            }
          : null,
      deployRecovery:
        runtimeParity === "cloudflare_deploy_update_required"
          ? {
              actionType: "deploy_production",
              highRiskKind: "deploy_production",
              requires: ["GO", "real passkey"],
              repository,
              issueNumber,
              operatorUrl: deployOperatorUrl,
              operatorMarkdownLink: deployOperatorMarkdownLink
            }
          : null,
      knownGoodComparison,
      surfaceUpdateChecklist,
      recommendedActions
    }
  };
}

export async function evaluateCustomGptSetupDiagnostics(input = {}) {
  const repository = normalizeText(input.repository);
  const ref = normalizeText(input.ref) || "main";
  const runtimeOrigin = normalizeOrigin(input.runtimeOrigin);
  const issueNumber = normalizeIssueNumber(input.issueNumber);
  const env = input.env ?? {};
  const observedFailure = normalizeObservedSetupFailure(input.observedFailure ?? input);

  const [instructions, openapi, selfParity] = await Promise.all([
    retrieveCustomGptSetupArtifact({
      artifact: CustomGptSetupArtifact.INSTRUCTIONS,
      repository,
      ref,
      env
    }),
    retrieveCustomGptSetupArtifact({
      artifact: CustomGptSetupArtifact.OPENAPI_YAML,
      repository,
      ref,
      env
    }),
    evaluateButlerSelfParity({
      repository,
      ref,
      issueNumber,
      runtimeOrigin,
      env
    })
  ]);

  const failed = [instructions, openapi, selfParity].find((result) => !result.ok);
  if (failed) {
    return {
      ok: false,
      status: failed?.status ?? 503,
      error: failed?.error ?? "custom_gpt_setup_diagnostics_unavailable",
      reason: failed?.reason ?? "failed to evaluate setup diagnostics"
    };
  }

  const actionSchemaDiagnostics = evaluateActionSchemaDiagnostics({
    openApiContent: openapi.artifact.content,
    runtimeOrigin
  });
  const instructionDiagnostics = evaluateInstructionDiagnostics({
    instructionsContent: instructions.artifact.content
  });
  const diagnoses = classifySetupDiagnoses({
    selfParity: selfParity.selfParity,
    actionSchemaDiagnostics,
    instructionDiagnostics,
    observedFailure
  });

  return {
    ok: true,
    diagnostics: {
      repository,
      ref,
      runtimeOrigin,
      issueNumber: issueNumber || null,
      source: {
        instructions: {
          path: instructions.artifact.path,
          sha: instructions.artifact.sha
        },
        actionSchema: {
          path: openapi.artifact.path,
          sha: openapi.artifact.sha
        }
      },
      editorState: {
        readable: false,
        status: "editor_state_unreadable",
        reason:
          "VTDD runtime cannot read the current Custom GPT editor Instructions or Action Schema. Compare the editor against these source SHAs and copy-ready setup artifacts."
      },
      actionSchema: actionSchemaDiagnostics,
      instructions: instructionDiagnostics,
      actionAuthentication: evaluateActionAuthenticationDiagnostics({ observedFailure }),
      cloudflareDeploy: {
        status:
          selfParity.selfParity.runtimeParity === "cloudflare_deploy_update_required"
            ? "cloudflare_deploy_update_required"
            : "not_required",
        runtimeParity: selfParity.selfParity.runtimeParity,
        staleCapabilities: selfParity.selfParity.staleCapabilities,
        deployOperatorUrl: selfParity.selfParity.deployOperatorUrl,
        deployOperatorMarkdownLink: selfParity.selfParity.deployOperatorMarkdownLink,
        reason:
          selfParity.selfParity.runtimeParity === "cloudflare_deploy_update_required"
            ? "Canonical setup artifacts require runtime capabilities that the deployed Worker manifest does not advertise."
            : "Deployed Worker manifest matches canonical setup routes, operationIds, and instruction tokens."
      },
      knownGoodComparison: selfParity.selfParity.knownGoodComparison,
      surfaceUpdateChecklist: selfParity.selfParity.surfaceUpdateChecklist,
      observedFailure,
      diagnoses,
      nextActions: buildSetupDiagnosticsNextActions(diagnoses),
      safety: {
        displaysSecrets: false,
        displaysTokens: false,
        displaysApprovalGrant: false
      }
    }
  };
}

export function renderCustomGptSetupDiagnosticsPage(input = {}) {
  const diagnostics = input.diagnostics ?? null;
  const error = input.error ?? null;
  const repository = normalizeText(input.repository) || VTDD_SETUP_REPOSITORY;
  const ref = normalizeText(input.ref) || "main";
  const issueNumber = normalizeIssueNumber(input.issueNumber);
  const latestHref = buildSetupPageHref({ path: "/setup/latest", ref, issueNumber });
  const knownGoodHref = buildSetupPageHref({ path: "/setup/known-good", issueNumber });

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VTDD setup diagnostics</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { width: min(100% - 24px, 1120px); margin: 0 auto; padding: 24px 0 48px; }
    h1 { font-size: 1.55rem; line-height: 1.2; margin: 0 0 16px; }
    h2 { font-size: 1rem; margin: 24px 0 10px; }
    .panel, .warning, .nav { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 8px; padding: 12px; margin: 14px 0; }
    .warning { border-color: #b45309; background: color-mix(in srgb, #f59e0b 16%, Canvas); }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
    .meta div { min-width: 0; padding: 10px; border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-radius: 8px; overflow-wrap: anywhere; }
    .nav { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .nav strong { margin-right: auto; }
    a.button { display: inline-flex; align-items: center; min-height: 40px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); border-radius: 6px; padding: 0 12px; background: ButtonFace; color: ButtonText; text-decoration: none; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 8px; padding: 12px; background: color-mix(in srgb, CanvasText 5%, Canvas); color: CanvasText; font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .small { font-size: .86rem; opacity: .82; }
  </style>
</head>
<body>
  <main>
    <h1>VTDD setup diagnostics</h1>
    <section class="nav">
      <strong>Diagnostics repo: ${escapeHtml(repository)}</strong>
      <a class="button" href="${escapeAttribute(latestHref)}">setup/latest</a>
      <a class="button" href="${escapeAttribute(knownGoodHref)}">setup/known-good</a>
    </section>
    ${
      error
        ? `<section class="warning"><strong>Diagnostics unavailable.</strong><p>${escapeHtml(error.reason || error.error || "unknown error")}</p></section>`
        : renderSetupDiagnosticsSections(diagnostics)
    }
  </main>
</body>
</html>`;
}

export function evaluateRuntimeSetupManifestParity(input = {}) {
  const runtimeManifest = input.runtimeManifest ?? RUNTIME_SETUP_MANIFEST;
  const canonicalRoutes = extractOpenApiRoutes(input.openApiContent);
  const canonicalOperationIds = extractOperationIds(input.openApiContent);
  const canonicalInstructionTokens = input.instructionsContent
    ? extractInstructionTokens(input.instructionsContent, runtimeManifest.operationIds ?? [])
    : [];

  const runtimeMissingRoutes = canonicalRoutes.filter(
    (route) => !(runtimeManifest.routes ?? []).includes(route)
  );
  const runtimeMissingOperationIds = canonicalOperationIds.filter(
    (operationId) => !(runtimeManifest.operationIds ?? []).includes(operationId)
  );
  const runtimeMissingInstructionTokens = canonicalInstructionTokens.filter(
    (token) => !(runtimeManifest.instructionTokens ?? []).includes(token)
  );

  return {
    ok:
      runtimeMissingRoutes.length === 0 &&
      runtimeMissingOperationIds.length === 0 &&
      runtimeMissingInstructionTokens.length === 0,
    canonical: {
      routes: canonicalRoutes,
      operationIds: canonicalOperationIds,
      instructionTokens: canonicalInstructionTokens
    },
    runtimeManifest,
    runtimeMissing: {
      routes: runtimeMissingRoutes,
      operationIds: runtimeMissingOperationIds,
      instructionTokens: runtimeMissingInstructionTokens
    }
  };
}

export async function buildCustomGptRecoveryBundle(input = {}) {
  const repository = normalizeText(input.repository) || VTDD_SETUP_REPOSITORY;
  const channel = normalizeSetupChannel(input.channel);
  const requestedRef = normalizeText(input.ref) || "main";
  const runtimeOrigin = normalizeOrigin(input.runtimeOrigin);
  const issueNumber = normalizeIssueNumber(input.issueNumber);
  const env = input.env ?? {};

  if (!runtimeOrigin) {
    return {
      ok: false,
      status: 422,
      error: "custom_gpt_recovery_request_invalid",
      reason: "runtimeOrigin is required"
    };
  }

  const knownGoodCommit =
    channel === CustomGptSetupChannel.KNOWN_GOOD
      ? await resolveKnownGoodCommitPointer({ repository, ref: requestedRef, env })
      : null;
  if (channel === CustomGptSetupChannel.KNOWN_GOOD && !knownGoodCommit?.sha) {
    return {
      ok: false,
      status: 503,
      error: "known_good_setup_unavailable",
      reason:
        knownGoodCommit?.reason ||
        "known-good setup requires docs/setup/known-good.json, VTDD_KNOWN_GOOD_COMMIT_SHA, or an explicit 40-character ref"
    };
  }

  const ref =
    channel === CustomGptSetupChannel.KNOWN_GOOD
      ? knownGoodCommit?.sha || requestedRef
      : requestedRef;

  const [openapi, instructionsShortMin, selfParity, latestCommit, knownGoodPointer] = await Promise.all([
    retrieveCustomGptSetupArtifact({
      artifact: CustomGptSetupArtifact.OPENAPI_YAML,
      repository,
      ref,
      env
    }),
    retrieveCustomGptSetupArtifact({
      artifact: CustomGptSetupArtifact.INSTRUCTIONS_SHORT_MIN,
      repository,
      ref,
      env
    }),
    evaluateButlerSelfParity({
      repository,
      ref,
      runtimeOrigin,
      issueNumber,
      env
    }),
    channel === CustomGptSetupChannel.LATEST
      ? resolveKnownGoodCommitSha({ repository, ref, env })
      : Promise.resolve(null),
    channel === CustomGptSetupChannel.LATEST
      ? resolveKnownGoodCommitPointer({ repository, ref, env })
      : Promise.resolve(knownGoodCommit)
  ]);

  const failed = [openapi, instructionsShortMin, selfParity].find((result) => !result.ok);
  if (failed) {
    return {
      ok: false,
      status: failed.status ?? 503,
      error: failed.error ?? "custom_gpt_recovery_unavailable",
      reason: failed.reason ?? "failed to build Custom GPT recovery bundle",
      issues: failed.issues ?? []
    };
  }

  const actionSchema = expandOpenApiServerUrl(openapi.artifact.content, runtimeOrigin);
  const instructions = instructionsShortMin.artifact.content;
  const instructionsCharacterCount = countCodePoints(instructions);
  const instructionsLimitExceeded = instructionsCharacterCount > INSTRUCTIONS_CHARACTER_LIMIT;

  return {
    ok: true,
    recovery: {
      channel,
      channelLabel:
        channel === CustomGptSetupChannel.KNOWN_GOOD ? "known-good setup bundle" : "latest setup bundle",
      repository,
      ref,
      requestedRef,
      runtimeOrigin,
      sourceCommitSha:
        channel === CustomGptSetupChannel.KNOWN_GOOD
          ? knownGoodCommit?.sha ?? null
          : latestCommit?.sha ?? null,
      sourceCommitSource:
        channel === CustomGptSetupChannel.KNOWN_GOOD
          ? knownGoodCommit?.source ?? "unverified"
          : latestCommit?.source ?? "unverified",
      generatedAt: new Date().toISOString(),
      actionSchema: {
        path: openapi.artifact.path,
        sourceSha: openapi.artifact.sha,
        serverUrl: runtimeOrigin,
        contentType: openapi.artifact.contentType,
        characterCount: countCodePoints(actionSchema),
        byteCount: countUtf8Bytes(actionSchema),
        content: actionSchema
      },
      instructionsShortMin: {
        path: instructionsShortMin.artifact.path,
        sourceSha: instructionsShortMin.artifact.sha,
        contentType: instructionsShortMin.artifact.contentType,
        characterLimit: INSTRUCTIONS_CHARACTER_LIMIT,
        characterCount: instructionsCharacterCount,
        byteCount: countUtf8Bytes(instructions),
        limitExceeded: instructionsLimitExceeded,
        content: instructions
      },
      rollback: {
        knownGoodCommitSha:
          channel === CustomGptSetupChannel.KNOWN_GOOD
            ? knownGoodCommit?.sha
            : knownGoodPointer?.sha ?? null,
        knownGoodCommitSource:
          channel === CustomGptSetupChannel.KNOWN_GOOD
            ? knownGoodCommit?.source
            : knownGoodPointer?.source ?? "unconfigured",
        rollbackReady: channel === CustomGptSetupChannel.KNOWN_GOOD,
        knownGoodManifestPath: KNOWN_GOOD_MANIFEST_PATH,
        knownGoodManifestSha: knownGoodPointer?.manifestSha ?? null,
        knownGoodVerifiedAt: knownGoodPointer?.verifiedAt ?? null,
        bundleArtifacts: [
          openapi.artifact.path,
          instructionsShortMin.artifact.path
        ],
        restoreOrder: [
          "Copy Action Schema into the Custom GPT Action Schema editor.",
          "Copy short-min instructions into the Custom GPT Instructions editor.",
          "Confirm the Action Schema server URL matches this Worker origin.",
          "Run /health directly from the browser before relying on Butler Actions."
        ]
      },
      runtime: {
        selfParity: selfParity.selfParity,
        deployState: selfParity.selfParity.runtimeParity,
        knownGoodComparison: selfParity.selfParity.knownGoodComparison,
        surfaceUpdateChecklist: selfParity.selfParity.surfaceUpdateChecklist
      },
      voiceHandoff: buildCustomGptVoiceHandoffGuide({
        runtimeOrigin,
        issueNumber
      }),
      safety: {
        displaysSecrets: false,
        displaysTokens: false,
        displaysApprovalGrant: false
      }
    }
  };
}

export function renderCustomGptRecoveryPage(input = {}) {
  const runtimeOrigin = normalizeOrigin(input.runtimeOrigin);
  const repository = normalizeText(input.repository) || VTDD_SETUP_REPOSITORY;
  const ref = normalizeText(input.ref) || "main";
  const issueNumber = normalizeIssueNumber(input.issueNumber);
  const channel = normalizeSetupChannel(input.channel);
  const recovery = input.recovery ?? null;
  const error = input.error ?? null;
  const latestHref = buildSetupPageHref({
    path: "/setup/latest",
    ref: channel === CustomGptSetupChannel.LATEST ? ref : "main",
    issueNumber
  });
  const knownGoodHref = buildSetupPageHref({
    path: "/setup/known-good",
    issueNumber
  });

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VTDD Butler setup recovery</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { width: min(100% - 24px, 1120px); margin: 0 auto; padding: 24px 0 48px; }
    h1 { font-size: 1.55rem; line-height: 1.2; margin: 0 0 16px; }
    h2 { font-size: 1rem; margin: 28px 0 10px; }
    .status, .warning, .nav { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 8px; padding: 12px; margin: 14px 0; }
    label { display: block; font-size: .9rem; margin: 8px 0 4px; }
    input { width: 100%; box-sizing: border-box; font: inherit; padding: 10px; border-radius: 6px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); background: Canvas; color: CanvasText; }
    button, a.button { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); border-radius: 6px; padding: 0 12px; background: ButtonFace; color: ButtonText; font: inherit; text-decoration: none; }
    pre, textarea { width: 100%; box-sizing: border-box; white-space: pre; overflow: auto; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 8px; padding: 12px; background: color-mix(in srgb, CanvasText 5%, Canvas); color: CanvasText; font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    textarea { min-height: 320px; resize: vertical; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; }
    .meta div { min-width: 0; padding: 10px; border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-radius: 8px; overflow-wrap: anywhere; }
    .nav { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .nav strong { margin-right: auto; }
    .channel { text-transform: none; }
    .small { font-size: .86rem; opacity: .82; }
    .warning { border-color: #b45309; background: color-mix(in srgb, #f59e0b 16%, Canvas); }
  </style>
</head>
<body>
  <main>
    <h1>VTDD Butler setup recovery</h1>
    <section class="nav">
      <strong>Recovery repo: ${escapeHtml(repository)}</strong>
      <a class="button" href="${escapeAttribute(latestHref)}">setup/latest</a>
      <a class="button" href="${escapeAttribute(knownGoodHref)}">setup/known-good</a>
    </section>
    ${
      error
        ? renderRecoveryUnavailableSection({
            error,
            channel,
            latestHref,
            knownGoodHref
          })
        : ""
    }
    ${
      recovery
        ? renderRecoveryBundleSections(recovery)
        : `<p class="small">${escapeHtml(runtimeOrigin)} 向けの ${escapeHtml(channel)} setup bundle を読み込んでいます。repo 入力は不要です。</p>`
    }
  </main>
  <script>
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-copy-target]");
      if (!button) return;
      const target = document.getElementById(button.getAttribute("data-copy-target"));
      if (!target) return;
      target.focus();
      target.select();
      try {
        await navigator.clipboard.writeText(target.value);
        button.textContent = "Copied";
      } catch {
        document.execCommand("copy");
        button.textContent = "Copied";
      }
      setTimeout(() => { button.textContent = button.getAttribute("data-copy-label"); }, 1600);
    });
  </script>
</body>
</html>`;
}

function renderRecoveryUnavailableSection({ error, channel, latestHref, knownGoodHref }) {
  const reason = error?.reason || error?.error || "unknown error";
  if (channel !== CustomGptSetupChannel.KNOWN_GOOD) {
    return `<section class="warning"><strong>Recovery bundle unavailable.</strong><p>${escapeHtml(reason)}</p></section>`;
  }

  return `<section class="warning">
      <strong>Known-good bundle is not configured yet.</strong>
      <p>${escapeHtml(reason)}</p>
      <p>このページ自体は復旧導線として開けています。main/latest を known-good として silent fallback しないため、rollback bundle は表示していません。</p>
      <p><a class="button" href="${escapeAttribute(latestHref)}">Open setup/latest instead</a></p>
      <pre>${escapeHtml(
        [
          "known-good unavailable",
          "reason: VTDD_KNOWN_GOOD_COMMIT_SHA is missing or invalid",
          `knownGoodUrl: ${knownGoodHref}`,
          `latestFallbackUrl: ${latestHref}`,
          "nextSteps:",
          "  1. Use setup/latest only as the current candidate bundle.",
          "  2. After a human verifies a working setup commit, set VTDD_KNOWN_GOOD_COMMIT_SHA to that 40-character commit SHA.",
          "  3. Do not treat main/latest as known-good automatically."
        ].join("\n")
      )}</pre>
    </section>`;
}

function buildSetupPageHref({ path, ref, issueNumber }) {
  const params = new URLSearchParams();
  if (ref && ref !== "main") {
    params.set("ref", ref);
  }
  if (Number.isInteger(issueNumber) && issueNumber > 0) {
    params.set("issueNumber", String(issueNumber));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function validateCustomGptSetupArtifactRequest({ artifact, repository }) {
  const issues = [];
  if (!SETUP_ARTIFACT_SPECS[artifact]) {
    issues.push("artifact is unsupported");
  }
  if (!repository) {
    issues.push("repository is required");
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true };
}

function resolveConfiguredKnownGoodCommitSha({ ref, env }) {
  const configured = normalizeText(env?.[KNOWN_GOOD_COMMIT_ENV]);
  if (/^[a-f0-9]{40}$/i.test(configured)) {
    return { sha: configured, source: KNOWN_GOOD_COMMIT_ENV };
  }

  if (configured) {
    return {
      sha: null,
      source: KNOWN_GOOD_COMMIT_ENV,
      reason: `${KNOWN_GOOD_COMMIT_ENV} must be a 40-character commit SHA`
    };
  }

  if (/^[a-f0-9]{40}$/i.test(ref)) {
    return { sha: ref, source: "ref" };
  }

  return { sha: null, source: "unconfigured" };
}

async function resolveKnownGoodCommitPointer({ repository, ref, env }) {
  const configured = resolveConfiguredKnownGoodCommitSha({ ref, env });
  if (configured.sha || configured.reason || configured.source === "ref") {
    return configured;
  }

  const manifest = await retrieveKnownGoodManifest({ repository, ref, env });
  if (manifest.ok) {
    return {
      sha: manifest.commitSha,
      source: KNOWN_GOOD_MANIFEST_PATH,
      manifestSha: manifest.manifestSha,
      verifiedAt: manifest.verifiedAt
    };
  }

  return {
    sha: null,
    source: manifest.source || "unconfigured",
    reason:
      manifest.source === "unconfigured"
        ? `known-good setup requires ${KNOWN_GOOD_MANIFEST_PATH}, ${KNOWN_GOOD_COMMIT_ENV}, or an explicit 40-character ref`
        : manifest.reason
  };
}

async function retrieveKnownGoodManifest({ repository, ref, env }) {
  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  const apiBaseUrl = normalizeApiBaseUrl(env?.GITHUB_API_BASE_URL);
  const tokenResolution = await resolveGitHubAppInstallationToken({ env, fetchImpl, apiBaseUrl });
  if (!tokenResolution.ok) {
    return {
      ok: false,
      source: "unverified",
      reason: tokenResolution.warning || "GitHub App installation token is unavailable"
    };
  }

  let response;
  try {
    response = await fetchImpl(
      `${apiBaseUrl}/repos/${encodeRepository(repository)}/contents/${KNOWN_GOOD_MANIFEST_PATH}?ref=${encodeURIComponent(ref || "main")}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${tokenResolution.token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": GITHUB_API_VERSION,
          "user-agent": GITHUB_API_USER_AGENT
        }
      }
    );
  } catch {
    return {
      ok: false,
      source: "unverified",
      reason: `failed to retrieve ${KNOWN_GOOD_MANIFEST_PATH}`
    };
  }

  const body = await readJsonSafe(response);
  if (!response.ok) {
    return {
      ok: false,
      source: response.status === 404 ? "unconfigured" : "unverified",
      reason:
        normalizeText(body?.message) ||
        `${KNOWN_GOOD_MANIFEST_PATH} is unavailable at ${ref || "main"}`
    };
  }

  const content = decodeGitHubFileContent(body?.content, body?.encoding);
  if (!content) {
    return {
      ok: false,
      source: "unverified",
      reason: `${KNOWN_GOOD_MANIFEST_PATH} is unreadable`
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch {
    return {
      ok: false,
      source: "unverified",
      reason: `${KNOWN_GOOD_MANIFEST_PATH} is not valid JSON`
    };
  }

  const commitSha = normalizeText(manifest?.commitSha);
  if (!/^[a-f0-9]{40}$/i.test(commitSha)) {
    return {
      ok: false,
      source: "unverified",
      reason: `${KNOWN_GOOD_MANIFEST_PATH} commitSha must be a 40-character commit SHA`
    };
  }

  return {
    ok: true,
    commitSha,
    manifestSha: normalizeText(body?.sha) || null,
    verifiedAt: normalizeText(manifest?.verifiedAt) || null
  };
}

async function resolveKnownGoodCommitSha({ repository, ref, env }) {
  const configured = normalizeText(env?.[KNOWN_GOOD_COMMIT_ENV]);
  if (configured) {
    return { sha: configured, source: KNOWN_GOOD_COMMIT_ENV };
  }

  if (/^[a-f0-9]{40}$/i.test(ref)) {
    return { sha: ref, source: "ref" };
  }

  const fetchImpl = typeof env?.GITHUB_API_FETCH === "function" ? env.GITHUB_API_FETCH.bind(env) : fetch;
  const apiBaseUrl = normalizeApiBaseUrl(env?.GITHUB_API_BASE_URL);
  const tokenResolution = await resolveGitHubAppInstallationToken({ env, fetchImpl, apiBaseUrl });
  if (!tokenResolution.ok) {
    return { sha: null, source: "unverified" };
  }

  try {
    const response = await fetchImpl(
      `${apiBaseUrl}/repos/${encodeRepository(repository)}/commits/${encodeURIComponent(ref)}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${tokenResolution.token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": GITHUB_API_VERSION,
          "user-agent": GITHUB_API_USER_AGENT
        }
      }
    );
    const body = await readJsonSafe(response);
    if (!response.ok) {
      return { sha: null, source: "unverified" };
    }
    return {
      sha: normalizeText(body?.sha) || null,
      source: "github_commit_ref"
    };
  } catch {
    return { sha: null, source: "unverified" };
  }
}

function expandOpenApiServerUrl(content, runtimeOrigin) {
  const expanded = content.replace(
    /(^servers:\n\s*-\s*url:\s*)([^\n]+)$/m,
    `$1${runtimeOrigin}`
  );
  if (expanded !== content) {
    return expanded;
  }
  return content.replace(/https:\/\/your-runtime-host\.example\.workers\.dev/g, runtimeOrigin);
}

function buildCustomGptVoiceHandoffGuide({ runtimeOrigin, issueNumber } = {}) {
  const origin = normalizeOrigin(runtimeOrigin);
  const handoffUrlBase = origin ? `${origin}/dashboard/handoff` : "/dashboard/handoff";
  const exampleUrl = buildVoiceHandoffExampleUrl({ handoffUrlBase, issueNumber });
  return {
    status: "ready_for_manual_custom_gpt_setup",
    issueNumber: Number.isInteger(issueNumber) ? issueNumber : null,
    handoffUrlBase,
    exampleUrl,
    sourceSurface: "custom_gpt_voice",
    mode: "voice_handoff",
    requiredFields: ["mode", "sourceSurface", "intent", "text or summary"],
    maxFields: { title: 160, intent: 80, text: 1200, summary: 800 },
    forbiddenFields: ["secrets", "passwords", "api keys", "db credentials", "full transcript"],
    voiceCommands: ["保存", "開発 GO", "キャンセル"],
    guidance:
      "Custom GPT の音声会話では Actions を前提にせず、保存または開発候補だけ Dashboard handoff URL で渡す。handoff は短文のみで、秘密情報や全文 transcript を含めない。Dashboard は読み上げ後に音声指示を待ち、保存は Codex app-server bridge を起動せず、開発 GO は即実行ではなく明示承認待ちにする。"
  };
}

function buildVoiceHandoffExampleUrl({ handoffUrlBase, issueNumber } = {}) {
  const url = new URL(handoffUrlBase || "https://example.com/dashboard/handoff");
  url.searchParams.set("mode", "voice_handoff");
  url.searchParams.set("sourceSurface", "custom_gpt_voice");
  url.searchParams.set("intent", "save");
  url.searchParams.set("title", issueNumber ? `Issue #${issueNumber} voice handoff` : "voice handoff");
  url.searchParams.set("summary", "Owner-confirmed short summary only. No secrets or full transcript.");
  return url.toString();
}

function renderRecoveryBundleSections(recovery) {
  const instructions = recovery.instructionsShortMin;
  const actionSchema = recovery.actionSchema;
  const rollback = recovery.rollback;
  const selfParity = recovery.runtime.selfParity;
  const surfaceUpdateChecklist = recovery.runtime.surfaceUpdateChecklist;
  const knownGoodComparison = recovery.runtime.knownGoodComparison;
  const voiceHandoff = recovery.voiceHandoff;
  const isKnownGoodChannel = recovery.channel === CustomGptSetupChannel.KNOWN_GOOD;
  const warning = instructions.limitExceeded
    ? `<section class="warning"><strong>Instructions exceed ${instructions.characterLimit} characters.</strong><p>${instructions.characterCount} characters. Shorten before pasting into the Custom GPT editor.</p></section>`
    : "";

  return `
    ${warning}
    <section class="status">
      <div class="meta">
        <div><strong>Bundle</strong><br><span class="channel">${escapeHtml(recovery.channelLabel)}</span></div>
        <div><strong>Worker URL</strong><br>${escapeHtml(recovery.runtimeOrigin)}</div>
        <div><strong>Repository</strong><br>${escapeHtml(recovery.repository)}</div>
        <div><strong>${recovery.channel === CustomGptSetupChannel.KNOWN_GOOD ? "Known-good ref" : "Latest ref"}</strong><br>${escapeHtml(recovery.ref)}</div>
        <div><strong>Bundle commit</strong><br>${escapeHtml(recovery.sourceCommitSha || "未確認")}</div>
        <div><strong>Known-good commit</strong><br>${escapeHtml(rollback.knownGoodCommitSha || "未確認")}</div>
        <div><strong>Self-parity</strong><br>${escapeHtml(selfParity.runtimeParity)}</div>
        <div><strong>Deploy state</strong><br>${escapeHtml(recovery.runtime.deployState)}</div>
        <div><strong>Action Schema length</strong><br>${actionSchema.characterCount} chars / ${actionSchema.byteCount} bytes</div>
        <div><strong>short-min length</strong><br>${instructions.characterCount} chars / ${instructions.byteCount} bytes / limit ${instructions.characterLimit}</div>
        <div><strong>Safety</strong><br>No secret values, tokens, or approval grants are displayed.</div>
      </div>
    </section>
    ${renderSurfaceUpdateChecklist(surfaceUpdateChecklist)}
    ${renderKnownGoodComparison(knownGoodComparison)}
    <section>
      <h2>URL separation</h2>
      <div class="meta">
        <div><strong>Recovery page URL</strong><br>${escapeHtml(recovery.channel === CustomGptSetupChannel.KNOWN_GOOD ? "/setup/known-good" : "/setup/latest")}</div>
        <div><strong>Runtime origin</strong><br>${escapeHtml(recovery.runtimeOrigin)}</div>
        <div><strong>Action Schema server URL</strong><br>${escapeHtml(actionSchema.serverUrl)}</div>
        <div><strong>Operator URL</strong><br>別用途。passkey / deploy / high-risk approval でのみ使う。</div>
      </div>
    </section>
    <section>
      <h2>Custom GPT Action Authentication</h2>
      <p class="small">Action Schema を貼り直しても、Custom GPT editor の Authentication 設定は runtime から読めません。protected retrieve が ClientResponseError / 認証失敗になる場合は、Action の Authentication を確認してください。</p>
      <div class="meta">
        <div><strong>Authentication type</strong><br>API Key</div>
        <div><strong>Auth type</strong><br>Bearer</div>
        <div><strong>Header</strong><br>Authorization: Bearer &lt;VTDD_GATEWAY_BEARER_TOKEN&gt;</div>
        <div><strong>Unauthenticated route</strong><br>/health only</div>
      </div>
      <p class="small">token value はここには表示しません。iPhone の保管場所から Custom GPT Action Authentication に貼り直してください。</p>
    </section>
    <section>
      <h2>Custom GPT voice handoff</h2>
      <p class="small">音声会話中は Actions を前提にしません。Custom GPT は短い handoff URL を返し、Dashboard が読み上げと音声指示待ちを担当します。</p>
      <div class="meta">
        <div><strong>Status</strong><br>${escapeHtml(voiceHandoff.status)}</div>
        <div><strong>Handoff URL base</strong><br>${escapeHtml(voiceHandoff.handoffUrlBase)}</div>
        <div><strong>Mode</strong><br>${escapeHtml(voiceHandoff.mode)}</div>
        <div><strong>Source surface</strong><br>${escapeHtml(voiceHandoff.sourceSurface)}</div>
        <div><strong>Voice commands</strong><br>${escapeHtml(voiceHandoff.voiceCommands.join(" / "))}</div>
        <div><strong>Forbidden</strong><br>${escapeHtml(voiceHandoff.forbiddenFields.join(", "))}</div>
      </div>
      <p><button type="button" data-copy-target="voice-handoff-guidance" data-copy-label="Copy voice handoff guidance">Copy voice handoff guidance</button></p>
      <textarea id="voice-handoff-guidance" spellcheck="false">${escapeHtml(
        [
          voiceHandoff.guidance,
          "",
          `handoffUrlBase: ${voiceHandoff.handoffUrlBase}`,
          `exampleUrl: ${voiceHandoff.exampleUrl}`,
          `requiredFields: ${voiceHandoff.requiredFields.join(", ")}`,
          `maxFields: title ${voiceHandoff.maxFields.title}, intent ${voiceHandoff.maxFields.intent}, text ${voiceHandoff.maxFields.text}, summary ${voiceHandoff.maxFields.summary}`,
          `voiceCommands: ${voiceHandoff.voiceCommands.join(", ")}`,
          `forbiddenFields: ${voiceHandoff.forbiddenFields.join(", ")}`
        ].join("\n")
      )}</textarea>
    </section>
    <section>
      <h2>Copy-ready Action Schema</h2>
      <p class="small">source: ${escapeHtml(actionSchema.path)}; sourceSha: ${escapeHtml(actionSchema.sourceSha)}; copy payload: raw YAML, not URL encoded</p>
      <p><button type="button" data-copy-target="action-schema" data-copy-label="Copy Action Schema">Copy Action Schema</button></p>
      <textarea id="action-schema" spellcheck="false">${escapeHtml(actionSchema.content)}</textarea>
    </section>
    <section>
      <h2>Copy-ready custom-gpt-instructions-short-min.md</h2>
      <p class="small">source: ${escapeHtml(instructions.path)}; sourceSha: ${escapeHtml(instructions.sourceSha)}; copy payload: raw Markdown, not URL encoded</p>
      <p><button type="button" data-copy-target="instructions-short-min" data-copy-label="Copy Instructions">Copy Instructions</button></p>
      <textarea id="instructions-short-min" spellcheck="false">${escapeHtml(instructions.content)}</textarea>
    </section>
    <section>
      <h2>${isKnownGoodChannel ? "Known-good rollback bundle" : "Latest setup bundle metadata"}</h2>
      ${
        rollback.rollbackReady
          ? `<p><button type="button" data-copy-target="rollback-bundle" data-copy-label="Copy Rollback Bundle">Copy Rollback Bundle</button></p>`
          : isKnownGoodChannel
            ? `<p class="small">Known-good rollback bundle はまだ copy-ready ではありません。known-good source と runtime parity を確認してください。</p>`
            : `<p class="small">この metadata は /setup/latest の現在候補です。Rollback copy-ready bundle は /setup/known-good でのみ表示します。latest は known-good としては未確認です。</p>`
      }
      <pre>${escapeHtml(
        [
          `repository: ${recovery.repository}`,
          `channel: ${recovery.channel}`,
          `ref: ${recovery.ref}`,
          `bundleCommitSha: ${recovery.sourceCommitSha || "未確認"}`,
          `bundleCommitSource: ${recovery.sourceCommitSource}`,
          `knownGoodCommitSha: ${rollback.knownGoodCommitSha || "未確認"}`,
          `knownGoodCommitSource: ${rollback.knownGoodCommitSource}`,
          `actionSchemaPath: ${actionSchema.path}`,
          `actionSchemaSourceSha: ${actionSchema.sourceSha}`,
          `actionSchemaLength: ${actionSchema.characterCount} chars / ${actionSchema.byteCount} bytes`,
          `instructionsShortMinPath: ${instructions.path}`,
          `instructionsShortMinSourceSha: ${instructions.sourceSha}`,
          `instructionsShortMinLength: ${instructions.characterCount} chars / ${instructions.byteCount} bytes`,
          `selfParity: ${selfParity.runtimeParity}`,
          `deployState: ${recovery.runtime.deployState}`,
          "restoreOrder:",
          ...rollback.restoreOrder.map((item, index) => `  ${index + 1}. ${item}`)
        ].join("\n")
      )}</pre>
      ${
        rollback.rollbackReady
          ? `<textarea id="rollback-bundle" spellcheck="false">${escapeHtml(
              [
                `repository: ${recovery.repository}`,
                `channel: ${recovery.channel}`,
                `ref: ${recovery.ref}`,
                `bundleCommitSha: ${recovery.sourceCommitSha || "未確認"}`,
                `bundleCommitSource: ${recovery.sourceCommitSource}`,
                `knownGoodCommitSha: ${rollback.knownGoodCommitSha || "未確認"}`,
                `knownGoodCommitSource: ${rollback.knownGoodCommitSource}`,
                `actionSchemaPath: ${actionSchema.path}`,
                `actionSchemaSourceSha: ${actionSchema.sourceSha}`,
                `actionSchemaLength: ${actionSchema.characterCount} chars / ${actionSchema.byteCount} bytes`,
                `instructionsShortMinPath: ${instructions.path}`,
                `instructionsShortMinSourceSha: ${instructions.sourceSha}`,
                `instructionsShortMinLength: ${instructions.characterCount} chars / ${instructions.byteCount} bytes`,
                `selfParity: ${selfParity.runtimeParity}`,
                `deployState: ${recovery.runtime.deployState}`,
                "restoreOrder:",
                ...rollback.restoreOrder.map((item, index) => `  ${index + 1}. ${item}`)
              ].join("\n")
            )}</textarea>`
          : ""
      }
    </section>`;
}

function buildSurfaceUpdateChecklist({
  runtimeParity,
  deployOperatorUrl,
  deployOperatorMarkdownLink,
  instructionsArtifact,
  openapiArtifact,
  knownGoodComparison
}) {
  const deployRequired = runtimeParity === "cloudflare_deploy_update_required";
  const actionSchemaDiffers = knownGoodComparison?.actionSchema?.status === "different";
  const instructionsDiffers = knownGoodComparison?.instructions?.status === "different";
  return {
    cloudflareDeploy: {
      status: deployRequired ? "required" : "not_required",
      reason: deployRequired
        ? "Canonical setup expects runtime capability that the deployed manifest does not advertise."
        : "Runtime manifest matches canonical setup routes, operationIds, and instruction tokens.",
      operatorUrl: deployRequired ? deployOperatorUrl : null,
      operatorMarkdownLink: deployRequired ? deployOperatorMarkdownLink : null
    },
    customGptActionSchema: {
      status: actionSchemaDiffers ? "update_required_if_editor_is_known_good" : "unverified_editor_state",
      reason: actionSchemaDiffers
        ? "Latest Action Schema differs from known-good. If the Custom GPT editor is still on known-good, Action Schema update required."
        : "VTDD runtime cannot read the current Custom GPT editor Action Schema. If this source SHA was not pasted after the last setup update, Action Schema update required.",
      sourcePath: openapiArtifact?.path ?? "docs/setup/custom-gpt-actions-openapi.yaml",
      sourceSha: openapiArtifact?.sha ?? null,
      knownGoodSourceSha: knownGoodComparison?.actionSchema?.knownGoodSourceSha ?? null,
      copyFrom: "/setup/latest",
      copyPayload: "raw_yaml_not_url_encoded"
    },
    customGptInstructions: {
      status: instructionsDiffers ? "update_required_if_editor_is_known_good" : "unverified_editor_state",
      reason: instructionsDiffers
        ? "Latest Instructions differ from known-good. If the Custom GPT editor is still on known-good, Instructions update required."
        : "VTDD runtime cannot read the current Custom GPT editor Instructions. If this source SHA was not pasted after the last setup update, Instructions update required.",
      sourcePath: instructionsArtifact?.path ?? "docs/setup/custom-gpt-instructions.md",
      sourceSha: instructionsArtifact?.sha ?? null,
      knownGoodSourceSha: knownGoodComparison?.instructions?.knownGoodSourceSha ?? null,
      copyFrom: "/setup/latest",
      copyPayload: "raw_markdown_not_url_encoded"
    }
  };
}

function evaluateActionSchemaDiagnostics({ openApiContent, runtimeOrigin }) {
  const content = String(openApiContent ?? "");
  const operationIds = extractOperationIds(content);
  const routes = extractOpenApiRoutes(content);
  const hasGatewayBearerAuth = content.includes("GatewayBearerAuth") && content.includes("scheme: bearer");
  const hasResponseModeActionVisible =
    content.includes("name: responseMode") && content.includes("action_visible");
  const hasSelfParity = operationIds.includes("vtddRetrieveSelfParity");
  const hasSetupArtifact = operationIds.includes("vtddRetrieveSetupArtifact");
  const hasSetupDiagnostics = operationIds.includes("vtddRetrieveSetupDiagnostics");
  const executeSchemaBlock = extractYamlSchemaBlock(content, "VtddExecuteRequest");
  const gatewaySchemaBlock = extractYamlSchemaBlock(content, "VtddGatewayRequest");
  const buildUnderExecute = executeSchemaBlock.includes("- build");
  const buildUnderGateway = gatewaySchemaBlock.includes("- build");
  const serverUrl = extractOpenApiServerUrl(content);
  const expectedServerUrl = normalizeOrigin(runtimeOrigin);
  const serverUrlMatchesRuntime =
    !expectedServerUrl || serverUrl === expectedServerUrl || serverUrl === "https://your-runtime-host.example.workers.dev";
  const missing = [
    ...(!hasGatewayBearerAuth ? ["GatewayBearerAuth bearer security scheme"] : []),
    ...(!hasResponseModeActionVisible ? ["responseMode=action_visible retrieve parameter"] : []),
    ...(!hasSelfParity ? ["operationId vtddRetrieveSelfParity"] : []),
    ...(!hasSetupArtifact ? ["operationId vtddRetrieveSetupArtifact"] : []),
    ...(!hasSetupDiagnostics ? ["operationId vtddRetrieveSetupDiagnostics"] : []),
    ...(!buildUnderExecute ? ["build enum under vtddExecute"] : []),
    ...(buildUnderGateway ? ["build must not appear under vtddGateway"] : []),
    ...(!serverUrlMatchesRuntime ? ["Action Schema server URL does not match runtime origin"] : [])
  ];

  return {
    status: missing.length > 0 ? "custom_gpt_action_schema_update_required" : "canonical_schema_ok_editor_unverified",
    editorState: "editor_state_unreadable",
    serverUrl: serverUrl || null,
    expectedServerUrl: expectedServerUrl || null,
    serverUrlMatchesRuntime,
    checks: {
      hasGatewayBearerAuth,
      hasResponseModeActionVisible,
      hasSelfParity,
      hasSetupArtifact,
      hasSetupDiagnostics,
      buildUnderExecute,
      buildUnderGateway
    },
    routes,
    operationIds,
    missing,
    reason:
      missing.length > 0
        ? "Canonical Action Schema is missing required Butler recovery/debug fields or has stale execution shape."
        : "Canonical Action Schema includes the required recovery/debug fields; current Custom GPT editor state remains unreadable."
  };
}

function evaluateInstructionDiagnostics({ instructionsContent }) {
  const content = String(instructionsContent ?? "");
  const requiredTokens = [
    "vtddRetrieveSelfParity",
    "vtddRetrieveSetupArtifact",
    "vtddRetrieveSetupDiagnostics",
    "Action Schema update required",
    "Instructions update required",
    "Cloudflare deploy update required",
    "ClientResponseError",
    "GatewayBearerAuth"
  ];
  const missing = requiredTokens.filter((token) => !content.includes(token));
  return {
    status: missing.length > 0 ? "custom_gpt_instructions_update_required" : "canonical_instructions_ok_editor_unverified",
    editorState: "editor_state_unreadable",
    missing,
    reason:
      missing.length > 0
        ? "Canonical Instructions are missing setup diagnostics guidance."
        : "Canonical Instructions include setup diagnostics guidance; current Custom GPT editor state remains unreadable."
  };
}

function evaluateActionAuthenticationDiagnostics({ observedFailure }) {
  const status = Number(observedFailure.httpStatus);
  const text = [
    observedFailure.error,
    observedFailure.reason,
    observedFailure.actionName
  ]
    .map(normalizeText)
    .join(" ")
    .toLowerCase();
  const authSuspected =
    status === 401 ||
    status === 403 ||
    text.includes("unauthorized") ||
    text.includes("authentication") ||
    text.includes("bearer");
  return {
    status: authSuspected ? "action_auth_bearer_missing_or_unverified" : "unverified",
    observedHttpStatus: Number.isInteger(status) ? status : null,
    reason: authSuspected
      ? "Protected Action appears unauthorized. Check Custom GPT Action Authentication sends Authorization: Bearer <token>."
      : "No protected-route auth failure was provided to diagnostics."
  };
}

function classifySetupDiagnoses({
  selfParity,
  actionSchemaDiagnostics,
  instructionDiagnostics,
  observedFailure
}) {
  const diagnoses = [];
  if (selfParity.runtimeParity === "cloudflare_deploy_update_required") {
    diagnoses.push({
      code: "cloudflare_deploy_update_required",
      severity: "blocking",
      reason:
        "Repo canonical setup artifacts require capabilities that the deployed Worker manifest does not advertise."
    });
  }
  if (actionSchemaDiagnostics.status === "custom_gpt_action_schema_update_required") {
    diagnoses.push({
      code: "custom_gpt_action_schema_update_required",
      severity: "blocking",
      reason: actionSchemaDiagnostics.reason,
      missing: actionSchemaDiagnostics.missing
    });
  }
  if (instructionDiagnostics.status === "custom_gpt_instructions_update_required") {
    diagnoses.push({
      code: "custom_gpt_instructions_update_required",
      severity: "blocking",
      reason: instructionDiagnostics.reason,
      missing: instructionDiagnostics.missing
    });
  }
  const auth = evaluateActionAuthenticationDiagnostics({ observedFailure });
  if (auth.status === "action_auth_bearer_missing_or_unverified") {
    diagnoses.push({
      code: "action_auth_bearer_missing_or_unverified",
      severity: "blocking",
      reason: auth.reason
    });
  }
  const observedText = [observedFailure.error, observedFailure.reason].map(normalizeText).join(" ");
  if (/ClientResponseError/i.test(observedText)) {
    diagnoses.push({
      code: "custom_gpt_action_transport_unverified",
      severity: "warning",
      reason:
        "ClientResponseError is a transport label, not root cause. Use responseMode=action_visible or browser-direct diagnostics to expose error/reason/issues."
    });
  }
  diagnoses.push({
    code: "editor_state_unreadable",
    severity: "info",
    reason:
      "Runtime cannot read the Custom GPT editor's currently pasted Instructions or Action Schema; compare editor content against source SHA/copy-ready artifacts."
  });
  if (diagnoses.every((diagnosis) => diagnosis.severity === "info")) {
    diagnoses.unshift({
      code: "setup_diagnostics_no_blocker_detected",
      severity: "info",
      reason:
        "Canonical setup and deployed runtime did not expose a blocker. If Butler still cannot act, refresh Action Schema/Instructions or provide the observed Action failure."
    });
  }
  return diagnoses;
}

function buildSetupDiagnosticsNextActions(diagnoses) {
  const codes = new Set(diagnoses.map((diagnosis) => diagnosis.code));
  const actions = [];
  if (codes.has("cloudflare_deploy_update_required")) {
    actions.push("Cloudflare deploy update required. Use the same-origin deploy operator only with GO + real passkey.");
  }
  if (codes.has("custom_gpt_action_schema_update_required")) {
    actions.push("Action Schema update required. Open /setup/latest and copy the Action Schema into the Custom GPT editor.");
  }
  if (codes.has("custom_gpt_instructions_update_required")) {
    actions.push("Instructions update required. Open /setup/latest and copy short-min Instructions into the Custom GPT editor.");
  }
  if (codes.has("action_auth_bearer_missing_or_unverified")) {
    actions.push("Check Custom GPT Action Authentication: API Key, Bearer, Authorization header.");
  }
  actions.push("Do not claim Custom GPT editor parity from runtime parity alone; editor state remains unreadable.");
  return actions;
}

function normalizeObservedSetupFailure(input = {}) {
  return {
    actionName: normalizeText(input.actionName || input.observedAction || input.action),
    httpStatus: normalizeIssueNumber(input.httpStatus || input.status || input.observedHttpStatus) || null,
    error: normalizeText(input.error || input.observedError),
    reason: normalizeText(input.reason || input.observedReason),
    visibleBodyFields: normalizeText(input.visibleBodyFields),
    missingBodyFields: normalizeText(input.missingBodyFields)
  };
}

function extractYamlSchemaBlock(content, schemaName) {
  const value = String(content ?? "");
  const marker = `    ${schemaName}:`;
  const start = value.indexOf(marker);
  if (start === -1) {
    return "";
  }
  const next = value.slice(start + marker.length).search(/\n    [A-Za-z0-9_.-]+:/);
  return next === -1 ? value.slice(start) : value.slice(start, start + marker.length + next);
}

function extractOpenApiServerUrl(content) {
  const match = String(content ?? "").match(/^\s*-\s*url:\s*([^\n]+)$/m);
  return normalizeText(match?.[1]);
}

function renderSetupDiagnosticsSections(diagnostics) {
  if (!diagnostics) {
    return `<section class="warning"><strong>Diagnostics unavailable.</strong><p>診断結果がありません。</p></section>`;
  }
  const primary = diagnostics.diagnoses?.[0] ?? { code: "未確認", reason: "診断結果がありません。" };
  return `
    <section class="panel">
      <div class="meta">
        <div><strong>Primary diagnosis</strong><br>${escapeHtml(primary.code)}<br><span class="small">${escapeHtml(primary.reason)}</span></div>
        <div><strong>Repository</strong><br>${escapeHtml(diagnostics.repository)}</div>
        <div><strong>Ref</strong><br>${escapeHtml(diagnostics.ref)}</div>
        <div><strong>Runtime origin</strong><br>${escapeHtml(diagnostics.runtimeOrigin || "未確認")}</div>
        <div><strong>Action Schema source</strong><br>${escapeHtml(diagnostics.source.actionSchema.path)}<br><span class="small">sourceSha: ${escapeHtml(diagnostics.source.actionSchema.sha || "未確認")}</span></div>
        <div><strong>Instructions source</strong><br>${escapeHtml(diagnostics.source.instructions.path)}<br><span class="small">sourceSha: ${escapeHtml(diagnostics.source.instructions.sha || "未確認")}</span></div>
        <div><strong>Cloudflare deploy</strong><br>${escapeHtml(diagnostics.cloudflareDeploy.status)}</div>
        <div><strong>Action auth</strong><br>${escapeHtml(diagnostics.actionAuthentication.status)}</div>
      </div>
    </section>
    <section class="warning">
      <strong>Custom GPT editor state is unreadable.</strong>
      <p>${escapeHtml(diagnostics.editorState.reason)}</p>
    </section>
    <section>
      <h2>Diagnoses</h2>
      <pre>${escapeHtml(JSON.stringify(diagnostics.diagnoses, null, 2))}</pre>
    </section>
    <section>
      <h2>Action Schema checks</h2>
      <pre>${escapeHtml(JSON.stringify({
        status: diagnostics.actionSchema.status,
        serverUrl: diagnostics.actionSchema.serverUrl,
        expectedServerUrl: diagnostics.actionSchema.expectedServerUrl,
        checks: diagnostics.actionSchema.checks,
        missing: diagnostics.actionSchema.missing
      }, null, 2))}</pre>
    </section>
    <section>
      <h2>Next actions</h2>
      <pre>${escapeHtml((diagnostics.nextActions ?? []).map((item, index) => `${index + 1}. ${item}`).join("\n"))}</pre>
    </section>
    <section>
      <h2>Safety</h2>
      <pre>${escapeHtml(JSON.stringify(diagnostics.safety, null, 2))}</pre>
    </section>`;
}

async function compareKnownGoodSetupArtifacts({
  repository,
  ref,
  runtimeOrigin,
  env,
  latestInstructions,
  latestOpenapi
}) {
  const knownGood = await resolveKnownGoodCommitPointer({ repository, ref, env });
  if (!knownGood?.sha) {
    return {
      status: "known_good_unavailable",
      knownGoodCommitSha: null,
      knownGoodCommitSource: knownGood?.source ?? "unconfigured",
      updateJudgment: "unverified",
      summary:
        "known-good commit が未設定のため、latest と known-good の差分から Custom GPT 更新要否を判断できません。"
    };
  }

  if (knownGood.sha === ref) {
    return {
      status: "same_ref",
      knownGoodCommitSha: knownGood.sha,
      knownGoodCommitSource: knownGood.source,
      updateJudgment: "no_known_good_difference",
      summary: "latest ref と known-good ref が同一です。"
    };
  }

  const [knownGoodInstructions, knownGoodOpenapi] = await Promise.all([
    retrieveCustomGptSetupArtifact({
      artifact: CustomGptSetupArtifact.INSTRUCTIONS,
      repository,
      ref: knownGood.sha,
      env
    }),
    retrieveCustomGptSetupArtifact({
      artifact: CustomGptSetupArtifact.OPENAPI_YAML,
      repository,
      ref: knownGood.sha,
      env
    })
  ]);

  if (!knownGoodInstructions.ok || !knownGoodOpenapi.ok) {
    const failed = [knownGoodInstructions, knownGoodOpenapi].find((result) => !result.ok);
    return {
      status: "comparison_unavailable",
      knownGoodCommitSha: knownGood.sha,
      knownGoodCommitSource: knownGood.source,
      updateJudgment: "unverified",
      reason: failed?.reason ?? "known-good setup artifact could not be read",
      summary:
        "known-good artifact を読めないため、latest と known-good の差分から Custom GPT 更新要否を判断できません。"
    };
  }

  const latestActionSchema = expandOpenApiServerUrl(latestOpenapi.content, runtimeOrigin);
  const knownGoodActionSchema = expandOpenApiServerUrl(
    knownGoodOpenapi.artifact.content,
    runtimeOrigin
  );
  const actionSchemaStatus = latestActionSchema === knownGoodActionSchema ? "same" : "different";
  const instructionsStatus =
    latestInstructions.content === knownGoodInstructions.artifact.content ? "same" : "different";
  const hasDifference = actionSchemaStatus === "different" || instructionsStatus === "different";

  return {
    status: hasDifference ? "different" : "same",
    knownGoodCommitSha: knownGood.sha,
    knownGoodCommitSource: knownGood.source,
    updateJudgment: hasDifference
      ? "update_required_if_editor_is_known_good"
      : "no_known_good_difference",
    summary: hasDifference
      ? "latest と known-good に差があります。Custom GPT editor が known-good のままなら更新が必要です。"
      : "latest と known-good の copy payload は一致しています。",
    actionSchema: {
      status: actionSchemaStatus,
      latestSourceSha: latestOpenapi.sha,
      knownGoodSourceSha: knownGoodOpenapi.artifact.sha
    },
    instructions: {
      status: instructionsStatus,
      latestSourceSha: latestInstructions.sha,
      knownGoodSourceSha: knownGoodInstructions.artifact.sha
    }
  };
}

function renderSurfaceUpdateChecklist(checklist) {
  if (!checklist) {
    return "";
  }
  const deploy = checklist.cloudflareDeploy ?? {};
  const actionSchema = checklist.customGptActionSchema ?? {};
  const instructions = checklist.customGptInstructions ?? {};
  return `<section>
      <h2>Surface update checklist</h2>
      <div class="meta">
        <div><strong>Cloudflare deploy</strong><br>${escapeHtml(deploy.status || "未確認")}<br><span class="small">${escapeHtml(deploy.reason || "")}</span></div>
        <div><strong>Custom GPT Action Schema</strong><br>${escapeHtml(actionSchema.status || "未確認")}<br><span class="small">${escapeHtml(actionSchema.sourcePath || "")}<br>sourceSha: ${escapeHtml(actionSchema.sourceSha || "未確認")}</span></div>
        <div><strong>Custom GPT Instructions</strong><br>${escapeHtml(instructions.status || "未確認")}<br><span class="small">${escapeHtml(instructions.sourcePath || "")}<br>sourceSha: ${escapeHtml(instructions.sourceSha || "未確認")}</span></div>
      </div>
      <p class="small">Custom GPT editor の現在値は runtime から読めないため、editor 側は未検証として表示します。最後に貼った sourceSha が一致しない場合は更新が必要です。</p>
    </section>`;
}

function renderKnownGoodComparison(comparison) {
  if (!comparison) {
    return "";
  }
  return `<section>
      <h2>Latest / known-good comparison</h2>
      <div class="meta">
        <div><strong>Comparison</strong><br>${escapeHtml(comparison.status || "未確認")}<br><span class="small">${escapeHtml(comparison.summary || "")}</span></div>
        <div><strong>Update judgment</strong><br>${escapeHtml(comparison.updateJudgment || "unverified")}</div>
        <div><strong>Known-good commit</strong><br>${escapeHtml(comparison.knownGoodCommitSha || "未確認")}<br><span class="small">${escapeHtml(comparison.knownGoodCommitSource || "")}</span></div>
        <div><strong>Action Schema diff</strong><br>${escapeHtml(comparison.actionSchema?.status || "未確認")}</div>
        <div><strong>Instructions diff</strong><br>${escapeHtml(comparison.instructions?.status || "未確認")}</div>
      </div>
    </section>`;
}

function normalizeSetupChannel(value) {
  const normalized = normalizeText(value).replace(/-/g, "_");
  return normalized === CustomGptSetupChannel.KNOWN_GOOD
    ? CustomGptSetupChannel.KNOWN_GOOD
    : CustomGptSetupChannel.LATEST;
}

function countCodePoints(value) {
  return Array.from(String(value ?? "")).length;
}

function countUtf8Bytes(value) {
  return new TextEncoder().encode(String(value ?? "")).length;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function extractOpenApiRoutes(content) {
  return [...content.matchAll(/^ {2}(\/[^:\n]+):$/gm)].map((match) => match[1]);
}

function extractOperationIds(content) {
  return [...content.matchAll(/^\s+operationId:\s+([^\s]+)\s*$/gm)].map((match) => match[1]);
}

function extractInstructionTokens(content, operationIds) {
  const requiredTokens = [
    ...operationIds,
    "Action Schema update required",
    "Instructions update required",
    "Cloudflare deploy update required"
  ];
  return requiredTokens.filter((token) => content.includes(token));
}

function decodeGitHubFileContent(content, encoding) {
  const normalizedEncoding = normalizeText(encoding) || "base64";
  if (normalizedEncoding !== "base64") {
    return null;
  }

  const normalizedContent = normalizeText(content)?.replace(/\n/g, "");
  if (!normalizedContent) {
    return null;
  }

  if (typeof atob === "function") {
    return decodeURIComponent(
      Array.from(atob(normalizedContent), (character) =>
        `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`
      ).join("")
    );
  }

  return Buffer.from(normalizedContent, "base64").toString("utf8");
}

function normalizeApiBaseUrl(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.replace(/\/+$/, "") : GITHUB_API_BASE_URL;
}

function buildPasskeyOperatorUrl({ origin, repository, phase, actionType, highRiskKind, issueNumber, pullNumber }) {
  const url = new URL("/v2/approval/passkey/operator", `${origin}/`);
  url.searchParams.set("repositoryInput", repository);
  url.searchParams.set("phase", phase || "execution");
  url.searchParams.set("actionType", actionType);
  url.searchParams.set("highRiskKind", highRiskKind);
  if (Number.isInteger(issueNumber) && issueNumber > 0) {
    url.searchParams.set("issueNumber", String(issueNumber));
  }
  if (Number.isInteger(pullNumber) && pullNumber > 0) {
    url.searchParams.set("pullNumber", String(pullNumber));
  }
  return url.toString();
}

function classifyIssueCloseOperatorStatus({
  repository,
  runtimeOrigin,
  issueNumber,
  pullNumber,
  issueCloseOperatorUrl
}) {
  if (issueCloseOperatorUrl) {
    return { status: "ready", blockers: [] };
  }
  if (!issueNumber && !pullNumber) {
    return { status: "not_requested", blockers: [] };
  }

  const blockers = [];
  if (!repository) {
    blockers.push("missing_repository");
  }
  if (!runtimeOrigin) {
    blockers.push("missing_runtime_origin");
  }
  if (!issueNumber) {
    blockers.push("missing_issue_number");
  }
  if (!pullNumber) {
    blockers.push("missing_merged_pull_number");
  }

  return {
    status: blockers[0] || "unavailable",
    blockers
  };
}

function normalizeOrigin(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }
  try {
    return new URL(normalized).origin;
  } catch {
    return "";
  }
}

function normalizeIssueNumber(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function encodeRepository(repository) {
  return repository
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
