#!/usr/bin/env node
// Operator-only localhost harness. All results are DEMO/SYNTHETIC, never runtime truth.
import http from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {humanRoutes,createFixture,deploymentWorker,syntheticToken,syntheticDetailUrls} from './issue856-route-fixtures.mjs';
import {butlerMenuItems,butlerActivePage,butlerMenuCurrentHref} from '../src/core/butler-ui-shell.js';
import {renderedTextContrast,simulateVisualViewport,resetVisualViewport} from './issue856-browser-checks.mjs';
const directory=new URL('../.local/issue-856/browser/',import.meta.url);
await mkdir(directory,{recursive:true});
const evidence={marker:'DEMO/SYNTHETIC — 実運用・実機の証拠ではありません',bundle:'worker.js second bundle / keepNames:true',startedAt:new Date().toISOString(),checks:[],screenshots:[],errors:[]};
const worker=await deploymentWorker(),fixture=await createFixture();
let server,browser;
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('External Worker network blocked by Issue856 harness');};
try {
 server=http.createServer(async(req,res)=>{
  try {
   if(req.method!=='GET'){res.writeHead(405);res.end('DEMO: mutations disabled');return;}
   const request=new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{headers:{authorization:'Bearer '+syntheticToken}});
   const response=await worker.fetch(request,fixture.env);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.writeHead(500);res.end('DEMO fixture error: '+error.message);}
 });
 server.on('upgrade',(_req,socket)=>socket.destroy());
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.ISSUE856_BROWSER_EXECUTABLE?{executablePath:process.env.ISSUE856_BROWSER_EXECUTABLE}:{})});
 const sizes=[{width:390,height:844},{width:402,height:874},{width:844,height:390},{width:1280,height:900}];
 for(const colorScheme of ['light','dark'])for(const viewport of sizes){
  const context=await browser.newContext({viewport,colorScheme,serviceWorkers:'block',reducedMotion:'reduce',hasTouch:viewport.width<900});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
  const page=await context.newPage();const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  let canonicalTokens;
  for(const path of humanRoutes){
   await page.goto(origin+path,{waitUntil:'domcontentloaded'});
   assert.equal(await page.locator('meta[name="viewport"]').count(),1);
   assert.ok((await page.locator('meta[name="viewport"]').getAttribute('content')).includes('viewport-fit=cover'));
   assert.equal(await page.locator('meta[name="theme-color"]').count(),2);
   assert.equal(await page.locator(`meta[name="theme-color"][media="(prefers-color-scheme: ${colorScheme})"]`).getAttribute('content'),colorScheme==='dark'?'#1d1c1b':'#faf8f4');
   const nav=page.locator('[data-butler-primary-nav]');assert.equal(await nav.count(),1,path);
   assert.deepEqual(await nav.locator('a').allTextContents(),['ホーム','通知','チャット']);
   assert.deepEqual(await nav.locator('a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),['/dashboard','/dashboard/notifications','/dashboard/chat']);
   const current=butlerActivePage(path);assert.equal(await nav.locator('[aria-current="page"]').count(),current?1:0,path);
   for(const link of await nav.locator('a').all())assert.ok((await link.boundingBox()).height>=44,path);
   const menu=page.locator('[data-butler-menu]'),summary=menu.locator('summary');
   await summary.click();assert.equal(await menu.getAttribute('open'),'');
   const menuCurrent=butlerMenuCurrentHref(path);
   assert.deepEqual(await menu.locator('[aria-current="page"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),menuCurrent?[menuCurrent]:[]);
   assert.deepEqual(await menu.locator('a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),butlerMenuItems.map(i=>i[1]));
   await page.keyboard.press('Tab');assert.equal(await menu.locator('a').first().evaluate(n=>n===document.activeElement),true);
   await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('open'),null);assert.equal(await summary.evaluate(n=>n===document.activeElement),true);
   // Tab out closes a nonmodal menu without trapping focus.
   await summary.press('Enter');await menu.locator('a').last().focus();await page.keyboard.press('Tab');assert.equal(await menu.getAttribute('open'),null);
   const tokens=await page.evaluate(()=>{const s=getComputedStyle(document.body),r=getComputedStyle(document.documentElement);return {background:s.backgroundColor,accent:r.getPropertyValue('--butler-accent').trim(),card:r.getPropertyValue('--butler-card').trim()};});
   canonicalTokens??=tokens;assert.deepEqual(tokens,canonicalTokens,path);
   if(await page.locator('#butler-message').count()){
    await page.locator('#butler-message').fill('DEMO/SYNTHETIC 未送信の下書き');
    const input=await page.locator('#butler-message').boundingBox(),send=await page.locator('#butler-send-button').boundingBox(),bottom=await nav.boundingBox();
    for(const box of [input,send]){assert.ok(box&&box.y+box.height<=bottom.y+1,`${path} composer overlaps bottom nav`);assert.ok(box.y>=0);}
    await page.locator('#butler-chat-log').evaluate(log=>{const details=document.createElement('details');details.open=true;details.innerHTML='<summary>DEMO 展開詳細</summary><p>'+('DEMO/SYNTHETIC 詳細<br>'.repeat(60))+'</p>';log.append(details);log.scrollTop=log.scrollHeight;});
    const last=await page.locator('#butler-chat-log details').last().evaluate(n=>({bottom:n.getBoundingClientRect().bottom,scrollBottom:n.parentElement.getBoundingClientRect().bottom}));assert.ok(last.bottom<=last.scrollBottom+2);
    await page.locator('#butler-message').focus();await page.setViewportSize({...viewport,height:Math.max(320,viewport.height-250)});
    assert.equal(await page.locator('#butler-message').inputValue(),'DEMO/SYNTHETIC 未送信の下書き');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const keyboard=await page.evaluate(()=>{const input=document.getElementById('butler-message').getBoundingClientRect(),nav=document.querySelector('[data-butler-primary-nav]').getBoundingClientRect();return{top:input.top,bottom:input.bottom,navTop:nav.top};});
    assert.ok(keyboard.top>=0&&keyboard.bottom<=keyboard.navTop+1,JSON.stringify(keyboard));
    await page.setViewportSize(viewport);
    const syntheticHeight=Math.min(490,viewport.height-30),syntheticTop=24;
    await page.evaluate(simulateVisualViewport,{height:syntheticHeight,offsetTop:syntheticTop});
    const vpNav=await nav.boundingBox(),vpInput=await page.locator('#butler-message').boundingBox(),vpSend=await page.locator('#butler-send-button').boundingBox();
    for(const box of [vpInput,vpSend])assert.ok(box.y+box.height<=vpNav.y+1,`${path} visualViewport + safe-area composer overlap`);
    assert.ok(Math.abs(vpNav.y+vpNav.height-(syntheticTop+syntheticHeight))<2);
    assert.equal(await page.locator('#butler-message').inputValue(),'DEMO/SYNTHETIC 未送信の下書き');
    await page.locator('#butler-chat-log').evaluate(log=>{log.scrollTop=log.scrollHeight;});
    const crampedLast=await page.locator('#butler-chat-log details').last().boundingBox();
    const crampedComposer=await page.locator('#butler-chat-form').boundingBox();
    assert.ok(crampedLast.y+crampedLast.height<=crampedComposer.y+1,'last expanded content scrolls above compact composer');
    await summary.click();await page.keyboard.press('Tab');assert.ok(await menu.locator('a').first().evaluate(n=>n===document.activeElement));
    const bounds=await menu.locator('.butler-shell-menu-links').boundingBox();assert.ok(bounds.y>=syntheticTop&&bounds.y+bounds.height<=vpNav.y,`menu outside available viewport ${path}`);
    await page.keyboard.press('Escape');await page.evaluate(resetVisualViewport);
   }
   if(path==='/dashboard'){
    await page.locator('#monitors details').first().waitFor();await page.locator('#monitors summary').first().click();
    const previous=await page.locator('#connection').textContent();
    await Promise.all([page.waitForResponse(r=>r.url().endsWith('/v2/dashboard/overview')),page.evaluate(()=>window.dispatchEvent(new Event('online')))]);
    assert.equal(await page.locator('#monitors details').first().getAttribute('open'),'');assert.ok(previous);
   }
   if(path==='/dashboard/notifications'){
    const settings=page.locator('[data-settings-section="notification-pwa-settings"]');if(await settings.count())await settings.locator('summary').click();
    for(const id of ['push-permission-button','push-subscribe-button','push-test-button','push-server-test-button'])assert.equal(await page.locator('#'+id).count(),1);
    assert.equal(await page.locator('.deploy-event').count(),2,'populated owner + deploy fixture, never the empty state');
    assert.equal(await page.getByText('通知はありません。',{exact:true}).count(),0);
    assert.deepEqual(await page.locator('.deploy-event a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),syntheticDetailUrls);
    for(const details of await page.locator('[data-notification-diagnostics]').all()){await details.locator('summary').click();assert.equal(await details.getAttribute('open'),'');}
    assert.ok((await page.locator('main').textContent()).includes('DEMO/SYNTHETIC 配信未実行'));
    for(const id of ['push-permission-button','push-subscribe-button','push-test-button','push-server-test-button']){await page.locator('#'+id).evaluate(n=>n.scrollIntoView({block:'center'}));assert.ok(await page.locator('#'+id).isVisible());const control=await page.locator('#'+id).boundingBox(),footer=await nav.boundingBox();assert.ok(control.y>=0&&control.y+control.height<=footer.y,'notification control accessible above nav');}
    const gutters=await page.evaluate(()=>({brand:document.querySelector('.butler-shell-brand').getBoundingClientRect().left,title:document.querySelector('main h1').getBoundingClientRect().left,padding:getComputedStyle(document.querySelector('main .lane')).paddingLeft,radius:getComputedStyle(document.querySelector('main .lane')).borderRadius}));
    assert.equal(gutters.brand,gutters.title);assert.equal(gutters.padding,'20px');assert.equal(gutters.radius,'20px');
   }
   if(path.includes('operator?mode=')){
    const mode=new URL(origin+path).searchParams.get('mode');
    assert.equal(await page.locator('[data-operator-section="registration"]').isVisible(),false);
    assert.equal(await page.locator(`[data-operator-section="${mode==='merge'?'pr-merge':mode==='deploy'?'production-deploy':'approval'}"]`).isVisible(),true);
   }
   const contrast=await page.evaluate(renderedTextContrast);
   for(const result of contrast)assert.ok(result.ratio>=4.5,`${path} ${result.element} contrast ${result.ratio} (${result.foregroundCss} on ${result.backgroundCss})`);
   if(path.includes('operator?mode=deploy')){
    const approve=contrast.find(item=>item.element==='approve-button');assert.ok(approve,'visible deploy primary button');
    assert.equal(approve.foregroundCss,colorScheme==='dark'?'rgb(40, 38, 36)':'rgb(255, 254, 250)');
    assert.equal(approve.backgroundCss,colorScheme==='dark'?'rgb(238, 170, 161)':'rgb(159, 57, 53)');
   }
   const overflow=await page.evaluate(()=>({width:innerWidth,body:document.body.scrollWidth,document:document.documentElement.scrollWidth,cards:[...document.querySelectorAll('.deploy-event')].map(n=>({scroll:n.scrollWidth,width:n.clientWidth}))}));
   assert.ok(overflow.body<=overflow.width&&overflow.document<=overflow.width,path+' page horizontal overflow');
   for(const card of overflow.cards)assert.ok(card.scroll<=card.width,path+' notification card horizontal overflow');
   if(!await page.locator('#butler-message').count())await page.evaluate(()=>window.scrollTo(0,0));
   await page.evaluate(()=>{const mark=document.createElement('div');mark.textContent='DEMO / SYNTHETIC';mark.style.cssText='position:fixed;right:8px;top:0;z-index:100;pointer-events:none;font:10px sans-serif;background:#fff;color:#000';document.body.append(mark);});
   if(['/dashboard','/dashboard/chat','/dashboard/notifications','/dashboard/github','/v2/approval/passkey/operator?mode=deploy'].includes(path)){
    const name=`${colorScheme}-${viewport.width}x${viewport.height}-${path.replace(/[^a-z0-9]/gi,'_')}.png`;await page.screenshot({path:new URL(name,directory).pathname,fullPage:false});evidence.screenshots.push(name);
   }
   if(path==='/dashboard/notifications'||path==='/v2/approval/passkey/operator?mode=deploy'){
    const target=page.locator(path==='/dashboard/notifications'?'#push-permission-button':'#approve-button');
    await target.evaluate(n=>n.scrollIntoView({block:'center'}));
    const name=`${colorScheme}-${viewport.width}x${viewport.height}-${path==='/dashboard/notifications'?'notification-settings':'deploy-button'}.png`;
    await page.screenshot({path:new URL(name,directory).pathname});evidence.screenshots.push(name);
   }
   evidence.checks.push({path,colorScheme,viewport,tokens,contrast,overflow,status:'passed'});
  }
  await page.goto(origin+'/help',{waitUntil:'domcontentloaded'});
  await page.locator('[data-butler-menu] summary').click();
  const actualMenuLink=page.locator('[data-butler-menu] a').first();
  await Promise.all([page.waitForURL(origin+'/dashboard/news'),viewport.width<900?actualMenuLink.tap():actualMenuLink.click()]);
  // Exercise the existing chat modal integration and its unchanged cancel path.
  await page.goto(origin+'/dashboard/chat',{waitUntil:'domcontentloaded'});
  await page.locator('#butler-message').fill('DEMO/SYNTHETIC iframe前の下書き');
  await page.locator('#butler-chat-log').evaluate(log=>{const link=document.createElement('a');link.id='demo-scoped-approval';link.href='/v2/approval/passkey/operator?mode=deploy&repositoryInput=demo%2Fexample&issueNumber=856';link.textContent='DEMO スコープ付き確認';log.append(link);});
  await page.locator('#demo-scoped-approval').click();
  const frame=page.frameLocator('#butler-passkey-frame');
  await frame.locator('[data-butler-primary-nav]').waitFor();
  assert.equal(await frame.locator('[data-butler-primary-nav] a').first().getAttribute('target'),'_top');
  await page.locator('#butler-passkey-close').click();
  assert.equal(await page.locator('#butler-message').inputValue(),'DEMO/SYNTHETIC iframe前の下書き');
  assert.ok(!await page.locator('#butler-passkey-modal').isVisible());
  await page.locator('#demo-scoped-approval').click();await frame.locator('[data-butler-primary-nav]').waitFor();
  await Promise.all([page.waitForURL(origin+'/dashboard/notifications'),frame.locator('[data-butler-primary-nav]').getByRole('link',{name:'通知',exact:true}).click()]);
  assert.equal(await page.locator('#butler-passkey-frame').count(),0,'global navigation must leave the iframe, not nest Butler home');
  await page.locator('[data-butler-primary-nav]').getByRole('link',{name:'チャット',exact:true}).click();
  assert.equal(await page.locator('#butler-message').inputValue(),'DEMO/SYNTHETIC iframe前の下書き');
  // Global menu's unscoped operator entry deliberately goes to the top-level page.
  await page.locator('[data-butler-menu] summary').click();
  await page.locator('[data-butler-menu]').getByRole('link',{name:'パスキー・操作確認',exact:true}).click();
  await page.waitForURL(origin+'/v2/approval/passkey/operator');assert.equal(await page.locator('#butler-passkey-frame').count(),0);
  // Exercise actual same-origin primary navigation clicks, not direct entry only.
  for(const label of ['ホーム','通知','チャット','ホーム']){
   await page.locator('[data-butler-primary-nav]').getByRole('link',{name:label,exact:true}).click();await page.waitForLoadState('domcontentloaded');
   assert.equal(await page.locator('[data-butler-primary-nav] [aria-current="page"]').textContent(),label);
  }
  assert.deepEqual(pageErrors,[],'Unexpected browser script errors');await context.close();
 }
 evidence.status='passed';
}catch(error){evidence.status='failed';evidence.errors.push(error.stack);process.exitCode=1;}
finally{
 await browser?.close();
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 globalThis.fetch=originalFetch;evidence.finishedAt=new Date().toISOString();
 await writeFile(new URL('evidence.json',directory),JSON.stringify(evidence,null,2));
 console.log(`DEMO/SYNTHETIC ${evidence.status}: ${evidence.checks.length} route/viewport/theme checks; .local/issue-856/browser/evidence.json`);
}
