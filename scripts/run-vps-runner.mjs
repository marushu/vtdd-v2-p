#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const QUEUE_MARKER_RE = /<!--\s*vtdd:vps-runner-execution:([a-zA-Z0-9._:-]+)\s*-->/;
const EVENT_MARKER_RE = /<!--\s*vtdd:vps-runner-event:([a-zA-Z0-9._:-]+)\s*-->/;
const DEFAULT_API_BASE_URL = "https://api.github.com";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = mustGetEnv("GITHUB_TOKEN", process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  const allowedRepositories = parseCsv(mustGetEnv("VTDD_VPS_RUNNER_REPOSITORIES"));
  const workRoot = process.env.VTDD_VPS_RUNNER_WORKDIR || path.join(os.homedir(), "vtdd-runner", "workspaces");
  const githubFetch = createGitHubFetch({
    token,
    apiBaseUrl: process.env.GITHUB_API_URL || DEFAULT_API_BASE_URL
  });

  const result = await runVpsRunnerOnce({
    githubFetch,
    token,
    allowedRepositories,
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

async function runVpsRunnerOnce({ githubFetch, token, allowedRepositories, workRoot, dryRun = false }) {
  const candidates = [];
  for (const repository of allowedRepositories) {
    const comments = await readRecentIssueComments({ githubFetch, repository });
    candidates.push(...selectPendingVpsRunnerExecutions({ comments, allowedRepositories }));
  }

  const execution = candidates.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
  if (!execution) {
    return { ok: true, message: "No pending VPS runner execution found." };
  }

  if (dryRun) {
    return {
      ok: true,
      message: `Dry run selected ${execution.payload.executionId} for ${execution.payload.repository}#${execution.payload.issueNumber}.`
    };
  }

  return executeVpsRunnerExecution({ githubFetch, token, workRoot, execution });
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

function selectPendingVpsRunnerExecutions({ comments, allowedRepositories }) {
  const allowed = new Set(allowedRepositories);
  const queues = new Map();
  const terminalEvents = new Set();
  const runningEvents = new Set();

  for (const comment of comments) {
    const queue = parseVpsRunnerQueueComment(comment.body);
    if (queue.ok && allowed.has(queue.payload.repository)) {
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
  return [
    `Issue: #${payload.issueNumber}`,
    `Execution ID: ${payload.executionId}`,
    "",
    "Created by the VTDD VPS runner.",
    "",
    "Boundaries:",
    "- No merge performed.",
    "- No deploy performed.",
    "- GitHub branch / PR are the runtime truth for Butler progress."
  ].join("\n");
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

function normalizeRepository(value) {
  const text = normalizeText(value);
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text) ? text : "";
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
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
  buildVpsRunnerEventComment,
  classifyVpsRunnerFailure,
  parseVpsRunnerEventComment,
  parseVpsRunnerQueueComment,
  runVpsRunnerOnce,
  selectPendingVpsRunnerExecutions
};
