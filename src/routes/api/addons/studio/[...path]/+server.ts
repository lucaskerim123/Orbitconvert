import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';
import {
  createStudioDocument, deleteStudioShare, getStudioDocument, listStudioDocuments,
  restoreStudioRevision, saveStudioShare, setStudioLifecycle, studioPeople, studioProfiles,
  studioRevisions, studioSchema, studioShares, updateStudioDocument
} from '$lib/server/studio-cloud';

const clean=(v:any)=>String(v??'').trim();
const fail=(e:any)=>json({error:String(e?.message||'Studio request failed'),code:String(e?.code||'STUDIO_ERROR')},{status:Number(e?.status||500)});
async function ctx(cookies:any){const user=await requireUser(cookies);await assertPanelLicensed();return user;}
async function body(request:Request){return request.headers.get('content-type')?.includes('application/json')?await request.json():{};}
function route(params:any){const p=clean(params.path).split('/').filter(Boolean);if(p[0]!=='workspaces'||!p[1])throw Object.assign(new Error('Studio route not found'),{status:404});return {workspaceId:p[1],area:p[2]||'',id:p[3]||'',operation:p[4]||''};}

export async function GET({params,url,cookies}:any){try{
  const user=await ctx(cookies),r=route(params);
  if(r.area==='schema')return json(studioSchema());
  if(r.area==='profiles')return json(await studioProfiles(user,r.workspaceId));
  if(r.area==='people')return json(await studioPeople(user,r.workspaceId));
  if(r.area==='documents'&&!r.id)return json(await listStudioDocuments(user,r.workspaceId,url.searchParams));
  if(r.area==='documents'&&r.id&&!r.operation)return json(await getStudioDocument(user,r.workspaceId,r.id));
  if(r.area==='documents'&&r.id&&r.operation==='revisions')return json(await studioRevisions(user,r.workspaceId,r.id));
  if(r.area==='documents'&&r.id&&r.operation==='shares')return json(await studioShares(user,r.workspaceId,r.id));
  if(r.area==='documents'&&r.id&&r.operation==='proposals')return json({requests:[]});
  throw Object.assign(new Error('Studio route not found'),{status:404});
}catch(e){return fail(e);}}
export async function POST({params,request,cookies}:any){try{
  const user=await ctx(cookies),r=route(params),input=await body(request);
  if(r.area==='documents'&&!r.id)return json(await createStudioDocument(user,r.workspaceId,input));
  if(r.area==='documents'&&r.id&&['finalize','archive','draft'].includes(r.operation))return json(await setStudioLifecycle(user,r.workspaceId,r.id,r.operation as any));
  if(r.area==='documents'&&r.id&&r.operation==='restore-revision')return json(await restoreStudioRevision(user,r.workspaceId,r.id,Number(input.revisionNo)));
  if(r.area==='documents'&&r.id&&r.operation==='shares')return json(await saveStudioShare(user,r.workspaceId,r.id,input));
  if(r.area==='documents'&&r.id&&r.operation==='proposals')return json({request:{status:'needs_target',summary:'Studio publication requires cloud Library approval support'}});
  throw Object.assign(new Error('Studio route not found'),{status:404});
}catch(e){return fail(e);}}

export async function PATCH({params,request,cookies}:any){try{
  const user=await ctx(cookies),r=route(params),input=await body(request);
  if(r.area==='documents'&&r.id&&!r.operation)return json(await updateStudioDocument(user,r.workspaceId,r.id,input));
  throw Object.assign(new Error('Studio route not found'),{status:404});
}catch(e){return fail(e);}}

export async function DELETE({params,url,cookies}:any){try{
  const user=await ctx(cookies),r=route(params);
  if(r.area==='documents'&&r.id&&r.operation==='shares')return json(await deleteStudioShare(user,r.workspaceId,r.id,clean(url.searchParams.get('userId'))));
  throw Object.assign(new Error('Studio route not found'),{status:404});
}catch(e){return fail(e);}}
