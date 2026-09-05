import type { OrbitUser } from '$lib/server/auth';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { getWorkspace, isSystemAdmin, requireWorkspaceAccess, requireWorkspacePermission, workspaceRole } from '$lib/server/workspaces';
import { readLibrary } from '$lib/server/library';

const SCHEMA = 2;
const SETTING_KEY = 'knowledge_architecture';
const ROLE_WEIGHT: Record<string,number> = { 'load-first':100, always:90, active:80, relevant:50, requested:20, search:10 };
const STATE_WEIGHT: Record<string,number> = { active:40, final:30, superseded:10, archive:0 };
const text = (value: unknown) => String(value ?? '').trim();
const now = () => new Date().toISOString();
const nativeProvider = (provider: unknown) => ['library.native','memory.knowledge','base.profiles'].includes(text(provider));

function tokenise(value: unknown) {
	return [...new Set(text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter((part) => part.length > 2))];
}
function normalizeItem(raw: any = {}) {
	const itemId = text(raw.itemId || raw.knowledgeItemId);
	if (!itemId) return null;
	return {
		id:text(raw.id) || `${raw.projectId ? 'project' : 'global'}:${itemId}`,
		itemId,
		name:text(raw.name) || 'Knowledge item',
		kind:text(raw.kind) || 'knowledge',
		category:text(raw.category),
		provider:text(raw.provider),
		group:text(raw.group) || 'Ungrouped',
		projectId:text(raw.projectId) || null,
		role:['load-first','always','active','relevant','requested','search'].includes(raw.role) ? raw.role : 'relevant',
		state:['active','final','superseded','archive'].includes(raw.state) ? raw.state : 'active',
		protection:['editable','permission','locked'].includes(raw.protection) ? raw.protection : 'permission'
	};
}
function normalizeRoute(raw: any = {}) {
	const destinationType = ['category','collection','knowledge'].includes(raw.destinationType) ? raw.destinationType : 'category';
	const destinationId = text(raw.destinationId || raw.destination);
	const destinationLabel = text(raw.destinationLabel || raw.destinationName || raw.destination || destinationId);
	const label = text(raw.label);
	if (!label || (!destinationId && !destinationLabel)) return null;
	return {
		id:text(raw.id) || `route:${destinationType}:${destinationId || destinationLabel}`,
		label,
		destinationType,
		destinationId:destinationId || destinationLabel,
		destinationLabel:destinationLabel || destinationId,
		routing:['automatic','suggest','manual'].includes(raw.routing) ? raw.routing : 'suggest'
	};
}
function normalizeProject(raw: any = {}) {
	const name = text(raw.name);
	if (!name) return null;
	return {
		id:text(raw.id) || `project:${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,
		name,
		description:text(raw.description),
		contextRole:['active','relevant','requested'].includes(raw.contextRole) ? raw.contextRole : 'relevant',
		routes:(Array.isArray(raw.routes) ? raw.routes : []).map(normalizeRoute).filter(Boolean)
	};
}
function blank(workspaceId: string, legacyDetected = false) {
	return { schema:SCHEMA, workspaceId, revision:0, setupComplete:false, globalItems:[], projectItems:[], projects:[], createdAt:null, updatedAt:null, updatedBy:null, legacyDetected };
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
	const value:any = result.data?.value;
	if (!value || typeof value !== 'object') return blank(workspaceId);
	if (Number(value.schema || 0) !== SCHEMA) return blank(workspaceId,true);
	return value;
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
	const library = await readLibrary(workspaceId);
	const available = new Map((library.items || []).filter((item:any) => item.status === 'active' && nativeProvider(item.source?.provider)).map((item:any) => [String(item.id),item]));
	const normalized = normalizeKnowledgeArchitecture(workspaceId,raw,previous,user.username || user.id);
	const hydrate = (entry:any) => {
		const item:any = available.get(String(entry.itemId));
		if (!item) return null;
		return {...entry,name:item.name,kind:item.kind,category:item.category || '',provider:item.source?.provider || ''};
	};
	const architecture = {
		...normalized,
		globalItems:(normalized.globalItems || []).map(hydrate).filter(Boolean),
		projectItems:(normalized.projectItems || []).map(hydrate).filter(Boolean)
	};
	const db = getSupabaseAdmin();
	const saved = await db.from('orbitfs_settings').upsert({ scope_type:'workspace',scope_id:workspaceId,key:SETTING_KEY,value:architecture,updated_at:now() }, { onConflict:'scope_type,scope_id,key' });
	if (saved.error) throw saved.error;
	const selected = [...architecture.globalItems,...architecture.projectItems];
	return {
		architecture,
		librarySync:{ selected:selected.length, native:selected.filter((item:any)=>['library.native','memory.knowledge'].includes(item.provider)).length, profiles:selected.filter((item:any)=>item.provider==='base.profiles').length, filesystem:false, created:0, errors:[] }
	};
}

export function resolveKnowledgeItemPolicy(architecture:any, itemId:unknown) {
	if (!architecture?.setupComplete) return null;
	const wanted=text(itemId);
	if (!wanted) return null;
	const matches=[...(architecture.globalItems||[]),...(architecture.projectItems||[])].filter((item:any)=>String(item.itemId)===wanted);
	matches.sort((a:any,b:any)=>effectiveItemScore(b)-effectiveItemScore(a));
	return matches[0] ? structuredClone(matches[0]) : null;
}

function effectiveItemScore(item:any) {
	return Number(ROLE_WEIGHT[item.role] || 0) + Number(STATE_WEIGHT[item.state] || 0) + (item.protection === 'locked' ? 2 : 0);
}
function liveItemMap(library:any) {
	return new Map((library.items || []).filter((item:any)=>item.status==='active'&&nativeProvider(item.source?.provider)).map((item:any)=>[String(item.id),item]));
}
function enrich(entry:any,items:Map<string,any>) {
	const item=items.get(String(entry.itemId));
	return item ? {...entry,libraryItem:{id:item.id,name:item.name,kind:item.kind,category:item.category,roles:item.roles,lifecycle:item.lifecycleState||item.lifecycle,provider:item.source?.provider}} : null;
}
export async function knowledgeContextPlan(workspaceId:string, options:any={}) {
	const [architecture,library]:any[] = await Promise.all([getKnowledgeArchitecture(workspaceId),readLibrary(workspaceId)]);
	const itemMap=liveItemMap(library);
	const projectId=text(options.projectId),projectName=text(options.projectName).toLowerCase();
	const project=(architecture.projects || []).find((entry:any) => entry.id === projectId || (projectName && String(entry.name||'').toLowerCase() === projectName)) || null;
	const global=[...(architecture.globalItems||[])].map((item:any)=>enrich(item,itemMap)).filter(Boolean).sort((a:any,b:any)=>effectiveItemScore(b)-effectiveItemScore(a));
	const projectItems=project ? [...(architecture.projectItems||[])].filter((item:any)=>item.projectId===project.id).map((item:any)=>enrich(item,itemMap)).filter(Boolean).sort((a:any,b:any)=>effectiveItemScore(b)-effectiveItemScore(a)) : [];
	const combined=[...global,...projectItems].filter((item:any)=>item.state!=='archive');
	return { workspaceId,revision:Number(architecture.revision||0),schema:SCHEMA,project,automatic:combined.filter((item:any)=>['load-first','always','active'].includes(item.role)),relevant:combined.filter((item:any)=>item.role==='relevant'),requested:combined.filter((item:any)=>item.role==='requested'),search:combined.filter((item:any)=>item.role==='search'),architectureUpdatedAt:architecture.updatedAt };
}
function scoreRoute(project:any,route:any,input:any={}) {
	const haystack=`${text(input.category)} ${text(input.name)} ${text(input.content)} ${text(input.projectName)}`.toLowerCase();
	const wanted=text(input.projectId || input.projectName).toLowerCase(); let score=0; const reasons:string[]=[];
	if (wanted && (String(project.id).toLowerCase()===wanted || String(project.name).toLowerCase()===wanted)) { score+=60; reasons.push('project-match'); }
	if (text(input.category) && String(route.label).toLowerCase()===text(input.category).toLowerCase()) { score+=80; reasons.push('category-exact'); }
	for (const token of tokenise(route.label)) if (haystack.includes(token)) { score+=18; reasons.push(`label:${token}`); }
	for (const token of tokenise(route.destinationLabel)) if (haystack.includes(token)) { score+=10; reasons.push(`destination:${token}`); }
	for (const token of tokenise(project.name)) if (haystack.includes(token)) { score+=8; reasons.push(`project:${token}`); }
	return { score,reasons };
}
export async function resolveKnowledgeRoute(workspaceId:string,input:any={}) {
	const architecture:any=await getKnowledgeArchitecture(workspaceId); const candidates:any[]=[];
	for (const project of architecture.projects || []) for (const route of project.routes || []) { const scored=scoreRoute(project,route,input); if(scored.score>0)candidates.push({project,route,...scored}); }
	candidates.sort((a,b)=>b.score-a.score); const best=candidates[0]||null;
	const compact=(entry:any)=>({projectId:entry.project.id,projectName:entry.project.name,label:entry.route.label,destinationType:entry.route.destinationType,destinationId:entry.route.destinationId,destinationLabel:entry.route.destinationLabel,score:entry.score});
	if(!best||best.score<18)return{matched:false,workspaceId,revision:Number(architecture.revision||0),schema:SCHEMA,source:'knowledge-architecture',candidates:candidates.slice(0,5).map(compact)};
	return{matched:true,workspaceId,revision:Number(architecture.revision||0),schema:SCHEMA,source:'knowledge-architecture',projectId:best.project.id,projectName:best.project.name,category:best.route.label,destinationType:best.route.destinationType,destinationId:best.route.destinationId,destinationLabel:best.route.destinationLabel,routing:best.route.routing,score:best.score,confidence:Math.min(.99,.5+best.score/200),reasons:best.reasons};
}
