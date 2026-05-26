import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "e2e-534-dashboard-info-architecture.md"
);
const MOBILE_SCREENSHOT_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "assets",
  "issue-534",
  "dashboard-mobile-390x844.png"
);
const DESKTOP_SCREENSHOT_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "assets",
  "issue-534",
  "dashboard-desktop-1280x900.png"
);
const NOTIFICATIONS_MOBILE_SCREENSHOT_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "assets",
  "issue-534",
  "notifications-mobile-390x844.png"
);
const NOTIFICATIONS_EVENT_MOBILE_SCREENSHOT_PATH = path.join(
  process.cwd(),
  "docs",
  "mvp",
  "e2e",
  "assets",
  "issue-534",
  "notifications-mobile-event-390x844.png"
);

test("E2E-534 evidence doc records Dashboard information architecture visual run", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  assert.equal(doc.includes("Issue `#534`"), true);
  assert.equal(doc.includes("chat-first owner-facing surface"), true);
  assert.equal(doc.includes("390 x 844"), true);
  assert.equal(doc.includes("1280 x 900"), true);
  assert.equal(doc.includes("notification center first viewport shows `最新通知`"), true);
  assert.equal(doc.includes("keeps `通知センターについて`, `通知設定`, and `通知の詳細設定と安全境界` collapsed below it"), true);
  assert.equal(doc.includes("no longer shows the full `iOS PWA 通知` or `Badge` setup cards by default"), true);
  assert.equal(doc.includes("collapsed under `通知センターについて`"), true);
  assert.equal(doc.includes("deployed PR number and change summary"), true);
  assert.equal(doc.includes("workflow/run URL without horizontal clipping"), true);
  assert.equal(doc.includes("Operational RAG"), true);
  assert.equal(doc.includes("Deploy operator"), true);
  assert.equal(doc.includes("does not close Issue `#514`"), true);
});

test("E2E-534 screenshot artifacts are present in repo evidence", () => {
  assert.equal(fs.existsSync(MOBILE_SCREENSHOT_PATH), true);
  assert.equal(fs.existsSync(DESKTOP_SCREENSHOT_PATH), true);
  assert.equal(fs.existsSync(NOTIFICATIONS_MOBILE_SCREENSHOT_PATH), true);
  assert.equal(fs.existsSync(NOTIFICATIONS_EVENT_MOBILE_SCREENSHOT_PATH), true);
  assert.ok(fs.statSync(MOBILE_SCREENSHOT_PATH).size > 30_000);
  assert.ok(fs.statSync(DESKTOP_SCREENSHOT_PATH).size > 30_000);
  assert.ok(fs.statSync(NOTIFICATIONS_MOBILE_SCREENSHOT_PATH).size > 30_000);
  assert.ok(fs.statSync(NOTIFICATIONS_EVENT_MOBILE_SCREENSHOT_PATH).size > 30_000);

  const mobilePng = fs.readFileSync(MOBILE_SCREENSHOT_PATH);
  const desktopPng = fs.readFileSync(DESKTOP_SCREENSHOT_PATH);
  const notificationsMobilePng = fs.readFileSync(NOTIFICATIONS_MOBILE_SCREENSHOT_PATH);
  const notificationsEventMobilePng = fs.readFileSync(NOTIFICATIONS_EVENT_MOBILE_SCREENSHOT_PATH);
  assert.equal(mobilePng.readUInt32BE(16), 390);
  assert.equal(mobilePng.readUInt32BE(20), 844);
  assert.equal(desktopPng.readUInt32BE(16), 1280);
  assert.equal(desktopPng.readUInt32BE(20), 900);
  assert.equal(notificationsMobilePng.readUInt32BE(16), 390);
  assert.equal(notificationsMobilePng.readUInt32BE(20), 844);
  assert.equal(notificationsEventMobilePng.readUInt32BE(16), 390);
  assert.equal(notificationsEventMobilePng.readUInt32BE(20), 844);
});
