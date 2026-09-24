import { exactVersion } from './executor-failover-state.js';
import { renderButlerDocument } from './butler-ui-shell.js';
import { passkeyAuthenticationScript } from './passkey-browser-authentication.js';
// Isolated mode: existing merge/deploy/VPS operator rendering stays unchanged.
export function renderExecutorOperatorPage(params = {}) {
  const transitionMode = params.transitionMode === 'emergency' ? 'emergency' : 'planned';
  const versionMode = params.mode === 'executor-version';
  const approvedCodexVersion = exactVersion(params.approvedCodexVersion) ? params.approvedCodexVersion : '';
  const previousCodexVersion = exactVersion(params.previousCodexVersion) ? params.previousCodexVersion : '';
  const bootstrap = params.mode === 'failover-bootstrap';
  const from = ['mac','vps'].includes(params.executorFrom) ? params.executorFrom : 'vps';
  const to = versionMode ? 'mac' : from === 'mac' ? 'vps' : 'mac';
  const generation = /^\d{1,10}$/.test(params.executorGeneration || '') ? Number(params.executorGeneration) : 0;
  const issueNumber = /^[1-9]\d{0,9}$/.test(params.issueNumber || '') ? Number(params.issueNumber) : null;
  const data = JSON.stringify({ transitionMode, bootstrap, versionMode, approvedCodexVersion, previousCodexVersion, from, to, generation, issueNumber });
  return renderButlerDocument(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>実行基盤の承認</title></head><body><main><h1>実行基盤の${versionMode ? 'Codex exact version 承認' : bootstrap ? '初期化' : '手動切替'}</h1><p>Issue #${issueNumber ?? '未指定'} · ${bootstrap ? '未初期化 → MAC PRIMARY' : from.toUpperCase() + ' → ' + to.toUpperCase()} · generation ${generation}</p>${versionMode ? '<p>承認済み版だけを '+previousCodexVersion+' → '+approvedCodexVersion+' に変更します。package installや実行基盤切替は行いません。</p>' : '<p>Butler の control-state だけを更新します。対象ノードの lease 適用まで切替準備中です。</p>'}${bootstrap ? '<p id="candidate">Mac の報告候補を確認しています…</p>' : ''}${!bootstrap && !versionMode && transitionMode === 'emergency' ? '<section role="alert"><h2>緊急切替：旧PRIMARYの隔離が必要です</h2><p>heartbeat喪失だけでは書込み停止を証明できません。発行済みの外部副作用を取り消すことはできません。最後のcheckpointは古い可能性があり、完全な作業回復は保証しません。</p><label><input type="checkbox" id="isolation">電源・ネットワーク・アクセスの隔離により、旧PRIMARYが書込みを継続できないことを確認しました</label></section>' : ''}<button id="approve" ${bootstrap || !issueNumber ? 'disabled' : ''}>パスキーで承認して準備</button><p id="status" role="status"></p><a href="/dashboard">ホームへ</a></main><script>
${passkeyAuthenticationScript}
const config=${data}; let candidate;
const status=document.getElementById('status'), button=document.getElementById('approve');
if(config.bootstrap) (async()=>{try{
 const response=await fetch('/v2/executors/overview',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('候補を取得できません');
 const data=await response.json();candidate=data.bootstrapCandidate;
 if(data.initialized || !candidate?.appServerSmokeOk || candidate.generation !== 1 || !candidate.receivedAt || Date.now()-Date.parse(candidate.observedAt)>120000 || Date.now()-Date.parse(candidate.observedAt)<-120000 || Date.now()-Date.parse(candidate.receivedAt)>120000)throw Error('新鮮なMac検証報告が必要です');
 document.getElementById('candidate').textContent='Mac Codex '+candidate.codexVersion+' · smoke確認済み · 報告 '+candidate.observedAt;
 button.disabled=!config.issueNumber;
}catch(e){status.textContent=e.message;}})();
async function post(path, body){const r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(v.error||'承認に失敗しました');return v;}
button.onclick=async()=>{button.disabled=true;try{
 if(!config.bootstrap && !config.versionMode && config.transitionMode==='emergency' && !document.getElementById('isolation').checked)throw Error('旧PRIMARYの隔離確認が必要です');
 const body={...(!config.bootstrap && !config.versionMode ? {transitionMode:config.transitionMode,primaryIsolationConfirmed:config.transitionMode==='emergency' && document.getElementById('isolation').checked} : {}),expectedGeneration:config.generation,executorFrom:config.from,executorTo:config.to,issueNumber:config.issueNumber,targetConfirmed:true,reason:'owner_manual_transition',...(config.bootstrap?{approvedCodexVersion:candidate.codexVersion}:config.versionMode?{approvedCodexVersion:config.approvedCodexVersion,previousCodexVersion:config.previousCodexVersion}:{})};
 const kind=config.versionMode?'executor_failover_version':config.bootstrap?'executor_failover_bootstrap':'executor_failover';
 const c=await post('/v2/approval/passkey/challenge',{...body,highRiskKind:kind,policyInput:{actionType:'destructive',highRiskKind:kind}});
 const assertion=await navigator.credentials.get({publicKey:decodeAuthenticationOptions(c.optionsJSON)});
 const verified=await post('/v2/approval/passkey/verify',{sessionId:c.sessionId,response:encodeAuthenticationAssertion(assertion)});
 const outcome=await post('/v2/executors/'+(config.versionMode?'version':config.bootstrap?'bootstrap':'transition'),{...body,approvalGrantId:verified.approvalGrant?.approvalId||verified.approvalGrantId});
 if(outcome.leaseReceipt){const a=document.createElement('a');a.textContent='対象ノード用lease receiptを保存';a.download='executor-lease-receipt.json';a.href=URL.createObjectURL(new Blob([JSON.stringify(outcome.leaseReceipt)],{type:'application/json'}));status.after(a);}
 status.textContent=config.versionMode?'承認済みCodex版だけを更新しました。VPS package更新は別の承認経路が必要です。':config.bootstrap?'実行基盤の初期状態を保存しました。runner 接続は別途確認が必要です。':'切替準備中 / activation pending。対象のlease適用とheartbeatを待っています。';
}catch(e){status.textContent=String(e.message);}finally{button.disabled=false;}};
</script></body></html>`, { active: 'home', layout: 'home' });
}

export function renderExecutorEnrollmentPage(params={}) {
  const executorId = params.executorId === 'vps' ? 'vps' : 'mac';
  const issueNumber = /^[1-9]\d{0,9}$/.test(params.issueNumber || '') ? Number(params.issueNumber) : null;
  return renderButlerDocument(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>実行ノード公開鍵の登録</title></head><body><main><h1>${executorId.toUpperCase()} 公開鍵の登録・更新</h1><p>Issue #${issueNumber ?? '未指定'}。公開鍵だけを登録します。秘密鍵は端末のprivateファイルから移動させないでください。PRIMARY・generation・merge・deploy権限は変更しません。更新後は署名付きの新しい報告が必要です。</p><label>Ed25519公開鍵（base64）<input id="publicKey" autocomplete="off"></label><p id="previous"></p><button id="approve" disabled>表示した公開鍵をパスキーで承認</button><p id="status" role="status"></p></main><script>
${passkeyAuthenticationScript}
const config=${JSON.stringify({executorId,issueNumber})};
const button=document.getElementById('approve'), status=document.getElementById('status');let previousPublicKey;
(async()=>{try{const r=await fetch('/v2/executors/overview',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('登録状態を取得できません');const v=await r.json();previousPublicKey=v.nodePublicKeys?.[config.executorId]||'';document.getElementById('previous').textContent='現在の公開鍵: '+(previousPublicKey||'未登録');button.disabled=!config.issueNumber;}catch(e){status.textContent=e.message;}})();
async function post(path,body){const r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(v.error||'承認失敗');return v;}
button.onclick=async()=>{button.disabled=true;try{
 const publicKey=document.getElementById('publicKey').value.trim();if(!/^[A-Za-z0-9+/]{43}=$/.test(publicKey))throw Error('Ed25519公開鍵を指定してください');
 const body={...config,publicKey,previousPublicKey,targetConfirmed:true};
 const c=await post('/v2/approval/passkey/challenge',{...body,highRiskKind:'executor_node_enroll',policyInput:{actionType:'destructive',highRiskKind:'executor_node_enroll'}});
 const assertion=await navigator.credentials.get({publicKey:decodeAuthenticationOptions(c.optionsJSON)});
 const v=await post('/v2/approval/passkey/verify',{sessionId:c.sessionId,response:encodeAuthenticationAssertion(assertion)});
 await post('/v2/executors/enroll',{...body,approvalGrantId:v.approvalGrant?.approvalId||v.approvalGrantId});previousPublicKey=publicKey;document.getElementById('previous').textContent='現在の公開鍵: '+publicKey;status.textContent='公開鍵を登録しました。署名付きの新しい報告を待っています。';
}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
</script></body></html>`,{active:'home',layout:'home'});
}

// Digest-only operator: raw credentials never enter the browser.
export function renderExecutorTransportEnrollmentPage(params={}) {
  const executorId = ['mac','vps'].includes(params.executorId) ? params.executorId : null;
  const issueNumber = /^[1-9]\d{0,9}$/.test(params.issueNumber || '') ? Number(params.issueNumber) : null;
  return renderButlerDocument(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>実行ノード通信の承認</title><style>.transport-main{max-width:640px;margin:0 auto;padding:20px;box-sizing:border-box}.transport-main h1{font-size:1.5rem}.transport-main label{display:block;margin:18px 0}.transport-main textarea{display:block;width:100%;box-sizing:border-box;padding:12px;margin-top:8px;font:16px monospace;overflow-wrap:anywhere;resize:vertical}.transport-main button{width:100%;min-height:48px}.transport-main p{overflow-wrap:anywhere}</style></head><body><main class="transport-main"><h1>${executorId?.toUpperCase() || 'ノード未指定'} 通信の登録・更新</h1><p>Issue #${issueNumber ?? '未指定'}。端末helperが出力したSHA-256 digestだけを入力してください。raw tokenは入力・送信しないでください。PRIMARY・generation・公開鍵・承認済み版・merge/deploy権限は変更しません。misumiと共有gateway credentialには触れません。</p><p id="enrolled"></p><label>新しいdigest（sha256:…）<textarea id="newDigest" rows="3" autocomplete="off" spellcheck="false" autocapitalize="off"></textarea></label><label>現在のdigest（初回登録は空欄）<textarea id="previousDigest" rows="3" autocomplete="off" spellcheck="false" autocapitalize="off"></textarea></label><button id="approve" disabled>表示したdigestをパスキーで承認</button><p id="status" role="status"></p><a href="/dashboard">ホームへ</a></main><script>
${passkeyAuthenticationScript}
const config=${JSON.stringify({executorId,issueNumber})};
const button=document.getElementById('approve'), status=document.getElementById('status');let enrolled;
(async()=>{try{const r=await fetch('/v2/executors/overview',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('登録状態を取得できません');const v=await r.json();enrolled=v.transportEnrolled?.[config.executorId]===true;document.getElementById('enrolled').textContent=enrolled?'登録済み：現在と新しいdigestを指定してください':'未登録：新しいdigestを指定してください';button.disabled=!config.executorId||!config.issueNumber;}catch(e){status.textContent=e.message;}})();
async function post(path,body){const r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(v.error||'承認失敗');return v;}
button.onclick=async()=>{button.disabled=true;try{
 const newDigest=document.getElementById('newDigest').value.trim(), previousDigest=document.getElementById('previousDigest').value.trim();
 if(!/^sha256:[a-f0-9]{64}$/.test(newDigest)||!(enrolled?/^sha256:[a-f0-9]{64}$/.test(previousDigest):previousDigest==='')||newDigest===previousDigest)throw Error('helperのdigestと現在の登録状態を確認してください');
 const body={...config,newDigest,previousDigest,targetConfirmed:true};
 const c=await post('/v2/approval/passkey/challenge',{...body,highRiskKind:'executor_transport_enroll',policyInput:{actionType:'destructive',highRiskKind:'executor_transport_enroll'}});
 const assertion=await navigator.credentials.get({publicKey:decodeAuthenticationOptions(c.optionsJSON)});
 const v=await post('/v2/approval/passkey/verify',{sessionId:c.sessionId,response:encodeAuthenticationAssertion(assertion)});
 await post('/v2/executors/transport/enroll',{...body,approvalGrantId:v.approvalGrant?.approvalId||v.approvalGrantId});enrolled=true;document.getElementById('previousDigest').value=newDigest;document.getElementById('newDigest').value='';document.getElementById('enrolled').textContent='登録済み';status.textContent='通信digestを登録しました。署名付きreportの確認へ進めます。';
}catch(e){status.textContent=e.message;}finally{button.disabled=!config.executorId||!config.issueNumber;}};
</script></body></html>`,{active:'home',layout:'home'});
}
