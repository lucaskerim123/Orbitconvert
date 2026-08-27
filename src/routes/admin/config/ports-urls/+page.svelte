<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '$lib/components/ui';
	import { Plug, LoaderCircle, Save } from '@lucide/svelte';
	type Field = { key: string; label: string; type: 'port' | 'url'; value: string };
	let fields = $state<Field[]>([]);
	let values = $state<Record<string, string>>({});
	let loading = $state(true), saving = $state(false);
	let error = $state(''), saved = $state('');
	async function load() {
		loading = true; error = '';
		try {
			fields = (await api.get<{ fields: Field[] }>('/config/ports-urls')).fields;
			values = Object.fromEntries(fields.map((f) => [f.key, f.value]));
		} catch (e) { error = e instanceof ApiError ? e.message : 'Failed to load'; }
		finally { loading = false; }
	}
	async function save(e: Event) {
		e.preventDefault(); saving = true; error = ''; saved = '';
		try { await api.patch('/config/ports-urls', { values }); saved = 'Saved. Restart affected services to apply.'; }
		catch (e) { error = e instanceof ApiError ? e.message : 'Save failed'; }
		finally { saving = false; }
	}
	load();
</script><div class="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
	<div><h1 class="flex items-center gap-2 text-xl font-semibold"><Plug class="size-5" />Ports / URLs</h1>
		<p class="text-sm text-muted-foreground">Network ports and service endpoints used by OrbitFS.</p></div>
	{#if error}<p class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>{/if}
	{#if loading}<div class="flex justify-center py-16"><LoaderCircle class="size-5 animate-spin" /></div>
	{:else}<Card><CardHeader><CardTitle>Endpoints</CardTitle></CardHeader><CardContent>
		<form class="space-y-4" onsubmit={save}>
			{#each fields as field (field.key)}
				<div class="space-y-1.5"><label for={field.key} class="text-sm font-medium">{field.label}</label>
					<Input id={field.key} type={field.type === 'port' ? 'number' : 'text'} bind:value={values[field.key]} />
					<p class="font-mono text-[11px] text-muted-foreground">{field.key}</p></div>
			{/each}
			<div class="flex items-center gap-2 border-t pt-4"><Button type="submit" disabled={saving}>
				{#if saving}<LoaderCircle class="size-4 animate-spin" />{:else}<Save class="size-4" />{/if}Save</Button>
				{#if saved}<span class="text-sm text-success">{saved}</span>{/if}</div>
		</form>
	</CardContent></Card>{/if}
</div>