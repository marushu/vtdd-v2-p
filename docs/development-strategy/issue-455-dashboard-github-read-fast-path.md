# Issue #455 Dashboard GitHub read fast path strategy

## 完了体験

owner が Dashboard Butler で `PR #756 の状況`、`Issue #455 の状態`、`#590 は open?` のような明白な read/status intent を投げた時、Dashboard Worker が GitHub App-backed read plane で必要な Issue / PR truth を読み、同じ thread に短い日本語 status packet を返す。Codex app-server / VPS Codex CLI は起動せず、返信には `cost_boundary: github_read_plane_lightweight` と `codexWillStart=false` が表示される。

## VTDD 全体で進める部分

Issue #455 の「軽量 read / status / dashboard 表示では Codex CLI を起動しない fast path」を、既存 `retrieveGitHubReadPlane()` に接続して進める。PR #756 の cost-only fast path を前提にし、次の大口削減として PR/Issue status read を app-server から外す。

## 設計

DashboardChatRoom の owner message 保存・ack 後、app-server bridge dispatch 前に `buildDashboardGitHubReadFastPathMessages()` を挟む。明白な read/status intent かつ repository が解決済みで、対象が Issue または PR なら `retrieveGitHubReadPlane()` を呼ぶ。成功時は Butler message を durable thread に保存して broadcast し、app-server へ送らない。失敗時も GitHub read plane failure として短く返し、Codex 起動に逃げない。

対象分類は狭くする。`PR #123 状況`、`Issue #123 状態`、`#123 状況` のような read/status 語を含む場合だけ扱う。`直して`、`実装`、`レビュー`、`merge`、`deploy`、`GO`、添付ありは fast path しない。

## 仮説

原因は、Dashboard chat の status/read 系 owner turn が bridge 接続時に app-server turn へ流れていること。GitHub read plane は既に Worker から利用可能なので、明白な PR/Issue status read を Worker で処理すれば、VTDD gate を落とさず週間 Codex usage を削れる。狭く分類すれば通常会話や実装依頼を誤って止めるリスクを抑えられる。

## 検証計画

- Unit: DashboardChatRoom が `PR #756 の状況` を GitHub read plane で返し、bridge に `app_server_turn_requested` を送らない。
- Unit: GitHub read failure 時も Codex に fallback せず、owner-facing failure message を返す。
- Unit: 実装修正系 owner turn は fast path されず、既存通り app-server bridge へ送る。
- Local: `npm run build:worker`、`node --test test/worker.test.js`、`npm run check:generated-worker`、`git diff --check` を実行する。

## 改修見積もり

- `src/worker/runtime.js`: DashboardChatRoom owner message flow に GitHub read fast path を追加する。helper で intent 抽出、read plane 呼び出し、status packet 生成を行う。risk は PR/Issue 番号の意味を誤ること。
- `test/worker.test.js`: WebSocket DashboardChatRoom に mock `GITHUB_API_FETCH` を入れ、bridge sent count と reply text を検証する。
- `worker.js`: generated worker 更新。

## 既に通っている経路

`retrieveGitHubReadPlane()` は repositories / issues / pulls / reviews / checks / workflow_runs / branches / contents などを GitHub App-backed で読む。Custom GPT instructions では status intent の lightweight ladder として `vtddRetrieveGitHub` が既に定義されている。PR #756 では cost-only lightweight fast path が実装済み。

## 未確認の境界

複数 repository を跨ぐ曖昧な chat で repo 未指定のまま status read する経路は今回扱わない。repo-less main chat で repo が無い場合は app-server に流すか、次 slice で repo 確認 UI を作る。Actions / checks / deploy run の詳細 ladder は今回の Issue/PR first slice の外。

## 穴が出そうな箇所

`#756` だけでは Issue か PR か曖昧。今回の初期実装では `PR` 語があれば pulls、`Issue` 語があれば issues、どちらも無い場合は issue read に寄せる。merge readiness や close readiness は deep judgment なので fast path せず app-server に残す。

## PR 前に確認すること

latest `origin/main` から topic branch を切ること、PR #756 merge/deploy の fast path と衝突しないこと、GitHub read plane route の既存 tests を壊さないこと、未追跡 `.tmp/` / `test-results/` を混ぜないこと。

## 実装候補と捨てた案

採用: DashboardChatRoom の app-server dispatch 前に narrow GitHub read fast path を挟む。

捨てた案: app-server prompt で `vtddRetrieveGitHub` を優先させる。app-server 起動後では Codex usage 削減にならない。捨てた案: 全ての status/read を Worker で解釈する。誤分類と仕様膨張が大きい。

## merge 後に通す E2E

Dashboard live E2E として、`PR #756 の状況` のような PR status read を送り、GitHub read plane の短い status packet が返り、bridge へ `app_server_turn_requested` が出ないことを検証する。

## 次の PR を増やさない理由

この PR は PR/Issue first read に限定する。checks / workflow_runs / deploy / branch の ladder は後続として必要だが、ここに混ぜると status packet と merge readiness judgment が肥大化するため分ける。

## 停止条件

repo truth を読んだふりになる、GitHub read failure を隠す、実装/merge/deploy/reviewer を誤って fast path する、または authority boundary を弱める場合は停止する。
