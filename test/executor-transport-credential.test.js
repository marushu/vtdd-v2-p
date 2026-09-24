import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createInMemoryExecutorStore, createD1ExecutorStore } from '../src/core/executor-failover-state.js';
import { transportTokenDigest, transportEnrollmentScope } from '../src/core/executor-transport-credential.js';
import { evaluateApprovalGrant } from '../src/core/passkey-approval.js';
import { nodeKeys,enrollment,signed } from './executor-identity-fixtures.js';
import { now,seed,report } from './executor-failover-fixtures.js';
const token='a'.repeat(64), other='b'.repeat(64);
const digest=await transportTokenDigest(token), next=await transportTokenDigest(other);
const enroll=(executorId='mac',newDigest=digest,previousDigest='')=>({executorId,newDigest,previousDigest,issueNumber:860,targetConfirmed:true});
function sqlite(){const db=new DatabaseSync(':memory:');let intercept;return {db,setIntercept(fn){intercept=fn;},adapter:{prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args);},async run(){if(sql.startsWith('UPDATE')&&intercept){const f=intercept;intercept=null;await f();}return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};}
for(const backend of ['memory','sqlite'])test(backend+' transport preserves state, authenticates same node and preserves every signature/fence check',async()=>{
 const sql=backend==='sqlite'?sqlite():null,store=sql?createD1ExecutorStore(sql.adapter):createInMemoryExecutorStore(),keys=nodeKeys();
 try{
 await store.enroll(enrollment(keys),now);await store.enroll(enrollment(keys,'vps'),now);
 await store.signedReport(signed(keys,'report',report(),now),now);
 const before={control:await store.get(),candidate:await store.getCandidate(),keys:await store.getIdentities()};
 await store.enrollTransport(enroll(),now);assert.deepEqual({control:await store.get(),candidate:await store.getCandidate(),keys:await store.getIdentities()},before);
 assert.deepEqual(await store.getTransportStatus(),{mac:true,vps:false});
 await store.bootstrap(seed(),now);const control=await store.get();
 const body={executorId:'mac',generation:1,purpose:'dashboard_turn'};
 const req=signed(keys,'authorize',body,now);
 assert.equal((await store.signedAuthorize(req,now,digest)).allowed,true);
 await assert.rejects(store.signedAuthorize(req,now,digest),/replay/);
 await assert.rejects(store.signedAuthorize(signed(keys,'authorize',body,now),now,next),/transport_rejected/);
 await assert.rejects(store.signedAuthorize(signed(keys,'authorize',{...body,executorId:'vps'},now),now,digest),/transport_rejected/);
 await assert.rejects(store.signedAuthorize(signed(keys,'authorize',body,now-120001),now,digest),/stale/);
 await assert.rejects(store.signedAuthorize(signed(keys,'authorize',body,now+120001),now,digest),/stale/);
 const tampered=signed(keys,'authorize',body,now);tampered.payload.purpose='vps_work';await assert.rejects(store.signedAuthorize(tampered,now,digest),/signature_invalid/);
 await assert.rejects(store.signedAuthorize(signed(nodeKeys(),'authorize',body,now),now,digest),/signature_invalid/);
 await assert.rejects(store.signedAuthorize(signed(keys,'report',body,now),now,digest),/signature_invalid/);
 await assert.rejects(store.signedAuthorize(signed(keys,'authorize',{...body,generation:2},now),now,digest),/generation_conflict/);
 await store.enrollTransport(enroll('mac',next,digest),now);
 assert.deepEqual(await store.get(),control);assert.deepEqual(await store.getIdentities(),before.keys);
 await assert.rejects(store.signedAuthorize(signed(keys,'authorize',body,now),now,digest),/transport_rejected/);
 assert.equal((await store.signedAuthorize(signed(keys,'authorize',body,now),now,next)).allowed,true);
 // Global transport callers still use signatures, without a node digest argument.
 assert.equal((await store.signedAuthorize(signed(keys,'authorize',body,now),now)).allowed,true);
 const request=signed(keys,'report',report('mac',now+1),now+1);
 const results=await Promise.allSettled([store.signedReport(request,now+1,next),store.signedReport(request,now+1,next)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 if(sql){const row=sql.db.prepare('SELECT payload FROM vtdd_executor_control').get();assert.ok(!row.payload.includes(token));assert.ok(!row.payload.includes(other));assert.deepEqual(await createD1ExecutorStore(sql.adapter).getTransportStatus(),{mac:true,vps:false});}
 }finally{sql?.db.close();}
});
test('SQLite CAS rechecks transport when rekey races report or authorize; concurrent enroll has one winner',async()=>{
 for(const route of ['report','authorize']){
 const sql=sqlite(),store=createD1ExecutorStore(sql.adapter),keys=nodeKeys();
 try{await store.enroll(enrollment(keys),now);await store.bootstrap(seed(),now);await store.enrollTransport(enroll(),now);
 sql.setIntercept(()=>store.enrollTransport(enroll('mac',next,digest),now));
 const body=route==='report'?report('mac',now+1):{executorId:'mac',generation:1,purpose:'dashboard_turn'};
 await assert.rejects(store[route==='report'?'signedReport':'signedAuthorize'](signed(keys,route,body,now+1),now+1,digest),/transport_rejected/);
 const attempts=await Promise.allSettled([store.enrollTransport(enroll('vps'),now),store.enrollTransport(enroll('vps',next),now)]);assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
 }finally{sql.db.close();}}
});
test('enrollment scope is exact, strict and cannot authorize other actions or be replayed as a no-op',async()=>{
 const scope=transportEnrollmentScope(enroll()),grant={verified:true,scope,expiresAt:new Date(Date.now()+60000).toISOString()};
 for(const patch of [{executorId:'vps'},{executorTransportDigest:next},{executorPreviousTransportDigest:next},{issueNumber:'858'},{actionType:'merge'},{highRiskKind:'executor_node_enroll'},{highRiskKind:'executor_failover'}])assert.equal(evaluateApprovalGrant({approvalGrant:grant,scope:{...scope,...patch}}).ok,false);
 for(const patch of [{newDigest:token},{previousDigest:token},{newDigest:digest,previousDigest:digest},{rawToken:token},{generation:1},{executorId:'other'},{targetConfirmed:false},{issueNumber:0}])assert.throws(()=>transportEnrollmentScope({...enroll(),...patch}));
 for(const bad of ['a'.repeat(63),'A'.repeat(64),digest,token+'\n','x'.repeat(64)])await assert.rejects(transportTokenDigest(bad));
 const store=createInMemoryExecutorStore();await store.enrollTransport(enroll());await assert.rejects(store.enrollTransport(enroll()),/conflict/);
});
