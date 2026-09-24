import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {deploymentWorker,createFixture,humanRoutes} from '../scripts/issue856-route-fixtures.mjs';
test('deployment-like second bundle keepNames: every inline script compiles; shell executes without serialization helpers',async()=>{
 const worker=await deploymentWorker(),fixture=await createFixture();
 for(const path of humanRoutes){
  const html=await(await fixture.request(worker,path)).text();
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1],{filename:path});
  const script=html.match(/<script data-butler-client>([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(script,/__name|Function\.toString/);
  vm.runInNewContext(script,{document:{querySelector:()=>null,addEventListener(){},body:{dataset:{butlerShell:'page'}},documentElement:{style:{setProperty(){}}}},window:{innerHeight:844,addEventListener(){}},setTimeout});
  if(path==='/dashboard')assert.doesNotMatch(html.match(/<script>([\s\S]*?)<\/script>/)[1],/__name/);
 }
});
