import { transportEnrollmentScope, verifyTransportDigest, transportEnrollmentStatus } from './executor-transport-credential.js';
import { enrollmentScope, verifyNodeRequest } from './executor-node-identity.js';
// Issue #858: control-plane state only. Never starts/stops a runner.
export class ExecutorInputError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new ExecutorInputError(message, status); };
export const exactVersion = value => typeof value === 'string' && value.length <= 80 && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(value);
const nodeId = v => ['mac', 'vps'].includes(v);
const integer = v => Number.isSafeInteger(v) && v >= 1;
const time = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v) && Number.isFinite(Date.parse(v));
const safeText = v => typeof v === 'string' && v.length > 0 && v.length <= 120 && /^[A-Za-z0-9][A-Za-z0-9_.\/-]*$/.test(v) && !/(?:\.\.|\/\/|token|secret|password|credential|bearer|ghp_|github_pat_|sk-)/i.test(v);
export function strictObject(v, keys) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) fail('unexpected_fields');
  if (new TextEncoder().encode(JSON.stringify(v)).length > 16384) fail('payload_too_large', 413);
}
export function validateCheckpoint(v) {
  strictObject(v, ['repository','issueNumber','pullNumber','branch','baseRef','headSha','dirty','unpushed','lastSuccessfulAction','nextSafeAction','generation','updatedAt']);
  if (!safeText(v.repository) || !/^[\w.-]+\/[\w.-]+$/.test(v.repository) || !safeText(v.branch) || !safeText(v.baseRef) || !/^[a-f0-9]{40,64}$/.test(v.headSha) || typeof v.dirty !== 'boolean' || typeof v.unpushed !== 'boolean' || !integer(v.generation) || !time(v.updatedAt)) fail('invalid_checkpoint');
  for (const k of ['issueNumber','pullNumber']) if (v[k] != null && !integer(v[k])) fail('invalid_checkpoint');
  // Actions are bounded identifiers, never commands or conversation text.
  for (const k of ['lastSuccessfulAction','nextSafeAction']) if (!safeText(v[k]) || v[k].includes('/')) fail('invalid_checkpoint_action');
  return structuredClone(v);
}
export function validateNodeReport(v) {
  strictObject(v, ['executorId','generation','observedAt','heartbeatAt','codexVersion','appServerSmokeOk','serviceState','checkpoint','leaseReceiptId']);
  if (!nodeId(v.executorId) || !integer(v.generation) || !time(v.observedAt) || !time(v.heartbeatAt) || !exactVersion(v.codexVersion) || typeof v.appServerSmokeOk !== 'boolean' || !['running','standby','inactive','stopped','unknown'].includes(v.serviceState)) fail('invalid_node_report');
  if (v.leaseReceiptId !== undefined && !/^[a-f0-9-]{36}$/.test(v.leaseReceiptId)) fail('invalid_lease_receipt_id');
  if (v.checkpoint !== undefined) validateCheckpoint(v.checkpoint);
  return structuredClone(v);
}
export function validateControlState(s) {
  strictObject(s, ['primaryExecutor','standbyExecutor','generation','approvedCodexVersion','lastTransitionAt','transitionReason','nodes','checkpoint','activationPending','activationReceipt','relatedIssue']);
  if (!nodeId(s.primaryExecutor) || !nodeId(s.standbyExecutor) || s.primaryExecutor === s.standbyExecutor || !integer(s.generation) || !exactVersion(s.approvedCodexVersion) || !time(s.lastTransitionAt) || !safeText(s.transitionReason)) fail('invalid_control_state');
  if (s.activationPending !== undefined && typeof s.activationPending !== 'boolean') fail('invalid_activation');
  if (s.relatedIssue != null && !integer(s.relatedIssue)) fail('invalid_related_issue');
  if (s.activationReceipt) validateLeaseReceipt(s.activationReceipt);
  strictObject(s.nodes, ['mac','vps']);
  for (const [id, report] of Object.entries(s.nodes)) {
    const { receivedAt, ...raw } = report;
    validateNodeReport(raw);
    if (raw.executorId !== id || !time(receivedAt)) fail('invalid_stored_report');
  }
  if (s.checkpoint) validateCheckpoint(s.checkpoint);
  return structuredClone(s);
}
const age = (v, now) => Number.isFinite(Date.parse(v)) ? now - Date.parse(v) : Infinity;
const fresh = (v, now, limit) => age(v, now) >= -120000 && age(v, now) <= limit;
const matchingHandoff = (a, b) => !!a && !!b &&
  ['repository','branch','baseRef','headSha'].every(key => a[key] === b[key]) &&
  ['issueNumber','pullNumber'].every(key => (a[key] ?? null) === (b[key] ?? null));
export function executorOverview(s, now = Date.now()) {
  if (!s) return { initialized: false, ownerAction: '実行基盤は未初期化', nodes: {}, blockers: ['未初期化'], ready: false };
  const nodes = {};
  for (const id of ['mac','vps']) {
    const r = s.nodes[id];
    const limit = id === 'mac' ? 120000 : 300000;
    nodes[id] = { ...r, role: s.primaryExecutor === id ? 'PRIMARY' : 'STANDBY', heartbeatAgeSeconds: r ? Math.max(0, Math.floor(age(r.heartbeatAt, now)/1000)) : null, versionMatch: r?.codexVersion === s.approvedCodexVersion,
      healthy: !!r && fresh(r.heartbeatAt, now, limit) && fresh(r.receivedAt, now, limit) && fresh(r.observedAt, now, limit) && r.generation === s.generation && r.appServerSmokeOk && (id === 'mac' && s.primaryExecutor === 'mac' || r.codexVersion === s.approvedCodexVersion) && !(s.activationPending && id === s.primaryExecutor) };
  }
  const versionApprovalPending = !!nodes.mac.healthy && nodes.mac.codexVersion !== s.approvedCodexVersion;
  const versionCandidate = versionApprovalPending ? nodes.mac.codexVersion : null;
  const target = nodes[s.standbyExecutor], blockers = [];
  if (s.activationPending) blockers.push('切替準備中 / activation pending');
  if (versionApprovalPending) blockers.push('Macの新しい版は承認待ち');
  if (!target.receivedAt || !fresh(target.heartbeatAt, now, s.standbyExecutor === 'mac' ? 120000 : 300000) || !fresh(target.receivedAt, now, 300000) || !fresh(target.observedAt, now, 300000)) blockers.push('待機側の報告が古い・未確認');
  if (!target.versionMatch) blockers.push('Codex版が不一致');
  if (!target.appServerSmokeOk) blockers.push('app-server確認失敗');
  if (target.generation !== s.generation) blockers.push('待機側の世代が不一致');
  if (!['standby','inactive','stopped'].includes(target.serviceState)) blockers.push('待機側の実行競合');
  if (target.checkpoint?.dirty) blockers.push('待機側に未コミットの変更あり');
  if (target.checkpoint?.unpushed) blockers.push('待機側に未pushの変更あり');
  const primary = nodes[s.primaryExecutor];
  const primaryFresh = fresh(primary.heartbeatAt, now, s.primaryExecutor === 'mac' ? 120000 : 300000) && fresh(primary.receivedAt, now, 300000) && fresh(primary.observedAt, now, 300000);
  const transitionMode = primaryFresh ? 'planned' : 'emergency';
  const cp = s.checkpoint;
  if (!cp || (primaryFresh && !fresh(cp.updatedAt, now, 600000))) blockers.push('checkpointが古い・未確認');
  if (cp?.dirty) blockers.push('未コミットの変更あり');
  if (cp?.unpushed) blockers.push('未pushの変更あり');
  if (cp?.generation !== s.generation) blockers.push('checkpointの世代が不一致');
  const targetCheckpoint = target.checkpoint;
  const checkpointSynchronized = !!targetCheckpoint && targetCheckpoint.dirty === false &&
    targetCheckpoint.unpushed === false && targetCheckpoint.generation === s.generation &&
    cp?.generation === s.generation && cp.dirty === false && cp.unpushed === false &&
    matchingHandoff(targetCheckpoint, cp) && (!primaryFresh || (
      fresh(targetCheckpoint.updatedAt, now, 600000) && fresh(cp.updatedAt, now, 600000) &&
      matchingHandoff(targetCheckpoint, primary.checkpoint)));
  if (!checkpointSynchronized) blockers.push('待機側checkpointの同期不一致・欠落（計画切替では鮮度も必要）');
  if (primaryFresh) {
    if (!['inactive','stopped','standby'].includes(primary.serviceState)) blockers.push(primary.serviceState === 'running' ? 'PRIMARYが実行中' : 'PRIMARYの停止確認が必要');
    const checkpoint = primary.checkpoint;
    if (!checkpoint || checkpoint.dirty || checkpoint.unpushed || checkpoint.generation !== s.generation || primary.generation !== s.generation || !fresh(checkpoint.updatedAt, now, 600000)) blockers.push('PRIMARYのclean・pushed・fresh checkpointが必要');
  } else if (!primary.heartbeatAt || !primary.receivedAt || age(primary.heartbeatAt, now) < 600000 || age(primary.receivedAt, now) < 600000 || age(primary.observedAt, now) < 600000) blockers.push('緊急切替にはPRIMARYの最終報告から10分以上必要');
  const ready = blockers.length === 0;
  const macHealthy = nodes.mac.healthy;
  const relatedIssue = s.relatedIssue ?? s.checkpoint?.issueNumber;
  return { ...structuredClone(s), initialized: true, transitionMode, primaryIsolationRequired: transitionMode === 'emergency', activationPending: !!s.activationPending, versionApprovalPending, versionCandidate, versionActionURL: versionApprovalPending && integer(relatedIssue) ? '/v2/approval/passkey/operator?mode=executor-version&executorFrom=mac&executorGeneration=' + s.generation + '&issueNumber=' + relatedIssue + '&approvedCodexVersion=' + encodeURIComponent(versionCandidate) + '&previousCodexVersion=' + encodeURIComponent(s.approvedCodexVersion) : null, fencingBoundary: 'ed25519_admission_only_external_effects_not_revocable', nodes, blockers, ready, standbyReady: checkpointSynchronized && !versionApprovalPending && target.healthy && ['standby','inactive','stopped'].includes(target.serviceState), checkpointFresh: !!cp && fresh(cp.updatedAt, now, 600000), ownerAction: s.activationPending ? '切替準備中 / activation pending · 対象のlease適用とheartbeatを待っています' : !macHealthy ? (ready ? 'Mac未確認 · 手動切替を承認できます' : 'Mac未確認 · ' + blockers.join('、')) : ready ? '手動切替を承認できます' : blockers.length === 1 && blockers[0] === 'PRIMARYが実行中' ? '通常稼働中です。計画切替にはPRIMARYをquiesce（仕事を止めて停止確認）してください' : blockers.join('、'), actionURL: ready && integer(relatedIssue) ? '/v2/approval/passkey/operator?mode=failover&executorFrom=' + s.primaryExecutor + '&executorTo=' + s.standbyExecutor + '&executorGeneration=' + s.generation + '&issueNumber=' + relatedIssue + '&transitionMode=' + transitionMode : null };
}
export function executorMayWrite(state, executorId, generation, now = Date.now()) {
  return !!state && state.primaryExecutor === executorId && state.generation === generation && executorOverview(state, now).nodes[executorId]?.healthy === true;
}
export function authorizeExecutor(state, input, now=Date.now()) {
  strictObject(input,['executorId','generation','purpose']);
  if (!nodeId(input.executorId) || !integer(input.generation) || !['dashboard_turn','vps_queue','vps_work'].includes(input.purpose)) fail('invalid_executor_authorization');
  if (!state) return {allowed:false,reason:'bootstrap_required'};
  return executorMayWrite(state,input.executorId,input.generation,now) ? {allowed:true,reason:'authorized'} : {allowed:false,reason:'executor_blocked'};
}
export function executorVersionScope(p) {
  if (!integer(p.issueNumber) || !integer(p.expectedGeneration) || p.targetConfirmed!==true || p.executorFrom!=='mac' || p.executorTo!=='mac' || !exactVersion(p.approvedCodexVersion) || !exactVersion(p.previousCodexVersion)) fail('invalid_version_scope');
  return {actionType:'destructive',highRiskKind:'executor_failover_version',issueNumber:String(p.issueNumber),executorFrom:'mac',executorTo:'mac',executorGeneration:String(p.expectedGeneration),executorCodexVersion:p.approvedCodexVersion,executorPreviousCodexVersion:p.previousCodexVersion};
}
export function approveExecutorVersion(s,p,now=Date.now()) {
  executorVersionScope(p);
  if (!s || s.generation!==p.expectedGeneration || s.approvedCodexVersion!==p.previousCodexVersion || s.activationPending) fail('version_generation_conflict',409);
  const mac=s.nodes.mac;
  if (!mac || mac.generation!==s.generation || mac.codexVersion!==p.approvedCodexVersion || !mac.appServerSmokeOk || !fresh(mac.receivedAt,now,120000) || !fresh(mac.observedAt,now,120000) || !fresh(mac.heartbeatAt,now,120000)) fail('fresh_mac_candidate_required',409);
  return validateControlState({...s,approvedCodexVersion:p.approvedCodexVersion});
}
export function applyNodeReport(s, input, now = Date.now()) {
  if (!s) fail('executor_not_initialized', 409);
  const r = validateNodeReport(input), receivedAt = new Date(now).toISOString();
  if (age(r.heartbeatAt, now) < -120000 || age(r.observedAt, now) < -120000 || (r.checkpoint && age(r.checkpoint.updatedAt, now) < -120000)) fail('future_report');
  const previous = s.nodes[r.executorId];
  if (previous && (Date.parse(r.observedAt) <= Date.parse(previous.observedAt) || r.generation < previous.generation)) fail('out_of_order_report', 409);
  const next = { ...s, nodes: { ...s.nodes, [r.executorId]: { ...r, receivedAt } } };
  if (s.activationPending && r.executorId === s.primaryExecutor && r.generation === s.generation && r.leaseReceiptId === s.activationReceipt?.receiptId && Date.parse(s.activationReceipt.expiresAt) > now && fresh(r.observedAt, now, 120000) && fresh(r.heartbeatAt, now, 120000) && r.serviceState === 'running' && r.appServerSmokeOk && r.codexVersion === s.approvedCodexVersion) next.activationPending = false;
  if (r.executorId === s.primaryExecutor && r.generation === s.generation && r.checkpoint) next.checkpoint = r.checkpoint;
  return validateControlState(next);
}
export function bootstrapControl(input, now = Date.now()) {
  strictObject(input, ['primaryExecutor','standbyExecutor','approvedCodexVersion','macReport','relatedIssue']);
  const r = validateNodeReport(input.macReport);
  if (input.primaryExecutor !== 'mac' || input.standbyExecutor !== 'vps' || r.executorId !== 'mac' || r.generation !== 1 || !r.appServerSmokeOk || r.codexVersion !== input.approvedCodexVersion || !fresh(r.heartbeatAt, now, 120000) || !fresh(r.observedAt, now, 120000)) fail('bootstrap_requires_validated_mac');
  return applyNodeReport({ primaryExecutor: 'mac', standbyExecutor: 'vps', generation: 1, approvedCodexVersion: r.codexVersion, lastTransitionAt: new Date(now).toISOString(), transitionReason: 'owner_bootstrap', activationPending: false, relatedIssue: input.relatedIssue ?? r.checkpoint?.issueNumber ?? null, nodes: {}, checkpoint: null }, r, now);
}
export function transitionControl(s, input, now = Date.now(), receiptId = globalThis.crypto.randomUUID()) {
  if (!s || input.expectedGeneration !== s.generation || input.executorFrom !== s.primaryExecutor || input.executorTo !== s.standbyExecutor) fail('generation_conflict', 409);
  executorApprovalScope(input);
  const view = executorOverview(s, now);
  if (input.transitionMode !== view.transitionMode) fail('transition_mode_conflict', 409);
  if (!view.ready) fail('transition_blocked: ' + view.blockers.join(', '), 409);
  if (!safeText(input.reason) || input.reason.includes('/')) fail('invalid_reason');
  return validateControlState({ ...s, primaryExecutor: s.standbyExecutor, standbyExecutor: s.primaryExecutor, generation: s.generation + 1, lastTransitionAt: new Date(now).toISOString(), transitionReason: input.reason, relatedIssue: input.issueNumber ?? s.relatedIssue, activationPending: true, activationReceipt: validateLeaseReceipt({ receiptId, executorFrom: s.primaryExecutor, executorTo: s.standbyExecutor, previousGeneration: s.generation, generation: s.generation + 1, relatedIssue: input.issueNumber ?? s.relatedIssue, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 600000).toISOString() }) });
}
export function executorApprovalScope(p, bootstrap = false) {
  if (!integer(p.issueNumber) || p.targetConfirmed !== true || !nodeId(p.executorFrom) || !nodeId(p.executorTo) || p.executorFrom === p.executorTo || !(bootstrap ? p.expectedGeneration === 0 : integer(p.expectedGeneration))) fail('invalid_transition_scope');
  if (bootstrap && (p.executorFrom !== 'vps' || p.executorTo !== 'mac' || !exactVersion(p.approvedCodexVersion))) fail('invalid_bootstrap_scope');
  if (!bootstrap && (!['planned','emergency'].includes(p.transitionMode) || (p.transitionMode === 'emergency' ? p.primaryIsolationConfirmed !== true : p.primaryIsolationConfirmed !== false))) fail('primary_isolation_or_mode_required');
  return { ...(bootstrap ? {} : {transitionMode:p.transitionMode, primaryIsolationConfirmed:String(p.primaryIsolationConfirmed)}), actionType: 'destructive', highRiskKind: bootstrap ? 'executor_failover_bootstrap' : 'executor_failover', issueNumber: String(p.issueNumber), executorFrom: p.executorFrom, executorTo: p.executorTo, executorGeneration: String(p.expectedGeneration), ...(bootstrap ? { executorCodexVersion: p.approvedCodexVersion } : {}) };
}
export async function readExecutorBody(request) {
  const reader = request.body?.getReader(); if (!reader) fail('missing_body');
  let size = 0, chunks = [];
  for (;;) { const {value, done} = await reader.read(); if (done) break; size += value.length; if (size > 16384) { await reader.cancel(); fail('payload_too_large', 413); } chunks.push(value); }
  const all = new Uint8Array(size); let offset = 0; for (const c of chunks) { all.set(c, offset); offset += c.length; }
  try { return JSON.parse(new TextDecoder().decode(all)); } catch { fail('invalid_json'); }
}
export function validateLeaseReceipt(r) {
  strictObject(r, ['receiptId','executorFrom','executorTo','previousGeneration','generation','relatedIssue','issuedAt','expiresAt']);
  if (!/^[a-f0-9-]{36}$/.test(r.receiptId) || !nodeId(r.executorFrom) || !nodeId(r.executorTo) || r.executorFrom === r.executorTo || !integer(r.previousGeneration) || r.generation !== r.previousGeneration + 1 || !integer(r.relatedIssue) || !time(r.issuedAt) || !time(r.expiresAt) || Date.parse(r.expiresAt)-Date.parse(r.issuedAt) !== 600000) fail('invalid_lease_receipt');
  return structuredClone(r);
}
export function verifyLeaseReceipt(state, receipt, now = Date.now()) {
  validateLeaseReceipt(receipt);
  const expected = state?.activationReceipt;
  if (!state?.activationPending || !expected || Object.keys(receipt).some(k => receipt[k] !== expected[k]) || now < Date.parse(receipt.issuedAt)-120000 || now >= Date.parse(receipt.expiresAt)) fail('lease_receipt_mismatch_or_expired',409);
  return { valid: true, receipt: structuredClone(expected) };
}
async function reduceEnvelope(envelope, kind, p, now, transportDigest = null) {
  if (kind === 'enrollTransport') {
    transportEnrollmentScope(p);
    if ((envelope.transports?.[p.executorId]?.digest || '') !== p.previousDigest) fail('transport_digest_conflict',409);
    return {...envelope,transports:{...envelope.transports,[p.executorId]:{digest:p.newDigest,issueNumber:p.issueNumber,enrolledAt:new Date(now).toISOString()}}};
  }
  if (kind === 'enroll') {
    enrollmentScope(p);
    if ((envelope.identities?.[p.executorId] || '') !== p.previousPublicKey) fail('node_key_conflict',409);
    // A rekey invalidates that node's previous health/candidate evidence.
    const control = envelope.control ? structuredClone(envelope.control) : null;
    if (control) delete control.nodes[p.executorId];
    return {...envelope,control,candidate:envelope.candidate?.executorId === p.executorId ? null : envelope.candidate,identities:{...envelope.identities,[p.executorId]:p.publicKey}};
  }
  if (kind === 'signedReport' || kind === 'signedAuthorize') {
    if (transportDigest !== null) verifyTransportDigest(envelope,p?.payload?.executorId,transportDigest);
    envelope = await verifyNodeRequest(envelope,kind === 'signedReport' ? 'report' : 'authorize',p,now);
    p = p.payload;
    if (envelope.control && p.generation !== envelope.control.generation) fail('node_generation_conflict',409);
    if (kind === 'signedAuthorize') return {...envelope,decision:authorizeExecutor(envelope.control,p,now)};
    kind = 'report';
  }
  const { control: s, candidate } = envelope;
  if (kind === 'report' && !s) {
    const r = validateNodeReport(p);
    if (r.executorId !== 'mac' || !fresh(r.observedAt,now,120000) || !fresh(r.heartbeatAt,now,120000)) fail('bootstrap_candidate_requires_fresh_mac');
    if (candidate && Date.parse(r.observedAt) <= Date.parse(candidate.observedAt)) fail('out_of_order_report',409);
    return { ...envelope, control: null, candidate: { ...r, receivedAt: new Date(now).toISOString() } };
  }
  if (kind === 'bootstrap' && s) fail('already_initialized',409);
  let input = p;
  if (kind === 'bootstrap' && !p.macReport) {
    if (!candidate || !fresh(candidate.receivedAt,now,120000)) fail('bootstrap_candidate_unavailable',409);
    const { receivedAt, ...macReport } = candidate;
    input = { ...p, macReport };
  }
  const control = kind === 'bootstrap' ? bootstrapControl(input,now) : kind === 'report' ? applyNodeReport(s,p,now) : kind === 'version' ? approveExecutorVersion(s,p,now) : transitionControl(s,p,now);
  return { ...envelope, control, candidate: null };
}
export function createInMemoryExecutorStore() {
  let envelope = { control: null, candidate: null };
  let serial = Promise.resolve();
  const mutate = (kind,p,now=Date.now(),transportDigest=null) => { const task = serial.then(async () => { envelope=await reduceEnvelope(envelope,kind,p,now,transportDigest); return structuredClone(kind === 'signedAuthorize' ? envelope.decision : envelope.control); }); serial = task.catch(()=>{}); return task; };
  return { enrollTransport:(p,n)=>mutate('enrollTransport',p,n), async getTransportStatus() {return transportEnrollmentStatus(envelope);}, enroll:(p,n)=>mutate('enroll',p,n), signedReport:(p,n,d)=>mutate('signedReport',p,n,d), signedAuthorize:(p,n,d)=>mutate('signedAuthorize',p,n,d), async getIdentities() {return structuredClone(envelope.identities || {});}, async get() { return structuredClone(envelope.control); }, async getCandidate() { return structuredClone(envelope.candidate); }, bootstrap: (p,n)=>mutate('bootstrap',p,n), report:(p,n)=>mutate('report',p,n), approveVersion:(p,n)=>mutate('version',p,n), transition:(p,n)=>mutate('transition',p,n) };
}
export function createD1ExecutorStore(db) {
  let schema;
  const ready = () => schema ??= db.prepare('CREATE TABLE IF NOT EXISTS vtdd_executor_control (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL)').run();
  const read = async () => { await ready(); return db.prepare('SELECT revision,payload FROM vtdd_executor_control WHERE id=1').first(); };
  const decode = row => { const p=row ? JSON.parse(row.payload) : null; const e = p?.primaryExecutor ? {control:p,candidate:null} : p ?? {control:null,candidate:null}; if(e.control)validateControlState(e.control); return e; };
  async function mutate(kind, p, now = Date.now(), transportDigest = null) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const row = await read();
      const next = await reduceEnvelope(decode(row),kind,p,now,transportDigest);
      const result = row ? await db.prepare('UPDATE vtdd_executor_control SET revision=revision+1,payload=? WHERE id=1 AND revision=?').bind(JSON.stringify(next),row.revision).run() : await db.prepare('INSERT OR IGNORE INTO vtdd_executor_control (id,revision,payload) VALUES (1,1,?)').bind(JSON.stringify(next)).run();
      if (result.meta?.changes === 1) return kind === 'signedAuthorize' ? next.decision : next.control;
    }
    fail('generation_conflict',409);
  }
  return { enrollTransport:(p,n)=>mutate('enrollTransport',p,n), async getTransportStatus() {return transportEnrollmentStatus(decode(await read()));}, enroll:(p,n)=>mutate('enroll',p,n), signedReport:(p,n,d)=>mutate('signedReport',p,n,d), signedAuthorize:(p,n,d)=>mutate('signedAuthorize',p,n,d), async getIdentities() {return decode(await read()).identities || {};}, async get() { return decode(await read()).control; }, async getCandidate() { return decode(await read()).candidate; }, bootstrap: (p,n) => mutate('bootstrap',p,n), report: (p,n) => mutate('report',p,n), approveVersion: (p,n) => mutate('version',p,n), transition: (p,n) => mutate('transition',p,n) };
}
const stores = new WeakMap();
export function resolveExecutorStore(env) {
  if (env.EXECUTOR_STORE) return env.EXECUTOR_STORE;
  const db = env.VTDD_MEMORY_D1 ?? env.MEMORY_D1;
  if (!db?.prepare) return null;
  if (!stores.has(db)) stores.set(db, createD1ExecutorStore(db));
  return stores.get(db);
}
