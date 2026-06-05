# Issue #613 repo-less media scope regression strategy

## 完了体験

Owner が Dashboard Butler の repo-less main chat で画像を添付して送ると、画像は private unscoped media として保存され、同じ Dashboard thread の owner message に media reference として残る。URL や画面表示に `github.com/marushu` のような不完全な GitHub path が残っていても、それを `github.com/marushu` repository として扱わず、repo mismatch error を出さない。

## VTDD 全体で進める部分

この PR は #613 の single main chat 方針を壊さず、#498/#587 の media attachment path の repo-less private conversation case を復旧する。Butler の自然文から repo が必要になった時に repo を解決する設計は維持し、通常チャットの常設 repo 固定は復活させない。

## 設計

Dashboard の表示用 `repositoryInput` と、media upload / owner message validation に使う canonical repository scope を分離する。`github.com/marushu` は GitHub host path だが repository 名ではないため canonical repo として拒否する。一方、`https://github.com/marushu/vtdd-v2-p` や `github.com/marushu/vtdd-v2-p` のように owner/repo まである入力は `marushu/vtdd-v2-p` に正規化して扱えるようにする。

## 仮説

現在の `normalizeCanonicalRepositoryInput()` は `github.com/marushu` を `owner/repo` 形式として通してしまう。画像 upload は private unscoped として保存されるか、あるいは Dashboard form から raw `repositoryInput` が送信される。送信時 `resolveDashboardChatMediaReferences()` は message repository scope を `github.com/marushu` と見なし、media record の repository `null` と mismatch して `media reference ... does not belong to github.com/marushu` を返す。

## 検証計画

`/v2/dashboard/chat/messages` に `repository: "github.com/marushu"` と unscoped private media reference を送っても 202 で保存される regression test を追加する。Dashboard HTML に `repository=github.com/marushu` があっても composer の `data-repository-input` は空で、表示ラベルだけが `この作業: github.com/marushu` のまま残ることを確認する。worker build 後に generated worker check と worker test を通す。

## 改修見積もり

- `src/worker/runtime.js`: `normalizeCanonicalRepositoryInput()`。GitHub URL / host path を owner/repo に変換し、不完全な `github.com/owner` と host-like owner を拒否する。リスクは既存の owner segment 許容範囲が変わること。
- `src/worker/runtime.js`: `renderV2DashboardPage()`。表示用 input と canonical scope を分け、form / repo-bound links / latest deploy lookup は canonical scope を使う。リスクは非 canonical 表示文字列で operations link が無効化されることだが、repo-less main chat 方針では望ましい。
- `test/worker.test.js`: repo-less private media と incomplete GitHub path の regression test、Dashboard form scope test を追加する。リスクは fixture の Dashboard HTML 断片に依存しすぎること。
- `worker.js`: generated worker を build で更新する。リスクは生成物差分が大きく見えること。

## 既に通っている経路

Private unscoped media upload は `repositoryInput: "未指定"` で許可されている。Canonical repo media reference は `marushu/vtdd-v2-p` で chat message に保存できる。Issue mismatch は既存 test で拒否される。

## 未確認の境界

実 production の該当 media record が `repository: null` だったか、upload 自体が 422/413 で落ちたかは runtime store を直接読んでいない。スクリーンショット上の error text は送信時 media validation の repository mismatch と一致する。

## 穴が出そうな箇所

Dashboard URL に古い `repositoryInput` が残る場合、表示上は「この作業: github.com/marushu」と見える可能性がある。実行 scope は空にするが、owner-facing 表示の紛らわしさは残り得る。これは別 slice で「不完全 repo 表示を repo-less label に戻す」UI 判断として扱える。

## PR 前に確認すること

`git status --short --branch` で latest main 由来の topic branch であることを確認する。PR body は #613 follow-up として、#498/#587 related と明記し、`Closes` は書かない。deploy / app-server bridge restart は owner approval boundary の外なので、この PR 作成時点では実行しない。

## 実装候補と捨てた案

採用: canonical normalization を GitHub URL aware にし、Dashboard composer の実行 scope には canonical repo だけを入れる。

捨てた案: `resolveDashboardChatMediaReferences()` で private unscoped media の repository mismatch を常に許可する。これは repo-bound private media の漏れを防ぐ境界を弱めるため不採用。

捨てた案: media upload の repository を raw `github.com/marushu` で保存する。GitHub repository として無効な値を永続化するため不採用。

## merge 後に通す E2E

本番 deploy 後、Dashboard Butler repo-less main chat で画像を添付して送信し、送信前の添付表示、owner message 保存、Butler/app-server 応答、media reference download が同じ thread で確認できることを iPad/iPhone で見る。

## 次の PR を増やさない理由

`github.com/marushu` 誤認と form の raw scope 送信は同じ root cause であり、どちらか一方だけだと再発する。media validation 緩和や UI redesign は含めないため、PR はこの regression slice に収まる。

## 停止条件

Canonical repository normalization の変更が approval / deploy / GitHub App route の既存 tests を広範囲に壊す場合は停止し、repo parser の共有契約を別 Issue/PR に切り出す。Public/evidence media の repository boundary を緩める必要が出た場合も停止する。
