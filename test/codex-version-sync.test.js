import test from 'node:test';
import assert from 'node:assert/strict';
import { planCodexVersionSync } from '../scripts/plan-codex-version-sync.mjs';
import { validateVersionExecutionRequest } from '../scripts/sync-codex-exact-version.mjs';
import { report,now,stamp } from './executor-failover-fixtures.js';
test('exact Mac-validated version only; never latest or automatic install',()=>{
 const control={generation:1,approvedCodexVersion:'1.2.3'},vps={...report('vps'),codexVersion:'1.2.2'};
 const p=planCodexVersionSync(report(),vps,control,now);assert.equal(p.action,'request_exact_version_approval');assert.deepEqual(p.command,['npm','install','-g','@openai/codex@1.2.3']);assert.equal(p.automatic,false);
 assert.equal(planCodexVersionSync(report(),report('vps'),control,now).action,'none');
 for(const mac of [{...report(),appServerSmokeOk:false},{...report(),codexVersion:'1.2.4'},{...report(),generation:2}])assert.equal(planCodexVersionSync(mac,vps,control,now).action,'blocked');
 assert.equal(planCodexVersionSync(report(),vps,control,now+121000).action,'blocked');
});
test('approval-shaped file cannot authorize a live package mutation',()=>{
 const p={packageName:'@openai/codex',issueNumber:858,executorId:'vps',exactVersion:'1.2.3',previousVersion:'1.2.2',expiresAt:stamp(now+60000),verified:true,approvalGrantId:'test-grant'};
 const result=validateVersionExecutionRequest(p,now);assert.equal(result.executable,false);assert.deepEqual(result.rollback,['npm','install','-g','@openai/codex@1.2.2']);
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
