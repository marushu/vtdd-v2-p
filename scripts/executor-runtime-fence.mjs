import { executorTransportAuthorization } from './executor-transport-token.mjs';
import { signExecutorRequest } from './sign-executor-request.mjs';
import { readPrivateJson } from './executor-private-file.mjs';
// Transport bearer plus enrolled Ed25519 identity; admission cannot revoke in-flight writes.
export async function authorizeRuntimeExecutor({ purpose, runtimeUrl, token, env=process.env, fetchImpl=globalThis.fetch, expectedExecutor=null }={}) {
  try {
    const config=env.VTDD_EXECUTOR_CONFIG_PATH ? await readPrivateJson(env.VTDD_EXECUTOR_CONFIG_PATH) : {executorId:env.VTDD_EXECUTOR_ID,generation:Number(env.VTDD_EXECUTOR_GENERATION)};
    if(expectedExecutor && (config.executorId !== expectedExecutor.executorId || config.generation !== expectedExecutor.generation)) return {allowed:false,reason:'executor_monitor_identity_mismatch'};
    if(!['mac','vps'].includes(config.executorId) || !Number.isSafeInteger(config.generation) || config.generation<1) return {allowed:false,reason:'executor_identity_required'};
    const origin=new URL(runtimeUrl || config.origin || env.VTDD_RUNTIME_URL);
    if(origin.protocol!=='https:' || origin.username || origin.password) return {allowed:false,reason:'executor_origin_invalid'};
    const authorization=await executorTransportAuthorization(config,{token,env});
    const response=await fetchImpl(new URL('/v2/executors/authorize',origin),{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json',authorization},body:JSON.stringify(await signExecutorRequest(config,'authorize',{executorId:config.executorId,generation:config.generation,purpose}))});
    if(!response.ok)return {allowed:false,reason:'executor_authorization_unavailable'};
    const result=await response.json();
    return result.allowed===true && result.reason==='authorized' ? {allowed:true,reason:'authorized'} : {allowed:false,reason:'executor_blocked'};
  }catch {return {allowed:false,reason:'executor_authorization_unavailable'};}
}
export async function requireRuntimeExecutor(authorize) {
  const result=await authorize();
  if(result?.allowed!==true)throw Error('executor_fenced: 実行基盤の承認・世代・稼働状態を確認してください');
}
