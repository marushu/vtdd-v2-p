#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strictObject, exactVersion } from '../src/core/executor-failover-state.js';
export function validateVersionExecutionRequest(p, now = Date.now()) {
  strictObject(p,['packageName','issueNumber','exactVersion','previousVersion','expiresAt','verified','approvalGrantId','executorId']);
  if (!Number.isSafeInteger(p.issueNumber) || p.issueNumber < 1 || p.packageName !== '@openai/codex' || p.executorId !== 'vps' || !exactVersion(p.exactVersion) || (p.previousVersion != null && !exactVersion(p.previousVersion)) || p.verified !== true || typeof p.approvalGrantId !== 'string' || !/^[\w:-]{1,160}$/.test(p.approvalGrantId) || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= now || Date.parse(p.expiresAt) > now+120000) throw Error('invalid_version_execution_request');
  // A file's verified marker is NOT real passkey evidence.
  return { valid:true, executable:false, shell:false, blockedReason:'provider_bound_version_sync_contract_missing', command:['npm','install','-g','@openai/codex@'+p.exactVersion], rollback:p.previousVersion ? ['npm','install','-g','@openai/codex@'+p.previousVersion] : null };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--apply')) throw Error('live_version_install_blocked');
  const path=process.argv[process.argv.indexOf('--request')+1];
  if (!process.argv.includes('--request')) throw Error('--request required (default --check)');
  process.stdout.write(JSON.stringify(validateVersionExecutionRequest(JSON.parse(await readFile(path,'utf8'))),null,2)+'\n');
}
