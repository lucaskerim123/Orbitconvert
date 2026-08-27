<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '$lib/components/ui';
	import { FolderCog, LoaderCircle, Save, TriangleAlert } from '@lucide/svelte';

	type PathField = {
		key: string;
		label: string;
		restartRequired: boolean;
		value: string;
		exists: boolean;
	};

	let fields = $state<PathField[]>([]);
	let values = $state<Record<string, string>>({});
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let saved = $state('');

	async function load() {
		loading = true;
		error = '';
		try {
			fields = (await api.get<{ fields: PathField[] }>('/config/paths')).fields;
			values = Object.fromEntries(fields.map((field) => [field.key, field.value]));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load runtime paths';
		} finally {
			loading = false;
		}
	}
	async function save(event: Event) {
		event.preventDefault();
		saving = true;
		error = '';
		saved = '';
		try {
			await api.patch('/config/paths', { values });
			saved = 'Saved. Restart affected services to apply the new paths.';
			await load();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to save runtime paths';
		} finally {
			saving = false;
		}
	}

	load();
</script>

<div class="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
	<div>
		<h1 class="flex items-center gap-2 text-xl font-semibold">
			<FolderCog class="size-5" />Runtime paths
		</h1>
		<p class="text-sm text-muted-foreground">Folders and file locations used by OrbitFS services.</p>
	</div>

	{#if error}
		<p class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
	{/if}
	{#if loading}
		<div class="flex justify-center py-16 text-muted-foreground">
			<LoaderCircle class="size-5 animate-spin" />
		</div>
	{:else}
		<Card>
			<CardHeader>
				<CardTitle>Service paths</CardTitle>
				<CardDescription>Only approved runtime path variables are editable.</CardDescription>
			</CardHeader>
			<CardContent>
				<form class="space-y-4" onsubmit={save}>
					{#each fields as field (field.key)}
						<div class="space-y-1.5">
							<div class="flex items-center justify-between gap-2">
								<label for={field.key} class="text-sm font-medium">{field.label}</label>
								<span class="text-xs {field.exists ? 'text-success' : 'text-warning'}">
									{field.exists ? 'Path found' : 'Path not found'}
								</span>
							</div>
							<Input id={field.key} bind:value={values[field.key]} />
							<p class="font-mono text-[11px] text-muted-foreground">{field.key}</p>
						</div>
					{/each}

					<div class="flex flex-wrap items-center gap-2 border-t border-border pt-4">
						<Button type="submit" disabled={saving}>
							{#if saving}<LoaderCircle class="size-4 animate-spin" />{:else}<Save class="size-4" />{/if}
							Save paths
						</Button>
						{#if saved}<span class="text-sm text-success">{saved}</span>{/if}
					</div>
				</form>
			</CardContent>
		</Card>
		<div class="flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
			<TriangleAlert class="mt-0.5 size-4 shrink-0" />
			<span>Incorrect paths can stop services from starting. All path changes require a restart.</span>
		</div>
	{/if}
</div>
