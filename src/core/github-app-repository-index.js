const GITHUB_API_BASE_URL = "https://api.github.com";
const INSTALLATION_REPOSITORIES_PATH = "/installation/repositories";
const GITHUB_API_VERSION = "2022-11-28";
const REPOSITORIES_PER_PAGE = 100;
const MAX_REPOSITORY_PAGES = 10;

export async function resolveGatewayAliasRegistryFromGitHubApp({ policyInput, env }) {
  const providedAliasRegistry = normalizeAliasRegistry(policyInput?.aliasRegistry);
  const tokenResolution = await resolveInstallationToken(env);
  if (!tokenResolution.ok) {
    return {
      aliasRegistry: providedAliasRegistry,
      source: "provided",
      warnings: tokenResolution.warning ? [tokenResolution.warning] : []
    };
  }

  const fetchResult = await fetchGitHubInstallationRepositories({
    token: tokenResolution.token,
    fetchImpl: resolveGitHubFetch(env),
    apiBaseUrl: normalizeApiBaseUrl(env?.GITHUB_API_BASE_URL)
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

async function resolveInstallationToken(env) {
  const directToken = normalizeText(env?.GITHUB_APP_INSTALLATION_TOKEN);
  if (directToken) {
    return { ok: true, token: directToken };
  }

  const tokenProvider = env?.GITHUB_APP_INSTALLATION_TOKEN_PROVIDER;
  if (typeof tokenProvider !== "function") {
    return { ok: false };
  }

  try {
    const token = normalizeText(await tokenProvider());
    if (token) {
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

function resolveGitHubFetch(env) {
  if (typeof env?.GITHUB_API_FETCH === "function") {
    return env.GITHUB_API_FETCH.bind(env);
  }
  return fetch;
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
    return await response.json();
  } catch {
    return {};
  }
}

function classifyApiFailure(response, body) {
  const message = normalizeText(body?.message) || `github api returned status ${response.status}`;
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

function normalizeText(value) {
  return String(value ?? "").trim();
}
