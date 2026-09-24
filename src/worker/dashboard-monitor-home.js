import { renderButlerDocument } from '../core/butler-ui-shell.js';
import { dashboardMonitorClientScript } from './dashboard-monitor-client.generated.js';

// All remote strings enter the DOM through textContent, including notification history.
export function mountMonitorHome(computeView) {
  const byId = id => document.getElementById(id);
  const labels = { unknown: '未確認', checking: '監視中', no_slots: '空きなし', available: '候補あり', error: '確認エラー', action_required: '対応が必要', stopped: '停止', sync_stale: '同期が古い', checking_unverified: '確認結果が古い', completed: '完了（記録）' };
  const cards = new Map();
  let notificationSignature = null;
  let lastRender = '';
  let snapshot = null, connected = false, controller = null, serverTime = 0, loadedAt = 0, loadedWallTime = 0;
  const localTime = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '未確認';
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const interval = seconds => seconds % 3600 === 0 ? `${seconds / 3600}時間` : seconds % 60 === 0 ? `${seconds / 60}分` : `${Math.floor(seconds / 60) ? Math.floor(seconds / 60) + '分' : ''}${seconds % 60}秒`;
  function card(m) {
    const node = element('article', null, 'card');
    const head = element('div', null, 'card-head');
    head.append(element('h3', m.title), element('span', labels[m.currentState] || '未確認', 'chip ' + (m.documentedCompletion ? 'neutral' : m.healthy ? 'green' : ['error', 'stopped', 'action_required'].includes(m.currentState) ? 'red' : 'amber')));
    node.append(head);
    if (m.description) node.append(element('p', m.description, 'muted'));
    node.append(element('p', (m.documentedCompletion ? '完了の記録：' : m.healthy ? '確認結果：' : '前回の記録（現在の正常性は未確認）：') + (m.resultSummary || 'まだ確認結果がありません'), 'result'));
    const facts = element('dl');
    for (const [label, value] of [
      ['最終成功', localTime(m.lastSuccessAt)],
      ...(m.documentedCompletion ? [['完了日時', localTime(m.completedAt)]] : [['次の確認', localTime(m.nextCheckAt) + (m.intervalSeconds ? ` · ${interval(m.intervalSeconds)}ごと` : ' · 間隔未確認')]]),
      ['任せている範囲', m.automationScope || '未設定'],
      ...(m.type !== 'task' && typeof m.automaticBookingEnabled === 'boolean' ? [['自動予約', m.automaticBookingEnabled ? '設定あり（表示のみ）' : '設定なし']] : []),
      ['あなたの対応', m.needsAction ? (m.requiredAction || '接続と実行状況を確認してください') : '現在の対応依頼はありません']
    ]) facts.append(element('dt', label), element('dd', value));
    node.append(facts);
    const details = element('details');
    const key = m.source + ':' + m.id;
    const previous = cards.get(key);
    details.open = previous?.details.open || false;
    const summary = element('summary', '確認の記録');
    const focus = previous && (document.activeElement === previous.summary ? 'summary' : previous.link && document.activeElement === previous.link ? 'link' : null);
    details.append(summary, element('p', '最終試行：' + localTime(m.lastAttemptAt)), element('p', '観測：' + localTime(m.observedAt)), element('p', '受信：' + localTime(m.receivedAt)), element('p', `連続失敗：${m.consecutiveFailures}回`));
    if (m.evidenceSummary) details.append(element('p', '完了の根拠：' + m.evidenceSummary));
    node.append(details);
    let link;
    if (m.needsAction && ['/dashboard/chat', '/dashboard/notifications', '/dashboard'].includes(m.actionURL)) {
      link = element('a', '対応を確認', 'action'); link.href = m.actionURL; node.append(link);
    }
    cards.set(key, { node, details, summary, link, focus });
    return node;
  }
  function render() {
    byId('today').textContent = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'long' });
    if (!snapshot) return;
    const now = serverTime + Math.max(0, performance.now() - loadedAt, Date.now() - loadedWallTime);
    const freshConnection = connected && now - serverTime <= 120000;
    if (connected && !freshConnection) byId('connection').textContent = '更新が途絶えています · 現在は未確認';
    const executor = byId('executors');
    if (executor) {
      const v = snapshot.executors;
      const priorDetails = executor.querySelector?.('details');
      const detailOpen = priorDetails?.open;
      const detailFocused = !!priorDetails && priorDetails.firstChild === document.activeElement;
      executor.replaceChildren();
      if (!v?.initialized) executor.append(element('p', v?.ownerAction || '実行基盤は未初期化'));
      else {
        const current = freshConnection && now - serverTime < 30000;
        const elapsed = Math.max(0, (now - serverTime) / 1000);
        const targetNode = v.nodes[v.standbyExecutor];
        const standbyFresh = current && targetNode?.healthy && targetNode.heartbeatAgeSeconds + elapsed <= (v.standbyExecutor === 'mac' ? 120 : 300);
        const checkpointFresh = current && v.checkpointFresh && now - Date.parse(v.checkpoint?.updatedAt) <= 600000;
        const checkpointEligible = v.transitionMode === 'emergency' || (v.transitionMode === 'planned' && checkpointFresh);
        const readyCurrent = current && standbyFresh && checkpointEligible && v.ready;
        const calm = (v.blockers || []).every(reason => reason === 'PRIMARYが実行中');
        const macFresh = current && v.nodes.mac?.healthy && (v.nodes.mac.heartbeatAgeSeconds + elapsed <= 120);
        executor.append(element('p', v.activationPending ? '切替準備中 / activation pending' : macFresh ? 'Mac 確認済み' : 'Mac未確認', 'chip ' + (macFresh && standbyFresh && v.standbyReady && calm ? 'green' : 'amber')));
        for (const id of ['mac','vps']) {
          const n = v.nodes[id];
          executor.append(element('p', (id === 'mac' ? 'Mac' : 'VPS') + ' ' + n.role + (v.activationPending && n.role === 'PRIMARY' ? '（有効化待ち）' : '') + ' · Codex ' + (n.codexVersion || '未確認') + ' · ' + (n.versionMatch ? '版一致' : '版不一致')));
          executor.append(element('p', 'heartbeat: ' + (n.heartbeatAgeSeconds == null ? '未確認' : Math.floor(n.heartbeatAgeSeconds + elapsed) + '秒前') + ' · ' + localTime(n.heartbeatAt), 'muted'));
        }
        if (v.versionApprovalPending) executor.append(element('p', '新しいMac版は承認待ち: ' + v.versionCandidate));
        executor.append(element('p', '承認済みCodex: ' + v.approvedCodexVersion));
        executor.append(element('p', 'checkpoint: ' + (checkpointFresh ? '新鮮' : '未確認・古い') + ' · ' + localTime(v.checkpoint?.updatedAt)));
        executor.append(element('p', current && (!v.ready || readyCurrent) ? v.ownerAction : '更新待ち · 手動切替の可否は未確認'));
        if (current && v.versionApprovalPending && v.versionActionURL) {
          const link = new URL(v.versionActionURL, location.origin);
          if (link.origin === location.origin && link.pathname === '/v2/approval/passkey/operator' && link.searchParams.get('mode') === 'executor-version') {
            const a = element('a', 'Macの検証済み版を承認', 'action'); a.href = link.pathname + link.search; executor.append(a);
          }
        }
        if (readyCurrent && v.actionURL) {
          const link = new URL(v.actionURL, location.origin);
          if (link.origin === location.origin && link.pathname === '/v2/approval/passkey/operator' && link.searchParams.get('mode') === 'failover') {
            const a = element('a', '実行基盤の切替を確認', 'action'); a.href = link.pathname + link.search; executor.append(a);
          }
        }
        const detail = element('details'); detail.append(element('summary', '実行基盤の詳細'), element('p', 'generation: ' + v.generation + ' · 切替: ' + localTime(v.lastTransitionAt)));
        detail.open = !!detailOpen;
        executor.append(detail);
        if (detailFocused) detail.firstChild.focus();
      }
    }
    const views = snapshot.monitors.map(m => computeView(m, now, freshConnection));
    const signature = JSON.stringify([snapshot, freshConnection, views.map(m => m.currentState), Math.floor(now / 30000)]);
    if (signature === lastRender) return;
    lastRender = signature;
    const problems = views.filter(m => m.needsAction);
    byId('attention-section').hidden = problems.length === 0;
    byId('attention').replaceChildren(...problems.map(m => {
      const node = element('p', null, 'attention-item');
      node.append(element('strong', m.title), element('span', ' — ' + (labels[m.currentState] || '未確認')));
      return node;
    }));
    byId('counts').textContent = !freshConnection ? '現在の状態は未確認' : `${views.filter(m => m.processAlive && m.currentState !== 'completed' && m.currentState !== 'unknown' && m.currentState !== 'sync_stale' && m.currentState !== 'stopped').length}件 監視・実行中　 /　${problems.length}件 要確認${views.some(m => m.currentState === 'unknown') ? ' · 未確認の項目あり' : ''}`;
    byId('monitors').replaceChildren(...views.map(card));
    const keys = new Set(views.map(m => m.source + ':' + m.id));
    for (const [key, entry] of cards) {
      if (!keys.has(key)) { cards.delete(key); continue; }
      if (entry.focus) (entry[entry.focus] || entry.summary).focus({ preventScroll: true });
    }
    if (!views.length) byId('monitors').append(element('p', freshConnection ? '接続された監視はまだありません。接続すると、ここに現在の状態が届きます。' : '現在の監視状態を取得できません。接続の回復をお待ちください。', 'empty'));
    const historySignature = JSON.stringify([snapshot.notifications, snapshot.notificationsAvailable, freshConnection]);
    if (historySignature === notificationSignature) return;
    notificationSignature = historySignature;
    byId('notifications').replaceChildren(...snapshot.notifications.map(n => {
      const node = element('article', null, 'history');
      node.append(element('h3', n.title || '通知'), element('p', n.message || '本文なし'), element('time', localTime(n.createdAt)));
      return node;
    }));
    if (!snapshot.notifications.length) byId('notifications').append(element('p', !freshConnection || snapshot.notificationsAvailable === false ? '通知履歴を取得できません。通知ページで確認してください。' : '最近の通知はありません。', 'muted'));
  }
  function unavailable(message) {
    connected = false;
    byId('connection').textContent = message;
    if (!snapshot) {
      byId('executors')?.replaceChildren(element('p', '実行基盤を取得できません。'));
      byId('monitors').replaceChildren(element('p', '監視状態を取得できません。', 'empty'));
      byId('notifications').replaceChildren(element('p', '通知履歴を取得できません。接続または認証を確認してください。', 'muted'));
    }
    byId('counts').textContent = '現在の状態は未確認';
    render();
  }
  async function refresh() {
    if (document.hidden || controller) return;
    if (navigator.onLine === false) { unavailable('オフライン · 現在は未確認'); return; }
    const current = new AbortController(); controller = current;
    const timeout = setTimeout(() => current.abort(), 10000);
    try {
      const response = await fetch('/v2/dashboard/overview', { credentials: 'same-origin', cache: 'no-store', signal: current.signal });
      if (!response.ok) {
        unavailable(response.status === 401 || response.status === 403 ? '認証が必要です · ホームを開き直してください' : '接続を確認できません · 再試行します');
        return;
      }
      const data = await response.json();
      if (!Array.isArray(data.monitors) || data.monitors.length > 100 || !Array.isArray(data.notifications) || !Number.isFinite(Date.parse(data.serverTime))) throw new Error('invalid overview');
      if (current.signal.aborted || navigator.onLine === false) throw new Error('request cancelled');
      snapshot = data; loadedWallTime = Date.now(); serverTime = Date.parse(data.serverTime); loadedAt = performance.now(); connected = true;
      byId('connection').textContent = '接続中 · ' + localTime(data.serverTime) + ' 更新';
      render();
    } catch { unavailable(navigator.onLine === false ? 'オフライン · 現在は未確認' : '更新できません · 現在は未確認'); }
    finally { clearTimeout(timeout); controller = null; }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('pageshow', refresh);
  window.addEventListener('online', refresh);
  window.addEventListener('offline', () => { controller?.abort(); unavailable('オフライン · 現在は未確認'); });
  const polling = setInterval(refresh, 30000);
  const freshness = setInterval(() => { if (!document.hidden) render(); }, 5000);
  window.addEventListener('pagehide', event => { controller?.abort(); if (!event.persisted) { clearInterval(polling); clearInterval(freshness); } });
  if (navigator.serviceWorker) navigator.serviceWorker.register('/dashboard-sw.js', { scope: '/dashboard/' }).catch(() => {});
  render(); refresh();
}
export function renderDashboardMonitorHome() {
  return renderButlerDocument(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#faf8f4"><title>Butler — ホーム</title><link rel="manifest" href="/dashboard.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><style>
:root{--butler-content-width:760px;color-scheme:light dark;--bg:var(--butler-bg);--card:var(--butler-card);--ink:var(--butler-ink);--muted:var(--butler-muted);--line:var(--butler-line);--accent:var(--butler-accent);--green-bg:var(--butler-green-bg);--green:var(--butler-green);--amber-bg:var(--butler-amber-bg);--amber:var(--butler-amber);--red-bg:var(--butler-red-bg);--red:var(--butler-red)}

*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-wrap:anywhere}
main{max-width:var(--butler-content-width);margin:auto;padding:0 var(--butler-gutter) calc(110px + env(safe-area-inset-bottom))}
main > header{margin-bottom:32px}
.brand{display:flex;align-items:center;gap:10px;color:var(--accent);font-weight:750;letter-spacing:.19em;font-size:14px}
.brand img{width:36px;height:36px;border-radius:10px}
h1{font-size:var(--butler-heading-size);letter-spacing:.02em;line-height:1.4;margin:20px 0 12px}
h2{font-size:18px;margin:30px 0 14px}
h3{font-size:16px;margin:0}
p{margin:8px 0}
.muted,time,#today,#connection{color:var(--muted);font-size:13px}
#connection{min-height:24px}
#counts{margin-top:20px;font-size:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--butler-card-radius);padding:var(--butler-card-padding);margin-bottom:16px}
.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.card-head h3{min-width:0}
.chip{flex-shrink:0;font-size:12px;font-weight:650;border-radius:20px;padding:3px 10px}
.green{background:var(--green-bg);color:var(--green)}
.neutral{background:var(--line);color:var(--ink)}
.amber{background:var(--amber-bg);color:var(--amber)}
.red{background:var(--red-bg);color:var(--red)}
.result{font-size:15px;margin:18px 0}
dl{display:grid;grid-template-columns:100px minmax(0,1fr);font-size:13px;gap:8px;margin:18px 0}
dt{color:var(--muted)}
dd{margin:0}
details{border-top:1px solid var(--line);font-size:13px}
summary{min-height:44px;cursor:pointer;padding:12px 0;color:var(--muted)}
details p{color:var(--muted)}
a{color:var(--accent)}
a.action{display:inline-flex;align-items:center;min-height:44px}
#attention{border-left:3px solid var(--accent);padding-left:16px}
.attention-item{font-size:14px;margin:12px 0}
.history{padding:16px 0;border-bottom:1px solid var(--line)}
.history p{font-size:14px;white-space:pre-wrap}
.empty{padding:24px 0;color:var(--muted)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
[hidden]{display:none!important}
@media(prefers-color-scheme:dark){:root{--bg:var(--butler-bg);--card:var(--butler-card);--ink:var(--butler-ink);--muted:var(--butler-muted);--line:var(--butler-line);--accent:var(--butler-accent);--green-bg:var(--butler-green-bg);--green:var(--butler-green);--amber-bg:var(--butler-amber-bg);--amber:var(--butler-amber);--red-bg:var(--butler-red-bg);--red:var(--butler-red)}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}

</style></head><body><main><header><h1>任せたことを、ひと目で。</h1><p id="today"></p><p id="connection" role="status" aria-live="polite">接続を確認しています…</p><p id="counts">状態を取得しています…</p></header><section id="attention-section" hidden><h2>対応が必要</h2><div id="attention"></div></section><section><h2>実行基盤</h2><article class="card" id="executors" aria-label="実行基盤">実行基盤を確認しています…</article></section><section><h2>監視・実行中</h2><div id="monitors" aria-label="現在の監視状態"></div></section><section><h2>最近の通知</h2><p class="muted">届いた通知の履歴です。現在の状態は上のカードで確認できます。</p><div id="notifications"></div></section><noscript>現在の状態を表示するには JavaScript を有効にしてください。</noscript></main><script>${dashboardMonitorClientScript}</script></body></html>`, { active: "home", layout: "home" });
}
