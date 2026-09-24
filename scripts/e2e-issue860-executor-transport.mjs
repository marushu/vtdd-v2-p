#!/usr/bin/env node
// All browser traffic is intercepted into a synthetic Worker/provider. No live calls.
import { chromium, webkit } from '@playwright/test';
import { mkdtemp,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { transportFixture } from '../test/executor-transport-fixtures.js';
import { nodeKeys,signed } from '../test/executor-identity-fixtures.js';
import { report } from '../test/executor-failover-fixtures.js';
import { transportTokenDigest } from '../src/core/executor-transport-credential.js';
import worker from '../src/worker.js';
const browserName=process.argv.includes('--browser')?process.argv[process.argv.indexOf('--browser')+1]:'chromium';
if(!['chromium','webkit'].includes(browserName))throw Error('unsupported browser');
const output=await mkdtemp(tmpdir()+'/issue860-browser-'),results=[];
let browser,activePage;
try{
 browser=await ({chromium,webkit}[browserName]).launch({headless:true});
 for(const colorScheme of ['light','dark']){
  const f=await transportFixture(),keys=nodeKeys(),token='1'.repeat(64),nextToken='2'.repeat(64),digest=await transportTokenDigest(token),nextDigest=await transportTokenDigest(nextToken);
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme,serviceWorkers:'block'});
  await context.addCookies([{name:'vtdd_dashboard_session',value:'dashboard-session%3Atransport',domain:'example.com',path:'/',httpOnly:true,sameSite:'Lax',secure:true}]);
  const page=await context.newPage(),calls=[],errors=[];activePage=page;page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{Object.defineProperty(navigator,'credentials',{value:{get:async()=>({id:'AQIDBA',rawId:new Uint8Array([1,2,3,4]).buffer,type:'public-key',response:{authenticatorData:new Uint8Array([1]).buffer,clientDataJSON:new Uint8Array([1]).buffer,signature:new Uint8Array([1]).buffer,userHandle:null}})}});});
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!=='https://example.com')return route.abort();
   const headers=await req.allHeaders();
   // WebKit route interception can precede Cookie attachment. Forward only the
   // cookies actually in this isolated browser context to the in-process Worker.
   if (!headers.cookie) headers.cookie=(await context.cookies(req.url())).map(c=>c.name+'='+c.value).join('; ');
   if(req.method()==='POST')calls.push({path:url.pathname,body:req.postDataJSON()});
   const response=await worker.fetch(new Request(req.url(),{method:req.method(),headers,...(req.postData()?{body:req.postData()}:{})}),f.env);
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  const operator='https://example.com/v2/approval/passkey/operator?mode=executor-transport&executorId=mac&issueNumber=860';
  assert.equal((await page.goto(operator)).status(),200);await page.locator('#enrolled').filter({hasText:'未登録'}).waitFor();
  await page.locator('#newDigest').fill('invalid-digest');await page.locator('#approve').click();await page.locator('#status').filter({hasText:'確認してください'}).waitFor();assert.equal(calls.length,0);
  await page.locator('#newDigest').fill(digest);await page.locator('#approve').click();await page.locator('#status').filter({hasText:'通信digestを登録しました'}).waitFor();
  assert.equal(calls.length,3);assert.equal(calls[2].path,'/v2/executors/transport/enroll');assert.equal(calls[2].body.newDigest,digest);assert.equal(calls[2].body.previousDigest,'');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);
  await page.screenshot({path:output+'/transport-'+colorScheme+'.png',fullPage:true});results.push({scenario:'transport-enrollment',colorScheme,passed:true});
  await page.goto('https://example.com/v2/approval/passkey/operator?mode=executor-enroll&executorId=mac&issueNumber=860');await page.locator('#approve').waitFor();await page.locator('#publicKey').fill(keys.mac.raw);await page.locator('#approve').click();await page.locator('#status').filter({hasText:'公開鍵を登録しました'}).waitFor();
  const r=await f.request('/v2/executors/report',signed(keys,'report',report('mac',Date.now())),{authorization:'Executor '+token});assert.equal(r.status,202);
  await page.goto('https://example.com/v2/approval/passkey/operator?mode=failover-bootstrap&executorGeneration=0&issueNumber=860');await page.locator('#candidate').filter({hasText:'smoke確認済み'}).waitFor();assert.equal(await page.locator('#approve').isEnabled(),true);
  await page.screenshot({path:output+'/candidate-'+colorScheme+'.png',fullPage:true});results.push({scenario:'key-enroll-report-bootstrap-candidate',colorScheme,passed:true});
  assert.equal((await page.goto(operator)).status(),200);await page.locator('#enrolled').filter({hasText:'登録済み'}).waitFor();await page.locator('#previousDigest').fill(digest);await page.locator('#newDigest').fill(nextDigest);await page.locator('#approve').click();await page.locator('#status').filter({hasText:'通信digestを登録しました'}).waitFor();
  const authorize={executorId:'mac',generation:1,purpose:'dashboard_turn'};
  assert.equal((await f.request('/v2/executors/authorize',signed(keys,'authorize',authorize),{authorization:'Executor '+token})).status,403);
  const fresh=await f.request('/v2/executors/authorize',signed(keys,'authorize',authorize),{authorization:'Executor '+nextToken});assert.equal(fresh.status,200);assert.equal((await fresh.json()).reason,'bootstrap_required');
  const rekey=calls.filter(c=>c.path==='/v2/executors/transport/enroll').at(-1);assert.equal(rekey.body.previousDigest,digest);assert.equal(rekey.body.newDigest,nextDigest);
  const browserData=JSON.stringify(calls)+await page.content();assert.ok(!browserData.includes(token));assert.ok(!browserData.includes(nextToken));assert.deepEqual(errors,[]);results.push({scenario:'rekey-old-token-rejected',colorScheme,passed:true});
  await context.clearCookies();assert.equal((await page.goto(operator)).status(),401);assert.equal(await page.locator('#approve').count(),0);results.push({scenario:'unauthenticated-operator-blocked',colorScheme,passed:true});await context.close();
 }
 await writeFile(output+'/results.json',JSON.stringify(results,null,2));console.log(`${results.length} ${browserName} synthetic browser cases passed: ${output}`);
}catch(error){if(activePage){await activePage.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});console.error(await activePage.locator('body').innerText().catch(()=>''));}await writeFile(output+'/results.json',JSON.stringify(results,null,2));console.error(`Synthetic artifacts: ${output}; passed: ${results.length}`);throw error;}finally{await browser?.close();}
