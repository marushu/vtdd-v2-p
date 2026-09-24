#!/usr/bin/env node
import { signExecutorRequest } from './sign-executor-request.mjs';
import { readPrivateJson, atomicPrivateJson } from './executor-private-file.mjs';
import { loadGatewayBearerTokenFromVault } from '../src/core/desktop-bootstrap-vault.js';
import { readFile, open, unlink, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateNodeReport, validateCheckpoint, exactVersion, strictObject } from '../src/core/executor-failover-state.js';
const exec = promisify(execFile);
export function parseCodexVersion(text) {
  const m = String(text).trim().match(/^codex(?:-cli)?\s+(\S+)$/);
  if (!m || !exactVersion(m[1])) throw Error('invalid_codex_version');
  return m[1];
}
export function parseExecutorProcesses(text) {
  return String(text).split('\n').some(line => /(?:^|\/)codex(?:-app-server)?$/.test(line.trim())) ? 'running' : 'inactive';
}
export function parseGitCheckpoint(facts, config, now = Date.now()) {
  const headSha = facts.head.trim(), branch = facts.branch.trim();
  if (!branch || branch === 'HEAD') throw Error('detached_checkpoint');
  return { repository: config.repository, issueNumber: config.issueNumber ?? null, pullNumber: config.pullNumber ?? null, branch, baseRef: config.baseRef || 'main', headSha, dirty: facts.status.length > 0, unpushed: facts.ahead == null || !/^0\s*$/.test(facts.ahead), lastSuccessfulAction: 'local_read', nextSafeAction: 'owner_review', generation: config.generation, updatedAt: new Date(now).toISOString() };
}
export function projectNodeReport(config, facts, now = Date.now()) {
  const codexVersion = parseCodexVersion(facts.version);
  const smoke = facts.smoke;
  // Existing local smoke evidence only; reporter never starts an app-server.
  const smokeAge = now - Date.parse(smoke?.observedAt);
  const appServerSmokeOk = smoke?.codexVersion === codexVersion && smoke?.ok === true && smokeAge >= -120000 && smokeAge <= 120000;
  return validateNodeReport({ executorId: config.executorId, generation: config.generation, observedAt: new Date(now).toISOString(), heartbeatAt: new Date(now).toISOString(), codexVersion, appServerSmokeOk, serviceState: facts.serviceState || 'unknown', ...(config.leaseReceiptId ? {leaseReceiptId:config.leaseReceiptId} : {}), ...(facts.checkpoint ? {checkpoint:validateCheckpoint(facts.checkpoint)} : facts.git ? { checkpoint: parseGitCheckpoint(facts.git, config, now) } : {}) });
}
export function validateReporterConfig(c) {
  strictObject(c, ['executorId','generation','codexCommand','repoPath','repository','baseRef','issueNumber','pullNumber','origin','lockPath','smokeEvidencePath','serviceUnit','intervalSeconds','outputPath','checkpointPath','leaseReceiptId','identityKeyPath']);
  if (!['mac','vps'].includes(c.executorId) || !Number.isSafeInteger(c.generation) || c.generation < 1 || typeof c.codexCommand !== 'string' || !(c.codexCommand === 'codex' || isAbsolute(c.codexCommand))) throw Error('invalid_config');
  for (const k of ['repoPath','lockPath','smokeEvidencePath','outputPath','checkpointPath','identityKeyPath']) if (c[k] != null && !isAbsolute(c[k])) throw Error('absolute_private_path_required');
  if (!c.lockPath || (c.intervalSeconds != null && (!Number.isSafeInteger(c.intervalSeconds) || c.intervalSeconds < 30 || c.intervalSeconds > 3600))) throw Error('invalid_interval_or_lock');
  if (c.leaseReceiptId && !/^[a-f0-9-]{36}$/.test(c.leaseReceiptId)) throw Error('invalid_lease_receipt_id');
  if (c.serviceUnit && !/^[a-zA-Z0-9_.@-]+\.service$/.test(c.serviceUnit)) throw Error('invalid_service_unit');
  const url = new URL(c.origin); if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('invalid_origin');
  return c;
}
export async function collectNodeReport(c, run = async (cmd,args,opts={}) => (await exec(cmd,args,{ ...opts, shell:false, timeout:10000, maxBuffer:65536 })).stdout, now = Date.now()) {
  const facts = { version: await run(c.codexCommand,['--version']), serviceState: 'unknown' };
  if (c.smokeEvidencePath) { try { facts.smoke = JSON.parse(await readFile(c.smokeEvidencePath,'utf8')); } catch { /* Fail closed. */ } }
  try { facts.serviceState = parseExecutorProcesses(await run('ps',['-axo','comm='])); } catch { /* unknown */ }
  if (c.serviceUnit) {
    // Read only; no service control subcommands are accepted.
    try { const state = (await run('systemctl',['--user','show',c.serviceUnit,'--property=ActiveState','--value'])).trim(); facts.serviceState = state === 'active' || facts.serviceState === 'running' ? 'running' : state === 'inactive' ? facts.serviceState : 'unknown'; } catch { /* unknown */ }
  }
  if (c.checkpointPath) {
    try { facts.checkpoint = validateCheckpoint(await readPrivateJson(c.checkpointPath)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!facts.checkpoint && c.repoPath) {
    const git = args => run('git',['--no-optional-locks','-C',c.repoPath,...args], { env: { ...process.env, GIT_OPTIONAL_LOCKS:'0' } });
    let ahead = null;
    try { ahead = await git(['rev-list','--count','@{upstream}..HEAD']); } catch { /* No upstream is unsafe. */ }
    facts.git = { head:await git(['rev-parse','HEAD']), branch:await git(['rev-parse','--abbrev-ref','HEAD']), status:await git(['status','--porcelain']), ahead };
  }
  return projectNodeReport(c,facts,now);
}
export async function resolveReporterToken(env=process.env, loadVault=loadGatewayBearerTokenFromVault) {
  if(env.VTDD_GATEWAY_BEARER_TOKEN) return env.VTDD_GATEWAY_BEARER_TOKEN;
  const result=await loadVault({manifestPath:env.VTDD_VAULT_MANIFEST_PATH});
  if(!result.ok || !result.gateway?.bearerToken)throw Error('report_token_unavailable');
  return result.gateway.bearerToken;
}
export async function runReporter(args = process.argv.slice(2)) {
  const path = args[args.indexOf('--config')+1];
  if (!args.includes('--config') || !isAbsolute(path || '')) throw Error('absolute_private_config_required');
  const c = validateReporterConfig(await readPrivateJson(path));
  const lock = await open(c.lockPath,'wx',0o600); // Never delete an existing/stale lock.
  const lockIdentity = await lock.stat();
  try {
    do {
      const report = await collectNodeReport(c);
      if (c.outputPath) await atomicPrivateJson(c.outputPath,report);
      if (!args.includes('--output-only')) {
        const token = await resolveReporterToken();
        if (!token) throw Error('report_token_unavailable');
        const result = await fetch(new URL('/v2/executors/report',c.origin),{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(await signExecutorRequest(c,'report',report))});
        if (!result.ok) throw Error('report_rejected');
      }
      if (args.includes('--once')) break;
      await new Promise(r=>setTimeout(r,(c.intervalSeconds || (c.executorId === 'mac' ? 60 : 120))*1000));
    } while(true);
  } finally {
    const current = await stat(c.lockPath).catch(()=>null);
    if (current?.ino === lockIdentity.ino && current?.dev === lockIdentity.dev) await unlink(c.lockPath);
    await lock.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runReporter().catch(()=>{process.stderr.write('executor report failed (details redacted)\n');process.exitCode=1;});
