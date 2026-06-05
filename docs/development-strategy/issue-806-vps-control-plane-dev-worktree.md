# Issue #806 VPS control-plane main 固定と開発作業台分離 作戦図

## 完了体験

Owner は Butler / VPS Codex CLI を使う時、runner / bridge / recovery / deploy helper の制御用 checkout が常に `origin/main` に固定され、開発 branch の dirty 状態で queue pickup が止まらないことを期待できる。VPS Codex CLI が編集・テスト・push する場所は control-plane checkout ではなく、隔離された dev workspace であると runtime truth / docs / tests で確認できる。

## VTDD 全体で進める部分

Issue #806 は、2026-06-05 の Issue #741 復旧で見つかった control-plane 汚染の再発防止を担当する。外部サイト deploy / backup / rollback と SunabaEye 固有運用は、この基盤が入った後の別 Issue にする。

## 設計

`scripts/run-vps-runner.mjs` はすでに通常 execution を `VTDD_VPS_RUNNER_WORKDIR` 配下へ `gh repo clone` している。したがって新しい巨大な workspace pool を作るのではなく、既存 workRoot を dev workspace として明示し、control-plane repo root と dev workspace が重ならないことを guard する。

control-plane safety preflight は、`repoRoot` が `baseRef` 以外の branch、tracked dirty、unknown untracked、ahead/diverged の時に queue pickup を止める。今回の変更では、この status を `checkoutRole=control_plane` として明示し、原因が「開発作業の失敗」ではなく「制御面の安全停止」であることを runtime truth に出す。

## 仮説

主な変更点は `scripts/run-vps-runner.mjs` と `test/vps-runner-script.test.js` で足りる。既存の workspace clone 実装は残し、`workRoot` が `repoRoot` 自身またはその配下にある時だけ execution を block する。これにより、誤って control-plane checkout 内に clone / test artifact を作り、次回 preflight が止まる事故を防げる。

狭すぎる patch で docs だけにすると、VPS 側の誤設定を防げない。逆に最初から multi-workspace janitor まで作ると scope が広がり、Issue #806 の目的である control-plane 汚染防止から逸れる。

## 検証計画

Unit では、control-plane repo sync status に `checkoutRole=control_plane` が入ること、dev workspace が control-plane 配下なら blocker になること、control-plane とは別の workRoot なら既存 execution clone へ進めることを検証する。

Integration は既存 `runVpsRunnerOnce` fixture を使い、GitHub reads / queue selection / workspace guard の順序を確認する。

E2E はこの PR では local script test を evidence とし、live VPS 変更や deploy は行わない。merge 後の live 適用は別途 passkey approval / deploy 境界に従う。

## 改修見積もり

- `scripts/run-vps-runner.mjs`: control-plane sync status の role 明示、workspace isolation guard、blocked event / failure classification の追加。リスクは既存 runner execution の誤 block。
- `test/vps-runner-script.test.js`: repo sync role と workspace isolation guard の unit/integration test。リスクは fixture が実運用 env とずれること。
- `docs/butler/vps-control-plane-dev-worktree.md`: owner-facing 契約を日本語で明文化。リスクは docs-only completion に見えることなので PR body で code/test evidence と分ける。
- `docs/development-strategy/issue-806-vps-control-plane-dev-worktree.md`: この作戦図。実装の根拠として PR body から参照する。

## 既に通っている経路

通常 VPS runner execution は `workRoot/<repo>/<executionId>` に clone し、そこで branch checkout / Codex / commit / push / PR 作成を行う。control-plane repo sync preflight はすでに non-main / dirty / unknown untracked / ahead/diverged を検出して queue pickup を止める。

## 未確認の境界

VPS production wrapper `/home/vtdd-runner/bin/vtdd-vps-runner-once` は repo 内ファイルではないため、この PR だけでは wrapper の `git checkout main || true` 事故を完全には直せない。PR では runner script 側の guard と docs を入れ、live wrapper 更新は別の passkey/VPS maintenance 境界で扱う。

## 穴が出そうな箇所

`VTDD_VPS_RUNNER_WORKDIR` が control-plane 配下に設定されると、clone や test artifact が repo untracked として残る。既存の known artifact allowlist が広すぎると本当の汚染を見逃す。post-merge verification の `collectVpsMainSyncStatus` は checkout/pull を実行するため、dirty 状態では失敗しうる。

## PR 前に確認すること

Issue #806 body、既存 runner tests、`npm test` または focused `node --test test/vps-runner-script.test.js`、変更が `src/worker` / generated `worker.js` を触らないことを確認する。

## 実装候補と捨てた案

採用: 既存 workRoot clone を dev workspace として扱い、control-plane と重ならない guard を追加する。

捨てた案: Issue ごとに永続 full clone を作る。ディスク圧迫と cleanup failure のリスクが高い。

捨てた案: recovery helper を先に作る。今回の根本は control-plane 汚染防止なので順序が逆。

## merge 後に通す E2E

VPS に deploy された後、runner の control-plane checkout が `main@origin/main` で、`VTDD_VPS_RUNNER_WORKDIR` が control-plane 外であること、queue pickup が通常通り進むことを Issue #806 evidence に残す。

## 次の PR を増やさない理由

Issue #806 の最小 slice は runner script guard、tests、docs で一つの契約として成立する。外部 deploy / rollback と workspace janitor は別目的なのでこの PR に混ぜない。

## 停止条件

既存 runner が already isolated であり code change が不要と判明した場合は docs/test-only に縮小する。production wrapper 更新、VPS file mutation、deploy、credential/SSH 設定変更が必要になった場合はこの PR では止め、passkey approval が必要な別手順に分ける。
