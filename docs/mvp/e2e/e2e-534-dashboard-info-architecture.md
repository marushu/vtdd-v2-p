# E2E-534 Dashboard Butler Information Architecture

This document records concrete run evidence for Issue `#534`.

## Scope

Issue:
- `#534`

Goal:
- confirm Dashboard Butler starts as a chat-first owner-facing surface
- confirm notification/progress controls remain visible before debug/ops controls
- confirm the notification center keeps `最新通知` above settings and debug details
- confirm development and operations surfaces are isolated behind an explicitly named menu area
- confirm the mobile viewport does not introduce obvious horizontal clipping or an unreadable first screen

Non-goals:
- does not claim Issue `#514` Web Push live delivery is complete
- does not deploy to Cloudflare
- does not mutate credentials, permissions, passkey policy, or repository settings

## Happy-path Run

Command:

```sh
node --test test/worker.test.js
```

Observed result on 2026-05-26:
- passed
- confirms Dashboard initial shell is chat-first
- confirms the normal initial chat segment does not expose `Operational RAG`, `Deploy operator`, `GitHub workflows`, or old runtime-first wording
- confirms `Operational RAG`, `Deploy operator`, and `GitHub workflows` appear after `data-debug-section="dashboard-development-operations"`
- confirms the quick action set keeps `通知`, `進捗を見る`, and `GitHub状況` while removing the direct `RAG を読む` shortcut from the owner-facing top action set

## Mobile Visual Run

Commands:

```sh
/opt/homebrew/bin/firefox --headless --window-size=390,844 --screenshot=/Users/shuhei/hibou_works/vtdd-v2-p/tmp/e2e/issue-534/dashboard-mobile-390x844.png 'http://127.0.0.1:8794/dashboard?repository=sample-org/vtdd-v2-p'
/opt/homebrew/bin/firefox --headless --window-size=1280,900 --screenshot=/Users/shuhei/hibou_works/vtdd-v2-p/tmp/e2e/issue-534/dashboard-desktop-1280x900.png 'http://127.0.0.1:8794/dashboard?repository=sample-org/vtdd-v2-p'
/opt/homebrew/bin/firefox --headless --window-size=390,844 --screenshot=/Users/shuhei/hibou_works/vtdd-v2-p/tmp/e2e/issue-534/notifications-mobile-390x844.png 'http://127.0.0.1:8794/dashboard/notifications'
/opt/homebrew/bin/firefox --headless --window-size=390,844 --screenshot=/Users/shuhei/hibou_works/vtdd-v2-p/docs/mvp/e2e/assets/issue-534/notifications-mobile-event-390x844.png 'http://127.0.0.1:8796/dashboard/notifications'
```

Observed result on 2026-05-26:
- mobile screenshot generated at 390 x 844
- desktop screenshot generated at 1280 x 900
- notification center mobile screenshot generated at 390 x 844
- notification center mobile event screenshot generated at 390 x 844 with a long workflow/run URL event
- mobile first viewport shows the menu button, `VTDD Butler`, repository label, `通知`, `進捗`, chat messages, composer, and short connection state
- mobile first viewport does not show `Operational RAG`, `Deploy operator`, `GitHub workflows`, `Authority boundary`, `VAPID`, `payload_json`, or raw debug wording
- desktop first viewport shows the chat as the primary surface and keeps the development/operations menu as a side surface
- notification center first viewport shows `最新通知` before `iOS PWA 通知`
- notification center explanatory copy is collapsed under `通知センターについて`, after `最新通知`
- notification center event card wraps `deploy-production completed with long workflow/run URL...` without horizontal clipping in a 390 px viewport
- notification center first viewport does not show `Authority boundary`, `payload_json`, or raw key material
- visual inspection found no obvious horizontal clipping in the first viewport

## Evidence Files

- `src/worker/runtime.js`
- `worker.js`
- `test/worker.test.js`
- `docs/mvp/e2e/assets/issue-534/dashboard-mobile-390x844.png`
- `docs/mvp/e2e/assets/issue-534/dashboard-desktop-1280x900.png`
- `docs/mvp/e2e/assets/issue-534/notifications-mobile-390x844.png`
- `docs/mvp/e2e/assets/issue-534/notifications-mobile-event-390x844.png`
- `test/e2e-534-dashboard-info-architecture.test.js`

Screenshot hashes:
- `dashboard-mobile-390x844.png`: `8d77a312e4fbcb1fa7d05d0f5e470bf8f677b2186523a60769957a41b040f147`
- `dashboard-desktop-1280x900.png`: `2821dbc25cf04fa7bbca5a28ff0cd736987783c45aff84358d479a4017f03d3d`
- `notifications-mobile-390x844.png`: `520bc794ae250a65443529664f6496362c060cefad720a9ce1a410c24b296fe1`
- `notifications-mobile-event-390x844.png`: `db8779fabb29d3eed19dc8c4e034ef2ee5221fe297b181470922f6262f698fcc`

## Current Reading

Issue `#534` now has code-level section-order tests and mobile/desktop visual
evidence for the Dashboard initial shell. This is still not a claim that all
Dashboard Butler capabilities are complete, and it does not close Issue `#514`
or any deploy/Web Push live-delivery issue.
