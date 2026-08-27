import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';
import { getSupabaseAdmin } from '$lib/server/supabase';

export async function POST({ params, request, cookies }: any) {
	try {
		const admin = await requireAdmin(cookies);
		await assertPanelLicensed();
		const parts = String(params.rest || '').split('/').filter(Boolean);
		if (!parts[0] || parts[1] !== 'respond') return json({ error:'Not found' }, { status:404 });
		const body = await request.json().catch(() => ({}));
		const supabase = getSupabaseAdmin();
		const found = await supabase.from('orbitfs_workspace_requests').select('*')
			.eq('id',parts[0]).eq('request_type','ownership').eq('status','pending').maybeSingle();
		if (found.error) throw found.error;
		if (!found.data) return json({ error:'Request not found' }, { status:404 });
		const approved = body.decision === 'approved';
		const status = approved ? 'approved':'denied';
		if (approved) {
			const workspace = await supabase.from('orbitfs_workspaces').select('*').eq('id',found.data.workspace_id).maybeSingle();
			if (workspace.error) throw workspace.error;
			if (!workspace.data || !found.data.target_user_id) return json({ error:'Transfer target is no longer available' }, { status:409 });
			const oldOwner = workspace.data.owner_id || workspace.data.created_by;			const changed = await supabase.from('orbitfs_workspaces').update({ owner_id:found.data.target_user_id,updated_at:new Date().toISOString() }).eq('id',workspace.data.id);
			if (changed.error) throw changed.error;
			await supabase.from('orbitfs_workspace_members').delete().eq('workspace_id',workspace.data.id).eq('user_id',found.data.target_user_id);
			const newOwner = await supabase.from('orbitfs_workspace_members').upsert({ workspace_id:workspace.data.id,user_id:found.data.target_user_id,role:'owner',mcp_enabled:false }, { onConflict:'workspace_id,user_id' });
			if (newOwner.error) throw newOwner.error;
			if (oldOwner && oldOwner !== found.data.target_user_id) {
				const previous = await supabase.from('orbitfs_workspace_members').upsert({ workspace_id:workspace.data.id,user_id:oldOwner,role:'editor',mcp_enabled:false }, { onConflict:'workspace_id,user_id' });
				if (previous.error) throw previous.error;
			}
		}
		const payload = { ...(found.data.payload || {}),response_message:String(body.message ?? '').slice(0,500) };
		const updated = await supabase.from('orbitfs_workspace_requests').update({ status,decided_by_id:admin.id,decided_at:new Date().toISOString(),payload }).eq('id',found.data.id).select('*').single();
		if (updated.error) throw updated.error;
		for (const userId of [found.data.requested_by_id,found.data.target_user_id].filter(Boolean)) {
			await supabase.from('orbitfs_notifications').insert({ user_id:userId,title:`Ownership transfer ${status}`,body:`${payload.workspace_name || 'Workspace'} ownership transfer was ${status} by ${admin.username}.`,level:approved ? 'info':'warning' });
		}
		return json({ request:{ id:updated.data.id,workspace_id:updated.data.workspace_id,...payload,status:updated.data.status,created_at:updated.data.created_at } });
	} catch (error:any) {
		return json({ error:String(error?.message || 'Could not respond to ownership request') }, { status:Number(error?.status || 500) });
	}
}