import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { renderDashboardMonitorHome } from '../src/worker/dashboard-monitor-home.js';

class Element {
  constructor(tag = 'div', document = null) { this.document = document; this.tag = tag; this.children = []; this.textContent = ''; this.hidden = false; }
  addEventListener() {}
  focus() { this.document.activeElement = this; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  get text() { return this.textContent + this.children.map(n => n.text).join(' '); }
}
function browser(fetcher, renderer = renderDashboardMonitorHome) {
  const nodes = new Map(), events = {}, intervals = [], timeouts = [];
  let elapsed = 0;
  const document = { hidden: false, getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); }, createElement: tag => new Element(tag, document), addEventListener: (name, fn) => { events[name] = fn; } };
  const navigator = { onLine: true };
  const context = { document, navigator, window: { addEventListener: (name, fn) => { events[name] = fn; } }, fetch: fetcher, performance: { now: () => elapsed }, AbortController, Date, setInterval(fn, ms) { intervals.push({ fn, ms }); return intervals.length; }, clearInterval() {}, setTimeout(fn) { timeouts.push(fn); return timeouts.length; }, clearTimeout() {} };
  vm.runInNewContext(renderer().match(/<script>([\s\S]*?)<\/script>/)[1], context);
  return { nodes, events, intervals, timeouts, document, navigator, advance(ms) { elapsed += ms; intervals.find(t => t.ms === 5000).fn(); } };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function overview() {
  const time = new Date().toISOString();
  return { serverTime: time, notificationsAvailable: true, monitors: [{ id: 'hidden-machine-id', source: 'hidden-source', title: '<img src=x onerror=alert(1)>', status: 'no_slots', mode: 'monitoring', intervalSeconds: 60, processAlive: true, observedAt: time, receivedAt: time, lastAttemptAt: time, lastSuccessAt: time, resultSummary: '空きなし', automationScope: '確認のみ', consecutiveFailures: 0 }], notifications: [{ title: '以前の停止', message: '履歴の本文', createdAt: time }] };
}
test('home renders restrained accessible navigation and unchanged PWA asset references', () => {
  const html = renderDashboardMonitorHome();
  for (const text of ['BUTLER', '任せたことを、ひと目で。', '対応が必要', '監視・実行中', '最近の通知', 'prefers-color-scheme:dark', 'prefers-reduced-motion:reduce', '/dashboard.webmanifest', '/dashboard-icon.png', '/dashboard/chat', '/dashboard/notifications']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /innerHTML|location\.reload|localStorage|https:\/\//);
});
test('actual inline DOM code safely renders title/message; history is not current action', async () => {
  const b = browser(async (url, opts) => { assert.equal(url, '/v2/dashboard/overview'); assert.equal(opts.cache, 'no-store'); return { ok: true, json: async () => overview() }; });
  await flush();
  assert.match(b.nodes.get('monitors').text, /<img src=x onerror=alert\(1\)>/);
  assert.doesNotMatch(b.nodes.get('monitors').text, /hidden-machine-id|hidden-source/);
  assert.equal(b.nodes.get('attention-section').hidden, true);
  assert.match(b.nodes.get('notifications').text, /以前の停止.*履歴の本文/);
  b.advance(121000);
  assert.match(b.nodes.get('monitors').text, /未確認/);
  assert.doesNotMatch(b.nodes.get('monitors').children[0].children[0].children[1].className, /green/);
});
test('offline and fetch failure mark cached state unknown, 401 is honest', async () => {
  let response = { ok: true, json: async () => overview() };
  const b = browser(async () => response); await flush();
  b.navigator.onLine = false; b.events.offline();
  assert.match(b.nodes.get('connection').text, /オフライン/);
  assert.match(b.nodes.get('monitors').text, /未確認/);
  b.navigator.onLine = true; response = { ok: false, status: 401 }; b.events.online(); await flush();
  assert.match(b.nodes.get('connection').text, /認証が必要/);
  response = { ok: false, status: 503 }; b.events.pageshow(); await flush();
  assert.match(b.nodes.get('connection').text, /接続を確認できません/);
});
test('single flight, visibility refresh, timeout cancellation and empty vs failure', async () => {
  let finish, calls = 0, signal;
  const b = browser((_url, opts) => { calls++; signal = opts.signal; return new Promise(resolve => { finish = resolve; }); });
  b.events.pageshow(); b.events.visibilitychange(); assert.equal(calls, 1);
  finish({ ok: true, json: async () => ({ ...overview(), monitors: [] }) }); await flush();
  assert.match(b.nodes.get('monitors').text, /接続された監視はまだありません/);
  b.events.pageshow(); b.timeouts[1](); assert.equal(signal.aborted, true);
  b.document.hidden = true; b.intervals.find(t => t.ms === 30000).fn(); assert.equal(calls, 2);
  const failed = browser(async () => { throw new Error('offline'); }); await flush();
  assert.match(failed.nodes.get('monitors').text, /取得できません/);
  assert.doesNotMatch(failed.nodes.get('monitors').text, /まだありません/);
});

test('details and keyboard focus survive 5s expiry, 30s new data, and offline rerenders', async () => {
  const data = overview();
  data.monitors[0].lastSuccessAt = new Date(Date.parse(data.serverTime) - 178000).toISOString();
  const b = browser(async () => ({ ok: true, json: async () => data })); await flush();
  const details = () => b.nodes.get('monitors').children[0].children.find(n => n.tag === 'details');
  details().open = true; details().children[0].focus();
  b.advance(5000); // Force a state transition and a real rerender, not just a static tick.
  assert.match(b.nodes.get('monitors').text, /確認結果が古い/);
  assert.equal(details().open, true);
  assert.equal(b.document.activeElement, details().children[0]);
  data.serverTime = new Date(Date.parse(data.serverTime) + 30000).toISOString();
  b.intervals.find(t => t.ms === 30000).fn(); await flush();
  assert.equal(details().open, true);
  assert.equal(b.document.activeElement, details().children[0]);
  b.navigator.onLine = false; b.events.offline(); b.advance(5000);
  assert.equal(details().open, true);
  assert.equal(b.document.activeElement, details().children[0]);
  assert.equal(b.nodes.get('counts').text, '現在の状態は未確認');
  assert.match(b.nodes.get('connection').text, /オフライン/);
});
test('unknown counts and first-load history errors persist across freshness ticks and 401', async () => {
  const b = browser(async () => ({ ok: false, status: 401 })); await flush();
  b.advance(5000);
  assert.equal(b.nodes.get('counts').text, '現在の状態は未確認');
  assert.match(b.nodes.get('notifications').text, /取得できません/);
  assert.match(b.nodes.get('connection').text, /認証が必要/);
});
test('booking is opt-in monitor metadata and 300 seconds is five minutes', async () => {
  const data = overview(); data.monitors[0].intervalSeconds = 300;
  const b = browser(async () => ({ ok: true, json: async () => data })); await flush();
  assert.match(b.nodes.get('monitors').text, /5分ごと/);
  assert.doesNotMatch(b.nodes.get('monitors').text, /自動予約/);
  data.monitors[0].automaticBookingEnabled = false;
  b.events.pageshow(); await flush(); assert.match(b.nodes.get('monitors').text, /自動予約/);
  data.monitors[0].type = 'task';
  b.events.pageshow(); await flush(); assert.doesNotMatch(b.nodes.get('monitors').text, /自動予約/);
});

// The production bundler preserves names, which must not introduce missing browser helpers.
test('name-preserved production bundle hydrates the home without Worker-only helpers', async () => {
  const result = await build({ entryPoints: ['src/worker/dashboard-monitor-home.js'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', keepNames: true, legalComments: 'none' });
  const bundled = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
  const b = browser(async () => ({ ok: true, json: async () => overview() }), bundled.renderDashboardMonitorHome);
  await flush();
  assert.equal(b.nodes.get('monitors').children.length, 1);
  assert.match(b.nodes.get('connection').text, /接続中/);
});

test('generated browser source matches the canonical unbundled client', async () => {
  const { dashboardMonitorClientSource } = await import('../scripts/build-dashboard-monitor-client.mjs');
  const { dashboardMonitorClientScript } = await import('../src/worker/dashboard-monitor-client.generated.js');
  assert.equal(dashboardMonitorClientScript, dashboardMonitorClientSource());
  assert.doesNotMatch(dashboardMonitorClientScript, /__name\(/);
});
