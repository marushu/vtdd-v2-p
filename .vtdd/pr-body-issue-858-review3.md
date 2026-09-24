## This PR satisfies Intent

- Issue #858 のMac PRIMARY / VPS STANDBY手動切替で、短いheartbeat途絶だけの昇格と共有bearerによる別ノードの偽装を拒否する。review #3 と operator 監査を反映したPR本文。

## Satisfied Success Criteria

- os.tmpdir()+mkdtempでテスト自身が一時領域を作成。
- plannedのfresh quiesce・clean/pushed/fresh checkpointとemergencyの10分待機・owner隔離確認を必須化。modeと確認をpasskeyに束縛。
- Ed25519公開鍵登録/rekey、署名report/authorize、durable replay CAS、private config signerを接続。

- checkpoint-sync-004: standby checkpointの欠落・不一致を拒否。plannedはPRIMARY/controlとの一致とfresh、emergencyは最後のcontrolとの一致を要求し、standbyReadyもfalseにする。比較はrepository/branch/baseRef/headSha/issueNumber/pullNumberと世代。nullable IDはnull同値。

## Unsatisfied Success Criteria

- synthetic Chromiumはsandbox起動拒否により描画E2E未検証。
- 実ノード鍵・サービス設定、live PWA、実passkey、自然文quiesce/登録導線、receipt期限切れ回復は未検証または未接続。

## Non-goal violations

None.

## 開発前作戦図

- Planning tier: root
- 作戦図 evidence: docs/development-strategy/issue-858-mac-primary-vps-standby.md
- 完了体験: ownerが停止・隔離条件とノード公開鍵を画面で確認し、scoped passkeyで承認する。
- VTDD 全体で進める部分: executor authority / recovery境界。
- 設計: 設計範囲はplanned/emergencyの分離、Ed25519登録と署名、durable nonce CAS。merge/deployはButler側。
- 仮説: 短いheartbeat途絶と共有bearerだけの本人性判断が誤認可の原因という仮説。
- 検証計画: state/routes/private signer/SQLite race/VMテスト、build、clean full、synthetic browser。
- 改修見積もり: executor state/operator/routes/passkey/reporter/fence、テスト、docs、worker.js。
- 既に通っている経路: 既存passkey provider、D1 CAS、private config。
- 未確認の境界: 実ブラウザとliveノードへの配備。
- 穴が出そうな箇所: 既発行の外部副作用は取消不可。quiesce/隔離は実運用の前提。
- PR 前に確認すること: 対象source/docs/testsを照合。GitHub Issue #858 はopen、branchはoperator監査後にpush済み。
- 実装候補と捨てた案: heartbeatだけの隔離推測、共有bearerをattestationとみなす案、自動切替を不採用。
- merge 後に通す E2E: 本作業ではmerge禁止。将来のscoped承認下でlive E2Eが必要。
- 次の PR を増やさない理由: 署名と登録、transitionとpasskey/UIを同一PRの範囲で揃え、予測可能な接続漏れを残さない。live境界は未完として残す。
- 停止条件: review task自体ではnetwork mutation、実credentials、install、services、push/merge/deployを禁止。operator監査後はbranch pushのみ実施し、merge/deployは未実施。

## Dry-run Impact Report

- Target Issue: Issue #858 review #3。
- Implementing Success Criteria: 遷移条件・署名・.local非依存を確認。
- Explicit Non-goals: 自動切替、本番操作、他Issueへの拡張。
- Expected touched files/routes/workflows: executor関連source/scripts/tests/docs、worker.js。
- Affected Issues: Issue #858のみ。
- Affected PRs: 本PRのみ。branch issue-858-mac-primary-vps-standby はGitHubへpush済み。
- Affected workflows: 変更なし。
- Affected runtime/operator surfaces: executor API、passkey operator、reporter、bridge/runner fence。
- What may break if we patch narrowly: scopeとUI/signersの不一致で承認・reportが切れる。
- Unknowns to investigate before coding: Ed25519とCAS接続はlocal確認、liveは未確認。
- Validation needed: focused/full成功、実ブラウザは残る。
- Stop condition: 許可されたworktreeのローカル修正まで。

## Execution Queue Delta

- Queue position before: Issue #858 現PRのreview修正。
- Preemption decision: ROOT: 現Issueのreview blocker対応。他のNow itemへのpreemptionなし。
- Queue delta: Issue #858 の位置は変更せず、review #3のlocal差分だけを準備。
- Why this PR is next: operator指定のCI・review blocker修正。
- Active Issues not downscoped: active Issuesは縮小しない。Issue #858もincomplete。

## File / Line Hypotheses

- file: `src/core/executor-failover-state.js` / `src/core/executor-node-identity.js`
  - hypothesis: quiesce、10分隔離条件、Ed25519+CASで誤認可を拒否できる。
  - risk if changed narrowly: passkey/UI/signersの不一致。
  - validation: focused 80件とclean全体1410件。
  - related Issue: #858

## Hypothesis Retrospective

- expected: 短時間途絶・無隔離・wrong key/replayを拒否。
- actual: focused成功、実ブラウザ起動はsandboxで拒否。
- mismatch: emergencyにもcheckpoint鮮度10分を課すと10分待機と両立しないため、指示のfresh要件はplannedに適用。emergencyは最後のclean/pushed checkpointと回復限界表示を採用。
- lesson: admissionと外部副作用取消、transport authとnode identityを分離して検証する。
- should become RAG candidate: この境界判断の候補。RAG書込なし。

## Verification Evidence

- Unit: focused 80成功、0失敗。
- Integration: clean npm test: 1410件中1409成功、1skip、0失敗。self-parityとgenerated-worker整合成功。
- E2E: VM操作テスト成功。ChromiumはMachPortRendezvous Permission denied (1100)で起動不可。描画E2E未検証。
- Manual: git diff --check成功。実サービス・鍵・本番への操作なし。
- Evidence path/link: docs/mvp/e2e/e2e-issue858-executor-failover.md

## Butler Completion Contract

- Primary owner surface: Dashboard Butler。
- Fallback surface: Custom GPT は明示された fallback surface として扱います。主経路ではありません。
- Owner goal: このPRが扱う owner-facing goal は Intent / Success Criteria に記載しています。
- Butler entrypoint: 同一origin executor operator（切替/version/enrollment）。
- Dashboard Butler natural-language path: Dashboard Butlerの自然文/chatからquiesce・登録を案内する経路は未接続。
- Action Schema exposure: Custom GPT fallback 用の露出状態として扱います。このPRスライスでは未変更です。
- Runtime path: signed report/authorize、passkey付きenroll/transition、private signer。
- Runner/runtime truth: synthetic / memory / SQLiteのみ。live未確認。
- Authority boundary: 登録はnode・旧新公開鍵・Issue、切替はmode・隔離確認・世代・対象をpasskeyへ束縛。merge/deployはButler側。
- E2E evidence: docs/mvp/e2e/e2e-issue858-executor-failover.md（incomplete）。
- Completion status: incomplete

## Surface Update Checklist

- Cloudflare deploy: 禁止・未実施。
- Custom GPT Action Schema update: 不要。
- Custom GPT Instructions update: 不要。
- iPhone Butler live E2E: 必要、未実施。

## Related Constitution Rules

- AGENTS.md: authority境界、root作戦図、completion evidence。
- operatorの許可は現worktreeでのlocal code/tests/build/docsのみ。

## Out-of-scope but NOT implemented

- merge/deploy/install/services/live monitors/実credentials。branch pushのみoperator監査後に実施。

## Extra changes (if any)

checkpoint-sync-004で同期拒否の24テストとsynthetic unsynced画面fixtureを追加。80 focused成功、clean全体1410件中1409成功・1skip。実ブラウザは引き続きsandbox起動拒否で未検証。既存.localは未変更・commit対象外。operator監査後にcommit/push済み。merge/deploy/live操作は未実施。

<!-- VTDD metadata -->
- Issue: Issue #858
- Execution ID: task-63e6a1d2fe2774a8ff5190998ed3b232
- Goal: Review #3: 遷移条件・ノード署名・CI一時領域を修正
