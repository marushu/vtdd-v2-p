import test from "node:test";
import assert from "node:assert/strict";
import {
  RepositoryNicknameMode,
  createInMemoryMemoryProvider,
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

test("repository nickname registry rejects unknown canonical repositories", async () => {
  const provider = createInMemoryMemoryProvider();
  const result = await upsertRepositoryNickname({
    provider,
    repository: "sample-org/unknown-repo",
    nickname: "unknown",
    aliasRegistry: []
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.error, "repository_nickname_request_invalid");
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
