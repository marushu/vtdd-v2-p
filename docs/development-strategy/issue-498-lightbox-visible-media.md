# Issue #498: make media lightbox render visible image content

## 完了体験

Dashboard Butler PWA で送信済み画像サムネイルをタップすると、黒い overlay にファイル名だけが出るのではなく、画像本体が画面内に収まって表示される。閉じるボタンだけでなく、画像本体・余白・retention label などの lightbox 面をタップしてもチャットに戻れる。owner は添付したスクリーンショットを後から確認できる。

## VTDD 全体で進める部分

Issue #498 の添付 preview / 拡大表示 completion を進める。PR #735 で 7日保持、PR #736 で lightbox DOM は production に入ったが、owner 実機観測では modal 内の画像本体が表示されていないため、production bug 修正として扱う。

## 設計

download path はサムネイル表示に使えているため、まず path ではなく lightbox 内の CSS sizing を疑う。iPad/Safari の CSS grid 内で replaced element の `max-height: 100%` が期待通り解決されない可能性を避けるため、lightbox body に明示的な `height` / `width` を持たせ、画像と動画を `width: 100%; height: 100%; object-fit: contain;` で表示する。

画像読込失敗時の owner-facing 日本語 error は PR #736 の handler を維持する。lightbox の dismissal は画像 preview では広く閉じる一方、動画 preview では controls 操作を潰さないため `video` 上の tap は閉じない。今回は URL routing や storage schema には触れない。

## 仮説

サムネイルは表示されているので `/v2/media/:id/download` の path は成立している。lightbox では filename と retention label は出るが画像本体が出ていないため、`img` は作られているが modal body 内で見えないサイズになっている可能性が高い。

狭く path を変えると、既に動いているサムネイル / download route を壊す危険がある。まず visible layout を修正し、test で lightbox media element が `object-fit: contain` と full body sizing を持つことを固定する。

## 検証計画

- Unit: Dashboard HTML に lightbox body full-size layout と `object-fit: contain` が含まれることを `test/worker.test.js` で確認する。
- Unit: lightbox surface click で閉じる handler と、video controls を閉じない guard が含まれることを確認する。
- Unit: 既存 media lightbox / thumbnail assertion が保持されることを確認する。
- Build: `npm run build:worker` で `worker.js` を更新する。
- Generated check: `npm run check:generated-worker` を通す。
- Targeted test: `node --test test/worker.test.js` を通す。
- Diff: `git diff --check` を通す。

## 改修見積もり

- `src/worker/runtime.js`: `.media-lightbox-body` と `.media-lightbox-body img/video` の CSS、lightbox click dismissal を修正する。risk は video preview の表示サイズが変わることと、video controls tap を誤って close と扱うこと。
- `worker.js`: generated worker。source と同じ変更を build で反映する。
- `test/worker.test.js`: HTML smoke assertion に iOS/Safari 向け lightbox sizing の証跡を追加する。

## 既に通っている経路

Issue #498 の upload / R2 metadata / D1 metadata / 7日保持は PR #735 で production deploy 済み。PR #736 で lightbox DOM、閉じるボタン、filename 表示、thumbnail click handler は入っている。owner screenshot では overlay、filename、close button、retention label は出ている。

## 未確認の境界

production PWA の DOM inspector はこの場では直接使えていない。画像 load event が成功しているか、CSS のみで不可視になっているかは owner screenshot と source からの推定である。修正後は owner 実機 E2E が必要。

## 穴が出そうな箇所

CSS grid の `minmax(0, 1fr)` と `max-height: 100%` は Safari で replaced element のサイズ解決が不安定になり得る。lightbox body と media element の双方に明示的な width/height を与える必要がある。

## PR 前に確認すること

Issue #498 の Success Criteria、PR #736 の merged source、owner screenshot、download path reuse、targeted worker test、generated worker check を確認する。

## 実装候補と捨てた案

採用: lightbox body と img/video の CSS sizing を full-size contain にする。

捨てた案: `downloadHref` を別 route に変える。サムネイルが同じ route で表示されているため、path 変更は現時点の root cause ではない。

捨てた案: ファイル名や retention label を消す。owner の不具合は画像本体が出ないことで、metadata 表示は Issue #498 の成功条件に含まれる。

## merge 後に通す E2E

production Dashboard Butler PWA で送信済み画像サムネイルをタップし、lightbox に画像本体が画面内に表示され、filename と 7日 retention label が見え、閉じるボタン・画像本体・余白・retention label tap でチャットへ戻れることを owner 実機で確認する。動画 preview は controls 操作で意図せず閉じないことも確認する。

## 次の PR を増やさない理由

この PR は PR #736 の production bug を最小修正する。attachment upload、7日保持、動画解析、progress UI、LINE-style reply preview へ広げると検証境界が壊れる。

## 停止条件

修正後も画像本体が出ない場合、CSS ではなく image load / auth / cache / service worker 経路の問題として停止し、download route と PWA cache を別 slice で調べる。
