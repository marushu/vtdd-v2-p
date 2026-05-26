# Issue #565 Dashboard Connection Status Local E2E

## Scope

Dashboard Butler の通常チャット面で、接続復帰ステータスが composer 周辺に居座らず、本文読解と送信操作を邪魔しないことを確認した。

## Environment

- Date: 2026-05-26 JST
- Runtime: authenticated local Worker harness at `http://127.0.0.1:8800/dashboard`
- Browser: Chrome headless via CDP
- CSS viewport: 390 x 844
- Device scale factor: 1

## Scenario

1. owner identity 相当の local harness で `/dashboard?repository=marushu%2Fvtdd-v2-p` を開く。
2. 5 秒相当の virtual time 後に mobile screenshot を取得する。
3. composer 周辺に `接続が切れました` / `履歴を確認しながら復帰しています` / `WebSocket` などの接続復帰ステータスが居座っていないことを確認する。
4. HTML contract で `.composer-status:empty` があり、temporary status が消えた後に余計な reserved space を残さないことを確認する。
5. owner action が必要なログイン切れ / 送信確認 timeout / fallback failure の永続表示は維持する。

## Commands

```bash
PORT=8800 node .tmp/serve-authenticated-dashboard.mjs
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new \
  --remote-debugging-port=9223 \
  --user-data-dir=/tmp/vtdd-cdp-565-dsf1 \
  --disable-gpu \
  about:blank
node .tmp/cdp-e2e-565.mjs
```

## Result

- Passive reconnect / recovery status now uses temporary status and clears.
- `composer-status:empty` removes reserved status height.
- First-view chat surface no longer shows the always-visible connection pill.
- Owner-action-required messages remain in the runtime for login expiry, send timeout, and fallback failure.
- CDP assertion: `viewportWidth=390`, `scrollWidth=390`, so the evidence viewport has no horizontal overflow / clipping.
- CDP assertion: `statusText=""`, `statusMinHeight="0px"`, `statusPaddingLeft="0px"`, so the cleared status no longer reserves composer space.

## Evidence

- `docs/mvp/e2e/assets/issue-565/local/dashboard-composer-status-cleared-mobile.png`
