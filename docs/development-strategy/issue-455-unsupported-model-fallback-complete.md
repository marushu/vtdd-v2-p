# Issue #455 unsupported model fallback completion 作戦図

## 完了体験

Dashboard Butler が短い通常会話で `gpt-5.3-codex` unsupported 400 を受けても、owner には同じ失敗を返し続けない。VPS app-server bridge は error が thrown exception でも app-server `error` notification でも unsupported model として扱い、usageProfile が無い turn でも model override なしの新しい app-server client に一度だけ退避する。

## VTDD 全体で進める部分

Issue #455 の app-server usage/model tuning safety を完成させる。PR #787 は unsupported model fallback の第一実装だったが、`request.usageProfile` が無い経路と notification failure 経路で fallback が抜けていた。今回は owner-facing recovery として穴を塞ぐ。

## 設計

`createDashboardAppServerClientSelector().withoutModel()` は、`request.usageProfile` が無い場合でも default appServer を返さず、model-less config の client を factory から作る。static appServer が明示された test/embedding 経路だけは既存 appServer を返す。

`handleDashboardTurnRequest` は `app_server_turn_failed` event が unsupported model で、turn costBoundary に modelConfigured がある場合、failure message を送信せずに retry 用 error を reject する。outer `connectDashboardAppServerBridgeOnce` が既存 fallback path で model-less retry を行う。fallback は `modelConfigured=false` なので、fallback 自体が失敗した時は二度目の retry をせず既存 generic failure を送る。

unsupported model 判定は raw stringify 全体ではなく、JSON error payload の `message` / `error.message` / `cause` を優先して抽出する。判定範囲は ChatGPT account での Codex model unsupported に限定し、network / quota / auth failure を retry しない。

## 仮説

production で同じ unsupported model error が続く原因は、PR #787 の fallback が usageProfile 無し/default appServer 経路で同じ model-configured client を再利用しているか、unsupported model が notification event として先に failure sent になり fallback まで届いていないこと。

## 検証計画

- Unit: selector.withoutModel は usageProfile 無しでも model-less client を作る。
- Integration: thrown unsupported model error を model-less fallback で復旧する。
- Integration: app-server error notification の unsupported model を failure として送らず、model-less fallback で復旧する。
- Integration: model-less fallback も失敗した場合、二度目の fallback に入らず generic failure 1件で終わる。
- Local: `node --test test/dashboard-app-server-bridge.test.js`
- Local: `git diff --check`
- Local: `npm test`

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: selector fallback の static/default 分岐、notification failure の retry handoff、構造化 error message 抽出。risk は通常 failure を隠すこと。
- `test/dashboard-app-server-bridge.test.js`: usageProfile 無し fallback と notification fallback tests。risk は mock が実 app-server event とズレること。
- `docs/development-strategy/issue-455-unsupported-model-fallback-complete.md`: この作戦図。risk なし。

## 既に通っている経路

PR #787 で unsupported classifier、model stripping、thrown error fallback の基本形は入っている。production deploy と bridge sync/restart は `b761910c` で完了済みだが、owner-facing error は変わっていない。

## 未確認の境界

production app-server が unsupported model を throw と notification のどちらで出すかは状況依存。両方を扱う。supported model 名は未確認であり、repo では断定しない。

## 穴が出そうな箇所

- fallback が default appServer を返して同じ model override を使い続ける。
- notification failure が `APP_SERVER_FAILURE_ALREADY_SENT` になり outer fallback を止める。
- unsupported model 以外の failure まで retry して root cause を隠す。
- fallback が無限ループする。

## PR 前に確認すること

latest origin/main branch、open PR 0、targeted tests、npm test、git diff --check、未追跡 E2E assets を stage しないこと。

## 実装候補と捨てた案

採用: selector fallback と notification fallback handoff を同じ PR で直す。

捨てた案: VPS env だけ消す。repo 側に同じ穴が残るため不採用。

捨てた案: supported model を repo 固定する。account 差異で再発するため不採用。

## merge 後に通す E2E

production deploy と bridge restart 後、Dashboard Butler で「君は誰？」または「もしもし」を送り、unsupported model 400 が返らず reply が返ること。bridge status に unsupported_model_fallback が出てもよいが、generic failure のみで止まってはいけない。

## 次の PR を増やさない理由

PR #787 の抜けは selector と notification path の組み合わせであり、どちらかだけでは production failure が残る。owner-facing recovery を完成させるには同じ PR で塞ぐ必要がある。

## 停止条件

credential / permission / deploy / root helper mutation が必要になる場合。unsupported model 以外の auth/quota/network policy へ広がる場合。
