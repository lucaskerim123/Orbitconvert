<script lang="ts">
	import { onMount } from 'svelte';
	import { CheckCircle2, KeyRound, LoaderCircle, Save, UserRound } from '@lucide/svelte';

	let user = $state<any>(null);
	let displayName = $state('');
	let email = $state('');
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let busy = $state(false);
	let message = $state('');
	let error = $state('');

	onMount(async () => {
		const payload = await fetch('/api/account', { cache: 'no-store' }).then((r) => r.json());
		user = payload.user;
		displayName = user?.display_name ?? '';
		email = user?.email ?? '';
	});

	async function call(action: string, data: Record<string, unknown>) {
		busy = true; error = ''; message = '';
		try {
			const response = await fetch('/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...data }) });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'Update failed');
			if (payload.user) user = payload.user;
			message = 'Saved';
			return true;
		} catch (err) { error = err instanceof Error ? err.message : 'Update failed'; return false; }
		finally { busy = false; }
	}

	async function saveProfile() { await call('profile.update', { displayName, email }); }
	async function changePassword() {
		if (newPassword !== confirmPassword) return void (error = 'New passwords do not match');
		if (await call('password.change', { currentPassword, newPassword })) { currentPassword = ''; newPassword = ''; confirmPassword = ''; }
	}
</script>

<div class="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
	<header><p class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Base System</p><h1 class="text-2xl font-semibold tracking-tight">Account</h1><p class="mt-1 text-sm text-muted-foreground">Manage your OrbitFS account and login credentials.</p></header>
	{#if error}<div class="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>{/if}
	{#if message}<div class="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm"><CheckCircle2 class="size-4" /> {message}</div>{/if}

	<div class="grid gap-5 lg:grid-cols-2">
		<section class="rounded-xl border bg-card p-5 shadow-sm">
			<div class="flex items-center gap-2"><UserRound class="size-5" /><h2 class="font-semibold">Profile</h2></div>
			<p class="mt-1 text-sm text-muted-foreground">Username: <span class="text-foreground">{user?.username ?? 'Loading…'}</span> · Role: <span class="capitalize text-foreground">{user?.role ?? ''}</span></p>
			<div class="mt-4 space-y-3"><div><label class="mb-1.5 block text-sm font-medium">Display name</label><input class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" bind:value={displayName} /></div><div><label class="mb-1.5 block text-sm font-medium">Email</label><input class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" type="email" bind:value={email} /></div><button class="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={busy} onclick={saveProfile}>{#if busy}<LoaderCircle class="size-4 animate-spin" />{:else}<Save class="size-4" />{/if} Save profile</button></div>
		</section>

		<section class="rounded-xl border bg-card p-5 shadow-sm">
			<div class="flex items-center gap-2"><KeyRound class="size-5" /><h2 class="font-semibold">Change password</h2></div>
			<div class="mt-4 space-y-3"><input class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" type="password" placeholder="Current password" bind:value={currentPassword} /><input class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" type="password" placeholder="New password" bind:value={newPassword} /><input class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" type="password" placeholder="Confirm new password" bind:value={confirmPassword} /><button class="inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50" disabled={busy || !currentPassword || !newPassword || !confirmPassword} onclick={changePassword}><KeyRound class="size-4" /> Update password</button></div>
		</section>
	</div>
</div>
