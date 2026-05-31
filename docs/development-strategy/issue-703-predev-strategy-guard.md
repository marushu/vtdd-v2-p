# Issue #703 開発前作戦図

## 完了体験

AI が実装に入る前に、対象 Issue の終わり方、疑わしい箇所、壊れそうな箇所、確認順序を先に repo に残す。オーナーはチャット内の反省を信じる必要がなく、PR を見れば「この開発者は先に全体を見たか」を確認できる。Dashboard Butler / VPS Codex CLI / mac Codex のどの入口でも、作戦図なしの実装 PR は guardrail で止まる。

## VTDD 全体で進める部分

Butler が交通整理する前提を、AI 開発者側にも強制する。Issue #637 のような Now 作業を止め続けた根は、コード前の予見不足なので、今回は runtime 機能ではなく「作業開始前の判断」を repository-backed にする。

## 設計

実装前の作戦図を first-class artifact にする。場所は `docs/development-strategy/issue-<number>-<slug>.md` とし、PR body の `開発前作戦図` から evidence path として参照する。AGENTS.md は実装前に読む durable rule、`docs/butler/pre-development-strategy-contract.md` は詳細契約、validator / CI は欠落を止める機械的な門番にする。適用対象は Issue-backed な実装 PR に限定し、普通の雑談、相談、Read/Think、Issue triage には適用しない。

## 仮説

現在の失敗は、PR body や CI の最終確認が弱いだけではない。AI がコードを書く前に全体を読んで仮説を立てていないことが root blocker である。そのため、`render-pr-body` の既定文が通るだけ、または PR 末尾で項目を埋めるだけでは不十分で、作戦図ファイルそのものを PR evidence として要求する必要がある。

## 検証計画

validator test で、作戦図欄がない PR body、作戦図 evidence path がない PR body、作戦図の値が未確認やなしだけの PR body を失敗させる。逆に、この Issue の作戦図を evidence path として持つ PR body は通ることを確認する。template mode は空欄の雛形を許可し、実 PR mode では許可しない。

## 改修見積もり

- `AGENTS.md`: Drift Stop Protocol 付近に開発前作戦図 Gate を追加し、設計、仮説、検証計画、改修見積もりを実装前必須にする。
- `docs/butler/pre-development-strategy-contract.md`: 新規契約 doc として、作戦図の順序と改修見積もり項目を定義する。
- `docs/development-strategy/issue-703-predev-strategy-guard.md`: この Issue 自体の作戦図 evidence として使う。
- `.github/pull_request_template.md`: `開発前作戦図` セクションに設計、仮説、検証計画、改修見積もり、evidence path を追加する。
- `.github/workflows/guarded-autonomy-required-checks.yml`: required marker に `開発前作戦図` を追加し、CI の入口でも欠落を止める。
- `scripts/render-pr-body.mjs`: `defaultPreDevelopmentStrategy` と出力セクションを追加する。既定文は実 PR mode では validator が拒否する文にする。
- `scripts/validate-pr-body.mjs`: 必須フィールド、placeholder 拒否、evidence path 存在確認、設計/仮説/検証計画/改修見積もりの最低限 semantic check を追加する。
- `scripts/validate-pr-body.mjs`: `作戦図 evidence` の Issue 番号と PR body の Target Issue が一致することも検査する。
- `scripts/run-vps-runner.mjs`: VPS runner の PR body 生成に handoff development strategy を渡し、作戦図なしの正規化が成功しないようにする。
- `test/pr-body-guardrail.test.js`: passable body helper と rejection tests を追加・更新する。

## 既に通っている経路

- AGENTS.md には Drift Stop Protocol と bounded change contract がある。
- PR body には Dry-run Impact Report、File / Line Hypotheses、Hypothesis Retrospective がある。
- `scripts/validate-pr-body.mjs` と guarded workflow は PR body を検査している。
- `scripts/prepare-pr-body-file.mjs` は canonical PR body を作る入口になっている。

## 未確認の境界

- Git の時刻だけでは「本当にコード前に作戦図を書いたか」は証明できない。
- そのため、この PR では「作戦図ファイルを PR evidence として必須化する」までを固定する。
- Dashboard Butler から自然文で作戦図を生成・更新する UI は、この PR では未接続として扱う。
- guarded workflow は `pull_request` で動かし、`pull_request_target` の権限で PR head code を実行しない。完全な trusted-base validator 分離は、この PR では未確認境界として残す。

## 穴が出そうな箇所

- PR body に項目だけ増やしても、具体値が空ならまた形だけになる。
- renderer の既定文がそのまま validator を通ると、AI が具体化しない逃げ道になる。
- CI だけでは遅いので、AGENTS.md と契約 doc に「最初に作る」順序を明記する必要がある。
- `prepare-pr-body-file` が malformed body を正規化するとき、作戦図情報なしで passable body を作ると guardrail が弱くなる。

## PR 前に確認すること

- `.github/pull_request_template.md` が作戦図 evidence と予見項目を要求する。
- `scripts/render-pr-body.mjs` が作戦図欄を出力する。
- `scripts/validate-pr-body.mjs` が作戦図欄、逃げ値、evidence path を拒否できる。
- `scripts/validate-pr-body.mjs` が改修見積もりの file/function/line/feature 境界を要求する。
- guarded workflow が validator を通して同じ制約を CI で実行する。
- tests が passable path と rejection path の両方を持つ。

## 実装候補と捨てた案

- 採用: `docs/development-strategy/issue-*.md` に作戦図を置き、PR body の `開発前作戦図` で evidence path と要約を必須にする。
- 採用: validator は未記入、未確認、なしだけの逃げ値を拒否する。
- 捨てた案: PR body の項目追加だけで済ませる。これは CI 後検査だけになり、ユーザーが指摘した「最初にやらない」問題を止められない。
- 捨てた案: Issue コメントだけに作戦図を置く。repo checkout で検査しづらく、新しいスレッドや runner が見落としやすい。

## merge 後に通す E2E

- `node --test test/pr-body-guardrail.test.js`
- `node scripts/validate-pr-body.mjs --template .github/pull_request_template.md`
- 作戦図欄を欠落させた body が validator で失敗すること。
- 作戦図 evidence path が存在する body が validator を通ること。

## 次の PR を増やさない理由

この PR は runtime の穴埋めではなく、開発開始前の guardrail を対象にする。Issue #703 の範囲では、作戦図契約、template、renderer、validator、workflow、test を同じ PR にまとめることで「また PR body だけ」「また CI だけ」の後続穴を残さない。

## 停止条件

- runtime / Worker / VPS / deploy behavior 変更が必要になった場合は止める。
- 作戦図 evidence を CI で確認できない設計になった場合は止める。
- Issue #637 の未コミット修正を混ぜそうになった場合は止める。
- `prepare-pr-body-file` が作戦図なしで valid body を作れる状態が残る場合は止める。
