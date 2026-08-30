import { json } from '@sveltejs/kit';
import { MCP_RESOURCE, OAUTH_ISSUER } from '$lib/server/mcp-oauth';

export function GET() {
	return json({
		resource:MCP_RESOURCE,
		authorization_servers:[OAUTH_ISSUER],
		scopes_supported:['orbitfs:read','orbitfs:write','offline_access'],
		bearer_methods_supported:['header'],
		resource_name:'OrbitFS MCP',
		resource_documentation:'https://orbitfsproject.vercel.app/admin/mcp/settings'
	}, { headers:{'cache-control':'public, max-age=300','access-control-allow-origin':'*'} });
}
