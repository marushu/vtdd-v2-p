# Issue #498 添付サムネイル拡大プレビュー作戦図

## 完了体験

Owner が Dashboard Butler のチャットで画像または動画を添付すると、送信前はサムネイルだけが見え、ファイル名で横幅を取られない。サムネイルをタップすると画面内で大きく確認でき、上部または補助表示でファイル名と保存期間を確認できる。閉じるボタンでチャットに戻れる。

送信済み添付も TTL 内なら同じ操作で拡大確認できる。期限切れまたは取得不能の場合は raw JSON ではなく、日本語で保存期間切れや再添付が必要なことを伝える。

## VTDD 全体で進める部分

この PR は Issue #498 の添付 UX スライスであり、PR #735 の 7日保持・期限切れ route を前提に、Owner PWA の通常チャット内表示を改善する。画像解析の VPS handoff や動画解析の実行経路は後続スライスで扱う。

## 設計

通常チャット内ではファイル名を出さず、サムネイルを主表示にする。ファイル名、保存期間、動画 controls などの詳細は拡大プレビューに寄せる。

拡大プレビューはチャット履歴の message として保存しない。Worker が生成する Dashboard HTML 内に一つだけ overlay を持ち、送信前添付と送信済み media reference の両方から同じ `openMediaLightbox` 経路で開く。

## 仮説

現在の `src/worker/runtime.js` は `renderPendingMedia` と `renderMediaReferences` で `.media-chip` にサムネイル、種別、保存期間ラベルを横並びにしている。このため iPhone/iPad でサムネイルが小さくなり、ファイル名や補助情報が本来見たい画像内容を圧迫している。

また `renderPendingMedia` には `label` 未定義の append が残っており、添付直後のプレビュー消失に関係する可能性がある。送信前 preview と送信済み preview を同じ軽量 overlay に統一すれば、表示の破綻を小さくできる。

## 検証計画

- `test/worker.test.js`: Dashboard HTML に media lightbox markup、open/close 関数、サムネ click 経路、ファイル名を modal 内へ寄せる経路があることを確認する。
- `node --test test/worker.test.js`: Worker HTML smoke と既存 route test を確認する。
- `npm run build:worker`: `src/worker/runtime.js` から generated `worker.js` を更新する。
- `npm run check:generated-worker`: generated worker の整合性を確認する。
- `git diff --check`: whitespace と patch 事故を確認する。

## 改修見積もり

- `src/worker/runtime.js`: media chip CSS、lightbox CSS/markup、`renderMediaReferences`、`renderPendingMedia`、modal open/close helper を変更する。リスクは単一 HTML 生成内の DOM 操作のため、文字列テストだけでは実機のレイアウト全体を保証しきれないこと。
- `test/worker.test.js`: media upload smoke test を、横並びラベル前提から thumbnail-only + lightbox 前提へ更新する。リスクは HTML 文字列検査に偏ること。
- `worker.js`: generated worker。`npm run build:worker` の出力として同じ commit に含める。

## 既に通っている経路

- PR #735 で D1 metadata と R2 customMetadata に `expiresAt` が入り、default 7日保持になっている。
- PR #735 で `/v2/media/:id/download` は期限切れを `410 media_expired` として扱う。
- Dashboard upload control は `image/*` 固定ではなく動画を含むファイル選択を許可している。

## 未確認の境界

- production iPhone/iPad PWA でモーダル拡大、閉じる、スクロール干渉、動画 controls が期待通りかは merge/deploy 後 E2E が必要。
- 期限切れ添付をタップした時の日本語 UI は route 側のエラーと lightbox の読み込み失敗表示を組み合わせて確認する必要がある。
- Codex が動画内容を解析する実行経路はこの PR では接続しない。

## 穴が出そうな箇所

- pending preview の object URL を modal にも使うため、削除時と送信完了時の revoke 後に古い modal が残ると broken preview になる。
- overlay を開いたまま送信完了や再描画が走る場合、focus return と body cleanup が必要。
- サムネクリックを button にすると video controls と入れ子になりやすいので、送信前の chip は role/button の `span`、送信済みは previewable な場合だけ `button` に分ける。

## PR 前に確認すること

- worktree が latest `origin/main` / PR #735 merge commit から始まっていること。
- `appendMediaLabel(chip, reference)` など横並びラベル前提の test が残っていないこと。
- generated `worker.js` が source と一致していること。

## 実装候補と捨てた案

- 採用: 単一 lightbox overlay を Dashboard HTML に置き、送信前/送信済みどちらも同じ helper で開く。
- 捨てた案: チャット本文内に大きな card を常時表示する。チャットを占領し、owner が求める通常会話 UX を悪化させる。
- 捨てた案: ファイル名を折り返しでサムネ下に出す。小画面ではサムネイルの視認性をまだ圧迫する。

## merge 後に通す E2E

- iPhone/iPad PWA で画像を添付し、送信前サムネが消えず、ファイル名が横並び表示されないこと。
- サムネタップで拡大プレビューが開き、ファイル名が拡大表示側で確認でき、閉じるボタンでチャットに戻れること。
- 送信済み添付でも同じ拡大操作ができ、履歴に raw image や長いファイル名が増えないこと。
- 期限切れ添付は raw JSON ではなく owner-facing の失敗表示になること。

## 次の PR を増やさない理由

7日保持は PR #735 で分離済みであり、今回の UX 不満は同じ DOM 表示面に集中している。サムネ縮小、送信前プレビュー消失、クリック拡大、ファイル名位置を別 PR に分けると、owner が確認する実体験が再び断片化するため、この UI 表示面だけを一つの PR にまとめる。

## 停止条件

- Issue #498 の画像解析 handoff や動画解析実行まで触る必要が出た場合は停止し、別スライスに分ける。
- storage TTL や R2 cleanup の仕様変更が必要になった場合は PR #735 の範囲を再確認して停止する。
- deploy、credential、permission、destructive cleanup が必要になった場合は passkey approval 境界として停止する。
