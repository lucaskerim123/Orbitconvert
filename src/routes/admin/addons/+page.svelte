<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { addons as addonsStore } from '$lib/addons.svelte';
	import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '$lib/components/ui';
	import { Cloud, LoaderCircle, PlugZap, RefreshCw, Settings, ShieldCheck, Trash2 } from '@lucide/svelte';

	type Addon = {
		id:string; name:string; description:string; version:string;
		installed:boolean; attached:boolean; licensed:boolean; available:boolean;
		configured:boolean; status:string; deploymentUrl?:string|null; transportPath?:string|null;
		licenseState?:string; supports?:string[]; runtime?:Record<string,unknown>;
	};
	let addons=$state<Addon[]>([]), loading=$state(true), error=$state(''), busy=$state('');
	let deploymentUrls=$state<Record<string,string>>({});
	let mcpStatus=$state<any>(null);
	const message=(e:unknown,fallback:string)=>e instanceof ApiError?e.message:fallback;

	async function load(){
		loading=true; error='';
		try {
			const [data,runtime]=await Promise.all([
				api.get<{addons:Addon[]}>('/addons'),
				api.get('/mcp/runtime').catch(()=>null)
			]);
			addons=data.addons;
			mcpStatus=runtime;
			deploymentUrls=Object.fromEntries(data.addons.map(a=>[a.id,a.deploymentUrl||'']));
		} catch(e){ error=message(e,'Could not load cloud add-ons'); }
		finally { loading=false; }
	}
	load();
	async function act(id:string,action:string){
		busy=`${id}:${action}`; error='';
		try { await api.post(`/addons/${id}/${action}`); await load(); await addonsStore.load(); }
		catch(e){ error=message(e,`${action} failed`); }
		finally { busy=''; }
	}
	async function saveConfig(id:string){
		busy=`${id}:config`; error='';
		try { await api.patch(`/addons/${id}/config`,{deploymentUrl:deploymentUrls[id]||''}); await load(); }
		catch(e){ error=message(e,'Configuration save failed'); }
		finally { busy=''; }
	}
	async function remove(id:string){
		if(!confirm('Uninstall this cloud add-on? Add-on data is preserved.')) return;
		busy=`${id}:remove`; error='';
		try { await api.delete(`/addons/${id}`); await load(); await addonsStore.load(); }
		catch(e){ error=message(e,'Uninstall failed'); }
		finally { busy=''; }
	}
	const tone=(a:Addon)=>!a.installed?'secondary':!a.licensed?'destructive':a.attached?'success':a.configured?'warning':'secondary';
</script>

<div class="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
	<header class="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
		<div><div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary"><Cloud class="size-4"/> Cloud add-ons</div>
		<h1 class="mt-1 text-2xl font-semibold">Add-on Manager</h1>
		<p class="text-sm text-muted-foreground">Manage OrbitFS add-ons deployed independently on Vercel and backed by Supabase.</p></div>
		<Button variant="outline" onclick={load} disabled={loading}><RefreshCw class="size-4"/>Refresh</Button>
	</header>
	{#if error}<div class="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>{/if}
	{#if loading}<div class="grid min-h-64 place-items-center"><LoaderCircle class="size-7 animate-spin"/></div>{:else}
		<div class="grid gap-4">
		{#each addons as addon (addon.id)}
			<Card>
				<CardHeader><div class="flex flex-wrap items-start justify-between gap-3"><div><div class="flex flex-wrap items-center gap-2"><CardTitle>{addon.name}</CardTitle><Badge variant="outline">v{addon.version}</Badge><Badge variant={tone(addon)}>{addon.status}</Badge>{#if addon.id==='mcp'}<Badge variant={mcpStatus?.state==='standby'?'warning':mcpStatus?.state==='running'?'success':'destructive'}>{mcpStatus?.state || 'stopped'}</Badge>{/if}</div><CardDescription class="mt-1">{addon.description}</CardDescription></div><Badge variant={addon.licensed?'success':'destructive'}>{addon.licensed?'Licensed':'Licence required'}</Badge></div></CardHeader>
				<CardContent class="space-y-4">
					<div class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div class="rounded-lg border p-3"><span class="text-xs text-muted-foreground">Runtime</span><p class="mt-1 font-medium">Vercel</p></div><div class="rounded-lg border p-3"><span class="text-xs text-muted-foreground">Storage / DB</span><p class="mt-1 font-medium">Supabase</p></div><div class="rounded-lg border p-3"><span class="text-xs text-muted-foreground">Installed</span><p class="mt-1 font-medium">{addon.installed?'Yes':'No'}</p></div><div class="rounded-lg border p-3"><span class="text-xs text-muted-foreground">Attached</span><p class="mt-1 font-medium">{addon.attached?'Yes':'No'}</p></div></div>
					{#if addon.id === 'mcp'}
						<div class="rounded-lg border bg-muted/10 p-3 text-sm">
							<div class="flex flex-wrap items-center justify-between gap-2"><div><span class="text-xs text-muted-foreground">Backend service</span><p class="mt-1 font-medium">{mcpStatus?.publicBaseUrl || addon.deploymentUrl || 'https://orbitfsmcp.vercel.app'}</p></div><Badge variant={mcpStatus?.state==='standby'?'warning':mcpStatus?.state==='running'?'success':'destructive'}>{mcpStatus?.state || mcpStatus?.serviceStatus || 'stopped'}</Badge></div>
							<p class="mt-2 text-xs text-muted-foreground">MCP is a separate backend-only Vercel deployment. OrbitFS Project owns the admin UI, OAuth login and configuration. Standby is the normal ready state between requests.</p>
						</div>
					{:else}
						<label class="block space-y-1 text-sm"><span>Cloud deployment URL</span><Input bind:value={deploymentUrls[addon.id]} placeholder="https://your-addon.vercel.app" disabled={!addon.installed}/><span class="block text-xs text-muted-foreground">Only public cloud deployments are supported.</span></label>
					{/if}
					<div class="flex flex-wrap gap-2">
						{#if !addon.installed}<Button onclick={()=>act(addon.id,'install')} disabled={busy!==''}>Install</Button>{/if}
						{#if addon.installed && addon.id !== 'mcp'}<Button variant="outline" onclick={()=>saveConfig(addon.id)} disabled={busy!==''}>Save config</Button>{/if}
						{#if addon.installed}<Button variant="outline" onclick={()=>act(addon.id,'test')} disabled={busy!==''}><ShieldCheck class="size-4"/>Test</Button>{/if}
						{#if addon.id==='mcp' && addon.installed && addon.attached}<Button variant="outline" onclick={()=>goto('/admin/mcp/runtime')}><Cloud class="size-4"/>Master Control</Button><Button variant="outline" onclick={()=>goto('/admin/mcp/settings')}><Settings class="size-4"/>Settings</Button>{/if}
						{#if addon.installed && !addon.attached}<Button onclick={()=>act(addon.id,'attach')} disabled={busy!=='' || !addon.licensed || !addon.configured}><PlugZap class="size-4"/>Attach</Button>{/if}
						{#if addon.attached}<Button variant="outline" onclick={()=>act(addon.id,'detach')} disabled={busy!==''}>Detach</Button>{/if}
						{#if addon.installed}<Button variant="ghost" class="text-destructive" onclick={()=>remove(addon.id)} disabled={busy!=='' || addon.attached}><Trash2 class="size-4"/>Uninstall</Button>{/if}
					</div>
					<div class="rounded-lg border bg-muted/10 p-3 text-xs text-muted-foreground">Lifecycle: Install → validate cloud runtime → licence check → attach. Detach/uninstall preserves add-on data and never touches the Windows VPS.</div>
				</CardContent>
			</Card>
		{/each}
		{#if addons.length===0}<Card><CardContent class="p-8 text-center text-sm text-muted-foreground">No cloud add-ons are registered.</CardContent></Card>{/if}
		</div>
	{/if}
</div>
