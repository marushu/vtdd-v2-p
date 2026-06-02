# Issue #745 reviewer fallback model 設定修正 作戦図

## 完了体験

Gemini reviewer が一時利用不可でも、codex-fallback reviewer が ChatGPT account 非対応 model を呼び続けず、PR に完了 reviewer evidence か明確な non-retryable blocker を返す。owner は PR の reviewer 状態を見て、無駄な retry と Codex usage 消費が起きていないことを判断できる。

## VTDD 全体で進める部分

PR review gate の土台を直す。Dashboard Butler の UI polish ではなく、merge 前の reviewer evidence が毎回壊れる blocker を潰す。

## 設計

`scripts/run-codex-pr-review-fallback.mjs` の既存 fallback reviewer 専用 model resolver を土台にする。fresh `origin/main` では `codex exec --model gpt-5.4-mini` が既に入っているため、この PR では workflow env propagation と unsupported model error の分類を強化する。`gpt-5.3-codex` unsupported error は ChatGPT account 非対応 model として分類し、無駄な retry を止める。

`.github/workflows/codex-pr-review-fallback.yml` で repository variable `CODEX_FALLBACK_REVIEW_MODEL` を script へ渡す案はあるが、workflow mutation は現在の GitHub credential scope では push できない。今回の PR では workflow file を変更せず、script 側の既存 default model と unsupported classifier を固める。VPS runner が古い checkout / 古い script を掴む問題は Issue #741 の lifecycle / stale checkout blocker として扱う。

## 仮説

PR #743 の failure log では `codex exec --skip-git-repo-check --ephemeral -` が model を指定していない。fresh `origin/main` の script には `--model gpt-5.4-mini` があるため、VPS fallback runner が stale checkout / stale script を掴んだ可能性が高い。今回の credential では workflow file を push できないため、まず unsupported model error を具体 blocker として記録する部分を固める。

## 検証計画

- `test/codex-review-fallback.test.js` に script-level assertions を追加し、`--model` と `CODEX_FALLBACK_REVIEW_MODEL`、unsupported model classifier を確認する。
- 必要なら `test/gemini-pr-review-workflow.test.js` に workflow env propagation を追加する。
- `node --test test/codex-review-fallback.test.js test/gemini-pr-review-workflow.test.js`
- `git diff --check`

## 改修見積もり

- `scripts/run-codex-pr-review-fallback.mjs`: 既存 model resolver / `codex exec --model` を維持し、unsupported model failure classification を具体化する。
- `.github/workflows/codex-pr-review-fallback.yml`: 今回は変更しない。workflow env propagation は `workflow` scope 不足で blocked として残す。
- `test/codex-review-fallback.test.js`: script text または exported helper の regression test を追加する。
- `test/gemini-pr-review-workflow.test.js`: 既存 workflow regression が壊れていないことを確認する。

## 既に通っている経路

fallback reviewer marker comment の requested / completed / blocked 表現、GitHub App token mint、PR context/diff builder、fallback workflow の基本 shape は既存 test がある。

## 未確認の境界

`gpt-5.4-mini` が当該 owner account の Codex CLI で必ず使えるかは、実 runner の runtime truth で確認が必要。OpenAI 公式 docs では API model と ChatGPT account の Codex CLI 利用可否は同一ではないため、実エラーを authority とする。

## 穴が出そうな箇所

- `--model` を入れても Codex CLI の account 側で別 model が unsupported になる可能性。
- API key login path と ChatGPT account path の違い。
- reviewer fallback workflow が pass しても、comment 上は blocked のままという現在の policy gap。
- model 名を code 固定しすぎると将来また同じ drift が起きる。

## PR 前に確認すること

Issue #745、PR #743 の blocked reviewer comment、Codex CLI `exec --help` の `--model` option、公式 docs の model / ChatGPT plan 記述、既存 fallback tests。

## 実装候補と捨てた案

- 採用: env-configurable `--model` と unsupported model classifier。
- 捨てた案: `gpt-5.3-codex` を使えるよう credential / account を変える。これは credential / billing / account boundary に触れるため、この PR では扱わない。
- 捨てた案: reviewer fallback を無視して PR #743 を merge する。Reviewer as Stop Role に反する。

## merge 後に通す E2E

E2E-745 codex fallback reviewer model。PR #743 相当の head SHA で fallback reviewer を再実行し、`gpt-5.3-codex` unsupported ではなく completed reviewer evidence または別の明示 blocker comment が出ることを確認する。

## 次の PR を増やさない理由

この PR は reviewer fallback model selection と unsupported classifier に絞る。実 runner rerun / PR #743 merge は別 authority boundary を持つため、この PR には混ぜない。

## 停止条件

OpenAI credential / account / billing 変更、GitHub secret / variable mutation、workflow dispatch、reviewer rerun、merge、deploy が必要になった場合は停止し、GO または passkey approval を求める。
