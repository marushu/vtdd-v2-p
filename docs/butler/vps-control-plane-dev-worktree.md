# VPS Codex CLI control-plane / development workspace contract

Issue: #806

## 目的

VPS Codex CLI / runner / app-server bridge / recovery / deploy helper を動かす
制御用 checkout は、常に `origin/main` に固定する。開発 branch の dirty
状態、E2E asset、test result、未 push commit は、制御面に混ぜない。

2026-06-05 の Issue #741 復旧では、制御用 checkout が
`issue-590-muted-bridge-lifecycle` の dirty/diverged 状態に残ったため、
`vtdd-vps-runner.timer` が active のままでも queue pickup が止まった。この
契約は、その再発を防ぐ。

## ディレクトリ役割

```text
/home/vtdd-runner/vtdd-runner/repos/vtdd-v2-p
  control-plane checkout
  runner / bridge / recovery / deploy helper の実行面
  常に origin/main

/home/vtdd-runner/vtdd-runner/workspaces/<owner_repo>/<execution-id>
  development workspace
  Codex CLI が branch checkout / 編集 / test / push / PR 作成を行う作業台
  dirty になってよいが、control-plane を止めてはいけない
```

## 守るルール

- control-plane checkout では feature branch を checkout しない。
- control-plane checkout で test / E2E / artifact 生成をしない。
- control-plane checkout が non-main、tracked dirty、unknown untracked、
  ahead/diverged の時は queue pickup を止め、owner-facing blocker として出す。
- development workspace は control-plane checkout 自身またはその配下に作らない。
- development workspace が dirty / unpushed / branch mismatch でも、
  runner / bridge / recovery / deploy helper の制御面は止めない。
- default は単一または execution ごとの isolated workspace とし、並行実行を増やす
  場合は容量上限、TTL、cleanup 方針を別 Issue で明示する。

## 復旧時の読み方

Butler が bridge restart 通知停止や queue pickup 停止を見た場合、まず
`runner stopped` と決めつけない。以下を順番に確認する。

1. `vtdd-vps-runner.timer` / `vtdd-vps-runner.service` の systemd 状態。
2. runner log の `repo sync preflight blocked`。
3. control-plane checkout の branch、HEAD、origin/main、dirty/untracked。
4. development workspace の dirty 状態が control-plane に漏れていないか。
5. Issue comment に `picked_up` / `completed` が戻ったか。

自己修復や emergency reset を行う場合も、control-plane と development
workspace の境界を崩してはいけない。

## Butler Completion 境界

この contract が repository にあるだけでは完了ではない。VPS runner が runtime
truth で control-plane / development workspace の分離を示し、Issue #806 の
テストと mapped evidence が揃うまで incomplete とする。
