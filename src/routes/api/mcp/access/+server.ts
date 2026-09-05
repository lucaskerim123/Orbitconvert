import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';
import { visibleWorkspaces } from '$lib/server/workspaces';

export async function GET({ cookies }: any) {
  try {
    const user = await requireUser(cookies);
    await assertPanelLicensed();
    const workspaces = await visibleWorkspaces(user);
    const mcpWorkspaces = workspaces
      .filter((workspace: any) => workspace.status === 'active' && workspace.mcp_system_enabled !== false && workspace.mcp_ui_enabled !== false)
      .map((workspace: any) => ({
        id: workspace.id,
        name: workspace.name,
        permission: workspace.permission,
        mcpAllowed: workspace.management_permissions?.mcp_use === true,
        management_permissions: workspace.management_permissions || {}
      }))
      .filter((workspace: any) => workspace.mcpAllowed);
    return json({ mcpWorkspaces, count: mcpWorkspaces.length });
  } catch (error: any) {
    return json({ error: String(error?.message || 'Could not resolve MCP access') }, { status: Number(error?.status || 500) });
  }
}
