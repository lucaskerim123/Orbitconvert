import type { OrbitUser } from '$lib/server/auth';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { getWorkspace, isSystemAdmin, requireWorkspaceAccess, requireWorkspacePermission, workspaceRole } from '$lib/server/workspaces';
import { registerScannedFiles } from '$lib/server/library';

const SCHEMA = 1;
const SETTING_KEY = 'knowledge_architecture';
const ROLE_WEIGHT: Record<string,number> = { 'load-first':100, always:90, active:80, relevant:50, requested:20, search:10 };
const STATE_WEIGHT: Record<string,number> = { active:40, final:30, superseded:10, archive:0 };
const text = (value: unknown) => String(value ?? '').trim();
const slash = (value: unknown) => text(value).replace(/\\/g,'/').replace(/^\/+|\/+$/g,'').replace(/\/{2,}/g,'/');
const now = () => new Date().toISOString();

function safeRel(value: unknown) {
	const clean = slash(value);
	if (!clean || clean.split('/').some((part) => part === '..' || part === '.')) return '';
	return clean;
}
function tokenise(value: unknown) {
	return [...new Set(text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter((part) => part.length > 2))];
}
function normalizeItem(raw: any = {}) {
	const path = safeRel(raw.path);
	if (!path) return null;
	return {
		id:text(raw.id) || `${raw.projectId ? 'project' : 'global'}:${path}`,
		path,
		itemType:raw.itemType === 'folder' ? 'folder' : 'file',
		group:text(raw.group) || 'Ungrouped',
		projectId:text(raw.projectId) || null,
		role:['load-first','always','active','relevant','requested','search'].includes(raw.role) ? raw.role : 'relevant',
		state:['active','final','superseded','archive'].includes(raw.state) ? raw.state : 'active',
		protection:['editable','permission','locked'].includes(raw.protection) ? raw.protection : 'permission'
	};
}
function normalizeRoute(raw: any = {}) {
	const destination = safeRel(raw.destination);
	if (!destination) return null;
	return {
		id:text(raw.id) || `route:${destination}`,
		label:text(raw.label) || destination.split('/').pop() || destination,
		destination,
		routing:['automatic','suggest','manual'].includes(raw.routing) ? raw.routing : 'suggest'
	};
}
function normalizeProject(raw: any = {}) {
	const rootPath = safeRel(raw.rootPath);
	if (!rootPath) return null;
	return {
		id:text(raw.id) || `project:${rootPath}`,
		name:text(raw.name) || rootPath.split('/').pop() || rootPath,
		rootPath,
		contextRole:['active','relevant','requested'].includes(raw.contextRole) ? raw.contextRole : 'relevant',
		routes:(Array.isArray(raw.routes) ? raw.routes : []).map(normalizeRoute).filter(Boolean)
	};
}
function blank(workspaceId: string) {
	return { schema:SCHEMA, workspaceId, revision:0, setupComplete:false, globalItems:[], projectItems:[], projects:[], createdAt:null, updatedAt:null, updatedBy:null };
}

export function normalizeKnowledgeArchitecture(workspaceId: string, raw: any = {}, previous: any = null, actor: string | null = null) {
	const items = (Array.isArray(raw.items) ? raw.items : Array.isArray(raw.coreItems) ? raw.coreItems : []).map(normalizeItem).filter(Boolean);
	const projects = (Array.isArray(raw.projects) ? raw.projects : Array.isArray(raw.projectSetups) ? raw.projectSetups : []).map(normalizeProject).filter(Boolean);
	const projectIds = new Set(projects.map((project:any) => project.id));
	const filteredItems = items.filter((item:any) => !item.projectId || projectIds.has(item.projectId));
	return {
		schema:SCHEMA,
		workspaceId,
		revision:Math.max(1,Number(previous?.revision || 0) + 1),
		createdAt:previous?.createdAt || now(),
		updatedAt:now(),
		updatedBy:actor || previous?.updatedBy || null,
		setupComplete:raw.setupComplete !== false,
		globalItems:filteredItems.filter((item:any) => !item.projectId),
		projectItems:filteredItems.filter((item:any) => item.projectId),
		projects
	};
}

export async function getKnowledgeArchitecture(workspaceId: string) {
	const db = getSupabaseAdmin();
	const result = await db.from('orbitfs_settings').select('value').eq('scope_type','workspace').eq('scope_id',workspaceId).eq('key',SETTING_KEY).maybeSingle();
	if (result.error) throw result.error;
	return result.data?.value && typeof result.data.value === 'object' ? result.data.value : blank(workspaceId);
}

export async function saveKnowledgeArchitecture(user: OrbitUser, workspaceId: string, raw: any = {}) {
	const workspace = await getWorkspace(workspaceId);
	await requireWorkspaceAccess(user,workspace);
	const role = await workspaceRole(user,workspace);
	if (!isSystemAdmin(user) && role !== 'owner') {
		let allowed = false;
		for (const permission of ['edit_settings','manage_library']) {
			try { await requireWorkspacePermission(user,workspace,permission); allowed = true; break; } catch {}
		}
		if (!allowed) throw Object.assign(new Error('Workspace Owner/Admin or workspace setup permission required'), { status:403 });
	}
	const previous = await getKnowledgeArchitecture(workspaceId);
	const architecture = normalizeKnowledgeArchitecture(workspaceId,raw,previous,user.username || user.id);
	const db = getSupabaseAdmin();
	const saved = await db.from('orbitfs_settings').upsert({ scope_type:'workspace',scope_id:workspaceId,key:SETTING_KEY,value:architecture,updated_at:now() }, { onConflict:'scope_type,scope_id,key' });
	if (saved.error) throw saved.error;
	const paths = [...architecture.globalItems,...architecture.projectItems].filter((item:any) => item.itemType === 'file' && item.state !== 'archive').map((item:any) => item.path);
	let librarySync:any = { added:[],existing:[],errors:[] };
	if (paths.length) librarySync = await registerScannedFiles(user,workspaceId,{ paths });
	return {
		architecture,
		librarySync:{
			synced:Array.isArray(librarySync.added) ? librarySync.added.length : 0,
			existing:Array.isArray(librarySync.existing) ? librarySync.existing.length : 0,
			indexed:Array.isArray(librarySync.added) ? librarySync.added.length : 0,
			skipped:0,
			errors:librarySync.errors || []
		}
	};
}

export function resolveKnowledgePathPolicy(architecture:any, relativePath:unknown) {
	if (!architecture?.setupComplete) return null;
	const clean = safeRel(relativePath).toLowerCase();
	if (!clean) return null;
	const matches = [...(architecture.globalItems || []),...(architecture.projectItems || [])].filter((item:any) => {
		const itemPath = safeRel(item.path).toLowerCase();
		return itemPath && (clean === itemPath || (item.itemType === 'folder' && clean.startsWith(`${itemPath}/`)));
	});
	matches.sort((a:any,b:any) => {
		const ap=safeRel(a.path),bp=safeRel(b.path),ae=clean===ap.toLowerCase(),be=clean===bp.toLowerCase();
		if (ae !== be) return Number(be)-Number(ae);
		if (a.itemType !== b.itemType) return a.itemType === 'file' ? -1 : 1;
		return bp.length-ap.length;
	});
	return matches[0] ? structuredClone(matches[0]) : null;
}

function effectiveItemScore(item:any) {
	return Number(ROLE_WEIGHT[item.role] || 0) + Number(STATE_WEIGHT[item.state] || 0) + (item.protection === 'locked' ? 2 : 0);
}
export async function knowledgeContextPlan(workspaceId:string, options:any={}) {
	const architecture:any = await getKnowledgeArchitecture(workspaceId);
	const projectId=text(options.projectId),projectName=text(options.projectName).toLowerCase();
	const project=(architecture.projects || []).find((entry:any) => entry.id === projectId || (projectName && String(entry.name||'').toLowerCase() === projectName)) || null;
	const global=[...(architecture.globalItems||[])].sort((a:any,b:any)=>effectiveItemScore(b)-effectiveItemScore(a));
	const projectItems=project ? [...(architecture.projectItems||[])].filter((item:any)=>item.projectId===project.id).sort((a:any,b:any)=>effectiveItemScore(b)-effectiveItemScore(a)) : [];
	const combined=[...global,...projectItems].filter((item:any)=>item.state!=='archive');
	return { workspaceId,revision:Number(architecture.revision||0),project,automatic:combined.filter((item:any)=>['load-first','always','active'].includes(item.role)),relevant:combined.filter((item:any)=>item.role==='relevant'),requested:combined.filter((item:any)=>item.role==='requested'),architectureUpdatedAt:architecture.updatedAt };
}
function scoreRoute(project:any,route:any,input:any={}) {
	const haystack=`${text(input.category)} ${text(input.name)} ${text(input.path)} ${text(input.content)} ${text(input.projectName)}`.toLowerCase();
	const wanted=text(input.projectId || input.projectName).toLowerCase(); let score=0; const reasons:string[]=[];
	if (wanted && (String(project.id).toLowerCase()===wanted || String(project.name).toLowerCase()===wanted)) { score+=60; reasons.push('project-match'); }
	if (text(input.category) && String(route.label).toLowerCase()===text(input.category).toLowerCase()) { score+=80; reasons.push('category-exact'); }
	for (const token of tokenise(route.label)) if (haystack.includes(token)) { score+=18; reasons.push(`label:${token}`); }
	for (const token of tokenise(String(route.destination).split('/').pop())) if (haystack.includes(token)) { score+=10; reasons.push(`destination:${token}`); }
	for (const token of tokenise(project.name)) if (haystack.includes(token)) { score+=8; reasons.push(`project:${token}`); }
	return { score,reasons };
}
export async function resolveKnowledgeRoute(workspaceId:string,input:any={}) {
	const architecture:any=await getKnowledgeArchitecture(workspaceId); const candidates:any[]=[];
	for (const project of architecture.projects || []) for (const route of project.routes || []) { const scored=scoreRoute(project,route,input); if(scored.score>0)candidates.push({project,route,...scored}); }
	candidates.sort((a,b)=>b.score-a.score); const best=candidates[0]||null;
	if(!best||best.score<18)return{matched:false,workspaceId,revision:Number(architecture.revision||0),source:'knowledge-architecture',candidates:candidates.slice(0,5).map((entry:any)=>({projectId:entry.project.id,projectName:entry.project.name,label:entry.route.label,destination:entry.route.destination,score:entry.score}))};
	return{matched:true,workspaceId,revision:Number(architecture.revision||0),source:'knowledge-architecture',projectId:best.project.id,projectName:best.project.name,category:best.route.label,destination:best.route.destination,routing:best.route.routing,score:best.score,confidence:Math.min(.99,.5+best.score/200),reasons:best.reasons};
}
