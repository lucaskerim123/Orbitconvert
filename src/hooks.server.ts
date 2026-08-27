import { redirect, type Handle } from '@sveltejs/kit';
import { getPanelLicenseSummary } from '$lib/server/license';

const PUBLIC_PATHS = new Set([
	'/license',
	'/login',
	'/api/auth/login',
	'/api/auth/logout',
	'/api/auth/me',
	'/api/license/status',
	'/api/license/activate'
]);

function bypassLicense(pathname: string, method: string) {
	if (method === 'OPTIONS') return true;
	if (PUBLIC_PATHS.has(pathname)) return true;
	if (pathname.startsWith('/_app/') || pathname.startsWith('/favicon') || pathname.startsWith('/robots')) return true;
	return false;
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	if (bypassLicense(pathname, event.request.method)) return resolve(event);

	let summary;
	try {
		summary = await getPanelLicenseSummary();
	} catch (error) {
		summary = {
			licensed: false,
			reason: 'license_check_failed',
			refreshError: error instanceof Error ? error.message : 'License check failed'
		};
	}

	if (!summary.licensed) {
		if (pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({
				error: 'OrbitFS Base System licence is required',
				code: 'LICENSE_REQUIRED',
				license: summary,
				restricted: true
			}), {
				status: 403,
				headers: { 'content-type': 'application/json' }
			});
		}
		const next = encodeURIComponent(`${pathname}${event.url.search}`);
		throw redirect(303, `/license?next=${next}`);
	}

	return resolve(event);
};
