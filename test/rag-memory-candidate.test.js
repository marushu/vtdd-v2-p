import test from "node:test";
import assert from "node:assert/strict";

import {
  MEMORY_CANDIDATE_CONFIRMATION_PROMPT,
  buildRagMemoryCandidate
} from "../src/core/rag-memory-candidate.js";
import { MemoryRecordType } from "../src/core/memory-schema.js";

test("RAG memory candidate includes origin, user words, tension note, and GO prompt", () => {
  const result = buildRagMemoryCandidate({
    recordType: MemoryRecordType.TEMPERATURE_NOTE,
    repository: "marushu/vtdd-v2-p",
    relatedIssue: 343,
    summary: "RAG memory candidate はテンションノートを recall hook として持つ。",
    origin: {
      surface: "mac Codex",
      moment: "Issue #343 設計中",
      trigger: "owner が風呂などで文脈とテンションを忘れる前提を共有した"
    },
    userWords: ["俺は、すぐに忘れるんだよ"],
    tensionNote: {
      summary: "再開性を重視する温度が高い状態",
      intensity: "high",
      mode: "復帰文脈の固定",
      whyItMatters: "owner が後で戻った時に、なぜこの判断をしたか思い出すため"
    },
    restartTriggers: ["Issue #343", "テンションノート", "あれなんだったっけ？"],
    outcome: {
      status: "issue_created",
      issue: "Issue #343"
    },
    tags: ["startup-preflight"]
  });

  assert.equal(result.ok, true, result.issues?.join("\n"));
  assert.equal(result.candidate.confirmationPrompt, MEMORY_CANDIDATE_CONFIRMATION_PROMPT);
  assert.equal(result.candidate.record.type, MemoryRecordType.TEMPERATURE_NOTE);
  assert.equal(result.candidate.record.content.origin.surface, "mac Codex");
  assert.equal(result.candidate.record.content.userWords[0], "俺は、すぐに忘れるんだよ");
  assert.equal(result.candidate.record.content.tensionNote.intensity, "high");
  assert.equal(result.candidate.writePayload.confirmed, false);
  assert.equal(result.candidate.writePayload.recordType, MemoryRecordType.TEMPERATURE_NOTE);
});

test("RAG memory candidate rejects missing recall hooks", () => {
  const result = buildRagMemoryCandidate({
    recordType: MemoryRecordType.TEMPERATURE_NOTE,
    summary: "情報だけで recall hook がない"
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /origin/);
  assert.match(result.issues.join("\n"), /userWords/);
  assert.match(result.issues.join("\n"), /tensionNote/);
});

test("RAG memory candidate blocks secret-bearing content", () => {
  const result = buildRagMemoryCandidate({
    recordType: MemoryRecordType.TEMPERATURE_NOTE,
    summary: "秘密を含む候補",
    origin: { surface: "mac Codex" },
    userWords: ["token: sk-secretsecretsecretsecretsecret"],
    tensionNote: {
      summary: "秘密混入",
      whyItMatters: "保存してはいけない"
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /sensitive token|secret|key/i);
});
