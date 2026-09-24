import { build } from 'esbuild';
import { createInMemoryDashboardMonitorStore } from '../src/core/dashboard-monitor-state.js';
export const humanRoutes = [
 '/dashboard','/dashboard/chat','/orchestrator',...['threadId=demo','thread_id=demo','repository=demo/example','repositoryInput=demo/example','issueNumber=856'].map(q=>'/dashboard?'+q),
 ...['notifications','github','preflight','progress','vps-runner','memory','handoff','self-parity','news'].map(p=>'/dashboard/'+p),
 '/status','/help','/guide','/setup','/setup/recovery','/setup/latest','/setup/known-good','/setup/diagnostics',
 ...['/v2','/mvp'].flatMap(prefix=>['','?mode=dashboard','?mode=merge','?mode=deploy'].map(q=>prefix+'/approval/passkey/operator'+q))
];
export const syntheticToken = 'DEMO-SYNTHETIC-NOT-A-CREDENTIAL';
// Mirror the existing injected event-store interface, including delete/get and
// filter semantics. No production store implementation or contract is changed.
export function createSyntheticEventStore(initialEvents = []) {
 const records = new Map(initialEvents.map(event => [event.id, structuredClone(event)]));
 const list = (filter = {}) => [...records.values()]
  .filter(event => ['kind','repository','workflowName'].every(key => !filter[key] || event[key] === filter[key]))
  .filter(event => !filter.since || Date.parse(event.updatedAt) >= Date.parse(filter.since))
  .sort((a,b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  .slice(0, filter.limit || 20).map(event => structuredClone(event));
 return {
  async put(event) { records.set(event.id, structuredClone(event)); return structuredClone(event); },
  async get(id) { return records.has(id) ? structuredClone(records.get(id)) : null; },
  async delete(id) { return records.delete(id); },
  async latest(filter = {}) { return list({...filter,limit:1})[0] || null; },
  async listRecent(filter = {}) { return list(filter); }
 };
}
export const syntheticDetailUrls = ['/dashboard?threadId=demo', '/dashboard/progress?executionId=DEMO_' + '0123456789'.repeat(18)];
export function syntheticNotificationEvents(time) {
 return [
  {id:'DEMO_OWNER_'+'0123456789'.repeat(18),kind:'owner_action_required',title:'DEMO/SYNTHETIC 確認が必要なお知らせの詳細',changeSummary:'DEMO 通知：対応を確認してください',createdAt:time,updatedAt:time,threadId:'demo',repository:'demo/example',status:'action_required',runId:'9876543210'.repeat(18),runUrl:syntheticDetailUrls[0],pwaNotificationAttempted:1,pwaNotificationDelivered:0,pwaNotificationReason:'DEMO/SYNTHETIC 配信未実行'},
  {id:'DEMO_DEPLOY_'+'9876543210'.repeat(18),kind:'github_actions_workflow_run',workflowName:'deploy-production',repository:'demo/example',runId:'1234567890'.repeat(18),title:'DEMO/SYNTHETIC 本番反映の記録',changeSummary:'DEMO 反映の結果',status:'completed',conclusion:'success',headSha:'abcdef0123456789'.repeat(3),createdAt:time,updatedAt:time,runUrl:syntheticDetailUrls[1],pwaNotificationAttempted:1,pwaNotificationDelivered:0,pwaNotificationReason:'DEMO/SYNTHETIC 配信未実行'}
 ];
}
export async function createFixture() {
 const monitors = createInMemoryDashboardMonitorStore();
 const time = new Date().toISOString();
 await monitors.put({ id:'demo',source:'synthetic',title:'DEMO/SYNTHETIC 監視',description:'実際の運用データではありません',status:'no_slots',mode:'monitoring',intervalSeconds:60,processAlive:true,observedAt:time,receivedAt:time,lastSuccessAt:time,lastAttemptAt:time,resultSummary:'DEMO 確認済み',automationScope:'表示のみ',consecutiveFailures:0 });
 const env = {
  VTDD_GATEWAY_BEARER_TOKEN:syntheticToken,
  GITHUB_APP_INSTALLATION_TOKEN:syntheticToken,
  DASHBOARD_MONITOR_STORE:monitors,
  DASHBOARD_EVENT_STORE:createSyntheticEventStore(syntheticNotificationEvents(time)),
  GITHUB_API_FETCH:async()=>new Response(JSON.stringify({message:'DEMO backend unavailable'}),{status:503,headers:{'content-type':'application/json'}}),
  DASHBOARD_WEB_PUSH_FETCH:async()=>{throw new Error('Push is forbidden in this fixture');}
 };
 return {env, async request(worker,path,{auth=true}={}) {return worker.fetch(new Request('http://localhost'+path,{headers:auth?{authorization:'Bearer '+syntheticToken}:{}}),env);} };
}
export async function deploymentWorker() {
 const result=await build({entryPoints:['worker.js'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',keepNames:true,legalComments:'none'});
 return (await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).default;
}
