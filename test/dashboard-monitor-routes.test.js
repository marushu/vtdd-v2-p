import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createInMemoryDashboardMonitorStore } from '../src/core/dashboard-monitor-state.js';
const token = 'local-test-token';
function fixture() {
  const env = { VTDD_GATEWAY_BEARER_TOKEN: token, DASHBOARD_MONITOR_STORE: createInMemoryDashboardMonitorStore(), DASHBOARD_EVENT_STORE: { async put() {}, async delete() {}, async latest() { return null; }, async listRecent() { return [{ title: 'Previous stop', changeSummary: 'A historical message', status: 'action_required', createdAt: new Date().toISOString() }]; } } };
  const request = (path, { body, auth = true, method = body ? 'POST' : 'GET' } = {}) => worker.fetch(new Request('https://example.com' + path, { method, headers: { ...(auth ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }), env);
  return { env, request };
}
const sample = () => ({ id: 'sample', source: 'reporter', title: 'Sample repair monitor', observedAt: new Date().toISOString(), processAlive: true, status: 'no_slots', intervalSeconds: 60, lastSuccessAt: new Date(Date.now() - 10000).toISOString(), lastAttemptAt: new Date(Date.now() - 10000).toISOString() });
test('actual worker routes auth, no-store, ingestion, history and freshness', async () => {
  const { request } = fixture();
  for (const path of ['/v2/dashboard/overview', '/v2/dashboard/monitors']) assert.equal((await request(path, { auth: false, method: path.endsWith('monitors') ? 'POST' : 'GET' })).status, 401);
  const input = sample();
  assert.equal((await request('/v2/dashboard/monitors', { body: input })).status, 200);
  assert.equal((await request('/v2/dashboard/monitors', { body: input })).status, 409);
  const response = await request('/v2/dashboard/overview');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.monitors[0].currentState, 'no_slots');
  assert.equal(data.monitors[0].needsAction, false);
  assert.equal(data.notifications[0].message, 'A historical message');
});
test('machine-only POST rejects dashboard identity and invalid/large payloads', async () => {
  const { request, env } = fixture();
  env.VTDD_DASHBOARD_ALLOWED_EMAILS = 'owner@example.com';
  env.CF_ACCESS_JWT_VERIFIER = async () => ({ ok: true, payload: { email: 'owner@example.com', exp: 4102444800 } });
  const headers = { 'cf-access-authenticated-user-email': 'owner@example.com', 'cf-access-jwt-assertion': 'test' };
  assert.equal((await worker.fetch(new Request('https://example.com/v2/dashboard/overview', { headers }), env)).status, 200);
  assert.equal((await worker.fetch(new Request('https://example.com/v2/dashboard/monitors', { method: 'POST', headers, body: '{}' }), env)).status, 401);
  assert.equal((await request('/v2/dashboard/monitors', { body: { ...sample(), status: 'garbage' } })).status, 400);
  assert.equal((await request('/v2/dashboard/monitors', { body: JSON.stringify({ padding: 'x'.repeat(17000) }) })).status, 413);
});
test('empty differs from unavailable storage; ingestion never pushes', async () => {
  const { request, env } = fixture();
  env.DASHBOARD_PUSH_SUBSCRIPTION_STORE = { list() { throw new Error('must not touch push'); } };
  assert.equal((await (await request('/v2/dashboard/overview')).json()).monitors.length, 0);
  assert.equal((await request('/v2/dashboard/monitors', { body: sample() })).status, 200);
  env.DASHBOARD_MONITOR_STORE = { async list() { throw new Error('private backend detail'); } };
  const response = await request('/v2/dashboard/overview');
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('private backend detail'), false);
});
test('home, chat, deep chat and orchestrator preserve authenticated navigation', async () => {
  const { request } = fixture();
  const home = await request('/dashboard');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /任せたことを、ひと目で。/);
  for (const path of ['/dashboard/chat', '/orchestrator', '/dashboard?threadId=sample', '/dashboard?repository=sample-org/sample']) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /id="monitors"/);
  }
  assert.equal((await request('/dashboard/chat', { auth: false })).status, 401);
});
test('GET derives stale success separately from reporter heartbeat and tolerates history failure', async () => {
  const { request, env } = fixture();
  const old = new Date(Date.now() - 181000).toISOString();
  assert.equal((await request('/v2/dashboard/monitors', { body: { ...sample(), lastSuccessAt: old, lastAttemptAt: old } })).status, 200);
  env.DASHBOARD_EVENT_STORE.listRecent = async () => { throw new Error('history unavailable'); };
  let data = await (await request('/v2/dashboard/overview')).json();
  assert.equal(data.monitors[0].currentState, 'checking_unverified');
  assert.equal(data.monitors[0].healthy, false);
  assert.equal(data.notificationsAvailable, false);
  env.DASHBOARD_MONITOR_STORE = { async list() { return [{ ...data.monitors[0], receivedAt: old }]; } };
  data = await (await request('/v2/dashboard/overview')).json();
  assert.equal(data.monitors[0].currentState, 'sync_stale');
});
test('owner action subject/body stay correctly ordered and push receipts are excluded', async () => {
  const { request, env } = fixture();
  env.DASHBOARD_EVENT_STORE.listRecent = async () => [
    { kind: 'dashboard_push_received', title: 'Receipt only' },
    { kind: 'owner_action_required', changeSummary: 'Short subject', title: 'Detailed human message' }
  ];
  const data = await (await request('/v2/dashboard/overview')).json();
  assert.equal(data.notifications.length, 1);
  assert.equal(data.notifications[0].title, 'Short subject');
  assert.equal(data.notifications[0].message, 'Detailed human message');
});
