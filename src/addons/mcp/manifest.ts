export const mcpAddonManifest = {
	id: 'mcp',
	name: 'OrbitFS MCP',
	description: 'Startup, context, ChatGPT UI and MCP tools for OrbitFS.',
	version: '0.1.0',
	kind: 'panel-addon',
	transportPath: '/mcp',
	capabilities: ['mcp', 'startup', 'context', 'chatgpt-ui'],
	dependencies: ['base.workspaces', 'base.profiles', 'base.auth', 'base.permissions']
} as const;
