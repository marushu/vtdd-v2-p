# Issue #455 Dashboard Butler bridge-only correction

## 完了体験

Dashboard Butler は owner-facing AI 返信を Worker 内で完結しない。owner が通常 chat に自然文を送ると、Dashboard は owner message を保存し、ack し、必ず app-server bridge へ `app_server_turn_requested` を送る。軽量 read / cost 相談 / PR 状況確認であっても、会話判断は VPS Codex CLI / codex app-server 側に届ける。Worker は中継、認証、保存、transient status、明示 helper proposal の境界だけを担当する。

## VTDD 全体で進める部分

Issue #450 の live Dashboard Butler path と Issue #455 の cost guard の衝突を修正する。#455 の旧 Success Criteria は「軽量 read / status / dashboard 表示では Codex CLI を起動しない fast path」を含むが、2026-06-04 owner 明示指示により、Dashboard Butler 開発では「Dashboard Butler は AI ではなく VPS Codex CLI へ届ける中継機」という解釈を優先する。

## 設計

DashboardChatRoom の通常 owner message flow から、`buildDashboardGitHubReadFastPathMessages()` と `buildDashboardCostAwareFastPathMessages()` による Butler message 保存・broadcast の short-circuit を外す。bridge が接続されている場合、通常 message は既存の `dispatchOwnerMessageToAppServerBridge()` に進める。

VPS privileged maintenance intent は例外として残す。これは AI 返信ではなく、root/sudo/restart 等の authority boundary を Worker 側で止める安全 gate だからである。

bridge が接続されていない場合は、従来どおり app-server bridge unavailable の説明を返す。Worker が軽量 AI 返信で代替しない。

## 仮説

PR #756 / PR #757 は Codex usage 節約のため Dashboard Worker 内に fast path AI 返信を追加した。結果として Dashboard Butler が owner の会話を VPS Codex CLI へ届けず、`repository is required for GitHub read fast path` のような内部都合を返信した。これは owner が期待する Dashboard Butler = VPS Codex CLI への中継機という設計と衝突している。

## 検証計画

- Unit: cost-aware owner turn でも app-server bridge へ `app_server_turn_requested` が送られる。
- Unit: PR status owner turn でも GitHub read plane Worker reply ではなく app-server bridge へ送られる。
- Unit: repo-less PR status でも blocked fast path reply を出さず、app-server bridge へ送られる。
- Unit: VPS privileged maintenance intent は引き続き Worker proposal / approval boundary で止まる。
- Local: `npm run build:worker`、targeted `node --test test/worker.test.js`、`npm run check:generated-worker`、`git diff --check`。

## 改修見積もり

- `src/worker/runtime.js`: DashboardChatRoom の fast path short-circuit 呼び出しを削除する。risk は #455 の旧 test / docs と衝突すること。
- `test/worker.test.js`: #756/#757 由来の fast path tests を bridge-only expectation に反転する。risk は GitHub read plane route 自体の tests と混同すること。
- `worker.js`: generated worker 更新。risk は source と generated worker の不一致。
- `docs/butler/dashboard-butler-app-server-live-path.md`: Dashboard Butler は Worker 内の軽量 AI ではなく、通常会話を app-server bridge へ届ける中継面であることを durable anchor に追記する。
- `docs/development-strategy/issue-455-dashboard-butler-bridge-only.md`: 方針転換を明示する。

## 既に通っている経路

DashboardChatRoom は bridge 接続時に ordinary owner turn を `app_server_turn_requested` として送れる。VPS maintenance intent は authority boundary として Worker 側で proposal / approval に落とせる。GitHub read plane の低レベル route 自体は存在する。

## 未確認の境界

Issue #455 本文は旧 fast path Success Criteria をまだ含む。今回 PR では owner 明示指示を優先して実装を戻し、PR body でこの衝突を記録する。Issue 本文改訂は必要なら別途行う。

## 穴が出そうな箇所

cost guard を全部消すと、owner が heavy turn の cost を見失う。したがって transient status の「Codex usage を消費し得ます」は維持する。AI 返答を Worker が代替しないことと、cost visibility を消すことは別問題である。

## PR 前に確認すること

branch が latest `origin/main` から切られていること。未追跡 E2E assets を混ぜないこと。PR #756 / #757 / #760 / #762 の差分と owner screenshot の文言を読んだこと。worker generated check が通ること。

## 実装候補と捨てた案

採用: DashboardChatRoom の fast path short-circuit を外し、通常 owner turn は bridge に届ける。

捨てた案: PR #757 だけを丸ごと revert する。#756 の cost-aware AI 返信が残り、根本条件を満たさない。

捨てた案: repo-less の blocked reply だけを直す。owner の明示条件は「軽量であっても全て VPS Codex CLI に届ける」なので不足する。

## merge 後に通す E2E

production Dashboard Butler で、repo-less main chat から `PR #763 はマージ済み？` のような文を送り、Worker blocked reply ではなく app-server bridge / VPS Codex CLI へ渡ることを確認する。さらに cost 相談も Worker AI 返信で終わらず、VPS Codex CLI 由来の返答になることを確認する。

## 次の PR を増やさない理由

これは #756/#757 由来の owner-facing regression を止める最小 correction であり、GitHub read plane route や VPS helper lifecycle を同時に作り替えない。

## 停止条件

bridge が未接続の時に Worker が AI 代替返信を始める必要が出た場合は停止する。deploy、credential / permission mutation、VPS helper root execution が必要になった場合もこの PR では進めない。
