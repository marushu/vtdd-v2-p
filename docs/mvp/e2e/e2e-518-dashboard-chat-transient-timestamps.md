# E2E-518 Dashboard Chat Transient Status And Timestamps

This document records concrete run evidence for Issue `#518`.

## Scope

Issue:
- `#518`

Goal:
- confirm Dashboard Butler chat messages show subtle timestamps
- confirm owner / Butler / system timestamps fit in an iPhone-width layout
- confirm app-server progress stages are mapped to owner-facing Japanese transient status
- confirm transient progress still updates composer status while selected safe
  stages may also persist as short Butler progress checkpoints
- confirm final app-server replies return transient status to the normal connected state

Non-goals:
- does not deploy to Cloudflare
- does not mutate credentials, permissions, passkey policy, or repository settings
- does not claim all Dashboard Butler or app-server runner capabilities are complete
- does not close Issue `#518`

## Happy-path Run

Command:

```sh
node --test test/worker.test.js
```

Observed result on 2026-05-26:
- passed
- confirms Dashboard inline chat renderer contains `message-meta` timestamp rendering
- confirms `transient_status` is handled as composer status, and selected safe
  stages can also create short Butler progress checkpoints
- confirms `app_server_reply` is persisted as a Butler message and also returns transient status to `Dashboard thread 接続済み。`
- confirms app-server stages map to owner-facing Japanese transient labels:
  - `既存 Issue / PR / docs を確認しています。`
  - `新しい Issue 本文を作成しています。`
  - `GitHub に Issue を作成しています。`
  - `bounded change contract を確認しています。`
  - `topic branch を作成しています。`
  - `実装に入っています。`
  - `テストを実行しています。`
  - `PR本文を作成しています。`
  - `PRを作成しています。`
  - `CI / reviewer を待っています。`
  - `reviewer 指摘を反映しています。`

## Mobile Visual Run

Command:

```sh
firefox --headless --window-size=390,844 --screenshot=docs/mvp/e2e/assets/issue-518/dashboard-chat-timestamps-mobile-390x844.png 'http://127.0.0.1:8800/dashboard?repository=sample-org/vtdd-v2-p'
```

Observed result on 2026-05-26:
- mobile screenshot generated at 390 x 844
- run was a local mobile-width browser visual probe; it is not a production Cloudflare deploy or production iPhone/PWA live claim
- screenshot fixture uses the Dashboard HTML/CSS surface with owner, Butler, and system message bubbles
- today's messages show short time labels such as `10:18` and `10:19`
- previous-day message shows a date plus time label: `5/25 23:21`
- timestamp text is visually secondary to message body text
- owner copy button, Butler copy button, message body, and composer controls are not horizontally clipped in the 390 px viewport
- transient status is not represented as a chat message in this visual fixture;
  production progress checkpoints are covered by the app-server bridge tests

## Evidence Files

- `src/worker/runtime.js`
- `worker.js`
- `test/worker.test.js`
- `docs/mvp/e2e/assets/issue-518/dashboard-chat-timestamps-mobile-390x844.png`
- `test/e2e-518-dashboard-chat-transient-timestamps.test.js`

Screenshot hash:
- `dashboard-chat-timestamps-mobile-390x844.png`: `f752e0f0d664aeab77f5d3a6fdfa925548137f34c86aafa377432271f177320e`

## Current Reading

Issue `#518` now has code-level evidence for timestamp rendering, transient
status rendering, selected safe progress checkpoint persistence,
owner-facing stage mapping, and final connected-state reset.
It also has mobile-width visual evidence for timestamp layout. This is not a
production deploy claim and does not close the Issue by itself.
