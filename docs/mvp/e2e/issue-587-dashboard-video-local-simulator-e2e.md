# Issue #587 Dashboard video attachment local Simulator check

## Scope

- PR: #588
- Issue: #587
- Runtime: local authenticated dashboard harness at `http://127.0.0.1:8801/dashboard?repository=marushu%2Fvtdd-v2-p&fresh=issue-587-video-rebased`
- Device: iOS Simulator, iPhone 17 Pro, iOS 26.5

## What This Proves

- Dashboard Butler opens in iOS Simulator Safari after PR #584 was merged and PR #588 was rebased onto latest `main`.
- The normal chat viewport is not visibly broken by the combined multiple-attachment and video-preview changes.
- The composer `+` attachment entrypoint remains visible in the first mobile viewport.
- Tapping the composer `+` opens the iOS attachment menu with `写真ライブラリ`, `写真またはビデオを撮る`, and `ファイルを選択`.

## What This Does Not Prove

- This is not production Cloudflare live evidence.
- This is not an installed iOS PWA evidence run.
- This does not prove real iPhone file picker MIME behavior or video file selection.
- This does not prove completed media selection from the Photos picker. The Simulator coordinate tap for `写真ライブラリ` was not reliable enough to claim selected-video preview evidence.
- This does not complete the Butler Completion Gate for Issue #587.

## Commands

```bash
PORT=8801 node .tmp/serve-authenticated-dashboard.mjs
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl boot C2AA908B-0062-4C7F-BDDD-195C0F4FB861
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl openurl C2AA908B-0062-4C7F-BDDD-195C0F4FB861 'http://127.0.0.1:8801/dashboard?repository=marushu%2Fvtdd-v2-p&fresh=issue-587-video-rebased'
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl io C2AA908B-0062-4C7F-BDDD-195C0F4FB861 screenshot docs/mvp/e2e/assets/issue-587/local/ios-simulator-dashboard-video-ui.png
ffmpeg -y -f lavfi -i color=c=black:s=320x180:d=1 -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac test-results/issue-587/sample-dashboard-video.mp4
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl addmedia C2AA908B-0062-4C7F-BDDD-195C0F4FB861 test-results/issue-587/sample-dashboard-video.mp4
osascript -e 'tell application "System Events" to tell process "Simulator" to click at {1384, 848}'
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl io C2AA908B-0062-4C7F-BDDD-195C0F4FB861 screenshot docs/mvp/e2e/assets/issue-587/local/ios-simulator-dashboard-video-picker.png
```

## Evidence

- `docs/mvp/e2e/assets/issue-587/local/ios-simulator-dashboard-video-ui.png`
- `docs/mvp/e2e/assets/issue-587/local/ios-simulator-dashboard-video-picker.png`
