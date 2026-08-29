import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { assertPanelLicensed, getPanelLicenseSummary } from '$lib/server/license';
import { getSupabaseAdmin } from '$lib/server/supabase';

export async function GET({ cookies, url }) {
	try {
		await requireAdmin(cookies);
		await assertPanelLicensed();
		const supabase = getSupabaseAdmin();
		const health = await supabase.from('orbitfs_workspaces').select('id',{count:'exact',head:true});
		if (health.error) throw health.error;
		const licence = await getPanelLicenseSummary();
		const checkedAt = new Date().toISOString();
		const panel = { label:'OrbitFS Panel',role:'Vercel application',status:'Online',running:true,reachable:true,
			service:'Vercel',url:url.origin,apiBase:'/api',controls:[],health:{ok:true,status:200,message:'Vercel runtime reachable',checkedAt} };
		const mcp = { label:'MCP Server',role:'Future cloud add-on',status:'Standby',running:false,reachable:false,
			service:null,controls:[],licensed:false,blocked:false,future:true,standby:true,installed:false,attached:false,
			configured:false,online:false,available:false,enabledWorkspaces:0,knownClients:0,database:'Supabase (planned)' };
		const tunnel = { label:'Vercel Edge',role:'Public HTTPS edge',status:'Online',running:true,reachable:true,
			service:'Vercel Edge Network',url:url.origin,controls:[],health:{ok:true,status:200,message:'Managed by Vercel',checkedAt} };
		const licenceStatus = { label:'Licence Authority',role:'OrbitFS licensing',status:licence.licensed ? 'Online':'Blocked',
			running:true,reachable:true,service:'license.incendiarynetworks.cc',licensed:licence.licensed,blocked:!licence.licensed,controls:[] };
		return json({ checkedAt,panel,mcp,hive:mcp,tunnel,licence:licenceStatus,disk:{usedGB:null,freeGB:null,totalGB:null} });
	} catch (error:any) { return json({ error:String(error?.message || 'Failed to load system status') }, { status:Number(error?.status || 500) }); }
}
