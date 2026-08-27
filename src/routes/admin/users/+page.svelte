<script lang="ts">
	import { onMount } from 'svelte';
	import { LoaderCircle, RefreshCw, Save, Users } from '@lucide/svelte';
	let users = $state<any[]>([]);
	let busyId = $state('');
	let error = $state('');
	async function load() {
		error = '';
		const response = await fetch('/api/admin', { cache: 'no-store' });
		const payload = await response.json();
		if (!response.ok) { error = payload.error || 'Could not load users'; return; }
		users = payload.users ?? [];
	}
	onMount(() => { void load(); });
	async function save(user: any) {
		busyId = user.id; error = '';
		try {
			const response = await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'user.update', id: user.id, displayName: user.display_name, email: user.email, role: user.role, status: user.status }) });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'Could not update user');
			await load();
		} catch (err) { error = err instanceof Error ? err.message : 'Could not update user'; }
		finally { busyId = ''; }
	}
</script>
<div class="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
	<header class="flex items-end justify-between gap-3"><div><div class="flex items-center gap-2 text-primary"><Users class="size-5" /><p class="text-xs font-semibold uppercase tracking-[0.16em]">Administration</p></div><h1 class="mt-1 text-2xl font-semibold tracking-tight">Users</h1><p class="mt-1 text-sm text-muted-foreground">Manage account roles, status and profile details.</p></div><button class="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted" onclick={load}><RefreshCw class="size-4" /> Refresh</button></header>
	{#if error}<div class="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>{/if}
	<div class="space-y-3">{#each users as user (user.id)}<article class="rounded-xl border bg-card p-4 shadow-sm"><div class="grid gap-3 lg:grid-cols-[1fr_1.2fr_150px_140px_auto] lg:items-end"><div><p class="text-xs text-muted-foreground">Username</p><p class="mt-1 font-medium">{user.username}</p><p class="text-xs text-muted-foreground">Created {new Date(user.created_at).toLocaleDateString()}</p></div><div class="grid gap-2 sm:grid-cols-2"><input class="h-10 rounded-md border border-input bg-background px-3 text-sm" bind:value={user.display_name} aria-label="Display name" /><input class="h-10 rounded-md border border-input bg-background px-3 text-sm" type="email" bind:value={user.email} aria-label="Email" /></div><select class="h-10 rounded-md border border-input bg-background px-3 text-sm" bind:value={user.role}><option value="owner">Owner</option><option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option></select><select class="h-10 rounded-md border border-input bg-background px-3 text-sm" bind:value={user.status}><option value="active">Active</option><option value="disabled">Disabled</option></select><button class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={busyId === user.id} onclick={() => save(user)}>{#if busyId === user.id}<LoaderCircle class="size-4 animate-spin" />{:else}<Save class="size-4" />{/if} Save</button></div>{#if user.last_seen_at}<p class="mt-3 text-xs text-muted-foreground">Last seen {new Date(user.last_seen_at).toLocaleString()}</p>{/if}</article>{/each}</div>
</div>
