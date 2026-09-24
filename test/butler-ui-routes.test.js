import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {humanRoutes,createFixture,syntheticDetailUrls,createSyntheticEventStore,syntheticNotificationEvents} from '../scripts/issue856-route-fixtures.mjs';
import {butlerMenuItems,butlerActivePage,butlerMenuCurrentHref} from '../src/core/butler-ui-shell.js';
const blockedFetch=async()=>{throw new Error('External network forbidden');};
test('every actual HTML route uses exactly one shared shell; auth rejects remain protected',async()=>{
 const original=globalThis.fetch;globalThis.fetch=blockedFetch;
 try {const fixture=await createFixture();
 for(const path of humanRoutes){
  const response=await fixture.request(worker,path);const html=await response.text();
  assert.match(response.headers.get('content-type')||'',/text\/html/,path);assert.equal(response.status,200,path);
  assert.equal((html.match(/<nav\b[^>]*data-butler-primary-nav/g)||[]).length,1,path);
  assert.equal((html.match(/<header\b[^>]*data-butler-header/g)||[]).length,1,path);
  const nav=html.match(/<nav class="butler-shell-primary"[\s\S]*?<\/nav>/)[0];
  assert.equal((nav.match(/<a /g)||[]).length,3,path);
  assert.equal((html.match(/name="viewport"/g)||[]).length,1,path);
  assert.match(html,/viewport-fit=cover/,path);
  assert.equal((html.match(/name="theme-color"/g)||[]).length,2,path);
  const active=butlerActivePage(path);assert.equal((nav.match(/aria-current/g)||[]).length,active?1:0,path);
  if(active)assert.match(nav,new RegExp('href="'+({home:'/dashboard',chat:'/dashboard/chat',notifications:'/dashboard/notifications'}[active])+'" aria-current="page"'),path);
  const menu=html.match(/<div class="butler-shell-menu-links"[\s\S]*?<\/div>/)[0];
  const current=butlerMenuCurrentHref(path);
  assert.equal((menu.match(/aria-current="page"/g)||[]).length,current?1:0,path);
  if(current)assert.ok(menu.includes(`href="${current}" target="_top" aria-current="page"`),path);
  for(const [,href] of butlerMenuItems)assert.equal(menu.split('href="'+href.replaceAll('&','&amp;')+'"').length-1,1,path+href);
  if(path.startsWith('/dashboard')||path==='/orchestrator'){
   const denied=await fixture.request(worker,path,{auth:false});assert.equal(denied.status,401,path);const text=await denied.text();assert.match(text,/data-butler-primary-nav/);assert.doesNotMatch(text,/id="butler-message"|id="monitors"/);
  }
 }
 }finally{globalThis.fetch=original;}
});
test('non-HTML artifacts/API/auth unchanged; chat and Push control IDs survive',async()=>{
 const fixture=await createFixture();
 for(const path of ['/health','/dashboard.webmanifest','/dashboard-sw.js','/dashboard-icon.svg','/dashboard-icon.png','/setup/openapi.json','/setup/openapi.yaml','/setup/instructions.txt','/v2/dashboard/overview']){
  const response=await fixture.request(worker,path);assert.doesNotMatch(response.headers.get('content-type')||'',/text\/html/,path);assert.doesNotMatch(await response.text(),/data-butler-shell/);
 }
 assert.equal((await fixture.request(worker,'/v2/dashboard/overview',{auth:false})).status,401);
 const chat=await(await fixture.request(worker,'/dashboard?threadId=demo')).text();
 for(const id of ['butler-message','butler-send-button','butler-chat-log','butler-chat-form','butler-pending-media','butler-transient-progress'])assert.ok(chat.includes('id="'+id+'"'),id);
 const notifications=await(await fixture.request(worker,'/dashboard/notifications')).text();
 assert.match(notifications,/href="\/dashboard\?threadId=demo"/);
 assert.match(notifications,/DEMO\/SYNTHETIC 配信未実行/);
 assert.equal((notifications.match(/class="deploy-event"/g)||[]).length,2);
 assert.equal((notifications.match(/data-notification-diagnostics/g)||[]).length,2);
 assert.doesNotMatch(notifications,/通知はありません。/);
 assert.match(notifications,/対応が必要<\/span>/);
 for(const href of syntheticDetailUrls)assert.ok(notifications.includes(`href="${href}"`));
 for(const id of ['push-permission-button','push-subscribe-button','push-test-button','push-server-test-button','push-state'])assert.ok(notifications.includes('id="'+id+'"'),id);
 for(const mode of ['dashboard','merge','deploy']){
  const html=await(await fixture.request(worker,'/v2/approval/passkey/operator?mode='+mode)).text();assert.match(html,/data-operator-section="registration" hidden/);
  assert.match(html,new RegExp('data-operator-section="'+(mode==='merge'?'pr-merge':mode==='deploy'?'production-deploy':'approval')+'"(?! hidden)'));
 }
});

test('synthetic event store implements the existing full interface and invalid stores remain rejected',async()=>{
 const events=syntheticNotificationEvents('2026-09-24T00:00:00Z');const store=createSyntheticEventStore(events);
 assert.equal((await store.listRecent()).length,2);assert.equal((await store.latest({kind:'owner_action_required'})).id,events[0].id);
 assert.equal((await store.get(events[1].id)).conclusion,'success');await store.delete(events[0].id);assert.equal(await store.get(events[0].id),null);
 await store.put(events[0]);assert.equal((await store.listRecent({limit:1})).length,1);
 const f=await createFixture();delete f.env.DASHBOARD_EVENT_STORE.delete;
 const html=await(await f.request(worker,'/dashboard/notifications')).text();assert.match(html,/通知はありません。/);
});
