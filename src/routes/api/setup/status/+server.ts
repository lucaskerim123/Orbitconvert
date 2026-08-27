import { json } from '@sveltejs/kit';
import { getSupabaseAdmin } from '$lib/server/supabase';

export async function GET() {
	const supabase = getSupabaseAdmin();
	const { count, error } = await supabase.from('orbitfs_users').select('*', { count: 'exact', head: true });
	if (error) return json({ error: error.message }, { status: 500 });
	const needsSetup = (count ?? 0) === 0;
	return json({
		needsSetup,
		setupComplete: !needsSetup,
		currentStep: needsSetup ? 'owner' : 'complete'
	});
}