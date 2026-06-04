# Issue #455 Codex Analytics usage observer を Butler で使える状態にする作戦図

## 完了体験

オーナーは Codex 使用量ページの表示値を手動で取得し、VPS Codex CLI または Dashboard Butler 経由で VTDD runtime に投入できる。投入後、Butler は最新スナップショット、直前との差分、コストチェッカーが disabled/manual/enabled のどの状態かを runtime truth として読める。Dashboard chat には証跡メッセージが残り、後続の「会話だけ」「開発」「長時間開発」の比較に使える。

## VTDD 全体で進める部分

このPRは #455 の機能単位として、観測データを VTDD runtime に入れて Butler が読めるところまでを接続する。#770 の core parser だけでは Butler 完了ではないため、manual capture runner、Worker ingest/retrieve route、Dashboard chat 証跡、テストをまとめる。

## 設計

- コストチェッカーはデフォルト disabled のままにする。
- manual は単発実行だけを許可する。
- enabled は TTL / expiresAt / sessionId のいずれかで範囲が明示された場合だけ有効とする。
- ChatGPT/Codex の認証済みページを自動で開く挙動はこのPRでは実装しない。
- 使用量ページ由来の値は billing truth ではなく、表示パーセント差分として扱う。
- Worker は machine bearer で投入/取得を受け、Dashboard chat store がある場合だけ証跡メッセージを追加する。

## 仮説

不足している根本は parser ではなく、Butler/VPS から runtime に観測値を渡す接続である。`src/core/codex-analytics-usage.js` はスナップショットと差分を作れるが、Worker route、runner script、保存形式、取得 route がなければ Dashboard Butler からは利用できない。狭く parser だけを増やすと、また「開発したがButlerでは使えない」状態になる。

## 検証計画

- unit: capture runner の dry-run が disabled/manual を正しく扱い、手動テキストから sanitizer 済み snapshot を作る。
- worker integration: unauthenticated ingest は拒否される。
- worker integration: authenticated ingest は snapshot を working memory に保存し、Dashboard chat 証跡を追加する。
- worker integration: 2回目 ingest は前回 snapshot との差分を作り、retrieve route が最新 snapshot/delta/runtime truth を返す。
- worker bundle: `npm run build:worker` と `npm run verify:worker` を通す。

## 改修見積もり

- `docs/development-strategy/issue-455-codex-analytics-butler-usable.md`: Issue #455 の機能単位と停止条件を記録する。リスクは低い。
- `scripts/capture-codex-analytics-usage.mjs`: 手動キャプチャCLIを追加する。認証ページの自動操作はしないため、秘密情報の保持リスクは低い。
- `src/worker/runtime.js`: ingest/retrieve route と保存・Dashboard chat 証跡を追加する。worker bundle 更新が必要で、route auth の取り違えが主リスク。
- `test/codex-analytics-usage.test.js`: runner dry-run を追加する。リスクは低い。
- `test/worker.test.js`: Worker ingest/retrieve の統合テストを追加する。既存 fixture と衝突しないよう isolated provider/store を使う。
- `worker.js`: generated worker bundle。source worker 変更に追従する。

## 既に通っている経路

#770 で parser、snapshot sanitizer、delta builder、runtime truth helper は実装済み。local `npm test` と worker build は通過済み。

## 未確認の境界

ChatGPT Codex analytics ページの内部APIは未確認であり、このPRでは依存しない。認証済みブラウザからのDOM/OCR自動取得も未接続であり、明示承認なしに実装しない。

## 穴が出そうな箇所

- raw page text に token/cookie 風文字列が混ざる可能性。
- Dashboard chat に長文や秘密値を残す危険。
- latest snapshot の repository/thread filter が緩いと別repoの値を拾う危険。
- route を追加しても Action Schema に未反映なら Butler 完了を過大報告する危険。

## PR 前に確認すること

- route が machine bearer を要求すること。
- 保存内容が redacted snapshot/delta だけで raw text を保持しないこと。
- retrieve response が no snapshot 時も runtime truth を返すこと。
- worker bundle が更新され、verify が通ること。

## 実装候補と捨てた案

採用: manual runner + Worker ingest/retrieve + Dashboard chat 証跡。  
捨てた案: ChatGPT ページを自動で開いてスクレイピングする。理由は認証境界が重く、今回の機能単位を超えるため。  
捨てた案: RAG に全ログを保存する。理由は RAG cost boundary に反し、表示値の最新状態だけで十分なため。

## merge 後に通す E2E

production deploy 後、passkey 承認を経て、VPS helper から manual snapshot を投入し、`/v2/retrieve/codex-analytics-usage` で latest/delta/runtimeTruth を取得する。Dashboard chat thread に証跡メッセージが出ることを確認する。

## 次の PR を増やさない理由

parser、runner、runtime route、保存、取得、Dashboard 証跡、テストは同じ機能単位であり、分けるとまた Butler から使えない中途半端な状態が残る。認証済みブラウザ自動取得だけは別の権限境界なのでこのPRから外す。

## 停止条件

Action Schema 変更が必須だと判明した場合は、同一PRに含めるか、理由を明示して incomplete とする。ChatGPT 認証ページの自動操作や cookie 保持が必要になった場合は、このPRでは停止し、承認境界を別Issue/PRに切る。
