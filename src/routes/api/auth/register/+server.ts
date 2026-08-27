import { json } from '@sveltejs/kit';
import { createSession, hashPassword } from '$lib/server/auth';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { writeAudit } from '$lib/server/audit';

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

export async function POST({ request, cookies, url, getClientAddress }) {
	const body = await request.json().catch(() => ({}));
	const username = String(body.username ?? '').trim();
	const displayName = String(body.displayName ?? username).trim();
	const email = String(body.email ?? '').trim().toLowerCase() || null;
	const password = String(body.password ?? '');
	if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) return json({ error: 'Username must be 3-32 letters, numbers, dots, dashes or underscores' }, { status: 400 });
	if (displayName.length < 2 || displayName.length > 80) return json({ error: 'Display name must be 2-80 characters' }, { status: 400 });
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address' }, { status: 400 });
	if (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return json({ error: 'Password must be 8-128 characters and include a letter and number' }, { status: 400 });

	const supabase = getSupabaseAdmin();
	const [{ count }, existingUser, existingEmail] = await Promise.all([
		supabase.from('orbitfs_users').select('*', { count: 'exact', head: true }),
		supabase.from('orbitfs_users').select('id').ilike('username', username).maybeSingle(),
		email ? supabase.from('orbitfs_users').select('id').ilike('email', email).maybeSingle() : Promise.resolve({ data: null, error: null })
	]);
	if (existingUser.data) return json({ error: 'That username is already registered' }, { status: 409 });
	if (existingEmail.data) return json({ error: 'That email address is already registered' }, { status: 409 });
	const isFirstUser = (count ?? 0) === 0;
	const { data: user, error: userError } = await supabase.from('orbitfs_users').insert({
		username,
		display_name: displayName,
		email,
		password_hash: hashPassword(password),
		role: isFirstUser ? 'owner' : 'member',
		status: 'active'
	}).select('id,username,display_name,email,role,status,avatar_url').single();
	if (userError || !user) return json({ error: userError?.message ?? 'Registration failed' }, { status: 500 });

	try {
		if (isFirstUser) {
			const { data: publicWorkspace, error } = await supabase.from('orbitfs_workspaces').insert({
				name: 'Public Workspace', slug: 'public-workspace', description: 'Shared public workspace', visibility: 'public', is_main: true, created_by: user.id
			}).select('id').single();
			if (error || !publicWorkspace) throw error ?? new Error('Could not create public workspace');
			await supabase.from('orbitfs_workspace_members').insert({ workspace_id: publicWorkspace.id, user_id: user.id, role: 'owner' });
			await supabase.from('orbitfs_files').insert([
				{ workspace_id: publicWorkspace.id, name: '_trash', path: '_trash', kind: 'folder', created_by: user.id },
				{ workspace_id: publicWorkspace.id, name: '_media', path: '_media', kind: 'folder', created_by: user.id }
			]);
		}

		const baseSlug = slugify(username) || 'user';
		const { data: personalWorkspace, error: workspaceError } = await supabase.from('orbitfs_workspaces').insert({
			name: 'My Workspace', slug: `${baseSlug}-workspace-${Date.now().toString(36)}`, description: `${displayName}'s private workspace`, visibility: 'private', created_by: user.id
		}).select('id').single();
		if (workspaceError || !personalWorkspace) throw workspaceError ?? new Error('Could not create personal workspace');
		await supabase.from('orbitfs_workspace_members').insert({ workspace_id: personalWorkspace.id, user_id: user.id, role: 'owner' });
		await supabase.from('orbitfs_files').insert([
			{ workspace_id: personalWorkspace.id, name: '_trash', path: '_trash', kind: 'folder', created_by: user.id },
			{ workspace_id: personalWorkspace.id, name: '_media', path: '_media', kind: 'folder', created_by: user.id }
		]);
	} catch (workspaceError) {
		await supabase.from('orbitfs_users').delete().eq('id', user.id);
		console.error('OrbitFS registration workspace setup failed', workspaceError);
		return json({ error: 'Could not finish account setup' }, { status: 500 });
	}

	let ip: string | null = null;
	try { ip = getClientAddress(); } catch { ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null; }
	await createSession(user.id, cookies, { userAgent: request.headers.get('user-agent'), ip, secure: url.protocol === 'https:' });
	await writeAudit({ actorUserId: user.id, action: 'auth.register', targetType: 'user', targetId: user.id, ip, userAgent: request.headers.get('user-agent'), detail: { firstOwner: isFirstUser } });
	return json({ ok: true, user });
}
