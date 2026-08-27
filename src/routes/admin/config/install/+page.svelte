<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api';
	import { Button, Input, Card, CardContent } from '$lib/components/ui';
	import { CheckCircle2, LoaderCircle, Plug, Settings, XCircle } from '@lucide/svelte';
	type SetupConfig = { setupComplete: boolean; coreRequired: string[]; config: Record<string, string | number>; addons: { id: string; label: string; required: boolean; status: string }[]; notes: string[] };
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let saved = $state('');
	let model = $state<SetupConfig | null>(null);
	let testResults = $state<Record<string, { ok: boolean; message: string; status?: number }>>({});
	onMount(load);
	async function load() { loading = true; error = ''; try { model = await api.get<SetupConfig>('/setup/config'); } catch (err) { error = err instanceof ApiError ? err.message : 'Could not load setup config'; } finally { loading = false; } }
	function update(key: string, value: string) { if (!model) return; model.config = { ...model.config, [key]: value }; }
	async function save() { if (!model) return; saving = true; error = ''; saved = ''; try { await api.put('/setup/config', model.config); saved = 'Saved. Restart panel/backend for runtime path changes.'; await load(); } catch (err) { error = err instanceof ApiError ? err.message : 'Save failed'; } finally { saving = false; } }
	async function test(target: string, value: string) { testResults = { ...testResults, [target]: { ok: false, message: 'Testing...' } }; try { const res = await api.post<{ ok: boolean; message: string; status?: number }>('/setup/test-link', { target, value }); testResults = { ...testResults, [target]: res }; } catch (err) { testResults = { ...testResults, [target]: { ok: false, message: err instanceof ApiError ? err.message : 'Test failed' } }; } }
</script>

<div class="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
	<div class="space-y-1">
		<h1 class="flex items-center gap-2 text-xl font-semibold"><Settings class="size-5" />OrbitFS install &amp; linking</h1>
		<p class="text-sm text-muted-foreground">Configure the core panel first. Workspaces and MCP are optional and can be linked later.</p>
	</div>
	{#if loading}
		<Card><CardContent class="flex items-center gap-2 p-4 text-sm text-muted-foreground"><LoaderCircle class="size-4 animate-spin" />Loading setup...</CardContent></Card>
	{:else if model}
		<Card><CardContent class="space-y-4 p-4">
			<div class="grid gap-3 md:grid-cols-2">
				<label class="space-y-1 text-sm"><span>Public panel URL</span><Input value={String(model.config.publicOrigin ?? '')} oninput={(e) => update('publicOrigin', e.currentTarget.value)} /></label>
				<label class="space-y-1 text-sm"><span>Backend port</span><Input value={String(model.config.backendPort ?? '')} oninput={(e) => update('backendPort', e.currentTarget.value)} /></label>
				<label class="space-y-1 text-sm"><span>API base</span><Input value={String(model.config.apiBase ?? '')} oninput={(e) => update('apiBase', e.currentTarget.value)} /></label>
				<label class="space-y-1 text-sm"><span>Licence API URL</span><Input value={String(model.config.licenseApiUrl ?? '')} oninput={(e) => update('licenseApiUrl', e.currentTarget.value)} /></label>
				<label class="space-y-1 text-sm md:col-span-2"><span>Storage root</span><Input value={String(model.config.storageRoot ?? '')} oninput={(e) => update('storageRoot', e.currentTarget.value)} /></label>
				<label class="space-y-1 text-sm md:col-span-2"><span>Main workspace root</span><Input value={String(model.config.mainWorkspaceRoot ?? '')} oninput={(e) => update('mainWorkspaceRoot', e.currentTarget.value)} /></label>
				<label class="space-y-1 text-sm md:col-span-2"><span>Branch workspace root</span><Input value={String(model.config.branchWorkspaceRoot ?? '')} oninput={(e) => update('branchWorkspaceRoot', e.currentTarget.value)} /></label>
				<label class="space-y-1 text-sm md:col-span-2"><span>System root</span><Input value={String(model.config.systemRoot ?? '')} oninput={(e) => update('systemRoot', e.currentTarget.value)} /></label>
				<label class="space-y-1 text-sm md:col-span-2"><span>Plugin/add-on root</span><Input value={String(model.config.pluginRoot ?? '')} oninput={(e) => update('pluginRoot', e.currentTarget.value)} /></label>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button onclick={save} disabled={saving}>{#if saving}<LoaderCircle class="size-4 animate-spin" />{/if}Save config</Button>
				<Button variant="outline" onclick={() => test('license', String(model?.config.licenseApiUrl ?? ''))}>Test licence API</Button>
				<Button variant="outline" onclick={() => test('storage', String(model?.config.storageRoot ?? ''))}>Test storage path</Button>
				<Button variant="outline" onclick={() => test('plugins', String(model?.config.pluginRoot ?? ''))}>Test add-on path</Button>
			</div>
			{#if saved}<p class="text-sm text-primary">{saved}</p>{/if}
			{#if error}<p class="text-sm text-destructive">{error}</p>{/if}
			{#each Object.entries(testResults) as [key, result]}
				<p class="flex items-center gap-2 text-sm {result.ok ? 'text-primary' : 'text-destructive'}">
					{#if result.ok}<CheckCircle2 class="size-4" />{:else}<XCircle class="size-4" />{/if}{key}: {result.message}{result.status ? ` (${result.status})` : ''}
				</p>
			{/each}
		</CardContent></Card>

		<Card><CardContent class="space-y-3 p-4">
			<h2 class="flex items-center gap-2 font-semibold"><Plug class="size-4" />Optional add-ons</h2>
			<div class="grid gap-2 md:grid-cols-3">
				{#each model.addons as addon}
					<div class="rounded-md border p-3 text-sm"><p class="font-medium">{addon.label}</p><p class="text-muted-foreground">{addon.status}</p><p class="mt-1 text-xs text-muted-foreground">Can be linked after panel install.</p></div>
				{/each}
			</div>
			<label class="space-y-1 text-sm"><span>MCP URL or local service URL</span><Input value={String(model.config.mcpUrl ?? '')} oninput={(e) => update('mcpUrl', e.currentTarget.value)} /></label>
			<Button variant="outline" onclick={() => test('mcp', String(model?.config.mcpUrl ?? ''))}>Test MCP link</Button>
		</CardContent></Card>
		<Card><CardContent class="space-y-2 p-4">
			<h2 class="font-semibold">Install notes</h2>
			{#each model.notes as note}<p class="text-sm text-muted-foreground">{note}</p>{/each}
		</CardContent></Card>
	{:else}
		<Card><CardContent class="p-4 text-sm text-destructive">No setup config returned.</CardContent></Card>
	{/if}
</div>
