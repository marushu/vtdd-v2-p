# Issue #613 repo-less main chat formalization

## 完了体験

Dashboard Butler の通常チャットを開いた時、repo 未指定はエラーや未解決の残骸ではなく、repo-less main chat として扱われる。

owner はまずこのメインチャットで雑談、状況確認、複数 repo をまたぐ相談を始められる。Issue / PR / deploy / passkey / GitHub Actions など repo 境界が必要な作業に入る時だけ、Butler が会話の中で対象 repo を内部解決し、曖昧なら短く確認する。

## VTDD 全体で進める部分

この PR は Issue #613 の本筋のうち、通常チャット first viewport と drawer 表示を repo-less main chat に寄せる最小 slice である。

既存の `dashboard-main-unresolved` WebSocket / app-server bridge thread は維持する。名前の `unresolved` は内部 thread id として残るが、owner-facing UI では未解決扱いにしない。

## 設計

- repo が URL に指定されていない Dashboard では、header subtitle を repo-less main chat として表示する。
- drawer の repo lane は「repo-less main chat」として説明し、常設 repo 入力フォームを出さない。
- repo が指定されている Dashboard では、従来どおりその turn の対象 repo として表示する。
- GitHub / deploy / progress など repo 必須 surface は disabled のまま残し、repo 境界を弱めない。
- composer の `data-repository-input` は空のまま維持し、送信経路は `dashboard-main-unresolved` を使う。

## 仮説

現在の owner-facing 問題は、実行経路そのものではなく UI 文言と常設 repo 入力の扱いである。

`src/worker/runtime.js` には repo 未指定時の `dashboard-main-unresolved` thread と WebSocket endpoint が既に存在する。一方で header と drawer が `作業対象 repo 未指定`、`この作業の対象 repo`、`owner/repo` 入力フォームを常時表示するため、repo-less main chat が未解決状態や残骸に見える。

ここを repo-less main chat として表示すれば、unresolved bridge を止めるのではなく正式運用する方向へ寄せられる。

## 検証計画

- `test/worker.test.js` で default dashboard が `repo-less main chat` を表示することを確認する。
- 同じテストで `作業対象 repo 未指定` と `dashboard-repository-input` が通常 dashboard に出ないことを確認する。
- `dashboard-main-unresolved` の thread endpoint / WebSocket endpoint が維持されることを確認する。
- `npm run build:worker` で generated `worker.js` を更新する。
- `npm run check:generated-worker` で generated worker の差分を確認する。
- `node --test test/worker.test.js` と `git diff --check` を実行する。

## 改修見積もり

- `src/worker/runtime.js`
  - `renderV2DashboardPage` の repo 未指定 label / drawer lane / initial assistant text を変更する。
  - repo 必須 surface の disabled 表示は維持する。
  - internal thread id は変更しない。
- `worker.js`
  - `npm run build:worker` による生成物更新。
- `test/worker.test.js`
  - Dashboard HTML smoke assertion を repo-less main chat 仕様へ更新する。

## 既に通っている経路

- repo 未指定時の thread id は `dashboard-main-unresolved`。
- WebSocket endpoint は `/v2/dashboard/chat/dashboard-main-unresolved/ws`。
- app-server bridge tests は unresolved thread を既に扱っている。
- media upload status も repo 未指定通常会話の private media として扱う文言を持つ。

## 未確認の境界

- `unresolved` という内部名を将来 owner-facing / logs / service 名で完全に置換するかは、この PR では決めない。
- repo-less main chat から repo-required action へ入る自然言語 repo resolver は、この PR では実装しない。
- bridge lifecycle guard は Issue #741 の別 slice とする。

## 穴が出そうな箇所

- repo 入力フォームを完全に消すと、手動で repo 固定したい開発者の逃げ道が減る。今回は URL query の `repository` は維持し、通常画面にフォームを出さない方針にする。
- disabled surface の `repo 設定後に開けます` はまだ repo 選択前提に見える。今回の slice では repo 必須 operation の境界として残し、通常チャットの主導線からは下げる。
- `dashboard-main-unresolved` という内部名はテストや bridge に残る。owner-facing の未解決印象だけを先に消す。

## PR 前に確認すること

- default dashboard が repo 入力フォームを出さない。
- repo 指定 URL は従来どおり対象 repo を表示する。
- generated worker が source と一致する。
- `main` の既存 dirty 差分を触っていない。

## 実装候補と捨てた案

- 採用: UI 表示を repo-less main chat に変え、既存 unresolved thread を維持する。
- 捨てた案: unresolved bridge を stop/disable する。owner が repo-less main chat として必要だと明示したため不採用。
- 捨てた案: repo resolver まで同時実装する。Issue #613 の大きな本筋だが、この PR では first viewport の誤認を先に除く。
- 捨てた案: drawer から repo 関連 surface を全削除する。repo 必須操作の boundary が曖昧になるため不採用。

## merge 後に通す E2E

- production PWA を強制リロードする。
- repo 未指定で Dashboard Butler を開き、header と drawer が repo-less main chat として見えることを確認する。
- チャット送信が `dashboard-main-unresolved` で通常に流れることを確認する。
- repo 必須操作に入る時だけ対象 repo 確認が出ることを後続 slice で確認する。

## 次の PR を増やさない理由

この PR は Issue #613 の大きな redesign 全体ではなく、owner が明示した unresolved bridge の解釈修正に閉じる。これを先に入れることで、Issue #741 の bridge lifecycle guard と Issue #528 の通常チャット UX 改修が同じ前提で進められる。

## 停止条件

- repo 未指定時の送信経路が `dashboard-main-unresolved` から変わる場合。
- repo 必須 operation が repo 確認なしで実行可能になる場合。
- URL query による repo 指定が壊れる場合。
- 作戦図にない bridge service / deploy / credential / passkey 変更が必要になった場合。
