import { type Handle } from '@sveltejs/kit';
import { assertMcpLicensed } from '$lib/server/mcp-cloud';

const BACKEND_PATHS = [
	'/mcp',
	'/api/mcp/',
	'/api/setup/status'
];

function isBackendPath(pathname: string) {
	return BACKEND_PATHS.some((path) => pathname === path || pathname.startsWith(path));
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	if (event.request.method === 'OPTIONS') return resolve(event);

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
