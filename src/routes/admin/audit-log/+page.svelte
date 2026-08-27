<script lang="ts">
	import { onMount } from 'svelte';
	import { RefreshCw, ScrollText } from '@lucide/svelte';
	let audit = $state<any[]>([]), users = $state<any[]>([]), workspaces = $state<any[]>([]), error = $state('');
	async function load() { const r = await fetch('/api/admin', { cache: 'no-store' }); const p = await r.json(); if (!r.ok) { error = p.error || 'Could not load audit log'; return; } audit = p.audit ?? []; users = p.users ?? []; workspaces = p.workspaces ?? []; }
	onMount(() => { void load(); });
	const userName = (id: string | null) => users.find((u) => u.id === id)?.username ?? id ?? 'system';
	const workspaceName = (id: string | null) => workspaces.find((w) => w.id === id)?.name ?? id ?? '—';
</script>
<div class="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
	<header class="flex items-end justify-between gap-3"><div><div class="flex items-center gap-2 text-primary"><ScrollText class="size-5" /><p class="text-xs font-semibold uppercase tracking-[0.16em]">Administration</p></div><h1 class="mt-1 text-2xl font-semibold tracking-tight">Audit log</h1><p class="mt-1 text-sm text-muted-foreground">Recent Base System actions and security events.</p></div><button class="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted" onclick={load}><RefreshCw class="size-4" /> Refresh</button></header>
	{#if error}<div class="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>{/if}
	<div class="overflow-x-auto rounded-xl border bg-card"><table class="w-full min-w-[900px] text-left text-sm"><thead class="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground"><tr><th class="px-3 py-3">Time</th><th class="px-3 py-3">Actor</th><th class="px-3 py-3">Action</th><th class="px-3 py-3">Target</th><th class="px-3 py-3">Workspace</th><th class="px-3 py-3">Details</th></tr></thead><tbody>{#each audit as item (item.id)}<tr class="border-b last:border-b-0"><td class="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</td><td class="px-3 py-3">{userName(item.actor_user_id)}</td><td class="px-3 py-3 font-medium">{item.action}</td><td class="px-3 py-3 text-muted-foreground">{item.target_type}{item.target_id ? ` · ${item.target_id}` : ''}</td><td class="px-3 py-3">{workspaceName(item.workspace_id)}</td><td class="max-w-md px-3 py-3 font-mono text-xs text-muted-foreground">{JSON.stringify(item.detail ?? {})}</td></tr>{/each}</tbody></table>{#if audit.length === 0}<div class="p-8 text-center text-sm text-muted-foreground">No audit events yet.</div>{/if}</div>
</div>
