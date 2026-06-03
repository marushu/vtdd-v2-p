# Issue #741 bridge safe sync 作戦図

## 完了体験

app-server bridge を起動または restart した時、owner は古い VPS checkout の bridge script /
Codex app-server runtime で会話を再開しない。bridge は Codex app-server を初期化する前に
VPS canonical repo が `origin/main` と一致するか確認し、clean + behind-only なら
`git pull --ff-only` で同期してから接続する。dirty / ahead / diverged / unknown untracked
なら bridge は起動を止め、owner-facing な理由をログに残す。

## VTDD 全体で進める部分

Issue #741 の app-server bridge lifecycle guard のうち、deploy 後 / restart 前の checkout
sync guard を進める。Cloudflare deploy、metrics read、systemd restart、bridge smoke test は
passkey / deploy approval 境界のため、この PR では実行しない。

## 設計

`scripts/run-dashboard-app-server-bridge.mjs` に `ensureDashboardBridgeRepoSynced()` を追加し、
`runDashboardAppServerBridge()` が appServer initialize より前に呼ぶ。preflight は
`git fetch origin main`、current branch、HEAD、origin/main、ahead/behind、tracked dirty、
unknown untracked、known artifact を確認する。safe auto-sync は current branch が main、
tracked dirty なし、unknown untracked なし、ahead なし、behind-only の時だけ
`git pull --ff-only origin main` を実行する。

## 仮説

原因仮説は、PR merge / Worker deploy / bridge restart の境界で VPS canonical checkout が
behind のまま残ると、最新の cost boundary や bridge resume logic が入っていない古い
`scripts/run-dashboard-app-server-bridge.mjs` が動き続けること。runner 側 #717 の sync gate
だけでは bridge process 自体の起動前 sync は保証しないため、bridge script 内にも gate が必要。

## 検証計画

- `test/dashboard-app-server-bridge.test.js` で clean in-sync は appServer initialize へ進むことを確認する。
- clean behind-only は `git pull --ff-only origin main` 後に initialize へ進むことを確認する。
- tracked dirty / ahead / unknown untracked は initialize せず reject することを確認する。
- `.tmp/` と `test-results/` は known artifact として block しないことを確認する。
- `node --test test/dashboard-app-server-bridge.test.js` と関連 runner tests を通す。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: repo sync preflight helper、parse args、run entrypoint guard を追加する。
- `test/dashboard-app-server-bridge.test.js`: preflight 単体と `runDashboardAppServerBridge()` の initialize 前 block tests を追加する。
- `docs/development-strategy/issue-741-bridge-safe-sync.md`: この strategy evidence。

## 既に通っている経路

- `runDashboardAppServerBridge()` は appServer initialize 後に Dashboard WebSocket へ接続する。
- `buildDashboardBridgeConnectedEvent()` は bridge lifecycle を owner-facing transient status として送る。
- Issue #717 の VPS runner sync gate は runner queue pickup 前の drift を止める。
- Issue #748 の Worker fix は同一 app-server thread mapping の Durable Object rewrite burst を止める。

## 未確認の境界

- production Cloudflare Worker への deploy は未実施。
- Cloudflare rowsWritten metrics baseline は未取得。
- systemd unit の restart policy / helper route は未変更。
- bridge restart 実行は、この PR では行わない。

## 穴が出そうな箇所

unknown untracked をすべて許すと、VPS 上の emergency patch や直接 main 変更の兆候を見落とす。
逆に `.tmp/` と `test-results/` を block すると、現 VPS の検証 artifact だけで bridge が
止まり続ける。known artifact は runtime truth に残し、未知だけを block する。

## PR 前に確認すること

- Issue #741 の Success Criteria と #748 cost audit。
- `scripts/run-dashboard-app-server-bridge.mjs` の parse / run / reconnect boundary。
- `test/dashboard-app-server-bridge.test.js` の bridge initialize / reconnect tests。
- `git diff --check`、targeted tests、必要なら `npm run verify:worker`。

## 実装候補と捨てた案

- 採用: bridge script 内で appServer initialize 前に safe sync preflight。
- 捨てた案: systemd wrapper の `git pull` のみに依存する。wrapper が握り潰すと古い bridge が動くため。
- 捨てた案: dirty/ahead を自動 reset する。owner の未承認変更を破壊しうるため。
- 捨てた案: GitHub main を毎回直接読む。bridge はローカル Node script と app-server cwd を必要とするため。

## merge 後に通す E2E

- deploy 前に VPS `HEAD == origin/main` を確認する。
- Cloudflare deploy 後、metrics baseline を取得する。
- bridge restart 前に safe sync preflight が clean/in-sync を返すことを確認する。
- bridge restart 後、短い Dashboard Butler turn を1回だけ流し、rowsWritten が burst しないことを確認する。

## 次の PR を増やさない理由

bridge safe sync とその regression test は同じ lifecycle boundary なので同じ PR にまとめる。
deploy / metrics / restart smoke は external authority と runtime evidence の領域なので、この
PR には混ぜない。

## 停止条件

- dirty/ahead/diverged を自動破壊しないと進められない場合。
- deploy / credential / permission / systemd restart が必要になった場合。
- bridge 起動前 sync が appServer initialize 後でないと実装できないことが分かった場合。
