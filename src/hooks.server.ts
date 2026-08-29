import { type Handle } from '@sveltejs/kit';
import { assertMcpLicensed } from '$lib/server/mcp-cloud';

function isBackendPath(pathname: string) {
	if (pathname === '/mcp') return true;
	if (pathname === '/api/setup/status') return true;
	if (pathname === '/api/mcp' || pathname.startsWith('/api/mcp/')) return true;
	return false;
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	if (event.request.method === 'OPTIONS' && isBackendPath(pathname)) return resolve(event);

	if (!isBackendPath(pathname)) {
		return new Response('Not found', {
			status: 404,
			headers: { 'cache-control': 'no-store' }
		});
	}

	if (pathname === '/api/setup/status') return resolve(event);
	try {
		await assertMcpLicensed();
	} catch (cause: any) {
		return new Response(JSON.stringify({
			error: cause instanceof Error ? cause.message : 'OrbitFS MCP licence is required',
			code: cause?.code || 'MCP_LICENSE_REQUIRED',
			restricted: true
		}), {
			status: Number(cause?.status || 403),
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		});
	}

	return resolve(event);
};
