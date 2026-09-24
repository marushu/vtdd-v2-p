import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { DashboardChatRoom } from '../src/worker.js';
import { BrowserThreadMonitor } from '../src/worker/browser-thread-monitor.js';
import { BROWSER_MONITOR_ROOM, BROWSER_MONITOR_KEY, monitorDefinition, parseBrowserMonitorResult } from '../src/core/browser-thread-monitor.js';
import { bootstrapControl } from '../src/core/executor-failover-state.js';
import { seed, report } from './executor-failover-fixtures.js';
import { createInMemoryDashboardMonitorStore } from '../src/core/dashboard-monitor-state.js';
import { runBrowserMonitorTurn } from '../scripts/run-dashboard-app-server-bridge.mjs';
const definition = { bridgeRoomId: BROWSER_MONITOR_ROOM, codexThreadId: 'synthetic-existing-thread', repository: 'sample/project', profile: 'sample-profile', device: 'sample-device', product: 'sample-phone', problem: 'back damaged', service: 'carry-in', store: 'sample-store', address: 'sample-address', intervalSeconds: 300, bookingApproved: true };
function fixture() {
  let now = Date.now(), alarm = null, executorOverride;
  const map = new Map(), sent = [], pushes = [], sockets = [{}];
  const storage = { async transaction(fn) { return fn(this); }, async get(k) { return structuredClone(map.get(k)); }, async put(k,v) { map.set(k,structuredClone(v)); }, async setAlarm(n) { alarm=n; }, async deleteAlarm() { alarm=null; } };
  const env = { VTDD_GATEWAY_BEARER_TOKEN: 'synthetic', DASHBOARD_MONITOR_STORE: createInMemoryDashboardMonitorStore(), EXECUTOR_STORE: { async get() { return executorOverride === undefined ? bootstrapControl({ ...seed(now), macReport: { ...report('mac',now), serviceState: 'running' } },now) : executorOverride; } }, DASHBOARD_CHAT_ROOMS: { getByName() { return { fetch: request => room.fetch(request) }; } } };
  let chain = Promise.resolve();
  const room = new DashboardChatRoom({ storage, blockConcurrencyWhile(fn) { const result=chain.then(fn); chain=result.catch(()=>{}); return result; } },env);
  room.connectedAppServerBridgeSockets=()=>sockets;
  room.sendSocket=(_,p)=>{ sent.push(p);return true; };
  room.browserMonitor=()=>new BrowserThreadMonitor(room,{now:()=>now,notify:async(s,id)=>{pushes.push({s,id});return {ok:true};}});
  const monitor=()=>room.browserMonitor();
  const request=async(path,body,auth=true)=>worker.fetch(new Request('https://example.com'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer synthetic'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  const control=body=>request('/v2/dashboard/browser-monitor',body);
  return { env, room, monitor, sent, pushes, sockets, map, storage, request, control, now:()=>now, advance:n=>now+=n, alarm:()=>alarm, fence:v=>executorOverride=v };
}
function result(request, f, status='no_slots') {
  const target=Object.fromEntries(['profile','device','product','problem','store','address','service'].map(k=>[k,definition[k]]));
  return { schema:'vtdd.browser_monitor.result.v1',runId:request.browserMonitor.runId,status,target,observedAt:new Date(f.now()).toISOString(),url:'https://getsupport.apple.com/solutions/schedule-repair/timeslots',summary:status==='completed'?'確認画面で予約確定を確認':'実予約枠を確認',requiredAction:status==='auth_required'?'Apple Accountに表示された確認要求を承認してください':'',authKind:status==='auth_required'?'2fa':undefined,appointmentAt:status==='completed'?new Date(f.now()+86400000).toISOString():undefined,confirmed:status==='completed' };
}
async function configured(f) { assert.equal((await f.control({action:'configure',definition})).status,200);assert.equal((await f.control({action:'resume'})).status,200);f.advance(1000);await f.room.alarm(); }
async function complete(f,status='no_slots') {
  const request=f.sent.at(-1),run=request.browserMonitor;
  assert.equal((await f.monitor().claim({runId:run.runId,generation:run.generation,codexThreadId:definition.codexThreadId})).allowed,true);
  return f.monitor().result({runId:run.runId,generation:run.generation,codexThreadId:definition.codexThreadId,terminal:true,browserRead:true,text:JSON.stringify(result(request,f,status))});
}
test('mapped E2E: authenticated registration → DO alarm → real bridge handler → same thread resume → fresh result → two automatic recurrences',async()=>{
  const f=fixture();await configured(f);const methods=[],authorizations=[];
  for(let cycle=0;cycle<3;cycle++) {
    const request=f.sent.at(-1), handlers=new Set();let id=0;
    const appServer={nextRequestId:()=>++id,onNotification:fn=>{handlers.add(fn);return()=>handlers.delete(fn);},async request(message){
      methods.push(message.method);
      assert.equal(message.params.threadId,definition.codexThreadId);
      if(message.method==='thread/read')return {thread:{id:definition.codexThreadId,turns:[]}};
      if(message.method==='thread/resume')return {thread:{id:definition.codexThreadId}};
      if(message.method==='turn/start') {
        assert.match(message.params.input[0].text,/fresh/);
        const params={threadId:definition.codexThreadId,turnId:'turn-'+cycle};
        for(const fn of handlers) {
          fn({method:'item/completed',params:{...params,item:{type:'mcpToolCall',server:'computer-use',tool:'js',status:'completed'}}});
          fn({method:'item/agentMessage/delta',params:{...params,delta:'確認しています。'}});
          fn({method:'item/completed',params:{...params,item:{type:'agentMessage',phase:'final_answer',text:JSON.stringify(result(request,f))}}});
          fn({method:'turn/completed',params:{threadId:definition.codexThreadId,turn:{id:params.turnId,status:'completed'}}});
        }
        return {turn:{id:params.turnId}};
      }
      throw Error('unexpected method');
    }};
    const events=[];
    await runBrowserMonitorTurn({request,appServer,runtimeUrl:'https://example.com',token:'synthetic',authorizeExecutor:async args=>{authorizations.push(args.expectedExecutor);return {allowed:true};},fetchImpl:async(url,options)=>f.request(new URL(url).pathname,JSON.parse(options.body)),send:event=>events.push(event),turnTimeoutMs:1000});
    assert.equal(events.length,1);assert.equal(events[0].terminal,true);assert.equal(events[0].browserRead,true);
    await f.room.acceptAppServerBridgeMessage({attachment:{threadId:definition.bridgeRoomId},payload:events[0]});
    const state=await f.monitor().view();assert.equal(state.status,'no_slots');assert.equal(state.lastFreshAt,new Date(f.now()).toISOString());assert.equal(f.pushes.length,0);
    if(cycle<2){f.advance(300000);await f.room.alarm();}
  }
  assert.equal(f.sent.length,3);assert.equal(methods.filter(x=>x==='thread/resume').length,3);assert.equal(methods.includes('thread/start'),false);
  assert.ok(authorizations.every(x=>x.executorId==='mac'&&x.generation===1));
});
test('duplicate alarms and claims, timeout, stop and restart retain unresolved lease',async()=>{
 const f=fixture();await configured(f);await f.room.alarm();assert.equal(f.sent.length,1);
 const req=f.sent[0],body={runId:req.browserMonitor.runId,generation:1,codexThreadId:definition.codexThreadId};
 assert.equal((await f.monitor().claim(body)).allowed,true);assert.equal((await f.monitor().claim(body)).allowed,false);
 f.advance(16*60000);await f.room.alarm();assert.equal((await f.monitor().view()).status,'error');assert.equal(f.sent.length,1);
 await f.control({action:'stop'});assert.equal((await f.control({action:'resume'})).status,409);
 assert.equal((await f.control({action:'configure',definition})).status,409);
 assert.ok((await new BrowserThreadMonitor(f.room).read()).inFlight);
});
test('fresh terminal result only: wrong run, target, stale display, no browser tools and unconfirmed booking fail closed',async()=>{
 const f=fixture();await configured(f);const req=f.sent[0],run=req.browserMonitor;
 assert.equal((await f.monitor().result({runId:'other'})).accepted,false);
 const good=result(req,f);
 for(const [v,browserRead] of [[{...good,target:{}},true],[{...good,observedAt:new Date(f.now()-10000).toISOString()},true],[good,false],[{...good,status:'completed',confirmed:false},true]])assert.throws(()=>parseBrowserMonitorResult(JSON.stringify(v),definition,run,{browserRead,now:f.now()}));
 await f.monitor().claim({runId:run.runId,generation:1,codexThreadId:definition.codexThreadId});
 await f.monitor().result({runId:run.runId,generation:1,codexThreadId:definition.codexThreadId,terminal:false});
 assert.ok((await f.monitor().read()).inFlight);assert.equal((await f.monitor().view()).lastFreshAt,null);
});
test('terminal results push once; completion stops; duplicate result cannot notify or rearm',async()=>{
 for(const status of ['auth_required','completed','available','error']){
  const f=fixture();await configured(f);await complete(f,status);
  const s=await f.monitor().view();assert.equal(s.enabled,false);assert.equal(f.alarm(),null);assert.equal(f.pushes.length,1);
  await f.monitor().result({runId:f.sent[0].browserMonitor.runId,generation:1,codexThreadId:definition.codexThreadId,terminal:true,browserRead:true,text:JSON.stringify(result(f.sent[0],f,status))});assert.equal(f.pushes.length,1);
  if(status==='completed')assert.equal((await f.control({action:'resume'})).status,409);
 }
});
test('fence, missing bridge, API auth/CSRF, invalid definition and private IDs',async()=>{
 const f=fixture();assert.equal((await f.request('/v2/dashboard/browser-monitor',null,false)).status,401);
 assert.throws(()=>monitorDefinition({...definition,bookingApproved:false}));assert.throws(()=>monitorDefinition({...definition,intervalSeconds:1}));
 await f.control({action:'configure',definition});await f.control({action:'resume'});f.fence(null);f.advance(1000);await f.room.alarm();assert.equal(f.sent.length,0);
 const response=await worker.fetch(new Request('https://example.com/v2/dashboard/browser-monitor',{method:'POST',headers:{authorization:'Bearer synthetic',origin:'https://evil.example','content-type':'application/json'},body:'{"action":"resume"}'}),f.env);assert.equal(response.status,403);
 const view=await (await f.request('/v2/dashboard/browser-monitor')).text();assert.equal(view.includes(definition.codexThreadId),false);
 f.fence(undefined);f.sockets.length=0;f.advance(300000);await f.room.alarm();assert.equal((await f.monitor().read()).inFlight,null);assert.ok((await f.monitor().view()).nextRunAt);assert.equal(f.sent.length,0);
});
test('outbox retries authentication notification only, without another browser run',async()=>{
 const f=fixture();let attempts=0;
 f.room.browserMonitor=()=>new BrowserThreadMonitor(f.room,{now:f.now,notify:async()=>({ok:++attempts>1})});
 await configured(f);await complete(f,'auth_required');assert.equal(attempts,1);assert.ok(f.alarm());
 f.advance(60000);await f.room.alarm();assert.equal(attempts,2);assert.equal(f.sent.length,1);assert.equal(f.alarm(),null);
});
test('old generation claim is rejected; stopped unclaimed dispatch cannot execute; late completion is accepted without restarting',async()=>{
 const f=fixture();await configured(f);const r=f.sent[0],body={runId:r.browserMonitor.runId,generation:1,codexThreadId:definition.codexThreadId};
 assert.equal((await f.monitor().claim({...body,generation:2})).allowed,false);
 await f.control({action:'stop'});assert.equal((await f.monitor().claim(body)).allowed,false);
 await f.control({action:'resume'});f.advance(1000);await f.room.alarm();const r2=f.sent[1],b2={...body,runId:r2.browserMonitor.runId};
 await f.monitor().claim(b2);await f.control({action:'stop'});
 await f.monitor().result({...b2,terminal:true,browserRead:true,text:JSON.stringify(result(r2,f,'completed'))});
 assert.equal((await f.monitor().view()).status,'completed');assert.equal(f.alarm(),null);
});
test('running Codex turn and unsupported resume fail without starting a replacement thread',async()=>{
 for(const failure of ['active','resume']){
 const f=fixture();await configured(f);const request=f.sent[0],methods=[],events=[];
 const appServer={nextRequestId:()=>1,onNotification:()=>()=>{},async request(m){methods.push(m.method);if(m.method==='thread/read')return {thread:{turns:failure==='active'?[{status:'inProgress'}]:[]}};throw Error('unsupported model');}};
 await runBrowserMonitorTurn({request,appServer,runtimeUrl:'https://example.com',token:'synthetic',authorizeExecutor:async()=>({allowed:true}),fetchImpl:async(url,options)=>f.request(new URL(url).pathname,JSON.parse(options.body)),send:e=>events.push(e)});
 assert.equal(methods.includes('turn/start'),false);assert.equal(methods.includes('thread/start'),false);assert.equal(events.at(-1).terminal,false);
 }
});
test('natural language monitor status and stop do not require a connected Codex bridge',async()=>{
 const f=fixture();await configured(f);const emitted=[];const socket={readyState:1,send:x=>emitted.push(JSON.parse(x))};
 f.room.broadcastThread=async p=>emitted.push(p);
 await f.room.acceptOwnerMessage({socket,threadId:'owner-chat',payload:{clientMessageId:'synthetic-stop',text:'予約監視を停止して'},origin:'https://example.com'});
 assert.equal((await f.monitor().view()).enabled,false);assert.ok(JSON.stringify(emitted).includes('/dashboard/browser-monitor'));
});
test('notification matrix: no slots/transient disconnect silent; terminal stop, unknown result and available notify once',async()=>{
 const noSlots=fixture();await configured(noSlots);await complete(noSlots);assert.equal(noSlots.pushes.length,0);
 const transient=fixture();transient.sockets.length=0;await configured(transient);assert.equal(transient.pushes.length,0);assert.ok((await transient.monitor().view()).nextRunAt);
 const unknown=fixture();await configured(unknown);const run=unknown.sent[0].browserMonitor;
 const body={runId:run.runId,generation:run.generation,codexThreadId:definition.codexThreadId,terminal:false};
 await unknown.monitor().result(body);await unknown.monitor().result(body);assert.equal(unknown.pushes.length,1);assert.equal(unknown.pushes[0].id.kind,'stopped');
 unknown.advance(16*60000);await unknown.room.alarm();assert.equal(unknown.pushes.length,1);assert.equal((await unknown.monitor().view()).enabled,false);assert.equal(unknown.sent.length,1);
 for(const status of ['error','available']){const f=fixture();await configured(f);await complete(f,status);assert.equal(f.pushes.length,1);assert.equal(f.pushes[0].id.kind,'stopped');assert.match(f.pushes[0].id.body,/停止/);}
 const timeout=fixture();await configured(timeout);timeout.advance(16*60000);await timeout.room.alarm();await timeout.room.alarm();assert.equal(timeout.pushes.length,1);assert.equal(timeout.sent.length,1);
});
test('all terminal notifications retry through outbox without another browser run; confirmed stays stopped even after stop/resume request',async()=>{
 for(const status of ['completed','auth_required','error','available']){
  const f=fixture();let attempts=0;const notifications=[];
  f.room.browserMonitor=()=>new BrowserThreadMonitor(f.room,{now:f.now,notify:async(_,entry)=>{notifications.push(entry);return {ok:++attempts>1};}});
  await configured(f);await complete(f,status);assert.equal(attempts,1);assert.ok(f.alarm());
  const before=await f.monitor().view();assert.equal(before.enabled,false);
  f.advance(60000);await f.room.alarm();assert.equal(attempts,2);assert.equal(f.sent.length,1);assert.equal(f.alarm(),null);
  assert.equal(notifications[0].id,notifications[1].id);
  if(status==='completed'){
   assert.equal(notifications[0].kind,'completed');assert.match(notifications[0].body,/sample-store.*予約確定/);assert.match(notifications[0].body,/\d{4}.*\d{2}:\d{2}/);assert.doesNotMatch(notifications[0].body,/synthetic-existing-thread|sample-device|sample-profile/);
   await f.control({action:'stop'});assert.equal((await f.control({action:'resume'})).status,409);assert.equal((await f.monitor().view()).status,'completed');
  }else if(status==='auth_required')assert.match(notifications[0].body,/確認要求を承認/);
 }
});
test('completion protocol requires confirmed appointment time; notification never copies arbitrary agent prose',async()=>{
 const f=fixture();await configured(f);const request=f.sent[0],run=request.browserMonitor,good=result(request,f,'completed');
 assert.throws(()=>parseBrowserMonitorResult(JSON.stringify({...good,appointmentAt:null}),definition,run,{browserRead:true,now:f.now()}));
 await f.monitor().claim({runId:run.runId,generation:1,codexThreadId:definition.codexThreadId});
 await f.monitor().result({runId:run.runId,generation:1,codexThreadId:definition.codexThreadId,terminal:true,browserRead:true,text:JSON.stringify({...good,summary:'予約番号 ABC123 を確認'})});
 assert.equal(f.pushes[0].id.kind,'completed');assert.doesNotMatch(f.pushes[0].id.body,/ABC123|予約番号/);
});
