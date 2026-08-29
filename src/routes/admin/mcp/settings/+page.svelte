<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { addons } from '$lib/addons.svelte';
	import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui';
	import { Cloud, Database, Plug, RefreshCw } from '@lucide/svelte';
	let runtime=$state<any>(null),loading=$state(true),error=$state('');
	async function load(){loading=true;error='';try{runtime=await api.get('/mcp/runtime');await addons.load();}catch(e){error=e instanceof ApiError?e.message:'Failed to load MCP cloud settings';}finally{loading=false;}}
	load(); const addon=$derived(addons.get('mcp'));
</script>
<div class="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
	<div class="flex items-start justify-between gap-3"><div><h1 class="text-xl font-semibold">MCP overview & settings</h1><p class="text-sm text-muted-foreground">Cloud deployment, persistence, client access and startup configuration.</p></div><Button variant="outline" size="sm" onclick={load} disabled={loading}><RefreshCw class="size-4"/>Refresh</Button></div>
	{#if error}<div class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>{/if}
	<div class="grid gap-4 md:grid-cols-3">
		<Card><CardHeader><CardTitle class="flex items-center gap-2"><Plug class="size-4"/>Module</CardTitle></CardHeader><CardContent><Badge variant={addon?.attached?'success':'secondary'}>{addon?.attached?'Attached':'Detached'}</Badge><p class="mt-2 text-xs text-muted-foreground">Licensed: {addon?.licensed?'Yes':'No'}</p></CardContent></Card>
		<Card><CardHeader><CardTitle class="flex items-center gap-2"><Cloud class="size-4"/>Runtime</CardTitle></CardHeader><CardContent><Badge variant={runtime?.online?'success':'destructive'}>{runtime?.online?'Vercel online':'Offline'}</Badge><p class="mt-2 text-xs text-muted-foreground">Transport: {runtime?.connectorPath||'/mcp'}</p></CardContent></Card>
		<Card><CardHeader><CardTitle class="flex items-center gap-2"><Database class="size-4"/>Storage</CardTitle></CardHeader><CardContent><Badge variant="secondary">Supabase</Badge><p class="mt-2 text-xs text-muted-foreground">Projects, presets, context bundles, registry and runtime state use Postgres.</p></CardContent></Card>
	</div>
	<Card><CardHeader><CardTitle>MCP administration</CardTitle><CardDescription>All runtime controls are cloud-native. No VPS service configuration is used.</CardDescription></CardHeader><CardContent class="grid gap-2 text-sm md:grid-cols-2"><a class="rounded-md border p-3 hover:bg-accent" href="/admin/mcp/runtime">Runtime</a><a class="rounded-md border p-3 hover:bg-accent" href="/admin/mcp/clients">Client registry</a><a class="rounded-md border p-3 hover:bg-accent" href="/admin/mcp/startup">OSS policy</a><a class="rounded-md border p-3 hover:bg-accent" href="/admin/mcp/logs">MCP audit log</a></CardContent></Card>
</div>
