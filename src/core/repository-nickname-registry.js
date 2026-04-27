import { MemoryRecordType } from "./memory-schema.js";
import { validateMemoryProvider } from "./memory-provider.js";

export const RepositoryNicknameMode = Object.freeze({
  APPEND: "append",
  REPLACE: "replace"
});

export async function retrieveStoredAliasRegistry(provider) {
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return {
      ok: false,
      status: 503,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for repository nickname retrieval"
    };
  }

  const records = await provider.retrieve({
    type: MemoryRecordType.ALIAS_REGISTRY,
    limit: 200
  });

  return {
    ok: true,
    aliasRegistry: normalizeAliasRegistry(records.map((record) => record?.content)),
    records
  };
}

export async function upsertRepositoryNickname(input = {}) {
  const provider = input.provider;
  const validation = validateMemoryProvider(provider);
  if (!validation.ok) {
    return {
      ok: false,
      status: 503,
      error: "memory_provider_unavailable",
      reason: "valid memory provider is required for repository nickname persistence"
    };
  }

  const registry = normalizeAliasRegistry(input.aliasRegistry);
  const repositoryInput = normalizeCanonicalRepo(input.repository);
  if (!repositoryInput) {
    return {
      ok: false,
      status: 422,
      error: "repository_nickname_request_invalid",
      issues: ["repository must be a canonical owner/repo string"]
    };
  }

  const registryRecord = registry.find((item) => item.canonicalRepo === repositoryInput);
  if (!registryRecord) {
    return {
      ok: false,
      status: 422,
      error: "repository_nickname_request_invalid",
      issues: ["repository must resolve from the current alias registry before nickname write"]
    };
  }

  const mode = normalizeNicknameMode(input.mode);
  if (!mode) {
    return {
      ok: false,
      status: 422,
      error: "repository_nickname_request_invalid",
      issues: ["mode must be append or replace"]
    };
  }

  const nextNicknames = normalizeAliasList(input.nicknames ?? [input.nickname]);
  if (nextNicknames.length === 0) {
    return {
      ok: false,
      status: 422,
      error: "repository_nickname_request_invalid",
      issues: ["at least one nickname is required"]
    };
  }

  const stored = await retrieveStoredAliasRegistry(provider);
  if (!stored.ok) {
    return stored;
  }

  const existing = stored.aliasRegistry.find((item) => item.canonicalRepo === repositoryInput);
  const aliases =
    mode === RepositoryNicknameMode.REPLACE
      ? nextNicknames
      : mergeAliasList(existing?.aliases, nextNicknames);

  const record = {
    id: buildRepositoryNicknameRecordId(repositoryInput),
    type: MemoryRecordType.ALIAS_REGISTRY,
    content: {
      canonicalRepo: repositoryInput,
      productName: existing?.productName ?? registryRecord.productName ?? null,
      visibility: registryRecord.visibility ?? existing?.visibility ?? "unknown",
      aliases
    },
    metadata: {
      canonicalRepo: repositoryInput,
      source: "user_defined_repository_nickname",
      mode
    },
    priority: 60,
    tags: ["alias_registry", repositoryInput, "repository_nickname"],
    createdAt: new Date().toISOString()
  };

  if (typeof provider.deleteRecords === "function") {
    await provider.deleteRecords({ ids: [record.id] });
  }

  const persisted = await provider.store(record);
  if (!persisted?.ok) {
    return {
      ok: false,
      status: 503,
      error: "memory_write_failed",
      reason: "failed to persist repository nickname"
    };
  }

  return {
    ok: true,
    record: persisted.record,
    aliasEntry: record.content
  };
}

export function mergeAliasRegistries(...groups) {
  const byCanonical = new Map();

  for (const group of groups) {
    for (const record of normalizeAliasRegistry(group)) {
      const existing = byCanonical.get(record.canonicalRepo);
      if (!existing) {
        byCanonical.set(record.canonicalRepo, record);
        continue;
      }

      byCanonical.set(record.canonicalRepo, {
        canonicalRepo: record.canonicalRepo,
        productName: existing.productName ?? record.productName ?? null,
        visibility: existing.visibility !== "unknown" ? existing.visibility : record.visibility,
        aliases: mergeAliasList(existing.aliases, record.aliases)
      });
    }
  }

  return [...byCanonical.values()].sort((a, b) => a.canonicalRepo.localeCompare(b.canonicalRepo));
}

export function normalizeAliasRegistry(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .map((item) => {
      const canonicalRepo = normalizeCanonicalRepo(item?.canonicalRepo);
      if (!canonicalRepo) {
        return null;
      }

      return {
        canonicalRepo,
        productName: normalizeOptionalText(item?.productName),
        visibility: normalizeVisibility(item?.visibility),
        aliases: normalizeAliasList(item?.aliases)
      };
    })
    .filter(Boolean);
}

function buildRepositoryNicknameRecordId(canonicalRepo) {
  return `alias_registry:${canonicalRepo}`;
}

function normalizeNicknameMode(value) {
  const normalized = normalizeOptionalText(value)?.toLowerCase() || RepositoryNicknameMode.APPEND;
  return Object.values(RepositoryNicknameMode).includes(normalized) ? normalized : "";
}

function mergeAliasList(...groups) {
  const deduped = new Map();
  for (const group of groups) {
    for (const alias of normalizeAliasList(group)) {
      const key = alias.toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, "");
      if (!key || deduped.has(key)) {
        continue;
      }
      deduped.set(key, alias);
    }
  }
  return [...deduped.values()];
}

function normalizeAliasList(value) {
  if (!Array.isArray(value)) {
    return normalizeOptionalText(value) ? [normalizeOptionalText(value)] : [];
  }

  return value.map(normalizeOptionalText).filter(Boolean);
}

function normalizeCanonicalRepo(value) {
  const normalized = normalizeOptionalText(value)?.toLowerCase() || "";
  if (!normalized.includes("/")) {
    return "";
  }
  return normalized;
}

function normalizeVisibility(value) {
  const normalized = normalizeOptionalText(value)?.toLowerCase() || "unknown";
  if (["public", "private", "internal"].includes(normalized)) {
    return normalized;
  }
  return "unknown";
}

function normalizeOptionalText(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : "";
}
