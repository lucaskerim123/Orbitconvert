import { json, error } from '@sveltejs/kit';
import { requireAdmin, requireUser } from '$lib/server/auth';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { assertMcpLicensed, auditMcp, getMcpAddonRow } from '$lib/server/mcp-cloud';

const now = () => new Date().toISOString();
const ok = (body: unknown) => json(body);

async function setting(scopeType: string, scopeId: string | null, key: string) {
	const db = getSupabaseAdmin();
	let q = db.from('orbitfs_settings').select('value').eq('scope_type', scopeType).eq('key', key);
	q = scopeId === null ? q.is('scope_id', null) : q.eq('scope_id', scopeId);
	const { data, error: dbError } = await q.maybeSingle();
	if (dbError) throw dbError;
	return data?.value ?? null;
}

async function saveSetting(scopeType: string, scopeId: string | null, key: string, value: unknown) {
	const db = getSupabaseAdmin();
	let q = db.from('orbitfs_settings').select('id').eq('scope_type', scopeType).eq('key', key);
	q = scopeId === null ? q.is('scope_id', null) : q.eq('scope_id', scopeId);
	const { data } = await q.maybeSingle();
	if (data?.id) await db.from('orbitfs_settings').update({ value, updated_at: now() }).eq('id', data.id);
	else await db.from('orbitfs_settings').insert({ scope_type: scopeType, scope_id: scopeId, key, value });
}
async function runtimePayload() {
	const db = getSupabaseAdmin();
	const addon = await getMcpAddonRow();
	const { data: runtime } = await db.from('mcp_runtime_state').select('*').eq('id', 1).maybeSingle();
	let licensed = false;
	try { await assertMcpLicensed(); licensed = true; } catch {}
	return {
		online: addon?.attached === true && addon?.status !== 'uninstalled',
		mode: runtime?.mode || 'workspace',
		workspaceIntegration: runtime?.workspace_addon_active !== false,
		connectorPath: '/mcp',
		licensed,
		attached: addon?.attached === true,
		publicBaseUrl: addon?.deployment_url || null,
		compute: 'vercel',
		database: 'supabase'
	};
}

async function registryPayload() {
	const db = getSupabaseAdmin();
	const [clientResult, sessionResult] = await Promise.all([
		db.from('mcp_clients').select('*').order('last_seen_at', { ascending: false }),
		db.from('mcp_sessions').select('*').order('last_seen_at', { ascending: false }).limit(250)
	]);
	const clients = clientResult.data ?? [];
	const sessions = sessionResult.data ?? [];
	const mappedClients = clients.map((c: any) => ({ clientId: c.id, clientName: c.client_name, status: c.status, createdAt: c.first_seen_at, lastSeenAt: c.last_seen_at, activeTokens: sessions.filter((s: any) => s.client_id === c.id && s.status === 'active').length, users: [...new Set(sessions.filter((s: any) => s.client_id === c.id).map((s: any) => s.username).filter(Boolean))], workspaceIds: c.workspace_ids || [], permissions: c.permissions || { read: true, write: true }, redirectUris: c.redirect_uris || [] }));
	const mappedSessions = sessions.map((s: any) => ({ id: s.id, username: s.username || 'Unknown user', workspaceId: s.workspace_id, provider: s.provider || 'mcp', status: s.status, connectedAt: s.connected_at, lastSeenAt: s.last_seen_at, idle: s.status !== 'active', requestCount: s.request_count || 0 }));
	return { clients: mappedClients, connected: mappedSessions.filter((s: any) => s.status === 'active'), recent: mappedSessions.slice(0, 50), sessions: mappedSessions };
}
export async function GET({ cookies, params, url }) {
	const user = await requireUser(cookies);
	await assertMcpLicensed();
	const parts = String(params.rest || '').split('/').filter(Boolean);
	const db = getSupabaseAdmin();
	if (parts[0] === 'runtime') return ok(await runtimePayload());
	if (parts[0] === 'logs') {
		if (!['owner','admin'].includes(user.role)) throw error(403, 'Administrator access required');
		const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 250)));
		const { data, error: dbError } = await db.from('mcp_audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
		if (dbError) throw dbError;
		return ok({ logs: data || [] });
	}
	if (parts[0] === 'registry') {
		await requireAdmin(cookies);
		return ok(await registryPayload());
	}
	if (parts[0] === 'admin-policy') {
		await requireAdmin(cookies);
		const policy = await setting('global', null, 'mcp.admin_policy');
		return ok({ policy: policy || { oss: { enabled: true, allowedStrengths: ['low','medium','high','custom1','custom2'], maxBundlesPerPreset: 20 }, ccs: { enabled: true, maxBundlesPerWorkspace: 100, maxEntriesPerBundle: 500, maxDependenciesPerBundle: 50, maxDependencyDepth: 8, allowProfiles: true } } });
	}
	if (parts[0] === 'workspaces' && parts[1] && parts[2] === 'setup') {
		return ok({ config: (await setting('workspace', parts[1], 'mcp.workspace_config')) || { settings: { defaultPaths: [], folderTemplate: [], active: true } } });
	}
	throw error(404, 'MCP route not found');
}
export async function PUT({ cookies, params, request }) {
	const user = await requireUser(cookies);
	await assertMcpLicensed();
	const parts = String(params.rest || '').split('/').filter(Boolean);
	const body = await request.json().catch(() => ({}));
	if (parts[0] === 'admin-policy') {
		await requireAdmin(cookies);
		const policy = body.policy || body;
		await saveSetting('global', null, 'mcp.admin_policy', policy);
		await auditMcp('admin_policy.updated', { policy }, user.id);
		return ok({ policy, applied: true });
	}
	if (parts[0] === 'workspaces' && parts[1] && parts[2] === 'setup') {
		await saveSetting('workspace', parts[1], 'mcp.workspace_config', body || {});
		await auditMcp('workspace_config.updated', { workspaceId: parts[1] }, user.id, parts[1]);
		return ok({ config: body || {} });
	}
	throw error(404, 'MCP route not found');
}

export async function PATCH({ cookies, params, request }) {
	const user = await requireAdmin(cookies);
	await assertMcpLicensed();
	const parts = String(params.rest || '').split('/').filter(Boolean);
	if (parts[0] !== 'registry' || parts[1] !== 'clients' || !parts[2]) throw error(404, 'MCP route not found');
	const body = await request.json().catch(() => ({}));
	const patch: Record<string, unknown> = {};
	if (body.status) patch.status = body.status;
	if (body.permissions) patch.permissions = body.permissions;
	if (body.workspaceIds) patch.workspace_ids = body.workspaceIds;
	const db = getSupabaseAdmin();
	const { error: dbError } = await db.from('mcp_clients').update({ ...patch, last_seen_at: now() }).eq('id', decodeURIComponent(parts[2]));
	if (dbError) throw dbError;
	await auditMcp('client.updated', { clientId: parts[2], ...patch }, user.id);
	return ok({ updated: true });
}
export async function POST({ cookies, params }) {
	const user = await requireAdmin(cookies);
	await assertMcpLicensed();
	const parts = String(params.rest || '').split('/').filter(Boolean);
	const db = getSupabaseAdmin();
	if (parts[0] === 'registry' && parts[1] === 'clients' && parts[2] && parts[3] === 'disconnect') {
		const clientId = decodeURIComponent(parts[2]);
		await db.from('mcp_sessions').update({ status: 'revoked', last_seen_at: now() }).eq('client_id', clientId).eq('status', 'active');
		await auditMcp('client.disconnected', { clientId }, user.id);
		return ok({ disconnected: true });
	}
	if (parts[0] === 'registry' && parts[1] === 'sessions' && parts[2] && parts[3] === 'disconnect') {
		const sessionId = decodeURIComponent(parts[2]);
		await db.from('mcp_sessions').update({ status: 'revoked', last_seen_at: now() }).eq('id', sessionId);
		await auditMcp('session.disconnected', { sessionId }, user.id);
		return ok({ disconnected: true });
	}
	throw error(404, 'MCP route not found');
}
