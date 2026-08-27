import { json } from '@sveltejs/kit';
import { createSession, verifyPassword } from '$lib/server/auth';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { writeAudit } from '$lib/server/audit';

export async function POST({ request, cookies, url, getClientAddress }) {
	const body = await request.json().catch(() => ({}));
	const identity = String(body.identity ?? body.username ?? '').trim();
	const password = String(body.password ?? '');
	if (!identity || !password) return json({ error: 'Username/email and password are required' }, { status: 400 });

	const supabase = getSupabaseAdmin();
	const query = supabase.from('orbitfs_users').select('id,username,display_name,email,password_hash,role,status,avatar_url');
	const { data: user, error } = identity.includes('@')
		? await query.ilike('email', identity.toLowerCase()).maybeSingle()
		: await query.ilike('username', identity).maybeSingle();
	if (error) return json({ error: 'Login failed' }, { status: 500 });
	if (!user || !verifyPassword(password, user.password_hash)) return json({ error: 'Invalid username/email or password' }, { status: 401 });
	if (user.status !== 'active') return json({ error: 'This account is disabled' }, { status: 403 });

	let ip: string | null = null;
	try { ip = getClientAddress(); } catch { ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null; }
	await createSession(user.id, cookies, { userAgent: request.headers.get('user-agent'), ip, secure: url.protocol === 'https:' });
	await writeAudit({ actorUserId: user.id, action: 'auth.login', targetType: 'user', targetId: user.id, ip, userAgent: request.headers.get('user-agent') });
	const { password_hash: _passwordHash, ...safeUser } = user;
	return json({ ok: true, user: safeUser });
}
