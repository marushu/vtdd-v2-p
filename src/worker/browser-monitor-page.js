import { renderButlerDocument } from '../core/butler-ui-shell.js';
export function renderBrowserMonitorPage() {
  return renderButlerDocument(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>予約監視 · Butler</title>
<style>main{max-width:680px;margin:auto;padding:24px}label{display:block;margin:12px 0}input{display:block;box-sizing:border-box;width:100%;min-height:44px}input[type=checkbox]{width:auto;display:inline;min-height:0}button{min-height:44px;margin:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere}details{margin:24px 0}</style>
<main><h1>ブラウザ予約監視</h1><p>既存Chromeで約5分ごとに確認します。空きなしは無通知。予約確定・本人認証・確認が必要な監視停止はPWAへ通知します。</p><pre id="state" aria-live="polite">取得中…</pre>
<button data-action="run_now">今すぐ確認</button><button data-action="stop">停止</button><button data-action="resume">再開</button><p>停止は次の実行を止めます。実行中の予約を取り消す操作ではありません。結果不明の実行がある間は再開できません。</p>
<details><summary>監視の登録・対象設定</summary><form id="config">
${[['bridgeRoomId','接続済みButlerルームID'],['codexThreadId','既存CodexスレッドID'],['repository','通知に使うリポジトリ'],['profile','既存Chromeプロファイル'],['device','Appleのデバイス名'],['product','製品'],['problem','損傷内容'],['service','修理方法'],['store','店舗'],['address','住所']].map(([key,label]) => `<label>${label}<input name="${key}" required maxlength="200" autocomplete="off"></label>`).join('')}
<label><input type="checkbox" name="bookingApproved" required>この対象の最早枠を予約確定まで任せる</label><button>登録（停止状態）</button></form></details><p id="message" role="status"></p></main>
<script>
const output=document.getElementById('state'), message=document.getElementById('message');
const labels={checking:'確認中',no_slots:'空きなし',available:'候補あり・停止',auth_required:'本人認証が必要',error:'確認エラー',completed:'予約確定・監視終了',stopped:'停止',stopping:'停止要求済み・実行結果待ち'};
const time=v=>v?new Date(v).toLocaleString('ja-JP'):'未確認';
async function request(body){const r=await fetch('/v2/dashboard/browser-monitor',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error||'取得できません');return data;}
async function refresh(){try{const s=await request();output.textContent=s.configured?[labels[s.status]||s.status,s.summary||'',s.target.product+' · '+s.target.problem,s.target.store+' · '+s.target.address,'最終実取得: '+time(s.lastFreshAt),'次回: '+time(s.nextRunAt),'実行中: '+(s.inFlight?'あり（重複実行は停止）':'なし'),s.requiredAction||'',s.notification?'PWA送信: '+(s.notification.ok?'受付済み（表示は未確認）':'未確認・失敗'):''].filter(Boolean).join('\n'):'まだ登録されていません';}catch{output.textContent='現在の監視状態を取得できません。';}}
async function act(body){message.textContent='処理中…';try{await request(body);message.textContent='反映しました。';}catch(e){message.textContent=e.message==='previous_run_unresolved'?'前回の実行結果が不明です。重複予約を避けるため再開できません。':e.message;}await refresh();}
for(const b of document.querySelectorAll('[data-action]'))b.onclick=()=>act({action:b.dataset.action});
document.getElementById('config').onsubmit=e=>{e.preventDefault();const definition=Object.fromEntries(new FormData(e.target));definition.bookingApproved=definition.bookingApproved==='on';definition.intervalSeconds=300;act({action:'configure',definition});};
refresh();setInterval(()=>{if(!document.hidden)refresh();},15000);
</script></html>`, { active: 'home', pagePath: '/dashboard/browser-monitor' });
}
