#!/usr/bin/env node
// Synthetic only: all requests intercepted; no production, service workers or saved profile.
import { chromium, webkit } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { renderExecutorOperatorPage,renderExecutorEnrollmentPage } from '../src/core/executor-operator-page.js';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { renderDashboardMonitorHome } from '../src/worker/dashboard-monitor-home.js';
import { bootstrapControl, applyNodeReport, executorOverview, transitionControl } from '../src/core/executor-failover-state.js';
const browserName=process.argv.includes('--browser') ? process.argv[process.argv.indexOf('--browser')+1] : 'chromium';
if (!['chromium','webkit'].includes(browserName)) throw Error('--browser must be chromium or webkit (installed only)');
const output=await mkdtemp(resolve(tmpdir(),'issue858-browser-'));
const now=Date.now(),stamp=new Date(now).toISOString();
const cp={repository:'sample/project',issueNumber:858,pullNumber:null,branch:'issue-858',baseRef:'main',headSha:'a'.repeat(40),dirty:false,unpushed:false,lastSuccessfulAction:'tests_passed',nextSafeAction:'review',generation:1,updatedAt:stamp};
const mac={executorId:'mac',generation:1,observedAt:stamp,heartbeatAt:stamp,codexVersion:'1.2.3',appServerSmokeOk:true,serviceState:'inactive',checkpoint:cp};
const base=applyNodeReport(bootstrapControl({primaryExecutor:'mac',standbyExecutor:'vps',approvedCodexVersion:'1.2.3',macReport:mac},now),{...mac,executorId:'vps',checkpoint:cp},now);
let browser;const results=[];
console.log(`Synthetic ${browserName} artifacts: ${output}`);
try{
 browser=await ({chromium,webkit}[browserName]).launch({headless:true});
 for(const colorScheme of ['light','dark'])for(const scenario of ['healthy','ready','hiccup','emergency','version','dirty','unsynced','planned-stale','emergency-unsynced','pending','uninitialized']){
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme,serviceWorkers:'block'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let s=structuredClone(base);
  let clock=now;
  if(scenario==='healthy')s.nodes.mac.serviceState='running';
  if(scenario==='hiccup')clock=now+121000;
  if(scenario.startsWith('emergency')){clock=now+601000;s=applyNodeReport(s,{...mac,executorId:'vps',checkpoint:cp,observedAt:new Date(clock).toISOString(),heartbeatAt:new Date(clock).toISOString()},clock);}
  if(scenario==='dirty')s.checkpoint.dirty=true;
  if(scenario==='unsynced'||scenario==='emergency-unsynced')s.nodes.vps.checkpoint.headSha='b'.repeat(40);
  if(scenario==='planned-stale')s.checkpoint.updatedAt=new Date(now-601000).toISOString();
  if(scenario==='version')s.nodes.vps.codexVersion='1.2.2';
  if(scenario==='pending')s=transitionControl(s,{expectedGeneration:1,executorFrom:'mac',executorTo:'vps',issueNumber:858,targetConfirmed:true,reason:'owner_manual_transition',transitionMode:'planned',primaryIsolationConfirmed:false},now);
  const overview={serverTime:new Date(clock).toISOString(),monitors:[],notifications:[],notificationsAvailable:true,executors:executorOverview(scenario==='uninitialized'?null:s,clock)};
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.pathname==='/dashboard')return route.fulfill({headers:{'content-type':'text/html; charset=utf-8'},body:renderDashboardMonitorHome()});
   if(u.pathname==='/v2/dashboard/overview')return route.fulfill({contentType:'application/json',body:JSON.stringify(overview)});
   return route.abort();
  });
  await page.goto('https://example.com/dashboard');await page.locator('#connection').filter({hasText:'接続中'}).waitFor();
  const card=page.locator('#executors');const text=await card.innerText();
  if(['ready','emergency'].includes(scenario)){assert.equal(await card.locator('a.action').count(),1);assert.match(await card.locator('a.action').getAttribute('href'),/^\/v2\/approval\/passkey\/operator\?mode=failover/);}
  else assert.equal(await card.locator('a.action').count(),0);
  if(scenario==='healthy')assert.equal(await card.locator('.green').count(),1);
  if(scenario==='unsynced'||scenario==='emergency-unsynced'){assert.match(text,/checkpointの同期不一致/);assert.equal(overview.executors.standbyReady,false);}
  if(scenario==='dirty')assert.match(text,/変更あり/);
  if(scenario==='version')assert.match(text,/版が不一致/);
  if(scenario==='pending')assert.match(text,/activation pending/);
  if(scenario==='uninitialized')assert.match(text,/未初期化/);
  assert.equal(await page.getByRole('heading',{name:'監視・実行中'}).count(),1);
  assert.equal(await page.getByRole('heading',{name:'最近の通知'}).count(),1);
  assert.ok(await page.locator('a[href="/dashboard/chat"]').count()>0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);assert.deepEqual(errors,[]);
  await page.screenshot({path:resolve(output,`${scenario}-${colorScheme}.png`),fullPage:true});results.push({browser:browserName,scenario,colorScheme,passed:true});await context.close();
 }
 for(const mode of ['planned','emergency','executor-enroll']) {
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const page=await context.newPage();const calls=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const html=mode==='executor-enroll'?renderExecutorEnrollmentPage({executorId:'mac',issueNumber:'858'}):renderExecutorOperatorPage({executorFrom:'mac',executorGeneration:'1',issueNumber:'858',transitionMode:mode});
  await page.addInitScript(()=>{Object.defineProperty(navigator,'credentials',{value:{get:async()=>({id:'test',rawId:new Uint8Array([1]).buffer,type:'public-key',response:{authenticatorData:new Uint8Array([1]).buffer,clientDataJSON:new Uint8Array([1]).buffer,signature:new Uint8Array([1]).buffer,userHandle:null}})}});});
  await page.route('**/*',async route=>{const path=new URL(route.request().url()).pathname;if(path==='/operator')return route.fulfill({headers:{'content-type':'text/html; charset=utf-8'},body:html});if(path==='/v2/executors/overview')return route.fulfill({json:{nodePublicKeys:{}}});if(route.request().method()!=='POST')return route.abort();const body=route.request().postDataJSON();calls.push({path,body});return route.fulfill({json:path.endsWith('/challenge')?{sessionId:'synthetic',optionsJSON:{challenge:'YQ'}}:path.endsWith('/verify')?{approvalGrant:{approvalId:'synthetic'}}:{ok:true}});});
  await page.goto('https://example.com/operator');
  if(mode==='emergency'){await page.locator('#approve').click();assert.equal(calls.length,0);await page.getByRole('alert').waitFor();await page.locator('#isolation').check();}
  if(mode==='executor-enroll')await page.locator('#publicKey').fill('A'.repeat(43)+'=');
  await page.locator('#approve').click();await page.locator('#status').filter({hasText:mode==='executor-enroll'?'公開鍵を登録しました':'activation pending'}).waitFor();
  assert.equal(calls.length,3);assert.equal(calls[2].path,mode==='executor-enroll'?'/v2/executors/enroll':'/v2/executors/transition');
  if(mode!=='executor-enroll'){assert.equal(calls[0].body.transitionMode,mode);assert.equal(calls[2].body.primaryIsolationConfirmed,mode==='emergency');}
  assert.deepEqual(errors,[]);await page.screenshot({path:resolve(output,mode+'-operator.png'),fullPage:true});results.push({browser:browserName,scenario:mode+'-operator',passed:true});await context.close();
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));
 console.log(`${results.length} ${browserName} synthetic browser cases passed: ${output}`);
}catch(error){
 await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));
 await writeFile(resolve(output,'failure.json'),JSON.stringify({browser:browserName,phase:browser?'scenario':'launch',passed:results.length,error:String(error.message).split('\n')[0]},null,2));
 throw error;
}finally{await browser?.close();}
