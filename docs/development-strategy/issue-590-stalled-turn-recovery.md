# Issue #590: stalled turn recovery

## 完了体験

Dashboard Butler の通常チャットで Codex app-server の返答が時間内に戻らなくても、owner は「壊れた」「返信が消えた」と感じずに復旧できる。

timeout は会話の終点ではなく、`stalled` として扱う。元入力は保存済みで、owner は待つ、同じ内容でもう一度実行する、短くして再送する、キャンセルする、の選択肢を持つ。遅れて返信が届いた場合は、同じ thread に late completion として追加する。

## 対象 Issue

- Issue #590: app-server turn timeout recovery
- Related: Issue #450, Issue #413, Issue #444

## Success Criteria

- timeout event は `failed` ではなく復旧可能な `stalled` state として Dashboard thread に残る。
- timeout event は retryable recovery metadata を持つ。
- owner-facing text は raw English timeout を出さず、保存済み、再実行、短縮再送、キャンセル、late completion を説明する。
- timeout 後に late completion が来た場合、遅れて届いた返信として thread に追加する。
- 既存の app-server bridge queue release は維持する。

## Non-goals

- Codex app-server 自体の性能改善は扱わない。
- 自動再実行はしない。
- deploy / credential / permission / root / sudo は扱わない。
- iPhone lock/suspend reconnect 全体は Issue #579 側に残す。
- full UI redesign は Issue #528 / #413 側に残す。

## 原因仮説

PR #719 で永久停止を防ぐ default timeout は入ったが、timeout が `failed` に寄りすぎると、owner は元依頼が失われたように感じる。VTDD の通常運用では、timeout 後も元入力を保持し、再実行や短縮再送に進めることが必要。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: timeout event に `recovery` metadata を追加し、late completion を明示する。
- `src/worker/runtime.js`: timeout event を `stalled` chat message として保存する。
- `test/dashboard-app-server-bridge.test.js`: recovery metadata と late completion text を固定する。
- `test/worker.test.js`: stalled message と owner-facing text を固定する。
- `worker.js`: worker build で生成物を更新する。

## 検証計画

- `node --test test/dashboard-app-server-bridge.test.js --test-name-pattern "timeout|late completion"`
- `node --test test/worker.test.js --test-name-pattern "app-server timeout"`
- `npm run build:worker`
- `npm run check:generated-worker`

## 残リスク

この slice は recovery metadata と表示状態を固定する。実際の再実行ボタン、短縮再送UI、通知連携は次の #590/#413/#444 slice で扱う。

