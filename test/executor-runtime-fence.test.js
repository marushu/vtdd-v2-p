import { nodeKeys, enrollment, signed } from './executor-identity-fixtures.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { after } from 'node:test';
const temporary=mkdtempSync(tmpdir()+'/executor-identity-');after(()=>rmSync(temporary,{recursive:true,force:true}));let serial=0;
import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createInMemoryExecutorStore } from '../src/core/executor-failover-state.js';
import { authorizeRuntimeExecutor } from '../scripts/executor-runtime-fence.mjs';
import { handleDashboardTurnRequest, connectDashboardAppServerBridgeOnce } from '../scripts/run-dashboard-app-server-bridge.mjs';
import { runVpsRunnerOnce } from '../scripts/run-vps-runner.mjs';
import { seed,report,transition } from './executor-failover-fixtures.js';
function fixture(){
 const store=createInMemoryExecutorStore(),keys=nodeKeys();const enrolled=Promise.all(['mac','vps'].map(id=>store.enroll(enrollment(keys,id))));
 const env={EXECUTOR_STORE:store,VTDD_GATEWAY_BEARER_TOKEN:'synthetic'};
 const fetchImpl=async(url,init)=>{await enrolled;return worker.fetch(new Request(url,init),env);};
 const identity=(id,generation)=>{const path=temporary+'/'+(++serial);const identityKeyPath=path+'.key';writeFileSync(identityKeyPath,JSON.stringify(keys[id].privateKey.export({format:'jwk'})),{mode:0o600});writeFileSync(path,JSON.stringify({executorId:id,generation,identityKeyPath,origin:'https://example.com'}),{mode:0o600});return {VTDD_EXECUTOR_CONFIG_PATH:path,VTDD_RUNTIME_URL:'https://example.com',VTDD_GATEWAY_BEARER_TOKEN:'synthetic'};};
 const authorize=(id,generation,purpose='dashboard_turn')=>authorizeRuntimeExecutor({env:identity(id,generation),fetchImpl,purpose});return {store,fetchImpl,identity,authorize,keys};
}
test('actual authorization endpoint denies bootstrap and exposes only minimal decision',async()=>{
 const f=fixture();let r=await f.fetchImpl('https://example.com/v2/executors/authorize',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify(signed(f.keys,'authorize',{executorId:'mac',generation:1,purpose:'dashboard_turn'}))});assert.deepEqual(await r.json(),{allowed:false,reason:'bootstrap_required'});
 assert.equal((await f.authorize('mac',1)).allowed,false);
 r=await f.fetchImpl('https://example.com/v2/executors/authorize',{method:'POST',body:'{}'});assert.equal(r.status,401);
 r=await f.fetchImpl('https://example.com/v2/executors/authorize',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify(signed(f.keys,'authorize',{executorId:'mac',generation:1,purpose:'shell',command:'echo'}))});assert.equal(r.status,422);
});
test('actual Worker fences old Mac, pending nodes, and old VPS after failback; only running receipt activates',async()=>{
 const f=fixture(),n=Date.now();await f.store.bootstrap(seed(n),n);await f.store.report(report('vps',n),n);assert.equal((await f.authorize('mac',1)).allowed,true);assert.equal((await f.authorize('vps',1)).allowed,false);
 const t=await f.store.transition(transition(),n);for(const [id,g]of [['mac',1],['vps',2]])assert.equal((await f.authorize(id,g)).allowed,false);
 await f.store.report({...report('vps',n+1),generation:2,leaseReceiptId:t.activationReceipt.receiptId},n+1);assert.equal((await f.store.get()).activationPending,true);
 await f.store.report({...report('vps',n+2),generation:2,serviceState:'running',leaseReceiptId:t.activationReceipt.receiptId},n+2);assert.equal((await f.authorize('vps',2)).allowed,true);assert.equal((await f.authorize('mac',1)).allowed,false);
 await f.store.report({...report('vps',n+3),generation:2,checkpoint:{...report('mac',n+3).checkpoint,generation:2}},n+3);
 await f.store.report({...report('mac',n+4),generation:2,checkpoint:{...report('mac',n+4).checkpoint,generation:2}},n+4);
 const back=await f.store.transition({...transition(),expectedGeneration:2,executorFrom:'vps',executorTo:'mac'},n+4);
 assert.equal((await f.authorize('vps',2)).allowed,false);assert.equal((await f.authorize('mac',3)).allowed,false);
 await f.store.report({...report('mac',n+5),generation:3,serviceState:'running',leaseReceiptId:back.activationReceipt.receiptId},n+5);assert.equal((await f.authorize('mac',3)).allowed,true);
});
test('bridge handler reauthorizes each turn; demoted process cannot call Codex',async()=>{
 const f=fixture(),n=Date.now();await f.store.bootstrap(seed(n),n);await f.store.report(report('vps',n),n);
 let calls=0;const events=[];const appServer={nextRequestId(){calls++;throw Error('synthetic reached Codex boundary');},onNotification(){return ()=>{};}};
 const turn=()=>handleDashboardTurnRequest({executorEnv:f.identity('mac',1),fetchImpl:f.fetchImpl,appServer,request:{threadId:'synthetic',text:'test'},sendDashboardEvent:async e=>events.push(e)}).catch(()=>{});
 await turn();assert.ok(calls>0);const before=calls;await f.store.transition(transition(),n);await turn();assert.equal(calls,before);assert.equal(events.at(-1).status,'executor_fenced');
});
test('runner refuses before preflight, queue claim or GitHub call when standby or config absent',async()=>{
 const f=fixture(),n=Date.now();await f.store.bootstrap(seed(n),n);await f.store.report(report('vps',n),n);
 let calls=0;const options={env:f.identity('vps',1),executorFetch:f.fetchImpl,githubFetch:async()=>{calls++;throw Error('must not call');},run:async()=>{calls++;throw Error('must not run');}};
 assert.equal((await runVpsRunnerOnce(options)).reason,'executor_fenced');assert.equal(calls,0);
 assert.equal((await runVpsRunnerOnce({...options,env:{}})).reason,'executor_fenced');assert.equal(calls,0);
});
test('transport failure, malformed allow and missing config fail closed',async()=>{
 const f=fixture();for(const fetchImpl of [async()=>{throw Error('network');},async()=>({ok:true,json:async()=>({allowed:true})}),async()=>({ok:false})])assert.equal((await authorizeRuntimeExecutor({env:f.identity('mac',1),purpose:'dashboard_turn',fetchImpl})).allowed,false);
 assert.equal((await authorizeRuntimeExecutor({env:{},purpose:'dashboard_turn',fetchImpl:()=>{throw Error('must not fetch');}})).allowed,false);
});
test('socket admission denies before app-server selector can spawn',async()=>{
 const f=fixture();let socket,selected=0,signal;const sent=[];const delivered=new Promise(resolve=>{signal=resolve;});
 class Socket{constructor(){socket=this;this.events={};}addEventListener(k,fn){this.events[k]=fn;}send(text){sent.push(JSON.parse(text));signal();}}
 const connected=connectDashboardAppServerBridgeOnce({endpoint:'wss://example.com',token:'synthetic',executorEnv:f.identity('mac',1),fetchImpl:f.fetchImpl,WebSocketImpl:Socket,heartbeatMs:0,selectAppServerForRequest:async()=>{selected++;throw Error('must not select');}});
 socket.events.message({data:JSON.stringify({type:'app_server_turn_requested',threadId:'synthetic',text:'test'})});
 await delivered;assert.equal(selected,0);assert.equal(sent.at(-1).status,'executor_fenced');socket.events.close();await connected;
});
test('gateway transport cannot read executor control overview',async()=>{
 const f=fixture(),n=Date.now();await f.store.bootstrap(seed(n),n);
 const response=await f.fetchImpl('https://example.com/v2/executors/overview',{headers:{authorization:'Bearer synthetic'}});assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'dashboard_owner_required'});
});
test('current primary VPS may inspect an empty queue; admission is repeated before pickup',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {resolve}=await import('node:path');const dir=await mkdtemp(resolve(tmpdir(),'runner-fence-'));
 try{
 const f=fixture(),n=Date.now();await f.store.bootstrap(seed(n),n);await f.store.report(report('vps',n),n);const t=await f.store.transition(transition(),n);await f.store.report({...report('vps',n+1),generation:2,serviceState:'running',leaseReceiptId:t.activationReceipt.receiptId},n+1);
 let authorizations=0;
 const result=await runVpsRunnerOnce({env:{...f.identity('vps',2),VTDD_VPS_LOCAL_HELPER_QUEUE_DIR:dir+'/queue',VTDD_VPS_LOCAL_HELPER_QUEUE_LOG:dir+'/queue.log'},executorFetch:async(...args)=>{authorizations++;return f.fetchImpl(...args);},repoSyncPreflight:false,repositoryPolicies:[],githubFetch:async()=>[],workRoot:dir});
 assert.equal(result.ok,true);assert.match(result.message,/No pending/);assert.ok(authorizations>=2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('browser monitor admission rejects a different executor or generation before network',async()=>{
 const f=fixture();
 for(const expectedExecutor of [{executorId:'vps',generation:1},{executorId:'mac',generation:2}]) {
  const result=await authorizeRuntimeExecutor({env:f.identity('mac',1),purpose:'dashboard_turn',expectedExecutor,fetchImpl:()=>{throw Error('must not call');}});
  assert.equal(result.allowed,false);assert.equal(result.reason,'executor_monitor_identity_mismatch');
 }
});
