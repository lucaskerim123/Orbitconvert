import { json } from '@sveltejs/kit';
import { createSession, hashPassword } from '$lib/server/auth';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { writeAudit } from '$lib/server/audit';

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const CORE_FOLDERS = ['_trash', '_media'] as const;

async function ensureCoreFolders(supabase: ReturnType<typeof getSupabaseAdmin>, workspaceId: string, userId: string) {
	const { data: existing, error: lookupError } = await supabase
		.from('orbitfs_files')
		.select('path')
		.eq('workspace_id', workspaceId)
		.in('path', [...CORE_FOLDERS]);
	if (lookupError) throw lookupError;
	const existingPaths = new Set((existing ?? []).map((item) => item.path));
	const missing = CORE_FOLDERS.filter((path) => !existingPaths.has(path)).map((path) => ({
		workspace_id: workspaceId,
		name: path,
		path,
		kind: 'folder',
		created_by: userId
	}));
	if (missing.length) {
		const { error } = await supabase.from('orbitfs_files').insert(missing);
		if (error) throw error;
	}
}

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
	const [{ count, error: countError }, existingUser, existingEmail] = await Promise.all([
		supabase.from('orbitfs_users').select('*', { count: 'exact', head: true }),
		supabase.from('orbitfs_users').select('id').ilike('username', username).maybeSingle(),
		email ? supabase.from('orbitfs_users').select('id').ilike('email', email).maybeSingle() : Promise.resolve({ data: null, error: null })
	]);
	if (countError) return json({ error: 'Could not check registration state' }, { status: 500 });
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
	if (userError || !user) return json({ error: userError?.code === '23505' ? 'Username or email is already registered' : userError?.message ?? 'Registration failed' }, { status: userError?.code === '23505' ? 409 : 500 });

	let adoptedPublicWorkspaceId: string | null = null;
	let personalWorkspaceId: string | null = null;
	try {
		if (isFirstUser) {
			const { data: existingPublic, error: publicLookupError } = await supabase
				.from('orbitfs_workspaces')
				.select('id')
				.eq('slug', 'public-workspace')
				.maybeSingle();
			if (publicLookupError) throw publicLookupError;

			if (existingPublic) {
				adoptedPublicWorkspaceId = existingPublic.id;
				const { error } = await supabase.from('orbitfs_workspaces').update({
					name: 'Public Workspace',
					description: 'Shared public workspace',
					visibility: 'public',
					status: 'active',
					is_main: true,
					created_by: user.id
				}).eq('id', existingPublic.id);
				if (error) throw error;
			} else {
				const { data: createdPublic, error } = await supabase.from('orbitfs_workspaces').insert({
					name: 'Public Workspace',
					slug: 'public-workspace',
					description: 'Shared public workspace',
					visibility: 'public',
					is_main: true,
					created_by: user.id
				}).select('id').single();
				if (error || !createdPublic) throw error ?? new Error('Could not create public workspace');
				adoptedPublicWorkspaceId = createdPublic.id;
			}

			const { error: membershipError } = await supabase.from('orbitfs_workspace_members').upsert(
				{ workspace_id: adoptedPublicWorkspaceId, user_id: user.id, role: 'owner' },
				{ onConflict: 'workspace_id,user_id' }
			);
			if (membershipError) throw membershipError;
			await ensureCoreFolders(supabase, adoptedPublicWorkspaceId!, user.id);
		}

		const baseSlug = slugify(username) || 'user';
		const { data: personalWorkspace, error: workspaceError } = await supabase.from('orbitfs_workspaces').insert({
			name: 'My Workspace',
			slug: `${baseSlug}-workspace-${Date.now().toString(36)}`,
			description: `${displayName}'s private workspace`,
			visibility: 'private',
			created_by: user.id
		}).select('id').single();
		if (workspaceError || !personalWorkspace) throw workspaceError ?? new Error('Could not create personal workspace');
		personalWorkspaceId = personalWorkspace.id;

		const { error: personalMembershipError } = await supabase.from('orbitfs_workspace_members').insert({
			workspace_id: personalWorkspace.id,
			user_id: user.id,
			role: 'owner'
		});
		if (personalMembershipError) throw personalMembershipError;
		await ensureCoreFolders(supabase, personalWorkspace.id, user.id);
	} catch (workspaceError) {
		await supabase.from('orbitfs_workspace_members').delete().eq('user_id', user.id);
		if (personalWorkspaceId) await supabase.from('orbitfs_workspaces').delete().eq('id', personalWorkspaceId);
		if (isFirstUser && adoptedPublicWorkspaceId) {
			await supabase.from('orbitfs_workspaces').update({ created_by: null }).eq('id', adoptedPublicWorkspaceId);
		}
		await supabase.from('orbitfs_users').delete().eq('id', user.id);
		console.error('OrbitFS registration workspace setup failed', workspaceError);
		return json({ error: 'Could not finish account setup' }, { status: 500 });
	}

	let ip: string | null = null;
	try { ip = getClientAddress(); } catch { ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null; }
	try {
		await createSession(user.id, cookies, { userAgent: request.headers.get('user-agent'), ip, secure: url.protocol === 'https:' });
	} catch (sessionError) {
		console.error('OrbitFS registration session creation failed', sessionError);
		return json({ error: 'Account created, but sign-in session could not be started. Please sign in.' }, { status: 500 });
	}
	await writeAudit({ actorUserId: user.id, action: 'auth.register', targetType: 'user', targetId: user.id, ip, userAgent: request.headers.get('user-agent'), detail: { firstOwner: isFirstUser } });
	return json({ ok: true, user });
}
