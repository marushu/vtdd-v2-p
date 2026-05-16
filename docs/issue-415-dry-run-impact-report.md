# Issue #415 Dry-run Impact Report

## 対象 Issue

- Issue #415: spec: meaningful memory checkpoint と探索仮説記録を operational RAG に導入する

## 実装する Success Criteria

- meaningful memory の operational definition を docs 化する
- exploration hypothesis の schema を定義する
- file/line hypothesis を memory record に保存できる
- "外した仮説" を保存対象として明文化する
- tension / stop reason / uncertainty を structured capture できる
- repair_case と failure reasoning の責務差分を整理する
- success pattern memory の retrieval rule を定義する
- operational retrieval で "failure map" を参照できる
- working_memory checkpoint write examples を docs 化する
- Butler / VPS Codex CLI / mac Codex が同じ checkpoint semantics を共有する

## 明示 Non-goals

- full transcript memory は実装しない
- hidden chain-of-thought persistence は実装しない
- personality simulation / AI emotional profiling は実装しない
- runtime truth replacement は実装しない
- generic chatbot memory は実装しない
- deploy、secret / permission / repository settings 変更はしない
- archived setup wizard artifact は変更しない

## 変更予定ファイル / route / workflow

- `docs/memory/rag-memory-philosophy.md`: meaningful memory、failure map、exploration memory の定義を追加
- `docs/memory-schema.md`: working_memory checkpoint content schema と repair_case 差分を追加
- `docs/memory/operational-memory-layer.md`: retrieval rule と shared checkpoint semantics を追加
- `docs/memory/vtdd-memory-bridge.md`: checkpoint write examples を更新
- `src/core/memory-schema.js`: working_memory / repair_case の structured capture validation を追加
- `src/core/operational-memory.js`: failure / success / rejected hypothesis / reconstruction signal を retrieval reference に追加
- `test/memory-provider.test.js`: schema validation coverage を追加
- `test/operational-memory.test.js`: failure map / rejected hypothesis retrieval coverage を追加
- `docs/setup/custom-gpt-actions-openapi.yaml` and `.json`: Butler Action Schema の checkpoint fields を documentation/runtime contract と一致させる可能性

Runtime route は既存 `vtddWriteOperationalMemory` / `vtddRetrieveOperationalMemory` を使う。新規 route は追加しない。

## 影響し得る Issue / PR / workflow / runtime surface

- Related Issues: #249, #251, #356, #360
- Affected PRs: 既存 PR への直接変更なし
- Affected workflows: Node unit tests、generated worker parity check、Custom GPT setup docs tests
- Affected surfaces: Butler memory write/retrieve Action Schema、Worker runtime memory write/retrieve、VPS Codex CLI `scripts/vtdd-memory.mjs`、mac Codex local CLI usage

## 狭い patch risk

- `working_memory` content validation を強くしすぎると既存の小さい checkpoint / repo-null recovery record が壊れる
- retrieval scoring を変えすぎると既存 operational memory ordering test が壊れる
- Custom GPT Action Schema だけ更新して runtime payload を受けないと Butler-facing workflow が未接続になる
- `repair_case` と failure reasoning を混同すると、修復済み事例と探索中の失敗仮説の責務が曖昧になる

## 未知 / 調査項目

- 既存 runtime が unknown fields をどこまで保存しているか
- existing OpenAPI JSON/YAML が手動管理か生成物か
- generated worker parity が runtime/schema/doc 更新を要求するか
- `memory-provider` の汎用 schema validation に type-specific validation を追加して既存 fixture を壊さない範囲

## Validation

- `node --test test/memory-provider.test.js test/operational-memory.test.js`
- 変更範囲に応じて `npm test`
- `node scripts/prepare-pr-body-file.mjs ...` and `node scripts/validate-pr-body.mjs <file>`
- PR 作成前に hypothesis retrospective を PR body に記録

## Stop Condition

- Issue #415 の Success Criteria にない runtime capability を新規設計する必要が出た場合
- archived wizard artifact や owner-specific runtime URL / account identifier を触る必要が出た場合
- Butler Action Schema、runtime route、VPS/mac CLI の shared semantics が同じ契約に収束しない場合
- validation が既存 checkpoint compatibility を壊す場合

## File / Line Hypotheses

- H1: `docs/memory/rag-memory-philosophy.md`
  - hypothesis: meaningful memory、failure map、exploration memory、rejected hypothesis の operational definition の主戦場。
  - risk if changed narrowly: philosophy だけが増えて schema/runtime と接続しない。
  - validation: docs と tests が同じ field names を参照する。
- H2: `docs/memory-schema.md`
  - hypothesis: `explorationHypothesis`, `suspectedFiles`, `suspectedLines`, `hypothesisStatus`, `stopReason`, `uncertainty`, `failureReasoning`, `successPattern` を working_memory content shape として定義する。
  - risk if changed narrowly: docs-only になり runtime record validation が追いつかない。
  - validation: `test/memory-provider.test.js` で valid/invalid record を検証する。
- H3: `src/core/memory-schema.js`
  - hypothesis: generic MemoryRecord validation の後段に optional type-specific checkpoint semantic validation を足せば既存 records を壊さず実装できる。
  - risk if changed narrowly: required fields を増やしすぎて古い `working_memory` が invalid になる。
  - validation: 既存 tests と新規 tests。
- H4: `src/core/operational-memory.js`
  - hypothesis: retrieval reference に `failureMap` と追加 score signals を出せば operational retrieval で failure memory / rejected hypothesis / tension checkpoint を参照できる。
  - risk if changed narrowly: score weight 変更で既存 ranking を壊す。
  - validation: 既存 ranking test を維持しつつ新規 retrieval test を追加する。
- H5: `test/operational-memory.test.js`, `test/memory-provider.test.js`
  - hypothesis: exploration hypothesis retrieval、failure map retrieval、tension checkpoint validation を最小 fixture で固定できる。
  - risk if changed narrowly: docs success criteria と test coverage がずれる。
  - validation: targeted node tests。
