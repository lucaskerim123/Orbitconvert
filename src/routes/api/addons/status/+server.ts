import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';

export async function GET({ cookies }) {
	await requireUser(cookies);
	await assertPanelLicensed();
	return json({ addons: [] });
}