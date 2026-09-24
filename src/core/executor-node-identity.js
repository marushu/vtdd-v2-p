import { ExecutorInputError, strictObject } from './executor-failover-state.js';
const reject = message => { throw new ExecutorInputError(message, 403); };
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export const identityMessage = (route, payload, proof) => JSON.stringify(['vtdd-executor-ed25519-v1', route, payload.executorId, payload.generation, proof.timestamp, proof.nonce, proof.digest]);
export async function bodyDigest(payload) {
  return encode(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload))));
}
export function enrollmentScope(p) {
  if (!['mac','vps'].includes(p.executorId) || !Number.isSafeInteger(p.issueNumber) || p.issueNumber < 1 || p.targetConfirmed !== true || !/^[A-Za-z0-9+/]{43}=$/.test(p.publicKey || '') || (p.previousPublicKey !== '' && !/^[A-Za-z0-9+/]{43}=$/.test(p.previousPublicKey || ''))) reject('invalid_node_enrollment');
  return {actionType:'destructive',highRiskKind:'executor_node_enroll',issueNumber:String(p.issueNumber),executorId:p.executorId,executorPublicKey:p.publicKey,executorPreviousPublicKey:p.previousPublicKey};
}
export async function verifyNodeRequest(envelope, route, input, now) {
  strictObject(input, ['payload','identity']);
  const {payload,identity:proof} = input;
  if (!payload || !['mac','vps'].includes(payload.executorId) || !Number.isSafeInteger(payload.generation) || payload.generation < 1 || !proof) reject('node_signature_required');
  strictObject(proof,['timestamp','nonce','digest','signature']);
  const timestamp = Date.parse(proof.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(now-timestamp)>120000 || !/^[a-f0-9-]{36}$/.test(proof.nonce || '')) reject('node_signature_stale_or_invalid');
  const publicKey = envelope.identities?.[payload.executorId];
  if (!publicKey) reject('node_not_enrolled');
  const replayKey = payload.executorId+':'+proof.nonce;
  const replays = Object.fromEntries(Object.entries(envelope.replays || {}).filter(([,expiry]) => expiry >= now));
  if (replays[replayKey]) reject('node_signature_replay');
  if (Object.keys(replays).length >= 4096) reject('node_replay_capacity');
  try {
    if (proof.digest !== await bodyDigest(payload)) reject('node_body_digest_mismatch');
    const key = await crypto.subtle.importKey('raw',decode(publicKey),{name:'Ed25519'},false,['verify']);
    if (!await crypto.subtle.verify('Ed25519',key,decode(proof.signature),new TextEncoder().encode(identityMessage(route,payload,proof)))) reject('node_signature_invalid');
  } catch { reject('node_signature_invalid'); }
  // Retain through the entire acceptance window, including future clock skew.
  replays[replayKey] = timestamp+120001;
  return {...envelope,replays};
}
