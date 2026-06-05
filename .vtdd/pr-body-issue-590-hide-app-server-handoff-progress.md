## This PR satisfies Intent

- Issue #590 の部分進捗です。添付画像で確認された `Codex app-server に渡しています... usage_profile...` と `作業を継続しています。まだ最終回答は生成中です。` が通常 chat の `BUTLER` bubble に挟まる読みづらさを止めます。
- handoff / long-turn heartbeat は composer 下の transient progress には残しますが、`progressSummary.entries` には入れず、通常 chat bubble として復元されないようにします。
- PR #808 は自動マージ済みだったため、merged branch へ push せず、fresh `origin/main` から新しい follow-up branch を切っています。

## Satisfied Success Criteria

- `owner_message_dispatch` / pending bridge 系 source を progress summary entry から除外しました。
- `Codex app-server に渡しています。...` の動的 handoff 文言を progress summary entry から除外しました。
- `作業を継続しています。まだ最終回答は生成中です。` を低情報 progress として扱い、long-turn checkpoint を transient-only にしました。
- Unit / E2E evidence で、handoff status が transient-only で chat bubble を増やさないことを確認しました。

## Unsatisfied Success Criteria

- Issue #590 全体は未完了です。production iPhone / iPad PWA で、添付画像の赤丸相当の bubble が消えることを merge/deploy 後に確認する必要があります。
- bridge lifecycle log のさらに細かい分類、stop / interrupt / owner input queue はこの PR では扱いません。
- Issue #637 の VPS helper 詳細リンク / privileged maintenance lifecycle はこの PR では扱いません。

## Non-goal violations

None.

## 開発前作戦図

- 作戦図 evidence: docs/development-strategy/issue-590-hide-app-server-handoff-progress.md
- 完了体験: Dashboard Butler PWA の通常 chat 本文には低情報 handoff / heartbeat bubble が挟まらず、owner は composer 下の `進行中` と最終返信だけを読める。
- VTDD 全体で進める部分: Issue #590 の owner-facing long-turn observability を改善する。PR #808 の auto-scroll rollback 後に残った履歴汚染だけを扱う。
- 設計: Dashboard Butler owner-facing surface では transient snapshot の `progressSummary.entries` が chat checkpoint bubble になるため、handoff / long-turn heartbeat の source/text を summary entry から除外する。
- 仮説: 原因仮説は、`owner_message_dispatch` と `long_turn_checkpoint` が `progressSummary.entries` に入り、thread refresh / transient restore で `renderThreadProgressCheckpoint()` により通常 BUTLER bubble として描画されること。
- 検証計画: focused worker test、worker build、generated worker check、Issue #590 Playwright E2E、diff hygiene。
- 改修見積もり: `src/worker/runtime.js` の summary inclusion guard、`test/worker.test.js` の transient-only regression、`scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs` の mobile evidence、`worker.js`、作戦図。
- 既に通っている経路: PR #731 以降の generic progress transient-only、PR #808 の gentle auto-scroll rollback、composer 下 progress card。
- 未確認の境界: production PWA は stale client / service worker の影響を受けるため、merge/deploy 後に freshness check または reload evidence が必要。
- 穴が出そうな箇所: inclusion guard を広げすぎると `waiting_approval` / `waiting_user_input` など owner action が必要な progress まで消える。
- PR 前に確認すること: 添付画像 localPath、Issue #590 queue position、PR #808 merged truth、fresh `origin/main` branch、source diff、generated worker、E2E evidence。
- 実装候補と捨てた案: 採用は source/text inclusion guard。checkpoint renderer 全削除と bridge protocol 変更は広すぎるため不採用。
- merge 後に通す E2E: production PWA live E2E で長い app-server turn を走らせ、`Codex app-server に渡しています` と `作業を継続しています。まだ最終回答は生成中です。` が通常 chat bubble に出ないこと、composer 下 progress と最終返信が残ることを検証する。
- 次の PR を増やさない理由: 添付画像の読みづらさは同じ progressSummary inclusion 境界に収まり、Issue #637 helper link や stop/interrupt は別 authority / UX 問題として分けるため。
- 停止条件: owner action 表示が消える、final reply が消える、通常 chat 履歴に低情報 progress が戻る、または deploy / credential / permission / destructive work が必要になる場合。

## Dry-run Impact Report

- Target Issue: Issue #590。
- Implementing Success Criteria: handoff / long-turn heartbeat の低情報 progress を通常 chat bubble に混ぜない。
- Explicit Non-goals: deploy、app-server bridge restart、VPS helper/root execution、credential/permission mutation、Issue close、Issue #637 lifecycle、stop / interrupt、app-server protocol 変更。
- Expected touched files/routes/workflows: `src/worker/runtime.js`, `worker.js`, `test/worker.test.js`, `scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs`, `docs/development-strategy/issue-590-hide-app-server-handoff-progress.md`, `docs/mvp/e2e/assets/issue-590/local/*`。
- Affected Issues: Issue #590。Issue #637 / Issue #450 / Issue #654 は未完了のまま残します。
- Affected PRs: PR #808 は merged 済みなので更新しません。新規 PR として扱います。
- Affected workflows: local worker test / build / generated worker check / Playwright E2E。GitHub checks は PR 作成後に確認します。
- Affected runtime/operator surfaces: Dashboard Butler PWA の通常 chat live progress UI。operator surface は未変更。
- What may break if we patch narrowly: 有用な progress checkpoint が減る可能性はあるが、今回の exclusion は handoff / long-turn heartbeat に限定する。
- Unknowns to investigate before coding: production PWA の stale client / service worker 影響。
- Validation needed: focused worker test、build、generated worker check、Issue #590 Playwright E2E、diff check。
- Stop condition: high-risk action が必要になる、または owner action / final reply / progress card が壊れる。

## Execution Queue Delta

- Queue position before: Issue #590 が Now。長い Dashboard Butler turn の owner-facing observability / recovery evidence が root blocker。
- Preemption decision: ROOT。添付画像で低情報 progress が通常 chat bubble に挟まり、Issue #590 の owner-facing UX を直接壊しているため。
- Queue delta: Issue #590 の handoff progress transient-only slice を進めます。PR #808 は merged 済みなので、新規 PR で同じ Issue #590 の Evidence Gap を減らします。
- Why this PR is next: progress 可視化は必要だが、handoff/heartbeat が本文 bubble になると ChatGPT iOS 相当の読みやすさを下回るため。
- Active Issues not downscoped: Active Issues は縮小しません。Issue #637 / Issue #450 / Issue #654 / その他 active Issue は未完了として残します。

## File / Line Hypotheses

- file: `src/worker/runtime.js`
  - hypothesis: `buildDashboardProgressSummarySnapshot()` が handoff / long-turn heartbeat を summary entry 化し、Dashboard renderer が通常 bubble として復元している。
  - risk if changed narrowly: `waiting_approval` / `waiting_user_input` のような owner action 表示まで消す。
  - validation: focused worker test、Issue #590 Playwright E2E、generated worker check。
  - related Issue: Issue #590。
- file: `scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs`
  - hypothesis: current E2E は generic transient bubble absence を見ているが、添付画像の app-server handoff 文言そのものを fixture にしていない。
  - risk if changed narrowly: exact regression が戻っても E2E evidence が弱い。
  - validation: mobile viewport E2E の bubble count / transient-only evidence。
  - related Issue: Issue #590。

## Hypothesis Retrospective

- expected: handoff / long-turn heartbeat を summary entry から外せば、赤丸の低情報 BUTLER bubble は通常 chat 履歴に出なくなる。
- actual: focused worker test、build、generated worker check、Issue #590 E2E、diff check は通過した。
- mismatch: production PWA live evidence はまだ未実施。
- lesson: transient snapshot の `progressSummary.entries` は通常 chat bubble として見えるため、低情報 status を入れてはいけない。
- should become RAG candidate: yes。Dashboard app-server handoff status は composer transient-only にする。

## Verification Evidence

- Unit: `node --test test/worker.test.js --test-name-pattern 'DashboardChatRoom|dashboard|progress|composer|summary'` -> 283 passed。
- Build: `npm run build:worker` -> pass。
- Generated: `npm run check:generated-worker` -> pass。
- E2E: `npx playwright test scripts/e2e-issue590-dashboard-timeout-recovery.spec.mjs --browser=chromium --reporter=line` -> 2 passed。
- Static: `git diff --check` -> pass。
- Evidence path/link: `docs/mvp/e2e/assets/issue-590/local/issue590-dashboard-inline-transient-progress-chromium-state.json`, `docs/mvp/e2e/assets/issue-590/local/issue590-dashboard-inline-transient-progress-chromium-390x844.png`

## Butler Completion Contract

- Primary owner surface: Dashboard Butler PWA。
- Fallback surface: mac Codex は実装補助 surface。主経路ではなく fallback / debug surface。
- Owner goal: 長い作業中の handoff / heartbeat は見えるが、通常 chat 本文には低情報 progress bubble が挟まらない。
- Butler entrypoint: Dashboard Butler 通常チャット。
- Dashboard Butler natural-language path: Dashboard Butler 通常チャット入口で owner の自然文作業依頼を受け、同じ chat 経路に transient progress と最終返信を表示する。
- Action Schema exposure: 変更なし。
- Runtime path: Worker-served Dashboard HTML / inline renderer / DashboardChatRoom transient snapshot。
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

- bridge lifecycle log の別整理。
- Issue #637 helper 詳細リンク未受信の修正。
- stop / interrupt / owner input queue。
- deploy / bridge restart 実行。
- Issue #590 close。

## Extra changes (if any)

None.

<!-- VTDD metadata -->
- Issue: Issue #590
- Execution ID: dashboard-butler-issue-590-hide-app-server-handoff-progress-2026-06-05
- Goal: Dashboard Butler PWA の handoff / heartbeat progress を transient-only にして通常 chat bubble から外す。
