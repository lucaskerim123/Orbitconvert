import crypto from 'node:crypto';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { findEntry, permissionsForPath, readEntryBytes, normalizePath } from '$lib/server/base-compat';
import { getWorkspace, managementPermissions, requireWorkspaceAccess, workspaceMembers, workspaceRole } from '$lib/server/workspaces';
import { profileCatalog } from '$lib/server/workspace-profiles.js';
import { buildKnowledgeIntelligence, buildFactRelations, factRelationLinks, retrievalIntelligenceBoost } from '$lib/server/knowledge-intelligence.js';
import { buildStructuredRecords } from '$lib/server/knowledge-structure.js';
import type { OrbitUser } from '$lib/server/auth';

const now = () => new Date().toISOString();
const uid = (prefix:string) => `${prefix}_${crypto.randomUUID()}`;
const text = (value:any,max=500) => String(value ?? '').trim().slice(0,max);
const list = (value:any) => [...new Set((Array.isArray(value)?value:String(value||'').split(',')).map((v:any)=>text(v,96)).filter(Boolean))];

function blank(workspaceId:string) {
	return { version:5, workspaceId, items:[], collections:[], links:[], usage:[], sections:[], events:[], sourceHistory:[], autoLinks:[], entities:[], entityMentions:[], facts:[], factRelations:[], records:[], createdAt:now(), updatedAt:now() } as any;
}

export async function readLibrary(workspaceId:string) {
	const db=getSupabaseAdmin();
	const r=await db.from('orbitfs_library_state').select('state,updated_at').eq('workspace_id',workspaceId).maybeSingle();
	if(r.error) throw r.error;
	const state={...blank(workspaceId),...(r.data?.state||{}),workspaceId,version:5};
	state.updatedAt=r.data?.updated_at || state.updatedAt;
	return state;
}
export async function saveLibrary(workspaceId:string,state:any) {
	const db=getSupabaseAdmin(); const updatedAt=now(); state.updatedAt=updatedAt;
	const r=await db.from('orbitfs_library_state').upsert({workspace_id:workspaceId,state,updated_at:updatedAt},{onConflict:'workspace_id'});
	if(r.error) throw r.error; return state;
}

export async function libraryContext(user:OrbitUser,workspaceId:string) {
	const workspace=await getWorkspace(workspaceId); const role=await requireWorkspaceAccess(user,workspace);
	const management=await managementPermissions(user,workspace,role);
	return { workspace, role, canManage:Boolean(management.manage_library), members:await workspaceMembers(workspaceId) };
}

export async function presentLibrary(user:OrbitUser,workspaceId:string) {
	const [state,ctx]=await Promise.all([readLibrary(workspaceId),libraryContext(user,workspaceId)]);
	const stats={ items:state.items.length, collections:state.collections.length, links:state.links.length, sections:state.sections.length, events:state.events.length, records:state.records.length, facts:state.facts.length, relations:state.factRelations.length };
	return {...state,canManage:ctx.canManage,members:ctx.members,stats};
}

function requireManage(canManage:boolean) {
	if(!canManage) throw Object.assign(new Error('Library management permission required'),{status:403,code:'LIBRARY_MANAGE_REQUIRED'});
}
export async function createLibraryItem(user:OrbitUser,workspaceId:string,input:any) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const state=await readLibrary(workspaceId);
	const provider=text(input.provider || input.source?.provider || (input.profileId?'base.profiles':'base.files'),120);
	const locator=input.source?.locator || (provider==='base.profiles'?{profileId:text(input.profileId,160)}:{path:normalizePath(input.path),sourceKind:text(input.sourceKind||'file',32)});
	const key=`${provider}:${JSON.stringify(locator)}`; const existing=state.items.find((x:any)=>`${x.source?.provider}:${JSON.stringify(x.source?.locator||{})}`===key);
	if(existing) return {item:existing,existing:true};
	const item:any={ id:uid('lib'),workspaceId,kind:provider==='base.profiles'?'profile':text(locator.sourceKind||'file',32),name:text(input.name || locator.path || locator.profileId,180),description:text(input.description,1000),category:text(input.category,120),tags:list(input.tags),purposes:list(input.purposes),aliases:list(input.aliases),importance:Number(input.importance ?? .5),status:text(input.status||'active',32),visibility:text(input.visibility||'workspace',32),viewerIds:Array.isArray(input.viewerIds)?input.viewerIds:[],editorIds:Array.isArray(input.editorIds)?input.editorIds:[],ownerUserId:user.id,versionLabel:text(input.versionLabel,80),guards:input.guards||{},metadata:input.metadata||{},source:{provider,locator},createdAt:now(),updatedAt:now(),createdBy:user.username };
	state.items.push(item); await saveLibrary(workspaceId,state); return {item,existing:false};
}

export async function updateLibraryItem(user:OrbitUser,workspaceId:string,id:string,input:any) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const state=await readLibrary(workspaceId); const item=state.items.find((x:any)=>x.id===id);
	if(!item) throw Object.assign(new Error('Knowledge item not found'),{status:404});
	for(const key of ['name','description','category','status','visibility','versionLabel']) if(input[key]!==undefined) item[key]=text(input[key],key==='description'?1000:180);
	for(const key of ['tags','purposes','aliases']) if(input[key]!==undefined) item[key]=list(input[key]);
	for(const key of ['importance','viewerIds','editorIds','guards','metadata']) if(input[key]!==undefined) item[key]=input[key];
	item.updatedAt=now(); item.updatedBy=user.username; await saveLibrary(workspaceId,state); return {item};
}export async function deleteLibraryItem(user:OrbitUser,workspaceId:string,id:string,force=false) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const state=await readLibrary(workspaceId); const item=state.items.find((x:any)=>x.id===id);
	if(!item) throw Object.assign(new Error('Knowledge item not found'),{status:404});
	if(item.guards?.removalLocked && !force) throw Object.assign(new Error('Knowledge item removal is locked'),{status:423});
	state.items=state.items.filter((x:any)=>x.id!==id); state.sections=state.sections.filter((x:any)=>x.itemId!==id); state.events=state.events.filter((x:any)=>x.itemId!==id); state.records=state.records.filter((x:any)=>x.itemId!==id); state.facts=state.facts.filter((x:any)=>x.itemId!==id); state.links=state.links.filter((x:any)=>x.sourceItemId!==id&&x.targetItemId!==id); state.usage=state.usage.filter((x:any)=>x.itemId!==id);
	for(const c of state.collections) c.entries=(c.entries||[]).filter((e:any)=>e.itemId!==id);
	await saveLibrary(workspaceId,state); return {deleted:true,id};
}

export async function createCollection(user:OrbitUser,workspaceId:string,input:any) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const state=await readLibrary(workspaceId);
	const collection:any={id:uid('col'),workspaceId,name:text(input.name,180),description:text(input.description,1000),mode:text(input.mode||'live',32),visibility:text(input.visibility||'workspace',32),entries:Array.isArray(input.entries)?input.entries:[],directEntries:Array.isArray(input.entries)?input.entries:[],includeCollectionIds:Array.isArray(input.includeCollectionIds)?input.includeCollectionIds:[],sourceSelectors:Array.isArray(input.sourceSelectors)?input.sourceSelectors:[],tags:list(input.tags),purposes:list(input.purposes),rules:input.rules||{},metadata:input.metadata||{},createdAt:now(),updatedAt:now(),createdBy:user.username};
	if(!collection.name) throw Object.assign(new Error('Collection name is required'),{status:400}); state.collections.push(collection); await saveLibrary(workspaceId,state); return {collection};
}

export async function updateCollection(user:OrbitUser,workspaceId:string,id:string,input:any) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const state=await readLibrary(workspaceId); const collection=state.collections.find((x:any)=>x.id===id);
	if(!collection) throw Object.assign(new Error('Collection not found'),{status:404}); Object.assign(collection,input,{id,workspaceId,updatedAt:now(),updatedBy:user.username}); await saveLibrary(workspaceId,state); return {collection};
}export async function deleteCollection(user:OrbitUser,workspaceId:string,id:string) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const state=await readLibrary(workspaceId); const before=state.collections.length; state.collections=state.collections.filter((x:any)=>x.id!==id); if(before===state.collections.length) throw Object.assign(new Error('Collection not found'),{status:404}); await saveLibrary(workspaceId,state); return {deleted:true,id};
}

export async function createLink(user:OrbitUser,workspaceId:string,input:any) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const state=await readLibrary(workspaceId);
	if(!state.items.some((x:any)=>x.id===input.sourceItemId)||!state.items.some((x:any)=>x.id===input.targetItemId)) throw Object.assign(new Error('Knowledge link item not found'),{status:404});
	const link:any={id:uid('link'),workspaceId,sourceItemId:text(input.sourceItemId,160),sourceSectionId:input.sourceSectionId||null,targetItemId:text(input.targetItemId,160),targetSectionId:input.targetSectionId||null,relation:text(input.relation||'related_to',80),inverseRelation:input.inverseRelation?text(input.inverseRelation,80):null,origin:'manual',status:'confirmed',metadata:input.metadata||{},createdAt:now(),createdBy:user.username}; state.links.push(link); await saveLibrary(workspaceId,state); return {link};
}

export async function deleteLink(user:OrbitUser,workspaceId:string,id:string) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const state=await readLibrary(workspaceId); const before=state.links.length; state.links=state.links.filter((x:any)=>x.id!==id); if(before===state.links.length) throw Object.assign(new Error('Knowledge link not found'),{status:404}); await saveLibrary(workspaceId,state); return {deleted:true,id};
}

export async function createEvent(user:OrbitUser,workspaceId:string,input:any) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const state=await readLibrary(workspaceId); const event:any={id:uid('evt'),workspaceId,itemId:text(input.itemId,160),sectionId:input.sectionId||null,date:text(input.date||now().slice(0,10),40),title:text(input.title,240),description:text(input.description,2000),eventType:text(input.eventType||'event',80),origin:'manual',status:text(input.status||'confirmed',32),confidence:Number(input.confidence??1),createdAt:now(),createdBy:user.username}; state.events.push(event); await saveLibrary(workspaceId,state); return {event};
}export async function updateEvent(user:OrbitUser,workspaceId:string,id:string,input:any) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const state=await readLibrary(workspaceId); const event=state.events.find((x:any)=>x.id===id); if(!event) throw Object.assign(new Error('Knowledge event not found'),{status:404}); Object.assign(event,input,{id,workspaceId,updatedAt:now(),updatedBy:user.username}); await saveLibrary(workspaceId,state); return {event};
}
export async function deleteEvent(user:OrbitUser,workspaceId:string,id:string) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const state=await readLibrary(workspaceId); const before=state.events.length; state.events=state.events.filter((x:any)=>x.id!==id); if(before===state.events.length) throw Object.assign(new Error('Knowledge event not found'),{status:404}); await saveLibrary(workspaceId,state); return {deleted:true,id};
}

const scanExt=new Set(['.md','.txt','.json','.csv','.log','.html','.xml','.yaml','.yml','.pdf','.docx']);
export async function scanLibraryFiles(user:OrbitUser,workspaceId:string,input:any={}) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const db=getSupabaseAdmin(); const root=normalizePath(input.path||''); const max=Math.max(1,Math.min(500,Number(input.maxFiles)||250));
	const r=await db.from('orbitfs_files').select('path,name,kind,size_bytes,updated_at').eq('workspace_id',workspaceId).eq('kind','file').is('deleted_at',null).order('path'); if(r.error) throw r.error;
	const state=await readLibrary(workspaceId); const registered=new Map<string,any>(state.items.filter((x:any)=>x.source?.provider==='base.files').map((x:any)=>[String(x.source.locator?.path||'').toLowerCase(),x])); const candidates:any[]=[]; let visitedFiles=0;
	for(const row of r.data??[]) { const path=normalizePath(row.path); if(root && path!==root && !path.startsWith(`${root}/`)) continue; visitedFiles++; const ext=path.includes('.')?path.slice(path.lastIndexOf('.')).toLowerCase():''; if(!scanExt.has(ext)) continue; const perms=await permissionsForPath(user,workspaceId,path); if(!perms.read) continue; const existing=registered.get(path.toLowerCase()); candidates.push({path,name:row.name,extension:ext,size:Number(row.size_bytes||0),modifiedAt:row.updated_at,registered:Boolean(existing),itemId:existing?.id||null,itemName:existing?.name||null,indexable:true}); if(candidates.length>=max) break; }
	return {candidates,visitedFiles,newCount:candidates.filter(x=>!x.registered).length,truncated:candidates.length>=max};
}async function sourceText(workspaceId:string,item:any) {
	if(item.source?.provider!=='base.files') throw Object.assign(new Error('Only file sources are indexable in Base cloud right now'),{status:415});
	const path=normalizePath(item.source.locator?.path); const entry=await findEntry(workspaceId,path); if(!entry||entry.kind!=='file') throw Object.assign(new Error('Knowledge source does not exist'),{status:404});
	const bytes=await readEntryBytes(entry); const lower=path.toLowerCase();
	if(lower.endsWith('.pdf')) { const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'); const doc=await getDocument({data:new Uint8Array(bytes)}).promise; const pages:string[]=[]; for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n);const c=await p.getTextContent();pages.push(c.items.map((x:any)=>x.str||'').join(' '));} return pages.join('\n\n'); }
	if(lower.endsWith('.docx')) { const mammoth=(await import('mammoth')).default; return String((await mammoth.extractRawText({buffer:bytes})).value||''); }
	return bytes.toString('utf8');
}

export async function indexLibraryItem(user:OrbitUser,workspaceId:string,id:string) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const state=await readLibrary(workspaceId); const item=state.items.find((x:any)=>x.id===id); if(!item) throw Object.assign(new Error('Knowledge item not found'),{status:404}); if(item.guards?.indexingLocked) throw Object.assign(new Error('Knowledge indexing is locked'),{status:423});
	const content=(await sourceText(workspaceId,item)).replace(/\r\n?/g,'\n'); const lines=content.split('\n'); const sections:any[]=[]; let current:any={title:item.name,lineStart:1,level:1,lines:[]};
	const flush=(lineEnd:number)=>{const body=current.lines.join('\n').trim(); if(!body)return; const sectionKey=`${id}:${current.lineStart}:${current.title}`; sections.push({id:`sec_${crypto.createHash('sha256').update(sectionKey).digest('hex').slice(0,24)}`,workspaceId,itemId:id,title:current.title,level:current.level,headingPath:[current.title],lineStart:current.lineStart,lineEnd,preview:body.slice(0,500),wordCount:body.split(/\s+/).filter(Boolean).length,__content:body,indexedAt:now()});};
	for(let i=0;i<lines.length;i++){const m=lines[i].match(/^(#{1,6})\s+(.+)/);if(m){flush(i);current={title:m[2].trim(),lineStart:i+1,level:m[1].length,lines:[]};}else current.lines.push(lines[i]);} flush(lines.length);
	const profiles=await profileCatalog(workspaceId,ctx.role,user.id,user.role).catch(()=>({profiles:[]})); const intel=buildKnowledgeIntelligence({store:state,item,sections,profileCatalog:profiles}); const records=buildStructuredRecords({item,sections:intel.sections,entities:intel.entities,mentions:intel.mentions,previousRecords:state.records||[]});
	state.sections=state.sections.filter((x:any)=>x.itemId!==id).concat(intel.sections.map((s:any)=>({...s,content:s.__content||s.content||'',__content:undefined})));
	state.events=state.events.filter((x:any)=>x.itemId!==id||x.origin!=='indexer').concat(intel.events); state.entities=intel.entities; state.entityMentions=(state.entityMentions||[]).filter((x:any)=>x.itemId!==id).concat(intel.mentions); state.facts=(state.facts||[]).filter((x:any)=>x.itemId!==id).concat(intel.facts); state.records=(state.records||[]).filter((x:any)=>x.itemId!==id).concat(records);
	state.factRelations=buildFactRelations(state.facts,state.factRelations||[]); const relationLinks=factRelationLinks(state.factRelations,state.autoLinks||[]); state.autoLinks=[...(state.autoLinks||[]).filter((x:any)=>x.sourceItemId!==id&&x.targetItemId!==id&&x.origin!=='fact_engine'),...intel.links,...relationLinks];
	item.sectionCount=intel.sections.length; item.eventCount=intel.events.length; item.recordCount=records.length; item.entityMentionCount=intel.mentions.length; item.factCount=intel.facts.length; item.relationCount=state.factRelations.filter((x:any)=>x.sourceItemId===id||x.targetItemId===id).length; item.indexedAt=now(); item.sourceTracking={size:Buffer.byteLength(content),signature:crypto.createHash('sha256').update(content).digest('hex')}; state.sourceHistory.push({id:uid('chg'),itemId:id,indexedAt:now(),kind:'indexed',addedSections:intel.sections.length,changedSections:0,removedSections:0}); await saveLibrary(workspaceId,state); return {item,sections:state.sections.filter((x:any)=>x.itemId===id),events:intel.events,facts:intel.facts,records,indexed:true};
}export async function registerScannedFiles(user:OrbitUser,workspaceId:string,input:any) {
	const paths=Array.isArray(input.paths)?input.paths:[]; const added:any[]=[]; const existing:any[]=[]; const errors:any[]=[];
	for(const raw of paths){const path=normalizePath(raw);try{const result=await createLibraryItem(user,workspaceId,{provider:'base.files',path,sourceKind:'file',name:path.split('/').pop()||path,category:'General',purposes:['Context','Search','Retrieval']});(result.existing?existing:added).push({path,item:result.item});if(!result.existing) await indexLibraryItem(user,workspaceId,result.item.id).catch(()=>{});}catch(error:any){errors.push({path,error:error?.message||String(error)});}}
	return {added,existing,errors};
}

export async function retrieveLibrary(user:OrbitUser,workspaceId:string,input:any) {
	await libraryContext(user,workspaceId); const state=await readLibrary(workspaceId); const q=text(input.query,500).toLowerCase(); const limit=Math.max(1,Math.min(50,Number(input.limit)||12)); const collectionId=text(input.collectionId,160); let allowed:Set<string>|null=null;
	if(collectionId){const c=state.collections.find((x:any)=>x.id===collectionId); if(c) allowed=new Set((c.entries||[]).map((e:any)=>e.itemId));}
	const words=q.split(/\s+/).filter(Boolean); const results=state.sections.filter((s:any)=>!allowed||allowed.has(s.itemId)).map((s:any)=>{const item=state.items.find((x:any)=>x.id===s.itemId);const hay=`${s.title} ${s.preview} ${s.content||''}`.toLowerCase();const lexical=words.reduce((n,w)=>n+(hay.includes(w)?1:0),0);const score=lexical*10+retrievalIntelligenceBoost(q,item||{},s,state.entities||[],state.entityMentions||[],state.facts||[]);return {...s,score,item};}).filter((x:any)=>!words.length||x.score>0).sort((a:any,b:any)=>b.score-a.score).slice(0,limit);
	return {query:input.query||'',results,count:results.length};
}

export async function exportLibrary(workspaceId:string) {
	const state=await readLibrary(workspaceId); return {schema:'orbitfs-library-pack-v1',exportedAt:now(),workspaceId,items:state.items,collections:state.collections,links:state.links.filter((x:any)=>x.origin!=='automatic')};
}

export async function importLibrary(user:OrbitUser,workspaceId:string,pack:any) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); if(pack?.pack) pack=pack.pack; if(pack?.schema!=='orbitfs-library-pack-v1') throw Object.assign(new Error('Unsupported Library pack'),{status:400});
	let importedItems=0,importedCollections=0,importedLinks=0; for(const item of pack.items||[]){const r=await createLibraryItem(user,workspaceId,{...item,source:item.source,provider:item.source?.provider});if(!r.existing) importedItems++;} for(const c of pack.collections||[]){await createCollection(user,workspaceId,c);importedCollections++;} for(const l of pack.links||[]){try{await createLink(user,workspaceId,l);importedLinks++;}catch{}} return {importedItems,importedCollections,importedLinks,errors:[]};
}export async function saveUsage(user:OrbitUser,workspaceId:string,input:any) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const state=await readLibrary(workspaceId); const item=state.items.find((x:any)=>x.id===input.itemId); if(!item)throw Object.assign(new Error('Knowledge item not found'),{status:404});
	let usage=state.usage.find((x:any)=>x.itemId===input.itemId&&x.consumerType===input.consumerType&&x.consumerId===input.consumerId); if(!usage){usage={id:uid('use'),workspaceId,itemId:input.itemId,createdAt:now()};state.usage.push(usage);} Object.assign(usage,{sectionId:input.sectionId||null,consumerType:text(input.consumerType,80),consumerId:text(input.consumerId,180),consumerName:text(input.consumerName||input.consumerId,180),metadata:input.metadata||{},updatedAt:now()}); await saveLibrary(workspaceId,state); return {usage};
}
export async function deleteUsage(user:OrbitUser,workspaceId:string,id:string) {
	const ctx=await libraryContext(user,workspaceId); requireManage(ctx.canManage); const state=await readLibrary(workspaceId); const before=state.usage.length; state.usage=state.usage.filter((x:any)=>x.id!==id); if(before===state.usage.length)throw Object.assign(new Error('Usage record not found'),{status:404}); await saveLibrary(workspaceId,state); return {deleted:true,id};
}
