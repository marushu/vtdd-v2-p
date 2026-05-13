import { validateReviewerResponse } from "./reviewer-contract.js";
import { normalizeMentionLogin } from "./github-mention.js";
import { formatReviewerOperatorSummary } from "./reviewer-operator-summary.js";

export const GEMINI_PR_REVIEW_MARKER = "<!-- vtdd:reviewer=gemini -->";
export const REVIEWER_OBJECTION_RESOLUTION_MARKER = "<!-- vtdd:reviewer-objection-resolution -->";
export const DEFAULT_GEMINI_REVIEW_MODEL = "gemini-2.5-flash";
export const MAX_DIFF_CHARACTERS = 60000;
export const MAX_CONTEXT_COMMENTS = 10;

export function resolveGeminiReviewTrigger(input = {}) {
  const eventName = normalizeText(input.eventName);
  const payload = normalizeObject(input.payload);

  if (eventName === "pull_request_target") {
    const action = normalizeText(payload.action);
    const pullRequest = normalizeObject(payload.pull_request);
    if (!["opened", "reopened", "synchronize", "ready_for_review"].includes(action)) {
      return skip("unsupported_pull_request_action");
    }
    return {
      ok: true,
      value: {
        shouldReview: true,
        trigger: `pull_request_target:${action}`,
        pullRequestNumber: normalizePositiveInteger(pullRequest.number)
      }
    };
  }

  if (eventName === "issue_comment") {
    const issue = normalizeObject(payload.issue);
    const comment = normalizeObject(payload.comment);
    if (!issue.pull_request) {
      return skip("issue_comment_not_for_pull_request");
    }
    if (
      !isTrustedReviewerObjectionResolution(comment.body) &&
      (isBotTriggered(payload) || containsReviewerMarker(comment.body))
    ) {
      return skip("bot_or_marker_comment");
    }
    return {
      ok: true,
      value: {
        shouldReview: true,
        trigger: "issue_comment:created",
        pullRequestNumber: normalizePositiveInteger(issue.number)
      }
    };
  }

  if (eventName === "pull_request_review") {
    const review = normalizeObject(payload.review);
    const pullRequest = normalizeObject(payload.pull_request);
    if (!["submitted", "edited"].includes(normalizeText(payload.action))) {
      return skip("unsupported_pull_request_review_action");
    }
    if (isBotTriggered(payload) || containsReviewerMarker(review.body)) {
      return skip("bot_or_marker_review");
    }
    return {
      ok: true,
      value: {
        shouldReview: true,
        trigger: `pull_request_review:${normalizeText(payload.action)}`,
        pullRequestNumber: normalizePositiveInteger(pullRequest.number)
      }
    };
  }

  if (eventName === "pull_request_review_comment") {
    const comment = normalizeObject(payload.comment);
    const pullRequest = normalizeObject(payload.pull_request);
    if (!["created", "edited"].includes(normalizeText(payload.action))) {
      return skip("unsupported_pull_request_review_comment_action");
    }
    if (isBotTriggered(payload) || containsReviewerMarker(comment.body)) {
      return skip("bot_or_marker_review_comment");
    }
    return {
      ok: true,
      value: {
        shouldReview: true,
        trigger: `pull_request_review_comment:${normalizeText(payload.action)}`,
        pullRequestNumber: normalizePositiveInteger(pullRequest.number)
      }
    };
  }

  return skip("unsupported_event");
}

export function buildPullRequestDiff(files = [], options = {}) {
  const maxCharacters = normalizePositiveInteger(options.maxCharacters) || MAX_DIFF_CHARACTERS;
  const chunks = [];

  for (const file of files) {
    const name = normalizeText(file?.filename) || "unknown";
    const status = normalizeText(file?.status) || "modified";
    const patch = normalizeText(file?.patch);
    const fileChunk = [
      `diff --git a/${name} b/${name}`,
      `status: ${status}`,
      patch || "[patch unavailable]"
    ].join("\n");
    chunks.push(fileChunk);
  }

  const joined = chunks.join("\n\n");
  if (joined.length <= maxCharacters) {
    return joined;
  }
  return `${joined.slice(0, maxCharacters)}\n\n[diff truncated]`;
}

export function buildPullRequestReviewContext(input = {}) {
  const repository = normalizeText(input.repository) || "unknown/unknown";
  const trigger = normalizeText(input.trigger) || "unknown";
  const pullRequest = normalizeObject(input.pullRequest);
  const files = Array.isArray(input.files) ? input.files : [];
  const issueComments = summarizeComments(input.issueComments);
  const reviewComments = summarizeComments(input.reviewComments);
  const reviews = summarizeReviews(input.reviews);
  const reviewResponseSummary = buildReviewResponseSummary({
    pullRequest,
    files,
    issueComments: input.issueComments,
    reviewComments: input.reviewComments
  });

  const fileSummary = files.map((file) => {
    const filename = normalizeText(file?.filename) || "unknown";
    const status = normalizeText(file?.status) || "modified";
    return `- ${filename} (${status})`;
  });

  return [
    `Repository: ${repository}`,
    `Trigger: ${trigger}`,
    `PR: #${normalizePositiveInteger(pullRequest.number) || "unknown"} ${normalizeText(pullRequest.title)}`,
    `PR state: ${normalizeText(pullRequest.state) || "open"}`,
    `Base <- Head: ${normalizeText(pullRequest.base?.ref)} <- ${normalizeText(pullRequest.head?.ref)}`,
    `Author: ${normalizeText(pullRequest.user?.login) || "unknown"}`,
    "",
    "PR body:",
    normalizeMultilineText(pullRequest.body) || "[no body]",
    "",
    "Changed files:",
    fileSummary.length > 0 ? fileSummary.join("\n") : "[no changed files]",
    "",
    "Recent PR comments:",
    issueComments.length > 0 ? issueComments.join("\n") : "[no recent PR comments]",
    "",
    "Recent review comments:",
    reviewComments.length > 0 ? reviewComments.join("\n") : "[no recent review comments]",
    "",
    "Recent reviews:",
    reviews.length > 0 ? reviews.join("\n") : "[no recent reviews]",
    "",
    "Review response summary:",
    reviewResponseSummary
      ? formatReviewResponseSummary(reviewResponseSummary)
      : "[no request_changes response summary]"
  ].join("\n");
}

export function buildReviewResponseSummary(input = {}) {
  const pullRequest = normalizeObject(input.pullRequest);
  const comments = [
    ...(Array.isArray(input.issueComments) ? input.issueComments : []),
    ...(Array.isArray(input.reviewComments) ? input.reviewComments : [])
  ];
  const latestReviewer = collectLatestGeminiReviewerComment(comments);
  if (!latestReviewer || latestReviewer.recommendedAction !== "request_changes") {
    return null;
  }

  const responseComments = sortResponseCommentsByCreatedAt(excludeAmbiguousResponseCommentTimes(comments
    .filter((comment) =>
      isTrustedReviewerObjectionResolutionComment(comment) &&
      isAfterReviewerMarker(comment, latestReviewer)
    )
    .map((comment) => ({
      url: normalizeText(comment?.url ?? comment?.htmlUrl ?? comment?.html_url) || null,
      author: normalizeCommentAuthor(comment) || null,
      createdAt: normalizeText(comment?.createdAt ?? comment?.created_at) || null,
      updatedAt: normalizeText(comment?.updatedAt ?? comment?.updated_at) || null,
      body: normalizeMultilineText(comment?.body)
    }))
    .filter((comment) => comment.body)));
  const responseText = responseComments.map((comment) => comment.body).join("\n\n");
  const criticalFindings = latestReviewer.criticalFindings;
  const risks = latestReviewer.risks;
  const findingResponses = criticalFindings.map((finding, index) =>
    mapFindingResponse({
      finding,
      index,
      responseText
    })
  );
  const unresolvedItems = findingResponses
    .filter((item) => item.status !== "addressed")
    .map((item) => item.finding);

  return {
    reviewerCommentUrl: latestReviewer.url,
    currentRecommendedAction: latestReviewer.recommendedAction,
    criticalFindings,
    risks,
    findingResponses,
    filesChangedInResponse: summarizeChangedFiles(input.files),
    testsEvidenceRun: extractReviewResponseEvidence({
      pullRequestBody: pullRequest.body,
      responseText
    }),
    responseCommentUrls: responseComments.map((comment) => comment.url).filter(Boolean),
    unresolvedItems,
    complete: unresolvedItems.length === 0
  };
}

function collectLatestGeminiReviewerComment(comments) {
  const reviewerSignals = (Array.isArray(comments) ? comments : [])
    .map(parseGeminiReviewComment)
    .filter(Boolean)
    .map((signal) => ({
      signal,
      sortTime: reviewSignalSortTime(signal)
    }))
    .filter(({ sortTime }) => isValidIsoTime(sortTime))
    .sort((left, right) => Date.parse(left.sortTime) - Date.parse(right.sortTime));

  const latest = reviewerSignals.at(-1);
  if (!latest) {
    return null;
  }
  const latestTime = Date.parse(latest.sortTime);
  const sameLatestTimeCount = reviewerSignals.filter(({ sortTime }) => Date.parse(sortTime) === latestTime).length;
  if (sameLatestTimeCount > 1) {
    return null;
  }
  return latest.signal;
}

function reviewSignalSortTime(signal) {
  return normalizeText(signal?.updatedAt) || normalizeText(signal?.createdAt);
}

function isAfterReviewerMarker(comment, reviewerSignal) {
  const reviewerTime = reviewSignalSortTime(reviewerSignal);
  const responseTime = normalizeCommentCreatedTime(comment);
  if (!isValidIsoTime(reviewerTime) || !isValidIsoTime(responseTime)) {
    return false;
  }
  return Date.parse(responseTime) > Date.parse(reviewerTime);
}

function normalizeCommentCreatedTime(comment) {
  return normalizeText(comment?.createdAt ?? comment?.created_at);
}

function isValidIsoTime(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(normalizeText(value));
}

function excludeAmbiguousResponseCommentTimes(comments) {
  const counts = new Map();
  for (const comment of comments) {
    const time = normalizeText(comment?.createdAt);
    counts.set(time, (counts.get(time) || 0) + 1);
  }
  return comments.filter((comment) => counts.get(normalizeText(comment?.createdAt)) === 1);
}

function sortResponseCommentsByCreatedAt(comments) {
  return [...comments].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

function compareIsoText(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime - rightTime;
  }
  return normalizeText(left).localeCompare(normalizeText(right));
}

export function formatReviewResponseSummary(summary = {}) {
  const criticalFindings = normalizeStringArray(summary.criticalFindings);
  const risks = normalizeStringArray(summary.risks);
  const filesChanged = normalizeStringArray(summary.filesChangedInResponse);
  const testsEvidence = normalizeStringArray(summary.testsEvidenceRun);
  const unresolvedItems = normalizeStringArray(summary.unresolvedItems);
  const responseUrls = normalizeStringArray(summary.responseCommentUrls);
  const findingResponses = Array.isArray(summary.findingResponses) ? summary.findingResponses : [];

  return [
    `Reviewer comment URL: ${normalizeText(summary.reviewerCommentUrl) || "not provided"}`,
    `Current recommended action: ${normalizeText(summary.currentRecommendedAction) || "unknown"}`,
    "Critical findings:",
    formatIndentedList(criticalFindings, "- none"),
    "Risks:",
    formatIndentedList(risks, "- none"),
    "Finding response map:",
    findingResponses.length > 0
      ? findingResponses.map(formatFindingResponseLine).join("\n")
      : "- none",
    "Files changed in response:",
    formatIndentedList(filesChanged, "- not provided"),
    "Tests/evidence run:",
    formatIndentedList(testsEvidence, "- not provided"),
    "Response comment URLs:",
    formatIndentedList(responseUrls, "- not provided"),
    "Unresolved items:",
    formatIndentedList(unresolvedItems, "- none"),
    `Response completeness: ${summary.complete === true ? "complete" : "incomplete"}`
  ].join("\n");
}

export function buildGeminiReviewRequestBody(input = {}) {
  const prDiff = normalizeMultilineText(input.prDiff);
  const context = normalizeMultilineText(input.context);
  if (!prDiff) {
    throw new Error("prDiff is required");
  }
  if (!context) {
    throw new Error("context is required");
  }

  return {
    systemInstruction: {
      parts: [
        {
          text: [
            "You are VTDD's Gemini reviewer.",
            "You are critique-only.",
            "You do not execute fixes, decide merge, or erase uncertainty.",
            "Write criticalFindings and risks in Japanese-first owner-facing prose.",
            "Keep recommendedAction as the machine-readable enum value.",
            "Return JSON only.",
            "The JSON must contain criticalFindings[], risks[], and recommendedAction.",
            "recommendedAction must be one of: approve, request_changes, manual_review.",
            "If there are no critical findings, keep criticalFindings empty and put at least one residual risk in risks in Japanese."
          ].join(" ")
        }
      ]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `PR diff:\n${prDiff}\n\nPR context:\n${context}`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        required: ["criticalFindings", "risks", "recommendedAction"],
        properties: {
          criticalFindings: {
            type: "ARRAY",
            items: { type: "STRING" }
          },
          risks: {
            type: "ARRAY",
            items: { type: "STRING" }
          },
          recommendedAction: {
            type: "STRING",
            enum: ["approve", "request_changes", "manual_review"]
          }
        }
      }
    }
  };
}

export function extractReviewerResponseFromGemini(input = {}) {
  const candidateText =
    normalizeText(input?.candidates?.[0]?.content?.parts?.[0]?.text) || normalizeText(input?.text);
  if (!candidateText) {
    return {
      ok: false,
      issues: ["Gemini response did not contain text output"]
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(candidateText);
  } catch {
    return {
      ok: false,
      issues: ["Gemini response was not valid JSON"]
    };
  }

  const validated = validateReviewerResponse(parsed);
  if (!validated.ok) {
    return validated;
  }

  return {
    ok: true,
    review: validated.response
  };
}

export function formatGeminiReviewComment(input = {}) {
  const review = normalizeObject(input.review);
  const trigger = normalizeText(input.trigger) || "unknown";
  const model = normalizeText(input.model) || DEFAULT_GEMINI_REVIEW_MODEL;
  const criticalFindings = normalizeStringArray(review.criticalFindings);
  const risks = normalizeStringArray(review.risks);
  const recommendedAction = normalizeText(review.recommendedAction) || "manual_review";
  const notificationMention = normalizeMentionLogin(input.notificationMention);

  const lines = [
    GEMINI_PR_REVIEW_MARKER,
    ...(notificationMention ? [`@${notificationMention} VTDD milestone: review 結果が更新されました。`] : []),
    formatReviewerOperatorSummary({
      reviewer: "gemini",
      recommendedAction,
      criticalFindings,
      risks
    }),
    "",
    "## VTDD Gemini レビュー",
    "",
    `- Trigger: \`${trigger}\``,
    `- Model: \`${model}\``,
    `- Recommended action: \`${recommendedAction}\``,
    "",
    "### 重要指摘",
    formatListOrFallback(criticalFindings, "- 報告なし。"),
    "",
    "### 残リスク",
    formatListOrFallback(risks, "- 報告なし。"),
    "",
    "_Reviewer は批評専用です。修正 GO / merge GO + real passkey authority は人間が保持します。_"
  ];

  return lines.join("\n");
}

export function findExistingGeminiReviewComment(comments = []) {
  return (
    comments.find((comment) => containsGeminiReviewMarker(comment?.body)) ??
    null
  );
}

export function parseGeminiReviewComment(comment = {}) {
  const body = normalizeText(typeof comment === "string" ? comment : comment?.body);
  if (!body || !containsGeminiReviewMarker(body)) {
    return null;
  }

  const recommendedActionMatch = body.match(/^- Recommended action:\s*`([^`]+)`/m);
  const recommendedAction = normalizeText(recommendedActionMatch?.[1]).toLowerCase() || "manual_review";
  const source = typeof comment === "object" && comment !== null ? comment : {};
  const createdAt = normalizeText(source.createdAt ?? source.created_at);
  const updatedAt = normalizeText(source.updatedAt ?? source.updated_at);

  return {
    reviewer: "gemini",
    recommendedAction,
    criticalFindings: extractFirstMarkdownListSection(body, ["### 重要指摘", "### Critical Findings"]),
    risks: extractFirstMarkdownListSection(body, ["### 残リスク", "### Risks"]),
    blocking:
      recommendedAction === "request_changes" || recommendedAction === "manual_review",
    url: normalizeText(source.url ?? source.htmlUrl ?? source.html_url) || null,
    createdAt: createdAt || null,
    updatedAt: updatedAt || null,
    includesCreatedEdit: source.includesCreatedEdit === true || (Boolean(createdAt) && Boolean(updatedAt) && createdAt !== updatedAt),
    body
  };
}

function extractReviewResponseEvidence({ pullRequestBody, responseText }) {
  return uniqueTextList([
    ...extractEvidenceLines(pullRequestBody),
    ...extractEvidenceLines(responseText)
  ]);
}

function extractEvidenceLines(value) {
  const text = normalizeMultilineText(value);
  if (!text) {
    return [];
  }
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^- /, ""))
    .filter((line) => /(^|\b)(Unit|Integration|E2E|Manual|Evidence path\/link|test|npm test|node --test|検証|証跡|evidence)(:|\b)/i.test(line));
}

function summarizeChangedFiles(files) {
  return (Array.isArray(files) ? files : [])
    .map((file) => {
      const filename = normalizeText(file?.filename) || normalizeText(file?.path);
      const status = normalizeText(file?.status);
      if (!filename) {
        return null;
      }
      return status ? `${filename} (${status})` : filename;
    })
    .filter(Boolean);
}

function isFindingMapped(finding, responseText) {
  const normalizedFinding = normalizeInlineText(finding).toLowerCase();
  const normalizedResponse = normalizeInlineText(responseText).toLowerCase();
  return Boolean(normalizedFinding) && normalizedResponse.includes(normalizedFinding);
}

function mapFindingResponse({ finding, index, responseText }) {
  const id = `critical-${index + 1}`;
  const status = resolveFindingResponseStatus({ id, finding, responseText });
  return {
    id,
    finding,
    status,
    evidence: extractFindingEvidence({ id, finding, responseText })
  };
}

function resolveFindingResponseStatus({ id, finding, responseText }) {
  const normalizedResponse = normalizeInlineText(responseText).toLowerCase();
  if (!normalizedResponse) {
    return "unresolved";
  }
  if (hasResponseDirective(normalizedResponse, ["unresolved", "未解決", "未対応"], id, finding)) {
    return "unresolved";
  }
  if (hasResponseDirective(normalizedResponse, ["addresses", "addressed", "fixes", "resolved", "対応済み", "解決済み"], id, finding)) {
    return "addressed";
  }
  return isFindingMapped(finding, responseText) ? "addressed" : "unresolved";
}

function hasResponseDirective(normalizedResponse, verbs, id, finding) {
  const normalizedFinding = normalizeInlineText(finding).toLowerCase();
  return verbs.some((verb) => {
    const normalizedVerb = normalizeInlineText(verb).toLowerCase();
    return (
      normalizedResponse.includes(`${normalizedVerb}: ${id}`) ||
      normalizedResponse.includes(`${normalizedVerb} ${id}`) ||
      (normalizedFinding && normalizedResponse.includes(`${normalizedVerb}: ${normalizedFinding}`))
    );
  });
}

function extractFindingEvidence({ id, finding, responseText }) {
  const normalizedFinding = normalizeInlineText(finding).toLowerCase();
  return normalizeMultilineText(responseText)
    .split("\n")
    .map((line) => line.trim().replace(/^- /, ""))
    .filter((line) => {
      const normalizedLine = normalizeInlineText(line).toLowerCase();
      return normalizedLine.includes(id) || (normalizedFinding && normalizedLine.includes(normalizedFinding));
    });
}

function extractMarkdownListSection(body, heading) {
  const text = normalizeMultilineText(body);
  const start = text.indexOf(heading);
  if (start < 0) {
    return [];
  }
  const section = text.slice(start + heading.length).split(/\n### |\n## /)[0] || "";
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim())
    .filter((line) => line && line !== "報告なし。");
}

function extractFirstMarkdownListSection(body, headings) {
  for (const heading of headings) {
    const values = extractMarkdownListSection(body, heading);
    if (values.length > 0) {
      return values;
    }
  }
  return [];
}

function formatIndentedList(values, fallback) {
  if (!values.length) {
    return fallback;
  }
  return values.map((value) => `- ${value}`).join("\n");
}

function formatFindingResponseLine(item) {
  const evidence = normalizeStringArray(item.evidence);
  const suffix = evidence.length > 0 ? ` evidence=${evidence.slice(0, 2).join(" | ")}` : "";
  return `- ${normalizeText(item.id)}: ${normalizeText(item.status) || "unresolved"} - ${normalizeText(item.finding)}${suffix}`;
}

function uniqueTextList(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function summarizeComments(comments) {
  const list = Array.isArray(comments) ? comments : [];
  return list
    .filter((comment) => !containsReviewerMarker(comment?.body) || isTrustedReviewerObjectionResolution(comment?.body))
    .slice(-MAX_CONTEXT_COMMENTS)
    .map((comment) => {
      const author = normalizeText(comment?.user?.login) || "unknown";
      const body = normalizeInlineText(comment?.body) || "[empty]";
      return `- ${author}: ${body}`;
    });
}

function summarizeReviews(reviews) {
  const list = Array.isArray(reviews) ? reviews : [];
  return list
    .slice(-MAX_CONTEXT_COMMENTS)
    .map((review) => {
      const author = normalizeText(review?.user?.login) || "unknown";
      const state = normalizeText(review?.state) || "commented";
      const body = normalizeInlineText(review?.body) || "[empty]";
      return `- ${author} (${state}): ${body}`;
    });
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function formatListOrFallback(values, fallback) {
  if (!values.length) {
    return fallback;
  }
  return values.map((value) => `- ${value}`).join("\n");
}

function isBotTriggered(payload) {
  const senderLogin = normalizeText(payload?.sender?.login);
  return senderLogin.endsWith("[bot]");
}

function containsReviewerMarker(value) {
  return /<!--\s*vtdd:reviewer=[^>\s]+\s*-->/.test(normalizeText(value));
}

function containsGeminiReviewMarker(value) {
  return normalizeText(value).includes(GEMINI_PR_REVIEW_MARKER);
}

function isTrustedReviewerObjectionResolution(value) {
  return normalizeText(value).includes(REVIEWER_OBJECTION_RESOLUTION_MARKER);
}

function isTrustedReviewerObjectionResolutionComment(comment) {
  return isTrustedReviewerObjectionResolution(comment?.body) && isTrustedCommentAuthor(comment);
}

function isTrustedCommentAuthor(comment) {
  const author = normalizeCommentAuthor(comment).toLowerCase();
  const association = normalizeText(comment?.authorAssociation ?? comment?.author_association).toUpperCase();
  return (
    author === "vtdd-codex" ||
    author === "vtdd-codex[bot]" ||
    association === "OWNER" ||
    association === "MEMBER" ||
    association === "COLLABORATOR"
  );
}

function normalizeCommentAuthor(comment) {
  return normalizeText(comment?.user?.login ?? comment?.author?.login ?? comment?.author);
}

function normalizeInlineText(value) {
  return normalizeMultilineText(value).replace(/\s+/g, " ").trim();
}

function normalizeMultilineText(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizePositiveInteger(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function normalizeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function skip(reason) {
  return {
    ok: true,
    value: {
      shouldReview: false,
      reason
    }
  };
}
