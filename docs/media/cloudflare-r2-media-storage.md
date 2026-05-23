# VTDD Media Storage Spec: Cloudflare R2

Issue: #498

## Purpose

VTDD / Dashboard Butler / RAG / Issue / PR で扱う画像、スクリーンショット、動画、音声、添付ファイルは Cloudflare R2 に保存し、D1 には検索、参照、権限、紐付けに必要な metadata だけを保持する。

R2 は大きい binary object の保存先、D1 は object key と参照関係の管理先として分離する。

## Scope

この仕様は Issue #498 の storage contract と first implementation slice を固定する。

初期 E2E は iPhone / PWA Dashboard Butler からの screenshot upload を対象にする。storage schema と route contract は image 以外の media / file も扱える形にするが、動画変換、サムネイル生成、画像編集、大量 upload 最適化は first slice の対象外とする。

## Storage

Cloudflare R2 bucket:

```text
production: vtdd-media-prod
preview/dev: vtdd-media-dev
```

Worker binding:

```text
VTDD_MEDIA_R2
```

Object key format:

```text
media/{repoOwner}/{repoName}/{yyyy}/{mm}/{dd}/{uuid}/{filename}
```

Example:

```text
media/sample-owner/sample-repo/2026/05/23/01J.../dashboard-screenshot.png
```

The object key must not contain tokens, approval grant IDs, private URLs, or user-entered secret material.

## D1 Metadata

Media metadata is stored in the existing Worker D1 plane, using this table:

```sql
CREATE TABLE IF NOT EXISTS vtdd_media_objects (
  id TEXT PRIMARY KEY,
  repository TEXT,
  related_issue INTEGER,
  related_pr INTEGER,
  source_surface TEXT NOT NULL,
  source_event_id TEXT,
  object_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  visibility TEXT NOT NULL,
  summary TEXT,
  ocr_text TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vtdd_media_repo
  ON vtdd_media_objects(repository, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vtdd_media_issue
  ON vtdd_media_objects(repository, related_issue, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vtdd_media_pr
  ON vtdd_media_objects(repository, related_pr, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vtdd_media_source
  ON vtdd_media_objects(source_surface, source_event_id);
```

`sha256` is calculated before metadata insert. A failed R2 put or failed D1 insert must not be reported as a saved media object.

## Visibility

Default visibility is `private`.

```text
private
  owner / authorized Butler only

repo_internal
  repository context 内で参照可能

public_evidence
  Issue / PR / E2E 証跡として公開してよいもの
```

Promotion from `private` or `repo_internal` to `public_evidence` requires explicit `GO`. Secret-looking media must not be promoted to public evidence.

## Routes

```text
POST   /v2/media/upload
GET    /v2/media/:id
GET    /v2/media/:id/download
GET    /v2/media/search
DELETE /v2/media/:id
```

`POST /v2/media/upload` accepts the media body and context metadata, performs auth and authority checks, calculates `sha256`, writes the R2 object, inserts D1 metadata, optionally creates OCR / summary text, and returns a media reference.

`GET /v2/media/:id` returns metadata and non-sensitive summary fields. It must not return raw binary media.

`GET /v2/media/:id/download` returns the binary object through a same-origin authorized route or a short-lived signed URL equivalent.

`DELETE /v2/media/:id` requires scoped approval. It must delete or tombstone metadata consistently with R2 object deletion semantics defined by the implementation.

## Authority Boundary

- upload: authenticated owner / trusted runner
- read private media: authenticated owner / trusted Butler
- delete: scoped approval required
- public evidence promotion: explicit `GO` required
- secret-looking media: public promotion forbidden
- deploy, credential mutation, permission mutation, Cloudflare bucket creation, and binding mutation: scoped passkey approval required

If the R2 binding or D1 binding is missing at runtime, media routes must fail closed with owner-facing Japanese error text. They must not silently fall back to chat history, RAG, GitHub Issue comments, PR bodies, or local filesystem persistence.

## Upload Flow

```text
Dashboard Butler / runner / API
  -> media upload route
  -> auth / approval boundary check
  -> sha256 calculate
  -> R2 put
  -> D1 metadata insert
  -> optional OCR / summary
  -> optional RAG memory reference
  -> dashboard thread に media reference を返す
```

Dashboard durable thread history stores only the media reference and safe metadata. Raw media binary is never stored in dashboard chat durable history.

## RAG Integration

RAG may store:

```json
{
  "type": "media_reference",
  "mediaId": "med_...",
  "repository": "sample-owner/sample-repo",
  "relatedIssue": 498,
  "contentType": "image/png",
  "summary": "Dashboard Butler の iPhone PWA 画面。返信待ち表示が残っている。",
  "ocrText": "VPS Codex CLI に送信しました...",
  "objectKey": "media/...",
  "visibility": "private"
}
```

RAG must not store:

- raw image binary
- raw audio / video binary
- secrets
- tokens
- credentials
- private screenshots containing sensitive data without filtering

Any PR that changes RAG media write behavior must state expected write volume and cost impact.

## Butler Behavior

When the user sends an image, video, audio, or file:

1. Butler uploads the attachment to R2 through the media upload route.
2. Butler stores metadata in D1.
3. Butler creates OCR / summary when needed and allowed.
4. Butler places a media reference and summary into conversation context.
5. Butler asks whether the media should be used as Issue / PR / E2E evidence.

Example owner-facing reply:

```text
画像を保存しました。

- mediaId: med_...
- repository: sample-owner/sample-repo
- relatedIssue: #498
- visibility: private

この画像は Dashboard Butler の返信待ち UI の証跡として使えます。
Issue #498 に証跡コメントとして残す場合は GO と言ってください。
```

## First Implementation Slice

The first implementation slice is incomplete until all of these are connected and verified:

1. R2 binding `VTDD_MEDIA_R2` is declared without owner-specific account IDs in the public repo.
2. D1 table `vtdd_media_objects` is created or migrated.
3. `POST /v2/media/upload` is implemented.
4. `GET /v2/media/:id` is implemented.
5. Dashboard Butler thread can display a media reference.
6. RAG stores only media summary/reference, never raw media.
7. E2E proves iPhone screenshot upload -> dashboard thread media reference -> R2/D1 confirmation.

## Non-goals for First Slice

- video conversion
- thumbnail generation
- image editing
- automatic public promotion
- automatic long-term retention policy
- bulk upload optimization
- Cloudflare account setup automation
- deploy or credential mutation without scoped passkey approval

## Completion Boundary

This document is a specification anchor only. It does not complete Issue #498 by itself.

Issue #498 remains incomplete until Butler natural-language intent, Custom GPT Action Schema, runtime route, runner path, authority boundary, runtime truth, and mapped E2E evidence are all connected.
