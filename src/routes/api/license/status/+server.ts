import { json } from '@sveltejs/kit';
import { getPanelLicenseSummary } from '$lib/server/license';

export async function GET({ url }) {
	const refresh = url.searchParams.get('refresh') === '1';
	try {
		return json(await getPanelLicenseSummary({ refresh }));
	} catch (error) {
		return json({
			valid: false,
			licensed: false,
			enforcement: true,
			reason: 'license_check_failed',
			refreshError: error instanceof Error ? error.message : 'License check failed'
		}, { status: 503 });
	}
}
