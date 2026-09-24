#!/usr/bin/env node
// Synthetic only: all requests intercepted; no production, service workers or saved profile.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { renderDashboardMonitorHome } from '../src/worker/dashboard-monitor-home.js';
import { bootstrapControl, applyNodeReport, executorOverview, transitionControl } from '../src/core/executor-failover-state.js';
const output=resolve('.local/issue-858/browser');await mkdir(output,{recursive:true});
const now=Date.now(),stamp=new Date(now).toISOString();
const cp={repository:'sample/project',issueNumber:858,pullNumber:null,branch:'issue-858',baseRef:'main',headSha:'a'.repeat(40),dirty:false,unpushed:false,lastSuccessfulAction:'tests_passed',nextSafeAction:'review',generation:1,updatedAt:stamp};
const mac={executorId:'mac',generation:1,observedAt:stamp,heartbeatAt:stamp,codexVersion:'1.2.3',appServerSmokeOk:true,serviceState:'inactive',checkpoint:cp};
const base=applyNodeReport(bootstrapControl({primaryExecutor:'mac',standbyExecutor:'vps',approvedCodexVersion:'1.2.3',macReport:mac},now),{...mac,executorId:'vps',checkpoint:undefined},now);
const browser=await chromium.launch({headless:true});const results=[];
try{
 for(const colorScheme of ['light','dark'])for(const scenario of ['healthy','ready','version','dirty','pending','uninitialized']){
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme,serviceWorkers:'block'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let s=structuredClone(base);
  let clock=now;
  if(scenario==='healthy')s.nodes.mac.serviceState='running';
  if(scenario==='ready')clock=now+121000;
  if(scenario==='dirty')s.checkpoint.dirty=true;
  if(scenario==='version')s.nodes.vps.codexVersion='1.2.2';
  if(scenario==='pending')s=transitionControl(s,{expectedGeneration:1,executorFrom:'mac',executorTo:'vps',issueNumber:858,targetConfirmed:true,reason:'owner_manual_transition'},now);
  const overview={serverTime:new Date(clock).toISOString(),monitors:[],notifications:[],notificationsAvailable:true,executors:executorOverview(scenario==='uninitialized'?null:s,clock)};
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.pathname==='/dashboard')return route.fulfill({contentType:'text/html',body:renderDashboardMonitorHome()});
   if(u.pathname==='/v2/dashboard/overview')return route.fulfill({contentType:'application/json',body:JSON.stringify(overview)});
   return route.abort();
  });
  await page.goto('https://example.com/dashboard');await page.locator('#connection').filter({hasText:'接続中'}).waitFor();
  const card=page.locator('#executors');const text=await card.innerText();
  if(scenario==='ready'){assert.match(text,/Mac未確認/);assert.equal(await card.locator('a.action').count(),1);assert.match(await card.locator('a.action').getAttribute('href'),/^\/v2\/approval\/passkey\/operator\?mode=failover/);}
  else assert.equal(await card.locator('a.action').count(),0);
  if(scenario==='healthy')assert.equal(await card.locator('.green').count(),1);
  if(scenario==='dirty')assert.match(text,/変更あり/);
  if(scenario==='version')assert.match(text,/版が不一致/);
  if(scenario==='pending')assert.match(text,/activation pending/);
  if(scenario==='uninitialized')assert.match(text,/未初期化/);
  assert.equal(await page.getByRole('heading',{name:'監視・実行中'}).count(),1);
  assert.equal(await page.getByRole('heading',{name:'最近の通知'}).count(),1);
  assert.ok(await page.locator('a[href="/dashboard/chat"]').count()>0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);assert.deepEqual(errors,[]);
  await page.screenshot({path:resolve(output,`${scenario}-${colorScheme}.png`),fullPage:true});results.push({scenario,colorScheme,passed:true});await context.close();
 }
 await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));
 console.log(`${results.length} synthetic browser cases passed`);
}finally{await browser.close();}
