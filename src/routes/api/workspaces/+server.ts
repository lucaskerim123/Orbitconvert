import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';
import { writeAudit } from '$lib/server/audit';
import {
	FILE_ACTIONS, MANAGEMENT_ACTIONS, createWorkspace, effectiveUserPermissions,
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
			fileActions:[...FILE_ACTIONS], managementActions:[...MANAGEMENT_ACTIONS],
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