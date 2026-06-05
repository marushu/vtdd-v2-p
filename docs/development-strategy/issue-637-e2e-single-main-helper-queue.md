# Issue #637 single main helper queue E2E 作戦図

## 完了体験

Dashboard Butler PWA の通常チャットから、owner が自然文で VPS privileged maintenance intent を送ると、現行 single main thread のまま approval proposal まで到達し、承認後 helper queue handoff が GitHub-visible evidence に残る。root 実行はこの E2E では開始しない。

## VTDD 全体で進める部分

Issue #637 のうち、既に production で通った low-risk/read と approval-bound helper queue の local E2E を、PR #792 以降の `dashboard-main-unresolved` runtime truth に合わせ直す。Issue #590 の実機観測は継続条件として残す。

## 設計

E2E は mobile viewport の Dashboard UI から送信ボタンで owner intent を送る。最初の turn は approval_required を検証し、テスト用 passkey grant を memory provider に保存した後、同じ `dashboard-main-unresolved` thread で helper queue handoff を POST する。queue comment body に bounded handoff、helperExecutionInput、single main dashboardThreadId が含まれることを検証する。

## 仮説

失敗原因の仮説は二つある。第一に、mobile Playwright context で `Control+Enter` が現在の UI submit と安定して一致せず、owner bubble が出ない。第二に、PR #792 以降は repository-derived `dashboard-main-marushu-vtdd-v2-p` が main chat truth ではなく、#637 E2E の承認後 handoff 期待値が古い。

## 検証計画

- Local E2E: `npx playwright test scripts/e2e-issue637-dashboard-helper-queue.spec.mjs --browser=chromium --reporter=line`
- Evidence: `docs/mvp/e2e/assets/issue-637/local/issue637-dashboard-helper-queue-chromium-state.json`
- Evidence: `docs/mvp/e2e/assets/issue-637/local/issue637-dashboard-helper-queue-chromium-390x844.png`
- Hygiene: `git diff --check`

## 改修見積もり

- `scripts/e2e-issue637-dashboard-helper-queue.spec.mjs`: submit 操作を送信ボタンへ寄せ、thread fixture / expectation を `dashboard-main-unresolved` に更新する。risk は E2E が UI ボタン構造に依存すること。
- `docs/mvp/e2e/assets/issue-637/local/*`: 更新後 evidence を保存する。

## 既に通っている経路

Issue #637 は helper registry、installer dry-run/staging、root bootstrap install、scoped sudo helper functional probe、low-risk production helper queue pickup/completion まで partial evidence がある。root-required capability lifecycle、restart、add-disable-remove-rollback、通知、owner-facing final link summary は未完了。

## 未確認の境界

この slice は root 実行を開始しない。restart / root-required command / manifest mutation / scoped passkey 実機 approval は未確認のまま残る。production PWA の owner-facing evidence link summary も別途必要。

## 穴が出そうな箇所

他の Dashboard E2E にも repository-derived thread fixture が残っている可能性がある。#637 の helper queue evidence だけを直すため、横展開は別判断にする。

## PR 前に確認すること

Issue #637 が open、PR #797 が merged、main が `origin/main` と一致、untracked `.tmp/` / `test-results/` を含めない、E2E evidence を目視または JSON で確認する。

## 実装候補と捨てた案

採用: E2E を現行 UI submit と single main thread truth に合わせる。捨てた案: runtime 本体を変更する。今回の失敗は E2E 操作と fixture drift であり、runtime queue path の unit evidence は既に `dashboard-main-unresolved` を期待している。

## merge 後に通す E2E

必要なら production PWA で #637 low-risk read/status helper queue を再実行し、queue comment / runner event / final summary link が owner-facing に辿れることを確認する。

## 次の PR を増やさない理由

この PR は E2E 陳腐化の修正だけで閉じる。#637 の restart/root-required/add-disable-remove-rollback/notification は大きい authority boundary を伴うため、この PR へ混ぜない。

## 停止条件

E2E が runtime regression を示す、helper queue が root 実行を開始する、approval scope が single main thread と一致しない、または deploy/permission/destructive work が必要になった場合は停止する。
