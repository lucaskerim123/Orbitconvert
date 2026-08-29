import { getSupabaseAdmin } from '$lib/server/supabase';
import type { OrbitUser } from '$lib/server/auth';
import { getWorkspace, requireWorkspacePermission, isSystemAdmin } from '$lib/server/workspaces';

export const PRESETS = ['low','medium','high','custom1','custom2'] as const;
const now = () => new Date().toISOString();
const cleanPath = (v:unknown) => String(v ?? '').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'').trim();

export async function requireMcpCapability(user:OrbitUser, workspaceId:string, action:string) {
	const workspace = await getWorkspace(workspaceId);
	await requireWorkspacePermission(user,workspace,action);
	return workspace;
}

export async function listProjects(workspaceId:string) {
	const s=getSupabaseAdmin();
	const projects=await s.from('mcp_projects').select('*').eq('workspace_id',workspaceId).order('name');
	if(projects.error) throw projects.error;
	const ids=(projects.data??[]).map((p:any)=>p.id);
	const items=ids.length?await s.from('mcp_project_items').select('*').in('project_id',ids).order('id'):{data:[],error:null} as any;
	if(items.error) throw items.error;
	const byProject=new Map<string,any[]>();
	for(const item of items.data??[]) byProject.set(item.project_id,[...(byProject.get(item.project_id)||[]),item]);
	return (projects.data??[]).map((p:any)=>({...p,items:byProject.get(p.id)||[]}));
}
export async function saveProject(workspaceId:string,id:string|null,body:any,user:OrbitUser) {
	const s=getSupabaseAdmin(); const name=String(body.name||'').trim().slice(0,120);
	if(!name) throw Object.assign(new Error('Project name required'),{status:400});
	const row={workspace_id:workspaceId,name,description:String(body.description||'').slice(0,500),instructions:String(body.instructions||''),ai_behaviour:String(body.aiBehaviour??body.ai_behaviour??''),enabled:body.enabled!==false,created_by_user_id:user.id,created_by_username:user.username,updated_at:now()};
	let project:any;
	if(id){const r=await s.from('mcp_projects').update(row).eq('id',id).eq('workspace_id',workspaceId).select('*').single();if(r.error)throw r.error;project=r.data;}
	else {const r=await s.from('mcp_projects').insert({...row,created_at:now()}).select('*').single();if(r.error)throw r.error;project=r.data;}
	await s.from('mcp_project_items').delete().eq('project_id',project.id);
	const items=(Array.isArray(body.items)?body.items:[]).map((x:any)=>({project_id:project.id,item_type:x.type==='folder'?'folder':'file',item_path:cleanPath(x.path),stable_file_id:x.stableFileId||null,missing:false,created_at:now()})).filter((x:any)=>x.item_path);
	if(items.length){const r=await s.from('mcp_project_items').insert(items);if(r.error)throw r.error;}
	return {...project,items};
}

export async function deleteProject(workspaceId:string,id:string){const s=getSupabaseAdmin();const r=await s.from('mcp_projects').delete().eq('id',id).eq('workspace_id',workspaceId);if(r.error)throw r.error;return true;}

export async function listBundles(workspaceId:string){
	const s=getSupabaseAdmin();const b=await s.from('mcp_context_bundles').select('*').eq('workspace_id',workspaceId).order('name');if(b.error)throw b.error;
	const ids=(b.data??[]).map((x:any)=>x.id);const e=ids.length?await s.from('mcp_context_bundle_entries').select('*').in('bundle_id',ids).order('priority').order('sort_order'):{data:[],error:null} as any;if(e.error)throw e.error;
	const d=ids.length?await s.from('mcp_context_bundle_dependencies').select('*').in('bundle_id',ids).order('sort_order'):{data:[],error:null} as any;if(d.error)throw d.error;
	return (b.data??[]).map((x:any)=>({...x,entryCount:(e.data??[]).filter((i:any)=>i.bundle_id===x.id).length,entries:(e.data??[]).filter((i:any)=>i.bundle_id===x.id),dependencies:(d.data??[]).filter((i:any)=>i.bundle_id===x.id)}));
}
export async function getBundle(workspaceId:string,id:string){const all=await listBundles(workspaceId);const b=all.find((x:any)=>x.id===id);if(!b)throw Object.assign(new Error('Context bundle not found'),{status:404});return normalizeBundle(b);}
const normalizeBundle=(b:any)=>({...b,entries:(b.entries||[]).map((e:any)=>({type:e.entry_type,path:e.item_path,attachmentType:e.attachment_type,profileId:e.profile_id,profileName:e.profile_name,recursive:e.recursive_flag,required:e.required_flag,priority:e.priority})),dependencies:(b.dependencies||[]).map((d:any)=>({bundleId:d.depends_on_bundle_id,required:d.required_flag}))});
export async function saveBundle(workspaceId:string,id:string|null,body:any,user:OrbitUser){
	const s=getSupabaseAdmin();const name=String(body.name||'').trim().slice(0,160);if(!name)throw Object.assign(new Error('Bundle name required'),{status:400});
	let bundle:any;const base={workspace_id:workspaceId,name,description:String(body.description||'').slice(0,1000),enabled:body.enabled!==false,updated_at:now()};
	if(id){const r=await s.from('mcp_context_bundles').update({...base,version:undefined}).eq('id',id).eq('workspace_id',workspaceId).select('*').single();if(r.error)throw r.error;bundle=r.data;}
	else {const r=await s.from('mcp_context_bundles').insert({...base,created_by_user_id:user.id,created_at:now()}).select('*').single();if(r.error)throw r.error;bundle=r.data;}
	await s.from('mcp_context_bundle_entries').delete().eq('bundle_id',bundle.id);await s.from('mcp_context_bundle_dependencies').delete().eq('bundle_id',bundle.id);
	const entries=(body.entries||[]).map((e:any,i:number)=>({bundle_id:bundle.id,entry_type:e.type==='folder'?'folder':'file',item_path:cleanPath(e.path),attachment_type:e.attachmentType==='profile'?'profile':'path',profile_id:e.profileId||null,profile_name:e.profileName||null,recursive_flag:e.recursive!==false,required_flag:e.required!==false,priority:Number(e.priority||100),sort_order:i,created_at:now()})).filter((e:any)=>e.item_path);
	if(entries.length){const r=await s.from('mcp_context_bundle_entries').insert(entries);if(r.error)throw r.error;}
	const deps=(body.dependencies||[]).filter((d:any)=>d.bundleId&&d.bundleId!==bundle.id).map((d:any,i:number)=>({bundle_id:bundle.id,depends_on_bundle_id:d.bundleId,required_flag:d.required!==false,sort_order:i,created_at:now()}));
	if(deps.length){const r=await s.from('mcp_context_bundle_dependencies').insert(deps);if(r.error)throw r.error;}
	return getBundle(workspaceId,bundle.id);
}
export async function deleteBundle(workspaceId:string,id:string){const s=getSupabaseAdmin();const r=await s.from('mcp_context_bundles').delete().eq('id',id).eq('workspace_id',workspaceId);if(r.error)throw r.error;return true;}
export async function getStartup(workspaceId:string){
	const s=getSupabaseAdmin();const [startup,items,projects,profiles,bundles]=await Promise.all([
		s.from('mcp_workspace_startup').select('*').eq('workspace_id',workspaceId).maybeSingle(),
		s.from('mcp_workspace_default_items').select('*').eq('workspace_id',workspaceId).order('sort_order'),
		s.from('mcp_workspace_startup_projects').select('project_id,sort_order').eq('workspace_id',workspaceId).order('sort_order'),
		s.from('mcp_workspace_default_profiles').select('profile_id').eq('workspace_id',workspaceId).order('sort_order'),
		s.from('mcp_workspace_default_profile_bundles').select('profile_bundle_id').eq('workspace_id',workspaceId).order('sort_order')
	]);for(const r of [startup,items,projects,profiles,bundles])if(r.error)throw r.error;
	return {strength:startup.data?.strength||'medium',instructions:startup.data?.instructions||'',aiBehaviour:startup.data?.ai_behaviour||'',projectIds:(projects.data||[]).map((x:any)=>x.project_id),defaultItems:(items.data||[]).map((x:any)=>({type:x.item_type,path:x.item_path,recursive:x.item_type==='folder'})),defaultProfileIds:(profiles.data||[]).map((x:any)=>x.profile_id),defaultProfileBundleIds:(bundles.data||[]).map((x:any)=>x.profile_bundle_id)};
}
export async function saveStartup(workspaceId:string,body:any,user:OrbitUser){const s=getSupabaseAdmin();const strength=PRESETS.includes(body.strength)?body.strength:'medium';let r=await s.from('mcp_workspace_startup').upsert({workspace_id:workspaceId,strength,instructions:String(body.instructions||''),ai_behaviour:String(body.aiBehaviour||''),updated_by_user_id:user.id,updated_at:now()},{onConflict:'workspace_id'});if(r.error)throw r.error;await s.from('mcp_workspace_startup_projects').delete().eq('workspace_id',workspaceId);const rows=(body.projectIds||[]).map((id:string,i:number)=>({workspace_id:workspaceId,project_id:id,sort_order:i}));if(rows.length){r=await s.from('mcp_workspace_startup_projects').insert(rows);if(r.error)throw r.error;}return getStartup(workspaceId);}
export async function saveDefaultItems(workspaceId:string,items:any[]){const s=getSupabaseAdmin();let r=await s.from('mcp_workspace_default_items').delete().eq('workspace_id',workspaceId);if(r.error)throw r.error;const rows=(items||[]).map((x:any,i:number)=>({workspace_id:workspaceId,item_type:x.type==='folder'?'folder':'file',item_path:cleanPath(x.path),stable_file_id:x.stableFileId||null,missing:false,sort_order:i,created_at:now()})).filter((x:any)=>x.item_path);if(rows.length){r=await s.from('mcp_workspace_default_items').insert(rows);if(r.error)throw r.error;}return rows;}

export async function saveDefaultProfiles(workspaceId:string,profileIds:string[],profileBundleIds:string[]){
	const s=getSupabaseAdmin();let r=await s.from('mcp_workspace_default_profiles').delete().eq('workspace_id',workspaceId);if(r.error)throw r.error;r=await s.from('mcp_workspace_default_profile_bundles').delete().eq('workspace_id',workspaceId);if(r.error)throw r.error;
	const p=[...new Set(profileIds||[])].filter(Boolean).map((id,i)=>({workspace_id:workspaceId,profile_id:id,sort_order:i,created_at:now()}));const b=[...new Set(profileBundleIds||[])].filter(Boolean).map((id,i)=>({workspace_id:workspaceId,profile_bundle_id:id,sort_order:i,created_at:now()}));
	if(p.length){r=await s.from('mcp_workspace_default_profiles').insert(p);if(r.error)throw r.error;}if(b.length){r=await s.from('mcp_workspace_default_profile_bundles').insert(b);if(r.error)throw r.error;}return {profileIds:p.map(x=>x.profile_id),profileBundleIds:b.map(x=>x.profile_bundle_id)};
}

export async function getPresetState(workspaceId:string,projectId:string|null=null){
	const s=getSupabaseAdmin();const projectScoped=Boolean(projectId);
	const [projects,items,profiles,bundles]=projectScoped?await Promise.all([
		Promise.resolve({data:[],error:null}),s.from('mcp_project_preset_items').select('*').eq('project_id',projectId).order('sort_order'),s.from('mcp_project_preset_profiles').select('*').eq('project_id',projectId).order('sort_order'),s.from('mcp_project_preset_profile_bundles').select('*').eq('project_id',projectId).order('sort_order')
	]):await Promise.all([
		s.from('mcp_workspace_presets').select('*').eq('workspace_id',workspaceId),s.from('mcp_workspace_preset_items').select('*').eq('workspace_id',workspaceId).order('sort_order'),s.from('mcp_workspace_preset_profiles').select('*').eq('workspace_id',workspaceId).order('sort_order'),s.from('mcp_workspace_preset_profile_bundles').select('*').eq('workspace_id',workspaceId).order('sort_order')
	]);for(const r of [projects,items,profiles,bundles])if(r.error)throw r.error;
	return Object.fromEntries(PRESETS.map(key=>[key,{projectId:projectId||((projects.data||[]).find((x:any)=>x.preset===key)?.project_id??null),items:(items.data||[]).filter((x:any)=>x.preset===key).map((x:any)=>({type:x.item_type,path:x.item_path,recursive:x.recursive_flag})),profileIds:(profiles.data||[]).filter((x:any)=>x.preset===key).map((x:any)=>x.profile_id),profileBundleIds:(bundles.data||[]).filter((x:any)=>x.preset===key).map((x:any)=>x.profile_bundle_id)}]));
}
export async function savePresetState(workspaceId:string,projectId:string|null,presets:any,user:OrbitUser){
	const s=getSupabaseAdmin();const scoped=Boolean(projectId);const itemTable=scoped?'mcp_project_preset_items':'mcp_workspace_preset_items',profileTable=scoped?'mcp_project_preset_profiles':'mcp_workspace_preset_profiles',groupTable=scoped?'mcp_project_preset_profile_bundles':'mcp_workspace_preset_profile_bundles';
	const scopeCol=scoped?'project_id':'workspace_id',scopeVal=projectId||workspaceId;for(const table of [itemTable,profileTable,groupTable]){const r=await s.from(table).delete().eq(scopeCol,scopeVal);if(r.error)throw r.error;}
	if(!scoped){const r=await s.from('mcp_workspace_presets').delete().eq('workspace_id',workspaceId);if(r.error)throw r.error;}
	const itemRows:any[]=[],profileRows:any[]=[],groupRows:any[]=[],presetRows:any[]=[];
	for(const key of PRESETS){const p=presets?.[key]||{};if(!scoped)presetRows.push({workspace_id:workspaceId,preset:key,project_id:p.projectId||projectId||null,updated_by_user_id:user.id,updated_at:now()});for(const [i,x] of (p.items||[]).entries())itemRows.push({[scopeCol]:scopeVal,preset:key,item_type:x.type==='folder'?'folder':'file',item_path:cleanPath(x.path),recursive_flag:x.recursive!==false,sort_order:i,created_at:now()});for(const [i,id] of (p.profileIds||[]).entries())profileRows.push({[scopeCol]:scopeVal,preset:key,profile_id:id,sort_order:i,created_at:now()});for(const [i,id] of (p.profileBundleIds||[]).entries())groupRows.push({[scopeCol]:scopeVal,preset:key,profile_bundle_id:id,sort_order:i,created_at:now()});}
	for(const [table,rows] of [[itemTable,itemRows],[profileTable,profileRows],[groupTable,groupRows],...(!scoped?[['mcp_workspace_presets',presetRows] as any]:[])] as any[]){if(rows.length){const r=await s.from(table).insert(rows);if(r.error)throw r.error;}}
	return getPresetState(workspaceId,projectId);
}

export async function getPresetMetadata(workspaceId:string,projectId:string|null=null){const s=getSupabaseAdmin();const table=projectId?'mcp_project_preset_metadata':'mcp_workspace_preset_metadata',query=s.from(table).select('*').eq(projectId?'project_id':'workspace_id',projectId||workspaceId);const r=await query;if(r.error)throw r.error;return Object.fromEntries(PRESETS.map(key=>{const row=(r.data||[]).find((x:any)=>x.preset===key);const fallback=key==='custom1'?'Custom 1':key==='custom2'?'Custom 2':key[0].toUpperCase()+key.slice(1);return [key,{preset:key,displayName:row?.display_name||fallback,defaultDisplayName:fallback}];}));}
export async function savePresetMetadata(workspaceId:string,projectId:string|null,metadata:any,user:OrbitUser){const s=getSupabaseAdmin(),table=projectId?'mcp_project_preset_metadata':'mcp_workspace_preset_metadata',scope=projectId?{project_id:projectId}:{workspace_id:workspaceId};const rows=PRESETS.map(key=>({...scope,preset:key,display_name:String(metadata?.[key]?.displayName||metadata?.[key]||'').slice(0,80),updated_by_user_id:user.id,updated_at:now()}));const r=await s.from(table).upsert(rows,{onConflict:projectId?'project_id,preset':'workspace_id,preset'});if(r.error)throw r.error;return getPresetMetadata(workspaceId,projectId);}
export async function getPresetBundles(workspaceId:string,projectId:string|null=null){const s=getSupabaseAdmin();const table=projectId?'mcp_project_preset_bundles':'mcp_workspace_preset_bundles',scope=projectId?'project_id':'workspace_id';const r=await s.from(table).select('*,mcp_context_bundles(name)').eq(scope,projectId||workspaceId).order('sort_order');if(r.error)throw r.error;return Object.fromEntries(PRESETS.map(key=>[key,(r.data||[]).filter((x:any)=>x.preset===key).map((x:any)=>({bundleId:x.bundle_id,name:x.mcp_context_bundles?.name||'',required:x.required_flag!==false}))]));}
export async function savePresetBundles(workspaceId:string,projectId:string|null,assignments:any){const s=getSupabaseAdmin(),table=projectId?'mcp_project_preset_bundles':'mcp_workspace_preset_bundles',scope=projectId?'project_id':'workspace_id',scopeVal=projectId||workspaceId;let r=await s.from(table).delete().eq(scope,scopeVal);if(r.error)throw r.error;const rows:any[]=[];for(const key of PRESETS)for(const [i,x] of (assignments?.[key]||[]).entries())if(x.bundleId)rows.push({[scope]:scopeVal,preset:key,bundle_id:x.bundleId,required_flag:x.required!==false,sort_order:i,created_at:now()});if(rows.length){r=await s.from(table).insert(rows);if(r.error)throw r.error;}return getPresetBundles(workspaceId,projectId);}
export async function getProjectBundles(projectId:string){const s=getSupabaseAdmin();const r=await s.from('mcp_project_context_bundles').select('*,mcp_context_bundles(name)').eq('project_id',projectId).order('sort_order');if(r.error)throw r.error;return (r.data||[]).map((x:any)=>({bundleId:x.bundle_id,name:x.mcp_context_bundles?.name||'',required:x.required_flag!==false}));}
export async function saveProjectBundles(projectId:string,assignments:any[]){const s=getSupabaseAdmin();let r=await s.from('mcp_project_context_bundles').delete().eq('project_id',projectId);if(r.error)throw r.error;const rows=(assignments||[]).filter(x=>x.bundleId).map((x,i)=>({project_id:projectId,bundle_id:x.bundleId,required_flag:x.required!==false,sort_order:i,created_at:now()}));if(rows.length){r=await s.from('mcp_project_context_bundles').insert(rows);if(r.error)throw r.error;}return getProjectBundles(projectId);}

export async function registrySnapshot(){const s=getSupabaseAdmin();const clients=await s.from('mcp_clients').select('*').order('last_seen_at',{ascending:false});if(clients.error)throw clients.error;const sessions=await s.from('orbitfs_sessions').select('id,user_id,created_at,last_seen_at,user_agent,ip_address,orbitfs_users(username)').order('last_seen_at',{ascending:false}).limit(200);if(sessions.error)throw sessions.error;const mapped=(sessions.data||[]).map((x:any)=>({id:x.id,username:x.orbitfs_users?.username||'Unknown user',workspaceId:null,provider:'orbitfs-cloud',status:'active',connectedAt:x.created_at,lastSeenAt:x.last_seen_at,idle:false,requestCount:0}));return {clients:(clients.data||[]).map((x:any)=>({clientId:x.id,clientName:x.client_name,status:x.status,createdAt:x.first_seen_at,lastSeenAt:x.last_seen_at,activeTokens:0,users:x.user_id?[x.user_id]:[],workspaceIds:x.metadata?.workspaceIds||[],permissions:x.metadata?.permissions||{read:true,write:true},redirectUris:x.metadata?.redirectUris||[]})),connected:mapped,recent:mapped,sessions:mapped};}
export async function updateClient(id:string,patch:any){const s=getSupabaseAdmin();const current=await s.from('mcp_clients').select('*').eq('id',id).maybeSingle();if(current.error)throw current.error;if(!current.data)throw Object.assign(new Error('MCP client not found'),{status:404});const metadata={...(current.data.metadata||{}),...(patch.permissions?{permissions:patch.permissions}: {})};const r=await s.from('mcp_clients').update({status:['active','blocked','revoked'].includes(patch.status)?patch.status:current.data.status,metadata,last_seen_at:now()}).eq('id',id);if(r.error)throw r.error;return true;}
export const DEFAULT_MCP_POLICY={oss:{enabled:true,allowCustomNames:true,allowedStrengths:['low','medium','high','custom1','custom2'],defaultStrength:'medium',maxPresetNameLength:40,maxBundlesPerPreset:20,maxFilesPerStartup:500,maxCharactersPerStartup:500000,maxLoadSeconds:120},ccs:{enabled:true,maxBundlesPerWorkspace:100,maxEntriesPerBundle:500,maxDependenciesPerBundle:30,maxDependencyDepth:10,allowProfiles:true}};
export async function getMcpPolicy(){const s=getSupabaseAdmin();const r=await s.from('orbitfs_settings').select('value').eq('scope_type','global').eq('scope_id','').eq('key','mcp_admin_policy').maybeSingle();if(r.error)throw r.error;return {...DEFAULT_MCP_POLICY,...(r.data?.value||{}),oss:{...DEFAULT_MCP_POLICY.oss,...(r.data?.value?.oss||{})},ccs:{...DEFAULT_MCP_POLICY.ccs,...(r.data?.value?.ccs||{})}};}
export async function saveMcpPolicy(policy:any){const s=getSupabaseAdmin();const next={...(await getMcpPolicy()),...(policy||{}),oss:{...DEFAULT_MCP_POLICY.oss,...(policy?.oss||{})},ccs:{...DEFAULT_MCP_POLICY.ccs,...(policy?.ccs||{})}};const r=await s.from('orbitfs_settings').upsert({scope_type:'global',scope_id:'',key:'mcp_admin_policy',value:next},{onConflict:'scope_type,scope_id,key'});if(r.error)throw r.error;return next;}
export async function mcpLogs(limit=200){const s=getSupabaseAdmin();const r=await s.from('mcp_audit_log').select('*').order('created_at',{ascending:false}).limit(Math.max(1,Math.min(500,limit)));if(r.error)throw r.error;return r.data||[];}
export async function writeMcpAudit(scopeId:string,actorUserId:string|null,eventType:string,details:any={}){const s=getSupabaseAdmin();const r=await s.from('mcp_audit_log').insert({scope_id:scopeId||'public',actor_user_id:actorUserId,event_type:eventType,details,created_at:now()});if(r.error)throw r.error;}
