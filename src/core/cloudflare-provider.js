/**
 * Cloudflare-backed memory provider adapter.
 * Clients are injected so VTDD core remains provider-agnostic.
 *
 * Expected optional client methods:
 * - d1.insertRecord(record)
 * - d1.queryRecords(filter)
 * - r2.put(key, stringContent)
 * - r2.get(key) -> stringContent | null
 * - vectorize.upsert({ id, values, metadata })
 * - vectorize.query({ values, topK, filter }) -> [{ id }]
 */
export function createCloudflareMemoryProvider(input = {}) {
  const {
    d1 = null,
    r2 = null,
    vectorize = null,
    embedder = null,
    blobThreshold = 1024
  } = input;

  return {
    async store(record) {
      const prepared = await persistBlobIfNeeded({ record, r2, blobThreshold });
      if (!d1 || typeof d1.insertRecord !== "function") {
        return { ok: false, reason: "d1.insertRecord is required" };
      }
      await d1.insertRecord(prepared);

      if (vectorize && embedder && typeof vectorize.upsert === "function") {
        const values = await embedder(recordToText(record));
        await vectorize.upsert({
          id: record.id,
          values,
          metadata: {
            type: record.type,
            tags: record.tags ?? []
          }
        });
      }

      return { ok: true, record: prepared };
    },

    async retrieve(filter = {}) {
      if (!d1 || typeof d1.queryRecords !== "function") {
        return [];
      }
      const records = await d1.queryRecords(filter);
      return hydrateBlobRecords(records, r2);
    },

    async query(inputQuery = {}) {
      if (!d1 || typeof d1.queryRecords !== "function") {
        return [];
      }

      const queryText = String(inputQuery.text ?? "").trim();
      if (
        queryText &&
        vectorize &&
        embedder &&
        typeof vectorize.query === "function" &&
        typeof vectorize.upsert === "function"
      ) {
        const values = await embedder(queryText);
        const hits = await vectorize.query({
          values,
          topK: Number(inputQuery.limit ?? 20),
          filter: inputQuery.type ? { type: inputQuery.type } : undefined
        });
        const ids = (hits ?? []).map((item) => item.id).filter(Boolean);
        if (ids.length > 0) {
          const records = await d1.queryRecords({ ids });
          return hydrateBlobRecords(records, r2);
        }
      }

      const fallback = await d1.queryRecords(inputQuery);
      return hydrateBlobRecords(fallback, r2);
    }
  };
}

async function persistBlobIfNeeded({ record, r2, blobThreshold }) {
  const payload = JSON.stringify(record.content ?? null);
  if (!r2 || typeof r2.put !== "function" || payload.length <= blobThreshold) {
    return { ...record };
  }
  const key = `memory/${record.id}.json`;
  await r2.put(key, payload);
  return {
    ...record,
    content: null,
    contentRef: key
  };
}

async function hydrateBlobRecords(records, r2) {
  const list = Array.isArray(records) ? records : [];
  if (!r2 || typeof r2.get !== "function") {
    return list;
  }

  const hydrated = [];
  for (const record of list) {
    if (!record?.contentRef) {
      hydrated.push(record);
      continue;
    }
    const raw = await r2.get(record.contentRef);
    hydrated.push({
      ...record,
      content: raw ? safeParse(raw) : null
    });
  }
  return hydrated;
}

function safeParse(value) {
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function recordToText(record) {
  return JSON.stringify({
    type: record.type,
    tags: record.tags ?? [],
    content: record.content
  });
}
