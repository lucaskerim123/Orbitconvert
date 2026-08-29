<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui';
	import { Activity, Cloud, Database, RefreshCw } from '@lucide/svelte';
	let loading=$state(true),error=$state(''); let status:any=$state(null);
	async function load(){loading=true;error='';try{status=await api.get('/mcp/runtime');}catch(e){error=e instanceof Error?e.message:'Unable to load MCP runtime';}finally{loading=false;}}
	onMount(load);
</script>
<div class="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
	<div class="flex items-center justify-between gap-3"><div><h1 class="flex items-center gap-2 text-xl font-semibold"><Cloud class="size-5"/>MCP Runtime</h1><p class="text-sm text-muted-foreground">Cloud runtime and MCP transport status.</p></div><Button variant="outline" onclick={load} disabled={loading}><RefreshCw class="size-4"/>Refresh</Button></div>
	{#if error}<div class="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>{/if}
	<div class="grid gap-4 md:grid-cols-2">
		<Card><CardHeader><CardTitle class="flex items-center gap-2"><Activity class="size-4"/>Runtime</CardTitle></CardHeader><CardContent class="space-y-3 text-sm"><div class="flex justify-between"><span>Status</span><Badge variant={status?.online?'success':'destructive'}>{status?.online?'Online':'Offline'}</Badge></div><div class="flex justify-between"><span>Compute</span><strong>Vercel</strong></div><div class="flex justify-between"><span>Mode</span><strong>{status?.mode||'cloud'}</strong></div><div class="flex justify-between"><span>Transport</span><code>{status?.connectorPath||'/mcp'}</code></div></CardContent></Card>
		<Card><CardHeader><CardTitle class="flex items-center gap-2"><Database class="size-4"/>Persistence</CardTitle></CardHeader><CardContent class="space-y-3 text-sm"><div class="flex justify-between"><span>Database</span><strong>Supabase Postgres</strong></div><div class="flex justify-between"><span>Files</span><strong>Supabase Storage</strong></div><div class="flex justify-between"><span>Workspace integration</span><strong>{status?.workspaceIntegration?'Active':'Off'}</strong></div><div class="flex justify-between"><span>Licence</span><strong>{status?.licensed?'Allowed':'Blocked'}</strong></div></CardContent></Card>
	</div>
	<Card><CardHeader><CardTitle>Connection</CardTitle></CardHeader><CardContent class="space-y-2 text-sm"><p>MCP endpoint: <code>{status?.publicBaseUrl ? `${status.publicBaseUrl}/mcp` : '/mcp'}</code></p><p class="text-muted-foreground">There is no Windows service, localhost engine, VPS port, or service control in cloud mode.</p></CardContent></Card>
</div>
