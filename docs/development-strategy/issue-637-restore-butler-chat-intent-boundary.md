# Issue #637 / #455 Butler chat intent boundary restore strategy

## 完了体験

Dashboard Butler の通常チャットで owner が VTDD の状況確認、次タスク相談、コスト相談、または一般的な開発相談をした時、Butler は会話本文を優先し、`VPS helper queue` の途中停止文言へ吸い込まない。

一方で owner が明示的に `runner` / `app-server bridge` の status / logs / restart / recovery を頼んだ時だけ、Issue #637 の VPS privileged maintenance proposal path に入る。root / sudo 実行は引き続き passkey approval と helper queue boundary の内側に残す。

## VTDD 全体で進める部分

Issue #455 の cost-aware fast path は、軽量な status / PR / Issue /相談では Codex CLI を起動しないための土台である。これを壊して mac Codex や VPS Codex CLI に戻すのではなく、Dashboard Butler の通常会話が helper queue の blocked reply で止まる副作用だけを戻す。

Issue #637 の recovery plane は必要だが、通常チャット体験を壊すと Issue #528 / #613 の Butler-first single chat が後退する。今回の slice は「自然文 maintenance intent の境界を狭くする」ことで、コスト抑制と会話品質を両立する。

## 設計

`detectDashboardVpsPrivilegedMaintenanceIntent` を二段階に分けて扱う。

- 明示的な privileged maintenance 語: `VPS` と `privileged` / `maintenance` / `root` / `sudo` / `helper` / `passkey` の組み合わせ、または root/sudo/helper と日本語の保守/復旧/承認。
- recovery plane 語: `runner` / `app-server bridge` / `ブリッジ` / `ランナー` があり、かつ logs / restart / reconnect / 落ちている / 止まっている / 復旧などの実運用 action がある場合。

`状態` / `確認` / `稼働` だけでは広すぎるため、内部対象語と組み合わせても blocked helper reply には入れない。低リスク status 確認を実行したい場合は `status` / `health` / `is-active` / `ログ` / `再起動` / `復旧` など明示語に寄せる。

blocked reply の先頭文言は、owner-facing chat で「途中で止まりました」と見えるものをやめる。代わりに、VPS maintenance request として扱ったが実行開始していないこと、足りない情報、次に必要な owner action を短く出す。

## 仮説

PR #761 は `bridge` / `runner` と `状態` / `確認` の組み合わせを recovery intent として拾うようにした。これにより、本来は会話本文で扱うべき「状況を確認して」「次に進めるべきタスク」系の発話が、repository / issue / config の不足で helper queue blocked reply へ進む可能性が高くなった。

この仮説が正しければ、検出語を実運用 action に狭め、blocked reply の文言を通常チャットに出ても破壊的でない表現へ戻せば、cost guard と #637 recovery plane を同時に残せる。

狭めずに app-server bridge や helper queue route を削除すると、iPhone/PWA-only recovery の Issue #637 そのものを壊す。逆に blocked reply だけを書き換えて検出を広いまま残すと、通常会話の誤ルーティングは残る。

## 検証計画

- `test/worker.test.js` に通常の「VTDD 状況 / 次タスク」相談が VPS helper execution を作らない regression test を追加する。
- 既存の明示 `VPS helper queue` / `runner status` / `app-server bridge recovery` test が壊れないことを確認する。
- broad な `app-server bridge が落ちてないか状態を確認して` が approval path へ入る既存 test は、明示的な `status` / `復旧` などの action 語を含む期待に更新する。
- `node --test test/worker.test.js --test-name-pattern "VPS privileged maintenance|recovery intent|cost-aware|helper queue"` を実行する。
- `npm run build:worker` と `npm run check:generated-worker` を実行する。
- `git diff --check` を実行する。

## 改修見積もり

- `src/worker/runtime.js`: intent detection と blocked reply 文言を調整する。リスクは #637 recovery plane の入口を狭めすぎること。
- `test/worker.test.js`: regression と既存 expectation を更新する。リスクは test 名と実際の owner-facing completion のズレ。
- `worker.js`: `npm run build:worker` の生成物。手編集しない。
- `docs/development-strategy/issue-637-restore-butler-chat-intent-boundary.md`: この作戦図。

## 既に通っている経路

- PR #749 / Issue #748 で Durable Objects mapping write burst は止まっている。
- PR #756 / #757 / #760 は cost-aware fast path を追加し、軽量 read で Codex CLI を起動しない方向へ進めている。
- PR #761 は internal word なしの recovery intent を広げたが、今回の owner feedback で誤検出境界を再調整する必要がある。

## 未確認の境界

- production PWA で owner が実際に送った文面全文。
- Butler app-server bridge 側が、Worker の `execution=null` を受けた時に通常の app-server conversation へ進めるか。
- Custom GPT Action Schema 側の自然文分類が同じ表現を別 path に送るか。

## 穴が出そうな箇所

- `確認` は日本語で非常に広い。これを recovery action に残すと、通常会話の誤検出が再発する。
- `status` は英語では明示 action だが、日本語の `状況` と混ぜると雑談にも出るため、単独ではなく runner/bridge など対象語と組み合わせる。
- memory provider / runtime config の不足を通常チャットに出すと owner 体験が壊れる。blocked reply は explicit maintenance path だけに出す。

## PR 前に確認すること

- `git status --short --branch` で topic branch であること。
- PR #761 以後の `origin/main` から分岐していること。
- untracked `.tmp-*` / `test-results/` を混ぜないこと。
- PR body に `Execution Queue Delta` を入れること。

## 実装候補と捨てた案

採用: detection を narrow に戻し、blocked reply の user-facing 破壊表現をなくす。

捨てた案: PR #761 を丸ごと revert する。理由は Issue #637 の自然文 recovery 入口まで失われるため。

捨てた案: #455 cost fast path を revert する。理由は Codex 使用量削減の本丸を壊し、今回の DO rows_written 教訓にも反するため。

捨てた案: default repository / default issue を補完して helper queue に進める。理由は Safety Invariant の No default repository / unresolved target blocks execution に反するため。

## merge 後に通す E2E

production deploy 後、Dashboard Butler で「今VTDDの状況は？次に進めるべきタスクも示して。」を送る。期待値は通常の status / next task reply であり、`VPS helper queue` の blocked reply ではない。

別途「app-server bridge の status を確認して。Issue #637」は passkey approval boundary へ進むことを確認する。

## 次の PR を増やさない理由

この PR は user-facing regression の修正であり、#637 helper lifecycle 実行や #455 usage metering の新機能を増やさない。誤検出を止めるだけなので、同じ PR にまとめる方が owner-facing 復旧として最小である。

## 停止条件

通常チャットへの復帰に app-server bridge / Custom GPT schema / VPS runner 側の変更が必要だと判明した場合は停止する。deploy、root execution、credential / permission mutation が必要になった場合も停止する。
