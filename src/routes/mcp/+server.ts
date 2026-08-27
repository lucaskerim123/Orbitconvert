import type { RequestHandler } from './$types';
import { dispatchPanelAddonHttp } from '$lib/server/addons/registry';

const handle: RequestHandler = async ({ request }) => {
	return dispatchPanelAddonHttp('mcp', request);
};

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
