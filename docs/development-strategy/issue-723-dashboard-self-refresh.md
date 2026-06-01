# Issue #723 Dashboard Self Refresh Strategy

## 完了体験

Owner が Dashboard Butler で「古いままかもしれない」と感じた時、Mac Codex を開かずに同じ PWA から現在の client / service worker / runtime / bridge の手掛かりを確認できる。

通常の `⌘ + R` で戻れる場合はそのまま案内し、古い service worker や Cache Storage を疑う場合は「強制キャッシュ削除リロード」を明示的に選べる。未送信 draft、thread id、repository context は reload 前に sessionStorage へ保存する。

この PR は Issue #590 の activity watchdog を完成扱いにしない。PR #721 deploy 後にも古い 2分 timeout 文言が出た事実から、freshness drift を owner-facing に切り分けるための前提回復スライスとして扱う。

## VTDD 全体で進める部分

Issue #723 を Issue #590 の `ROOT` 補助スライスとして先に進める。Dashboard Butler が最新 client かどうかを owner が推測する状態では、Issue #590 の timeout recovery E2E が正しく読めない。

Issue #637 の VPS privileged maintenance はこの PR では進めない。Issue #723 は iPhone/PWA recovery gap を狭めるが、deploy / root / credential / permission mutation は一切開始しない。

## 設計

Dashboard main chat の管理メニューに「最新状態」と「強制リロード」を追加する。通常チャット面を壊さず、debug/ops 面に隔離されている既存構造に合わせて、進行中 lane の中へ小さく置く。

client script は build id、thread id、repository context、service worker registration state、WebSocket state を status area に出す。強制リロードは draft 保存後、service worker へ cache clear message を送り、registration update と Cache Storage 削除を best-effort で行い、最後は `location.reload()` に fallback する。

service worker は `VTDD_DASHBOARD_CLEAR_CACHES` message を受け、Dashboard / VTDD 系 cache name だけ削除する。unregister や全 origin cache 削除は初期実装では避ける。

## 仮説

PR #721 は merge/deploy truth では成功していたが、owner PWA では旧 2分 timeout 文言が出た。`⌘ + R` で復帰したため、Worker 未deploy よりも stale client / service worker / WebSocket session の可能性が高い。

現在の Dashboard service worker は push/notificationclick だけを扱い、client 側にも freshness 表示や force reload 導線がない。そのため deploy 成功通知を受けても、owner は古い PWA shell なのか app-server stall なのかを切り分けられない。

狭く timeout 秒数だけ伸ばすと、実際の stale client 問題を隠して Issue #590 の E2E を誤読する。

## 検証計画

Unit / integration test では `/dashboard` HTML に freshness / force reload UI、draft preserving reload script、service worker update / cache delete path が含まれることを確認する。

Service worker test では `/dashboard-sw.js` に `VTDD_DASHBOARD_CLEAR_CACHES` message handler、dashboard scoped cache deletion、`clients.claim()` が残ることを確認する。

生成 worker を更新し、`npm run check:generated-worker` で source と generated worker の差分を検証する。

Production E2E は merge/deploy 後に Dashboard Butler を開き、最新状態表示、強制リロード後の同一 thread/context 復帰、旧 timeout 文言が残る場合の切り分け文言を確認する。この PR 内では production deploy は実行しない。

## 改修見積もり

- `src/worker/runtime.js`: Dashboard main chat HTML / client script / service worker script。UI 追加と best-effort refresh function。通常送信や timeout watchdog へは触れない。
- `test/worker.test.js`: Dashboard shell と PWA service worker の assertions を追加。既存の auth/header helper を使う。
- `worker.js`: `npm run build:worker` で生成更新。
- `docs/mvp/active-issue-execution-queue.md`: Issue #723 が Issue #590 の freshness validation をブロックする ROOT 補助スライスであることを記録する。

## 既に通っている経路

PR #721 は merged。deploy-production run 26753699460 は merge SHA `4aaf2580e55b01754b764b2b77a3aca97d8b73ec` で成功していた。

Dashboard notification 経路は deploy 完了通知を owner に届けられる。`⌘ + R` による手動復帰は owner 観測として存在する。

Dashboard chat は sessionStorage draft retention、WebSocket reconnect、thread refresh、service worker registration を既に持つ。

## 未確認の境界

iOS PWA で Cache Storage deletion と service worker update がどこまで即時反映されるかは端末依存で未確認。

Cloudflare edge / browser HTTP cache / service worker update timing のどれが stale を生んだかは、この PR だけでは断定しない。

app-server bridge の session freshness truth は別 Issue の範囲に残る。

## 穴が出そうな箇所

強制 reload が未送信添付を完全保持できない。添付 file object はブラウザ reload を跨げないため、draft text は復元し、添付は再選択が必要という文言を出す。

cache deletion を広げすぎると同一 origin の無関係 cache を消す可能性がある。初期実装では dashboard / vtdd prefix を含む cache name に限定する。

通常チャット面へ debug UI を出しすぎると Issue #528 の chat-first 方針に反する。管理メニュー内に留める。

## PR 前に確認すること

Issue #723 の Success Criteria と Non-goal に反して deploy / root / credential mutation を含めていないこと。

Dashboard main chat の通常送信 UI、font-size、textarea focus 挙動に触れていないこと。

PR body に Issue #723、Issue #590 への関係、E2E 未完了、Execution Queue Delta を明記すること。

## 実装候補と捨てた案

採用: owner が明示的に押せる `最新状態` と `強制キャッシュ削除リロード`。draft 保存と best-effort cache clear を行う。

捨てた案: deploy 完了時に自動で即 reload する。owner の入力中 state を壊す可能性があるため初期実装では採用しない。

捨てた案: service worker unregister と全 cache delete。復旧効果は強いが、初期実装として破壊的に寄りすぎる。

## merge 後に通す E2E

production deploy 後、Dashboard Butler PWA の同じ thread で「最新状態確認」を押し、build id / service worker / WebSocket state が表示されることを見る。

強制キャッシュ削除リロードを押し、同じ thread id と repository context に戻り、draft text が保持または復元警告されることを見る。

旧 2分 timeout 文言が再発した場合、Issue #590 の actual stall か Issue #723 の stale client かを分けて記録する。

## 次の PR を増やさない理由

Issue #723 の初期 owner-facing 導線、service worker message handler、test evidence は同じ runtime surface に閉じており、分けると stale client 対策が半端になる。

ただし app-server bridge freshness truth、deploy event からの same-thread 自動投稿、stop/interrupt UI は別 scope として残す。

## 停止条件

Dashboard main chat の通常送信、draft retention、WebSocket reconnect に予期しない変更が必要になったら停止する。

iOS PWA で実現不能な browser capability を前提にしないと success criteria を満たせないと分かったら停止する。

Issue #723 以外の root/deploy/credential/permission 境界へ踏み込む必要が出たら停止する。
