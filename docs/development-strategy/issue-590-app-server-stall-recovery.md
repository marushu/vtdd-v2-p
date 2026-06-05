# Issue #590 app-server stall recovery strategy

## 完了体験

Owner が Dashboard Butler repo-less main chat で通常メッセージを送った後、codex app-server が応答を返さない場合でも、Dashboard thread には日本語の復帰可能メッセージが残る。composer は次の入力へ戻り、owner は同じ thread で補足または再送できる。12:25 JST の `君は誰？` のように「Codex app-server に渡しています」で止まったままにはしない。

## VTDD 全体で進める部分

この slice は Issue #590 の timeout / stall recovery に限定する。VPS env の `VTDD_DASHBOARD_APP_SERVER_MODEL=gpt-5.5` 解除、systemd restart、deploy、credential mutation は別の approval-bound recovery として扱う。mac Codex の SSH read は `mac_codex_only_probe` の証跡であり、Butler 完了ではない。

## 設計

`handleDashboardTurnRequest()` は `thread/start` / `thread/resume` と `turn/start` の複数 await を持つ。現状の watchdog は主に turn notification 後の activity を見ており、app-server request 自体が返らない場合や fallback client 初期化後に completion が来ない場合、Dashboard thread に final failure が残らない可能性がある。

この PR では turn 全体を包む deadline を追加し、`thread/start`、media materialize、`turn/start`、`turnCompletion` のどこで止まっても `app_server_turn_failed` timeout event を一度だけ送る。既存の late completion handling は維持し、後から reply が来た場合は既存の late reply path に任せる。

## 仮説

12:25 JST の production truth では、owner message は `dashboard-main-unresolved` に保存され、transient progress は `Codex app-server に渡しています ... usage_profile=conversation / reasoning_effort=low` まで更新された。その後、thread に failed/replied message が追加されていない。VPS service は active で、bridge process 配下に複数の app-server child が残っていた。したがって Worker/D1/runner delivery ではなく、bridge 内の app-server turn completion 停止を owner-facing event へ変換できていないことが root blocker。

## 検証計画

Unit: `node --test test/dashboard-app-server-bridge.test.js` で `thread/start` が返らない場合に timeout event が送信されることを確認する。

Unit: `node --test test/dashboard-app-server-bridge.test.js` で `turn/start` 後に completion notification が来ない場合も timeout event が送信されることを確認する。

Integration: `npm run build:worker` と `npm run check:generated-worker` を実行し、bundled worker に構文破綻がないことを確認する。

E2E: merge/deploy 後、Dashboard repo-less main chat で短文を送り、unsupported/stall の場合でも thread に復帰可能な failed message が残ることを確認する。deploy と VPS restart は passkey 境界なので、この PR 作成時点では E2E は未実施として扱う。

## 改修見積もり

- `scripts/run-dashboard-app-server-bridge.mjs`: `handleDashboardTurnRequest()` に one-shot turn deadline helper を追加する。risk は既存 late completion / unsupported model fallback と二重 failure event を出すこと。
- `test/dashboard-app-server-bridge.test.js`: hanging fake app-server で timeout event を検証する。risk は test runtime が長くなることなので short timeout を使う。
- `worker.js`: worker bundle discipline に従い、source が bundle される場合は生成物を更新する。

## 既に通っている経路

PR #790 は `threadSource: "user"` に変更済みで、production deploy SHA `7d5dee2c32b50788aa8045c189efb615203c4a65` が VPS checkout に反映されている。Dashboard HTTP chat API、GitHub issue queue、VPS runner low-risk read、Dashboard event delivery は #741 の status/logs queue で通過した。

## 未確認の境界

`gpt-5.5` が ChatGPT account の codex app-server で正式に supported かはこの PR では断定しない。VPS env 変更と restart は scoped passkey approval が必要な runtime mutation として残す。

## 穴が出そうな箇所

unsupported model fallback が reject path に入り、outer deadline と inner failure が二重に送られる可能性がある。`timeoutSent` / `turnSettled` で一度だけ送る。

`thread/start` が詰まると `codexThreadId` がない timeout event になる。これは許容し、owner-facing には「入力は保存済み」と出す。

## PR 前に確認すること

Git branch が `issue-590-app-server-stall-recovery` で、未追跡 E2E asset を PR に混ぜない。PR body には #590 criteria と 12:25 JST production probe を partial evidence として書く。

## 実装候補と捨てた案

採用: bridge 内 deadline を追加し、app-server request が返らなくても Dashboard event を送る。

捨てた案: Worker fast path で `君は誰？` に直接答える。過去に「Dashboard Butler は AI ではなく app-server bridge へ届ける中継機」という方針へ戻しており、今回の #590 root blocker は timeout recovery である。

捨てた案: mac Codex から VPS env を直接編集して restart する。短期復旧には有効だが passkey 境界であり、code PR の completion evidence にはならない。

## merge 後に通す E2E

Production deploy 後、repo-less main chat で `君は誰？` または `もしもし` を送る。reply が返る場合は成功、app-server が詰まる場合でも #590 の日本語 recovery message が thread に残り composer が戻ることを確認する。

## 次の PR を増やさない理由

この PR は既存 #590 の最小 slice で、runtime env model 問題や lifecycle restart policy は #455/#741 に残す。timeout recovery を先に入れることで、次の env/restart 作業が失敗しても owner-facing に詰まりを残さない。

## 停止条件

timeout event を送るために deploy、credential mutation、permission mutation、VPS env mutation が必要になる場合は停止する。app-server reply と timeout failure が同じ turn で二重に thread append される設計になる場合も停止する。
