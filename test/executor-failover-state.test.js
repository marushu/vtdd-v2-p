import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryExecutorStore, createD1ExecutorStore, bootstrapControl, applyNodeReport, executorOverview, transitionControl, validateNodeReport, validateControlState } from '../src/core/executor-failover-state.js';
import { now,stamp,report,seed,transition } from './executor-failover-fixtures.js';
const ready = () => applyNodeReport(bootstrapControl(seed(),now),report('vps'),now);
test('explicit bootstrap and server timestamps; first report cannot initialize',async()=>{
 const store=createInMemoryExecutorStore();await store.report(report(),now);assert.equal((await store.getCandidate()).executorId,'mac');assert.equal(await store.get(),null);
 await store.bootstrap(seed(),now);assert.equal((await store.get()).nodes.mac.receivedAt,stamp(now));await assert.rejects(store.bootstrap(seed(),now),{status:409});
 assert.throws(()=>bootstrapControl({...seed(),approvedCodexVersion:'1.2.2'},now));
});
test('strict bounded schemas reject unexpected keys, commands, paths, secrets, oversized payload',()=>{
 for(const patch of [{token:'secret'},{receivedAt:stamp(now)},{generation:0},{codexVersion:'latest'},{rawMessage:'hello'},{heartbeatAt:'tomorrow'},{appServerSmokeOk:'true'}])assert.throws(()=>validateNodeReport({...report(),...patch}));
 for(const patch of [{repository:'/tmp/private'},{branch:'../../private'},{lastSuccessfulAction:'curl https://example.com'},{nextSafeAction:'secret_value'},{headSha:'oops'},{extra:'x'}])assert.throws(()=>validateNodeReport({...report(),checkpoint:{...report().checkpoint,...patch}}));
 assert.throws(()=>validateNodeReport({...report(),codexVersion:'x'.repeat(17000)}),{status:413});
 assert.throws(()=>validateControlState({...ready(),token:'x'}));
});
test('readiness is bounded and heartbeat loss never mutates authority',()=>{
 const s=ready();assert.equal(executorOverview(s,now).ready,true);
 const view=executorOverview(s,now+121000);assert.equal(view.nodes.mac.healthy,false);assert.equal(view.ready,true);assert.match(view.ownerAction,/Mac未確認/);assert.equal(s.primaryExecutor,'mac');
 for(const [patch,pattern] of [[{codexVersion:'1.2.2'},/版/],[{appServerSmokeOk:false},/app-server/],[{serviceState:'running'},/競合/],[{generation:2},/世代/],[{heartbeatAt:stamp(now-301000)},/古い/]]) {
  const v=executorOverview({...s,nodes:{...s.nodes,vps:{...s.nodes.vps,...patch}}},now);assert.equal(v.ready,false);assert.match(v.blockers.join(),pattern);
 }
 for(const patch of [{dirty:true},{unpushed:true},{generation:2},{updatedAt:stamp(now-601000)}])assert.equal(executorOverview({...s,checkpoint:{...s.checkpoint,...patch}},now).ready,false);
 assert.equal(executorOverview({...s,nodes:{...s.nodes,mac:{...s.nodes.mac,serviceState:'running'}}},now).ready,false);
});
test('transition changes generation once; stale returned primary is visible but never healthy; failback requires new evidence',()=>{
 const s=ready(), t=transitionControl(s,transition(),now);assert.equal(t.generation,2);assert.equal(t.primaryExecutor,'vps');assert.equal(s.generation,1);
 assert.throws(()=>transitionControl(t,transition(),now),{status:409});
 const returned=applyNodeReport(t,report('mac',now+1),now+1);assert.equal(returned.nodes.mac.generation,1);assert.equal(executorOverview(returned,now+1).nodes.mac.healthy,false);
 assert.equal(executorOverview(returned,now+1).ready,false);
 let fresh=applyNodeReport(t,{...report('vps',now+2),generation:2,serviceState:'running',leaseReceiptId:t.activationReceipt.receiptId,checkpoint:{...report().checkpoint,generation:2,updatedAt:stamp(now+2)}},now+2);
 fresh=applyNodeReport(fresh,{...report('mac',now+3),generation:2},now+3);
 fresh=applyNodeReport(fresh,{...report('vps',now+4),generation:2,serviceState:'inactive'},now+4);
 const back=transitionControl(fresh,{...transition(),executorFrom:'vps',executorTo:'mac',expectedGeneration:2},now+4);assert.equal(back.generation,3);assert.equal(back.primaryExecutor,'mac');
});
for(const kind of ['memory','sqlite'])test(kind+' concurrent CAS and report/transition races',async t=>{
 let db,store;
 if(kind==='sqlite') {
  let DatabaseSync;try{({DatabaseSync}=await import('node:sqlite'));}catch{t.skip('node:sqlite unavailable');return;}
  db=new DatabaseSync(':memory:');const adapter={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},async first(){return db.prepare(sql).get(...args);}};}};store=createD1ExecutorStore(adapter);
 }else store=createInMemoryExecutorStore();
 try {
 await store.bootstrap(seed(),now);await store.report(report('vps'),now);
 const result=await Promise.allSettled([store.transition(transition(),now),store.transition(transition(),now)]);
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.find(x=>x.status==='rejected').reason.status,409);assert.equal((await store.get()).generation,2);
 await store.report(report('mac',now+1),now+1);assert.equal((await store.get()).generation,2);
 }finally{db?.close();}
});
test('write guard is bound to primary, generation and health; stale running primary may request explicit emergency transition',async()=>{
 const {executorMayWrite}=await import('../src/core/executor-failover-state.js');const s=ready();
 assert.equal(executorMayWrite(s,'mac',1,now),true);assert.equal(executorMayWrite(s,'vps',1,now),false);assert.equal(executorMayWrite(s,'mac',2,now),false);assert.equal(executorMayWrite(s,'mac',1,now+121000),false);
 s.nodes.mac.serviceState='running';assert.equal(executorOverview(s,now+121000).ready,true);
});
test('Mac auto-update preserves primary health, produces unapproved candidate and blocks standby',()=>{
 const s=ready();s.nodes.mac.codexVersion='1.2.4';const v=executorOverview(s,now);
 assert.equal(v.nodes.mac.healthy,true);assert.equal(v.versionApprovalPending,true);assert.equal(v.versionCandidate,'1.2.4');assert.equal(v.approvedCodexVersion,'1.2.3');assert.equal(v.standbyReady,false);assert.equal(v.ready,false);
});
test('120s skew is accepted but greater skew rejected, including checkpoint timestamps',()=>{
 assert.doesNotThrow(()=>applyNodeReport(ready(),report('mac',now+120000),now));
 assert.throws(()=>applyNodeReport(ready(),report('mac',now+120001),now),/future_report/);
});
test('activation requires current unexpired receipt ack, cannot silently adopt generation',()=>{
 const t=transitionControl(ready(),transition(),now);
 assert.equal(t.activationPending,true);assert.equal(executorOverview(t,now).ready,false);
 const unleased=applyNodeReport(t,{...report('vps',now+1),generation:2},now+1);
 assert.equal(unleased.activationPending,true);assert.equal(executorOverview(unleased,now+1).nodes.vps.healthy,false);
 const bad=applyNodeReport(t,{...report('vps',now+1),generation:2,leaseReceiptId:'00000000-0000-0000-0000-000000000000'},now+1);assert.equal(bad.activationPending,true);
 const active=applyNodeReport(t,{...report('vps',now+2),generation:2,serviceState:'running',leaseReceiptId:t.activationReceipt.receiptId},now+2);assert.equal(active.activationPending,false);assert.equal(executorOverview(active,now+2).nodes.vps.healthy,true);
 const expired=applyNodeReport(t,{...report('vps',now+600001),generation:2,serviceState:'running',leaseReceiptId:t.activationReceipt.receiptId},now+600001);assert.equal(expired.activationPending,true);
});
test('real SQLite report/transition CAS race re-reduces latest dirty checkpoint and preserves exact failed state',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(':memory:');let intercept;
 const adapter={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async run(){if(sql.startsWith('UPDATE')&&intercept){const f=intercept;intercept=null;await f();}const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},async first(){return db.prepare(sql).get(...args);}};}};
 const store=createD1ExecutorStore(adapter);
 try{
 await store.report(report(),now);assert.equal(await store.get(),null);
 await store.bootstrap({primaryExecutor:'mac',standbyExecutor:'vps',approvedCodexVersion:'1.2.3',relatedIssue:858},now);await store.report(report('vps'),now);
 const dirty={...report('mac',now+1),checkpoint:{...report().checkpoint,dirty:true}};
 intercept=()=>store.report(dirty,now+1);
 await assert.rejects(store.transition(transition(),now+2),{status:409});
 const expected=applyNodeReport(ready(),dirty,now+1);assert.deepEqual(await store.get(),expected);
 const before=db.prepare('SELECT revision,payload FROM vtdd_executor_control WHERE id=1').get();
 await assert.rejects(store.transition({...transition(),expectedGeneration:9},now+3),{status:409});
 assert.deepEqual(db.prepare('SELECT revision,payload FROM vtdd_executor_control WHERE id=1').get(),before);
 }finally{db.close();}
});
test('SQLite version approval CAS re-reads Mac report; stale candidate or generation never changes version',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(':memory:');let intercept;
 const adapter={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async run(){if(sql.startsWith('UPDATE')&&intercept){const f=intercept;intercept=null;await f();}const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},async first(){return db.prepare(sql).get(...args);}};}};
 const store=createD1ExecutorStore(adapter);const body={issueNumber:42,executorFrom:'mac',executorTo:'mac',expectedGeneration:1,targetConfirmed:true,approvedCodexVersion:'1.2.4',previousCodexVersion:'1.2.3'};
 try{
  await store.bootstrap(seed(),now);await store.report({...report('mac',now+1),codexVersion:'1.2.4'},now+1);
  intercept=()=>store.report({...report('mac',now+2),codexVersion:'1.2.5'},now+2);
  await assert.rejects(store.approveVersion(body,now+3),{status:409});assert.equal((await store.get()).approvedCodexVersion,'1.2.3');assert.equal((await store.get()).nodes.mac.codexVersion,'1.2.5');
  const before=await store.get();await assert.rejects(store.approveVersion({...body,approvedCodexVersion:'1.2.5',expectedGeneration:2},now+4),{status:409});assert.deepEqual(await store.get(),before);
  await assert.rejects(store.approveVersion({...body,approvedCodexVersion:'1.2.5'},now+121003),{status:409});assert.deepEqual(await store.get(),before);
  await store.approveVersion({...body,approvedCodexVersion:'1.2.5'},now+4);assert.deepEqual(await store.get(),{...before,approvedCodexVersion:'1.2.5'});
 }finally{db.close();}
});
