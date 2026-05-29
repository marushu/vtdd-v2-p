#!/usr/bin/env node

import fs from "node:fs/promises";
import {
  APPROVE_AUTO_MERGE_BLOCKED_MARKER,
  APPROVE_AUTO_MERGE_CANDIDATE_MARKER,
  APPROVE_AUTO_MERGE_EXECUTED_MARKER,
  ActorRole,
  TaskMode,
  buildApproveAutoMergeMemoryRecord,
  evaluateApproveAutoMerge,
  evaluateExecutionContinuity,
  formatApproveAutoMergeBlockedComment,
  formatApproveAutoMergeCandidateComment,
  formatApproveAutoMergeExecutedComment,
  resolveApproveAutoMergePolicy
} from "../src/core/index.js";

async function main() {
  const repository = mustGetEnv("GITHUB_REPOSITORY");
  const token = mustGetEnv("GITHUB_TOKEN");
  const apiBaseUrl = process.env.GITHUB_API_URL || "https://api.github.com";
  const githubFetch = createGitHubFetch({ apiBaseUrl, token });
  const eventName = process.env.GITHUB_EVENT_NAME || "";
  const eventPath = process.env.GITHUB_EVENT_PATH || "";
  const payload = eventPath ? JSON.parse(await fs.readFile(eventPath, "utf8")) : {};
  const pullNumbers = await resolvePullNumbers({
    payload,
    env: process.env,
    repository,
    githubFetch
  });

  if (pullNumbers.length === 0) {
    console.log("No pull request candidate for approve auto merge.");
    return;
  }

  for (const pullNumber of pullNumbers) {
    await processPullRequest({
      githubFetch,
      repository,
      pullNumber,
      eventName,
      env: process.env
    });
  }
}

async function processPullRequest({ githubFetch, repository, pullNumber, eventName, env }) {
  const pullRequest = await githubFetch(`/repos/${repository}/pulls/${pullNumber}`);
  if (pullRequest.state !== "open") {
    console.log(`Skipping PR #${pullNumber}: state=${pullRequest.state}.`);
    return;
  }

  const [issue, files, issueComments, reviewComments, reviews, checkRunsResponse] = await Promise.all([
    githubFetch(`/repos/${repository}/issues/${pullNumber}`),
    githubFetchAll(githubFetch, `/repos/${repository}/pulls/${pullNumber}/files?per_page=100`),
    githubFetchAll(githubFetch, `/repos/${repository}/issues/${pullNumber}/comments?per_page=100`),
    githubFetchAll(githubFetch, `/repos/${repository}/pulls/${pullNumber}/comments?per_page=100`),
    githubFetchAll(githubFetch, `/repos/${repository}/pulls/${pullNumber}/reviews?per_page=100`),
    githubFetch(`/repos/${repository}/commits/${pullRequest.head.sha}/check-runs?per_page=100`)
  ]);

  const labels = normalizeLabels(issue.labels);
  const policyMode = resolveApproveAutoMergePolicy({
    policyMode: env.VTDD_AUTO_MERGE_POLICY,
    labels
  });
  const runtimePullRequest = {
    repository,
    number: pullRequest.number,
    url: pullRequest.html_url,
    state: pullRequest.state,
    title: pullRequest.title,
    body: pullRequest.body,
    draft: pullRequest.draft === true,
    baseRef: pullRequest.base?.ref,
    headRef: pullRequest.head?.ref,
    headSha: pullRequest.head?.sha,
    mergeable: pullRequest.mergeable,
    mergeableState: pullRequest.mergeable_state,
    reviewDecision: pullRequest.review_decision,
    issueComments,
    reviewComments,
    reviews,
    files,
    labels
  };
  const continuity = evaluateExecutionContinuity({
    mode: TaskMode.EXECUTION,
    actorRole: ActorRole.EXECUTOR,
    runtimeTruth: {
      runtimeState: {
        pullRequest: runtimePullRequest
      }
    }
  });
  if (!continuity.ok) {
    console.log(`Skipping PR #${pullNumber}: continuity failed: ${continuity.reason || continuity.error}`);
    return;
  }

  const evaluation = evaluateApproveAutoMerge({
    policyMode,
    labels,
    pullRequest: {
      ...runtimePullRequest,
      issueNumber: extractIssueNumber(pullRequest.body)
    },
    reviewLoop: continuity.value.reviewLoop,
    checkRuns: checkRunsResponse.check_runs || [],
    requiredChecks: env.VTDD_AUTO_MERGE_REQUIRED_CHECKS
  });

  const contextPull = {
    repository,
    number: pullRequest.number,
    issueNumber: extractIssueNumber(pullRequest.body),
    body: pullRequest.body,
    state: pullRequest.state,
    draft: pullRequest.draft,
    headSha: pullRequest.head?.sha,
    mergeable: pullRequest.mergeable,
    mergeableState: pullRequest.mergeable_state
  };

  if (!evaluation.allowed) {
    if (policyMode === "approve_auto_merge" && shouldPostBlockedComment({ evaluation, issueComments, headSha: pullRequest.head?.sha })) {
      await githubFetch(`/repos/${repository}/issues/${pullNumber}/comments`, {
        method: "POST",
        body: {
          body: formatApproveAutoMergeBlockedComment({
            pullRequest: contextPull,
            evaluation
          })
        }
      });
      await notifyDashboardEvent({
        env,
        repository,
        pullRequest,
        title: `自動マージ停止: PR #${pullNumber}`,
        status: "completed",
        conclusion: "action_required"
      });
      console.log(`Posted approve auto merge blocked evidence on PR #${pullNumber}.`);
    } else {
      console.log(`Skipping PR #${pullNumber}: ${evaluation.reasons.join("; ")}`);
    }
    return;
  }

  if (hasExecutedAutoMergeComment({ issueComments, headSha: pullRequest.head?.sha })) {
    console.log(`Skipping PR #${pullNumber}: auto merge already executed for this head.`);
    return;
  }

  if (!hasCandidateAutoMergeComment({ issueComments, headSha: pullRequest.head?.sha })) {
    await githubFetch(`/repos/${repository}/issues/${pullNumber}/comments`, {
      method: "POST",
      body: {
        body: formatApproveAutoMergeCandidateComment({
          pullRequest: contextPull,
          evaluation
        })
      }
    });
    await notifyDashboardEvent({
      env,
      repository,
      pullRequest,
      title: `自動マージ候補: PR #${pullNumber}`,
      status: "in_progress",
      conclusion: ""
    });
  }

  const mergeMethod = normalizeMergeMethod(env.VTDD_AUTO_MERGE_METHOD) || "squash";
  let mergeResult;
  try {
    mergeResult = await githubFetch(`/repos/${repository}/pulls/${pullNumber}/merge`, {
      method: "PUT",
      body: {
        merge_method: mergeMethod,
        commit_title: `自動マージ: PR #${pullNumber} ${pullRequest.title || ""}`.trim(),
        commit_message: [
          "VTDD approve_auto_merge により自動マージしました。",
          "",
          `検索語: 自動マージ`,
          `Repository: ${repository}`,
          `PR: #${pullNumber}`,
          `Head SHA: ${pullRequest.head?.sha || "unknown"}`,
          `Triggered by: ${eventName || "unknown"}`
        ].join("\n")
      }
    });
  } catch (error) {
    if (!isMergeAlreadyInProgressError(error)) {
      throw error;
    }
    console.log(`Skipping PR #${pullNumber}: merge is already in progress by another approve-auto-merge run.`);
    return;
  }

  const memoryWrite = await persistApproveAutoMergeMemory({
    env,
    evaluation,
    pullRequest: contextPull,
    mergeResult
  });
  const latestIssueComments = await githubFetchAll(githubFetch, `/repos/${repository}/issues/${pullNumber}/comments?per_page=100`);
  if (hasExecutedAutoMergeComment({ issueComments: latestIssueComments, headSha: pullRequest.head?.sha })) {
    console.log(`Skipping PR #${pullNumber}: auto merge executed comment already exists after merge.`);
    return;
  }

  await githubFetch(`/repos/${repository}/issues/${pullNumber}/comments`, {
    method: "POST",
    body: {
      body: formatApproveAutoMergeExecutedComment({
        pullRequest: contextPull,
        evaluation,
        mergeResult,
        memoryWrite
      })
    }
  });

  await notifyDashboardEvent({
    env,
    repository,
    pullRequest,
    title: `自動マージ完了: PR #${pullNumber}`,
    status: "completed",
    conclusion: "success"
  });

  console.log(`Auto-merged PR #${pullNumber}: ${mergeResult.sha || "sha unknown"}.`);
}

async function persistApproveAutoMergeMemory({ env, evaluation, pullRequest, mergeResult }) {
  const runtimeUrl = String(env.VTDD_RUNTIME_URL || "").trim();
  const token = String(env.VTDD_GATEWAY_BEARER_TOKEN || "").trim();
  if (!runtimeUrl || !token) {
    return {
      ok: false,
      error: "memory_write_not_configured",
      reason: "VTDD_RUNTIME_URL or VTDD_GATEWAY_BEARER_TOKEN is missing."
    };
  }

  const endpoint = new URL("/v2/action/memory-write", runtimeUrl);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(buildApproveAutoMergeMemoryRecord({ evaluation, pullRequest, mergeResult }))
    });
  } catch (error) {
    return {
      ok: false,
      error: "memory_write_request_failed",
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  const body = await readResponseJson(response);
  if (!response.ok || body?.ok !== true || !body?.memoryWritePersisted?.recordId) {
    return {
      ok: false,
      error: body?.error || "memory_write_failed",
      reason:
        body?.reason ||
        `memory write returned HTTP ${response.status} without persisted recordId`
    };
  }

  return {
    ok: true,
    recordId: body.memoryWritePersisted.recordId,
    recordType: body.memoryWritePersisted.recordType,
    timestamp: body.memoryWritePersisted.timestamp
  };
}

async function notifyDashboardEvent({ env, repository, pullRequest, title, status, conclusion }) {
  const runtimeUrl = String(env.VTDD_RUNTIME_URL || "").trim();
  const token = String(env.VTDD_GATEWAY_BEARER_TOKEN || "").trim();
  if (!runtimeUrl || !token) {
    console.log("Skipping dashboard event notification: VTDD_RUNTIME_URL or VTDD_GATEWAY_BEARER_TOKEN is missing.");
    return;
  }
  const endpoint = new URL("/v2/events/github-actions", runtimeUrl);
  const runUrl = [
    env.GITHUB_SERVER_URL || "https://github.com",
    repository,
    "actions/runs",
    env.GITHUB_RUN_ID || ""
  ].filter(Boolean).join("/");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      repository,
      workflowName: "approve-auto-merge",
      runId: env.GITHUB_RUN_ID || `approve-auto-merge-pr-${pullRequest.number}`,
      runUrl,
      status,
      conclusion: conclusion || undefined,
      headSha: pullRequest.head?.sha,
      headBranch: pullRequest.head?.ref,
      displayTitle: title,
      changeSummary: pullRequest.title,
      pullNumber: pullRequest.number,
      updatedAt: new Date().toISOString()
    })
  });
  if (!response.ok) {
    const text = await response.text();
    console.log(`Dashboard event notification failed with HTTP ${response.status}: ${text.slice(0, 240)}`);
  }
}

async function readResponseJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { error: "invalid_json_response", reason: text.slice(0, 240) };
  }
}

export async function resolvePullNumbers({ payload, env, repository, githubFetch }) {
  const explicit = normalizePositiveInteger(env.TARGET_PR_NUMBER);
  if (explicit) {
    return [explicit];
  }
  const pullNumbers = new Set();
  if (normalizePositiveInteger(payload?.pull_request?.number)) {
    pullNumbers.add(Number(payload.pull_request.number));
  }
  if (payload?.issue?.pull_request && normalizePositiveInteger(payload?.issue?.number)) {
    pullNumbers.add(Number(payload.issue.number));
  }
  for (const pull of payload?.workflow_run?.pull_requests || []) {
    if (normalizePositiveInteger(pull?.number)) {
      pullNumbers.add(Number(pull.number));
    }
  }
  if (pullNumbers.size === 0 && payload?.workflow_run && githubFetch && repository) {
    for (const number of await resolveWorkflowRunPullNumbers({ payload, repository, githubFetch })) {
      pullNumbers.add(number);
    }
  }
  return [...pullNumbers];
}

async function resolveWorkflowRunPullNumbers({ payload, repository, githubFetch }) {
  const pullNumbers = new Set();
  const headSha = String(payload?.workflow_run?.head_sha || "").trim();
  if (headSha) {
    const pulls = await githubFetch(
      `/repos/${repository}/commits/${encodeURIComponent(headSha)}/pulls`
    );
    const openMatches = (Array.isArray(pulls) ? pulls : []).filter(
      (pull) => String(pull?.state || "").toLowerCase() === "open" && normalizePositiveInteger(pull?.number)
    );
    if (openMatches.length === 1) {
      pullNumbers.add(Number(openMatches[0].number));
    }
  }
  if (pullNumbers.size === 0) {
    const title = String(payload?.workflow_run?.display_title || "").trim();
    if (title) {
      const pulls = await githubFetch(`/repos/${repository}/pulls?state=open&per_page=100`);
      const exactMatches = (Array.isArray(pulls) ? pulls : []).filter(
        (pull) => String(pull?.title || "").trim() === title && normalizePositiveInteger(pull?.number)
      );
      if (exactMatches.length === 1) {
        pullNumbers.add(Number(exactMatches[0].number));
      }
    }
  }
  return [...pullNumbers];
}

function shouldPostBlockedComment({ evaluation, issueComments, headSha }) {
  if (evaluation.reasons.includes("latest trusted reviewer action is not approve.")) {
    return false;
  }
  if (evaluation.reasons.includes("reviewer evidence head SHA is missing.")) {
    return false;
  }
  return !issueComments.some(
    (comment) =>
      String(comment?.body || "").includes(APPROVE_AUTO_MERGE_BLOCKED_MARKER) &&
      String(comment?.body || "").includes(String(headSha || ""))
  );
}

function hasCandidateAutoMergeComment({ issueComments, headSha }) {
  return issueComments.some(
    (comment) =>
      String(comment?.body || "").includes(APPROVE_AUTO_MERGE_CANDIDATE_MARKER) &&
      String(comment?.body || "").includes(String(headSha || ""))
  );
}

function hasExecutedAutoMergeComment({ issueComments, headSha }) {
  return issueComments.some(
    (comment) =>
      String(comment?.body || "").includes(APPROVE_AUTO_MERGE_EXECUTED_MARKER) &&
      String(comment?.body || "").includes(String(headSha || ""))
  );
}

function extractIssueNumber(body) {
  const match = String(body || "").match(/(?:Issue|Related Issue|Closes)\s+#([0-9]+)/i);
  return normalizePositiveInteger(match?.[1]);
}

function normalizeMergeMethod(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["merge", "squash", "rebase"].includes(normalized) ? normalized : null;
}

export function isMergeAlreadyInProgressError(error) {
  const status = Number(error?.status || 0);
  const message = [
    error?.message,
    error?.body?.message,
    error?.responseText
  ].filter(Boolean).join("\n");
  return status === 405 && message.includes("Merge already in progress");
}

function normalizePositiveInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeLabels(value) {
  return (Array.isArray(value) ? value : [])
    .map((label) => String(typeof label === "string" ? label : label?.name || "").trim().toLowerCase())
    .filter(Boolean);
}

async function githubFetchAll(githubFetch, firstPath) {
  const records = [];
  let path = firstPath;
  for (let page = 0; page < 10 && path; page += 1) {
    const result = await githubFetch(path, { includeHeaders: true });
    const body = Array.isArray(result.body) ? result.body : [];
    records.push(...body);
    path = parseNextPath(result.headers.get("link"));
  }
  return records;
}

function parseNextPath(linkHeader) {
  const link = String(linkHeader || "");
  const match = link
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.includes('rel="next"'))
    ?.match(/<([^>]+)>/);
  if (!match) {
    return null;
  }
  const url = new URL(match[1]);
  return `${url.pathname}${url.search}`;
}

function createGitHubFetch({ apiBaseUrl, token }) {
  return async function githubFetch(pathname, init = {}) {
    const response = await fetch(`${apiBaseUrl}${pathname}`, {
      method: init.method || "GET",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "vtdd-v2-approve-auto-merge"
      },
      body: init.body ? JSON.stringify(init.body) : undefined
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(`GitHub API ${response.status}: ${body?.message || text}`);
      error.status = response.status;
      error.body = body;
      error.responseText = text;
      throw error;
    }
    if (init.includeHeaders) {
      return { body, headers: response.headers };
    }
    return body;
  };
}

function mustGetEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
