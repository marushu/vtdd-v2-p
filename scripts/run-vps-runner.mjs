#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseCodexReviewFallbackComment } from "../src/core/index.js";
import { renderPrBody } from "./render-pr-body.mjs";

const QUEUE_MARKER_RE = /<!--\s*vtdd:vps-runner-execution:([a-zA-Z0-9._:-]+)\s*-->/;
const EVENT_MARKER_RE = /<!--\s*vtdd:vps-runner-event:([a-zA-Z0-9._:-]+)\s*-->/;
const DEFAULT_API_BASE_URL = "https://api.github.com";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = mustGetEnv("GITHUB_TOKEN", process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  const repositoryPolicies = await loadVpsRunnerRepositoryPolicies({ env: process.env });
  const workRoot = process.env.VTDD_VPS_RUNNER_WORKDIR || path.join(os.homedir(), "vtdd-runner", "workspaces");
  const githubFetch = createGitHubFetch({
    token,
    apiBaseUrl: process.env.GITHUB_API_URL || DEFAULT_API_BASE_URL
  });

  const result = await runVpsRunnerOnce({
    githubFetch,
    token,
    repositoryPolicies,
    workRoot,
    dryRun: options.dryRun
  });

  if (!result.ok) {
    console.error(result.reason || "VPS runner failed.");
    process.exitCode = 1;
    return;
  }

  console.log(result.message);
}

async function runVpsRunnerOnce({
  githubFetch,
  token,
  allowedRepositories,
  repositoryPolicies,
  workRoot,
  dryRun = false
}) {
  const policies = normalizeRepositoryPolicies({ allowedRepositories, repositoryPolicies });
  const candidates = [];
  for (const repository of policies.map((policy) => policy.repository)) {
    const comments = await readRecentIssueComments({ githubFetch, repository });
    candidates.push(...selectPendingVpsRunnerExecutions({ comments, repositoryPolicies: policies }));
  }

  const execution = candidates.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
  if (execution) {
    if (dryRun) {
      return {
        ok: true,
        message: `Dry run selected ${execution.payload.executionId} for ${execution.payload.repository}#${execution.payload.issueNumber}.`
      };
    }

    return executeVpsRunnerExecution({ githubFetch, token, workRoot, execution });
  }

  const reviewerFallbacks = [];
  for (const repository of policies.map((policy) => policy.repository)) {
    const comments = await readRecentPullRequestComments({ githubFetch, repository });
    reviewerFallbacks.push(...selectPendingVpsReviewerFallbacks({ comments, repositoryPolicies: policies }));
  }

  const reviewerFallback = reviewerFallbacks.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
  if (!reviewerFallback) {
    return { ok: true, message: "No pending VPS runner execution found." };
  }

  if (dryRun) {
    return {
      ok: true,
      message: `Dry run selected Codex reviewer fallback for ${reviewerFallback.repository}#${reviewerFallback.pullRequestNumber}.`
    };
  }

  return executeVpsReviewerFallback({ token, reviewerFallback });
}

async function executeVpsRunnerExecution({ githubFetch, token, workRoot, execution }) {
  const { payload } = execution;
  const env = buildRunnerCommandEnv({ token });
  await postVpsRunnerEvent({
    githubFetch,
    payload,
    event: {
      status: "running",
      lastEvent: "runner_started",
      queueCommentId: execution.commentId
    }
  });

  try {
    const workspace = path.join(workRoot, safePathSegment(payload.repository), payload.executionId);
    await fs.mkdir(path.dirname(workspace), { recursive: true });
    await runCommand("rm", ["-rf", workspace], { env });
    await runCommand("gh", ["repo", "clone", payload.repository, workspace], { env });
    await runCommand("git", ["fetch", "origin", payload.baseRef || "main"], { cwd: workspace, env });
    await runCommand("git", ["checkout", "-B", payload.branch, `origin/${payload.baseRef || "main"}`], {
      cwd: workspace,
      env
    });
    await runCommand("git", ["push", "-u", "origin", payload.branch], { cwd: workspace, env });

    await postVpsRunnerEvent({
      githubFetch,
      payload,
      event: {
        status: "branch_created",
        lastEvent: "branch_pushed",
        branch: payload.branch
      }
    });

    const issue = await githubFetch(`/repos/${payload.repository}/issues/${payload.issueNumber}`);
    const prompt = buildCodexExecutionPrompt({ payload, issue });
    await runCommand("codex", buildCodexExecArgs({ env: process.env }), {
      cwd: workspace,
      env: buildCodexExecutionEnv(process.env),
      input: prompt,
      maxBuffer: 1024 * 1024 * 12
    });

    const status = await runCommand("git", ["status", "--porcelain"], { cwd: workspace, env });
    if (status.stdout.trim()) {
      await runCommand("git", ["add", "-A"], { cwd: workspace, env });
      await runCommand("git", ["commit", "-m", `Implement Issue #${payload.issueNumber} via VTDD VPS runner`], {
        cwd: workspace,
        env
      });
      await runCommand("git", ["push", "origin", payload.branch], { cwd: workspace, env });
    }

    let prUrl = await findExistingPullRequestUrl({
      repository: payload.repository,
      branch: payload.branch,
      env,
      cwd: workspace
    });
    if (!prUrl) {
      const prBody = buildPullRequestBody(payload);
      const pr = await runCommand(
        "gh",
        [
          "pr",
          "create",
          "--draft",
          "--base",
          payload.baseRef || "main",
          "--head",
          payload.branch,
          "--title",
          `Issue #${payload.issueNumber}: VTDD VPS runner handoff`,
          "--body",
          prBody
        ],
        { cwd: workspace, env }
      );
      prUrl = pr.stdout.trim();
    }

    await postVpsRunnerEvent({
      githubFetch,
      payload,
      event: {
        status: "pr_created",
        lastEvent: "pull_request_created",
        branch: payload.branch,
        pr: prUrl
      }
    });

    return { ok: true, message: `VPS runner execution completed: ${prUrl}` };
  } catch (error) {
    const rawFailure = classifyVpsRunnerFailure(error);
    await postVpsRunnerEvent({
      githubFetch,
      payload,
      event: {
        status: "failed",
        lastEvent: "runner_failed",
        rawFailure
      }
    });
    return { ok: false, reason: rawFailure.reason };
  }
}

function selectPendingVpsRunnerExecutions({ comments, allowedRepositories, repositoryPolicies }) {
  const policies = normalizeRepositoryPolicies({ allowedRepositories, repositoryPolicies });
  const queues = new Map();
  const terminalEvents = new Set();
  const runningEvents = new Set();

  for (const comment of comments) {
    const queue = parseVpsRunnerQueueComment(comment.body);
    if (queue.ok && validateVpsRunnerPayloadPolicy(queue.payload, policies).ok) {
      queues.set(queue.payload.executionId, {
        ...queue,
        commentId: comment.id,
        commentUrl: comment.html_url,
        createdAt: comment.created_at
      });
      continue;
    }

    const event = parseVpsRunnerEventComment(comment.body);
    if (!event.ok) {
      continue;
    }
    if (["pr_created", "completed", "failed", "blocked"].includes(event.event.status)) {
      terminalEvents.add(event.executionId);
    }
    if (event.event.status === "running") {
      runningEvents.add(event.executionId);
    }
  }

  return [...queues.values()].filter(
    (queue) => !terminalEvents.has(queue.payload.executionId) && !runningEvents.has(queue.payload.executionId)
  );
}

function selectPendingVpsReviewerFallbacks({ comments, allowedRepositories, repositoryPolicies }) {
  const policies = normalizeRepositoryPolicies({ allowedRepositories, repositoryPolicies });
  return comments
    .map((comment) => {
      const parsed = parseCodexReviewFallbackComment(comment);
      if (!parsed || parsed.status !== "requested") {
        return null;
      }
      if (!String(comment?.body || "").includes("- Delivery mode: `vps_codex_cli`")) {
        return null;
      }
      const repository = normalizeRepository(comment.repository);
      const pullRequestNumber = normalizePositiveInteger(comment.pullRequestNumber);
      if (!repository || !pullRequestNumber) {
        return null;
      }
      if (!policies.some((policy) => policy.repository === repository)) {
        return null;
      }
      return {
        repository,
        pullRequestNumber,
        trigger: extractBacktickedCommentValue(comment.body, "Trigger") || "unknown",
        reason: extractBacktickedCommentValue(comment.body, "Reason") || "gemini_temporarily_unavailable",
        createdAt: comment.created_at,
        commentId: comment.id,
        commentUrl: comment.html_url
      };
    })
    .filter(Boolean);
}

async function loadVpsRunnerRepositoryPolicies({ env = process.env, readFile = fs.readFile } = {}) {
  const configPath = normalizeText(env.VTDD_VPS_RUNNER_CONFIG);
  if (configPath) {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    return normalizeRepositoryPolicies({ config });
  }
  return normalizeRepositoryPolicies({
    allowedRepositories: parseCsv(mustGetEnv("VTDD_VPS_RUNNER_REPOSITORIES", env.VTDD_VPS_RUNNER_REPOSITORIES))
  });
}

function normalizeRepositoryPolicies({ allowedRepositories, repositoryPolicies, config } = {}) {
  if (Array.isArray(repositoryPolicies) && repositoryPolicies.length > 0) {
    return repositoryPolicies.map(normalizeRepositoryPolicy).filter((policy) => policy.repository);
  }

  if (config && typeof config === "object") {
    const repositories = Array.isArray(config.repositories)
      ? config.repositories
      : Object.entries(config.repositories || {}).map(([repository, policy]) => ({
          ...(policy && typeof policy === "object" ? policy : {}),
          repository
        }));
    return repositories
      .filter((policy) => policy?.enabled !== false)
      .map(normalizeRepositoryPolicy)
      .filter((policy) => policy.repository);
  }

  return (allowedRepositories || []).map((repository) => normalizeRepositoryPolicy({ repository }));
}

function normalizeRepositoryPolicy(policy = {}) {
  return {
    repository: normalizeRepository(policy.repository),
    baseRefs: normalizeStringList(policy.baseRefs).length > 0 ? normalizeStringList(policy.baseRefs) : ["main"],
    branchPrefixes:
      normalizeStringList(policy.branchPrefixes || policy.branchPrefix).length > 0
        ? normalizeStringList(policy.branchPrefixes || policy.branchPrefix)
        : ["codex/"]
  };
}

function validateVpsRunnerPayloadPolicy(payload, policies) {
  const policy = policies.find((item) => item.repository === payload.repository);
  if (!policy) {
    return { ok: false, reason: "repository_not_allowlisted" };
  }
  if (!policy.baseRefs.includes(payload.baseRef || "main")) {
    return { ok: false, reason: "base_ref_not_allowlisted" };
  }
  if (!policy.branchPrefixes.some((prefix) => payload.branch.startsWith(prefix))) {
    return { ok: false, reason: "branch_prefix_not_allowlisted" };
  }
  return { ok: true, policy };
}

function parseVpsRunnerQueueComment(body) {
  const text = String(body || "");
  const marker = text.match(QUEUE_MARKER_RE);
  if (!marker) {
    return { ok: false, reason: "vps_runner_queue_marker_missing" };
  }

  const payload = extractFirstJsonFence(text);
  if (!payload) {
    return { ok: false, reason: "vps_runner_payload_missing", executionId: marker[1] };
  }

  const normalized = {
    executionId: normalizeText(payload.executionId),
    transport: normalizeText(payload.transport),
    repository: normalizeRepository(payload.repository),
    issueNumber: normalizePositiveInteger(payload.issueNumber),
    branch: normalizeText(payload.branch),
    baseRef: normalizeText(payload.baseRef) || "main",
    codexGoal: normalizeText(payload.codexGoal),
    approvalScopeMatched: payload.approvalScopeMatched === true,
    handoff: payload.handoff || null
  };

  const issues = [];
  if (normalized.executionId !== marker[1]) {
    issues.push("executionId does not match queue marker");
  }
  if (normalized.transport !== "vps_runner") {
    issues.push("transport must be vps_runner");
  }
  if (!normalized.repository) {
    issues.push("repository is required");
  }
  if (!normalized.issueNumber) {
    issues.push("issueNumber is required");
  }
  if (!normalized.branch) {
    issues.push("branch is required");
  }
  if (!normalized.approvalScopeMatched) {
    issues.push("approvalScopeMatched must be true");
  }

  if (issues.length > 0) {
    return { ok: false, reason: "vps_runner_payload_invalid", executionId: marker[1], issues };
  }

  return { ok: true, executionId: normalized.executionId, payload: normalized };
}

function parseVpsRunnerEventComment(body) {
  const text = String(body || "");
  const marker = text.match(EVENT_MARKER_RE);
  if (!marker) {
    return { ok: false, reason: "vps_runner_event_marker_missing" };
  }
  const event = extractFirstJsonFence(text);
  if (!event) {
    return { ok: false, reason: "vps_runner_event_payload_missing", executionId: marker[1] };
  }
  return { ok: true, executionId: marker[1], event };
}

function buildVpsRunnerEventComment({ executionId, event }) {
  return [`<!-- vtdd:vps-runner-event:${executionId} -->`, "VTDD VPS runner event.", "", fencedJson(event)].join("\n");
}

function buildCodexExecutionPrompt({ payload, issue = {} }) {
  return [
    `Implement the bounded VTDD task for ${payload.repository} issue #${payload.issueNumber}.`,
    "",
    "Canonical Issue spec:",
    `Title: ${normalizeText(issue.title) || "(missing title)"}`,
    "",
    normalizeText(issue.body) || "(missing issue body)",
    "",
    "Hard boundaries:",
    "- Use the GitHub Issue as the canonical spec.",
    "- Keep changes on the current branch.",
    "- Do not merge.",
    "- Do not deploy.",
    "- Do not mutate secrets, permissions, repository settings, or external infrastructure.",
    "- If the Issue is ambiguous or blocked, leave a clear note in the working tree and stop.",
    "",
    `Goal: ${payload.codexGoal}`,
    `Branch: ${payload.branch}`,
    "",
    "When you finish, leave the working tree ready for commit."
  ].join("\n");
}

function classifyVpsRunnerFailure(error) {
  const reason = error instanceof Error ? error.message : String(error);
  if (/bwrap: loopback: Failed RTM_NEWADDR|bubblewrap/i.test(reason)) {
    return {
      error: "codex_sandbox_unavailable",
      reason:
        "Codex CLI sandbox failed on the VPS. Set VTDD_VPS_RUNNER_CODEX_SANDBOX_BYPASS=true only on a trusted runner if this host cannot run bubblewrap networking.",
      rawError: reason
    };
  }
  if (/401 Unauthorized|Missing bearer|authentication/i.test(reason)) {
    return {
      error: "codex_auth_unavailable",
      reason: "Codex CLI is not authenticated on the VPS runner.",
      rawError: reason
    };
  }
  if (/codex .*failed|codex exec/i.test(reason)) {
    return {
      error: "codex_execution_failed",
      reason
    };
  }
  return {
    error: "vps_runner_execution_failed",
    reason
  };
}

function buildCodexExecArgs({ env = {} } = {}) {
  if (env.VTDD_VPS_RUNNER_CODEX_SANDBOX_BYPASS === "true") {
    return ["exec", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", "-"];
  }
  const sandbox = normalizeText(env.VTDD_VPS_RUNNER_CODEX_SANDBOX) || "workspace-write";
  return ["exec", "--skip-git-repo-check", "--sandbox", sandbox, "-"];
}

async function readRecentIssueComments({ githubFetch, repository }) {
  const issues = await githubFetch(`/repos/${repository}/issues?state=open&sort=updated&direction=desc&per_page=100`);
  const comments = [];
  for (const issue of issues.filter((item) => !item.pull_request)) {
    const issueComments = await githubFetch(`/repos/${repository}/issues/${issue.number}/comments?per_page=100`);
    comments.push(...issueComments);
  }
  return comments;
}

async function readRecentPullRequestComments({ githubFetch, repository }) {
  const pulls = await githubFetch(`/repos/${repository}/pulls?state=open&sort=updated&direction=desc&per_page=100`);
  const comments = [];
  for (const pull of pulls) {
    const issueComments = await githubFetch(`/repos/${repository}/issues/${pull.number}/comments?per_page=100`);
    comments.push(
      ...issueComments.map((comment) => ({
        ...comment,
        repository,
        pullRequestNumber: pull.number
      }))
    );
  }
  return comments;
}

async function executeVpsReviewerFallback({ token, reviewerFallback }) {
  const env = {
    ...buildRunnerCommandEnv({ token }),
    TARGET_REPOSITORY: reviewerFallback.repository,
    TARGET_PR_NUMBER: String(reviewerFallback.pullRequestNumber),
    CODEX_FALLBACK_TRIGGER: reviewerFallback.trigger,
    CODEX_FALLBACK_REASON: reviewerFallback.reason,
    CODEX_FALLBACK_DELIVERY_MODE: "vps_codex_cli"
  };
  const scriptPath = path.join(SCRIPT_DIR, "run-codex-pr-review-fallback.mjs");
  try {
    await runCommand("node", [scriptPath], {
      cwd: path.dirname(SCRIPT_DIR),
      env,
      maxBuffer: 1024 * 1024 * 12
    });
    return {
      ok: true,
      message: `VPS Codex reviewer fallback completed for ${reviewerFallback.repository}#${reviewerFallback.pullRequestNumber}.`
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

async function postVpsRunnerEvent({ githubFetch, payload, event }) {
  return githubFetch(`/repos/${payload.repository}/issues/${payload.issueNumber}/comments`, {
    method: "POST",
    body: {
      body: buildVpsRunnerEventComment({
        executionId: payload.executionId,
        event: {
          ...event,
          executionId: payload.executionId,
          repository: payload.repository,
          issueNumber: payload.issueNumber
        }
      })
    }
  });
}

async function findExistingPullRequestUrl({ repository, branch, env, cwd }) {
  try {
    const result = await runCommand("gh", ["pr", "list", "--repo", repository, "--head", branch, "--json", "url", "--limit", "1"], {
      cwd,
      env
    });
    const parsed = JSON.parse(result.stdout || "[]");
    return parsed[0]?.url || "";
  } catch {
    return "";
  }
}

function buildPullRequestBody(payload) {
  return renderPrBody({
    issue: payload.issueNumber,
    executionId: payload.executionId,
    codexGoal: payload.codexGoal || "open_pr",
    intent: `VPS runner handoff for Issue #${payload.issueNumber}.`,
    satisfied: [
      "VPS runner created the target branch.",
      "VPS runner opened this draft PR as GitHub-visible runtime truth."
    ].join("\n"),
    unsatisfied: "Human review and merge remain pending.",
    nonGoals: "None.",
    unit: "Not run by VPS runner.",
    integration: "Not run by VPS runner.",
    e2e: "GitHub branch / PR creation is the runtime evidence for this handoff.",
    manual: "VPS runner executed the bounded Codex handoff.",
    evidencePath: `Issue #${payload.issueNumber}, branch ${payload.branch || "not provided"}, execution ${payload.executionId}`,
    cloudflareDeploy: "Not performed.",
    actionSchemaUpdate: "Not required.",
    instructionsUpdate: "Not required.",
    iphoneButlerE2E: "Progress must be read through vtddExecutionProgress / GitHub runtime truth.",
    rules: [
      "Queued handoff alone is not success.",
      "GitHub branch / PR / raw failure are runtime truth.",
      "No merge or deploy is performed by the VPS runner."
    ].join("\n"),
    outOfScope: [
      "Merge.",
      "Deploy.",
      "Secret, permission, or repository settings mutation."
    ].join("\n")
  });
}

function createGitHubFetch({ apiBaseUrl, token }) {
  return async function githubFetch(pathname, init = {}) {
    const response = await fetch(`${apiBaseUrl}${pathname}`, {
      method: init.method || "GET",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28"
      },
      body: init.body ? JSON.stringify(init.body) : undefined
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`GitHub API ${response.status}: ${body?.message || text}`);
    }
    return body;
  };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const maxBuffer = options.maxBuffer || 1024 * 1024 * 4;
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > maxBuffer) {
        child.kill("SIGTERM");
        reject(new Error(`${command} stdout exceeded ${maxBuffer} bytes`));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > maxBuffer) {
        child.kill("SIGTERM");
        reject(new Error(`${command} stderr exceeded ${maxBuffer} bytes`));
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}: ${stderr || stdout}`));
    });
    if (options.input) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}

function buildRunnerCommandEnv({ token }) {
  return {
    ...process.env,
    GH_TOKEN: token,
    GITHUB_TOKEN: token
  };
}

function buildCodexExecutionEnv(env) {
  const allowedNames = [
    "CI",
    "CODEX_HOME",
    "HOME",
    "LANG",
    "LC_ALL",
    "PATH",
    "RUNNER_TEMP",
    "TMPDIR",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME"
  ];
  return Object.fromEntries(
    allowedNames
      .map((name) => [name, env[name]])
      .filter(([, value]) => typeof value === "string" && value.length > 0)
  );
}

function extractFirstJsonFence(text) {
  const fenced = String(text || "").match(/```json\s*([\s\S]*?)```/i);
  if (!fenced) {
    return null;
  }
  try {
    return JSON.parse(fenced[1]);
  } catch {
    return null;
  }
}

function fencedJson(value) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function extractBacktickedCommentValue(body, label) {
  const match = String(body || "").match(new RegExp(`- ${escapeRegExp(label)}: \\\`([^\\\`]+)\\\``));
  return normalizeText(match?.[1]);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRepository(value) {
  const text = normalizeText(value);
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text) ? text : "";
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function normalizeStringList(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return values.map(normalizeText).filter(Boolean);
}

function safePathSegment(value) {
  return String(value || "").replace(/[^A-Za-z0-9_.-]+/g, "_");
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mustGetEnv(name, value = process.env[name]) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseArgs(args) {
  return {
    dryRun: args.includes("--dry-run")
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export {
  buildCodexExecutionPrompt,
  buildCodexExecArgs,
  buildPullRequestBody,
  buildVpsRunnerEventComment,
  classifyVpsRunnerFailure,
  loadVpsRunnerRepositoryPolicies,
  normalizeRepositoryPolicies,
  parseVpsRunnerEventComment,
  parseVpsRunnerQueueComment,
  runVpsRunnerOnce,
  selectPendingVpsReviewerFallbacks,
  selectPendingVpsRunnerExecutions
};
