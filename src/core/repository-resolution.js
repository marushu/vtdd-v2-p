import { TaskMode } from "./types.js";

/**
 * @typedef {{
 *   canonicalRepo: string,
 *   aliases?: string[],
 *   productName?: string
 * }} AliasRecord
 */

/**
 * @param {{
 *   input?: string,
 *   mode: string,
 *   aliasRegistry: AliasRecord[]
 * }} args
 */
export function resolveRepositoryTarget({ input, mode, aliasRegistry }) {
  const normalizedInput = normalize(input);
  if (!normalizedInput) {
    return unresolved(mode, "repository is not specified");
  }

  const registry = Array.isArray(aliasRegistry) ? aliasRegistry : [];

  for (const record of registry) {
    if (normalize(record.canonicalRepo) === normalizedInput) {
      return { resolved: true, repository: record.canonicalRepo, via: "canonical" };
    }
  }

  const aliasMatches = [];
  for (const record of registry) {
    const names = [record.productName, ...(record.aliases ?? [])].map(normalize).filter(Boolean);
    if (names.includes(normalizedInput)) {
      aliasMatches.push(record.canonicalRepo);
    }
  }

  if (aliasMatches.length === 1) {
    return { resolved: true, repository: aliasMatches[0], via: "alias" };
  }

  if (aliasMatches.length > 1) {
    return unresolved(mode, "target repository nickname is ambiguous", {
      ambiguous: true,
      candidates: aliasMatches
    });
  }

  return unresolved(mode, "target repository could not be resolved from alias registry");
}

function unresolved(mode, reason, detail = {}) {
  if (mode === TaskMode.READ_ONLY) {
    return { resolved: false, safeToProceedReadOnly: true, reason, ...detail };
  }
  return { resolved: false, safeToProceedReadOnly: false, reason, ...detail };
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
