import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';

export async function POST({ request, cookies }) {
	try {
		await requireAdmin(cookies);
		await assertPanelLicensed();
		const body = await request.json().catch(() => ({}));
		const target = String(body.target ?? 'runtime');
		return json({ error:`${target} is managed by Vercel in cloud mode and cannot be started/stopped from OrbitFS.` }, { status:409 });
	} catch (error:any) { return json({ error:String(error?.message || 'Control action failed') }, { status:Number(error?.status || 500) }); }
}
