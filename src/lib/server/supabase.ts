import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

export function getSupabaseAdmin() {
	const url = env.SUPABASE_URL;
	const serverSecret = env.ORBITFS_DB_SECRET;
	if (!url || !serverSecret) {
		throw new Error('SUPABASE_URL and ORBITFS_DB_SECRET are required');
	}
	return createClient(url, serverSecret, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}
