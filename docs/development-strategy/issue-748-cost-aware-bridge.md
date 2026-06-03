# Issue #748 cost-aware Butler bridge strategy

## 完了体験

Owner が iPhone/iPad で Dashboard Butler を再開しても、app-server bridge の delta / status / progress burst が Cloudflare Durable Objects rows_written を増やし続けない。Butler は短い presence update を速く返すが、復旧に必要な owner message、final reply、failure、timeout、approval、thread mapping だけを durable に残す。bridge restart は、local regression test と runtime metrics guard を通した後だけ許可する。

## VTDD 全体で進める部分

Issue #748 を emergency root として、DashboardChatRoom の app-server bridge persistence boundary を修正する。Issue #455 の Codex usage 削減と Issue #745 の reviewer fallback retry 抑止は本 PR では audit / evidence に留め、既に main に入っている fallback model guard を再確認する。Issue #613 の voice-ready work は、この cost-aware boundary が先に成立するまで実装しない。

## 設計

`presence != persistence` を runtime 実装に落とす。`codexThreadId` mapping は thread resume に必要なので保存するが、同じ `threadId -> codexThreadId` を transient event ごとに再保存しない。Dashboard UI へは WebSocket transient status を流す。chat store / Durable Object storage へは final / failure / timeout / selected durable checkpoint だけを送る。

## 仮説

RowsWritten 急増の直接原因は `DashboardChatRoom.acceptAppServerBridgeMessage()` が `normalized.codexThreadId` を含むすべての bridge event で `writeAppServerThreadMapping()` を呼び、`writeAppServerThreadMapping()` が同一値でも `ctx.storage.put()` していたこと。bridge は delta / status / progress の多くに `codexThreadId` を付けるため、同じ mapping でも高頻度 write が発生した。

狭く `codexThreadId` を bridge 側から消すだけだと、resume / timeout / final reply の復旧情報を壊す可能性がある。Worker 側で同値 no-op を保証し、必要なら bridge 側で送信頻度を後続で減らす方が安全。

## 検証計画

- Unit: 同一 `codexThreadId` の delta / status burst が `ctx.storage.put()` を初回以外発生させない。
- Unit: 新しい `codexThreadId` に変わった場合だけ mapping を更新する。
- Unit: final reply / timeout / failure は引き続き復旧可能な thread message を残す。
- Local targeted: `node --test test/worker.test.js test/dashboard-app-server-bridge.test.js test/codex-review-fallback.test.js`
- Worker build/verify: `npm run build:worker` と `npm run verify:worker`
- Runtime: deploy/restart 後に Cloudflare metrics で `DashboardChatRoom` rowsWritten が burst しないことを確認する。Deploy / restart は owner approval boundary を満たした後だけ行う。

## 改修見積もり

- `src/worker/runtime.js`: `writeAppServerThreadMapping()` に existing mapping read と同値 no-op を追加する。risk: storage get が増えるが put を抑制し、DO write quota を守る。
- `test/worker.test.js`: mock storage に put count を追加し、delta/status burst regression を追加する。risk: 既存テストの mapping expectation を更新する必要がある。
- `scripts/run-dashboard-app-server-bridge.mjs`: 今回は基本変更しない。risk: bridge 側の `codexThreadId` 送信は残るが worker no-op が主防御になる。
- `worker.js`: build output。runtime source 変更後に `npm run build:worker` で更新する。

## 既に通っている経路

- Owner message は DashboardChatRoom で保存され、app-server bridge へ turn request を送れる。
- App-server final reply は chat store に `butler` message として保存される。
- Reply delta / generic progress は chat message としては永続化しない既存テストがある。
- Codex fallback reviewer は main で `gpt-5.4-mini` default と `--model` 明示に変わっている。

## 未確認の境界

- Cloudflare GraphQL metrics の post-fix live rowsWritten は deploy/restart 後にしか確認できない。
- VPS bridge restart は service 操作であり、未修正 production に対して行うと再発し得る。
- Deploy / permission / credential mutation はこの PR の local implementation だけでは実施しない。

## 穴が出そうな箇所

- `app_server_status` の durable progress opt-in が将来増えると chat store 側の write が増える可能性。
- Owner-action notification / push dispatch が approval request burst と結びつくと別 quota を消費する可能性。
- VPS runner の reviewer fallback retry loop は Cloudflare ではなく Codex usage を消費するため、#455/#745 側で継続 audit が必要。

## PR 前に確認すること

- `git status --short --branch`
- local targeted tests
- `npm run build:worker`
- `npm run verify:worker`
- PR body に Execution Queue Delta と #748 emergency preemption を記録する。

## 実装候補と捨てた案

- 採用: Worker mapping write を同値 no-op にする。
- 採用: regression test で `ctx.storage.put()` 回数を数える。
- 捨てた案: bridge から transient event の `codexThreadId` を完全に外す。理由は resume/final/timeout recovery の境界を壊すリスクがあるため。
- 捨てた案: Cloudflare paid plan で回避する。理由は root cause を残すため。

## merge 後に通す E2E

- Production deploy 後、VPS bridge を再有効化する前に Cloudflare metrics baseline を読む。
- bridge restart 後、短い Dashboard Butler turn を1回流し、rowsWritten が burst しないことを確認する。
- Dashboard thread に final reply が残り、delta/status が transient UI として見えることを確認する。

## 次の PR を増やさない理由

本 PR は root cause の最小修正と regression test に絞る。Codex usage routing / reviewer fallback dedupe / voice UX は関連するが、別 quota / 別 authority / 別 completion gate なので、この PR では audit と関連 Issue 参照に留める。

## 停止条件

- Mapping no-op test が書けない、または同値 mapping でも storage put が必要な仕様衝突が出る。
- `npm run build:worker` または `npm run verify:worker` が unrelated failure ではなく本修正に起因して失敗する。
- Deploy / bridge restart / Cloudflare metrics read に credential or passkey boundary が必要になり、owner approval が未取得。
