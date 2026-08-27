<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { addons } from '$lib/addons.svelte';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button, Input } from '$lib/components/ui';
	import { KeyRound, RefreshCw, LoaderCircle, HardDrive, Server, Sparkles } from '@lucide/svelte';

	type ComponentStatus = { state: string; allowed: boolean; lockedToThisInstallation?: boolean; reason?: string | null };
	type LicenseSummary = {
		valid: boolean;
		enforcement: boolean;
		reason?: string;
		keyHint?: string;
		lastCheckedAt?: string;
		offlineGrace?: boolean;
		components: Record<string, ComponentStatus>;
	};

	const COMPONENT_META: Record<string, { label: string; icon: typeof HardDrive }> = {
		orbitfs_panel: { label: 'Base System', icon: HardDrive },
		orbitfs_mcp: { label: 'MCP', icon: Server },
		orbitfs_sorter: { label: 'Apex System', icon: Sparkles }
	};

	let summary = $state<LicenseSummary | null>(null);
	let loading = $state(true);
	let refreshing = $state(false);
	let error = $state('');

	let keyInput = $state('');
	let activating = $state(false);
	let activateError = $state('');

	async function load(refresh = false) {
		if (refresh) refreshing = true;
		else loading = true;
		error = '';
		try {
			summary = await api.get<LicenseSummary>(`/license/status${refresh ? '?refresh=1' : ''}`);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load licence status';
		} finally {
			loading = false;
			refreshing = false;
		}
	}

	load();

	async function activate(e: Event) {
		e.preventDefault();
		if (!keyInput.trim()) return;
		activating = true;
		activateError = '';
		try {
			await api.post('/license/activate', { licenseKey: keyInput.trim() });
			keyInput = '';
			await Promise.all([load(), addons.load()]);
		} catch (err) {
			activateError = err instanceof ApiError ? err.message : 'Activation failed';
		} finally {
			activating = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
				<KeyRound class="size-5 text-muted-foreground" />
				Licence
			</h1>
			<p class="text-sm text-muted-foreground">Component entitlement and activation.</p>
		</div>
		<Button variant="outline" size="sm" onclick={() => load(true)} disabled={refreshing}>
			<RefreshCw class="size-4 {refreshing ? 'animate-spin' : ''}" />
			Refresh
		</Button>
	</div>

	{#if error}
		<div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="flex items-center justify-center gap-2 py-16 text-muted-foreground">
			<LoaderCircle class="size-5 animate-spin" />
			Loading&hellip;
		</div>
	{:else if summary}
		<Card>
			<CardHeader>
				<div class="flex items-center justify-between">
					<CardTitle>Overview</CardTitle>
					<Badge variant={summary.valid ? 'success' : 'destructive'}>
						{summary.valid ? 'Valid' : 'Invalid'}
					</Badge>
				</div>
				<CardDescription>
					{#if !summary.enforcement}
						Licence enforcement is disabled — all components run unrestricted (development mode).
					{:else}
						{summary.reason ?? '—'}
						{#if summary.offlineGrace}&middot; running on cached offline grace period{/if}
					{/if}
				</CardDescription>
			</CardHeader>
			<CardContent class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
				{#if summary.keyHint}<span>Key: {summary.keyHint}</span>{/if}
				{#if summary.lastCheckedAt}<span>Last checked: {new Date(summary.lastCheckedAt).toLocaleString()}</span>{/if}
			</CardContent>
		</Card>

		<div class="grid gap-4 sm:grid-cols-2">
			{#each Object.entries(summary.components) as [id, comp] (id)}
				{@const meta = COMPONENT_META[id] ?? { label: id, icon: HardDrive }}
				{@const Icon = meta.icon}
				<Card>
					<CardHeader>
						<div class="flex items-center justify-between">
							<CardTitle class="flex items-center gap-2">
								<Icon class="size-4 text-muted-foreground" />
								{meta.label}
							</CardTitle>
							<Badge variant={comp.allowed ? 'success' : 'destructive'}>{comp.state}</Badge>
						</div>
						{#if comp.reason}
							<CardDescription class="mt-1">{comp.reason}</CardDescription>
						{/if}
					</CardHeader>
				</Card>
			{/each}
		</div>

		<Card>
			<CardHeader>
				<CardTitle>Activate / replace key</CardTitle>
				<CardDescription>Enter a licence key to activate or update the panel's entitlement.</CardDescription>
			</CardHeader>
			<CardContent>
				<form class="flex flex-col gap-2 sm:flex-row" onsubmit={activate}>
					<Input bind:value={keyInput} placeholder="Licence key" class="flex-1" />
					<Button type="submit" disabled={activating}>
						{#if activating}<LoaderCircle class="size-4 animate-spin" />{/if}
						Activate
					</Button>
				</form>
				{#if activateError}
					<p class="mt-2 text-sm text-destructive">{activateError}</p>
				{/if}
			</CardContent>
		</Card>
	{/if}
</div>
