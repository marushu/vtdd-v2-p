export const now = Date.parse('2026-01-01T12:00:00.000Z');
export const stamp = n => new Date(n).toISOString();
export const checkpoint = (n=now) => ({repository:'sample/project',issueNumber:858,pullNumber:null,branch:'issue-858',baseRef:'main',headSha:'a'.repeat(40),dirty:false,unpushed:false,lastSuccessfulAction:'tests_passed',nextSafeAction:'review',generation:1,updatedAt:stamp(n)});
export const report = (id='mac',n=now) => ({executorId:id,generation:1,observedAt:stamp(n),heartbeatAt:stamp(n),codexVersion:'1.2.3',appServerSmokeOk:true,serviceState:'inactive',...(id==='mac'?{checkpoint:checkpoint(n)}:{})});
export const seed = (n=now) => ({primaryExecutor:'mac',standbyExecutor:'vps',approvedCodexVersion:'1.2.3',macReport:report('mac',n)});
export const transition = () => ({expectedGeneration:1,executorFrom:'mac',executorTo:'vps',issueNumber:858,targetConfirmed:true,reason:'owner_manual_transition'});
