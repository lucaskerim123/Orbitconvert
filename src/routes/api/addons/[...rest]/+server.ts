import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';
import { isSystemAdmin } from '$lib/server/workspaces';
import { addonLicensed, getCloudAddon, presentAddon, saveCloudAddon } from '$lib/server/cloud-addons';
import { writeAudit } from '$lib/server/audit';

const clean = (v: unknown) => String(v ?? '').trim();
const fail = (e: any) => json({ error:String(e?.message || 'Request failed'),code:String(e?.code || 'ADDON_ERROR') }, { status:Number(e?.status || 500) });
async function context(cookies: any) {
	const user = await requireUser(cookies); await assertPanelLicensed();
	if (!isSystemAdmin(user)) throw Object.assign(new Error('System Owner or Admin required'), { status:403 });
	return user;
}

export async function GET({ params,cookies }: any) {
	try {
		await context(cookies); const parts=clean(params.rest).split('/').filter(Boolean); const row=await getCloudAddon(parts[0]);
		const addon=await presentAddon(row);
		if (parts.length===1 || parts[1]==='details') return json({ manifest:addon.manifest,registration:addon.manifest?.frontend || {},schema:addon.manifest?.configSchema || {properties:{}},install:{installedAt:row.installed_at,version:row.version,schemaVersion:1,installMethod:'cloud',setupComplete:row.configured},config:row.config || {},meta:addon });
		if (parts[1]==='runtime') return json({ online:addon.attached && Boolean(row.deployment_url),mode:'cloud',workspaceIntegration:true,licensed:addon.licensed,attached:addon.attached,publicBaseUrl:row.deployment_url,connectorPath:row.transport_path,health:{ online:Boolean(row.runtime?.online),running:Boolean(row.runtime?.online),service:'Vercel' } });
		if (parts[1]==='connection') return json({ mode:'cloud',resource:row.deployment_url ? `${String(row.deployment_url).replace(/\/$/,'')}${row.transport_path || '/mcp'}` : null,connectorPath:row.transport_path || '/mcp',issuer:row.deployment_url || null });
		throw Object.assign(new Error('Not found'),{status:404});
	} catch(e){ return fail(e); }
}
export async function PATCH({ params,request,cookies }: any) {
	try {
		const user=await context(cookies); const parts=clean(params.rest).split('/').filter(Boolean); const row=await getCloudAddon(parts[0]);
		if (parts[1]!=='config') throw Object.assign(new Error('Not found'),{status:404});
		const body=await request.json().catch(()=>({})); const config={ ...(row.config || {}),...body };
		const deploymentUrl=clean(config.deploymentUrl || row.deployment_url) || null;
		const addon=await saveCloudAddon(row.id,{ config,deployment_url:deploymentUrl,configured:Boolean(deploymentUrl),status:row.attached?'attached':'detached' });
		await writeAudit({ actorUserId:user.id,action:'addon.config',targetType:'addon',targetId:row.id,detail:{deploymentUrl:Boolean(deploymentUrl)} });
		return json({ ok:true,addon });
	} catch(e){ return fail(e); }
}

export async function POST({ params,cookies }: any) {
	try {
		const user=await context(cookies); const parts=clean(params.rest).split('/').filter(Boolean); const row=await getCloudAddon(parts[0]); const action=parts[1] || '';
		if (action==='install') {
			const addon=await saveCloudAddon(row.id,{ installed:true,attached:false,status:'detached',installed_at:row.installed_at || new Date().toISOString() });
			await writeAudit({actorUserId:user.id,action:'addon.install',targetType:'addon',targetId:row.id}); return json({ok:true,addon});
		}
		if (action==='attach') {
			if (!row.installed) throw Object.assign(new Error('Install the add-on first'),{status:409});
			if (!row.configured || !row.deployment_url) throw Object.assign(new Error('Configure the cloud deployment URL first'),{status:409});
			if (!(await addonLicensed(row.license_component))) throw Object.assign(new Error('This installation is not licensed for this add-on'),{status:403,code:'LICENSE_REQUIRED'});
			const addon=await saveCloudAddon(row.id,{attached:true,status:'attached'}); await writeAudit({actorUserId:user.id,action:'addon.attach',targetType:'addon',targetId:row.id}); return json({ok:true,addon});
		}
		if (action==='detach') {
			const addon=await saveCloudAddon(row.id,{attached:false,status:'detached'}); await writeAudit({actorUserId:user.id,action:'addon.detach',targetType:'addon',targetId:row.id}); return json({ok:true,addon});
		}
		if (action==='test') {
			if (!row.deployment_url) throw Object.assign(new Error('Cloud deployment URL is not configured'),{status:409});
			const target=String(row.deployment_url).replace(/\/$/,''); let online=false; let status=0;
			try { const response=await fetch(target,{method:'GET',signal:AbortSignal.timeout(5000)}); status=response.status; online=response.status<500; } catch { online=false; }
			await saveCloudAddon(row.id,{runtime:{...(row.runtime||{}),online,lastTestedAt:new Date().toISOString(),httpStatus:status},status:online?(row.attached?'attached':'detached'):'error'});
			if (!online) throw Object.assign(new Error('Cloud add-on deployment is not reachable'),{status:503});
			return json({ok:true,online,httpStatus:status});
		}
		if (action==='repair') return json({ok:true,mode:'cloud',message:'Cloud add-ons do not require Windows service repair.'});
		throw Object.assign(new Error('Not found'),{status:404});
	} catch(e){ return fail(e); }
}

export async function DELETE({ params,cookies }: any) {
	try {
		const user=await context(cookies); const parts=clean(params.rest).split('/').filter(Boolean); const row=await getCloudAddon(parts[0]);
		if (parts.length!==1) throw Object.assign(new Error('Not found'),{status:404});
		const addon=await saveCloudAddon(row.id,{installed:false,attached:false,configured:false,status:'registered',deployment_url:null,config:{},runtime:{}});
		await writeAudit({actorUserId:user.id,action:'addon.uninstall',targetType:'addon',targetId:row.id,detail:{preservedData:true}}); return json({ok:true,preservedData:true,addon});
	} catch(e){ return fail(e); }
}
