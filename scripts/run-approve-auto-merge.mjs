#!/usr/bin/env node

import fs from "node:fs/promises";
import {
  APPROVE_AUTO_MERGE_BLOCKED_MARKER,
  APPROVE_AUTO_MERGE_CANDIDATE_MARKER,
  APPROVE_AUTO_MERGE_EXECUTED_MARKER,
  ActorRole,
  TaskMode,
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
  const pullNumbers = resolvePullNumbers({ payload, env: process.env });

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
  const mergeResult = await githubFetch(`/repos/${repository}/pulls/${pullNumber}/merge`, {
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

  await githubFetch(`/repos/${repository}/issues/${pullNumber}/comments`, {
    method: "POST",
    body: {
      body: formatApproveAutoMergeExecutedComment({
        pullRequest: contextPull,
        evaluation,
        mergeResult
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
      updatedAt: new Date().toISOString()
    })
  });
  if (!response.ok) {
    const text = await response.text();
    console.log(`Dashboard event notification failed with HTTP ${response.status}: ${text.slice(0, 240)}`);
  }
}

function resolvePullNumbers({ payload, env }) {
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
      throw new Error(`GitHub API ${response.status}: ${body?.message || text}`);
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
