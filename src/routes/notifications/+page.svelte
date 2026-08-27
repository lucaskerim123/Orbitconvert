<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell, CheckCheck, Info, TriangleAlert } from '@lucide/svelte';
	let notifications = $state<any[]>([]);
	let error = $state('');
	async function load() {
		const response = await fetch('/api/notifications', { cache: 'no-store' });
		const payload = await response.json();
		if (!response.ok) { error = payload.error || 'Could not load notifications'; return; }
		notifications = payload.notifications ?? [];
	}
	onMount(() => { void load(); });
	async function act(action: string, id?: string) {
		await fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, id }) });
		await load();
	}
</script>
<div class="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
	<header class="flex items-end justify-between gap-3"><div><p class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Base System</p><h1 class="text-2xl font-semibold tracking-tight">Notifications</h1><p class="mt-1 text-sm text-muted-foreground">System and account messages.</p></div><button class="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted" onclick={() => act('readAll')}><CheckCheck class="size-4" /> Mark all read</button></header>
	{#if error}<div class="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>{/if}
	<section class="space-y-3">
		{#if notifications.length === 0}<div class="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No notifications.</div>{/if}
		{#each notifications as item (item.id)}
			<article class="rounded-xl border bg-card p-4 shadow-sm {item.read_at ? 'opacity-70' : ''}"><div class="flex gap-3">{#if item.level === 'warning' || item.level === 'error'}<TriangleAlert class="mt-0.5 size-5 shrink-0 text-warning" />{:else}<Info class="mt-0.5 size-5 shrink-0 text-primary" />{/if}<div class="min-w-0 flex-1"><div class="flex items-start justify-between gap-3"><div><h2 class="font-medium">{item.title}</h2><p class="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p><p class="mt-2 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p></div>{#if !item.read_at}<button class="rounded-md border px-2 py-1 text-xs hover:bg-muted" onclick={() => act('read', item.id)}>Mark read</button>{/if}</div></div></div></article>
		{/each}
	</section>
</div>
