import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';
import { getMcpAddonRow, assertMcpLicensed } from '$lib/server/mcp-cloud';
import { mcpAddonManifest } from '../../../../addons/mcp/manifest';

export async function GET({ cookies }) {
	await requireUser(cookies);
	await assertPanelLicensed();
	const row = await getMcpAddonRow();
	let licensed = false;
	try { await assertMcpLicensed(); licensed = true; } catch {}
	const installed = row?.status !== 'uninstalled';
	const attached = installed && row?.attached === true;
	return json({ addons: [{ ...mcpAddonManifest, installed, attached, parked: installed && !attached, status: !installed ? 'uninstalled' : !licensed ? 'unlicensed' : attached ? 'attached' : 'detached', licensed, online: attached, available: installed && licensed, configured: Boolean(row?.configured), version: row?.version || mcpAddonManifest.version, frontend: row?.frontend || null }] });
}
