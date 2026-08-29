import { createHash } from 'node:crypto';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { getSupabaseAdmin } from '$lib/server/supabase';

export const MCP_RESOURCE = 'https://orbitfsmcp.vercel.app/mcp';
export const OAUTH_ISSUER = 'https://orbitfsproject.vercel.app';
export const PROTECTED_RESOURCE_METADATA = 'https://orbitfsmcp.vercel.app/.well-known/oauth-protected-resource';
const sha256 = (value:string) => createHash('sha256').update(value).digest('hex');

export function oauthUnauthorized(description='OAuth bearer token required') {
	return new Response(JSON.stringify({ error:'unauthorized', error_description:description }), {
		status:401,
		headers:{
			'content-type':'application/json',
			'cache-control':'no-store',
			'www-authenticate':`Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA}", scope="orbitfs:read"`
		}
	});
}

export async function verifyMcpBearer(request:Request): Promise<AuthInfo> {
	const match=/^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
	if (!match) throw Object.assign(new Error('Missing bearer token'),{status:401});
	const raw=match[1].trim(), db=getSupabaseAdmin();
	const { data:token,error }=await db.from('mcp_oauth_tokens').select('*').eq('access_token_hash',sha256(raw)).maybeSingle();
	if (error) throw error;
	if (!token || token.revoked_at || token.resource!==MCP_RESOURCE || new Date(token.expires_at).getTime()<=Date.now()) {
		throw Object.assign(new Error('Invalid or expired bearer token'),{status:401});
	}
	const { data:user,error:userError }=await db.from('orbitfs_users')
		.select('id,username,display_name,email,role,status,permissions').eq('id',token.user_id).maybeSingle();
	if (userError) throw userError;
	if (!user || user.status!=='active') throw Object.assign(new Error('OrbitFS user is unavailable'),{status:401});
	void db.from('mcp_oauth_tokens').update({last_used_at:new Date().toISOString()}).eq('access_token_hash',token.access_token_hash);
	return {
		token:raw,
		clientId:token.client_id,
		scopes:String(token.scope||'').split(/\s+/).filter(Boolean),
		expiresAt:Math.floor(new Date(token.expires_at).getTime()/1000),
		resource:new URL(MCP_RESOURCE),
		extra:{ userId:user.id, username:user.username, displayName:user.display_name, role:user.role, permissions:user.permissions||{} }
	};
}
