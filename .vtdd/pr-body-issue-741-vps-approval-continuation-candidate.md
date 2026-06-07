## This PR satisfies Intent

Issue #741 の passkey 承認後 VPS helper queue continuation が `unknown` で止まる blocker を直します。owner が VPS runner admin operator で承認したあと、Worker は `approvalGrantId` と `vpsProposalId` を根拠に continuation intent として扱い、queue handoff へ進めます。queue handoff が blocked の場合も、operator に `unknown` ではなく blocked reason / runtime truth を返します。

## Satisfied Success Criteria

- [x] passkey 承認後 continuation payload が本文の自然文検出に依存せず VPS maintenance flow に入る。
- [x] queue handoff が blocked の場合でも `execution.status=blocked` と原因が response に残る。
- [x] ordinary Dashboard Butler chat は approval/proposal ID が無ければ従来通り helper queue に入らない。
- [x] continuation context は stored proposal の repository / Issue / dashboardThreadId と一致しない場合に拒否される。

## Unsatisfied Success Criteria

- VPS live systemd timer install / enable はこのPRでは未実施です。
- bridge restart / heartbeat / watchdog self-heal の live E2E はこのPRでは未実施です。
- VPS privileged helper sudoers 実行可能性は未確認/blocked のままです。

## Non-goal violations

None.

## 開発前作戦図

- 作戦図 evidence: `docs/development-strategy/issue-741-vps-approval-continuation.md`
- 完了体験: Owner / Dashboard Butler が passkey 承認後に `unknown` ではなく queue 成功または明示的 blocked reason を読める。
- VTDD 全体で進める部分: Issue #741 の live bridge recovery 検証前に、承認後 continuation routing を修復する。
- 設計: Dashboard Butler 経路の境界として、`vpsProposalId` と `approvalGrantId` に加えて repository / Issue / dashboardThreadId を stored proposal と照合してから approval continuation intent として扱う。
- 仮説: 画像の `unknown` の原因は、HTTP 202 だが `execution` が `null` だったため発生した。
- 検証計画: Worker unit regression、generated worker check、full `npm test`。
- 改修見積もり: `src/worker/runtime.js` の intent 判定・context 照合・blocked visibility、`test/worker.test.js` の regression、`worker.js` generated bundle。
- 既に通っている経路: proposal 作成と operator URL 発行は live で成功済み。
- 未確認の境界: VPS helper sudoers、timer install、live restart E2E。
- 穴が出そうな箇所: blocked execution を広く返しすぎると app-server pass-through を壊すため、approval continuation に限定。
- PR 前に確認すること: #824 merged 後の fresh branch であること、owner-specific secret を追加しないこと。
- 実装候補と捨てた案: 固定文言追加ではなく ID payload を authoritative intent にする。mac Codex 直接 restart で終わらせる案は捨てた。
- merge 後に通す E2E: live E2E として operator を再発行し、queue success または明示 blocked reason を検証する。
- 次の PR を増やさない理由: routing と error visibility は同一 blocker で分割すると `unknown` が残る。
- 停止条件: live VPS systemd 変更は passkey approval なしでは実行しない。

## Dry-run Impact Report

- Target Issue: #741
- Implementing Success Criteria: passkey approval continuation routing / blocked reason visibility
- Explicit Non-goals: deploy、credential mutation、permission mutation、VPS systemd timer install、live restart 実行
- Expected touched files/routes/workflows: `/v2/dashboard/chat/messages` Worker runtime、Worker unit tests、generated `worker.js`
- Affected Issues: #741
- Affected PRs: follow-up to merged PR #824
- Affected workflows: guarded checks / worker tests
- Affected runtime/operator surfaces: passkey operator の VPS helper queue auto-continue response
- What may break if we patch narrowly: continuation text が変わると再発するため、本文ではなく IDs と stored proposal context を intent 根拠にした。
- Unknowns to investigate before coding: live approvalGrantId は operator page 内で作られるため、今回の failed grant は mac Codex から取得できない。
- Validation needed: `node --test test/worker.test.js`; `npm run build:worker`; `npm test`
- Stop condition: helper scope validation や GitHub queue comment 作成権限が欠ける場合は blocked reason を返すところまで。

## Execution Queue Delta

- Queue position before: Issue #741 post-merge live verification blocker
- Preemption decision: EVIDENCE/EMERGENCY follow-up。passkey operator が owner-facing に失敗しており、live verification の前提を壊しているため先に修正。
- Queue delta: Issue #741 continuation blocker を新規 follow-up PR で処理。active queue の他 Issue は置換しない。
- Why this PR is next: bridge restart/watchdog verificationは承認後 continuation が動かないと Butler-first path で進められない。
- Active Issues not downscoped: Active Issues are not downscoped; this PR is a bounded #741 blocker fix only.

## File / Line Hypotheses

- file: `src/worker/runtime.js`
  - hypothesis: `approvalGrantId` / `vpsProposalId` 付き payload が自然文検出に依存して普通 chat へ落ちる。
  - risk if changed narrowly: `blocked` を広く返すと app-server pass-through の既存挙動を壊す。
  - validation: Worker regression tests。
  - related Issue: #741

## Hypothesis Retrospective

- expected: ID と matching context 付き continuation は queue handoff へ進む。
- actual: regression で `queued_for_vps_helper_execution`、blocked reason visibility、context mismatch rejection を確認。
- mismatch: 初回修正では `blocked` を広く返しすぎ、既存 config blocker tests を壊した。
- lesson: blocked visibility は approval continuation のみに限定する必要がある。
- should become RAG candidate: approval continuation は本文ではなく signed payload IDs と stored proposal context を intent 根拠にする。

## Verification Evidence

- Unit: `node --test test/worker.test.js` pass
- Integration: `npm test` pass: 1243 tests, 1242 pass, 1 skipped; self-parity and generated-worker checks passed
- E2E: 未実施。merge/deploy 後に live operator continuation を再検証する。
- Manual: live Dashboard thread では failed continuation が owner message のみ保存され、operator が `unknown` を表示することを確認。
- Evidence path/link: `docs/development-strategy/issue-741-vps-approval-continuation.md`

## Butler Completion Contract

- Primary owner surface: Dashboard Butler。
- Fallback surface: Custom GPT は明示された fallback surface として扱います。主経路ではありません。
- Owner goal: passkey operator 承認後に VPS helper queue continuation が `unknown` で消えないこと。
- Butler entrypoint: `/v2/dashboard/chat/messages`
- Dashboard Butler natural-language path: Dashboard Butler の通常チャット entrypoint / 経路で、continuation では自然文に依存せず `approvalGrantId` / `vpsProposalId` を使う。
- Action Schema exposure: 変更なし。
- Runtime path: Worker runtime の Dashboard chat route。
- Runner/runtime truth: queue success または blocked execution を response に残す。
- Authority boundary: 変更なし。新しい high-risk authority は追加しない。
- E2E evidence: 未実施。live VPS systemd 変更前の routing fix PR。
- Completion status: incomplete

## Surface Update Checklist

- Cloudflare deploy: merge 後に別途必要。
- Custom GPT Action Schema update: 不要。
- Custom GPT Instructions update: 不要。
- iPhone Butler live E2E: 未実施。merge/deploy 後に passkey operator で再検証する。

## Related Constitution Rules

- High-risk actions require scoped passkey approval.
- Butler Completion Gate must not be claimed without live runtime evidence.
- Do not overclaim partial adapter success.

## Out-of-scope but NOT implemented

- VPS systemd watchdog timer install / enable
- bridge restart execution
- heartbeat live verification
- Issue #741 close

## Extra changes (if any)

None.
