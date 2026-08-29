import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { ORBITFS_WIDGET_HTML, ORBITFS_WIDGET_URI } from './chatgpt-widget';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { visibleWorkspaces } from '$lib/server/workspaces';
import { requireMcpWorkspace, listMcpProjects, listContextBundles, getContextBundle, getStartup } from '$lib/server/mcp-workspace-state';
import type { OrbitUser } from '$lib/server/auth';

const SERVER_NAME = 'orbitfs-mcp';
const SERVER_VERSION = '0.3.0';

async function oauthUser(extra:any): Promise<OrbitUser> {
	const id=String(extra.authInfo?.extra?.userId || '');
	if(!id) throw new Error('Authenticated OrbitFS user is required');
	const db=getSupabaseAdmin();
	const {data,error}=await db.from('orbitfs_users').select('id,username,display_name,email,role,status,avatar_url,permissions,must_change_pin,ban_reason').eq('id',id).maybeSingle();
	if(error) throw error;
	if(!data || data.status!=='active') throw new Error('OrbitFS user is unavailable');
	return data as OrbitUser;
}

const textResult=(text:string,structuredContent:any)=>({content:[{type:'text' as const,text}],structuredContent});

export function createOrbitMcpServer() {
	const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
	server.registerTool('orbitfs_status', {
		title:'Get OrbitFS MCP status', description:'Verify the authenticated OrbitFS MCP connection and current user.',
		inputSchema:{}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
	}, async (_args, extra) => {
		const user=await oauthUser(extra);
		return textResult(`OrbitFS MCP is online and authenticated as ${user.display_name||user.username}.`,{ok:true,status:'Online',user:user.display_name||user.username,server:SERVER_NAME,version:SERVER_VERSION});
	});

	server.registerTool('orbitfs_list_workspaces', {
		title:'List OrbitFS workspaces', description:'List OrbitFS workspaces the authenticated user can access.',
		inputSchema:{}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
	}, async (_args,extra)=>{
		const user=await oauthUser(extra); const workspaces=await visibleWorkspaces(user);
		return textResult(`Found ${workspaces.length} accessible OrbitFS workspace(s).`,{workspaces});
	});

	server.registerTool('orbitfs_list_projects', {
		title:'List MCP projects', description:'List MCP projects for an accessible OrbitFS workspace.',
		inputSchema:{workspaceId:z.string().min(1)}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
	}, async ({workspaceId},extra)=>{
		const user=await oauthUser(extra); await requireMcpWorkspace(user,workspaceId); const projects=await listMcpProjects(workspaceId);
		return textResult(`Found ${projects.length} MCP project(s).`,{workspaceId,projects});
	});
	server.registerTool('orbitfs_list_context_bundles', {
		title:'List context bundles', description:'List MCP context bundles for an accessible OrbitFS workspace.',
		inputSchema:{workspaceId:z.string().min(1)}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
	}, async ({workspaceId},extra)=>{
		const user=await oauthUser(extra); await requireMcpWorkspace(user,workspaceId); const bundles=await listContextBundles(workspaceId);
		return textResult(`Found ${bundles.length} context bundle(s).`,{workspaceId,bundles});
	});

	server.registerTool('orbitfs_get_context_bundle', {
		title:'Get context bundle', description:'Read one MCP context bundle and its entries/dependencies.',
		inputSchema:{workspaceId:z.string().min(1),bundleId:z.string().min(1)}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
	}, async ({workspaceId,bundleId},extra)=>{
		const user=await oauthUser(extra); await requireMcpWorkspace(user,workspaceId); const bundle=await getContextBundle(workspaceId,bundleId);
		return textResult(`Loaded context bundle ${bundle.name||bundleId}.`,{workspaceId,bundle});
	});

	server.registerTool('orbitfs_get_startup', {
		title:'Get workspace startup', description:'Read the MCP startup configuration for an accessible OrbitFS workspace.',
		inputSchema:{workspaceId:z.string().min(1)}, annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
	}, async ({workspaceId},extra)=>{
		const user=await oauthUser(extra); await requireMcpWorkspace(user,workspaceId); const startup=await getStartup(workspaceId);
		return textResult('Loaded OrbitFS MCP startup configuration.',{workspaceId,startup});
	});
	registerAppTool(server,'orbitfs_dashboard',{
		title:'Open OrbitFS', description:'Open an interactive authenticated OrbitFS overview inside ChatGPT.', inputSchema:{},
		annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
		_meta:{ui:{resourceUri:ORBITFS_WIDGET_URI},'openai/outputTemplate':ORBITFS_WIDGET_URI,'openai/toolInvocation/invoking':'Opening OrbitFS','openai/toolInvocation/invoked':'OrbitFS ready'}
	},async (_args,extra)=>{
		const user=await oauthUser(extra);
		return textResult('Opened the authenticated OrbitFS MCP dashboard.',{status:'Online',user:user.display_name||user.username,projectUrl:'https://orbitfsproject.vercel.app'});
	});

	registerAppResource(server,'OrbitFS Dashboard',ORBITFS_WIDGET_URI,{description:'Authenticated OrbitFS dashboard for ChatGPT.'},async()=>({
		contents:[{uri:ORBITFS_WIDGET_URI,mimeType:RESOURCE_MIME_TYPE,text:ORBITFS_WIDGET_HTML,_meta:{ui:{prefersBorder:true,csp:{connectDomains:['https://orbitfsproject.vercel.app','https://orbitfsmcp.vercel.app'],resourceDomains:[]}},'openai/widgetDescription':'Interactive authenticated OrbitFS overview.'}}]
	}));
	return server;
}

export async function handleMcpAddonRequest(request:Request, authInfo?:AuthInfo):Promise<Response> {
	const server=createOrbitMcpServer();
	const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
	await server.connect(transport);
	try { return await transport.handleRequest(request,{authInfo}); }
	finally { await transport.close(); }
}
