import test from 'node:test';
import assert from 'node:assert/strict';
import { planCodexVersionSync } from '../scripts/plan-codex-version-sync.mjs';
import { validateVersionExecutionRequest } from '../scripts/sync-codex-exact-version.mjs';
import { report,now,stamp } from './executor-failover-fixtures.js';
test('exact Mac-validated version only; never latest or automatic install',()=>{
 const control={generation:1,approvedCodexVersion:'1.2.3'},vps={...report('vps'),codexVersion:'1.2.2'};
 const p=planCodexVersionSync(report(),vps,control,now);assert.equal(p.action,'request_exact_version_approval');assert.deepEqual(p.packageSpec,{executorId:'vps',packageName:'@openai/codex',exactVersion:'1.2.3'});assert.equal(p.command,undefined);assert.equal(p.executable,false);assert.equal(p.requiresScopedApproval,true);assert.equal(p.automatic,false);
 assert.equal(planCodexVersionSync(report(),report('vps'),control,now).action,'none');
 for(const mac of [{...report(),appServerSmokeOk:false},{...report(),codexVersion:'1.2.4'},{...report(),generation:2}])assert.equal(planCodexVersionSync(mac,vps,control,now).action,'blocked');
 assert.equal(planCodexVersionSync(report(),vps,control,now+121000).action,'blocked');
});
test('approval-shaped file cannot authorize a live package mutation',()=>{
 const p={packageName:'@openai/codex',issueNumber:858,executorId:'vps',exactVersion:'1.2.3',previousVersion:'1.2.2',expiresAt:stamp(now+60000),verified:true,approvalGrantId:'test-grant'};
 const result=validateVersionExecutionRequest(p,now);assert.equal(result.executable,false);assert.deepEqual(result.rollbackSpec,{executorId:'vps',packageName:'@openai/codex',exactVersion:'1.2.2'});assert.deepEqual(result.packageSpec,{executorId:'vps',packageName:'@openai/codex',exactVersion:'1.2.3'});assert.equal(result.command,undefined);assert.equal(result.rollback,undefined);assert.equal(result.requiresScopedApproval,true);
 for(const patch of [{issueNumber:0},{executorId:'mac'},{exactVersion:'latest'},{verified:false},{expiresAt:stamp(now-1)},{shell:'true'},{token:'secret'}])assert.throws(()=>validateVersionExecutionRequest({...p,...patch},now));
});
test('planner accepts overview API JSON without retaining derived data',()=>{
 const api={generation:1,approvedCodexVersion:'1.2.3',nodes:{mac:{...report(),receivedAt:stamp(now),healthy:true,role:'PRIMARY'},vps:{...report('vps'),codexVersion:'1.2.2',receivedAt:stamp(now),role:'STANDBY'}}};
 assert.equal(planCodexVersionSync(api,{overview:api},{overview:api},now).action,'request_exact_version_approval');
});
test('installer request package name is exact; shell remains disabled and apply remains blocked',()=>{
 const input={packageName:'@openai/codex',issueNumber:42,executorId:'vps',exactVersion:'1.2.3',expiresAt:stamp(now+60000),verified:true,approvalGrantId:'test-grant'};
 assert.equal(validateVersionExecutionRequest(input,now).shell,false);
 for(const packageName of ['codex','@openai/codex@latest','@other/codex','@openai/codex;echo bad'])assert.throws(()=>validateVersionExecutionRequest({...input,packageName},now));
});
test('every pre-approval planner/checker outcome contains declarative specs only',()=>{
 const control={generation:1,approvedCodexVersion:'1.2.3'},request={packageName:'@openai/codex',issueNumber:858,executorId:'vps',exactVersion:'1.2.3',previousVersion:'1.2.2',expiresAt:stamp(now+60000),verified:true,approvalGrantId:'test-grant'};
 const outputs=[planCodexVersionSync(report(),{...report('vps'),codexVersion:'1.2.2'},control,now),planCodexVersionSync(report(),report('vps'),control,now),planCodexVersionSync({...report(),appServerSmokeOk:false},report('vps'),control,now),validateVersionExecutionRequest(request,now),validateVersionExecutionRequest({...request,previousVersion:null},now)];
 for(const result of outputs){assert.equal(result.executable,false);assert.equal(result.requiresScopedApproval,true);assert.equal(result.command,undefined);assert.equal(result.rollback,undefined);assert.doesNotMatch(JSON.stringify(result),/"npm"|"install"|"-g"|@openai\/codex@|latest/);if(result.packageSpec){assert.equal(result.packageSpec.executorId,'vps');assert.equal(result.packageSpec.exactVersion,'1.2.3');}}
 assert.equal(outputs[2].packageSpec,null);assert.equal(outputs[4].rollbackSpec,null);
 for(const patch of [{executorId:'mac'},{exactVersion:'latest'},{previousVersion:'latest'}])assert.throws(()=>validateVersionExecutionRequest({...request,...patch},now));
});
test('check CLI emits specs while apply CLI stays blocked without mutation',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('node:child_process');const dir=await mkdtemp(join(tmpdir(),'version-spec-'));
 try{const path=join(dir,'request.json');await writeFile(path,JSON.stringify({packageName:'@openai/codex',issueNumber:858,executorId:'vps',exactVersion:'1.2.3',expiresAt:new Date(Date.now()+60000).toISOString(),verified:true,approvalGrantId:'synthetic'}));
 const check=spawnSync(process.execPath,['scripts/sync-codex-exact-version.mjs','--request',path,'--check'],{encoding:'utf8'});assert.equal(check.status,0);assert.equal(JSON.parse(check.stdout).packageSpec.exactVersion,'1.2.3');
 const apply=spawnSync(process.execPath,['scripts/sync-codex-exact-version.mjs','--request',path,'--apply'],{encoding:'utf8'});assert.notEqual(apply.status,0);assert.match(apply.stderr,/live_version_install_blocked/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
