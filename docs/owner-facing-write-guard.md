# Owner-facing Write Guard

## Intent

Issue #342 requires owner-facing GitHub / runtime / RAG writes to pass through
canonical helpers before they are sent outside the current agent session.

The goal is not to translate code symbols or logs. The goal is to prevent AI
agents from skipping the repository rules and writing English-first or
scope-shrinking owner-facing text into GitHub.

## Guarded Surfaces

- Issue create / edit body
- PR body
- PR comment
- Review comment
- Codex追加修正コメント
- RAG memory candidate

## Required Behavior

- Owner-facing prose is Japanese-first unless the owner explicitly requests
  another language.
- GitHub references should be written as `Issue #...` or `PR #...` when the
  surrounding text is owner-facing.
- Completion or evidence text must not use曖昧な縮小表現 such as `軽く確認`.
- Issue / PR / memory candidate text should include enough context for the
  owner to resume later: purpose, reason, current state, and next action.

## Canonical Commands

Prepare an Issue body file:

```sh
node scripts/prepare-issue-body-file.mjs --output /tmp/issue.md \
  --intent "なぜこのIssueを作るのか。後でどこから再開するのか。" \
  --success "観測可能な成功条件" \
  --unit "node --test ..." \
  --integration "..." \
  --e2e "..." \
  --evidencePath "..." \
  --nonGoal "このIssueでやらないこと" \
  --openQuestions "未決事項" \
  --related "Related Issue: Issue #..."
```

Validate an Issue body file:

```sh
node scripts/validate-issue-body.mjs /tmp/issue.md
```

## Non-goals

- Do not force translation of API names, operationIds, code symbols, or raw log
  excerpts.
- Do not store full casual conversation transcripts.
- Do not treat memory recall as runtime truth.
