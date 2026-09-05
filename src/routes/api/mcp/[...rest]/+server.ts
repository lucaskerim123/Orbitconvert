import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireAdmin, requireUser } from '$lib/server/auth';
import { assertMcpLicensed, auditMcp, getMcpAddonRow } from '$lib/server/mcp-cloud';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { getEngineStatus, controlEngine } from '$lib/server/engine-host';

const now = () => new Date().toISOString();

async function runtimePayload() {
	const addon = await getMcpAddonRow();
	let licensed = false;
	try { await assertMcpLicensed(); licensed = true; } catch {}
	let engine:any = null;
	try { engine = await getEngineStatus('mcp'); } catch (error:any) {
		engine = { mode:'unreachable', error:String(error?.message || 'Engine host unavailable') };
	}
	const ready = addon?.installed === true && addon?.attached === true && licensed;
	return {
		online: ready && engine?.mode === 'running',
		state: ready ? (engine?.mode || 'unreachable') : 'stopped',
		serviceStatus: ready ? (engine?.mode || 'unreachable') : 'stopped',
		running: ready && engine?.mode === 'running',
		standby: ready && engine?.mode === 'standby',
		stopped: !ready || engine?.mode === 'stopped',
		operational: ready && ['running','standby'].includes(String(engine?.mode || '')),
		residentProcess: false,
		mode: 'serverless-engine-host',
		workspaceIntegration: true,
		connectorPath: '/mcp',
		licensed,
		attached: addon?.attached === true,
		installed: addon?.installed === true,
		publicBaseUrl: addon?.deployment_url || 'https://orbitconvert-mcp-addon.vercel.app',
		compute: 'vercel',
		database: 'supabase',
		filesystem: false,
		generation: engine?.generation ?? null,
		lastRequestAt: engine?.lastRequestAt ?? null,
		lastControlAt: engine?.lastControlAt ?? null,
		engineError: engine?.error ?? null,
		detail: 'Engine state is controlled from the main OrbitFS site and enforced by the private add-on engine host.'
	};
}

async function dcrPayload() {
	const db = getSupabaseAdmin();
	const [clients, activeTokens] = await Promise.all([
		db.from('mcp_oauth_clients').select('client_id,created_at,application_type,client_name,redirect_uris,scope').order('created_at', { ascending: false }),
		db.from('mcp_oauth_tokens').select('client_id').is('revoked_at', null).gt('expires_at', now())
	]);
	if (clients.error) throw clients.error;
	if (activeTokens.error) throw activeTokens.error;
	const tokenCounts = new Map<string, number>();
	for (const row of activeTokens.data || []) tokenCounts.set(row.client_id, (tokenCounts.get(row.client_id) || 0) + 1);
	return {
		enabled: true, standard: 'RFC 7591', registrationEndpoint: 'https://orbitconvert.vercel.app/oauth/register',
		authorizationServerMetadata: 'https://orbitconvert.vercel.app/.well-known/oauth-authorization-server',
		protectedResourceMetadata: 'https://orbitconvert-mcp-addon.vercel.app/.well-known/oauth-protected-resource',
		pkce: 'S256', tokenEndpointAuthMethod: 'none', supportedApplicationTypes: ['web', 'native'],
		registeredClients: (clients.data || []).length,
		clients: (clients.data || []).map((row: any) => ({ ...row, activeTokens: tokenCounts.get(row.client_id) || 0 }))
	};
}

async function localRuntimeControl(action: string, actorUserId: string) {
	const map:Record<string,'running'|'standby'|'stopped'|'restart'> = {
		start:'running', run:'running', running:'running',
		standby:'standby',
		stop:'stopped', stopped:'stopped',
		restart:'restart'
	};
	const engineAction = map[action];
	if (!engineAction) throw error(400, 'Invalid MCP control action');
	const result = await controlEngine('mcp', engineAction, actorUserId);
	await auditMcp('runtime.control', { action, engineAction, state:result?.mode }, actorUserId);
	return json({ ok:true, action, status:await runtimePayload() });
}

async function proxy({ request, params, cookies, url }: Parameters<RequestHandler>[0]) {
	await requireUser(cookies); await assertMcpLicensed();
	const addon = await getMcpAddonRow();
	if (!addon?.installed || !addon?.attached || !addon?.deployment_url) throw error(404, 'MCP add-on is detached');
	const base = String(addon.deployment_url).replace(/\/$/, '');
	const rest = String(params.rest || '').replace(/^\/+/, '');
	const target = `${base}/api/mcp/${rest}${url.search}`;
	const headers = new Headers(request.headers); headers.delete('host'); headers.delete('content-length');
	const session = cookies.get('orbitfs_session'); if (session) headers.set('cookie', `orbitfs_session=${encodeURIComponent(session)}`);
	headers.set('x-orbitfs-proxy', 'orbitfs-project');
	const init: RequestInit = { method: request.method, headers, redirect: 'manual' };
	if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();
	const response = await fetch(target, init); const outHeaders = new Headers(response.headers); outHeaders.delete('set-cookie');
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outHeaders });
}

export const GET: RequestHandler = async (event) => {
	await requireUser(event.cookies);
	const rest = String(event.params.rest || '').replace(/^\/+/, '');
	if (rest === 'runtime' || rest === 'master-control') return json(await runtimePayload());
	if (rest === 'dcr-status') { await requireAdmin(event.cookies); return json(await dcrPayload()); }
	return proxy(event);
};

export const POST: RequestHandler = async (event) => {
	const rest = String(event.params.rest || '').replace(/^\/+/, '');
	if (rest === 'master-control') {
		const user = await requireAdmin(event.cookies); await assertMcpLicensed();
		const body = await event.request.json().catch(() => ({}));
		return localRuntimeControl(String(body.action || '').toLowerCase(), user.id);
	}
	return proxy(event);
};

export const PUT: RequestHandler = proxy;
export const PATCH: RequestHandler = proxy;
export const DELETE: RequestHandler = proxy;
