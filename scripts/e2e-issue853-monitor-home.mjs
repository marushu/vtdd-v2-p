// DEMO evidence only: synthetic data + real Worker + in-memory backend. Never production.
// Operator-run only: node scripts/e2e-issue853-monitor-home.mjs [absolute Chromium executable]
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createInMemoryDashboardMonitorStore, normalizeMonitorSnapshot } from '../src/core/dashboard-monitor-state.js';

const artifacts = resolve('.local/issue-853/demo-review');
await mkdir(artifacts, { recursive: true });
const temporary = await mkdtemp(artifacts + '/browser-');
const originalNow = Date.now;
const epoch = Date.parse('2026-09-24T12:00:30Z');
let elapsed = 0, context, apiStatus = 200, offline = false;
let store = createInMemoryDashboardMonitorStore();
// Both the actual Worker and browser use this synthetic clock.
Date.now = () => epoch + elapsed;
const at = seconds => new Date(epoch + seconds * 1000).toISOString();
const env = {
  VTDD_GATEWAY_BEARER_TOKEN: 'local-fixture-only',
  get DASHBOARD_MONITOR_STORE() { return store; },
  DASHBOARD_EVENT_STORE: {
    async put() {}, async delete() {}, async latest() { return null; },
    async listRecent() {
      return [
        { kind: 'dashboard_push_received', title: 'Receipt hidden from history' },
        { kind: 'owner_action_required', changeSummary: '前回の監視が停止しました', title: 'これは過去の通知です。現在の監視は再接続されています。', createdAt: at(-3600) }
      ];
    }
  }
};
const cases = [], screenshots = [], consoleErrors = [], pageErrors = [];
try {
  const origin = 'http://127.0.0.1:853';
  await store.put(normalizeMonitorSnapshot({
    source: 'sample', id: 'repair', title: 'Sample repair monitor', description: 'デモの予約枠を確認しています。',
    status: 'no_slots', processAlive: true, intervalSeconds: 300, observedAt: at(0),
    lastAttemptAt: at(-680), lastSuccessAt: at(-658), nextCheckAt: at(42),
    resultSummary: '今回の確認では空きがありませんでした。', automationScope: '空き状況の確認のみ', automaticBookingEnabled: false
  }));
  context = await chromium.launchPersistentContext(temporary + '/profile', {
    headless: true, ...(process.argv[2] ? { executablePath: process.argv[2] } : {}),
    viewport: { width: 390, height: 844 }, colorScheme: 'light', serviceWorkers: 'block',
    env: { ...process.env, TMPDIR: temporary }
  });
  // Route every request locally. No listening server, external request, or live credential.
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (!url.startsWith(origin + '/')) return route.abort();
    if (url === origin + '/favicon.ico') return route.fulfill({ status: 204, body: '' });
    if (url.endsWith('/v2/dashboard/overview')) {
      if (offline) return route.abort();
      if (apiStatus !== 200) return route.fulfill({ status: apiStatus, body: '{}' });
    }
    const response = await worker.fetch(new Request(url, { headers: { authorization: 'Bearer local-fixture-only' } }), env);
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  const page = context.pages()[0];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.clock.install({ time: new Date(epoch - 1000) });
  await page.clock.pauseAt(new Date(epoch));
  const tick = async milliseconds => { elapsed += milliseconds; await page.clock.runFor(milliseconds); };
  const refresh = async () => {
    const response = page.waitForResponse(r => r.url() === origin + '/v2/dashboard/overview');
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await response;
  };
  await page.goto(origin + '/dashboard');
  await expect(page.locator('#monitors h3')).toHaveText('Sample repair monitor');
  // Label exported screenshots inside the image, as well as in filenames and metadata.
  await page.evaluate(() => {
    const banner = document.createElement('p'); banner.textContent = 'DEMO · 合成データ / 本番ではありません';
    banner.style.cssText = 'padding:8px 16px;margin:0;background:#ffe7a4;color:#302b20;font-size:13px';
    document.body.prepend(banner);
  });
  const shot = async name => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ' overflow');
    await page.screenshot({ path: artifacts + '/' + name + '.png', fullPage: true }); screenshots.push(name);
  };
  await expect(page.locator('#attention-section')).toBeHidden();
  await expect(page.locator('#notifications')).toContainText('これは過去の通知です');
  await expect(page.locator('#notifications')).not.toContainText('Receipt hidden');
  await expect(page.locator('#monitors')).toContainText('5分ごと');
  for (const [width, height, label] of [[390, 844, 'mobile'], [1280, 900, 'desktop']]) {
    await page.setViewportSize({ width, height });
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await shot('demo-' + label + '-' + colorScheme);
    }
  }
  cases.push('mobile/desktop light/dark overflow and history');
  const details = page.locator('#monitors details');
  const summary = details.locator('summary');
  await summary.click(); await summary.focus();
  await tick(5000); // Last success crosses 660 seconds: forces a real 5s rerender.
  await expect(page.locator('.chip')).toHaveText('確認結果が古い');
  await expect(details).toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
  await tick(25000); // Actual 30-second poll with a new server receipt/read time.
  await expect(details).toHaveAttribute('open', ''); await expect(summary).toBeFocused();
  await tick(95000); // Reporter observation crosses the heartbeat threshold.
  await expect(page.locator('.chip')).toHaveText('同期が古い');
  await expect(details).toHaveAttribute('open', ''); await expect(summary).toBeFocused();
  cases.push('5s freshness transition, 30s polling, heartbeat expiry, details and keyboard focus');
  assert.deepEqual(consoleErrors, []); assert.deepEqual(pageErrors, []);
  // HTTP error console messages are expected in the following deliberate failure cases.
  const cleanConsoleCount = consoleErrors.length;
  offline = true;
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await tick(5000);
  await expect(page.locator('#counts')).toHaveText('現在の状態は未確認');
  await expect(page.locator('#connection')).toContainText('オフライン');
  await expect(page.locator('.chip.green')).toHaveCount(0);
  await expect(details).toHaveAttribute('open', ''); await expect(summary).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 }); await shot('demo-offline');
  offline = false; apiStatus = 401; await refresh(); await tick(5000);
  await expect(page.locator('#counts')).toHaveText('現在の状態は未確認');
  await expect(page.locator('#connection')).toContainText('認証が必要');
  await expect(details).toHaveAttribute('open', '');
  apiStatus = 503; await refresh(); await tick(5000);
  await expect(page.locator('#connection')).toContainText('接続を確認できません');
  cases.push('offline/401/503 errors and unknown counts survive 5s ticks');
  store = createInMemoryDashboardMonitorStore(); apiStatus = 200; await refresh();
  await expect(page.locator('#monitors')).toContainText('接続された監視はまだありません');
  await shot('demo-empty');
  apiStatus = 401; await page.reload();
  await expect(page.locator('#notifications')).toContainText('通知履歴を取得できません');
  await tick(5000); await expect(page.locator('#counts')).toHaveText('現在の状態は未確認');
  cases.push('empty differs from first-load unauthorized');
  assert.deepEqual(pageErrors, []);
  const unexpectedConsole = consoleErrors.slice(cleanConsoleCount).filter(text => !/Failed to load resource.*(?:401|503|ERR_FAILED|ERR_INTERNET_DISCONNECTED)/.test(text));
  assert.deepEqual(unexpectedConsole, []);
  await writeFile(artifacts + '/demo-result.json', JSON.stringify({ demo: true, productionVerified: false, passed: true, cases, screenshots, pageErrors, expectedFailureConsole: consoleErrors.slice(cleanConsoleCount) }, null, 2));
  console.log('Synthetic DEMO browser checks passed; evidence in .local/issue-853/demo-review.');
} finally {
  Date.now = originalNow;
  await context?.close();
  await rm(temporary, { recursive: true, force: true });
}
