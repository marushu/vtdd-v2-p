# Issue #590 composer progress containment 作戦図

## 完了体験

iPhone の Dashboard Butler PWA で、入力欄下の `進行中` は短い status として見える。`app_server_reply_delta` 由来の readable progress が長文でも、composer 下は最大 2 行程度に収まり、画面の大半を占有しない。長い readable progress は chat checkpoint 側で読めるため、owner は待ち状態を把握しつつ入力欄を失わない。

## VTDD 全体で進める部分

Issue #590 の owner-facing observability のうち、PR #795 deploy 後に残った iPhone composer-progress visual containment を直す。Issue #637、Issue #654、Issue #793、stop / interrupt / owner input queue はこの slice では扱わない。

## 設計

composer 下の transient status は残す。ただし transient text は compact display text に変換し、DOM へ入る `progress-text` は長文をそのまま表示しない。CSS でも 2 行 clamp をかけ、iPhone viewport で高さが膨らまないようにする。raw snapshot / progressSummary は保持し、chat checkpoint 側は readable text を維持する。

## 仮説

suspected cause は、`.composer-progress .progress-text` が `max-height: min(9lh, 24dvh)` かつ `overflow: auto` で、`updateTransientProgress()` が `app_server_reply_delta` の readable long text をそのまま `transientProgressState.text` に入れること。短い stage text の時は良いが、reply delta の長文時だけ iPhone 画面を占有する。

## 検証計画

- HTML/source regression: composer progress text が 2 行 clamp される CSS を含むこと。
- JS/source regression: `compactComposerProgressText()` が存在し、`updateTransientProgress()` が composer 表示用 text に使うこと。
- Runtime regression: reply delta snapshot/progressSummary は保持される既存 tests を壊さないこと。
- Local: `node --test test/worker.test.js --test-name-pattern 'dashboard|DashboardChatRoom|composer'`
- Generated: `npm run build:worker`, `npm run check:generated-worker`
- Hygiene: `git diff --check`

## 改修見積もり

- `src/worker/runtime.js`: `.composer-progress .progress-text` CSS を 2 行 clamp に変更し、`compactComposerProgressText()` を追加して composer 表示だけを短縮する。risk は status が短すぎて情報量が落ちること。
- `test/worker.test.js`: served dashboard source assertion を追加する。risk は source assertion が過度に brittle になること。
- `worker.js`: generated worker を同期する。

## 既に通っている経路

PR #795 で low-information status が readable checkpoint を消さないようになった。Dashboard UI には composer 下 transient progress と chat-visible checkpoint の両方がある。短い `考えています。` / `コマンドを実行しています。` の時は owner screenshot で良い見た目が確認されている。

## 未確認の境界

production PWA で long readable delta と media attach / app switch / reconnect が同時に起きる時の高さは merge/deploy 後に owner E2E が必要。CSS clamp は主要ブラウザで有効だが、iOS Safari/PWA の実表示は live evidence が必要。

## 穴が出そうな箇所

composer 下の text を短縮しすぎると、owner が現在状態を読めない。chat checkpoint 側に readable progress が出ない turn では情報量が落ちる可能性があるため、fallback checkpoint の E2E は別途残る。

## PR 前に確認すること

Issue #590 が open / Now であること、PR #795 deploy が success であること、open PR が無いこと、main が origin/main と一致すること、untracked `.tmp/` / `test-results/` を巻き込まないこと。

## 実装候補と捨てた案

採用: composer 表示だけを compact 化し、snapshot/checkpoint はそのまま維持する。

捨てた案: composer 下の `進行中` を廃止する。owner 方針では現状維持が原則。捨てた案: reply delta を composer へ一切出さない。短い readable progress も消えてしまう。捨てた案: scroll container を大きくして逃がす。iPhone で画面占有が残る。

## merge 後に通す E2E

production PWA E2E として、長い readable progress が出る turn で入力欄下の `進行中` が 2 行程度に収まり、chat checkpoint 側の readable progress が維持されることを iPhone/PWA screenshot で確認する。短い `考えています。` / `コマンドを実行しています。` の見た目が悪化しないことも確認する。

## 次の PR を増やさない理由

この PR は #590 の composer visual containment だけを閉じる。chat checkpoint 生成不足、owner input queue、stop/interrupt、deploy notification refresh は既に別の残 scope として残っており、この変更が新しい follow-up PR を作るものではない。

## 停止条件

composer 表示の短縮が chat checkpoint / progressSummary を壊す、低情報 status が durable chat に戻る、generated worker check が一致しない、または deploy / credential / permission / destructive work が必要になった場合は停止する。
