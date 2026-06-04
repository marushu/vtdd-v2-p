# Issue #455 unsupported model backend thread reset 作戦図

## 完了体験

Dashboard Butler が `gpt-5.3-codex` unsupported を受けても、同じ古い Codex backend thread を resume し続けない。Worker は backend thread mapping を破棄し、bridge は `codexThreadId` なしで新規 app-server thread を開始する。owner は「短くして再送」ではなく、同じ入力が自動で新規 backend thread に再送される復旧を見る。

## VTDD 全体で進める部分

Issue #455 の cost/model routing regression を復旧する。PR #788 は model override 由来の unsupported fallback を直したが、実機では Codex CLI default / 既存 backend thread が `gpt-5.3-codex` を保持していた。今回は Dashboard thread mapping と bridge fallback の境界を直す。

## 設計

`buildDashboardAppServerFailureRecovery` は unsupported ChatGPT account model error を `unsupported_model` recovery として返し、`resetBackendThread=true`、`autoRetry=true`、original owner text / message id を含める。

Worker の `shouldResetDashboardAppServerBackendThread` は `context_window_exceeded` だけでなく `unsupported_model` も backend thread reset 対象にする。

bridge 側の unsupported fallback は、同じ payload の `codexThreadId` を引き継がない。fallback payload は `codexThreadId=null` とし、既存 backend thread を resume せず `thread/start` する。

恒久設計として repo は特定 model を固定しない。今回の VPS `gpt-5.5` 指定は `gpt-5.3-codex` default 障害を避けるための運用復旧手段であり、正常化後に env 指定を外して model-less へ戻せる必要がある。そのため fallback はエラー本文から実際に拒否された model を抽出し、拒否された model が現在の defaultModel と同じ場合だけ model override を外す。拒否された model が古い backend thread 由来で現在の defaultModel と違う場合は、現在の defaultModel を維持して新規 thread を開始する。

## 仮説

原因の仮説: deploy/restart 後も実プロセスは `gpt-5.5` になったが、Dashboard thread に保存された古い `codexThreadId` を resume したため、backend thread 側が `gpt-5.3-codex` を保持し続けた。PR #788 の fallback も `codexThreadId` を消さないため、同じ古い backend thread に戻っていた。

## 検証計画

- Unit / integration: unsupported model failure の recovery が `unsupported_model` + `resetBackendThread=true` になる。
- Worker integration: unsupported model recovery で app_server_thread mapping を削除し、`codexThreadId=null` の retry request を送る。
- Bridge integration: unsupported model fallback retry は `codexThreadId` を渡さず新規 thread を開始する。拒否された model が古い thread 由来の場合、現在の defaultModel は維持する。
- Local: `node --test test/dashboard-app-server-bridge.test.js test/worker.test.js`
- Local: `git diff --check`
- Local: `npm test`

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: unsupported model recovery builder と fallback payload の `codexThreadId` reset。
- `src/worker/runtime.js`: backend thread reset 対象 status に `unsupported_model` を追加。
- `test/dashboard-app-server-bridge.test.js`: recovery payload と fallback retry の `thread/start` 検証。
- `test/worker.test.js`: unsupported model recovery で mapping を削除して再送する検証。
- `worker.js`: worker bundle rebuild。

## 既に通っている経路

context window exceeded では Worker が `app_server_thread:*` mapping を削除し、同じ owner text を `codexThreadId=null` で再送できている。PR #788 で unsupported model classifier と fallback status は入っている。

## 未確認の境界

`gpt-5.5` が新規 backend thread で実際に返答成功するかは production E2E で確認する。Codex CLI default model selection の内部仕様は repo からは制御できない。

## 穴が出そうな箇所

- fallback retry が `codexThreadId` を引き継ぐ。
- Worker が unsupported model を generic failure として保存し、mapping を残す。
- reset retry が同じ owner message id で無限 loop する。
- model-less fallback が default `gpt-5.3-codex` に戻る。
- 復旧用の `gpt-5.5` env 指定が repo 固定 model と誤解される。

## PR 前に確認すること

VPS runtime truth、PR #788、Issue #734/#745 の Codex default model lessons、対象 tests、worker bundle rebuild、未追跡 E2E assets を stage しないこと。

## 実装候補と捨てた案

採用: unsupported model を backend thread reset 対象にし、retry では `codexThreadId` を破棄する。

捨てた案: Codex CLI update だけで直す。0.137.0 に更新しても同じ error が出たため不採用。

捨てた案: model-less fallback のままにする。default が unsupported に流れるため不採用。

採用: まず `gpt-5.5` 明示で新規 backend thread の正常化を確認し、その後 VPS env から model 指定を外して model-less が正常動作するかを実測する。repo には `gpt-5.5` を固定しない。

## merge 後に通す E2E

production deploy と bridge restart 後、Dashboard Butler で「君は誰？」を送り、`gpt-5.3-codex` unsupported で止まらず返信が返ること。必要なら一度だけ backend thread reset の transient status が出てもよい。

## 次の PR を増やさない理由

unsupported recovery、Worker mapping reset、bridge retry payload は同じ owner-facing failure の一塊。どれか一つだけでは同じ古い backend thread に戻って再発する。

## 停止条件

OpenAI credential / account / billing 変更、GitHub secret / variable mutation、deploy / root helper mutationが必要になった場合。unsupported model 以外の quota / auth policy へ広がる場合。
