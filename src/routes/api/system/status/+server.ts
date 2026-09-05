import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { assertPanelLicensed, getPanelLicenseSummary } from '$lib/server/license';
import { getSupabaseAdmin } from '$lib/server/supabase';

export async function GET({ cookies, url }) {
	try {
		await requireAdmin(cookies);
		await assertPanelLicensed();

		const supabase = getSupabaseAdmin();
		const health = await supabase.from('orbitfs_workspaces').select('id', { count:'exact', head:true });
		if (health.error) throw health.error;

		const licence = await getPanelLicenseSummary();
		const checkedAt = new Date().toISOString();

		const panel = {
			label:'OrbitFS Panel',
			role:'Vercel application',
			status:'Online',
			state:'running',
			running:true,
			reachable:true,
			operational:true,
			residentProcess:false,
			service:'Vercel',
			url:url.origin,
			apiBase:'/api',
			controls:[],
			health:{ ok:true, status:200, message:'Vercel runtime reachable', checkedAt }
		};

		const studio = {
			label:'Studio',
			role:'Supabase-backed document engine',
			status:'Standby',
			state:'standby',
			running:false,
			reachable:true,
			operational:true,
			residentProcess:false,
			service:'Vercel + Supabase',
			controls:[],
			detail:'Ready for request-driven Studio operations; no resident worker is running.'
		};

		const apex = {
			label:'APEX',
			role:'Library routing and approval engine',
			status:'Standby',
			state:'standby',
			running:false,
			reachable:true,
			operational:true,
			residentProcess:false,
			service:'Vercel + Supabase',
			controls:[],
			detail:'Ready for Library scan, routing and approval operations; work runs only while handling a request.'
		};

		const mcp = {
			label:'MCP Server',
			role:'Cloud MCP add-on',
			status:'Standby',
			state:'standby',
			running:false,
			reachable:true,
			operational:true,
			residentProcess:false,
			service:'Vercel',
			controls:[],
			licensed:true,
			blocked:false,
			future:false,
			standby:true,
			installed:true,
			attached:true,
			configured:true,
			online:false,
			available:true,
			database:'Supabase',
			detail:'Cloud MCP is request-driven. Standby means configured and ready, not a fake resident daemon.'
		};

		const converter = {
			label:'Native Converter',
			role:'Native conversion worker',
			status:'Stopped',
			state:'stopped',
			running:false,
			reachable:false,
			operational:false,
			residentProcess:false,
			service:null,
			controls:[],
			available:false,
			detail:'No native FFmpeg/ImageMagick/LibreOffice/Pandoc worker is attached to this Vercel deployment.'
		};

		const edge = {
			label:'Vercel Edge',
			role:'Public HTTPS edge',
			status:'Online',
			state:'running',
			running:true,
			reachable:true,
			operational:true,
			residentProcess:false,
			service:'Vercel Edge Network',
			url:url.origin,
			controls:[],
			health:{ ok:true, status:200, message:'Managed by Vercel', checkedAt }
		};

		const licenceStatus = {
			label:'Licence Authority',
			role:'OrbitFS licensing',
			status:licence.licensed ? 'Online' : 'Blocked',
			state:licence.licensed ? 'running' : 'stopped',
			running:Boolean(licence.licensed),
			reachable:true,
			operational:Boolean(licence.licensed),
			residentProcess:false,
			service:'license.incendiarynetworks.cc',
			licensed:licence.licensed,
			blocked:!licence.licensed,
			controls:[]
		};

		return json({
			checkedAt,
			mode:'serverless',
			filesystem:false,
			stateModel:['running','standby','stopped'],
			panel,
			studio,
			apex,
			mcp,
			hive:mcp,
			converter,
			tunnel:edge,
			edge,
			licence:licenceStatus,
			disk:{ usedGB:null, freeGB:null, totalGB:null },
			note:'standby means configured and ready for request-driven work. running is only reported for a real active runtime or worker; stopped means the capability is not attached or cannot operate.'
		});
	} catch (error:any) {
		return json({ error:String(error?.message || 'Failed to load system status') }, { status:Number(error?.status || 500) });
	}
}
