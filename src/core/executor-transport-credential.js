import { ExecutorInputError, strictObject } from './executor-failover-state.js';
export const validTransportToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const validTransportDigest = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
export async function transportTokenDigest(token) {
  if (!validTransportToken(token)) throw new ExecutorInputError('invalid_executor_transport', 403);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return 'sha256:' + Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export function transportEnrollmentScope(p) {
  strictObject(p, ['executorId','previousDigest','newDigest','issueNumber','targetConfirmed','approvalGrantId','highRiskKind','policyInput']);
  if (p.policyInput !== undefined) {
    strictObject(p.policyInput,['actionType','highRiskKind']);
    if (p.policyInput.actionType !== 'destructive' || p.policyInput.highRiskKind !== 'executor_transport_enroll') throw new ExecutorInputError('invalid_transport_policy');
  }
  if (p.highRiskKind !== undefined && p.highRiskKind !== 'executor_transport_enroll') throw new ExecutorInputError('invalid_transport_policy');
  if (!['mac','vps'].includes(p.executorId) || !Number.isSafeInteger(p.issueNumber) || p.issueNumber < 1 || p.targetConfirmed !== true || !validTransportDigest(p.newDigest) || !(p.previousDigest === '' || validTransportDigest(p.previousDigest)) || p.newDigest === p.previousDigest) throw new ExecutorInputError('invalid_transport_enrollment');
  return {actionType:'destructive',highRiskKind:'executor_transport_enroll',issueNumber:String(p.issueNumber),executorId:p.executorId,executorTransportDigest:p.newDigest,executorPreviousTransportDigest:p.previousDigest};
}
export function verifyTransportDigest(envelope, executorId, digest) {
  if (!validTransportDigest(digest) || !['mac','vps'].includes(executorId) || envelope.transports?.[executorId]?.digest !== digest) throw new ExecutorInputError('executor_transport_rejected', 403);
}
export const transportEnrollmentStatus = envelope => Object.fromEntries(['mac','vps'].map(id => [id,!!envelope.transports?.[id]?.digest]));
