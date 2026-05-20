## This PR satisfies Intent

Issue #450 の dashboard Butler chat runtime を、VPS Codex CLI handoff と同じ thread に戻る runner event 経路へ接続します。通常 chat 保存は維持しつつ、machine-authenticated request の場合だけ dashboard message から bounded VPS runner queue comment を作成し、queue payload と runner event に `dashboardThreadId` / `threadId` を残します。

## Satisfied Success Criteria

- [x] dashboard chat message を同じ thread に保存し、VPS runner handoff 時は owner / Butler / runner queued message を返します。
- [x] authenticated dashboard chat request から `executorTransport=vps_runner` の bounded queue comment を作成できます。
- [x] runner queue payload に `dashboardThreadId` を保持し、runner event comment には `threadId` として引き継ぎます。
- [x] 未認証 request は VPS runner dispatch を拒否します。
- [x] secret / token / approvalGrantId を chat message や runner event に保存しない既存 redaction 境界を維持します。
- [x] 既存の `/v2/events/vps-runner` は同じ thread に runner message を append できます。

## Unsatisfied Success Criteria

- live dashboard / deployed Worker / real VPS Codex CLI のE2Eは未実施です。
- browser-only owner UX からの dispatch は、第三者dispatch防止のためこのPRでは machine auth 必須のままです。passkey付き browser dispatch UI は別スライスです。
- WebSocket / streaming / live polling は未実装です。

## Non-goal violations

None.

## Dry-run Impact Report

- Target Issue: Issue #450。関連: Issue #452, Issue #413。
- Implementing Success Criteria: dashboard chat thread保存、VPS runner event の同一thread反映、VPS runner handoff queue への接続、未認証dispatch拒否。
- Explicit Non-goals: WebSocket/streaming、raw terminal log表示、Issue/PR/merge/deploy自動実行、passkey/authority境界変更、Custom GPT Action Schema変更。
- Expected touched files/routes/workflows: `src/worker/runtime.js`, `src/core/remote-codex-executor.js`, `scripts/run-vps-runner.mjs`, `test/worker.test.js`, `test/vps-runner-script.test.js`, generated `worker.js`。Routeは既存 `POST /v2/dashboard/chat/messages` と `POST /v2/events/vps-runner` を使用。
- Affected Issues: Issue #450, Issue #452, Issue #413。
- Affected PRs: PR #427 は未mergeの別PRとして残し、このPRには含めません。
- Affected workflows: guarded-autonomy-required-checks, gemini-pr-review。
- Affected runtime/operator surfaces: dashboard chat runtime、VPS runner GitHub queue comment、VPS runner event comment。
- What may break if we patch narrowly: dashboardからVPSを無条件dispatchすると第三者実行穴になるため、dispatchだけ machine auth 必須にしました。
- Unknowns to investigate before coding: browser-only dispatchをpasskey grantで許可するか、Cloudflare Access前提にするか。
- Validation needed: worker tests、remote-codex tests、vps-runner tests、self-parity、generated-worker、full npm test。
- Stop condition: unauthenticated dashboard requestからVPS runner executionが作れる場合、または high-risk authority境界変更が必要になった場合。

## File / Line Hypotheses

- file: `src/worker/runtime.js`
  - hypothesis: `handleDashboardChatMessageRequest` は保存だけで、VPS runner dispatchに接続していない。
  - risk if changed narrowly: dashboard public routeから任意dispatchできる穴を開ける。
  - validation: authenticated dispatch / unauthenticated rejection worker tests。
  - related Issue: Issue #450
- file: `src/core/remote-codex-executor.js`
  - hypothesis: queue payloadのhandoffがdashboard thread idを保存しないため、runner eventをchat threadへ戻せない。
  - risk if changed narrowly: runner側がthreadを失い、dashboard会話に戻れない。
  - validation: queue body assertion。
  - related Issue: Issue #452
- file: `scripts/run-vps-runner.mjs`
  - hypothesis: runner event commentにthread idを含めれば、既存event ingestionで同一thread appendできる。
  - risk if changed narrowly: GitHub evidenceだけ残り、dashboard chatへの復帰情報が欠落する。
  - validation: vps-runner-script event parse test。
  - related Issue: Issue #413

## Hypothesis Retrospective

- expected: dashboard chat handler、remote executor handoff、runner event formattingの小変更で接続できる。
- actual: 既存 event ingestion と chat store を再利用し、VPS handoff request と runner event の両方にthread idを残す形で接続できました。
- mismatch: browser-only dashboard dispatchは認証境界が不足するため、このPRではmachine auth必須にしました。
- lesson: owner-facing dashboard dispatchを完成させるには、passkey grantまたはCloudflare Accessなどのbrowser authority設計が次に必要です。
- should become RAG candidate: はい。dashboard chat -> VPS runner handoff は machine authで接続し、browser-only dispatchは未完了という working_memory 候補になります。

## Verification Evidence

- Unit: `node --test test/worker.test.js test/remote-codex-executor.test.js test/vps-runner-script.test.js` passed.
- Integration: `npm run check:self-parity` passed.
- Integration: `npm run check:generated-worker` passed after commit.
- Full: `npm test` passed. 855 passed, 1 skipped.
- E2E: not-live. deployed Worker + real VPS Codex CLI の dashboard conversation E2E は未実施です。
- Manual: not-live.
- Evidence path/link: local command outputs in this Codex run; PR checks after push.

## Butler Completion Contract

- Owner goal: dashboard から Butler / VPS Codex CLI への会話handoffを作り、runnerの返答を同じthreadへ戻せるようにする。
- Butler entrypoint: dashboard chat `POST /v2/dashboard/chat/messages`。VPS dispatch時は machine auth 必須。
- Action Schema exposure: 変更なし。
- Runtime path: `POST /v2/dashboard/chat/messages` -> `dispatchRemoteCodexExecution(... vps_runner ...)` -> GitHub queue comment -> `scripts/run-vps-runner.mjs` event with `threadId` -> `POST /v2/events/vps-runner` -> dashboard chat append。
- Runner/runtime truth: queue comment includes `dashboardThreadId`; runner event includes `threadId`; worker tests verify chat append and auth rejection.
- Authority boundary: unauthenticated dashboard dispatch is forbidden. Merge/deploy/secret/permission boundaries are unchanged.
- E2E evidence: not-live. Real VPS runner and deployed dashboard verification remain required.
- Completion status: incomplete

## Surface Update Checklist

- Cloudflare deploy: required after merge.
- Custom GPT Action Schema update: not required.
- Custom GPT Instructions update: not required.
- iPhone Butler live E2E: required after deploy.

## Related Constitution Rules

- Butler Completion Gate
- Butler-First Operating Principle
- Authority Boundary
- Conversation UX Contract
- Evidence Discipline

## Out-of-scope but NOT implemented

- Browser-only passkey-authorized VPS dispatch UI.
- WebSocket / EventSource streaming.
- Raw Codex terminal log display.
- Automatic merge/deploy/Issue close from dashboard chat.

## Extra changes (if any)

None.
