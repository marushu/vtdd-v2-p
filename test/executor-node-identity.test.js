import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryExecutorStore,createD1ExecutorStore } from '../src/core/executor-failover-state.js';
import { nodeKeys,enrollment,signed } from './executor-identity-fixtures.js';
import { enrollmentScope } from '../src/core/executor-node-identity.js';
import { normalizeScopeSnapshot,evaluateApprovalGrant } from '../src/core/passkey-approval.js';
import { now,seed,report } from './executor-failover-fixtures.js';
for(const backend of ['memory','sqlite'])test(backend+' Ed25519 identity rejects wrong node, replay, stale, tampered body and generation',async()=>{
 let db;let store;
 if(backend==='sqlite') {const {DatabaseSync}=await import('node:sqlite');db=new DatabaseSync(':memory:');store=createD1ExecutorStore({prepare(sql){let args=[];return {bind(...v){args=v;return this;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};},async first(){return db.prepare(sql).get(...args);}};}});} else store=createInMemoryExecutorStore();
 try {
 const keys=nodeKeys(),wrong=nodeKeys();await store.enroll(enrollment(keys,'mac'),now);await store.enroll(enrollment(keys,'vps'),now);
 await store.signedReport(signed(keys,'report',report(),now),now);assert.equal(await store.get(),null);
 await store.bootstrap(seed(),now);
 const body={executorId:'mac',generation:1,purpose:'dashboard_turn'};
 const request=signed(keys,'authorize',body,now);
 assert.deepEqual(await store.signedAuthorize(request,now),{allowed:true,reason:'authorized'});
 await assert.rejects(store.signedAuthorize(request,now),/replay/);
 await assert.rejects(store.signedAuthorize(signed(wrong,'authorize',body,now),now),/signature_invalid/);
 const otherNode=signed(keys,'authorize',body,now);otherNode.payload.executorId='vps';await assert.rejects(store.signedAuthorize(otherNode,now),/signature_invalid/);
 await assert.rejects(store.signedAuthorize(signed(keys,'authorize',body,now-120001),now),/stale/);
 await assert.rejects(store.signedAuthorize(signed(keys,'authorize',body,now+120001),now),/stale/);
 const tampered=signed(keys,'authorize',body,now);tampered.payload={...body,purpose:'vps_work'};await assert.rejects(store.signedAuthorize(tampered,now),/signature_invalid/);
 await assert.rejects(store.signedAuthorize(signed(keys,'report',body,now),now),/signature_invalid/);
 await assert.rejects(store.signedAuthorize(signed(keys,'authorize',{...body,generation:2},now),now),/generation_conflict/);
 const concurrent=signed(keys,'report',report('mac',now+1),now+1);const results=await Promise.allSettled([store.signedReport(concurrent,now+1),store.signedReport(concurrent,now+1)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const before=await store.get();await store.enroll(enrollment(wrong,'mac',keys.mac.raw),now+2);const after=await store.get();assert.equal(after.generation,before.generation);assert.equal(after.primaryExecutor,before.primaryExecutor);assert.equal(after.nodes.mac,undefined);
 await assert.rejects(store.signedAuthorize(signed(keys,'authorize',body,now+2),now+2),/signature_invalid/);
 await assert.rejects(store.enroll(enrollment(keys,'mac'),now+2),/key_conflict/);
 await store.signedReport(signed(wrong,'report',report('mac',now+3),now+3),now+3);
 assert.equal((await store.signedAuthorize(signed(wrong,'authorize',body,now+3),now+3)).allowed,true);
 } finally {db?.close();}
});
test('enrollment passkey scope binds node and old/new public keys, not execution authority',()=>{
 const keys=nodeKeys(),p=enrollment(keys),scope=enrollmentScope(p);
 assert.equal(normalizeScopeSnapshot(scope).executorPublicKey,keys.mac.raw);
 const grant={verified:true,expiresAt:new Date(Date.now()+60000).toISOString(),scope};
 for(const patch of [{executorId:'vps'},{executorPublicKey:keys.vps.raw},{executorPreviousPublicKey:keys.vps.raw},{actionType:'merge'},{highRiskKind:'executor_failover'}])assert.equal(evaluateApprovalGrant({approvalGrant:grant,scope:{...scope,...patch}}).ok,false);
});
test('SQLite rekey racing authorization re-verifies signature against the new durable key',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(':memory:');let intercept;
 const adapter={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async run(){if(sql.startsWith('UPDATE')&&intercept){const fn=intercept;intercept=null;await fn();}return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};},async first(){return db.prepare(sql).get(...args);}};}};
 const store=createD1ExecutorStore(adapter),keys=nodeKeys(),next=nodeKeys();
 try{await store.enroll(enrollment(keys),now);await store.bootstrap(seed(),now);intercept=()=>store.enroll(enrollment(next,'mac',keys.mac.raw),now);
 await assert.rejects(store.signedAuthorize(signed(keys,'authorize',{executorId:'mac',generation:1,purpose:'dashboard_turn'},now),now),/signature_invalid/);
 const reopened=createD1ExecutorStore(adapter);assert.equal((await reopened.getIdentities()).mac,next.mac.raw);
 const body=signed(next,'report',report('mac',now+1),now+1);await reopened.signedReport(body,now+1);await assert.rejects(store.signedReport(body,now+1),/replay/);
 }finally{db.close();}
});
