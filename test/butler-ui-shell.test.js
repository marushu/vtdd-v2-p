import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {butlerUiStyles,butlerMenuItems,butlerActivePage,butlerMenuCurrentHref,renderButlerDocument,renderButlerPrimaryNav} from '../src/core/butler-ui-shell.js';
import {butlerUiClientScript} from '../src/core/butler-ui-client.generated.js';
test('one safe fixed menu and primary nav; caller input cannot inject navigation',()=>{
 const html=renderButlerDocument('<html><head></head><body></body></html>',{active:'"><script>alert(1)</script>',layout:'"><img>'});
 assert.equal((html.match(/<nav\b[^>]*data-butler-primary-nav/g)||[]).length,1);
 assert.doesNotMatch(html,/alert\(1\)|<img>/);
 assert.equal(new Set(butlerMenuItems.map(i=>i[1])).size,butlerMenuItems.length);
 for(const [,href] of butlerMenuItems){assert.match(href,/^\/(?!\/)/);assert.equal(new URL(href,'https://example.test').origin,'https://example.test');assert.doesNotMatch(href,/token|auth=|secret|javascript:|[<>"\\]/i);}
 for(const bad of ['//evil/dashboard','https://evil/dashboard','/\\evil/dashboard','/dashboard\n']) assert.equal(butlerActivePage(bad),'');
 assert.equal(butlerActivePage('/dashboard?threadId=demo'),'chat');assert.equal(butlerActivePage('/orchestrator'),'chat');assert.equal(butlerActivePage('/dashboard'),'home');
 assert.equal((renderButlerPrimaryNav('chat').match(/aria-current/g)||[]).length,1);
});
test('approved light/dark semantics and namespaced navigation styles',()=>{
 for(const color of ['#faf8f4','#fffefa','#282725','#68645f','#9f3935','#1d1c1b','#282624','#f4efe8','#bdb5ab','#eeaaa1'])assert.ok(butlerUiStyles.includes(color));
 assert.doesNotMatch(butlerUiStyles,/(?:^|\})\s*(?:nav|header|main)\s*\{/);
 assert.match(butlerUiStyles,/prefers-reduced-motion/);assert.match(butlerUiStyles,/min-height:44px/);assert.match(butlerUiStyles,/safe-area-inset-bottom/);
});
function clientFixture() {
 const events={},menuEvents={},viewportEvents={},properties={},timers=[];let focused=0;
 const summary={focus(){focused++;},getBoundingClientRect:()=>({bottom:80})};
 const anchor={};
 const menu={open:true,querySelector:()=>summary,contains:n=>n===summary||n===anchor,addEventListener:(k,v)=>menuEvents[k]=v};
 const document={querySelector:selector=>selector==='[data-butler-menu]'?menu:selector==='[data-butler-header]'?{getBoundingClientRect:()=>({height:84})}:selector==='[data-butler-primary-nav]'?{getBoundingClientRect:()=>({height:99})}:null,activeElement:summary,addEventListener:(k,v)=>events[k]=v,body:{dataset:{butlerShell:'chat'}},documentElement:{style:{setProperty:(k,v)=>properties[k]=v}}};
 const viewport={height:400,offsetTop:20,addEventListener:(k,v)=>viewportEvents[k]=v};
 vm.runInNewContext(butlerUiClientScript,{document,window:{visualViewport:viewport,addEventListener(){}},setTimeout:fn=>timers.push(fn)});
 return {events,menuEvents,viewportEvents,properties,timers,summary,anchor,menu,document,viewport,focused:()=>focused};
}
test('SUMMARY to anchor focusout retains menu even while activeElement is BODY',()=>{
 const f=clientFixture();f.document.activeElement={};
 f.menuEvents.focusout({relatedTarget:f.anchor});
 assert.equal(f.menu.open,true);assert.equal(f.timers.length,0);
 f.document.activeElement=f.anchor;
 f.menuEvents.focusout({relatedTarget:f.summary});assert.equal(f.menu.open,true);
 f.events.pointerdown({target:f.anchor});assert.equal(f.menu.open,true);
 assert.equal(f.menuEvents.click,undefined,'native link navigation must not be preempted by closing');
 f.events.keydown({key:'Escape',preventDefault(){}});assert.equal(f.menu.open,false);assert.equal(f.focused(),1);
});
test('outside focus closes; null relatedTarget waits for settled focus instead of a microtask',()=>{
 const f=clientFixture();f.menuEvents.focusout({relatedTarget:{}});assert.equal(f.menu.open,false);
 f.menu.open=true;f.document.activeElement={};f.menuEvents.focusout({relatedTarget:null});assert.equal(f.menu.open,true);
 f.document.activeElement=f.anchor;f.timers.shift()();assert.equal(f.menu.open,true);
 f.menuEvents.focusout({relatedTarget:null});f.document.activeElement={};f.timers.shift()();assert.equal(f.menu.open,false);
 f.menu.open=true;f.events.pointerdown({target:{}});assert.equal(f.menu.open,false);
});
test('visualViewport offsetTop and height events reserve measured header and bound the open menu',()=>{
 const f=clientFixture();assert.equal(f.properties['--butler-header-reserve'],'84px');
 f.viewport.height=290;f.viewport.offsetTop=75;f.viewportEvents.resize();f.viewportEvents.scroll();
 assert.equal(f.properties['--butler-viewport-height'],'290px');assert.equal(f.properties['--butler-viewport-top'],'75px');
 assert.equal(f.document.body.dataset.butlerCompact,'true');
 f.viewport.height=844;f.viewportEvents.resize();assert.equal(f.document.body.dataset.butlerCompact,'false');
 f.viewport.height=290;f.viewportEvents.resize();
 assert.equal(f.properties['--butler-menu-max-height'],'170px');
 assert.doesNotMatch(butlerUiClientScript,/fetch\(|WebSocket|\.submit\(|localStorage|\.value\s*=/);
});
test('metadata is canonical once; menu current never copies scope; iframe links explicitly target top',()=>{
 const html=renderButlerDocument('<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta content="old" name="viewport"><meta name="theme-color" content="#050505"><link rel="manifest" href="/dashboard.webmanifest"></head><body></body></html>',{pagePath:'/setup/latest?repository=private&token=secret'});
 assert.equal((html.match(/name="viewport"/g)||[]).length,1);assert.match(html,/viewport-fit=cover/);
 assert.equal((html.match(/name="theme-color"/g)||[]).length,2);assert.doesNotMatch(html,/#050505|private|secret/);
 assert.match(html,/href="\/setup\/latest" target="_top" aria-current="page"/);
 assert.match(html,/rel="manifest" href="\/dashboard.webmanifest"/);
 const anchors=[...html.matchAll(/<a [^>]+>/g)];assert.ok(anchors.every(([markup])=>markup.includes('target="_top"')));
 assert.equal(butlerMenuCurrentHref('/mvp/approval/passkey/operator?mode=deploy&repository=demo'),'\/v2/approval/passkey/operator');
 assert.equal(butlerMenuCurrentHref('/v2/approval/passkey/operator?mode=dashboard&dashboardReturnPath=%2Fdashboard'),'\/v2/approval/passkey/operator?mode=dashboard');
 assert.equal(butlerMenuCurrentHref('//outside.invalid/setup'),'');
 assert.ok(!butlerMenuItems.some(([,href])=>/mode=(merge|deploy)/.test(href)));
});
