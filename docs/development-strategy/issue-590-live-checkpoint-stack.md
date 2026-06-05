# Issue #590 live checkpoint stack 作戦図

## 完了体験

Owner が Dashboard Butler PWA / iPhone で作業中の live progress を読んでいる時、新しい `作業を継続しています` checkpoint が出ても、直前の思考中コメントや具体 progress が消えない。作業中は checkpoint がチャット欄に積まれ、完了時だけ最終回答と進行ログへ整理される。

## VTDD 全体で進める部分

Issue #590 の owner-facing long-turn observability を継続する。#637 へ戻る前に、production PWA で確認された live checkpoint overwrite を小さく塞ぐ。

## 設計

Dashboard message renderer の live checkpoint 表示を、単一 `threadProgressCheckpointCard` の更新から、snapshot の `progressSummary.entries` に対応する複数 checkpoint card 表示へ変える。既に表示済みの checkpoint は消さず、新しい owner-facing checkpoint だけ追加する。低情報 transient status は引き続き composer 下に留める。

## 仮説

原因は `renderThreadProgressCheckpoint()` が latest checkpoint text だけを単一 card に paced rendering していること。`long_turn_checkpoint` など新しい checkpoint が届くたび、前の checkpoint の DOM text が置換され、owner には「積んだ思考中コメントが消えた」ように見える。

## 検証計画

- Unit: Dashboard inline HTML presence と `DashboardChatRoom` progress tests。
- DOM helper test: 複数 checkpoint entries を持つ snapshot を `renderThreadProgressCheckpoint()` に渡し、複数 DOM entry が残ることを確認する。
- Integration: `npm run build:worker`、`npm run check:generated-worker`、`git diff --check`。
- E2E: #590 timeout recovery / inline transient progress E2E を再実行し、既存 containment と scroll 保持を壊していないことを確認する。

## 改修見積もり

- `src/worker/runtime.js`: live checkpoint state を単一 card から stack に変更する。関数境界は `renderThreadProgressCheckpoint()` / `clearThreadProgressCheckpoint()` / paced rendering 周辺。リスクは重複 checkpoint の増殖。
- `test/worker.test.js`: inline Dashboard helper extraction と DOM assertion を追加する。リスクは最小 DOM helper の実ブラウザ差分。
- `worker.js`: generated worker 更新。

## 既に通っている経路

PR #800 は merge / deploy / cache reload 済み。最終要約の節見出し整形は見えているが、production PWA evidence で live checkpoint overwrite が残った。

## 未確認の境界

実際の app-server bridge が送る checkpoint entries の粒度は turn により異なる。今回の修正は UI 側で既存 entries を消さないことに限定し、bridge event 生成の粒度は変えない。

## 穴が出そうな箇所

同じ text の repeated status を毎回追加するとノイズになる。checkpoint key は text と source を基準にして、同一 snapshot 内の重複は増やさない。完了時の final reply では live stack を clear する必要がある。

## PR 前に確認すること

Issue #590 の production evidence、`src/worker/runtime.js` の live checkpoint DOM、既存 progress tests、生成 worker の同期を確認する。

## 実装候補と捨てた案

採用案は checkpoint entries を stack としてレンダリングする案。捨てた案は paced rendering の minimum display time だけを伸ばす案。表示時間を伸ばしても単一枠上書きが残るため、owner が読んでいる途中で消える根本は直らない。

## merge 後に通す E2E

production deploy 後、iPhone PWA で複数 live checkpoint が積まれ、新しい `作業を継続しています` が前の checkpoint を消さないことを live E2E とスクリーンショットで確認する。

## 次の PR を増やさない理由

この PR は production evidence で直接見えた単一 root cause に閉じる。bridge event 分類や #637 restart E2E まで混ぜず、UI の checkpoint stack だけを直すため予測できる follow-up を増やさない。

## 停止条件

checkpoint stack が通常チャット履歴を永続汚染する、低情報 transient status を chat 本文に増やす、scroll containment を壊す、または #637 high-risk execution に踏み込む必要が出た場合は停止する。
