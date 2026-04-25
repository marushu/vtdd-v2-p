const GITHUB_API_BASE_URL = "https://api.github.com";
const INSTALLATION_REPOSITORIES_PATH = "/installation/repositories";
const INSTALLATION_ACCESS_TOKEN_PATH = "/app/installations";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API_USER_AGENT = "vtdd-v2-github-app-index";
const REPOSITORIES_PER_PAGE = 100;
const MAX_REPOSITORY_PAGES = 10;
const GITHUB_APP_JWT_LIFETIME_SECONDS = 9 * 60;
const TOKEN_REFRESH_MARGIN_SECONDS = 60;

let installationTokenCache = null;

export async function resolveGatewayAliasRegistryFromGitHubApp({ policyInput, env }) {
  const providedAliasRegistry = normalizeAliasRegistry(policyInput?.aliasRegistry);
  const fetchImpl = resolveGitHubFetch(env);
  const apiBaseUrl = normalizeApiBaseUrl(env?.GITHUB_API_BASE_URL);
  const tokenResolution = await resolveGitHubAppInstallationToken({ env, fetchImpl, apiBaseUrl });
  if (!tokenResolution.ok) {
    return {
      aliasRegistry: providedAliasRegistry,
      source: "provided",
      warnings: tokenResolution.warning ? [tokenResolution.warning] : []
    };
  }

  const fetchResult = await fetchGitHubInstallationRepositories({
    token: tokenResolution.token,
    fetchImpl,
    apiBaseUrl
  });
  if (!fetchResult.ok) {
    return {
      aliasRegistry: providedAliasRegistry,
      source: "provided",
      warnings: [buildRepositoryIndexWarning(fetchResult)]
    };
  }

  return {
    aliasRegistry: mergeAliasRegistry({
      providedAliasRegistry,
      liveRepositories: fetchResult.repositories
    }),
    source: "github_app_live",
    warnings: []
  };
}

export async function resolveGitHubAppInstallationToken({ env, fetchImpl, apiBaseUrl } = {}) {
  const resolvedFetchImpl = fetchImpl ?? resolveGitHubFetch(env);
  const resolvedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl ?? env?.GITHUB_API_BASE_URL);
  const enforceMintedToken = toBoolean(env?.GITHUB_APP_ENFORCE_MINTED_INSTALLATION_TOKEN);
  const appId = normalizeText(env?.GITHUB_APP_ID);
  const installationId = normalizeText(env?.GITHUB_APP_INSTALLATION_ID);
  const privateKey = resolveGitHubAppPrivateKey(env);

  if (appId || installationId || privateKey) {
    if (!appId || !installationId || !privateKey) {
      return {
        ok: false,
        warning:
          "github app repository index skipped: GITHUB_APP_ID / GITHUB_APP_INSTALLATION_ID / GITHUB_APP_PRIVATE_KEY must all be configured"
      };
    }

    const nowSeconds = readNowSeconds(env);
    const cacheKey = `${apiBaseUrl}|${appId}|${installationId}`;
    if (isUsableCachedToken(cacheKey, nowSeconds)) {
      return {
        ok: true,
        token: installationTokenCache.token
      };
    }

    const minted = await mintInstallationToken({
      appId,
      installationId,
      privateKey,
      env,
      fetchImpl: resolvedFetchImpl,
      apiBaseUrl: resolvedApiBaseUrl,
      nowSeconds
    });
    if (!minted.ok) {
      return {
        ok: false,
        warning: minted.warning
      };
    }

    installationTokenCache = {
      cacheKey,
      token: minted.token,
      expiresAt: minted.expiresAt
    };
    return { ok: true, token: minted.token };
  }

  const directToken = normalizeText(env?.GITHUB_APP_INSTALLATION_TOKEN);
  if (directToken) {
    if (enforceMintedToken) {
      return {
        ok: false,
        warning:
          "github app repository index skipped: direct installation token is disabled by GITHUB_APP_ENFORCE_MINTED_INSTALLATION_TOKEN"
      };
    }
    return { ok: true, token: directToken };
  }

  const tokenProvider = env?.GITHUB_APP_INSTALLATION_TOKEN_PROVIDER;
  if (typeof tokenProvider !== "function") {
    return { ok: false };
  }

  try {
    const token = normalizeText(await tokenProvider());
    if (token) {
      if (enforceMintedToken) {
        return {
          ok: false,
          warning:
            "github app repository index skipped: token provider path is disabled by GITHUB_APP_ENFORCE_MINTED_INSTALLATION_TOKEN"
        };
      }
      return { ok: true, token };
    }
    return {
      ok: false,
      warning:
        "github app repository index skipped: installation token provider returned an empty token"
    };
  } catch {
    return {
      ok: false,
      warning: "github app repository index skipped: installation token provider failed"
    };
  }
}

async function mintInstallationToken({
  appId,
  installationId,
  privateKey,
  env,
  fetchImpl,
  apiBaseUrl,
  nowSeconds
}) {
  const appJwt = await createGitHubAppJwt({ appId, privateKey, env, nowSeconds });
  if (!appJwt.ok) {
    return { ok: false, warning: appJwt.warning };
  }

  const endpoint = `${apiBaseUrl}${INSTALLATION_ACCESS_TOKEN_PATH}/${encodeURIComponent(
    installationId
  )}/access_tokens`;

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${appJwt.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": GITHUB_API_VERSION,
        "user-agent": GITHUB_API_USER_AGENT,
        "content-type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({})
    });
  } catch {
    return {
      ok: false,
      warning: "github app repository index skipped: failed to mint installation token"
    };
  }

  const body = await readJsonSafe(response);
  if (!response.ok) {
    const failure = classifyApiFailure(response, body);
    return {
      ok: false,
      warning: `github app repository index skipped: installation token mint failed (${failure.reason})`
    };
  }

  const token = normalizeText(body?.token);
  if (!token) {
    return {
      ok: false,
      warning: "github app repository index skipped: installation token mint returned empty token"
    };
  }

  return {
    ok: true,
    token,
    expiresAt: resolveTokenExpirySeconds(body?.expires_at, nowSeconds)
  };
}

function resolveGitHubFetch(env) {
  if (typeof env?.GITHUB_API_FETCH === "function") {
    return env.GITHUB_API_FETCH.bind(env);
  }
  return fetch;
}

async function createGitHubAppJwt({ appId, privateKey, env, nowSeconds }) {
  const provider = env?.GITHUB_APP_JWT_PROVIDER;
  if (typeof provider === "function") {
    try {
      const token = normalizeText(
        await provider({
          appId,
          issuedAt: nowSeconds - 60,
          expiresAt: nowSeconds + GITHUB_APP_JWT_LIFETIME_SECONDS
        })
      );
      if (!token) {
        return {
          ok: false,
          warning: "github app repository index skipped: app jwt provider returned an empty token"
        };
      }
      return { ok: true, token };
    } catch {
      return {
        ok: false,
        warning: "github app repository index skipped: app jwt provider failed"
      };
    }
  }

  try {
    const jwt = await signGitHubAppJwt({ appId, privateKey, nowSeconds });
    return { ok: true, token: jwt };
  } catch {
    return {
      ok: false,
      warning: "github app repository index skipped: failed to sign app jwt from private key"
    };
  }
}

async function fetchGitHubInstallationRepositories({ token, fetchImpl, apiBaseUrl }) {
  const repositories = [];

  for (let page = 1; page <= MAX_REPOSITORY_PAGES; page += 1) {
    const url = `${apiBaseUrl}${INSTALLATION_REPOSITORIES_PATH}?per_page=${REPOSITORIES_PER_PAGE}&page=${page}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "user-agent": GITHUB_API_USER_AGENT,
          "x-github-api-version": GITHUB_API_VERSION
        }
      });
    } catch {
      return {
        ok: false,
        error: "network_error",
        reason: "github repository index request failed"
      };
    }

    const body = await readJsonSafe(response);
    if (!response.ok) {
      return classifyApiFailure(response, body);
    }

    const pageRepositories = Array.isArray(body?.repositories)
      ? body.repositories.map(normalizeLiveRepository).filter(Boolean)
      : [];
    repositories.push(...pageRepositories);

    const totalCount = Number(body?.total_count);
    if (!hasNextPage(response.headers.get("link"))) {
      break;
    }
    if (Number.isInteger(totalCount) && totalCount >= 0 && repositories.length >= totalCount) {
      break;
    }
    if (pageRepositories.length === 0) {
      break;
    }
  }

  return {
    ok: true,
    repositories: dedupeRepositories(repositories)
  };
}

async function readJsonSafe(response) {
  try {
    const text = await response.text();
    if (!normalizeText(text)) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch {
      return {
        __rawText: sanitizeApiBodySnippet(text)
      };
    }
  } catch {
    return {};
  }
}

function classifyApiFailure(response, body) {
  const message =
    normalizeText(body?.message) ||
    normalizeText(body?.error) ||
    normalizeText(body?.__rawText) ||
    buildStatusFallbackMessage(response);
  const remaining = normalizeText(response.headers.get("x-ratelimit-remaining"));
  const retryAfter = normalizeText(response.headers.get("retry-after"));

  if (response.status === 401) {
    return {
      ok: false,
      error: "invalid_token",
      reason: message
    };
  }

  if (response.status === 429 || (response.status === 403 && remaining === "0")) {
    return {
      ok: false,
      error: "rate_limited",
      reason: message,
      retryAfter: retryAfter || null
    };
  }

  if (response.status === 403 || response.status === 404) {
    return {
      ok: false,
      error: "permission_denied",
      reason: message
    };
  }

  return {
    ok: false,
    error: "api_error",
    reason: message
  };
}

function buildStatusFallbackMessage(response) {
  const status = Number(response?.status);
  const statusText = normalizeText(response?.statusText);
  if (statusText) {
    return `github api returned status ${status} (${statusText})`;
  }
  return `github api returned status ${status}`;
}

function sanitizeApiBodySnippet(value) {
  const normalized = normalizeText(value).replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  return normalized.slice(0, 200);
}

function buildRepositoryIndexWarning(result) {
  if (result.error === "permission_denied") {
    return `github app repository index unavailable: ${result.reason}`;
  }
  if (result.error === "rate_limited") {
    const retryAfter = normalizeText(result.retryAfter);
    const retryMessage = retryAfter ? ` retry_after=${retryAfter}s` : "";
    return `github app repository index unavailable: rate limited by GitHub API.${retryMessage}`;
  }
  if (result.error === "invalid_token") {
    return "github app repository index unavailable: installation token is invalid or expired";
  }
  if (result.error === "network_error") {
    return "github app repository index unavailable: network request failed";
  }
  return `github app repository index unavailable: ${normalizeText(result.reason) || "unknown error"}`;
}

function isUsableCachedToken(cacheKey, nowSeconds) {
  if (!installationTokenCache) {
    return false;
  }
  if (installationTokenCache.cacheKey !== cacheKey) {
    return false;
  }
  if (!Number.isFinite(installationTokenCache.expiresAt)) {
    return false;
  }
  return installationTokenCache.expiresAt > nowSeconds + TOKEN_REFRESH_MARGIN_SECONDS;
}

function resolveTokenExpirySeconds(value, nowSeconds) {
  const parsed = Date.parse(normalizeText(value));
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed / 1000);
  }
  return nowSeconds + 50 * 60;
}

function hasNextPage(linkHeader) {
  const link = normalizeText(linkHeader);
  return link.includes('rel="next"');
}

function normalizeLiveRepository(repository) {
  const canonicalRepo = normalizeCanonicalRepo(repository?.full_name);
  if (!canonicalRepo) {
    return null;
  }

  const repoName = normalizeText(repository?.name) || canonicalRepo.split("/")[1];
  return {
    canonicalRepo,
    productName: repoName || null,
    visibility: normalizeVisibility(repository),
    aliases: deriveAliases(canonicalRepo)
  };
}

function dedupeRepositories(repositories) {
  const byCanonical = new Map();
  for (const repository of repositories) {
    if (!repository?.canonicalRepo) {
      continue;
    }
    byCanonical.set(repository.canonicalRepo, repository);
  }
  return [...byCanonical.values()];
}

function mergeAliasRegistry({ providedAliasRegistry, liveRepositories }) {
  const providedByCanonical = new Map(
    providedAliasRegistry.map((record) => [record.canonicalRepo, record])
  );

  return liveRepositories
    .map((liveRecord) => {
      const existing = providedByCanonical.get(liveRecord.canonicalRepo);
      return {
        canonicalRepo: liveRecord.canonicalRepo,
        productName: existing?.productName ?? liveRecord.productName ?? null,
        visibility: liveRecord.visibility,
        aliases: mergeAliases(existing?.aliases, liveRecord.aliases)
      };
    })
    .sort((a, b) => a.canonicalRepo.localeCompare(b.canonicalRepo));
}

function mergeAliases(...groups) {
  const deduped = new Map();
  for (const group of groups) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const alias of group) {
      const value = normalizeAlias(alias);
      const key = normalizeAliasKey(value);
      if (!value || !key || deduped.has(key)) {
        continue;
      }
      deduped.set(key, value);
    }
  }
  return [...deduped.values()];
}

function normalizeAliasRegistry(aliasRegistry) {
  if (!Array.isArray(aliasRegistry)) {
    return [];
  }

  const records = [];
  for (const item of aliasRegistry) {
    const canonicalRepo = normalizeCanonicalRepo(item?.canonicalRepo);
    if (!canonicalRepo) {
      continue;
    }
    records.push({
      canonicalRepo,
      productName: normalizeText(item?.productName) || null,
      visibility: normalizeVisibility(item),
      aliases: mergeAliases(item?.aliases)
    });
  }
  return records;
}

function normalizeCanonicalRepo(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized || !normalized.includes("/")) {
    return "";
  }
  return normalized;
}

function normalizeVisibility(value) {
  if (value?.private === true) {
    return "private";
  }
  if (value?.private === false) {
    return "public";
  }

  const normalized = normalizeText(value?.visibility).toLowerCase();
  if (normalized === "private" || normalized === "public" || normalized === "internal") {
    return normalized;
  }
  return "unknown";
}

function deriveAliases(canonicalRepo) {
  const [, repoNameRaw = ""] = canonicalRepo.split("/", 2);
  const repoName = normalizeAlias(repoNameRaw.toLowerCase());
  if (!repoName) {
    return [];
  }

  const compact = repoName.replace(/[^a-z0-9]+/g, "");
  const withoutVersion = repoName.replace(/[-_]?v\d+$/g, "");
  const withoutVersionCompact = withoutVersion.replace(/[^a-z0-9]+/g, "");
  return mergeAliases([repoName, compact, withoutVersion, withoutVersionCompact]);
}

function normalizeAlias(value) {
  return String(value ?? "").trim();
}

function normalizeAliasKey(value) {
  return normalizeAlias(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, "");
}

function normalizeApiBaseUrl(value) {
  const text = normalizeText(value);
  if (!text) {
    return GITHUB_API_BASE_URL;
  }

  try {
    const parsed = new URL(text);
    return parsed.origin;
  } catch {
    return GITHUB_API_BASE_URL;
  }
}

async function signGitHubAppJwt({ appId, privateKey, nowSeconds }) {
  const issuedAt = nowSeconds - 60;
  const expiresAt = nowSeconds + GITHUB_APP_JWT_LIFETIME_SECONDS;
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
  return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

function resolveGitHubAppPrivateKey(env) {
  const base64Value = normalizeText(env?.GITHUB_APP_PRIVATE_KEY_BASE64);
  if (base64Value) {
    try {
      return normalizeGitHubAppPrivateKeyValue(decodeToUtf8(base64Value));
    } catch {
      return "";
    }
  }
  return normalizeGitHubAppPrivateKeyValue(env?.GITHUB_APP_PRIVATE_KEY);
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

function decodePemPrivateKey(value) {
  const pem = normalizeText(value);
  const body = pem
    .replaceAll("-----BEGIN PRIVATE KEY-----", "")
    .replaceAll("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  return decodeBase64ToBytes(body);
}

function encodeJwtPart(payload) {
  const json = JSON.stringify(payload);
  return base64UrlEncodeBytes(new TextEncoder().encode(json));
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

function decodeToUtf8(value) {
  return new TextDecoder().decode(decodeBase64ToBytes(value));
}

function readNowSeconds(env) {
  const nowProvider = env?.GITHUB_APP_NOW_PROVIDER;
  if (typeof nowProvider === "function") {
    const provided = Number(nowProvider());
    if (Number.isFinite(provided) && provided > 0) {
      return Math.floor(provided);
    }
  }
  return Math.floor(Date.now() / 1000);
}

function toBoolean(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function normalizeText(value) {
  return String(value ?? "").trim();
}
