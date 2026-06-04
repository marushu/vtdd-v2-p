# Issue #455 content-aware app-server usage profile 作戦図

## 完了体験

Dashboard Butler は owner の発話を Worker 内で AI 風に処理せず、通常会話も開発依頼も Dashboard app-server bridge へ届ける。そのうえで、Dashboard は発話内容を `conversation` / `status_read` / `development` / `long_development` の usage profile に分類し、VPS bridge はその profile に対応した `codex app-server` 起動設定を使う。

owner は iPhone/iPad の Butler から「会話だけ」「状況確認」「開発」「長時間開発」を試し、Dashboard runtime truth と Codex Analytics 観測で、どの profile で bridge に渡ったかを後から確認できる。

## VTDD 全体で進める部分

Issue #455 の「重い処理を実行する前に Codex usage 消費境界を示す」「VTDD 自身で使用枠を食い潰さない queue / throttle / defer 方針を持つ」うち、Dashboard app-server bridge に入る owner turn の content-aware usage profile 化を実装する。

この slice は PR #765 の固定 app-server profile ノブと PR #770/#771 の Codex Analytics 観測を、owner-facing workflow と bridge 実行設定へ接続する。古い Worker fast path 作戦図のように Worker が軽量回答して Codex を起動しない設計は、owner の「Butler は中継機であり AI はいない」という判断に反するため採用しない。

## 設計

`src/core/dashboard-app-server-usage-profile.js` に pure classifier を置く。Worker は owner message を保存・ack 後、bridge dispatch payload に `usageProfile` と `costBoundary` を付け、transient status に profile と reasoning effort を表示する。

`scripts/run-dashboard-app-server-bridge.mjs` は request の `usageProfile` を読み、profile ごとの app-server command args を組み立てる。model は repo で固定しない。既定の調整対象は `model_reasoning_effort` のみとし、profile default は次にする。

- `conversation`: `low`
- `status_read`: `low`
- `development`: `medium`
- `long_development`: `high`

operator が明示した `VTDD_DASHBOARD_APP_SERVER_MODEL` / `VTDD_DASHBOARD_APP_SERVER_REASONING_EFFORT` / CLI args は既存互換の default override として残す。request profile に reasoning effort がある場合はその turn の profile を優先する。bridge は profile/args key ごとに app-server client を lazy cache し、同じ profile の連続 turn では同じ client を再利用する。

## 仮説

現在の本番 bridge は `codex app-server --listen stdio://` の固定起動であり、Dashboard の会話内容に応じて model / reasoning effort が変わらない。PR #765 は operator が固定値を渡せるだけなので、「普通の会話と開発で消費が違う」という owner の観測を Dashboard Butler -> VPS Codex CLI 経路に移植できていない。

Worker が分類だけを行い、回答は app-server に渡すなら、「Butler は AI 風に振る舞わない」という制約を守れる。bridge が profile ごとに app-server args を分ければ、単なる表示ではなく実行設定として内容別調整になる。

## 検証計画

- Unit: classifier が普通会話を `conversation/low`、PR/Issue 確認を `status_read/low`、実装依頼を `development/medium`、長時間・最後まで系を `long_development/high` に分類する。
- Worker integration: ordinary / cost-aware / PR status owner turn は全て app-server bridge に送られ、payload と transient status に usage profile が出る。
- Bridge integration: request usage profile から app-server command args が作られ、profile 別 client が作成・再利用される。
- Local: `node --test test/dashboard-app-server-bridge.test.js`
- Local: `node --test test/worker.test.js`
- Local: `npm run build:worker`
- Local: `npm run verify:worker`
- Local: `git diff --check`

## 改修見積もり

- `src/core/dashboard-app-server-usage-profile.js`: profile constants、classifier、cost boundary builder。risk は分類語彙の過不足。
- `src/core/index.js`: core helper export。risk は export 漏れ。
- `src/worker/runtime.js`: bridge request payload と transient status に usage profile/cost boundary を追加。risk は Worker が回答生成に戻ったように見える文言。
- `scripts/run-dashboard-app-server-bridge.mjs`: profile-aware command args と app-server client selector を追加。risk は thread continuity と複数 app-server process の運用負荷。
- `test/worker.test.js`: Dashboard owner turn payload/status expectations。risk は既存 fast path 期待との衝突。
- `test/dashboard-app-server-bridge.test.js`: helper/selector/turn input tests。risk は app-server factory mock の不足。
- `worker.js`: generated bundle 更新。risk は source と bundle の不一致。

## 既に通っている経路

- PR #764 で Worker の cost/read AI 風 fast path は止め、bridge 接続時は app-server に渡す方向へ戻した。
- PR #765 で app-server fixed profile args と connected runtime truth が入った。
- PR #770/#771 で Codex Analytics 使用量 snapshot の manual capture / Worker ingest / retrieve / Dashboard evidence route が入った。
- Issue #455 は open で、Codex usage 削減と可視化を active scope として残している。

## 未確認の境界

Codex CLI / account が `model_reasoning_effort` を常に受理するかは runtime で確認が必要。失敗した場合は app-server startup failure として surface されるべきで、この PR では公式 usage 削減量を断定しない。

複数 app-server client が同一 Codex thread を別 profile で resume した場合の完全な内部挙動は未確認。実装は profile ごとに client を lazy reuse するが、runtime E2E で同一 Dashboard thread の会話継続を確認する。

## 穴が出そうな箇所

- 「確認して」だけでも repo truth 深掘りや実装を含む場合があるため、開発語彙が含まれる時は `development` を優先する。
- cost 関連会話は owner の相談であって Worker 回答対象ではない。`conversation` か `status_read` に分類しても app-server bridge へ送る。
- model 名を hard-code すると operator account 差異で壊れる。
- transient status が長すぎると chat UX を汚す。profile truth は短く出す。

## PR 前に確認すること

- branch が latest `origin/main` から切られている。
- unrelated untracked E2E assets を commit に混ぜない。
- PR body は Japanese-first で Issue #455 とこの作戦図を参照する。
- Execution Queue Delta は owner complaint を `ROOT` follow-up として扱い、active Issues を downscope していないことを明示する。

## 実装候補と捨てた案

採用: Worker は分類 metadata だけを付け、bridge が profile に応じた app-server args/client を選ぶ。

捨てた案: Worker が lightweight reply を返して app-server を起動しない。Butler が AI 風に振る舞うため不採用。

捨てた案: 全 turn を固定 `low` にする。開発・長時間開発で品質劣化し、content-aware ではないため不採用。

捨てた案: model を repo 固定で軽量 model にする。operator account / Codex plan 差異で壊れるため不採用。

## merge 後に通す E2E

production deploy 後、bridge restart を行い、Dashboard Butler から「会話だけ」「PR 状況確認」「軽い実装」「長時間開発」の短い probe を送る。期待値は全 turn が app-server bridge に届き、runtime truth に profile/reasoning effort が出ること。Codex Analytics の減り方は #771 の snapshot route で別途記録する。

## 次の PR を増やさない理由

PR #765 は固定ノブ、PR #770/#771 は観測で止まり、owner-facing の「内容別に実際の bridge 使用設定が変わる」が未完だった。今回の slice はその抜けを同じ Issue #455 の機能単位として閉じるため、Worker/bridge/test を一塊で実装する。

## 停止条件

- app-server CLI が profile 別 args で起動不能になる。
- Worker が再び AI 風 fast path 回答を持つ必要が出る。
- deploy / credential / permission mutation が必要になる。
- Issue #455 の範囲を超えて reviewer / merge / deploy policy の広範修正へ膨らむ。
