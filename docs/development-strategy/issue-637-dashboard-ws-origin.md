# Issue #637 Dashboard WebSocket origin strategy

## 完了体験

Owner は Dashboard Butler の通常チャットで VPS runner status intent を送る。Butler が返す passkey approval URL は、常に owner が開いている production Dashboard と同じ origin になり、`dashboard-butler.local` のような内部 fallback URL は表示されない。

## VTDD 全体で進める部分

Issue #637 の Dashboard Butler live E2E で見つかった WebSocket owner turn の origin drift を塞ぐ。#707 の passkey auto-continue 自体は維持し、そこへ到達する approval URL を production same-origin に固定する。

## 設計

DashboardChatRoom が WebSocket 接続を受けた時点の request origin を socket attachment に保持する。owner message 処理では、その origin を VPS maintenance natural-language flow に渡す。明示 origin がある場合は `VTDD_RUNTIME_URL` / `VTDD_PASSKEY_ORIGIN` より優先し、最後の fallback としてのみ `dashboard-butler.local` を残す。

## 仮説

HTTP Dashboard chat route は request origin を使うが、WebSocket DashboardChatRoom は env fallback だけで approval URL を作るため、本番 env に `VTDD_RUNTIME_URL` が無いと `dashboard-butler.local` が漏れるという仮説。

## 検証計画

DashboardChatRoom の unit test で env に runtime URL が無い状態でも attachment origin から production approval URL が生成され、`dashboard-butler.local` が出ないことを確認する。worker build と `npm run verify:worker` を通す。merge/deploy 後に production Dashboard Butler live E2E で approval URL が production origin になることを確認する。

## 改修見積もり

- `src/worker/runtime.js`: `DashboardChatRoom.acceptSocket` attachment、`handleSocketMessage` から `acceptOwnerMessage` への origin 伝搬、`buildVpsMaintenanceIntentMessages` の origin 優先順。
- `test/worker.test.js`: DashboardChatRoom WebSocket origin regression test。
- `worker.js`: generated worker。

## 既に通っている経路

#707 で Dashboard Butler の passkey URL に `dashboardThreadId` を含め、operator page が承認後に same thread へ戻す JS は production route に載っている。

## 未確認の境界

Production deploy 後の実 Dashboard WebSocket での owner turn、passkey 承認、helper queue 自動継続は merge/deploy 後に再度 live E2E が必要。

## 穴が出そうな箇所

app-server bridge socket も attachment origin を持つが、今回の origin は Dashboard owner turn の approval URL 生成だけに使う。env fallback を完全に消すと内部テストや非標準 runtime が壊れるため、明示 origin がない場合の fallback は残す。

## PR 前に確認すること

Issue #637、#707 の live E2E failure、DashboardChatRoom source、worker tests、generated worker、PR body guardrail を確認する。

## 実装候補と捨てた案

採用案は WebSocket request origin を attachment に保存して owner turn に渡す。捨てた案は production env に `VTDD_RUNTIME_URL` を足すだけの運用修正、URL 文字列をあとから置換する案、owner に手で URL host を直させる案。

## merge 後に通す E2E

Production deploy 後、Dashboard Butler の新規 thread で VPS runner status intent を送る。approval URL が `https://vtdd-v2-mvp.polished-tree-da7c.workers.dev/...` で、`dashboardThreadId` を持ち、`dashboard-butler.local` を含まないことを確認する。その後 passkey 承認で helper queue へ自動継続する。

## 次の PR を増やさない理由

この slice は live E2E で見えた root cause の origin 伝搬だけを直す。#707 の auto-continue 設計を広げず、env 設定や通知 system に逃げないため、同じ穴からの後続 PR を増やさない。

## 停止条件

WebSocket request origin が取得できない、production URL が still local fallback になる、または approval URL を作るために owner-specific static URL を repo に埋める必要が出た場合は停止する。
