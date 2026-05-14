import { parseCodexReviewFallbackComment } from "./codex-review-fallback.js";
import { parseGeminiReviewComment } from "./gemini-pr-review.js";

function isReviewerTerminalApproved(input = {}) {
  const comments = Array.isArray(input.comments) ? input.comments : [];
  const after = parseTime(input.after);
  const headSha = normalizeText(input.headSha);
  const markers = comments
    .map((comment) => normalizeReviewerMarker(comment))
    .filter(Boolean)
    .filter((marker) => !after || marker.time >= after)
    .filter((marker) => !headSha || !marker.headSha || marker.headSha === headSha)
    .sort((left, right) => left.time - right.time);

  if (markers.length === 0) {
    return false;
  }

  const latest = markers.at(-1);
  return latest.terminal === true;
}

function normalizeReviewerMarker(comment) {
  if (!isTrustedReviewerComment(comment)) {
    return null;
  }

  const gemini = parseGeminiReviewComment(comment);
  if (gemini) {
    return {
      reviewer: "gemini",
      terminal: gemini.recommendedAction === "approve",
      blocking: gemini.blocking === true,
      headSha: extractHeadSha(comment?.body),
      time: parseTime(comment?.created_at ?? comment?.createdAt)
    };
  }

  const codex = parseCodexReviewFallbackComment(comment);
  if (codex) {
    return {
      reviewer: "codex-fallback",
      terminal: codex.status === "completed" && codex.recommendedAction === "approve",
      blocking: codex.blocking === true,
      headSha: extractHeadSha(comment?.body),
      time: parseTime(comment?.created_at ?? comment?.createdAt)
    };
  }

  return null;
}

function isTrustedReviewerComment(comment) {
  const login = normalizeText(comment?.user?.login ?? comment?.author?.login).toLowerCase();
  const association = normalizeText(comment?.author_association ?? comment?.authorAssociation).toUpperCase();
  const trustedLogins = new Set([
    "marushu",
    "vtdd-codex",
    "vtdd-codex[bot]",
    "vtdd-gemini-reviewer",
    "vtdd-gemini-reviewer[bot]",
    "vtdd-codex-fallback-reviewer",
    "vtdd-codex-fallback-reviewer[bot]"
  ]);

  if (trustedLogins.has(login)) {
    return true;
  }

  return association === "OWNER" || association === "MEMBER" || association === "COLLABORATOR";
}

function extractHeadSha(value) {
  const match = normalizeText(value).match(/^- Head SHA:\s*`([^`]+)`/m);
  return normalizeText(match?.[1]);
}

function parseTime(value) {
  const timestamp = Date.parse(normalizeText(value));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

export { isReviewerTerminalApproved, isTrustedReviewerComment };
