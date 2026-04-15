import { MemoryRecordType } from "./memory-schema.js";

export async function retrieveConstitution(provider, limit = 5) {
  return provider.retrieve({
    type: MemoryRecordType.CONSTITUTION,
    limit
  });
}

export async function retrieveByType(provider, type, limit = 20) {
  return provider.retrieve({ type, limit });
}

export async function retrieveHybrid(provider, input = {}) {
  const { type, text, limit = 20, tags = [] } = input;
  const byType = await provider.retrieve({ type, limit, tags });
  const byQuery = await provider.query({ type, text, limit });
  return mergeUnique(byType, byQuery).slice(0, limit);
}

function mergeUnique(primary, secondary) {
  const map = new Map();
  for (const item of [...primary, ...secondary]) {
    const key = item.id ?? JSON.stringify(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return [...map.values()];
}
