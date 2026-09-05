import type { OrbitUser } from '$lib/server/auth';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { getWorkspace,requireWorkspaceAccess,requireWorkspacePermission,isSystemAdmin } from '$lib/server/workspaces';
import { analyzeCloudRouting } from '$lib/server/routing-engine-cloud';
import { createLibraryChangeRequest,listLibraryChangeRequests } from '$lib/server/library';

const now=()=>new Date().toISOString();
const fail=(m:string,s=400,c='APEX_ERROR')=>Object.assign(new Error(m),{status:s,code:c});
export const APEX_POLICY_DEFAULTS={serviceMode:'on_demand',fullShutdown:false,standby:true,forceManualScan:true,blockAutomation:false,idleTimeoutMs:10000};

export async function apexPolicy(user:OrbitUser){
  if(!isSystemAdmin(user))throw fail('System Owner or Admin required',403);
  const db=getSupabaseAdmin();const r=await db.from('orbitfs_settings').select('value').eq('scope_type','global').eq('scope_id','').eq('key','apex.cloud.policy').maybeSingle();if(r.error)throw r.error;
  return {...APEX_POLICY_DEFAULTS,...((r.data?.value&&typeof r.data.value==='object')?r.data.value:{})};
}
export async function saveApexPolicy(user:OrbitUser,input:any={}){
  if(!isSystemAdmin(user))throw fail('System Owner or Admin required',403);
  const current=await apexPolicy(user);const next={...current,serviceMode:input.serviceMode==='automatic'?'automatic':'on_demand',fullShutdown:input.fullShutdown===true,standby:input.standby!==false,forceManualScan:true,blockAutomation:input.blockAutomation===true,idleTimeoutMs:Math.max(5000,Math.min(300000,Number(input.idleTimeoutMs||10000)))};
  const db=getSupabaseAdmin();const r=await db.from('orbitfs_settings').upsert({scope_type:'global',scope_id:'',key:'apex.cloud.policy',value:next,updated_at:now()},{onConflict:'scope_type,scope_id,key'});if(r.error)throw r.error;return next;
}
export function apexEngineState(){return {state:'standby',ok:true,operational:true,residentProcess:false,mode:'serverless',sorter:{available:true,target:'library-memory'},converter:{state:'stopped',available:false,reason:'No native conversion worker is attached to this Vercel deployment'}};}
export async function apexWorkspaceStatus(user:OrbitUser,workspaceId:string){
  const ws=await getWorkspace(workspaceId);await requireWorkspaceAccess(user,ws);
  const requests=await listLibraryChangeRequests(user,workspaceId,{sourceSystem:'apex'});
  return {workspaceId,engine:apexEngineState(),queue:(requests.requests||[]).filter((x:any)=>['pending','needs_target','applying'].includes(x.status)),history:(requests.requests||[]).filter((x:any)=>!['pending','needs_target','applying'].includes(x.status)).slice(0,100),filesystem:false};
}
export async function apexAnalyze(user:OrbitUser,workspaceId:string,input:any={}){
  const ws=await getWorkspace(workspaceId);await requireWorkspaceAccess(user,ws);
  const policy=isSystemAdmin(user)?await apexPolicy(user).catch(()=>APEX_POLICY_DEFAULTS):APEX_POLICY_DEFAULTS;
  if(policy.fullShutdown)throw fail('APEX is fully shut down by the system administrator',423,'APEX_SHUTDOWN');
  if(policy.blockAutomation&&input.automatic===true)throw fail('APEX automation is blocked by the system administrator',403,'APEX_AUTOMATION_BLOCKED');
  return analyzeCloudRouting(user,workspaceId,input.entry||input,{...(input.settings||{}),enabled:true});
}
export async function apexQueueSuggestion(user:OrbitUser,workspaceId:string,input:any={}){
  const ws=await getWorkspace(workspaceId);await requireWorkspacePermission(user,ws,'sorter_add_to_queue');
  const suggestion=input.suggestion||{},entry=input.entry||{};
  let operation:any;
  if(suggestion.kind==='profile_record_add')operation={type:'profile_record_add',profileId:suggestion.profileId||null,sectionId:suggestion.sectionId||'records',title:entry.title||suggestion.label||'APEX suggestion',content:entry.content||entry.content_text||'',date:entry.date||entry.entryDate||null,category:entry.category||'apex'};
  else if(suggestion.kind==='library_item_update'&&suggestion.itemId)operation={type:'library_item_update',itemId:suggestion.itemId,fields:{content:entry.content||entry.content_text||''}};
  else operation={type:'knowledge_record_add',role:suggestion.role||'general_record_target',itemId:suggestion.existing?.itemId||null,title:entry.title||suggestion.label||'APEX suggestion',content:entry.content||entry.content_text||'',date:entry.date||entry.entryDate||null,category:entry.category||'apex'};
  const request=await createLibraryChangeRequest(user,workspaceId,{source:{system:'apex',title:entry.title||suggestion.label||'APEX routing suggestion'},sourceSnapshot:{entry,suggestion},summary:`APEX: ${entry.title||suggestion.label||'Knowledge routing suggestion'}`,reason:suggestion.reason||input.reason||'APEX routing suggestion',operations:[operation]});
  return {queued:true,request};
}
