# Issue #562 Dashboard Chat Copy / Link Local E2E

実行日: 2026-05-26

## 対象

- Issue: #562
- PR: #564
- Branch: `codex/issue-562-message-copy-actions`
- Runtime: local Worker harness at `http://127.0.0.1:8787/dashboard?repository=marushu%2Fvtdd-v2-p`

## 結果

- iOS Simulator で Dashboard chat first view を表示できた。
- Chrome mobile/touch CDP E2E で owner message の copy action が初期表示では非表示で、tap 後に到達可能になることを確認した。
- owner bubble 内 link color が bubble background と同化しないことを確認した。

## E2E Output

```json
{
  "ok": true,
  "initial": {
    "hasBubble": true,
    "linkText": "https://example.com/issue-562",
    "bubbleBackground": "rgb(23, 23, 23)",
    "linkColor": "rgb(158, 231, 255)",
    "opacity": "0",
    "pointerEvents": "none"
  },
  "revealed": {
    "className": "bubble owner has-copy-action actions-visible",
    "opacity": "0",
    "pointerEvents": "auto"
  },
  "linkContrast": {
    "hasBubble": true,
    "linkText": "https://example.com/issue-562",
    "bubbleBackground": "rgb(23, 23, 23)",
    "linkColor": "rgb(158, 231, 255)"
  }
}
```

`revealed.opacity` は tap 直後の transition 開始時の値。E2E はその後 `opacity !== "0"` になるまで待機してから pass している。

## Evidence

- `docs/mvp/e2e/assets/issue-562/local/ios-simulator-dashboard-chat-initial.png`
- `docs/mvp/e2e/assets/issue-562/local/chrome-mobile-initial.png`
- `docs/mvp/e2e/assets/issue-562/local/chrome-mobile-tap-reveal.png`
- `docs/mvp/e2e/assets/issue-562/local/chrome-mobile-owner-link.png`

## Gap Found

ローカル harness では Dashboard chat room WebSocket が使えないため、composer 下に `接続が切れました。履歴を確認しながら復帰しています。` が表示され続ける。この接続復帰ステータスが通常チャット面を邪魔する UX は #562 の copy/link 修正とは別スコープとして Issue #565 に切り出した。

