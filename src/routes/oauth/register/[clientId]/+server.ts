import { json } from '@sveltejs/kit';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { sha256 } from '$lib/server/mcp-oauth';

function bearer(request: Request) {
	const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
	return match?.[1]?.trim() || '';
}

async function registeredClient(request: Request, clientId: string) {
	const token = bearer(request);
	if (!token) return { error: json({ error: 'invalid_token' }, { status: 401 }) };
	const db = getSupabaseAdmin();
	const { data, error } = await db.from('mcp_oauth_clients').select('*')
		.eq('client_id', clientId).eq('registration_access_token_hash', sha256(token)).maybeSingle();
	if (error) throw error;
	if (!data) return { error: json({ error: 'invalid_token' }, { status: 401 }) };
	return { data, db };
}

function publicRecord(row: any) {
	return {
		client_id: row.client_id, client_id_issued_at: row.client_id_issued_at,
		client_name: row.client_name, application_type: row.application_type,
		redirect_uris: row.redirect_uris || [], token_endpoint_auth_method: row.token_endpoint_auth_method,
		grant_types: row.grant_types || [], response_types: row.response_types || [], scope: row.scope,
		client_uri: row.client_uri, logo_uri: row.logo_uri, tos_uri: row.tos_uri,
		policy_uri: row.policy_uri, contacts: row.contacts || [], jwks_uri: row.jwks_uri,
		registration_client_uri: row.registration_client_uri
	};
}

export async function GET({ request, params }) {
	const result = await registeredClient(request, params.clientId);
	if (result.error) return result.error;
	return json(publicRecord(result.data), { headers: { 'cache-control': 'no-store' } });
}

export async function PUT({ request, params }) {
	const result = await registeredClient(request, params.clientId);
	if (result.error) return result.error;
	const body = await request.json().catch(() => ({}));
	if (body.client_id && body.client_id !== params.clientId) return json({ error: 'invalid_client_metadata' }, { status: 400 });
	const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
	for (const key of ['client_name','client_uri','logo_uri','tos_uri','policy_uri','jwks_uri','scope','application_type']) {
		if (body[key] !== undefined) patch[key] = body[key];
	}
	if (Array.isArray(body.redirect_uris)) patch.redirect_uris = body.redirect_uris.map(String);
	if (Array.isArray(body.contacts)) patch.contacts = body.contacts.map(String).slice(0, 20);
	const { data, error } = await result.db.from('mcp_oauth_clients').update(patch).eq('client_id', params.clientId).select('*').single();
	if (error) throw error;
	if (patch.client_name || patch.redirect_uris) {
		await result.db.from('mcp_clients').update({
			...(patch.client_name ? { client_name: patch.client_name } : {}),
			...(patch.redirect_uris ? { redirect_uris: patch.redirect_uris } : {}),
			last_seen_at: new Date().toISOString()
		}).eq('id', params.clientId);
	}
	return json(publicRecord(data), { headers: { 'cache-control': 'no-store' } });
}

export async function DELETE({ request, params }) {
	const result = await registeredClient(request, params.clientId);
	if (result.error) return result.error;
	const revokedAt = new Date().toISOString();
	await result.db.from('mcp_oauth_tokens').update({ revoked_at: revokedAt }).eq('client_id', params.clientId).is('revoked_at', null);
	await result.db.from('mcp_clients').update({ status: 'disabled', last_seen_at: revokedAt }).eq('id', params.clientId);
	const { error } = await result.db.from('mcp_oauth_clients').delete().eq('client_id', params.clientId);
	if (error) throw error;
	return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
