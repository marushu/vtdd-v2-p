## This PR satisfies Intent

- Issue #806 の「VPS Codex CLI の制御用 checkout は常に main に置き、開発作業は隔離された作業台で行う」方針を repo-backed contract と runner guard にします。
- 既存 VPS runner は `VTDD_VPS_RUNNER_WORKDIR` 配下へ execution clone を作る設計なので、その経路を正式な dev workspace として扱い、control-plane checkout と重なる設定を runtime で block します。
- 2026-06-05 の Issue #741 復旧で見えた「VPS 上の制御用 repo が作業 branch / dirty 状態に寄って Butler 復旧が不安定になる」事故の再発防止を狙います。

## Satisfied Success Criteria

- control-plane checkout status に `checkoutRole=control_plane` と main 固定 invariant を出します。
- VPS runner execution workspace が control-plane repo 自身または配下にある場合、execution 開始前に `workspace_isolation_blocked` として止めます。
- 通常の dev workspace は `workRoot/<repository>/<executionId>` として control-plane 外に作られることを unit / integration test で固定します。
- Owner-facing の運用契約を `docs/butler/vps-control-plane-dev-worktree.md` に日本語で保存しました。

## Unsatisfied Success Criteria

- production VPS wrapper `/home/vtdd-runner/bin/vtdd-vps-runner-once` の実体確認・更新はこの PR では行っていません。
- merge 後の live VPS 適用、app-server bridge restart、VPS runtime truth 取得はこの PR では未実施です。
- workspace cleanup / janitor、複数並行 worktree の retention policy、外部サーバ deploy / backup / rollback は別 Issue 範囲です。

## Non-goal violations

None.

## 開発前作戦図

- 作戦図 evidence: docs/development-strategy/issue-806-vps-control-plane-dev-worktree.md
- 完了体験: Owner は Dashboard Butler / VPS Codex CLI の runner / bridge / recovery / deploy helper が読む制御用 checkout は `origin/main` に固定され、開発 branch の dirty 状態で queue pickup が止まらないと確認できる。
- VTDD 全体で進める部分: Issue #741 復旧で見つかった control-plane 汚染を Issue #806 の root slice として止める。SunabaEye 前段や外部サーバ deploy は後続。
- 設計: Butler の復旧 surface を守るため、既存の `VTDD_VPS_RUNNER_WORKDIR` clone 経路を dev workspace として明示し、control-plane repo root と dev workspace が重なる設定を block する。
- 仮説: 仮説として、既存 runner は execution clone を分離しているが、workRoot 誤設定や wrapper 側の checkout 運用で control-plane repo 汚染が起こりうる。
- 検証計画: repo sync role、workspace isolation resolver、runVpsRunnerOnce の blocked event を unit / integration test で検証する。
- 改修見積もり: `scripts/run-vps-runner.mjs` の workspace guard、`test/vps-runner-script.test.js` の focused tests、`docs/butler/vps-control-plane-dev-worktree.md` の契約文書。
- 既に通っている経路: runner execution は workRoot 配下へ clone し、branch checkout / Codex / commit / push / PR 作成を行う。
- 未確認の境界: VPS production wrapper は repo 外なので、この PR では passkey が必要な live mutation をしない。
- 穴が出そうな箇所: `VTDD_VPS_RUNNER_WORKDIR` が control-plane 配下なら clone/test artifact が repo untracked として残る。
- PR 前に確認すること: Issue #806 を読み、runner tests、full `npm test`、worker generated file 不要を確認する。
- 実装候補と捨てた案: 採用は既存 workRoot clone の guard。永続 full clone pool と recovery helper 先行は scope が広がるため不採用。
- merge 後に通す E2E: live VPS で control-plane checkout が main clean、workRoot が control-plane 外、queue pickup が通常通り進むことを runtime truth と E2E 検証に残す。
- 次の PR を増やさない理由: この PR の範囲は runner guard / tests / docs で閉じ、予測できる不足は janitor と外部 deploy の後続 Issue として残すため、同じ scope の次 PR は増やさない。
- 停止条件: production wrapper 更新、VPS file mutation、deploy、credential/SSH 設定変更が必要な場合は passkey 境界に分ける。

## Dry-run Impact Report

- Target Issue: Issue #806。
- Implementing Success Criteria: VPS runner の control-plane checkout main 固定を runtime truth と workspace isolation guard で支える。
- Explicit Non-goals: VPS live mutation、deploy、app-server bridge restart、workspace janitor、外部サーバ deploy / backup / rollback、SSH credential 設定。
- Expected touched files/routes/workflows: `scripts/run-vps-runner.mjs`, `test/vps-runner-script.test.js`, `docs/butler/vps-control-plane-dev-worktree.md`, `docs/development-strategy/issue-806-vps-control-plane-dev-worktree.md`。
- Affected Issues: Issue #806。関連文脈は Issue #741 / Issue #590 / Issue #637 だが、この PR はそれらを close しません。
- Affected PRs: 新規 PR。既存 merged PR には push していません。
- Affected workflows: GitHub Actions workflow 定義は未変更。
- Affected runtime/operator surfaces: VPS runner queue pickup、runner progress event、Butler が読む VPS control-plane contract。
- What may break if we patch narrowly: docs だけでは VPS 誤設定を防げず、guard だけでは owner/Butler が main 固定方針を再利用できない。
- Unknowns to investigate before coding: production wrapper の `VTDD_VPS_RUNNER_WORKDIR` 実値と repo 外 script 内容は未確認。
- Validation needed: focused runner tests、full runner script test、full `npm test`、`git diff --check`。
- Stop condition: live VPS mutation や credential/permission 変更が必要になったら、この PR では停止。

## Execution Queue Delta

- Queue position before: docs queue の `Now` は Issue #590 系だったが、owner の「VPS Codex CLI は常に main であるべき」という指摘は Issue #741 復旧と Issue #590 / Issue #637 の Butler 復旧経路を塞ぐ ROOT blocker と判断しました。
- Preemption decision: ROOT。control-plane checkout が作業 branch / dirty に寄ると、Butler だけで復旧する前提が崩れるため、通常 queue より先に最小 slice として Issue #806 を作成しました。
- Queue delta: Issue #806 をこの PR の `Now` に移します。Issue #590 / Issue #637 / Issue #741 は縮小しません。control-plane 汚染防止後に継続します。
- Why this PR is next: 制御用 repo が main clean でないと、bridge restart / recovery / runner pickup の信頼性が落ち、owner が Mac Codex に戻されます。
- Active Issues not downscoped: Active Issues は縮小しません。この PR で扱わない active Issue は未完了のまま残します。

## File / Line Hypotheses

- file: `scripts/run-vps-runner.mjs`
  - hypothesis: execution clone は分離済みだが、workRoot が control-plane repo と重なる設定を runtime が明示 block していない。
  - risk if changed narrowly: preflight が止まった時に「制御面の汚染」か「開発作業失敗」か Butler が区別できない。
  - validation: workspace resolver unit test と `runVpsRunnerOnce` blocked event integration test。
  - related Issue: #806。
- file: `test/vps-runner-script.test.js`
  - hypothesis: control-plane role と workspace isolation の regression test がなかった。
  - risk if changed narrowly: 将来の runner 変更で control-plane 配下 workRoot を許しても検出できない。
  - validation: focused runner tests と full runner script test。
  - related Issue: #806。
- file: `docs/butler/vps-control-plane-dev-worktree.md`
  - hypothesis: 会話で決まった main 固定方針を repo-backed にしないと、次の thread / Butler / VPS handoff で消える。
  - risk if changed narrowly: 実装だけ残って運用判断が再び Mac Codex 依存になる。
  - validation: PR body から strategy / contract を参照。
  - related Issue: #806。

## Hypothesis Retrospective

- expected: 既存 runner は workRoot clone を使っており、最小修正は workspace isolation guard と docs/tests で足りる。
- actual: `resolveVpsRunnerExecutionWorkspace()` を追加し、control-plane 配下 workRoot を execution 前に block できた。
- mismatch: production wrapper の live 実値は未確認。merge 後の passkey 境界で確認が必要。
- lesson: Butler / VPS の制御面は、開発対象 repo と同じ checkout を作業台にしてはいけない。
- should become RAG candidate: はい。#806 の main 固定 / dev workspace 分離契約として working_memory 候補。

## Verification Evidence

- Unit: `node --test --test-name-pattern 'repo sync preflight|execution workspace|workRoot is inside|dry run reports selected' test/vps-runner-script.test.js` passed。
- Integration: `node --test test/vps-runner-script.test.js` passed。
- Full: `npm test` passed。
- Static: `git diff --check` passed。
- E2E: live VPS E2E は未実施。merge/deploy/passkey 境界の後続です。
- Evidence path/link: `docs/development-strategy/issue-806-vps-control-plane-dev-worktree.md`, `docs/butler/vps-control-plane-dev-worktree.md`, `test/vps-runner-script.test.js`

## Butler Completion Contract

- Primary owner surface: Dashboard Butler。
- Fallback surface: mac Codex は emergency / debug surface であり、通常運用の前提にはしない。
- Owner goal: Butler / VPS Codex CLI の制御用 checkout を常に main clean に保ち、開発作業の branch / dirty 状態から切り離す。
- Butler entrypoint: Dashboard Butler の通常チャット入口から VPS runner / recovery / bridge restart の runtime truth を読む経路。
- Dashboard Butler natural-language path: Owner が Dashboard Butler の通常チャット入口で「VPS が詰まっている」「bridge を復旧して」などの自然文を送ると、Butler は control-plane status と workspace isolation truth へ到達して判断できる。
- Action Schema exposure: この PR では未変更。
- Runtime path: VPS runner script の queue pickup 前後、workspace resolution、progress event。
- Runner/runtime truth: `checkoutRole=control_plane` と `workspace_isolation_blocked` を runner truth として出す。
- Authority boundary: live VPS mutation / deploy / restart / credential / permission は未実行。後続は scoped passkey approval が必要。
- E2E evidence: local runner tests は通過。live VPS E2E は未実施のため Butler 完了は incomplete。
- Completion status: incomplete

## Surface Update Checklist

- Cloudflare deploy: 不要。この PR では worker/runtime を変更していません。
- Custom GPT Action Schema update: 不要。
- Custom GPT Instructions update: 不要。
- iPhone Butler live E2E: merge 後に VPS runtime truth と通知で確認が必要。

## Related Constitution Rules

- Butler Completion Gate。
- Butler-First Operating Principle。
- Thread-Independent Startup Contract。
- Drift Stop Protocol。
- High-risk actions require scoped passkey approval。

## Out-of-scope but NOT implemented

- production VPS wrapper の直接編集。
- app-server bridge restart。
- workspace janitor / cleanup scheduler。
- GitHub branch cleanup policy。
- SunabaEye の外部サーバ deploy / backup / rollback。
- `~/.ssh/config` や deploy credential の設計・投入。

## Extra changes (if any)

None.

<!-- VTDD metadata -->
- Issue: Issue #806
- Execution ID: local-codex-issue-806-control-plane-dev-worktree-20260605
- Goal: VPS Codex CLI の制御用 checkout を main 固定にし、開発作業台を分離する。
