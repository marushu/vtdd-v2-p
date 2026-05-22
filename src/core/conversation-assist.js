const ConversationIntent = Object.freeze({
  UNKNOWN: "unknown",
  LIST_REPOSITORIES: "list_repositories",
  SELECT_REPOSITORY: "select_repository",
  RECALL_CONTEXT: "recall_context",
  MEMORY_STATUS: "memory_status"
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
      text: userText || null,
      queryHint: userText || null,
      semanticRetrieval: {
        enabled: Boolean(userText),
        mode: "assistive"
      }
    };
    assist.operationalMemoryRequest = {
      enabled: true,
      mode: "recall",
      limit: crossRetrievalDisplayMode === "expanded" ? 8 : 5,
      displayMode: crossRetrievalDisplayMode,
      relatedIssue: chosenIssue,
      text: userText || null,
      queryHint: buildOperationalMemoryQueryHint(userText),
      reasonTags: detectOperationalMemoryReasonTags(userText)
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

  if (detectedIntent === ConversationIntent.MEMORY_STATUS) {
    assist.responseGuide = {
      style: "memory_status",
      displayMode: "short",
      sourceOrder: ["operational_memory_inventory"],
      expandOnRequest: true,
      caveat:
        "件数は provider が返せる範囲の bounded visible count です。総件数、課金指標、保存価値の評価ではありません。"
    };
    assist.operationalMemoryRequest = {
      enabled: true,
      mode: "inventory",
      limit: 1,
      displayMode: "short",
      relatedIssue: issueMentions.length === 1 ? issueMentions[0] : null,
      text: null,
      queryHint: "記憶量、RAG record count、memory inventory",
      caveat:
        "bounded visible count only; do not present as total storage, billing, or memory quality",
      reasonTags: ["memory_inventory"]
    };
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

  if (isMemoryStatusIntent(text)) {
    return ConversationIntent.MEMORY_STATUS;
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
  return hasKeyword(text, RECALL_CONTEXT_WORDS) || hasKeyword(text, OPERATIONAL_MEMORY_RECALL_WORDS);
}

function isMemoryStatusIntent(text) {
  return hasKeyword(text, MEMORY_WORDS) && hasKeyword(text, MEMORY_STATUS_WORDS);
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

function buildOperationalMemoryQueryHint(text) {
  const tags = detectOperationalMemoryReasonTags(text);
  if (tags.length === 0) {
    return text || null;
  }
  return [text, ...tags].filter(Boolean).join(" ");
}

function detectOperationalMemoryReasonTags(text) {
  const tags = [];
  if (hasKeyword(text, FAILURE_WORDS)) {
    tags.push("failure_map");
  }
  if (hasKeyword(text, DRIFT_WORDS)) {
    tags.push("drift_guard");
  }
  if (hasKeyword(text, HALLUCINATION_WORDS)) {
    tags.push("hallucination_guard");
  }
  if (hasKeyword(text, SUCCESS_WORDS)) {
    tags.push("success_pattern");
  }
  if (hasKeyword(text, HANDOFF_WORDS)) {
    tags.push("handoff_checkpoint");
  }
  return [...new Set(tags)];
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

const OPERATIONAL_MEMORY_RECALL_WORDS = Object.freeze([
  "失敗",
  "失敗記憶",
  "同じ失敗",
  "ドリフト",
  "ハルシネーション",
  "幻覚",
  "成功パターン",
  "うまくいった",
  "やり方を変えた",
  "再発",
  "地雷",
  "気をつけ",
  "引き継ぎ",
  "handoff",
  "failure",
  "failed",
  "drift",
  "hallucination",
  "success pattern"
]);

const MEMORY_WORDS = Object.freeze([
  "記憶",
  "メモリ",
  "memory",
  "rag"
]);

const MEMORY_STATUS_WORDS = Object.freeze([
  "量",
  "数",
  "何件",
  "どれくらい",
  "どのくらい",
  "inventory",
  "count",
  "counts",
  "status"
]);

const FAILURE_WORDS = Object.freeze([
  "失敗",
  "詰ま",
  "落ち",
  "返ってこない",
  "壊れ",
  "再発",
  "failure",
  "failed",
  "bug"
]);

const DRIFT_WORDS = Object.freeze([
  "ドリフト",
  "逸れ",
  "ずれ",
  "ズレ",
  "scope",
  "drift"
]);

const HALLUCINATION_WORDS = Object.freeze([
  "ハルシネーション",
  "幻覚",
  "嘘",
  "勘違い",
  "hallucination"
]);

const SUCCESS_WORDS = Object.freeze([
  "成功",
  "うまくい",
  "上手くい",
  "やり方を変え",
  "worked",
  "success"
]);

const HANDOFF_WORDS = Object.freeze([
  "引き継",
  "handoff",
  "圧縮",
  "スレ",
  "コンテキスト"
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
