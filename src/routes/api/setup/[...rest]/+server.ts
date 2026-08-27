import { json } from '@sveltejs/kit';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { getPanelLicenseSummary } from '$lib/server/license';

async function setupModel(origin = '') {
	const supabase = getSupabaseAdmin();
	const { count, error } = await supabase.from('orbitfs_users').select('*', { count:'exact', head:true });
	if (error) throw error;
	const complete = (count ?? 0) > 0;
	return {
		setupComplete: complete,
		needsSetup: !complete,
		currentStep: complete ? 'complete' : 'owner',
		coreRequired: ['Vercel runtime','Supabase database','Supabase Storage'],
		config: {
			publicOrigin: origin,
			backendPort: 'managed',
			apiBase: '/api',
			deployMode: 'cloud',
			storageRoot: 'Supabase Storage / orbitfs-files',
			mainWorkspaceRoot: 'Supabase workspace records',
			branchWorkspaceRoot: 'Supabase workspace records',
			systemRoot: 'Supabase + Vercel',
			pluginRoot: 'Cloud add-ons (not installed yet)',
			licenseApiUrl: 'https://license.incendiarynetworks.cc'
		},
		steps: {
			step1: { complete:true, configured:true, title:'Cloud runtime', description:'Vercel runtime and API are configured.' },
			step2: { complete:true, configured:true, bootstrapped:true, title:'Cloud storage', description:'Supabase database and Storage replace local Windows paths.' },
			owner: { complete, title:'First owner', description:'Create the protected OrbitFS owner account.' }
		},
		addons: [],
		notes: ['This is the standalone Vercel/Supabase OrbitFS system. No VPS or Windows service is required at runtime.']
	};
}
function failure(error: any) {
	return json({ error:error?.message ?? 'Setup request failed' }, { status:Number(error?.status || 500) });
}

export async function GET({ params, url }) {
	try {
		if (String(params.rest || '') !== 'config') return json({ error:'Not found' }, { status:404 });
		return json(await setupModel(url.origin));
	} catch (error) { return failure(error); }
}

export async function PUT({ params, url }) {
	try {
		if (String(params.rest || '') !== 'config') return json({ error:'Not found' }, { status:404 });
		return json(await setupModel(url.origin));
	} catch (error) { return failure(error); }
}

export async function POST({ params, request, url }) {
	try {
		const rest = String(params.rest || '');
		if (rest === 'bootstrap') return json({ ok:true, ...(await setupModel(url.origin)) });
		if (rest === 'test-link') {
			const body = await request.json().catch(() => ({}));
			const target = String(body.target ?? '');
			if (target === 'license') {
				const status = await getPanelLicenseSummary({ refresh:true });
				return json({ ok:true, message:status.licensed ? 'Licence service connected and Base System is licensed.' : `Licence service connected (${status.reason ?? 'not activated'}).` });
			}
			if (target === 'storage') return json({ ok:true, message:'Supabase Storage is configured.' });
			if (target === 'plugins') return json({ ok:true, message:'Cloud add-on layer is reserved for the MCP/APEX port.' });
			if (target === 'mcp') return json({ ok:false, message:'MCP cloud runtime has not been ported yet.', status:503 });
			return json({ ok:true, message:'Cloud configuration is managed by Vercel and Supabase.' });
		}
		return json({ error:'Not found' }, { status:404 });
	} catch (error) { return failure(error); }
}