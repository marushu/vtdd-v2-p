import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { createInMemoryExecutorStore, executorApprovalScope } from '../src/core/executor-failover-state.js';
import { createInMemoryDashboardMonitorStore } from '../src/core/dashboard-monitor-state.js';
import { evaluateApprovalGrant, normalizeScopeSnapshot } from '../src/core/passkey-approval.js';
import { renderExecutorOperatorPage } from '../src/core/executor-operator-page.js';
import { report,seed,transition } from './executor-failover-fixtures.js';
function fixture(){
 const grants=[];
 const env={VTDD_DASHBOARD_ALLOWED_EMAILS:'owner@example.com',CF_ACCESS_JWT_VERIFIER:async()=>({ok:true,payload:{email:'owner@example.com',exp:4102444800}}),VTDD_GATEWAY_BEARER_TOKEN:'test-token',EXECUTOR_STORE:createInMemoryExecutorStore(),DASHBOARD_MONITOR_STORE:createInMemoryDashboardMonitorStore(),MEMORY_PROVIDER:{async query(){return grants;},async retrieve(){return grants;},async store(){},validateRecord(){return {ok:true};}}};
 const request=(path,body,auth=true)=>worker.fetch(new Request('https://example.com'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',origin:'https://example.com',...(auth?(path.includes('/executors/report')?{authorization:'Bearer test-token'}:{'cf-access-authenticated-user-email':'owner@example.com','cf-access-jwt-assertion':'synthetic'}):{})},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),env);
 const grant=(scope,id='grant')=>{grants.splice(0,grants.length,{id,content:{kind:'passkey_grant',status:'verified',expiresAt:new Date(Date.now()+60000).toISOString(),scope}});};
 return {env,request,grant};
}
test('routes enforce authentication and first-report-no-bootstrap, include home overview',async()=>{
 const {request,env}=fixture();
 for(const [path,body] of [['overview',null],['report',report()],['transition',transition()],['bootstrap',{}]])assert.equal((await request('/v2/executors/'+path,body,false)).status,401);
 assert.equal((await request('/v2/executors/report',report('mac',Date.now()))).status,202);
 assert.equal((await (await request('/v2/executors/overview')).json()).initialized,false);
 assert.equal((await (await request('/v2/dashboard/overview')).json()).executors.initialized,false);
 env.VTDD_DASHBOARD_ALLOWED_EMAILS='owner@example.com';env.CF_ACCESS_JWT_VERIFIER=async()=>({ok:true,payload:{email:'owner@example.com',exp:4102444800}});
 const r=await worker.fetch(new Request('https://example.com/v2/executors/report',{method:'POST',headers:{'cf-access-authenticated-user-email':'owner@example.com','cf-access-jwt-assertion':'test'},body:JSON.stringify(report())}),env);assert.equal(r.status,401);
 assert.equal((await request('/v2/executors/report','x'.repeat(17000))).status,413);
});
test('real provider-scoped bootstrap, transition CAS, and no merge authority',async()=>{
 const {request,grant,env}=fixture(),n=Date.now();
 await request('/v2/executors/report',report('mac',n));
 const b={executorFrom:'vps',executorTo:'mac',expectedGeneration:0,issueNumber:858,targetConfirmed:true,approvedCodexVersion:'1.2.3',approvalGrantId:'grant'};
 assert.equal((await request('/v2/executors/bootstrap',b)).status,403);
 grant(executorApprovalScope(b,true));
 assert.equal((await request('/v2/executors/bootstrap',b)).status,200);
 assert.equal((await request('/v2/executors/bootstrap',b)).status,409);
 assert.equal((await request('/v2/executors/report',report('vps',Date.now()))).status,200);
 const t={...transition(),approvalGrantId:'grant'};
 // Bootstrap grants must not authorize a transition.
 assert.equal((await request('/v2/executors/transition',t)).status,403);
 grant({...executorApprovalScope(t),executorGeneration:'2'});assert.equal((await request('/v2/executors/transition',t)).status,403);
 grant(executorApprovalScope(t));
 const results=await Promise.all([request('/v2/executors/transition',t),request('/v2/executors/transition',t)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const result=await results.find(r=>r.status===200).json();assert.equal(result.authority,'executor_control_state_only');assert.equal(result.overview.generation,2);
 assert.equal((await env.EXECUTOR_STORE.get()).primaryExecutor,'vps');
 const g={verified:true,expiresAt:new Date(Date.now()+60000).toISOString(),scope:executorApprovalScope(t)};
 assert.equal(evaluateApprovalGrant({approvalGrant:g,scope:{actionType:'merge',highRiskKind:'pull_merge'}}).ok,false);
});
test('forged grants, chat phrases, unknown fields and invalid expiry cannot authorize',async()=>{
 const {request,grant,env}=fixture();const n=Date.now();await env.EXECUTOR_STORE.bootstrap(seed(n),n);await env.EXECUTOR_STORE.report(report('vps',n),n);
 for(const patch of [{approvalGrant:{verified:true}},{passkey:'GO'},{shell:'echo'},{targetConfirmed:false},{issueNumber:0}])assert.notEqual((await request('/v2/executors/transition',{...transition(),...patch})).status,200);
 grant(executorApprovalScope(transition()));
 const records=await env.MEMORY_PROVIDER.query();records[0].content.expiresAt='invalid';
 assert.equal((await request('/v2/executors/transition',{...transition(),approvalGrantId:'grant'})).status,403);
});
test('executor scope normalization and mismatches retain all authority dimensions',()=>{
 const scope=executorApprovalScope(transition()), normalized=normalizeScopeSnapshot(scope);
 assert.equal(normalized.executorGeneration,'1');
 for(const patch of [{executorFrom:'vps'},{executorTo:'mac'},{executorGeneration:'2'},{issueNumber:'1'},{highRiskKind:'executor_failover_bootstrap'}]) assert.equal(evaluateApprovalGrant({approvalGrant:{verified:true,expiresAt:new Date(Date.now()+60000).toISOString(),scope},scope:{...scope,...patch}}).ok,false);
 const bootstrap={...transition(),executorFrom:'vps',executorTo:'mac',expectedGeneration:0,approvedCodexVersion:'1.2.3'};
 assert.notDeepEqual(normalizeScopeSnapshot(executorApprovalScope(bootstrap,true)),normalizeScopeSnapshot(executorApprovalScope({...bootstrap,approvedCodexVersion:'1.2.2'},true)));
});
test('dedicated operator mode has only same-origin executor dispatch, bounded displayed scope',async()=>{
 const {request}=fixture();const response=await request('/v2/approval/passkey/operator?mode=failover&executorFrom=mac&executorTo=vps&executorGeneration=1&issueNumber=858');
 assert.equal(response.status,200);const text=await response.text();assert.match(text,/MAC → VPS · generation 1/);assert.match(text,/Issue #858/);assert.match(text,/navigator.credentials.get/);assert.doesNotMatch(text,/dispatchProductionDeploy|\/action\/github|\/action\/merge/);
 assert.doesNotMatch(renderExecutorOperatorPage({executorFrom:'<script>',executorGeneration:'<script>'}),/<script>.*<script>/s);
 assert.equal((await request('/v2/approval/passkey/operator?mode=failover',null,false)).status,401);
});
test('approval challenge refuses invalid executor scope before generating a session',async()=>{
 const {request}=fixture();
 for(const patch of [{expectedGeneration:0},{executorFrom:'unknown'},{targetConfirmed:false},{issueNumber:0}]){
  const r=await request('/v2/approval/passkey/challenge',{...transition(),...patch,highRiskKind:'executor_failover',policyInput:{actionType:'destructive',highRiskKind:'executor_failover'}});assert.equal(r.status,422);
 }
});
test('operator browser performs one WebAuthn and dispatches only scoped transition',async()=>{
 const vm=await import('node:vm');const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:''});return nodes.get(id);};
 const calls=[];let assertions=0;
 const html=renderExecutorOperatorPage({executorFrom:'mac',executorGeneration:'7',issueNumber:'858'});
 const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const config='));
 vm.runInNewContext(script,{document:{getElementById:get},Uint8Array,atob,btoa,Error,JSON,navigator:{credentials:{async get(){assertions++;return {id:'test',rawId:new Uint8Array([1]).buffer,type:'public-key',getClientExtensionResults:()=>({}),response:{authenticatorData:new Uint8Array([1]).buffer,clientDataJSON:new Uint8Array([1]).buffer,signature:new Uint8Array([1]).buffer,userHandle:null}};}}},fetch:async(path,options)=>{
  const body=JSON.parse(options.body);calls.push({path,body});
  return {ok:true,json:async()=>path.endsWith('/challenge')?{sessionId:'session',optionsJSON:{challenge:'YQ',allowCredentials:[{id:'YQ'}]}}:path.endsWith('/verify')?{approvalGrant:{approvalId:'real-provider-id'}}:{ok:true}};
 }});
 await get('approve').onclick();assert.equal(assertions,1);assert.deepEqual(calls.map(c=>c.path),['/v2/approval/passkey/challenge','/v2/approval/passkey/verify','/v2/executors/transition']);assert.equal(calls[2].body.expectedGeneration,7);assert.equal(calls[2].body.issueNumber,858);assert.equal(calls[2].body.approvalGrantId,'real-provider-id');assert.match(get('status').textContent,/activation pending/);
});
test('merge and deploy grants cannot transition; executor grant cannot authorize either',async()=>{
 const {env,request,grant}=fixture(),n=Date.now();await env.EXECUTOR_STORE.bootstrap(seed(n),n);await env.EXECUTOR_STORE.report(report('vps',n),n);
 for(const action of [{actionType:'merge',highRiskKind:'pull_merge'},{actionType:'deploy_production',highRiskKind:'deploy_production'}]){
  grant({...executorApprovalScope(transition()),...action});assert.equal((await request('/v2/executors/transition',{...transition(),approvalGrantId:'grant'})).status,403);
  assert.equal(evaluateApprovalGrant({approvalGrant:{verified:true,expiresAt:new Date(n+60000).toISOString(),scope:executorApprovalScope(transition())},scope:action}).ok,false);
 }
});
test('machine-stored candidate replaces JSON upload and operational Issue is generic',async()=>{
 const {request,grant}=fixture(),n=Date.now();
 await request('/v2/executors/report',{...report('mac',n),checkpoint:{...report('mac',n).checkpoint,issueNumber:42}});
 const view=await (await request('/v2/executors/overview')).json();assert.equal(view.initialized,false);assert.equal(view.bootstrapCandidate.executorId,'mac');
 const b={executorFrom:'vps',executorTo:'mac',expectedGeneration:0,issueNumber:42,targetConfirmed:true,approvedCodexVersion:'1.2.3',approvalGrantId:'grant'};grant(executorApprovalScope(b,true));assert.equal((await request('/v2/executors/bootstrap',b)).status,200);
 const page=await (await request('/v2/approval/passkey/operator?mode=failover-bootstrap&executorFrom=vps&executorGeneration=0&issueNumber=42')).text();assert.doesNotMatch(page,/type="file"|\/dashboard\/home|passkey\/options/);assert.match(page,/Issue #42/);
});
test('unrelated approval scope normalization remains byte-compatible',()=>{
 const source={actionType:'merge',highRiskKind:'pull_merge',repositoryInput:'sample/project',issueNumber:'42',pullNumber:'9'};
 const expected={actionType:'merge',highRiskKind:'pull_merge',repositoryInput:'sample/project',issueNumber:'42',pullNumber:'9',relatedIssue:'',phase:'',secretName:'',variableName:'',vpsProposalId:'',vpsHost:'',vpsOperation:'',vpsCapabilityId:'',vpsImpactScope:'',vpsExpiresAt:''};
 assert.equal(JSON.stringify(normalizeScopeSnapshot(source)),JSON.stringify(expected));
 assert.equal(JSON.stringify(normalizeScopeSnapshot({...source,executorGeneration:'9'})),JSON.stringify(expected));
});
test('canonical authentication helper produces exactly the existing assertion JSON',async()=>{
 const vm=await import('node:vm');const {passkeyAuthenticationScript}=await import('../src/core/passkey-browser-authentication.js');
 const context={Uint8Array,atob,btoa};vm.createContext(context);vm.runInContext(passkeyAuthenticationScript,context);
 const bytes=new Uint8Array([255,254,1]).buffer;
 const encoded=context.encodeAuthenticationAssertion({id:'test',rawId:bytes,type:'public-key',response:{authenticatorData:bytes,clientDataJSON:bytes,signature:bytes,userHandle:null},getClientExtensionResults:()=>({unused:true})});
 assert.equal(JSON.stringify(encoded),JSON.stringify({id:'test',rawId:'__4B',type:'public-key',response:{authenticatorData:'__4B',clientDataJSON:'__4B',signature:'__4B',userHandle:null}}));assert.deepEqual([...context.decodeAuthenticationOptions({challenge:'YQ'}).challenge],[97]);
});
test('scoped exact-version approval changes only approved version and rechecks current Mac candidate',async()=>{
 const {executorVersionScope}=await import('../src/core/executor-failover-state.js');const {request,grant,env}=fixture(),n=Date.now();await env.EXECUTOR_STORE.bootstrap(seed(n),n);
 await env.EXECUTOR_STORE.report({...report('mac',n+1),codexVersion:'1.2.4'},n+1);
 const body={issueNumber:42,executorFrom:'mac',executorTo:'mac',expectedGeneration:1,targetConfirmed:true,approvedCodexVersion:'1.2.4',previousCodexVersion:'1.2.3',approvalGrantId:'grant'};
 assert.equal((await request('/v2/executors/version',body)).status,403);
 grant(executorApprovalScope(transition()));assert.equal((await request('/v2/executors/version',body)).status,403);
 grant({...executorVersionScope(body),executorCodexVersion:'1.2.5'});assert.equal((await request('/v2/executors/version',body)).status,403);
 grant(executorVersionScope(body));const before=await env.EXECUTOR_STORE.get();const response=await request('/v2/executors/version',body);assert.equal(response.status,200);const result=await response.json();assert.equal(result.authority,'approved_codex_version_only');assert.equal(result.leaseReceipt,undefined);assert.deepEqual(await env.EXECUTOR_STORE.get(),{...before,approvedCodexVersion:'1.2.4'});
 assert.equal((await request('/v2/executors/version',body)).status,409);
 const next={...body,previousCodexVersion:'1.2.4',approvedCodexVersion:'1.2.5'};grant(executorVersionScope(next));assert.equal((await request('/v2/executors/version',next)).status,409);
});
test('version operator displays exact scope and uses a single passkey to update only version',async()=>{
 const vm=await import('node:vm');const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:''});return nodes.get(id);};
 const calls=[];let assertions=0;const html=renderExecutorOperatorPage({mode:'executor-version',executorFrom:'mac',executorGeneration:'7',issueNumber:'42',approvedCodexVersion:'1.2.4',previousCodexVersion:'1.2.3'});assert.match(html,/1.2.3 → 1.2.4/);
 const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const config='));
 vm.runInNewContext(script,{document:{getElementById:get},Uint8Array,atob,btoa,Error,JSON,navigator:{credentials:{async get(){assertions++;return {id:'test',rawId:new Uint8Array([1]).buffer,type:'public-key',response:{authenticatorData:new Uint8Array([1]).buffer,clientDataJSON:new Uint8Array([1]).buffer,signature:new Uint8Array([1]).buffer,userHandle:null}};}}},fetch:async(path,options)=>{const body=JSON.parse(options.body);calls.push({path,body});return {ok:true,json:async()=>path.endsWith('/challenge')?{sessionId:'session',optionsJSON:{challenge:'YQ'}}:path.endsWith('/verify')?{approvalGrant:{approvalId:'provider-grant'}}:{ok:true}};}});
 await get('approve').onclick();assert.equal(assertions,1);assert.deepEqual(calls.map(c=>c.path),['/v2/approval/passkey/challenge','/v2/approval/passkey/verify','/v2/executors/version']);assert.equal(calls[0].body.highRiskKind,'executor_failover_version');assert.equal(calls[2].body.approvedCodexVersion,'1.2.4');assert.equal(calls[2].body.expectedGeneration,7);
});
