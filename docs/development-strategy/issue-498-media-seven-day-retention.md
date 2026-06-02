# Issue #498 / #587 media seven-day retention strategy

## 完了体験

Owner が Dashboard Butler に画像や短い動画を添付すると、送信前プレビューが消えず、送信後も 7 日間は同じ thread から確認できる。添付本体は R2 に置き、D1 と chat history には metadata と media reference だけを残す。期限内であれば Butler / VPS Codex CLI は mediaId から同一 origin の download route を通じて取得できる。

動画は first slice では保存・表示・取得を扱う。Codex 解析は、直接動画入力を前提にせず、将来の frame extraction / thumbnail sampling route へ拡張できる境界を残す。

## VTDD 全体で進める部分

- Issue #498: 添付が Butler / VPS analysis path に届くこと、raw binary を D1 / chat / RAG に入れないこと、TTL と見返し UX を owner-facing にする。
- Issue #587: 短い動画添付を画像と同じ storage route で退行させず、UI でも動画として認識できることを保つ。
- Issue #590 は進行表示の親 blocker だが、この PR では触らない。添付 UX が戻らないと screenshot feedback loop が成立しないため、Issue #498 は active root blocker の実用上の前提になる。

## 設計

- Default retention は 7 日。`createdAt + 7 days` を `expiresAt` として media metadata に保存する。
- D1 schema に `expires_at` を追加する。既存 D1 に対しては `ALTER TABLE ... ADD COLUMN expires_at TEXT` を best-effort で走らせ、既存行は `created_at + 7 days` に normalize する。
- R2 object の customMetadata に `expiresAt` を入れる。これは cleanup / debugging の補助で、canonical は D1 metadata。
- `GET /v2/media/:id` と `/download` は期限切れを 410 で返す。raw JSON だけで終わらせず、日本語 `reason` と `ownerMessage` を入れる。
- Search は期限切れ media を返さない。
- `toMediaReference()` と chat media reference に `expiresAt` / `retentionLabel` を含め、UI で「7日後に削除」または「あとN日」を表示できるようにする。
- 送信待ち preview は object URL を保持し、ファイル名は補助情報に抑える。動画は `video` preview を優先する。

## 仮説

添付が「消える」主因は storage TTL ではなく、pending media preview / media reference rendering の情報不足と、送信後 media reference の owner-facing 表示が弱いこと。既存 code には `URL.createObjectURL`、video/mp4 upload、R2/D1 metadata tests があるため、first slice は route/schema/metadata/UI 表示を細く補強すればよい。

動画 picker が owner 画面で写真だけに見える理由は、deployed client / iOS picker UI / PWA stale state の可能性がある。source では `accept="image/*"` は既に消えており、`video/mp4` upload test もあるので、今回の PR は動画添付の許可を壊さず、表示と metadata を固める。

## 検証計画

- `node --test test/worker.test.js`
- `npm run build:worker`
- `npm run check:generated-worker`
- `git diff --check`
- 追加テスト:
  - upload response / metadata / normalized reference に `expiresAt` が含まれる。
  - R2 customMetadata に `expiresAt` が入る。
  - expired media metadata/download は 410 と日本語 reason を返す。
  - search は expired media を返さない。
  - Dashboard HTML は retention 表示と video preview path を持つ。

## 改修見積もり

- `src/worker/runtime.js`
  - media upload route: default 7-day `expiresAt` calculation and R2 metadata.
  - media object route: expired media 410 handling.
  - D1 media object store: `expires_at` column, schema migration, row mapping, search filtering.
  - media reference normalization/rendering: `expiresAt` and retention label.
  - Dashboard HTML JS: pending/stored media retention label display.
- `worker.js`
  - generated Worker bundle.
- `test/worker.test.js`
  - media upload/metadata/download/search/UI assertions.
- `docs/media/cloudflare-r2-media-storage.md`
  - first slice non-goalから automatic long-term retention を外し、7-day short-lived retention contract を明記する。

## 既に通っている経路

- `/v2/media/upload` は R2 に raw bytes、D1 に metadata のみを保存するテストがある。
- `video/mp4` は保存・download route の test がある。
- Dashboard HTML は `accept="image/*"` を使わず、video preview element を持つ。
- app-server bridge は media references を localPath に materialize する経路を持つ。

## 未確認の境界

- production R2 lifecycle rule は未確認。今回の PR では Cloudflare bucket 設定を変更しない。
- real iPhone Photos picker の動画選択挙動は production E2E が必要。
- Codex の直接動画解析 capability は surface 依存。今回の PR では保存と取得だけを完成体験にする。

## 穴が出そうな箇所

- D1 `ALTER TABLE` が既存 schema に対して idempotent でない可能性。
- 期限切れ判定を download だけに入れると metadata / search で stale reference が残る。
- UI の retention label が長すぎると thumbnail を圧迫する。
- rollback delete は期限切れと同じ delete 権限に混ぜない。

## PR 前に確認すること

- main worktree の未整理差分に触れていないこと。
- raw binary が response / metadata / chat history に入っていないこと。
- `Issue #498` と `Issue #587` の Non-goal を越えていないこと。
- deploy / Cloudflare binding mutation をしていないこと。

## 実装候補と捨てた案

- 採用: D1 metadata に `expiresAt` を入れ、R2 metadata にも同じ値を補助的に入れる。
- 採用: expired read は 410 Gone + Japanese owner message。
- 捨てた案: R2 lifecycle rule だけで削除する。D1 metadata が残り、UI が stale reference を出すため不十分。
- 捨てた案: 動画を直接 Codex に渡す。surface capability に依存し、Issue #587 の first slice を越える。

## merge 後に通す E2E

- production PWA で画像を添付し、送信前 preview が残る。
- 送信後 thread に media reference が残り、7日保持が分かる。
- mediaId から app-server bridge が localPath を取得できる。
- 短い mp4 を添付し、pending / stored 表示で動画として認識できる。

## 次の PR を増やさない理由

7日保持、期限表示、期限切れエラーは同じ schema / route / UI reference の一体変更であり、分割すると production E2E が「保存されたがいつ消えるか分からない」状態になる。動画解析そのものは別 PR に分ける。

## 停止条件

- D1 migration が既存 production schema に安全に適用できない場合。
- 添付 retention が Issue #498 の raw binary 非保存ルールを破る場合。
- 動画解析のために新しい外部 model / credential / Cloudflare binding が必要になる場合。
- production deploy / bucket lifecycle mutation が必要になった場合。
