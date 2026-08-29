import type { RequestHandler } from './$types';
import { dispatchPanelAddonHttp } from '$lib/server/addons/registry';
import { assertMcpLicensed, assertMcpRunning } from '$lib/server/mcp-cloud';

const handle: RequestHandler = async ({ request }) => {
	await assertMcpLicensed();
	await assertMcpRunning();
	return dispatchPanelAddonHttp('mcp', request);
};

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
