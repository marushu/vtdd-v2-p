import { resolveGitHubAppInstallationToken } from "./github-app-repository-index.js";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API_USER_AGENT = "vtdd-v2-custom-gpt-setup-artifacts";

export const CustomGptSetupArtifact = Object.freeze({
  INSTRUCTIONS: "instructions",
  OPENAPI_YAML: "openapi_yaml",
  OPENAPI_JSON: "openapi_json"
});

const SETUP_ARTIFACT_SPECS = Object.freeze({
  [CustomGptSetupArtifact.INSTRUCTIONS]: {
    path: "docs/setup/custom-gpt-instructions.md",
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

const RUNTIME_SETUP_MANIFEST = Object.freeze({
  routes: [
    "/health",
    "/v2/gateway",
    "/v2/action/execute",
    "/v2/action/github",
    "/v2/action/github-authority",
    "/v2/action/deploy",
    "/v2/action/progress",
    "/v2/retrieve/github",
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
    "vtddExecutionProgress",
    "vtddRetrieveGitHub",
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
    "vtddExecutionProgress",
    "vtddRetrieveGitHub",
    "vtddRetrieveSetupArtifact",
    "vtddRetrieveSelfParity",
    "Action Schema update required",
    "Instructions update required",
    "Cloudflare deploy update required"
  ]
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

  const canonicalRoutes = extractOpenApiRoutes(openapi.artifact.content);
  const canonicalOperationIds = extractOperationIds(openapi.artifact.content);
  const canonicalInstructionTokens = extractInstructionTokens(
    instructions.artifact.content,
    RUNTIME_SETUP_MANIFEST.operationIds
  );

  const runtimeMissingRoutes = canonicalRoutes.filter(
    (route) => !RUNTIME_SETUP_MANIFEST.routes.includes(route)
  );
  const runtimeMissingOperationIds = canonicalOperationIds.filter(
    (operationId) => !RUNTIME_SETUP_MANIFEST.operationIds.includes(operationId)
  );
  const runtimeMissingInstructionTokens = canonicalInstructionTokens.filter(
    (token) => !RUNTIME_SETUP_MANIFEST.instructionTokens.includes(token)
  );

  const runtimeParity =
    runtimeMissingRoutes.length > 0 ||
    runtimeMissingOperationIds.length > 0 ||
    runtimeMissingInstructionTokens.length > 0
      ? "cloudflare_deploy_update_required"
      : "in_sync";

  const recommendedActions =
    runtimeParity === "in_sync"
      ? [
          "If Butler cannot use the expected feature set from the current surface, Action Schema update required.",
          "If Butler cannot follow the expected behavior from the current surface, Instructions update required."
        ]
      : ["Cloudflare deploy update required."];

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
      recommendedActions
    }
  };
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
