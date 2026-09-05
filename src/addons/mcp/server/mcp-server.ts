import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { authenticateMcpAccessToken } from '$lib/server/mcp-oauth';
import { visibleWorkspaces } from '$lib/server/workspaces';
import { presentLibrary, retrieveLibrary, createLibraryItem, listLibraryChangeRequests } from '$lib/server/library';
import { listStudioDocuments, getStudioDocument, createStudioDocument, updateStudioDocument } from '$lib/server/studio-cloud';
import { analyzeCloudRouting } from '$lib/server/routing-engine-cloud';
import type { OrbitUser } from '$lib/server/auth';

const SERVER_NAME = 'orbitfs-mcp-addon';
const SERVER_VERSION = '0.6.0';
const ok=(data:any,text?:string)=>({content:[{type:'text' as const,text:text||JSON.stringify(data,null,2)}],structuredContent:data});
const compactError=(error:any)=>({content:[{type:'text' as const,text:String(error?.message||error||'OrbitFS request failed')}],isError:true});

function createOrbitMcpServer(user:OrbitUser,scopes:Set<string>) {
	const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
	const requireWrite=()=>{if(!scopes.has('orbitfs:write'))throw Object.assign(new Error('OAuth scope orbitfs:write is required'),{status:403});};

	server.registerTool('orbitfs_status',{
		title:'Get OrbitFS MCP status',
		description:'Verify the cloud OrbitFS MCP endpoint and authenticated Orbit user.',
		inputSchema:{},
		annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
	},async()=>ok({ok:true,addon:'mcp',server:SERVER_NAME,version:SERVER_VERSION,mode:'cloud',filesystem:false,storage:'supabase-library-memory',user:{id:user.id,username:user.username,role:user.role},scopes:[...scopes]},'OrbitFS MCP is online in Library/Memory cloud mode.'));

	server.registerTool('orbitfs_workspaces',{
		title:'List OrbitFS workspaces',
		description:'List workspaces the authenticated Orbit user can access.',
		inputSchema:{},
		annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
	},async()=>{try{const workspaces=await visibleWorkspaces(user);return ok({workspaces:workspaces.map((w:any)=>({id:w.id,name:w.name,permission:w.permission,managementPermissions:w.management_permissions}))});}catch(e){return compactError(e);}});

	server.registerTool('orbitfs_library_list',{
		title:'List Library knowledge',
		description:'List Library/Memory knowledge items in a workspace. This is the cloud replacement for filesystem browsing.',
		inputSchema:{workspaceId:z.string().min(1)},
		annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
	},async({workspaceId})=>{try{const state=await presentLibrary(user,workspaceId);return ok({workspaceId,items:(state.items||[]).map((x:any)=>({id:x.id,name:x.name,kind:x.kind,provider:x.source?.provider,lifecycle:x.lifecycleState||x.lifecycle,roles:x.roles||[],category:x.category,tags:x.tags||[],updatedAt:x.updatedAt})),collections:state.collections||[],groups:state.groups||[],stats:state.stats});}catch(e){return compactError(e);}});

	server.registerTool('orbitfs_library_retrieve',{
		title:'Retrieve Library knowledge',
		description:'Retrieve relevant workspace knowledge by query from the canonical Library/Memory system.',
		inputSchema:{workspaceId:z.string().min(1),query:z.string().min(1),limit:z.number().int().min(1).max(50).optional(),maxChars:z.number().int().min(500).max(50000).optional()},
		annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
	},async({workspaceId,query,limit,maxChars})=>{try{return ok(await retrieveLibrary(user,workspaceId,{query,limit,maxChars}));}catch(e){return compactError(e);}});

	server.registerTool('orbitfs_library_create',{
		title:'Create Library knowledge',
		description:'Create a native Memory/Knowledge item. This does not create a filesystem file.',
		inputSchema:{workspaceId:z.string().min(1),name:z.string().min(1),content:z.string(),category:z.string().optional(),tags:z.array(z.string()).optional(),roles:z.array(z.string()).optional(),lifecycle:z.string().optional()},
		annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
	},async({workspaceId,name,content,category,tags,roles,lifecycle})=>{try{requireWrite();return ok(await createLibraryItem(user,workspaceId,{provider:'memory.knowledge',name,content,contentFormat:'markdown',category,tags,roles,lifecycle:lifecycle||'draft'}));}catch(e){return compactError(e);}});

	server.registerTool('orbitfs_library_approvals',{
		title:'List Library approval queue',
		description:'List retained Base approval requests, including Studio and APEX proposals.',
		inputSchema:{workspaceId:z.string().min(1),status:z.string().optional(),sourceSystem:z.string().optional()},
		annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
	},async({workspaceId,status,sourceSystem})=>{try{return ok(await listLibraryChangeRequests(user,workspaceId,{status,sourceSystem}));}catch(e){return compactError(e);}});

	server.registerTool('orbitfs_studio_list',{
		title:'List Studio entries',
		description:'List Studio documents and journals visible to the authenticated user.',
		inputSchema:{workspaceId:z.string().min(1),scope:z.enum(['visible','mine','shared']).optional(),limit:z.number().int().min(1).max(250).optional()},
		annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
	},async({workspaceId,scope,limit})=>{try{const params=new URLSearchParams();if(scope)params.set('scope',scope);if(limit)params.set('limit',String(limit));return ok(await listStudioDocuments(user,workspaceId,params));}catch(e){return compactError(e);}});

	server.registerTool('orbitfs_studio_get',{
		title:'Get Studio entry',
		description:'Read one Studio document or journal.',
		inputSchema:{workspaceId:z.string().min(1),documentId:z.string().min(1)},
		annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
	},async({workspaceId,documentId})=>{try{return ok(await getStudioDocument(user,workspaceId,documentId));}catch(e){return compactError(e);}});

	server.registerTool('orbitfs_studio_create',{
		title:'Create Studio entry',
		description:'Create a Studio entry in Supabase. It has no filesystem save path.',
		inputSchema:{workspaceId:z.string().min(1),title:z.string().min(1),content:z.string().optional(),kind:z.enum(['journal','document','generated']).optional(),type:z.string().optional(),category:z.string().optional(),entryDate:z.string().optional(),profileIds:z.array(z.string()).optional(),profileTargetId:z.string().optional()},
		annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
	},async(input)=>{try{requireWrite();return ok(await createStudioDocument(user,input.workspaceId,input));}catch(e){return compactError(e);}});

	server.registerTool('orbitfs_studio_update',{
		title:'Update Studio entry',
		description:'Update a Studio entry and create a retained revision.',
		inputSchema:{workspaceId:z.string().min(1),documentId:z.string().min(1),title:z.string().optional(),content:z.string().optional(),type:z.string().optional(),category:z.string().optional(),entryDate:z.string().optional(),profileIds:z.array(z.string()).optional(),profileTargetId:z.string().optional(),changeNote:z.string().optional()},
		annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
	},async({workspaceId,documentId,...input})=>{try{requireWrite();return ok(await updateStudioDocument(user,workspaceId,documentId,input));}catch(e){return compactError(e);}});

	server.registerTool('orbitfs_routing_analyze',{
		title:'Analyse knowledge routing',
		description:'Run the deterministic OrbitFS routing engine. Returns suggestions only; it never directly mutates authoritative knowledge.',
		inputSchema:{workspaceId:z.string().min(1),entry:z.object({id:z.string().optional(),title:z.string().optional(),content:z.string().optional(),type:z.string().optional(),date:z.string().optional(),profileTargetId:z.string().optional(),profileIds:z.array(z.string()).optional(),metadata:z.record(z.string(),z.any()).optional()}),settings:z.record(z.string(),z.any()).optional()},
		annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
	},async({workspaceId,entry,settings})=>{try{return ok(await analyzeCloudRouting(user,workspaceId,entry,settings||{}));}catch(e){return compactError(e);}});

	return server;
}

export async function handleMcpAddonRequest(request: Request): Promise<Response> {
	let identity;
	try { identity=await authenticateMcpAccessToken(request); }
	catch(error:any){return new Response(JSON.stringify({error:String(error?.message||'Authentication required')}),{status:Number(error?.status||401),headers:{'content-type':'application/json','www-authenticate':'Bearer resource_metadata="https://orbitfsmcp.vercel.app/.well-known/oauth-protected-resource"'}});}
	const server=createOrbitMcpServer(identity.user as OrbitUser,identity.scopes);
	const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
	await server.connect(transport);
	try{return await transport.handleRequest(request);}
	finally{await transport.close();}
}
