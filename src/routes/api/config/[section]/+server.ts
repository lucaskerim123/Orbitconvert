import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';
import { getSupabaseAdmin } from '$lib/server/supabase';

const defs = (origin:string) => ({
	runtime: { config: { deployMode:'vercel', databaseProvider:'supabase', storageProvider:'supabase', apiBase:'/api', publicOrigin:origin } },
	paths: { fields: [
		{ key:'storageRoot',label:'Workspace storage',restartRequired:false,value:'supabase://orbitfs-files',exists:true },
		{ key:'mainWorkspaceRoot',label:'Public Workspace storage',restartRequired:false,value:'supabase://orbitfs-files/Public Workspace',exists:true },
		{ key:'systemRoot',label:'System data',restartRequired:false,value:'supabase://postgres/orbitfs_*',exists:true }
	] },
	'ports-urls': { fields: [
		{ key:'publicOrigin',label:'Public panel URL',type:'url',value:origin },
		{ key:'apiBase',label:'API base',type:'url',value:'/api' },
		{ key:'licenseApiUrl',label:'License API URL',type:'url',value:'https://license.incendiarynetworks.cc' }
	] },
	'service-names': { fields: [
		{ key:'panelRuntime',label:'Panel runtime',value:'Vercel' },
		{ key:'databaseRuntime',label:'Database runtime',value:'Supabase Postgres' },
		{ key:'storageRuntime',label:'Storage runtime',value:'Supabase Storage' }
	] }
});export async function GET({ params, cookies, url }:any) {
	try {
		await assertPanelLicensed(); await requireAdmin(cookies);
		const section=String(params.section||'runtime');
		const base=(defs(url.origin) as any)[section];
		if (!base) return json({ error:'Unknown config section' },{status:404});
		const supabase=getSupabaseAdmin();
		const stored=await supabase.from('orbitfs_settings').select('value').eq('scope_type','global').eq('scope_id','').eq('key',`config.${section}`).maybeSingle();
		if (stored.error) throw stored.error;
		if (!stored.data?.value) return json(base);
		if (section==='runtime') return json({ config:{ ...base.config,...stored.data.value } });
		const values=(stored.data.value as any)?.values||{};
		return json({ fields:base.fields.map((f:any)=>({ ...f,value:values[f.key]??f.value })) });
	} catch (error:any) { return json({error:String(error?.message||'Config load failed')},{status:Number(error?.status||500)}); }
}

export async function PATCH({ params, request, cookies }:any) {
	try {
		const admin=await requireAdmin(cookies); await assertPanelLicensed();
		const section=String(params.section||'runtime'); const body=await request.json().catch(()=>({}));
		const value=section==='runtime' ? (body.config||body) : { values:body.values||{} };
		const supabase=getSupabaseAdmin();
		const saved=await supabase.from('orbitfs_settings').upsert({scope_type:'global',scope_id:'',key:`config.${section}`,value},{onConflict:'scope_type,scope_id,key'});
		if (saved.error) throw saved.error;
		return json({ ok:true,updatedBy:admin.username });
	} catch (error:any) { return json({error:String(error?.message||'Config save failed')},{status:Number(error?.status||500)}); }
}