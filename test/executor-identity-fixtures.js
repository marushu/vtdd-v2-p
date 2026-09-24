import { generateKeyPairSync, sign, randomUUID, createHash } from 'node:crypto';
import { identityMessage } from '../src/core/executor-node-identity.js';
export function nodeKeys() {
  return Object.fromEntries(['mac','vps'].map(id=>{const pair=generateKeyPairSync('ed25519');return [id,{...pair,raw:pair.publicKey.export({format:'jwk'}).x.replace(/-/g,'+').replace(/_/g,'/')+'='}];}));
}
export const enrollment = (keys,id='mac',previousPublicKey='') => ({executorId:id,publicKey:keys[id].raw,previousPublicKey,issueNumber:858,targetConfirmed:true});
export function signed(keys,route,payload,now=Date.now()) {
 const identity={timestamp:new Date(now).toISOString(),nonce:randomUUID(),digest:createHash('sha256').update(JSON.stringify(payload)).digest('base64')};
 identity.signature=sign(null,Buffer.from(identityMessage(route,payload,identity)),keys[payload.executorId].privateKey).toString('base64');
 return {payload:structuredClone(payload),identity};
}
