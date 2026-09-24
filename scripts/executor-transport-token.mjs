#!/usr/bin/env node
import { randomBytes, createHash } from 'node:crypto';
import { open, constants } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validTransportToken } from '../src/core/executor-transport-credential.js';
import { loadGatewayBearerTokenFromVault } from '../src/core/desktop-bootstrap-vault.js';
const digest = token => 'sha256:' + createHash('sha256').update(token).digest('hex');
export async function readTransportToken(path) {
  if (!isAbsolute(path || '')) throw Error('absolute_private_path_required');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || (info.mode & 0o777) !== 0o600 || info.size !== 64 || info.uid !== process.getuid?.()) throw Error('private_transport_file_required');
    const token = await file.readFile('utf8');
    if (!validTransportToken(token)) throw Error('invalid_transport_file');
    return token;
  } finally { await file.close(); }
}
export async function generateTransportToken(path) {
  if (!isAbsolute(path || '')) throw Error('absolute_private_path_required');
  // Exclusive create: rekey uses a new path and cannot destroy the working credential.
  const file = await open(path, 'wx', 0o600);
  try {
    const token = randomBytes(32).toString('hex');
    await file.chmod(0o600); await file.writeFile(token); await file.sync();
    return {path,digest:digest(token)};
  } finally { await file.close(); }
}
export async function executorTransportAuthorization(config, {token,env=process.env,loadVault=loadGatewayBearerTokenFromVault}={}) {
  if (config.transportTokenPath !== undefined) return 'Executor ' + await readTransportToken(config.transportTokenPath);
  let bearer=token || env.VTDD_GATEWAY_BEARER_TOKEN;
  if (!bearer) { const result=await loadVault({manifestPath:env.VTDD_VAULT_MANIFEST_PATH}); if(result.ok) bearer=result.gateway?.bearerToken; }
  if (!bearer) throw Error('executor_transport_unavailable');
  return 'Bearer ' + bearer;
}
export async function runTransportHelper(args=process.argv.slice(2)) {
  if (args.length !== 2 || !['--generate','--digest'].includes(args[0])) throw Error('usage');
  const result = args[0] === '--generate' ? await generateTransportToken(args[1]) : {path:args[1],digest:digest(await readTransportToken(args[1]))};
  process.stdout.write(JSON.stringify(result)+'\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runTransportHelper().catch(()=>{process.stderr.write('executor transport helper failed (details redacted)\n');process.exitCode=1;});
