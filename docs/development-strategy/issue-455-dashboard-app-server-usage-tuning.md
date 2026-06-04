# Issue #455 Dashboard app-server usage tuning 作戦図

## 完了体験

Dashboard Butler は Worker 内で AI 風に答えず、通常会話も VPS Dashboard Bridge / `codex app-server` へ中継する。そのうえで、VPS 側の `codex app-server` は operator が明示した軽量 model / reasoning effort で起動でき、Dashboard runtime truth に「この bridge はどの cost profile で動いているか」が出る。

owner は iPhone/iPad から Butler を使い続ける時、Mac Codex より減り方が遅い通常会話に近い設定を VPS 側でも試せる。設定が未指定なら既存の Codex config を使い、勝手に model を決めない。

## VTDD 全体で進める部分

Issue #455 の「重い処理を実行する前に消費境界を示す」「VTDD 自身で使用枠を食い潰さない」部分を、Dashboard app-server bridge の起動設定に狭く接続する。

PR #764 で Worker の lightweight AI 風回答は止めた。今回の slice はその方針を戻さず、VPS Codex CLI 側の起動コスト profile を制御可能にする。

## 設計

`scripts/run-dashboard-app-server-bridge.mjs` に app-server command args builder を追加する。既定は現在と同じ `codex app-server --listen stdio://`。環境変数で次を指定できるようにする。

- `VTDD_DASHBOARD_APP_SERVER_MODEL`: `-c model="<value>"` として app-server に渡す。
- `VTDD_DASHBOARD_APP_SERVER_REASONING_EFFORT`: `-c model_reasoning_effort="<value>"` として app-server に渡す。
- `VTDD_DASHBOARD_APP_SERVER_PROFILE`: runtime truth の表示用 profile 名。未指定なら `default`.

bridge connected event の `bridgeLifecycle.costBoundary` に profile / model configured / reasoning effort configured / Codex will start を出す。値自体は secret ではないが、runtime truth では「設定済みか」と実値を短く出すだけにし、token や grant は含めない。

## 仮説

いまの VPS service は `node scripts/run-dashboard-app-server-bridge.mjs` が `JsonLineAppServerClient` を既定 args で作るため、app-server は VPS の `~/.codex/config.toml` 既定 model / reasoning effort で起動する。Dashboard Butler の通常会話がすべてこの app-server に流れる設計に戻したため、VPS 側の既定が重い場合、通常会話まで高消費になる。

狭く patch するなら、app-server 起動 args の明示 override だけでよい。Worker に分類回答を戻すと PR #764 の核心条件を壊すため採用しない。

## 検証計画

- Unit: app-server args builder が未指定時に既存 args を返す。
- Unit: model / reasoning effort env が `-c model=...` / `-c model_reasoning_effort=...` を追加する。
- Unit: parse args と connected event が cost profile truth を含む。
- Integration: bridge initialization は repo sync preflight 後に configured args で app-server client を作る。
- Local: `node --test test/dashboard-app-server-bridge.test.js`
- Worker generated file は触らない想定。触った場合のみ `npm run build:worker` と `npm run verify:worker` を追加する。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: app-server args builder、parseBridgeArgs、runDashboardAppServerBridge、connected event に cost profile を追加。リスクは app-server CLI args のクォート不備。
- `test/dashboard-app-server-bridge.test.js`: protocol request、args parse、client creation tests を追加・更新。リスクは既存 test fixture の期待値追加漏れ。
- `docs/development-strategy/issue-455-dashboard-app-server-usage-tuning.md`: この作戦図。リスクなし。

## 既に通っている経路

- PR #764 で Dashboard Worker は cost/read の AI 風 fast path を止め、bridge 接続時は app-server に送る。
- `codex app-server --help` で `-c key=value` config override が利用可能。
- VPS repo は `main` / `origin/main` / `HEAD` が `d52a8f2` で一致し、bridge service は restart 後に最新 script で起動済み。
- deploy-production run `26930927693` は `d52a8f2` で成功済み。

## 未確認の境界

OpenAI / ChatGPT / Codex の実際のクレジット計算は公式・runtime analytics でしか確定できない。この PR では「消費量が必ず下がる」とは言わず、operator が軽量設定を適用・観測できる足場に限定する。

`model_reasoning_effort` の受理可否は Codex CLI version / account に依存し得る。app-server 起動が失敗した場合は systemd/runtime truth に明示される。既定では override しないため既存運用は壊さない。

## 穴が出そうな箇所

- env 値を shell 文字列ではなく argv 配列に入れないとクォート問題が出る。
- model 名を repo に固定すると operator account 差異で壊れる。
- connected event に full config や token を出すと情報露出になる。
- Worker fast path を戻すと「Butler は中継機」という今回の最重要条件を壊す。

## PR 前に確認すること

- local branch が latest `origin/main` から切られている。
- PR #764 deploy run が成功済み。
- VPS service restart 後に最新 source が process に反映済み。
- test が pass している。
- PR body の Execution Queue Delta で Issue #455 が owner 指示によりこの slice の Now になったことを明示する。

## 実装候補と捨てた案

採用: app-server 起動 args を env override 可能にし、runtime truth に cost profile を出す。

捨てた案: Worker で cost/read/status を回答する。Butler が AI 風に振る舞うため不採用。

捨てた案: app-server に送る前に通常会話だけ別 AI API へ流す。API 課金 runner への切替であり Issue #455 の Non-goal に反する。

捨てた案: model を repo 固定で軽量 model にする。operator account / plan 差異で壊れるため env 明示にする。

## merge 後に通す E2E

production deploy 後、VPS service env に軽量 profile を設定して bridge restart し、Dashboard Butler から短い通常会話を送る。期待値は Worker が AI 風に答えず app-server に届くこと、bridge connected runtime truth に configured profile が出ること、Codex Analytics の減り方は観測値として別途記録すること。

## 次の PR を増やさない理由

PR #764 で「Worker は中継機」に戻した直後の同じ Issue #455 follow-up であり、今回の変更は app-server 起動設定と tests に限定される。reviewer duplicate suppression / fallback retry throttle / queue policy は別 surface なので、この PR には混ぜない。

## 停止条件

- Codex app-server CLI が `-c model` / `-c model_reasoning_effort` を受けないことが確認された場合。
- app-server bridge 以外の reviewer / runner / Worker routing へ修正が広がり始めた場合。
- Worker AI 風 fast path の復活が必要になった場合。
- model / billing / account semantics を公式・runtime truth なしに断定しそうになった場合。
