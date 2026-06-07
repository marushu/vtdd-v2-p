# Issue #741 quiet restart launch truth 作戦図

## 完了体験

Owner が deploy 後 bridge restart を承認したあと、Dashboard Butler の通常チャットには deploy 完了や最終的な failure / completion truth だけが残る。`bridge_control_sent`、`launch_started`、`runner wake` のような中間 launch truth は通常 message として積み上がらず、必要な場合だけ transient progress / runtime truth / debug evidence として扱われる。

## VTDD 全体で進める部分

Issue #741 の deploy 後 bridge restart 経路で、PR #829 が固めた before/after completion truth を邪魔しない表示境界を整える。restart の安全境界は維持するが、owner-facing normal chat を低情報な lifecycle message で汚さない。

## 設計

`bridge_control_sent` と `launch_started` は terminal truth ではない。通常チャットに残すと owner は「何か完了したのか」「まだ待つべきなのか」を毎回読まされる。成功系の launch truth は persisted chat message にしない。失敗、blocked、duplicate は recovery 判断に必要なので message として残す。deploy 完了 message の次 action も、bridge restart launch を逐一説明せず production E2E / runtime truth 確認へ寄せる。

## 仮説

原因は `buildDeployBridgeFollowupChatMessage()` の `bridge_control_sent` message と、`acceptDeployBridgeSyncRestartResult()` の `launch_started` result message が、どちらも `DashboardChatStore.appendMany()` に渡っていること。これにより通常チャットに中間状態が二重に残る。

## 検証計画

- Unit: deploy event success は deploy 完了 message だけを append し、bridge follow-up launch message を append しない。
- Unit: `deploy_bridge_sync_restart_result` の `launch_started` は transient / persisted chat message を追加しない。
- Unit: `launch_failed` は引き続き persisted failed message を追加し、retry guard を release する。
- Local: `npm run build:worker`、`npm run verify:worker`、関連 `node --test test/worker.test.js --test-name-pattern ...`。

## 改修見積もり

- `src/worker/runtime.js`: `bridge_control_sent` の `message` を null にし、deploy completion text から中間 launch 説明を外す。`normalizeDeployBridgeSyncRestartResult()` / accept path で `launch_started` を append しない。risk は owner が launch 状態を全く見えなくなることだが、これは transient/debug に限定するのが今回の目的。
- `test/worker.test.js`: deploy event append 件数、launch_started 非保存、launch_failed 保存の期待値を更新する。
- `worker.js`: Worker bundle を再生成する。

## 既に通っている経路

PR #829 で restart completion truth は helper queue / runtimeTruth に残る。deploy event、app-server bridge control、VPS local helper queue、runner wake の主経路は存在する。

## 未確認の境界

production PWA で transient progress がどの程度見えるべきかは未確認。今回の PR は「通常チャットに残さない」を目的にし、最終 completion readback の E2E は merge/deploy 後に確認する。

## 穴が出そうな箇所

launch truth を完全に消すと debug が難しくなる。runtime response / deployBridgeFollowup object / logs には残し、通常 message だけを抑制する必要がある。

## PR 前に確認すること

Issue #741 の authority boundary、PR #829 の completion truth、test/worker の deploy bridge restart expectations、generated worker drift を確認する。

## 実装候補と捨てた案

採用: success launch message を null にして persisted chat append を止める。

捨てた案: 文言だけ短くする。owner の不満は「出ること」なので、短文化では解決しない。

捨てた案: restart truth そのものを消す。completion/failure/recovery evidence が失われるため不可。

## merge 後に通す E2E

production deploy 後、passkey approved bridge restart で通常 chat に `起動結果` / `restart 完了結果ではありません` / `before/after truth が戻るまで` の中間 message が積まれず、最終 completion/failure truth だけが owner-facing に残ることを確認する。

## 次の PR を増やさない理由

この UX 漏れは PR #829 の completion truth を owner-facing にする前提を壊す。message 抑制と tests は同じ failure mode なので同じ PR で閉じる。

## 停止条件

通常 message を止めるために restart completion truth、failure message、retry guard、authority boundary を壊す必要が出た場合は停止する。
