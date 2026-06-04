# Issue #590: context window reset and retry

## 完了体験

Dashboard Butler で既存 backend `codexThreadId` が context window exceeded になっても、owner は同じ Dashboard thread のまま続けられる。runtime は失敗理由を `context_window_exceeded` として扱い、古い backend mapping を破棄し、同じ owner 入力を新しい app-server backend thread へ一度だけ自動再送する。

## VTDD 全体で進める部分

Issue #590 の app-server failure recovery。PR #785 は新規 prompt の肥大化を止めたが、既に膨らんだ backend thread には効かない。今回は既存 backend thread が詰まった状態からの復旧を実装する。

## 設計

bridge は context window exceeded の失敗を media/generic failure と分け、`recovery.status=context_window_exceeded`、`originalText`、`originalMessageId`、`resetBackendThread=true` を Worker へ送る。

Worker は該当 failure を受けたら `app_server_thread:<dashboardThreadId>` mapping を削除する。接続中の app-server bridge socket があり、同じ owner message の auto retry がまだ実行されていなければ、同じ owner text を `codexThreadId=null` で再 dispatch する。

自動 retry は一度だけにする。再 retry 失敗時は owner-facing recovery message を残し、無限再送しない。

## 仮説

suspected cause は、PR #785 deploy 後も Dashboard PWA が同じ `codexThreadId` を resume し、すでに context window exceeded になった app-server backend thread に再投入していること。prompt を軽くしても既存 backend thread の履歴は消えないため、mapping reset が必要。

## 検証計画

- bridge unit: context window exceeded failure に recovery metadata が付く。
- Worker unit: context window exceeded failure で app-server thread mapping を clear する。
- Worker unit: context window exceeded failure 後、同じ owner input を fresh backend thread として一度だけ auto redispatch する。
- Worker unit: auto retry 済み failure では再 dispatch しない。
- `npm run build:worker`、`npm run check:generated-worker`、`npm run verify:worker`。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: failure text builder と failure event に context window recovery metadata を追加する。
- `src/worker/runtime.js`: mapping clear helper、normalized recovery metadata、auto retry logic を追加する。
- `test/dashboard-app-server-bridge.test.js`: context window exceeded recovery metadata test。
- `test/worker.test.js`: mapping clear / redispatch tests。
- `worker.js`: generated bundle update。

## 既に通っている経路

DashboardChatRoom は `codexThreadId` mapping を保存し、次 owner turn で `thread/resume` する。PR #785 で ordinary prompt は lean になった。

## 未確認の境界

production app-server が context window exceeded を `turn/completed failed` notification として出すか、request error として出すかは完全には未確認。両方の text に対して recovery classification を行う。

## 穴が出そうな箇所

auto retry が無限ループになること。別 owner message を誤って再送すること。bridge socket が既に閉じている場合に再送できないこと。

## PR 前に確認すること

latest `origin/main` branch、open PR 0、targeted tests、full `verify:worker`、untracked E2E assets を stage しないこと。

## 実装候補と捨てた案

採用: context window exceeded の時だけ mapping clear + same input one-shot retry。

捨てた案: 全 failure で backend thread reset。原因が transient / media / approval の場合に文脈喪失が大きすぎる。

## merge 後に通す E2E

mapped E2E として production Dashboard Butler の同じ thread で `もしもし` を送り、context window exceeded が出ずに fresh backend thread へ復旧することを確認する。再発時は recovery message が無限増殖しないことを見る。

## 次の PR を増やさない理由

PR #785 の prompt lean 化だけでは既存詰まり thread を復旧できない。context exceeded の分類、mapping reset、one-shot retry は同じ owner-facing recovery の一塊。

## 停止条件

retry に high-risk authority、deploy、credential、permission、root helper mutation が必要になる場合は停止する。context exceeded 以外の failure に reset を広げる必要が出た場合も scope を再確認する。
