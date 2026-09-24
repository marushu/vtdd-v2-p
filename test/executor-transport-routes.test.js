import test from 'node:test';
import assert from 'node:assert/strict';
import { transportFixture } from './executor-transport-fixtures.js';
import { transportTokenDigest } from '../src/core/executor-transport-credential.js';
import { nodeKeys,enrollment,signed } from './executor-identity-fixtures.js';
import { report,seed,transition } from './executor-failover-fixtures.js';
const token='c'.repeat(64),digest=await transportTokenDigest(token),next=await transportTokenDigest('d'.repeat(64));
const body={executorId:'mac',issueNumber:860,newDigest:digest,previousDigest:'',targetConfirmed:true};
test('dashboard session operator → scoped passkey → transport enrollment → key enrollment → signed report → bootstrap candidate',async()=>{
 const f=await transportFixture(),keys=nodeKeys();
 const page=await f.request('/v2/approval/passkey/operator?mode=executor-transport&executorId=mac&issueNumber=860');assert.equal(page.status,200);const html=await page.text();assert.match(html,/通信の登録/);assert.ok(!html.includes(token));
 assert.equal((await f.request('/v2/approval/passkey/operator?mode=executor-transport',null,{})).status,401);
 assert.equal((await f.request('/v2/approval/passkey/operator?mode=executor-transport',null,{authorization:'Bearer legacy-fixture'})).status,403);
 assert.equal((await f.request('/v2/executors/transport/enroll',body)).status,403);
 const approvalGrantId=await f.approve(body);
 for(const patch of [{executorId:'vps'},{newDigest:next},{previousDigest:next},{issueNumber:858},{approvalGrantId:'forged'}])assert.equal((await f.request('/v2/executors/transport/enroll',{...body,approvalGrantId,...patch})).status,403);
 assert.equal((await f.request('/v2/executors/transport/enroll',{...body,approvalGrantId,token})).status,422);
 assert.equal((await f.request('/v2/executors/transport/enroll',{...body,approvalGrantId},{cookie:f.cookie,origin:'https://evil.example'})).status,403);
 assert.equal((await f.request('/v2/executors/transport/enroll',{...body,approvalGrantId},{authorization:'Bearer legacy-fixture'})).status,403);
 const r=await f.request('/v2/executors/transport/enroll',{...body,approvalGrantId});assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,authority:'node_transport_only'});
 assert.equal((await f.request('/v2/executors/transport/enroll',{...body,approvalGrantId})).status,409);
 const keyBody=enrollment(keys);keyBody.approvalGrantId=await f.approve(keyBody,'executor_node_enroll');assert.equal((await f.request('/v2/executors/enroll',keyBody)).status,200);
 const payload=signed(keys,'report',report('mac',Date.now()));const headers={authorization:'Executor '+token};assert.equal((await f.request('/v2/executors/report',payload,headers)).status,202);
 assert.equal((await f.request('/v2/executors/report',payload,headers)).status,403);
 const view=await (await f.request('/v2/executors/overview')).json();assert.deepEqual(view.transportEnrolled,{mac:true,vps:false});assert.equal(view.bootstrapCandidate.executorId,'mac');assert.equal(view.initialized,false);assert.ok(!JSON.stringify(view).includes(digest));assert.ok(!JSON.stringify(view).includes(token));
 const records=await f.env.MEMORY_PROVIDER.query({});assert.ok(!JSON.stringify(records).includes(token));
});
test('Executor scheme is exclusive to signed report/authorize; malformed or wrong tokens and signed generation reject',async()=>{
 const f=await transportFixture(),keys=nodeKeys(),n=Date.now();await f.env.EXECUTOR_STORE.enroll(enrollment(keys));await f.env.EXECUTOR_STORE.enroll(enrollment(keys,'vps'));await f.env.EXECUTOR_STORE.enrollTransport(body);await f.env.EXECUTOR_STORE.bootstrap(seed(n),n);
 const authBody={executorId:'mac',generation:1,purpose:'dashboard_turn'};
 for(const authorization of ['Executor '+token,'Bearer legacy-fixture']){
  const r=await f.request('/v2/executors/authorize',signed(keys,'authorize',authBody),{authorization});assert.equal(r.status,200);assert.equal((await r.json()).allowed,true);
 }
 for(const authorization of ['Executor '+'e'.repeat(64),'Executor '+digest,'Executor short','Executor '+'A'.repeat(64),'Bearer '+token,'executor '+token,'Executor '+token+' extra'])assert.ok((await f.request('/v2/executors/authorize',signed(keys,'authorize',authBody),{authorization})).status>=400);
 for(const path of ['/v2/executors/overview','/v2/executors/activation/verify','/v2/dashboard/overview','/v2/executors/transport/enroll'])assert.ok((await f.request(path,path.endsWith('overview')?null:{},{authorization:'Executor '+token})).status>=400);
 for(const [patch,status] of [[{executorId:'vps'},403],[{generation:2},409]])assert.equal((await f.request('/v2/executors/authorize',signed(keys,'authorize',{...authBody,...patch}),{authorization:'Executor '+token})).status,status);
 assert.equal((await f.request('/v2/executors/authorize',{payload:authBody},{authorization:'Executor '+token})).status,403);
 await f.env.EXECUTOR_STORE.report(report('vps',n),n);await f.env.EXECUTOR_STORE.transition(transition(),n);
 for(const route of ['report','authorize']) { const stale=route==='report'?report('mac',n+1):authBody;assert.equal((await f.request('/v2/executors/'+route,signed(keys,route,stale),{authorization:'Executor '+token})).status,409); }
});
test('transport challenge requires dashboard session and strict payload; read session alone is not approval',async()=>{
 const f=await transportFixture();const c={...body,highRiskKind:'executor_transport_enroll',policyInput:{actionType:'destructive',highRiskKind:'executor_transport_enroll'}};
 assert.equal((await f.request('/v2/approval/passkey/challenge',c,{})).status,403);
 assert.equal((await f.request('/v2/approval/passkey/challenge',c,{authorization:'Bearer legacy-fixture'})).status,403);
 assert.equal((await f.request('/v2/approval/passkey/challenge',{...c,rawToken:token})).status,422);
 assert.equal((await f.request('/v2/executors/transport/enroll',{...body,approvalGrantId:'dashboard-session:transport'})).status,403);
 const challenge=await f.request('/v2/approval/passkey/challenge',c);const value=await challenge.json();assert.equal(challenge.status,200);
 assert.equal((await f.request('/v2/approval/passkey/verify',{sessionId:value.sessionId,response:{id:'AQIDBA',response:{}}},{})).status,403);
});
