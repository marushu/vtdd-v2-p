# Issue #703 Butler 作戦図 handoff 接続

## 完了体験

Dashboard Butler で owner が自然文のまま Issue-backed 実装 GO を出した時、Butler はコードへ飛ばず、まず対象 Issue にひもづく開発前作戦図を handoff payload に持たせる。VPS runner / remote Codex はその作戦図を PR body に反映し、作戦図なしの実装 PR は失敗する。

## VTDD 全体で進める部分

Issue #703 の guardrail を mac Codex / VPS runner の PR body validation だけで終わらせず、Dashboard Butler の自然文 build handoff 入口まで接続する。これにより、owner が iPhone / iPad から自然に GO した場合も、実装前の予見・予測・あたりをつける工程を通る。

## 設計

Dashboard Butler の `/v2/action/execute` build handoff 正規化で、Issue 番号、repository input、runtime branch、owner message、traceability refs から最小限の deterministic 作戦図ドラフトを作る。既に `continuationContext.handoff.developmentStrategy` または `payload.developmentStrategy` がある場合は、それを尊重する。`src/core/remote-codex-executor.js` は handoff の `developmentStrategy` を落とさず request / queue comment へ運ぶ。`src/core/remote-codex-handoff-scope.js` は Butler build handoff の bounded 判定に developmentStrategy の最低限の具体性を含める。

## 仮説

現在の root blocker は、PR #704 が VPS runner の PR body 正規化だけを塞ぎ、Dashboard Butler の natural-language build handoff が developmentStrategy を生成・保持しない点にある。`normalizeRemoteCodexHandoffPayload` と `createRemoteCodexExecutionRequest` の間で strategy を補完・保持すれば、Butler 入口から runner まで同じ guardrail が届く。

## 検証計画

- `test/worker.test.js`: 自然文 build GO で dispatch される `handoff_json` に `developmentStrategy` が入り、Issue #135 の evidence path を持つことを確認する。
- `test/butler-orchestrator.test.js`: bounded remote Codex handoff は concrete developmentStrategy なしでは通らず、ありなら通ることを確認する。
- `test/remote-codex-executor.test.js`: request normalization が handoff の developmentStrategy を落とさないことを確認する。
- `node --test test/butler-orchestrator.test.js test/remote-codex-executor.test.js test/worker.test.js test/vps-runner-script.test.js test/pr-body-guardrail.test.js` を実行する。

## 改修見積もり

- `src/worker/runtime.js:6999 normalizeRemoteCodexHandoffPayload`: Butler build handoff に developmentStrategy を補完する。repository / Issue / branch / ownerMessage / traceability refs から deterministic draft を作る。
- `src/core/remote-codex-handoff-scope.js:1 isBoundRemoteCodexHandoff`: bounded handoff 判定へ concrete developmentStrategy の最低限 validation を追加する。
- `src/core/remote-codex-executor.js:91 createRemoteCodexExecutionRequest`: handoff.developmentStrategy を request に残し、VPS runner queue comment へ渡す。
- `test/worker.test.js:7724 natural Butler build GO`: dispatch inputs の handoff_json に strategy が入ることを確認する。
- `test/butler-orchestrator.test.js:99 bounded remote Codex handoff`: strategy 必須化の positive / negative を追加する。
- `test/remote-codex-executor.test.js`: request が strategy を保持する単体確認を追加する。

## 既に通っている経路

PR #704 で PR body template / renderer / validator / guarded workflow / VPS runner PR body generation は作戦図を要求するようになった。`scripts/run-vps-runner.mjs` は handoff.developmentStrategy または payload.developmentStrategy を PR body に使える。

## 未確認の境界

Dashboard Butler に専用の編集 UI はまだ作らない。今回の範囲は自然文 build handoff の payload に作戦図を載せる runtime 接続であり、owner が画面上で作戦図を編集する UX は別 Issue 候補に残る。LLM による深い設計品質はこの PR では保証せず、deterministic draft と PR validator による最低限の gate とする。

## 穴が出そうな箇所

- strategy を runtime で補完しても、内容が薄ければ「形だけ」になる。PR validator の具体性 check と runner 側拒否で最低限を守る。
- `createRemoteCodexExecutionRequest` が handoff object を再構成する時に strategy を落とすと、VPS runner へ届かない。
- 既存テストの Custom GPT surface 名は残るが、主経路は Dashboard Butler と明記し、Action Schema fallback と混同しない。

## PR 前に確認すること

Issue #703、AGENTS.md、`docs/butler/pre-development-strategy-contract.md`、`src/worker/runtime.js` の handoff normalization、`src/core/remote-codex-executor.js` の request generation、`src/core/remote-codex-handoff-scope.js` の bounded 判定、関連 worker/orchestrator/runner tests を確認した。

## 実装候補と捨てた案

- 採用: runtime が deterministic 作戦図 draft を補完し、handoff.developmentStrategy として運ぶ。
- 捨てた案: Dashboard 専用 UI を先に作る。UX は重要だが、この PR の root blocker は natural-language build handoff の未接続なので、UI 先行は scope が大きすぎる。
- 捨てた案: VPS runner 側だけで欠落を拒否する。これでは Butler があたりをつけられず、owner-facing 入口が改善しない。

## merge 後に通す E2E

PR merge 後は deploy が必要な worker/runtime 変更として扱う。production deploy 後、Dashboard Butler から Issue-backed build handoff を試し、runtime truth / queue comment / PR body に developmentStrategy が残ることを確認する。

## 次の PR を増やさない理由

入口の補完、bounded 判定、request 保持、worker/orchestrator/executor tests を同じ PR に入れるため、「Butler は作ったが runner に届かない」「runner は受けるが Butler が作れない」という予測可能な穴をこの PR 内で塞ぐ。

## 停止条件

作戦図を補完するために LLM 呼び出し、credential mutation、deploy、root/helper、GitHub permission 変更が必要になったら止める。Dashboard 作戦図編集 UI が必須だと分かった場合は、この PR では incomplete として Issue に残す。
