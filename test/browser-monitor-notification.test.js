import test from 'node:test';
import assert from 'node:assert/strict';
import { notifyBrowserMonitorEvent, buildDashboardWebPushPayload } from '../src/worker/runtime.js';
const base64 = data => Buffer.from(data).toString('base64url');
async function fixture() {
 const subscriber=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const events=new Map(),calls=[];let responseStatus=201;
 const env={
  VTDD_WEB_PUSH_PUBLIC_KEY:base64(await crypto.subtle.exportKey('raw',vapid.publicKey)),
  VTDD_WEB_PUSH_PRIVATE_KEY:JSON.stringify(await crypto.subtle.exportKey('jwk',vapid.privateKey)),VTDD_WEB_PUSH_SUBJECT:'mailto:test@example.com',
  DASHBOARD_EVENT_STORE:{async get(id){return events.get(id);},async put(v){events.set(v.id,v);},async delete(){},async latest(){return null;}},
  DASHBOARD_PUSH_SUBSCRIPTION_STORE:{async put(){},async delete(){return {deleted:true};},async list(){return [{endpoint:'https://push.example/synthetic',endpointHash:'synthetic',p256dh:base64(await crypto.subtle.exportKey('raw',subscriber.publicKey)),auth:base64(new Uint8Array(16))}];}},
  DASHBOARD_WEB_PUSH_FETCH:async(url,init)=>{calls.push({url,init});return new Response(null,{status:responseStatus});}
 };
 return {env,events,calls,status:n=>responseStatus=n};
}
test('existing encrypted Web Push/event path distinguishes normal booking completion from action_required and dedupes persisted success',async()=>{
 const f=await fixture();
 for(const kind of ['completed','auth_required','stopped']){
  const entry={kind,id:'sample-run-'+kind,runId:'sample-run',repository:'sample/project',title:kind==='completed'?'予約が確定しました':'対応が必要です',body:kind==='completed'?'sample store · 2026年10月1日 09:00 予約確定':kind==='auth_required'?'Apple Accountの確認要求を承認してください':'監視を停止しました。結果の確認が必要です。'};
  const before=f.calls.length;
  assert.equal((await notifyBrowserMonitorEvent(f.env,entry)).ok,true);
  const event=[...f.events.values()].at(-1),payload=buildDashboardWebPushPayload(event);
  assert.equal(event.kind,kind==='completed'?'browser_monitor_completed':'owner_action_required');
  assert.equal(payload.renotify,false);assert.match(payload.body,kind==='completed'?/sample store.*09:00.*予約確定/:kind==='auth_required'?/確認要求を承認/:/停止/);
  if(kind==='completed')assert.doesNotMatch(payload.title,/要対応/);
  await notifyBrowserMonitorEvent(f.env,entry);assert.equal(f.calls.length,before+1);
  assert.equal(f.calls.at(-1).init.headers['content-encoding'],'aes128gcm');
 }
});
test('failed existing push is retriable with the same event id and notification tag',async()=>{
 const f=await fixture(),entry={kind:'completed',id:'run-completed',repository:'sample/project',title:'予約確定',body:'sample store · 2026年10月1日 09:00 予約確定'};
 f.status(500);assert.equal((await notifyBrowserMonitorEvent(f.env,entry)).ok,false);
 const event=[...f.events.values()][0],tag=buildDashboardWebPushPayload(event).tag;
 f.status(201);assert.equal((await notifyBrowserMonitorEvent(f.env,entry)).ok,true);
 assert.equal(f.events.size,1);assert.equal(buildDashboardWebPushPayload([...f.events.values()][0]).tag,tag);assert.equal(f.calls.length,2);
});
