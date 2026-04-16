const ConversationIntent = Object.freeze({
  UNKNOWN: "unknown",
  LIST_REPOSITORIES: "list_repositories",
  SELECT_REPOSITORY: "select_repository",
  RECALL_CONTEXT: "recall_context"
});

export function buildConversationAssist(input) {
  const userText = normalizeText(input?.conversation?.userText);
  const currentRepository = normalizeText(input?.conversation?.currentRepository);
  const repositoryCandidates = Array.isArray(input?.repositoryCandidates)
    ? input.repositoryCandidates
    : [];
  const blockedByRule = normalizeText(input?.blockedByRule);
  const requiredConsent = normalizeText(input?.requiredConsent);

  const detectedIntent = detectConversationIntent(userText);
  const mentionedRepository = matchRepositoryFromText(userText, repositoryCandidates);
  const activeRepository = currentRepository || normalizeText(input?.repository) || null;
  const issueMentions = extractIssueMentions(userText);
  const crossRetrievalDisplayMode = determineCrossRetrievalDisplayMode(userText);

  const assist = {
    locale: "ja",
    interactionMode: "natural_conversation",
    hideTechnicalPaths: true,
    hideRawJson: true,
    detectedIntent,
    activeRepository,
    mentionedRepository: mentionedRepository?.canonicalRepo ?? null,
    issueMentions,
    requiresConfirmation: false,
    confirmationPrompt: null,
    nextQuestion: null
  };

  if (detectedIntent === ConversationIntent.LIST_REPOSITORIES) {
    assist.responseGuide = {
      style: "repository_list",
      includeVisibility: true,
      askSelectionIfNeeded: true
    };
  }

  if (mentionedRepository) {
    const normalizedActive = normalizeLoose(currentRepository || activeRepository);
    const normalizedMentioned = normalizeLoose(mentionedRepository.canonicalRepo);
    if (normalizedActive && normalizedActive !== normalizedMentioned) {
      assist.requiresConfirmation = true;
      assist.confirmationPrompt = `現在は ${activeRepository} を見ています。${mentionedRepository.canonicalRepo} に切り替えますか？`;
    }
  }

  if (detectedIntent === ConversationIntent.RECALL_CONTEXT) {
    const chosenIssue = issueMentions.length === 1 ? issueMentions[0] : null;
    assist.responseGuide = {
      style: "cross_retrieval",
      displayMode: crossRetrievalDisplayMode,
      sourceOrder: ["issue", "constitution", "decision_log", "proposal_log", "pr_context"],
      expandOnRequest: true
    };
    assist.crossRetrievalRequest = {
      enabled: true,
      phase: "exploration",
      limit: crossRetrievalDisplayMode === "expanded" ? 12 : 5,
      displayMode: crossRetrievalDisplayMode,
      relatedIssue: chosenIssue,
      text: null,
      queryHint: userText || null
    };

    if (issueMentions.length > 1) {
      assist.requiresConfirmation = true;
      assist.confirmationPrompt = `複数の Issue（${issueMentions
        .map((item) => `#${item}`)
        .join(", ")}）が見つかりました。どれを優先して参照しますか？`;
    } else if (!chosenIssue) {
      assist.nextQuestion =
        "参照対象の Issue 番号があれば指定できます。未指定のまま横断参照して進めてもよいですか？";
    }
  }

  if (blockedByRule === "consent_boundary" && requiredConsent) {
    assist.nextQuestion = buildConsentPrompt(requiredConsent);
  }

  return assist;
}

function detectConversationIntent(text) {
  if (!text) {
    return ConversationIntent.UNKNOWN;
  }

  if (isRepositoryListIntent(text)) {
    return ConversationIntent.LIST_REPOSITORIES;
  }

  if (isRepositorySelectionIntent(text)) {
    return ConversationIntent.SELECT_REPOSITORY;
  }

  if (isRecallContextIntent(text)) {
    return ConversationIntent.RECALL_CONTEXT;
  }

  return ConversationIntent.UNKNOWN;
}

function isRepositoryListIntent(text) {
  return hasKeyword(text, REPOSITORY_WORDS) && hasKeyword(text, LIST_WORDS);
}

function isRepositorySelectionIntent(text) {
  return hasKeyword(text, REPOSITORY_SELECTION_WORDS);
}

function isRecallContextIntent(text) {
  return hasKeyword(text, RECALL_CONTEXT_WORDS);
}

function matchRepositoryFromText(text, repositoryCandidates) {
  if (!text || repositoryCandidates.length === 0) {
    return null;
  }

  const normalizedText = normalizeLoose(text);
  let bestMatch = null;

  for (const candidate of repositoryCandidates) {
    const keys = buildRepositoryMatchKeys(candidate);
    for (const key of keys) {
      if (!key) {
        continue;
      }

      if (normalizedText.includes(key) && (!bestMatch || key.length > bestMatch.key.length)) {
        bestMatch = {
          candidate,
          key
        };
      }
    }
  }

  return bestMatch?.candidate ?? null;
}

function buildRepositoryMatchKeys(candidate) {
  const keys = new Set();

  keys.add(normalizeLoose(candidate?.canonicalRepo));
  keys.add(normalizeLoose(candidate?.productName));

  if (Array.isArray(candidate?.aliases)) {
    for (const alias of candidate.aliases) {
      keys.add(normalizeLoose(alias));
    }
  }

  const canonical = normalizeText(candidate?.canonicalRepo);
  const [owner, repo] = canonical.split("/");
  keys.add(normalizeLoose(owner));
  keys.add(normalizeLoose(repo));

  return [...keys].filter((item) => item.length >= 3);
}

function buildConsentPrompt(requiredConsent) {
  if (requiredConsent === "read") {
    return "読み取り同意が必要です。読み取りを許可して進めますか？";
  }
  return `${requiredConsent} の同意が必要です。許可して進めますか？`;
}

function hasKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeLoose(value) {
  return normalizeText(value).replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, "");
}

function extractIssueMentions(text) {
  if (!text) {
    return [];
  }

  const matches = new Set();
  const hashPattern = /#\s*(\d+)/gi;
  const issuePattern = /\bissue\s*(\d+)\b/gi;

  let match = hashPattern.exec(text);
  while (match) {
    const issue = Number(match[1]);
    if (Number.isInteger(issue) && issue > 0) {
      matches.add(issue);
    }
    match = hashPattern.exec(text);
  }

  match = issuePattern.exec(text);
  while (match) {
    const issue = Number(match[1]);
    if (Number.isInteger(issue) && issue > 0) {
      matches.add(issue);
    }
    match = issuePattern.exec(text);
  }

  return [...matches];
}

function determineCrossRetrievalDisplayMode(text) {
  if (!text) {
    return "short";
  }
  if (hasKeyword(text, EXPANDED_VIEW_WORDS)) {
    return "expanded";
  }
  return "short";
}

const REPOSITORY_WORDS = Object.freeze([
  "repo",
  "repository",
  "repositories",
  "repos",
  "リポジトリ",
  "レポジトリ",
  "プロジェクト"
]);

const LIST_WORDS = Object.freeze([
  "list",
  "show",
  "all",
  "一覧",
  "リスト",
  "出して",
  "見せて",
  "教えて",
  "持ってる",
  "持っている",
  "全部"
]);

const REPOSITORY_SELECTION_WORDS = Object.freeze([
  "開いて",
  "ひらいて",
  "切り替え",
  "切替",
  "選んで",
  "使って",
  "対象",
  "open",
  "switch",
  "select",
  "use"
]);

const RECALL_CONTEXT_WORDS = Object.freeze([
  "なんだっけ",
  "何だっけ",
  "思い出",
  "振り返",
  "過去判断",
  "判断理由",
  "根拠",
  "前回",
  "関連",
  "履歴",
  "経緯",
  "recall",
  "history",
  "why",
  "rationale"
]);

const EXPANDED_VIEW_WORDS = Object.freeze([
  "詳しく",
  "詳細",
  "全部",
  "展開",
  "full",
  "expanded",
  "deep"
]);
