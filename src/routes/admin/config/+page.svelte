<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input } from '$lib/components/ui';
	import { Settings2, FolderCog, Save, LoaderCircle, HardDriveDownload } from '@lucide/svelte';

	type RuntimeConfig = { config: Record<string, Record<string, unknown>> };

	let runtime = $state<RuntimeConfig['config'] | null>(null);
	let runtimeLoading = $state(true);
	let runtimeError = $state('');

	async function loadRuntime() {
		runtimeLoading = true;
		runtimeError = '';
		try {
			const res = await api.get<RuntimeConfig>('/config/runtime');
			runtime = res.config;
		} catch (err) {
			runtimeError = err instanceof ApiError ? err.message : 'Failed to load runtime config';
		} finally {
			runtimeLoading = false;
		}
	}
	loadRuntime();

	let driveClientId = $state('');
	let driveLoading = $state(true);
	let driveSaving = $state(false);
	let driveError = $state('');
	let driveSaved = $state(false);

	async function loadDrive() {
		driveLoading = true;
		driveError = '';
		try {
			const res = await api.get<{ clientId: string | null }>('/drive-config');
			driveClientId = res.clientId ?? '';
		} catch (err) {
			driveError = err instanceof ApiError ? err.message : 'Failed to load Drive config';
		} finally {
			driveLoading = false;
		}
	}
	loadDrive();

	async function saveDrive(e: Event) {
		e.preventDefault();
		if (!driveClientId.trim()) return;
		driveSaving = true;
		driveError = '';
		driveSaved = false;
		try {
			await api.patch('/system/drive-config', { clientId: driveClientId.trim() });
			driveSaved = true;
		} catch (err) {
			driveError = err instanceof ApiError ? err.message : 'Save failed';
		} finally {
			driveSaving = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
	<div>
		<h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
			<Settings2 class="size-5 text-muted-foreground" />
			Config
		</h1>
		<p class="text-sm text-muted-foreground">Post-install runtime settings, services, URLs, paths, add-ons, and Google Drive.</p>
	</div>

	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<FolderCog class="size-4 text-muted-foreground" />
				Runtime
			</CardTitle>
			<CardDescription>Current runtime values. Edit them from the runtime/services pages below; some changes require a restart.</CardDescription>
		</CardHeader>
		<CardContent>
			{#if runtimeLoading}
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<LoaderCircle class="size-4 animate-spin" />
					Loading&hellip;
				</div>
			{:else if runtimeError}
				<p class="text-sm text-destructive">{runtimeError}</p>
			{:else if runtime}
				<div class="space-y-3">
					{#each Object.entries(runtime) as [section, values] (section)}
						<div>
							<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">{section}</p>
							<dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
								{#each Object.entries(values ?? {}) as [k, v] (k)}
									<dt class="text-muted-foreground">{k}</dt>
									<dd class="truncate font-mono text-xs">{JSON.stringify(v)}</dd>
								{/each}
							</dl>
						</div>
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>

	<div class="grid gap-3 md:grid-cols-2">
		<a href="/admin/config/install" class="rounded-lg border border-border bg-card p-4 text-sm hover:bg-accent/40">
			<p class="font-medium">Install / linking</p>
			<p class="text-muted-foreground">Core panel, licence API, MCP URL, deploy mode, and add-on roots.</p>
		</a>
		<a href="/admin/config/paths" class="rounded-lg border border-border bg-card p-4 text-sm hover:bg-accent/40">
			<p class="font-medium">Runtime paths</p>
			<p class="text-muted-foreground">Storage, workspaces, system, and plugin/add-on directories.</p>
		</a>
		<a href="/admin/config/ports-urls" class="rounded-lg border border-border bg-card p-4 text-sm hover:bg-accent/40">
			<p class="font-medium">Ports / URLs</p>
			<p class="text-muted-foreground">Frontend API base, panel public URL, licence API, and MCP URL.</p>
		</a>
		<a href="/admin/config/service-names" class="rounded-lg border border-border bg-card p-4 text-sm hover:bg-accent/40">
			<p class="font-medium">Service names</p>
			<p class="text-muted-foreground">Panel, backend, MCP, Cloudflare, and optional service names.</p>
		</a>
	</div>

	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<HardDriveDownload class="size-4 text-muted-foreground" />
				Google Drive
			</CardTitle>
			<CardDescription>
				Shared OAuth client ID for the whole panel. One admin sets it once, and each user still signs into their own Google account through it.
			</CardDescription>
		</CardHeader>
		<CardContent>
			{#if driveLoading}
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<LoaderCircle class="size-4 animate-spin" />
					Loading&hellip;
				</div>
			{:else}
				<form class="flex flex-wrap items-end gap-2" onsubmit={saveDrive}>
					<div class="min-w-64 flex-1 space-y-1.5">
						<label for="drive-client-id" class="text-sm font-medium">OAuth client ID</label>
						<Input id="drive-client-id" bind:value={driveClientId} placeholder="xxxxx.apps.googleusercontent.com" />
					</div>
					<Button type="submit" size="sm" disabled={driveSaving}>
						{#if driveSaving}<LoaderCircle class="size-4 animate-spin" />{:else}<Save />{/if}
						Save
					</Button>
				</form>
				{#if driveError}<p class="mt-2 text-sm text-destructive">{driveError}</p>{/if}
				{#if driveSaved}<p class="mt-2 text-sm text-success">Saved.</p>{/if}
			{/if}
		</CardContent>
	</Card>
</div>
