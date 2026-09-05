import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';

const definitions = (origin: string) => ({
	runtime: {
		config: {
			deployMode: 'vercel',
			databaseProvider: 'supabase',
			storageProvider: 'supabase',
			apiBase: '/api',
			publicOrigin: origin,
			filesystem: false,
			persistentServer: false
		}
	},
	paths: {
		fields: [
			{ key: 'storageRoot', label: 'Workspace object storage', restartRequired: false, value: 'supabase://orbitfs-files', exists: true },
			{ key: 'workspaceRecords', label: 'Workspace metadata', restartRequired: false, value: 'supabase://postgres/orbitfs_workspaces + orbitfs_files', exists: true },
			{ key: 'systemData', label: 'System data', restartRequired: false, value: 'supabase://postgres/orbitfs_*', exists: true }
		]
	},
	'ports-urls': {
		fields: [
			{ key: 'publicOrigin', label: 'Public panel URL', type: 'url', value: origin },
			{ key: 'apiBase', label: 'Panel API base', type: 'url', value: '/api' },
			{ key: 'licenseApiUrl', label: 'Licence API URL', type: 'url', value: 'https://license.incendiarynetworks.cc' }
		]
	},
	'service-names': {
		fields: [
			{ key: 'panelRuntime', label: 'Application runtime', value: 'Vercel Functions / SvelteKit' },
			{ key: 'databaseRuntime', label: 'Database runtime', value: 'Supabase Postgres' },
			{ key: 'storageRuntime', label: 'Object storage', value: 'Supabase Storage · orbitfs-files' }
		]
	}
});

export async function GET({ params, cookies, url }: any) {
	try {
		await assertPanelLicensed();
		await requireAdmin(cookies);
		const section = String(params.section || 'runtime');
		const result = (definitions(url.origin) as any)[section];
		if (!result) return json({ error: 'Unknown config section' }, { status: 404 });
		return json({ ...result, readOnly: true, managedBy: section === 'runtime' || section === 'ports-urls' ? 'Vercel' : 'Supabase' });
	} catch (error: any) {
		return json({ error: String(error?.message || 'Config load failed') }, { status: Number(error?.status || 500) });
	}
}

export async function PATCH({ params, cookies }: any) {
	try {
		await requireAdmin(cookies);
		await assertPanelLicensed();
		const section = String(params.section || 'runtime');
		if (!(section in definitions(''))) return json({ error: 'Unknown config section' }, { status: 404 });
		return json({
			error: 'This infrastructure setting is managed by the Vercel/Supabase deployment and cannot be changed from the Panel.',
			code: 'CLOUD_CONFIG_READ_ONLY',
			section
		}, { status: 409 });
	} catch (error: any) {
		return json({ error: String(error?.message || 'Config update failed') }, { status: Number(error?.status || 500) });
	}
}
