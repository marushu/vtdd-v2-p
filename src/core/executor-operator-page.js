import { exactVersion } from './executor-failover-state.js';
import { renderButlerDocument } from './butler-ui-shell.js';
import { passkeyAuthenticationScript } from './passkey-browser-authentication.js';
// Isolated mode: existing merge/deploy/VPS operator rendering stays unchanged.
export function renderExecutorOperatorPage(params = {}) {
  const versionMode = params.mode === 'executor-version';
  const approvedCodexVersion = exactVersion(params.approvedCodexVersion) ? params.approvedCodexVersion : '';
  const previousCodexVersion = exactVersion(params.previousCodexVersion) ? params.previousCodexVersion : '';
  const bootstrap = params.mode === 'failover-bootstrap';
  const from = ['mac','vps'].includes(params.executorFrom) ? params.executorFrom : 'vps';
  const to = versionMode ? 'mac' : from === 'mac' ? 'vps' : 'mac';
  const generation = /^\d{1,10}$/.test(params.executorGeneration || '') ? Number(params.executorGeneration) : 0;
  const issueNumber = /^[1-9]\d{0,9}$/.test(params.issueNumber || '') ? Number(params.issueNumber) : null;
  const data = JSON.stringify({ bootstrap, versionMode, approvedCodexVersion, previousCodexVersion, from, to, generation, issueNumber });
  return renderButlerDocument(`<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>実行基盤の承認</title></head><body><main><h1>実行基盤の${versionMode ? 'Codex exact version 承認' : bootstrap ? '初期化' : '手動切替'}</h1><p>Issue #${issueNumber ?? '未指定'} · ${bootstrap ? '未初期化 → MAC PRIMARY' : from.toUpperCase() + ' → ' + to.toUpperCase()} · generation ${generation}</p>${versionMode ? '<p>承認済み版だけを '+previousCodexVersion+' → '+approvedCodexVersion+' に変更します。package installや実行基盤切替は行いません。</p>' : '<p>Butler の control-state だけを更新します。対象ノードの lease 適用まで切替準備中です。</p>'}${bootstrap ? '<p id="candidate">Mac の報告候補を確認しています…</p>' : ''}<button id="approve" ${bootstrap || !issueNumber ? 'disabled' : ''}>パスキーで承認して準備</button><p id="status" role="status"></p><a href="/dashboard">ホームへ</a></main><script>
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
 const body={expectedGeneration:config.generation,executorFrom:config.from,executorTo:config.to,issueNumber:config.issueNumber,targetConfirmed:true,reason:'owner_manual_transition',...(config.bootstrap?{approvedCodexVersion:candidate.codexVersion}:config.versionMode?{approvedCodexVersion:config.approvedCodexVersion,previousCodexVersion:config.previousCodexVersion}:{})};
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
