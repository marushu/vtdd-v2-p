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

## What This Does Not Prove

- This is not production Cloudflare live evidence.
- This is not an installed iOS PWA evidence run.
- This does not prove real iPhone file picker MIME behavior or video file selection.
- This does not complete the Butler Completion Gate for Issue #587.

## Commands

```bash
PORT=8801 node .tmp/serve-authenticated-dashboard.mjs
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl boot C2AA908B-0062-4C7F-BDDD-195C0F4FB861
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl openurl C2AA908B-0062-4C7F-BDDD-195C0F4FB861 'http://127.0.0.1:8801/dashboard?repository=marushu%2Fvtdd-v2-p&fresh=issue-587-video-rebased'
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl io C2AA908B-0062-4C7F-BDDD-195C0F4FB861 screenshot docs/mvp/e2e/assets/issue-587/local/ios-simulator-dashboard-video-ui.png
```

## Evidence

- `docs/mvp/e2e/assets/issue-587/local/ios-simulator-dashboard-video-ui.png`
