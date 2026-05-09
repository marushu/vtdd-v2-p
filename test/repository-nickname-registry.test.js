import test from "node:test";
import assert from "node:assert/strict";
import {
  RepositoryNicknameMode,
  createInMemoryMemoryProvider,
  deleteRepositoryNickname,
  mergeAliasRegistries,
  retrieveStoredAliasRegistry,
  upsertRepositoryNickname
} from "../src/core/index.js";

test("repository nickname registry stores and retrieves user-defined nicknames", async () => {
  const provider = createInMemoryMemoryProvider();
  const result = await upsertRepositoryNickname({
    provider,
    repository: "sample-org/vtdd-v2-p",
    nickname: "公開VTDD",
    aliasRegistry: [
      {
        canonicalRepo: "sample-org/vtdd-v2-p",
        productName: "vtdd-v2-p",
        visibility: "public",
        aliases: ["vtdd-v2-p"]
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.aliasEntry.aliases, ["公開VTDD"]);

  const retrieved = await retrieveStoredAliasRegistry(provider);
  assert.equal(retrieved.ok, true);
  assert.equal(retrieved.aliasRegistry.length, 1);
  assert.equal(retrieved.aliasRegistry[0].canonicalRepo, "sample-org/vtdd-v2-p");
  assert.deepEqual(retrieved.aliasRegistry[0].aliases, ["公開VTDD"]);
});

test("repository nickname registry can replace prior user-defined nicknames", async () => {
  const provider = createInMemoryMemoryProvider();
  const aliasRegistry = [
    {
      canonicalRepo: "sample-org/vtdd-v2-p",
      productName: "vtdd-v2-p",
      visibility: "public",
      aliases: ["vtdd-v2-p"]
    }
  ];

  await upsertRepositoryNickname({
    provider,
    repository: "sample-org/vtdd-v2-p",
    nickname: "公開VTDD",
    aliasRegistry
  });
  const result = await upsertRepositoryNickname({
    provider,
    repository: "sample-org/vtdd-v2-p",
    nicknames: ["公開V2"],
    mode: RepositoryNicknameMode.REPLACE,
    aliasRegistry
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.aliasEntry.aliases, ["公開V2"]);
});

test("repository nickname registry deletes explicit aliases while preserving other entries", async () => {
  const provider = createInMemoryMemoryProvider();
  await upsertRepositoryNickname({
    provider,
    repository: "owner/repository",
    nickname: "default"
  });
  await upsertRepositoryNickname({
    provider,
    repository: "example/example",
    nickname: "example"
  });
  await upsertRepositoryNickname({
    provider,
    repository: "marushu/vtdd-v2-p",
    nickname: "ぶい"
  });
  await upsertRepositoryNickname({
    provider,
    repository: "marushu/hibou-piccola-bookkeeping",
    nickname: "TOMIO"
  });

  const defaultDelete = await deleteRepositoryNickname({
    provider,
    repository: "owner/repository",
    nickname: "default"
  });
  const exampleDelete = await deleteRepositoryNickname({
    provider,
    repository: "example/example",
    nickname: "example"
  });

  assert.equal(defaultDelete.ok, true);
  assert.equal(defaultDelete.deletedRecord, true);
  assert.equal(exampleDelete.ok, true);
  assert.equal(exampleDelete.deletedRecord, true);

  const retrieved = await retrieveStoredAliasRegistry(provider);
  assert.equal(retrieved.ok, true);
  assert.deepEqual(new Set(retrieved.aliasRegistry.map((item) => item.canonicalRepo)), new Set([
    "marushu/hibou-piccola-bookkeeping",
    "marushu/vtdd-v2-p"
  ]));
  assert.equal(
    retrieved.aliasRegistry.some((item) => item.aliases.includes("default")),
    false
  );
  assert.equal(
    retrieved.aliasRegistry.some((item) => item.aliases.includes("example")),
    false
  );
  assert.deepEqual(
    retrieved.aliasRegistry.find((item) => item.canonicalRepo === "marushu/vtdd-v2-p").aliases,
    ["ぶい"]
  );
  assert.deepEqual(
    retrieved.aliasRegistry.find(
      (item) => item.canonicalRepo === "marushu/hibou-piccola-bookkeeping"
    ).aliases,
    ["TOMIO"]
  );
});

test("repository nickname registry surfaces not found for absent delete targets", async () => {
  const provider = createInMemoryMemoryProvider();
  await upsertRepositoryNickname({
    provider,
    repository: "owner/repository",
    nickname: "default"
  });

  const result = await deleteRepositoryNickname({
    provider,
    repository: "owner/repository",
    nickname: "missing"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.error, "repository_nickname_not_found");
  assert.deepEqual(result.issues, ["repository nickname alias not found"]);
});

test("repository nickname registry accepts canonical repositories even before live alias registry has seen them", async () => {
  const provider = createInMemoryMemoryProvider();
  const result = await upsertRepositoryNickname({
    provider,
    repository: "sample-org/new-repo",
    nickname: "unknown",
    aliasRegistry: []
  });

  assert.equal(result.ok, true);
  assert.equal(result.aliasEntry.canonicalRepo, "sample-org/new-repo");
  assert.deepEqual(result.aliasEntry.aliases, ["unknown"]);
});

test("mergeAliasRegistries combines live aliases and stored nicknames", () => {
  const merged = mergeAliasRegistries(
    [
      {
        canonicalRepo: "sample-org/vtdd-v2-p",
        productName: "vtdd-v2-p",
        visibility: "public",
        aliases: ["vtdd-v2-p"]
      }
    ],
    [
      {
        canonicalRepo: "sample-org/vtdd-v2-p",
        productName: "vtdd-v2-p",
        visibility: "unknown",
        aliases: ["公開VTDD"]
      }
    ]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].visibility, "public");
  assert.deepEqual(merged[0].aliases, ["vtdd-v2-p", "公開VTDD"]);
});
