import { redirect } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/auth';
import { issueAuthorizationCode, validateAuthorizationRequest } from '$lib/server/mcp-oauth';

const esc = (value:string) => value.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));

function paramsFrom(url: URL) {
	return {
		clientId:String(url.searchParams.get('client_id')||''), redirectUri:String(url.searchParams.get('redirect_uri')||''),
		responseType:String(url.searchParams.get('response_type')||''), codeChallenge:String(url.searchParams.get('code_challenge')||''),
		codeChallengeMethod:String(url.searchParams.get('code_challenge_method')||''), resource:String(url.searchParams.get('resource')||''),
		scope:String(url.searchParams.get('scope')||''), state:String(url.searchParams.get('state')||'')
	};
}

function appendRedirect(uri:string, values:Record<string,string>) {
	const out = new URL(uri);
	for (const [key,value] of Object.entries(values)) if (value) out.searchParams.set(key,value);
	return out.toString();
}

export async function GET({ url, cookies }) {
	const input=paramsFrom(url);
	let validated;
	try { validated=await validateAuthorizationRequest(input); }
	catch (e) { return new Response(e instanceof Error ? e.message : 'Invalid authorization request',{status:400}); }
	const user=await getSessionUser(cookies);
	if (!user) throw redirect(303,`/login?next=${encodeURIComponent(url.pathname+url.search)}`);
	const hidden = Object.entries({ client_id:input.clientId,redirect_uri:input.redirectUri,response_type:input.responseType,
		code_challenge:input.codeChallenge,code_challenge_method:input.codeChallengeMethod,resource:input.resource,
		scope:validated.scope,state:input.state }).map(([k,v])=>`<input type="hidden" name="${esc(k)}" value="${esc(String(v))}">`).join('');
	const scopes=validated.scope.split(' ').map((scope)=>`<li>${esc(scope==='orbitfs:write'?'Read and update your permitted OrbitFS content':'Read your permitted OrbitFS content')}</li>`).join('');
	const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
	<title>Authorize OrbitFS MCP</title><style>body{font-family:system-ui;background:#0b0d10;color:#f5f7fa;margin:0;display:grid;place-items:center;min-height:100vh}.card{width:min(520px,calc(100% - 32px));background:#15181d;border:1px solid #2b3038;border-radius:16px;padding:24px;box-sizing:border-box}p,li{color:#bac1cb;line-height:1.5}.actions{display:flex;gap:10px;margin-top:22px}button{border:0;border-radius:10px;padding:11px 16px;font-weight:650;cursor:pointer}.approve{background:#fff;color:#111}.deny{background:#2a2f36;color:#fff}.user{padding:10px 12px;background:#0e1115;border-radius:10px}</style></head><body><main class="card">
	<h1>Connect ChatGPT to OrbitFS</h1><p>ChatGPT is requesting access to OrbitFS MCP as <strong>${esc(user.display_name||user.username)}</strong>.</p>
	<div class="user">${esc(user.username)}${user.email?` · ${esc(user.email)}`:''}</div><h3>Requested access</h3><ul>${scopes}</ul>
	<p>You can disconnect the ChatGPT client later from MCP Admin → Client Registry.</p><form method="post">${hidden}<div class="actions"><button class="approve" name="decision" value="approve">Allow</button><button class="deny" name="decision" value="deny">Cancel</button></div></form></main></body></html>`;
	return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}
export async function POST({ request, cookies }) {
	const user=await getSessionUser(cookies);
	if (!user) return new Response('Authentication required',{status:401});
	const form=await request.formData();
	const input={clientId:String(form.get('client_id')||''),redirectUri:String(form.get('redirect_uri')||''),
		responseType:String(form.get('response_type')||''),codeChallenge:String(form.get('code_challenge')||''),
		codeChallengeMethod:String(form.get('code_challenge_method')||''),resource:String(form.get('resource')||''),
		scope:String(form.get('scope')||''),state:String(form.get('state')||'')};
	let validated;
	try { validated=await validateAuthorizationRequest(input); }
	catch (e) { return new Response(e instanceof Error ? e.message : 'Invalid authorization request',{status:400}); }
	if (String(form.get('decision')||'') !== 'approve') {
		throw redirect(303,appendRedirect(input.redirectUri,{error:'access_denied',state:input.state}));
	}
	const code=await issueAuthorizationCode({clientId:input.clientId,userId:user.id,redirectUri:input.redirectUri,
		scope:validated.scope,resource:input.resource,codeChallenge:input.codeChallenge});
	throw redirect(303,appendRedirect(input.redirectUri,{code,state:input.state}));
}
