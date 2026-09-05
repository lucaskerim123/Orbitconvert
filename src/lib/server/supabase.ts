import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

export function getSupabaseAdmin() {
	const url = env.SUPABASE_URL;
	const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
	const serverSecret = env.ORBITFS_DB_SECRET;
	if (!url || !publishableKey || !serverSecret) {
		throw new Error('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and ORBITFS_DB_SECRET are required');
	}
	return createClient(url, publishableKey, {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { headers: { 'x-orbitfs-secret': serverSecret } }
	});
}
