import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, chmod, rm, symlink, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { generateTransportToken, readTransportToken, executorTransportAuthorization } from '../scripts/executor-transport-token.mjs';
import { transportTokenDigest } from '../src/core/executor-transport-credential.js';
import { validateReporterConfig,sendExecutorReport } from '../scripts/report-executor-node.mjs';
import { authorizeRuntimeExecutor } from '../scripts/executor-runtime-fence.mjs';
import { nodeKeys,enrollment } from './executor-identity-fixtures.js';
import { seed,report } from './executor-failover-fixtures.js';
import { createInMemoryExecutorStore } from '../src/core/executor-failover-state.js';
import worker from '../src/worker.js';
test('local helper exclusively creates 0600 random token; only digest/path escape; bad files fail closed',async()=>{
 const dir=await mkdtemp(tmpdir()+'/transport-test-'),path=dir+'/token';
 try{
 const {stdout,stderr}=await promisify(execFile)(process.execPath,['scripts/executor-transport-token.mjs','--generate',path]);
 const result=JSON.parse(stdout),token=await readFile(path,'utf8');assert.deepEqual(Object.keys(result).sort(),['digest','path']);assert.equal(stderr,'');assert.ok(!stdout.includes(token));assert.equal((await stat(path)).mode&0o777,0o600);assert.equal(result.digest,await transportTokenDigest(token));assert.equal(result.path,path);
 const second=await generateTransportToken(dir+'/other');assert.notEqual(result.digest,second.digest);
 await assert.rejects(generateTransportToken(path));assert.equal(await readTransportToken(path),token);
 const again=await promisify(execFile)(process.execPath,['scripts/executor-transport-token.mjs','--digest',path]);assert.deepEqual(JSON.parse(again.stdout),result);
 await symlink(path,dir+'/link');await assert.rejects(readTransportToken(dir+'/link'));
 await assert.rejects(readTransportToken('relative'));await chmod(path,0o644);await assert.rejects(readTransportToken(path));await chmod(path,0o600);
 await writeFile(path,'x'.repeat(64));await assert.rejects(readTransportToken(path));await writeFile(path,token+'\n');await assert.rejects(readTransportToken(path));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('reporter transport config prefers node file; never falls back on private-file failure; vault compatibility remains',async()=>{
 const dir=await mkdtemp(tmpdir()+'/transport-config-');try{
 const path=dir+'/token';await generateTransportToken(path);let reads=0;const loadVault=async()=>{reads++;return {ok:true,gateway:{bearerToken:'vault-fixture'}};};
 assert.equal(await executorTransportAuthorization({transportTokenPath:path},{env:{VTDD_GATEWAY_BEARER_TOKEN:'drift'},token:'old',loadVault}),'Executor '+await readTransportToken(path));assert.equal(reads,0);
 await assert.rejects(executorTransportAuthorization({transportTokenPath:dir+'/absent'},{token:'old',loadVault}));assert.equal(reads,0);
 assert.equal(await executorTransportAuthorization({},{env:{},loadVault}),'Bearer vault-fixture');assert.equal(reads,1);
 assert.equal(await executorTransportAuthorization({},{env:{VTDD_GATEWAY_BEARER_TOKEN:'legacy'},loadVault}),'Bearer legacy');
 const c={executorId:'mac',generation:1,codexCommand:'codex',origin:'https://example.com',lockPath:dir+'/lock',transportTokenPath:path};assert.equal(validateReporterConfig(c),c);assert.throws(()=>validateReporterConfig({...c,transportTokenPath:'relative'}));assert.throws(()=>validateReporterConfig({...c,transportToken:'secret'}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('fence uses node credential against actual Worker with drifted global token and denies old generation',async()=>{
 const dir=await mkdtemp(tmpdir()+'/transport-fence-');try{
 const keys=nodeKeys(),store=createInMemoryExecutorStore(),tokenPath=dir+'/token',identityKeyPath=dir+'/identity',configPath=dir+'/config';const {digest}=await generateTransportToken(tokenPath);
 await store.enroll(enrollment(keys));await store.enrollTransport({executorId:'mac',issueNumber:860,newDigest:digest,previousDigest:'',targetConfirmed:true});await store.bootstrap(seed(Date.now()));
 await writeFile(identityKeyPath,JSON.stringify(keys.mac.privateKey.export({format:'jwk'})),{mode:0o600});
 const config={executorId:'mac',generation:1,origin:'https://example.com',identityKeyPath,transportTokenPath:tokenPath};await writeFile(configPath,JSON.stringify(config),{mode:0o600});
 const env={VTDD_EXECUTOR_CONFIG_PATH:configPath,VTDD_GATEWAY_BEARER_TOKEN:'drift'};
 const fetchImpl=(url,init)=>worker.fetch(new Request(url,init),{EXECUTOR_STORE:store,VTDD_GATEWAY_BEARER_TOKEN:'working-shared'});
 await sendExecutorReport(config,report('mac',Date.now()+1),{env,fetchImpl});
 assert.equal((await authorizeRuntimeExecutor({purpose:'dashboard_turn',env,fetchImpl})).allowed,true);
 await writeFile(configPath,JSON.stringify({...config,generation:2}));assert.equal((await authorizeRuntimeExecutor({purpose:'dashboard_turn',env,fetchImpl})).allowed,false);
 await chmod(tokenPath,0o644);assert.equal((await authorizeRuntimeExecutor({purpose:'dashboard_turn',env,fetchImpl})).allowed,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
