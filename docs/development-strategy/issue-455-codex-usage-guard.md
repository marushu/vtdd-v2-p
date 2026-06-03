# Issue #455 Codex usage guard strategy

## 完了体験

Butler / VPS runner が reviewer fallback を扱う時、同じ PR head に対する完了済みまたは blocked 済みの Codex fallback を再実行しない。owner は PR/runner status から、Codex CLI を起動する予定か、起動しない理由か、重複抑止 key を確認できる。

## VTDD 全体で進める部分

Issue #455 の Codex 使用量削減と Issue #745 の unsupported model fallback 抑止を、VPS runner の reviewer fallback pickup 前 guard として進める。Issue #717 の wakeup primary は今回実装しないが、wakeup が入っても無駄な `codex exec` を速く繰り返さない前提を作る。

## 設計

VPS runner は Codex fallback requested marker を拾う前に、同じ PR / same head の reviewer terminal state を読む。`completed` と `blocked` は request consumption として terminal に扱い、`approve` だけを merge-ready approval として扱う。pending fallback には `dedupeKey`, `codexWillStart`, `codexUsageImpact` を付け、将来の Butler runtime truth で使えるようにする。

## 仮説

既存の `isReviewerTerminalResolved()` は blocked/completed を terminal として扱えるが、`selectPendingVpsReviewerFallbacks()` が `comment.headSha` に依存しているため、GitHub issue comment body には `- Head SHA:` があるのに API 補完 headSha がない場合に head matching が弱くなる。requested marker 自身の parsed headSha を使えば、unsupported model / auth failure / blocked marker 後の重複 Codex 起動をより確実に止められる。

## 検証計画

- Unit: requested/comment/completed/blocked が `comment.headSha` を持たず、body の `- Head SHA:` だけを持つ場合でも再処理しない。
- Unit: new head SHA の requested は、old head の completed/blocked に妨げられない。
- Unit: pending fallback に `dedupeKey`, `codexWillStart=true`, `codexUsageImpact=high` が出る。
- Local: `node --test test/vps-runner-script.test.js test/codex-review-fallback.test.js` を実行する。

## 改修見積もり

- `scripts/run-vps-runner.mjs`: `selectPendingVpsReviewerFallbacks()` で parsed headSha を使う。pending runtime truth に usage fields を追加する。risk は fallback reviewer pickup の選択条件に触れるため、テストで同一 head / new head を固定する。
- `test/vps-runner-script.test.js`: body headSha only の regression test と usage field assertion を追加する。

## 既に通っている経路

`scripts/run-codex-pr-review-fallback.mjs` は `--model gpt-5.4-mini` を明示し、unsupported model を blocked marker に分類できる。`isReviewerTerminalResolved()` は Codex fallback `completed` / `blocked` を resolved として扱う。

## 未確認の境界

Codex Analytics の実使用量 API はこの PR では読まない。VPS 本番での live retry loop 消失は post-merge / deploy / runner sync 後の実証が必要。

## 穴が出そうな箇所

trusted reviewer 判定外の actor が blocked marker を投稿した場合は terminal として扱わない。これは安全側だが、actor identity failure 時は dedicated incident marker で止める。

## PR 前に確認すること

対象 branch が latest `origin/main` から切られていること、PR #749 の #748 hotfix と混ぜないこと、fallback reviewer tests が通ること。

## 実装候補と捨てた案

採用: runner pickup 前に same-head terminal/blocked を body headSha fallback で検出する。

捨てた案: OpenAI API runner に切り替える。これは owner 方針と Issue #455 Non-goal に反する。捨てた案: Gemini reviewer を止める。これは reviewer gate を弱める。

## merge 後に通す E2E

VPS を `origin/main` に同期後、同一 PR head に requested + blocked fallback marker がある状態で runner を起動し、`codex exec` が起動せず pending fallback count が 0 になることを確認する。

## 次の PR を増やさない理由

この PR は runner pickup guard と usage truth の最小 slice に絞る。wakeup primary、bridge restart、inline stop UI は別 Issue の実装単位であり混ぜない。

## 停止条件

runner selection が必要な fallback まで落とす、trusted reviewer 判定を弱める、credential / deploy / permission mutation が必要になる、または PR #749 の Cloudflare hotfix と混ざり始めた場合は停止する。
