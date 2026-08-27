import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';
import { getSupabaseAdmin } from '$lib/server/supabase';

export async function DELETE({ params, cookies }: any) {
	try {
		await assertPanelLicensed();
		await requireAdmin(cookies);
		const name = decodeURIComponent(String(params.rest || '')).trim();
		if (!name) return json({ error:'Group name is required' }, { status:400 });
		const supabase = getSupabaseAdmin();
		const group = await supabase.from('orbitfs_groups').select('id').ilike('name',name).maybeSingle();
		if (group.error) throw group.error;
		if (!group.data) return json({ error:'Group not found' }, { status:404 });
		const members = await supabase.from('orbitfs_group_members').delete().eq('group_id',group.data.id);
		if (members.error) throw members.error;
		const deleted = await supabase.from('orbitfs_groups').delete().eq('id',group.data.id);
		if (deleted.error) throw deleted.error;
		return json({ ok:true });
	} catch (error:any) {
		return json({ error:String(error?.message || 'Could not delete group') }, { status:Number(error?.status || 500) });
	}
}