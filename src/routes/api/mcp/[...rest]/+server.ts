import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';
import { addonLicensed } from '$lib/server/cloud-addons';
import { isSystemAdmin } from '$lib/server/workspaces';
import {
	deleteBundle, deleteProject, getBundle, getPresetBundles, getPresetMetadata, getPresetState,
	getProjectBundles, getStartup, listBundles, listProjects, registrySnapshot, requireMcpCapability,
	saveBundle, saveDefaultItems, saveDefaultProfiles, savePresetBundles, savePresetMetadata,
	savePresetState, saveProject, saveProjectBundles, saveStartup, updateClient, getMcpPolicy, saveMcpPolicy, mcpLogs, writeMcpAudit
} from '$lib/server/mcp-cloud';
import { getSupabaseAdmin } from '$lib/server/supabase';

const clean=(v:unknown)=>String(v??'').trim();
const fail=(e:any)=>json({error:String(e?.message||'Request failed'),code:String(e?.code||'MCP_ERROR')},{status:Number(e?.status||500)});
async function context(cookies:any){const user=await requireUser(cookies);await assertPanelLicensed();if(!(await addonLicensed('orbitfs_mcp')))throw Object.assign(new Error('OrbitFS MCP licence is required'),{status:403,code:'MCP_LICENSE_REQUIRED'});return user;}
const partsOf=(rest:string)=>clean(rest).split('/').filter(Boolean);
export async function GET({params,cookies,url}:any){
	try{
		const user=await context(cookies),p=partsOf(params.rest);
		if(p[0]==='runtime')return json({online:true,mode:'cloud',workspaceIntegration:true,runtime:'Vercel',storage:'Supabase',connectorPath:'/mcp',licensed:true,attached:true,publicBaseUrl:url.origin,health:{online:true,running:true,service:'Vercel'}});
		if(p[0]==='connection')return json({mode:'cloud',resource:`${url.origin}/mcp`,connectorPath:'/mcp',issuer:url.origin});
		if(p[0]==='admin-policy'){if(!isSystemAdmin(user))throw Object.assign(new Error('System administrator access required'),{status:403});return json({policy:await getMcpPolicy()});}
		if(p[0]==='logs'){if(!isSystemAdmin(user))throw Object.assign(new Error('System administrator access required'),{status:403});return json({logs:await mcpLogs(Number(url.searchParams.get('limit')||200))});}
		if(p[0]==='registry'){if(!isSystemAdmin(user))throw Object.assign(new Error('System administrator access required'),{status:403});return json(await registrySnapshot());}
		if(p[0]!=='workspaces'||!p[1])throw Object.assign(new Error('Not found'),{status:404});
		const workspaceId=p[1],section=p[2],id=p[3]||null;
		if(section==='projects'){await requireMcpCapability(user,workspaceId,'manage_mcp_projects');if(id&&p[4]==='context-bundles')return json({assignments:await getProjectBundles(id)});return json({projects:await listProjects(workspaceId)});}
		if(section==='context-bundles'){await requireMcpCapability(user,workspaceId,'manage_mcp_startup');if(id)return json({bundle:await getBundle(workspaceId,id)});return json({bundles:await listBundles(workspaceId)});}
		if(section==='startup'){await requireMcpCapability(user,workspaceId,'manage_mcp_startup');return json({startup:await getStartup(workspaceId)});}
		if(section==='presets'){await requireMcpCapability(user,workspaceId,'manage_mcp_startup');return json({presets:await getPresetState(workspaceId,clean(url.searchParams.get('projectId'))||null)});}
		if(section==='preset-metadata'){try{await requireMcpCapability(user,workspaceId,'manage_mcp_startup');}catch{await requireMcpCapability(user,workspaceId,'manage_mcp_preset_names');}return json({metadata:await getPresetMetadata(workspaceId,clean(url.searchParams.get('projectId'))||null)});}
		if(section==='preset-bundles'){await requireMcpCapability(user,workspaceId,'manage_mcp_startup');return json({assignments:await getPresetBundles(workspaceId,clean(url.searchParams.get('projectId'))||null)});}
		throw Object.assign(new Error('Not found'),{status:404});
	}catch(e){return fail(e);}
}
export async function POST({params,cookies,request}:any){
	try{const user=await context(cookies),p=partsOf(params.rest),body=await request.json().catch(()=>({}));
		if(p[0]==='registry'&&p[1]==='clients'&&p[2]&&p[3]==='disconnect'){if(!isSystemAdmin(user))throw Object.assign(new Error('System administrator access required'),{status:403});await updateClient(decodeURIComponent(p[2]),{status:'revoked'});return json({ok:true});}
		if(p[0]==='registry'&&p[1]==='sessions'&&p[2]&&p[3]==='disconnect'){if(!isSystemAdmin(user))throw Object.assign(new Error('System administrator access required'),{status:403});const s=getSupabaseAdmin();const r=await s.from('orbitfs_sessions').delete().eq('id',decodeURIComponent(p[2]));if(r.error)throw r.error;return json({ok:true});}
		if(p[0]!=='workspaces'||!p[1])throw Object.assign(new Error('Not found'),{status:404});const workspaceId=p[1],section=p[2];
		if(section==='projects'&&!p[3]){await requireMcpCapability(user,workspaceId,'manage_mcp_projects');return json({project:await saveProject(workspaceId,null,body,user)});}
		if(section==='context-bundles'&&!p[3]){await requireMcpCapability(user,workspaceId,'manage_mcp_startup');return json({bundle:await saveBundle(workspaceId,null,body,user)});}
		throw Object.assign(new Error('Not found'),{status:404});
	}catch(e){return fail(e);}
}

export async function PUT({params,cookies,request,url}:any){
	try{const user=await context(cookies),p=partsOf(params.rest),body=await request.json().catch(()=>({}));if(p[0]==='admin-policy'){if(!isSystemAdmin(user))throw Object.assign(new Error('System administrator access required'),{status:403});const policy=await saveMcpPolicy(body.policy||body);await writeMcpAudit('public',user.id,'admin_policy_updated',{});return json({policy,applied:true});}if(p[0]!=='workspaces'||!p[1])throw Object.assign(new Error('Not found'),{status:404});const workspaceId=p[1],section=p[2],id=p[3]||null;
		if(section==='projects'&&id&&p[4]==='context-bundles'){await requireMcpCapability(user,workspaceId,'manage_mcp_projects');return json({assignments:await saveProjectBundles(id,body.assignments||[])});}
		if(section==='projects'&&id){await requireMcpCapability(user,workspaceId,'manage_mcp_projects');return json({project:await saveProject(workspaceId,id,body,user)});}
		if(section==='context-bundles'&&id){await requireMcpCapability(user,workspaceId,'manage_mcp_startup');return json({bundle:await saveBundle(workspaceId,id,body,user)});}
		if(section==='startup'){await requireMcpCapability(user,workspaceId,'manage_mcp_startup');return json({startup:await saveStartup(workspaceId,body,user)});}
		if(section==='default-items'){await requireMcpCapability(user,workspaceId,'manage_mcp_startup');return json({items:await saveDefaultItems(workspaceId,body.items||[])});}
		if(section==='default-profiles'){await requireMcpCapability(user,workspaceId,'manage_mcp_startup');return json(await saveDefaultProfiles(workspaceId,body.profileIds||[],body.profileBundleIds||[]));}
		if(section==='presets'){await requireMcpCapability(user,workspaceId,'manage_mcp_startup');const projectId=clean(body.projectId||url.searchParams.get('projectId'))||null;return json({presets:await savePresetState(workspaceId,projectId,body.presets||{},user)});}
		if(section==='preset-metadata'){await requireMcpCapability(user,workspaceId,'manage_mcp_preset_names');const projectId=clean(body.projectId||url.searchParams.get('projectId'))||null;return json({metadata:await savePresetMetadata(workspaceId,projectId,body.metadata||{},user),projectId});}
		if(section==='preset-bundles'){await requireMcpCapability(user,workspaceId,'manage_mcp_startup');const projectId=clean(body.projectId||url.searchParams.get('projectId'))||null;return json({assignments:await savePresetBundles(workspaceId,projectId,body.assignments||{}),projectId});}
		throw Object.assign(new Error('Not found'),{status:404});
	}catch(e){return fail(e);}
}

export async function PATCH({params,cookies,request}:any){
	try{const user=await context(cookies),p=partsOf(params.rest),body=await request.json().catch(()=>({}));if(p[0]==='registry'&&p[1]==='clients'&&p[2]){if(!isSystemAdmin(user))throw Object.assign(new Error('System administrator access required'),{status:403});await updateClient(decodeURIComponent(p[2]),body);return json({ok:true});}throw Object.assign(new Error('Not found'),{status:404});}catch(e){return fail(e);}
}

export async function DELETE({params,cookies}:any){
	try{const user=await context(cookies),p=partsOf(params.rest);if(p[0]!=='workspaces'||!p[1])throw Object.assign(new Error('Not found'),{status:404});const workspaceId=p[1],section=p[2],id=p[3];if(section==='projects'&&id){await requireMcpCapability(user,workspaceId,'manage_mcp_projects');await deleteProject(workspaceId,id);return json({ok:true});}if(section==='context-bundles'&&id){await requireMcpCapability(user,workspaceId,'manage_mcp_startup');await deleteBundle(workspaceId,id);return json({ok:true});}throw Object.assign(new Error('Not found'),{status:404});}catch(e){return fail(e);}
}



