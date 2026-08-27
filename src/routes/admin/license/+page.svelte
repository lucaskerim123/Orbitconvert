<script lang="ts">
	import { onMount } from 'svelte';
	import { KeyRound, LoaderCircle, RefreshCw, ExternalLink } from '@lucide/svelte';

	let summary = $state<any>(null);
	let licenseKey = $state('');
	let loading = $state(true);
	let refreshing = $state(false);
	let activating = $state(false);
	let error = $state('');
	let message = $state('');

	async function load(refresh = false) {
		if (refresh) refreshing = true;
		else loading = true;
		error = '';
		try {
			const response = await fetch(`/api/license/status${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.refreshError || payload.error || 'Could not load licence');
			summary = payload;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not load licence';
		} finally {
			loading = false;
			refreshing = false;
		}
	}

	onMount(() => { void load(); });

	async function activate() {
		error = '';
		message = '';
		activating = true;
		try {
			const response = await fetch('/api/license/activate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ licenseKey })
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'Activation failed');
			summary = payload.license;
			licenseKey = '';
			message = 'Licence revalidated successfully.';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Activation failed';
		} finally {
			activating = false;
		}
	}
</script>

<div class="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
	<header class="flex flex-wrap items-start justify-between gap-3">
		<div><div class="flex items-center gap-2 text-primary"><KeyRound class="size-5" /><p class="text-xs font-semibold uppercase tracking-[0.16em]">Administration</p></div><h1 class="mt-1 text-2xl font-semibold tracking-tight">Licence</h1><p class="mt-1 text-sm text-muted-foreground">Verified Base System entitlement from license.incendiarynetworks.cc.</p></div>
		<button class="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50" onclick={() => load(true)} disabled={refreshing}><RefreshCw class={`size-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh</button>
	</header>

	{#if error}<div class="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>{/if}
	{#if message}<div class="rounded-lg border px-4 py-3 text-sm">{message}</div>{/if}

	{#if loading}
		<div class="flex items-center justify-center gap-2 rounded-xl border py-16 text-sm text-muted-foreground"><LoaderCircle class="size-4 animate-spin" /> Loading licence…</div>
	{:else if summary}
		<section class="rounded-xl border bg-card p-5 shadow-sm">
			<div class="flex flex-wrap items-center justify-between gap-3"><div><p class="text-sm text-muted-foreground">Base System</p><h2 class="text-xl font-semibold">orbitfs_panel</h2></div><span class={`rounded-full border px-3 py-1 text-sm font-medium ${summary.licensed ? 'text-emerald-500' : 'text-destructive'}`}>{summary.licensed ? 'Licensed' : 'Blocked'}</span></div>
			<div class="mt-5 grid gap-3 sm:grid-cols-2">
				<div><p class="text-xs uppercase tracking-wide text-muted-foreground">Key</p><p class="mt-1 font-mono text-sm">{summary.keyHint || '—'}</p></div>
				<div><p class="text-xs uppercase tracking-wide text-muted-foreground">State</p><p class="mt-1 text-sm">{summary.component?.state || summary.status}</p></div>
				<div><p class="text-xs uppercase tracking-wide text-muted-foreground">Installation ID</p><p class="mt-1 break-all font-mono text-xs">{summary.installationId}</p></div>
				<div><p class="text-xs uppercase tracking-wide text-muted-foreground">Last checked</p><p class="mt-1 text-sm">{summary.lastCheckedAt ? new Date(summary.lastCheckedAt).toLocaleString() : '—'}</p></div>
				<div><p class="text-xs uppercase tracking-wide text-muted-foreground">Plan</p><p class="mt-1 text-sm">{summary.plan || '—'}</p></div>
				<div><p class="text-xs uppercase tracking-wide text-muted-foreground">Expires</p><p class="mt-1 text-sm">{summary.expiresAt ? new Date(summary.expiresAt).toLocaleString() : '—'}</p></div>
			</div>
			{#if summary.offlineGrace}<div class="mt-4 rounded-lg border px-3 py-2 text-sm">Running on signed offline grace. Provider refresh error: {summary.refreshError || 'unknown'}</div>{/if}
		</section>

		<section class="rounded-xl border bg-card p-5 shadow-sm">
			<h2 class="font-semibold">Activate / replace existing key</h2><p class="mt-1 text-sm text-muted-foreground">The key is validated by the existing Incendiary Networks licence service. This panel cannot create licences or manually set entitlement status.</p>
			<div class="mt-4 flex flex-col gap-2 sm:flex-row"><input class="h-10 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm" bind:value={licenseKey} placeholder="Existing licence key" /><button class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" onclick={activate} disabled={activating || !licenseKey.trim()}>{#if activating}<LoaderCircle class="size-4 animate-spin" />{/if} Activate</button></div>
			<a class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" href="https://licenseadmin.incendiarynetworks.cc/" target="_blank" rel="noreferrer">Open external licence administration <ExternalLink class="size-3.5" /></a>
		</section>
	{/if}
</div>
