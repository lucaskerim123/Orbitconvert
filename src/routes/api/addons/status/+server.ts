import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';
import { listCloudAddons } from '$lib/server/cloud-addons';

export async function GET({ cookies }) {
	await requireUser(cookies);
	await assertPanelLicensed();
	return json({ addons:await listCloudAddons(), mode:'cloud' });
}
