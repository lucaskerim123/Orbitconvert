import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

export function getSupabaseAdmin() {
	const url = env.SUPABASE_URL;
	const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !serviceKey) {
		throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
	}
	return createClient(url, serviceKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}
