# Issue #528 Dashboard WebSocket auth session strategy

## 完了体験

オーナーが Dashboard Butler を passkey / Cloudflare Access で開いたら、通常チャットの WebSocket も同じ owner session で接続できる。画面だけ開いて `接続準備中です。送信できる状態になったら知らせます。` が居座る状態にしない。

## VTDD 全体で進める部分

Issue #528 の Dashboard Butler 通常チャット面、Issue #579 の reconnect/auth recovery、Issue #450 の live bridge 土台を進める。Issue #637 の VPS helper completion はこの PR では閉じない。

## 設計

Dashboard HTML を Cloudflare Access owner identity で許可できた時、Worker が短命の `dashboard_read_session` を memory に作り、`vtdd_dashboard_session` HttpOnly cookie を同じ response に付ける。以後、Dashboard chat WebSocket は既存の `authorizeDashboardPasskeySession()` で同じ cookie を読める。passkey で既に read session cookie がある場合は既存経路をそのまま使う。

## 仮説

原因仮説は、Dashboard page request は Cloudflare Access headers で通る一方、WebSocket handshake では同じ Access identity headers が届かず、passkey/read-session cookie も無い場合に `/v2/dashboard/chat/:threadId/ws` が `dashboard_auth_required` になること。結果として HTML は開くが WebSocket は `未接続` のまま reconnect し続ける。

## 検証計画

worker test で Cloudflare Access authenticated Dashboard HTML response が `vtdd_dashboard_session` cookie をセットすること、その cookie で dashboard chat WebSocket route が auth を通過して `426 websocket_upgrade_required` まで進むことを確認する。`npm run build:worker` と `npm run verify:worker` を通す。deploy 後に production Dashboard Butler で composer status が接続済み/通常状態へ進むことを確認する。

## 改修見積もり

- `src/worker/runtime.js`: Dashboard HTML response に Access-backed read session cookie を付与する helper、`html()` の extra headers 対応。
- `test/worker.test.js`: Access-auth Dashboard が read session cookie を出す test、read session cookie で chat WebSocket auth を通る test。
- `worker.js`: generated worker。

## 既に通っている経路

passkey verify 後に `dashboard_read_session` を作り、`vtdd_dashboard_session` cookie をセットする経路は既にある。Dashboard chat WebSocket は同 cookie を `authorizeDashboardPasskeySession()` で読める。

## 未確認の境界

Cloudflare Access が production WebSocket handshake に identity headers を入れるかは未確認。今回の修正は Access headers に頼らず、HTML response 時点で same-origin read session cookie を作ることで回避する。

## 穴が出そうな箇所

cookie を作れない memory provider 状態では fallback できない。passkey session cookie を無制限に増やすと memory が増えるため、既存 cookie がある場合は新規作成しない。WebSocket で高リスク操作を許可するわけではなく read session のみに限定する。

## PR 前に確認すること

`authorizeDashboardRequest()`、`authorizeDashboardPasskeySession()`、`buildDashboardPasskeySessionCookie()`、Dashboard page route、Dashboard chat WebSocket route、既存 dashboard auth tests を確認する。

## 実装候補と捨てた案

採用案は Dashboard HTML response で Access-backed read session cookie を作る案。捨てた案は WebSocket URL に token を埋め込む案、Cloudflare Access cookie/JWT を直接読む案、WebSocket route を無認証にする案、heartbeat をさらに調整する案。

## merge 後に通す E2E

production deploy 後に Dashboard Butler を開き、composer 下が `接続準備中です...` のまま増殖しないこと、`data-websocket-state` が接続済みに進むこと、通常メッセージ送信が同じ thread に保存されることを確認する。

## 次の PR を増やさない理由

この PR は Dashboard page auth と chat WebSocket auth の断絶だけを直す。VPS helper lifecycle、queue/timer 即時性、Butler 作戦図自動生成には踏み込まず、接続不能の root blocker を狭く閉じる。

## 停止条件

WebSocket に bearer token を露出する必要が出る、read session を高リスク approval と混同する、または Dashboard Butler 通常チャットではなく Custom GPT / Action Schema 側へ逸れる場合は停止する。
