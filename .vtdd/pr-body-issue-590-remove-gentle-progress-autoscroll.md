## This PR satisfies Intent

- Issue Issue #590 の部分進捗です。PR #803 で入れた live progress の「ゆっくり追従」は owner feedback で使いづらいと判明したため、Dashboard Butler PWA から progress auto-scroll timer を撤回します。
- progress checkpoint / transient progress は残し、通常 chat 履歴に低情報 progress を増やさない既存方針は維持します。
- final reply など明示的に最下部へ移動すべき通常 path は残し、progress update だけで owner の読書位置を勝手に動かさない形に戻します。

## Satisfied Success Criteria

- `scheduleGentleScrollFollow()` と関連 timer / human-scroll listener を Dashboard client script から削除しました。
- `renderThreadProgressCheckpoint()` は `scrollToLatestIfFollowing(shouldFollow)` の即時 follow / no-op のみを使い、gentle follow option を使いません。
- Worker source assertion と Issue #590 Playwright E2E は、gentle progress auto-scroll が存在しないことを regression guard にしました。
- Issue #590 local E2E evidence を更新し、progress update が owner の chat scroll position を保持することを再確認しました。

## Unsatisfied Success Criteria

- Issue Issue #590 全体は未完了です。production iPhone / iPad PWA で「ゆっくりスクロールが出ない」「progress は見える」「final reply は読める位置に戻る」を確認する必要があります。
- bridge lifecycle log を通常 chat 本文からさらに整理する作業はこの PR では扱いません。
- Issue Issue #637 の VPS helper 詳細リンク / privileged maintenance lifecycle はこの PR では扱いません。

## Non-goal violations

None.

## 開発前作戦図

- 作戦図 evidence: `docs/development-strategy/issue-590-gentle-progress-autoscroll.md`
- 完了体験: Dashboard Butler の長い turn 中、live progress checkpoint が更新されても owner の読んでいる位置を勝手に下へ動かさない。
- VTDD 全体で進める部分: Issue Issue #590 の owner-facing observability UX を改善する。Issue #637 helper、deploy/restart automation、Issue close は扱わない。
- 設計: Dashboard Butler owner-facing surface の通常 chat では、`scrollToLatestIfFollowing()` を即時 follow / no-op の helper に戻し、PR #803 の gentle timer を削除する。
- 仮説: 原因仮説は、`scheduleGentleScrollFollow()` が progress update のたびに下方向 scroll を予約し、owner の読書位置を安定させないこと。
- 検証計画: focused worker test、worker build、generated worker check、Issue #590 Playwright E2E、diff hygiene。
- 改修見積もり: `src/worker/runtime.js` / `worker.js` の scroll helper、`test/worker.test.js`、`scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs`、Issue #590 local E2E evidence。
- 既に通っている経路: PR #801 以降の progress checkpoint / transient progress card / final summary は維持する。
- 未確認の境界: 実機 iOS PWA の体感確認は merge/deploy 後に必要。
- 穴が出そうな箇所: 通常 final reply の auto-scroll まで壊すと完了返信が入力欄下に隠れる。
- PR 前に確認すること: Issue Issue #590 が Now root blocker、PR #803 が merged、origin/main fresh、topic branch 上の narrow diff。
- 実装候補と捨てた案: 採用は gentle timer 削除。timer interval 調整と gentle scroll 継続は owner feedback に反するため不採用。
- merge 後に通す E2E: production PWA live E2E で長い app-server turn を走らせ、ゆっくりスクロールが出ないこと、progress が履歴汚染しないこと、final reply が読めることを検証する。
- 次の PR を増やさない理由: PR #803 と同じ helper 境界の撤回なので、別 PR に分けると使いづらい production UX を残す。
- 停止条件: progress checkpoint が消える、通常 final reply が追従しない、通常 chat 履歴に低情報 progress が戻る、deploy/credential/permission/destructive work が必要になる場合。

## Dry-run Impact Report

- Target Issue: Issue Issue #590。
- Implementing Success Criteria: live progress checkpoint 更新が owner の scroll position を勝手に動かさない。
- Explicit Non-goals: deploy、app-server bridge restart、VPS helper/root execution、credential/permission mutation、Issue close、Issue #637 lifecycle、bridge lifecycle log の別整理。
- Expected touched files/routes/workflows: `src/worker/runtime.js`, `worker.js`, `test/worker.test.js`, `scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs`, `docs/development-strategy/issue-590-gentle-progress-autoscroll.md`, `docs/mvp/e2e/assets/issue-590/local/*`。
- Affected Issues: Issue Issue #590。Issue Issue #637 / Issue #450 / Issue #654 は未完了のまま残します。
- Affected PRs: PR #803 の follow-up rollback。merged PR branch には push していません。
- Affected workflows: local worker test / build / generated worker check / Playwright E2E。GitHub checks は PR 作成後に確認します。
- Affected runtime/operator surfaces: Dashboard Butler PWA の通常 chat live progress UI。operator surface は未変更。
- What may break if we patch narrowly: progress update が読める位置に入らなくなる可能性はあるが、勝手に動く害を優先して止める。
- Unknowns to investigate before coding: production iOS PWA の体感は local Playwright と完全一致しない。
- Validation needed: focused worker test、build、generated worker check、Issue #590 Playwright E2E、diff check。
- Stop condition: high-risk action が必要になる、または通常 final reply / progress card が壊れる。

## Execution Queue Delta

- Queue position before: Issue Issue #590 が Now。長い Dashboard Butler turn の owner-facing observability / recovery evidence が root blocker。
- Preemption decision: ROOT。owner が live production UX で「ゆっくりスクロールは使いづらい」と判断したため、Issue Issue #590 の現在の owner-facing blocker として即時撤回する。
- Queue delta: Issue Issue #590 の gentle progress auto-scroll rollback slice を進めます。Issue Issue #590 全体は incomplete のまま。
- Why this PR is next: progress 可視化は Butler-first の中核だが、画面を勝手に動かすと ChatGPT iOS 相当の通常会話 UX を下回るため。
- Active Issues not downscoped: Active Issues は縮小しません。Issue #637 / Issue #450 / Issue #654 / その他 active Issue は未完了として残します。

## File / Line Hypotheses

- file: `src/worker/runtime.js`
  - hypothesis: PR #803 の `scheduleGentleScrollFollow()` が progress update のたびに smooth scroll を予約し、owner の読書位置を不安定にする。
  - risk if changed narrowly: 通常 final reply の最下部追従まで壊す。
  - validation: focused worker test、Issue #590 Playwright E2E、generated worker check。
  - related Issue: Issue #590。
- file: `scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs`
  - hypothesis: E2E が gentle follow の存在を要求しているため、rollback 後の期待に更新する必要がある。
  - risk if changed narrowly: source assertion だけになり、体感 scroll regression を見落とす。
  - validation: mobile viewport E2E の scroll preservation evidence。
  - related Issue: Issue #590。

## Hypothesis Retrospective

- expected: gentle progress follow を削除すれば、progress update 中に画面が勝手にゆっくり下へ動く体験は止まる。
- actual: focused worker test、build、generated worker check、Issue #590 E2E、diff check は通過した。
- mismatch: production PWA live evidence はまだ未実施。
- lesson: live progress は「自動で読ませる」より、owner の読書位置を安定させる方を優先する。
- should become RAG candidate: yes。Dashboard live progress auto-scroll は owner feedback で不採用になった。

## Verification Evidence

- Unit: `node --test test/worker.test.js --test-name-pattern 'dashboard|DashboardChatRoom|progress|composer|summary'` -> 283 passed。
- Build: `npm run build:worker` -> pass。
- Generated: `npm run check:generated-worker` -> pass。
- E2E: `npx playwright test scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs --browser=chromium --reporter=line` -> 2 passed。
- Static: `git diff --check` -> pass。
- Evidence path/link: `docs/mvp/e2e/assets/issue-590/local/issue590-dashboard-inline-transient-progress-chromium-state.json`, `docs/mvp/e2e/assets/issue-590/local/issue590-dashboard-inline-transient-progress-chromium-390x844.png`

## Butler Completion Contract

- Primary owner surface: Dashboard Butler PWA。
- Fallback surface: mac Codex は実装補助 surface。主経路ではなく fallback / debug surface。
- Owner goal: 長い作業中の live progress は見えるが、画面が勝手にゆっくり動いて読書位置を奪わない。
- Butler entrypoint: Dashboard Butler 通常チャット。
- Dashboard Butler natural-language path: Dashboard Butler 通常チャット入口で owner の自然文作業依頼を受け、同じ chat 経路に live progress checkpoint を表示する。
- Action Schema exposure: 変更なし。
- Runtime path: Worker-served Dashboard HTML / inline renderer。
- Runner/runtime truth: local tests / build / generated worker / E2E evidence を参照。production deploy は未実施。
- Authority boundary: deploy / bridge restart は passkey approval が必要。この PR では実行しない。
- E2E evidence: local Issue #590 Playwright E2E は pass。production iPhone/PWA E2E は merge/deploy 後に必要。
- Completion status: incomplete

## Surface Update Checklist

- Cloudflare deploy: merge 後に必要。passkey approval が必要。
- Custom GPT Action Schema update: 不要。
- Custom GPT Instructions update: 不要。
- iPhone Butler live E2E: merge/deploy 後に必要。

## Related Constitution Rules

- AGENTS.md Butler Completion Gate
- AGENTS.md Chief Butler Operating Principle
- AGENTS.md Drift Stop Protocol
- AGENTS.md 開発前作戦図 Gate
- AGENTS.md Evidence Discipline
- `docs/butler/execution-queue-contract.md`

## Out-of-scope but NOT implemented

- bridge lifecycle log を通常 chat 本文から消す修正。
- Issue #637 helper 詳細リンク未受信の修正。
- stop / interrupt / owner input queue。
- deploy / bridge restart 実行。
- Issue Issue #590 close。

## Extra changes (if any)

None.

<!-- VTDD metadata -->
- Issue: Issue Issue #590
- Execution ID: dashboard-butler-issue-590-remove-gentle-progress-autoscroll-2026-06-05
- Goal: Dashboard Butler PWA の live progress から gentle auto-scroll を撤回する。
