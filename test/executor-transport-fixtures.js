// Synthetic passkey provider only. Production uses the existing real WebAuthn adapter.
import worker from '../src/worker.js';
import { createInMemoryMemoryProvider } from '../src/core/memory-provider.js';
import { createInMemoryExecutorStore } from '../src/core/executor-failover-state.js';
export async function transportFixture() {
 const provider=createInMemoryMemoryProvider();
 for(const [id,type,content,tags] of [
  ['passkey:AQIDBA','working_memory',{kind:'passkey_registry',credentialId:'AQIDBA',publicKey:'BQYHCA',counter:1,transports:['internal']},['passkey_registry']],
  ['dashboard-session:transport','approval_log',{kind:'dashboard_read_session',status:'active',expiresAt:new Date(Date.now()+600000).toISOString(),scope:{actionType:'read',highRiskKind:'dashboard_access'}},['dashboard_read_session']]
 ]){const r=await provider.store({id,type,content,tags,metadata:{source:'synthetic'},priority:80,createdAt:new Date().toISOString()});if(!r.ok)throw Error(JSON.stringify(r));}
 const env={MEMORY_PROVIDER:provider,EXECUTOR_STORE:createInMemoryExecutorStore(),VTDD_GATEWAY_BEARER_TOKEN:'legacy-fixture',PASSKEY_ADAPTER:{async generateAuthenticationOptions(input){return {challenge:Buffer.from(input.challenge).toString('base64url'),allowCredentials:input.allowCredentials};},async verifyAuthenticationResponse(){return {verified:true,authenticationInfo:{newCounter:2}};}}};
 const cookie='vtdd_dashboard_session=dashboard-session%3Atransport';
 const request=(path,body,headers={cookie})=>worker.fetch(new Request('https://example.com'+path,{method:body?'POST':'GET',headers:{origin:'https://example.com','content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}),env);
 const approve=async(body,kind='executor_transport_enroll')=>{
  const challenge=await request('/v2/approval/passkey/challenge',{...body,highRiskKind:kind,policyInput:{actionType:'destructive',highRiskKind:kind}});
  if(challenge.status!==200)throw Error('challenge '+challenge.status+' '+await challenge.text());
  const c=await challenge.json();const verified=await request('/v2/approval/passkey/verify',{sessionId:c.sessionId,response:{id:'AQIDBA',response:{}}});
  if(verified.status!==200)throw Error('verify '+verified.status+' '+await verified.text());
  const v=await verified.json();return v.approvalGrant?.approvalId||v.approvalGrantId;
 };
 return {env,request,approve,cookie};
}
