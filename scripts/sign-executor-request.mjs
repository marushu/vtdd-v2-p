import { createPrivateKey, sign, randomUUID } from 'node:crypto';
import { readPrivateJson } from './executor-private-file.mjs';
import { bodyDigest, identityMessage } from '../src/core/executor-node-identity.js';
// The config contains a path, never raw key material in environment or argv.
export async function signExecutorRequest(config, route, payload, now=Date.now()) {
  const material = await readPrivateJson(config.identityKeyPath);
  const key = createPrivateKey({key:material,format:'jwk'});
  if (key.asymmetricKeyType !== 'ed25519') throw Error('ed25519_key_required');
  const identity = {timestamp:new Date(now).toISOString(),nonce:randomUUID(),digest:await bodyDigest(payload)};
  identity.signature = sign(null,Buffer.from(identityMessage(route,payload,identity)),key).toString('base64');
  return {payload,identity};
}
