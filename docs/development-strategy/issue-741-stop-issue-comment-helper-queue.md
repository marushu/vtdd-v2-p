# Issue #741 stop Issue comment helper queue

## 完了体験

Owner が Dashboard Butler / passkey operator から bridge restart / VPS helper
handoff を進めても、GitHub Issue コメントに実行依頼 JSON が溜まり続けない。
VPS local queue / state / log の接続がまだ無い場合は、実行を始めず
`blocked` として Dashboard Butler と operator に理由を返す。

この PR は bridge restart を完了させる PR ではない。Issue コメント transport
を延命せず止める safety PR である。

## VTDD 全体で進める部分

Issue #741 の deploy 後 bridge sync/restart と Issue #637 の VPS privileged
maintenance handoff が、GitHub Issue コメントを実行 queue として使い続ける
root defect を止める。Issue #413 の runtime truth と Issue #450 の app-server
path に対して、silent accumulation / silent drop を持ち込まない。

## 設計

- Worker の `helper-execution-queues` は Issue コメントを書かない。
- 現時点では VPS local helper queue writer が Worker から到達可能ではないため、
  `vps_local_helper_queue_unavailable` として blocked を返す。
- blocked runtime truth は `queueCommentPosted=false`、`rootExecutionStarted=false`、
  `helperExecutionStarted=false`、`requiredTransport=vps_local_helper_queue` を含める。
- Dashboard Butler の自然文 continuation は `queued_for_vps_helper_execution` を
  成功扱いしない。blocked reply を owner-facing に返す。
- passkey operator は queued 以外を `unknown` にしない。blocked status / error /
  next action を表示する。
- VPS runner 側の既存 `vtdd:vps-privileged-maintenance-execution` pickup は、
  新規実行 path として使わない。既存コメントの後始末や historical parser は
  この PR では削除しない。

## 仮説

今回の破綻は pagination ではなく、GitHub Issue コメントを VPS helper execution
queue として使っていたことが本体である。PR #824 は self-healing watchdog では
Issue コメント方式を避けたが、PR #823 / #825 の approval continuation 経路には
旧 Issue comment queue が残った。そこを pagination で直すと、溜まり続ける設計を
延命する。

## 検証計画

- Unit: passkey approval continuation は `blocked` を返し、GitHub Issue comment
  create を呼ばない。
- Unit: `/v2/vps/privileged-maintenance/helper-execution-queues` は valid envelope
  でも `503` blocked を返し、`queueCommentPosted=false` を返す。
- Unit: low-risk read も Issue コメント queue へ流さず blocked になる。
- Unit: passkey operator page は queued 以外を `unknown` ではなく blocked reason
  として表示する。
- Generated worker: `npm run build:worker`
- Integration: `node --test test/worker.test.js`
- Regression: `node --test test/vps-runner-script.test.js` は既存 runner parser
  compatibility の確認として走らせる。

## 改修見積もり

- `src/worker/runtime.js`
  - `createVpsPrivilegedMaintenanceHelperExecutionQueue`: Issue comment write
    plane を止め、local queue unavailable blocked response を返す。
  - Dashboard natural-language flow: blocked response visibility を維持し、
    `helperQueueReached=false` を返す。
  - owner-facing reply: `queueCommentUrl` 前提を外し、local queue 未接続を明示する。
- `src/core/passkey-operator-page.js`
  - queued 以外を `unknown` にしない。`blocked` / runtime truth / next action を表示する。
- `test/worker.test.js`
  - 既存 queue success assertions を blocked / no GitHub comment に更新する。
- `worker.js`
  - Worker bundle regeneration。

## 既に通っている経路

- Proposal 作成と passkey operator URL 生成は PR #825 後に live で到達済み。
- Worker の helper execution envelope 作成は validation 済み。
- PR #824 の watchdog script/template は local state/log 方針を採用済みだが、
  live install/enable は未実施。

## 未確認の境界

- Worker から VPS local queue/state/log へ直接渡す runtime route は未接続。
- VPS local queue のファイル形式、retention、single-flight、consumer service は
  この PR では未実装。
- 既存 Issue コメント queue の historical cleanup は未実施。

## 穴が出そうな箇所

- queued 成功を期待する tests / operator UI が blocked を失敗表示として
  `unknown` に戻す。
- low-risk read まで Issue コメント transport に残る。
- runner 側 parser を削除しすぎて historical progress / event parsing を壊す。
- deploy 後 bridge restart の実行能力が一時的に blocked になることを PR body で
  明示しないと、completion overclaim になる。

## PR 前に確認すること

- GitHub Issue comment create が valid helper queue path で呼ばれないこと。
- `queueCommentPosted=false` が runtime truth に残ること。
- root/helper execution は開始しないこと。
- passkey operator が blocked reason を表示し、`unknown` にしないこと。
- PR body に `Completion status: incomplete` と local queue 未接続を明記すること。

## 実装候補と捨てた案

- 採用: Issue comment queue を即時 blocked にし、VPS local queue 未接続を明示する。
- 捨てた案: `/issues/{number}/comments` pagination を修正して拾えるようにする。
  これは溜まり続ける設計を延命するため不採用。
- 捨てた案: mac Codex / SSH から直接 restart して完了扱いする。Butler-first
  completion を満たさないため不採用。
- 捨てた案: Worker から root helper を直接実行する。authority boundary を越えるため
  不採用。

## merge 後に通す E2E

- Dashboard Butler で bridge restart intent を出し、approval URL が出ること。
- passkey 承認後、Issue コメントが増えず、Dashboard / operator に
  `vps_local_helper_queue_unavailable` blocked が返ること。
- VPS runner が新規 Issue comment queue を拾わないこと。
- 次 PR で VPS local queue writer / consumer / bounded log / retention を接続し、
  bridge restart before/after truth を事後報告する。

## 次の PR を増やさない理由

この PR は危険な旧 transport を止める emergency safety slice であり、VPS local queue
の full implementation まで同時に入れると authority boundary、VPS service design、
retention、E2E が膨らむ。まず Issue コメント蓄積を止める。

## 停止条件

- deploy、credential mutation、permission mutation、root/sudo 実行、VPS systemd
  install/enable が必要になった場合。
- Issue コメント transport を pagination で延命しないと tests が通らない場合。
- local queue 未接続を隠して queued success として扱う必要が出た場合。
