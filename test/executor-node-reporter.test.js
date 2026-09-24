import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCodexVersion, parseGitCheckpoint, projectNodeReport, validateReporterConfig, collectNodeReport } from '../scripts/report-executor-node.mjs';
import { now,stamp } from './executor-failover-fixtures.js';
const config={executorId:'mac',generation:1,codexCommand:'codex',lockPath:'/private/reporter.lock',origin:'https://example.com',repository:'sample/project',repoPath:'/private/project'};
test('generic config has no secret or arbitrary command fields',()=>{
 assert.equal(validateReporterConfig(config),config);
 for(const extra of [{token:'x'},{command:'rm'},{codexCommand:'codex --version'},{lockPath:'relative'},{origin:'https://user:secret@example.com'},{intervalSeconds:1}])assert.throws(()=>validateReporterConfig({...config,...extra}));
});
test('version and git parsers fail closed; missing upstream is unpushed',()=>{
 assert.equal(parseCodexVersion('codex-cli 1.2.3'),'1.2.3');assert.throws(()=>parseCodexVersion('codex-cli latest'));
 const facts={head:'a'.repeat(40),branch:'feature/test',status:'',ahead:'0\n'};
 assert.equal(parseGitCheckpoint(facts,config,now).unpushed,false);
 assert.equal(parseGitCheckpoint({...facts,ahead:null,status:'?? private\n'},config,now).dirty,true);
 assert.equal(parseGitCheckpoint({...facts,ahead:null},config,now).unpushed,true);
 assert.throws(()=>parseGitCheckpoint({...facts,branch:'HEAD'},config,now));
});
test('smoke evidence is version-bound and fresh; raw logs do not escape projection',()=>{
 const facts={version:'codex-cli 1.2.3',smoke:{codexVersion:'1.2.3',observedAt:stamp(now),ok:true},raw:'private'};
 assert.equal(projectNodeReport(config,facts,now).appServerSmokeOk,true);
 assert.equal(projectNodeReport(config,facts,now+121000).appServerSmokeOk,false);
 assert.equal(projectNodeReport(config,{...facts,version:'codex-cli 1.2.2'},now).appServerSmokeOk,false);
 assert.ok(!('raw' in projectNodeReport(config,facts,now)));
});
test('collector uses only fixed read commands, no shell, no server start, no git mutation',async()=>{
 const calls=[];const run=async(cmd,args)=>{calls.push([cmd,args]);if(cmd==='codex')return 'codex-cli 1.2.3';if(args.includes('--count'))throw Error('no upstream');if(args.includes('HEAD')&&!args.includes('--abbrev-ref'))return 'a'.repeat(40);if(args.includes('--abbrev-ref'))return 'feature';return '';};
 const r=await collectNodeReport(config,run,now);assert.equal(r.checkpoint.unpushed,true);assert.equal(r.appServerSmokeOk,false);assert.equal(calls.length,6);assert.doesNotMatch(JSON.stringify(calls),/app-server|checkout|reset|install|sudo/);
});
test('read-only process observation detects another running Codex',async()=>{
 const {parseExecutorProcesses}=await import('../scripts/report-executor-node.mjs');
 assert.equal(parseExecutorProcesses('/usr/bin/node\n/opt/tools/codex\n'),'running');
 assert.equal(parseExecutorProcesses('/usr/bin/node\n'),'inactive');
});
test('unknown current Issue stays null, never inherits implementation Issue858',()=>{
 assert.equal(parseGitCheckpoint({head:'a'.repeat(40),branch:'main',status:'',ahead:'0'},config,now).issueNumber,null);
});
