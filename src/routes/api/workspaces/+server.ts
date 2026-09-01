import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';
import { writeAudit } from '$lib/server/audit';
import {
	FILE_ACTIONS, MANAGEMENT_ACTIONS, MANAGEMENT_LABELS, createWorkspace, effectiveUserPermissions,
	isSystemAdmin, readWorkspaceSettings, visibleWorkspaces
} from '$lib/server/workspaces';

function fail(error: any) {
	const status = Number(error?.status || 500);
	return json({ error:String(error?.message || 'Request failed'), code:String(error?.code || 'REQUEST_FAILED') }, { status });
}

export async function GET({ cookies }) {
	try {
		const user = await requireUser(cookies);
		await assertPanelLicensed();
		const workspaces = await visibleWorkspaces(user);
		return json({
			workspaces, settings:await readWorkspaceSettings(), canManageGlobal:isSystemAdmin(user),
			userPermissions:await effectiveUserPermissions(user), roles:['owner','editor','contributor','viewer'],
			fileActions:[...FILE_ACTIONS], managementActions:[...MANAGEMENT_ACTIONS], managementLabels:MANAGEMENT_LABELS,
			managementCatalog:{ groups:[
				{id:'base',label:'Workspace permissions',addonId:'base',attached:true,permissions:MANAGEMENT_ACTIONS.filter((id)=>!id.startsWith('mcp_')&&!id.startsWith('manage_mcp_')&&!id.startsWith('sorter_')&&!id.startsWith('converter_')&&!id.startsWith('studio_'))},
				{id:'mcp',label:'MCP',addonId:'mcp',attached:true,permissions:MANAGEMENT_ACTIONS.filter((id)=>id==='mcp_use'||id.startsWith('manage_mcp_'))},
				{id:'apex',label:'Apex System',addonId:'apex',attached:true,permissions:MANAGEMENT_ACTIONS.filter((id)=>id.startsWith('sorter_')||id.startsWith('converter_'))},
				{id:'studio',label:'Studio',addonId:'studio',attached:true,permissions:MANAGEMENT_ACTIONS.filter((id)=>id.startsWith('studio_'))}
			],labels:MANAGEMENT_LABELS,count:MANAGEMENT_ACTIONS.length}, currentUser:{id:user.id,username:user.username,role:user.role},
			ownedCount:workspaces.filter((ws:any) => ws.permission === 'owner' && !ws.is_main).length
		});
	} catch (error) { return fail(error); }
}
export async function POST({ request, cookies }) {
	try {
		const user = await requireUser(cookies);
		await assertPanelLicensed();
		const body = await request.json().catch(() => ({}));
		const workspace = await createWorkspace(user,body);
		await writeAudit({
			actorUserId:user.id, workspaceId:workspace.id, action:'workspace.create',
			targetType:'workspace', targetId:workspace.id, detail:{ name:workspace.name }
		});
		return json({ workspace });
	} catch (error) { return fail(error); }
}