# Issue #849 開発前作戦図 — Lean Butler Execution Contract

## 完了体験

Owner が目的を Butler に渡した後、通常の実装では current Mission / current Issue と直接依存だけを読み、small / normal change は軽量 plan で進む。root/cross-cutting/high-risk の時だけ full strategy / full preflight / broad evidence を使う。安全性、open Issue の未完了状態、GO/passkey boundary は維持する。

## VTDD 全体で進める部分

- AGENTS.md の scope / startup / planning / validation / completion gate を lean 化する。
- thread-independent startup と execution queue contract を同じ意味に揃える。
- 開発前作戦図を small / normal / root の planning tier にする。
- PR validator / renderer / template を tier-aware にする。
- legacy full-strategy PR body を backward compatible にして open PR #842 を壊さない。
- Issue #703 / #595 は owner policy update 済み。state は open のまま維持する。

## 設計

planning tier:

- small: isolated fix / generated artifact sync / isolated test/copy correction。PR body 内の target / intended change / validation だけ必須。独立 strategy file 不要。
- normal: coherent feature / several files in one subsystem。PR body 内の completion experience / design / hypothesis / validation / non-goal / stop condition を必須。既存 strategy を再利用可、新規 strategy file は任意。
- root: authority / persistence / public API / cross-service / Mission orchestration / security / recovery architecture。repo-backed strategy file と従来 full strategy fields を必須。

legacy body:
- Planning tier が無い既存 body は legacy_full として従来 validator を適用する。
- open PR を migration しない。

startup:
- normal scoped work は branch/status + Mission/Issue + current PR + relevant source/tests + required contract のみ。
- full preflight は handoff / recovery / unknown/conflict / root preemption / high-risk / explicit audit のみ。

validation:
- generated output に影響する場合は generation を scoped/full test より先に行う。
- scoped tests を green にしてから full suite を原則1回。
- CI は最終 coherent state の確認。通常の edit/test debugger にしない。

## 仮説

credit 浪費の root cause は safety rule そのものではなく、全 active Issue 読み・full startup・full strategy・full completion artifact・full CI を変更リスクに関係なく毎回同じ重さで適用していること。risk-tiered contract にすれば high-risk safety を維持したまま context / tool / CI 回数を大幅に減らせる。

## 検証計画

- Unit: validator で small / normal / root / legacy_full の4ケース。
- Unit: root は strategy evidence 欠落で fail、small は strategy file なしで pass。
- Unit: startup contract に minimal default / full escalation 条件が存在する。
- Unit: AGENTS に current Mission/current Issue + direct dependencies、generation-before-test、CI-not-debugger が存在する。
- Integration: renderer が planningTier=small/normal/root を生成し validator を通る。
- Regression: existing legacy full body fixtures が通る。
- Full: npm test / check:self-parity / check:generated-worker。
- Open PR compatibility: #842 body は Planning tier 無しでも legacy_full として validator 契約上有効。

## 改修見積もり

- AGENTS.md: Butler Completion Gate / startup / active scope / drift stop / strategy gate / cost discipline。
- docs/butler/thread-independent-startup-contract.md: minimal startup と full escalation。
- docs/butler/execution-queue-contract.md: full queue read の escalation 条件。
- docs/butler/pre-development-strategy-contract.md: planning tier contract。
- scripts/validate-pr-body.mjs: planning tier discriminator と legacy compatibility。
- scripts/render-pr-body.mjs: planning tier output。
- .github/pull_request_template.md / docs/pr-template-model.md: new tier field と説明。
- test/pr-body-guardrail.test.js / test/thread-independent-startup-contract.test.js / test/intent-mode-contract.test.js: contract regression。

## 既に通っている経路

- GO/passkey/approval runtime authority。
- execution queue classification。
- PR body validator / guarded-policy。
- generated worker parity。
- Butler-first / Dashboard primary surface。
- legacy full strategy PR bodies。

## 未確認の境界

- queue delta 自体の撤廃は今回行わない。
- remote Codex executor が planning tier をどこまで自動選択するかは今回の renderer default で normal を使うが、Mission runtime の将来自動分類は後続。
- open PR #842 の live CI は本 PR merge 後の workflow event でしか完全には確認できないため、legacy body fixture で契約互換を証明する。

## 穴が出そうな箇所

- validator の required marker を外しすぎて root change が軽量化される。
- template / renderer / validator の field 名 drift。
- legacy body が planning tier 無しで fail する。
- AGENTS だけ lean にして startup/queue docs が old heavy behavior を要求し続ける。
- small tier が authority change に誤用される。

## PR 前に確認すること

- Issue #849 / #703 / #595 の current body。
- AGENTS.md current safety invariants。
- validator / renderer / template / related tests。
- open PR #842 body に Planning tier が無いこと。
- main branch / open PR truth。

## 実装候補と捨てた案

採用:
- tiered planning + legacy compatibility。
- minimal startup default + explicit escalation。
- existing authority / queue / completion evidence semantics を維持。

捨てた案:
- AGENTS.md 全削除・全面簡略化。
- queue / strategy / completion gate を全撤廃。
- open Issues を一括書換え。
- open PR を新形式へ強制 migration。
- CI guardrail を外す。

## merge 後に通す E2E

process E2E:
1. small fixture: no strategy file, minimal planning fields -> pass。
2. normal fixture: inline plan -> pass。
3. root fixture: strategy file absent -> fail。
4. root fixture: valid strategy file -> pass。
5. legacy full fixture: Planning tier 無し -> pass。
6. full npm test / guarded-policy / generated-worker parity。

## 次の PR を増やさない理由

AGENTS / startup / queue / strategy / PR guardrail を同じ PR で整合させる。AGENTS だけ先に変えて validator/docs を後続へ送ると policy split が起き、逆に credit 浪費とCI失敗を増やすため、この governance boundary は一つのPRで閉じる。

## 停止条件

- high-risk authority / passkey / secret safety を弱める必要が出た場合。
- existing open PR #842 を migration しないと validator を保てない場合。
- existing open Issue を close / done 扱いにしないと新 policy を成立させられない場合。
- legacy full body compatibility を維持できない場合。

## Execution Queue Delta

- Queue position before: Issue #845 が product ROOT。Issue #849 は owner 明示指示による governance ROOT support。
- Preemption decision: ROOT
- Queue delta: Issue #849 を bounded governance slice として進める。Issue #845 / #741 ほか open Issues は active/incomplete のまま。
- Why this PR is next: current governance 自体が credit / CI 浪費を起こし、Issue #845 の Business OS 開発効率を直接阻害しているため。
- Active Issues not downscoped: existing active Issues are not downscoped, closed, deferred, or treated as complete by this change.
