# Issue #845 Dashboard Mission Runtime — mapped local E2E

## Purpose

Issue #845 の Dashboard Mission Runtime slice について、owner が目的だけを通常チャット相当の `owner_message` として送った後、その goal が DashboardChatRoom の durable Mission、`app_server_turn_requested`、VPS bridge prompt context まで同じ Mission truth として届くことを CI で検証する。

## Executable evidence

- Test: `test/issue845-dashboard-mission-runtime-e2e.test.js`
- Entry surface: `DashboardChatRoom.webSocketMessage(... owner_message ...)`
- Durable state: `business_mission_active:<threadId>`
- Handoff: `app_server_turn_requested.businessMission`
- VPS prompt: `buildDashboardTurnInputText()`

## Happy path

1. Owner turn: `TOMIO を売れる状態まで持っていって`
2. `product_launch` Mission が active で作成される。
3. durable state と app-server request で同じ Mission ID / owner goal を保持する。
4. owner-facing summary の next automatic work は `research`。
5. VPS prompt に Mission / workstream / coordination rule / authority rule が入る。
6. `今どこまで進んだ？` は同じ Mission ID を再利用する。

## Boundary path

- `今日は何月何日？日本時間を答えて` は active Mission を削除しないが、その turn の app-server request には `businessMission=null` として Mission context を混ぜない。
- `hibou の問い合わせを一つも漏らさず全部処理して` は TOMIO Mission と別種の strong goal と判断し、新しい `customer_inquiry` Mission へ切り替える。
- superseded TOMIO Mission record は `cancelled` と `supersededByMissionId` を保持する。
- Mission は merge / deploy / spend / external publish / contract / credential / permission / destructive authority boundary を解除しない。

## Completion reading

この E2E は local mapped runtime evidence であり、production iPhone/PWA live truth、structured workstream reconciliation、standing Mission execution authority、external connector execution を証明しない。Issue #845 全体 completion は未達のまま扱う。
