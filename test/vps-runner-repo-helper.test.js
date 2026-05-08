import test from "node:test";
import assert from "node:assert/strict";
import {
  addRunnerRepositoryPolicy,
  formatCheckResult,
  formatRunnerRepositoryList,
  normalizeRepository,
  normalizeRepositoryTruth,
  removeRunnerRepositoryPolicy,
  resolveConfigPath
} from "../scripts/vtdd-runner-repo.mjs";

test("runner repo helper normalizes canonical repository input without nickname memory", () => {
  assert.equal(normalizeRepository("sample-org/private-repo"), "sample-org/private-repo");
  assert.equal(normalizeRepository("https://github.com/sample-org/private-repo.git"), "sample-org/private-repo");
  assert.equal(normalizeRepository("TOMIO"), "");
});

test("runner repo helper stores allowlist policy without persisting visibility", () => {
  const config = addRunnerRepositoryPolicy(
    { repositories: {} },
    {
      repository: "sample-org/private-repo",
      baseRefs: ["private"],
      branchPrefixes: ["codex/"]
    }
  );

  assert.deepEqual(config, {
    repositories: {
      "sample-org/private-repo": {
        enabled: true,
        baseRefs: ["private"],
        branchPrefixes: ["codex/"]
      }
    }
  });
  assert.equal(JSON.stringify(config).includes("visibility"), false);
  assert.equal(JSON.stringify(config).includes("isPrivate"), false);
});

test("runner repo helper normalizes GitHub visibility as runtime truth", () => {
  assert.deepEqual(
    normalizeRepositoryTruth({
      nameWithOwner: "sample-org/private-repo",
      visibility: "PRIVATE",
      isPrivate: true,
      defaultBranchRef: { name: "private" }
    }),
    {
      repository: "sample-org/private-repo",
      visibility: "private",
      isPrivate: true,
      defaultBranch: "private"
    }
  );
});

test("runner repo helper formats check result with live visibility separate from policy", () => {
  const config = addRunnerRepositoryPolicy(
    { repositories: {} },
    {
      repository: "sample-org/private-repo",
      baseRefs: ["private"],
      branchPrefixes: ["codex/"]
    }
  );
  const result = formatCheckResult({
    repository: "sample-org/private-repo",
    repoTruth: {
      repository: "sample-org/private-repo",
      visibility: "public",
      defaultBranch: "main"
    },
    config,
    configPath: "/home/vtdd-runner/vtdd-runner/config/repos.json"
  });

  assert.equal(result.includes("GitHub truth: public, default branch main"), true);
  assert.equal(result.includes("Runner policy: enabled=true, baseRefs=private, branchPrefixes=codex/"), true);
});

test("runner repo helper lists and removes configured repositories", () => {
  const config = addRunnerRepositoryPolicy(
    { repositories: {} },
    {
      repository: "sample-org/private-repo",
      baseRefs: ["private"],
      branchPrefixes: ["codex/"]
    }
  );

  assert.equal(
    formatRunnerRepositoryList({ config, configPath: "/tmp/repos.json" }).includes(
      "- sample-org/private-repo baseRefs=private branchPrefixes=codex/"
    ),
    true
  );
  assert.deepEqual(removeRunnerRepositoryPolicy(config, "sample-org/private-repo"), {
    repositories: {}
  });
});

test("runner repo helper resolves default VPS config path", () => {
  assert.equal(resolveConfigPath("/tmp/repos.json"), "/tmp/repos.json");
  assert.equal(resolveConfigPath("~/vtdd-runner/config/repos.json").endsWith("/vtdd-runner/config/repos.json"), true);
});
