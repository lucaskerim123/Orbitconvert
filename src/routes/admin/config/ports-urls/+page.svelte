<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui';
	import { LoaderCircle, Plug } from '@lucide/svelte';
	type Field = { key:string; label:string; value:string };
	let fields=$state<Field[]>([]), loading=$state(true), error=$state('');
	async function load(){loading=true;error='';try{fields=(await api.get<{fields:Field[]}>('/config/ports-urls')).fields;}catch(e){error=e instanceof ApiError?e.message:'Failed to load endpoints';}finally{loading=false;}}
	load();
</script>

<div class="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
	<div><h1 class="flex items-center gap-2 text-xl font-semibold"><Plug class="size-5" />Cloud endpoints</h1><p class="text-sm text-muted-foreground">Active Panel and licensing URLs. Vercel manages public routing, so there are no local listener ports to configure.</p></div>
	{#if error}<p class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>{/if}
	{#if loading}<div class="flex justify-center py-16 text-muted-foreground"><LoaderCircle class="size-5 animate-spin" /></div>
	{:else}<Card><CardHeader><CardTitle>Deployment endpoints</CardTitle></CardHeader><CardContent class="space-y-3">{#each fields as field (field.key)}<div class="rounded-lg border bg-background/40 p-3"><div class="font-medium">{field.label}</div><div class="mt-1 break-all font-mono text-xs text-muted-foreground">{field.value}</div></div>{/each}</CardContent></Card>{/if}
</div>