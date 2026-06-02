# Issue #528: LINE-style reply context for Dashboard Butler chat

## 完了体験

Dashboard Butler の通常チャットで、Butler の返信がどの owner 発言への返答かを一目で判別できる。Butler の吹き出し上部に LINE の返信表示に近い短い引用プレビューを出し、プレビューを押すと元の owner 発言へ移動して短く強調される。

長い作業後に最終回答がまとめて返ってきても、owner は「この返信はどの質問に対するものか」を履歴上で追える。返信本文そのものは通常メッセージとして残り、引用プレビューは本文と区別された補助情報として表示する。

## VTDD 全体で進める部分

対象は Dashboard Butler の owner-facing chat UX で、Issue #528 の LINE-style reply context 要求を進める。Issue #450 の live runtime 体験にも関係するが、この slice では通常チャット描画の返信元可視化だけを実装する。

## 設計

まず PWA 側でメッセージ描画順から返信元を推定する。将来 `replyToMessageId` / `replyToClientMessageId` が server payload に載った場合はそれを優先し、無い場合は直前の owner 発言を Butler 返信の返信元として表示する。

引用プレビューは通常メッセージとして保存しない。`appendMessage()` の DOM 生成時にだけ作り、thread 再描画時は `renderThread()` の順序に従って再構成する。プレビューを押したときは同一描画内の owner 発言 DOM を `scrollIntoView()` し、短時間だけ highlight class を付ける。

## 仮説

現在の不満は、Butler が複数の owner 発言を受けた後に遅れてまとめて返信すると、回答が何に対応するか見えなくなることが主因である。Dashboard 側には ordered thread と message object が既にあり、通常会話の最小改善は backend schema を広げずに PWA 描画で直前 owner 発言を引用することで成立する。

狭すぎる修正で本文先頭に引用を文字列として混ぜると、履歴汚染とコピー内容のノイズが増える。DOM 補助表示として分離すれば、見た目だけを改善し、保存済みメッセージや app-server reply 生成には触れない。

## 検証計画

- Unit: Dashboard ChatRoom HTML に reply context CSS / helper / click focus path が含まれることを `test/worker.test.js` で確認する。
- Unit: `renderThread()` が redraw 時に返信元 index を再構成する経路を文字列検証する。
- Integration guard: `test/e2e-518-dashboard-chat-transient-timestamps.test.js` に reply context 表示経路が存在することを追加し、Issue #590 の transient progress 表示と混ざらないことを見る。
- Build: `npm run build:worker` で generated `worker.js` を更新する。
- Generated check: `npm run check:generated-worker` と `git diff --check` を通す。

## 改修見積もり

- `src/worker/runtime.js`: Dashboard ChatRoom の CSS と client JS に reply context preview を追加する。risk は `renderThread()` の全体差し替え時に message index が古く残ること。
- `worker.js`: generated worker。source と同じ変更を build で反映する。
- `test/worker.test.js`: HTML smoke assertion を追加する。risk は PR #737 の copy/time 表示変更と近い領域で conflict すること。
- `test/e2e-518-dashboard-chat-transient-timestamps.test.js`: transient progress と通常 reply context の表示責務が別であることを route evidence に残す。

## 既に通っている経路

Dashboard ChatRoom は owner / Butler / system message を `appendMessage()` で描画し、thread 再取得時は `renderThread()` が messages を順番に描画している。`messageId` / `message_id` / `createdAt` / `created_at` のように camelCase と snake_case の両方を読む既存慣習がある。

Issue #528 には 2026-05-31 の owner comment として、LINE-style reply target UI、`replyToMessageId` / `replyToClientMessageId`、引用 preview、tap/click jump、複数 owner message の整理が既に記録されている。

## 未確認の境界

server payload が全 turn で明示的な `replyToMessageId` を持つかは未確認である。この PR では無い前提でも直前 owner 発言で可視化し、明示 field が来た場合だけ優先する。

複数 owner 発言を 1 つの Butler reply がまとめて扱う場合の `3件への返信` UI は未実装とする。ここは backend protocol と batching semantics が必要なため、次 slice に分ける。

## 穴が出そうな箇所

`renderThread()` が履歴全体を差し替えるため、reply target DOM map を reset せずに残すと古い DOM を参照する。redraw 前に index を clear し、描画順に再構成する必要がある。

プレビュー text を本文と同じ markdown rendering にすると補助表示が重くなり、チャットがまた読みづらくなる。ここでは plain text snippet に限定する。

## PR 前に確認すること

PR #737 が copy/time meta 表示を同じ `appendMessage()` 近辺で変えているため、merge order によって conflict する可能性を PR body に残す。今回の PR では copy/time layout には触れない。

## 実装候補と捨てた案

採用: Butler bubble の上部に compact reply preview を DOM 補助表示として挿入し、クリックで元発言へ移動する。

捨てた案: final reply text の先頭に `> owner 発言` を混ぜる。コピー内容と保存済み履歴を汚し、最終回答の読みやすさを悪化させるため採用しない。

捨てた案: 手動 swipe reply composer を同時に実装する。owner の今回の主訴は「Butler の返答が何への返信かわからない」ことであり、手動返信操作は protocol と入力 UX の別 Issue に分ける。

## merge 後に通す E2E

Dashboard Butler PWA で owner が連続して複数メッセージを投げ、Butler が後から返信したとき、Butler bubble に返信先 preview が出ること、preview クリックで元 owner message へ移動すること、返信本文が途中で切れず、引用 preview が通常履歴メッセージとして増えないことを確認する。

## 次の PR を増やさない理由

この PR は通常チャットの返信元可視化に限定する。progress 折りたたみ、attachment modal、sleep/resume、reviewer fallback、deploy watch を同時に触ると owner-facing UX の検証境界が崩れるため、既存 open PR / Issue に分ける。

## 停止条件

PWA だけでは直前 owner 発言を安定して特定できない、または message order が server truth と違うことが判明した場合は停止する。その場合は backend event に explicit `replyToMessageId` を入れる Issue slice に切り替える。
