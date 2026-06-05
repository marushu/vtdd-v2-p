# Issue #590 progress lane stability 作戦図

## 完了体験

Dashboard Butler の長い turn 中、owner は入力欄下で `考えています。` / `ファイル変更を確認しています。` のような低情報 status を一時的に見られる。一方で、チャット本文側に出ている owner-facing checkpoint は、低情報 status、添付プレビュー、thread refresh、WebSocket transient event の再描画で空白化しない。最終回答が来た時だけ checkpoint は消え、必要な進行ログは最終回答側に集約される。

## VTDD 全体で進める部分

Issue #590 の owner-facing observability のうち、今回は表示レーン混線と checkpoint 空白化を直す。Issue #637 の VPS privileged maintenance、Issue #793 の deploy notification driven stale-client refresh、Issue #654 の reconnect-resend 全体は次以降に残す。

## 設計

低情報 transport status と owner-facing checkpoint は同じ transient snapshot 経路を通るが、UI での扱いを分ける。composer 下の transient progress は every status update を受けてよい。chat 内 checkpoint は `progressSummary.entries` がある snapshot だけで更新する。`progressSummary` の無い低情報 status は既存 checkpoint を消さず、final reply / failed / stalled / explicit clear の時だけ checkpoint を消す。

## 仮説

`src/worker/runtime.js` の `updateTransientProgress()` は、低情報 status でも `renderThreadProgressCheckpoint(options.snapshot || null)` を呼ぶ。`renderThreadProgressCheckpoint()` は snapshot を受けると `transientProgressSnapshotState` を置き換え、`latestProgressCheckpointText()` が空なら `clearThreadProgressCheckpoint()` を呼ぶ。これにより、直前に readable reply delta / long_turn_checkpoint で出ていた chat checkpoint が、`file_change` や `command` の status update で消える。

この narrow patch だけなら bridge event 生成や Durable Object schema を変えずに、UI lane の安定性を改善できる。ここで fallback timer、owner input queue、stop/interrupt へ広げると #590 の残 scope が混線する。

## 検証計画

- Worker HTML regression: readable checkpoint snapshot の後に progressSummary の無い low-information transient status が来ても、chat checkpoint を消す呼び出しにならないことを source assertion で確認する。
- Worker runtime regression: `app_server_reply_delta` の checkpoint 後に `file_change` status が来ても snapshot の `progressSummary` は latest readable checkpoint を保持することを確認する。
- Existing targeted tests: `node --test test/worker.test.js --test-name-pattern 'DashboardChatRoom'`
- Generated worker: `npm run build:worker`
- Generated worker check: `npm run check:generated-worker`
- Diff hygiene: `git diff --check`

## 改修見積もり

- `src/worker/runtime.js`: UI helper に `hasProgressCheckpointSnapshot()` を追加し、`updateTransientProgress()` が low-information snapshot で chat checkpoint を消さないようにする。risk は final / failure 時の clear が効かなくなることだが、そこは `clearTransientProgress()` の explicit clear 経路を維持する。
- `test/worker.test.js`: app-server reply delta checkpoint 後の low-information status regression を追加する。risk は mock storage の期待値が Durable Object 実装とズレること。
- `worker.js`: generated worker を `npm run build:worker` で同期する。

## 既に通っている経路

PR #731 で低情報 progress の durable chat history 汚染は止まっている。PR #774 以降で transient snapshot、final progress summary、live checkpoint card、scroll guard の土台が入っている。PR #779 / #780 後、`codex app-server が応答を生成しています。` は composer 下へ戻ったが、chat-visible checkpoint と低情報 status の混線は owner production evidence で残っている。

## 未確認の境界

production PWA の添付プレビュー再描画と WebSocket transient update の正確な順序は未確認。ただし、低情報 snapshot で checkpoint を clear する UI 経路は source 上で確認できるため、この slice で先に潰す価値がある。

## 穴が出そうな箇所

`restoreThreadRecoveryState()` が owner latest message から pending status を復元する場合も low-information snapshot と同様に chat checkpoint を消す可能性がある。今回の patch は `updateTransientProgress()` の入力を一元的に扱うため、ここも同時に保護される。

## PR 前に確認すること

`main` が `origin/main` と一致すること、Issue #590 が open で Now であること、open PR が競合していないこと、untracked `.tmp/` / `test-results/` を巻き込まないことを確認する。

## 実装候補と捨てた案

採用: chat checkpoint は owner-facing summary entries がある snapshot だけで更新し、低情報 snapshot は composer 下だけ更新する。

捨てた案: low-information status を bridge 側で送らない。composer 下の現状維持という owner 方針に反する。捨てた案: progressSummary の無い snapshot でも dummy checkpoint を作る。チャット本文に低情報 status を戻す regression になる。捨てた案: thread refresh 全体を止める。添付/再接続/履歴復元の別機能を壊す。

## merge 後に通す E2E

production deploy 後、Dashboard Butler PWA で readable checkpoint が出た状態から画像添付または `file_change` / `command` status を含む長め turn を観測し、チャット本文 checkpoint が空白化せず、入力欄下 status だけが更新されることを確認する。最終回答後は checkpoint が消えることも確認する。

## 次の PR を増やさない理由

今回の変更は #590 の同一 root blockerである lane stability の最小修正で、source と test の触点が小さい。bridge fallback や scroll indicator まで同じ PR に入れると検証境界が広がるため入れない。

## 停止条件

checkpoint の clear が final reply / failed / stalled で効かなくなる、progressSummary の無い status が durable message に戻る、worker generated check が一致しない、または deploy / credential / permission / destructive work が必要になった場合は停止して owner に報告する。
