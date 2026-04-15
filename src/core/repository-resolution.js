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

  for (const record of aliasRegistry) {
    if (normalize(record.canonicalRepo) === normalizedInput) {
      return { resolved: true, repository: record.canonicalRepo, via: "canonical" };
    }
  }

  for (const record of aliasRegistry) {
    const names = [record.productName, ...(record.aliases ?? [])].map(normalize).filter(Boolean);
    if (names.includes(normalizedInput)) {
      return { resolved: true, repository: record.canonicalRepo, via: "alias" };
    }
  }

  return unresolved(mode, "target repository could not be resolved from alias registry");
}

function unresolved(mode, reason) {
  if (mode === TaskMode.READ_ONLY) {
    return { resolved: false, safeToProceedReadOnly: true, reason };
  }
  return { resolved: false, safeToProceedReadOnly: false, reason };
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
