#!/usr/bin/env node
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCodexVersion, validateReporterConfig } from './report-executor-node.mjs';
import { readPrivateJson, atomicPrivateJson } from './executor-private-file.mjs';
export async function smokeAppServer({codexCommand, spawnChild=spawn, versionCommand=promisify(execFile), now=Date.now, timeoutMs=10000}) {
  if(codexCommand!=='codex' && !String(codexCommand).startsWith('/'))throw Error('invalid_codex_command');
  const {stdout}=await versionCommand(codexCommand,['--version'],{shell:false,timeout:timeoutMs,maxBuffer:4096});
  const codexVersion=parseCodexVersion(stdout);
  const ok=await new Promise(resolveResult=>{
    const child=spawnChild(codexCommand,['app-server'],{shell:false,stdio:['pipe','pipe','pipe']});
    let buffer='', bytes=0, initialized=false, settled=false, stopping=false;
    const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);resolveResult(ok);};
    let killTimer;
    const stop=()=>{if(stopping||settled)return;stopping=true;killTimer=setTimeout(()=>{child.kill('SIGKILL');finish(false);},1000);child.stdin.end();child.kill('SIGTERM');};
    const timer=setTimeout(()=>{initialized=false;stop();},timeoutMs);
    child.on('error',()=>finish(false));
    child.stdin.on('error',()=>{initialized=false;stop();});
    child.on('close',(code,signal)=>finish(initialized && (code===0 || signal==='SIGTERM')));
    child.stderr.on('data',()=>{}); // Never persist raw stderr / credentials / messages.
    child.stdout.on('data',chunk=>{
      bytes+=chunk.length;if(bytes>16384){initialized=false;stop();return;}
      buffer+=chunk.toString();let index;
      while((index=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,index);buffer=buffer.slice(index+1);
        try {const response=JSON.parse(line);if(response.id===1){
          if(response.error || !response.result || typeof response.result!=='object'){stop();return;}
          initialized=true;child.stdin.write(JSON.stringify({method:'initialized'})+'\n');stop();return;
        }}catch { /* Bounded non-JSON diagnostic lines do not constitute success. */ }
      }
    });
    child.stdin.write(JSON.stringify({id:1,method:'initialize',params:{clientInfo:{name:'vtdd-executor-smoke',version:'1.0.0'},capabilities:{experimentalApi:true}}})+'\n');
  });
  return {codexVersion,observedAt:new Date(now()).toISOString(),ok};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2);const path=args[args.indexOf('--config')+1];
 (async()=>{if(!args.includes('--config'))throw Error('private_config_required');const c=validateReporterConfig(await readPrivateJson(path));if(!c.smokeEvidencePath)throw Error('smoke_evidence_path_required');const result=await smokeAppServer(c);await atomicPrivateJson(c.smokeEvidencePath,result);if(!result.ok)process.exitCode=1;})().catch(()=>{console.error('app-server smoke failed (details redacted)');process.exitCode=1;});
}
