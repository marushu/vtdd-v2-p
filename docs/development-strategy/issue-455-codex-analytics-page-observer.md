# Issue #455 Codex Analytics page observer 作戦図

## 完了体験

owner は Dashboard Butler から「Codex 使用量を確認して」「この turn の前後でどれだけ減ったか見たい」と自然文で依頼できる。Butler は AI 風に代替回答せず、接続済みの観測 runner から最新 snapshot または before/after delta を読み、使用量ページ由来の構造化値だけを返す。

コストチェッカーは常時ONではない。owner または operator が明示的に有効化した時だけ取得し、不要な時は完全に停止できる。既定は `disabled` とし、短時間の検証では `manual` または single-shot capture を使う。

## VTDD 全体で進める部分

Issue #455 の「Codex 使用量がどこで増えるかを可視化する」「RAG には full transcript ではなく、使用量増加の原因・判断・削減結果だけを構造化して残す」部分を進める。

PR #764 / PR #765 の方針を維持する。Dashboard Worker は cost/read 相談に AI 風返信しない。通常 chat は bridge / `codex app-server` へ届き、コスト観測は別の observer truth として扱う。

## 設計

`codex_analytics_page_observer` という観測 surface を定義する。これは実行・判断・返信生成の主経路ではなく、使用量ページの表示値を読む read-only collector である。

設定は次の3状態にする。

- `disabled`: 既定。ChatGPT / Codex usage page を開かず、snapshot も取得しない。Dashboard には `costChecker.enabled=false` と `reason=disabled_by_default` を返す。
- `manual`: owner が明示した single-shot の時だけ取得する。通常の before/after 証跡はこの mode から始める。
- `enabled`: owner / operator が明示した期間だけ before/after capture を許可する。TTL または session scope を必須にし、無期限の常時監視にしない。

observer の出力は、ページ全文・cookie・token・生HTMLではなく、次の最小 snapshot に限定する。

```json
{
  "kind": "codex_analytics_usage_snapshot",
  "captureMode": "manual",
  "enabled": true,
  "capturedAt": "2026-06-04T00:00:00.000Z",
  "source": "chatgpt_codex_analytics_page",
  "captureMethod": "authenticated_browser_dom_or_ocr",
  "limits": [
    {
      "label": "5時間の使用制限",
      "remainingPercent": 93,
      "resetAtText": "15:16"
    }
  ],
  "redacted": true
}
```

Dashboard / Butler へ返す runtime truth は `costChecker.enabled`, `mode`, `lastCapturedAt`, `lastSnapshotAvailable`, `lastDeltaAvailable`, `blockedReason` に絞る。

## 仮説

公式の個人向け usage page は owner の logged-in browser session で表示されるため、Cloudflare Worker や VPS から無条件に読めるものではない。認証情報を repo / RAG / runtime storage に置く実装は安全境界を壊す。

したがって最初の実装は、operator-owned browser context で page DOM または screenshot OCR を読む local / VPS-side observer と、Dashboard がその redacted snapshot を読む ingest path に分けるのが安全である。

toggle を持たない collector から始めると、通常会話や長時間作業のたびに usage page を開く設計に流れ、owner が望むコスト削減と逆方向になる。先に on/off と TTL を仕様に固定する。

## 検証計画

- Unit: config parser が未指定を `disabled` にする。
- Unit: `manual` は single-shot capture だけ許可し、定期 capture を拒否する。
- Unit: `enabled` は TTL / session scope なしでは invalid とする。
- Unit: snapshot sanitizer が cookie、token、生HTML、full transcript を保持しない。
- Unit: before/after delta は rounded percent / reset text を扱い、厳密な per-message billing として断定しない。
- Integration: Dashboard runtime truth が `costChecker.enabled=false` の時に capture を起動しない。
- E2E: owner が manual capture を要求した時、接続済み observer があれば snapshot を返し、なければ `observer_unavailable` と次の owner action を返す。

## 改修見積もり

- `docs/development-strategy/issue-455-codex-analytics-page-observer.md`: この作戦図。risk は実装前提を曖昧にすると常時監視へ drift すること。
- `scripts/capture-codex-analytics-usage.mjs`: optional follow-up。logged-in browser DOM または screenshot OCR から redacted snapshot を作る。risk は ChatGPT UI 変更と認証境界。
- `src/core/codex-analytics-usage.js`: optional follow-up。mode parser / sanitizer / delta builder。risk は percent 表示を精密課金に見せてしまうこと。
- `test/codex-analytics-usage.test.js`: optional follow-up。fixture HTML / OCR text / config mode を検証する。live ChatGPT page は CI で叩かない。
- `src/worker/runtime.js`: optional later。Dashboard runtime truth / ingest route を接続する場合のみ触る。risk は Worker が ChatGPT 認証情報を扱う方向へ広がること。

## 既に通っている経路

- PR #764 で Dashboard Worker の AI 風 fast path を止め、通常 chat を app-server bridge へ届ける方針に戻した。
- PR #765 で Dashboard app-server bridge の cost profile / model / reasoning effort truth を出せる足場を追加した。
- `docs/butler/dashboard-butler-app-server-live-path.md` は、cost questions も bridge / `codex app-server` へ届けること、usage tuning は Worker pseudo-answer ではなく bridge 側で扱うことを定義している。
- Issue #455 は Codex Analytics スクリーンショット由来の owner 報告を evidence path として認めている。

## 未確認の境界

個人向け `https://chatgpt.com/codex/cloud/settings/analytics#usage` の DOM から安定して値を読めるかは未確認。DOM が読めない場合は screenshot OCR fallback が必要になる。

Business / Enterprise / Edu では Codex Analytics / Compliance API が存在する可能性があるが、この public/core branch は owner 個人アカウント前提の秘密値や API key を repo に固定しない。

usage page の percent は丸め表示や反映遅延があり得る。before/after delta は傾向証跡であり、正確な per-turn 課金証明ではない。

## 穴が出そうな箇所

- toggle なしで collector を実装すると、常時監視になり使用量・認証・プライバシー負荷が増える。
- ChatGPT cookie / session token を RAG や repo に保存すると重大な credential leak になる。
- full screenshot をそのまま保存すると workspace 名、account 情報、他の UI 断片を含む可能性がある。
- Worker に ChatGPT 認証を持たせると、Dashboard Butler の中継機境界を壊す。
- usage delta を「この会話は何クレジット」と断定すると、公式 billing truth ではない値を過信させる。

## PR 前に確認すること

- branch が latest `origin/main` から切られている。
- PR #765 の deploy / VPS bridge restart 状況を PR body に正直に書く。未デプロイなら未デプロイと書く。
- 実装を入れる場合は先に `manual` / `disabled` の tests を書く。
- ChatGPT logged-in browser を読む live probe は owner の明示許可なしに実行しない。
- PR body の Execution Queue Delta で、Issue #455 の observer slice が owner 指示による `NEXT` / `QUEUE` 更新であり、active Issues を downscope していないことを明記する。

## 実装候補と捨てた案

採用: 既定 `disabled`、single-shot `manual`、TTL 必須の `enabled` を持つ observer config。

採用: snapshot は redacted structured metrics のみ。full transcript / full page dump / raw cookie は保持しない。

捨てた案: usage page を Dashboard Worker から直接 scrape する。ChatGPT 認証情報を Worker に持ち込むため不採用。

捨てた案: 常時ONの定期監視。owner の「クレジット節約」目的と矛盾し、不要な認証ページアクセスを増やすため不採用。

捨てた案: usage delta を精密課金として扱う。表示値の丸め・遅延があるため不採用。

## merge 後に通す E2E

1. `disabled` の状態で Dashboard Butler から「使用量を確認して」と送る。期待値は capture を起動せず、`costChecker.enabled=false` と observer 未接続 / disabled reason を返す。
2. `manual` の状態で owner が single-shot capture を明示する。接続済み observer がある場合だけ redacted snapshot を返す。
3. `enabled` の状態で Dashboard app-server turn の前後に snapshot を取り、delta を `bridgeProfile` / `modelConfigured` / `reasoningEffortConfigured` と一緒に表示する。
4. TTL 期限後は自動で `disabled` 相当に戻り、capture が止まる。

## 次の PR を増やさない理由

この作戦図は、PR #765 の「軽量 profile を試せる足場」に対して、実際に減り方を観測するための次 slice を定義する。toggle を同じ slice に含めることで、observer 実装後に常時監視を止める別 PR を増やさない。

ただし DOM/OCR collector、Dashboard ingest、VPS deployment は authority と検証境界が違うため、実装 PR では最小の parser / config / sanitizer から始め、live browser probe は明示許可後に分ける。

## 停止条件

- ChatGPT 認証情報を repo / RAG / Worker storage に置く必要が出た場合。
- owner の明示許可なしに logged-in browser を開く必要が出た場合。
- Worker が使用量ページを直接読む設計に広がった場合。
- cost checker が既定ONまたは無期限ONでないと成立しない場合。
- usage page の表示値を正確な課金 API として扱いそうになった場合。
