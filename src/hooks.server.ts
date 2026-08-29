import { redirect, type Handle } from '@sveltejs/kit';
import { assertMcpLicensed } from '$lib/server/mcp-cloud';

const PUBLIC_PATHS = new Set([
	'/login',
	'/api/auth/login',
	'/api/auth/logout',
	'/api/auth/me',
	'/api/setup/status'
]);

function bypassLicense(pathname: string, method: string) {
	if (pathname === '/mcp') return true;
	if (method === 'OPTIONS') return true;
	if (PUBLIC_PATHS.has(pathname)) return true;
	if (pathname.startsWith('/_app/') || pathname.startsWith('/favicon') || pathname.startsWith('/robots')) return true;
	return false;
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	if (bypassLicense(pathname, event.request.method)) return resolve(event);

	try {
		await assertMcpLicensed();
	} catch (cause: any) {
		const message = cause instanceof Error ? cause.message : 'OrbitFS MCP licence is required';
		if (pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({
				error: message,
				code: cause?.code || 'MCP_LICENSE_REQUIRED',
				restricted: true
			}), {
				status: Number(cause?.status || 403),
				headers: { 'content-type': 'application/json' }
			});
		}
		throw redirect(303, `/login?next=${encodeURIComponent(`${pathname}${event.url.search}`)}`);
	}

	return resolve(event);
};
