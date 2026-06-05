# Issue #455 app-server threadSource protocol drift 作戦図

## 完了体験

Dashboard Butler から通常入力を送った時、Codex app-server が `Invalid request: unknown variant app_server` で即失敗しない。owner は同じ Dashboard Butler chat で VPS Codex CLI からの返答を受け取れる。

## VTDD 全体で進める部分

Dashboard Butler -> Worker DashboardChatRoom -> VPS app-server bridge -> Codex app-server の `thread/start` protocol drift を修正する。PR #789 で backend thread reset は直したが、Codex CLI 0.137.0 は `threadSource: "app_server"` を受け付けず、`user | subagent | memory_consolidation` の enum を要求している。

## 設計

`buildAppServerThreadStartRequest` の `threadSource` を Codex CLI 0.137.0 が受け付ける owner-facing 通常 thread 種別に合わせて `"user"` に変更する。これは Dashboard Butler が AI として振る舞うためではなく、owner の通常会話 turn を app-server に開始させる protocol value である。scope は app-server bridge の thread start request とその test に限定する。

## 仮説

原因仮説: deploy 後の VPS Codex CLI 0.137.0 で `thread/start.params.threadSource` の enum が変わり、既存コードの `"app_server"` が invalid variant として拒否された。`expected one of user, subagent, memory_consolidation` という実エラー文と、コード上の `threadSource: "app_server"` が一致している。

## 検証計画

- Unit: thread/start request が `threadSource: "user"` を送ることを確認する。
- Integration: dashboard app-server bridge の既存 integration tests が通ることを確認する。
- Local: `node --test test/dashboard-app-server-bridge.test.js`
- Local: `npm run build:worker` は不要。Worker source は触らない。
- Local: `git diff --check`
- Local: `npm test`

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: `buildAppServerThreadStartRequest` の `threadSource` literal を変更。
- `test/dashboard-app-server-bridge.test.js`: thread start request の expected value を追加または更新。

## 既に通っている経路

bridge は `thread/start` と `turn/start` を組み立てて Codex app-server に送っている。VPS runtime は最新 main `37021db` で bridge restart 済みだが、実 turn は `unknown variant app_server` で失敗した。

## 未確認の境界

`threadSource: "user"` が production app-server で通常会話 turn として成功することは、merge/deploy/bridge restart 後の live E2E で確認する。

## 穴が出そうな箇所

- `threadSource` を削除するだけだと Codex CLI 側 default が不明になる。
- `"subagent"` は owner-facing Dashboard Butler thread ではなく、意味が違う。
- `"memory_consolidation"` は通常会話ではない。
- model / backend thread reset の問題と混ぜると原因を誤る。

## PR 前に確認すること

Issue #455、PR #789、VPS runtime error、`buildAppServerThreadStartRequest`、該当 test、未追跡 E2E assets を stage しないこと。

## 実装候補と捨てた案

採用: `threadSource` を `"user"` にする。owner の通常入力を Codex app-server に渡す thread として enum 意味が合う。

捨てた案: `threadSource` を削除する。Codex CLI default が未確認で、また protocol drift を隠すため不採用。

捨てた案: `"subagent"` にする。Dashboard Butler は subagent thread ではないため不採用。

## merge 後に通す E2E

production deploy と bridge restart 後、Dashboard Butler で短い通常入力を送り、`unknown variant app_server` で失敗せず reply が返ることを live E2E として確認する。

## 次の PR を増やさない理由

今回の failure は `thread/start` の単一 protocol enum drift で、bridge request builder と test を同時に直せば owner-facing blocker を閉じられる。model-less rollback や cost analytics は別 scope として残す。

## 停止条件

Codex CLI が `"user"` でも拒否する、または `thread/start` の request schema 全体が変わっていて追加の protocol discovery が必要になった場合。deploy、credential、billing、permission mutation が必要になった場合。
