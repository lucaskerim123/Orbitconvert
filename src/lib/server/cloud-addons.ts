import { getSupabaseAdmin } from '$lib/server/supabase';
import { getPanelLicenseSummary } from '$lib/server/license';

export const CLOUD_ADDON_MANIFESTS: Record<string, any> = {
	mcp: {
		id: 'mcp', name: 'OrbitFS MCP', version: '0.1.0',
		description: 'Startup, context, ChatGPT UI and MCP tools for OrbitFS.',
		licenseComponent: 'orbitfs_mcp', kind: 'cloud-addon',
		transportPath: '/mcp', sourceRef: 'mcp-addon',
		capabilities: ['mcp','startup','context','chatgpt-ui']
	}
};

export async function addonLicensed(component?: string | null) {
	if (!component) return true;
	const summary = await getPanelLicenseSummary();
	const item = summary.components?.[component] || {};
	return item.allowed === true && item.lockedToThisInstallation === true && ['enabled','locked'].includes(String(item.state));
}

export async function listCloudAddons() {
	const supabase = getSupabaseAdmin();
	const result = await supabase.from('orbitfs_addons').select('*').order('name');
	if (result.error) throw result.error;
	return Promise.all((result.data ?? []).map(presentAddon));
}
export async function getCloudAddon(id: string) {
	const supabase = getSupabaseAdmin();
	const result = await supabase.from('orbitfs_addons').select('*').eq('id',id).maybeSingle();
	if (result.error) throw result.error;
	if (!result.data) throw Object.assign(new Error('Add-on not found'), { status:404 });
	return result.data;
}

export async function presentAddon(row: any) {
	const licensed = await addonLicensed(row.license_component);
	const installed = row.installed === true;
	const attached = installed && row.attached === true && licensed;
	return {
		id:row.id,name:row.name,description:row.description,version:row.version,
		installed,attached,parked:installed && !attached,licensed,available:row.available !== false,
		configured:row.configured === true,setupComplete:row.configured === true,
		needsSetup:installed && row.configured !== true,status:!licensed && installed ? 'unlicensed' : attached ? 'attached' : installed ? 'detached' : 'registered',
		licenseState:licensed ? 'enabled':'blocked',installStatus:installed ? 'installed':'registered',
		installMethod:'cloud',supports:['install','configure','test','attach','detach','uninstall'],
		deploymentUrl:row.deployment_url,transportPath:row.transport_path,sourceRef:row.source_ref,
		manifest:row.manifest || {},runtime:row.runtime || {},config:row.config || {},
		wiring:{ package:false,panel:true,backend:installed,frontend:installed,engine:installed,service:false }
	};
}

export async function saveCloudAddon(id: string, patch: Record<string, any>) {
	const supabase = getSupabaseAdmin();
	const result = await supabase.from('orbitfs_addons').update({ ...patch,updated_at:new Date().toISOString() }).eq('id',id).select('*').single();
	if (result.error) throw result.error;
	return presentAddon(result.data);
}
