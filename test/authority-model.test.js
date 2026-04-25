import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (filePath) => fs.readFileSync(filePath, "utf8");

test("authority model defines Codex freedom inside Issue scope and Butler-side merge authority", () => {
  const doc = read("docs/butler/authority-model.md");

  assert.equal(doc.includes("Codex is free inside bounded Issue scope."), true);
  assert.equal(doc.includes("Codex does not merge or close issues directly."), true);
  assert.equal(doc.includes("Merge and issue close are Butler-side authority actions."), true);
  assert.equal(doc.includes("ChatGPT Pro / Codex Cloud"), true);
  assert.equal(doc.includes("`OPENAI_API_KEY`-backed runners are optional opt-in machine paths"), true);
});

test("authority model defines GitHub-observable Codex return markers", () => {
  const doc = read("docs/butler/authority-model.md");

  assert.equal(doc.includes("Codex does not return to Butler through an invisible private chat channel."), true);
  assert.equal(doc.includes("approval_required"), true);
  assert.equal(doc.includes("scope_ambiguous"), true);
  assert.equal(doc.includes("review_response_needed"), true);
  assert.equal(doc.includes("blocked_by_missing_runtime_state"), true);
});

test("loop and role docs reference Butler-mediated authority return", () => {
  const roleDoc = read("docs/butler/role-separation.md");
  const loopDoc = read("docs/butler/codex-pr-revision-loop.md");
  const remoteDoc = read("docs/butler/remote-codex-cli-executor.md");

  assert.equal(roleDoc.includes("authority-model.md"), true);
  assert.equal(loopDoc.includes("private chat backchannel"), true);
  assert.equal(remoteDoc.includes("hidden direct Codex-to-Butler channel"), true);
});
