# Issue #455 app-server unsupported model fallback 作戦図

## 完了体験

Dashboard Butler は VPS app-server bridge が `gpt-5.3-codex` など ChatGPT account 非対応 model を指定して 400 を受けても、owner に「内容を短くして再送」とだけ返して止まらない。bridge は unsupported model を runtime failure として分類し、同じ owner turn を model override なしの `codex app-server` client に一度だけ fallback して届ける。

owner は iPhone/iPad の Dashboard Butler 通常チャットから同じ入力を送り直す必要がなく、repo 固定 model 名や VPS env の誤設定が通常会話を完全停止させない。

## VTDD 全体で進める部分

Issue #455 の content-aware cost / model tuning の安全境界を進める。既存作戦図は「model 名を repo 固定すると operator account 差異で壊れる」と明記しているが、runtime では unsupported model failure が owner-facing dead end になっていた。今回は model override の足場を残しつつ、ChatGPT account 非対応 model の場合だけ default Codex config へ退避する。

## 設計

`scripts/run-dashboard-app-server-bridge.mjs` に unsupported model classifier を追加する。`connectDashboardAppServerBridgeOnce` が `handleDashboardTurnRequest` で例外を受け、選択された client/costBoundary に model が設定されており、error が ChatGPT account unsupported model なら、selector の `withoutModel()` で model override なしの app-server client を取得し、同じ payload を一度だけ再実行する。

fallback 時は `app_server_status` を transient に出し、`costBoundary` には `unsupportedModelFallback` と rejected model を入れる。fallback も失敗した場合は既存 failure path に落とす。`APP_SERVER_FAILURE_ALREADY_SENT` の場合は二重送信しない。

## 仮説

production の失敗原因は、VPS bridge または request profile が `-c model="gpt-5.3-codex"` を渡し、Codex app-server が ChatGPT account では非対応として 400 を返していること。reasoning effort だけなら account model 非対応 error は起きないはずなので、model override を外して default app-server に退避すれば通常会話は復旧する。

## 検証計画

- Unit: unsupported ChatGPT account model error classifier が JSON 文字列 / Error message を検出する。
- Unit: selector の model-less fallback が defaultModel を無視し、reasoning effort は維持する。
- Integration: `connectDashboardAppServerBridgeOnce` が unsupported model failure 後に model-less client で同じ turn を一度だけ retry する。
- Local: `node --test test/dashboard-app-server-bridge.test.js`
- Local: `git diff --check`

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: unsupported model classifier、selector `withoutModel`、connect retry flow。risk は retry の二重実行と defaultModel の再混入。
- `test/dashboard-app-server-bridge.test.js`: classifier / selector / retry integration tests。risk は mock app-server の error shape 不足。
- `docs/development-strategy/issue-455-app-server-unsupported-model-fallback.md`: この作戦図。risk なし。

## 既に通っている経路

DashboardChatRoom は全 owner turn を app-server bridge に送る。Issue #455 の classifier は model を既定では固定せず、reasoning effort を content-aware にする。bridge selector は profile ごとに app-server client を lazy cache できる。

## 未確認の境界

OpenAI / Codex の account 別 supported model 一覧は runtime error を truth とする。repo は「どの model が使えるか」を断定しない。production env に実際にどの値が入っているかは VPS runtime truth で別途確認する。

## 穴が出そうな箇所

- fallback request が defaultModel を再適用して同じ unsupported model を呼ぶこと。
- unsupported model 以外の auth/quota/network failure まで fallback して原因を隠すこと。
- fallback 失敗時に failure message が二重に出ること。
- selector cache key が model 有無を区別できず unsupported client を再利用すること。

## PR 前に確認すること

latest `origin/main` から branch を切る。open PR 0 を確認する。targeted tests と `git diff --check` を通す。未追跡 E2E assets を stage しない。

## 実装候補と捨てた案

採用: unsupported model の時だけ model override なし client に one-shot fallback する。

捨てた案: repo で `gpt-5.3-codex-spark` など別 model 名へ固定する。account / plan 差異で同じ問題が再発するため不採用。

捨てた案: production env だけを消す。即時回避にはなるが、次の誤設定でまた Butler が止まるため repo 側 guard が必要。

## merge 後に通す E2E

production deploy と bridge restart 後、Dashboard Butler で短い通常会話を送る。期待値は unsupported model 400 が出ず、model-less fallback または default app-server で返答が返ること。runtime truth に fallback status が出る場合は rejected model が短く示され、token/secret は出ないこと。

## 次の PR を増やさない理由

model unsupported の分類、model-less selector、turn retry は同じ復旧機能の一塊。分類だけ、または selector だけで分けると owner-facing failure が残る。

## 停止条件

fallback に credential / permission / deploy / root helper mutation が必要になる場合。unsupported model 以外の課金・quota・auth policy へ広がる場合。対応 model 名を repo で断定しそうになる場合。
