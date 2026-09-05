import { mcpAddonManifest } from '../../../addons/mcp/manifest';

export type PanelAddonManifest = {
	id: string;
	name: string;
	description: string;
	version: string;
	kind: string;
};

const manifests = new Map<string, PanelAddonManifest>([
	[mcpAddonManifest.id, mcpAddonManifest]
]);

export function getPanelAddonManifest(id: string) {
	return manifests.get(id) ?? null;
}

export async function dispatchPanelAddonHttp(id: string, _request: Request): Promise<Response> {
	if (id === 'mcp') {
		return new Response(JSON.stringify({
			error: 'MCP resource server moved to standalone Vercel service',
			resource: 'https://orbitconvert-mcp-addon.vercel.app/mcp'
		}), {
			status: 410,
			headers: { 'content-type': 'application/json' }
		});
	}
	return new Response(JSON.stringify({ error: 'Addon route not found' }), {
		status: 404,
		headers: { 'content-type': 'application/json' }
	});
}
