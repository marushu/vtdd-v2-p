#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateNodeReport, exactVersion } from '../src/core/executor-failover-state.js';
export function planCodexVersionSync(mac, vps, control, now = Date.now()) {
  control = control.overview ?? control;
  const fromAPI = (input, id) => {
    const wrapped = input.overview ?? input;
    const node = wrapped.nodes?.[id];
    if (!node) return validateNodeReport(input);
    const { receivedAt, role, heartbeatAgeSeconds, versionMatch, healthy, ...raw } = node;
    return validateNodeReport(raw);
  };
  mac = fromAPI(mac, 'mac'); vps = fromAPI(vps, 'vps');
  if (mac.executorId !== 'mac' || vps.executorId !== 'vps' || !exactVersion(control.approvedCodexVersion)) throw Error('invalid_version_inputs');
  const blockers = [];
  const age = now - Date.parse(mac.observedAt);
  if (!mac.appServerSmokeOk || age < -120000 || age > 120000 || mac.generation !== control.generation) blockers.push('fresh_mac_smoke_required');
  if (mac.codexVersion !== control.approvedCodexVersion) blockers.push('approved_version_update_requires_scoped_contract');
  return { issueNumber:control.relatedIssue ?? mac.checkpoint?.issueNumber ?? null, approvedCodexVersion:control.approvedCodexVersion, currentVersion:vps.codexVersion, targetVersion:mac.codexVersion, action:blockers.length ? 'blocked' : vps.codexVersion === mac.codexVersion ? 'none' : 'request_exact_version_approval', blockers, liveInvocation:'blocked_until_provider_bound_approval', executable:false, requiresScopedApproval:true, packageSpec: blockers.length ? null : {executorId:'vps',packageName:'@openai/codex',exactVersion:mac.codexVersion}, automatic:false };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mac,vps,control] = await Promise.all(process.argv.slice(2,5).map(async p=>JSON.parse(await readFile(p,'utf8'))));
  process.stdout.write(JSON.stringify(planCodexVersionSync(mac,vps,control),null,2)+'\n');
}
