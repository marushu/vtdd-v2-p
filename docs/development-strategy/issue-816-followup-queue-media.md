# Issue #816 差し込み queue 添付保持 作戦図

## 2026-06-07 follow-up: Codex-style insertion panel

owner 観測: 現行の差し込み queue は入力欄の下に積み続けており、体験として NG。実行中に composer へ入力した follow-up は、入力欄の上に owner-facing panel として出し、デフォルトでは queue して AI の作業完了または owner の停止後に送る。必要な時だけ `誘導する` を選ぶと、現在の AI 返しタイミングに応じて差し込む。queued item には `編集する` と `キャンセル` も必要。

この follow-up の scope は Issue #816 内に収める。添付保持だけでなく、queue 表示位置と owner action の選択肢までが差し込み workflow の completion 体験であるため、PR #817 を更新する。Issue #818 の voice interrupt gate と Issue #820 の drawer force refresh は merge 済み truth として取り込み、#816 は `Now` に戻す。

設計: `followup-draft` と `followup-queue-list` を composer box の前に置き、入力欄の下へ流れないようにする。active turn 中の submit は queue item を作るだけで即 flush しない。`setActiveTurnInProgress(true -> false)` の遷移で queued follow-up を flush し、stop button で停止した場合も stop request 後に flush する。queue item の `誘導する` action はその item を即送信し、`編集する` は mediaReferences を保持したまま text を更新し、`キャンセル` は未送信 item を queue から外す。

検証計画: unit で DOM order、button labels、default submit が immediate flush しないことを source guard する。E2E で active turn 中に text+添付を送信し、入力欄の上の queue panel に `キュー待ち` / `誘導する` / `編集する` / `キャンセル` が見えること、default では WebSocket payload が増えず、`誘導する` 選択後に mediaReferences 付き owner_message が送られることを確認する。

## 完了体験

owner が Dashboard Butler の通常チャットまたはボイスモード中に、実行中 turn へ画像・動画つきで差し込みを入れても、添付が queue item に残り、送信時に Dashboard thread と codex app-server bridge の turn input へ同じ media reference が届く。owner は queue に何を送る予定かを見られ、添付が upload 中なら添付なしで送られず、待機または blocker として分かる。

## VTDD 全体で進める部分

Issue #816 は Issue #811 のメインチャット root と Issue #814 のボイスモード workflow の前提欠陥を直す。ここでは差し込み queue の media保持だけを扱い、Web Speech API の逐次読み上げや Dashboard V3 全体の再設計は扱わない。

## 設計

Dashboard client script の follow-up queue item に `mediaReferences` を持たせる。queue 作成時は upload 済み `pendingMediaItems` だけを snapshot し、未完了 item がある場合は送信を止めて owner-facing status を出す。`flushQueuedFollowups()` は queue item の `mediaReferences` を owner message payload に渡す。queue UI は添付数を表示し、送信後は既存 Worker `owner_message` path が media validation と thread保存を担当する。

## 仮説

根本原因は `src/worker/runtime.js` の `flushQueuedFollowups()` が `mediaReferences: []` を固定していること。周辺の通常送信 path は `buildOwnerPayload()` で `pendingOwnerSend.mediaReferences` を送れるため、差し込み queue item 生成時に upload 済み media を保持すれば、Worker と bridge の既存 media delivery truth に接続できる。狭く `mediaReferences: pendingMediaItems` のように置き換えるだけだと、upload 未完了や queue UI の見え方が壊れる。

## 検証計画

- Unit: `test/worker.test.js` で Dashboard HTML に `mediaReferences: item.mediaReferences || []` と upload 未完了 blocker が入ることを確認する。
- E2E: `scripts/e2e-issue811-dashboard-butler-v3-main-chat.spec.mjs` に添付つき差し込み queue の payload / UI 確認を追加する。
- Integration: `npm run verify:worker` で generated worker と worker tests を確認する。
- 静的確認: `git diff --check`。

## 改修見積もり

- `src/worker/runtime.js`: Dashboard client script 内の pending media helper、follow-up queue item作成、queue表示、flush送信 payload を変更する。リスクは巨大な inline script の周辺回帰。
- `test/worker.test.js`: HTML source assertion を追加する。リスクは brittle な文字列検査。
- `scripts/e2e-issue811-dashboard-butler-v3-main-chat.spec.mjs`: 既存 #811 E2E に fake upload 済み media queue の確認を追加する。リスクは E2E が既存 voice assertions と密結合していること。
- `docs/development-strategy/issue-816-followup-queue-media.md`: この作戦図。実装前 gate。

## 既に通っている経路

通常 owner message は `pendingOwnerSend.mediaReferences` から `buildOwnerPayload()` を通って Worker `owner_message` accept path に届く。Worker は media reference validation と Dashboard thread 保存を持っている。bridge は `mediaReferences` を materialize して turn input に media delivery truth を入れるテストが既にある。

## 未確認の境界

Codex アプリの差し込み添付挙動は観察未完了。この PR では非公開内部実装を推測せず、owner-facing に「添付を落とさない」「queue に添付数が見える」「未完了 upload は送らない」を採用する。

## 穴が出そうな箇所

upload 中の `pendingMediaItems` を queue に入れると、preview だけが存在し mediaId がない状態になる。これは送信してはいけない。queue cancel 時の abandoned media rollback は既存 media delete path と権限が絡むため、この PR では送信前に upload 済み media reference を保持し、rollback 完成は明示的な残課題にする。

## PR 前に確認すること

`flushQueuedFollowups()` が空配列固定をやめていること。添付つき queue item の UI に添付数が見えること。fake socket payload に media reference が含まれること。通常送信 path と voice transcript path を壊していないこと。

## 実装候補と捨てた案

採用: queue item 作成時に upload 済み mediaReferences を snapshot し、queue payload と UI に保持する。

捨てた案: flush時に現在の `pendingMediaItems` を読む。queue 作成後に owner が添付を外したり別の入力に変えたりした時、queue item と composer state が混線するため捨てる。

捨てた案: upload 未完了でも text だけ先に送る。Issue #816 の根本不具合を残すため捨てる。

## merge 後に通す E2E

production Dashboard Butler PWA で、実行中 turn に画像を添付して差し込み queue へ入れ、queue 表示に添付が残り、送信後の Butler thread / bridge input に添付が届くことを確認する。

## 次の PR を増やさない理由

この slice は #814 の前提欠陥を閉じる小さな接続修正であり、Dashboard V3 全体や読み上げとは分けるべきだが、添付保持だけは UI / payload / E2E を同じ PR に入れないと「表示だけ」「payloadだけ」の未接続状態になる。

## 停止条件

Worker media validation が差し込み payload を拒否する、upload 済み media reference の sourceEventId / rollback 境界が曖昧で添付を安全に保持できない、または既存 #811 / #814 の E2E と衝突して voice workflow を壊す場合は実装を止め、Issue #816 に blocker として戻す。

## 2026-06-07 owner blocker: 直接差し込み導線と reload recovery

- 観測: production PWA で draft panel に `キューに追加` しか出ず、owner は「差し込みできない」と判断した。さらに reload で queued follow-up が消える。
- 判断: production E2E 以前の UX/state blocker。#817 の範囲内で、draft panel に `差し込む` / `キューに追加` / `キャンセル` を出し、`差し込む` は即 `interruption: true` で送る。
- reload recovery: queued follow-up は `sessionStorage` に thread 単位で保存し、reload/reconnect 後も queue chip を復元する。未 upload の local file はブラウザ仕様上復元できないため、既存 draft text 復元と「添付は再選択」表示に留める。
- validation: source guard と local Playwright E2E に、初期 draft panel の `差し込む` button、直接差し込み payload、queued follow-up reload persistence を追加する。
