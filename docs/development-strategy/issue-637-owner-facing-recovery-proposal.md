# Issue #637 owner-facing recovery proposal strategy

## 完了体験

Dashboard Butler で owner が明示的に `runner status` や `app-server bridge status` を頼んだ時、返答は `VPS privileged maintenance proposal` / `helper queue` という内部語中心ではなく、何を確認しようとしているか、risk は何か、承認なしでは実行していないこと、次に owner が開く承認 URL が何かを日本語で読める。

通常の状況相談は PR #762 の境界通り、VPS maintenance path に吸い込まない。

## VTDD 全体で進める部分

Issue #637 は iPhone/PWA から VPS runner / app-server bridge / helper recovery を扱う土台である。入口の自然文検出だけでなく、owner-facing 表示が内部構造を押し付けると、実際の運用で「何が起きるのか」が分からないまま passkey を求める体験になる。

今回は実行能力を増やさず、明示的 recovery intent に対する説明を owner-facing にする。

## 設計

`buildDashboardVpsPrivilegedMaintenanceApprovalRequiredReply` で proposal の capability / approvalScope / runtimeTruth から以下を表示する。

- 対象 repo / Issue
- 確認対象 capability title
- operation / risk
- approval URL
- `rootExecutionStarted=false` / `helperExecutionStarted=false`
- 承認後も queue 化までであり、VPS runner の完了 truth まで live 実行完了とは扱わないこと

queued reply も `helper execution queue` を前面に出すのではなく、「VPS runner へ復旧依頼を渡した」と説明する。

## 仮説

現在の実装は機能上は proposal に到達しているが、返信が内部語中心で owner には分かりにくい。表示文言だけを直せば、authority boundary と runtime path を変えずに UX を改善できる。

## 検証計画

- `test/worker.test.js` の Issue #637 関連 test で approval_required reply が owner-facing 文言、operation、risk、実行未開始を含むことを確認する。
- queue reply が owner-facing 文言で、runtime truth はこれまで通り `rootExecutionStarted=false` / `helperExecutionStarted=false` を含むことを確認する。
- `node --test test/worker.test.js --test-name-pattern "VPS privileged maintenance|VPS runner status|recovery intent|helper queue"` を実行する。
- `npm run build:worker`、`npm run check:generated-worker`、`git diff --check` を実行する。

## 改修見積もり

- `src/worker/runtime.js`: approval_required / queued reply builder の文言を変更する。risk は tests の既存期待とのズレ。
- `test/worker.test.js`: owner-facing 文言の期待値を追加する。risk は文言を固定しすぎること。
- `worker.js`: `npm run build:worker` の生成物。
- `docs/development-strategy/issue-637-owner-facing-recovery-proposal.md`: この作戦図。

## 既に通っている経路

PR #762 で通常チャットを VPS helper path に吸い込まない regression test がある。Issue #637 の proposal / approval URL / queue handoff test も既にある。

## 未確認の境界

production PWA での実際の表示確認、passkey 承認後の live runner pickup、status/logs の実 command output 表示は未確認。

## 穴が出そうな箇所

文言を owner-facing にしすぎて authority boundary が弱く見えると危険。必ず「承認なしに実行していない」「承認後も完了 truth ではない」を残す。

## PR 前に確認すること

latest `origin/main` から branch を切ること、PR #762 の regression を壊さないこと、untracked `.tmp/` / `test-results/` を混ぜないこと、PR body は日本語-first にすること。

## 実装候補と捨てた案

採用: reply builder の owner-facing 表示だけを改善する。

捨てた案: low-risk status を passkey なしで即実行する。Issue #637 の authority boundary を変えるため、この PR では扱わない。

捨てた案: #455 fast path を再導入/削除する。通常会話と recovery proposal の文言改善とは別問題。

## merge 後に通す E2E

production deploy 後、Dashboard Butler で `app-server bridge status を確認して。Issue #637` を送り、返答が owner-facing proposal になり、通常の状況相談は VPS maintenance path に吸い込まれないことを確認する。

## 次の PR を増やさない理由

この PR は表示の最小改善で、execution / passkey / helper queue の仕様変更を含まない。次の PR で status/logs 実行 truth を扱う場合も、今回の文言改善が前提になる。

## 停止条件

文言改善だけで authority boundary が弱くなる、または low-risk 実行 semantics を変える必要が出た場合は停止する。deploy、root execution、credential / permission mutation が必要になった場合も停止する。
