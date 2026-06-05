# Issue #613 single main chat runtime consolidation

## 完了体験

Dashboard Butler は repo を URL や runtime event で受け取っても、通常チャット thread を `dashboard-main-unresolved` の single main chat に集約する。owner は repo 別 thread を意識せず、repo / Issue / PR / deploy は同じ chat 内の work context として扱う。

## VTDD 全体で進める部分

Issue #613 の single main chat 方針を runtime に反映する。Issue #741 の bridge restart handoff も同じ main chat に戻し、repo 固定 `dashboard-main-<owner>-<repo>` thread を再生成しない。

## 設計

- repo 未指定・repo 指定の Dashboard shell はどちらも `dashboard-main-unresolved` を既定 thread にする。
- HTTP chat turn の既定 thread も repo 派生にしない。
- GitHub Actions / deploy follow-up / VPS runner event の既定 Dashboard thread を `dashboard-main-unresolved` にする。
- 既存の repo 固定 thread id が明示入力された場合も、`dashboard-main-<owner>-<repo>` 形式なら single main chat に正規化する。

## 仮説

repo 固定 thread が残っていた原因は bridge service ではなく、Worker が repository から `dashboard-main-marushu-vtdd-v2-p` を既定生成する複数経路である。ここを止めると app-server bridge restart 後も repo-less bridge だけが owner-facing main chat として使われる。

## 検証計画

- Unit: repository 指定 Dashboard shell が `dashboard-main-unresolved` を使う。
- Unit: repository 指定 HTTP chat turn が `dashboard-main-unresolved` に保存される。
- Unit: deploy event / VPS runner event が `dashboard-main-unresolved` に append / broadcast される。
- Build: `npm run build:worker` と `npm run check:generated-worker`。
- Regression: focused `node --test test/worker.test.js` の関連 tests。

## 改修見積もり

- `src/worker/runtime.js`: main chat thread id helper、Dashboard shell、HTTP chat turn、GitHub Actions event、VPS runner event の thread normalization。
- `test/worker.test.js`: repo 指定時と runtime event 時の expected thread を single main chat に更新。
- `worker.js`: generated worker 更新。

## 既に通っている経路

- VPS production では `vtdd-dashboard-app-server-bridge-unresolved.service` だけが active。
- repo 固定 `vtdd-dashboard-app-server-bridge.service` は inactive / disabled。
- Issue #613 には single main chat / cross-repo work context 方針が記録済み。

## 未確認の境界

- Durable Object に残る過去の `dashboard-main-marushu-vtdd-v2-p` 履歴はこの PR では削除しない。
- VPS env file `~/.config/vtdd/dashboard-ws.env` の削除や変更は passkey 境界であり、この PR では実施しない。
- Custom GPT Action Schema の thread id 入力互換は、明示 thread id の正規化で吸収する。

## 穴が出そうな箇所

- 実行 event が explicit old thread id を持つ場合、古い thread に戻る可能性がある。repo 派生 main thread id は single main chat に正規化する。
- repo 必須操作の authority boundary を弱めると VTDD の no default repository invariant を壊す。thread は single でも repository metadata は保持する。
- 古い E2E fixtures が repo 固定 thread を前提にしている可能性がある。

## PR 前に確認すること

- Issue #613 の single main chat 方針と矛盾しない。
- Issue #741 の repo-less bridge restart handoff が `dashboard-main-unresolved` に戻る。
- repo metadata は messages / events / approval scopes に残る。
- 未追跡 E2E asset を混ぜない。

## 実装候補と捨てた案

- 採用: Worker の thread id 既定値と repo 派生 main thread 正規化を修正する。
- 捨てた案: VPS 全体 reboot。server 健康値は正常で、今回の問題は thread routing / bridge lifecycle であるため。
- 捨てた案: Durable Object 履歴の削除。過去証跡を壊し、今回の「今後起動しない」要求を超える。
- 捨てた案: repo metadata を消す。authority boundary と runtime truth が壊れる。

## merge 後に通す E2E

- production deploy 後、repo 指定あり Dashboard URL でも `data-thread-id="dashboard-main-unresolved"` になることを確認する。
- repo-less main chat で短文を送り、app-server reply が同じ thread に返ることを確認する。
- deploy success / VPS runner event が `dashboard-main-unresolved` に届き、repo 固定 thread に新規 append しないことを確認する。

## 次の PR を増やさない理由

この PR は repo 固定 thread 再生成を止める runtime 入口をまとめて塞ぐ。VPS env file の削除は passkey 境界なので別操作だが、通常 runtime が repo 固定 thread を再生成する穴はこの slice で閉じられる。

## 停止条件

- repository metadata を消さないと実装できない場合。
- VPS env / systemd / credential / permission mutation が必要になった場合。
- deploy や Durable Object 履歴削除が必要になった場合。
