import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(process.cwd(), "docs", "media", "cloudflare-r2-media-storage.md");

test("media storage spec anchors Cloudflare R2 and D1 metadata contract", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  assert.equal(doc.includes("Issue: #498"), true);
  assert.equal(doc.includes("vtdd-media-prod"), true);
  assert.equal(doc.includes("vtdd-media-dev"), true);
  assert.equal(doc.includes("VTDD_MEDIA_R2"), true);
  assert.equal(doc.includes("media/{repoOwner}/{repoName}/{yyyy}/{mm}/{dd}/{uuid}/{filename}"), true);
  assert.equal(doc.includes("vtdd_media_objects"), true);
  assert.equal(doc.includes("sha256 TEXT NOT NULL"), true);
});

test("media storage spec defines routes and visibility authority", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  for (const route of [
    "POST   /v2/media/upload",
    "GET    /v2/media/:id",
    "GET    /v2/media/:id/download",
    "GET    /v2/media/search",
    "DELETE /v2/media/:id"
  ]) {
    assert.equal(doc.includes(route), true, `${route} should be documented`);
  }

  assert.equal(doc.includes("private"), true);
  assert.equal(doc.includes("repo_internal"), true);
  assert.equal(doc.includes("public_evidence"), true);
  assert.equal(doc.includes("explicit `GO` required"), true);
  assert.equal(doc.includes("scoped passkey approval required"), true);
});

test("media storage spec prevents raw media persistence in RAG and chat history", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  assert.equal(doc.includes("Raw media binary is never stored in dashboard chat durable history."), true);
  assert.equal(doc.includes("RAG must not store:"), true);
  assert.equal(doc.includes("raw image binary"), true);
  assert.equal(doc.includes("raw audio / video binary"), true);
  assert.equal(doc.includes("secrets"), true);
  assert.equal(doc.includes("tokens"), true);
  assert.equal(doc.includes("credentials"), true);
});

test("media storage spec keeps implementation completion separate from documentation", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");

  assert.equal(doc.includes("This document is a specification anchor only."), true);
  assert.equal(doc.includes("does not complete Issue #498 by itself"), true);
  assert.equal(doc.includes("E2E proves iPhone screenshot upload -> dashboard thread media reference -> R2/D1 confirmation"), true);
});
