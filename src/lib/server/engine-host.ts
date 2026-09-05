import { env } from '$env/dynamic/private';

const DEFAULT_ENGINE_URL = 'https://orbitconvert-mcp-addon.vercel.app';

export function engineBaseUrl() {
	return String(env.ORBITFS_ENGINE_URL || DEFAULT_ENGINE_URL).replace(/\/$/, '');
}

function engineSecret() {
	const secret = String(env.ORBITFS_ENGINE_SECRET || '').trim();
	if (!secret) throw Object.assign(new Error('ORBITFS_ENGINE_SECRET is not configured'), { status: 503, code: 'ENGINE_SECRET_MISSING' });
	return secret;
}

export async function getEngineStatus(addonId: string) {
	const response = await fetch(`${engineBaseUrl()}/api/engine/${encodeURIComponent(addonId)}`, {
		headers: { 'x-orbitfs-engine-secret': engineSecret(), 'accept': 'application/json' },
		cache: 'no-store'
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw Object.assign(new Error(body.error || `Engine status returned ${response.status}`), { status: response.status, code: body.code || 'ENGINE_STATUS_FAILED' });
	return body;
}

export async function controlEngine(addonId: string, action: 'running'|'standby'|'stopped'|'restart', actor: string) {
	const response = await fetch(`${engineBaseUrl()}/api/engine/${encodeURIComponent(addonId)}`, {
		method: 'POST',
		headers: { 'x-orbitfs-engine-secret': engineSecret(), 'content-type': 'application/json' },
		body: JSON.stringify({ action, actor })
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw Object.assign(new Error(body.error || `Engine control returned ${response.status}`), { status: response.status, code: body.code || 'ENGINE_CONTROL_FAILED' });
	return body;
}
