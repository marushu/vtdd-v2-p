#!/usr/bin/env node
// Explicit owner-supplied receipt only. Never discovers/adopts the current server generation.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, unlink, stat } from 'node:fs/promises';
import { validateLeaseReceipt } from '../src/core/executor-failover-state.js';
import { readPrivateJson, atomicPrivateJson } from './executor-private-file.mjs';
import { validateReporterConfig, resolveReporterToken } from './report-executor-node.mjs';
export async function applyExecutorLease({configPath, receiptPath, verify, now=Date.now()}) {
  const config=validateReporterConfig(await readPrivateJson(configPath));
  const receipt=validateLeaseReceipt(await readPrivateJson(receiptPath));
  if(receipt.executorTo!==config.executorId || receipt.previousGeneration!==config.generation || now>=Date.parse(receipt.expiresAt) || now<Date.parse(receipt.issuedAt)-120000)throw Error('lease_target_generation_or_expiry_mismatch');
  // Same private lock as reporter: owner must stop reporter gracefully before explicit apply.
  const lock=await open(config.lockPath,'wx',0o600);const identity=await lock.stat();
  try {
    const confirm=verify ?? (async r=>{
      const token=await resolveReporterToken();
      const response=await fetch(new URL('/v2/executors/activation/verify',config.origin),{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(r)});
      if(!response.ok)throw Error('lease_not_verified');return response.json();
    });
    const result=await confirm(receipt);
    if(result.valid!==true || !result.receipt || Object.keys(receipt).some(k=>receipt[k]!==result.receipt[k]))throw Error('lease_not_verified');
    if(Date.now()>=Date.parse(receipt.expiresAt) && verify===undefined)throw Error('lease_expired');
    const current=await readPrivateJson(configPath);
    if(JSON.stringify(current)!==JSON.stringify(config))throw Error('local_config_changed');
    const next={...config,generation:receipt.generation,leaseReceiptId:receipt.receiptId};
    await atomicPrivateJson(configPath,next);return {applied:true,generation:next.generation,activationPending:true};
  } finally {
    const current=await stat(config.lockPath).catch(()=>null);
    if(current?.ino===identity.ino && current?.dev===identity.dev)await unlink(config.lockPath);
    await lock.close();
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2), at=k=>args[args.indexOf(k)+1];
 if(!args.includes('--config') || !args.includes('--receipt'))throw Error('explicit_private_config_and_receipt_required');
 applyExecutorLease({configPath:at('--config'),receiptPath:at('--receipt')}).then(()=>console.log('lease applied; activation pending heartbeat')).catch(()=>{console.error('lease apply failed (details redacted)');process.exitCode=1;});
}
