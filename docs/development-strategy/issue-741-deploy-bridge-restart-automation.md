# Issue #741 deploy 後 bridge restart automation 作戦図

## 完了体験

owner が Dashboard Butler で「デプロイしたい」と言うと、Butler は GitHub Actions の workflow 画面ではなく、同一 origin の deploy passkey operator URL を短い Markdown link で返す。owner は passkey 認証だけを行う。

認証後、operator / runtime は `deploy-production` workflow dispatch を行い、operator page に居座らず Dashboard Butler の chat thread へ戻る。deploy run の追跡、完了/失敗通知、bridge follow-up は chat / notification center / runtime truth で扱う。deploy 成功後は VPS checkout sync と Dashboard app-server bridge restart を標準 follow-up として扱い、repo 設定済み bridge と repo 未設定 `unresolved` bridge のどちらを対象にしたか、before/after の SHA、service active state、process argv を owner-facing runtime truth として返す。

## VTDD 全体で進める部分

Issue #741 の deploy 後 checkout sync + bridge restart 標準運用と、Issue #637 の app-server bridge status/restart/logs capability preset を接続する。

この slice は「人間は認証だけ」という owner 指摘を受けたもの。mac Codex が URL を組み、GitHub Actions を開かせ、SSH で restart する現状は `butler_gap_found` / `vps_handoff_gap_found` であり、VTDD completion ではない。

## 設計

順番は固定する。

1. Butler / self-parity が same-origin deploy operator URL を提示する。
2. owner は passkey 認証だけ行う。
3. runtime が deploy workflow を dispatch し、run URL / run status を返す。
4. deploy 成功後、VPS helper capability で checkout sync と bridge restart を実行または提案する。
5. Butler が production SHA / VPS SHA / bridge process truth を返す。

Cloudflare passkey operator page は approvalGrant を作るだけでは足りない。deploy mode では承認成功後に same-origin `/v2/action/deploy` へ approvalGrantId を POST し、Worker が deploy dispatch を検知できる必要がある。VPS maintenance mode でも同じく、承認成功後に `/v2/dashboard/chat/messages` へ approvalGrantId / vpsProposalId を戻し、Dashboard Butler が helper queue へ自動継続できる必要がある。owner に approvalGrantId をコピーさせる flow は fallback であり、通常導線ではない。

2026-06-04 live deploy 後、VPS operator の passkey 承認自体は成功したが、auto-continue POST が `Cloudflare Access authenticated owner identity is required for dashboard surface /dashboard/chat/messages` で止まった。Dashboard chat write 全体を緩めてはいけないが、stored VPS proposal と matching passkey approval grant が検証できる continuation request は、same-origin passkey operator の通常導線として Dashboard chat auth とは別に許可する必要がある。

deploy operator page は認証と dispatch の場であって、追跡UIではない。dispatch 後は `returnUrl` で Dashboard Butler の chat surface に戻す。GitHub Actions deploy success event を Worker が受けたら、同じ chat thread に deploy 完了 truth と VPS checkout sync + repo-less bridge restart の approval_required proposal を出す。operator page に owner を残して GitHub Actions run link を眺めさせる設計にはしない。

2026-06-04 の live operator では `ReferenceError: Can't find variable: returnToButlerLink` が出た。これは deploy operator page が `returnUrl` を持つ Butler 起点だけを暗黙前提にし、mac Codex から passkey operator URL を開く break-glass / bootstrap 経路を壊した回帰である。正しい境界は、Butler から開いた時は承認後に chat へ戻る、mac Codex から開いた時は `returnUrl` が無くても deploy dispatch と結果表示が成立する、である。`returnToButlerLink` は必須 runtime authority ではなく任意の復帰リンクとして扱う。

今回の実装単位は、deploy success event から VPS privileged maintenance proposal を作り、same-origin VPS passkey operator URL を chat に出し、承認後の Dashboard chat auto-continue が既存 helper queue に固定 command envelope を渡すところまでを一塊で接続すること。実運用で動いている unresolved bridge が deploy 後 follow-up から抜けていると、Butler が「人間は認証だけ」という運用を満たせない。

deploy operator URL は既に `selfParity.deployOperatorMarkdownLink` と passkey operator page に存在するため、今回はそれを GitHub Actions URL と混同しない guidance / tests を補強する。URL 自動提示は `vtddRetrieveSelfParity` を優先し、fallback でも same-origin `/v2/approval/passkey/operator?...actionType=deploy_production&highRiskKind=deploy_production` を返す。

## 仮説

現在の blocker は deploy plane そのものではない。`/v2/action/deploy` は approvalGrant から workflow dispatch まで進める。足りないのは、owner-facing 会話で deploy operator URL を自動提示し、deploy 後に VPS bridge lifecycle follow-up をつなぐこと。

さらに #637 preset は repo-less bridge restart まで扱えるようになったが、deploy success event からその proposal を自動生成する runtime path がまだない。今日の手動 restart と同じ場面で Butler から正しい capability proposal と operator URL を出せても、deploy 完了 chat に自動で出なければ owner はまた mac Codex / GitHub Actions / SSH に戻される。

## 検証計画

- Unit: VPS privileged maintenance command registry が repo 設定済み bridge と unresolved bridge の status / restart / logs preset を持つ。
- Unit: natural-language preset が `unresolved` / `repo 未設定` / `main chat` を含む bridge restart 依頼を unresolved service capability に解決する。
- Unit: generic bridge restart は既存 bridge service capability を保つ。
- Unit: deploy operator guidance が GitHub Actions workflow URL ではなく same-origin passkey operator URL を要求する。
- Unit: deploy operator page は passkey 承認後に `/v2/action/deploy` へ自動 dispatch する導線を維持する。
- Unit: deploy operator page は dispatch 後に `returnUrl` で Dashboard Butler chat へ戻る導線を持つ。
- Unit: deploy operator page は `returnUrl` が無い mac Codex 起点でも `returnToButlerLink` ReferenceError を起こさず、dispatch 結果をページ内に表示できる。
- Unit: deploy operator page は `returnUrl` がある Butler 起点だけ、dispatch 後にその復帰先へ遷移する。
- Unit: VPS operator page は `dashboardThreadId` がある時に `/v2/dashboard/chat/messages` へ承認イベントを戻す導線を維持する。
- Unit: GitHub Actions deploy success event は同じ Dashboard chat に bridge sync/restart approval URL を追記する。
- Unit: 同じ deploy event の重複受信は proposal / chat message / Web Push を二重化しない。
- Unit: bridge follow-up approval grant が戻ると既存 helper queue に fixed script command envelope を渡す。
- Unit: Cloudflare Access session を持たない passkey operator からの VPS approval continuation は、stored proposal / matching grant がある場合だけ helper queue に到達する。
- Unit: approvalGrantId / vpsProposalId がない ordinary chat write は引き続き Cloudflare Access / dashboard passkey session なしでは拒否される。
- Unit: fixed helper script は tracked dirty checkout を restart 前に止め、before/after SHA と service truth を JSON で返す。
- Local: `node --test test/sync-dashboard-app-server-bridge-after-deploy.test.js test/vps-privileged-maintenance.test.js test/worker.test.js --test-name-pattern "deploy|VPS privileged maintenance|app-server bridge|sync"`
- Worker source を触る場合は `npm run build:worker` と `npm run verify:worker` を実行する。

## 改修見積もり

- `src/core/vps-privileged-maintenance.js`: deploy follow-up 用 fixed helper command registry entry を追加する。risk は arbitrary command 化することなので argv / allowedArgs は固定する。
- `src/worker/runtime.js`: GitHub Actions deploy success event から unresolved bridge sync/restart approval proposal を作り、承認後の既存 helper queue へつなぐ。risk は deploy approval と VPS maintenance approval を混ぜること。
- `scripts/sync-dashboard-app-server-bridge-after-deploy.mjs`: VPS checkout fast-forward と unresolved bridge restart を固定処理にする。risk は dirty checkout / service 名誤り / stdout に秘密を出すこと。
- `src/core/passkey-operator-page.js`: deploy auto-dispatch 後の任意 return link を DOM 参照として明示し、mac Codex 起点では未指定でも落ちないようにする。risk は Butler 起点の chat 復帰を失うこと、または mac Codex 起点で不要な redirect を起こすこと。
- `test/vps-privileged-maintenance.test.js`: registry coverage を追加する。
- `test/worker.test.js` / `test/passkey-operator-page.test.js`: unresolved bridge natural-language proposal、deploy operator URL guidance、passkey 承認後 auto-dispatch / auto-continue の回帰を追加する。
- `worker.js`: generated worker。Worker source を変更した場合のみ更新する。

## 既に通っている経路

- `/v2/approval/passkey/operator` は deploy mode を表示できる。
- deploy mode の operator page は passkey 承認後に `/v2/action/deploy` を自動 dispatch し、`returnUrl` があれば Dashboard Butler chat へ戻れる。
- `/v2/action/deploy` は real passkey approval grant から `deploy-production.yml` を dispatch できる。
- `evaluateButlerSelfParity()` は `deployOperatorUrl` / `deployOperatorMarkdownLink` / `deployRecovery` を返せる。
- deploy operator page は `returnUrl` を任意の復帰リンクとして描画できる。Butler 起点では chat 復帰に使い、mac Codex 起点ではリンク非表示で動作する必要がある。
- `ensureDashboardBridgeRepoSynced()` は bridge startup 前に clean behind-only checkout を `origin/main` へ fast-forward できる。
- Issue #637 の VPS operator page は `dashboardThreadId` がある時、承認後に Dashboard chat API へ戻って helper queue へ自動継続できる。
- Issue #637 の VPS helper queue は approvalGrant を受けて helper execution envelope を作れる。

## 未確認の境界

deploy workflow の長時間 polling 自体はまだ作らない。今回の runtime entrypoint は GitHub Actions deploy success event webhook / repository_dispatch 相当の受信であり、受信後に bridge follow-up proposal を chat に出す。GitHub Actions の protected environment approval と passkey approval は別 gate であり、どちらも bypass しない。deploy approval grant だけでは VPS maintenance execution を開始しない。

VPS helper が現在の production host で unresolved bridge capability manifest を持っているかは deploy 後 live evidence が必要。repo に registry が入るだけでは root-owned manifest の現物更新完了ではない。

bridge restart の頻度による副作用は未測定。予測されるリスクは、進行中 turn の切断、Codex thread resume 失敗、transient progress 消失、Dashboard 再接続スパム、`codex app-server` 再初期化による追加 latency / usage である。restart automation は before/after truth と進行中 turn 判定を持つまで、無条件の高頻度 restart にしてはいけない。

## 穴が出そうな箇所

- GitHub Actions workflow URL を deploy URL として返すと、owner は認証だけで済まない。
- deploy approval scope に bridge restart までは含めない。今回の slice は deploy 後 follow-up approval URL を作るが、勝手に destructive / maintenance execution を始めない。
- deploy operator page の `returnUrl` を必須扱いにすると、mac Codex から passkey approval を開く bootstrap / break-glass 経路が ReferenceError で止まる。
- unresolved bridge を残骸扱いで stop/disable すると repo-less main chat を壊す。
- broad `bridge restart` intent で全 bridge を同時 restart すると進行中 turn を落とす可能性がある。
- health check なしの周期 restart は、長時間開発 turn と衝突して owner-facing UX を悪化させる可能性がある。

## PR 前に確認すること

- Issue #741 / #637 の Success Criteria と Non-goal。
- `src/core/vps-privileged-maintenance.js` の registry が public/core branch に owner 固有 service 名以外の秘密値を入れないこと。
- `src/worker/runtime.js` の natural-language preset が通常会話を helper proposal に誤分類しないこと。
- generated worker が source と一致すること。
- PR body の Execution Queue Delta で、owner 指摘により #741/#637 deploy follow-up slice が `ROOT` 寄りの `NEXT` として入ったこと、active Issues を downscope していないことを明記する。

## 実装候補と捨てた案

採用: deploy success event から unresolved bridge checkout sync + restart fixed command の approval proposal を自動生成し、同じ chat thread に operator URL を提示する。

採用: fixed helper script で `git fetch` / `git pull --ff-only` / `systemctl --user restart vtdd-dashboard-app-server-bridge-unresolved.service` を実行し、before/after truth を JSON にまとめる。

採用: deploy operator URL は self-parity same-origin link を正とし、GitHub Actions workflow URL は run 追跡用としてのみ扱う。

採用: passkey operator page が承認イベントを same-origin action / Dashboard chat API へ戻す auto-dispatch / auto-continue を通常導線とする。

捨てた案: mac Codex が SSH で restart する運用を標準とする。Butler completion ではないため不採用。

捨てた案: deploy workflow 内で無条件に VPS SSH restart する。deploy approval と VPS maintenance approval の scope 混在が未整理のため不採用。

捨てた案: 短間隔の periodic restart。進行中 turn とコスト観測に悪影響を出す可能性があるため、health-based または deploy-follow-up に限定して検証する。

捨てた案: repo-less `unresolved` bridge を止める。Issue #741 の Non-goal に反する。

## merge 後に通す E2E

1. Dashboard Butler で「デプロイしたい」と送る。期待値は same-origin deploy operator URL が返り、GitHub Actions workflow URL だけでは止まらない。
2. owner が passkey 認証する。runtime が deploy workflow を dispatch し run URL を返す。
3. deploy success 後、Dashboard Butler で「repo 未設定 main chat の app-server bridge を再起動して」と送る。期待値は unresolved bridge restart proposal / approval URL が出る。
4. owner が passkey 認証する。VPS helper queue が unresolved bridge restart を実行し、before/after active state と repo SHA を返す。

## 次の PR を増やさない理由

deploy operator URL 自動提示と bridge restart は owner から見て同じ deploy follow-up workflow であり、今日の手動作業で一続きに露呈した gap である。少なくとも unresolved bridge capability を同じ slice で入れないと、deploy 後 restart automation が実運用対象を外す。

ただし deploy approval と VPS maintenance approval は分ける。自動化するのは proposal / operator URL / helper queue handoff までで、owner の scoped passkey approval なしに restart は始めない。

## 停止条件

- deploy approval grant だけで VPS maintenance execution まで自動開始しないと成立しない場合。
- GitHub environment approval、credential、permission、repository settings mutation を変える必要が出た場合。
- unresolved bridge restart が通常 chat を壊すことが分かった場合。
- owner 固有の runtime URL / host secret / credential を public repo に固定しそうになった場合。
