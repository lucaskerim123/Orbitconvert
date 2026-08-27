import { json } from '@sveltejs/kit';
import { activatePanelLicense } from '$lib/server/license';
import { requireAdmin } from '$lib/server/auth';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { writeAudit } from '$lib/server/audit';

export async function POST({ request, cookies }) {
	const supabase = getSupabaseAdmin();
	const { count, error: countError } = await supabase.from('orbitfs_users').select('*', { count: 'exact', head: true });
	if (countError) return json({ error: countError.message }, { status: 500 });

	let actor = null;
	if ((count ?? 0) > 0) {
		try {
			actor = await requireAdmin(cookies);
		} catch {
			return json({ error: 'Owner or admin login is required to replace the licence' }, { status: 401 });
		}
	}

	const body = await request.json().catch(() => ({}));
	const licenseKey = String(body.licenseKey ?? '').trim();
	if (!licenseKey) return json({ error: 'Licence key is required' }, { status: 400 });

	try {
		const summary = await activatePanelLicense(licenseKey);
		await writeAudit({
			actorUserId: actor?.id ?? null,
			action: 'license.activate',
			targetType: 'license',
			targetId: 'primary',
			detail: { component: 'orbitfs_panel', keyHint: summary.keyHint, installationId: summary.installationId }
		});
		return json({ ok: true, license: summary });
	} catch (error: any) {
		return json({
			error: String(error?.message || 'Licence activation failed'),
			code: String(error?.code || 'LICENSE_ACTIVATION_FAILED')
		}, { status: Number(error?.status || 403) });
	}
}
