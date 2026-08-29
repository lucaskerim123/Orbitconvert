import { getSupabaseAdmin } from '$lib/server/supabase';
import { activateLicenseComponent, getPanelLicenseSummary } from '$lib/server/license';

export const MCP_COMPONENT = 'orbitfs_mcp';

export async function assertMcpLicensed() {
	let summary = await getPanelLicenseSummary({ refresh: true });
	let component = summary.components?.[MCP_COMPONENT] ?? null;
	let allowed = Boolean(component?.allowed && component?.lockedToThisInstallation && ['enabled', 'locked'].includes(String(component?.state || '')));
	if (!allowed) {
		const activated = await activateLicenseComponent(MCP_COMPONENT);
		summary = activated.summary;
		component = activated.component;
		allowed = Boolean(component?.allowed && component?.lockedToThisInstallation && ['enabled', 'locked'].includes(String(component?.state || '')));
	}
	if (!allowed) throw Object.assign(new Error('OrbitFS MCP licence is required'), { status: 403, code: 'MCP_LICENSE_REQUIRED' });
	return { summary, component };
}

export async function getMcpRuntimeState() {
	const db = getSupabaseAdmin();
	const { data, error } = await db.from('mcp_runtime_state').select('*').eq('id', 1).maybeSingle();
	if (error) throw error;
	return data ?? { id: 1, service_status: 'online', workspace_addon_active: true, connector_url: '/mcp', mode: 'workspace' };
}
export async function assertMcpRunning() {
	const runtime = await getMcpRuntimeState();
	if (runtime.service_status !== 'online') {
		throw Object.assign(new Error('OrbitFS MCP runtime is stopped'), { status: 503, code: 'MCP_RUNTIME_STOPPED' });
	}
	return runtime;
}

export async function getMcpAddonRow() {
	const db = getSupabaseAdmin();
	const { data, error } = await db.from('orbitfs_addons').select('*').eq('id', 'mcp').maybeSingle();
	if (error) throw error;
	return data;
}

export async function auditMcp(eventType: string, details: Record<string, unknown> = {}, actorUserId: string | null = null, scopeId = 'public') {
	const db = getSupabaseAdmin();
	await db.from('mcp_audit_log').insert({ scope_id: scopeId, actor_user_id: actorUserId, event_type: eventType, details });
}
