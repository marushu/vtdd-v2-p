import { validateOwnerFacingJapaneseFirst } from "./owner-facing-language.js";

const REQUIRED_ISSUE_SECTIONS = [
  "Intent",
  "Success Criteria",
  "Completion Gate",
  "Validation Plan",
  "Non-goal",
  "Open Questions",
  "Related Issues / Rules"
];

const PLACEHOLDER_VALUES = new Set(["", "-", "- ", "todo", "tbd"]);

function renderIssueBody(options = {}) {
  return `## Intent

${normalizeParagraph(options.intent, "TODO: この Issue の目的、理由、再開時に読むべき現在地を日本語で書く。")}

## Success Criteria

${bulletize(options.success, "- [ ] TODO")}

## Completion Gate

- [ ] code merged
- [ ] required tests pass
- [ ] mapped E2E passes
- [ ] human approval

## Validation Plan

- Unit: ${normalizeInline(options.unit, "TODO")}
- Integration: ${normalizeInline(options.integration, "TODO")}
- E2E: ${normalizeInline(options.e2e, "TODO")}
- Evidence path/link: ${normalizeInline(options.evidencePath, "TODO")}

## Non-goal

${bulletize(options.nonGoal, "- TODO")}

## Open Questions

${bulletize(options.openQuestions, "- TODO")}

## Related Issues / Rules

${bulletize(options.related, "- Related Issue: TODO")}
`;
}

function validateIssueBody(body, options = {}) {
  const value = String(body ?? "");
  const errors = [];
  const warnings = [];
  const templateMode = options.template === true;

  let lastIndex = -1;
  for (const section of REQUIRED_ISSUE_SECTIONS) {
    const marker = `## ${section}`;
    const nextIndex = value.indexOf(marker);
    if (nextIndex === -1) {
      errors.push(`Missing Issue template marker: ${marker}`);
      continue;
    }
    if (nextIndex <= lastIndex) {
      errors.push(`${marker} must appear after the previous canonical section.`);
    }
    lastIndex = nextIndex;
  }

  if (!templateMode) {
    const sections = extractIssueSections(value);
    for (const section of ["Intent", "Success Criteria", "Validation Plan", "Non-goal"]) {
      if (isPlaceholder(sections[section])) {
        errors.push(`Issue section is not filled: ${section}`);
      }
    }
  }

  const language = validateOwnerFacingJapaneseFirst(value, {
    surface: options.surface || "Issue body",
    requireJapanese: options.requireJapanese !== false,
    requireRecoveryContext: options.requireRecoveryContext !== false && !templateMode,
    errorOnBareIssuePrReference: options.errorOnBareIssuePrReference === true,
    minimumJapaneseCharacters: options.minimumJapaneseCharacters ?? (templateMode ? 10 : 40)
  });
  errors.push(...language.errors);
  warnings.push(...language.warnings);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    sections: extractIssueSections(value),
    language: language.metrics
  };
}

function extractIssueSections(body) {
  const sections = {};
  const value = String(body ?? "");
  for (let index = 0; index < REQUIRED_ISSUE_SECTIONS.length; index += 1) {
    const section = REQUIRED_ISSUE_SECTIONS[index];
    const marker = `## ${section}`;
    const start = value.indexOf(marker);
    if (start === -1) {
      continue;
    }
    const nextSection = REQUIRED_ISSUE_SECTIONS[index + 1];
    const nextMarker = nextSection ? `\n## ${nextSection}` : null;
    const contentStart = start + marker.length;
    const contentEnd = nextMarker ? value.indexOf(nextMarker, contentStart) : -1;
    sections[section] = value.slice(contentStart, contentEnd === -1 ? undefined : contentEnd).trim();
  }
  return sections;
}

function bulletize(value, fallback) {
  const lines = String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return fallback;
  }
  return lines.map((line) => (line.startsWith("-") ? line : `- ${line}`)).join("\n");
}

function normalizeParagraph(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeInline(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function isPlaceholder(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (PLACEHOLDER_VALUES.has(normalized)) {
    return true;
  }
  return /^- \[ \]\s*$/.test(normalized) || normalized.includes("todo");
}

export {
  REQUIRED_ISSUE_SECTIONS,
  extractIssueSections,
  renderIssueBody,
  validateIssueBody
};
