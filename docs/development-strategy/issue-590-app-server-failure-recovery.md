# Issue #590 app-server failure recovery / media-aware error strategy

## 完了体験

Dashboard Butler で VPS Codex CLI / codex app-server が turn 中に失敗しても、owner は「返事が来ない」状態に見えない。同じ Dashboard thread に、入力は保存済みで同じ thread から再試行・補足できること、画像/添付が関係する場合は画像なし再送または短い説明が有効であること、画像が関係しない場合は画像解析失敗と決めつけないことが日本語で残る。

## VTDD 全体で進める部分

この slice は Issue #590 の failure recovery column を進める。Issue #498 には添付失敗時の owner-facing 説明として関係するが、画像解析パイプライン全体の完成は扱わない。Dashboard Butler / Worker / bridge の「失敗を見える状態にする」経路を先に固め、VPS Codex CLI が返答できない時でも owner が Mac Codex に戻らず次の行動を取れる状態を作る。

## 設計

- codex app-server の raw failure を bridge で `app_server_turn_failed` に正規化する。
- 失敗文言は固定の「画像を解析できなかった可能性」ではなく、media reference の有無と取得状態に応じて生成する。
- media がない turn では一般 failure とし、画像原因を断定しない。
- media がある turn では、添付の取得/解析に失敗した可能性を補足し、画像なし再送または短い説明を案内する。
- Worker は同一 messageId / text / status の app-server failure を短時間に二重 append しない。
- thread に残る system failure は recovery action を含むが、raw stack trace、secret、full image binary、raw JSON は残さない。

## 仮説

スクリーンショットの system message は `scripts/run-dashboard-app-server-bridge.mjs` の `DEFAULT_APP_SERVER_ERROR_TEXT` に一致する。これは `turn/completed` failed や app-server error が原因でも同じ文言になるため、実原因が画像でない場合も owner に画像失敗として見える。また DashboardChatRoom 側は app-server failure を system message として append するため、同じ failure event が複数回来るか、client reconnect / duplicate send と重なると同じ文言が二重表示される。

狭く文言だけ変えると、再試行導線や重複抑止が残り、同じ「返事がこない」体験が再発する。したがって bridge failure text と Worker append filter を同じ slice で扱う。

## 検証計画

- `node --test test/dashboard-app-server-bridge.test.js`
- `node --test test/worker.test.js`
- `npm run build:worker`
- `npm run check:generated-worker`
- `git diff --check`

テストでは、media なし app-server failed は画像文言を出さないこと、media あり failed は画像/添付再送導線を含むこと、同一 failure の二重 append が抑止されることを確認する。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`
  - boundary: app-server failure text generation and failed turn mapping
  - expected change: request media truth を context に持ち、failed / error notification で media-aware recovery text を返す
  - risk: app-server protocol event shape の未知フィールドに依存しすぎると壊れるため、既存の `turn/completed failed` / `error` と fallback のみに限定する
- `src/worker/runtime.js`
  - boundary: `acceptAppServerBridgeMessage` append filter / normalized failure message
  - expected change:同一 thread の直近同一 failure を再 append しない
  - risk: 別 turn の別 failure を消すと evidence が失われるため、短時間・同一 text/status/thread に限定する
- `test/dashboard-app-server-bridge.test.js`
  - boundary: bridge failure mapping
  - expected change: media なし/あり failure text tests
  - risk:既存 long-turn tests と競合しないよう targeted assertions にする
- `test/worker.test.js`
  - boundary: DashboardChatRoom bridge message append filter
  - expected change: duplicate app-server failure is ignored while first failure remains thread-visible
  - risk: existing message append tests must keep non-duplicate failures appendable

## 既に通っている経路

- Dashboard app-server bridge は `app_server_turn_failed` を Worker へ送れる。
- Worker は failure を Dashboard thread の system message として保存できる。
- composer unlock / same-thread recovery は #590 の既存 timeout recovery evidence がある。
- media reference metadata / short-lived download path は #498 の一部として存在する。

## 未確認の境界

- production VPS journal の生ログは、この Mac の SSH alias では直接確認できない。
- codex app-server が画像 localPath をどの程度 native に解析できるかは、この slice では保証しない。
- Cloudflare Access 認証付き production thread の raw runtime state はこの local probe だけでは読めない。

## 穴が出そうな箇所

- `turn/completed failed` に詳細 reason がない場合、原因推定はできない。
- attachment fetch が `metadata_only` のままでも app-server は文章だけで返せるべきだが、prompt が画像解析前提だと失敗に見える。
- 重複抑止を強くしすぎると、連続する別 failure の evidence を消す。
- 失敗 messageId が毎回 random だと UI 側の key だけでは重複を防げない。

## VTDD 全体の error surface 棚卸し

2026-06-04 の owner 指摘「このエラーに限らず、起こりうるエラーに関して訳のわからないことになっていないか」を受け、`rg` で runtime / bridge / runner / deploy / docs / tests の failure surface を横断確認した。

現時点の分類:

- Dashboard chat / app-server bridge
  - owner-facing failure は `app_server_turn_failed` として thread に残せる。
  - 問題: 画像以外の失敗でも画像解析失敗に見える固定文言があった。
  - 今回の対応: media-aware failure text と duplicate failed-message suppression。
- Media / attachment
  - R2/D1 metadata、download、TTL、repo/issue scope の失敗経路がある。
  - 問題: media reference mismatch や fetch failure が owner には「VPS が返事しない」に見えやすい。
  - 今回の対応: app-server failure に添付取得状態を短く含める。media pipeline completion は #498 に残す。
- VPS runner / privileged helper
  - queue payload invalid、allowlist miss、helper failed、runner auth unavailable、runtime event post failed などがある。
  - 現状: Issue comment / runtime event には structured reason がある。
  - 残課題: Dashboard Butler の通常 chat に戻す時、raw reason と owner-facing next action の対応表が必要。
- Deploy / GitHub Actions
  - passkey grant missing、approval validation failed、workflow failure、deploy completion event failure がある。
  - 現状: workflow run と deploy event comment で追える。
  - 残課題: Dashboard 側の owner-facing failure summary が deploy run URL / next approval / retry boundary を常に出す保証は別 slice。
- Memory / approval / auth
  - unauthorized、memory provider unavailable、approval grant expired/not found、cost checker not allowed などがある。
  - 現状: API JSON と一部日本語 reason はある。
  - 残課題: 通常 chat で raw API error だけを出さず、認証だけ人間がやる導線へ戻す taxonomy が必要。

この棚卸しから、今回の直接事故は Dashboard chat / app-server bridge と Media / attachment の境界にあると判断する。VPS runner / deploy / approval / auth まで同じ PR で改修すると authority boundary と E2E が膨らむため、この PR では分類と現在事故の修正に止める。

## PR 前に確認すること

- open PR がないこと。
- branch が latest `origin/main` から切られていること。
- generated `worker.js` が source と一致していること。
- PR body に #590 と #498 の境界、E2E 未完了、deploy 未実施を明記すること。

## 実装候補と捨てた案

- 採用: bridge で media-aware failure text を生成し、Worker で短時間同一 failure を抑止する。
- 捨てた案: app-server を即 restart する。失敗原因が画像/turn protocol の可能性があり、再起動だけでは owner-facing recovery が改善しない。
- 捨てた案: raw app-server error をそのまま表示する。owner-facing ではなく secret / implementation detail の露出リスクがある。
- 捨てた案: 全 failure を「画像なしで再送」にする。media がない turn の失敗を誤誘導する。

## merge 後に通す E2E

- production Dashboard Butler で media なし read/status turn が失敗した場合に、画像文言なしの recovery message が残る。
- production Dashboard Butler で画像添付あり turn が失敗した場合に、画像/添付を含む recovery message が残り、同じ文言が二重に出ない。
- 同じ thread で owner が画像なし補足を送れる。

## 次の PR を増やさない理由

bridge failure text と Worker duplicate suppression は同じ owner-facing事故に対する入口と保存側であり、片方だけではスクリーンショットの再発を止められない。画像解析そのもの、live progress、scroll 挙動は別 Issue/slice に残す。

## 停止条件

- app-server failure の root cause が credential / permission / deploy / destructive operation に広がる場合は、この PR では進めない。
- raw production logs が必要で、VPS privileged maintenance や Cloudflare credential boundary が必要になる場合は、passkey/operator flow に切り替える。
- #590 / #498 の Issue text と矛盾する挙動が見つかった場合は、実装を止めて owner decision を求める。
