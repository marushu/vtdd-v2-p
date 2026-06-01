# Issue #590 stalled owner input recovery

## 完了体験

owner が Dashboard Butler PWA で `codex app-server から進行イベントがしばらく届いていません` を見ても、通常チャット入力欄から同じ thread に追加連絡できる。Butler は「待つしかない」状態ではなく、入力欄が使えることを明示し、保存済みの依頼に続けて補足・短縮・キャンセル指示を送れる。

## VTDD 全体で進める部分

Issue #590 の parent root である app-server timeout / silent wait recovery を進める。Issue #723 の stale client recovery は production evidence 済みなので、次は stalled recovery 中の owner input path を守る。

## 設計

Dashboard client が `transient_status: stalled` または thread 上の `status: failed/stalled` を受け取ったら、composer を明示的に解放し、submit button も復帰させる。表示文言は「入力は保存済み」「このまま追加メッセージを送れます」を含める。runtime route、deploy、bridge timeout 値、stop/interrupt UI は触らない。

## 仮説

owner が「連絡できない」と感じる原因は、VPS Codex CLI が裏で動いていても Dashboard 側に progress が来ない時、stalled recovery 表示が通常入力の継続可否を明示せず、composer lock が残り得ることにある。タイマー値を伸ばすより、stalled event 受信時に owner input path を復旧する方が drift が少ない。

## 検証計画

`test/worker.test.js` で Dashboard HTML が stalled transient status / thread failed status を受けた時に `releaseComposerForFollowUp` 相当を呼び、追加メッセージを送れる文言を持つことを確認する。`npm run build:worker` と `npm run check:generated-worker` で generated worker を同期する。

## 改修見積もり

- `src/worker/runtime.js`: Dashboard client script の WebSocket message handler。stalled / failed recovery status 受信時に composer を解放する helper と owner-facing 文言を追加する。リスクは通常送信中の未保存入力を誤って解放すること。
- `test/worker.test.js`: Dashboard HTML string assertion を追加/更新し、stalled recovery が follow-up input を許すことを固定する。
- `worker.js`: generated worker を build で同期する。

## 既に通っている経路

PR #721 は fixed timeout を activity watchdog 化した。PR #724 は stale client recovery を追加した。PR #725 は queue を Issue #590 に戻した。owner production evidence では stalled recovery 表示がまだ出ており、ここが現在の root symptom。

## 未確認の境界

app-server bridge が本当に CLI activity を受け取れていないのか、受け取っているが Dashboard thread に出していないのかは未確認。この PR では bridge heartbeat 根本修正までは扱わない。

## 穴が出そうな箇所

composer を解放しすぎると、保存確認前の送信を二重送信する恐れがある。`pendingOwnerSend` が残っている送信確認前は既存ロックを守り、stalled recovery 後の follow-up だけを解放対象にする。

## PR 前に確認すること

Issue #590、PR #725 merge truth、active queue の Now が Issue #590 であることを確認する。対象 source と tests を読んでから code edit する。

## 実装候補と捨てた案

採用: stalled / failed recovery 表示時に composer follow-up を明示的に解放し、文言で追加送信可能と伝える。

捨てた案: timeout をさらに伸ばす。無制限待機に近づき、本当に返らない時の復旧を壊すため。

捨てた案: stop/interrupt UI を同時に作る。公式アプリ調査が必要で、この owner input recovery slice から外れるため。

## merge 後に通す E2E

production Dashboard Butler で stalled recovery 表示が出た時、owner がそのまま同じ composer から「もしもし」などの追加メッセージを送れ、同じ thread に保存されることを確認する。

## 次の PR を増やさない理由

この PR は stalled 表示と composer follow-up の単一 owner-facing 穴を塞ぐ。bridge heartbeat / progress event の根本修正は別 scope として残るが、owner が連絡不能になる穴はこの PR で閉じる必要がある。

## 停止条件

実装中に bridge protocol 変更、deploy、passkey、root/VPS helper、stop/interrupt UI、または Issue #590 完了 claim が必要になったら停止する。
