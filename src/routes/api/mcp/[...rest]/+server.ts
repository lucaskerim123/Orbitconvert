import { json, error } from '@sveltejs/kit';
import { requireAdmin, requireUser } from '$lib/server/auth';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { assertMcpLicensed, auditMcp, getMcpAddonRow, getMcpRuntimeState, assertMcpRunning } from '$lib/server/mcp-cloud';
import {
	deleteContextBundle, deleteMcpProject, getContextBundle, getPresetBundles,
	getPresetMetadata, getPresets, getStartup, listContextBundles, listMcpProjects,
	projectBundleAssignments, requireMcpWorkspace, saveContextBundle, saveDefaultItems,
	saveDefaultProfiles, saveMcpProject, savePresetBundles, savePresetMetadata,
	savePresets, saveProjectBundleAssignments, saveStartup
} from '$lib/server/mcp-workspace-state';

const now = () => new Date().toISOString();
const ok = (body: unknown) => json(body);

async function setting(scopeType:string, scopeId:string|null, key:string) {
	const db=getSupabaseAdmin();
	let q=db.from('orbitfs_settings').select('value').eq('scope_type',scopeType).eq('key',key);
	q=scopeId===null?q.is('scope_id',null):q.eq('scope_id',scopeId);
	const r=await q.maybeSingle(); if(r.error)throw r.error; return r.data?.value??null;
}
async function saveSetting(scopeType:string,scopeId:string|null,key:string,value:unknown){
	const db=getSupabaseAdmin();
	let q=db.from('orbitfs_settings').select('id').eq('scope_type',scopeType).eq('key',key);
	q=scopeId===null?q.is('scope_id',null):q.eq('scope_id',scopeId);
	const current=await q.maybeSingle();
	if(current.data?.id){const r=await db.from('orbitfs_settings').update({value,updated_at:now()}).eq('id',current.data.id);if(r.error)throw r.error;}
	else {const r=await db.from('orbitfs_settings').insert({scope_type:scopeType,scope_id:scopeId,key,value});if(r.error)throw r.error;}
}

async function runtimePayload(){
	const db=getSupabaseAdmin(); const addon=await getMcpAddonRow();
	const runtime={ data: await getMcpRuntimeState() };
	let licensed=false;try{await assertMcpLicensed();licensed=true;}catch{}
	return {online:addon?.attached===true&&addon?.status!=='uninstalled'&&runtime.data?.service_status==='online',serviceStatus:runtime.data?.service_status||'online',lastChangedAt:runtime.data?.updated_at||null,mode:runtime.data?.mode||'workspace',
		workspaceIntegration:runtime.data?.workspace_addon_active!==false,connectorPath:'/mcp',licensed,
		attached:addon?.attached===true,publicBaseUrl:addon?.deployment_url||null,compute:'vercel',database:'supabase'};
}
async function registryPayload(){
	const db=getSupabaseAdmin();
	const [clientResult,sessionResult]=await Promise.all([
		db.from('mcp_clients').select('*').order('last_seen_at',{ascending:false}),
		db.from('mcp_sessions').select('*').order('last_seen_at',{ascending:false}).limit(250)]);
	const clients=clientResult.data??[],sessions=sessionResult.data??[];
	const mappedClients=clients.map((c:any)=>({clientId:c.id,clientName:c.client_name,status:c.status,
		createdAt:c.first_seen_at,lastSeenAt:c.last_seen_at,
		activeTokens:sessions.filter((s:any)=>s.client_id===c.id&&s.status==='active').length,
		users:[...new Set(sessions.filter((s:any)=>s.client_id===c.id).map((s:any)=>s.username).filter(Boolean))],
		workspaceIds:c.workspace_ids||[],permissions:c.permissions||{read:true,write:true},redirectUris:c.redirect_uris||[]}));
	const mappedSessions=sessions.map((s:any)=>({id:s.id,username:s.username||'Unknown user',workspaceId:s.workspace_id,
		provider:s.provider||'mcp',status:s.status,connectedAt:s.connected_at,lastSeenAt:s.last_seen_at,
		idle:s.status!=='active',requestCount:s.request_count||0}));
	return {clients:mappedClients,connected:mappedSessions.filter((s:any)=>s.status==='active'),recent:mappedSessions.slice(0,50),sessions:mappedSessions};
}
export async function GET({cookies,params,url}){
	const user=await requireUser(cookies);await assertMcpLicensed();
	const parts=String(params.rest||'').split('/').filter(Boolean),db=getSupabaseAdmin();
	if(parts[0]==='runtime'||parts[0]==='master-control')return ok(await runtimePayload());
	await assertMcpRunning();
	if(parts[0]==='logs'){
		if(!['owner','admin'].includes(user.role))throw error(403,'Administrator access required');
		const limit=Math.min(500,Math.max(1,Number(url.searchParams.get('limit')||250)));
		const r=await db.from('mcp_audit_log').select('*').order('created_at',{ascending:false}).limit(limit);
		if(r.error)throw r.error;return ok({logs:r.data||[]});
	}
	if(parts[0]==='registry'){await requireAdmin(cookies);return ok(await registryPayload());}
	if(parts[0]==='admin-policy'){
		await requireAdmin(cookies);const policy=await setting('global',null,'mcp.admin_policy');
		return ok({policy:policy||{oss:{enabled:true,allowedStrengths:['low','medium','high','custom1','custom2'],maxBundlesPerPreset:20},ccs:{enabled:true,maxBundlesPerWorkspace:100,maxEntriesPerBundle:500,maxDependenciesPerBundle:50,maxDependencyDepth:8,allowProfiles:true}}});
	}
	if(parts[0]==='workspaces'&&parts[1]){
		const ws=parts[1];await requireMcpWorkspace(user,ws);const projectId=url.searchParams.get('projectId');
		if(parts[2]==='projects'&&!parts[3])return ok({projects:await listMcpProjects(ws)});
		if(parts[2]==='projects'&&parts[3]&&parts[4]==='context-bundles')return ok({assignments:await projectBundleAssignments(parts[3])});
		if(parts[2]==='context-bundles'&&!parts[3])return ok({bundles:await listContextBundles(ws)});
		if(parts[2]==='context-bundles'&&parts[3])return ok({bundle:await getContextBundle(ws,parts[3])});
		if(parts[2]==='startup')return ok({startup:await getStartup(ws)});
		if(parts[2]==='presets')return ok({presets:await getPresets(ws,projectId)});
		if(parts[2]==='preset-metadata')return ok({metadata:await getPresetMetadata(ws,projectId)});
		if(parts[2]==='preset-bundles')return ok({assignments:await getPresetBundles(ws,projectId)});
		if(parts[2]==='setup')return ok({config:(await setting('workspace',ws,'mcp.workspace_config'))||{
			master:{autoLoadPanelWorkspaceAi:true,includeProfiles:true,allowSearch:true,allowContextLoad:true,loadOrder:[]},
			settings:{searchMode:'hybrid',autoLoad:true,defaultPaths:[],folderTemplate:[]},
			startupInstructions:'',chatgptInstructions:'',loadOrderText:''}});
	}
	throw error(404,'MCP route not found');
}
export async function PUT({cookies,params,request,url}){
	const user=await requireUser(cookies);await assertMcpLicensed();await assertMcpRunning();
	const parts=String(params.rest||'').split('/').filter(Boolean),body=await request.json().catch(()=>({}));
	if(parts[0]==='admin-policy'){
		await requireAdmin(cookies);const policy=body.policy||body;await saveSetting('global',null,'mcp.admin_policy',policy);
		await auditMcp('admin_policy.updated',{policy},user.id);return ok({policy,applied:true});
	}
	if(parts[0]==='workspaces'&&parts[1]){
		const ws=parts[1],projectId=body.projectId||url.searchParams.get('projectId')||null;
		if(parts[2]==='setup'){
			await requireMcpWorkspace(user,ws,'manage_mcp_settings');await saveSetting('workspace',ws,'mcp.workspace_config',body||{});
			await auditMcp('workspace_config.updated',{workspaceId:ws},user.id,ws);return ok({config:body||{}});
		}
		if(parts[2]==='projects'&&parts[3]&&!parts[4]){
			await requireMcpWorkspace(user,ws,'manage_mcp_projects');const project=await saveMcpProject(ws,user,body,parts[3]);
			await auditMcp('project.updated',{projectId:parts[3]},user.id,ws);return ok({project});
		}
		if(parts[2]==='projects'&&parts[3]&&parts[4]==='context-bundles'){
			await requireMcpWorkspace(user,ws,'manage_mcp_projects');await saveProjectBundleAssignments(parts[3],body.assignments||[]);
			return ok({assignments:await projectBundleAssignments(parts[3])});
		}
		if(parts[2]==='context-bundles'&&parts[3]){
			await requireMcpWorkspace(user,ws,'manage_mcp_startup');const bundle=await saveContextBundle(ws,user,body,parts[3]);
			await auditMcp('context_bundle.updated',{bundleId:parts[3]},user.id,ws);return ok({bundle});
		}
		if(parts[2]==='startup'){await requireMcpWorkspace(user,ws,'manage_mcp_startup');return ok({startup:await saveStartup(ws,user,body)});}
		if(parts[2]==='default-items'){await requireMcpWorkspace(user,ws,'manage_mcp_startup');await saveDefaultItems(ws,body.items||[]);return ok({items:body.items||[]});}
		if(parts[2]==='default-profiles'){await requireMcpWorkspace(user,ws,'manage_mcp_startup');await saveDefaultProfiles(ws,body.profileIds||[],body.profileBundleIds||[]);return ok({profileIds:body.profileIds||[],profileBundleIds:body.profileBundleIds||[]});}
		if(parts[2]==='presets'){await requireMcpWorkspace(user,ws,'manage_mcp_startup');return ok({presets:await savePresets(ws,user,body,projectId)});}
		if(parts[2]==='preset-bundles'){await requireMcpWorkspace(user,ws,'manage_mcp_startup');return ok({assignments:await savePresetBundles(ws,body.assignments||{},projectId)});}
		if(parts[2]==='preset-metadata'){await requireMcpWorkspace(user,ws,'manage_mcp_preset_names');return ok({metadata:await savePresetMetadata(ws,user,body.metadata||{},projectId)});}
	}
	throw error(404,'MCP route not found');
}
export async function PATCH({cookies,params,request}){
	const user=await requireAdmin(cookies);await assertMcpLicensed();await assertMcpRunning();
	const parts=String(params.rest||'').split('/').filter(Boolean);
	if(parts[0]!=='registry'||parts[1]!=='clients'||!parts[2])throw error(404,'MCP route not found');
	const body=await request.json().catch(()=>({})),patch:Record<string,unknown>={};
	if(body.status)patch.status=body.status;if(body.permissions)patch.permissions=body.permissions;if(body.workspaceIds)patch.workspace_ids=body.workspaceIds;
	const db=getSupabaseAdmin(),r=await db.from('mcp_clients').update({...patch,last_seen_at:now()}).eq('id',decodeURIComponent(parts[2]));
	if(r.error)throw r.error;await auditMcp('client.updated',{clientId:parts[2],...patch},user.id);return ok({updated:true});
}

export async function POST({cookies,params,request}){
	const user=await requireUser(cookies);await assertMcpLicensed();
	const parts=String(params.rest||'').split('/').filter(Boolean),db=getSupabaseAdmin();
	if(parts[0]==='master-control'){
		await requireAdmin(cookies);
		const body=await request.json().catch(()=>({}));
		const action=String(body.action||'').toLowerCase();
		if(!['start','stop','restart'].includes(action))throw error(400,'Invalid MCP control action');
		if(action==='restart'){
			await db.from('mcp_runtime_state').update({service_status:'restarting',updated_at:now()}).eq('id',1);
			await auditMcp('runtime.restarting',{},user.id);
		}
		const service_status=action==='stop'?'stopped':'online';
		const r=await db.from('mcp_runtime_state').update({service_status,updated_at:now()}).eq('id',1).select('*').single();
		if(r.error)throw r.error;
		await auditMcp(`runtime.${action}`,{service_status},user.id);
		return ok({ok:true,action,serviceStatus:service_status,runtime:r.data});
	}
	await assertMcpRunning();
	if(parts[0]==='workspaces'&&parts[1]){
		const ws=parts[1],body=await request.json().catch(()=>({}));
		if(parts[2]==='projects'&&!parts[3]){await requireMcpWorkspace(user,ws,'manage_mcp_projects');const project=await saveMcpProject(ws,user,body);await auditMcp('project.created',{projectId:project?.id},user.id,ws);return ok({project});}
		if(parts[2]==='context-bundles'&&!parts[3]){await requireMcpWorkspace(user,ws,'manage_mcp_startup');const bundle=await saveContextBundle(ws,user,body);await auditMcp('context_bundle.created',{bundleId:bundle?.id},user.id,ws);return ok({bundle});}
	}
	await requireAdmin(cookies);
	if(parts[0]==='registry'&&parts[1]==='clients'&&parts[2]&&parts[3]==='disconnect'){
		const clientId=decodeURIComponent(parts[2]);await db.from('mcp_sessions').update({status:'revoked',last_seen_at:now()}).eq('client_id',clientId).eq('status','active');
		await auditMcp('client.disconnected',{clientId},user.id);return ok({disconnected:true});
	}
	if(parts[0]==='registry'&&parts[1]==='sessions'&&parts[2]&&parts[3]==='disconnect'){
		const sessionId=decodeURIComponent(parts[2]);await db.from('mcp_sessions').update({status:'revoked',last_seen_at:now()}).eq('id',sessionId);
		await auditMcp('session.disconnected',{sessionId},user.id);return ok({disconnected:true});
	}
	throw error(404,'MCP route not found');
}

export async function DELETE({cookies,params}){
	const user=await requireUser(cookies);await assertMcpLicensed();await assertMcpRunning();
	const parts=String(params.rest||'').split('/').filter(Boolean);
	if(parts[0]==='workspaces'&&parts[1]){
		const ws=parts[1];
		if(parts[2]==='projects'&&parts[3]){await requireMcpWorkspace(user,ws,'manage_mcp_projects');await deleteMcpProject(ws,parts[3]);await auditMcp('project.deleted',{projectId:parts[3]},user.id,ws);return ok({deleted:true});}
		if(parts[2]==='context-bundles'&&parts[3]){await requireMcpWorkspace(user,ws,'manage_mcp_startup');await deleteContextBundle(ws,parts[3]);await auditMcp('context_bundle.deleted',{bundleId:parts[3]},user.id,ws);return ok({deleted:true});}
	}
	throw error(404,'MCP route not found');
}
