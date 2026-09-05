import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';

const STATES = {
	panel: { state:'running', operational:true, residentProcess:false },
	runtime: { state:'running', operational:true, residentProcess:false },
	studio: { state:'standby', operational:true, residentProcess:false },
	apex: { state:'standby', operational:true, residentProcess:false },
	mcp: { state:'standby', operational:true, residentProcess:false },
	hive: { state:'standby', operational:true, residentProcess:false },
	converter: { state:'stopped', operational:false, residentProcess:false }
} as const;

export async function POST({ request, cookies }) {
	try {
		await requireAdmin(cookies);
		await assertPanelLicensed();

		const body = await request.json().catch(() => ({}));
		const target = String(body.target ?? 'runtime').toLowerCase();
		const action = String(body.action ?? body.command ?? '').toLowerCase();
		const current = STATES[target as keyof typeof STATES];

		if (!current) {
			return json({ error:'Unknown engine target', target }, { status:400 });
		}

		if (!action || action === 'status') {
			return json({
				target,
				...current,
				mode:'serverless',
				managedBy:'Vercel',
				message:'State is reported from actual cloud capability, not a simulated local service.'
			});
		}

		return json({
			error:`${target} cannot be ${action}ed as a resident service in Vercel serverless mode.`,
			target,
			requestedAction:action,
			current,
			mode:'serverless',
			note: current.state === 'standby'
				? 'This capability is already ready for request-driven work and has no daemon to start or stop.'
				: current.state === 'stopped'
					? 'This capability requires a real attached worker before it can run.'
					: 'The application runtime is managed by Vercel and is not controlled as a local Windows service.'
		}, { status:409 });
	} catch (error:any) {
		return json({ error:String(error?.message || 'Control action failed') }, { status:Number(error?.status || 500) });
	}
}
