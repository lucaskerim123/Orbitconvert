import { json } from '@sveltejs/kit';
import { getSupabaseAdmin } from '$lib/server/supabase';

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
const cleanName = (value: unknown) => String(value ?? '').trim();

export async function GET() {
	const supabase = getSupabaseAdmin();
	const [workspacesResult, profilesResult, filesResult, permissionsResult, settingsResult] = await Promise.all([
		supabase.from('orbitfs_workspaces').select('*').order('is_main', { ascending: false }).order('name'),
		supabase.from('orbitfs_profiles').select('*').order('updated_at', { ascending: false }),
		supabase.from('orbitfs_files').select('*').is('deleted_at', null).order('kind').order('name'),
		supabase.from('orbitfs_file_permissions').select('*').order('path_prefix'),
		supabase.from('orbitfs_settings').select('*')
	]);
	const failure = [workspacesResult, profilesResult, filesResult, permissionsResult, settingsResult].find((result) => result.error);
	if (failure?.error) return json({ error: failure.error.message }, { status: 500 });
	return json({
		workspaces: workspacesResult.data ?? [],
		profiles: profilesResult.data ?? [],
		files: filesResult.data ?? [],
		permissions: permissionsResult.data ?? [],
		settings: settingsResult.data ?? []
	});
}

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	const action = String(body.action ?? '');
	const supabase = getSupabaseAdmin();

	if (action === 'workspace.create') {
		const name = cleanName(body.name);
		if (name.length < 2) return json({ error: 'Workspace name is required' }, { status: 400 });
		let slug = slugify(name) || 'workspace';
		const { count } = await supabase.from('orbitfs_workspaces').select('*', { count: 'exact', head: true }).like('slug', `${slug}%`);
		if ((count ?? 0) > 0) slug = `${slug}-${Date.now().toString(36)}`;
		const { data, error } = await supabase.from('orbitfs_workspaces').insert({
			name,
			slug,
			description: cleanName(body.description),
			visibility: ['private','shared','public'].includes(body.visibility) ? body.visibility : 'private'
		}).select('*').single();
		if (error || !data) return json({ error: error?.message ?? 'Create failed' }, { status: 500 });
		await supabase.from('orbitfs_files').insert([
			{ workspace_id: data.id, name: '_trash', path: '_trash', kind: 'folder' },
			{ workspace_id: data.id, name: '_media', path: '_media', kind: 'folder' }
		]);
		return json({ ok: true, item: data });
	}

	if (action === 'workspace.update') {
		const id = cleanName(body.id);
		const patch: Record<string, unknown> = {};
		if (body.name !== undefined) { patch.name = cleanName(body.name); patch.slug = slugify(cleanName(body.name)); }
		if (body.description !== undefined) patch.description = cleanName(body.description);
		if (['active','offline','archived'].includes(body.status)) patch.status = body.status;
		if (['private','shared','public'].includes(body.visibility)) patch.visibility = body.visibility;
		const { data, error } = await supabase.from('orbitfs_workspaces').update(patch).eq('id', id).select('*').single();
		if (error) return json({ error: error.message }, { status: 500 });
		return json({ ok: true, item: data });
	}

	if (action === 'workspace.delete') {
		const id = cleanName(body.id);
		const { data: workspace } = await supabase.from('orbitfs_workspaces').select('is_main').eq('id', id).maybeSingle();
		if (workspace?.is_main) return json({ error: 'Main workspace cannot be deleted' }, { status: 400 });
		const { error } = await supabase.from('orbitfs_workspaces').delete().eq('id', id);
		if (error) return json({ error: error.message }, { status: 500 });
		return json({ ok: true });
	}

	if (action === 'profile.create') {
		const workspaceId = cleanName(body.workspaceId);
		const name = cleanName(body.name);
		if (!workspaceId || !name) return json({ error: 'Workspace and profile name are required' }, { status: 400 });
		const { data, error } = await supabase.from('orbitfs_profiles').insert({
			workspace_id: workspaceId,
			name,
			type: cleanName(body.type) || 'Person',
			classification: cleanName(body.classification) || 'General',
			labels: Array.isArray(body.labels) ? body.labels.map(cleanName).filter(Boolean) : [],
			background: String(body.background ?? ''),
			relationship: String(body.relationship ?? ''),
			notes: String(body.notes ?? ''),
			data: typeof body.data === 'object' && body.data ? body.data : {}
		}).select('*').single();
		if (error) return json({ error: error.message }, { status: 500 });
		return json({ ok: true, item: data });
	}

	if (action === 'profile.update') {
		const id = cleanName(body.id);
		const allowed = ['name','type','classification','labels','background','relationship','notes','data'];
		const patch = Object.fromEntries(allowed.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
		const { data, error } = await supabase.from('orbitfs_profiles').update(patch).eq('id', id).select('*').single();
		if (error) return json({ error: error.message }, { status: 500 });
		return json({ ok: true, item: data });
	}

	if (action === 'profile.delete') {
		const { error } = await supabase.from('orbitfs_profiles').delete().eq('id', cleanName(body.id));
		if (error) return json({ error: error.message }, { status: 500 });
		return json({ ok: true });
	}

	if (action === 'file.create') {
		const workspaceId = cleanName(body.workspaceId);
		const parentPath = cleanName(body.parentPath).replace(/^\/+|\/+$/g, '');
		const name = cleanName(body.name).replace(/[\\/]+/g, '-');
		const kind = body.kind === 'folder' ? 'folder' : 'file';
		if (!workspaceId || !name) return json({ error: 'Workspace and name are required' }, { status: 400 });
		const path = [parentPath, name].filter(Boolean).join('/');
		const content = kind === 'file' ? String(body.content ?? '') : '';
		const { data, error } = await supabase.from('orbitfs_files').insert({
			workspace_id: workspaceId, name, path, kind,
			mime_type: kind === 'file' ? cleanName(body.mimeType) || 'text/plain' : null,
			content_text: content,
			size_bytes: Buffer.byteLength(content, 'utf8')
		}).select('*').single();
		if (error) return json({ error: error.message }, { status: error.code === '23505' ? 409 : 500 });
		return json({ ok: true, item: data });
	}

	if (action === 'file.update') {
		const id = cleanName(body.id);
		const content = String(body.content ?? '');
		const { data, error } = await supabase.from('orbitfs_files').update({ content_text: content, size_bytes: Buffer.byteLength(content, 'utf8') }).eq('id', id).eq('kind', 'file').select('*').single();
		if (error) return json({ error: error.message }, { status: 500 });
		return json({ ok: true, item: data });
	}

	if (action === 'file.delete') {
		const id = cleanName(body.id);
		const { data: entry } = await supabase.from('orbitfs_files').select('path').eq('id', id).maybeSingle();
		if (!entry) return json({ error: 'File or folder not found' }, { status: 404 });
		if (['_trash','_media'].includes(entry.path)) return json({ error: 'Core folder cannot be deleted' }, { status: 400 });
		const { error } = await supabase.from('orbitfs_files').delete().eq('id', id);
		if (error) return json({ error: error.message }, { status: 500 });
		return json({ ok: true });
	}

	if (action === 'permission.save') {
		const payload = {
			workspace_id: cleanName(body.workspaceId),
			path_prefix: cleanName(body.pathPrefix),
			principal_type: ['user','group','role'].includes(body.principalType) ? body.principalType : 'role',
			principal_id: cleanName(body.principalId) || 'owner',
			can_view: Boolean(body.canView), can_create: Boolean(body.canCreate), can_edit: Boolean(body.canEdit),
			can_delete: Boolean(body.canDelete), can_manage_permissions: Boolean(body.canManagePermissions), inherit: body.inherit !== false
		};
		const { data, error } = body.id
			? await supabase.from('orbitfs_file_permissions').update(payload).eq('id', cleanName(body.id)).select('*').single()
			: await supabase.from('orbitfs_file_permissions').insert(payload).select('*').single();
		if (error) return json({ error: error.message }, { status: 500 });
		return json({ ok: true, item: data });
	}

	if (action === 'permission.delete') {
		const { error } = await supabase.from('orbitfs_file_permissions').delete().eq('id', cleanName(body.id));
		if (error) return json({ error: error.message }, { status: 500 });
		return json({ ok: true });
	}

	if (action === 'setting.save') {
		const scopeType = ['global','workspace','user'].includes(body.scopeType) ? body.scopeType : 'global';
		const payload = { scope_type: scopeType, scope_id: cleanName(body.scopeId), key: cleanName(body.key), value: body.value };
		const { data, error } = await supabase.from('orbitfs_settings').upsert(payload, { onConflict: 'scope_type,scope_id,key' }).select('*').single();
		if (error) return json({ error: error.message }, { status: 500 });
		return json({ ok: true, item: data });
	}

	return json({ error: 'Unknown panel action' }, { status: 400 });
}
