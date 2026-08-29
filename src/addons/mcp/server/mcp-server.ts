import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { ORBITFS_WIDGET_HTML, ORBITFS_WIDGET_URI } from './chatgpt-widget';

const SERVER_NAME = 'orbitfs-mcp';
const SERVER_VERSION = '0.2.0';

export function createOrbitMcpServer() {
	const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
	server.registerTool('orbitfs_status', {
		title:'Get OrbitFS MCP status',
		description:'Use this when you need to verify the authenticated OrbitFS MCP connection and current user.',
		inputSchema:{}, annotations:{ readOnlyHint:true, destructiveHint:false, openWorldHint:false }
	}, async (_args, extra) => {
		const user=String(extra.authInfo?.extra?.displayName || extra.authInfo?.extra?.username || 'OrbitFS user');
		return { content:[{type:'text',text:`OrbitFS MCP is online and authenticated as ${user}.`}],
			structuredContent:{ok:true,status:'Online',user,server:SERVER_NAME,version:SERVER_VERSION,mode:'external-vercel'} };
	});

	registerAppTool(server,'orbitfs_dashboard',{
		title:'Open OrbitFS', description:'Use this when the user wants an interactive OrbitFS overview inside ChatGPT.', inputSchema:{},
		annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
		_meta:{ui:{resourceUri:ORBITFS_WIDGET_URI},'openai/outputTemplate':ORBITFS_WIDGET_URI,'openai/toolInvocation/invoking':'Opening OrbitFS','openai/toolInvocation/invoked':'OrbitFS ready'}
	},async (_args,extra)=>{
		const user=String(extra.authInfo?.extra?.displayName || extra.authInfo?.extra?.username || 'OrbitFS user');
		return {content:[{type:'text',text:'Opened the authenticated OrbitFS MCP dashboard.'}],structuredContent:{status:'Online',user,projectUrl:'https://orbitfsproject.vercel.app'}};
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
