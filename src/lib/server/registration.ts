import { hashPassword } from '$lib/server/auth';
import { getSupabaseAdmin } from '$lib/server/supabase';

export const USER_CAPABILITIES = [
	'create_workspaces','access_public_workspace','invite_workspace_members','share_files',
	'mcp_use','mcp_manage_startup','mcp_manage_preset_names','mcp_manage_projects','mcp_manage_settings',
	'sorter_view','sorter_scan','sorter_add_to_queue','sorter_review_queue','sorter_apply','sorter_undo',
	'sorter_manage_rules','sorter_auto_apply','converter_view','converter_run','converter_manage_settings'
] as const;

export const REGISTRATION_MODES = ['off','open','approval_queue'] as const;
export type RegistrationMode = typeof REGISTRATION_MODES[number];

export const REGISTERED_USER_PERMISSION_DEFAULTS = {
	create_workspaces: true, access_public_workspace: true,
	invite_workspace_members: false, share_files: false,
	mcp_use: true, mcp_manage_startup: false, mcp_manage_preset_names: false,
	mcp_manage_projects: false, mcp_manage_settings: false,
	sorter_view: true, sorter_scan: true, sorter_add_to_queue: true,
	sorter_review_queue: false, sorter_apply: false, sorter_undo: false,
	sorter_manage_rules: false, sorter_auto_apply: false,
	converter_view: true, converter_run: true, converter_manage_settings: false
};