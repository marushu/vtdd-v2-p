import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-518-dashboard-chat-transient-timestamps.md"
);
const MOBILE_SCREENSHOT_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "assets",
  "issue-518",
  "dashboard-chat-timestamps-mobile-390x844.png"
);

test("E2E-518 evidence doc records Dashboard timestamp and transient status run", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("Issue `#518`"), true);
  assert.equal(doc.includes("message-meta"), true);
  assert.equal(doc.includes("transient_status"), true);
  assert.equal(doc.includes("Dashboard thread 接続済み。"), true);
  assert.equal(doc.includes("既存 Issue / PR / docs を確認しています。"), true);
  assert.equal(doc.includes("reviewer 指摘を反映しています。"), true);
  assert.equal(doc.includes("390 x 844"), true);
  assert.equal(doc.includes("does not deploy to Cloudflare"), true);
  assert.equal(doc.includes("does not close Issue `#518`"), true);
});

test("E2E-518 mobile screenshot artifact is present in repo evidence", () => {
  assert.equal(fs.existsSync(MOBILE_SCREENSHOT_PATH), true);
  assert.ok(fs.statSync(MOBILE_SCREENSHOT_PATH).size > 50_000);

  const png = fs.readFileSync(MOBILE_SCREENSHOT_PATH);
  assert.equal(png.readUInt32BE(16), 390);
  assert.equal(png.readUInt32BE(20), 844);
});
