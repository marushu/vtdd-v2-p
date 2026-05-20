## This PR satisfies Intent

Issue #448 の自動マージ RAG 証跡について、公開 PR コメントに残る `recordId` が Issue 番号、record type、summary、timestamp 由来の情報を漏らさないようにします。

これにより、公開リポジトリ上では `recordId` は opaque pointer として扱われ、Butler は必要に応じて authenticated runtime retrieve と repository boundary を通して検索・回復できます。

RAG 書き込み量 / cost impact: 変更なし。保存件数は前 PR と同じく成功した `approve_auto_merge` 実行ごとに structured `working_memory` 1 件です。この PR は ID 形式だけを変更します。

## Satisfied Success Criteria

- Issue #448: 自動マージ後の `working_memory` を後から辿るための `recordId` を維持する。
- Issue #448: 公開 PR コメントに出る `recordId` が意味つき/連番/summary由来にならないよう opaque UUID 形式にする。
- Issue #448: Butler の explicit `recordId` recovery は既存の auth + repository boundary を維持する。

## Unsatisfied Success Criteria

- この PR 単体では Issue #448 全体を close しません。
- `VTDD_RUNTIME_URL` repo variable 未設定時の実保存失敗は解消しません。repo variable mutation は scoped passkey approval が必要です。

## Dry-run Impact Report

- Target Issue: Issue #448
- Implementing Success Criteria: 公開PRコメントに出せる opaque `recordId` を生成し、Butler が後から authenticated retrieve できる前提を保つ。
- Explicit Non-goals: deploy、repo variable/secret mutation、RAG retrieve権限変更、dashboard UI追加、merge gate変更。
- Expected touched files/routes/workflows: `src/worker/runtime.js`, `test/worker.test.js`, generated `worker.js`。Routeは既存 `/v2/action/memory-write` と `/v2/retrieve/operational-memory`。
- Affected Issues: Issue #448。
- Affected PRs: この PR のみ。
- Affected workflows: guarded-autonomy-required-checks, gemini-pr-review, approve-auto-merge。
- Affected runtime/operator surfaces: runtime memory write response の `memoryWritePersisted.recordId`。
- What may break if we patch narrowly: 旧形式 `working_memory_<issue>...` に依存した手動参照は新規保存分には使えない。既存保存済み record の retrieve は既存IDのまま維持される。
- Unknowns to investigate before coding: なし。既存 retrieve は recordId lookup と repository boundary test がある。
- Validation needed: worker test、full `npm test`、generated worker check、PR checks。
- Stop condition: recordId だけで未認証 retrieve できる、または repository boundary が外れる場合は停止。

## File / Line Hypotheses

- `src/worker/runtime.js` around `makeOperationalMemoryRecordId`: 現在の ID は record type / Issue / timestamp / summary 由来なので、公開コメントに出すには情報量が多い。
- `test/worker.test.js` around working memory write: 新規 `recordId` が `mem_<uuid>` で、`working_memory` / Issue番号 / summary を含まないことを固定する。

## Hypothesis Retrospective

- 仮説どおり、operational memory の新規 ID は意味つき文字列で生成されていた。
- `recordId` 生成だけを opaque UUID に変更しても、既存の auth / repository boundary / explicit recordId lookup tests は維持された。
- 既存レコードのID互換性は壊していない。新規保存分から opaque になる。

## Verification Evidence

- `node --test test/worker.test.js`: pass, 136 tests。
- `npm test`: pass, 857 pass / 1 skipped。`check:self-parity` pass。`check:generated-worker` pass。

## Butler Completion Contract

- Owner goal: 公開リポジトリの PR コメントに `recordId` を残しても、ID自体から内部情報が読めず、Butler が必要時だけ認証付きで検索できるようにする。
- Butler entrypoint: Butler は既存の operational memory retrieve / recall path で `recordId` または `自動マージ` を使う。ユーザーに内部API path入力は要求しない。
- Action Schema exposure: 変更なし。既存 retrieve/write operation を使う。
- Runtime path: `/v2/action/memory-write` が opaque `recordId` を返し、`/v2/retrieve/operational-memory` が auth + repository boundary で回復する。
- Runner/runtime truth: `memoryWritePersisted.recordId` は `mem_<uuid>` 形式になる。
- Authority boundary: 読み出しは既存 machine auth / repository boundary に従う。deploy / credential / permission mutation はしない。
- E2E evidence: unit/full test evidence。live runtime deploy 後の新規保存で実 `recordId` 確認が必要。
- Completion status: incomplete

## Surface Update Checklist

- Public PR comment: `recordId` は opaque pointer として公開可能な形式にする。
- Butler recall: 既存 authenticated retrieve path を維持。
- Dashboard: 変更なし。
- Custom GPT Action Schema: 変更なし。
- Runtime deploy: merge後に別途必要。
