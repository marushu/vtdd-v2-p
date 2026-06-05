# Issue #595: active queue refresh 2026-06-05

## 完了体験

Dashboard Butler が「VTDD の続きを順番に進めて」と言われた時、古い 2026-06-02 queue ではなく、PR #792 merge 後と Issue #793 作成後の durable queue を読んで次の一手を判断できる。

## VTDD 全体で進める部分

Issue #595 の execution queue contract を、直近の runtime truth に追従させる。これは実装機能ではなく交通整理の durable snapshot 更新であり、Issue #590 / Issue #637 / Issue #613 / Issue #793 の完了を主張しない。

## 設計

`docs/mvp/active-issue-execution-queue.md` に 2026-06-05 の GitHub truth を反映する。open PR が 0 件であること、latest main が PR #792 merge commit であること、Issue #590 が引き続き close-ready でないこと、Issue #637 が Next として残ること、Issue #793 は deploy notification driven stale-client refresh の Queue item であり #723 follow-up であることを記録する。

## 仮説

現 queue は 2026-06-02 rebuilt のままで、PR #774 以降の #590 live progress / #455 app-server復旧 / #613 single main thread / #793 新規 Issue を反映していない。ここを更新せずに次の実装へ進むと、owner の「順番に」という指示を古い `Now` / `Next` で解釈し、#793 を誤って preempt したり、PR #792 の production E2E gap を見落とす。

## 検証計画

- Unit: `node --test test/active-issue-execution-queue.test.js`
- Guard: `git diff --check`
- Read evidence: `gh pr list` で open PR 0、`gh pr view 792`、`gh issue view 590`、`gh issue view 637`、`gh issue view 793` を確認済みとして PR body に記録する。

## 改修見積もり

- `docs/development-strategy/issue-595-active-queue-refresh-2026-06-05.md`: この作戦図。リスクは chat-only 判断を durable 化しすぎること。
- `docs/mvp/active-issue-execution-queue.md`: runtime truth snapshot、Now/Next/Queue/Evidence Gaps を更新する。リスクは active Issue を縮小したように読ませること。

## 既に通っている経路

Issue #595 の contract、PR body guardrail、active queue document は既に repo-backed である。PR #792 は merged、open PR は 0 件、main は `origin/main` と一致している。

## 未確認の境界

Production deploy / PWA live E2E / bridge restart truth はこの queue refresh では実行しない。Issue #793 の実装順序は #590/#637/#613 の残 blocker と照合して後続で決める。

## 穴が出そうな箇所

Issue #793 は owner の直近合意だが、EMERGENCY ではない。Queue に入れ、#590 / #637 / #613 の root blocker を勝手に下げない。PR #792 は merged だが production PWA E2E が未実施なので #613 completion ではない。

## PR 前に確認すること

open PR 0、branch が topic branch、`docs/mvp/active-issue-execution-queue.md` の tests が更新後も通ること、未追跡 `.tmp/` / `test-results/` を stage しないこと。

## 実装候補と捨てた案

採用: queue snapshot の狭い更新。

捨てた案: すぐ #793 の runtime 実装に入る。理由は current Now / Next が未更新で、#793 は follow-up Queue item であり preemption 根拠がないため。

捨てた案: Issue #590 を完了扱いにして #637 へ移る。理由は production E2E failure / request stall recovery deploy evidence / live progress UX がまだ incomplete のため。

## merge 後に通す E2E

この PR 自体は docs/traffic-control refresh なので production E2E は対象外。merge 後は queue に従い、Issue #590 の post-PR #791 production recovery evidence または Issue #637 の next low-risk / restart capability slice へ進む。

## 次の PR を増やさない理由

owner の「順番に進めて」に対する最初の必要作業は queue truth の更新であり、ここを単独 PR にすることで後続実装 PR が古い queue を根拠にしない。

## 停止条件

active Issue の scope conflict、open PR の発見、production deploy / credential / permission / root helper mutation が必要になる場合は停止する。
