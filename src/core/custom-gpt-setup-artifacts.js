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
    "/v2/gateway",
    "/v2/action/execute",
    "/v2/action/github",
    "/v2/action/github-authority",
    "/v2/action/deploy",
    "/v2/action/github-actions-secret",
    "/v2/action/repository-nickname",
    "/v2/action/repository-nickname/delete",
    "/v2/action/progress",
    "/v2/action/vps-runner-status",
    "/v2/action/vps-runner-cancel",
    "/v2/retrieve/constitution",
    "/v2/retrieve/decisions",
    "/v2/retrieve/proposals",
    "/v2/retrieve/cross",
    "/v2/retrieve/operational-memory",
    "/v2/retrieve/github",
    "/v2/retrieve/repository-nicknames",
    "/v2/retrieve/approval-grant",
    "/v2/retrieve/setup-artifact",
    "/v2/retrieve/self-parity"
  ],
  operationIds: [
    "getHealth",
    "vtddGateway",
    "vtddExecute",
    "vtddWriteGitHub",
    "vtddGitHubAuthority",
    "vtddDeployProduction",
    "vtddSyncGitHubActionsSecret",
    "vtddUpsertRepositoryNickname",
    "vtddDeleteRepositoryNickname",
    "vtddExecutionProgress",
    "vtddVpsRunnerStatus",
    "vtddVpsRunnerCancel",
    "vtddRetrieveConstitution",
    "vtddRetrieveDecisionLogs",
    "vtddRetrieveProposalLogs",
    "vtddRetrieveCrossMemory",
    "vtddRetrieveOperationalMemory",
    "vtddRetrieveGitHub",
    "vtddRetrieveRepositoryNicknames",
    "vtddRetrieveApprovalGrant",
    "vtddRetrieveSetupArtifact",
    "vtddRetrieveSelfParity"
  ],
  instructionTokens: [
    "vtddGateway",
    "vtddExecute",
    "vtddWriteGitHub",
    "vtddGitHubAuthority",
    "vtddDeployProduction",
    "vtddSyncGitHubActionsSecret",
    "vtddUpsertRepositoryNickname",
    "vtddDeleteRepositoryNickname",
    "vtddExecutionProgress",
    "vtddVpsRunnerStatus",
    "vtddVpsRunnerCancel",
    "vtddRetrieveConstitution",
    "vtddRetrieveDecisionLogs",
    "vtddRetrieveProposalLogs",
    "vtddRetrieveCrossMemory",
    "vtddRetrieveOperationalMemory",
    "vtddRetrieveGitHub",
    "vtddRetrieveRepositoryNicknames",
    "vtddRetrieveSetupArtifact",
    "vtddRetrieveSelfParity",
    "Action Schema update required",
    "Instructions update required",
    "Cloudflare deploy update required"
  ]
});

const INSTRUCTIONS_CHARACTER_LIMIT = 8000;
const KNOWN_GOOD_COMMIT_ENV = "VTDD_KNOWN_GOOD_COMMIT_SHA";
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
      recommendedActions
    }
  };
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
      ? await resolveKnownGoodCommitSha({ repository, ref: requestedRef, env })
      : null;
  const ref =
    channel === CustomGptSetupChannel.KNOWN_GOOD
      ? knownGoodCommit?.sha || requestedRef
      : requestedRef;

  const [openapi, instructionsShortMin, selfParity, latestCommit] = await Promise.all([
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
      : Promise.resolve(null)
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
      generatedAt: new Date().toISOString(),
      actionSchema: {
        path: openapi.artifact.path,
        sourceSha: openapi.artifact.sha,
        serverUrl: runtimeOrigin,
        contentType: openapi.artifact.contentType,
        content: actionSchema
      },
      instructionsShortMin: {
        path: instructionsShortMin.artifact.path,
        sourceSha: instructionsShortMin.artifact.sha,
        contentType: instructionsShortMin.artifact.contentType,
        characterLimit: INSTRUCTIONS_CHARACTER_LIMIT,
        characterCount: instructionsCharacterCount,
        limitExceeded: instructionsLimitExceeded,
        content: instructions
      },
      rollback: {
        knownGoodCommitSha:
          channel === CustomGptSetupChannel.KNOWN_GOOD
            ? knownGoodCommit?.sha
            : latestCommit?.sha,
        knownGoodCommitSource:
          channel === CustomGptSetupChannel.KNOWN_GOOD
            ? knownGoodCommit?.source
            : latestCommit?.source,
        rollbackReady: channel === CustomGptSetupChannel.KNOWN_GOOD,
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
        deployState: selfParity.selfParity.runtimeParity
      },
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
    .meta div { padding: 10px; border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-radius: 8px; }
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
        ? `<section class="warning"><strong>Recovery bundle unavailable.</strong><p>${escapeHtml(error.reason || error.error || "unknown error")}</p></section>`
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

function renderRecoveryBundleSections(recovery) {
  const instructions = recovery.instructionsShortMin;
  const actionSchema = recovery.actionSchema;
  const rollback = recovery.rollback;
  const selfParity = recovery.runtime.selfParity;
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
        <div><strong>Known-good commit</strong><br>${escapeHtml(rollback.knownGoodCommitSha || "unverified")}</div>
        <div><strong>Self-parity</strong><br>${escapeHtml(selfParity.runtimeParity)}</div>
        <div><strong>Deploy state</strong><br>${escapeHtml(recovery.runtime.deployState)}</div>
        <div><strong>short-min length</strong><br>${instructions.characterCount} / ${instructions.characterLimit}</div>
        <div><strong>Safety</strong><br>No secret values, tokens, or approval grants are displayed.</div>
      </div>
    </section>
    <section>
      <h2>Copy-ready Action Schema</h2>
      <p class="small">${escapeHtml(actionSchema.path)}; servers.url = ${escapeHtml(actionSchema.serverUrl)}</p>
      <p><button type="button" data-copy-target="action-schema" data-copy-label="Copy Action Schema">Copy Action Schema</button></p>
      <textarea id="action-schema" spellcheck="false">${escapeHtml(actionSchema.content)}</textarea>
    </section>
    <section>
      <h2>Copy-ready custom-gpt-instructions-short-min.md</h2>
      <p class="small">${escapeHtml(instructions.path)}</p>
      <p><button type="button" data-copy-target="instructions-short-min" data-copy-label="Copy Instructions">Copy Instructions</button></p>
      <textarea id="instructions-short-min" spellcheck="false">${escapeHtml(instructions.content)}</textarea>
    </section>
    <section>
      <h2>Known-good rollback bundle</h2>
      ${
        rollback.rollbackReady
          ? `<p><button type="button" data-copy-target="rollback-bundle" data-copy-label="Copy Rollback Bundle">Copy Rollback Bundle</button></p>`
          : `<p class="small">Rollback は setup/known-good で copy-ready になります。latest は現在の候補確認用です。</p>`
      }
      <pre>${escapeHtml(
        [
          `repository: ${recovery.repository}`,
          `channel: ${recovery.channel}`,
          `ref: ${recovery.ref}`,
          `knownGoodCommitSha: ${rollback.knownGoodCommitSha || "unverified"}`,
          `knownGoodCommitSource: ${rollback.knownGoodCommitSource}`,
          `actionSchemaPath: ${actionSchema.path}`,
          `instructionsShortMinPath: ${instructions.path}`,
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
                `knownGoodCommitSha: ${rollback.knownGoodCommitSha || "unverified"}`,
                `knownGoodCommitSource: ${rollback.knownGoodCommitSource}`,
                `actionSchemaPath: ${actionSchema.path}`,
                `instructionsShortMinPath: ${instructions.path}`,
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

function normalizeSetupChannel(value) {
  const normalized = normalizeText(value).replace(/-/g, "_");
  return normalized === CustomGptSetupChannel.KNOWN_GOOD
    ? CustomGptSetupChannel.KNOWN_GOOD
    : CustomGptSetupChannel.LATEST;
}

function countCodePoints(value) {
  return Array.from(String(value ?? "")).length;
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

function buildPasskeyOperatorUrl({ origin, repository, phase, actionType, highRiskKind, issueNumber }) {
  const url = new URL("/v2/approval/passkey/operator", `${origin}/`);
  url.searchParams.set("repositoryInput", repository);
  url.searchParams.set("phase", phase || "execution");
  url.searchParams.set("actionType", actionType);
  url.searchParams.set("highRiskKind", highRiskKind);
  if (Number.isInteger(issueNumber) && issueNumber > 0) {
    url.searchParams.set("issueNumber", String(issueNumber));
  }
  return url.toString();
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
