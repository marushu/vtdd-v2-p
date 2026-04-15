const ConversationIntent = Object.freeze({
  UNKNOWN: "unknown",
  LIST_REPOSITORIES: "list_repositories",
  SELECT_REPOSITORY: "select_repository"
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

  const assist = {
    locale: "ja",
    interactionMode: "natural_conversation",
    hideTechnicalPaths: true,
    hideRawJson: true,
    detectedIntent,
    activeRepository,
    mentionedRepository: mentionedRepository?.canonicalRepo ?? null,
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

  return ConversationIntent.UNKNOWN;
}

function isRepositoryListIntent(text) {
  return hasKeyword(text, REPOSITORY_WORDS) && hasKeyword(text, LIST_WORDS);
}

function isRepositorySelectionIntent(text) {
  return hasKeyword(text, REPOSITORY_SELECTION_WORDS);
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
