import { BROWSER_MONITOR_KEY, BROWSER_MONITOR_ROOM, BrowserMonitorError, monitorDefinition, browserMonitorPrompt, browserMonitorPublic, parseBrowserMonitorResult } from '../core/browser-thread-monitor.js';
import { executorMayWrite, resolveExecutorStore } from '../core/executor-failover-state.js';
import { normalizeMonitorSnapshot, resolveDashboardMonitorStore } from '../core/dashboard-monitor-state.js';

// A single durable writer owns all automatic browser runs. No expired lease is reclaimed.
export class BrowserThreadMonitor {
  constructor(room, { now = () => Date.now(), notify = async () => ({ ok: false }) } = {}) {
    this.room = room; this.storage = room.ctx.storage; this.env = room.env; this.now = now; this.notify = notify;
  }
  async read() { return await this.storage.get(BROWSER_MONITOR_KEY) || null; }
  async save(state) {
    // Commit timer intent with state. A restart between put and setAlarm must not lose work.
    const times = [];
    if (state.enabled && state.nextRunAt) times.push(Date.parse(state.nextRunAt));
    if (state.inFlight && Date.parse(state.inFlight.deadline) > this.now()) times.push(Date.parse(state.inFlight.deadline));
    for (const entry of Object.values(state.notifications || {})) if (!entry.sent) times.push(entry.nextAttemptAt);
    await this.storage.transaction(async tx => {
      await tx.put(BROWSER_MONITOR_KEY, state);
      if (times.length) await tx.setAlarm(Math.min(...times)); else await tx.deleteAlarm();
    });
  }
  async view() { return browserMonitorPublic(await this.read()); }
  async control(body) {
    let s = await this.read();
    if (body.action === 'configure') {
      if (s?.inFlight || s?.enabled) throw new BrowserMonitorError('stop_and_resolve_current_run_first', 409);
      s = { definition: monitorDefinition(body.definition), enabled: false, status: 'stopped', nextRunAt: null, lastFreshAt: null, lastRunId: null, lastAttemptAt: null, inFlight: null, notifications: s?.notifications || {}, summary: '登録済み・未実行', failures: 0 };
    } else {
      if (!s) throw new BrowserMonitorError('monitor_not_configured', 409);
      if (body.action === 'stop') { if (s.inFlight && !s.inFlight.claimed) s.inFlight = null; s.enabled = false; s.nextRunAt = null; s.status = s.status === 'completed' ? 'completed' : s.inFlight ? 'stopping' : 'stopped'; }
      else if (['resume','run_now'].includes(body.action)) {
        if (s.inFlight) throw new BrowserMonitorError('previous_run_unresolved', 409);
        if (s.status === 'completed') throw new BrowserMonitorError('booking_already_completed', 409);
        s.enabled = true; s.status = 'checking'; s.nextRunAt = new Date(this.now() + 1000).toISOString();
      } else throw new BrowserMonitorError('invalid_monitor_action');
    }
    await this.save(s);
    await this.publish(s);
    return browserMonitorPublic(s);
  }
  async alarm() {
    const s = await this.read(), now = this.now();
    if (!s) return;
    if (Object.values(s.notifications || {}).some(n => !n.sent && n.nextAttemptAt <= now)) await this.deliverNotifications(s);
    if (s.inFlight) {
      if (now >= Date.parse(s.inFlight.deadline)) {
        s.status = 'error'; s.enabled = false; s.nextRunAt = null; s.summary = '前回の実行結果が不明です。重複予約防止のため再送を停止しました。';
        this.queueNotification(s, s.inFlight.runId, 'stopped');
        await this.save(s); await this.deliverNotifications(s); await this.publish(s);
      } else await this.save(s);
      return;
    }
    if (!s.enabled || !s.nextRunAt) return;
    if (Date.parse(s.nextRunAt) > now) { await this.storage.setAlarm(Date.parse(s.nextRunAt)); return; }
    // Re-arm before external I/O: outages do not silently extinguish the scheduler.
    s.nextRunAt = new Date(now + s.definition.intervalSeconds * 1000).toISOString();
    await this.save(s);
    let executor;
    try { executor = await resolveExecutorStore(this.env)?.get(); } catch { /* fail closed */ }
    if (!executor || !executorMayWrite(executor, 'mac', executor.generation, now)) {
      s.status = 'error'; s.summary = 'Mac PRIMARYの承認・世代・稼働を確認できません。'; s.failures++;
      await this.save(s); await this.publish(s); return;
    }
    const runId = crypto.randomUUID();
    s.inFlight = { runId, generation: executor.generation, startedAt: new Date(now).toISOString(), deadline: new Date(now + 15 * 60000).toISOString(), claimed: false };
    s.lastRunId = runId; s.lastAttemptAt = s.inFlight.startedAt; s.nextRunAt = null; s.status = 'checking';
    await this.save(s);
    const payload = { type: 'app_server_turn_requested', schema: 'vtdd.dashboard.app_server_bridge.v1', threadId: s.definition.bridgeRoomId, codexThreadId: s.definition.codexThreadId, requestId: runId, messageId: runId, text: browserMonitorPrompt(s.definition, s.inFlight), browserMonitor: { ...s.inFlight, definition: s.definition }, appServer: { startThreadMethod: 'thread/resume', turnMethod: 'turn/start' } };
    try {
      const namespace = this.env.DASHBOARD_CHAT_ROOMS;
      const target = namespace.getByName ? namespace.getByName(s.definition.bridgeRoomId) : namespace.get(namespace.idFromName(s.definition.bridgeRoomId));
      // The same room cannot fetch itself while inside blockConcurrencyWhile.
      const sent = s.definition.bridgeRoomId === BROWSER_MONITOR_ROOM
        ? this.dispatch(payload)
        : (await (await target.fetch(new Request('https://room/browser-monitor-dispatch', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000), body: JSON.stringify(payload) }))).json()).sent;
      if (!sent) {
        // An explicit no-socket/ambiguous-socket response proves nothing was sent.
        s.inFlight = null; s.status = 'error'; s.summary = '接続済みMac bridgeを一意に確認できません。次回に再確認します。'; s.failures++;
        s.nextRunAt = new Date(now + s.definition.intervalSeconds * 1000).toISOString();
        await this.save(s);
      }
    } catch {
      // A transport exception may occur after delivery. Preserve the lease until a terminal result.
      s.status = 'error'; s.enabled = false; s.summary = 'bridgeへの送信結果が不明のため監視を停止しました。重複予約を避けるため結果確認が必要です。'; s.failures++;
      this.queueNotification(s, runId, 'stopped');
      await this.save(s); await this.deliverNotifications(s);
    }
    await this.publish(s);
  }
  dispatch(payload) {
    const sockets = this.room.connectedAppServerBridgeSockets(payload.threadId);
    // Ambiguous socket ownership is not an invitation to run two browser agents.
    return sockets.length === 1 && this.room.sendSocket(sockets[0], payload);
  }
  async claim(body) {
    const s = await this.read();
    if (!s?.enabled || !s.inFlight || s.inFlight.runId !== body.runId || s.inFlight.claimed || s.inFlight.generation !== body.generation || s.definition.codexThreadId !== body.codexThreadId || this.now() >= Date.parse(s.inFlight.deadline)) return { allowed: false };
    const executor = await resolveExecutorStore(this.env)?.get();
    if (!executorMayWrite(executor, 'mac', body.generation, this.now())) return { allowed: false };
    s.inFlight.claimed = true; await this.save(s); return { allowed: true };
  }
  async result(body) {
    const s = await this.read();
    if (!s?.inFlight || s.inFlight.runId !== body.runId || s.inFlight.generation !== body.generation || s.definition.codexThreadId !== body.codexThreadId) return { accepted: false };
    // Transport errors never prove the browser turn ended. Keep the lease.
    if (body.terminal !== true) { s.status = 'error'; s.enabled = false; s.nextRunAt = null; s.summary = '実行結果が不明のため監視を停止しました。重複予約を避けるため結果確認が必要です。'; this.queueNotification(s, body.runId, 'stopped'); await this.save(s); await this.deliverNotifications(s); await this.publish(s); return { accepted: true }; }
    if (!s.inFlight.claimed) return { accepted: false };
    let result;
    try { result = parseBrowserMonitorResult(body.text, s.definition, s.inFlight, { browserRead: body.browserRead === true, now: this.now() }); }
    catch { result = { status: 'error', summary: '今回の実画面取得と結果を照合できません。自動再開を停止しました。' }; }
    s.inFlight = null; s.status = result.status; s.summary = result.summary; s.requiredAction = result.requiredAction || '';
    if (result.observedAt) s.lastFreshAt = result.observedAt;
    s.failures = result.status === 'error' ? s.failures + 1 : 0;
    s.enabled = s.enabled && result.status === 'no_slots';
    s.nextRunAt = s.enabled ? new Date(this.now() + s.definition.intervalSeconds * 1000).toISOString() : null;
    if (result.status === 'completed') { s.completedAt = result.observedAt; s.appointmentAt = result.appointmentAt; }
    if (result.status !== 'no_slots') this.queueNotification(s, body.runId, result.status === 'completed' ? 'completed' : result.status === 'auth_required' ? 'auth_required' : 'stopped');
    await this.save(s);
    await this.deliverNotifications(s);
    await this.publish(s); return { accepted: true };
  }
  queueNotification(s, runId, kind) {
    s.notifications ||= {};
    const id = `${runId}-${kind}`;
    if (s.notifications[id]) return;
    const store = s.definition.store;
    // Completion push is constructed from whitelisted booking fields, never agent prose.
    const body = kind === 'completed'
      ? `${store} · ${new Date(s.appointmentAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}（日本時間）予約確定。監視を終了しました。`
      : kind === 'auth_required' ? s.requiredAction : '予約監視を停止しました。予約結果と接続状態の確認が必要です。確認後にButlerから再開してください。';
    s.notifications[id] = { id, runId, kind, repository: s.definition.repository, title: kind === 'completed' ? '予約が確定しました' : kind === 'auth_required' ? 'Apple本人認証が必要です' : '予約監視が停止しました', body, sent: false, nextAttemptAt: this.now() };
    // Bound historical dedupe entries; pending notifications are never discarded.
    const delivered = Object.entries(s.notifications).filter(([,n]) => n.sent);
    for (const [key] of delivered.slice(0, Math.max(0, delivered.length - 30))) delete s.notifications[key];
  }
  async deliverNotifications(s) {
    for (const entry of Object.values(s.notifications || {})) {
      if (entry.sent || entry.nextAttemptAt > this.now()) continue;
      entry.nextAttemptAt = this.now() + 60000;
      await this.save(s);
      try { s.notification = await this.notify(s, structuredClone(entry)); } catch { s.notification = { ok: false }; }
      entry.sent = s.notification.ok === true;
      await this.save(s);
    }
  }
  async publish(s) {
    const store = resolveDashboardMonitorStore(this.env);
    if (!store) return;
    const now = this.now();
    // Observation is scheduler truth. lastSuccessAt is exclusively actual browser evidence.
    try {
    const snapshot = normalizeMonitorSnapshot({ executionKind: 'durable_alarm', source: 'browser-scheduler', id: 'browser-monitor', title: 'ブラウザ予約監視', status: s.status === 'auth_required' ? 'action_required' : s.status === 'stopping' ? 'checking' : s.status, mode: s.enabled || s.inFlight ? 'monitoring' : 'paused', processAlive: null, intervalSeconds: s.definition.intervalSeconds, automaticBookingEnabled: true, observedAt: new Date(now).toISOString(), lastAttemptAt: s.lastAttemptAt, lastSuccessAt: s.lastFreshAt, nextCheckAt: s.nextRunAt, completedAt: s.completedAt, consecutiveFailures: s.failures, resultSummary: s.summary, requiredAction: s.requiredAction || '', evidenceSummary: s.completedAt ? s.summary : '', actionURL: '/dashboard' }, now);
    await store.put(snapshot); } catch { /* Canonical DO state remains visible when projection fails. */ }
  }
}
