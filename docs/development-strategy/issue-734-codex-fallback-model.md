# Issue #734 Codex fallback reviewer model selection

## 完了体験

Owner が Dashboard Butler で PR 状態を見た時、Gemini unavailable でも Codex fallback reviewer が unsupported model で止まらず、Butler-facing reviewer truth として completed または具体的 blocked marker を読める。

## VTDD 全体で進める部分

Dashboard Butler が読む PR reviewer truth と no-manual Codex fallback reviewer 起動経路を進める。

## 設計

completion design は fallback script 側で `CODEX_FALLBACK_REVIEW_MODEL` を読み、未指定なら `gpt-5.4-mini` を使う。scope は reviewer fallback 起動だけ、authority boundary は merge / deploy / secret mutation / live rerun なし、owner-facing surface は Butler の reviewer truth summary。

`.github/workflows/codex-pr-review-fallback.yml` に `vars.CODEX_FALLBACK_REVIEW_MODEL` を渡す変更も候補だったが、GitHub が workflow scope のない push を拒否したため、この PR では script default のみに縮小する。

## 仮説

suspected cause は repo 直書きではなく Codex CLI default model selection が `gpt-5.3-codex` に流れ、ChatGPT account で unsupported 400 を返すこと。prediction は `--model gpt-5.4-mini` 明示でこの blocker が消えること。

## 検証計画

unit test と workflow text test で `--model` 明示、`openai_model_unsupported` 分類、既存 workflow contract を確認する。mapped E2E は merge 後の E2E-27 no-manual Codex reviewer fallback live workflow run。

## 改修見積もり

- `scripts/run-codex-pr-review-fallback.mjs`: `--model` args と blocker 分類。
- `test/codex-review-fallback.test.js`: model 明示 contract test。
- `docs/development-strategy/issue-734-codex-fallback-model.md`: authority boundary と workflow-scope rejection を記録。

## 既に通っている経路

GitHub App token mint、PR diff/context 取得、fallback marker 投稿は既存テストで通っている。

## 未確認の境界

`gpt-5.4-mini` が production runner 上の account / plan / weekly limit で使えるか。

## 穴が出そうな箇所

model 明示だけでは quota / auth / weekly usage limit は解決しない。workflow variable 化は current token では workflow scope がなく push できない。

## PR 前に確認すること

PR #734 failure comments、local Codex model cache、fallback script、workflow、tests を確認する。

## 実装候補と捨てた案

`~/.codex/config.toml` を直す案は runner ごとの差異が出るため捨て、repo-backed script で明示する。workflow env 追加は権限境界で止まったため、この PR からは外す。

## merge 後に通す E2E

E2E-27 no-manual Codex reviewer fallback として GitHub Actions fallback workflow を起動し、`gpt-5.3-codex` unsupported failure が消えることを確認する。

## 次の PR を増やさない理由

script args と test は同じ failure mode の最小修正であり、workflow scope がない現在の権限で進められる最大の repo-backed 修正だから。

## 停止条件

`gpt-5.4-mini` も unsupported なら auth/account model issue として別 slice に切る。
