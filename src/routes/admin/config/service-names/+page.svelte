<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '$lib/components/ui';
	import { ServerCog, LoaderCircle, Save } from '@lucide/svelte';
	type ServiceField = { key: string; label: string; value: string };
	type EndpointField = { key: string; label: string; type: 'port' | 'url'; value: string };
	let serviceFields = $state<ServiceField[]>([]);
	let endpointFields = $state<EndpointField[]>([]);
	let serviceValues = $state<Record<string, string>>({});
	let endpointValues = $state<Record<string, string>>({});
	let loading = $state(true), saving = $state(false);
	let error = $state(''), saved = $state('');
	async function load() {
		loading = true; error = '';
		try {
			const [services, endpoints] = await Promise.all([
				api.get<{ fields: ServiceField[] }>('/config/service-names'),
				api.get<{ fields: EndpointField[] }>('/config/ports-urls')
			]);
			serviceFields = services.fields;
			endpointFields = endpoints.fields;
			serviceValues = Object.fromEntries(serviceFields.map((f) => [f.key, f.value]));
			endpointValues = Object.fromEntries(endpointFields.map((f) => [f.key, f.value]));
		} catch (e) { error = e instanceof ApiError ? e.message : 'Failed to load configuration'; }
		finally { loading = false; }
	}
	async function save(e: Event) {
		e.preventDefault(); saving = true; error = ''; saved = '';
		try {
			await Promise.all([
				api.patch('/config/service-names', { values: serviceValues }),
				api.patch('/config/ports-urls', { values: endpointValues })
			]);
			saved = 'Saved. Restart affected services to apply changes.';
		} catch (e) { error = e instanceof ApiError ? e.message : 'Save failed'; }
		finally { saving = false; }
	}
	load();
</script>

<div class="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
	<div>
		<h1 class="flex items-center gap-2 text-xl font-semibold"><ServerCog class="size-5" />Services & endpoints</h1>
		<p class="text-sm text-muted-foreground">Windows service names, network ports and service URLs used by OrbitFS.</p>
	</div>
	{#if error}<p class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>{/if}
	{#if loading}<div class="flex justify-center py-16"><LoaderCircle class="size-5 animate-spin" /></div>
	{:else}<form class="space-y-5" onsubmit={save}>
		<Card><CardHeader><CardTitle>Service names</CardTitle></CardHeader><CardContent class="space-y-4">
			{#each serviceFields as field (field.key)}
				<div class="space-y-1.5"><label for={field.key} class="text-sm font-medium">{field.label}</label>
					<Input id={field.key} bind:value={serviceValues[field.key]} /><p class="font-mono text-[11px] text-muted-foreground">{field.key}</p></div>
			{/each}
		</CardContent></Card>
		<Card><CardHeader><CardTitle>Ports / URLs</CardTitle></CardHeader><CardContent class="space-y-4">
			{#each endpointFields as field (field.key)}
				<div class="space-y-1.5"><label for={field.key} class="text-sm font-medium">{field.label}</label>
					<Input id={field.key} type={field.type === 'port' ? 'number' : 'text'} bind:value={endpointValues[field.key]} />
					<p class="font-mono text-[11px] text-muted-foreground">{field.key}</p></div>
			{/each}
		</CardContent></Card>
		<div class="flex items-center gap-2"><Button type="submit" disabled={saving}>
			{#if saving}<LoaderCircle class="size-4 animate-spin" />{:else}<Save class="size-4" />{/if}Save all</Button>
			{#if saved}<span class="text-sm text-success">{saved}</span>{/if}</div>
	</form>{/if}
</div>