import { error, type RequestHandler } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth';
import { assertMcpLicensed, getMcpAddonRow } from '$lib/server/mcp-cloud';

async function proxy({ request, params, cookies, url }: Parameters<RequestHandler>[0]) {
	await requireUser(cookies);
	await assertMcpLicensed();
	const addon = await getMcpAddonRow();
	if (!addon?.installed || !addon?.attached || !addon?.deployment_url) throw error(404, 'MCP add-on is detached');

	const base = String(addon.deployment_url).replace(/\/$/, '');
	const rest = String(params.rest || '').replace(/^\/+/, '');
	const target = `${base}/api/mcp/${rest}${url.search}`;
	const headers = new Headers(request.headers);
	headers.delete('host');
	headers.delete('content-length');
	const session = cookies.get('orbitfs_session');
	if (session) headers.set('cookie', `orbitfs_session=${encodeURIComponent(session)}`);
	headers.set('x-orbitfs-proxy', 'orbitfs-project');

	const init: RequestInit = { method: request.method, headers, redirect: 'manual' };
	if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();
	const response = await fetch(target, init);
	const outHeaders = new Headers(response.headers);
	outHeaders.delete('set-cookie');
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outHeaders });
}
export const GET: RequestHandler = proxy;
export const POST: RequestHandler = proxy;
export const PUT: RequestHandler = proxy;
export const PATCH: RequestHandler = proxy;
export const DELETE: RequestHandler = proxy;
