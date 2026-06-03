# Issue #722 completion event thread state 作戦図

## 完了体験

owner が「マージされた」「デプロイ完了」と手で補足しなくても、GitHub Actions から届いた deploy completion event が Dashboard Butler の同じ thread に残る。

Butler thread には「何が完了したか」「次に何を確認するか」「高リスク操作は自動実行していないこと」が短い system message として表示される。iPad / iPhone で別アプリへ移動して戻っても、通知センターだけでなく chat thread の履歴から状態を追える。

## VTDD 全体で進める部分

今回は Issue #722 のうち、deploy completion event を thread truth へ接続する最初の実装 slice にする。

進行中 narration、reviewer approve、auto-merge の全種類を同時に広げると、event source と authority boundary が混ざる。まず既存 production workflow がすでに送っている `/v2/events/github-actions` を起点に、通知だけで終わる gap を潰す。

## 設計

`handleGitHubActionsEventRequest` は machine auth 済みの GitHub Actions event を受け、`recordDashboardNotificationEvent` で dashboard event store と Web Push へ保存している。

ここに Dashboard chat store への append を追加する。ただし通知保存と chat append のどちらか片方だけが成功した状態を放置しないよう、VPS runner event と同じく chat append 失敗時は dashboard event を rollback する。

thread は payload の `threadId` があればそれを使う。なければ repository から `dashboard-main-<owner-repo>` を導出する。これは repo-less main chat の将来対応とは分ける。

## 仮説

今の owner 体験が「通知は来るが thread に残らない」になっている理由は、deploy completion route が `DASHBOARD_EVENT_STORE` と Web Push のみを使い、`DASHBOARD_CHAT_STORE` に書いていないため。

既存の VPS runner event は `DASHBOARD_CHAT_STORE` と `DASHBOARD_CHAT_ROOMS` に接続済みなので、そのパターンを GitHub Actions deploy completion に限って再利用すれば、iPad sleep / app switch 復帰後の「何が起きたか分からない」体験を下げられる。

狭く「通知センターの文言だけ」を直すと、owner が求めている「この chat 上に自動で残る」が解決しない。

## 検証計画

- Unit: GitHub Actions deploy completion event が dashboard event store に保存され、同時に Dashboard Butler thread へ system message として append される。
- Unit: owner-facing message が `PR #...` / `Issue #...` と種別付きで表示され、bare `#...` を主表現にしない。
- Unit: 同じ deploy event が再送されても同じ messageId で置換され、thread に重複追加されない。
- Integration: chat append 失敗時は dashboard event を rollback し、通知だけが残る状態を防ぐ。
- Build: `npm run build:worker`
- Generated check: `npm run check:generated-worker`
- Worker test: `node --test test/worker.test.js`

## 改修見積もり

| path | 境界 | 変更 | risk |
| --- | --- | --- | --- |
| `src/worker/runtime.js` | `handleGitHubActionsEventRequest` | deploy completion event の chat append と broadcast を追加 | event store / chat store 片側成功の扱いを誤ると runtime truth が割れる |
| `src/worker/runtime.js` | formatter helper | owner-facing deploy completion message を生成 | 長文・bare `#...`・secret 混入の risk |
| `test/worker.test.js` | deploy completion tests | thread append / dedupe / rollback を追加 | 既存通知テストとの fixture ずれ |
| `worker.js` | generated worker | source 変更を反映 | generated mismatch |

## 既に通っている経路

- `/v2/events/github-actions` は machine auth 付き event を受けられる。
- dashboard event store は deploy event を保存できる。
- Web Push は deploy completion の owner-facing copy を作れる。
- VPS runner event は通知と Butler chat thread の両方へ書ける。

## 未確認の境界

- reviewer approve / auto-merge event の production event source は今回まだ実装しない。
- repo-less main chat と repository thread の最終統合は Issue #613 側の設計が必要。
- deploy 後 E2E を自動起動するかは authority boundary と runner queue の別 Issue。

## 穴が出そうな箇所

- `DASHBOARD_CHAT_STORE` が未設定の environment で deploy event を受けた時の挙動。
- duplicate webhook / workflow retry で同じ event が複数回届く場合。
- `threadId` 未指定時に owner が見ている thread と導出 thread がズレる場合。

## PR 前に確認すること

- topic branch が `origin/main` から切られていること。
- `.tmp/` と `test-results/` は成果物に含めないこと。
- PR body は日本語 first で、Issue #722 の criteria と未完部分を明示すること。

## 実装候補と捨てた案

採用案: deploy completion route に chat append を追加し、既存 event store / Web Push / chat room broadcast を接続する。

捨てた案: 通知センター UI だけに「次 action」を出す。chat thread に残らず、#722 の owner-facing completion event にならない。

捨てた案: reviewer / auto-merge / deploy を一括で作る。event source が異なり、authority boundary と検証が膨らむため、今回の PR が大きくなりすぎる。

## merge 後に通す E2E

production deploy completion event を発生させ、Dashboard Butler thread に system message が残ることを確認する。

owner が別アプリへ移動して戻っても、同じ thread で直近 deploy 完了と次 action を読めることを確認する。

## 次の PR を増やさない理由

この PR は Issue #722 の全完了ではなく、deploy completion の既存 event source を thread state へ接続する最小 slice である。reviewer approve / auto-merge / long-running progress は event source と UI persistence が別なので、同じ PR に混ぜない。

## 停止条件

- deploy completion event の chat append に必要な store が production で未設定と分かった場合。
- rollback なしで通知だけ残る状態しか作れない場合。
- threadId 導出が repository owner の通常 thread と矛盾すると分かった場合。
- 実装中に deploy / merge / credential / permission mutation が必要になった場合。
