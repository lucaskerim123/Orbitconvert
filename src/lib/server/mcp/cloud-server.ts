import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

const SERVER_NAME = 'orbitfs-cloud';
const SERVER_VERSION = '0.1.0';

export function createOrbitMcpServer() {
	const server = new McpServer({
		name: SERVER_NAME,
		version: SERVER_VERSION
	});

	server.registerTool(
		'orbitfs_status',
		{
			title: 'Get OrbitFS MCP status',
			description: 'Use this when you need to verify that the OrbitFS cloud MCP endpoint is online and responding.',
			inputSchema: {},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				openWorldHint: false
			}
		},
		async () => ({
			content: [{ type: 'text', text: 'OrbitFS cloud MCP is online.' }],
			structuredContent: { ok: true, server: SERVER_NAME, version: SERVER_VERSION, mode: 'cloud' }
		})
	);

	return server;
}

export async function handleOrbitMcpRequest(request: Request): Promise<Response> {
	const server = createOrbitMcpServer();
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true
	});

	await server.connect(transport);
	try {
		return await transport.handleRequest(request);
	} finally {
		await transport.close();
	}
}
