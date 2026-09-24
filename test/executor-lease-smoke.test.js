import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { atomicPrivateJson } from '../scripts/executor-private-file.mjs';
import { applyExecutorLease } from '../scripts/apply-executor-lease.mjs';
import { smokeAppServer } from '../scripts/smoke-executor-app-server.mjs';
import { bootstrapControl, applyNodeReport, transitionControl, verifyLeaseReceipt } from '../src/core/executor-failover-state.js';
import { collectNodeReport, resolveReporterToken } from '../scripts/report-executor-node.mjs';
import { seed,report,transition,now,stamp } from './executor-failover-fixtures.js';
async function temporary(fn){const dir=await mkdtemp(resolve(tmpdir(),'executor-test-'));try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('atomic private overwrite supports consecutive cycles and never exposes permissive mode',()=>temporary(async dir=>{
 const path=dir+'/report.json';await atomicPrivateJson(path,{n:1});await atomicPrivateJson(path,{n:2});assert.deepEqual(JSON.parse(await readFile(path)),{n:2});assert.equal((await stat(path)).mode&0o777,0o600);
}));
test('token resolution uses env then existing vault helper; tests never read real credentials',async()=>{
 let calls=0;const vault=async()=>{calls++;return {ok:true,gateway:{bearerToken:'synthetic'}};};
 assert.equal(await resolveReporterToken({VTDD_GATEWAY_BEARER_TOKEN:'env-test'},vault),'env-test');assert.equal(calls,0);
 assert.equal(await resolveReporterToken({},vault),'synthetic');assert.equal(calls,1);await assert.rejects(resolveReporterToken({},async()=>({ok:false})),/unavailable/);
});
test('private checkpoint can follow another repository; its work issue and timestamp are preserved',()=>temporary(async dir=>{
 const checkpoint={...report().checkpoint,repository:'other/project',issueNumber:42};await atomicPrivateJson(dir+'/checkpoint.json',checkpoint);
 const config={executorId:'mac',generation:1,codexCommand:'codex',checkpointPath:dir+'/checkpoint.json',repoPath:dir};const calls=[];
 const r=await collectNodeReport(config,async(cmd,args)=>{calls.push(cmd);return cmd==='codex'?'codex-cli 1.2.3':'';},now);
 assert.equal(r.checkpoint.repository,'other/project');assert.equal(r.checkpoint.issueNumber,42);assert.equal(r.checkpoint.updatedAt,stamp(now));assert.ok(!calls.includes('git'));
}));
test('explicit private lease apply requires server receipt verification, target, old generation and lock ownership',()=>temporary(async dir=>{
 const s=transitionControl(applyNodeReport(bootstrapControl(seed(),now),report('vps'),now),transition(),now);
 const config={executorId:'vps',generation:1,codexCommand:'codex',lockPath:dir+'/lock',origin:'https://example.com'};
 await atomicPrivateJson(dir+'/config',config);await atomicPrivateJson(dir+'/receipt',s.activationReceipt);
 const input={configPath:dir+'/config',receiptPath:dir+'/receipt',now,verify:async r=>verifyLeaseReceipt(s,r,now)};
 await assert.rejects(applyExecutorLease({...input,verify:async()=>({valid:true,receipt:{...s.activationReceipt,generation:9}})}));assert.deepEqual(JSON.parse(await readFile(dir+'/config')),config);
 await atomicPrivateJson(dir+'/lock',{pid:999999});await assert.rejects(applyExecutorLease(input),{code:'EEXIST'});assert.ok(await stat(dir+'/lock'));await rm(dir+'/lock');
 const result=await applyExecutorLease(input);assert.equal(result.activationPending,true);const next=JSON.parse(await readFile(dir+'/config'));assert.equal(next.generation,2);assert.equal(next.leaseReceiptId,s.activationReceipt.receiptId);await assert.rejects(applyExecutorLease(input),/mismatch/);
}));
for(const fail of [false,true])test('ephemeral initialize-only smoke '+(fail?'rejects protocol failure':'writes bounded success evidence'),async()=>{
 const sent=[];let killed=0;const c=new EventEmitter();c.stdout=new EventEmitter();c.stderr=new EventEmitter();c.stdin=new EventEmitter();c.stdin.end=()=>{};c.stdin.write=text=>{const message=JSON.parse(text);sent.push(message);if(message.method==='initialize')queueMicrotask(()=>c.stdout.emit('data',Buffer.from(JSON.stringify({id:1,...(fail?{error:{message:'private'}}:{result:{userAgent:'fake'}})})+'\n')));};c.kill=signal=>{killed++;queueMicrotask(()=>c.emit('close',null,signal));};
 const result=await smokeAppServer({codexCommand:'codex',now:()=>now,versionCommand:async(cmd,args,opts)=>{assert.deepEqual(args,['--version']);assert.equal(opts.shell,false);return {stdout:'codex-cli 1.2.3'};},spawnChild:(cmd,args,opts)=>{assert.deepEqual(args,['app-server']);assert.equal(opts.shell,false);return c;}});
 assert.equal(result.ok,!fail);assert.equal(killed,1);assert.deepEqual(sent.map(m=>m.method),fail?['initialize']:['initialize','initialized']);assert.doesNotMatch(JSON.stringify(result),/private|thread|userAgent/);
});
test('receipt tampering, expiry, wrong target cannot write private config',()=>temporary(async dir=>{
 const state=transitionControl(applyNodeReport(bootstrapControl(seed(),now),report('vps'),now),transition(),now);
 const config={executorId:'vps',generation:1,codexCommand:'codex',lockPath:dir+'/lock',origin:'https://example.com'};
 await atomicPrivateJson(dir+'/config',config);
 for(const receipt of [{...state.activationReceipt,generation:8},{...state.activationReceipt,executorFrom:'vps',executorTo:'mac'},{...state.activationReceipt,relatedIssue:42}]){
  await atomicPrivateJson(dir+'/receipt',receipt);await assert.rejects(applyExecutorLease({configPath:dir+'/config',receiptPath:dir+'/receipt',now,verify:async r=>verifyLeaseReceipt(state,r,now)}));assert.deepEqual(JSON.parse(await readFile(dir+'/config')),config);
 }
 await atomicPrivateJson(dir+'/receipt',state.activationReceipt);await assert.rejects(applyExecutorLease({configPath:dir+'/config',receiptPath:dir+'/receipt',now:now+600001,verify:async()=>{throw Error('must not call');}}),/expiry/);
}));
