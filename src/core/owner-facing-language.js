const JAPANESE_CHARACTER_RE = /[\u3040-\u30ff\u3400-\u9fff]/g;
const LATIN_WORD_RE = /[A-Za-z][A-Za-z0-9_-]*/g;

const SHRINKING_PHRASES = [
  "軽く確認",
  "ざっくり確認",
  "ざっと確認",
  "簡単に確認",
  "軽く見た"
];

const RECOVERY_CONTEXT_PATTERNS = [
  /なぜ/,
  /理由/,
  /目的/,
  /再開/,
  /復帰/,
  /次に/,
  /どこから/
];

function validateOwnerFacingJapaneseFirst(text, options = {}) {
  const value = String(text ?? "");
  const errors = [];
  const warnings = [];
  const surface = normalizeText(options.surface) || "owner-facing text";
  const japaneseCharacters = value.match(JAPANESE_CHARACTER_RE)?.length ?? 0;
  const latinWords = value.match(LATIN_WORD_RE)?.length ?? 0;
  const minimumJapaneseCharacters = Number.isInteger(options.minimumJapaneseCharacters)
    ? options.minimumJapaneseCharacters
    : 20;

  if (options.requireJapanese !== false && japaneseCharacters < minimumJapaneseCharacters) {
    errors.push(
      `${surface} must be Japanese-first owner-facing prose; found ${japaneseCharacters} Japanese characters.`
    );
  }

  for (const phrase of SHRINKING_PHRASES) {
    if (value.includes(phrase)) {
      const message = `${surface} contains ambiguous scope-shrinking phrase: ${phrase}`;
      if (options.errorOnShrinkingPhrase === false) {
        warnings.push(message);
      } else {
        errors.push(message);
      }
    }
  }

  const bareReferences = findBareIssueOrPullRequestReferences(value);
  if (bareReferences.length > 0) {
    const message = `${surface} contains bare GitHub references; use Issue #... or PR #...: ${bareReferences.join(", ")}`;
    if (options.errorOnBareIssuePrReference === true) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  if (options.requireRecoveryContext === true && !RECOVERY_CONTEXT_PATTERNS.some((pattern) => pattern.test(value))) {
    errors.push(`${surface} must include recovery context such as purpose, reason, next action, or restart point.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics: {
      japaneseCharacters,
      latinWords,
      bareReferences
    }
  };
}

function findBareIssueOrPullRequestReferences(text) {
  const value = String(text ?? "");
  const references = [];
  const pattern = /(^|[^A-Za-z])#([0-9]+)/g;
  let match;
  while ((match = pattern.exec(value)) !== null) {
    const hashIndex = match.index + match[1].length;
    const before = value.slice(Math.max(0, hashIndex - 12), hashIndex);
    if (/(Issue|PR)\s+$/.test(before)) {
      continue;
    }
    references.push(`#${match[2]}`);
  }
  return [...new Set(references)];
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

export {
  SHRINKING_PHRASES,
  findBareIssueOrPullRequestReferences,
  validateOwnerFacingJapaneseFirst
};
