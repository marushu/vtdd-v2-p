#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_CONFIG_PATH = "~/vtdd-runner/config/repos.json";

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    if (command === "add") {
      const options = parseRepoCommandArgs(args);
      const repoTruth = options.verify
        ? await readGitHubRepositoryTruth({ repository: options.repository })
        : null;
      const configPath = resolveConfigPath(options.configPath);
      const config = await readRunnerRepoConfig(configPath);
      const nextConfig = addRunnerRepositoryPolicy(config, {
        repository: options.repository,
        baseRefs: options.baseRefs,
        branchPrefixes: options.branchPrefixes
      });
      await writeRunnerRepoConfig(configPath, nextConfig);
      console.log(formatAddResult({ repository: options.repository, repoTruth, configPath }));
      return;
    }

    if (command === "check") {
      const options = parseRepoCommandArgs(args, { requirePolicyOptions: false });
      const repoTruth = await readGitHubRepositoryTruth({ repository: options.repository });
      const configPath = resolveConfigPath(options.configPath);
      const config = await readRunnerRepoConfig(configPath);
      console.log(formatCheckResult({ repository: options.repository, repoTruth, config, configPath }));
      return;
    }

    if (command === "list") {
      const options = parseListArgs(args);
      const configPath = resolveConfigPath(options.configPath);
      const config = await readRunnerRepoConfig(configPath);
      console.log(formatRunnerRepositoryList({ config, configPath }));
      return;
    }

    if (command === "remove") {
      const options = parseRepoCommandArgs(args, { requirePolicyOptions: false, verifyDefault: false });
      const configPath = resolveConfigPath(options.configPath);
      const config = await readRunnerRepoConfig(configPath);
      const nextConfig = removeRunnerRepositoryPolicy(config, options.repository);
      await writeRunnerRepoConfig(configPath, nextConfig);
      console.log(`Removed ${options.repository} from ${configPath}`);
      return;
    }

    printUsage();
    process.exitCode = command ? 1 : 0;
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  }
}

function parseRepoCommandArgs(args, { requirePolicyOptions = true, verifyDefault = true } = {}) {
  const positional = [];
  const options = {
    configPath: process.env.VTDD_VPS_RUNNER_CONFIG,
    baseRefs: [],
    branchPrefixes: [],
    verify: verifyDefault
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--config") {
      options.configPath = mustReadOptionValue(args, ++index, "--config");
      continue;
    }
    if (arg === "--base") {
      options.baseRefs.push(...normalizeStringList(mustReadOptionValue(args, ++index, "--base")));
      continue;
    }
    if (arg === "--branch-prefix") {
      options.branchPrefixes.push(...normalizeStringList(mustReadOptionValue(args, ++index, "--branch-prefix")));
      continue;
    }
    if (arg === "--no-verify") {
      options.verify = false;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }

  const repository = normalizeRepository(positional[0]);
  if (!repository) {
    throw new Error("Repository is required as owner/repo.");
  }
  if (positional.length > 1) {
    throw new Error(`Unexpected arguments: ${positional.slice(1).join(" ")}`);
  }

  if (requirePolicyOptions) {
    options.baseRefs = options.baseRefs.length > 0 ? dedupe(options.baseRefs) : ["main"];
    options.branchPrefixes = options.branchPrefixes.length > 0 ? dedupe(options.branchPrefixes) : ["codex/"];
  }

  return {
    ...options,
    repository
  };
}

function parseListArgs(args) {
  const options = { configPath: process.env.VTDD_VPS_RUNNER_CONFIG };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--config") {
      options.configPath = mustReadOptionValue(args, ++index, "--config");
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function mustReadOptionValue(args, index, optionName) {
  const value = args[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

async function readGitHubRepositoryTruth({ repository, runCommand = runCommandJson } = {}) {
  const normalized = normalizeRepository(repository);
  if (!normalized) {
    throw new Error("Repository is required as owner/repo.");
  }
  const result = await runCommand("gh", [
    "repo",
    "view",
    normalized,
    "--json",
    "nameWithOwner,visibility,isPrivate,defaultBranchRef"
  ]);
  return normalizeRepositoryTruth(result);
}

function normalizeRepositoryTruth(input = {}) {
  const repository = normalizeRepository(input.nameWithOwner || input.repository);
  const defaultBranch =
    typeof input.defaultBranchRef === "string"
      ? input.defaultBranchRef
      : normalizeText(input.defaultBranchRef?.name);
  const visibility = normalizeText(input.visibility).toLowerCase();
  return {
    repository,
    visibility: visibility || (input.isPrivate ? "private" : "unknown"),
    isPrivate: Boolean(input.isPrivate || visibility === "private"),
    defaultBranch: defaultBranch || null
  };
}

async function readRunnerRepoConfig(configPath) {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("config root must be an object");
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { repositories: {} };
    }
    throw new Error(`Failed to read ${configPath}: ${error.message}`);
  }
}

async function writeRunnerRepoConfig(configPath, config) {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const body = `${JSON.stringify(sortRunnerRepoConfig(config), null, 2)}\n`;
  const tempPath = `${configPath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, body, { mode: 0o600 });
  await fs.rename(tempPath, configPath);
}

function addRunnerRepositoryPolicy(config, policy) {
  const repository = normalizeRepository(policy.repository);
  if (!repository) {
    throw new Error("Repository is required as owner/repo.");
  }
  return {
    ...config,
    repositories: {
      ...normalizeConfigRepositories(config.repositories),
      [repository]: {
        enabled: true,
        baseRefs: normalizeStringList(policy.baseRefs).length > 0 ? normalizeStringList(policy.baseRefs) : ["main"],
        branchPrefixes:
          normalizeStringList(policy.branchPrefixes).length > 0 ? normalizeStringList(policy.branchPrefixes) : ["codex/"]
      }
    }
  };
}

function removeRunnerRepositoryPolicy(config, repositoryInput) {
  const repository = normalizeRepository(repositoryInput);
  const repositories = normalizeConfigRepositories(config.repositories);
  delete repositories[repository];
  return {
    ...config,
    repositories
  };
}

function formatAddResult({ repository, repoTruth, configPath }) {
  const lines = [`Added ${repository} to ${configPath}`];
  if (repoTruth) {
    lines.push(`GitHub truth: ${repoTruth.visibility}, default branch ${repoTruth.defaultBranch || "unknown"}`);
  }
  lines.push("Restart the user timer after installing this config on the VPS.");
  return lines.join("\n");
}

function formatCheckResult({ repository, repoTruth, config, configPath }) {
  const policy = normalizeConfigRepositories(config.repositories)[repository];
  const lines = [
    `Repository: ${repository}`,
    `GitHub truth: ${repoTruth.visibility}, default branch ${repoTruth.defaultBranch || "unknown"}`,
    `Config: ${configPath}`,
    policy
      ? `Runner policy: enabled=${policy.enabled !== false}, baseRefs=${normalizeStringList(policy.baseRefs).join(",")}, branchPrefixes=${normalizeStringList(policy.branchPrefixes || policy.branchPrefix).join(",")}`
      : "Runner policy: not allowlisted"
  ];
  return lines.join("\n");
}

function formatRunnerRepositoryList({ config, configPath }) {
  const repositories = normalizeConfigRepositories(config.repositories);
  const names = Object.keys(repositories).sort();
  if (names.length === 0) {
    return `No runner repositories configured in ${configPath}`;
  }
  return [
    `Runner repositories in ${configPath}:`,
    ...names.map((repository) => {
      const policy = repositories[repository];
      return `- ${repository} baseRefs=${normalizeStringList(policy.baseRefs).join(",")} branchPrefixes=${normalizeStringList(policy.branchPrefixes || policy.branchPrefix).join(",")}`;
    })
  ].join("\n");
}

function sortRunnerRepoConfig(config) {
  const repositories = normalizeConfigRepositories(config.repositories);
  return {
    ...config,
    repositories: Object.fromEntries(Object.entries(repositories).sort(([left], [right]) => left.localeCompare(right)))
  };
}

function normalizeConfigRepositories(repositories) {
  if (Array.isArray(repositories)) {
    return Object.fromEntries(
      repositories
        .map((policy) => [normalizeRepository(policy?.repository), policy])
        .filter(([repository]) => repository)
    );
  }
  if (!repositories || typeof repositories !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(repositories)
      .map(([repository, policy]) => [
        normalizeRepository(repository),
        policy && typeof policy === "object" ? policy : { enabled: true }
      ])
      .filter(([repository]) => repository)
  );
}

function resolveConfigPath(configPath = process.env.VTDD_VPS_RUNNER_CONFIG || DEFAULT_CONFIG_PATH) {
  const normalized = normalizeText(configPath) || DEFAULT_CONFIG_PATH;
  if (normalized === "~") {
    return os.homedir();
  }
  if (normalized.startsWith("~/")) {
    return path.join(os.homedir(), normalized.slice(2));
  }
  return path.resolve(normalized);
}

async function runCommandJson(command, args) {
  const result = await runCommand(command, args);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${command} ${args.join(" ")} returned invalid JSON: ${error.message}`);
  }
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}: ${stderr.trim()}`));
    });
  });
}

function normalizeRepository(input) {
  const value = normalizeText(input).replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    return "";
  }
  const [owner, repo] = value.split("/");
  return `${owner}/${repo}`;
}

function normalizeStringList(input) {
  const values = Array.isArray(input) ? input : String(input || "").split(",");
  return dedupe(values.map(normalizeText).filter(Boolean));
}

function dedupe(values) {
  return [...new Set(values)];
}

function normalizeText(input) {
  return String(input || "").trim();
}

function printUsage() {
  console.log(`Usage:
  vtdd-runner-repo add <owner/repo> [--config path] [--base main] [--branch-prefix codex/] [--no-verify]
  vtdd-runner-repo check <owner/repo> [--config path]
  vtdd-runner-repo list [--config path]
  vtdd-runner-repo remove <owner/repo> [--config path]

Butler owns nickname resolution. This helper accepts the resolved canonical owner/repo only.`);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  await main();
}

export {
  addRunnerRepositoryPolicy,
  formatCheckResult,
  formatRunnerRepositoryList,
  normalizeRepository,
  normalizeRepositoryTruth,
  readGitHubRepositoryTruth,
  removeRunnerRepositoryPolicy,
  resolveConfigPath
};
