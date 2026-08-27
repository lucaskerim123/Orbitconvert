<script lang="ts">
	import { onMount } from 'svelte';
	import { Cloud, Eye, EyeOff, LoaderCircle, LockKeyhole, UserPlus, Database, ShieldCheck } from '@lucide/svelte';

	let identity = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let submitting = $state(false);
	let error = $state('');
	let checking = $state(true);

	onMount(async () => {
		try {
			const me = await fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json());
			if (me.authenticated) { window.location.replace('/'); return; }
			const status = await fetch('/api/setup/status', { cache: 'no-store' }).then((r) => r.json());
			if (status.needsSetup) { window.location.replace('/register?setup=1'); return; }
		} finally { checking = false; }
	});

	async function login(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		submitting = true;
		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST', headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ identity, password })
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'Login failed');
			window.location.assign('/');
		} catch (err) { error = err instanceof Error ? err.message : 'Login failed'; }
		finally { submitting = false; }
	}
</script>

<svelte:head><title>Login · OrbitFS</title></svelte:head>

<div class="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-8 text-foreground">
	<div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(220,38,38,0.16),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_32%)]"></div>
	<section class="relative grid w-full max-w-5xl gap-5 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
		<div class="hidden rounded-3xl border bg-card/70 p-8 shadow-2xl lg:block">
			<div class="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary"><ShieldCheck class="size-3.5" /> Standalone cloud Base System</div>
			<h1 class="mt-5 text-4xl font-semibold tracking-tight">Your OrbitFS panel, running in the cloud.</h1>
			<p class="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Workspaces, profiles, files, permissions and Base System administration run through Vercel and Supabase — no VPS or desktop service required.</p>
			<div class="mt-6 grid grid-cols-2 gap-3">
				<div class="rounded-2xl border bg-background/60 p-4"><Cloud class="size-5 text-primary" /><p class="mt-3 text-sm font-medium">Vercel runtime</p><p class="text-xs text-muted-foreground">Panel + server APIs</p></div>
				<div class="rounded-2xl border bg-background/60 p-4"><Database class="size-5 text-primary" /><p class="mt-3 text-sm font-medium">Supabase database</p><p class="text-xs text-muted-foreground">Persistent Base System data</p></div>
			</div>
		</div>

		<div class="mx-auto w-full max-w-md rounded-3xl border bg-card/90 p-6 shadow-2xl backdrop-blur">
			<div class="mb-6 text-center">
				<div class="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><LockKeyhole class="size-7" /></div>
				<h1 class="mt-4 text-2xl font-semibold">OrbitFS Base Panel</h1>
				<p class="mt-1 text-sm text-muted-foreground">Sign in to your Base System.</p>
			</div>

			{#if checking}
				<div class="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle class="size-4 animate-spin" /> Checking system…</div>
			{:else}
				<form class="space-y-4" onsubmit={login}>
					<div><label class="mb-1.5 block text-sm font-medium" for="identity">Username or email</label><input id="identity" class="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" autocomplete="username" bind:value={identity} required /></div>
					<div><label class="mb-1.5 block text-sm font-medium" for="password">Password</label><div class="relative"><input id="password" class="h-11 w-full rounded-lg border border-input bg-background px-3 pr-11 text-sm" type={showPassword ? 'text' : 'password'} autocomplete="current-password" bind:value={password} required /><button type="button" class="absolute right-1 top-1 grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted" onclick={() => showPassword = !showPassword} aria-label="Toggle password">{#if showPassword}<EyeOff class="size-4" />{:else}<Eye class="size-4" />{/if}</button></div></div>
					{#if error}<div class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>{/if}
					<button class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" type="submit" disabled={submitting || !identity || !password}>{#if submitting}<LoaderCircle class="size-4 animate-spin" />{/if} Sign in</button>
				</form>
				<div class="mt-5 border-t pt-5 text-center text-sm text-muted-foreground">Need an account? <a class="inline-flex items-center gap-1 font-medium text-primary hover:underline" href="/register"><UserPlus class="size-4" /> Register</a></div>
			{/if}
		</div>
	</section>
</div>
