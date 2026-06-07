## This PR satisfies Intent

Issue #741 の follow-up として、VPS privileged maintenance helper execution を GitHub Issue コメント queue に溜め続ける旧経路を止めます。

この PR は pagination 修正ではありません。Issue コメント transport を延命せず、Dashboard Butler / passkey operator continuation は `vps_local_helper_queue_unavailable` として blocked を返し、GitHub Issue comment を作らず、root/helper execution を開始しません。

## Satisfied Success Criteria

- [x] Dashboard Butler / passkey operator continuation が VPS helper execution queue として GitHub Issue コメントを作らない。
- [x] valid helper execution envelope でも、VPS local queue/state/log transport が未接続なら owner-facing に `blocked` を返す。
- [x] blocked runtime truth に `queueCommentPosted=false`, `rootExecutionStarted=false`, `helperExecutionStarted=false`, `disabledTransport=github_issue_comment_queue`, `requiredTransport=vps_local_helper_queue` を残す。
- [x] passkey operator は queued 以外を `unknown` にせず、blocked reason と next action を表示する。
- [x] low-risk read/status も Issue コメント queue へ流さない。

## Unsatisfied Success Criteria

- VPS local queue/state/log writer / consumer はこの PR では未接続。
- bridge restart の live 実行、before/after truth、watchdog timer install/enable は未実施。
- 既存 Issue #741 に溜まった過去 queue コメントの cleanup は未実施。
- Issue #741 close は未実施。

## Non-goal violations

None.

## 開発前作戦図

- 作戦図 evidence: `docs/development-strategy/issue-741-stop-issue-comment-helper-queue.md`
- 完了体験: Issue コメントに実行依頼 JSON が溜まり続けず、未接続なら Dashboard Butler / operator に blocked reason が返る。
- VTDD 全体で進める部分: Issue #741 / #637 / #413 / #450 を横断する Issue comment helper queue defect を止める。
- 設計: `helper-execution-queues` は Issue comment を書かず、`vps_local_helper_queue_unavailable` blocked を返す。local queue 未接続の blocked は Worker 側 owner-facing reply として残す。
- 仮説: 原因は pagination ではなく GitHub Issue comment transport 自体である、という仮説で実装前に検証する。
- 検証計画: worker unit、vps-runner script unit、generated worker、full `npm test`。
- 改修見積もり: `src/worker/runtime.js`, `src/core/passkey-operator-page.js`, `test/worker.test.js`, `test/active-issue-execution-queue.test.js`, `docs/mvp/active-issue-execution-queue.md`, `worker.js`。
- 既に通っている経路: proposal / passkey operator URL / helper envelope generation。
- 未確認の境界: VPS local queue format, retention, consumer service。
- 穴が出そうな箇所: blocked flow が app-server bridge に流れる、low-risk read が旧 queue に残る、operator が unknown に戻る。
- PR 前に確認すること: GitHub Issue comment create が呼ばれないこと、runtime truth が blocked を示すこと、root/helper execution が開始しないこと。
- 実装候補と捨てた案: pagination 修正は旧 transport 延命なので不採用。
- merge 後に通す E2E: E2E evidence として passkey operator live continuation を実行し、Issue コメントが増えず blocked reason が表示されることを確認する。
- 次の PR を増やさない理由: これは safety slice。VPS local queue の full implementation は別 PR で authority / retention / E2E を扱う。
- 停止条件: deploy、credential mutation、permission mutation、root/sudo、VPS systemd install/enable が必要になる場合。

## Dry-run Impact Report

- Target Issue: #741
- Implementing Success Criteria: Issue comment helper queue を止め、未接続を明示 blocked にする。
- Explicit Non-goals: pagination 修正、VPS live mutation、deploy、credential/permission mutation、Issue close。
- Expected touched files/routes/workflows: Worker Dashboard chat route、VPS helper queue route、passkey operator page、queue docs/tests、generated worker。
- Affected Issues: #741, #637, #413, #450
- Affected PRs: follow-up to PR #823, PR #824, PR #825
- Affected workflows: deploy 後 bridge helper continuation は local queue 未接続として blocked になる。
- Affected runtime/operator surfaces: Dashboard Butler、passkey operator、VPS privileged maintenance helper queue route。
- What may break if we patch narrowly: bridge restart の実行能力は一時的に blocked になる。ただし Issue コメント蓄積と silent drop を止めるため意図した挙動。
- Unknowns to investigate before coding: VPS local queue/state/log transport の実装詳細。
- Validation needed: `node --test test/worker.test.js`; `node --test test/vps-runner-script.test.js`; `npm run build:worker`; `npm test`
- Stop condition: Issue comment transport の延命が必要になる場合。

## Execution Queue Delta

- Queue position before: Issue #816 was `Now` for Dashboard Butler follow-up queue media/UI.
- Preemption decision: ROOT。Issue #741 の helper queue defect は Issue #637 privileged maintenance、Issue #413 runtime truth、Issue #450 app-server path を横断して壊すため preempt する。
- Queue delta: Issue #741 moves to `Now` for this safety slice. Issue #816 moves to `Next` and remains active.
- Why this PR is next: pagination 修正で旧 Issue comment transport を延命すると、コメント蓄積と silent pickup gap が残るため。
- Active Issues not downscoped: Active Issues are not downscoped. #816 / #814 / #811 / #637 remain active and incomplete.

## File / Line Hypotheses

- file: `src/worker/runtime.js`
  - hypothesis: `createVpsPrivilegedMaintenanceHelperExecutionQueue` が valid envelope を GitHub Issue comment create に変換しているため、queue が溜まり続ける。
  - risk if changed narrowly: blocked flow が Dashboard Butler から消えると operator が `unknown` に戻る。
  - validation: worker tests。
  - related Issue: #741
- file: `src/core/passkey-operator-page.js`
  - hypothesis: queued 以外の continuation response を `unknown` 扱いしている。
  - risk if changed narrowly: owner が blocker reason を読めない。
  - validation: worker operator page tests。
  - related Issue: #741

## Hypothesis Retrospective

- expected: Issue comment queue write を止めても Dashboard Butler / operator には blocked reason が残る。
- actual: worker tests confirmed helper continuation, low-risk read/status, and DashboardChatRoom VPS maintenance flows return blocked without GitHub comment creation.
- mismatch: low-risk blocked flow initially fell through to app-server bridge; `shouldDashboardVpsMaintenanceFlowStayInWorker` was updated to keep local queue unavailable blockers in Worker.
- lesson: Issue comment transport blockers must remain visible in the owner surface; otherwise the system silently falls back to the wrong path.
- should become RAG candidate: VPS helper execution queue must not use GitHub Issue comments; use bounded VPS-local queue/state/log and report only result/postmortem to Dashboard/GitHub.

## Verification Evidence

- Unit: `node --test test/worker.test.js` passed: 292 tests pass.
- Unit: `node --test test/vps-runner-script.test.js` passed: 79 tests pass.
- Build: `npm run build:worker` passed.
- Integration: `npm test` passed: 1243 tests, 1242 pass, 1 skipped; self-parity passed; generated-worker check passed.
- E2E: 未実施。merge/deploy 後に passkey operator continuation が Issue コメントを増やさず blocked reason を表示する live check が必要。
- Evidence path/link: `docs/development-strategy/issue-741-stop-issue-comment-helper-queue.md`

## Butler Completion Contract

- Primary owner surface: Dashboard Butler。
- Fallback surface: Custom GPT は明示された fallback surface として扱います。
- Owner goal: Issue コメントに VPS helper execution request を溜め続けない。
- Butler entrypoint: `/v2/dashboard/chat/messages`
- Dashboard Butler natural-language path: Dashboard Butler chat entrypoint `/v2/dashboard/chat/messages` で natural-language maintenance intent / passkey continuation は blocked reason を返す。
- Action Schema exposure: 変更なし。
- Runtime path: Worker route は Issue comment queue write を停止し、local queue 未接続を blocked として返す。
- Runner/runtime truth: `queueCommentPosted=false`, `rootExecutionStarted=false`, `helperExecutionStarted=false`。
- Authority boundary: deploy / credential / permission / VPS systemd / root execution は未実施。
- E2E evidence: 未実施。
- Completion status: incomplete

## Surface Update Checklist

- Cloudflare deploy: merge 後に別途必要。
- Custom GPT Action Schema update: 不要。
- Custom GPT Instructions update: 不要。
- iPhone Butler live E2E: 未実施。

## Related Constitution Rules

- AGENTS.md Butler Completion Gate
- AGENTS.md Butler-First Operating Principle
- AGENTS.md Chief Butler Operating Principle
- AGENTS.md Authority Boundary
- AGENTS.md Evidence Discipline
- docs/butler/execution-queue-contract.md

## Out-of-scope but NOT implemented

- VPS local helper queue/state/log writer
- VPS local queue consumer service
- bridge restart execution
- watchdog timer live install/enable
- existing Issue comment cleanup
- Issue #741 close

## Extra changes (if any)

None.
