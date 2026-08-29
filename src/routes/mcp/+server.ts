import type { RequestHandler } from './$types';
import { dispatchPanelAddonHttp } from '$lib/server/addons/registry';
import { assertMcpLicensed, assertMcpRunning } from '$lib/server/mcp-cloud';
import { oauthUnauthorized, verifyMcpBearer } from '$lib/server/mcp-oauth';

const handle:RequestHandler=async({request})=>{
	let authInfo;
	try { authInfo=await verifyMcpBearer(request); }
	catch (err) { return oauthUnauthorized(err instanceof Error ? err.message : 'OAuth authentication required'); }
	await assertMcpLicensed();
	await assertMcpRunning();
	return dispatchPanelAddonHttp('mcp',request,authInfo);
};

export const GET=handle;
export const POST=handle;
export const DELETE=handle;
