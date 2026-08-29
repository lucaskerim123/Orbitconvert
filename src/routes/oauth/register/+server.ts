import { json } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { normalizeScope } from '$lib/server/mcp-oauth';

function validRedirect(value: string) {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname));
	} catch { return false; }
}

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	const redirects = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
	if (!redirects.length || redirects.some((uri) => !validRedirect(uri))) return json({ error:'invalid_redirect_uri' }, { status:400 });
	if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none') return json({ error:'invalid_client_metadata', error_description:'OrbitFS MCP uses public OAuth clients with PKCE.' }, { status:400 });
	const clientId = `orbitfs_${randomBytes(18).toString('base64url')}`;
	const record = { client_id:clientId, client_name:String(body.client_name || 'ChatGPT MCP Client').slice(0,120), redirect_uris:redirects,
		token_endpoint_auth_method:'none', grant_types:['authorization_code','refresh_token'], response_types:['code'] };
	const { error } = await getSupabaseAdmin().from('mcp_oauth_clients').insert(record);
	if (error) throw error;
	return json({ ...record, scope:normalizeScope(String(body.scope || 'orbitfs:read orbitfs:write')) }, { status:201, headers:{'cache-control':'no-store'} });
}
