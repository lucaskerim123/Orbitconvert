import type { RequestHandler } from './$types';

const moved: RequestHandler = async () => new Response(JSON.stringify({
	error: 'OrbitFS MCP is hosted by the standalone Vercel MCP service',
	resource: 'https://orbitconvert-mcp-addon.vercel.app/mcp',
	protectedResourceMetadata: 'https://orbitconvert-mcp-addon.vercel.app/.well-known/oauth-protected-resource'
}), {
	status: 410,
	headers: {
		'content-type': 'application/json',
		'link': '<https://orbitconvert-mcp-addon.vercel.app/mcp>; rel="alternate"'
	}
});

export const GET = moved;
export const POST = moved;
export const DELETE = moved;
