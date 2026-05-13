import test from "node:test";
import assert from "node:assert/strict";

import {
  findBareIssueOrPullRequestReferences,
  validateOwnerFacingJapaneseFirst
} from "../src/core/owner-facing-language.js";

test("owner-facing language guard rejects English-heavy prose", () => {
  const result = validateOwnerFacingJapaneseFirst(
    "Create a new issue for the startup preflight guard. This should explain the next action.",
    { surface: "Issue body" }
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Japanese-first/);
});

test("owner-facing language guard accepts Japanese prose with recovery context", () => {
  const result = validateOwnerFacingJapaneseFirst(
    "このIssueは、後でiPhoneから戻ってきた時に、なぜこの作業を始めたのかと次に何をするのかを思い出せるようにする。",
    { surface: "Issue body", requireRecoveryContext: true }
  );

  assert.equal(result.ok, true);
});

test("owner-facing language guard rejects ambiguous shrinking wording", () => {
  const result = validateOwnerFacingJapaneseFirst(
    "PR作成後に軽く確認しました。",
    { surface: "completion evidence" }
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /軽く確認/);
});

test("bare GitHub references are detected for owner-facing prose", () => {
  assert.deepEqual(findBareIssueOrPullRequestReferences("Issue #342 と PR #340 はよい。#341 は曖昧。"), [
    "#341"
  ]);
});
