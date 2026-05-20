## This PR satisfies Intent

Issue #448 の自動マージ証跡について、PR コメントに「RAG 保存候補」を残すだけの状態をやめ、自動マージ実行後に runtime の `/v2/action/memory-write` へ `working_memory` を保存します。

保存結果は自動マージ実行済み PR コメントの `RAG 保存` セクションへ `status` と `recordId` で明示します。保存に失敗した場合も「RAGへは保存されていません。このPRコメントは永続RAGの代替ではありません。」と表示し、候補コメントを永続記憶の代替として扱わないようにしました。

RAG 書き込み量 / cost impact: 成功した `approve_auto_merge` 実行ごとに、構造化された `working_memory` を 1 件だけ保存します。全文会話ログや raw transcript は保存しません。

## Satisfied Success Criteria

- Issue #448: 自動マージ実行後の証跡として、repo、PR、Issue、head SHA、reviewer evidence、checks、merge result を含む `working_memory` payload を生成する。
- Issue #448: 自動マージ実行後の PR comment に `自動マージ` と RAG 保存結果を残し、保存済みの場合は `recordId` から runtime RAG へ辿れるようにする。
- Issue #448: RAG 保存失敗時は owner-facing 日本語で未保存を明示し、PR comment を永続RAGの代替として過剰主張しない。

## Unsatisfied Success Criteria

- この PR 単体では Issue #448 全体を close しません。live GitHub Actions 上の自動マージ実行で実際の `recordId` が発行される証跡は、マージ後の実行コメントで確認する必要があります。
- dashboard event の既存送信経路は維持していますが、この PR は dashboard 検索 UI の追加ではありません。

## Dry-run Impact Report

- Target Issue: Issue #448
- Implementing Success Criteria: 自動マージ実行後に RAG candidate ではなく永続 `working_memory` を保存し、PR comment に保存結果と `recordId` を出す。
- Explicit Non-goals: merge gate 条件変更、manual merge / passkey merge path 変更、deploy 自動化、credential / permission / secret mutation、dashboard 検索 UI 追加。
- Expected touched files/routes/workflows: `scripts/run-approve-auto-merge.mjs`, `src/core/approve-auto-merge.js`, `src/core/index.js`, `test/approve-auto-merge.test.js`, `test/approve-auto-merge-workflow.test.js`。
- Affected Issues: Issue #448。
- Affected PRs: この PR のみ。既存 PR #427 には触れません。
- Affected workflows: `approve_auto_merge` GitHub Actions script path。workflow yaml は変更しません。
- Affected runtime/operator surfaces: runtime `/v2/action/memory-write` への machine-auth write、auto-merge executed PR comment。
- What may break if we patch narrowly: runtime URL/token がない環境では RAG 保存は失敗表示になる。merge 自体は既存フロー通り完了後にコメントで未保存を表明する。
- Unknowns to investigate before coding: runtime 本番での `memoryWritePersisted.recordId` の実値は、実際の auto-merge 実行時に確認する。
- Validation needed: unit test、workflow static test、全体 `npm test`、PR check、auto-merge 実行後コメントの `recordId` 確認。
- Stop condition: RAG payload に secret / raw transcript が入る、または memory write 失敗を保存済みとして表示する場合は停止。

## File / Line Hypotheses

- `scripts/run-approve-auto-merge.mjs` lines 193-270: merge API 成功後に `persistApproveAutoMergeMemory` を呼び、runtime `/v2/action/memory-write` へ保存して結果を実行済みコメントへ渡す。
- `src/core/approve-auto-merge.js` lines 187-240: 実行済みコメントを `RAG 保存候補` から `RAG 保存` に変更し、永続 `working_memory` payload builder を公開する。
- `src/core/approve-auto-merge.js` lines 243-272: 保存成功 / 失敗 / 未試行の表示を分け、失敗時に永続RAG未保存を明示する。
- `test/approve-auto-merge.test.js` lines 116-190: 保存済み `recordId`、payload 内容、失敗時の過剰主張防止を固定する。

## Hypothesis Retrospective

- 仮説どおり、既存コメント formatter は JSON の「RAG 保存候補」を出すだけで runtime memory write を行っていなかった。
- `approve_auto_merge` 実行スクリプトは merge result を取得した直後に追加処理できるため、merge SHA を含めた `working_memory` 保存に接続できた。
- runtime memory write の失敗はあり得るため、PR comment は `persisted` 以外を保存済みと読めない表示に分離した。

## Verification Evidence

- `node --test test/approve-auto-merge.test.js test/approve-auto-merge-workflow.test.js`: pass, 10 tests。
- `npm test`: pass, 857 pass / 1 skipped。`check:self-parity` pass。`check:generated-worker` pass。

## Butler Completion Contract

- Owner goal: 自動マージ証跡を「RAG 保存候補」コメントで終わらせず、Butler / VPS Codex CLI が後で recall できる永続 `working_memory` に保存する。
- Butler entrypoint: Butler は通常どおり GitHub PR / dashboard / RAG recall から `自動マージ` 証跡を探す。ユーザーに内部 API path 入力は要求しない。
- Action Schema exposure: 既存 runtime `/v2/action/memory-write` を利用する。Custom GPT Action Schema の新 operationId は追加しない。
- Runtime path: GitHub Actions `scripts/run-approve-auto-merge.mjs` → runtime `/v2/action/memory-write` → `working_memory` 保存。
- Runner/runtime truth: PR comment に `status: persisted` と `recordId`、または失敗理由を出す。
- Authority boundary: `approve_auto_merge` policy で既に merge gate を通過した後の証跡保存だけを行う。deploy / credential / permission mutation はしない。
- E2E evidence: 現時点は unit/static workflow/full test evidence。live auto-merge 後の実 `recordId` はこの PR の実行コメントで確認する。
- Completion status: incomplete

## Surface Update Checklist

- Butler natural-language path: 既存の「自動マージ」検索 / recall で辿る前提を維持。
- Dashboard / owner-facing text: PR comment の owner-facing 文言を `RAG 保存` に更新し、失敗時の未保存を日本語で明示。
- Custom GPT Action Schema: 変更なし。既存 memory write route を使用。
- Runtime runner path: `approve_auto_merge` script から runtime memory write へ接続。
- Evidence / RAG: 成功した自動マージごとに structured `working_memory` 1件を保存。raw transcript は保存しない。
