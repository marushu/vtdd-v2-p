# Issue #856 共通 Butler シェル（ローカル検証）

状態: ローカル実装済み / browser・本番・実機未検証（incomplete）。対象基準は supplied main 6c3f3dc。

## normal-tier 作戦図（実装前）

- 範囲: 現存する全GET人間向けHTMLのテーマ・ブランド・メニュー・固定3項目ナビ。
- 設計/仮説: HOMEの承認済み色をsemantic tokenの唯一の定義にし、各レンダラーが共通document shellを利用する。既存CSSは色をtoken参照に置換し、末尾の上書きテーマを作らない。チャットは既存DOM/通信/ドラフトを保持し、viewport内にheader/navの高さを予約する。
- 非対象: API、認証・承認・Push・データ・backend protocolの変更、wizard再開、外部操作、merge/deploy。
- 変更予定: src/core/butler-ui-shell.js、独立client asset/build、既存HTMLレンダラー、3本のfocused test、localhost用Playwright harness、生成worker。
- 検証: 実Worker + 注入fixtureでHTML/API/認証を確認。keepNames付き二次bundleでclient scriptを検証。focused tests→生成→全npm test一回。browserはoperator実行用harnessを提供。
- 停止条件: 権限/データ/protocol変更が必要、外部依存の取得が必要、禁止された実行が必要になった場合はその枝のみ停止する。
- Execution Queue Delta: #856の明示されたローカル実装を継続。queue変更/preemptionなし。他Issueのdownscopeなし。

## route → renderer inventory

| GET route | Renderer | 検証予定 |
|---|---|---|
| /dashboard（contextなし） | renderDashboardMonitorHome | shell/refresh/details |
| /dashboard/chat, /orchestrator, /dashboard?threadId, thread_id, repository, repositoryInput, issueNumber | renderV2DashboardPage | chat current/DOM/layout/draft |
| /dashboard/notifications | renderDashboardNotificationsPage → renderDashboardUtilityPage | shell/Push controls/event links |
| /dashboard/github, preflight, progress, vps-runner, memory, self-parity | 対応するrenderDashboard*Page → utility | 全route/auth |
| /dashboard/handoff, /dashboard/news | renderDashboardHandoffPage / renderDashboardNewsPage → utility | 全route |
| dashboard各routeの認証拒否 | renderDashboardAuthRequiredPage | status/return queryを保持 |
| /status | renderV2StatusPage | shell |
| /help, /guide | renderVtddHelpGuidePage | shell |
| /setup, /setup/recovery, /setup/latest, /setup/known-good | renderCustomGptRecoveryPage | success/unavailable shell |
| /setup/diagnostics | renderCustomGptSetupDiagnosticsPage | success/unavailable shell |
| /v2/approval/passkey/operator, /mvp/approval/passkey/operator（dashboard/merge/deployを含む） | renderPasskeyOperatorPage | mode/hidden scope controls保持 |

runtime.jsのhtml response呼出しと直接text/html response、coreのdoctypeを確認。setup raw artifacts、manifest、SW、icon、API JSON、mediaは対象外。

## 証拠

実行結果を後記。browser harnessのデータはDEMO/SYNTHETICのみ。本番・物理iPhoneでの成功は主張しない。

## 実装と最終ローカル検証

- 共通定義: `src/core/butler-ui-shell.js`。承認済みHOMEのlight/dark色、状態色、system font、focus、reduced motion、入力/ボタン、header/menu/primary navigation。
- client: `src/core/butler-ui-client.js` → `scripts/build-butler-ui-client.mjs` → `src/core/butler-ui-client.generated.js`。実行時のFunction.toStringによるコード生成は追加していない。既存monitor生成pipelineは維持。
- 各rendererが共通document shellを組み込み、既存CSSのパレットをsemantic tokenへ移行。utility旧drawer/desktop navigationは削除。chatの設定drawer・操作IDは保持し、共通menuと区別。chatのmain/app-shellが共通header/nav/safe-area分を予約し、visualViewport変更ではCSS変数のみ更新する。
- `worker.js` は `npm run build:worker` で再生成済み。
- `test/butler-ui-shell.test.js`: safe same-origin固定リンク、注入防止、light/dark token、namespaced CSS、Escape/外側click/focus-out/viewportのDOMイベント検証。
- `test/butler-ui-routes.test.js`: actual Workerで33 HTML route/query/modeケース、17 dashboard/orchestrator認証拒否ケース、primary nav一個・menu link各一回、非HTML API/asset、Push操作ID、通知詳細リンク/配信診断、passkey section保持。
- `test/butler-ui-bundle.test.js`: 生成workerをkeepNames:trueで二次bundleし、33ページの全inline script構文、共通client実行、monitor clientの__name不在を検証。
- focused initial: 21/21成功。
- 全体 `npm test` は指定queue/log環境変数で **一回** 実行。1318件中1308成功、9失敗、1skip。9失敗は既存passkeyテストのgreedyなscript抽出が共通scriptまで取り込んだため。script抽出を最初のscriptまでに修正し、認証/Push/scope等のassertionは削っていない。Workerの旧色/旧drawer期待値のみ新UIに更新。
- 修正後最終focused: **352/352成功**（3本の新テスト + passkey/operator + monitor home/routes + worker）。全体suiteの二回目は実行していない。
- `check:self-parity`: 35 routes / 35 operationIds成功。`check:generated-worker`: 成功。harnessの `node --check`: 成功。`git diff --check`: 成功。
- source差分による既存inline script比較: runtime 4ブロック、passkey 1ブロック、setup 1ブロック、すべて変更なし。HOMEのmount処理も変更なし。
- ローカルlog: `.local/issue-856/{build,full-test,final-focused,parity,generated}.log`。`.local`は検証出力であり共有ソースに含めない。

## Operator用ブラウザ検証（未実行）

```sh
# インストール済みPlaywrightブラウザを使う場合
node scripts/e2e-issue856-shared-shell.mjs
# 実行ファイルを明示する場合（operator自身が設定）
ISSUE856_BROWSER_EXECUTABLE=/path/to/browser node scripts/e2e-issue856-shared-shell.mjs
```

`worker.js`をkeepNames:trueで二次bundleする。127.0.0.1の一時portだけlistenし、Worker外部fetch・browser外部通信を拒否。注入したGitHub HTTP mockは503を返す。書き込み要求とWebSocket upgradeはfixtureで拒否し、実Push/承認/merge/deployは行わない。各ページの既存read/表示処理のみ検証する。終了/例外時にbrowserとserverを閉じる。

- 390×844 / 402×874 / 844×390 / 1280×900 × light/dark × 33 routeケース。
- menu全リンク一回、primary navとactive、44px、click遷移、Enter/Tab/Escape/focus/outside（outsideはDOM test）を検証。
- HOME実overview取得・online再取得・details開状態、通知設定・実renderer詳細リンク/診断、passkey各modeのhidden sectionを確認。
- chat下書き、viewport縮小後の維持、composer/sendとnavの非交差、末尾の展開detailsまでのscrollを確認。疑似viewport縮小は物理keyboard実証とは区別する。
- 全ページのcomputed背景/accent/card一致、可視input/bannerのコントラスト4.5以上をassert。
- 選択ページのスクリーンショットとJSONを `.local/issue-856/browser/` に保存。画像に **DEMO / SYNTHETIC** を表示し、JSONにも同じ識別を記録する。

## 残る証拠・境界

状態: **ローカル実装済み / browser・本番・物理iPhone E2E未検証 / incomplete**。

この作業ではbrowser/serverを起動していないため、スクリーンショットとbrowser JSONの成功証跡はまだない。operatorによるharness実行・画像目視・実機keyboard/safe-area確認が必要。GitHub backend unavailable表示はfixtureで検証するが、外部連携の成功や本番データ表示を主張しない。既存のrepo default等の運用前提には変更を加えておらず、public/shared運用全体の完成を主張しない。

ネットワーク、資格情報取得、他worktree、monitor/browser/service、本番状態、GitHub push/merge/deployは操作していない。merge/rolloutとreal passkeyはoperatorの担当。Butler runtimeからの実行/観測はこのローカル検証だけでは証明されない（mac_codex_only_probe）。

## shared-shell-review-001 作戦図（追加修正前）

対象はoperatorの合成データによる独立レビュー。早期bundleの24実ルートでnav/menu、light/dark、overflow/pageerror、390×844・844×390・1280×900・390×490のcomposer非交差が確認されたとの報告を受領。物理iOS keyboard/本番成功ではない。

`.local/issue-856/browser/evidence.json` の17:51実行は0 checks、harness45行のTab移動で失敗。inside-menu relatedTargetを無視したfocusout microtaskが原因としてoperatorからChrome traceの報告あり。

normal範囲: (1)focus遷移の修正と回帰、(2)accent上のbutton文字色とcomputed contrast検証、(3)完全なevent store fixtureと長いIDを持つowner/deploy通知、(4)日本語見出し/通知説明・共通余白/カード/heading、(5)非スコープmerge/deploy shortcut削除とmenu current、(6)viewport/theme metadata正規化、safe-area/visualViewport offsetと高さ検証、(7)既存passkey iframeからの明示共通リンクのtop-level遷移。

非対象: 認証/承認/dispatch/store契約/通信/state変更。検証順: source/DOM/二次bundle focused→生成→全suite一回。browserは禁止のためharnessに実際のTab/pointer/iframe/contrast/viewportシナリオを残しoperatorが実行する。従来の成功報告を保ちつつ、修正後browser証跡は未検証として別記する。

### shared-shell-review-001 実装結果

- `butler-ui-client.js`: SUMMARY→Aのfocusoutはinside-menu relatedTargetなら保持。outsideは閉じ、nullだけtask完了後のfocusを確認する。リンクclick時にdetailsを閉じる処理は削除し、native pointer/touch navigationを保つ。Escapeのsummaryへのfocus復帰は維持。
- header実測高とvisualViewportのheight/offsetTopをCSS変数に反映。menu高さはsummary下端からnav上端までに制限。safe-areaはenv()由来の共有変数。chatの残り高さが230px未満の狭い条件だけ、chat内headerをgrid rowへ移し、最後のメッセージとcomposerの領域を確保する。通常の既存レビュー寸法は従来配置を保持する。入力/送信/WSのstate更新は追加していない。
- `.secondary`を含むpasskey accent buttonは`--butler-on-accent`を明示。shared controlの既定色はzero-specificityで、accent上の色を上書きしない。help/setup `.button` とpasskey `.button-link`はcard上のink/accentを使用し、white固定はない。状態色は維持。
- `butler-ui-shell.js`: spacing/radius/heading token追加。通常utility/notificationのgutter/card padding/radiusは20px。headerとcontentの幅を揃え、passkey/human pageのh1をHOME同様23–32pxの範囲にする。
- viewport metaはviewport-fit=cover付きで一個。theme-colorはshared background値からlight/dark media別の二個へ正規化。manifest/start_url/scope/icon定義は変更なし。
- 全utility/help/setupのmenuにserver-rendered aria-current追加。scope/return/queryを任意のmenu URLへ複製しない。passkeyは「パスキー・操作確認」「Dashboardログイン」の二入口に限定し、スコープなしmerge/deploy shortcutは除いた。直接mode/scoped URLの表示とscope強制は維持。
- 通知subtitleは日本語説明へ。状態ラベルも日本語にし、raw workflow/run/status/配信診断は「通知の記録」detailsで確認可能。passkeyはmode別title/h1と日本語説明に変更し、接続先情報をdetailsへ収めた。
- 共通header/menu/primaryリンクのみ`target="_top"`。chat既存click handlerは共通ナビをiframe化しない。scoped bodyリンクのpasskey modal、閉じる処理、approval dispatch/returnは維持。

### 回帰検証とfixture

`issue856-route-fixtures.mjs` のevent storeはput/delete/get/latest/listRecentを実装し、フィルター/複製/更新を備える。owner_action_requiredとgithub_actions_workflow_run(deploy)の2件、長いid/runId、同一originの詳細URL、合成配信診断を使用する。actual Workerで2カードの存在、非empty、詳細URL/診断をassert。deleteが欠けたstoreを既存resolverが拒否するnegative testも追加し、backend契約を変えていないことを確認。

- 最終関連検証: **356/356成功**。
- このreview requestでの全体`npm test`一回: **1322件 / 1321成功 / 0失敗 / 1skip**。self-parityの35 routes/35 operationIdsとgenerated-worker checkも成功。ログ: `.local/issue-856/review-full-test.log`。
- 全体実行後、passkeyの説明文と対応するcopy期待値だけを追加整備し、上記356件を最終版で再実行済み。全suite二回目は実行していない。
- build生成、generated-worker再一致、harness/helper syntax、diff whitespace検証は成功。ログ: `review-build.log`, `review-final-focused.log`, `review-generated.log`。
- deterministic DOM回帰は、activeElementがBODYの遷移途中でもrelatedTarget=Aを保持するケース、外側/null/escape/pointer、visualViewport offset75+height290とsafe-area由来84px header/99px navの余白、compact条件解除を含む。
- metadata/iframe用shared anchor target/menu current/秘密scope非複製をunit + actual Workerで検証。既存passkey browser scriptは変更なし。chat browser scriptの変更は共通navigationをmodalへ取り込まないguardのみ。

### 更新したoperator harnessの確認範囲（未実行）

元の「menuを開く→Tab→最初のanchorがactive」のassertionは削除・skipしていない。加えてtouch/pointerの実menuリンク遷移を確認する。

`issue856-browser-checks.mjs` はブラウザでgetComputedStyleの実色を取得し、canvasでsRGBへ変換、祖先のbackground/opacityを合成して4.5:1以上をassertする。button/.secondary/.button/.button-link、body、label、small/muted、status pill、input/bannerを含む。deployのapprove-buttonはlight/darkの実foreground/background RGBも検証する。notificationの2カードとsettings/diagnosticsを展開して検証し、empty fixtureを成功扱いしない。

harnessは既存4画面サイズ×light/darkに加え、visualViewportの**offsetTopとheight**を独立に動かしsafe-area20/34pxを合成してmenu bounds、composer/send、末尾detailsのscroll、下書きをassertする。これはphysical iOS keyboardの証明ではない。

既存`#butler-passkey-frame`をchatのscopedリンクから開き、cancelで下書き保持→再度開いてiframe内共通「通知」リンクをclick→top-level通知へ遷移→chatへ戻って下書き復元を確認する。共通「パスキー・操作確認」はchatのmodalへ横取りされないことも確認。承認ボタンは押さず、fixtureの外部書き込みは禁止のまま。

computed contrastと各route結果はJSON、選択画面・notification settings・deploy buttonはDEMO/SYNTHETIC入りスクリーンショットを保存する。**このreview内でbrowser/serverは起動していない**。17:51の旧failure evidenceはそのまま残してあり、修正後の実Tab/contrast/iframe/browser合格はoperator再実行待ち。独立レビューの早期bundle成功と混同しない。

## 操作担当の最終検証（2026-09-24、レビュー修正後）

最終状態: **ローカル配布相当bundleの全ブラウザ検証成功。本番・物理iPhoneは未反映/未確認**。上記の「browser未実施」は実装担当のcheckpoint時点の記録であり、以下の実行証跡で更新する。

- `scripts/e2e-issue856-shared-shell.mjs`: **33 route × 4 viewport × light/dark = 264ケース成功**、JavaScriptエラー0。実際のgenerated workerをkeepNames:trueで二次bundleしたものを、外部通信を遮断した一時localhostサーバーで検証。
- メニューEnter/Tab/Escape、内部フォーカス移動、現在地、実際のprimary navigation、iframeからtop-levelへの移動、全リンクの一致、認証案内の導線を確認。
- 2件の合成通知を実rendererへ入力し、詳細リンク・長いID・診断・通知設定のアクセスと表示を確認。空データ画面を通知カードの検証とは扱っていない。
- 実際に描画された文字/背景をcanvasでsRGBへ解決し、有効な操作ボタン・リンク・説明のコントラストを検証。darkのパスキーボタンは明るい赤背景に暗い文字。
- チャットの下書き、入力/送信と固定ナビの非交差、visualViewport height/offsetTopとsafe-areaを組み合わせた疑似キーボード、展開末尾までのスクロールを確認。これは物理iOSキーボードの保証ではない。
- 最後の操作担当補正: メニューの前回max-heightが残っても小さいviewportのCSS上限を超えないよう制限。resize後のテスト座標は描画を待って一括取得し、フレーム間の比較競合を排除。コントラスト対象から実際にdisabledの操作だけを除外。
- 最終補正後、全体 **1322件中1321成功・失敗0・1skip**。self-parity（35 routes / 35 operationIds）、generated worker整合も成功。実装担当のverified snapshot後の補正は、この独立した最終テスト結果で検証する。

選択画像とJSONは `.local/issue-856/browser/` に保存。公開する画像はDEMO/SYNTHETIC表示を持つ合成データのみ。実監視、reporter、資格情報、本番への変更はこの検証では行っていない。
