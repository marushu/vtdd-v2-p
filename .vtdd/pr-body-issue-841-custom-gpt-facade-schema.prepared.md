## This PR satisfies Intent

- Issue #841: Custom GPT Editor の OpenAPI operation 30件上限に対応するため、Custom GPT に見せる schema を 7 個のカテゴリ facade operation に圧縮する。内部 runtime capability は削除せず、Worker 内部 route / Dashboard / operator 側に残す。

## Satisfied Success Criteria

- `docs/setup/custom-gpt-actions-openapi.yaml` の `operationId` は 7 件になった。
- `docs/setup/custom-gpt-actions-openapi.json` も同じ 7 path / operation になった。
- deploy / secret sync / VPS maintenance / approval grant 系の個別 operationId は facade schema から外した。
- full runtime manifest と Custom GPT facade manifest を分け、`check:self-parity` が 30件上限を検査する。
- `/setup/openapi.yaml` は canonical facade schema を返すため、deploy 後の URL import は 30件以下になる。
- 既存内部 route は削除せず、Worker runtime 内に残した。

## Unsatisfied Success Criteria

- production deploy 後の live curl と iPhone Custom GPT Editor import 実機確認は未実施。

## Non-goal violations

None.

## 開発前作戦図

- 作戦図 evidence: docs/development-strategy/issue-841-custom-gpt-facade-schema.md
- 完了体験: owner が iPhone の Custom GPT Editor で `/setup/openapi.yaml` を URL import しても 30件上限エラーが出ず、Custom GPT からはカテゴリ別 facade operation を呼べる。
- VTDD 全体で進める部分: Custom GPT fallback setup / Butler Action schema / Worker runtime facade / self-parity guardrail。
- 設計: owner-facing surface は Dashboard Butler を主に保ちつつ、fallback の Custom GPT setup scope だけ schema operationId を facade 化する。Custom GPT の operation 上限は schema に直接出る operationId 数にかかるため、内部 capability を消さず、GPT-facing schema だけを `vtddCustomGptGateway`, `vtddCustomGptMemory`, `vtddCustomGptGitHub`, `vtddCustomGptSetup`, `vtddCustomGptExecution`, `vtddCustomGptOps` に束ねる。内部挙動は body の `action` で選ぶ。
- 仮説: 35個の内部 operationId をそのまま公開していたことが Custom GPT Editor の上限エラー原因。カテゴリ facade なら機能を減らさず 30件以下にできる。
- 検証計画: schema operation count、YAML/JSON一致、self-parity limit、Worker facade auth/dispatch、高リスク非直実行、generated worker、full npm test を確認する。
- 改修見積もり: `src/worker/runtime.js`, `src/core/custom-gpt-setup-artifacts.js`, `docs/setup/custom-gpt-actions-openapi.yaml`, `docs/setup/custom-gpt-actions-openapi.json`, instructions docs, setup docs tests, worker tests, generated `worker.js`。
- 既に通っている経路: #839 で `/setup/openapi.yaml`, `/setup/openapi.json`, `/setup/instructions.txt`, `/setup/latest` の raw import endpoint は production 配信済み。
- 未確認の境界: iPhone Custom GPT Editor が新しい facade schema URL import を実機で受け付けることは deploy 後確認。
- 穴が出そうな箇所: 高リスク操作を facade から直実行すると authority boundary が崩れる。Instructions が旧個別 operationId 前提のままだと Butler が存在しない操作を呼ぶ。
- PR 前に確認すること: operation count 7/30、旧 high-risk operationId 非露出、Worker auth boundary、self-parity guardrail、full test。
- 実装候補と捨てた案: 旧35 operation から一部削除する案は機能欠落になるため捨てた。1 operation 全統合は観測性が落ちるため捨てた。7カテゴリ facade を採用した。
- merge 後に通す E2E: mapped E2E test として production `/setup/openapi.yaml` / `.json` を curl し、operationId 7件を確認。iPhone Custom GPT Editor で URL import し、30件上限エラーが出ないことを確認。
- 次の PR を増やさない理由: schema 上限、runtime facade、self-parity guardrail は一体でないと再発するため、このPRでまとめる。
- 停止条件: 既存内部 route 削除が必要になる、または高リスク操作の直実行が必要になる場合は停止する。

## Dry-run Impact Report

- Target Issue: Issue #841
- Implementing Success Criteria: Custom GPT schema を 30件以下にし、facade schema / runtime route / self-parity guardrail / tests を実装する。
- Explicit Non-goals: Worker 内部 route 削除、Dashboard primary chat UI 改修、Custom GPT editor 自動作成、voice mode Actions 実行前提化、高リスク authority boundary 緩和はしない。
- Expected touched files/routes/workflows: `/v2/custom-gpt/{gateway,memory,github,setup,execution,ops}`, setup OpenAPI YAML/JSON, instructions docs, self-parity script, tests, generated worker。
- Affected Issues: Issue #841, Issue #839 evidence gap。active Issues は縮小しない。
- Affected PRs: なし。
- Affected workflows: deploy workflow は未変更。PR checks / worker build / self-parity check に影響。
- Affected runtime/operator surfaces: Custom GPT Actions schema, Worker runtime API, passkey operator guidance。Dashboard Butler primary chat は未変更。
- What may break if we patch narrowly: schemaだけ7件にすると runtime route がなく呼べない。runtimeだけ作ると iPhone import は直らない。self-parityを直さないと31件以上へ再発する。
- Unknowns to investigate before coding: iPhone Custom GPT Editor の実機 URL import 結果は production deploy 後まで未確認。
- Validation needed: focused setup/parity/docs tests, Worker Custom GPT facade tests, build, self-parity, generated worker check, full npm test。
- Stop condition: tests が operation count / high-risk non-direct execution / internal route preservation を証明できない場合はPR化しない。

## Execution Queue Delta

- Queue position before: Issue #841 is a NEXT setup recovery slice after #839 URL import succeeded but the Custom GPT Editor reported the 30 operation limit.
- Preemption decision: NEXT.
- Queue delta: Issue #841 moves to Now for this PR; Issue #839 remains Evidence Gap until production iPhone Custom GPT Editor import is confirmed after deploy.
- Why this PR is next: URL import cannot be tested while the schema exposes 35 operations. Facade schema is the blocker for the owner’s current iPhone setup flow.
- Active Issues not downscoped: Active Issues are not shrunk, deferred out of scope, or treated as complete by omission. This PR only addresses Issue #841 schema/facade/guardrail scope.

## File / Line Hypotheses

- file: `src/worker/runtime.js`
  - hypothesis: Existing handlers can be reused behind `/v2/custom-gpt/*` dispatch without deleting internal routes.
  - risk if changed narrowly: GPT-facing schema can pass import but calls fail at runtime.
  - validation: Worker Custom GPT facade tests and full worker suite.
  - related Issue: Issue #841
- file: `src/core/custom-gpt-setup-artifacts.js`
  - hypothesis: self-parity must count Custom GPT operationIds and fail above 30.
  - risk if changed narrowly: future schema changes can silently exceed Custom GPT Editor limits again.
  - validation: runtime setup manifest parity tests and `npm run check:self-parity`.
  - related Issue: Issue #841
- file: `docs/setup/custom-gpt-actions-openapi.yaml`
  - hypothesis: exposing 7 facade operationIds fixes the Custom GPT Editor operation cap without losing internal capabilities.
  - risk if changed narrowly: deleting capabilities from runtime would break Dashboard/operator/internal routes.
  - validation: schema docs tests and production `/setup/openapi.yaml` post-deploy E2E.
  - related Issue: Issue #841

## Hypothesis Retrospective

- expected: OpenAPI operationId count drops from 35 to 7 and self-parity reports 7/30.
- actual: `check:self-parity` reports `Checked 7/30 Custom GPT operationIds.`
- mismatch: production iPhone import remains after merge/deploy.
- lesson: Custom GPT-facing schema should be a stable facade, not a dump of every internal runtime route.
- should become RAG candidate: はい。Custom GPT schema はカテゴリ facade にし、内部 capability を直接 operationId として全部公開しない、という再利用判断。

## Verification Evidence

- Unit: `node --test test/runtime-setup-manifest-parity.test.js test/custom-gpt-setup-artifacts.test.js test/custom-gpt-setup-docs.test.js`
- Integration: `node --test test/worker.test.js --test-name-pattern "Custom GPT"`; `npm run build:worker`; `npm run check:self-parity`; `npm run check:generated-worker`; `npm test`
- E2E: local evidence in `docs/mvp/e2e/e2e-custom-gpt-facade-schema.md`; production curl / iPhone import E2E remains after deploy.
- Manual: YAML operationId count verified as 7 and old high-risk operationIds absent from facade schema.
- Evidence path/link: docs/mvp/e2e/e2e-custom-gpt-facade-schema.md

## Butler Completion Contract

- Primary owner surface: Dashboard Butler.
- Fallback surface: mac Codex is only used here for implementation/debug.
- Owner goal: Custom GPT Editor の URL import で schema 上限エラーを避け、Butler V2 をテストできるようにする。
- Butler entrypoint: `/setup/openapi.yaml` import URL and Custom GPT Actions.
- Dashboard Butler natural-language path: Dashboard Butler primary chat は未変更。このPRは Custom GPT fallback setup path。
- Action Schema exposure: 7 GPT-facing facade operationIds exposed.
- Runtime path: Worker `/v2/custom-gpt/{gateway,memory,github,setup,execution,ops}` plus existing internal routes.
- Runner/runtime truth: local Worker tests and self-parity verify route exposure; production runtime truth remains after deploy.
- Authority boundary: gateway bearer auth required; high-risk ops return passkey operator guidance and do not execute directly.
- E2E evidence: local schema/facade E2E evidence exists; production iPhone import E2E remains.
- Completion status: incomplete

## Surface Update Checklist

- Cloudflare deploy: 未実施。merge 後に scoped deploy approval / deploy が必要。
- Custom GPT Action Schema update: source artifact updated to facade schema; actual editor import remains after deploy.
- Custom GPT Instructions update: facade guidance added to full/short instructions.
- iPhone Butler live E2E: 未実施。deploy 後に Custom GPT Editor URL import を確認する。

## Related Constitution Rules

- AGENTS.md: Issue traceability, bounded change contract, Butler completion gate。
- docs/butler/thread-independent-startup-contract.md: setup/handoff work must be recoverable from durable sources。
- docs/butler/execution-queue-contract.md: Issue #841 is NEXT, not emergency preemption。

## Out-of-scope but NOT implemented

- Custom GPT 自動作成。
- Voice mode 中の Actions 実行。
- Dashboard Butler primary chat UI 改修。
- deploy / secret / VPS maintenance / merge / issue close の authority boundary 緩和。

## Extra changes (if any)

None.

<!-- VTDD metadata -->
- Issue: Issue #841
- Execution ID: Not provided.
- Goal: open_pr
