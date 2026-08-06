# Issue #836 RAG retrieval quality 作戦図

## 完了体験

オーナーが Dashboard Butler から自然文で「前に話した MCP 入口の件」や
「Cloudflare 側で保存して GO 待ちにする話」と聞いた時、保存済みの
working_memory checkpoint が recordId 指定なしで上位に戻る。Butler / MCP /
mac Codex / VPS Codex CLI は、なぜその記憶が選ばれたかを
`retrievalMatch` で確認できる。

## VTDD 全体で進める部分

VTDD の外部記憶装置構想のうち、保存済み operational memory を自然文で
呼び戻す retrieval 品質を進める。Dashboard UI、Custom GPT 全面更新、
Vectorize/embedding provider provisioning、production deploy はこの PR では進めない。

## 設計

`src/core/operational-memory.js` の retrieval を、単一の provider query 依存から、
full query / token / tag / relatedIssue の bounded candidate retrieval に広げる。
semantic/vector retrieval は接続済みでない限り有効と見せず、
`retrievalSignals.semanticRetrieval.enabled=false` として明示する。
各 compact context record には `retrievalMatch` を追加し、query token、tag、
relatedIssue、repository、record type のどれで拾ったかを runtime truth として返す。

## 仮説

原因仮説は、保存と recordId lookup は成功しているが、自然文 retrieval が
full phrase の provider query と既存 priority/freshness score に寄りすぎ、
新しい checkpoint の exact tag / relatedIssue / title-summary token match が
古い高 priority bridge 障害記憶に勝てなかったこと。

## 検証計画

- `test/operational-memory.test.js` で新規 checkpoint が recordId なしの自然文 query で
  1位になる regression test を追加する。
- `test/worker.test.js` で `/v2/retrieve/operational-memory` と MCP search path に
  `retrievalMatch` と retrieval signals が返ることを確認する。
- `npm run build:worker`、`npm run check:self-parity`、
  `npm run check:generated-worker`、`npm test` を通す。

## 改修見積もり

- `src/core/operational-memory.js`: candidate retrieval、tokenization、scoring、
  `retrievalMatch` evidence を追加する。
- `src/worker/runtime.js`: `relatedIssue` 入力を runtime route / conversation-time memory に通す。
- `test/operational-memory.test.js`: live failure fixture の regression test を追加する。
- `test/worker.test.js`: route / MCP response evidence shape を更新する。
- `docs/memory/vtdd-memory-bridge.md`: direct D1 不可時の runtime verification 手順を追記する。
- `worker.js`: build-generated worker を同期する。

## 既に通っている経路

- `/v2/retrieve/operational-memory` は runtime 経由で成功している。
- checkpoint write は `mem_d7d425a0-9630-40d1-a947-4a12fa50017a` で成功している。
- recordId lookup は成功している。
- Dashboard / MCP / Worker は operational memory retrieval の共有 path を持っている。

## 未確認の境界

- production deploy 後の live natural-language retrieval はこの PR では未確認。
- semantic/vector retrieval provider は未接続のまま扱う。
- Wrangler auth expired により Mac から direct D1 inventory は未確認。
- Butler owner-facing E2E は deploy 後に別途確認が必要。

## 穴が出そうな箇所

単純に priority score だけを下げると、本当に重要な古い障害記憶が落ちる。
逆に semantic retrieval と呼ぶと、Vectorize 未接続なのに意味検索があるように
見えて owner / Butler を誤認させる。token/tag/Issue の evidence を明示して、
決定的 retrieval と semantic 未接続を分ける必要がある。

## PR 前に確認すること

- Issue #836 の Why / Success Criteria / Non-goals を読む。
- `src/core/operational-memory.js` と `src/worker/runtime.js` の retrieval path を読む。
- `test/operational-memory.test.js` と `test/worker.test.js` の既存 coverage を読む。
- `docs/memory/vtdd-memory-bridge.md` の運用手順を確認する。
- GitHub PR check の guarded-policy / generated-worker 条件を確認する。

## 実装候補と捨てた案

- 採用: bounded full-query / token / tag / relatedIssue candidate retrieval と evidence scoring。
- 捨てた案: Vectorize/embedding をこの Issue で必須化する。Cloudflare resource / credential scope が広がるため。
- 捨てた案: full transcript を保存する。外部記憶装置の整理された記憶という目的と privacy boundary に合わないため。
- 捨てた案: Codex app-server bridge を通常の保存・検索で起動する。Bridge 起動コストと遅延を増やすため。

## merge 後に通す E2E

- production deploy 後に runtime route から `mem_d7d425a0-9630-40d1-a947-4a12fa50017a`
  を自然文 query / tags / relatedIssue で取得できることを live 検証する。
- Dashboard Butler から同じ趣旨の自然文で compact context に当該 record が含まれることを確認する。
- semantic retrieval が未接続なら `semanticRetrieval.enabled=false` として見えることを確認する。

## 次の PR を増やさない理由

この PR は retrieval ranking と evidence shape の同一 failure boundary を閉じる。
Vectorize/embedding、本番 deploy、Dashboard UI 改修は別 authority / runtime evidence が
必要なため、この PR に混ぜない。追加 PR を増やすなら、それは semantic provider や
production E2E の別 scope として扱う。

## 停止条件

- Vectorize/embedding provider の provisioning が必須になる場合。
- credential mutation、Cloudflare resource creation、production deploy が必要になる場合。
- 通常の memory save/search が Codex app-server bridge 起動を必要とする場合。
- Dashboard UI 全面改修へ scope が広がる場合。
