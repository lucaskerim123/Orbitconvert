<script lang="ts">
	import { onMount } from 'svelte';
	import { KeyRound, LoaderCircle, RefreshCw, ShieldCheck, ExternalLink } from '@lucide/svelte';

	let summary = $state<any>(null);
	let provider = $state<{ providerBase: string; allowedProviderBases: string[]; licenseSystems?: { id:string; name:string; description:string; providerBase:string }[] } | null>(null);
	let providerInput = $state('');
	let providerSaving = $state(false);
	let providerTesting = $state(false);
	let diagnostics = $state<any>(null);
	let providerError = $state('');
	let licenseKey = $state('');
	let loading = $state(true);
	let refreshing = $state(false);
	let activating = $state(false);
	let error = $state('');
	let message = $state('');
	let adminLoginRequired = $state(false);

	async function loadProvider() {
		try {
			const response = await fetch('/api/license/provider', { cache: 'no-store' });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'Could not load licence API');
			provider = payload;
			diagnostics = payload.diagnostics || null;
			providerInput = payload.providerBase;
		} catch (err) {
			providerError = err instanceof Error ? err.message : 'Could not load licence API';
			try {
				const r = await fetch('/api/license/diagnostics', { cache: 'no-store' });
				diagnostics = await r.json();
			} catch {}
		}
	}

	async function load(refresh = false) {
		if (refresh) refreshing = true;
		else loading = true;
		error = '';
		try {
			const response = await fetch(`/api/license/status${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.refreshError || payload.error || 'Could not load licence status');
			summary = payload;
			await loadProvider();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not load licence status';
		} finally {
			loading = false;
			refreshing = false;
		}
	}

	onMount(() => { void load(); });

	async function saveProvider() {
		if (!provider || !providerInput || providerInput === provider.providerBase) return;
		providerSaving = true;
		providerError = '';
		message = '';
		try {
			const response = await fetch('/api/license/provider', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ providerBase: providerInput })
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'Could not update licence API');
			provider = payload;
			providerInput = payload.providerBase;
			message = 'Licence API updated. Try activation again.';
		} catch (err) {
			providerError = err instanceof Error ? err.message : 'Could not update licence API';
		} finally {
			providerSaving = false;
		}
	}

	async function testProvider() {
		providerTesting = true;
		providerError = '';
		try {
			const response = await fetch('/api/license/provider/test', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ providerBase: providerInput })
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'Licence API test failed');
			diagnostics = payload;
			if (!provider) {
				provider = { providerBase: payload.providerBase, allowedProviderBases: payload.allowedProviderBases || [], licenseSystems: payload.licenseSystems || [] };
				providerInput = payload.providerBase;
			}
			message = payload.provider?.ok ? 'Licence API connection is working.' : 'Licence API responded with a problem. See diagnostics below.';
		} catch (err) {
			providerError = err instanceof Error ? err.message : 'Licence API test failed';
		} finally {
			providerTesting = false;
		}
	}

	async function activate(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		message = '';
		activating = true;
		adminLoginRequired = false;
		try {
			if (provider && providerInput && providerInput !== provider.providerBase) {
				const saveResponse = await fetch('/api/license/provider', {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ providerBase: providerInput })
				});
				const savePayload = await saveResponse.json();
				if (!saveResponse.ok) throw new Error(savePayload.error || 'Could not select licence system');
				provider = savePayload;
				providerInput = savePayload.providerBase;
			}
			const response = await fetch('/api/license/activate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ licenseKey })
			});
			const payload = await response.json();
			if (!response.ok) {
				if (response.status === 401) adminLoginRequired = true;
				throw new Error(payload.error || 'Licence activation failed');
			}
			summary = payload.license;
			licenseKey = '';
			message = 'Base System licence activated.';
			const setup = await fetch('/api/setup/status', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
			window.location.assign(setup?.needsSetup ? '/register?setup=1' : '/login');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Licence activation failed';
		} finally {
			activating = false;
		}
	}
</script>

<svelte:head><title>Licence · OrbitFS</title></svelte:head>

<div class="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-8 text-foreground">
	<div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(220,38,38,0.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_32%)]"></div>
	<section class="relative w-full max-w-2xl rounded-3xl border bg-card/90 p-6 shadow-2xl backdrop-blur sm:p-8">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<div class="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary"><ShieldCheck class="size-3.5" /> Licence required</div>
				<h1 class="mt-4 text-2xl font-semibold tracking-tight">OrbitFS Base System</h1>
				<p class="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">This deployment runs when the OrbitFS master licence system validates the <code>orbitfs_base</code> entitlement for this installation.</p>
			</div>
			<button class="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50" onclick={() => load(true)} disabled={refreshing}><RefreshCw class={`size-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh</button>
		</div>

		{#if loading}
			<div class="mt-8 flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle class="size-4 animate-spin" /> Checking licence…</div>
		{:else}
			<div class="mt-6 grid gap-3 sm:grid-cols-2">
				<div class="rounded-xl border bg-background/60 p-4"><p class="text-xs uppercase tracking-wide text-muted-foreground">Status</p><p class="mt-1 font-medium">{summary?.licensed ? 'Licensed' : 'Blocked'}</p></div>
				<div class="rounded-xl border bg-background/60 p-4"><p class="text-xs uppercase tracking-wide text-muted-foreground">Component</p><p class="mt-1 font-medium">orbitfs_base</p></div>
				<div class="rounded-xl border bg-background/60 p-4"><p class="text-xs uppercase tracking-wide text-muted-foreground">Installation</p><p class="mt-1 break-all font-mono text-xs">{summary?.installationId || 'pending'}</p></div>
				<div class="rounded-xl border bg-background/60 p-4"><p class="text-xs uppercase tracking-wide text-muted-foreground">Key</p><p class="mt-1 font-mono text-sm">{summary?.keyHint || 'not activated'}</p></div>
			</div>

			{#if summary?.reason && !summary?.licensed}<div class="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{summary.reason}{#if summary.refreshError}<span class="mt-1 block text-xs opacity-80">{summary.refreshError}</span>{/if}</div>{/if}
			{#if error}<div class="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}{#if adminLoginRequired}<a class="mt-3 inline-flex rounded-md border border-destructive/40 px-3 py-2 text-xs font-medium hover:bg-destructive/10" href="/login?next=%2Flicense">Admin login to replace licence</a>{/if}</div>{/if}
			{#if message}<div class="mt-4 rounded-lg border px-4 py-3 text-sm">{message}</div>{/if}

			<div class="mt-6 rounded-xl border bg-background/40 p-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<label class="block text-sm font-medium" for="license-api">Licence system</label>
						<p class="mt-1 text-xs text-muted-foreground">Choose the approved OrbitFS licensing service this installation will use. The selection can be tested before activation and arbitrary external licensing servers are blocked.</p>
					</div>
					<button class="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50" type="button" onclick={testProvider} disabled={providerTesting}>{#if providerTesting}<LoaderCircle class="size-3.5 animate-spin" />{:else}<RefreshCw class="size-3.5" />{/if} Test API</button>
				</div>
				{#if provider}
					<div class="mt-3 flex flex-col gap-2 sm:flex-row">
						<select id="license-api" class="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm" bind:value={providerInput}>
							{#if provider.licenseSystems?.length}
								{#each provider.licenseSystems as system}<option value={system.providerBase}>{system.name} — {system.providerBase}</option>{/each}
							{:else}
								{#each provider.allowedProviderBases as url}<option value={url}>{url}</option>{/each}
							{/if}
						</select>
						<button class="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50" type="button" onclick={saveProvider} disabled={providerSaving || providerInput === provider.providerBase}>{#if providerSaving}<LoaderCircle class="size-4 animate-spin" />{/if} Use this system</button>
					</div>
				{:else}
					<p class="mt-3 rounded-md border p-3 font-mono text-xs text-muted-foreground">Provider settings could not be loaded. Use Test API for diagnostics.</p>
				{/if}
				{#if diagnostics}
					<div class="mt-4 grid gap-2 sm:grid-cols-2">
						<div class="rounded-md border p-3"><p class="text-[11px] uppercase tracking-wide text-muted-foreground">Current API</p><p class="mt-1 break-all font-mono text-xs">{diagnostics.providerBase || provider?.providerBase || 'unknown'}</p></div>
						<div class="rounded-md border p-3"><p class="text-[11px] uppercase tracking-wide text-muted-foreground">Validation endpoint</p><p class="mt-1 break-all font-mono text-xs">{diagnostics.validateUrl || 'unknown'}</p></div>
						<div class="rounded-md border p-3"><p class="text-[11px] uppercase tracking-wide text-muted-foreground">Supabase licence state</p><p class="mt-1 text-sm font-medium">{diagnostics.database?.ok ? 'Connected' : 'Unavailable'}</p>{#if diagnostics.database?.error}<p class="mt-1 text-xs text-destructive">{diagnostics.database.error}</p>{/if}</div>
						<div class="rounded-md border p-3"><p class="text-[11px] uppercase tracking-wide text-muted-foreground">Licence provider</p><p class="mt-1 text-sm font-medium">{diagnostics.provider?.ok ? 'Reachable' : 'Unavailable'}</p><p class="mt-1 text-xs text-muted-foreground">HTTP {diagnostics.provider?.status ?? '—'}{diagnostics.provider?.revision ? ` · revision ${diagnostics.provider.revision}` : ''} · {diagnostics.configSource || 'unknown'} config</p>{#if diagnostics.provider?.error}<p class="mt-1 text-xs text-destructive">{diagnostics.provider.error}</p>{/if}</div>
					</div>
				{/if}
				{#if providerError}<p class="mt-2 text-sm text-destructive">{providerError}</p>{/if}
			</div>

			<form class="mt-6 space-y-3" onsubmit={activate}>
				<label class="block text-sm font-medium" for="license-key">Licence key</label>
				<div class="flex flex-col gap-2 sm:flex-row">
					<div class="relative flex-1"><KeyRound class="absolute left-3 top-3 size-4 text-muted-foreground" /><input id="license-key" class="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 font-mono text-sm" bind:value={licenseKey} autocomplete="off" placeholder="Enter existing licence key" required /></div>
					<button class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" type="submit" disabled={activating || !licenseKey.trim()}>{#if activating}<LoaderCircle class="size-4 animate-spin" />{/if} Activate</button>
				</div>
			</form>

			<div class="mt-6 border-t pt-5 text-sm text-muted-foreground">
				<p>Licences are issued by the official OrbitFS licensing system. This installation only validates and activates licences; it does not create them.</p>
				<a class="mt-2 inline-flex items-center gap-1 font-medium text-primary hover:underline" href="https://orbitfs.vercel.app/" target="_blank" rel="noreferrer">Open OrbitFS licensing website <ExternalLink class="size-3.5" /></a>
			</div>
		{/if}
	</section>
</div>
