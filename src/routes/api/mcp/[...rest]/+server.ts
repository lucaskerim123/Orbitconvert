import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireAdmin, requireUser } from '$lib/server/auth';
import { assertMcpLicensed, auditMcp, getMcpAddonRow } from '$lib/server/mcp-cloud';
import { getSupabaseAdmin } from '$lib/server/supabase';

const now = () => new Date().toISOString();

async function runtimePayload() {
	const db = getSupabaseAdmin();
	const addon = await getMcpAddonRow();
	const { data: runtime, error: runtimeError } = await db.from('mcp_runtime_state').select('*').eq('id', 1).maybeSingle();
	if (runtimeError) throw runtimeError;
	let licensed = false;
	try { await assertMcpLicensed(); licensed = true; } catch {}
	const serviceStatus = String(runtime?.service_status || 'online');
	return {
		online: addon?.installed === true && addon?.attached === true && addon?.status !== 'uninstalled' && serviceStatus === 'online',
		serviceStatus,
		lastChangedAt: runtime?.updated_at || null,
		mode: runtime?.mode || 'workspace',
		workspaceIntegration: runtime?.workspace_addon_active !== false,
		connectorPath: '/mcp',
		licensed,
		attached: addon?.attached === true,
		installed: addon?.installed === true,
		publicBaseUrl: addon?.deployment_url || 'https://orbitfsmcp.vercel.app',
		compute: 'vercel',
		database: 'supabase'
	};
}

async function localRuntimeControl(action: string, actorUserId: string) {
	if (!['start', 'stop', 'restart'].includes(action)) throw error(400, 'Invalid MCP control action');
	const db = getSupabaseAdmin();
	if (action === 'restart') {
		const restarting = await db.from('mcp_runtime_state').update({ service_status: 'restarting', updated_at: now() }).eq('id', 1);
		if (restarting.error) throw restarting.error;
		await auditMcp('runtime.restarting', {}, actorUserId);
	}
	const serviceStatus = action === 'stop' ? 'stopped' : 'online';
	const result = await db.from('mcp_runtime_state').update({ service_status: serviceStatus, updated_at: now() }).eq('id', 1).select('*').single();
	if (result.error) throw result.error;
	await auditMcp(`runtime.${action}`, { service_status: serviceStatus }, actorUserId);
	return json({ ok: true, action, serviceStatus, runtime: result.data, status: await runtimePayload() });
}

async function proxy({ request, params, cookies, url }: Parameters<RequestHandler>[0]) {
	await requireUser(cookies);
	await assertMcpLicensed();
	const addon = await getMcpAddonRow();
	if (!addon?.installed || !addon?.attached || !addon?.deployment_url) throw error(404, 'MCP add-on is detached');

	const base = String(addon.deployment_url).replace(/\/$/, '');
	const rest = String(params.rest || '').replace(/^\/+/, '');
	const target = `${base}/api/mcp/${rest}${url.search}`;
	const headers = new Headers(request.headers);
	headers.delete('host');
	headers.delete('content-length');
	const session = cookies.get('orbitfs_session');
	if (session) headers.set('cookie', `orbitfs_session=${encodeURIComponent(session)}`);
	headers.set('x-orbitfs-proxy', 'orbitfs-project');

	const init: RequestInit = { method: request.method, headers, redirect: 'manual' };
	if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();
	const response = await fetch(target, init);
	const outHeaders = new Headers(response.headers);
	outHeaders.delete('set-cookie');
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outHeaders });
}

export const GET: RequestHandler = async (event) => {
	await requireUser(event.cookies);
	const rest = String(event.params.rest || '').replace(/^\/+/, '');
	if (rest === 'runtime' || rest === 'master-control') return json(await runtimePayload());
	return proxy(event);
};

export const POST: RequestHandler = async (event) => {
	const rest = String(event.params.rest || '').replace(/^\/+/, '');
	if (rest === 'master-control') {
		const user = await requireAdmin(event.cookies);
		await assertMcpLicensed();
		const body = await event.request.json().catch(() => ({}));
		return localRuntimeControl(String(body.action || '').toLowerCase(), user.id);
	}
	return proxy(event);
};

export const PUT: RequestHandler = proxy;
export const PATCH: RequestHandler = proxy;
export const DELETE: RequestHandler = proxy;
