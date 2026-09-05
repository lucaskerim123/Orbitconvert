import { json } from '@sveltejs/kit';
import { getLicenseProviderDiagnostics } from '$lib/server/license';

export async function POST({ request }) {
	try {
		const body = await request.json().catch(() => ({}));
		const providerBase = String(body.providerBase || '').trim();
		return json(await getLicenseProviderDiagnostics(providerBase), { headers: { 'cache-control': 'no-store' } });
	} catch (error: any) {
		return json({
			error: String(error?.message || 'Could not test licence system'),
			code: String(error?.code || 'LICENSE_PROVIDER_TEST_FAILED')
		}, { status: Number(error?.status || 400) });
	}
}
