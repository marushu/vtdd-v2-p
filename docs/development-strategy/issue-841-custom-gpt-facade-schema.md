# Issue #841 Custom GPT facade schema strategy

## 完了体験

Custom GPT Editor の「URL からインポート」で `/setup/openapi.yaml` を読み込んだ時、operation 数が 30 件以下になり、iPhone でも schema 上限エラーなしで Action を設定できる。Custom GPT から見える入口はカテゴリ別 facade にする。Worker 内部の既存 route / capability は削除しない。

## VTDD 全体で進める部分

- Custom GPT facing: 少数のカテゴリ operationId を公開する。
- Worker runtime: `/v2/custom-gpt/*` facade route を追加し、既存 handler に委譲する。
- Self-parity: Custom GPT schema の 30 operation 上限を検査する。
- Setup artifact: `/setup/openapi.yaml` / `.json` は facade schema を返す。

## 設計

Custom GPT の operation 上限は「schema に直接出ている operationId 数」にかかる。したがって runtime capability を減らすのではなく、Custom GPT には以下だけを見せる。

- `getHealth`
- `vtddCustomGptGateway`
- `vtddCustomGptMemory`
- `vtddCustomGptGitHub`
- `vtddCustomGptSetup`
- `vtddCustomGptExecution`
- `vtddCustomGptOps`

各 facade は body の `action` で内部機能を分類する。deploy / secret sync / VPS maintenance / approval grant のような高リスク操作は、Custom GPT facade から直接実行せず、operator / approval required の runtime truth を返す。

## 仮説

- `docs/setup/custom-gpt-actions-openapi.yaml` が 35 operationId を直接公開しているため、Custom GPT Editor が拒否している。
- `src/core/custom-gpt-setup-artifacts.js` の manifest parity は schema と runtime の同期だけを見ており、30 件上限を検査していない。
- Worker には既存 handler が揃っているため、facade route は薄い dispatch で足りる。

## 検証計画

- schema YAML/JSON の operation 数が一致し 30 以下であることをテストする。
- `evaluateRuntimeSetupManifestParity` が operation limit を返し、超過 fixture で fail することをテストする。
- Worker facade route の auth boundary と代表 dispatch をテストする。
- `npm run build:worker`
- `npm run check:self-parity`
- `npm run check:generated-worker`
- `npm test`

## 改修見積もり

- `src/worker/runtime.js`: `/v2/custom-gpt/*` routes と dispatch helper を追加。既存 route 削除なし。リスクは既存 handler の Request/URL 形状変換ミス。
- `src/core/custom-gpt-setup-artifacts.js`: facade manifest と 30 operation guardrail を追加。リスクは self-parity の旧内部 operation 期待との衝突。
- `docs/setup/custom-gpt-actions-openapi.yaml` / `.json`: GPT-facing schema を facade 化。リスクは instructions が旧 operation 名を参照し続けること。
- `test/*custom-gpt*` / `test/runtime-setup-manifest-parity.test.js`: 期待値更新と guardrail 追加。
- `worker.js`: generated worker 更新。

## 既に通っている経路

- #839 で `/setup/openapi.yaml`, `/setup/openapi.json`, `/setup/instructions.txt`, `/setup/latest` の production 配信は成功済み。
- 既存 35 route は runtime 側で実装済み。

## 未確認の境界

- iPhone Custom GPT Editor の URL import 実機成功はこの PR の production deploy 後に確認する。
- Custom GPT が facade `action` enum を自然言語からどの程度安定して選ぶかは初回実機テストで確認する。

## 穴が出そうな箇所

- Auth 設定が「なし」のままだと 401 になる。schema は Bearer auth を要求する。
- facade によって operationId は減るが、instructions が旧 operationId 前提のままだと Butler が古い名前を呼ぼうとする。
- 高リスク route を便利に直結すると authority boundary が崩れる。

## PR 前に確認すること

- operation count YAML/JSON <= 30。
- 旧 deploy / secret / VPS maintenance / approval-grant operationId が facade schema に直接残っていない。
- `check:self-parity` が 30 limit を検査する。
- Worker route dispatch が代表ケースで通る。

## 実装候補と捨てた案

- 採用: 7 category facade。機能は `action` で分類する。
- 捨てた案: 35 operation から一部削除。理由は owner の要求が「減らさず分類」であり、内部機能喪失や将来の再追加 drift を招く。
- 捨てた案: 1 operation に全統合。理由は最短ではあるが、Custom GPT の tool selection とテストの観測性が落ちる。

## merge 後に通す E2E

- production `/setup/openapi.yaml` を取得し operationId 数が 30 以下であることを確認する。
- iPhone Custom GPT Editor で URL import が schema 上限エラーを出さないことを確認する。
- Health と代表 facade call が 401 ではなく、正しい Bearer auth で通ることを確認する。

## 次の PR を増やさない理由

Issue #841 の問題は schema 上限、facade runtime route、self-parity guardrail が一体でないと再発する。docs-only では runtime が呼べず、runtime-only では iPhone import が直らないため、この PR でまとめて扱う。

## 停止条件

- 既存内部 route を削除しないとテストを通せない状態になった場合。
- 高リスク操作を Custom GPT facade から直接実行しないと要件を満たせない状態になった場合。
- Auth / passkey boundary の既存仕様と衝突した場合。
