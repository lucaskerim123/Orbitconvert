import type { RequestHandler } from './$types';
import { dispatchPanelAddonHttp } from '$lib/server/addons/registry';
import { assertMcpLicensed, getMcpAddonRow } from '$lib/server/mcp-cloud';

const handle: RequestHandler = async ({ request }) => {
	const addon = await getMcpAddonRow();
	if (!addon?.installed || !addon?.attached) return new Response('MCP add-on is detached', { status: 404 });
	try { await assertMcpLicensed(); }
	catch { return new Response('MCP licence required', { status: 403 }); }
	return dispatchPanelAddonHttp('mcp', request);
};

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
